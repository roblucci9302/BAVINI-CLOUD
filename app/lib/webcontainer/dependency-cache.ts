/**
 * Dependency Cache System for WebContainer
 *
 * Optimizes npm/pnpm install times by caching node_modules snapshots.
 * Uses IndexedDB for browser-side storage of dependency trees.
 *
 * Flow:
 * 1. Hash package.json dependencies to create a cache key
 * 2. Check if cached node_modules exists for this hash
 * 3. If exists, restore from cache (instant, ~1-2s)
 * 4. If not, run install normally and cache result for next time
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DependencyCache');

// IndexedDB configuration
const DB_NAME = 'bavini-dependency-cache';
const DB_VERSION = 1;
const STORE_NAME = 'node_modules_snapshots';

// Cache configuration
const MAX_CACHE_SIZE_MB = 500; // Maximum total cache size
const MAX_CACHE_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const COMPRESSION_ENABLED = true;

export interface PackageJson {
  name?: string;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

export interface CacheEntry {
  hash: string;
  timestamp: number;
  sizeBytes: number;
  packageName: string;
  dependencies: string[];

  // Compressed node_modules file tree (path -> content)
  snapshot: Map<string, Uint8Array> | null;
}

export interface CacheStats {
  totalEntries: number;
  totalSizeBytes: number;
  oldestEntry: number;
  newestEntry: number;
}

/**
 * Generate a deterministic hash from package.json dependencies
 */
export function generateDependencyHash(packageJson: PackageJson): string {
  // Sort and combine all dependencies for consistent hashing
  const allDeps = {
    ...(packageJson.dependencies || {}),
    ...(packageJson.devDependencies || {}),
  };

  // Sort keys for deterministic output
  const sortedKeys = Object.keys(allDeps).sort();
  const depsString = sortedKeys.map((k) => `${k}@${allDeps[k]}`).join('|');

  // Simple hash function (FNV-1a)
  let hash = 2166136261;

  for (let i = 0; i < depsString.length; i++) {
    hash ^= depsString.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Compress data using CompressionStream API (browser native)
 */
async function compressData(data: Uint8Array): Promise<Uint8Array> {
  if (!COMPRESSION_ENABLED || typeof CompressionStream === 'undefined') {
    return data;
  }

  try {
    const blob = new Blob([data.buffer as ArrayBuffer]);
    const stream = blob.stream();
    const compressedStream = stream.pipeThrough(new CompressionStream('gzip'));
    const compressedBlob = await new Response(compressedStream).blob();

    return new Uint8Array(await compressedBlob.arrayBuffer());
  } catch (error) {
    logger.warn('Compression failed, storing uncompressed:', error);

    return data;
  }
}

/**
 * Decompress data using DecompressionStream API
 */
async function decompressData(data: Uint8Array): Promise<Uint8Array> {
  if (!COMPRESSION_ENABLED || typeof DecompressionStream === 'undefined') {
    return data;
  }

  try {
    const blob = new Blob([data.buffer as ArrayBuffer]);
    const stream = blob.stream();
    const decompressedStream = stream.pipeThrough(new DecompressionStream('gzip'));
    const decompressedBlob = await new Response(decompressedStream).blob();

    return new Uint8Array(await decompressedBlob.arrayBuffer());
  } catch (error) {
    // Data might not be compressed, return as-is
    logger.debug('Decompression skipped (data may not be compressed)');

    return data;
  }
}

/**
 * Dependency Cache Manager
 * Handles storage and retrieval of node_modules snapshots
 */
export class DependencyCache {
  private db: IDBDatabase | null = null;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize IndexedDB connection
   */
  async init(): Promise<void> {
    if (this.db) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = new Promise((resolve, reject) => {
      if (typeof indexedDB === 'undefined') {
        logger.warn('IndexedDB not available, dependency caching disabled');
        resolve();

        return;
      }

      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => {
        logger.error('Failed to open IndexedDB:', request.error);
        resolve(); // Don't reject - cache is optional
      };

      request.onsuccess = () => {
        this.db = request.result;
        logger.info('Dependency cache initialized');
        resolve();
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create object store for snapshots
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'hash' });
          store.createIndex('timestamp', 'timestamp', { unique: false });
          store.createIndex('packageName', 'packageName', { unique: false });
          logger.info('Created dependency cache store');
        }
      };
    });

    return this.initPromise;
  }

  /**
   * Check if a cached snapshot exists for the given package.json
   */
  async has(packageJson: PackageJson): Promise<boolean> {
    await this.init();

    if (!this.db) {
      return false;
    }

    const hash = generateDependencyHash(packageJson);

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(hash);

      request.onsuccess = () => {
        const entry = request.result as CacheEntry | undefined;

        if (!entry) {
          resolve(false);

          return;
        }

        // Check if entry is expired
        if (Date.now() - entry.timestamp > MAX_CACHE_AGE_MS) {
          logger.debug(`Cache entry ${hash} expired, will re-install`);
          resolve(false);

          return;
        }

        resolve(true);
      };

      request.onerror = () => {
        logger.warn('Error checking cache:', request.error);
        resolve(false);
      };
    });
  }

  /**
   * Get cached node_modules snapshot
   * Returns a Map of file paths to file contents
   */
  async get(packageJson: PackageJson): Promise<Map<string, string> | null> {
    await this.init();

    if (!this.db) {
      return null;
    }

    const hash = generateDependencyHash(packageJson);

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(hash);

      request.onsuccess = async () => {
        const entry = request.result as CacheEntry | undefined;

        if (!entry || !entry.snapshot) {
          resolve(null);

          return;
        }

        // Check if entry is expired
        if (Date.now() - entry.timestamp > MAX_CACHE_AGE_MS) {
          resolve(null);

          return;
        }

        try {
          // Decompress and deserialize the snapshot - PARALLELIZED
          const result = new Map<string, string>();
          const decoder = new TextDecoder(); // Reuse single decoder
          const entries = Array.from(entry.snapshot.entries());
          const BATCH_SIZE = 50; // Process in batches to avoid overwhelming the browser

          // Process in parallel batches
          for (let i = 0; i < entries.length; i += BATCH_SIZE) {
            const batch = entries.slice(i, i + BATCH_SIZE);
            const decompressedBatch = await Promise.all(
              batch.map(async ([path, compressedData]) => {
                const decompressed = await decompressData(compressedData);
                return [path, decoder.decode(decompressed)] as [string, string];
              }),
            );

            for (const [path, content] of decompressedBatch) {
              result.set(path, content);
            }
          }

          logger.info(`Cache hit for ${entry.packageName} (${hash}), ${result.size} files`);
          resolve(result);
        } catch (error) {
          logger.error('Error deserializing cache entry:', error);
          resolve(null);
        }
      };

      request.onerror = () => {
        logger.warn('Error reading cache:', request.error);
        resolve(null);
      };
    });
  }

  /**
   * Store node_modules snapshot in cache
   * @param packageJson - The package.json to generate hash from
   * @param files - Map of file paths to file contents (from WebContainer)
   */
  async set(packageJson: PackageJson, files: Map<string, string>): Promise<void> {
    await this.init();

    if (!this.db) {
      return;
    }

    const hash = generateDependencyHash(packageJson);
    const encoder = new TextEncoder();

    try {
      // Compress each file - PARALLELIZED
      const compressedSnapshot = new Map<string, Uint8Array>();
      let totalSize = 0;
      const entries = Array.from(files.entries());
      const BATCH_SIZE = 50; // Process in batches

      // Process in parallel batches
      for (let i = 0; i < entries.length; i += BATCH_SIZE) {
        const batch = entries.slice(i, i + BATCH_SIZE);
        const compressedBatch = await Promise.all(
          batch.map(async ([path, content]) => {
            const encoded = encoder.encode(content);
            const compressed = await compressData(encoded);
            return [path, compressed] as [string, Uint8Array];
          }),
        );

        for (const [path, compressed] of compressedBatch) {
          compressedSnapshot.set(path, compressed);
          totalSize += compressed.length;
        }
      }

      // Check if we need to cleanup old entries first
      await this.ensureCapacity(totalSize);

      const entry: CacheEntry = {
        hash,
        timestamp: Date.now(),
        sizeBytes: totalSize,
        packageName: packageJson.name || 'unknown',
        dependencies: Object.keys(packageJson.dependencies || {}),
        snapshot: compressedSnapshot,
      };

      return new Promise((resolve, reject) => {
        const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
        const store = transaction.objectStore(STORE_NAME);
        const request = store.put(entry);

        request.onsuccess = () => {
          logger.info(
            `Cached ${files.size} files for ${entry.packageName} (${hash}), ` +
              `${(totalSize / 1024 / 1024).toFixed(2)}MB`,
          );
          resolve();
        };

        request.onerror = () => {
          logger.error('Error storing cache entry:', request.error);
          reject(request.error);
        };
      });
    } catch (error) {
      logger.error('Error preparing cache entry:', error);
    }
  }

  /**
   * Ensure we have enough capacity for new entry
   * Removes oldest entries if necessary
   */
  private async ensureCapacity(newEntrySize: number): Promise<void> {
    if (!this.db) {
      return;
    }

    const stats = await this.getStats();
    const maxBytes = MAX_CACHE_SIZE_MB * 1024 * 1024;

    if (stats.totalSizeBytes + newEntrySize <= maxBytes) {
      return; // Enough space
    }

    // Need to free up space - remove oldest entries
    const bytesToFree = stats.totalSizeBytes + newEntrySize - maxBytes + 10 * 1024 * 1024; // Free 10MB extra

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const index = store.index('timestamp');
      const request = index.openCursor();

      let freedBytes = 0;

      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor || freedBytes >= bytesToFree) {
          logger.info(`Freed ${(freedBytes / 1024 / 1024).toFixed(2)}MB from cache`);
          resolve();

          return;
        }

        const entry = cursor.value as CacheEntry;
        freedBytes += entry.sizeBytes;
        cursor.delete();
        cursor.continue();
      };

      request.onerror = () => {
        logger.warn('Error cleaning cache:', request.error);
        resolve();
      };
    });
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    await this.init();

    const defaultStats: CacheStats = {
      totalEntries: 0,
      totalSizeBytes: 0,
      oldestEntry: Date.now(),
      newestEntry: 0,
    };

    if (!this.db) {
      return defaultStats;
    }

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.openCursor();

      const stats: CacheStats = { ...defaultStats };

      request.onsuccess = () => {
        const cursor = request.result;

        if (!cursor) {
          resolve(stats);

          return;
        }

        const entry = cursor.value as CacheEntry;
        stats.totalEntries++;
        stats.totalSizeBytes += entry.sizeBytes;
        stats.oldestEntry = Math.min(stats.oldestEntry, entry.timestamp);
        stats.newestEntry = Math.max(stats.newestEntry, entry.timestamp);
        cursor.continue();
      };

      request.onerror = () => {
        resolve(defaultStats);
      };
    });
  }

  /**
   * Clear all cached entries
   */
  async clear(): Promise<void> {
    await this.init();

    if (!this.db) {
      return;
    }

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.clear();

      request.onsuccess = () => {
        logger.info('Dependency cache cleared');
        resolve();
      };

      request.onerror = () => {
        logger.warn('Error clearing cache:', request.error);
        resolve();
      };
    });
  }

  /**
   * Delete specific cache entry
   */
  async delete(packageJson: PackageJson): Promise<void> {
    await this.init();

    if (!this.db) {
      return;
    }

    const hash = generateDependencyHash(packageJson);

    return new Promise((resolve) => {
      const transaction = this.db!.transaction([STORE_NAME], 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.delete(hash);

      request.onsuccess = () => {
        logger.debug(`Deleted cache entry ${hash}`);
        resolve();
      };

      request.onerror = () => {
        logger.warn('Error deleting cache entry:', request.error);
        resolve();
      };
    });
  }
}

// Singleton instance
export const dependencyCache = new DependencyCache();

/**
 * Pre-warm cache with common dependency sets
 * This should be called during idle time or on first load
 */
export const COMMON_DEPENDENCY_SETS = {
  'react-vite': {
    dependencies: {
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    },
    devDependencies: {
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      '@vitejs/plugin-react': '^4.2.0',
      typescript: '^5.3.0',
      vite: '^5.0.0',
    },
  },
  'next-js': {
    dependencies: {
      next: '14.2.0',
      react: '^18.2.0',
      'react-dom': '^18.2.0',
    },
    devDependencies: {
      '@types/node': '^20.0.0',
      '@types/react': '^18.2.0',
      '@types/react-dom': '^18.2.0',
      typescript: '^5.0.0',
    },
  },
  express: {
    dependencies: {
      express: '^4.18.0',
      cors: '^2.8.5',
    },
    devDependencies: {
      '@types/express': '^4.17.0',
      '@types/node': '^20.0.0',
      typescript: '^5.0.0',
      tsx: '^4.0.0',
    },
  },
};
