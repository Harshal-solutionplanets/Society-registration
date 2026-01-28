require("dotenv").config();
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const admin = require("firebase-admin");

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: "10mb" }));

// Initialize Firebase Admin
let serviceAccount;
try {
  serviceAccount = require("./serviceAccountKey.json");
} catch (e) {
  console.log(
    "Note: serviceAccountKey.json not found, checking environment variables.",
  );
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
  }
}

if (serviceAccount) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
  });
} else {
  console.error(
    "\x1b[31m%s\x1b[0m",
    "ERROR: Firebase Service Account not found!",
  );
  console.log("\x1b[33m%s\x1b[0m", "Please follow these steps:");
  console.log(
    "1. Go to Firebase Console > Project Settings > Service Accounts.",
  );
  console.log("2. Click 'Generate new private key'.");
  console.log(
    "3. Rename the file to 'serviceAccountKey.json' and place it in the backend folder.",
  );
  console.log(
    "OR: Add FIREBASE_SERVICE_ACCOUNT as a JSON string in your .env file.\n",
  );
  process.exit(1);
}

const db = admin.firestore();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

/**
 * Health Check / Versioning
 */
app.get("/api/status", (req, res) => {
  res.json({
    status: "running",
    version: "1.0.5",
    endpoints: ["archive-resident-staff verified"],
  });
});

/**
 * Step 1: Generate the Auth URL for the Admin to link Google Drive
 */
app.get("/api/auth/google/url", (req, res) => {
  const { adminUID, appId } = req.query;
  const state = JSON.stringify({ adminUID, appId });
  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive.file"],
    state: state,
  });
  res.json({ url });
});

/**
 * Step 2: Callback to exchange code for Refresh Token
 */
app.get("/api/auth/google/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send("No code provided");

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const { adminUID, appId } = JSON.parse(state);

    if (tokens.refresh_token) {
      await db
        .collection("artifacts")
        .doc(appId || "dev-society-id")
        .collection("secure")
        .doc(adminUID)
        .set(
          {
            refreshToken: tokens.refresh_token,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          },
          { merge: true },
        );
    }

    await db
      .collection("artifacts")
      .doc(appId || "dev-society-id")
      .collection("public")
      .doc("data")
      .collection("societies")
      .doc(adminUID)
      .set(
        {
          driveAccessToken: tokens.access_token,
          isDriveLinked: true,
        },
        { merge: true },
      );

    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h2 style="color: #22C55E;">Google Drive Linked Successfully!</h2>
          <p>You can close this window and return to the dashboard.</p>
          <script>
            setTimeout(() => window.close(), 2500);
          </script>
        </body>
      </html>
    `);
  } catch (error) {
    console.error("Callback Error:", error);
    res.status(500).send("Authentication failed: " + error.message);
  }
});

/**
 * Upload Documents
 */
app.post("/api/drive/upload-resident-staff", async (req, res) => {
  const { adminUID, parentFolderId, staffName, fileName, base64Data, appId } =
    req.body;
  if (!adminUID || !parentFolderId || !staffName || !fileName || !base64Data) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const tokenDoc = await db
      .collection("artifacts")
      .doc(appId || "dev-society-id")
      .collection("secure")
      .doc(adminUID)
      .get();

    if (!tokenDoc.exists || !tokenDoc.data().refreshToken) {
      return res.status(404).json({ error: "Google Drive not linked." });
    }

    oauth2Client.setCredentials({
      refresh_token: tokenDoc.data().refreshToken,
    });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // 1. Find/Create/Rename folder
    let staffFolderId = req.body.staffFolderId;

    if (staffFolderId) {
      // Check if rename needed
      try {
        const existingFolder = await drive.files.get({
          fileId: staffFolderId,
          fields: "name",
        });
        if (existingFolder.data.name !== staffName) {
          await drive.files.update({
            fileId: staffFolderId,
            resource: { name: staffName },
          });
        }
      } catch (e) {
        console.warn(
          "Folder ID provided but not found, falling back to name search.",
        );
        staffFolderId = null;
      }
    }

    if (!staffFolderId) {
      const folderSearch = await drive.files.list({
        q: `name = '${staffName}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id)",
      });

      if (folderSearch.data.files && folderSearch.data.files.length > 0) {
        staffFolderId = folderSearch.data.files[0].id;
      } else {
        const folderRes = await drive.files.create({
          resource: {
            name: staffName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [parentFolderId],
          },
          fields: "id",
        });
        staffFolderId = folderRes.data.id;
      }
    }

    // Search for existing file with same name in staffFolderId
    const fileSearch = await drive.files.list({
      q: `name = '${fileName}' and '${staffFolderId}' in parents and trashed = false`,
      fields: "files(id)",
    });

    // Upload file (Update if exists, else Create)
    const buffer = Buffer.from(
      base64Data.replace(/^data:image\/\w+;base64,/, ""),
      "base64",
    );
    const { Readable } = require("stream");
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    let finalFileId;
    if (fileSearch.data.files && fileSearch.data.files.length > 0) {
      // Update existing file
      const fileId = fileSearch.data.files[0].id;
      const updateRes = await drive.files.update({
        fileId: fileId,
        media: { mimeType: "image/jpeg", body: stream },
      });
      finalFileId = updateRes.data.id;
    } else {
      // Create new file
      const createRes = await drive.files.create({
        requestBody: { name: fileName, parents: [staffFolderId] },
        media: { mimeType: "image/jpeg", body: stream },
      });
      finalFileId = createRes.data.id;
    }

    res.json({ success: true, fileId: finalFileId, staffFolderId });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.post("/api/drive/delete-resident-file", async (req, res) => {
  const { adminUID, appId, staffFolderId, fileName } = req.body;

  if (!adminUID || !staffFolderId || !fileName) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const tokenDoc = await db
      .collection("artifacts")
      .doc(appId || "dev-society-id")
      .collection("secure")
      .doc(adminUID)
      .get();

    if (!tokenDoc.exists || !tokenDoc.data().refreshToken) {
      return res.status(404).json({ error: "Google Drive not linked." });
    }

    const oauth2Client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      "postmessage",
    );

    oauth2Client.setCredentials({
      refresh_token: tokenDoc.data().refreshToken,
    });
    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // Search for the file in the specific folder
    const fileSearch = await drive.files.list({
      q: `name = '${fileName}' and '${staffFolderId}' in parents and trashed = false`,
      fields: "files(id)",
    });

    if (fileSearch.data.files && fileSearch.data.files.length > 0) {
      const fileId = fileSearch.data.files[0].id;
      await drive.files.delete({ fileId });
      res.json({ success: true, message: "File deleted" });
    } else {
      res.json({ success: true, message: "File not found (already deleted?)" });
    }
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Archive Staff (The route that was giving 404)
 */
app.post("/api/drive/archive-resident-staff", async (req, res) => {
  const { adminUID, parentFolderId, staffFolderId, appId, unitId, staffId } =
    req.body;
  console.log("DEBUG: Archive request received for", { staffId, unitId });

  if (!adminUID || !parentFolderId || !unitId || !staffId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const societyId = appId || "dev-society-id";
    const activeDocRef = db
      .collection("artifacts")
      .doc(societyId)
      .collection("public")
      .doc("data")
      .collection("societies")
      .doc(adminUID)
      .collection("Residents")
      .doc(unitId)
      .collection("StaffMembers")
      .doc(staffId);

    const snapshot = await activeDocRef.get();
    if (!snapshot.exists) {
      return res.status(404).json({ error: "Staff record not found." });
    }
    const staffData = snapshot.data();

    // Move Drive Folder if possible
    let driveArchived = false;
    const tokenDoc = await db
      .collection("artifacts")
      .doc(societyId)
      .collection("secure")
      .doc(adminUID)
      .get();

    if (tokenDoc.exists && tokenDoc.data().refreshToken && staffFolderId) {
      try {
        oauth2Client.setCredentials({
          refresh_token: tokenDoc.data().refreshToken,
        });
        const drive = google.drive({ version: "v3", auth: oauth2Client });

        // Find/Create "Archived" folder
        const archiveSearch = await drive.files.list({
          q: `name = 'Archived' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
          fields: "files(id)",
        });

        let archiveFolderId;
        if (archiveSearch.data.files && archiveSearch.data.files.length > 0) {
          archiveFolderId = archiveSearch.data.files[0].id;
        } else {
          const folderRes = await drive.files.create({
            resource: {
              name: "Archived",
              mimeType: "application/vnd.google-apps.folder",
              parents: [parentFolderId],
            },
            fields: "id",
          });
          archiveFolderId = folderRes.data.id;
        }

        await drive.files.update({
          fileId: staffFolderId,
          addParents: archiveFolderId,
          removeParents: parentFolderId, // Assumes it was in the parent
          fields: "id, parents",
        });
        driveArchived = true;
      } catch (e) {
        console.warn("Drive folder move failed:", e.message);
      }
    }

    // Move Firestore metadata
    const archivedDocRef = db
      .collection("artifacts")
      .doc(societyId)
      .collection("public")
      .doc("data")
      .collection("societies")
      .doc(adminUID)
      .collection("Residents")
      .doc(unitId)
      .collection("Archived Staff")
      .doc(staffId);

    await archivedDocRef.set({
      ...staffData,
      archivedAt: admin.firestore.FieldValue.serverTimestamp(),
      driveArchived,
    });

    await activeDocRef.delete();
    res.json({ success: true, driveArchived });
  } catch (error) {
    console.error("Archive Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Refresh Token
 */
app.get("/api/auth/google/refresh", async (req, res) => {
  const { adminUID, appId } = req.query;
  try {
    const tokenDoc = await db
      .collection("artifacts")
      .doc(appId || "dev-society-id")
      .collection("secure")
      .doc(adminUID)
      .get();
    if (!tokenDoc.exists)
      return res.status(404).json({ error: "No refresh token" });

    oauth2Client.setCredentials({
      refresh_token: tokenDoc.data().refreshToken,
    });
    const { credentials } = await oauth2Client.refreshAccessToken();

    await db
      .collection("artifacts")
      .doc(appId || "dev-society-id")
      .collection("public")
      .doc("data")
      .collection("societies")
      .doc(adminUID)
      .set(
        {
          driveAccessToken: credentials.access_token,
        },
        { merge: true },
      );

    res.json({ accessToken: credentials.access_token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
