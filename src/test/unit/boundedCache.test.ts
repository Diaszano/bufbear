import assert from "node:assert/strict";
import { BoundedCache } from "../../platform/boundedCache.js";

describe("BoundedCache", () => {
  it("evicts the least recently used entry", () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    assert.equal(cache.get("a"), 1);
    cache.set("c", 3);
    assert.equal(cache.get("b"), undefined);
    assert.equal(cache.get("a"), 1);
    assert.equal(cache.get("c"), 3);
  });

  it("rejects non-positive capacity", () => {
    assert.throws(() => new BoundedCache(0), /positive/);
  });

  it("updates existing key and refreshes access order", () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    cache.set("a", 10);
    cache.set("c", 3);
    assert.equal(cache.get("a"), 10);
    assert.equal(cache.get("b"), undefined);
    assert.equal(cache.get("c"), 3);
  });

  it("handles delete, clear, and size", () => {
    const cache = new BoundedCache<string, number>(2);
    cache.set("a", 1);
    cache.set("b", 2);
    assert.equal(cache.size, 2);
    assert.equal(cache.delete("a"), true);
    assert.equal(cache.size, 1);
    assert.equal(cache.get("a"), undefined);
    cache.clear();
    assert.equal(cache.size, 0);
  });
});
