import assert from "node:assert/strict";
import test from "node:test";
import {
  AppError,
  CircuitBreaker,
  fetchWithPolicy,
  isSafeId,
  normalizeCursor,
  normalizeText,
  readText,
  Semaphore,
} from "../../server/http";

test("normalizers bound user-controlled values", () => {
  assert.equal(normalizeText("  hello   world  "), "hello world");
  assert.equal(normalizeText("x".repeat(100)).length, 80);
  assert.equal(normalizeCursor("not valid?"), "");
  assert.equal(isSafeId("room_123-abc", 64), true);
  assert.equal(isSafeId("__proto__[x]", 64), false);
});

test("semaphore rejects work when its bounded queue is full", async () => {
  const semaphore = new Semaphore(1, 1);
  let release!: () => void;
  const blocker = new Promise<void>((resolve) => { release = resolve; });
  const first = semaphore.run(() => blocker);
  const second = semaphore.run(async () => "queued");
  await assert.rejects(() => semaphore.run(async () => "overflow"), (error: unknown) => {
    assert.equal((error as AppError).code, "UPSTREAM_QUEUE_FULL");
    return true;
  });
  release();
  await first;
  assert.equal(await second, "queued");
});

test("circuit breaker opens and permits one recovery probe", () => {
  const breaker = new CircuitBreaker(2, 100);
  breaker.failure(0);
  breaker.failure(1);
  assert.throws(() => breaker.beforeRequest(50), /recovering/i);
  breaker.beforeRequest(101);
  assert.throws(() => breaker.beforeRequest(102), /recovering/i);
  breaker.success();
  breaker.beforeRequest(103);
});

test("fetch policy retries transient reads and respects response bounds", async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls += 1;
    return calls === 1
      ? new Response("busy", { status: 503 })
      : new Response("ok", { status: 200, headers: { "content-length": "2" } });
  };
  try {
    const response = await fetchWithPolicy("https://example.test", {}, { retries: 1, retryDelayMs: 0 });
    assert.equal(await readText(response, "test", 10), "ok");
    assert.equal(calls, 2);
    await assert.rejects(
      () => readText(new Response("0123456789", { headers: { "content-length": "10" } }), "test", 5),
      (error: unknown) => (error as AppError).code === "UPSTREAM_RESPONSE_TOO_LARGE",
    );
  } finally {
    globalThis.fetch = originalFetch;
  }
});
