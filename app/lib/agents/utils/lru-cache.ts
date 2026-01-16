/**
 * LRU (Least Recently Used) Cache Implementation
 *
 * Provides a bounded cache with automatic eviction of least recently used items.
 * Features:
 * - Maximum size limit with LRU eviction
 * - Optional TTL (Time To Live) for entries
 * - Cache statistics for monitoring
 *
 * @module agents/utils/lru-cache
 */

/**
 * Cache entry with metadata
 */
interface CacheEntry<T> {
  value: T;
  timestamp: number;
  accessCount: number;
}

/**
 * Cache statistics
 */
export interface LRUCacheStats {
  hits: number;
  misses: number;
  evictions: number;
  size: number;
  maxSize: number;
}

/**
 * LRU Cache configuration
 */
export interface LRUCacheConfig {
  /** Maximum number of entries */
  maxSize: number;

  /** Time to live in milliseconds (0 = no expiration) */
  ttl?: number;

  /** Callback when entry is evicted */
  onEvict?: (key: string, value: unknown) => void;
}

/**
 * LRU Cache implementation using Map for O(1) operations
 */
export class LRUCache<T> {
  private cache: Map<string, CacheEntry<T>> = new Map();
  private config: Required<LRUCacheConfig>;

  private stats = {
    hits: 0,
    misses: 0,
    evictions: 0,
  };

  constructor(config: LRUCacheConfig) {
    this.config = {
      maxSize: config.maxSize,
      ttl: config.ttl ?? 0,
      onEvict: config.onEvict ?? (() => {}),
    };
  }

  /**
   * Get a value from the cache
   * Updates access order (makes it most recently used)
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return undefined;
    }

    // Check TTL
    if (this.config.ttl > 0 && Date.now() - entry.timestamp > this.config.ttl) {
      this.delete(key);
      this.stats.misses++;
      return undefined;
    }

    // Update access (move to end = most recently used)
    this.cache.delete(key);
    entry.accessCount++;
    this.cache.set(key, entry);

    this.stats.hits++;
    return entry.value;
  }

  /**
   * Set a value in the cache
   * Evicts LRU entry if cache is full
   */
  set(key: string, value: T): void {
    // If key exists, update it
    if (this.cache.has(key)) {
      this.cache.delete(key);
    } else if (this.cache.size >= this.config.maxSize) {
      // Evict LRU (first entry in Map)
      this.evictLRU();
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      accessCount: 1,
    });
  }

  /**
   * Check if key exists (without updating access order)
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    // Check TTL
    if (this.config.ttl > 0 && Date.now() - entry.timestamp > this.config.ttl) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from the cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);

    if (entry) {
      this.config.onEvict(key, entry.value);
    }

    return this.cache.delete(key);
  }

  /**
   * Clear the entire cache
   */
  clear(): void {
    for (const [key, entry] of this.cache) {
      this.config.onEvict(key, entry.value);
    }

    this.cache.clear();
  }

  /**
   * Get cache size
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Get cache statistics
   */
  getStats(): LRUCacheStats {
    return {
      ...this.stats,
      size: this.cache.size,
      maxSize: this.config.maxSize,
    };
  }

  /**
   * Get cache hit rate (0-100)
   */
  getHitRate(): number {
    const total = this.stats.hits + this.stats.misses;

    if (total === 0) {
      return 0;
    }

    return (this.stats.hits / total) * 100;
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats.hits = 0;
    this.stats.misses = 0;
    this.stats.evictions = 0;
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    // First entry in Map is the LRU
    const firstKey = this.cache.keys().next().value;

    if (firstKey !== undefined) {
      const entry = this.cache.get(firstKey);

      if (entry) {
        this.config.onEvict(firstKey, entry.value);
      }

      this.cache.delete(firstKey);
      this.stats.evictions++;
    }
  }

  /**
   * Cleanup expired entries (call periodically if using TTL)
   */
  cleanup(): number {
    if (this.config.ttl === 0) {
      return 0;
    }

    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.config.ttl) {
        this.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }
}

/**
 * Create an LRU cache for file contents
 * Pre-configured for typical file caching use case
 */
export function createFileCache(maxSize = 100, ttlMs = 30000): LRUCache<string> {
  return new LRUCache<string>({
    maxSize,
    ttl: ttlMs,
  });
}
