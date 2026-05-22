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

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const appleProvider = new OAuthProvider('apple.com');
appleProvider.addScope('email');
appleProvider.addScope('name');
