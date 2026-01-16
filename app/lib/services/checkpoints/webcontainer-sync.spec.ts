/**
 * Tests for WebContainer sync utilities.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { FileMap } from '~/lib/stores/files';
import { calculateDiff, previewSync } from './webcontainer-sync';

// Mock logger
vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock constants
vi.mock('~/utils/constants', () => ({
  WORK_DIR: '/home/project',
}));

describe('webcontainer-sync utilities', () => {
  describe('calculateDiff', () => {
    it('should detect new files', () => {
      const snapshot: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'new file', isBinary: false },
      };
      const current: FileMap = {};

      const { toWrite, toDelete } = calculateDiff(snapshot, current, []);

      expect(toWrite).toEqual(['/home/project/index.ts']);
      expect(toDelete).toEqual([]);
    });

    it('should detect modified files', () => {
      const snapshot: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'modified content', isBinary: false },
      };
      const current: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'original content', isBinary: false },
      };

      const { toWrite, toDelete } = calculateDiff(snapshot, current, []);

      expect(toWrite).toEqual(['/home/project/index.ts']);
      expect(toDelete).toEqual([]);
    });

    it('should detect deleted files', () => {
      const snapshot: FileMap = {};
      const current: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'will be deleted', isBinary: false },
      };

      const { toWrite, toDelete } = calculateDiff(snapshot, current, []);

      expect(toWrite).toEqual([]);
      expect(toDelete).toEqual(['/home/project/index.ts']);
    });

    it('should not include unchanged files', () => {
      const content = 'same content';
      const snapshot: FileMap = {
        '/home/project/index.ts': { type: 'file', content, isBinary: false },
      };
      const current: FileMap = {
        '/home/project/index.ts': { type: 'file', content, isBinary: false },
      };

      const { toWrite, toDelete } = calculateDiff(snapshot, current, []);

      expect(toWrite).toEqual([]);
      expect(toDelete).toEqual([]);
    });

    it('should exclude specified paths', () => {
      const snapshot: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'new', isBinary: false },
        '/home/project/node_modules/pkg/index.js': { type: 'file', content: 'pkg', isBinary: false },
      };
      const current: FileMap = {
        '/home/project/.git/config': { type: 'file', content: 'git config', isBinary: false },
      };

      const { toWrite, toDelete } = calculateDiff(snapshot, current, ['node_modules', '.git']);

      expect(toWrite).toEqual(['/home/project/index.ts']);
      expect(toDelete).toEqual([]);
    });

    it('should handle complex diff scenario', () => {
      const snapshot: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'index', isBinary: false },
        '/home/project/utils.ts': { type: 'file', content: 'modified utils', isBinary: false },
        '/home/project/new-file.ts': { type: 'file', content: 'new', isBinary: false },
      };
      const current: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'index', isBinary: false },
        '/home/project/utils.ts': { type: 'file', content: 'original utils', isBinary: false },
        '/home/project/old-file.ts': { type: 'file', content: 'old', isBinary: false },
      };

      const { toWrite, toDelete } = calculateDiff(snapshot, current, []);

      expect(toWrite).toContain('/home/project/utils.ts');
      expect(toWrite).toContain('/home/project/new-file.ts');
      expect(toWrite).not.toContain('/home/project/index.ts');
      expect(toDelete).toEqual(['/home/project/old-file.ts']);
    });

    it('should ignore folders in diff', () => {
      const snapshot: FileMap = {
        '/home/project/src': { type: 'folder' },
        '/home/project/src/index.ts': { type: 'file', content: 'code', isBinary: false },
      };
      const current: FileMap = {
        '/home/project/dist': { type: 'folder' },
      };

      const { toWrite, toDelete } = calculateDiff(snapshot, current, []);

      expect(toWrite).toEqual(['/home/project/src/index.ts']);
      expect(toDelete).toEqual([]);
    });
  });

  describe('previewSync', () => {
    it('should return correct preview stats', () => {
      const snapshot: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'same', isBinary: false },
        '/home/project/utils.ts': { type: 'file', content: 'modified', isBinary: false },
        '/home/project/new.ts': { type: 'file', content: 'new', isBinary: false },
      };
      const current: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'same', isBinary: false },
        '/home/project/utils.ts': { type: 'file', content: 'original', isBinary: false },
        '/home/project/old.ts': { type: 'file', content: 'old', isBinary: false },
      };

      const preview = previewSync(snapshot, current);

      expect(preview.toWrite).toHaveLength(2); // utils.ts (modified) + new.ts
      expect(preview.toDelete).toHaveLength(1); // old.ts
      expect(preview.unchanged).toBe(1); // index.ts
    });

    it('should handle empty snapshots', () => {
      const snapshot: FileMap = {};
      const current: FileMap = {
        '/home/project/file.ts': { type: 'file', content: 'content', isBinary: false },
      };

      const preview = previewSync(snapshot, current);

      expect(preview.toWrite).toHaveLength(0);
      expect(preview.toDelete).toHaveLength(1);
      expect(preview.unchanged).toBe(0);
    });

    it('should respect exclude paths', () => {
      const snapshot: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'code', isBinary: false },
      };
      const current: FileMap = {
        '/home/project/node_modules/dep/index.js': { type: 'file', content: 'dep', isBinary: false },
      };

      const preview = previewSync(snapshot, current, ['node_modules']);

      expect(preview.toWrite).toHaveLength(1);
      expect(preview.toDelete).toHaveLength(0); // node_modules excluded
    });
  });
});
