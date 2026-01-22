/**
 * =============================================================================
 * BAVINI Container - Filesystem Types
 * =============================================================================
 * Type definitions for the pluggable filesystem backend system.
 * Supports OPFS, IndexedDB, and Memory backends.
 * =============================================================================
 */

/**
 * File statistics returned by stat operations
 */
export interface FileStat {
  /** True if this is a regular file */
  isFile: boolean;
  /** True if this is a directory */
  isDirectory: boolean;
  /** File size in bytes */
  size: number;
  /** Last modification time (Unix timestamp ms) */
  mtime: number;
  /** Last access time (Unix timestamp ms) */
  atime: number;
  /** Creation time (Unix timestamp ms) */
  ctime: number;
  /** Birth time (Unix timestamp ms) */
  birthtime: number;
  /** Unix permission mode */
  mode: number;
}

/**
 * Directory entry returned by readdir with details
 */
export interface DirEntry {
  /** Entry name (not full path) */
  name: string;
  /** True if this is a directory */
  isDirectory: boolean;
  /** True if this is a file */
  isFile: boolean;
}

/**
 * Options for mkdir operation
 */
export interface MkdirOptions {
  /** Create parent directories if they don't exist */
  recursive?: boolean;
  /** Unix permission mode (default: 0o755) */
  mode?: number;
}

/**
 * Options for rmdir operation
 */
export interface RmdirOptions {
  /** Remove directory and all contents recursively */
  recursive?: boolean;
}

/**
 * Options for writeFile operation
 */
export interface WriteFileOptions {
  /** Create parent directories if they don't exist */
  createParents?: boolean;
  /** Unix permission mode for new files (default: 0o644) */
  mode?: number;
}

/**
 * Watch event types
 */
export type WatchEventType = 'create' | 'modify' | 'delete' | 'rename';

/**
 * Watch event emitted when filesystem changes
 */
export interface WatchEvent {
  /** Type of change */
  type: WatchEventType;
  /** Path that changed */
  path: string;
  /** Previous path (for rename events) */
  oldPath?: string;
}

/**
 * Watch callback function
 */
export type WatchCallback = (event: WatchEvent) => void;

/**
 * Watch handle returned by watch()
 */
export interface WatchHandle {
  /** Stop watching */
  unsubscribe: () => void;
}

/**
 * Backend capabilities for feature detection
 */
export interface BackendCapabilities {
  /** Supports persistent storage across sessions */
  persistent: boolean;
  /** Supports synchronous operations */
  syncAccess: boolean;
  /** Supports file watching */
  watchable: boolean;
  /** Maximum file size in bytes (0 = unlimited) */
  maxFileSize: number;
  /** Maximum total storage in bytes (0 = unlimited) */
  maxStorage: number;
}

/**
 * Backend initialization options
 */
export interface BackendInitOptions {
  /** Root path for this backend (for mounting) */
  rootPath?: string;
  /** Restore from persistence on init */
  restoreOnInit?: boolean;
}

/**
 * Filesystem backend interface
 * All backends must implement this interface
 */
export interface FSBackend {
  // =========================================================================
  // Lifecycle
  // =========================================================================

  /**
   * Initialize the backend
   * Must be called before any other operations
   */
  init(options?: BackendInitOptions): Promise<void>;

  /**
   * Destroy the backend and release resources
   * Flushes any pending writes
   */
  destroy(): Promise<void>;

  // =========================================================================
  // File Operations
  // =========================================================================

  /**
   * Read file contents as Uint8Array
   * @throws Error if file doesn't exist or is a directory
   */
  readFile(path: string): Promise<Uint8Array>;

  /**
   * Write data to file, creating or overwriting
   * @throws Error if parent directory doesn't exist (unless createParents)
   */
  writeFile(path: string, data: Uint8Array, options?: WriteFileOptions): Promise<void>;

  /**
   * Delete a file
   * @throws Error if file doesn't exist or is a directory
   */
  unlink(path: string): Promise<void>;

  /**
   * Copy a file
   * @throws Error if source doesn't exist or dest parent doesn't exist
   */
  copyFile(src: string, dest: string): Promise<void>;

  // =========================================================================
  // Directory Operations
  // =========================================================================

  /**
   * Create a directory
   * @throws Error if parent doesn't exist (unless recursive)
   */
  mkdir(path: string, options?: MkdirOptions): Promise<void>;

  /**
   * Remove a directory
   * @throws Error if not empty (unless recursive) or doesn't exist
   */
  rmdir(path: string, options?: RmdirOptions): Promise<void>;

  /**
   * List directory contents (names only)
   * @throws Error if path doesn't exist or is not a directory
   */
  readdir(path: string): Promise<string[]>;

  /**
   * List directory contents with type information
   * @throws Error if path doesn't exist or is not a directory
   */
  readdirWithTypes(path: string): Promise<DirEntry[]>;

  // =========================================================================
  // Metadata Operations
  // =========================================================================

  /**
   * Get file/directory stats
   * @throws Error if path doesn't exist
   */
  stat(path: string): Promise<FileStat>;

  /**
   * Check if path exists
   */
  exists(path: string): Promise<boolean>;

  /**
   * Rename/move a file or directory
   * @throws Error if source doesn't exist or dest parent doesn't exist
   */
  rename(oldPath: string, newPath: string): Promise<void>;

  // =========================================================================
  // Backend Info
  // =========================================================================

  /** Backend name for identification */
  readonly name: string;

  /** Backend capabilities */
  readonly capabilities: BackendCapabilities;

  // =========================================================================
  // Optional: Persistence
  // =========================================================================

  /**
   * Flush pending writes to persistent storage
   * No-op for non-persistent backends
   */
  flush?(): Promise<void>;

  // =========================================================================
  // Optional: Watching
  // =========================================================================

  /**
   * Watch a path for changes
   * @returns Handle to stop watching
   */
  watch?(path: string, callback: WatchCallback): WatchHandle;
}

/**
 * Mount point configuration
 */
export interface MountPoint {
  /** Mount path (e.g., '/tmp', '/home') */
  path: string;
  /** Backend instance handling this mount */
  backend: FSBackend;
  /** Whether this mount is read-only */
  readonly: boolean;
}

/**
 * Mount manager configuration
 */
export interface MountManagerConfig {
  /** Default backend for paths not covered by mounts */
  defaultBackend: FSBackend;
}

/**
 * Text encoder/decoder utilities
 */
export const TextUtils = {
  encode(text: string): Uint8Array {
    return new TextEncoder().encode(text);
  },

  decode(data: Uint8Array): string {
    return new TextDecoder().decode(data);
  },
};

/**
 * File mode constants
 */
export const FileMode = {
  /** Default file mode (rw-r--r--) */
  FILE: 0o644,
  /** Default directory mode (rwxr-xr-x) */
  DIR: 0o755,
  /** Executable file mode (rwxr-xr-x) */
  EXEC: 0o755,
  /** Read-only file mode (r--r--r--) */
  READONLY: 0o444,
} as const;

/**
 * Common filesystem error codes
 */
export const FSErrorCode = {
  ENOENT: 'ENOENT',
  EEXIST: 'EEXIST',
  EISDIR: 'EISDIR',
  ENOTDIR: 'ENOTDIR',
  ENOTEMPTY: 'ENOTEMPTY',
  EACCES: 'EACCES',
  EINVAL: 'EINVAL',
} as const;

/**
 * Create a filesystem error
 */
export function createFSError(code: keyof typeof FSErrorCode, message: string, path?: string): Error {
  const fullMessage = path ? `${code}: ${message}: ${path}` : `${code}: ${message}`;
  const error = new Error(fullMessage);
  error.name = 'FSError';
  (error as FSError).code = code;
  (error as FSError).path = path;
  return error;
}

/**
 * Filesystem error with code
 */
export interface FSError extends Error {
  code: keyof typeof FSErrorCode;
  path?: string;
}

/**
 * Type guard for FSError
 */
export function isFSError(error: unknown): error is FSError {
  return error instanceof Error && 'code' in error && typeof (error as FSError).code === 'string';
}
