import { setTimeout as delay } from "node:timers/promises";

export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryable = false,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export function normalizeText(input: unknown, maxLength = 80): string {
  const value = Array.isArray(input) ? input[0] : input;
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, maxLength);
}

export function normalizeCursor(input: unknown, maxLength = 256): string {
  const value = Array.isArray(input) ? input[0] : input;
  if (typeof value !== "string") return "";
  const cursor = value.trim().slice(0, maxLength);
  return /^[A-Za-z0-9._~+/=:-]*$/.test(cursor) ? cursor : "";
}

export function isSafeId(value: unknown, maxLength = 128): value is string {
  return typeof value === "string" && value.length > 0 && value.length <= maxLength && /^[A-Za-z0-9_-]+$/.test(value);
}

export class Semaphore {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(
    private readonly limit: number,
    private readonly maxQueue = limit * 4,
  ) {
    if (limit < 1 || maxQueue < 0) throw new Error("Semaphore limits must be valid");
  }

  get activeCount(): number {
    return this.active;
  }

  get queuedCount(): number {
    return this.queue.length;
  }

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.active >= this.limit) {
      if (this.queue.length >= this.maxQueue) {
        throw new AppError(503, "UPSTREAM_QUEUE_FULL", "The service is busy. Please retry shortly.", true);
      }
      await new Promise<void>((resolve) => this.queue.push(resolve));
    }
    this.active += 1;
    try {
      return await task();
    } finally {
      this.active -= 1;
      this.queue.shift()?.();
    }
  }
}

export class CircuitBreaker {
  private failures = 0;
  private openedAt = 0;
  private probing = false;

  constructor(
    private readonly failureThreshold = 5,
    private readonly cooldownMs = 30_000,
  ) {}

  beforeRequest(now = Date.now()): void {
    if (!this.openedAt) return;
    if (now - this.openedAt < this.cooldownMs || this.probing) {
      throw new AppError(503, "UPSTREAM_CIRCUIT_OPEN", "The upstream service is recovering. Please retry shortly.", true);
    }
    this.probing = true;
  }

  success(): void {
    this.failures = 0;
    this.openedAt = 0;
    this.probing = false;
  }

  failure(now = Date.now()): void {
    this.probing = false;
    this.failures += 1;
    if (this.failures >= this.failureThreshold) this.openedAt = now;
  }
}

export interface FetchPolicy {
  timeoutMs?: number;
  retries?: number;
  signal?: AbortSignal;
  retryDelayMs?: number;
  retryUnsafe?: boolean;
  breaker?: CircuitBreaker;
  onAttempt?: (fields: { attempt: number; status?: number; durationMs: number; retrying: boolean }) => void;
}

const RETRYABLE_STATUS = new Set([408, 425, 429, 500, 502, 503, 504]);

export async function fetchWithPolicy(
  url: string | URL,
  init: RequestInit = {},
  policy: FetchPolicy = {},
): Promise<Response> {
  const timeoutMs = policy.timeoutMs ?? 7_000;
  const requestedRetries = policy.retries ?? 1;
  const method = (init.method || "GET").toUpperCase();
  const retries = method === "GET" || method === "HEAD" || policy.retryUnsafe ? requestedRetries : 0;
  const retryDelayMs = policy.retryDelayMs ?? 150;
  policy.breaker?.beforeRequest();

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const startedAt = performance.now();
    const timeoutSignal = AbortSignal.timeout(timeoutMs);
    const signals = [timeoutSignal, policy.signal].filter(Boolean) as AbortSignal[];
    const signal = signals.length === 1 ? signals[0] : AbortSignal.any(signals);

    try {
      const response = await fetch(url, { ...init, signal });
      const retrying = RETRYABLE_STATUS.has(response.status) && attempt < retries;
      policy.onAttempt?.({
        attempt: attempt + 1,
        status: response.status,
        durationMs: performance.now() - startedAt,
        retrying,
      });
      if (!retrying) {
        if (RETRYABLE_STATUS.has(response.status)) policy.breaker?.failure();
        else policy.breaker?.success();
        return response;
      }
      await response.body?.cancel();
      const retryAfter = response.headers.get("retry-after");
      const parsedSeconds = retryAfter ? Number(retryAfter) : Number.NaN;
      const parsedDate = retryAfter && Number.isNaN(parsedSeconds) ? Date.parse(retryAfter) - Date.now() : Number.NaN;
      const waitMs = Number.isFinite(parsedSeconds)
        ? Math.max(0, parsedSeconds * 1_000)
        : Number.isFinite(parsedDate)
          ? Math.max(0, parsedDate)
          : retryDelayMs * (attempt + 1) + Math.random() * retryDelayMs * 0.25;
      await delay(waitMs, undefined, { signal: policy.signal });
      continue;
    } catch (error) {
      if (policy.signal?.aborted) throw error;
      const retrying = attempt < retries;
      policy.onAttempt?.({ attempt: attempt + 1, durationMs: performance.now() - startedAt, retrying });
      if (attempt === retries) {
        policy.breaker?.failure();
        if (timeoutSignal.aborted || (error instanceof DOMException && error.name === "TimeoutError")) {
          throw new AppError(504, "UPSTREAM_TIMEOUT", "The upstream service timed out.", true);
        }
        throw error;
      }
    }

    await delay(retryDelayMs * (attempt + 1) + Math.random() * retryDelayMs * 0.25, undefined, { signal: policy.signal });
  }

  throw new AppError(502, "UPSTREAM_UNAVAILABLE", "The upstream service is unavailable.", true);
}

async function readBuffer(response: Response, provider: string, maxBytes: number): Promise<ArrayBuffer> {
  if (!response.ok) {
    throw new AppError(
      response.status >= 500 ? 502 : response.status,
      "UPSTREAM_ERROR",
      `${provider} returned HTTP ${response.status}.`,
      RETRYABLE_STATUS.has(response.status),
    );
  }
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > maxBytes) {
    await response.body?.cancel();
    throw new AppError(502, "UPSTREAM_RESPONSE_TOO_LARGE", `${provider} returned too much data.`);
  }
  const buffer = await response.arrayBuffer();
  if (buffer.byteLength > maxBytes) {
    throw new AppError(502, "UPSTREAM_RESPONSE_TOO_LARGE", `${provider} returned too much data.`);
  }
  return buffer;
}

export async function readText(response: Response, provider: string, maxBytes = 2 * 1024 * 1024): Promise<string> {
  const buffer = await readBuffer(response, provider, maxBytes);
  return new TextDecoder().decode(buffer);
}

export async function readJson<T>(response: Response, provider: string, maxBytes = 2 * 1024 * 1024): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  if (contentType && !/[/+]json\b/i.test(contentType)) {
    throw new AppError(502, "UPSTREAM_INVALID_CONTENT_TYPE", `${provider} returned an unexpected content type.`);
  }
  try {
    const buffer = await readBuffer(response, provider, maxBytes);
    return JSON.parse(new TextDecoder().decode(buffer)) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError(502, "UPSTREAM_INVALID_RESPONSE", `${provider} returned invalid JSON.`);
  }
}
