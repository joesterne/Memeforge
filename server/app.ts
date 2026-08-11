import { createServer as createHttpServer } from "node:http";
import path from "node:path";
import compression from "compression";
import express, { type NextFunction, type Request, type Response } from "express";
import { FieldValue } from "firebase-admin/firestore";
import helmet from "helmet";
import { BoundedCache } from "./cache";
import { claimAiRequest, completeAiRequest, failAiRequest, getEntitlement, requirePro, storeGeneratedImage } from "./aiAccess";
import { asyncRoute, currentUser, optionalUser, requireUser } from "./auth";
import { createCheckoutSession, createPortalSession, handleStripeWebhook } from "./billing";
import { registerCollaboration } from "./collaboration";
import { getAdminServices } from "./firebaseAdmin";
import { AppError, CircuitBreaker, fetchWithPolicy, isSafeId, normalizeCursor, normalizeText, readJson, readText, Semaphore } from "./http";
import { searchTenor, type GifResult } from "./tenor";
import { errorHandler, logEvent, recordOperation, requestTelemetry } from "./telemetry";
import { configuredOrigins, isAllowedOrigin } from "./origins";
import { fixedWindowRateLimit } from "./rateLimit";

const CACHE_TTL_MS = Math.max(60_000, Number(process.env.SEARCH_CACHE_TTL_MS || 3_600_000));
const CACHE_MAX_ENTRIES = Math.max(10, Number(process.env.SEARCH_CACHE_MAX_ENTRIES || 100));
const FALLBACK_TRENDS = ["drake", "kendrick", "nba", "gta 6", "ai", "taylor swift", "marvel", "apple", "doge", "memes"];
const aiConcurrency = new Semaphore(
  Math.max(1, Number(process.env.AI_MAX_CONCURRENCY || 3)),
  Math.max(0, Number(process.env.AI_MAX_QUEUE || 6)),
);
const imgflipConcurrency = new Semaphore(4, 12);
const imgflipBreaker = new CircuitBreaker(5, 30_000);

interface MemeSearchResult {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  box_count: number;
  dateAdded: string;
}

interface GifPage {
  gifs: GifResult[];
  next: string;
}

interface ImgflipResponse {
  success?: boolean;
  data?: { memes?: Array<Omit<MemeSearchResult, "dateAdded">> };
}

function corsMiddleware(req: Request, res: Response, next: NextFunction): void {
  const origin = req.header("origin")?.replace(/\/$/, "");
  if (!isAllowedOrigin(origin, configuredOrigins())) {
    next(new AppError(403, "ORIGIN_NOT_ALLOWED", "This origin is not allowed."));
    return;
  }
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
    res.setHeader("Access-Control-Allow-Credentials", "true");
  }
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Request-Id");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
    return;
  }
  next();
}

function requestId(res: Response): string {
  return String(res.locals.requestId || "");
}

function clientAbortSignal(req: Request, res: Response): AbortSignal {
  const controller = new AbortController();
  const abort = () => controller.abort();
  req.once("aborted", abort);
  res.once("close", () => {
    if (!res.writableEnded) abort();
  });
  res.once("finish", () => req.off("aborted", abort));
  return controller.signal;
}

function getGeminiKey(): string {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new AppError(503, "GEMINI_NOT_CONFIGURED", "AI generation is not configured.");
  return key;
}

function providerError(error: unknown): AppError {
  if (error instanceof AppError) return error;
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|aborted/i.test(message)) {
    return new AppError(504, "AI_TIMEOUT", "AI generation timed out. Please retry once.", true);
  }
  if (/dunning|billing|quota/i.test(message)) {
    return new AppError(503, "AI_PROVIDER_BILLING", "AI generation is temporarily unavailable.");
  }
  return new AppError(502, "AI_PROVIDER_ERROR", "AI generation failed. Please try again.", true);
}

async function generateLayout(text: string, signal: AbortSignal) {
  const { GoogleGenAI, Type, ThinkingLevel } = await import("@google/genai");
  const ai = new GoogleGenAI({
    apiKey: getGeminiKey(),
    httpOptions: { timeout: 30_000, retryOptions: { attempts: 1 } },
  });
  return ai.models.generateContent({
    model: process.env.GEMINI_TEXT_MODEL || "gemini-3.6-flash",
    contents: `Create a funny meme layout about: ${text}`,
    config: {
      abortSignal: signal,
      httpOptions: { timeout: 30_000, retryOptions: { attempts: 1 } },
      thinkingConfig: { thinkingLevel: ThinkingLevel.HIGH },
      responseMimeType: "application/json",
      responseSchema: {
        type: Type.OBJECT,
        properties: {
          backgroundPrompt: { type: Type.STRING, description: "Background image description with no text in the image." },
          texts: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING },
                x: { type: Type.NUMBER },
                y: { type: Type.NUMBER },
              },
            },
          },
        },
        required: ["backgroundPrompt", "texts"],
      },
    },
  });
}

async function generateImage(text: string, signal: AbortSignal) {
  const { GoogleGenAI } = await import("@google/genai");
  const ai = new GoogleGenAI({
    apiKey: getGeminiKey(),
    httpOptions: { timeout: 45_000, retryOptions: { attempts: 1 } },
  });
  return ai.models.generateContent({
    model: process.env.GEMINI_IMAGE_MODEL || "gemini-3.1-flash-lite-image",
    contents: { parts: [{ text: `A high-quality square meme template about: ${text}. No words or lettering.` }] },
    config: {
      abortSignal: signal,
      httpOptions: { timeout: 45_000, retryOptions: { attempts: 1 } },
      imageConfig: { aspectRatio: "1:1" },
    },
  });
}

function usageFields(response: { modelVersion?: string; usageMetadata?: Record<string, unknown> }) {
  const usage = response.usageMetadata || {};
  return {
    model: response.modelVersion || null,
    promptTokens: usage.promptTokenCount || null,
    outputTokens: usage.candidatesTokenCount || null,
    totalTokens: usage.totalTokenCount || null,
  };
}

export async function createMemeforgeServer() {
  const app = express();
  const httpServer = createHttpServer(app);
  const origins = configuredOrigins();

  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
  app.use(compression());
  app.use("/api", corsMiddleware);
  app.use("/api", requestTelemetry);

  const apiLimiter = fixedWindowRateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 120,
    code: "RATE_LIMITED",
    message: "Too many requests. Please try again later.",
  });
  const aiLimiter = fixedWindowRateLimit({
    windowMs: 60 * 1000,
    limit: 6,
    code: "AI_RATE_LIMITED",
    message: "Too many AI requests. Please wait a minute.",
  });
  app.post("/api/stripe/webhook", express.raw({ type: "application/json", limit: "1mb" }), asyncRoute(async (req, res) => {
    const eventId = await handleStripeWebhook(req.body as Buffer, req.header("stripe-signature"));
    res.json({ received: true, eventId });
  }));
  app.use("/api", apiLimiter);
  app.use("/api", express.json({ limit: "256kb" }));

  app.post("/api/client-telemetry", optionalUser, asyncRoute(async (req, res) => {
    const operation = normalizeText(req.body?.operation, 80).toLowerCase().replace(/[^a-z0-9_:-]/g, "");
    const durationMs = Number(req.body?.durationMs);
    const outcome = req.body?.outcome;
    if (!operation || !Number.isFinite(durationMs) || durationMs < 0 || durationMs > 300_000) {
      throw new AppError(400, "INVALID_CLIENT_METRIC", "The client timing metric is invalid.");
    }
    if (outcome !== "success" && outcome !== "error" && outcome !== "cancelled") {
      throw new AppError(400, "INVALID_CLIENT_OUTCOME", "The client timing outcome is invalid.");
    }
    logEvent(outcome === "error" ? "warn" : "info", "client_operation", {
      operation,
      durationMs: Math.round(durationMs * 10) / 10,
      outcome,
      actor: (req as Request & { user?: { uid: string } }).user?.uid ? "authenticated" : "anonymous",
    });
    res.status(202).json({ success: true });
  }));

  const stopCollaboration = await registerCollaboration(httpServer, origins);

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      services: {
        tenor: Boolean(process.env.TENOR_API_KEY),
        gemini: Boolean(process.env.GEMINI_API_KEY),
        stripe: Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRO_PRICE_ID && process.env.STRIPE_WEBHOOK_SECRET),
        storage: Boolean(process.env.FIREBASE_STORAGE_BUCKET),
      },
    });
  });

  const trendsCache = new BoundedCache<string[]>({ maxEntries: 1, ttlMs: CACHE_TTL_MS });
  app.get("/api/trending-searches", asyncRoute(async (_req, res) => {
    const startedAt = performance.now();
    const cached = trendsCache.get("US");
    if (cached) {
      recordOperation("trends_list", startedAt, { cacheHit: true, resultCount: cached.length });
      res.json({ success: true, terms: cached, cached: true });
      return;
    }
    const terms = FALLBACK_TRENDS;
    trendsCache.set("US", terms);
    recordOperation("trends_list", startedAt, { cacheHit: false, curated: true, resultCount: terms.length });
    res.json({ success: true, terms, curated: true });
  }));

  const popularMemeCache = new BoundedCache<MemeSearchResult[]>({ maxEntries: 1, ttlMs: CACHE_TTL_MS });
  app.get("/api/templates", asyncRoute(async (req, res) => {
    const startedAt = performance.now();
    const cached = popularMemeCache.get("popular");
    if (cached) {
      recordOperation("imgflip_templates", startedAt, { cacheHit: true, resultCount: cached.length });
      res.json({ success: true, memes: cached, cached: true });
      return;
    }
    let attempts = 0;
    const response = await imgflipConcurrency.run(() => fetchWithPolicy(
      "https://api.imgflip.com/get_memes",
      { headers: { Accept: "application/json", "User-Agent": "Memeforge/1.0" } },
      {
        timeoutMs: 6_000,
        retries: 1,
        signal: clientAbortSignal(req, res),
        breaker: imgflipBreaker,
        onAttempt: () => { attempts += 1; },
      },
    ));
    const data = await readJson<ImgflipResponse>(response, "Imgflip", 1_000_000);
    if (!data.success || !Array.isArray(data.data?.memes)) {
      throw new AppError(502, "IMGFLIP_INVALID_RESPONSE", "Templates are temporarily unavailable.", true);
    }
    const memes = data.data.memes.slice(0, 100).map((meme) => ({ ...meme, dateAdded: "" }));
    popularMemeCache.set("popular", memes);
    recordOperation("imgflip_templates", startedAt, { cacheHit: false, attempts, resultCount: memes.length });
    res.json({ success: true, memes });
  }));

  const memeCache = new BoundedCache<MemeSearchResult[]>({ maxEntries: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS });
  app.get("/api/search-memes", asyncRoute(async (req, res) => {
    const startedAt = performance.now();
    const query = normalizeText(req.query.q);
    if (!query) {
      res.json({ success: true, memes: [] });
      return;
    }
    const cacheKey = query.toLocaleLowerCase("en-US");
    const cached = memeCache.get(cacheKey);
    if (cached) {
      recordOperation("imgflip_search", startedAt, { cacheHit: true, resultCount: cached.length });
      res.json({ success: true, memes: cached, cached: true });
      return;
    }

    let attempts = 0;
    const response = await imgflipConcurrency.run(() => fetchWithPolicy(
      `https://imgflip.com/search?q=${encodeURIComponent(query)}`,
      { headers: { Accept: "text/html", "User-Agent": "Memeforge/1.0" } },
      {
        timeoutMs: 6_000,
        retries: 1,
        signal: clientAbortSignal(req, res),
        breaker: imgflipBreaker,
        onAttempt: () => { attempts += 1; },
      },
    ));
    const html = await readText(response, "Imgflip", 2_000_000);
    const memes: MemeSearchResult[] = [];
    const itemRegex = /<img class="base-img" src="(\/\/i\.imgflip\.com\/[^"]+)" alt="([^"]+)"/g;
    let match: RegExpExecArray | null;
    while ((match = itemRegex.exec(html)) && memes.length < 20) {
      const url = `https:${match[1]}`;
      const id = url.split("/").pop()?.split(".")[0];
      if (!id) continue;
      memes.push({
        id: `search_${id}`,
        name: match[2].replace(/ \w+ meme$/, "").trim(),
        url,
        width: 500,
        height: 500,
        box_count: 2,
        dateAdded: new Date().toISOString(),
      });
    }
    memeCache.set(cacheKey, memes);
    recordOperation("imgflip_search", startedAt, { cacheHit: false, attempts, resultCount: memes.length });
    res.json({ success: true, memes });
  }));

  const gifCache = new BoundedCache<GifPage>({ maxEntries: CACHE_MAX_ENTRIES, ttlMs: CACHE_TTL_MS });
  const gifSearchHandler = asyncRoute(async (req, res) => {
    const startedAt = performance.now();
    const query = normalizeText(req.query.q);
    const pos = normalizeCursor(req.query.pos);
    const random = req.query.random === "true";
    if (!query) {
      res.json({ success: true, gifs: [], next: "" });
      return;
    }
    const key = `${query.toLocaleLowerCase("en-US")}:${pos}:${random}`;
    const cached = gifCache.get(key);
    if (cached) {
      recordOperation("tenor_search", startedAt, { cacheHit: true, resultCount: cached.gifs.length });
      res.json({ success: true, ...cached, cached: true });
      return;
    }
    const page = await searchTenor(query, { pos, random, signal: clientAbortSignal(req, res) });
    gifCache.set(key, page);
    recordOperation("tenor_search", startedAt, { cacheHit: false, resultCount: page.gifs.length });
    res.json({ success: true, ...page });
  });
  app.get("/api/search-gifs", gifSearchHandler);

  app.get("/api/me/entitlement", requireUser, asyncRoute(async (req, res) => {
    res.json({ success: true, entitlement: await getEntitlement(currentUser(req).uid) });
  }));

  app.post("/api/create-checkout-session", requireUser, asyncRoute(async (req, res) => {
    const user = currentUser(req);
    const session = await createCheckoutSession(user.uid, user.email, requestId(res));
    res.json({ success: true, id: session.id, url: session.url });
  }));

  app.post("/api/create-portal-session", requireUser, asyncRoute(async (req, res) => {
    const user = currentUser(req);
    const session = await createPortalSession(user.uid, user.email);
    res.json({ success: true, url: session.url });
  }));

  app.post("/api/chat-to-meme", aiLimiter, requireUser, asyncRoute(async (req, res) => {
    const user = currentUser(req);
    await requirePro(user.uid);
    const text = normalizeText(req.body?.text, 500);
    if (!text) throw new AppError(400, "TEXT_REQUIRED", "Describe the meme you want to create.");
    const id = requestId(res);
    const claim = await claimAiRequest(user.uid, id, "chat-to-meme");
    if (claim.duplicate) {
      res.json({ success: true, ...claim.result, duplicate: true });
      return;
    }

    const startedAt = performance.now();
    try {
      const signal = AbortSignal.any([AbortSignal.timeout(30_000), clientAbortSignal(req, res)]);
      const response = await aiConcurrency.run(() => generateLayout(text, signal));
      const memeDraft = JSON.parse(response.text?.trim() || "{}");
      const result = { memeDraft };
      await completeAiRequest(user.uid, id, result);
      recordOperation("ai_chat_to_meme", startedAt, { uid: user.uid, ...usageFields(response as never) });
      res.json({ success: true, ...result });
    } catch (error) {
      const mapped = providerError(error);
      await failAiRequest(user.uid, id, mapped.code).catch(() => undefined);
      throw mapped;
    }
  }));

  app.post("/api/generate-meme", aiLimiter, requireUser, asyncRoute(async (req, res) => {
    const user = currentUser(req);
    await requirePro(user.uid);
    const text = normalizeText(req.body?.text, 500);
    if (!text) throw new AppError(400, "TEXT_REQUIRED", "Describe the image you want to generate.");
    const id = requestId(res);
    const claim = await claimAiRequest(user.uid, id, "generate-meme");
    if (claim.duplicate) {
      res.json({ success: true, ...claim.result, duplicate: true });
      return;
    }

    const startedAt = performance.now();
    try {
      const signal = AbortSignal.any([AbortSignal.timeout(45_000), clientAbortSignal(req, res)]);
      const response = await aiConcurrency.run(() => generateImage(text, signal));
      const part = response.candidates?.[0]?.content?.parts?.find((candidate) => candidate.inlineData);
      if (!part?.inlineData?.data) throw new AppError(502, "AI_NO_IMAGE", "The AI provider did not return an image.", true);
      const stored = await storeGeneratedImage(user.uid, id, part.inlineData.mimeType || "image/png", part.inlineData.data);
      await completeAiRequest(user.uid, id, stored);
      recordOperation("ai_generate_image", startedAt, { uid: user.uid, ...usageFields(response as never) });
      res.json({ success: true, ...stored });
    } catch (error) {
      const mapped = providerError(error);
      await failAiRequest(user.uid, id, mapped.code).catch(() => undefined);
      throw mapped;
    }
  }));

  app.get("/api/template-votes", optionalUser, asyncRoute(async (req, res) => {
    const ids = String(req.query.ids || "").split(",").filter((id) => isSafeId(id, 128)).slice(0, 50);
    if (!ids.length) {
      res.json({ success: true, votes: {} });
      return;
    }
    const user = (req as Request & { user?: { uid: string } }).user;
    const { db } = getAdminServices();
    const parentRefs = ids.map((id) => db.doc(`templateVotes/${id}`));
    const userRefs = user ? ids.map((id) => db.doc(`templateVotes/${id}/users/${user.uid}`)) : [];
    const snapshots = await db.getAll(...parentRefs, ...userRefs);
    const votes: Record<string, { upvotes: number; downvotes: number; userVote: string | null }> = {};
    ids.forEach((id, index) => {
      const data = snapshots[index]?.data();
      const userData = user ? snapshots[parentRefs.length + index]?.data() : undefined;
      votes[id] = {
        upvotes: Number(data?.upvotes || 0),
        downvotes: Number(data?.downvotes || 0),
        userVote: userData?.value === "up" || userData?.value === "down" ? userData.value : null,
      };
    });
    res.json({ success: true, votes });
  }));

  app.post("/api/template-votes/:templateId", requireUser, asyncRoute(async (req, res) => {
    const templateId = req.params.templateId;
    if (!isSafeId(templateId, 128)) throw new AppError(400, "INVALID_TEMPLATE_ID", "The template ID is invalid.");
    const value = req.body?.type;
    if (value !== "up" && value !== "down" && value !== "clear") {
      throw new AppError(400, "INVALID_VOTE", "Vote must be up, down, or clear.");
    }
    const uid = currentUser(req).uid;
    const { db } = getAdminServices();
    const parentRef = db.doc(`templateVotes/${templateId}`);
    const userRef = parentRef.collection("users").doc(uid);
    const result = await db.runTransaction(async (transaction) => {
      const [parentSnapshot, userSnapshot] = await Promise.all([
        transaction.get(parentRef),
        transaction.get(userRef),
      ]);
      const parent = parentSnapshot.data() || {};
      const previous = userSnapshot.data()?.value;
      let upvotes = Math.max(0, Number(parent.upvotes || 0));
      let downvotes = Math.max(0, Number(parent.downvotes || 0));
      if (previous === "up") upvotes = Math.max(0, upvotes - 1);
      if (previous === "down") downvotes = Math.max(0, downvotes - 1);
      if (value === "up") upvotes += 1;
      if (value === "down") downvotes += 1;
      transaction.set(parentRef, { upvotes, downvotes, updatedAt: FieldValue.serverTimestamp() }, { merge: true });
      if (value === "clear") transaction.delete(userRef);
      else transaction.set(userRef, { value, updatedAt: FieldValue.serverTimestamp() });
      return { upvotes, downvotes, userVote: value === "clear" ? null : value };
    });
    res.json({ success: true, vote: result });
  }));

  app.delete("/api/memes/:memeId", requireUser, asyncRoute(async (req, res) => {
    const memeId = req.params.memeId;
    if (!isSafeId(memeId, 128)) throw new AppError(400, "INVALID_MEME_ID", "The meme ID is invalid.");
    const user = currentUser(req);
    const { db, storage } = getAdminServices();
    const reference = db.doc(`memes/${memeId}`);
    const snapshot = await reference.get();
    if (!snapshot.exists) throw new AppError(404, "MEME_NOT_FOUND", "That meme no longer exists.");
    const data = snapshot.data() || {};
    if (data.authorId !== user.uid) throw new AppError(403, "MEME_FORBIDDEN", "You cannot delete another user's meme.");
    const paths = [
      data.templatePath,
      ...(Array.isArray(data.objects) ? data.objects.map((object: { storagePath?: unknown }) => object?.storagePath) : []),
    ].filter((value): value is string => typeof value === "string" && value.startsWith(`users/${user.uid}/`));
    await reference.delete();
    const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
    if (bucketName) {
      const results = await Promise.allSettled([...new Set(paths)].map((storagePath) => storage.bucket(bucketName).file(storagePath).delete({ ignoreNotFound: true })));
      const failed = results.filter((result) => result.status === "rejected").length;
      if (failed) logEvent("warn", "media_cleanup_incomplete", { collection: "memes", documentId: memeId, failed, total: results.length });
    }
    res.json({ success: true, deleted: memeId });
  }));

  app.use("/api", (_req, _res, next) => next(new AppError(404, "API_NOT_FOUND", "API endpoint not found.")));

  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  } else {
    const clientDirectory = path.resolve(process.cwd(), "dist");
    app.use(express.static(clientDirectory, { maxAge: "1h", etag: true }));
    app.use((req, res, next) => {
      if (req.method !== "GET") return next();
      res.sendFile(path.join(clientDirectory, "index.html"));
    });
  }

  app.use(errorHandler);
  const sweepTimer = setInterval(() => {
    memeCache.sweep();
    popularMemeCache.sweep();
    gifCache.sweep();
    trendsCache.sweep();
  }, Math.min(CACHE_TTL_MS, 60_000));
  sweepTimer.unref();

  return {
    app,
    httpServer,
    async close() {
      clearInterval(sweepTimer);
      await stopCollaboration();
      await new Promise<void>((resolve, reject) => httpServer.close((error) => error ? reject(error) : resolve()));
    },
  };
}

export async function startServer(): Promise<void> {
  const port = Number(process.env.PORT || 3000);
  const server = await createMemeforgeServer();
  await new Promise<void>((resolve, reject) => {
    server.httpServer.once("error", reject);
    server.httpServer.listen(port, "0.0.0.0", () => resolve());
  });
  logEvent("info", "server_ready", { port });

  const shutdown = async (signal: string) => {
    logEvent("info", "server_shutdown", { signal });
    await server.close();
  };
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
  process.once("SIGINT", () => void shutdown("SIGINT"));
}
