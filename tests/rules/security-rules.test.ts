import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { after, before, beforeEach, test } from "node:test";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { getBytes, ref, uploadBytes } from "firebase/storage";

let environment: RulesTestEnvironment;
const validMeme = {
  authorId: "alice",
  createdAt: "2026-07-31T00:00:00.000Z",
  objects: [],
  templateUrl: "https://storage.example/background.png",
  templatePath: "users/alice/backgrounds/background.png",
};

before(async () => {
  const [firestoreRules, storageRules] = await Promise.all([
    readFile(new URL("../../firestore.rules", import.meta.url), "utf8"),
    readFile(new URL("../../storage.rules", import.meta.url), "utf8"),
  ]);
  environment = await initializeTestEnvironment({
    projectId: "demo-memeforge",
    firestore: { host: "127.0.0.1", port: 8080, rules: firestoreRules },
    storage: { host: "127.0.0.1", port: 9199, rules: storageRules },
  });
});

beforeEach(async () => {
  await environment.clearFirestore();
  await environment.clearStorage();
});

after(async () => environment.cleanup());

test("verified authors can create/update their meme but other users cannot", async () => {
  const alice = environment.authenticatedContext("alice", { email: "alice@example.test", email_verified: true }).firestore();
  const bob = environment.authenticatedContext("bob", { email: "bob@example.test", email_verified: true }).firestore();
  const reference = doc(alice, "memes/meme-1");
  await assertSucceeds(setDoc(reference, validMeme));
  await assertSucceeds(updateDoc(reference, { templateUrl: "https://storage.example/changed.png" }));
  await assertFails(updateDoc(doc(bob, "memes/meme-1"), { objects: [] }));
  await assertFails(getDoc(doc(bob, "memes/meme-1")));
  assert.equal((await assertSucceeds(getDoc(reference))).data()?.templateUrl, "https://storage.example/changed.png");
});

test("document DTO fields match template/submission rules", async () => {
  const alice = environment.authenticatedContext("alice", { email_verified: true }).firestore();
  await assertSucceeds(setDoc(doc(alice, "templates/template-1"), {
    userId: "alice",
    userName: "Alice",
    name: "Template",
    url: "https://storage.example/template.png",
    storagePath: "users/alice/templates/template.png",
    width: 800,
    height: 600,
    box_count: 2,
    createdAt: "2026-07-31T00:00:00.000Z",
  }));
  await assertSucceeds(setDoc(doc(alice, "submissions/submission-1"), {
    userId: "alice",
    userName: "Alice",
    memeUrl: "https://storage.example/submission.jpg",
    storagePath: "users/alice/submissions/submission.jpg",
    createdAt: "2026-07-31T00:00:00.000Z",
  }));
  await assertFails(setDoc(doc(alice, "submissions/submission-2"), {
    userId: "alice",
    imageUrl: "data:image/png;base64,AAAA",
    createdAt: "2026-07-31T00:00:00.000Z",
  }));
});

test("clients cannot forge vote aggregates and can only read their own vote", async () => {
  await environment.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "templateVotes/template-1"), { upvotes: 1, downvotes: 0 });
    await setDoc(doc(context.firestore(), "templateVotes/template-1/users/alice"), { value: "up" });
  });
  const alice = environment.authenticatedContext("alice", { email_verified: true }).firestore();
  const bob = environment.authenticatedContext("bob", { email_verified: true }).firestore();
  await assertSucceeds(getDoc(doc(alice, "templateVotes/template-1")));
  await assertSucceeds(getDoc(doc(alice, "templateVotes/template-1/users/alice")));
  await assertFails(getDoc(doc(bob, "templateVotes/template-1/users/alice")));
  await assertFails(updateDoc(doc(alice, "templateVotes/template-1"), { upvotes: 999 }));
});

test("Storage enforces ownership, public categories, MIME type, and path policy", async () => {
  const alice = environment.authenticatedContext("alice", { email_verified: true }).storage();
  const bob = environment.authenticatedContext("bob", { email_verified: true }).storage();
  const publicTemplate = ref(alice, "users/alice/templates/template.png");
  const privateBackground = ref(alice, "users/alice/backgrounds/background.png");
  await assertSucceeds(uploadBytes(publicTemplate, new Uint8Array([1, 2, 3]), { contentType: "image/png" }));
  await assertSucceeds(uploadBytes(privateBackground, new Uint8Array([1, 2, 3]), { contentType: "image/png" }));
  await assertSucceeds(getBytes(ref(bob, "users/alice/templates/template.png")));
  await assertFails(getBytes(ref(bob, "users/alice/backgrounds/background.png")));
  await assertFails(uploadBytes(ref(alice, "users/alice/templates/bad.txt"), new Uint8Array([1]), { contentType: "text/plain" }));
  await assertFails(uploadBytes(ref(bob, "users/alice/templates/stolen.png"), new Uint8Array([1]), { contentType: "image/png" }));
});
