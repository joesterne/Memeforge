import assert from "node:assert/strict";
import test from "node:test";
import { hashIdentifier, redactLogValue } from "../../server/telemetry";

test("telemetry redacts credentials, emails, and image data", () => {
  const redacted = redactLogValue("Bearer secret.token user@example.com data:image/png;base64,AAAA?key=secret");
  assert.equal(redacted.includes("secret.token"), false);
  assert.equal(redacted.includes("user@example.com"), false);
  assert.equal(redacted.includes("base64,AAAA"), false);
  assert.equal(hashIdentifier("user-1").length, 16);
  assert.equal(hashIdentifier("user-1"), hashIdentifier("user-1"));
});
