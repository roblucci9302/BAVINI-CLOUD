/**
 * TTLMap - A Map with automatic Time-To-Live expiration
 *
 * Features:
 * - Automatic expiration of entries after TTL
 * - Optional max size with LRU eviction
 * - Background cleanup interval
 * - Touch functionality to extend TTL on access
 * - Statistics and monitoring
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TTLMap');

export interface TTLMapOptions {
  /** Time-to-live in milliseconds (default: 30 minutes) */
  ttlMs?: number;
  /** Maximum number of entries (0 = unlimited) */
  maxSize?: number;
  /** Cleanup interval in milliseconds (default: 1 minute) */
  cleanupIntervalMs?: number;
  /** Whether to extend TTL when an entry is accessed (default: false) */
  touchOnGet?: boolean;
  /** Name for logging purposes */
  name?: string;
  /** Callback when an entry expires */
  onExpire?: (key: string, value: unknown) => void;
}

interface TTLEntry<V> {
  value: V;
  expiresAt: number;
  createdAt: number;
  lastAccessedAt: number;
  accessCount: number;
}

export interface TTLMapStats {
  size: number;
  maxSize: number;
  ttlMs: number;
  expiredCount: number;
  evictedCount: number;
  hitCount: number;
  missCount: number;
  oldestEntryAge: number | null;
}

export class TTLMap<K extends string, V> {
  private map: Map<K, TTLEntry<V>> = new Map();
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private readonly options: Required<Omit<TTLMapOptions, 'onExpire'>> & { onExpire?: TTLMapOptions['onExpire'] };

  // Stats
  private expiredCount = 0;
  private evictedCount = 0;
  private hitCount = 0;
  private missCount = 0;

  constructor(options: TTLMapOptions = {}) {
    this.options = {
      ttlMs: options.ttlMs ?? 30 * 60 * 1000, // 30 minutes default
      maxSize: options.maxSize ?? 0, // Unlimited by default
      cleanupIntervalMs: options.cleanupIntervalMs ?? 60 * 1000, // 1 minute default
      touchOnGet: options.touchOnGet ?? false,
      name: options.name ?? 'TTLMap',
      onExpire: options.onExpire,
    };

    this.startCleanupInterval();
    logger.debug(`${this.options.name} initialized with TTL=${this.options.ttlMs}ms, maxSize=${this.options.maxSize}`);
  }

  /**
   * Set a value with automatic TTL
   */
  set(key: K, value: V, customTtlMs?: number): this {
    const now = Date.now();
    const ttl = customTtlMs ?? this.options.ttlMs;

    // Evict if at max capacity
    if (this.options.maxSize > 0 && this.map.size >= this.options.maxSize && !this.map.has(key)) {
      this.evictOldest();
    }

    this.map.set(key, {
      value,
      expiresAt: now + ttl,
      createdAt: now,
      lastAccessedAt: now,
      accessCount: 0,
    });

    return this;
  }

  /**
   * Get a value, optionally extending its TTL
   */
  get(key: K): V | undefined {
    const entry = this.map.get(key);

    if (!entry) {
      this.missCount++;
      return undefined;
    }

    const now = Date.now();

    // Check if expired
    if (entry.expiresAt < now) {
      this.delete(key, true);
      this.missCount++;
      return undefined;
    }

    this.hitCount++;
    entry.accessCount++;
    entry.lastAccessedAt = now;

    // Touch: extend TTL on access
    if (this.options.touchOnGet) {
      entry.expiresAt = now + this.options.ttlMs;
    }

    return entry.value;
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: K): boolean {
    const entry = this.map.get(key);

    if (!entry) {
      return false;
    }

    if (entry.expiresAt < Date.now()) {
      this.delete(key, true);
      return false;
    }

    return true;
  }

  /**
   * Delete an entry
   */
  delete(key: K, isExpired = false): boolean {
    const entry = this.map.get(key);

    if (entry) {
      if (isExpired) {
        this.expiredCount++;
        this.options.onExpire?.(key, entry.value);
      }

      return this.map.delete(key);
    }

    return false;
  }

  /**
   * Get entry metadata without affecting TTL
   */
  getMetadata(key: K): Omit<TTLEntry<V>, 'value'> | undefined {
    const entry = this.map.get(key);

    if (!entry || entry.expiresAt < Date.now()) {
      return undefined;
    }

    return {
      expiresAt: entry.expiresAt,
      createdAt: entry.createdAt,
      lastAccessedAt: entry.lastAccessedAt,
      accessCount: entry.accessCount,
    };
  }

  /**
   * Manually extend TTL for an entry
   */
  touch(key: K, additionalTtlMs?: number): boolean {
    const entry = this.map.get(key);

    if (!entry || entry.expiresAt < Date.now()) {
      return false;
    }

    entry.expiresAt = Date.now() + (additionalTtlMs ?? this.options.ttlMs);
    entry.lastAccessedAt = Date.now();

    return true;
  }

  /**
   * Get remaining TTL for an entry
   */
  getTTL(key: K): number | null {
    const entry = this.map.get(key);

    if (!entry) {
      return null;
    }

    const remaining = entry.expiresAt - Date.now();

    return remaining > 0 ? remaining : null;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.map.clear();
    logger.debug(`${this.options.name} cleared`);
  }

  /**
   * Get current size
   */
  get size(): number {
    return this.map.size;
  }

  /**
   * Iterate over valid (non-expired) entries
   */
  *entries(): IterableIterator<[K, V]> {
    const now = Date.now();

    for (const [key, entry] of this.map) {
      if (entry.expiresAt >= now) {
        yield [key, entry.value];
      }
    }
  }

  /**
   * Default iterator - same as entries()
   */
  [Symbol.iterator](): IterableIterator<[K, V]> {
    return this.entries();
  }

  /**
   * Iterate over valid keys
   */
  *keys(): IterableIterator<K> {
    const now = Date.now();

    for (const [key, entry] of this.map) {
      if (entry.expiresAt >= now) {
        yield key;
      }
    }
  }

  /**
   * Iterate over valid values
   */
  *values(): IterableIterator<V> {
    const now = Date.now();

    for (const entry of this.map.values()) {
      if (entry.expiresAt >= now) {
        yield entry.value;
      }
    }
  }

  /**
   * Run cleanup of expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.map) {
      if (entry.expiresAt < now) {
        this.delete(key, true);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug(`${this.options.name} cleanup: removed ${cleanedCount} expired entries, ${this.map.size} remaining`);
    }

    return cleanedCount;
  }

  /**
   * Get statistics
   */
  getStats(): TTLMapStats {
    let oldestAge: number | null = null;
    const now = Date.now();

    for (const entry of this.map.values()) {
      if (entry.expiresAt >= now) {
        const age = now - entry.createdAt;

        if (oldestAge === null || age > oldestAge) {
          oldestAge = age;
        }
      }
    }

    return {
      size: this.map.size,
      maxSize: this.options.maxSize,
      ttlMs: this.options.ttlMs,
      expiredCount: this.expiredCount,
      evictedCount: this.evictedCount,
      hitCount: this.hitCount,
      missCount: this.missCount,
      oldestEntryAge: oldestAge,
    };
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.expiredCount = 0;
    this.evictedCount = 0;
    this.hitCount = 0;
    this.missCount = 0;
  }

  /**
   * Stop the cleanup interval and dispose resources
   */
  dispose(): void {
    this.stopCleanupInterval();
    this.clear();
    logger.debug(`${this.options.name} disposed`);
  }

  /**
   * Evict the oldest entry (LRU)
   */
  private evictOldest(): void {
    let oldestKey: K | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.map) {
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.map.delete(oldestKey);
      this.evictedCount++;
      logger.debug(`${this.options.name} evicted oldest entry: ${oldestKey}`);
    }
  }

  /**
   * Start the automatic cleanup interval
   */
  private startCleanupInterval(): void {
    if (this.cleanupTimer) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, this.options.cleanupIntervalMs);

    // Prevent the timer from keeping Node.js alive
    if (this.cleanupTimer.unref) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Stop the cleanup interval
   */
  private stopCleanupInterval(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}

/**
 * Create a TTLMap with common presets
 */
export const TTLMapPresets = {
  /** Short-lived cache (5 minutes TTL, 100 entries max) */
  shortCache: <K extends string, V>(name: string): TTLMap<K, V> =>
    new TTLMap<K, V>({
      ttlMs: 5 * 60 * 1000,
      maxSize: 100,
      cleanupIntervalMs: 60 * 1000,
      name,
    }),

  /** Session store (30 minutes TTL, touch on get) */
  sessionStore: <K extends string, V>(name: string): TTLMap<K, V> =>
    new TTLMap<K, V>({
      ttlMs: 30 * 60 * 1000,
      maxSize: 1000,
      cleanupIntervalMs: 60 * 1000,
      touchOnGet: true,
      name,
    }),

  /** Long-lived store (24 hours TTL) */
  longStore: <K extends string, V>(name: string): TTLMap<K, V> =>
    new TTLMap<K, V>({
      ttlMs: 24 * 60 * 60 * 1000,
      maxSize: 500,
      cleanupIntervalMs: 5 * 60 * 1000,
      name,
    }),

  /** Task results (1 hour TTL, auto-cleanup) */
  taskResults: <K extends string, V>(name: string): TTLMap<K, V> =>
    new TTLMap<K, V>({
      ttlMs: 60 * 60 * 1000,
      maxSize: 10000,
      cleanupIntervalMs: 5 * 60 * 1000,
      name,
    }),
};
