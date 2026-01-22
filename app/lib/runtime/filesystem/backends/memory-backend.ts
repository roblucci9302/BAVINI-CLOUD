/**
 * =============================================================================
 * BAVINI Container - Memory Backend
 * =============================================================================
 * In-memory filesystem backend for volatile storage (/tmp).
 * Fast but non-persistent - data is lost on page reload.
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
import { normalizePath, dirname, basename } from '../path-utils';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MemoryBackend');

/**
 * Internal file node
 */
interface FileNode {
  type: 'file';
  data: Uint8Array;
  mode: number;
  mtime: number;
  atime: number;
  ctime: number;
  birthtime: number;
}

/**
 * Internal directory node
 */
interface DirNode {
  type: 'directory';
  children: Map<string, FSNode>;
  mode: number;
  mtime: number;
  atime: number;
  ctime: number;
  birthtime: number;
}

type FSNode = FileNode | DirNode;

/**
 * Create a new file node
 */
function createFileNode(data: Uint8Array, mode: number = FileMode.FILE): FileNode {
  const now = Date.now();
  return {
    type: 'file',
    data,
    mode,
    mtime: now,
    atime: now,
    ctime: now,
    birthtime: now,
  };
}

/**
 * Create a new directory node
 */
function createDirNode(mode: number = FileMode.DIR): DirNode {
  const now = Date.now();
  return {
    type: 'directory',
    children: new Map(),
    mode,
    mtime: now,
    atime: now,
    ctime: now,
    birthtime: now,
  };
}

/**
 * Memory-based filesystem backend
 * Stores everything in RAM, cleared on page reload
 */
export class MemoryBackend implements FSBackend {
  readonly name = 'memory';
  readonly capabilities: BackendCapabilities = {
    persistent: false,
    syncAccess: true,
    watchable: false,
    maxFileSize: 0,
    maxStorage: 0,
  };

  private _root: DirNode | null = null;
  private _initialized = false;

  async init(_options?: BackendInitOptions): Promise<void> {
    if (this._initialized) {
      return;
    }

    this._root = createDirNode();
    this._initialized = true;
    logger.info('Memory backend initialized');
  }

  async destroy(): Promise<void> {
    this._root = null;
    this._initialized = false;
    logger.info('Memory backend destroyed');
  }

  private _ensureInit(): void {
    if (!this._initialized || !this._root) {
      throw createFSError('EINVAL', 'Backend not initialized');
    }
  }

  private _getNode(path: string): FSNode | null {
    this._ensureInit();

    const normalized = normalizePath(path);

    if (normalized === '/') {
      return this._root;
    }

    const parts = normalized.split('/').filter(Boolean);
    let current: FSNode = this._root!;

    for (const part of parts) {
      if (current.type !== 'directory') {
        return null;
      }
      const child = current.children.get(part);
      if (!child) {
        return null;
      }
      current = child;
    }

    return current;
  }

  private _getParentAndName(path: string): { parent: DirNode; name: string } | null {
    const normalized = normalizePath(path);

    if (normalized === '/') {
      return null;
    }

    const parentPath = dirname(normalized);
    const name = basename(normalized);
    const parent = this._getNode(parentPath);

    if (!parent || parent.type !== 'directory') {
      return null;
    }

    return { parent, name };
  }

  async readFile(path: string): Promise<Uint8Array> {
    this._ensureInit();

    const node = this._getNode(path);

    if (!node) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    if (node.type !== 'file') {
      throw createFSError('EISDIR', 'illegal operation on a directory', path);
    }

    node.atime = Date.now();
    return node.data;
  }

  async writeFile(path: string, data: Uint8Array, options?: WriteFileOptions): Promise<void> {
    this._ensureInit();

    const normalized = normalizePath(path);
    const result = this._getParentAndName(normalized);

    if (!result) {
      if (options?.createParents) {
        await this.mkdir(dirname(normalized), { recursive: true });
        return this.writeFile(path, data, { ...options, createParents: false });
      }
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    const { parent, name } = result;
    const existing = parent.children.get(name);
    const now = Date.now();

    if (existing) {
      if (existing.type === 'directory') {
        throw createFSError('EISDIR', 'illegal operation on a directory', path);
      }
      existing.data = data;
      existing.mtime = now;
      existing.atime = now;
    } else {
      parent.children.set(name, createFileNode(data, options?.mode));
    }

    parent.mtime = now;
  }

  async unlink(path: string): Promise<void> {
    this._ensureInit();

    const result = this._getParentAndName(path);

    if (!result) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    const { parent, name } = result;
    const node = parent.children.get(name);

    if (!node) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    if (node.type !== 'file') {
      throw createFSError('EISDIR', 'illegal operation on a directory', path);
    }

    parent.children.delete(name);
    parent.mtime = Date.now();
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
    const now = Date.now();

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const existing = current.children.get(part);

      if (existing) {
        if (existing.type === 'directory') {
          current = existing;
        } else {
          throw createFSError('EEXIST', 'file already exists', '/' + parts.slice(0, i + 1).join('/'));
        }
      } else {
        if (!options?.recursive && i < parts.length - 1) {
          throw createFSError('ENOENT', 'no such file or directory', '/' + parts.slice(0, i + 1).join('/'));
        }

        const newDir = createDirNode(options?.mode);
        current.children.set(part, newDir);
        current.mtime = now;
        current = newDir;
      }
    }
  }

  async rmdir(path: string, options?: RmdirOptions): Promise<void> {
    this._ensureInit();

    const result = this._getParentAndName(path);

    if (!result) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    const { parent, name } = result;
    const node = parent.children.get(name);

    if (!node) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    if (node.type !== 'directory') {
      throw createFSError('ENOTDIR', 'not a directory', path);
    }

    if (!options?.recursive && node.children.size > 0) {
      throw createFSError('ENOTEMPTY', 'directory not empty', path);
    }

    parent.children.delete(name);
    parent.mtime = Date.now();
  }

  async readdir(path: string): Promise<string[]> {
    this._ensureInit();

    const node = this._getNode(path);

    if (!node) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    if (node.type !== 'directory') {
      throw createFSError('ENOTDIR', 'not a directory', path);
    }

    node.atime = Date.now();
    return Array.from(node.children.keys());
  }

  async readdirWithTypes(path: string): Promise<DirEntry[]> {
    this._ensureInit();

    const node = this._getNode(path);

    if (!node) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    if (node.type !== 'directory') {
      throw createFSError('ENOTDIR', 'not a directory', path);
    }

    node.atime = Date.now();

    return Array.from(node.children.entries()).map(([name, child]) => ({
      name,
      isDirectory: child.type === 'directory',
      isFile: child.type === 'file',
    }));
  }

  async stat(path: string): Promise<FileStat> {
    this._ensureInit();

    const node = this._getNode(path);

    if (!node) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    return {
      isFile: node.type === 'file',
      isDirectory: node.type === 'directory',
      size: node.type === 'file' ? node.data.length : 0,
      mode: node.mode,
      mtime: node.mtime,
      atime: node.atime,
      ctime: node.ctime,
      birthtime: node.birthtime,
    };
  }

  async exists(path: string): Promise<boolean> {
    this._ensureInit();
    return this._getNode(path) !== null;
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    this._ensureInit();

    const oldResult = this._getParentAndName(oldPath);
    const newResult = this._getParentAndName(newPath);

    if (!oldResult) {
      throw createFSError('ENOENT', 'no such file or directory', oldPath);
    }

    const node = oldResult.parent.children.get(oldResult.name);
    if (!node) {
      throw createFSError('ENOENT', 'no such file or directory', oldPath);
    }

    if (!newResult) {
      throw createFSError('ENOENT', 'no such file or directory', newPath);
    }

    // Remove from old location
    oldResult.parent.children.delete(oldResult.name);
    oldResult.parent.mtime = Date.now();

    // Add to new location
    newResult.parent.children.set(newResult.name, node);
    newResult.parent.mtime = Date.now();
  }

  async flush(): Promise<void> {
    // No-op for memory backend
  }

  /**
   * Clear all data (for testing)
   */
  async clear(): Promise<void> {
    this._ensureInit();
    this._root = createDirNode();
    logger.debug('Memory backend cleared');
  }
}
