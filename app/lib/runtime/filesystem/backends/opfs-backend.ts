/**
 * =============================================================================
 * BAVINI Container - OPFS Backend
 * =============================================================================
 * Origin Private File System backend for persistent storage.
 * Uses the File System Access API (OPFS) for high-performance file operations.
 *
 * Browser Support:
 * - Chrome 86+
 * - Firefox 111+
 * - Safari 15.2+
 * =============================================================================
 */

/// <reference path="../fs-api.d.ts" />

import type {
  FSBackend,
  FileStat,
  DirEntry,
  MkdirOptions,
  RmdirOptions,
  WriteFileOptions,
  BackendCapabilities,
  BackendInitOptions,
} from '../types';
import { createFSError, FileMode } from '../types';
import { normalizePath, dirname, basename } from '../path-utils';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('OPFSBackend');

/**
 * File metadata stored alongside OPFS files
 */
interface FileMetadata {
  mode: number;
  mtime: number;
  atime: number;
  ctime: number;
  birthtime: number;
}

/**
 * Metadata store key prefix
 */
const METADATA_PREFIX = '.bavini_meta_';

/**
 * Check if OPFS is available in the current environment
 */
export function isOPFSAvailable(): boolean {
  return typeof navigator !== 'undefined' && 'storage' in navigator && 'getDirectory' in navigator.storage;
}

/**
 * OPFS-based filesystem backend
 * Persists data using the Origin Private File System API
 */
export class OPFSBackend implements FSBackend {
  readonly name = 'opfs';
  readonly capabilities: BackendCapabilities = {
    persistent: true,
    syncAccess: false,
    watchable: false,
    maxFileSize: 0,
    maxStorage: 0,
  };

  private _root: FileSystemDirectoryHandle | null = null;
  private _initialized = false;
  private _rootPath: string = '/';

  async init(options?: BackendInitOptions): Promise<void> {
    if (this._initialized) {
      return;
    }

    if (!isOPFSAvailable()) {
      throw createFSError('EINVAL', 'OPFS is not available in this browser');
    }

    try {
      this._root = await navigator.storage.getDirectory();
      this._rootPath = options?.rootPath || '/';
      this._initialized = true;
      logger.info('OPFS backend initialized');
    } catch (error) {
      logger.error('Failed to initialize OPFS:', error);
      throw createFSError('EINVAL', 'Failed to initialize OPFS');
    }
  }

  async destroy(): Promise<void> {
    this._root = null;
    this._initialized = false;
    logger.info('OPFS backend destroyed');
  }

  private _ensureInit(): void {
    if (!this._initialized || !this._root) {
      throw createFSError('EINVAL', 'Backend not initialized');
    }
  }

  /**
   * Navigate to a directory handle by path
   * @param path - Path to navigate to
   * @param create - Create directories if they don't exist
   * @returns Directory handle or null if not found
   */
  private async _getDirectoryHandle(
    path: string,
    create: boolean = false,
  ): Promise<FileSystemDirectoryHandle | null> {
    this._ensureInit();

    const normalized = normalizePath(path);

    if (normalized === '/') {
      return this._root;
    }

    const parts = normalized.split('/').filter(Boolean);
    let current = this._root!;

    for (const part of parts) {
      // Skip metadata files
      if (part.startsWith(METADATA_PREFIX)) {
        return null;
      }

      try {
        current = await current.getDirectoryHandle(part, { create });
      } catch {
        return null;
      }
    }

    return current;
  }

  /**
   * Get file handle by path
   * @param path - Path to the file
   * @param create - Create the file if it doesn't exist
   * @returns File handle or null if not found
   */
  private async _getFileHandle(path: string, create: boolean = false): Promise<FileSystemFileHandle | null> {
    this._ensureInit();

    const normalized = normalizePath(path);
    const parentPath = dirname(normalized);
    const fileName = basename(normalized);

    // Skip metadata files when accessed directly
    if (fileName.startsWith(METADATA_PREFIX)) {
      return null;
    }

    const parent = await this._getDirectoryHandle(parentPath, create);
    if (!parent) {
      return null;
    }

    try {
      return await parent.getFileHandle(fileName, { create });
    } catch {
      return null;
    }
  }

  /**
   * Get or create metadata for a file/directory
   */
  private async _getMetadata(dirHandle: FileSystemDirectoryHandle, name: string): Promise<FileMetadata | null> {
    const metaName = `${METADATA_PREFIX}${name}`;

    try {
      const metaHandle = await dirHandle.getFileHandle(metaName);
      const file = await metaHandle.getFile();
      const text = await file.text();
      return JSON.parse(text) as FileMetadata;
    } catch {
      return null;
    }
  }

  /**
   * Save metadata for a file/directory
   */
  private async _setMetadata(
    dirHandle: FileSystemDirectoryHandle,
    name: string,
    metadata: FileMetadata,
  ): Promise<void> {
    const metaName = `${METADATA_PREFIX}${name}`;

    try {
      const metaHandle = await dirHandle.getFileHandle(metaName, { create: true });
      const writable = await metaHandle.createWritable();
      await writable.write(JSON.stringify(metadata));
      await writable.close();
    } catch (error) {
      logger.warn('Failed to save metadata:', error);
    }
  }

  /**
   * Delete metadata for a file/directory
   */
  private async _deleteMetadata(dirHandle: FileSystemDirectoryHandle, name: string): Promise<void> {
    const metaName = `${METADATA_PREFIX}${name}`;

    try {
      await dirHandle.removeEntry(metaName);
    } catch {
      // Metadata might not exist
    }
  }

  /**
   * Create default metadata
   */
  private _createDefaultMetadata(mode: number): FileMetadata {
    const now = Date.now();
    return {
      mode,
      mtime: now,
      atime: now,
      ctime: now,
      birthtime: now,
    };
  }

  async readFile(path: string): Promise<Uint8Array> {
    this._ensureInit();

    const handle = await this._getFileHandle(path);

    if (!handle) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    try {
      const file = await handle.getFile();
      const buffer = await file.arrayBuffer();

      // Update access time
      const parentPath = dirname(path);
      const fileName = basename(path);
      const parent = await this._getDirectoryHandle(parentPath);
      if (parent) {
        const metadata = await this._getMetadata(parent, fileName);
        if (metadata) {
          metadata.atime = Date.now();
          await this._setMetadata(parent, fileName, metadata);
        }
      }

      return new Uint8Array(buffer);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TypeMismatchError') {
        throw createFSError('EISDIR', 'illegal operation on a directory', path);
      }
      throw error;
    }
  }

  async writeFile(path: string, data: Uint8Array, options?: WriteFileOptions): Promise<void> {
    this._ensureInit();

    const normalized = normalizePath(path);
    const parentPath = dirname(normalized);
    const fileName = basename(normalized);

    // Ensure parent directory exists
    let parent = await this._getDirectoryHandle(parentPath);

    if (!parent) {
      if (options?.createParents) {
        await this.mkdir(parentPath, { recursive: true });
        parent = await this._getDirectoryHandle(parentPath);
      }
      if (!parent) {
        throw createFSError('ENOENT', 'no such file or directory', parentPath);
      }
    }

    try {
      const handle = await parent.getFileHandle(fileName, { create: true });
      const writable = await handle.createWritable();
      // Write data as ArrayBuffer (cast is safe as we're not using SharedArrayBuffer)
      await writable.write(data as unknown as ArrayBuffer);
      await writable.close();

      // Update or create metadata
      const now = Date.now();
      const existingMeta = await this._getMetadata(parent, fileName);
      const metadata: FileMetadata = existingMeta
        ? { ...existingMeta, mtime: now, atime: now }
        : this._createDefaultMetadata(options?.mode ?? FileMode.FILE);

      await this._setMetadata(parent, fileName, metadata);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'TypeMismatchError') {
        throw createFSError('EISDIR', 'illegal operation on a directory', path);
      }
      throw error;
    }
  }

  async unlink(path: string): Promise<void> {
    this._ensureInit();

    const normalized = normalizePath(path);
    const parentPath = dirname(normalized);
    const fileName = basename(normalized);

    const parent = await this._getDirectoryHandle(parentPath);
    if (!parent) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    try {
      // Verify it's a file first
      await parent.getFileHandle(fileName);
      await parent.removeEntry(fileName);
      await this._deleteMetadata(parent, fileName);
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotFoundError') {
          throw createFSError('ENOENT', 'no such file or directory', path);
        }
        if (error.name === 'TypeMismatchError') {
          throw createFSError('EISDIR', 'illegal operation on a directory', path);
        }
      }
      throw error;
    }
  }

  async copyFile(src: string, dest: string): Promise<void> {
    const data = await this.readFile(src);
    await this.writeFile(dest, new Uint8Array(data));
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    this._ensureInit();

    const normalized = normalizePath(path);

    if (normalized === '/') {
      return;
    }

    const parts = normalized.split('/').filter(Boolean);
    let current = this._root!;

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLastPart = i === parts.length - 1;

      try {
        // Check if it exists as a file
        await current.getFileHandle(part);
        throw createFSError('EEXIST', 'file already exists', '/' + parts.slice(0, i + 1).join('/'));
      } catch (error) {
        if (error instanceof DOMException && error.name === 'TypeMismatchError') {
          // It's a directory, continue
          current = await current.getDirectoryHandle(part);
          continue;
        }
        if (error instanceof DOMException && error.name === 'NotFoundError') {
          // Doesn't exist, create it
          if (!options?.recursive && !isLastPart) {
            throw createFSError('ENOENT', 'no such file or directory', '/' + parts.slice(0, i + 1).join('/'));
          }

          current = await current.getDirectoryHandle(part, { create: true });

          // Set metadata for the new directory
          const parentPath = '/' + parts.slice(0, i).join('/') || '/';
          const parentHandle = await this._getDirectoryHandle(parentPath);
          if (parentHandle) {
            await this._setMetadata(parentHandle, part, this._createDefaultMetadata(options?.mode ?? FileMode.DIR));
          }
          continue;
        }
        // Re-throw FSError
        throw error;
      }
    }
  }

  async rmdir(path: string, options?: RmdirOptions): Promise<void> {
    this._ensureInit();

    const normalized = normalizePath(path);

    if (normalized === '/') {
      throw createFSError('EINVAL', 'cannot remove root directory');
    }

    const parentPath = dirname(normalized);
    const dirName = basename(normalized);

    const parent = await this._getDirectoryHandle(parentPath);
    if (!parent) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    try {
      // Verify it's a directory
      const dir = await parent.getDirectoryHandle(dirName);

      // Check if empty when not recursive
      if (!options?.recursive) {
        const entries: string[] = [];
        for await (const name of dir.keys()) {
          if (!name.startsWith(METADATA_PREFIX)) {
            entries.push(name);
          }
        }
        if (entries.length > 0) {
          throw createFSError('ENOTEMPTY', 'directory not empty', path);
        }
      }

      await parent.removeEntry(dirName, { recursive: options?.recursive ?? false });
      await this._deleteMetadata(parent, dirName);
    } catch (error) {
      if (error instanceof DOMException) {
        if (error.name === 'NotFoundError') {
          throw createFSError('ENOENT', 'no such file or directory', path);
        }
        if (error.name === 'TypeMismatchError') {
          throw createFSError('ENOTDIR', 'not a directory', path);
        }
      }
      throw error;
    }
  }

  async readdir(path: string): Promise<string[]> {
    this._ensureInit();

    const dir = await this._getDirectoryHandle(path);

    if (!dir) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    const entries: string[] = [];

    for await (const name of dir.keys()) {
      // Filter out metadata files
      if (!name.startsWith(METADATA_PREFIX)) {
        entries.push(name);
      }
    }

    return entries;
  }

  async readdirWithTypes(path: string): Promise<DirEntry[]> {
    this._ensureInit();

    const dir = await this._getDirectoryHandle(path);

    if (!dir) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    const entries: DirEntry[] = [];

    for await (const [name, handle] of dir.entries()) {
      // Filter out metadata files
      if (!name.startsWith(METADATA_PREFIX)) {
        entries.push({
          name,
          isDirectory: handle.kind === 'directory',
          isFile: handle.kind === 'file',
        });
      }
    }

    return entries;
  }

  async stat(path: string): Promise<FileStat> {
    this._ensureInit();

    const normalized = normalizePath(path);

    if (normalized === '/') {
      return {
        isFile: false,
        isDirectory: true,
        size: 0,
        mode: FileMode.DIR,
        mtime: Date.now(),
        atime: Date.now(),
        ctime: Date.now(),
        birthtime: Date.now(),
      };
    }

    const parentPath = dirname(normalized);
    const name = basename(normalized);

    const parent = await this._getDirectoryHandle(parentPath);
    if (!parent) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    // Try as directory first
    try {
      await parent.getDirectoryHandle(name);
      const metadata = (await this._getMetadata(parent, name)) || this._createDefaultMetadata(FileMode.DIR);

      return {
        isFile: false,
        isDirectory: true,
        size: 0,
        mode: metadata.mode,
        mtime: metadata.mtime,
        atime: metadata.atime,
        ctime: metadata.ctime,
        birthtime: metadata.birthtime,
      };
    } catch (error) {
      if (!(error instanceof DOMException)) {
        throw error;
      }
    }

    // Try as file
    try {
      const handle = await parent.getFileHandle(name);
      const file = await handle.getFile();
      const metadata = (await this._getMetadata(parent, name)) || this._createDefaultMetadata(FileMode.FILE);

      return {
        isFile: true,
        isDirectory: false,
        size: file.size,
        mode: metadata.mode,
        mtime: metadata.mtime,
        atime: metadata.atime,
        ctime: metadata.ctime,
        birthtime: metadata.birthtime,
      };
    } catch {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.stat(path);
      return true;
    } catch {
      return false;
    }
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    // OPFS doesn't support rename directly, so we copy + delete
    const oldStat = await this.stat(oldPath);

    if (oldStat.isDirectory) {
      // For directories, recursively copy
      await this._copyDirectory(oldPath, newPath);
      await this.rmdir(oldPath, { recursive: true });
    } else {
      // For files, copy then delete
      const data = await this.readFile(oldPath);
      await this.writeFile(newPath, data);
      await this.unlink(oldPath);
    }
  }

  /**
   * Recursively copy a directory
   */
  private async _copyDirectory(src: string, dest: string): Promise<void> {
    await this.mkdir(dest, { recursive: true });

    const entries = await this.readdirWithTypes(src);

    for (const entry of entries) {
      const srcPath = `${src}/${entry.name}`;
      const destPath = `${dest}/${entry.name}`;

      if (entry.isDirectory) {
        await this._copyDirectory(srcPath, destPath);
      } else {
        const data = await this.readFile(srcPath);
        await this.writeFile(destPath, data);
      }
    }
  }

  async flush(): Promise<void> {
    // OPFS writes are already persisted
  }

  /**
   * Clear all data (for testing)
   */
  async clear(): Promise<void> {
    this._ensureInit();

    const entries: string[] = [];
    for await (const name of this._root!.keys()) {
      entries.push(name);
    }

    for (const name of entries) {
      try {
        await this._root!.removeEntry(name, { recursive: true });
      } catch {
        // Ignore errors during clear
      }
    }

    logger.debug('OPFS backend cleared');
  }
}
