/**
 * =============================================================================
 * BAVINI Container - Mount Manager
 * =============================================================================
 * Manages multiple filesystem backends with mount points.
 * Provides a unified interface for filesystem operations.
 *
 * Example mount configuration:
 * - / -> OPFSBackend (or IndexedDB fallback)
 * - /tmp -> MemoryBackend (volatile)
 * =============================================================================
 */

import type {
  FSBackend,
  FileStat,
  DirEntry,
  MkdirOptions,
  RmdirOptions,
  WriteFileOptions,
  MountPoint,
} from './types';
import { createFSError, TextUtils } from './types';
import { normalizePath, isInside, basename } from './path-utils';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MountManager');

/**
 * Mount manager configuration
 */
export interface MountManagerConfig {
  /** Mounts to initialize with */
  mounts?: Array<{ path: string; backend: FSBackend; readonly?: boolean }>;
}

/**
 * Mount manager for coordinating filesystem backends
 */
export class MountManager {
  private _mounts: MountPoint[] = [];
  private _initialized = false;

  /**
   * Initialize the mount manager with backends
   */
  async init(config?: MountManagerConfig): Promise<void> {
    if (this._initialized) {
      return;
    }

    // Initialize provided mounts
    if (config?.mounts) {
      for (const mountConfig of config.mounts) {
        await this.mount(mountConfig.path, mountConfig.backend, mountConfig.readonly);
      }
    }

    this._initialized = true;
    logger.info('Mount manager initialized with', this._mounts.length, 'mounts');
  }

  /**
   * Destroy the mount manager and all backends
   */
  async destroy(): Promise<void> {
    for (const mount of this._mounts) {
      await mount.backend.destroy();
    }
    this._mounts = [];
    this._initialized = false;
    logger.info('Mount manager destroyed');
  }

  /**
   * Mount a backend at a path
   */
  async mount(path: string, backend: FSBackend, readonly: boolean = false): Promise<void> {
    const normalizedPath = normalizePath(path);

    // Check for existing mount at same path
    const existingIndex = this._mounts.findIndex((m) => m.path === normalizedPath);
    if (existingIndex !== -1) {
      // Unmount existing first
      await this.unmount(normalizedPath);
    }

    // Initialize the backend
    await backend.init({ rootPath: normalizedPath });

    // Add mount point (sorted by path length descending for longest-match)
    this._mounts.push({ path: normalizedPath, backend, readonly });
    this._mounts.sort((a, b) => b.path.length - a.path.length);

    logger.info(`Mounted ${backend.name} at ${normalizedPath}`);
  }

  /**
   * Unmount a backend from a path
   */
  async unmount(path: string): Promise<void> {
    const normalizedPath = normalizePath(path);
    const index = this._mounts.findIndex((m) => m.path === normalizedPath);

    if (index === -1) {
      throw createFSError('EINVAL', 'No mount at path', path);
    }

    const mount = this._mounts[index];
    await mount.backend.destroy();
    this._mounts.splice(index, 1);

    logger.info(`Unmounted ${path}`);
  }

  /**
   * Get mount point for a path
   */
  private _getMountForPath(path: string): { mount: MountPoint; relativePath: string } | null {
    const normalizedPath = normalizePath(path);

    // Find the longest matching mount (mounts are sorted by length)
    for (const mount of this._mounts) {
      if (isInside(mount.path, normalizedPath)) {
        // Calculate relative path within the mount
        let relativePath: string;
        if (mount.path === '/') {
          relativePath = normalizedPath;
        } else if (normalizedPath === mount.path) {
          relativePath = '/';
        } else {
          relativePath = normalizedPath.substring(mount.path.length);
          if (!relativePath.startsWith('/')) {
            relativePath = '/' + relativePath;
          }
        }

        return { mount, relativePath };
      }
    }

    return null;
  }

  /**
   * Check if path is writable (not on a readonly mount)
   */
  private _checkWritable(path: string): void {
    const result = this._getMountForPath(path);
    if (result?.mount.readonly) {
      throw createFSError('EACCES', 'Read-only file system', path);
    }
  }

  // =========================================================================
  // Filesystem Operations
  // =========================================================================

  async readFile(path: string): Promise<Uint8Array> {
    const result = this._getMountForPath(path);
    if (!result) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    return result.mount.backend.readFile(result.relativePath);
  }

  /**
   * Read file as text
   */
  async readTextFile(path: string): Promise<string> {
    const data = await this.readFile(path);
    return TextUtils.decode(data);
  }

  async writeFile(path: string, data: Uint8Array, options?: WriteFileOptions): Promise<void> {
    this._checkWritable(path);

    const result = this._getMountForPath(path);
    if (!result) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    await result.mount.backend.writeFile(result.relativePath, data, options);
  }

  /**
   * Write text to file
   */
  async writeTextFile(path: string, text: string, options?: WriteFileOptions): Promise<void> {
    await this.writeFile(path, TextUtils.encode(text), options);
  }

  async unlink(path: string): Promise<void> {
    this._checkWritable(path);

    const result = this._getMountForPath(path);
    if (!result) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    await result.mount.backend.unlink(result.relativePath);
  }

  async copyFile(src: string, dest: string): Promise<void> {
    this._checkWritable(dest);

    // Read from source mount
    const data = await this.readFile(src);

    // Write to destination mount
    await this.writeFile(dest, data);
  }

  async mkdir(path: string, options?: MkdirOptions): Promise<void> {
    this._checkWritable(path);

    const result = this._getMountForPath(path);
    if (!result) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    await result.mount.backend.mkdir(result.relativePath, options);
  }

  async rmdir(path: string, options?: RmdirOptions): Promise<void> {
    this._checkWritable(path);

    const result = this._getMountForPath(path);
    if (!result) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    await result.mount.backend.rmdir(result.relativePath, options);
  }

  async readdir(path: string): Promise<string[]> {
    const normalizedPath = normalizePath(path);
    const result = this._getMountForPath(normalizedPath);

    if (!result) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    const entries = await result.mount.backend.readdir(result.relativePath);

    // Add mount points that are direct children of this directory
    for (const mount of this._mounts) {
      if (mount.path !== normalizedPath && isInside(normalizedPath, mount.path)) {
        const relative = mount.path.substring(normalizedPath === '/' ? 1 : normalizedPath.length + 1);
        if (!relative.includes('/')) {
          // Direct child mount point
          if (!entries.includes(relative)) {
            entries.push(relative);
          }
        }
      }
    }

    return entries;
  }

  async readdirWithTypes(path: string): Promise<DirEntry[]> {
    const normalizedPath = normalizePath(path);
    const result = this._getMountForPath(normalizedPath);

    if (!result) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    const entries = await result.mount.backend.readdirWithTypes(result.relativePath);

    // Add mount points that are direct children of this directory
    for (const mount of this._mounts) {
      if (mount.path !== normalizedPath && isInside(normalizedPath, mount.path)) {
        const relative = mount.path.substring(normalizedPath === '/' ? 1 : normalizedPath.length + 1);
        if (!relative.includes('/')) {
          // Direct child mount point
          if (!entries.some((e) => e.name === relative)) {
            entries.push({ name: relative, isDirectory: true, isFile: false });
          }
        }
      }
    }

    return entries;
  }

  async stat(path: string): Promise<FileStat> {
    const result = this._getMountForPath(path);
    if (!result) {
      throw createFSError('ENOENT', 'no such file or directory', path);
    }

    return result.mount.backend.stat(result.relativePath);
  }

  async exists(path: string): Promise<boolean> {
    const result = this._getMountForPath(path);
    if (!result) {
      return false;
    }

    return result.mount.backend.exists(result.relativePath);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    this._checkWritable(oldPath);
    this._checkWritable(newPath);

    const oldResult = this._getMountForPath(oldPath);
    const newResult = this._getMountForPath(newPath);

    if (!oldResult) {
      throw createFSError('ENOENT', 'no such file or directory', oldPath);
    }

    if (!newResult) {
      throw createFSError('ENOENT', 'no such file or directory', newPath);
    }

    // If same mount, use backend's rename
    if (oldResult.mount === newResult.mount) {
      await oldResult.mount.backend.rename(oldResult.relativePath, newResult.relativePath);
    } else {
      // Cross-mount rename: copy + delete
      const stat = await this.stat(oldPath);

      if (stat.isDirectory) {
        await this._crossMountCopyDirectory(oldPath, newPath);
        await this.rmdir(oldPath, { recursive: true });
      } else {
        const data = await this.readFile(oldPath);
        await this.writeFile(newPath, data);
        await this.unlink(oldPath);
      }
    }
  }

  /**
   * Copy directory across mounts
   */
  private async _crossMountCopyDirectory(src: string, dest: string): Promise<void> {
    await this.mkdir(dest, { recursive: true });

    const entries = await this.readdirWithTypes(src);

    for (const entry of entries) {
      const srcPath = `${src}/${entry.name}`;
      const destPath = `${dest}/${entry.name}`;

      if (entry.isDirectory) {
        await this._crossMountCopyDirectory(srcPath, destPath);
      } else {
        const data = await this.readFile(srcPath);
        await this.writeFile(destPath, data);
      }
    }
  }

  /**
   * Flush all backends
   */
  async flush(): Promise<void> {
    for (const mount of this._mounts) {
      if (mount.backend.flush) {
        await mount.backend.flush();
      }
    }
  }

  // =========================================================================
  // Information Methods
  // =========================================================================

  /**
   * Get list of mount points
   */
  getMounts(): Array<{ path: string; backend: string; readonly: boolean }> {
    return this._mounts.map((m) => ({
      path: m.path,
      backend: m.backend.name,
      readonly: m.readonly,
    }));
  }

  /**
   * Get mount info for a path
   */
  getMountInfo(path: string): { path: string; backend: string; readonly: boolean } | null {
    const result = this._getMountForPath(path);
    if (!result) {
      return null;
    }

    return {
      path: result.mount.path,
      backend: result.mount.backend.name,
      readonly: result.mount.readonly,
    };
  }

  // =========================================================================
  // Convenience Methods
  // =========================================================================

  /**
   * Walk directory tree recursively
   */
  async *walk(path: string): AsyncGenerator<{ path: string; entry: DirEntry }> {
    const entries = await this.readdirWithTypes(path);

    for (const entry of entries) {
      const fullPath = path === '/' ? `/${entry.name}` : `${path}/${entry.name}`;
      yield { path: fullPath, entry };

      if (entry.isDirectory) {
        yield* this.walk(fullPath);
      }
    }
  }

  /**
   * Get all files recursively
   */
  async getAllFiles(path: string): Promise<string[]> {
    const files: string[] = [];

    for await (const { path: filePath, entry } of this.walk(path)) {
      if (entry.isFile) {
        files.push(filePath);
      }
    }

    return files;
  }

  /**
   * Export filesystem to JSON
   */
  async toJSON(path: string = '/'): Promise<Record<string, string>> {
    const result: Record<string, string> = {};

    for await (const { path: filePath, entry } of this.walk(path)) {
      if (entry.isFile) {
        try {
          const content = await this.readTextFile(filePath);
          result[filePath] = content;
        } catch {
          // Skip binary files or unreadable files
        }
      }
    }

    return result;
  }

  /**
   * Import filesystem from JSON
   */
  async fromJSON(data: Record<string, string>): Promise<void> {
    for (const [path, content] of Object.entries(data)) {
      await this.writeTextFile(path, content, { createParents: true });
    }
    logger.info(`Imported ${Object.keys(data).length} files`);
  }
}

/**
 * Singleton mount manager instance
 */
let _sharedMountManager: MountManager | null = null;

/**
 * Get the shared mount manager instance
 */
export function getSharedMountManager(): MountManager {
  if (!_sharedMountManager) {
    _sharedMountManager = new MountManager();
  }
  return _sharedMountManager;
}

/**
 * Reset the shared mount manager (for testing)
 */
export async function resetSharedMountManager(): Promise<void> {
  if (_sharedMountManager) {
    await _sharedMountManager.destroy();
    _sharedMountManager = null;
  }
}
