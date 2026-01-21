/**
 * =============================================================================
 * BAVINI Runtime Engine - Unified Virtual File System
 * =============================================================================
 * Browser-compatible virtual file system implementation.
 * No external dependencies - works purely in the browser.
 * Provides persistence via IndexedDB.
 * =============================================================================
 */

import type { VirtualFS, FSStats } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('UnifiedFS');

/**
 * IndexedDB storage key for filesystem persistence
 */
const IDB_STORE_NAME = 'bavini-fs';
const IDB_DB_NAME = 'bavini-runtime';

/**
 * File node in the virtual filesystem
 */
interface FileNode {
  type: 'file';
  content: string | Uint8Array;
  mtime: number;
  atime: number;
  ctime: number;
  birthtime: number;
  mode: number;
}

/**
 * Directory node in the virtual filesystem
 */
interface DirNode {
  type: 'directory';
  children: Map<string, FileNode | DirNode>;
  mtime: number;
  atime: number;
  ctime: number;
  birthtime: number;
  mode: number;
}

type FSNode = FileNode | DirNode;

/**
 * Creates a unified virtual file system
 */
export function createUnifiedFS(): UnifiedFSInstance {
  return new UnifiedFSInstance();
}

/**
 * Unified File System implementation
 * Pure JavaScript - no Node.js dependencies
 */
export class UnifiedFSInstance implements VirtualFS {
  private _root: DirNode;
  private _cwd: string = '/';

  constructor() {
    const now = Date.now();
    this._root = {
      type: 'directory',
      children: new Map(),
      mtime: now,
      atime: now,
      ctime: now,
      birthtime: now,
      mode: 0o755,
    };

    // Create default directories
    this._ensureDir('/tmp');
    this._ensureDir('/home');
    this._ensureDir('/src');

    logger.info('UnifiedFS initialized');
  }

  /**
   * Ensure a directory exists
   */
  private _ensureDir(path: string): void {
    try {
      if (!this.existsSync(path)) {
        this.mkdirSync(path, { recursive: true });
      }
    } catch {
      // Ignore errors for initial setup
    }
  }

  /**
   * Normalize path (ensure leading slash, resolve . and ..)
   */
  private _normalizePath(inputPath: string): string {
    // Ensure leading slash
    let normalized = inputPath.startsWith('/') ? inputPath : `${this._cwd}/${inputPath}`;

    // Simple path resolution (handle . and ..)
    const parts = normalized.split('/').filter(Boolean);
    const resolved: string[] = [];

    for (const part of parts) {
      if (part === '.') {
        continue;
      } else if (part === '..') {
        resolved.pop();
      } else {
        resolved.push(part);
      }
    }

    return '/' + resolved.join('/');
  }

  /**
   * Get node at path
   */
  private _getNode(path: string): FSNode | null {
    if (path === '/') {
      return this._root;
    }

    const parts = path.split('/').filter(Boolean);
    let current: FSNode = this._root;

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

  /**
   * Get parent directory and filename
   */
  private _getParent(path: string): { parent: DirNode | null; name: string } {
    const normalized = this._normalizePath(path);
    const parts = normalized.split('/').filter(Boolean);
    const name = parts.pop() || '';

    if (parts.length === 0) {
      return { parent: this._root, name };
    }

    const parentPath = '/' + parts.join('/');
    const parent = this._getNode(parentPath);

    if (!parent || parent.type !== 'directory') {
      return { parent: null, name };
    }

    return { parent, name };
  }

  // =========================================================================
  // Current Working Directory
  // =========================================================================

  getCwd(): string {
    return this._cwd;
  }

  setCwd(path: string): void {
    const normalized = this._normalizePath(path);
    const node = this._getNode(normalized);
    if (node && node.type === 'directory') {
      this._cwd = normalized;
    } else {
      throw new Error(`ENOENT: no such file or directory: ${path}`);
    }
  }

  // =========================================================================
  // Sync Operations (Node.js fs compatible)
  // =========================================================================

  readFileSync(path: string, encoding?: BufferEncoding): string | Buffer {
    const normalized = this._normalizePath(path);
    const node = this._getNode(normalized);

    if (!node) {
      throw new Error(`ENOENT: no such file or directory: ${path}`);
    }

    if (node.type !== 'file') {
      throw new Error(`EISDIR: illegal operation on a directory: ${path}`);
    }

    node.atime = Date.now();

    if (encoding) {
      if (typeof node.content === 'string') {
        return node.content;
      }
      return new TextDecoder().decode(node.content);
    }

    if (typeof node.content === 'string') {
      return node.content as unknown as Buffer;
    }
    return node.content as unknown as Buffer;
  }

  writeFileSync(path: string, data: string | Buffer): void {
    const normalized = this._normalizePath(path);
    const { parent, name } = this._getParent(normalized);

    if (!parent) {
      // Create parent directories
      const parentPath = normalized.substring(0, normalized.lastIndexOf('/')) || '/';
      this.mkdirSync(parentPath, { recursive: true });
      return this.writeFileSync(path, data);
    }

    const now = Date.now();
    const existing = parent.children.get(name);

    const content = typeof data === 'string' ? data : new Uint8Array(data);

    if (existing && existing.type === 'file') {
      existing.content = content;
      existing.mtime = now;
      existing.atime = now;
    } else {
      parent.children.set(name, {
        type: 'file',
        content,
        mtime: now,
        atime: now,
        ctime: now,
        birthtime: now,
        mode: 0o644,
      });
    }

    parent.mtime = now;
  }

  existsSync(path: string): boolean {
    const normalized = this._normalizePath(path);
    return this._getNode(normalized) !== null;
  }

  mkdirSync(path: string, options?: { recursive?: boolean }): void {
    const normalized = this._normalizePath(path);

    if (normalized === '/') {
      return;
    }

    const parts = normalized.split('/').filter(Boolean);
    let current = this._root;
    const now = Date.now();

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const existing = current.children.get(part);

      if (existing) {
        if (existing.type === 'directory') {
          current = existing;
        } else {
          throw new Error(`EEXIST: file already exists: ${parts.slice(0, i + 1).join('/')}`);
        }
      } else {
        if (!options?.recursive && i < parts.length - 1) {
          throw new Error(`ENOENT: no such file or directory: ${parts.slice(0, i + 1).join('/')}`);
        }

        const newDir: DirNode = {
          type: 'directory',
          children: new Map(),
          mtime: now,
          atime: now,
          ctime: now,
          birthtime: now,
          mode: 0o755,
        };
        current.children.set(part, newDir);
        current = newDir;
      }
    }
  }

  rmdirSync(path: string, options?: { recursive?: boolean }): void {
    const normalized = this._normalizePath(path);
    const { parent, name } = this._getParent(normalized);

    if (!parent || !name) {
      throw new Error(`ENOENT: no such file or directory: ${path}`);
    }

    const node = parent.children.get(name);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory: ${path}`);
    }

    if (node.type !== 'directory') {
      throw new Error(`ENOTDIR: not a directory: ${path}`);
    }

    if (!options?.recursive && node.children.size > 0) {
      throw new Error(`ENOTEMPTY: directory not empty: ${path}`);
    }

    parent.children.delete(name);
    parent.mtime = Date.now();
  }

  unlinkSync(path: string): void {
    const normalized = this._normalizePath(path);
    const { parent, name } = this._getParent(normalized);

    if (!parent || !name) {
      throw new Error(`ENOENT: no such file or directory: ${path}`);
    }

    const node = parent.children.get(name);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory: ${path}`);
    }

    if (node.type !== 'file') {
      throw new Error(`EISDIR: illegal operation on a directory: ${path}`);
    }

    parent.children.delete(name);
    parent.mtime = Date.now();
  }

  readdirSync(path: string): string[] {
    const normalized = this._normalizePath(path);
    const node = this._getNode(normalized);

    if (!node) {
      throw new Error(`ENOENT: no such file or directory: ${path}`);
    }

    if (node.type !== 'directory') {
      throw new Error(`ENOTDIR: not a directory: ${path}`);
    }

    node.atime = Date.now();
    return Array.from(node.children.keys());
  }

  statSync(path: string): FSStats {
    const normalized = this._normalizePath(path);
    const node = this._getNode(normalized);

    if (!node) {
      throw new Error(`ENOENT: no such file or directory: ${path}`);
    }

    return this._nodeToStats(node);
  }

  lstatSync(path: string): FSStats {
    return this.statSync(path);
  }

  renameSync(oldPath: string, newPath: string): void {
    const normalizedOld = this._normalizePath(oldPath);
    const normalizedNew = this._normalizePath(newPath);

    const oldParent = this._getParent(normalizedOld);
    const newParent = this._getParent(normalizedNew);

    if (!oldParent.parent || !oldParent.name) {
      throw new Error(`ENOENT: no such file or directory: ${oldPath}`);
    }

    const node = oldParent.parent.children.get(oldParent.name);
    if (!node) {
      throw new Error(`ENOENT: no such file or directory: ${oldPath}`);
    }

    if (!newParent.parent) {
      throw new Error(`ENOENT: no such file or directory: ${newPath}`);
    }

    oldParent.parent.children.delete(oldParent.name);
    newParent.parent.children.set(newParent.name, node);

    const now = Date.now();
    oldParent.parent.mtime = now;
    newParent.parent.mtime = now;
  }

  copyFileSync(src: string, dest: string): void {
    const content = this.readFileSync(src);
    this.writeFileSync(dest, content as string);
  }

  // =========================================================================
  // Async Operations
  // =========================================================================

  async readFile(path: string, encoding?: BufferEncoding): Promise<string | Buffer> {
    return this.readFileSync(path, encoding);
  }

  async writeFile(path: string, data: string | Buffer): Promise<void> {
    this.writeFileSync(path, data);
  }

  async mkdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.mkdirSync(path, options);
  }

  async rmdir(path: string, options?: { recursive?: boolean }): Promise<void> {
    this.rmdirSync(path, options);
  }

  async unlink(path: string): Promise<void> {
    this.unlinkSync(path);
  }

  async readdir(path: string): Promise<string[]> {
    return this.readdirSync(path);
  }

  async stat(path: string): Promise<FSStats> {
    return this.statSync(path);
  }

  // =========================================================================
  // BAVINI-specific methods
  // =========================================================================

  /**
   * Export filesystem to JSON (for serialization)
   */
  toJSON(): Record<string, string> {
    const result: Record<string, string> = {};
    this._walkDir('/', this._root, result);
    return result;
  }

  /**
   * Walk directory recursively
   */
  private _walkDir(path: string, node: DirNode, result: Record<string, string>): void {
    for (const [name, child] of node.children) {
      const fullPath = path === '/' ? `/${name}` : `${path}/${name}`;

      if (child.type === 'directory') {
        this._walkDir(fullPath, child, result);
      } else {
        const content = typeof child.content === 'string'
          ? child.content
          : new TextDecoder().decode(child.content);
        result[fullPath] = content;
      }
    }
  }

  /**
   * Import filesystem from JSON
   */
  fromJSON(data: Record<string, string>): void {
    for (const [path, content] of Object.entries(data)) {
      this.writeFileSync(path, content);
    }
    logger.info(`Imported ${Object.keys(data).length} files from JSON`);
  }

  /**
   * Clear all files
   */
  clear(): void {
    const now = Date.now();
    this._root = {
      type: 'directory',
      children: new Map(),
      mtime: now,
      atime: now,
      ctime: now,
      birthtime: now,
      mode: 0o755,
    };
    this._ensureDir('/tmp');
    this._ensureDir('/home');
    this._ensureDir('/src');
    logger.info('UnifiedFS cleared');
  }

  /**
   * Persist to IndexedDB
   */
  async persist(): Promise<void> {
    const data = this.toJSON();
    await this._saveToIDB(data);
    logger.info(`Persisted ${Object.keys(data).length} files to IndexedDB`);
  }

  /**
   * Restore from IndexedDB
   */
  async restore(): Promise<boolean> {
    const data = await this._loadFromIDB();
    if (data && Object.keys(data).length > 0) {
      this.fromJSON(data);
      logger.info(`Restored ${Object.keys(data).length} files from IndexedDB`);
      return true;
    }
    return false;
  }

  // =========================================================================
  // IndexedDB helpers
  // =========================================================================

  private async _openIDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(IDB_DB_NAME, 1);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(IDB_STORE_NAME)) {
          db.createObjectStore(IDB_STORE_NAME);
        }
      };
    });
  }

  private async _saveToIDB(data: Record<string, string>): Promise<void> {
    const db = await this._openIDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(IDB_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(IDB_STORE_NAME);
      store.put(data, 'filesystem');

      transaction.oncomplete = () => {
        db.close();
        resolve();
      };
      transaction.onerror = () => {
        db.close();
        reject(transaction.error);
      };
    });
  }

  private async _loadFromIDB(): Promise<Record<string, string> | null> {
    try {
      const db = await this._openIDB();
      return new Promise((resolve, reject) => {
        const transaction = db.transaction(IDB_STORE_NAME, 'readonly');
        const store = transaction.objectStore(IDB_STORE_NAME);
        const request = store.get('filesystem');

        request.onsuccess = () => {
          db.close();
          resolve(request.result || null);
        };
        request.onerror = () => {
          db.close();
          reject(request.error);
        };
      });
    } catch {
      return null;
    }
  }

  // =========================================================================
  // Stats conversion
  // =========================================================================

  private _nodeToStats(node: FSNode): FSStats {
    const size = node.type === 'file'
      ? (typeof node.content === 'string' ? node.content.length : node.content.length)
      : 0;

    return {
      isFile: () => node.type === 'file',
      isDirectory: () => node.type === 'directory',
      isSymbolicLink: () => false,
      size,
      mtime: new Date(node.mtime),
      atime: new Date(node.atime),
      ctime: new Date(node.ctime),
      birthtime: new Date(node.birthtime),
      mode: node.mode,
    };
  }
}

/**
 * Singleton instance for shared filesystem
 */
let _sharedFS: UnifiedFSInstance | null = null;

export function getSharedFS(): UnifiedFSInstance {
  if (!_sharedFS) {
    _sharedFS = createUnifiedFS();
  }
  return _sharedFS;
}

export function resetSharedFS(): void {
  _sharedFS = null;
}
