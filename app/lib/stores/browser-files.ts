/**
 * =============================================================================
 * BAVINI CLOUD - Browser Files Store
 * =============================================================================
 * Pure in-memory file storage for browser mode.
 * No WebContainer dependency - files are stored in memory and synced to
 * BrowserBuildAdapter for bundling.
 * =============================================================================
 */

import { map, type MapStore } from 'nanostores';
import * as nodePath from 'node:path';
import { computeFileModifications } from '~/utils/diff';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('BrowserFilesStore');

export interface File {
  type: 'file';
  content: string;
  isBinary: boolean;
}

export interface Folder {
  type: 'folder';
}

type Dirent = File | Folder;

export type FileMap = Record<string, Dirent | undefined>;

/**
 * Browser-based file store using pure in-memory storage.
 * Works independently of WebContainer.
 */
export class BrowserFilesStore {
  /**
   * Tracks the number of files without folders.
   */
  #size = 0;

  /**
   * Tracks modified files with their original content since the last user message.
   */
  #modifiedFiles: Map<string, string> = import.meta.hot?.data.browserModifiedFiles ?? new Map();

  /**
   * In-memory file map.
   */
  files: MapStore<FileMap> = import.meta.hot?.data.browserFiles ?? map({});

  /**
   * Callback when files change (for triggering builds)
   */
  #onFilesChange?: (files: Map<string, string>) => void;

  constructor() {
    if (import.meta.hot) {
      import.meta.hot.data.browserFiles = this.files;
      import.meta.hot.data.browserModifiedFiles = this.#modifiedFiles;
    }

    logger.info('BrowserFilesStore initialized');
  }

  get filesCount() {
    return this.#size;
  }

  /**
   * Set callback for when files change (used to trigger builds)
   */
  onFilesChange(callback: (files: Map<string, string>) => void): void {
    this.#onFilesChange = callback;
  }

  /**
   * Get a file by path.
   */
  getFile(filePath: string): File | undefined {
    const normalizedPath = this.#normalizePath(filePath);
    const dirent = this.files.get()[normalizedPath];

    if (dirent?.type !== 'file') {
      return undefined;
    }

    return dirent;
  }

  /**
   * Get file modifications for the diff view.
   */
  getFileModifications() {
    return computeFileModifications(this.files.get(), this.#modifiedFiles);
  }

  /**
   * Get the original content of a file before modifications.
   */
  getOriginalContent(filePath: string): string | undefined {
    const normalizedPath = this.#normalizePath(filePath);
    return this.#modifiedFiles.get(normalizedPath);
  }

  /**
   * Check if a file has been modified since the last user message.
   */
  isFileModified(filePath: string): boolean {
    const normalizedPath = this.#normalizePath(filePath);
    return this.#modifiedFiles.has(normalizedPath);
  }

  /**
   * Reset file modifications tracking.
   */
  resetFileModifications(): void {
    this.#modifiedFiles.clear();
  }

  /**
   * Write a file to the in-memory store.
   */
  async writeFile(filePath: string, content: string): Promise<void> {
    const normalizedPath = this.#normalizePath(filePath);

    // Create parent folders
    this.#ensureParentFolders(normalizedPath);

    // Check if file already exists
    const existingFile = this.files.get()[normalizedPath];
    const isNewFile = !existingFile || existingFile.type !== 'file';

    if (isNewFile) {
      this.#size++;
    }

    // Store original content for modifications tracking
    if (existingFile?.type === 'file' && !this.#modifiedFiles.has(normalizedPath)) {
      this.#modifiedFiles.set(normalizedPath, existingFile.content);
    }

    // Write the file
    this.files.setKey(normalizedPath, { type: 'file', content, isBinary: false });
    logger.debug(`File written: ${normalizedPath}`);

    // Notify listeners
    this.#notifyFilesChange();
  }

  /**
   * Write multiple files at once.
   */
  async writeFiles(files: Map<string, string>): Promise<void> {
    for (const [path, content] of files) {
      const normalizedPath = this.#normalizePath(path);

      // Create parent folders
      this.#ensureParentFolders(normalizedPath);

      // Check if file already exists
      const existingFile = this.files.get()[normalizedPath];
      const isNewFile = !existingFile || existingFile.type !== 'file';

      if (isNewFile) {
        this.#size++;
      }

      // Store original content for modifications tracking
      if (existingFile?.type === 'file' && !this.#modifiedFiles.has(normalizedPath)) {
        this.#modifiedFiles.set(normalizedPath, existingFile.content);
      }

      // Write the file
      this.files.setKey(normalizedPath, { type: 'file', content, isBinary: false });
    }

    logger.info(`Wrote ${files.size} files`);

    // Notify listeners once after all writes
    this.#notifyFilesChange();
  }

  /**
   * Read a file from the in-memory store.
   */
  async readFile(filePath: string): Promise<string | null> {
    const file = this.getFile(filePath);
    return file?.content ?? null;
  }

  /**
   * Delete a file from the in-memory store.
   */
  async deleteFile(filePath: string): Promise<void> {
    const normalizedPath = this.#normalizePath(filePath);
    const existing = this.files.get()[normalizedPath];

    if (existing?.type === 'file') {
      this.#size--;
      this.files.setKey(normalizedPath, undefined);
      logger.debug(`File deleted: ${normalizedPath}`);

      // Notify listeners
      this.#notifyFilesChange();
    }
  }

  /**
   * Save a file (same as writeFile in browser mode).
   */
  async saveFile(filePath: string, content: string): Promise<void> {
    await this.writeFile(filePath, content);
  }

  /**
   * List directory contents.
   */
  async readdir(dirPath: string): Promise<string[]> {
    const normalizedDir = this.#normalizePath(dirPath);
    const entries: Set<string> = new Set();
    const prefix = normalizedDir === '/' ? '/' : normalizedDir + '/';

    for (const path of Object.keys(this.files.get())) {
      if (path.startsWith(prefix) && path !== normalizedDir) {
        // Get the immediate child
        const relativePath = path.slice(prefix.length);
        const firstPart = relativePath.split('/')[0];

        if (firstPart) {
          entries.add(firstPart);
        }
      }
    }

    return Array.from(entries);
  }

  /**
   * Check if a path exists.
   */
  exists(filePath: string): boolean {
    const normalizedPath = this.#normalizePath(filePath);
    return this.files.get()[normalizedPath] !== undefined;
  }

  /**
   * Get all files as a Map (for BrowserBuildAdapter).
   */
  getAllFiles(): Map<string, string> {
    const result = new Map<string, string>();
    const filesMap = this.files.get();

    for (const [path, entry] of Object.entries(filesMap)) {
      if (entry?.type === 'file' && !entry.isBinary) {
        // Remove the /home/project prefix for the build adapter
        const cleanPath = path.replace(/^\/home\/project/, '');
        result.set(cleanPath, entry.content);
      }
    }

    return result;
  }

  /**
   * Clear all files.
   */
  clear(): void {
    this.files.set({});
    this.#size = 0;
    this.#modifiedFiles.clear();
    logger.info('All files cleared');
  }

  /**
   * Normalize a file path to always have /home/project prefix.
   */
  #normalizePath(filePath: string): string {
    // Remove leading slash if present for consistency
    let path = filePath.startsWith('/') ? filePath : '/' + filePath;

    // Add /home/project prefix if not present
    if (!path.startsWith('/home/project')) {
      path = '/home/project' + path;
    }

    return path;
  }

  /**
   * Ensure all parent folders exist for a file path.
   */
  #ensureParentFolders(filePath: string): void {
    const parts = filePath.split('/').filter(Boolean);
    let currentPath = '';

    // Create all parent folders (exclude the file name)
    for (let i = 0; i < parts.length - 1; i++) {
      currentPath += '/' + parts[i];
      const existing = this.files.get()[currentPath];

      if (!existing) {
        this.files.setKey(currentPath, { type: 'folder' });
      }
    }
  }

  /**
   * Notify listeners that files have changed.
   */
  #notifyFilesChange(): void {
    if (this.#onFilesChange) {
      const allFiles = this.getAllFiles();
      this.#onFilesChange(allFiles);
    }
  }
}

// Singleton instance
export const browserFilesStore = new BrowserFilesStore();
