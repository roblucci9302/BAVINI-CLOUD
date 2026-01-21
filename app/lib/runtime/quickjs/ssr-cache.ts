/**
 * =============================================================================
 * BAVINI Runtime Engine - SSR Cache
 * =============================================================================
 * LRU cache for SSR rendered content with TTL and content hashing.
 * Improves performance by caching rendered HTML for identical inputs.
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SSRCache');

/**
 * Cache entry structure
 */
interface CacheEntry {
  html: string;
  css: string;
  head: string;
  hash: string;
  timestamp: number;
  hits: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  size: number;
  maxSize: number;
  hits: number;
  misses: number;
  hitRate: number;
  oldestEntry: number | null;
  newestEntry: number | null;
}

/**
 * Cache configuration
 */
export interface SSRCacheConfig {
  /** Maximum number of entries */
  maxSize?: number;
  /** TTL in milliseconds (default: 5 minutes) */
  ttlMs?: number;
  /** Enable content-based hashing */
  useContentHash?: boolean;
}

const DEFAULT_CONFIG: Required<SSRCacheConfig> = {
  maxSize: 100,
  ttlMs: 5 * 60 * 1000, // 5 minutes
  useContentHash: true,
};

/**
 * SSR Cache with LRU eviction and TTL
 */
export class SSRCache {
  private _config: Required<SSRCacheConfig>;
  private _cache: Map<string, CacheEntry> = new Map();
  private _hits = 0;
  private _misses = 0;

  constructor(config: SSRCacheConfig = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    logger.debug(`SSRCache initialized (maxSize: ${this._config.maxSize}, ttl: ${this._config.ttlMs}ms)`);
  }

  /**
   * Generate a cache key from component path and props
   */
  generateKey(
    componentPath: string,
    props: Record<string, unknown> = {},
    code?: string,
  ): string {
    const propsStr = JSON.stringify(props, Object.keys(props).sort());

    if (this._config.useContentHash && code) {
      const codeHash = this._simpleHash(code);
      return `${componentPath}:${codeHash}:${this._simpleHash(propsStr)}`;
    }

    return `${componentPath}:${this._simpleHash(propsStr)}`;
  }

  /**
   * Get cached entry if valid
   */
  get(key: string): { html: string; css: string; head: string } | null {
    const entry = this._cache.get(key);

    if (!entry) {
      this._misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this._config.ttlMs) {
      this._cache.delete(key);
      this._misses++;
      logger.debug(`Cache miss (expired): ${key}`);
      return null;
    }

    // Update hit count and move to end (LRU)
    entry.hits++;
    this._cache.delete(key);
    this._cache.set(key, entry);

    this._hits++;
    logger.debug(`Cache hit: ${key} (hits: ${entry.hits})`);

    return {
      html: entry.html,
      css: entry.css,
      head: entry.head,
    };
  }

  /**
   * Store rendered content in cache
   */
  set(
    key: string,
    content: { html: string; css: string; head: string },
    contentHash?: string,
  ): void {
    // Evict oldest entries if at capacity
    while (this._cache.size >= this._config.maxSize) {
      const oldestKey = this._cache.keys().next().value;
      if (oldestKey) {
        this._cache.delete(oldestKey);
        logger.debug(`Evicted oldest entry: ${oldestKey}`);
      }
    }

    const entry: CacheEntry = {
      html: content.html,
      css: content.css,
      head: content.head,
      hash: contentHash || this._simpleHash(content.html),
      timestamp: Date.now(),
      hits: 0,
    };

    this._cache.set(key, entry);
    logger.debug(`Cached: ${key} (size: ${this._cache.size})`);
  }

  /**
   * Check if key exists and is valid
   */
  has(key: string): boolean {
    const entry = this._cache.get(key);
    if (!entry) return false;

    // Check TTL
    if (Date.now() - entry.timestamp > this._config.ttlMs) {
      this._cache.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Invalidate a specific entry
   */
  invalidate(key: string): boolean {
    const deleted = this._cache.delete(key);
    if (deleted) {
      logger.debug(`Invalidated: ${key}`);
    }
    return deleted;
  }

  /**
   * Invalidate all entries matching a pattern
   */
  invalidatePattern(pattern: string | RegExp): number {
    const regex = typeof pattern === 'string' ? new RegExp(pattern) : pattern;
    let count = 0;

    for (const key of this._cache.keys()) {
      if (regex.test(key)) {
        this._cache.delete(key);
        count++;
      }
    }

    if (count > 0) {
      logger.debug(`Invalidated ${count} entries matching pattern`);
    }

    return count;
  }

  /**
   * Invalidate all entries for a component
   */
  invalidateComponent(componentPath: string): number {
    return this.invalidatePattern(`^${componentPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}:`);
  }

  /**
   * Clear all entries
   */
  clear(): void {
    const size = this._cache.size;
    this._cache.clear();
    this._hits = 0;
    this._misses = 0;
    logger.info(`Cache cleared (${size} entries removed)`);
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const total = this._hits + this._misses;
    let oldest: number | null = null;
    let newest: number | null = null;

    for (const entry of this._cache.values()) {
      if (oldest === null || entry.timestamp < oldest) {
        oldest = entry.timestamp;
      }
      if (newest === null || entry.timestamp > newest) {
        newest = entry.timestamp;
      }
    }

    return {
      size: this._cache.size,
      maxSize: this._config.maxSize,
      hits: this._hits,
      misses: this._misses,
      hitRate: total > 0 ? this._hits / total : 0,
      oldestEntry: oldest,
      newestEntry: newest,
    };
  }

  /**
   * Prune expired entries
   */
  prune(): number {
    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this._cache.entries()) {
      if (now - entry.timestamp > this._config.ttlMs) {
        this._cache.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      logger.debug(`Pruned ${pruned} expired entries`);
    }

    return pruned;
  }

  /**
   * Simple hash function for strings
   */
  private _simpleHash(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Get current size
   */
  get size(): number {
    return this._cache.size;
  }
}

/**
 * Factory function
 */
export function createSSRCache(config?: SSRCacheConfig): SSRCache {
  return new SSRCache(config);
}

/**
 * Singleton instance
 */
let _sharedCache: SSRCache | null = null;

export function getSharedSSRCache(): SSRCache {
  if (!_sharedCache) {
    _sharedCache = createSSRCache();
  }
  return _sharedCache;
}

export function resetSharedSSRCache(): void {
  if (_sharedCache) {
    _sharedCache.clear();
    _sharedCache = null;
  }
}
