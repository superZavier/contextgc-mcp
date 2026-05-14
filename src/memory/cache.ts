// ContextGC — LRU + TTL 缓存管理

import path from "node:path";
import fs from "node:fs";
import type { CompressionStats } from "../parsers/interface.js";

export interface CacheEntry {
  key: string;
  value: string;
  stats: CompressionStats;
  createdAt: number;
  lastAccessedAt: number;
  sizeBytes: number;
}

export interface CacheConfig {
  maxEntries: number;
  maxTotalBytes: number;
  ttlMs: number;
}

export class CacheManager {
  private cache: Map<string, CacheEntry> = new Map();
  private totalBytes: number = 0;

  constructor(private config: CacheConfig) {}

  get size(): number {
    return this.cache.size;
  }

  get(key: string): CacheEntry | undefined {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.createdAt > this.config.ttlMs) {
      this.evict(key);
      return undefined;
    }
    entry.lastAccessedAt = Date.now();
    // LRU: 删除后重新插入（Map 保持插入顺序）
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry;
  }

  set(key: string, value: string, stats: CompressionStats): void {
    if (this.cache.has(key)) this.evict(key);

    const entry: CacheEntry = {
      key,
      value,
      stats,
      createdAt: Date.now(),
      lastAccessedAt: Date.now(),
      sizeBytes: Buffer.byteLength(value, "utf-8"),
    };

    // 淘汰直到有足够空间
    while (
      (this.cache.size >= this.config.maxEntries ||
        this.totalBytes + entry.sizeBytes > this.config.maxTotalBytes) &&
      this.cache.size > 0
    ) {
      this.evictOldest();
    }

    this.cache.set(key, entry);
    this.totalBytes += entry.sizeBytes;
  }

  makeKey(filePath: string, focusFunction?: string): string {
    const absPath = path.resolve(filePath);
    const mtime = this.getFileMtime(absPath);
    return `skeleton:${absPath}:${focusFunction ?? "*"}:${mtime}`;
  }

  gc(strategy: "lru" | "all" | "older-than", ttlMinutes?: number): number {
    let evicted = 0;
    if (strategy === "all") {
      evicted = this.cache.size;
      this.cache.clear();
      this.totalBytes = 0;
    } else if (strategy === "older-than" || strategy === "lru") {
      const cutoff = Date.now() - (ttlMinutes ?? 30) * 60 * 1000;
      for (const [key, entry] of this.cache) {
        if (entry.lastAccessedAt < cutoff) {
          this.evict(key);
          evicted++;
        }
      }
    }
    return evicted;
  }

  private evict(key: string): void {
    const entry = this.cache.get(key);
    if (entry) {
      this.totalBytes -= entry.sizeBytes;
      this.cache.delete(key);
    }
  }

  private evictOldest(): void {
    const firstKey = this.cache.keys().next().value;
    if (firstKey) this.evict(firstKey);
  }

  private getFileMtime(filePath: string): number {
    try {
      const stat = fs.statSync(filePath);
      return stat.mtimeMs;
    } catch {
      return 0;
    }
  }
}
