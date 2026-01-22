/**
 * =============================================================================
 * BAVINI Container - Filesystem Module
 * =============================================================================
 * Public exports for the filesystem module.
 * =============================================================================
 */

// Types
export type {
  FSBackend,
  FileStat,
  DirEntry,
  MkdirOptions,
  RmdirOptions,
  WriteFileOptions,
  WatchEvent,
  WatchEventType,
  WatchCallback,
  WatchHandle,
  BackendCapabilities,
  BackendInitOptions,
  MountPoint,
  FSError,
} from './types';

export { TextUtils, FileMode, FSErrorCode, createFSError, isFSError } from './types';

// Path utilities
export {
  normalizePath,
  dirname,
  basename,
  extname,
  join,
  resolve,
  relative,
  isAbsolute,
  isRoot,
  isInside,
  parse,
  isValidPath,
  getAncestors,
} from './path-utils';

// Security utilities (FIX 1.4: Path traversal protection)
export {
  SecurityError,
  validatePath,
  isValidSecurePath,
  resolveSecurePath,
  sanitizePathForLog,
  isSafeFilename,
  extractSafeFilename,
} from './security';

// Backends
export { MemoryBackend } from './backends/memory-backend';
export { OPFSBackend, isOPFSAvailable } from './backends/opfs-backend';
export { IndexedDBBackend } from './backends/indexeddb-backend';

// Mount Manager
export {
  MountManager,
  getSharedMountManager,
  resetSharedMountManager,
  type MountManagerConfig,
} from './mount-manager';

// Factory function for creating a configured mount manager
import { MountManager } from './mount-manager';
import { OPFSBackend, isOPFSAvailable } from './backends/opfs-backend';
import { IndexedDBBackend } from './backends/indexeddb-backend';
import { MemoryBackend } from './backends/memory-backend';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Filesystem');

/**
 * Create and initialize a mount manager with default configuration
 *
 * Default mounts:
 * - / -> OPFS (or IndexedDB fallback)
 * - /tmp -> Memory (volatile)
 */
export async function createDefaultMountManager(): Promise<MountManager> {
  const manager = new MountManager();

  // Choose persistent backend based on availability
  let persistentBackend;
  if (isOPFSAvailable()) {
    logger.info('Using OPFS for persistent storage');
    persistentBackend = new OPFSBackend();
  } else {
    logger.info('OPFS not available, using IndexedDB fallback');
    persistentBackend = new IndexedDBBackend();
  }

  // Create memory backend for /tmp
  const memoryBackend = new MemoryBackend();

  await manager.init({
    mounts: [
      { path: '/', backend: persistentBackend },
      { path: '/tmp', backend: memoryBackend },
    ],
  });

  // Create default directories
  const defaultDirs = ['/home', '/src'];
  for (const dir of defaultDirs) {
    if (!(await manager.exists(dir))) {
      await manager.mkdir(dir, { recursive: true });
    }
  }

  return manager;
}
