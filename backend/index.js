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
// You will need to provide a service account key file
const serviceAccount = require("./serviceAccountKey.json");
admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

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
      // Store Refresh Token in SECURE location
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

    // Update society doc to indicate drive is linked
    await db
      .collection("artifacts")
      .doc(appId || "dev-society-id")
      .collection("public")
      .doc("data")
      .collection("societies")
      .doc(adminUID)
      .set(
        {
          driveAccessToken: tokens.access_token, // Store latest access token too
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
    if (error.response && error.response.data) {
      console.error(
        "Callback Error Detail:",
        JSON.stringify(error.response.data),
      );
    } else {
      console.error("Callback Error:", error);
    }
    res
      .status(500)
      .send(
        "Authentication failed: " +
        (error.response?.data?.error_description || error.message),
      );
  }
});

/**
 * Endpoint to upload documents to Google Drive for a Resident's staff member.
 * This is called by the frontend resident app.
 */
app.post("/api/drive/upload-resident-staff", async (req, res) => {
  const { adminUID, parentFolderId, staffName, fileName, base64Data, appId } =
    req.body;

  if (!adminUID || !parentFolderId || !staffName || !fileName || !base64Data) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    // 1. Fetch Admin's Refresh Token
    const tokenDoc = await db
      .collection("artifacts")
      .doc(appId || "dev-society-id")
      .collection("secure")
      .doc(adminUID)
      .get();

    if (!tokenDoc.exists || !tokenDoc.data().refreshToken) {
      return res.status(404).json({
        error:
          "Google Drive is not properly linked in this society's Admin Dashboard.",
      });
    }

    const { refreshToken } = tokenDoc.data();
    oauth2Client.setCredentials({ refresh_token: refreshToken });

    const drive = google.drive({ version: "v3", auth: oauth2Client });

    // 2. Find or Create Staff Sub-folder
    const folderSearch = await drive.files.list({
      q: `name = '${staffName}' and '${parentFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
    });

    let staffFolderId;
    if (folderSearch.data.files && folderSearch.data.files.length > 0) {
      staffFolderId = folderSearch.data.files[0].id;
    } else {
      const folderMetadata = {
        name: staffName,
        mimeType: "application/vnd.google-apps.folder",
        parents: [parentFolderId],
      };
      const folderRes = await drive.files.create({
        resource: folderMetadata,
        fields: "id",
      });
      staffFolderId = folderRes.data.id;
    }

    // 3. Upload File to Staff Folder
    const buffer = Buffer.from(
      base64Data.replace(/^data:image\/\w+;base64,/, ""),
      "base64",
    );
    const { Readable } = require("stream");
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    // Check if file exists in that staff folder
    const fileSearch = await drive.files.list({
      q: `name = '${fileName}' and '${staffFolderId}' in parents and trashed = false`,
      fields: "files(id)",
    });

    let finalFileId;
    if (fileSearch.data.files && fileSearch.data.files.length > 0) {
      const existingId = fileSearch.data.files[0].id;
      const updateRes = await drive.files.update({
        fileId: existingId,
        media: { mimeType: "image/jpeg", body: stream },
      });
      finalFileId = updateRes.data.id;
    } else {
      const createRes = await drive.files.create({
        requestBody: { name: fileName, parents: [staffFolderId] },
        media: { mimeType: "image/jpeg", body: stream },
      });
      finalFileId = createRes.data.id;
    }

    res.json({ success: true, fileId: finalFileId, staffFolderId });
  } catch (error) {
    console.error("Backend Drive Upload Error:", error);
    res.status(500).json({ error: error.message || "Internal Server Error" });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`Backend server running on port ${PORT}`);
});
