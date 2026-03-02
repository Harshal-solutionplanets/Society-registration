require("dotenv").config();
const functions = require("firebase-functions");
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const { google } = require("googleapis");
const admin = require("firebase-admin");
const nodemailer = require("nodemailer");
const crypto = require("crypto");

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

const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const db = getFirestore();

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  process.env.GOOGLE_REDIRECT_URI,
);

const router = express.Router();

/**
 * Health Check / Versioning
 */
router.get("/status", (req, res) => {
  res.json({
    status: "running",
    version: "1.0.6",
    endpoints: ["multi-path routing enabled"],
  });
});

/**
 * Step 1: Generate the Auth URL
 * If it's a SIGN IN, we don't force 'consent' (Google remembers permissions)
 */
router.get("/auth/google/url", (req, res) => {
  const { adminUID, appId, isSignup } = req.query;
  const state = JSON.stringify({
    adminUID,
    appId,
    isSignup: isSignup === "true",
  });

  const url = oauth2Client.generateAuthUrl({
    access_type: "offline",
    // Only force 'consent' for new signups to ensure we get a Refresh Token
    // For sign-ins, 'select_account' is enough to log back in quickly
    prompt: isSignup === "true" ? "consent" : "select_account",
    scope: [
      "openid",
      "https://www.googleapis.com/auth/userinfo.email",
      "https://www.googleapis.com/auth/userinfo.profile",
      "https://www.googleapis.com/auth/drive.file",
    ],
    state: state,
  });
  res.redirect(url);
});

/**
 * Step 2: Callback to exchange code and provide unified authentication
 */
router.get("/auth/google/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send("No code provided");

  try {
    const { tokens } = await oauth2Client.getToken(code);
    const {
      adminUID: providedUID,
      appId: queryAppId,
      isSignup,
    } = JSON.parse(state);
    const targetAppId = queryAppId || "dev-society-id";

    // 1. Verify Identity
    const ticket = await oauth2Client.verifyIdToken({
      idToken: tokens.id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload.email?.toLowerCase() || "";
    const googleUID = payload.sub;

    console.log(`[OAuth] Handshake for ${email}. isSignup: ${isSignup}`);

    // CHECK: Domain Restriction (Only @gmail.com allowed)
    if (!email.endsWith("@gmail.com")) {
      console.log(`[OAuth] Access denied for ${email}: Invalid domain.`);
      return res.send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h2 style="color: #ef4444;">Access Denied</h2>
            <p>Only official @gmail.com accounts are permitted for society administration.</p>
            <script>
              window.opener.postMessage({ 
                type: 'GOOGLE_AUTH_ERROR', 
                message: 'Invalid domain. Please use your @gmail.com account.' 
              }, '*');
              setTimeout(() => window.close(), 2000);
            </script>
          </body>
        </html>
      `);
    }

    // CHECK: Does this user already have a complete profile?
    const societyDoc = await db
      .collection("artifacts")
      .doc(targetAppId)
      .collection("public")
      .doc("data")
      .collection("societies")
      .doc(googleUID)
      .get();

    const isExistingUser = societyDoc.exists && societyDoc.data().societyName;

    // FLOW A: RETURNING USER - Sign them in immediately
    if (isExistingUser) {
      console.log(`[OAuth] Returning admin ${email}. Generating login token.`);

      // Update access token in DB (silent refresh)
      await societyDoc.ref.set(
        { driveAccessToken: tokens.access_token },
        { merge: true },
      );

      const firebaseToken = await admin
        .auth()
        .createCustomToken(googleUID, { email, isGoogleAuth: true });

      return res.send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h2 style="color: #3b82f6;">Welcome back!</h2>
            <script>
              window.opener.postMessage({ type: 'GOOGLE_AUTH_SUCCESS', token: '${firebaseToken}' }, '*');
              setTimeout(() => window.close(), 1000);
            </script>
          </body>
        </html>
      `);
    }

    // FLOW B: CHECK: If trying to Login but account doesn't exist
    if (!isSignup && !isExistingUser) {
      console.log(`[OAuth] Login failed for ${email}: Account not registered.`);
      return res.send(`
        <html>
          <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
            <h2 style="color: #ef4444;">Login Failed</h2>
            <p>This Gmail account is not registered as a society admin.</p>
            <script>
              window.opener.postMessage({ 
                type: 'GOOGLE_AUTH_ERROR', 
                message: 'Account not registered. Please sign up first.' 
              }, '*');
              setTimeout(() => window.close(), 1500);
            </script>
          </body>
        </html>
      `);
    }

    // FLOW C: NEW USER / SIGNUP - Do NOT create Auth user yet. Save to Pending.
    console.log(`[OAuth] New admin ${email}. Saving to pending_setups.`);

    // Use a temporary ID for the setup session
    const setupSessionId = crypto.randomBytes(16).toString("hex");

    await db
      .collection("artifacts")
      .doc(targetAppId)
      .collection("pending_setups")
      .doc(setupSessionId)
      .set({
        email,
        googleUID,
        refreshToken: tokens.refresh_token,
        accessToken: tokens.access_token,
        createdAt: FieldValue.serverTimestamp(),
      });

    res.send(`
      <html>
        <body style="font-family: sans-serif; text-align: center; padding-top: 50px;">
          <h2 style="color: #10b981;">Drive Linked!</h2>
          <p>You can now complete the society form.</p>
          <script>
            window.opener.postMessage({ 
              type: 'GOOGLE_HANDSHAKE_SUCCESS', 
              email: '${email}',
              setupSessionId: '${setupSessionId}'
            }, '*');
            setTimeout(() => window.close(), 1000);
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
 * Step 3: THE FINALIZE BUTTON
 * Only creates the Firebase Auth user AND Drive folder AND Society doc now.
 */
router.post("/admin/finalize-setup", async (req, res) => {
  const { setupSessionId, appId, formData, advanceData } = req.body;
  const targetAppId = appId || "dev-society-id";

  try {
    // 1. Get the pending tokens
    const sessionDoc = await db
      .collection("artifacts")
      .doc(targetAppId)
      .collection("pending_setups")
      .doc(setupSessionId)
      .get();

    if (!sessionDoc.exists)
      throw new Error("Invalid or expired setup session.");
    const session = sessionDoc.data();

    console.log(`[Finalize] Creating account for ${session.email}...`);

    // 2. Create the Firebase Auth User (CLEAN: only happens now!)
    let userRecord;
    try {
      userRecord = await admin.auth().createUser({
        uid: session.googleUID,
        email: session.email,
        emailVerified: true,
        displayName: formData.adminName,
      });
    } catch (e) {
      if (e.code === "auth/email-already-exists") {
        userRecord = await admin.auth().getUserByEmail(session.email);
      } else throw e;
    }

    // 3. Create the Google Drive Folder
    const drive = google.drive({ version: "v3", auth: oauth2Client });
    oauth2Client.setCredentials({ access_token: session.accessToken });

    const driveResponse = await drive.files.create({
      requestBody: {
        name: `${formData.societyName.toUpperCase()}-DRIVE`,
        mimeType: "application/vnd.google-apps.folder",
      },
      fields: "id",
    });
    const folderId = driveResponse.data.id;

    // 4. Save the Final Society Document
    const societyData = {
      ...formData,
      advanceDetails: advanceData,
      driveFolderId: folderId,
      driveAccessToken: session.accessToken, // Store it initially for immediate use
      isDriveLinked: true,
      role: "ADMIN",
      adminEmail: session.email,
      adminUserId: session.googleUID,
      createdAt: FieldValue.serverTimestamp(),
    };

    await db
      .collection("artifacts")
      .doc(targetAppId)
      .collection("public")
      .doc("data")
      .collection("societies")
      .doc(session.googleUID)
      .set(societyData);

    // 5. Store Refresh Token securely
    await db
      .collection("artifacts")
      .doc(targetAppId)
      .collection("secure")
      .doc(session.googleUID)
      .set({
        refreshToken: session.refreshToken,
        email: session.email,
        updatedAt: FieldValue.serverTimestamp(),
      });

    // 6. Cleanup session
    await sessionDoc.ref.delete();

    // 7. Success! Return Custom Token
    const firebaseToken = await admin
      .auth()
      .createCustomToken(session.googleUID);
    res.json({ success: true, token: firebaseToken });
  } catch (error) {
    console.error("Finalize Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Step 4: Refresh Access Token
 */
router.get("/auth/google/refresh", async (req, res) => {
  const { adminUID, appId } = req.query;
  const targetAppId = appId || "dev-society-id";

  if (!adminUID) return res.status(400).json({ error: "Missing adminUID" });

  try {
    const tokenDoc = await db
      .collection("artifacts")
      .doc(targetAppId)
      .collection("secure")
      .doc(adminUID)
      .get();

    if (!tokenDoc.exists || !tokenDoc.data().refreshToken) {
      return res.status(404).json({ error: "Refresh token not found." });
    }

    oauth2Client.setCredentials({
      refresh_token: tokenDoc.data().refreshToken,
    });

    const { tokens } = await oauth2Client.refreshAccessToken();

    // Update the society document with new access token
    await db
      .collection("artifacts")
      .doc(targetAppId)
      .collection("public")
      .doc("data")
      .collection("societies")
      .doc(adminUID)
      .set({ driveAccessToken: tokens.access_token }, { merge: true });

    res.json({ accessToken: tokens.access_token });
  } catch (error) {
    console.error("Refresh Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Upload Documents
 * Staff documents are stored under the unit's own Drive folder:
 * Society_ROOT/Wing/Floor/FlatFolder/StaffName/Current Profile/
 */
router.post("/drive/upload-resident-staff", async (req, res) => {
  const { adminUID, parentFolderId, staffName, fileName, base64Data, appId } =
    req.body;
  if (!adminUID || !staffName || !fileName || !base64Data) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const targetAppId = appId || "dev-society-id";
    const tokenDoc = await db
      .collection("artifacts")
      .doc(targetAppId)
      .collection("secure")
      .doc(adminUID)
      .get();

    if (!tokenDoc.exists || !tokenDoc.data().refreshToken) {
      return res.status(404).json({ error: "Google Drive not linked." });
    }

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    client.setCredentials({ refresh_token: tokenDoc.data().refreshToken });
    const drive = google.drive({ version: "v3", auth: client });

    const effectiveParentId = parentFolderId;
    if (!effectiveParentId) {
      return res
        .status(400)
        .json({ error: "No flat folder ID provided. Check admin wing setup." });
    }

    // 1. Find/Create staff member folder
    let staffFolderId = req.body.staffFolderId;
    if (staffFolderId) {
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
        staffFolderId = null;
      }
    }

    if (!staffFolderId) {
      const folderSearch = await drive.files.list({
        q: `name = '${staffName}' and '${effectiveParentId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
        fields: "files(id)",
      });
      if (folderSearch.data.files && folderSearch.data.files.length > 0) {
        staffFolderId = folderSearch.data.files[0].id;
      } else {
        const folderRes = await drive.files.create({
          resource: {
            name: staffName,
            mimeType: "application/vnd.google-apps.folder",
            parents: [effectiveParentId],
          },
          fields: "id",
        });
        staffFolderId = folderRes.data.id;
      }
    }

    // 2. Find/Create "Current Profile" folder inside staff folder
    let currentProfileFolderId;
    const currentFolderSearch = await drive.files.list({
      q: `name = 'Current Profile' and '${staffFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
    });

    if (
      currentFolderSearch.data.files &&
      currentFolderSearch.data.files.length > 0
    ) {
      currentProfileFolderId = currentFolderSearch.data.files[0].id;
    } else {
      const currentRes = await drive.files.create({
        resource: {
          name: "Current Profile",
          mimeType: "application/vnd.google-apps.folder",
          parents: [staffFolderId],
        },
        fields: "id",
      });
      currentProfileFolderId = currentRes.data.id;
    }

    // 3. Move old file OUT of "Current Profile" to staffFolder (preserves version history)
    const baseFileName = fileName.split(".")[0];
    const extensions = [".jpg", ".jpeg", ".pdf", ".png"];

    for (const ext of extensions) {
      const searchName = `${baseFileName}${ext}`;
      const search = await drive.files.list({
        q: `name = '${searchName}' and '${currentProfileFolderId}' in parents and trashed = false`,
        fields: "files(id, parents)",
      });
      if (search.data.files && search.data.files.length > 0) {
        for (const f of search.data.files) {
          // Move from Current Profile to Staff Folder
          await drive.files.update({
            fileId: f.id,
            addParents: staffFolderId,
            removeParents: currentProfileFolderId,
            fields: "id, parents",
          });
          // Rename with timestamp prefix to avoid conflicts
          const timestamp = new Date().getTime();
          await drive.files.update({
            fileId: f.id,
            resource: { name: `v_${timestamp}_${searchName}` },
          });
        }
      }
    }

    // 4. UPLOAD: Create new file in "Current Profile"
    const mimeMatch = base64Data.match(/^data:(.*);base64,/);
    const mimeType = mimeMatch ? mimeMatch[1] : "image/jpeg";
    const buffer = Buffer.from(
      base64Data.replace(/^data:(.*);base64,/, ""),
      "base64",
    );
    const { Readable } = require("stream");
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null);

    const createRes = await drive.files.create({
      requestBody: { name: fileName, parents: [currentProfileFolderId] },
      media: { mimeType: mimeType, body: stream },
    });

    res.json({ success: true, fileId: createRes.data.id, staffFolderId });
  } catch (error) {
    console.error("Upload Error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/drive/delete-resident-file", async (req, res) => {
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

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    client.setCredentials({ refresh_token: tokenDoc.data().refreshToken });
    const drive = google.drive({ version: "v3", auth: client });

    // 1. Find "Current Profile" folder
    const currentFolderSearch = await drive.files.list({
      q: `name = 'Current Profile' and '${staffFolderId}' in parents and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
    });

    if (
      !currentFolderSearch.data.files ||
      currentFolderSearch.data.files.length === 0
    ) {
      return res.json({ success: true, message: "No Current Profile found." });
    }
    const currentProfileFolderId = currentFolderSearch.data.files[0].id;

    // 2. Move old file OUT of "Current Profile" to staff folder (preserves version history)
    const baseFileName = fileName.split(".")[0];
    const extensions = [".jpg", ".jpeg", ".pdf", ".png"];
    let movedCount = 0;

    for (const ext of extensions) {
      const searchName = `${baseFileName}${ext}`;
      const fileSearch = await drive.files.list({
        q: `name = '${searchName}' and '${currentProfileFolderId}' in parents and trashed = false`,
        fields: "files(id)",
      });

      if (fileSearch.data.files && fileSearch.data.files.length > 0) {
        for (const file of fileSearch.data.files) {
          await drive.files.update({
            fileId: file.id,
            addParents: staffFolderId,
            removeParents: currentProfileFolderId,
          });
          const timestamp = new Date().getTime();
          await drive.files.update({
            fileId: file.id,
            resource: { name: `v_${timestamp}_${searchName}` },
          });
          movedCount++;
        }
      }
    }

    res.json({
      success: true,
      message: `Moved ${movedCount} files to version archive.`,
    });
  } catch (error) {
    console.error("Delete Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Rename Staff Folder in Drive
 * Called when staff name changes but no documents change (so upload isn't triggered)
 */
router.post("/drive/rename-staff-folder", async (req, res) => {
  const { adminUID, appId, staffFolderId, newName } = req.body;
  if (!adminUID || !staffFolderId || !newName) {
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

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    client.setCredentials({ refresh_token: tokenDoc.data().refreshToken });
    const drive = google.drive({ version: "v3", auth: client });

    await drive.files.update({
      fileId: staffFolderId,
      resource: { name: newName },
    });

    res.json({ success: true, message: `Folder renamed to ${newName}` });
  } catch (error) {
    console.error("Rename Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Delink Staff — Remove staff from a resident's unit without moving Drive files
 * Only deletes the Firestore link and updates the registry's linkedUnits array
 */
router.post("/drive/delink-resident-staff", async (req, res) => {
  const { adminUID, appId, unitId, staffId, sourceRegistryId } = req.body;
  console.log("DEBUG: Delink request received for", { staffId, unitId });

  if (!adminUID || !unitId || !staffId) {
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

    // Delete the staff member document from this unit
    await activeDocRef.delete();

    // Update the Resident_Staff registry — remove this unit from linkedUnits
    const registryId = sourceRegistryId || staffData.sourceRegistryId;
    if (registryId) {
      try {
        const registryDocRef = db
          .collection("artifacts")
          .doc(societyId)
          .collection("public")
          .doc("data")
          .collection("societies")
          .doc(adminUID)
          .collection("Resident_Staff")
          .doc(registryId);

        const registrySnap = await registryDocRef.get();
        if (registrySnap.exists) {
          const currentLinked = registrySnap.data().linkedUnits || [];
          const updatedLinked = currentLinked.filter((u) => u !== unitId);
          await registryDocRef.update({ linkedUnits: updatedLinked });
        }
      } catch (regErr) {
        console.warn(
          "Registry delink update failed (non-critical):",
          regErr.message,
        );
      }
    }

    res.json({
      success: true,
      message: "Staff delinked from unit successfully.",
    });
  } catch (error) {
    console.error("Delink Error:", error);
    res.status(500).json({ error: error.message });
  }
});

/**
 * Refresh Token
 */
router.get("/auth/google/refresh", async (req, res) => {
  const { adminUID, appId: queryAppId } = req.query;
  const targetAppId = queryAppId || "dev-society-id";
  try {
    const tokenDoc = await db
      .collection("artifacts")
      .doc(targetAppId)
      .collection("secure")
      .doc(adminUID)
      .get();
    if (!tokenDoc.exists || !tokenDoc.data().refreshToken) {
      return res.status(404).json({ error: "No refresh token found" });
    }

    // Creating local client to avoid race conditions
    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );

    client.setCredentials({
      refresh_token: tokenDoc.data().refreshToken,
    });
    const { credentials } = await client.refreshAccessToken();

    await db
      .collection("artifacts")
      .doc(targetAppId)
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

/**
 * Forgot Password Logic
 */
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER || "your-noreply-email@gmail.com",
    pass: process.env.EMAIL_PASS || "your-app-password",
  },
});

router.post("/auth/forgot-password", async (req, res) => {
  const { email, appId } = req.body;
  if (!email) return res.status(400).json({ error: "Email is required" });

  try {
    const societyId = appId || "dev-society-id";
    // 1. Verify if user is an admin by checking society collection
    // Note: We search by email field in societies collection
    const societiesRef = db
      .collection("artifacts")
      .doc(societyId)
      .collection("public")
      .doc("data")
      .collection("societies");

    const snapshot = await societiesRef.where("adminEmail", "==", email).get();

    if (snapshot.empty) {
      return res
        .status(404)
        .json({ error: "This email is not registered as a society admin." });
    }

    // 2. Generate 4-digit OTP
    const otp = Math.floor(1000 + Math.random() * 9000).toString();
    const expiresAt = Date.now() + 5 * 60 * 1000; // 5 minutes

    // 3. Store in Firestore
    await db
      .collection("artifacts")
      .doc(societyId)
      .collection("temp_otps")
      .doc(email)
      .set({
        otp,
        expiresAt,
        createdAt: FieldValue.serverTimestamp(),
      });

    // 4. Send Email
    const mailOptions = {
      from: `"Society Management" <${process.env.EMAIL_USER || "noreply@societyapp.com"}>`,
      to: email,
      subject: "Password Reset OTP",
      text: `Your OTP for password reset is ${otp}. It is valid for 5 minutes.`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; border: 1px solid #eee; border-radius: 10px;">
          <h2 style="color: #3B82F6;">Password Reset Request</h2>
          <p>You requested to reset your password. Use the OTP below to proceed:</p>
          <div style="font-size: 24px; font-weight: bold; background: #F1F5F9; padding: 15px; text-align: center; border-radius: 8px; letter-spacing: 5px;">
            ${otp}
          </div>
          <p style="color: #64748B; font-size: 14px; margin-top: 20px;">
            This OTP is valid for <b>5 minutes</b>. If you didn't request this, please ignore this email.
          </p>
        </div>
      `,
    };

    await transporter.sendMail(mailOptions);
    res.json({ success: true, message: "OTP sent to email" });
  } catch (error) {
    console.error("Forgot Password Error:", error);
    res.status(500).json({ error: error.message });
  }
});

router.post("/auth/verify-otp", async (req, res) => {
  const { email, otp, appId } = req.body;
  if (!email || !otp) return res.status(400).json({ error: "Missing fields" });

  try {
    const societyId = appId || "dev-society-id";
    const otpDoc = await db
      .collection("artifacts")
      .doc(societyId)
      .collection("temp_otps")
      .doc(email)
      .get();

    if (!otpDoc.exists)
      return res.status(400).json({ error: "OTP not found or expired" });

    const data = otpDoc.data();
    if (data.otp !== otp) return res.status(400).json({ error: "Invalid OTP" });
    if (Date.now() > data.expiresAt)
      return res.status(400).json({ error: "OTP expired" });

    res.json({ success: true, message: "OTP verified" });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.post("/auth/reset-password", async (req, res) => {
  const { email, otp, newPassword, appId } = req.body;
  if (!email || !otp || !newPassword)
    return res.status(400).json({ error: "Missing fields" });

  try {
    const societyId = appId || "dev-society-id";
    const otpDoc = await db
      .collection("artifacts")
      .doc(societyId)
      .collection("temp_otps")
      .doc(email)
      .get();

    if (!otpDoc.exists)
      return res.status(400).json({ error: "Invalid session" });

    const data = otpDoc.data();
    if (data.otp !== otp || Date.now() > data.expiresAt) {
      return res.status(400).json({ error: "OTP invalid or expired" });
    }

    // 1. Get User by Email in Firebase Auth
    const userRecord = await admin.auth().getUserByEmail(email);

    // 2. Update Password
    await admin.auth().updateUser(userRecord.uid, {
      password: newPassword,
    });

    // 3. Cleanup
    await db
      .collection("artifacts")
      .doc(societyId)
      .collection("temp_otps")
      .doc(email)
      .delete();

    res.json({ success: true, message: "Password updated successfully" });
  } catch (error) {
    console.error("Reset Password Error:", error);
    res.status(500).json({ error: error.message });
  }
});

// Mount router on both root and /api to handle all environments (Hosting vs Direct)
/**
 * Step Extra: Generate Wing Report (Docx)
 * Fetches all units and staff for a wing, makes the wing folder public-access (viewer),
 * and generates a Word document with metadata and hyperlinks.
 */
router.post("/drive/generate-wing-report", async (req, res) => {
  const { adminUID, wingId, appId, wingName } = req.body;
  if (!adminUID || !wingId || !appId) {
    return res.status(400).json({ error: "Missing required fields" });
  }

  try {
    const tokenDoc = await db
      .collection("artifacts")
      .doc(appId)
      .collection("secure")
      .doc(adminUID)
      .get();
    if (!tokenDoc.exists || !tokenDoc.data().refreshToken) {
      return res.status(404).json({ error: "Google Drive not linked." });
    }

    const client = new google.auth.OAuth2(
      process.env.GOOGLE_CLIENT_ID,
      process.env.GOOGLE_CLIENT_SECRET,
      process.env.GOOGLE_REDIRECT_URI,
    );
    client.setCredentials({ refresh_token: tokenDoc.data().refreshToken });
    const drive = google.drive({ version: "v3", auth: client });

    // 1. Fetch Wing Metadata
    const wingRef = db
      .collection("artifacts")
      .doc(appId)
      .collection("public")
      .doc("data")
      .collection("societies")
      .doc(adminUID)
      .collection("wings")
      .doc(wingId);
    const wingDoc = await wingRef.get();
    if (!wingDoc.exists) {
      return res.status(404).json({ error: "Wing not found." });
    }
    const wingData = wingDoc.data();

    // 2. Set Drive Sharing to 'Anyone with Link' for the wing folder
    if (wingData.driveFolderId) {
      try {
        await drive.permissions.create({
          fileId: wingData.driveFolderId,
          requestBody: {
            role: "reader",
            type: "anyone",
          },
        });
      } catch (e) {
        console.warn("Could not set Drive permissions:", e.message);
      }
    }

    // 3. Fetch Units and Staff
    const floorGroups = [];
    const floors = wingData.floors || [];

    for (const floor of floors) {
      const floorUnits = [];
      const unitsSnap = await wingRef
        .collection(String(floor.floorNumber))
        .get();
      for (const unitDoc of unitsSnap.docs) {
        const u = unitDoc.data();
        const staffSnap = await db
          .collection("artifacts")
          .doc(appId)
          .collection("public")
          .doc("data")
          .collection("societies")
          .doc(adminUID)
          .collection("Residents")
          .doc(unitDoc.id)
          .collection("StaffMembers")
          .get();

        const staffList = staffSnap.docs.map((s) => s.data());
        floorUnits.push({ ...u, staffMembers: staffList });
      }
      if (floorUnits.length > 0) {
        floorGroups.push({
          floorName: floor.floorName || `Floor ${floor.floorNumber}`,
          units: floorUnits,
        });
      }
    }

    // 4. Generate DOCX
    const {
      Document,
      Packer,
      Paragraph,
      TextRun,
      HeadingLevel,
      Table,
      TableRow,
      TableCell,
      WidthType,
      ExternalHyperlink,
      InternalHyperlink,
      AlignmentType,
      Bookmark,
    } = require("docx");

    const docItems = [
      new Paragraph({
        text: `Wing Report: ${wingName || wingData.name}`,
        heading: HeadingLevel.HEADING_1,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({
        text: `Generated on: ${new Date().toLocaleString()}`,
        alignment: AlignmentType.CENTER,
      }),
      new Paragraph({ text: "" }),
    ];

    // Table of Contents (Navigation)
    docItems.push(
      new Paragraph({
        text: "Table of Contents:",
        heading: HeadingLevel.HEADING_2,
      }),
    );
    floorGroups.forEach((fg) => {
      docItems.push(
        new Paragraph({
          text: `Floor: ${fg.floorName}`,
          heading: HeadingLevel.HEADING_3,
        }),
      );
      fg.units.forEach((u) => {
        const bookmarkId = `unit_${u.id.replace(/[^a-zA-Z0-9]/g, "_")}`;
        docItems.push(
          new Paragraph({
            children: [
              new InternalHyperlink({
                children: [
                  new TextRun({
                    text: `  • Unit ${u.displayName || u.unitName}`,
                    color: "0000FF",
                    underline: {},
                  }),
                ],
                anchor: bookmarkId,
              }),
            ],
          }),
        );
      });
    });
    docItems.push(new Paragraph({ text: "" }));

    // Detailed Body
    for (const fg of floorGroups) {
      docItems.push(
        new Paragraph({
          text: `Floor: ${fg.floorName}`,
          heading: HeadingLevel.HEADING_1,
          spacing: { before: 800 },
        }),
      );

      for (const u of fg.units) {
        const bookmarkId = `unit_${u.id.replace(/[^a-zA-Z0-9]/g, "_")}`;
        docItems.push(
          new Paragraph({
            children: [
              new Bookmark({
                id: bookmarkId,
                children: [
                  new TextRun({
                    text: `Unit: ${u.displayName || u.unitName}`,
                    bold: true,
                    size: 28,
                  }),
                ],
              }),
            ],
            heading: HeadingLevel.HEADING_2,
            spacing: { before: 400 },
          }),
        );
        docItems.push(
          new Paragraph({
            children: [
              new TextRun({ text: "Resident Name: ", bold: true }),
              new TextRun({ text: u.residentName || "N/A" }),
            ],
          }),
        );

        if (u.staffMembers && u.staffMembers.length > 0) {
          docItems.push(
            new Paragraph({
              text: "Staff Details:",
              heading: HeadingLevel.HEADING_3,
              spacing: { before: 200 },
            }),
          );

          u.staffMembers.forEach((s) => {
            const rows = [
              new TableRow({
                children: [
                  new TableCell({
                    children: [
                      new Paragraph({ text: "Attribute", bold: true }),
                    ],
                  }),
                  new TableCell({
                    children: [new Paragraph({ text: "Details", bold: true })],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Staff Name")] }),
                  new TableCell({
                    children: [new Paragraph(s.staffName || "N/A")],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Category")] }),
                  new TableCell({
                    children: [new Paragraph(s.staffType || "N/A")],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Contact")] }),
                  new TableCell({
                    children: [new Paragraph(s.contact || "N/A")],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Native Place")] }),
                  new TableCell({
                    children: [new Paragraph(s.nativePlace || "N/A")],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph("Guardian")] }),
                  new TableCell({
                    children: [
                      new Paragraph(
                        `${s.guardianName || "N/A"} (${s.guardianContact || "N/A"})`,
                      ),
                    ],
                  }),
                ],
              }),
              new TableRow({
                children: [
                  new TableCell({
                    children: [new Paragraph("Guardian Address")],
                  }),
                  new TableCell({
                    children: [new Paragraph(s.guardianAddress || "N/A")],
                  }),
                ],
              }),
            ];

            if (s.driveFolderId) {
              rows.push(
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph("Documents")] }),
                    new TableCell({
                      children: [
                        new Paragraph({
                          children: [
                            new ExternalHyperlink({
                              children: [
                                new TextRun({
                                  text: "View Docs (Google Drive)",
                                  color: "0000FF",
                                  underline: {},
                                }),
                              ],
                              link: `https://drive.google.com/drive/folders/${s.driveFolderId}`,
                            }),
                          ],
                        }),
                      ],
                    }),
                  ],
                }),
              );
            }

            docItems.push(
              new Table({
                width: { size: 100, type: WidthType.PERCENTAGE },
                rows: rows,
              }),
            );
            docItems.push(new Paragraph({ text: "" }));
          });
        } else {
          docItems.push(
            new Paragraph({
              text: "No staff members registered for this unit.",
            }),
          );
        }
      }
    }

    const docx = new Document({
      sections: [{ children: docItems }],
    });

    const b64Data = await Packer.toBase64String(docx);
    res.json({
      success: true,
      fileName: `Wing_Report_${wingName || "Wing"}.docx`,
      data: b64Data,
    });
  } catch (error) {
    console.error("Report Generation Error:", error);
    res.status(500).json({ error: error.message });
  }
});

app.use("/", router);
app.use("/api", router);

/**
 * Propagate Staff Update
 * When a registry document in Resident_Staff is updated,
 * propagate those changes to all units listed in linkedUnits.
 */
exports.propagateStaffUpdate = functions
  .region("asia-south1")
  .firestore.document(
    "artifacts/{appId}/public/data/societies/{adminUID}/Resident_Staff/{staffId}",
  )
  .onUpdate(async (change, context) => {
    const newData = change.after.data();
    const oldData = change.before.data();

    // Skip if nothing relevant changed (avoid infinite loops if fields matched)
    if (JSON.stringify(newData) === JSON.stringify(oldData)) return;

    const { appId, adminUID, staffId } = context.params;
    const linkedUnits = newData.linkedUnits || [];
    if (linkedUnits.length === 0) return;

    console.log(
      `[Propagation] Staff ${staffId} updated. Propagating to ${linkedUnits.length} units.`,
    );

    const batch = db.batch();
    const societyBase = db
      .collection("artifacts")
      .doc(appId)
      .collection("public")
      .doc("data")
      .collection("societies")
      .doc(adminUID);

    for (const unitId of linkedUnits) {
      const unitStaffMembersRef = societyBase
        .collection("Residents")
        .doc(unitId)
        .collection("StaffMembers");

      // Find local links to this registry profile
      const snapshot = await unitStaffMembersRef
        .where("sourceRegistryId", "==", staffId)
        .get();

      snapshot.forEach((docSnap) => {
        batch.set(
          docSnap.ref,
          {
            staffName: newData.staffName,
            staffType: newData.staffType,
            contact: newData.contact,
            photo: newData.photo,
            idCard: newData.idCard,
            addressProof: newData.addressProof,
            nativePlace: newData.nativePlace,
            guardianName: newData.guardianName,
            guardianContact: newData.guardianContact,
            guardianAddress: newData.guardianAddress,
            // propagate audit trail
            lastEditedBy: newData.lastEditedBy || "",
            lastEditedUnit: newData.lastEditedUnit || "",
            lastEditedAt: newData.lastEditedAt || "",
            lastEditField: newData.lastEditField || "",
            updatedAt: newData.updatedAt || new Date().toISOString(),
          },
          { merge: true },
        );
      });
    }

    return batch.commit();
  });

// Replace app.listen with exports.api
exports.api = functions.region("asia-south1").https.onRequest(app);
