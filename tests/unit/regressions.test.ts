import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../../", import.meta.url);
const read = (path: string) => readFile(new URL(path, root), "utf8");

test("recent provider and paid-route regressions cannot silently return", async () => {
  const [packageJson, serverApp, tenor, billing] = await Promise.all([
    read("package.json"),
    read("server/app.ts"),
    read("server/tenor.ts"),
    read("server/billing.ts"),
  ]);
  const productionSources = `${packageJson}\n${serverApp}\n${tenor}`;
  assert.doesNotMatch(productionSources, /googlethis|g\.tenor\.com\/v1|LIVDSRZULELA|search-google-gifs/);
  assert.doesNotMatch(serverApp, /api\/test-gemini/);
  assert.match(serverApp, /requireUser/);
  assert.match(serverApp, /requirePro/);
  assert.match(billing, /mode: "subscription"/);
  assert.match(billing, /constructEvent/);
});

test("CI, rules, storage, and native routing stay wired", async () => {
  const [workflow, app, capacitor, packageJson, rules, collaboration] = await Promise.all([
    read(".github/workflows/ci.yml"),
    read("src/App.tsx"),
    read("capacitor.config.ts"),
    read("package.json"),
    read("firestore.rules"),
    read("server/collaboration.ts"),
  ]);
  assert.match(workflow, /npm ci/);
  assert.match(workflow, /npm run check/);
  assert.match(app, /HashRouter/);
  assert.match(capacitor, /com\.memeforge\.app/);
  assert.match(packageJson, /build:ios/);
  assert.doesNotMatch(rules, /upvoters|downvoters/);
  assert.doesNotMatch(packageJson, /socket\.io|express-rate-limit/);
  assert.match(collaboration, /WebSocketServer/);
  assert.match(collaboration, /maxPayload: MAX_PAYLOAD_BYTES/);
});
