import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, OAuthProvider } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

const getEnv = (key: string) => {
  if (typeof process !== 'undefined' && process.env && process.env[key]) {
    return process.env[key];
  }
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  return undefined;
};

const firebaseConfig = {
  apiKey: getEnv('VITE_FIREBASE_API_KEY') || "MOCK",
  authDomain: getEnv('VITE_FIREBASE_AUTH_DOMAIN') || "MOCK",
  projectId: getEnv('VITE_FIREBASE_PROJECT_ID') || "MOCK",
  storageBucket: getEnv('VITE_FIREBASE_STORAGE_BUCKET') || "MOCK",
  messagingSenderId: getEnv('VITE_FIREBASE_MESSAGING_SENDER_ID') || "MOCK",
  appId: getEnv('VITE_FIREBASE_APP_ID') || "MOCK"
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
  db = getFirestore(app, getEnv('VITE_FIREBASE_DATABASE_ID') || "ai-studio-memeforge-e89538b2-29ed-46d4-bae0-da32b129d8ed");
  auth = getAuth(app);
} catch (e) {
  console.error("Firebase init failed:", e);
}

export { db, auth };
