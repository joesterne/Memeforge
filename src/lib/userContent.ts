import {
  collection,
  type DocumentData,
  type QueryDocumentSnapshot,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { measureClientOperation } from "./performance";

export interface UserMemeRecord extends DocumentData {
  id: string;
}

export interface UserMemePage {
  rows: UserMemeRecord[];
  cursor: QueryDocumentSnapshot<DocumentData> | null;
  hasMore: boolean;
}

interface CachedPage {
  expiresAt: number;
  value: Promise<UserMemePage>;
}

const firstPageCache = new Map<string, CachedPage>();
const CACHE_MS = 60_000;

export async function getUserMemePage(
  uid: string,
  cursor: QueryDocumentSnapshot<DocumentData> | null = null,
  pageSize = 24,
): Promise<UserMemePage> {
  if (!db || db.app.options.projectId === "MOCK") {
    return { rows: [], cursor: null, hasMore: false };
  }

  const load = async () => {
    const pageQuery = cursor
      ? query(
          collection(db, "memes"),
          where("authorId", "==", uid),
          orderBy("createdAt", "desc"),
          startAfter(cursor),
          limit(pageSize),
        )
      : query(
          collection(db, "memes"),
          where("authorId", "==", uid),
          orderBy("createdAt", "desc"),
          limit(pageSize),
        );
    const snapshots = await measureClientOperation("firestore_user_memes_page", () => getDocs(pageQuery));
    return {
      rows: snapshots.docs.map((snapshot) => ({ id: snapshot.id, ...snapshot.data() })),
      cursor: snapshots.docs.at(-1) || null,
      hasMore: snapshots.size === pageSize,
    };
  };

  if (cursor) return load();
  const cached = firstPageCache.get(uid);
  if (cached && cached.expiresAt > Date.now()) return cached.value;
  const value = load().catch((error) => {
    firstPageCache.delete(uid);
    throw error;
  });
  firstPageCache.set(uid, { expiresAt: Date.now() + CACHE_MS, value });
  return value;
}

export function invalidateUserMemeCache(uid: string): void {
  firstPageCache.delete(uid);
}
