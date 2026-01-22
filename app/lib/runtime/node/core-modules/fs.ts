/**
 * =============================================================================
 * BAVINI Container - FS Module
 * =============================================================================
 * Node.js fs module implementation using BAVINI VirtualFS.
 * =============================================================================
 */

import type { MountManager } from '../../filesystem';
import type { Stats, Dirent, BufferEncoding } from '../types';
import { Buffer } from '../globals/buffer';
import { EventEmitter } from './events';

/**
 * File system reference (set by runtime)
 */
let _fs: MountManager | null = null;

/**
 * Set the filesystem implementation
 */
export function setFilesystem(fs: MountManager): void {
  _fs = fs;
}

/**
 * Get the filesystem implementation
 */
function getFs(): MountManager {
  if (!_fs) {
    throw new Error('Filesystem not initialized. Call setFilesystem() first.');
  }

  return _fs;
}

/**
 * Read options
 */
export interface ReadOptions {
  encoding?: BufferEncoding | null;
  flag?: string;
}

/**
 * Write options
 */
export interface WriteOptions {
  encoding?: BufferEncoding | null;
  mode?: number;
  flag?: string;
}

/**
 * Mkdir options
 */
export interface MkdirOptions {
  recursive?: boolean;
  mode?: number;
}

/**
 * Rmdir options
 */
export interface RmdirOptions {
  recursive?: boolean;
  maxRetries?: number;
  retryDelay?: number;
}

/**
 * Readdir options
 */
export interface ReaddirOptions {
  encoding?: BufferEncoding | null;
  withFileTypes?: boolean;
}

// ============================================================================
// Async Functions
// ============================================================================

/**
 * Read file asynchronously
 */
export function readFile(
  path: string,
  options: ReadOptions | BufferEncoding | null | undefined,
  callback: (err: NodeJS.ErrnoException | null, data: Buffer | string) => void,
): void;
export function readFile(path: string, callback: (err: NodeJS.ErrnoException | null, data: Buffer | string) => void): void;
export function readFile(
  path: string,
  optionsOrCallback?: ReadOptions | BufferEncoding | null | ((err: NodeJS.ErrnoException | null, data: Buffer | string) => void),
  maybeCallback?: (err: NodeJS.ErrnoException | null, data: Buffer | string) => void,
): void {
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!;
  const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;
  const encoding = typeof options === 'string' ? options : options?.encoding;

  getFs()
    .readFile(path)
    .then((data) => {
      const buffer = Buffer.from(data);
      callback(null, encoding ? buffer.toString(encoding) : buffer);
    })
    .catch((err) => callback(createError(err, path), null as unknown as Buffer));
}

/**
 * Write file asynchronously
 */
export function writeFile(
  path: string,
  data: string | Buffer | Uint8Array,
  options: WriteOptions | BufferEncoding | null | undefined,
  callback: (err: NodeJS.ErrnoException | null) => void,
): void;
export function writeFile(
  path: string,
  data: string | Buffer | Uint8Array,
  callback: (err: NodeJS.ErrnoException | null) => void,
): void;
export function writeFile(
  path: string,
  data: string | Buffer | Uint8Array,
  optionsOrCallback?: WriteOptions | BufferEncoding | null | ((err: NodeJS.ErrnoException | null) => void),
  maybeCallback?: (err: NodeJS.ErrnoException | null) => void,
): void {
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!;
  const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;
  const encoding = typeof options === 'string' ? options : options?.encoding ?? 'utf8';

  let buffer: Uint8Array;

  if (typeof data === 'string') {
    buffer = new TextEncoder().encode(data);
  } else {
    buffer = data;
  }

  getFs()
    .writeFile(path, buffer)
    .then(() => callback(null))
    .catch((err) => callback(createError(err, path)));
}

/**
 * Append to file asynchronously
 */
export function appendFile(
  path: string,
  data: string | Buffer,
  options: WriteOptions | BufferEncoding | null | undefined,
  callback: (err: NodeJS.ErrnoException | null) => void,
): void;
export function appendFile(path: string, data: string | Buffer, callback: (err: NodeJS.ErrnoException | null) => void): void;
export function appendFile(
  path: string,
  data: string | Buffer,
  optionsOrCallback?: WriteOptions | BufferEncoding | null | ((err: NodeJS.ErrnoException | null) => void),
  maybeCallback?: (err: NodeJS.ErrnoException | null) => void,
): void {
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!;

  // Read existing content, append, write back
  readFile(path, (err, existing) => {
    if (err && (err as NodeJS.ErrnoException).code !== 'ENOENT') {
      callback(err);
      return;
    }

    const existingBuffer = err ? Buffer.alloc(0) : Buffer.isBuffer(existing) ? existing : Buffer.from(existing as string);
    const newBuffer = typeof data === 'string' ? Buffer.from(data) : data;
    const combined = Buffer.concat([existingBuffer, newBuffer]);

    writeFile(path, combined, callback);
  });
}

/**
 * Unlink file asynchronously
 */
export function unlink(path: string, callback: (err: NodeJS.ErrnoException | null) => void): void {
  getFs()
    .unlink(path)
    .then(() => callback(null))
    .catch((err) => callback(createError(err, path)));
}

/**
 * Make directory asynchronously
 */
export function mkdir(
  path: string,
  options: MkdirOptions | number | undefined,
  callback: (err: NodeJS.ErrnoException | null) => void,
): void;
export function mkdir(path: string, callback: (err: NodeJS.ErrnoException | null) => void): void;
export function mkdir(
  path: string,
  optionsOrCallback?: MkdirOptions | number | ((err: NodeJS.ErrnoException | null) => void),
  maybeCallback?: (err: NodeJS.ErrnoException | null) => void,
): void {
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!;
  const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;
  const opts = typeof options === 'number' ? { mode: options } : options;

  getFs()
    .mkdir(path, { recursive: opts?.recursive })
    .then(() => callback(null))
    .catch((err) => callback(createError(err, path)));
}

/**
 * Remove directory asynchronously
 */
export function rmdir(
  path: string,
  options: RmdirOptions | undefined,
  callback: (err: NodeJS.ErrnoException | null) => void,
): void;
export function rmdir(path: string, callback: (err: NodeJS.ErrnoException | null) => void): void;
export function rmdir(
  path: string,
  optionsOrCallback?: RmdirOptions | ((err: NodeJS.ErrnoException | null) => void),
  maybeCallback?: (err: NodeJS.ErrnoException | null) => void,
): void {
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!;
  const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;

  getFs()
    .rmdir(path, { recursive: options?.recursive })
    .then(() => callback(null))
    .catch((err) => callback(createError(err, path)));
}

/**
 * Remove file or directory asynchronously
 */
export function rm(
  path: string,
  options: { recursive?: boolean; force?: boolean } | undefined,
  callback: (err: NodeJS.ErrnoException | null) => void,
): void;
export function rm(path: string, callback: (err: NodeJS.ErrnoException | null) => void): void;
export function rm(
  path: string,
  optionsOrCallback?: { recursive?: boolean; force?: boolean } | ((err: NodeJS.ErrnoException | null) => void),
  maybeCallback?: (err: NodeJS.ErrnoException | null) => void,
): void {
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!;
  const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;

  stat(path, (err, stats) => {
    if (err) {
      if (options?.force && (err as NodeJS.ErrnoException).code === 'ENOENT') {
        callback(null);
        return;
      }

      callback(err);
      return;
    }

    if (stats.isDirectory()) {
      rmdir(path, { recursive: options?.recursive }, callback);
    } else {
      unlink(path, callback);
    }
  });
}

/**
 * Read directory asynchronously
 */
export function readdir(
  path: string,
  options: ReaddirOptions | BufferEncoding | null | undefined,
  callback: (err: NodeJS.ErrnoException | null, files: string[] | Dirent[]) => void,
): void;
export function readdir(path: string, callback: (err: NodeJS.ErrnoException | null, files: string[] | Dirent[]) => void): void;
export function readdir(
  path: string,
  optionsOrCallback?: ReaddirOptions | BufferEncoding | null | ((err: NodeJS.ErrnoException | null, files: string[] | Dirent[]) => void),
  maybeCallback?: (err: NodeJS.ErrnoException | null, files: string[] | Dirent[]) => void,
): void {
  const callback = typeof optionsOrCallback === 'function' ? optionsOrCallback : maybeCallback!;
  const options = typeof optionsOrCallback === 'function' ? undefined : optionsOrCallback;
  const withFileTypes = typeof options === 'object' && options?.withFileTypes;

  if (withFileTypes) {
    getFs()
      .readdirWithTypes(path)
      .then((entries) => {
        const dirents: Dirent[] = entries.map((e) => ({
          name: e.name,
          isFile: () => e.isFile,
          isDirectory: () => e.isDirectory,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isSymbolicLink: () => (e as { isSymlink?: boolean }).isSymlink ?? false,
          isFIFO: () => false,
          isSocket: () => false,
        }));
        callback(null, dirents);
      })
      .catch((err) => callback(createError(err, path), []));
  } else {
    getFs()
      .readdir(path)
      .then((files) => callback(null, files))
      .catch((err) => callback(createError(err, path), []));
  }
}

/**
 * Get file stats asynchronously
 */
export function stat(path: string, callback: (err: NodeJS.ErrnoException | null, stats: Stats) => void): void {
  getFs()
    .stat(path)
    .then((s) => {
      const stats = createStats(s);
      callback(null, stats);
    })
    .catch((err) => callback(createError(err, path), null as unknown as Stats));
}

/**
 * Get file stats (don't follow symlinks)
 */
export function lstat(path: string, callback: (err: NodeJS.ErrnoException | null, stats: Stats) => void): void {
  // Our VFS doesn't distinguish, so same as stat
  stat(path, callback);
}

/**
 * Check if file exists
 */
export function exists(path: string, callback: (exists: boolean) => void): void {
  getFs()
    .exists(path)
    .then((e) => callback(e))
    .catch(() => callback(false));
}

/**
 * Rename file
 */
export function rename(oldPath: string, newPath: string, callback: (err: NodeJS.ErrnoException | null) => void): void {
  getFs()
    .rename(oldPath, newPath)
    .then(() => callback(null))
    .catch((err) => callback(createError(err, oldPath)));
}

/**
 * Copy file
 */
export function copyFile(src: string, dest: string, callback: (err: NodeJS.ErrnoException | null) => void): void {
  getFs()
    .copyFile(src, dest)
    .then(() => callback(null))
    .catch((err) => callback(createError(err, src)));
}

// ============================================================================
// Sync Functions
// ============================================================================

/**
 * Read file synchronously
 */
export function readFileSync(path: string, options?: ReadOptions | BufferEncoding | null): Buffer | string {
  // Note: True sync not possible in browser without Atomics
  // This is a placeholder that will throw
  throw new Error('Sync operations not supported in browser environment. Use async versions.');
}

/**
 * Write file synchronously
 */
export function writeFileSync(path: string, data: string | Buffer, options?: WriteOptions | BufferEncoding): void {
  throw new Error('Sync operations not supported in browser environment. Use async versions.');
}

/**
 * Check if file exists synchronously
 */
export function existsSync(path: string): boolean {
  throw new Error('Sync operations not supported in browser environment. Use async versions.');
}

/**
 * Get stats synchronously
 */
export function statSync(path: string): Stats {
  throw new Error('Sync operations not supported in browser environment. Use async versions.');
}

/**
 * Read directory synchronously
 */
export function readdirSync(path: string, options?: ReaddirOptions | BufferEncoding): string[] | Dirent[] {
  throw new Error('Sync operations not supported in browser environment. Use async versions.');
}

/**
 * Make directory synchronously
 */
export function mkdirSync(path: string, options?: MkdirOptions | number): void {
  throw new Error('Sync operations not supported in browser environment. Use async versions.');
}

/**
 * Remove directory synchronously
 */
export function rmdirSync(path: string, options?: RmdirOptions): void {
  throw new Error('Sync operations not supported in browser environment. Use async versions.');
}

/**
 * Unlink file synchronously
 */
export function unlinkSync(path: string): void {
  throw new Error('Sync operations not supported in browser environment. Use async versions.');
}

// ============================================================================
// Promises API
// ============================================================================

export const promises = {
  async readFile(path: string, options?: ReadOptions | BufferEncoding | null): Promise<Buffer | string> {
    const encoding = typeof options === 'string' ? options : options?.encoding;
    const data = await getFs().readFile(path);
    const buffer = Buffer.from(data);
    return encoding ? buffer.toString(encoding) : buffer;
  },

  async writeFile(path: string, data: string | Buffer | Uint8Array, options?: WriteOptions | BufferEncoding): Promise<void> {
    const buffer = typeof data === 'string' ? new TextEncoder().encode(data) : data;
    await getFs().writeFile(path, buffer);
  },

  async appendFile(path: string, data: string | Buffer, options?: WriteOptions | BufferEncoding): Promise<void> {
    try {
      const existing = await promises.readFile(path);
      const existingBuffer = Buffer.isBuffer(existing) ? existing : Buffer.from(existing as string);
      const newBuffer = typeof data === 'string' ? Buffer.from(data) : data;
      await promises.writeFile(path, Buffer.concat([existingBuffer, newBuffer]));
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        await promises.writeFile(path, data);
      } else {
        throw err;
      }
    }
  },

  async unlink(path: string): Promise<void> {
    await getFs().unlink(path);
  },

  async mkdir(path: string, options?: MkdirOptions | number): Promise<void> {
    const opts = typeof options === 'number' ? { mode: options } : options;
    await getFs().mkdir(path, { recursive: opts?.recursive });
  },

  async rmdir(path: string, options?: RmdirOptions): Promise<void> {
    await getFs().rmdir(path, { recursive: options?.recursive });
  },

  async rm(path: string, options?: { recursive?: boolean; force?: boolean }): Promise<void> {
    try {
      const s = await getFs().stat(path);

      if (s.isDirectory) {
        await getFs().rmdir(path, { recursive: options?.recursive });
      } else {
        await getFs().unlink(path);
      }
    } catch (err) {
      if (!options?.force || (err as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw err;
      }
    }
  },

  async readdir(path: string, options?: ReaddirOptions | BufferEncoding): Promise<string[] | Dirent[]> {
    const withFileTypes = typeof options === 'object' && options?.withFileTypes;

    if (withFileTypes) {
      const entries = await getFs().readdirWithTypes(path);
      return entries.map((e) => ({
        name: e.name,
        isFile: () => e.isFile,
        isDirectory: () => e.isDirectory,
        isBlockDevice: () => false,
        isCharacterDevice: () => false,
        isSymbolicLink: () => false, // Browser filesystem doesn't support symlinks
        isFIFO: () => false,
        isSocket: () => false,
      }));
    }

    return getFs().readdir(path);
  },

  async stat(path: string): Promise<Stats> {
    const s = await getFs().stat(path);
    return createStats(s);
  },

  async lstat(path: string): Promise<Stats> {
    return promises.stat(path);
  },

  async rename(oldPath: string, newPath: string): Promise<void> {
    await getFs().rename(oldPath, newPath);
  },

  async copyFile(src: string, dest: string): Promise<void> {
    await getFs().copyFile(src, dest);
  },

  async access(path: string): Promise<void> {
    const exists = await getFs().exists(path);

    if (!exists) {
      throw createError(new Error('ENOENT'), path);
    }
  },
};

// ============================================================================
// Helpers
// ============================================================================

/**
 * Create Stats object from VFS stat
 */
function createStats(s: { isFile: boolean; isDirectory: boolean; size: number; mtime: Date | number; ctime?: Date | number; mode?: number }): Stats {
  const mtimeMs = typeof s.mtime === 'number' ? s.mtime : s.mtime.getTime();
  const ctimeMs = s.ctime ? (typeof s.ctime === 'number' ? s.ctime : s.ctime.getTime()) : mtimeMs;
  const mtime = typeof s.mtime === 'number' ? new Date(s.mtime) : s.mtime;
  const ctime = s.ctime ? (typeof s.ctime === 'number' ? new Date(s.ctime) : s.ctime) : mtime;

  return {
    isFile: () => s.isFile,
    isDirectory: () => s.isDirectory,
    isBlockDevice: () => false,
    isCharacterDevice: () => false,
    isSymbolicLink: () => false,
    isFIFO: () => false,
    isSocket: () => false,
    dev: 0,
    ino: 0,
    mode: s.mode ?? 0o644,
    nlink: 1,
    uid: 0,
    gid: 0,
    rdev: 0,
    size: s.size,
    blksize: 4096,
    blocks: Math.ceil(s.size / 512),
    atimeMs: mtimeMs,
    mtimeMs: mtimeMs,
    ctimeMs: ctimeMs,
    birthtimeMs: ctimeMs,
    atime: mtime,
    mtime: mtime,
    ctime: ctime,
    birthtime: ctime,
  };
}

/**
 * Create error with proper code
 */
function createError(err: unknown, path: string): NodeJS.ErrnoException {
  const message = err instanceof Error ? err.message : String(err);
  const error = new Error(message) as NodeJS.ErrnoException;

  if (message.includes('ENOENT')) {
    error.code = 'ENOENT';
    error.errno = -2;
  } else if (message.includes('EEXIST')) {
    error.code = 'EEXIST';
    error.errno = -17;
  } else if (message.includes('ENOTDIR')) {
    error.code = 'ENOTDIR';
    error.errno = -20;
  } else if (message.includes('EISDIR')) {
    error.code = 'EISDIR';
    error.errno = -21;
  } else if (message.includes('ENOTEMPTY')) {
    error.code = 'ENOTEMPTY';
    error.errno = -39;
  } else {
    error.code = 'EIO';
    error.errno = -5;
  }

  error.path = path;
  error.syscall = 'stat';

  return error;
}

/**
 * Constants
 */
export const constants = {
  F_OK: 0,
  R_OK: 4,
  W_OK: 2,
  X_OK: 1,
  COPYFILE_EXCL: 1,
  COPYFILE_FICLONE: 2,
  COPYFILE_FICLONE_FORCE: 4,
  O_RDONLY: 0,
  O_WRONLY: 1,
  O_RDWR: 2,
  O_CREAT: 64,
  O_EXCL: 128,
  O_TRUNC: 512,
  O_APPEND: 1024,
  S_IFMT: 61440,
  S_IFREG: 32768,
  S_IFDIR: 16384,
  S_IFLNK: 40960,
};

/**
 * Default export
 */
export default {
  readFile,
  writeFile,
  appendFile,
  unlink,
  mkdir,
  rmdir,
  rm,
  readdir,
  stat,
  lstat,
  exists,
  rename,
  copyFile,
  readFileSync,
  writeFileSync,
  existsSync,
  statSync,
  readdirSync,
  mkdirSync,
  rmdirSync,
  unlinkSync,
  promises,
  constants,
  setFilesystem,
};
