import { randomUUID } from "node:crypto";
import { FieldPath, FieldValue, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminServices, requireStorageBucket } from "../server/firebaseAdmin";

const applyChanges = process.argv.includes("--apply");
const PAGE_SIZE = 100;
const counters = { scanned: 0, migrated: 0, skipped: 0, failed: 0 };

function decodeDataUrl(value: unknown): { buffer: Buffer; mimeType: string; extension: string } | null {
  if (typeof value !== "string") return null;
  const match = value.match(/^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/=]+)$/);
  if (!match) return null;
  const extension = match[1] === "image/jpeg" ? "jpg" : match[1].split("/")[1];
  return { buffer: Buffer.from(match[2], "base64"), mimeType: match[1], extension };
}

async function upload(
  uid: string,
  collectionName: string,
  documentId: string,
  suffix: string,
  value: unknown,
): Promise<{ url: string; storagePath: string } | null> {
  const decoded = decodeDataUrl(value);
  if (!decoded) return null;
  const category = collectionName === "templates"
    ? "templates"
    : collectionName === "submissions"
      ? "submissions"
      : suffix === "background"
        ? "backgrounds"
        : "elements";
  const storagePath = `users/${uid}/${category}/${documentId}-${suffix}.${decoded.extension}`;
  if (!applyChanges) return { url: "[DRY_RUN]", storagePath };
  const token = randomUUID();
  const bucketName = requireStorageBucket();
  await getAdminServices().storage.bucket(bucketName).file(storagePath).save(decoded.buffer, {
    resumable: false,
    contentType: decoded.mimeType,
    metadata: {
      cacheControl: "private,max-age=3600",
      metadata: { firebaseStorageDownloadTokens: token },
    },
  });
  return {
    storagePath,
    url: `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${token}`,
  };
}

async function migrateDocument(collectionName: string, snapshot: QueryDocumentSnapshot<DocumentData>): Promise<void> {
  counters.scanned += 1;
  const data = snapshot.data();
  const uid = typeof data.userId === "string" ? data.userId : typeof data.authorId === "string" ? data.authorId : null;
  if (!uid) {
    counters.skipped += 1;
    return;
  }
  const update: Record<string, unknown> = {};

  if (collectionName === "templates") {
    const stored = await upload(uid, collectionName, snapshot.id, "template", data.url);
    if (stored) Object.assign(update, { url: stored.url, storagePath: stored.storagePath });
  } else if (collectionName === "memes") {
    const background = await upload(uid, collectionName, snapshot.id, "background", data.templateUrl);
    if (background) Object.assign(update, { templateUrl: background.url, templatePath: background.storagePath });
    if (Array.isArray(data.objects)) {
      const objects = await Promise.all(data.objects.map(async (object: Record<string, unknown>, index: number) => {
        const stored = await upload(uid, collectionName, snapshot.id, `object-${index}`, object.url);
        return stored ? { ...object, url: stored.url, storagePath: stored.storagePath } : object;
      }));
      if (objects.some((object, index) => object !== data.objects[index])) update.objects = objects;
    }
  } else if (collectionName === "submissions") {
    const source = data.memeUrl || data.imageUrl;
    const stored = await upload(uid, collectionName, snapshot.id, "submission", source);
    if (stored) Object.assign(update, {
      memeUrl: stored.url,
      storagePath: stored.storagePath,
      imageUrl: FieldValue.delete(),
    });
  }

  if (Object.keys(update).length === 0) {
    counters.skipped += 1;
    return;
  }
  if (applyChanges) await snapshot.ref.update(update);
  counters.migrated += 1;
}

async function migrateCollection(collectionName: string): Promise<void> {
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  do {
    let query = getAdminServices().db.collection(collectionName).orderBy(FieldPath.documentId()).limit(PAGE_SIZE);
    if (cursor) query = query.startAfter(cursor);
    const page = await query.get();
    for (const snapshot of page.docs) {
      try {
        await migrateDocument(collectionName, snapshot);
      } catch (error) {
        counters.failed += 1;
        console.error(JSON.stringify({ event: "migration_failed", collection: collectionName, documentId: snapshot.id, error: error instanceof Error ? error.message : String(error) }));
      }
    }
    cursor = page.docs.at(-1) || null;
    if (page.size < PAGE_SIZE) break;
  } while (cursor);
}

for (const collectionName of ["templates", "memes", "submissions"]) await migrateCollection(collectionName);
console.log(JSON.stringify({ event: "migration_complete", mode: applyChanges ? "apply" : "dry-run", ...counters }));
if (counters.failed > 0) process.exitCode = 1;
