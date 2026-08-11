import assert from "node:assert/strict";
import test from "node:test";
import { configuredOrigins, isAllowedOrigin } from "../../server/origins";

test("production origin policy fails closed outside configured web/native origins", () => {
  const origins = configuredOrigins({
    NODE_ENV: "production",
    APP_URL: "https://memeforge.example/",
    ALLOWED_ORIGINS: "https://admin.example",
    NATIVE_APP_ORIGINS: "custom://localhost",
  }, "production");
  assert.equal(isAllowedOrigin("https://memeforge.example", origins), true);
  assert.equal(isAllowedOrigin("capacitor://localhost", origins), true);
  assert.equal(isAllowedOrigin("https://attacker.example", origins), false);
  assert.equal(isAllowedOrigin(undefined, origins), true);
});
