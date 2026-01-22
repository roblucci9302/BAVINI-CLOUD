/**
 * =============================================================================
 * BAVINI Container - Package Cache
 * =============================================================================
 * Caches downloaded packages in memory (LRU) and OPFS for persistence.
 * =============================================================================
 */

import type { CachedPackage, PackageJson } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PackageCache');

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Maximum packages in memory cache */
  maxMemoryPackages?: number;
  /** Maximum memory size in bytes */
  maxMemoryBytes?: number;
  /** Enable OPFS persistence */
  persistToOPFS?: boolean;
  /** OPFS directory name */
  opfsDirectory?: string;
  /** TTL for cached packages (ms) */
  ttl?: number;
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: Required<CacheConfig> = {
  maxMemoryPackages: 100,
  maxMemoryBytes: 100 * 1024 * 1024, // 100MB
  persistToOPFS: true,
  opfsDirectory: '.bavini-cache/packages',
  ttl: 24 * 60 * 60 * 1000, // 24 hours
};

/**
 * LRU Cache node
 */
interface CacheNode {
  key: string;
  value: CachedPackage;
  prev: CacheNode | null;
  next: CacheNode | null;
}

/**
 * Package cache with LRU eviction and OPFS persistence
 */
export class PackageCache {
  private _config: Required<CacheConfig>;
  private _cache = new Map<string, CacheNode>();
  private _head: CacheNode | null = null;
  private _tail: CacheNode | null = null;
  private _currentSize = 0;
  private _opfsRoot: FileSystemDirectoryHandle | null = null;
  private _initialized = false;

  constructor(config?: CacheConfig) {
    this._config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Initialize the cache
   */
  async init(): Promise<void> {
    if (this._initialized) return;

    if (this._config.persistToOPFS) {
      try {
        await this._initOPFS();
      } catch (error) {
        logger.warn('OPFS not available, using memory-only cache:', error);
        this._config.persistToOPFS = false;
      }
    }

    this._initialized = true;
    logger.debug('Cache initialized');
  }

  /**
   * Initialize OPFS storage
   */
  private async _initOPFS(): Promise<void> {
    if (typeof navigator === 'undefined' || !('storage' in navigator)) {
      throw new Error('Storage API not available');
    }

    const root = await navigator.storage.getDirectory();
    const parts = this._config.opfsDirectory.split('/');
    let current = root;

    for (const part of parts) {
      if (part) {
        current = await current.getDirectoryHandle(part, { create: true });
      }
    }

    this._opfsRoot = current;
  }

  /**
   * Get package from cache
   */
  async get(name: string, version: string): Promise<CachedPackage | null> {
    const key = this._makeKey(name, version);

    // Check memory cache first
    const node = this._cache.get(key);

    if (node) {
      // Check TTL
      if (Date.now() - node.value.cachedAt > this._config.ttl) {
        this._remove(key);
        return null;
      }

      // Move to front (most recently used)
      this._moveToFront(node);
      node.value.lastUsed = Date.now();
      return node.value;
    }

    // Check OPFS cache
    if (this._config.persistToOPFS && this._opfsRoot) {
      try {
        const pkg = await this._loadFromOPFS(key);

        if (pkg) {
          // Check TTL
          if (Date.now() - pkg.cachedAt > this._config.ttl) {
            await this._removeFromOPFS(key);
            return null;
          }

          // Add to memory cache
          this._addToMemory(key, pkg);
          return pkg;
        }
      } catch {
        // Not found in OPFS
      }
    }

    return null;
  }

  /**
   * Store package in cache
   */
  async set(name: string, version: string, data: CachedPackage): Promise<void> {
    const key = this._makeKey(name, version);

    // Update timestamps
    data.cachedAt = Date.now();
    data.lastUsed = Date.now();

    // Add to memory cache
    this._addToMemory(key, data);

    // Persist to OPFS
    if (this._config.persistToOPFS && this._opfsRoot) {
      try {
        await this._saveToOPFS(key, data);
      } catch (error) {
        logger.warn('Failed to persist to OPFS:', error);
      }
    }
  }

  /**
   * Check if package is cached
   */
  async has(name: string, version: string): Promise<boolean> {
    const key = this._makeKey(name, version);

    if (this._cache.has(key)) {
      return true;
    }

    if (this._config.persistToOPFS && this._opfsRoot) {
      try {
        await this._opfsRoot.getFileHandle(`${key}.json`);
        return true;
      } catch {
        return false;
      }
    }

    return false;
  }

  /**
   * Remove package from cache
   */
  async remove(name: string, version: string): Promise<void> {
    const key = this._makeKey(name, version);

    this._remove(key);

    if (this._config.persistToOPFS && this._opfsRoot) {
      await this._removeFromOPFS(key);
    }
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    this._cache.clear();
    this._head = null;
    this._tail = null;
    this._currentSize = 0;

    if (this._config.persistToOPFS && this._opfsRoot) {
      await this._clearOPFS();
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): {
    memoryPackages: number;
    memorySize: number;
    maxMemorySize: number;
  } {
    return {
      memoryPackages: this._cache.size,
      memorySize: this._currentSize,
      maxMemorySize: this._config.maxMemoryBytes,
    };
  }

  /**
   * Add to memory cache with LRU eviction
   */
  private _addToMemory(key: string, value: CachedPackage): void {
    // Remove existing if present
    this._remove(key);

    // Evict if necessary
    while (
      this._cache.size >= this._config.maxMemoryPackages ||
      this._currentSize + value.size > this._config.maxMemoryBytes
    ) {
      if (!this._tail) break;
      this._remove(this._tail.key);
    }

    // Create new node
    const node: CacheNode = {
      key,
      value,
      prev: null,
      next: this._head,
    };

    // Add to front
    if (this._head) {
      this._head.prev = node;
    }

    this._head = node;

    if (!this._tail) {
      this._tail = node;
    }

    this._cache.set(key, node);
    this._currentSize += value.size;
  }

  /**
   * Move node to front of LRU list
   */
  private _moveToFront(node: CacheNode): void {
    if (node === this._head) return;

    // Remove from current position
    if (node.prev) {
      node.prev.next = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    }

    if (node === this._tail) {
      this._tail = node.prev;
    }

    // Add to front
    node.prev = null;
    node.next = this._head;

    if (this._head) {
      this._head.prev = node;
    }

    this._head = node;
  }

  /**
   * Remove from memory cache
   */
  private _remove(key: string): void {
    const node = this._cache.get(key);

    if (!node) return;

    // Remove from linked list
    if (node.prev) {
      node.prev.next = node.next;
    }

    if (node.next) {
      node.next.prev = node.prev;
    }

    if (node === this._head) {
      this._head = node.next;
    }

    if (node === this._tail) {
      this._tail = node.prev;
    }

    this._cache.delete(key);
    this._currentSize -= node.value.size;
  }

  /**
   * Save package to OPFS
   */
  private async _saveToOPFS(key: string, data: CachedPackage): Promise<void> {
    if (!this._opfsRoot) return;

    // Serialize files map to array
    const serialized = {
      ...data,
      files: Array.from(data.files.entries()),
    };

    const json = JSON.stringify(serialized);
    const fileHandle = await this._opfsRoot.getFileHandle(`${key}.json`, { create: true });
    const writable = await fileHandle.createWritable();
    await writable.write(json);
    await writable.close();
  }

  /**
   * Load package from OPFS
   */
  private async _loadFromOPFS(key: string): Promise<CachedPackage | null> {
    if (!this._opfsRoot) return null;

    try {
      const fileHandle = await this._opfsRoot.getFileHandle(`${key}.json`);
      const file = await fileHandle.getFile();
      const json = await file.text();
      const parsed = JSON.parse(json);

      // Reconstruct files map
      return {
        ...parsed,
        files: new Map(parsed.files),
      };
    } catch {
      return null;
    }
  }

  /**
   * Remove package from OPFS
   */
  private async _removeFromOPFS(key: string): Promise<void> {
    if (!this._opfsRoot) return;

    try {
      await this._opfsRoot.removeEntry(`${key}.json`);
    } catch {
      // Ignore if not found
    }
  }

  /**
   * Clear all OPFS cache
   */
  private async _clearOPFS(): Promise<void> {
    if (!this._opfsRoot) return;

    const entries: string[] = [];

    // Collect all entries
    for await (const [name] of (this._opfsRoot as any).entries()) {
      entries.push(name);
    }

    // Remove all
    for (const name of entries) {
      try {
        await this._opfsRoot.removeEntry(name);
      } catch {
        // Ignore errors
      }
    }
  }

  /**
   * Make cache key from name and version
   */
  private _makeKey(name: string, version: string): string {
    // Encode scoped packages
    const safeName = name.replace(/\//g, '__');
    return `${safeName}@${version}`;
  }

  /**
   * Destroy the cache
   */
  async destroy(): Promise<void> {
    this._cache.clear();
    this._head = null;
    this._tail = null;
    this._currentSize = 0;
    this._opfsRoot = null;
    this._initialized = false;
  }
}

/**
 * Singleton package cache instance
 */
let _defaultCache: PackageCache | null = null;

export function getPackageCache(): PackageCache {
  if (!_defaultCache) {
    _defaultCache = new PackageCache();
  }

  return _defaultCache;
}
