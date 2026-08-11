export interface CacheOptions {
  maxEntries: number;
  ttlMs: number;
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

/** A tiny in-process LRU/TTL cache with deterministic bounds. */
export class BoundedCache<T> {
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(private readonly options: CacheOptions) {
    if (options.maxEntries < 1 || options.ttlMs < 1) {
      throw new Error("Cache maxEntries and ttlMs must be positive");
    }
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string, now = Date.now()): T | undefined {
    const entry = this.entries.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt <= now) {
      this.entries.delete(key);
      return undefined;
    }

    // Reinsert to make this key the most recently used entry.
    this.entries.delete(key);
    this.entries.set(key, entry);
    return entry.value;
  }

  set(key: string, value: T, now = Date.now()): void {
    this.entries.delete(key);
    while (this.entries.size >= this.options.maxEntries) {
      const oldestKey = this.entries.keys().next().value;
      if (typeof oldestKey !== "string") break;
      this.entries.delete(oldestKey);
    }
    this.entries.set(key, { value, expiresAt: now + this.options.ttlMs });
  }

  sweep(now = Date.now()): number {
    let deleted = 0;
    for (const [key, entry] of this.entries) {
      if (entry.expiresAt <= now) {
        this.entries.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  clear(): void {
    this.entries.clear();
  }
}
