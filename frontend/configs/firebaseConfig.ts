import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// 1. Define the unique App ID for database scoping
// In a dev environment, we use a fallback; in production, this comes from global variables.
// Safely check for the global variable and provide a fallback
export const appId = typeof __app_id !== 'undefined' 
  ? __app_id 
  : 'dev-society-id'; // This fallback is used for your local development

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
export const db = getFirestore(app);