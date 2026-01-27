# Society Registration Backend

This backend handles secure Google Drive uploads using Refresh Tokens, enabling residents to upload documents even when the admin is offline.

## Setup Instructions

1. **Install Dependencies**:

   ```bash
   npm install
   ```

2. **Environment Variables**:
   Create a `.env` file based on `.env.example`:
   - `GOOGLE_CLIENT_ID`: From Google Cloud Console.
   - `GOOGLE_CLIENT_SECRET`: From Google Cloud Console.
   - `GOOGLE_REDIRECT_URI`: Should be `http://localhost:3001/api/auth/google/callback`.
   - `FIREBASE_PROJECT_ID`: Your Firebase Project ID.

3. **Firebase Admin SDK**:
   - Go to Firebase Console > Project Settings > Service Accounts.
   - Click "Generate new private key".
   - Rename the downloaded file to `serviceAccountKey.json` and place it in this `backend/` directory.

4. **Run the Server**:
   ```bash
   node index.js
   ```

## Workflow

1. **Admin** clicks "Link Drive" in the Dashboard.
2. **Admin** signs in with Google and grants permissions.
3. **Backend** receives the Auth Code, exchanges it for a **Refresh Token**, and saves it to Firestore (`artifacts/secure/{adminUID}`).
4. **Resident** registers staff; the frontend calls the backend API.
5. **Backend** uses the stored Refresh Token to get a fresh Access Token and uploads the documents to the correct Drive folder.
