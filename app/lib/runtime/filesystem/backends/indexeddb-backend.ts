/**
 * =============================================================================
 * BAVINI Container - IndexedDB Backend
 * =============================================================================
 * IndexedDB-based filesystem backend for persistent storage fallback.
 * Used when OPFS is not available (Safari < 15.2, older browsers).
 *
 * Storage Structure:
 * - 'files' store: { path: string, data: Uint8Array, metadata: FileMetadata }
 * - 'directories' store: { path: string, metadata: DirMetadata }
 * =============================================================================
 */

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
import { normalizePath, dirname, basename, isInside } from '../path-utils';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('IndexedDBBackend');

const DB_NAME = 'bavini-filesystem';
const DB_VERSION = 1;
const FILES_STORE = 'files';
const DIRS_STORE = 'directories';

/**
 * File record in IndexedDB
 */
interface FileRecord {
  path: string;
  data: Uint8Array;
  mode: number;
  mtime: number;
  atime: number;
  ctime: number;
  birthtime: number;
}

/**
 * Directory record in IndexedDB
 */
interface DirRecord {
  path: string;
  mode: number;
  mtime: number;
  atime: number;
  ctime: number;
  birthtime: number;
}

/**
 * IndexedDB-based filesystem backend
 * Stores files and directories in IndexedDB for persistence
 */
export class IndexedDBBackend implements FSBackend {
  readonly name = 'indexeddb';
  readonly capabilities: BackendCapabilities = {
    persistent: true,
    syncAccess: false,
    watchable: false,
    maxFileSize: 0,
    maxStorage: 0,
  };

  private _db: IDBDatabase | null = null;
  private _initialized = false;

  async init(_options?: BackendInitOptions): Promise<void> {
    if (this._initialized) {
      return;
    }

    try {
      this._db = await this._openDB();
      this._initialized = true;

      // Ensure root directory exists
      const rootExists = await this._dirExists('/');
      if (!rootExists) {
        await this._createDirRecord('/');
      }

      logger.info('IndexedDB backend initialized');
    } catch (error) {
      logger.error('Failed to initialize IndexedDB:', error);
      throw createFSError('EINVAL', 'Failed to initialize IndexedDB');
    }
  }

  async destroy(): Promise<void> {
    if (this._db) {
      this._db.close();
      this._db = null;
    }
    this._initialized = false;
    logger.info('IndexedDB backend destroyed');
  }

  private _ensureInit(): void {
    if (!this._initialized || !this._db) {
      throw createFSError('EINVAL', 'Backend not initialized');
    }
  }

  private _openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Create files store with path index
        if (!db.objectStoreNames.contains(FILES_STORE)) {
          const filesStore = db.createObjectStore(FILES_STORE, { keyPath: 'path' });
          filesStore.createIndex('path', 'path', { unique: true });
        }

        // Create directories store with path index
        if (!db.objectStoreNames.contains(DIRS_STORE)) {
          const dirsStore = db.createObjectStore(DIRS_STORE, { keyPath: 'path' });
          dirsStore.createIndex('path', 'path', { unique: true });
        }
      };
    });
  }

  private _transaction(
    stores: string[],
    mode: IDBTransactionMode,
  ): { transaction: IDBTransaction; getStore: (name: string) => IDBObjectStore } {
    const transaction = this._db!.transaction(stores, mode);
    return {
      transaction,
      getStore: (name: string) => transaction.objectStore(name),
    };
  }

  private async _getFileRecord(path: string): Promise<FileRecord | null> {
    return new Promise((resolve, reject) => {
      const { getStore } = this._transaction([FILES_STORE], 'readonly');
      const request = getStore(FILES_STORE).get(path);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private async _getDirRecord(path: string): Promise<DirRecord | null> {
    return new Promise((resolve, reject) => {
      const { getStore } = this._transaction([DIRS_STORE], 'readonly');
      const request = getStore(DIRS_STORE).get(path);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  private async _dirExists(path: string): Promise<boolean> {
    const record = await this._getDirRecord(path);
    return record !== null;
  }

  private async _fileExists(path: string): Promise<boolean> {
    const record = await this._getFileRecord(path);
    return record !== null;
  }

  private async _createDirRecord(path: string, mode: number = FileMode.DIR): Promise<void> {
    const now = Date.now();
    const record: DirRecord = {
      path,
      mode,
      mtime: now,
      atime: now,
      ctime: now,
      birthtime: now,
    };

    return new Promise((resolve, reject) => {
      const { getStore, transaction } = this._transaction([DIRS_STORE], 'readwrite');
      const request = getStore(DIRS_STORE).put(record);
      transaction.oncomplete = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async _deleteDirRecord(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const { getStore, transaction } = this._transaction([DIRS_STORE], 'readwrite');
      const request = getStore(DIRS_STORE).delete(path);
      transaction.oncomplete = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async _createFileRecord(
    path: string,
    data: Uint8Array,
    mode: number = FileMode.FILE,
    existingRecord?: FileRecord,
  ): Promise<void> {
    const now = Date.now();
    const record: FileRecord = existingRecord
      ? { ...existingRecord, data, mtime: now, atime: now }
      : { path, data, mode, mtime: now, atime: now, ctime: now, birthtime: now };

    return new Promise((resolve, reject) => {
      const { getStore, transaction } = this._transaction([FILES_STORE], 'readwrite');
      const request = getStore(FILES_STORE).put(record);
      transaction.oncomplete = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async _deleteFileRecord(path: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const { getStore, transaction } = this._transaction([FILES_STORE], 'readwrite');
      const request = getStore(FILES_STORE).delete(path);
      transaction.oncomplete = () => resolve();
      request.onerror = () => reject(request.error);
    });
  }

  private async _getAllFilesInDir(dirPath: string): Promise<string[]> {
    const normalized = normalizePath(dirPath);

    return new Promise((resolve, reject) => {
      const { getStore } = this._transaction([FILES_STORE], 'readonly');
      const request = getStore(FILES_STORE).getAllKeys();

      request.onsuccess = () => {
        const paths = request.result as string[];
        const children = paths.filter((p) => {
          if (!isInside(normalized, p) || p === normalized) {
            return false;
          }
          // Only direct children
          const relative = p.substring(normalized === '/' ? 1 : normalized.length + 1);
          return !relative.includes('/');
        });
        resolve(children);
      };

      request.onerror = () => reject(request.error);
    });
  }

  private async _getAllDirsInDir(dirPath: string): Promise<string[]> {
    const normalized = normalizePath(dirPath);

    return new Promise((resolve, reject) => {
      const { getStore } = this._transaction([DIRS_STORE], 'readonly');
      const request = getStore(DIRS_STORE).getAllKeys();

      request.onsuccess = () => {
        const paths = request.result as string[];
        const children = paths.filter((p) => {
          if (!isInside(normalized, p) || p === normalized) {
            return false;
          }
          // Only direct children
          const relative = p.substring(normalized === '/' ? 1 : normalized.length + 1);
          return !relative.includes('/');
        });
        resolve(children);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async readFile(path: string): Promise<Uint8Array> {
    this._ensureInit();

    const normalized = normalizePath(path);
    const record = await this._getFileRecord(normalized);

    if (!record) {
      // Check if it's a directory
      const isDirExisting = await this._dirExists(normalized);
      if (isDirExisting) {
        throw createFSError('EISDIR', 'illegal operation on a directory', path);
      }
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    // Update access time
    record.atime = Date.now();
    await this._createFileRecord(normalized, record.data, record.mode, record);

    return record.data;
  }

  async writeFile(path: string, data: Uint8Array, options?: WriteFileOptions): Promise<void> {
    this._ensureInit();

    const normalized = normalizePath(path);
    const parentPath = dirname(normalized);

    // Check if parent exists
    const parentExists = await this._dirExists(parentPath);
    if (!parentExists) {
      if (options?.createParents) {
        await this.mkdir(parentPath, { recursive: true });
      } else {
        throw createFSError('ENOENT', 'no such file or directory', parentPath);
      }
    }

    // Check if path is a directory
    const isDirExisting = await this._dirExists(normalized);
    if (isDirExisting) {
      throw createFSError('EISDIR', 'illegal operation on a directory', path);
    }

    const existingRecord = await this._getFileRecord(normalized);
    await this._createFileRecord(normalized, data, options?.mode ?? FileMode.FILE, existingRecord ?? undefined);
  }

  async unlink(path: string): Promise<void> {
    this._ensureInit();

    const normalized = normalizePath(path);

    // Check if it's a directory
    const isDirExisting = await this._dirExists(normalized);
    if (isDirExisting) {
      throw createFSError('EISDIR', 'illegal operation on a directory', path);
    }

    const exists = await this._fileExists(normalized);
    if (!exists) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    await this._deleteFileRecord(normalized);
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

    // Check if file exists with same name
    const fileExists = await this._fileExists(normalized);
    if (fileExists) {
      throw createFSError('EEXIST', 'file already exists', path);
    }

    // Check if directory already exists
    const dirExists = await this._dirExists(normalized);
    if (dirExists) {
      return;
    }

    // Create parent directories if needed
    const parts = normalized.split('/').filter(Boolean);
    let currentPath = '';

    for (let i = 0; i < parts.length; i++) {
      currentPath = '/' + parts.slice(0, i + 1).join('/');
      const isLastPart = i === parts.length - 1;

      const exists = await this._dirExists(currentPath);
      if (!exists) {
        if (!options?.recursive && !isLastPart) {
          throw createFSError('ENOENT', 'no such file or directory', currentPath);
        }
        await this._createDirRecord(currentPath, options?.mode ?? FileMode.DIR);
      }
    }
  }

  async rmdir(path: string, options?: RmdirOptions): Promise<void> {
    this._ensureInit();

    const normalized = normalizePath(path);

    if (normalized === '/') {
      throw createFSError('EINVAL', 'cannot remove root directory');
    }

    const exists = await this._dirExists(normalized);
    if (!exists) {
      // Check if it's a file
      const fileExists = await this._fileExists(normalized);
      if (fileExists) {
        throw createFSError('ENOTDIR', 'not a directory', path);
      }
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    // Check if directory is empty
    const childFiles = await this._getAllFilesInDir(normalized);
    const childDirs = await this._getAllDirsInDir(normalized);

    if ((childFiles.length > 0 || childDirs.length > 0) && !options?.recursive) {
      throw createFSError('ENOTEMPTY', 'directory not empty', path);
    }

    if (options?.recursive) {
      // Delete all children recursively
      for (const filePath of childFiles) {
        await this._deleteFileRecord(filePath);
      }

      // Get all subdirectories (including nested)
      const allDirs = await this._getAllNestedDirs(normalized);
      // Sort by depth (deepest first) to delete children before parents
      allDirs.sort((a, b) => b.split('/').length - a.split('/').length);

      for (const dirPath of allDirs) {
        const filesInDir = await this._getAllFilesInDir(dirPath);
        for (const filePath of filesInDir) {
          await this._deleteFileRecord(filePath);
        }
        await this._deleteDirRecord(dirPath);
      }
    }

    await this._deleteDirRecord(normalized);
  }

  private async _getAllNestedDirs(dirPath: string): Promise<string[]> {
    const normalized = normalizePath(dirPath);

    return new Promise((resolve, reject) => {
      const { getStore } = this._transaction([DIRS_STORE], 'readonly');
      const request = getStore(DIRS_STORE).getAllKeys();

      request.onsuccess = () => {
        const paths = request.result as string[];
        const nested = paths.filter((p) => isInside(normalized, p) && p !== normalized);
        resolve(nested);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async readdir(path: string): Promise<string[]> {
    this._ensureInit();

    const normalized = normalizePath(path);

    const exists = await this._dirExists(normalized);
    if (!exists) {
      const fileExists = await this._fileExists(normalized);
      if (fileExists) {
        throw createFSError('ENOTDIR', 'not a directory', path);
      }
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    const childFiles = await this._getAllFilesInDir(normalized);
    const childDirs = await this._getAllDirsInDir(normalized);

    const entries = new Set<string>();

    for (const filePath of childFiles) {
      entries.add(basename(filePath));
    }

    for (const dirPath of childDirs) {
      entries.add(basename(dirPath));
    }

    return Array.from(entries);
  }

  async readdirWithTypes(path: string): Promise<DirEntry[]> {
    this._ensureInit();

    const normalized = normalizePath(path);

    const exists = await this._dirExists(normalized);
    if (!exists) {
      const fileExists = await this._fileExists(normalized);
      if (fileExists) {
        throw createFSError('ENOTDIR', 'not a directory', path);
      }
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    const childFiles = await this._getAllFilesInDir(normalized);
    const childDirs = await this._getAllDirsInDir(normalized);

    const entries: DirEntry[] = [];

    for (const filePath of childFiles) {
      entries.push({
        name: basename(filePath),
        isFile: true,
        isDirectory: false,
      });
    }

    for (const dirPath of childDirs) {
      entries.push({
        name: basename(dirPath),
        isFile: false,
        isDirectory: true,
      });
    }

    return entries;
  }

  async stat(path: string): Promise<FileStat> {
    this._ensureInit();

    const normalized = normalizePath(path);

    // Check as directory first
    const dirRecord = await this._getDirRecord(normalized);
    if (dirRecord) {
      return {
        isFile: false,
        isDirectory: true,
        size: 0,
        mode: dirRecord.mode,
        mtime: dirRecord.mtime,
        atime: dirRecord.atime,
        ctime: dirRecord.ctime,
        birthtime: dirRecord.birthtime,
      };
    }

    // Check as file
    const fileRecord = await this._getFileRecord(normalized);
    if (fileRecord) {
      return {
        isFile: true,
        isDirectory: false,
        size: fileRecord.data.length,
        mode: fileRecord.mode,
        mtime: fileRecord.mtime,
        atime: fileRecord.atime,
        ctime: fileRecord.ctime,
        birthtime: fileRecord.birthtime,
      };
    }

    throw createFSError('ENOENT', 'no such file or directory', path);
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
    this._ensureInit();

    const oldNormalized = normalizePath(oldPath);
    const newNormalized = normalizePath(newPath);

    // Check if source exists
    const oldStat = await this.stat(oldPath);

    if (oldStat.isDirectory) {
      // Rename directory and all contents
      await this._renameDirectory(oldNormalized, newNormalized);
    } else {
      // Rename file
      const data = await this.readFile(oldPath);
      await this.writeFile(newPath, data);
      await this.unlink(oldPath);
    }
  }

  private async _renameDirectory(oldPath: string, newPath: string): Promise<void> {
    // Create new directory
    await this.mkdir(newPath, { recursive: true });

    // Get all files and subdirectories
    const allFiles = await this._getAllNestedFiles(oldPath);
    const allDirs = await this._getAllNestedDirs(oldPath);

    // Copy all files
    for (const filePath of allFiles) {
      const relativePath = filePath.substring(oldPath.length);
      const newFilePath = newPath + relativePath;
      const data = await this.readFile(filePath);
      await this.writeFile(newFilePath, data, { createParents: true });
    }

    // Create all subdirectories
    for (const dirPath of allDirs) {
      const relativePath = dirPath.substring(oldPath.length);
      const newDirPath = newPath + relativePath;
      await this.mkdir(newDirPath, { recursive: true });
    }

    // Delete old directory
    await this.rmdir(oldPath, { recursive: true });
  }

  private async _getAllNestedFiles(dirPath: string): Promise<string[]> {
    const normalized = normalizePath(dirPath);

    return new Promise((resolve, reject) => {
      const { getStore } = this._transaction([FILES_STORE], 'readonly');
      const request = getStore(FILES_STORE).getAllKeys();

      request.onsuccess = () => {
        const paths = request.result as string[];
        const nested = paths.filter((p) => isInside(normalized, p));
        resolve(nested);
      };

      request.onerror = () => reject(request.error);
    });
  }

  async flush(): Promise<void> {
    // IndexedDB writes are already persisted
  }

  /**
   * Clear all data (for testing)
   */
  async clear(): Promise<void> {
    this._ensureInit();

    await new Promise<void>((resolve, reject) => {
      const { transaction, getStore } = this._transaction([FILES_STORE, DIRS_STORE], 'readwrite');
      getStore(FILES_STORE).clear();
      getStore(DIRS_STORE).clear();
      transaction.oncomplete = () => resolve();
      transaction.onerror = () => reject(transaction.error);
    });

    // Re-create root directory
    await this._createDirRecord('/');

    logger.debug('IndexedDB backend cleared');
  }
}
