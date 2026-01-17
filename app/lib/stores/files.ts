import type { PathWatcherEvent, WebContainer } from '@webcontainer/api';
import { getEncoding } from 'istextorbinary';
import { map, type MapStore } from 'nanostores';
import { Buffer } from 'node:buffer';
import * as nodePath from 'node:path';
import { bufferWatchEvents } from '~/utils/buffer';
import { WORK_DIR } from '~/utils/constants';
import { computeFileModifications } from '~/utils/diff';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';

const logger = createScopedLogger('FilesStore');

export type FilesStoreMode = 'webcontainer' | 'browser';

const utf8TextDecoder = new TextDecoder('utf8', { fatal: true });

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

export class FilesStore {
  #webcontainer: Promise<WebContainer>;

  /**
   * Tracks the number of files without folders.
   */
  #size = 0;

  /**
   * @note Keeps track all modified files with their original content since the last user message.
   * Needs to be reset when the user sends another message and all changes have to be submitted
   * for the model to be aware of the changes.
   */
  #modifiedFiles: Map<string, string> = import.meta.hot?.data.modifiedFiles ?? new Map();

  /**
   * Map of files that matches the state of WebContainer.
   */
  files: MapStore<FileMap> = import.meta.hot?.data.files ?? map({});

  get filesCount() {
    return this.#size;
  }

  #initialized = false;

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    if (import.meta.hot) {
      import.meta.hot.data.files = this.files;
      import.meta.hot.data.modifiedFiles = this.#modifiedFiles;
    }

    // NOTE: #init() is NOT called here to enable lazy boot.
    // Call init() explicitly when the workbench is shown.
  }

  /**
   * Initialize the file watcher. This triggers WebContainer boot.
   * Should be called when the workbench is shown, not on page load.
   */
  init(): void {
    if (this.#initialized) {
      return;
    }

    this.#initialized = true;
    this.#init();
  }

  getFile(filePath: string) {
    const dirent = this.files.get()[filePath];

    if (dirent?.type !== 'file') {
      return undefined;
    }

    return dirent;
  }

  getFileModifications() {
    return computeFileModifications(this.files.get(), this.#modifiedFiles);
  }

  /**
   * Get the original content of a file before modifications.
   * Returns undefined if the file hasn't been modified.
   */
  getOriginalContent(filePath: string): string | undefined {
    return this.#modifiedFiles.get(filePath);
  }

  /**
   * Check if a file has been modified since the last user message.
   */
  isFileModified(filePath: string): boolean {
    return this.#modifiedFiles.has(filePath);
  }

  resetFileModifications() {
    this.#modifiedFiles.clear();
  }

  async saveFile(filePath: string, content: string) {
    const webcontainer = await this.#webcontainer;

    try {
      const relativePath = nodePath.relative(webcontainer.workdir, filePath);

      if (!relativePath) {
        throw new Error(`EINVAL: invalid file path, write '${relativePath}'`);
      }

      const oldContent = this.getFile(filePath)?.content;

      if (!oldContent) {
        unreachable('Expected content to be defined');
      }

      await webcontainer.fs.writeFile(relativePath, content);

      if (!this.#modifiedFiles.has(filePath)) {
        this.#modifiedFiles.set(filePath, oldContent);
      }

      // we immediately update the file and don't rely on the `change` event coming from the watcher
      this.files.setKey(filePath, { type: 'file', content, isBinary: false });

      logger.info('File updated');
    } catch (error) {
      logger.error('Failed to update file content\n\n', error);

      throw error;
    }
  }

  async #init() {
    const webcontainer = await this.#webcontainer;

    webcontainer.internal.watchPaths(
      { include: [`${WORK_DIR}/**`], exclude: ['**/node_modules', '.git'], includeContent: true },
      bufferWatchEvents(100, this.#processEventBuffer.bind(this)),
    );
  }

  /**
   * Process file events with async yielding to prevent main thread blocking.
   * Uses batching and yields every BATCH_SIZE events to allow browser to paint.
   */
  #processEventBuffer(events: Array<[events: PathWatcherEvent[]]>) {
    const watchEvents = events.flat(2);

    // If few events, process synchronously for better responsiveness
    if (watchEvents.length <= 5) {
      this.#processEventsSync(watchEvents);
      return;
    }

    // For many events, process in batches with yielding
    this.#processEventsAsync(watchEvents);
  }

  /**
   * Process events synchronously (for small batches)
   */
  #processEventsSync(watchEvents: PathWatcherEvent[]) {
    for (const event of watchEvents) {
      this.#processSingleEvent(event);
    }
  }

  /**
   * Process events asynchronously with yielding (for large batches)
   */
  async #processEventsAsync(watchEvents: PathWatcherEvent[]) {
    const BATCH_SIZE = 10; // Process 10 events then yield

    for (let i = 0; i < watchEvents.length; i += BATCH_SIZE) {
      const batch = watchEvents.slice(i, i + BATCH_SIZE);

      for (const event of batch) {
        this.#processSingleEvent(event);
      }

      // Yield to main thread if there are more events to process
      if (i + BATCH_SIZE < watchEvents.length) {
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
      }
    }
  }

  /**
   * Process a single file event
   */
  #processSingleEvent(event: PathWatcherEvent) {
    const { type, path, buffer } = event;
    // remove any trailing slashes
    const sanitizedPath = path.replace(/\/+$/g, '');

    switch (type) {
      case 'add_dir': {
        // we intentionally add a trailing slash so we can distinguish files from folders in the file tree
        this.files.setKey(sanitizedPath, { type: 'folder' });
        break;
      }
      case 'remove_dir': {
        this.files.setKey(sanitizedPath, undefined);

        // Batch collect paths to delete, then delete all at once
        const pathsToDelete: string[] = [];
        const prefix = sanitizedPath + '/';

        for (const direntPath of Object.keys(this.files.get())) {
          if (direntPath.startsWith(prefix)) {
            pathsToDelete.push(direntPath);
          }
        }

        // Batch delete to minimize store updates
        for (const deletePath of pathsToDelete) {
          this.files.setKey(deletePath, undefined);
        }

        break;
      }
      case 'add_file':
      case 'change': {
        if (type === 'add_file') {
          this.#size++;
        }

        let content = '';

        /**
         * @note This check is purely for the editor. The way we detect this is not
         * bullet-proof and it's a best guess so there might be false-positives.
         * The reason we do this is because we don't want to display binary files
         * in the editor nor allow to edit them.
         */
        const isBinary = isBinaryFile(buffer);

        if (!isBinary) {
          content = this.#decodeFileContent(buffer);
        }

        this.files.setKey(sanitizedPath, { type: 'file', content, isBinary });

        break;
      }
      case 'remove_file': {
        this.#size--;
        this.files.setKey(sanitizedPath, undefined);
        break;
      }
      case 'update_directory': {
        // we don't care about these events
        break;
      }
    }
  }

  #decodeFileContent(buffer?: Uint8Array) {
    if (!buffer || buffer.byteLength === 0) {
      return '';
    }

    try {
      return utf8TextDecoder.decode(buffer);
    } catch (error) {
      logger.warn('Failed to decode file content:', error);
      return '';
    }
  }

  /**
   * Restore files from a checkpoint snapshot.
   * Syncs the WebContainer filesystem to match the snapshot.
   * Uses parallel batching for better performance.
   */
  async restoreFromSnapshot(snapshot: FileMap): Promise<{ filesWritten: number; filesDeleted: number }> {
    const webcontainer = await this.#webcontainer;
    const currentFiles = this.files.get();
    const BATCH_SIZE = 20; // Process files in parallel batches

    // Collect files to write
    const filesToWrite: Array<{ path: string; relativePath: string; content: string }> = [];

    for (const [path, entry] of Object.entries(snapshot)) {
      if (entry?.type !== 'file') {
        continue;
      }

      const currentFile = currentFiles[path];
      const needsWrite = !currentFile || currentFile.type !== 'file' || currentFile.content !== entry.content;

      if (needsWrite) {
        const relativePath = nodePath.relative(webcontainer.workdir, path);

        if (relativePath) {
          filesToWrite.push({ path, relativePath, content: entry.content });
        }
      }
    }

    // Collect unique directories to create
    const dirsToCreate = new Set<string>();

    for (const { relativePath } of filesToWrite) {
      const parentDir = nodePath.dirname(relativePath);

      if (parentDir && parentDir !== '.') {
        // Add all parent directories
        const parts = parentDir.split('/');

        for (let i = 1; i <= parts.length; i++) {
          dirsToCreate.add(parts.slice(0, i).join('/'));
        }
      }
    }

    // Create directories in parallel (sorted to ensure parents first)
    const sortedDirs = Array.from(dirsToCreate).sort();

    for (let i = 0; i < sortedDirs.length; i += BATCH_SIZE) {
      const batch = sortedDirs.slice(i, i + BATCH_SIZE);
      await Promise.all(
        batch.map((dir) =>
          webcontainer.fs.mkdir(dir, { recursive: true }).catch(() => {
            // Directory might already exist
          }),
        ),
      );
    }

    // Write files in parallel batches
    let filesWritten = 0;

    for (let i = 0; i < filesToWrite.length; i += BATCH_SIZE) {
      const batch = filesToWrite.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map(({ relativePath, content }) => webcontainer.fs.writeFile(relativePath, content)),
      );

      filesWritten += results.filter((r) => r.status === 'fulfilled').length;
    }

    // Collect files to delete
    const filesToDelete: string[] = [];

    for (const [path, entry] of Object.entries(currentFiles)) {
      if (entry?.type !== 'file') {
        continue;
      }

      // Skip if file exists in snapshot
      if (snapshot[path]?.type === 'file') {
        continue;
      }

      // Skip excluded paths
      if (path.includes('/node_modules/') || path.includes('/.git/')) {
        continue;
      }

      const relativePath = nodePath.relative(webcontainer.workdir, path);

      if (relativePath) {
        filesToDelete.push(relativePath);
      }
    }

    // Delete files in parallel batches
    let filesDeleted = 0;

    for (let i = 0; i < filesToDelete.length; i += BATCH_SIZE) {
      const batch = filesToDelete.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map((relativePath) => webcontainer.fs.rm(relativePath)));

      filesDeleted += results.filter((r) => r.status === 'fulfilled').length;
    }

    // Update the local file map
    this.files.set(snapshot);

    logger.info(`Snapshot restored: ${filesWritten} written, ${filesDeleted} deleted`);

    return { filesWritten, filesDeleted };
  }
}

function isBinaryFile(buffer: Uint8Array | undefined) {
  if (buffer === undefined) {
    return false;
  }

  return getEncoding(convertToBuffer(buffer), { chunkLength: 100 }) === 'binary';
}

/**
 * Converts a `Uint8Array` into a Node.js `Buffer` by copying the prototype.
 * The goal is to  avoid expensive copies. It does create a new typed array
 * but that's generally cheap as long as it uses the same underlying
 * array buffer.
 */
function convertToBuffer(view: Uint8Array): Buffer {
  const buffer = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);

  Object.setPrototypeOf(buffer, Buffer.prototype);

  return buffer as Buffer;
}
