import type { User } from "firebase/auth";
import { reportClientMetric, type ClientOutcome } from "./performance";
import { resolveApiUrl, resolveCollaborationUrl } from "./apiRouting";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();

export function apiUrl(path: string): string {
  return resolveApiUrl(path, configuredApiBaseUrl);
}

export function collaborationUrl(): string {
  return resolveCollaborationUrl(configuredApiBaseUrl, window.location.origin);
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly retryable = false,
    public readonly requestId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface ApiOptions {
  user?: User | null;
  timeoutMs?: number;
  requestId?: string;
}

function combineSignals(first: AbortSignal, second?: AbortSignal | null): AbortSignal {
  if (!second) return first;
  if ("any" in AbortSignal) return AbortSignal.any([first, second]);
  const controller = new AbortController();
  const abort = () => controller.abort();
  first.addEventListener("abort", abort, { once: true });
  second.addEventListener("abort", abort, { once: true });
  return controller.signal;
}

export async function apiFetch<T>(
  path: string,
  init: RequestInit = {},
  options: ApiOptions = {},
): Promise<T> {
  const startedAt = performance.now();
  const operation = `api_${path.split("?")[0].replace(/^\/api\//, "").replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "") || "request"}`;
  const finish = (outcome: ClientOutcome) => reportClientMetric(operation, performance.now() - startedAt, outcome);
  const requestId = options.requestId || crypto.randomUUID();
  const headers = new Headers(init.headers);
  headers.set("Accept", "application/json");
  headers.set("X-Request-Id", requestId);
  if (init.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  if (options.user) headers.set("Authorization", `Bearer ${await options.user.getIdToken()}`);

  const timeout = AbortSignal.timeout(options.timeoutMs ?? 15_000);
  let response: Response;
  try {
    response = await fetch(apiUrl(path), {
      ...init,
      headers,
      signal: combineSignals(timeout, init.signal),
    });
  } catch (error) {
    finish(init.signal?.aborted ? "cancelled" : "error");
    if (timeout.aborted) throw new ApiError(504, "CLIENT_TIMEOUT", "The request timed out.", true, requestId);
    throw error;
  }

  const data = await response.json().catch(() => ({})) as Record<string, unknown>;
  if (!response.ok) {
    finish("error");
    const envelope = data.error && typeof data.error === "object" ? data.error as Record<string, unknown> : data;
    throw new ApiError(
      response.status,
      typeof envelope.code === "string" ? envelope.code : "REQUEST_FAILED",
      typeof envelope.message === "string" ? envelope.message : "The request failed.",
      Boolean(envelope.retryable),
      typeof envelope.requestId === "string" ? envelope.requestId : requestId,
    );
  }
  finish("success");
  return data as T;
}
