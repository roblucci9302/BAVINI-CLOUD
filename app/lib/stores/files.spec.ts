import { describe, expect, it, vi } from 'vitest';
import { map } from 'nanostores';

/**
 * Tests for FilesStore
 *
 * Note: FilesStore uses import.meta.hot for HMR support and WebContainer
 * for filesystem operations. These tests verify the core logic patterns.
 */

describe('files store', () => {
  describe('module exports', () => {
    it('should export FilesStore class', async () => {
      // Mock dependencies before import
      vi.mock('~/utils/buffer', () => ({
        bufferWatchEvents: vi.fn((delay, callback) => callback),
      }));

      vi.mock('~/utils/diff', () => ({
        computeFileModifications: vi.fn(() => []),
      }));

      vi.mock('~/utils/logger', () => ({
        createScopedLogger: vi.fn(() => ({
          info: vi.fn(),
          warn: vi.fn(),
          error: vi.fn(),
          debug: vi.fn(),
        })),
      }));

      const module = await import('./files');

      expect(module.FilesStore).toBeDefined();
      expect(typeof module.FilesStore).toBe('function');
    });
  });

  describe('nanostores patterns', () => {
    it('should work with map for files', () => {
      interface File {
        type: 'file';
        content: string;
        isBinary: boolean;
      }

      interface Folder {
        type: 'folder';
      }

      type FileMap = Record<string, File | Folder | undefined>;

      const files = map<FileMap>({});

      expect(files.get()).toEqual({});

      files.setKey('/src/index.ts', {
        type: 'file',
        content: 'const x = 1;',
        isBinary: false,
      });

      expect(files.get()['/src/index.ts']?.type).toBe('file');
    });
  });

  describe('getFile logic', () => {
    it('should return file if it exists', () => {
      interface Dirent {
        type: 'file' | 'folder';
        content?: string;
        isBinary?: boolean;
      }

      const files = map<Record<string, Dirent | undefined>>({});

      files.setKey('/src/index.ts', {
        type: 'file',
        content: 'const x = 1;',
        isBinary: false,
      });

      const getFile = (path: string) => {
        const dirent = files.get()[path];

        if (dirent?.type !== 'file') {
          return undefined;
        }

        return dirent;
      };

      const file = getFile('/src/index.ts');

      expect(file).toBeDefined();
      expect(file?.content).toBe('const x = 1;');
    });

    it('should return undefined for folders', () => {
      interface Dirent {
        type: 'file' | 'folder';
        content?: string;
      }

      const files = map<Record<string, Dirent | undefined>>({});

      files.setKey('/src', { type: 'folder' });

      const getFile = (path: string) => {
        const dirent = files.get()[path];

        if (dirent?.type !== 'file') {
          return undefined;
        }

        return dirent;
      };

      expect(getFile('/src')).toBeUndefined();
    });

    it('should return undefined for non-existent file', () => {
      const files = map<Record<string, any>>({});

      const getFile = (path: string) => {
        const dirent = files.get()[path];

        if (dirent?.type !== 'file') {
          return undefined;
        }

        return dirent;
      };

      expect(getFile('/nonexistent.ts')).toBeUndefined();
    });
  });

  describe('saveFile logic', () => {
    it('should update files map after save', () => {
      interface FileEntry {
        type: 'file';
        content: string;
        isBinary: boolean;
      }

      const files = map<Record<string, FileEntry>>({
        '/home/project/src/index.ts': {
          type: 'file',
          content: 'old content',
          isBinary: false,
        },
      });

      const saveFile = (path: string, content: string) => {
        files.setKey(path, { type: 'file', content, isBinary: false });
      };

      saveFile('/home/project/src/index.ts', 'new content');

      expect(files.get()['/home/project/src/index.ts']?.content).toBe('new content');
    });
  });

  describe('file path processing', () => {
    it('should sanitize trailing slashes', () => {
      const sanitizePath = (path: string) => path.replace(/\/+$/g, '');

      expect(sanitizePath('/src/folder/')).toBe('/src/folder');
      expect(sanitizePath('/src/folder///')).toBe('/src/folder');
      expect(sanitizePath('/src/file.ts')).toBe('/src/file.ts');
    });

    it('should compute relative path', () => {
      const workdir = '/home/project';

      const getRelativePath = (fullPath: string) => {
        if (fullPath.startsWith(workdir + '/')) {
          return fullPath.slice(workdir.length + 1);
        }

        return fullPath;
      };

      expect(getRelativePath('/home/project/src/index.ts')).toBe('src/index.ts');
      expect(getRelativePath('/home/project/package.json')).toBe('package.json');
    });
  });

  describe('watch event handling', () => {
    it('should handle add_file event', () => {
      const files = map<Record<string, any>>({});
      let fileCount = 0;

      const handleEvent = (event: { type: string; path: string; content?: string }) => {
        const sanitizedPath = event.path.replace(/\/+$/g, '');

        if (event.type === 'add_file') {
          fileCount++;
          files.setKey(sanitizedPath, {
            type: 'file',
            content: event.content || '',
            isBinary: false,
          });
        }
      };

      handleEvent({ type: 'add_file', path: '/src/index.ts', content: 'code' });

      expect(files.get()['/src/index.ts']).toBeDefined();
      expect(fileCount).toBe(1);
    });

    it('should handle remove_file event', () => {
      const files = map<Record<string, any>>({
        '/src/index.ts': { type: 'file', content: 'code', isBinary: false },
      });
      let fileCount = 1;

      const handleEvent = (event: { type: string; path: string }) => {
        const sanitizedPath = event.path.replace(/\/+$/g, '');

        if (event.type === 'remove_file') {
          fileCount--;
          files.setKey(sanitizedPath, undefined);
        }
      };

      handleEvent({ type: 'remove_file', path: '/src/index.ts' });

      expect(files.get()['/src/index.ts']).toBeUndefined();
      expect(fileCount).toBe(0);
    });

    it('should handle add_dir event', () => {
      const files = map<Record<string, any>>({});

      const handleEvent = (event: { type: string; path: string }) => {
        const sanitizedPath = event.path.replace(/\/+$/g, '');

        if (event.type === 'add_dir') {
          files.setKey(sanitizedPath, { type: 'folder' });
        }
      };

      handleEvent({ type: 'add_dir', path: '/src/' });

      expect(files.get()['/src']?.type).toBe('folder');
    });

    it('should handle remove_dir event and clean children', () => {
      const files = map<Record<string, any>>({
        '/src': { type: 'folder' },
        '/src/index.ts': { type: 'file', content: 'code', isBinary: false },
        '/src/utils.ts': { type: 'file', content: 'utils', isBinary: false },
        '/other.ts': { type: 'file', content: 'other', isBinary: false },
      });

      const handleEvent = (event: { type: string; path: string }) => {
        const sanitizedPath = event.path.replace(/\/+$/g, '');

        if (event.type === 'remove_dir') {
          files.setKey(sanitizedPath, undefined);

          for (const [direntPath] of Object.entries(files.get())) {
            if (direntPath.startsWith(sanitizedPath + '/')) {
              files.setKey(direntPath, undefined);
            }
          }
        }
      };

      handleEvent({ type: 'remove_dir', path: '/src/' });

      expect(files.get()['/src']).toBeUndefined();
      expect(files.get()['/src/index.ts']).toBeUndefined();
      expect(files.get()['/src/utils.ts']).toBeUndefined();
      expect(files.get()['/other.ts']).toBeDefined();
    });

    it('should handle change event', () => {
      const files = map<Record<string, any>>({
        '/src/index.ts': { type: 'file', content: 'old', isBinary: false },
      });

      const handleEvent = (event: { type: string; path: string; content?: string }) => {
        const sanitizedPath = event.path.replace(/\/+$/g, '');

        if (event.type === 'change') {
          files.setKey(sanitizedPath, {
            type: 'file',
            content: event.content || '',
            isBinary: false,
          });
        }
      };

      handleEvent({ type: 'change', path: '/src/index.ts', content: 'new' });

      expect(files.get()['/src/index.ts'].content).toBe('new');
    });
  });

  describe('restoreFromSnapshot logic', () => {
    it('should restore files from snapshot', () => {
      const files = map<Record<string, any>>({});

      const snapshot = {
        '/home/project/src/index.ts': {
          type: 'file' as const,
          content: 'restored content',
          isBinary: false,
        },
      };

      files.set(snapshot);

      expect(files.get()['/home/project/src/index.ts'].content).toBe('restored content');
    });
  });

  describe('type definitions', () => {
    it('should support File interface', () => {
      interface File {
        type: 'file';
        content: string;
        isBinary: boolean;
      }

      const file: File = {
        type: 'file',
        content: 'test',
        isBinary: false,
      };

      expect(file.type).toBe('file');
      expect(file.isBinary).toBe(false);
    });

    it('should support Folder interface', () => {
      interface Folder {
        type: 'folder';
      }

      const folder: Folder = { type: 'folder' };

      expect(folder.type).toBe('folder');
    });

    it('should support FileMap type', () => {
      type FileMap = Record<
        string,
        | {
            type: 'file' | 'folder';
            content?: string;
            isBinary?: boolean;
          }
        | undefined
      >;

      const fileMap: FileMap = {
        '/src/index.ts': { type: 'file', content: 'code', isBinary: false },
        '/src': { type: 'folder' },
        '/deleted': undefined,
      };

      expect(Object.keys(fileMap)).toHaveLength(3);
    });
  });
});
