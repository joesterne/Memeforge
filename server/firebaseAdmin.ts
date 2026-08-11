import { applicationDefault, getApps, initializeApp, type App } from "firebase-admin/app";
import { getAuth, type Auth } from "firebase-admin/auth";
import { getFirestore, type Firestore } from "firebase-admin/firestore";
import { getStorage, type Storage } from "firebase-admin/storage";
import { AppError } from "./http";

interface AdminServices {
  app: App;
  auth: Auth;
  db: Firestore;
  storage: Storage;
}

let services: AdminServices | null = null;

export function getAdminServices(): AdminServices {
  if (services) return services;

  const projectId = process.env.FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT;
  const storageBucket = process.env.FIREBASE_STORAGE_BUCKET;
  const app = getApps()[0] || initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket,
  });
  const databaseId = process.env.FIREBASE_DATABASE_ID;

  services = {
    app,
    auth: getAuth(app),
    db: databaseId ? getFirestore(app, databaseId) : getFirestore(app),
    storage: getStorage(app),
  };
  return services;
}

export function requireStorageBucket(): string {
  const bucket = process.env.FIREBASE_STORAGE_BUCKET;
  if (!bucket) {
    throw new AppError(503, "STORAGE_NOT_CONFIGURED", "Media storage is not configured.");
  }
  return bucket;
}
