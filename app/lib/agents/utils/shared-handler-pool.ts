/**
 * Shared Tool Handler Pool
 *
 * Caches tool handlers to avoid recreating them for each agent.
 * Handlers are cached by interface instance (WeakMap) to allow GC.
 *
 * @module agents/utils/shared-handler-pool
 */

import { createScopedLogger } from '~/utils/logger';
import type { ToolExecutionResult } from '../types';
import type { FileSystem } from '../tools/read-tools';
import type { WritableFileSystem } from '../tools/write-tools';
import { createReadToolHandlers } from '../tools/read-tools';
import { createWriteToolHandlers } from '../tools/write-tools';

const logger = createScopedLogger('SharedHandlerPool');

/**
 * Generic tool handler type
 */
export type ToolHandler = (input: Record<string, unknown>) => Promise<ToolExecutionResult>;

/**
 * Handler creators mapped by tool category
 */
type HandlerRecord = Record<string, ToolHandler>;

/**
 * Pool statistics
 */
export interface PoolStats {
  readHandlerHits: number;
  readHandlerMisses: number;
  writeHandlerHits: number;
  writeHandlerMisses: number;
}

/**
 * Shared handler pool - caches handlers by interface instance
 */
class SharedToolHandlerPool {
  // WeakMaps allow garbage collection when FileSystem is no longer referenced
  private readHandlerCache = new WeakMap<FileSystem, HandlerRecord>();
  private writeHandlerCache = new WeakMap<WritableFileSystem, HandlerRecord>();

  // Statistics
  private stats: PoolStats = {
    readHandlerHits: 0,
    readHandlerMisses: 0,
    writeHandlerHits: 0,
    writeHandlerMisses: 0,
  };

  /**
   * Get or create read tool handlers for a FileSystem
   */
  getReadHandlers(fs: FileSystem): HandlerRecord {
    const cached = this.readHandlerCache.get(fs);

    if (cached) {
      this.stats.readHandlerHits++;
      logger.debug('Read handlers cache hit');
      return cached;
    }

    this.stats.readHandlerMisses++;
    logger.debug('Read handlers cache miss - creating new handlers');

    const handlers = createReadToolHandlers(fs) as unknown as HandlerRecord;
    this.readHandlerCache.set(fs, handlers);

    return handlers;
  }

  /**
   * Get or create write tool handlers for a WritableFileSystem
   */
  getWriteHandlers(fs: WritableFileSystem): HandlerRecord {
    const cached = this.writeHandlerCache.get(fs);

    if (cached) {
      this.stats.writeHandlerHits++;
      logger.debug('Write handlers cache hit');
      return cached;
    }

    this.stats.writeHandlerMisses++;
    logger.debug('Write handlers cache miss - creating new handlers');

    const handlers = createWriteToolHandlers(fs) as unknown as HandlerRecord;
    this.writeHandlerCache.set(fs, handlers);

    return handlers;
  }

  /**
   * Get pool statistics
   */
  getStats(): PoolStats {
    return { ...this.stats };
  }

  /**
   * Get hit rate for read handlers (0-100)
   */
  getReadHitRate(): number {
    const total = this.stats.readHandlerHits + this.stats.readHandlerMisses;
    return total > 0 ? (this.stats.readHandlerHits / total) * 100 : 0;
  }

  /**
   * Get hit rate for write handlers (0-100)
   */
  getWriteHitRate(): number {
    const total = this.stats.writeHandlerHits + this.stats.writeHandlerMisses;
    return total > 0 ? (this.stats.writeHandlerHits / total) * 100 : 0;
  }

  /**
   * Reset statistics (for testing)
   */
  resetStats(): void {
    this.stats = {
      readHandlerHits: 0,
      readHandlerMisses: 0,
      writeHandlerHits: 0,
      writeHandlerMisses: 0,
    };
  }
}

/**
 * Global shared handler pool instance
 */
export const sharedHandlerPool = new SharedToolHandlerPool();

/**
 * Get shared read handlers for a FileSystem
 * Utility function for simpler imports
 */
export function getSharedReadHandlers(fs: FileSystem): HandlerRecord {
  return sharedHandlerPool.getReadHandlers(fs);
}

/**
 * Get shared write handlers for a WritableFileSystem
 * Utility function for simpler imports
 */
export function getSharedWriteHandlers(fs: WritableFileSystem): HandlerRecord {
  return sharedHandlerPool.getWriteHandlers(fs);
}

/**
 * Get pool statistics
 */
export function getHandlerPoolStats(): PoolStats {
  return sharedHandlerPool.getStats();
}
