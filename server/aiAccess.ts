import { randomUUID } from "node:crypto";
import { FieldValue } from "firebase-admin/firestore";
import { AppError, isSafeId } from "./http";
import { getAdminServices, requireStorageBucket } from "./firebaseAdmin";

const ACTIVE_ENTITLEMENTS = new Set(["active", "trialing"]);

export interface Entitlement {
  plan: "free" | "pro";
  status: string;
  currentPeriodEnd: string | null;
}

export async function getEntitlement(uid: string): Promise<Entitlement> {
  const snapshot = await getAdminServices().db.doc(`entitlements/${uid}`).get();
  const data = snapshot.data();
  const status = typeof data?.status === "string" ? data.status : "inactive";
  return {
    plan: ACTIVE_ENTITLEMENTS.has(status) ? "pro" : "free",
    status,
    currentPeriodEnd: typeof data?.currentPeriodEnd === "string" ? data.currentPeriodEnd : null,
  };
}

export async function requirePro(uid: string): Promise<Entitlement> {
  if (process.env.NODE_ENV !== "production" && process.env.ALLOW_FREE_AI === "true") {
    return { plan: "pro", status: "development", currentPeriodEnd: null };
  }
  const entitlement = await getEntitlement(uid);
  if (entitlement.plan !== "pro") {
    throw new AppError(402, "PRO_REQUIRED", "An active Pro subscription is required for AI generation.");
  }
  return entitlement;
}

export interface AiRequestClaim {
  duplicate: boolean;
  result?: Record<string, unknown>;
}

export async function claimAiRequest(
  uid: string,
  requestId: string,
  operation: string,
): Promise<AiRequestClaim> {
  if (!isSafeId(requestId, 80)) {
    throw new AppError(400, "INVALID_REQUEST_ID", "X-Request-Id must contain only letters, numbers, underscores, or hyphens.");
  }

  const { db } = getAdminServices();
  const requestRef = db.doc(`aiRequests/${uid}_${requestId}`);
  const day = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  const usageRef = db.doc(`aiUsage/${uid}_${day}`);
  const dailyLimit = Math.max(1, Number(process.env.AI_DAILY_REQUEST_LIMIT || 25));
  const activeLimit = Math.max(1, Number(process.env.AI_MAX_ACTIVE_PER_USER || 2));

  return db.runTransaction(async (transaction) => {
    const [requestSnapshot, usageSnapshot] = await Promise.all([
      transaction.get(requestRef),
      transaction.get(usageRef),
    ]);
    const existing = requestSnapshot.data();
    if (existing?.status === "complete" && existing.result && typeof existing.result === "object") {
      return { duplicate: true, result: existing.result as Record<string, unknown> };
    }
    if (existing?.status === "processing") {
      throw new AppError(409, "REQUEST_IN_PROGRESS", "This generation request is already in progress.", true);
    }

    const count = Number(usageSnapshot.data()?.count || 0);
    const active = Math.max(0, Number(usageSnapshot.data()?.active || 0));
    if (count >= dailyLimit) {
      throw new AppError(429, "AI_DAILY_LIMIT", "Your daily AI generation limit has been reached.");
    }
    if (active >= activeLimit) {
      throw new AppError(429, "AI_CONCURRENCY_LIMIT", "Wait for your current AI request to finish before starting another.", true);
    }

    transaction.set(usageRef, {
      uid,
      day,
      count: count + 1,
      active: active + 1,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    transaction.set(requestRef, {
      uid,
      requestId,
      operation,
      usageId: usageRef.id,
      status: "processing",
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    });
    return { duplicate: false };
  });
}

export async function completeAiRequest(
  uid: string,
  requestId: string,
  result: Record<string, unknown>,
): Promise<void> {
  await finalizeAiRequest(uid, requestId, "complete", { result });
}

export async function failAiRequest(uid: string, requestId: string, code: string): Promise<void> {
  await finalizeAiRequest(uid, requestId, "failed", { errorCode: code });
}

async function finalizeAiRequest(
  uid: string,
  requestId: string,
  status: "complete" | "failed",
  fields: Record<string, unknown>,
): Promise<void> {
  const { db } = getAdminServices();
  const requestRef = db.doc(`aiRequests/${uid}_${requestId}`);
  await db.runTransaction(async (transaction) => {
    const requestSnapshot = await transaction.get(requestRef);
    const request = requestSnapshot.data();
    const usageId = typeof request?.usageId === "string" ? request.usageId : null;
    const usageRef = usageId ? db.doc(`aiUsage/${usageId}`) : null;
    const usageSnapshot = usageRef ? await transaction.get(usageRef) : null;
    transaction.set(requestRef, {
      status,
      ...fields,
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: true });
    if (usageRef && request?.status === "processing") {
      transaction.set(usageRef, {
        active: Math.max(0, Number(usageSnapshot?.data()?.active || 0) - 1),
        updatedAt: FieldValue.serverTimestamp(),
      }, { merge: true });
    }
  });
}

export async function storeGeneratedImage(
  uid: string,
  requestId: string,
  mimeType: string,
  base64: string,
): Promise<{ imageUrl: string; storagePath: string }> {
  const bucketName = requireStorageBucket();
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/webp" ? "webp" : "png";
  const storagePath = `users/${uid}/ai/${requestId}.${extension}`;
  const downloadToken = randomUUID();
  const bucket = getAdminServices().storage.bucket(bucketName);
  await bucket.file(storagePath).save(Buffer.from(base64, "base64"), {
    resumable: false,
    contentType: mimeType,
    metadata: {
      cacheControl: "private,max-age=3600",
      metadata: { firebaseStorageDownloadTokens: downloadToken },
    },
  });
  const imageUrl = `https://firebasestorage.googleapis.com/v0/b/${encodeURIComponent(bucketName)}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;
  return { imageUrl, storagePath };
}
