import { createHash, randomUUID } from "node:crypto";
import type { ErrorRequestHandler, Request, RequestHandler } from "express";
import { AppError } from "./http";

type LogLevel = "info" | "warn" | "error";

export function redactLogValue(error: unknown): string {
  const value = error instanceof Error ? error.message : String(error);
  return value
    .replace(/([?&](?:key|token|api_key)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/data:image\/[a-z0-9.+-]+;base64,[a-z0-9+/=]+/gi, "[REDACTED_DATA_URL]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[REDACTED_EMAIL]")
    .slice(0, 500);
}

export function hashIdentifier(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 16);
}

function sanitize(value: unknown, key = ""): unknown {
  if (/body|prompt|email|token|authorization|api.?key|dataurl/i.test(key)) return "[REDACTED]";
  if (typeof value === "string") return redactLogValue(value);
  if (Array.isArray(value)) return value.slice(0, 20).map((item) => sanitize(item));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).slice(0, 50).map(([field, item]) => [field, sanitize(item, field)]));
  }
  return value;
}

export function logEvent(level: LogLevel, event: string, fields: Record<string, unknown> = {}): void {
  const payload = JSON.stringify({
    timestamp: new Date().toISOString(),
    level,
    event,
    ...sanitize(fields) as Record<string, unknown>,
  });
  if (level === "error") console.error(payload);
  else if (level === "warn") console.warn(payload);
  else console.info(payload);
}

export const requestTelemetry: RequestHandler = (req, res, next) => {
  const supplied = req.header("x-request-id");
  const requestId = supplied && /^[A-Za-z0-9_-]{8,80}$/.test(supplied) ? supplied : randomUUID();
  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  const startedAt = performance.now();

  res.once("finish", () => {
    const user = (req as Request & { user?: { uid?: string } }).user;
    logEvent(res.statusCode >= 500 ? "error" : res.statusCode >= 400 ? "warn" : "info", "http_request", {
      requestId,
      method: req.method,
      route: req.route?.path || req.path,
      status: res.statusCode,
      durationMs: Math.round((performance.now() - startedAt) * 10) / 10,
      responseBytes: res.getHeader("content-length") || null,
      actor: user?.uid ? hashIdentifier(user.uid) : "anonymous",
      rateLimited: res.statusCode === 429,
    });
  });
  next();
};

export function recordOperation(
  operation: string,
  startedAt: number,
  fields: Record<string, unknown> = {},
): void {
  const durationMs = Math.round((performance.now() - startedAt) * 10) / 10;
  logEvent("info", "operation_complete", {
    operation,
    durationMs,
    ...fields,
  });
  const thresholdMs = /ai_|gemini/i.test(operation)
    ? 20_000
    : /gif_export/i.test(operation)
      ? 10_000
      : /stripe|checkout|portal/i.test(operation)
        ? 5_000
        : /firestore/i.test(operation)
          ? 2_000
          : 3_000;
  if (durationMs >= thresholdMs) logEvent("warn", "slow_operation", { operation, durationMs, thresholdMs });
}

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const appError = error instanceof AppError
    ? error
    : new AppError(500, "INTERNAL_ERROR", "An unexpected error occurred.");
  const requestId = res.locals.requestId || randomUUID();

  logEvent("error", "request_error", {
    requestId,
    code: appError.code,
    status: appError.status,
    retryable: appError.retryable,
    error: redactLogValue(error),
  });

  if (res.headersSent) return;
  res.status(appError.status).json({
    success: false,
    error: {
      code: appError.code,
      message: appError.message,
      retryable: appError.retryable,
      requestId,
    },
  });
};
