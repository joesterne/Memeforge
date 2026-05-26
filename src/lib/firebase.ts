import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "MOCK",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "MOCK",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "MOCK",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "MOCK",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "MOCK",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "MOCK"
};

let app;
let db: any = null;
let auth: any = null;
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');

try {
  app = initializeApp(firebaseConfig);
  db = getFirestore(app);
  auth = getAuth(app);
} catch (e) {
  console.error("Firebase init failed:", e);
}

export { db, auth };
