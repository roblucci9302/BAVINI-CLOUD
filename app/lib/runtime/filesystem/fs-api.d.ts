/**
 * Type augmentations for the File System Access API
 * These methods exist in the spec but may not be in TypeScript's lib.dom.d.ts
 */

interface FileSystemDirectoryHandle {
  /**
   * Returns an async iterator of entry names in the directory
   */
  keys(): AsyncIterableIterator<string>;

  /**
   * Returns an async iterator of entries (name, handle pairs)
   */
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;

  /**
   * Returns an async iterator of file/directory handles
   */
  values(): AsyncIterableIterator<FileSystemHandle>;
}
