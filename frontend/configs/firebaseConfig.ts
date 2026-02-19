import { initializeApp } from "firebase/app";
import {
    browserLocalPersistence,
    getAuth,
    setPersistence,
} from "firebase/auth";

// 1. Define the unique App ID for database scoping
export const appId =
  typeof __app_id !== "undefined" ? __app_id : "dev-society-id";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

// 2. Initialize Firebase
const app = initializeApp(firebaseConfig);

// 3. Export Instances
export const auth = getAuth(app);

// Set persistence to LOCAL to survive redirects
setPersistence(auth, browserLocalPersistence).catch((error) => {
  console.error("Auth persistence error:", error);
});

import { getFirestore } from "firebase/firestore";

export const db = getFirestore(app);
