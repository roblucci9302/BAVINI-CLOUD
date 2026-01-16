/**
 * Phase 5 Integration Tests for Checkpoints/Time Travel system.
 * Tests for compression, incremental diffs, auto-checkpoint, and cleanup.
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { FileMap } from '~/lib/stores/files';
import { CREATE_TABLES_SQL, CREATE_CHECKPOINTS_TABLE_SQL } from '~/lib/persistence/schema';
import {
  createCheckpoint,
  getCheckpointById,
  getCheckpointsByChat,
  deleteOldCheckpoints,
  getCheckpointCount,
  getCheckpointsTotalSize,
} from './checkpoints-db';
import {
  calculateFilesDiff,
  applyFilesDiff,
  isDiffEmpty,
  calculateDiffSize,
  shouldUseIncremental,
  getDiffSummary,
} from './checkpoint-diff';
import { compressSnapshot, decompressSnapshot, isCompressed } from './checkpoint-compression';

describe('Phase 5: Optimizations', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await db.waitReady;
    await db.exec(CREATE_TABLES_SQL);
    await db.exec(CREATE_CHECKPOINTS_TABLE_SQL);

    // Create test chat
    await db.query(`INSERT INTO chats (id, url_id, description, messages) VALUES ($1, $2, $3, $4)`, [
      'phase5-test-chat',
      'url-phase5',
      'Phase 5 Test Chat',
      '[]',
    ]);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.query('DELETE FROM checkpoints WHERE chat_id = $1', ['phase5-test-chat']);
  });

  describe('Compression', () => {
    it('should compress large snapshots', async () => {
      // Create a large file map
      const largeFiles: FileMap = {};

      for (let i = 0; i < 50; i++) {
        largeFiles[`/home/project/file${i}.ts`] = {
          type: 'file',
          content: `// File ${i}\n${'const x = "test";\n'.repeat(100)}`,
          isBinary: false,
        };
      }

      const messages = [
        { id: 'msg-1', role: 'user' as const, content: 'Hello' },
        { id: 'msg-2', role: 'assistant' as const, content: 'Hi there!' },
      ];

      const compressed = await compressSnapshot(
        { filesSnapshot: largeFiles, messagesSnapshot: messages },
        50 * 1024, // 50KB threshold
      );

      expect(compressed.compressed).toBe(true);
      expect(compressed.compressedSize).toBeLessThan(compressed.originalSize);
    });

    it('should not compress small snapshots', async () => {
      const smallFiles: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'const x = 1;', isBinary: false },
      };

      const compressed = await compressSnapshot(
        { filesSnapshot: smallFiles, messagesSnapshot: [] },
        100 * 1024, // 100KB threshold (larger than data)
      );

      expect(compressed.compressed).toBe(false);
    });

    it('should correctly decompress compressed data', async () => {
      const originalFiles: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'const x = "test";', isBinary: false },
        '/home/project/utils.ts': { type: 'file', content: 'export const add = (a, b) => a + b;', isBinary: false },
      };

      const originalMessages = [{ id: 'msg-1', role: 'user' as const, content: 'Test message' }];

      const compressed = await compressSnapshot(
        { filesSnapshot: originalFiles, messagesSnapshot: originalMessages },
        0, // Force compression
      );

      expect(compressed.compressed).toBe(true);

      const decompressed = await decompressSnapshot(compressed.files, compressed.messages, compressed.actions);

      expect(decompressed.filesSnapshot).toEqual(originalFiles);
      expect(decompressed.messagesSnapshot).toEqual(originalMessages);
    });

    it('should detect compressed data correctly', () => {
      expect(isCompressed('GZIP:H4sIAAAAAAAA...')).toBe(true);
      expect(isCompressed('{"key": "value"}')).toBe(false);
    });

    it('should store compressed checkpoints in database', async () => {
      // Create a large checkpoint that will be compressed
      const largeFiles: FileMap = {};

      for (let i = 0; i < 20; i++) {
        largeFiles[`/home/project/file${i}.ts`] = {
          type: 'file',
          content: `// Large file ${i}\n${'x'.repeat(5000)}`,
          isBinary: false,
        };
      }

      const checkpoint = await createCheckpoint(
        db,
        {
          chatId: 'phase5-test-chat',
          filesSnapshot: largeFiles,
          messagesSnapshot: [],
          description: 'Compressed checkpoint',
          triggerType: 'manual',
        },
        { enableCompression: true, compressionThreshold: 1024 },
      );

      expect(checkpoint.id).toBeDefined();
      expect(checkpoint.compressed).toBe(true);

      // Verify we can retrieve and decompress
      const retrieved = await getCheckpointById(db, checkpoint.id);
      expect(retrieved).not.toBeNull();
      expect(Object.keys(retrieved!.filesSnapshot)).toHaveLength(20);
    });
  });

  describe('Incremental Diffs', () => {
    it('should calculate file diffs correctly', () => {
      const previous: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'old content', isBinary: false },
        '/home/project/deleted.ts': { type: 'file', content: 'will be deleted', isBinary: false },
      };

      const current: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'new content', isBinary: false },
        '/home/project/added.ts': { type: 'file', content: 'new file', isBinary: false },
      };

      const diff = calculateFilesDiff(previous, current);

      expect(diff.addedCount).toBe(1); // added.ts
      expect(diff.modifiedCount).toBe(1); // index.ts
      expect(diff.deletedCount).toBe(1); // deleted.ts
      expect(diff.entries).toHaveLength(3);
    });

    it('should apply diffs correctly', () => {
      const base: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'original', isBinary: false },
        '/home/project/utils.ts': { type: 'file', content: 'utils code', isBinary: false },
      };

      const diff = {
        entries: [
          { path: '/home/project/index.ts', operation: 'modify' as const, content: 'modified' },
          { path: '/home/project/new.ts', operation: 'add' as const, content: 'new file' },
          { path: '/home/project/utils.ts', operation: 'delete' as const },
        ],
        addedCount: 1,
        modifiedCount: 1,
        deletedCount: 1,
        unchangedCount: 0,
      };

      const result = applyFilesDiff(base, diff);

      expect(result['/home/project/index.ts']).toEqual({
        type: 'file',
        content: 'modified',
        isBinary: false,
      });
      expect(result['/home/project/new.ts']).toEqual({
        type: 'file',
        content: 'new file',
        isBinary: false,
      });
      expect(result['/home/project/utils.ts']).toBeUndefined();
    });

    it('should detect empty diffs', () => {
      const files: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'same', isBinary: false },
      };

      const diff = calculateFilesDiff(files, files);

      expect(isDiffEmpty(diff)).toBe(true);
      expect(diff.unchangedCount).toBe(1);
    });

    it('should calculate diff size correctly', () => {
      const diff = {
        entries: [{ path: '/home/project/file.ts', operation: 'add' as const, content: 'Hello World!' }],
        addedCount: 1,
        modifiedCount: 0,
        deletedCount: 0,
        unchangedCount: 0,
      };

      const size = calculateDiffSize(diff);

      // Path (21) + Content (12)
      expect(size).toBe(33);
    });

    it('should determine when to use incremental storage', () => {
      const fullSnapshot: FileMap = {};

      for (let i = 0; i < 100; i++) {
        fullSnapshot[`/home/project/file${i}.ts`] = {
          type: 'file',
          content: 'x'.repeat(1000),
          isBinary: false,
        };
      }

      // Small diff relative to full snapshot
      const smallDiff = {
        entries: [{ path: '/home/project/file0.ts', operation: 'modify' as const, content: 'modified' }],
        addedCount: 0,
        modifiedCount: 1,
        deletedCount: 0,
        unchangedCount: 99,
      };

      expect(shouldUseIncremental(smallDiff, fullSnapshot)).toBe(true);

      // Large diff (many changes)
      const largeDiff = {
        entries: fullSnapshot
          ? Object.keys(fullSnapshot).map((path) => ({
              path,
              operation: 'modify' as const,
              content: 'modified x'.repeat(100),
            }))
          : [],
        addedCount: 0,
        modifiedCount: 100,
        deletedCount: 0,
        unchangedCount: 0,
      };

      expect(shouldUseIncremental(largeDiff, fullSnapshot)).toBe(false);
    });

    it('should generate diff summaries', () => {
      const diff = {
        entries: [],
        addedCount: 3,
        modifiedCount: 2,
        deletedCount: 1,
        unchangedCount: 10,
      };

      expect(getDiffSummary(diff)).toBe('+3 ~2 -1');

      const emptyDiff = {
        entries: [],
        addedCount: 0,
        modifiedCount: 0,
        deletedCount: 0,
        unchangedCount: 5,
      };

      expect(getDiffSummary(emptyDiff)).toBe('no changes');
    });
  });

  describe('Automatic Cleanup', () => {
    it('should delete old checkpoints keeping recent ones', async () => {
      // Create 10 checkpoints
      for (let i = 0; i < 10; i++) {
        await createCheckpoint(db, {
          chatId: 'phase5-test-chat',
          filesSnapshot: { [`/file${i}.ts`]: { type: 'file', content: `${i}`, isBinary: false } },
          messagesSnapshot: [],
          description: `Checkpoint ${i}`,
          triggerType: 'auto',
        });

        // Small delay to ensure different timestamps
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Verify 10 checkpoints exist
      const beforeCount = await getCheckpointCount(db, 'phase5-test-chat');
      expect(beforeCount).toBe(10);

      // Delete old checkpoints, keep only 5
      const deleted = await deleteOldCheckpoints(db, 'phase5-test-chat', 5);
      expect(deleted).toBe(5);

      // Verify 5 remain
      const afterCount = await getCheckpointCount(db, 'phase5-test-chat');
      expect(afterCount).toBe(5);
    });

    it('should preserve manual checkpoints during cleanup', async () => {
      // Create 5 auto checkpoints
      for (let i = 0; i < 5; i++) {
        await createCheckpoint(db, {
          chatId: 'phase5-test-chat',
          filesSnapshot: {},
          messagesSnapshot: [],
          description: `Auto ${i}`,
          triggerType: 'auto',
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Create 2 manual checkpoints
      for (let i = 0; i < 2; i++) {
        await createCheckpoint(db, {
          chatId: 'phase5-test-chat',
          filesSnapshot: {},
          messagesSnapshot: [],
          description: `Manual ${i}`,
          triggerType: 'manual',
        });
        await new Promise((resolve) => setTimeout(resolve, 10));
      }

      // Delete old, keep 3, preserve manual
      await deleteOldCheckpoints(db, 'phase5-test-chat', 3, { preserveManual: true });

      // Get remaining checkpoints
      const remaining = await getCheckpointsByChat(db, 'phase5-test-chat');

      // Manual checkpoints should still exist
      const manualCheckpoints = remaining.filter((c) => c.triggerType === 'manual');
      expect(manualCheckpoints.length).toBeGreaterThanOrEqual(2);
    });

    it('should track total size of checkpoints', async () => {
      // Create checkpoints with known sizes
      await createCheckpoint(db, {
        chatId: 'phase5-test-chat',
        filesSnapshot: { '/file.ts': { type: 'file', content: 'x'.repeat(1000), isBinary: false } },
        messagesSnapshot: [],
        triggerType: 'manual',
      });

      const totalSize = await getCheckpointsTotalSize(db, 'phase5-test-chat');
      expect(totalSize).toBeGreaterThan(0);
    });
  });

  describe('End-to-End Workflow', () => {
    it('should handle full checkpoint lifecycle with optimizations', async () => {
      // 1. Create initial large checkpoint (should compress)
      const largeFiles: FileMap = {};

      for (let i = 0; i < 30; i++) {
        largeFiles[`/home/project/src/file${i}.ts`] = {
          type: 'file',
          content: `// Module ${i}\nexport const value${i} = ${i};\n${'// Comment\n'.repeat(50)}`,
          isBinary: false,
        };
      }

      const checkpoint1 = await createCheckpoint(
        db,
        {
          chatId: 'phase5-test-chat',
          filesSnapshot: largeFiles,
          messagesSnapshot: [{ id: '1', role: 'user', content: 'Initial' }],
          description: 'Initial state',
          triggerType: 'manual',
        },
        { enableCompression: true, compressionThreshold: 1024 },
      );

      expect(checkpoint1.id).toBeDefined();

      // 2. Simulate file changes
      const modifiedFiles = { ...largeFiles };
      modifiedFiles['/home/project/src/file0.ts'] = {
        type: 'file',
        content: 'modified content',
        isBinary: false,
      };
      modifiedFiles['/home/project/src/newfile.ts'] = {
        type: 'file',
        content: 'new file content',
        isBinary: false,
      };

      // 3. Calculate diff for potential incremental checkpoint
      const diff = calculateFilesDiff(largeFiles, modifiedFiles);
      expect(diff.modifiedCount).toBe(1);
      expect(diff.addedCount).toBe(1);

      // 4. Create second checkpoint
      const checkpoint2 = await createCheckpoint(
        db,
        {
          chatId: 'phase5-test-chat',
          filesSnapshot: modifiedFiles,
          messagesSnapshot: [
            { id: '1', role: 'user', content: 'Initial' },
            { id: '2', role: 'assistant', content: 'Modified' },
          ],
          description: 'After changes',
          triggerType: 'auto',
        },
        { enableCompression: true, compressionThreshold: 1024 },
      );

      // 5. Verify both checkpoints can be retrieved
      const retrieved1 = await getCheckpointById(db, checkpoint1.id);
      const retrieved2 = await getCheckpointById(db, checkpoint2.id);

      expect(retrieved1).not.toBeNull();
      expect(retrieved2).not.toBeNull();
      expect(Object.keys(retrieved1!.filesSnapshot)).toHaveLength(30);
      expect(Object.keys(retrieved2!.filesSnapshot)).toHaveLength(31); // +1 new file

      // 6. Verify checkpoint count
      const count = await getCheckpointCount(db, 'phase5-test-chat');
      expect(count).toBe(2);
    });
  });
});
