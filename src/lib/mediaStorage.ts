import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";
import { measureClientOperation } from "./performance";

export interface StoredMedia {
  url: string;
  storagePath: string;
}

const ALLOWED_IMAGE_TYPES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

export function validateImageFile(file: File, maxBytes = 5 * 1024 * 1024): void {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) throw new Error("Choose a PNG, JPEG, WebP, or GIF image.");
  if (file.size > maxBytes) throw new Error(`Image must be smaller than ${Math.round(maxBytes / 1024 / 1024)} MB.`);
}

function extensionFor(type: string): string {
  if (type === "image/jpeg") return "jpg";
  if (type === "image/webp") return "webp";
  if (type === "image/gif") return "gif";
  return "png";
}

export async function storeUserMedia(
  uid: string,
  category: "backgrounds" | "elements" | "templates" | "submissions",
  id: string,
  blob: Blob,
): Promise<StoredMedia> {
  if (!storage) throw new Error("Firebase Storage is not configured.");
  const safeId = id.replace(/[^A-Za-z0-9_-]/g, "").slice(0, 100) || crypto.randomUUID();
  const storagePath = `users/${uid}/${category}/${safeId}.${extensionFor(blob.type)}`;
  const mediaRef = ref(storage, storagePath);
  await measureClientOperation("media_upload", () => uploadBytes(mediaRef, blob, {
    contentType: blob.type,
    cacheControl: category === "backgrounds" || category === "elements" ? "private,max-age=3600" : "public,max-age=31536000,immutable",
  }));
  return { url: await getDownloadURL(mediaRef), storagePath };
}

export async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  if (!response.ok) throw new Error("Could not prepare the image for upload.");
  return response.blob();
}
