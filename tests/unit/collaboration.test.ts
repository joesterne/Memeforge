import assert from "node:assert/strict";
import test from "node:test";
import { validateCanvasUpdate } from "../../server/collaboration";

test("collaboration rejects invalid IDs, data URLs, and oversized text", () => {
  const base = { roomId: "room-1", requestId: "request-1", baseRevision: 0 };
  assert.equal(validateCanvasUpdate({ ...base, objects: [] }), true);
  assert.equal(validateCanvasUpdate({ ...base, roomId: "__proto__[x]", objects: [] }), false);
  assert.equal(validateCanvasUpdate({
    ...base,
    objects: [{ id: "image-1", type: "image", url: "data:image/png;base64,AAAA", x: 0, y: 0, draggable: true }],
  }), false);
  assert.equal(validateCanvasUpdate({
    ...base,
    objects: [{ id: "text-1", type: "text", text: "x".repeat(2_001), x: 0, y: 0, fontSize: 20, fontFamily: "Impact", fill: "#fff", draggable: true }],
  }), false);
});
