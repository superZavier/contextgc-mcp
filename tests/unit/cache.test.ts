import { describe, it, expect } from "vitest";
import { CacheManager } from "../../src/memory/cache.js";
import type { CompressionStats } from "../../src/parsers/interface.js";

const MOCK_STATS: CompressionStats = {
  originalLines: 100,
  skeletonLines: 20,
  compressionRatio: 0.2,
  functionsOmitted: 8,
  functionsPreserved: 2,
  parserUsed: "babel",
};

describe("CacheManager", () => {
  it("should store and retrieve entries", () => {
    const cache = new CacheManager({ maxEntries: 10, maxTotalBytes: 1024 * 1024, ttlMs: 60000 });
    cache.set("key1", "skeleton-content", MOCK_STATS);
    const entry = cache.get("key1");
    expect(entry).toBeDefined();
    expect(entry!.value).toBe("skeleton-content");
  });

  it("should return undefined for missing keys", () => {
    const cache = new CacheManager({ maxEntries: 10, maxTotalBytes: 1024 * 1024, ttlMs: 60000 });
    expect(cache.get("nonexistent")).toBeUndefined();
  });

  it("should evict LRU entries when maxEntries exceeded", () => {
    const cache = new CacheManager({ maxEntries: 3, maxTotalBytes: 1024 * 1024, ttlMs: 60000 });
    cache.set("key1", "a", MOCK_STATS);
    cache.set("key2", "b", MOCK_STATS);
    cache.set("key3", "c", MOCK_STATS);
    cache.set("key4", "d", MOCK_STATS); // Should evict key1
    expect(cache.get("key1")).toBeUndefined();
    expect(cache.get("key4")).toBeDefined();
  });

  it("should support GC with 'all' strategy", () => {
    const cache = new CacheManager({ maxEntries: 100, maxTotalBytes: 1024 * 1024, ttlMs: 60000 });
    cache.set("key1", "a", MOCK_STATS);
    cache.set("key2", "b", MOCK_STATS);
    const evicted = cache.gc("all");
    expect(evicted).toBe(2);
    expect(cache.size).toBe(0);
  });

  it("should expire entries by TTL", () => {
    const cache = new CacheManager({ maxEntries: 10, maxTotalBytes: 1024 * 1024, ttlMs: 1 }); // 1ms TTL
    cache.set("key1", "a", MOCK_STATS);
    // Wait for TTL to expire
    return new Promise<void>((resolve) => {
      setTimeout(() => {
        expect(cache.get("key1")).toBeUndefined();
        resolve();
      }, 10);
    });
  });

  it("should generate cache keys with mtime", () => {
    const cache = new CacheManager({ maxEntries: 10, maxTotalBytes: 1024 * 1024, ttlMs: 60000 });
    const key = cache.makeKey("package.json");
    expect(key).toContain("skeleton:");
    expect(key).toContain("package.json");
  });
});
