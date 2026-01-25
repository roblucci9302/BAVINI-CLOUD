/**
 * =============================================================================
 * BAVINI CLOUD - Bundle Cache
 * =============================================================================
 * LRU cache for compiled bundles and intermediate build artifacts.
 * Enables reuse of unchanged code between builds.
 *
 * @module lib/runtime/adapters/browser-build/incremental/bundle-cache
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';
import { hashContent } from './dependency-graph';

const logger = createScopedLogger('BundleCache');

/**
 * Cached bundle entry.
 */
export interface CachedBundle {
  /** Original source file path */
  sourcePath: string;
  /** Hash of the source content */
  sourceHash: string;
  /** Compiled JavaScript code */
  code: string;
  /** Source map (if available) */
  sourceMap?: string;
  /** CSS extracted from this file */
  css?: string;
  /** NPM dependencies used by this file */
  npmDependencies: string[];
  /** Local file imports */
  imports: string[];
  /** Timestamp when cached */
  cachedAt: number;
  /** Last access time (for LRU) */
  lastAccess: number;
  /** Size in bytes (for memory management) */
  size: number;
}

/**
 * Cached CSS bundle.
 */
export interface CachedCSS {
  /** Source file or identifier */
  source: string;
  /** Hash of source */
  sourceHash: string;
  /** Compiled CSS */
  css: string;
  /** Cached timestamp */
  cachedAt: number;
  /** Last access */
  lastAccess: number;
}

/**
 * Cache statistics.
 */
export interface CacheStats {
  /** Total entries in cache */
  entries: number;
  /** Cache hits */
  hits: number;
  /** Cache misses */
  misses: number;
  /** Hit rate percentage */
  hitRate: number;
  /** Total memory used (bytes) */
  memoryUsed: number;
  /** Evictions due to capacity */
  evictions: number;
}

/**
 * Configuration for the bundle cache.
 */
export interface BundleCacheConfig {
  /** Maximum number of entries */
  maxEntries: number;
  /** Maximum memory usage in bytes */
  maxMemory: number;
  /** TTL for entries in milliseconds (0 = no expiry) */
  ttl: number;
}

const DEFAULT_CONFIG: BundleCacheConfig = {
  maxEntries: 500,
  maxMemory: 50 * 1024 * 1024, // 50MB
  ttl: 30 * 60 * 1000, // 30 minutes
};

/**
 * LRU Bundle Cache for incremental builds.
 * Stores compiled bundles and CSS for reuse.
 */
export class BundleCache {
  #bundles = new Map<string, CachedBundle>();
  #css = new Map<string, CachedCSS>();
  #config: BundleCacheConfig;

  // Statistics
  #hits = 0;
  #misses = 0;
  #evictions = 0;
  #memoryUsed = 0;

  constructor(config: Partial<BundleCacheConfig> = {}) {
    this.#config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Get a cached bundle if it exists and is still valid.
   */
  getBundle(sourcePath: string, sourceContent: string): CachedBundle | null {
    const sourceHash = hashContent(sourceContent);
    const key = this.#makeBundleKey(sourcePath, sourceHash);
    const cached = this.#bundles.get(key);

    if (!cached) {
      this.#misses++;
      return null;
    }

    // Check TTL
    if (this.#config.ttl > 0 && Date.now() - cached.cachedAt > this.#config.ttl) {
      this.#bundles.delete(key);
      this.#memoryUsed -= cached.size;
      this.#misses++;
      return null;
    }

    // Update last access for LRU
    cached.lastAccess = Date.now();
    this.#hits++;

    logger.debug(`Cache hit for ${sourcePath}`);
    return cached;
  }

  /**
   * Store a compiled bundle in the cache.
   */
  setBundle(
    sourcePath: string,
    sourceContent: string,
    code: string,
    options: {
      sourceMap?: string;
      css?: string;
      npmDependencies?: string[];
      imports?: string[];
    } = {},
  ): void {
    const sourceHash = hashContent(sourceContent);
    const key = this.#makeBundleKey(sourcePath, sourceHash);

    // Calculate size
    const size =
      code.length + (options.sourceMap?.length ?? 0) + (options.css?.length ?? 0) + sourcePath.length + sourceHash.length;

    // Check if we need to evict entries
    this.#ensureCapacity(size);

    const entry: CachedBundle = {
      sourcePath,
      sourceHash,
      code,
      sourceMap: options.sourceMap,
      css: options.css,
      npmDependencies: options.npmDependencies ?? [],
      imports: options.imports ?? [],
      cachedAt: Date.now(),
      lastAccess: Date.now(),
      size,
    };

    // Remove old entry if exists
    const existing = this.#bundles.get(key);
    if (existing) {
      this.#memoryUsed -= existing.size;
    }

    this.#bundles.set(key, entry);
    this.#memoryUsed += size;

    logger.debug(`Cached bundle for ${sourcePath} (${Math.round(size / 1024)}KB)`);
  }

  /**
   * Check if a bundle is cached and valid.
   */
  hasBundle(sourcePath: string, sourceContent: string): boolean {
    const sourceHash = hashContent(sourceContent);
    const key = this.#makeBundleKey(sourcePath, sourceHash);
    const cached = this.#bundles.get(key);

    if (!cached) return false;

    // Check TTL
    if (this.#config.ttl > 0 && Date.now() - cached.cachedAt > this.#config.ttl) {
      return false;
    }

    return true;
  }

  /**
   * Invalidate a specific bundle.
   */
  invalidateBundle(sourcePath: string): void {
    // Need to find all entries for this source path (any hash)
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.#bundles) {
      if (entry.sourcePath === sourcePath) {
        keysToDelete.push(key);
        this.#memoryUsed -= entry.size;
      }
    }

    for (const key of keysToDelete) {
      this.#bundles.delete(key);
    }

    if (keysToDelete.length > 0) {
      logger.debug(`Invalidated ${keysToDelete.length} cache entries for ${sourcePath}`);
    }
  }

  /**
   * Invalidate all bundles that depend on a specific file.
   */
  invalidateDependents(sourcePath: string): number {
    let invalidated = 0;
    const keysToDelete: string[] = [];

    for (const [key, entry] of this.#bundles) {
      if (entry.imports.includes(sourcePath)) {
        keysToDelete.push(key);
        this.#memoryUsed -= entry.size;
        invalidated++;
      }
    }

    for (const key of keysToDelete) {
      this.#bundles.delete(key);
    }

    if (invalidated > 0) {
      logger.debug(`Invalidated ${invalidated} dependent bundles for ${sourcePath}`);
    }

    return invalidated;
  }

  /**
   * Get cached CSS.
   */
  getCSS(source: string, sourceContent: string): CachedCSS | null {
    const sourceHash = hashContent(sourceContent);
    const key = `css:${source}:${sourceHash}`;
    const cached = this.#css.get(key);

    if (!cached) {
      return null;
    }

    // Check TTL
    if (this.#config.ttl > 0 && Date.now() - cached.cachedAt > this.#config.ttl) {
      this.#css.delete(key);
      return null;
    }

    cached.lastAccess = Date.now();
    return cached;
  }

  /**
   * Store compiled CSS.
   */
  setCSS(source: string, sourceContent: string, css: string): void {
    const sourceHash = hashContent(sourceContent);
    const key = `css:${source}:${sourceHash}`;

    this.#css.set(key, {
      source,
      sourceHash,
      css,
      cachedAt: Date.now(),
      lastAccess: Date.now(),
    });
  }

  /**
   * Clear all cached CSS.
   */
  clearCSS(): void {
    this.#css.clear();
  }

  /**
   * Get cache statistics.
   */
  getStats(): CacheStats {
    const total = this.#hits + this.#misses;
    return {
      entries: this.#bundles.size,
      hits: this.#hits,
      misses: this.#misses,
      hitRate: total > 0 ? (this.#hits / total) * 100 : 0,
      memoryUsed: this.#memoryUsed,
      evictions: this.#evictions,
    };
  }

  /**
   * Reset statistics.
   */
  resetStats(): void {
    this.#hits = 0;
    this.#misses = 0;
    this.#evictions = 0;
  }

  /**
   * Clear all cached data.
   */
  clear(): void {
    this.#bundles.clear();
    this.#css.clear();
    this.#memoryUsed = 0;
    logger.info('Bundle cache cleared');
  }

  /**
   * Prune expired entries.
   */
  pruneExpired(): number {
    if (this.#config.ttl === 0) return 0;

    const now = Date.now();
    let pruned = 0;

    for (const [key, entry] of this.#bundles) {
      if (now - entry.cachedAt > this.#config.ttl) {
        this.#bundles.delete(key);
        this.#memoryUsed -= entry.size;
        pruned++;
      }
    }

    for (const [key, entry] of this.#css) {
      if (now - entry.cachedAt > this.#config.ttl) {
        this.#css.delete(key);
        pruned++;
      }
    }

    if (pruned > 0) {
      logger.debug(`Pruned ${pruned} expired cache entries`);
    }

    return pruned;
  }

  /**
   * Get all cached bundle paths.
   */
  getCachedPaths(): string[] {
    const paths = new Set<string>();
    for (const entry of this.#bundles.values()) {
      paths.add(entry.sourcePath);
    }
    return Array.from(paths);
  }

  /**
   * Ensure capacity for new entry by evicting LRU entries if needed.
   */
  #ensureCapacity(newEntrySize: number): void {
    // Check entry count limit
    while (this.#bundles.size >= this.#config.maxEntries) {
      this.#evictLRU();
    }

    // Check memory limit
    while (this.#memoryUsed + newEntrySize > this.#config.maxMemory && this.#bundles.size > 0) {
      this.#evictLRU();
    }
  }

  /**
   * Evict the least recently used entry.
   */
  #evictLRU(): void {
    let oldestKey: string | null = null;
    let oldestAccess = Infinity;

    for (const [key, entry] of this.#bundles) {
      if (entry.lastAccess < oldestAccess) {
        oldestAccess = entry.lastAccess;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      const entry = this.#bundles.get(oldestKey)!;
      this.#bundles.delete(oldestKey);
      this.#memoryUsed -= entry.size;
      this.#evictions++;
      logger.debug(`Evicted LRU entry: ${entry.sourcePath}`);
    }
  }

  /**
   * Create a cache key for a bundle.
   */
  #makeBundleKey(sourcePath: string, sourceHash: string): string {
    return `bundle:${sourcePath}:${sourceHash}`;
  }
}

/**
 * Singleton bundle cache instance.
 */
let bundleCacheInstance: BundleCache | null = null;

/**
 * Get the singleton bundle cache instance.
 */
export function getBundleCache(): BundleCache {
  if (!bundleCacheInstance) {
    bundleCacheInstance = new BundleCache();
  }
  return bundleCacheInstance;
}

/**
 * Reset the singleton bundle cache (for testing).
 */
export function resetBundleCache(): void {
  bundleCacheInstance?.clear();
  bundleCacheInstance = null;
}
