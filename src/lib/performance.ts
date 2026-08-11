export type ClientOutcome = "success" | "error" | "cancelled";

const configuredApiBaseUrl = import.meta.env.VITE_API_BASE_URL?.trim();
const sampleRate = Math.max(0, Math.min(1, Number(import.meta.env.VITE_TELEMETRY_SAMPLE_RATE ?? 0.1)));

function telemetryUrl(): string {
  return configuredApiBaseUrl
    ? new URL("/api/client-telemetry", configuredApiBaseUrl).toString()
    : "/api/client-telemetry";
}

export function reportClientMetric(operation: string, durationMs: number, outcome: ClientOutcome): void {
  const shouldReport = outcome !== "success" || durationMs >= 2_000 || Math.random() < sampleRate;
  if (!shouldReport || typeof window === "undefined") return;
  const body = JSON.stringify({ operation, durationMs, outcome });
  if (navigator.sendBeacon) {
    navigator.sendBeacon(telemetryUrl(), new Blob([body], { type: "application/json" }));
    return;
  }
  void fetch(telemetryUrl(), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  }).catch(() => undefined);
}

export async function measureClientOperation<T>(operation: string, task: () => Promise<T>): Promise<T> {
  const startedAt = performance.now();
  let outcome: ClientOutcome = "error";
  try {
    const result = await task();
    outcome = "success";
    return result;
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") outcome = "cancelled";
    throw error;
  } finally {
    const durationMs = performance.now() - startedAt;
    performance.measure(`memeforge:${operation}`, { start: startedAt, duration: durationMs });
    reportClientMetric(operation, durationMs, outcome);
  }
}
