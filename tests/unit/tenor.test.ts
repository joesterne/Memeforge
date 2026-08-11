import assert from "node:assert/strict";
import test from "node:test";
import { AppError } from "../../server/http";
import { searchTenor } from "../../server/tenor";

test("Tenor v2 request is safe, paginated, and skips malformed results", async () => {
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.TENOR_API_KEY;
  process.env.TENOR_API_KEY = "server-secret";
  let requestedUrl = "";
  globalThis.fetch = async (input) => {
    requestedUrl = String(input);
    return new Response(JSON.stringify({
      next: "cursor-2",
      results: [
        {
          id: "123",
          content_description: "A safe reaction",
          media_formats: {
            gif: { url: "https://media.example/full.gif", dims: [640, 360] },
            tinygif: { url: "https://media.example/preview.gif", dims: [320, 180] },
          },
        },
        { id: "broken", media_formats: {} },
      ],
    }), { headers: { "content-type": "application/json" } });
  };
  try {
    const result = await searchTenor("funny cats", { pos: "cursor-1", random: true });
    const url = new URL(requestedUrl);
    assert.equal(url.origin + url.pathname, "https://tenor.googleapis.com/v2/search");
    assert.equal(url.searchParams.get("q"), "funny cats");
    assert.equal(url.searchParams.get("pos"), "cursor-1");
    assert.equal(url.searchParams.get("random"), "true");
    assert.equal(url.searchParams.get("contentfilter"), "high");
    assert.equal(url.searchParams.get("media_filter"), "gif,tinygif");
    assert.equal(result.next, "cursor-2");
    assert.deepEqual(result.gifs.map((gif) => gif.id), ["gif_123"]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.TENOR_API_KEY;
    else process.env.TENOR_API_KEY = originalKey;
  }
});

test("Tenor fails safely when its server secret is absent", async () => {
  const originalKey = process.env.TENOR_API_KEY;
  delete process.env.TENOR_API_KEY;
  try {
    await assert.rejects(() => searchTenor("cats"), (error: unknown) => {
      assert.equal((error as AppError).code, "TENOR_NOT_CONFIGURED");
      return true;
    });
  } finally {
    if (originalKey !== undefined) process.env.TENOR_API_KEY = originalKey;
  }
});
