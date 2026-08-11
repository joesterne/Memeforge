import assert from "node:assert/strict";
import test from "node:test";
import { BoundedCache } from "../../server/cache";

test("bounded cache evicts LRU entries and never exceeds its maximum", () => {
  const cache = new BoundedCache<number>({ maxEntries: 100, ttlMs: 1_000 });
  for (let index = 0; index < 10_000; index += 1) cache.set(`query-${index}`, index, 0);
  assert.equal(cache.size, 100);
  assert.equal(cache.get("query-0", 1), undefined);
  assert.equal(cache.get("query-9999", 1), 9_999);
});

test("bounded cache reclaims expired entries", () => {
  const cache = new BoundedCache<string>({ maxEntries: 5, ttlMs: 10 });
  cache.set("old", "value", 0);
  cache.set("fresh", "value", 20);
  assert.equal(cache.sweep(21), 1);
  assert.equal(cache.size, 1);
});
