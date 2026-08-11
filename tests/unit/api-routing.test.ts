import assert from "node:assert/strict";
import test from "node:test";
import { resolveApiUrl, resolveCollaborationUrl } from "../../src/lib/apiRouting";

test("native API and collaboration routing uses the configured deployed backend", () => {
  assert.equal(resolveApiUrl("/api/health", undefined), "/api/health");
  assert.equal(resolveApiUrl("/api/health", "https://api.example.com/base"), "https://api.example.com/api/health");
  assert.equal(resolveCollaborationUrl("https://api.example.com", "capacitor://localhost"), "wss://api.example.com/api/collaboration");
  assert.equal(resolveCollaborationUrl(undefined, "https://web.example"), "wss://web.example/api/collaboration");
  assert.throws(() => resolveApiUrl("api/health", undefined), /must start with a slash/);
});
