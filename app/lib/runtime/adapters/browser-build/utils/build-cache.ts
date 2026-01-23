/**
 * =============================================================================
 * BAVINI CLOUD - Build Cache Utilities
 * =============================================================================
 * LRU Cache with TTL for module caching in the browser build system.
 * Prevents unbounded memory growth from cached CDN responses.
 *
 * Extracted from browser-build-adapter.ts for better modularity.
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('BuildCache');

/**
 * LRU Cache entry structure
 */
interface CacheEntry<V> {
  value: V;
  cachedAt: number;
  lastAccess: number;
}

/**
 * LRU Cache with TTL for module caching.
 * Prevents unbounded memory growth from cached CDN responses.
 *
 * Features:
 * - Separates cachedAt (for TTL expiration) from lastAccess (for LRU eviction)
 * - Ensures that frequently accessed items still expire after maxAge
 * - Proactive pruning of expired entries
 *
 * @template K - Key type
 * @template V - Value type
 */
export class LRUCache<K, V> {
  private cache = new Map<K, CacheEntry<V>>();
  private readonly maxSize: number;
  private readonly maxAge: number;

  /**
   * Create a new LRU cache
   *
   * @param maxSize - Maximum number of entries (default: 100)
   * @param maxAgeMs - Maximum age in milliseconds (default: 1 hour)
   */
  constructor(maxSize: number = 100, maxAgeMs: number = 3600000) {
    this.maxSize = maxSize;
    this.maxAge = maxAgeMs;
  }

  /**
   * Get a value from the cache
   *
   * @param key - Cache key
   * @returns Cached value or undefined if not found/expired
   */
  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check expiration based on cachedAt, not lastAccess
    // This ensures entries expire even if frequently accessed
    if (Date.now() - entry.cachedAt > this.maxAge) {
      this.cache.delete(key);
      return undefined;
    }

    // Update lastAccess for LRU eviction (separate from TTL)
    entry.lastAccess = Date.now();

    return entry.value;
  }

  /**
   * Set a value in the cache
   *
   * @param key - Cache key
   * @param value - Value to cache
   */
  set(key: K, value: V): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    const now = Date.now();
    this.cache.set(key, { value, cachedAt: now, lastAccess: now });
  }

  /**
   * Check if a key exists and is not expired
   *
   * @param key - Cache key
   * @returns true if key exists and is not expired
   */
  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  /**
   * Delete a key from the cache
   *
   * @param key - Cache key
   * @returns true if key was deleted
   */
  delete(key: K): boolean {
    return this.cache.delete(key);
  }

  /**
   * Evict the oldest (least recently accessed) entry
   */
  private evictOldest(): void {
    let oldest: K | null = null;
    let oldestTime = Infinity;

    // Evict based on lastAccess (LRU) - least recently accessed
    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldest = key;
        oldestTime = entry.lastAccess;
      }
    }

    if (oldest !== null) {
      this.cache.delete(oldest);
    }
  }

  /**
   * Proactively remove all expired entries
   *
   * @returns Number of entries removed
   */
  pruneExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.cachedAt > this.maxAge) {
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug(`Pruned ${removed} expired cache entries`);
    }

    return removed;
  }

  /**
   * Clear all entries from the cache
   */
  clear(): void {
    const size = this.cache.size;
    this.cache.clear();
    logger.debug(`Cleared ${size} cache entries`);
  }

  /**
   * Get the current cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get cache statistics
   */
  getStats(): { size: number; maxSize: number; maxAge: number } {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      maxAge: this.maxAge,
    };
  }
}

/**
 * Default module cache instance
 * - Max 150 modules cached
 * - TTL of 1 hour
 */
export const moduleCache = new LRUCache<string, string>(
  150,      // Max 150 modules cached
  3600000   // 1 hour TTL
);

/**
 * Create a new LRU cache with custom settings
 *
 * @param maxSize - Maximum entries
 * @param maxAgeMs - Maximum age in milliseconds
 */
export function createLRUCache<K, V>(
  maxSize: number = 100,
  maxAgeMs: number = 3600000
): LRUCache<K, V> {
  return new LRUCache<K, V>(maxSize, maxAgeMs);
}
