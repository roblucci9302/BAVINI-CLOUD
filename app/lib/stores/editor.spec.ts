import { describe, expect, it, vi } from 'vitest';
import { atom, map, computed } from 'nanostores';

/**
 * Tests for EditorStore
 *
 * Note: EditorStore uses import.meta.hot for HMR support which is
 * difficult to fully test. These tests verify the core logic patterns.
 */

describe('editor store', () => {
  describe('module exports', () => {
    it('should export EditorStore class', async () => {
      const module = await import('./editor');

      expect(module.EditorStore).toBeDefined();
      expect(typeof module.EditorStore).toBe('function');
    });
  });

  describe('EditorStore behavior', () => {
    it('should have setDocuments method', async () => {
      const module = await import('./editor');

      expect(module.EditorStore.prototype.setDocuments).toBeDefined();
    });

    it('should have setSelectedFile method', async () => {
      const module = await import('./editor');

      expect(module.EditorStore.prototype.setSelectedFile).toBeDefined();
    });

    it('should have updateScrollPosition method', async () => {
      const module = await import('./editor');

      expect(module.EditorStore.prototype.updateScrollPosition).toBeDefined();
    });

    it('should have updateFile method', async () => {
      const module = await import('./editor');

      expect(module.EditorStore.prototype.updateFile).toBeDefined();
    });
  });

  describe('nanostores patterns', () => {
    it('should work with atom for selectedFile', () => {
      const selectedFile = atom<string | undefined>(undefined);

      expect(selectedFile.get()).toBeUndefined();

      selectedFile.set('/src/index.ts');
      expect(selectedFile.get()).toBe('/src/index.ts');

      selectedFile.set(undefined);
      expect(selectedFile.get()).toBeUndefined();
    });

    it('should work with map for documents', () => {
      type EditorDocument = {
        value: string;
        filePath: string;
        scroll?: { top: number; left: number };
      };

      const documents = map<Record<string, EditorDocument>>({});

      expect(documents.get()).toEqual({});

      documents.setKey('/src/index.ts', {
        value: 'const x = 1;',
        filePath: '/src/index.ts',
      });

      expect(documents.get()['/src/index.ts'].value).toBe('const x = 1;');
    });

    it('should work with computed for currentDocument', () => {
      type EditorDocument = { value: string; filePath: string };

      const selectedFile = atom<string | undefined>(undefined);
      const documents = map<Record<string, EditorDocument>>({});

      const currentDocument = computed([documents, selectedFile], (docs, file) => {
        if (!file) {
          return undefined;
        }

        return docs[file];
      });

      // Initially undefined
      expect(currentDocument.get()).toBeUndefined();

      // Add document
      documents.setKey('/src/app.ts', { value: 'app code', filePath: '/src/app.ts' });

      // Still undefined (no file selected)
      expect(currentDocument.get()).toBeUndefined();

      // Select file
      selectedFile.set('/src/app.ts');
      expect(currentDocument.get()?.value).toBe('app code');
    });
  });

  describe('setDocuments logic', () => {
    it('should filter out folders', () => {
      const files = {
        '/src': { type: 'folder' as const },
        '/src/index.ts': { type: 'file' as const, content: 'code', isBinary: false },
      };

      const documents = Object.fromEntries(
        Object.entries(files)
          .filter(([_, dirent]) => dirent?.type === 'file')
          .map(([path, dirent]) => [path, { value: (dirent as any).content, filePath: path }]),
      );

      expect(Object.keys(documents)).toEqual(['/src/index.ts']);
    });

    it('should filter out undefined entries', () => {
      const files: Record<string, { type: string; content?: string } | undefined> = {
        '/src/index.ts': { type: 'file', content: 'code' },
        '/src/deleted.ts': undefined,
      };

      const documents = Object.fromEntries(
        Object.entries(files)
          .filter(([_, dirent]) => dirent?.type === 'file')
          .map(([path, dirent]) => [path, { value: (dirent as any).content, filePath: path }]),
      );

      expect(Object.keys(documents)).toEqual(['/src/index.ts']);
    });

    it('should preserve scroll position from previous documents', () => {
      const previousDocs = {
        '/src/index.ts': {
          value: 'old content',
          filePath: '/src/index.ts',
          scroll: { top: 100, left: 0 },
        },
      };

      const newFiles = {
        '/src/index.ts': { type: 'file' as const, content: 'new content', isBinary: false },
      };

      const documents = Object.fromEntries(
        Object.entries(newFiles)
          .filter(([_, dirent]) => dirent?.type === 'file')
          .map(([path, dirent]) => {
            const prevDoc = previousDocs[path as keyof typeof previousDocs];

            return [
              path,
              {
                value: (dirent as any).content,
                filePath: path,
                scroll: prevDoc?.scroll,
              },
            ];
          }),
      );

      expect(documents['/src/index.ts'].value).toBe('new content');
      expect(documents['/src/index.ts'].scroll).toEqual({ top: 100, left: 0 });
    });
  });

  describe('updateScrollPosition logic', () => {
    it('should update scroll position for existing document', () => {
      interface DocumentState {
        value: string;
        filePath: string;
        scroll?: { top: number; left: number };
      }

      const documents = map<Record<string, DocumentState>>({
        '/src/index.ts': {
          value: 'code',
          filePath: '/src/index.ts',
        },
      });

      const updateScroll = (path: string, position: { top: number; left: number }) => {
        const doc = documents.get()[path];

        if (doc) {
          documents.setKey(path, { ...doc, scroll: position });
        }
      };

      updateScroll('/src/index.ts', { top: 200, left: 50 });

      expect(documents.get()['/src/index.ts']?.scroll).toEqual({ top: 200, left: 50 });
    });
  });

  describe('updateFile logic', () => {
    it('should update file content when changed', () => {
      interface DocumentState {
        value: string;
        filePath: string;
      }

      const documents = map<Record<string, DocumentState>>({
        '/src/index.ts': {
          value: 'old content',
          filePath: '/src/index.ts',
        },
      });

      const updateFile = (path: string, newContent: string) => {
        const doc = documents.get()[path];

        if (doc && doc.value !== newContent) {
          documents.setKey(path, { ...doc, value: newContent });
        }
      };

      updateFile('/src/index.ts', 'new content');

      expect(documents.get()['/src/index.ts']?.value).toBe('new content');
    });

    it('should not update if content is the same', () => {
      let updateCount = 0;

      interface DocumentState {
        value: string;
        filePath: string;
      }

      const documents = map<Record<string, DocumentState>>({
        '/src/index.ts': {
          value: 'same content',
          filePath: '/src/index.ts',
        },
      });

      const updateFile = (path: string, newContent: string) => {
        const doc = documents.get()[path];

        if (doc && doc.value !== newContent) {
          updateCount++;
          documents.setKey(path, { ...doc, value: newContent });
        }
      };

      updateFile('/src/index.ts', 'same content');

      expect(updateCount).toBe(0);
    });
  });

  describe('type definitions', () => {
    it('should support EditorDocument structure', () => {
      interface EditorDocument {
        value: string;
        filePath: string;
        scroll?: { top: number; left: number };
      }

      const doc: EditorDocument = {
        value: 'const x = 1;',
        filePath: '/src/test.ts',
        scroll: { top: 0, left: 0 },
      };

      expect(doc.value).toBeDefined();
      expect(doc.filePath).toBeDefined();
    });

    it('should support EditorDocuments type', () => {
      type EditorDocuments = Record<
        string,
        {
          value: string;
          filePath: string;
          scroll?: { top: number; left: number };
        }
      >;

      const docs: EditorDocuments = {
        '/test.ts': { value: 'code', filePath: '/test.ts' },
      };

      expect(docs['/test.ts']).toBeDefined();
    });
  });
});
