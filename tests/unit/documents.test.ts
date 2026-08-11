import assert from "node:assert/strict";
import test from "node:test";
import { buildMemeDocument, resolveBackground } from "../../src/lib/memeDocuments";

test("an uploaded or generated background always wins over the source template", () => {
  assert.deepEqual(
    resolveBackground("https://storage.example/new.png", "users/u/backgrounds/new.png", "https://old.example/template.png", "users/u/templates/old.png"),
    { url: "https://storage.example/new.png", path: "users/u/backgrounds/new.png" },
  );
});

test("blank meme DTO omits nullable fields rejected by rules", () => {
  assert.deepEqual(buildMemeDocument({
    authorId: "user-1",
    createdAt: "2026-07-31T00:00:00.000Z",
    objects: [],
  }), {
    authorId: "user-1",
    createdAt: "2026-07-31T00:00:00.000Z",
    objects: [],
  });
});
