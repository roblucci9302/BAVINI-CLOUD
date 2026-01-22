/**
 * =============================================================================
 * BAVINI Performance - Smart Cache
 * =============================================================================
 * LRU cache with memory limits, TTL, and optional persistence.
 * =============================================================================
 */

import type { CacheConfig, CacheEntry, CacheStats } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SmartCache');

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
  maxEntries: 500,
  maxSizeBytes: 50 * 1024 * 1024, // 50MB
  ttlMs: 60 * 60 * 1000,          // 1 hour
  persistent: false,
};

/**
 * Smart Cache
 * LRU cache with memory limits, TTL, and statistics
 */
export class SmartCache<T> {
  private config: CacheConfig;
  private cache: Map<string, CacheEntry<T>> = new Map();
  private totalSize = 0;
  private hits = 0;
  private misses = 0;
  private evictions = 0;
  private persistenceKey: string | null = null;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(name: string, config: Partial<CacheConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.persistenceKey = this.config.persistent ? `bavini-cache-${name}` : null;

    // Load from persistence if enabled
    if (this.persistenceKey) {
      this.loadFromStorage();
    }

    // Start cleanup interval
    this.startCleanup();
  }

  /**
   * Get a value from cache
   */
  get(key: string): T | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      this.misses++;
      return undefined;
    }

    // Check TTL
    if (this.isExpired(entry)) {
      this.delete(key);
      this.misses++;
      return undefined;
    }

    // Update access time and count
    entry.lastAccess = Date.now();
    entry.accessCount++;
    this.hits++;

    // Move to end of Map for LRU ordering
    this.cache.delete(key);
    this.cache.set(key, entry);

    return entry.value;
  }

  /**
   * Set a value in cache
   */
  set(key: string, value: T, sizeBytes?: number): void {
    const size = sizeBytes ?? this.estimateSize(value);
    const now = Date.now();

    // Check if key already exists
    const existing = this.cache.get(key);
    if (existing) {
      this.totalSize -= existing.size;
      this.cache.delete(key);
    }

    // Ensure we have space
    this.ensureCapacity(size);

    const entry: CacheEntry<T> = {
      value,
      size,
      createdAt: now,
      lastAccess: now,
      accessCount: 1,
    };

    this.cache.set(key, entry);
    this.totalSize += size;

    // Persist if enabled
    if (this.persistenceKey) {
      this.saveToStorage();
    }
  }

  /**
   * Check if key exists and is not expired
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (this.isExpired(entry)) {
      this.delete(key);
      return false;
    }

    return true;
  }

  /**
   * Delete a key from cache
   */
  delete(key: string): boolean {
    const entry = this.cache.get(key);
    if (!entry) return false;

    this.totalSize -= entry.size;
    this.cache.delete(key);

    if (this.persistenceKey) {
      this.saveToStorage();
    }

    return true;
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
    this.totalSize = 0;
    this.hits = 0;
    this.misses = 0;
    this.evictions = 0;

    if (this.persistenceKey) {
      localStorage.removeItem(this.persistenceKey);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): CacheStats {
    const totalRequests = this.hits + this.misses;

    return {
      entries: this.cache.size,
      totalSize: this.totalSize,
      hits: this.hits,
      misses: this.misses,
      hitRate: totalRequests > 0 ? this.hits / totalRequests : 0,
      evictions: this.evictions,
    };
  }

  /**
   * Get all keys
   */
  keys(): string[] {
    return [...this.cache.keys()];
  }

  /**
   * Get number of entries
   */
  get size(): number {
    return this.cache.size;
  }

  /**
   * Get total size in bytes
   */
  get sizeBytes(): number {
    return this.totalSize;
  }

  /**
   * Ensure there's space for new entry
   */
  private ensureCapacity(neededSize: number): void {
    // Evict by LRU while over capacity
    while (
      (this.cache.size >= this.config.maxEntries ||
        this.totalSize + neededSize > this.config.maxSizeBytes) &&
      this.cache.size > 0
    ) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        const entry = this.cache.get(oldestKey);
        if (entry) {
          this.totalSize -= entry.size;
        }
        this.cache.delete(oldestKey);
        this.evictions++;
      }
    }
  }

  /**
   * Check if entry is expired
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.createdAt > this.config.ttlMs;
  }

  /**
   * Estimate size of a value
   */
  private estimateSize(value: T): number {
    if (value === null || value === undefined) return 0;

    if (typeof value === 'string') {
      return value.length * 2; // UTF-16
    }

    if (typeof value === 'number') {
      return 8;
    }

    if (typeof value === 'boolean') {
      return 4;
    }

    if (value instanceof ArrayBuffer) {
      return value.byteLength;
    }

    if (ArrayBuffer.isView(value)) {
      return value.byteLength;
    }

    // For objects, estimate JSON size
    try {
      const json = JSON.stringify(value);
      return json.length * 2;
    } catch {
      return 1024; // Default estimate
    }
  }

  /**
   * Start cleanup interval for expired entries
   */
  private startCleanup(): void {
    // Run every minute
    this.cleanupInterval = setInterval(() => {
      this.cleanup();
    }, 60000);
  }

  /**
   * Stop cleanup interval
   */
  private stopCleanup(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  /**
   * Remove expired entries
   */
  cleanup(): number {
    let removed = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.createdAt > this.config.ttlMs) {
        this.totalSize -= entry.size;
        this.cache.delete(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.debug(`Cleaned up ${removed} expired entries`);

      if (this.persistenceKey) {
        this.saveToStorage();
      }
    }

    return removed;
  }

  /**
   * Save cache to localStorage
   */
  private saveToStorage(): void {
    if (!this.persistenceKey) return;

    try {
      const serializable: Array<[string, { value: T; size: number; createdAt: number }]> = [];

      for (const [key, entry] of this.cache.entries()) {
        // Only persist non-expired entries
        if (!this.isExpired(entry)) {
          serializable.push([key, {
            value: entry.value,
            size: entry.size,
            createdAt: entry.createdAt,
          }]);
        }
      }

      localStorage.setItem(this.persistenceKey, JSON.stringify(serializable));
    } catch (error) {
      logger.warn('Failed to persist cache:', error);
    }
  }

  /**
   * Load cache from localStorage
   */
  private loadFromStorage(): void {
    if (!this.persistenceKey) return;

    try {
      const data = localStorage.getItem(this.persistenceKey);
      if (!data) return;

      const entries: Array<[string, { value: T; size: number; createdAt: number }]> = JSON.parse(data);
      const now = Date.now();

      for (const [key, stored] of entries) {
        // Skip expired entries
        if (now - stored.createdAt > this.config.ttlMs) {
          continue;
        }

        const entry: CacheEntry<T> = {
          value: stored.value,
          size: stored.size,
          createdAt: stored.createdAt,
          lastAccess: now,
          accessCount: 1,
        };

        this.cache.set(key, entry);
        this.totalSize += entry.size;
      }

      logger.debug(`Loaded ${this.cache.size} entries from storage`);
    } catch (error) {
      logger.warn('Failed to load cache from storage:', error);
    }
  }

  /**
   * Prune cache to a target size
   */
  prune(targetSize: number): number {
    let removed = 0;

    while (this.totalSize > targetSize && this.cache.size > 0) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        const entry = this.cache.get(oldestKey);
        if (entry) {
          this.totalSize -= entry.size;
        }
        this.cache.delete(oldestKey);
        removed++;
      }
    }

    if (removed > 0 && this.persistenceKey) {
      this.saveToStorage();
    }

    return removed;
  }

  /**
   * Get entries sorted by access count (most accessed first)
   */
  getHotEntries(limit = 10): Array<{ key: string; accessCount: number }> {
    const entries: Array<{ key: string; accessCount: number }> = [];

    for (const [key, entry] of this.cache.entries()) {
      entries.push({ key, accessCount: entry.accessCount });
    }

    return entries
      .sort((a, b) => b.accessCount - a.accessCount)
      .slice(0, limit);
  }

  /**
   * Get entries sorted by size (largest first)
   */
  getLargestEntries(limit = 10): Array<{ key: string; size: number }> {
    const entries: Array<{ key: string; size: number }> = [];

    for (const [key, entry] of this.cache.entries()) {
      entries.push({ key, size: entry.size });
    }

    return entries
      .sort((a, b) => b.size - a.size)
      .slice(0, limit);
  }

  /**
   * Destroy the cache
   */
  destroy(): void {
    this.stopCleanup();
    this.clear();
  }
}

/**
 * Create a smart cache instance
 */
export function createSmartCache<T>(
  name: string,
  config?: Partial<CacheConfig>,
): SmartCache<T> {
  return new SmartCache<T>(name, config);
}

export default SmartCache;
