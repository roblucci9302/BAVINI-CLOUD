/**
 * Integration tests for CheckpointService with real PGLite database.
 * These tests verify that the service works correctly with actual database operations.
 */

import { describe, expect, it, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { FileMap } from '~/lib/stores/files';
import { CREATE_TABLES_SQL, CREATE_CHECKPOINTS_TABLE_SQL } from '~/lib/persistence/schema';
import {
  createCheckpoint as dbCreateCheckpoint,
  getCheckpointById as dbGetCheckpointById,
  getCheckpointsByChat as dbGetCheckpointsByChat,
} from '~/lib/persistence/checkpoints-db';
import { checkpointsMap, clearCheckpoints, setCurrentChatId, currentChatCheckpoints } from '~/lib/stores/checkpoints';
import { calculateDiff, previewSync } from './webcontainer-sync';
import {
  compressString,
  decompressString,
  compressJson,
  decompressJson,
  calculateStringSize,
  isCompressionSupported,
} from './compression';

describe('CheckpointService integration', () => {
  let db: PGlite;

  const mockFilesSnapshot: FileMap = {
    '/home/project/index.ts': { type: 'file', content: 'console.log("hello")', isBinary: false },
    '/home/project/utils.ts': { type: 'file', content: 'export const add = (a, b) => a + b;', isBinary: false },
  };

  const mockMessages = [
    { id: 'msg-1', role: 'user' as const, content: 'Hello' },
    { id: 'msg-2', role: 'assistant' as const, content: 'Hi there!' },
  ];

  beforeAll(async () => {
    // Create in-memory PGLite instance
    db = new PGlite();
    await db.waitReady;

    // Initialize schema
    await db.exec(CREATE_TABLES_SQL);
    await db.exec(CREATE_CHECKPOINTS_TABLE_SQL);

    // Create a test chat for foreign key constraint
    await db.query(`INSERT INTO chats (id, url_id, description, messages) VALUES ($1, $2, $3, $4)`, [
      'service-test-chat',
      'url-service',
      'Service Test Chat',
      '[]',
    ]);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(() => {
    // Reset store state
    checkpointsMap.set({});
    setCurrentChatId('service-test-chat');
  });

  afterEach(async () => {
    // Clean up checkpoints from database
    await db.query('DELETE FROM checkpoints WHERE chat_id = $1', ['service-test-chat']);
  });

  describe('compression integration', () => {
    it('should correctly compress and decompress strings', async () => {
      const original = 'Hello, this is a test string that will be compressed and decompressed.';
      const compressed = await compressString(original);
      const decompressed = await decompressString(compressed);
      expect(decompressed).toBe(original);
    });

    it('should correctly compress and decompress JSON', async () => {
      const original = {
        files: mockFilesSnapshot,
        messages: mockMessages,
        nested: { value: 123, active: true },
      };
      const compressed = await compressJson(original);
      const decompressed = await decompressJson<typeof original>(compressed);
      expect(decompressed).toEqual(original);
    });

    it('should calculate string size correctly', () => {
      const str = 'Hello, World!';
      const size = calculateStringSize(str);
      expect(size).toBe(13);
    });

    it('should handle large JSON compression', async () => {
      // Create a large object
      const largeFiles: FileMap = {};

      for (let i = 0; i < 100; i++) {
        largeFiles[`/home/project/file${i}.ts`] = {
          type: 'file',
          content: `// File ${i}\n${'x'.repeat(1000)}`,
          isBinary: false,
        };
      }

      const compressed = await compressJson(largeFiles);
      const decompressed = await decompressJson<FileMap>(compressed);

      expect(Object.keys(decompressed)).toHaveLength(100);
      expect(decompressed['/home/project/file0.ts']).toBeDefined();
    });
  });

  describe('webcontainer-sync integration', () => {
    it('should calculate diff between snapshots', () => {
      const snapshot: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'new content', isBinary: false },
        '/home/project/new-file.ts': { type: 'file', content: 'new file', isBinary: false },
      };
      const current: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'old content', isBinary: false },
        '/home/project/old-file.ts': { type: 'file', content: 'old file', isBinary: false },
      };

      const { toWrite, toDelete } = calculateDiff(snapshot, current, []);

      expect(toWrite).toContain('/home/project/index.ts');
      expect(toWrite).toContain('/home/project/new-file.ts');
      expect(toDelete).toContain('/home/project/old-file.ts');
    });

    it('should preview sync correctly', () => {
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

    it('should respect exclude paths', () => {
      const snapshot: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'code', isBinary: false },
      };
      const current: FileMap = {
        '/home/project/node_modules/dep/index.js': { type: 'file', content: 'dep', isBinary: false },
        '/home/project/.git/config': { type: 'file', content: 'config', isBinary: false },
      };

      const preview = previewSync(snapshot, current, ['node_modules', '.git']);

      expect(preview.toWrite).toHaveLength(1);
      expect(preview.toDelete).toHaveLength(0); // excluded paths not deleted
    });
  });

  describe('service with database', () => {
    it('should create checkpoint and store in database', async () => {
      const checkpoint = await dbCreateCheckpoint(db, {
        chatId: 'service-test-chat',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: mockMessages,
        description: 'Integration test checkpoint',
        triggerType: 'manual',
      });

      expect(checkpoint.id).toBeDefined();
      expect(checkpoint.description).toBe('Integration test checkpoint');

      // Verify in database
      const dbCheckpoint = await dbGetCheckpointById(db, checkpoint.id);
      expect(dbCheckpoint).not.toBeNull();
      expect(dbCheckpoint?.filesSnapshot).toEqual(mockFilesSnapshot);
    });

    it('should retrieve checkpoints from database', async () => {
      // Create multiple checkpoints
      await dbCreateCheckpoint(db, {
        chatId: 'service-test-chat',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [],
        triggerType: 'auto',
      });
      await dbCreateCheckpoint(db, {
        chatId: 'service-test-chat',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [],
        triggerType: 'manual',
      });

      const checkpoints = await dbGetCheckpointsByChat(db, 'service-test-chat');
      expect(checkpoints).toHaveLength(2);
    });

    it('should maintain data integrity through compression', async () => {
      // Create checkpoint with complex data
      const complexFiles: FileMap = {
        '/home/project/index.ts': {
          type: 'file',
          content: '// Special chars: éàü 中文 🎉\nexport const x = "test";',
          isBinary: false,
        },
        '/home/project/config.json': {
          type: 'file',
          content: JSON.stringify({ key: 'value', nested: { arr: [1, 2, 3] } }),
          isBinary: false,
        },
      };

      const checkpoint = await dbCreateCheckpoint(db, {
        chatId: 'service-test-chat',
        filesSnapshot: complexFiles,
        messagesSnapshot: [{ id: 'msg-1', role: 'user', content: 'Test with émojis 🚀' }],
        triggerType: 'manual',
      });

      const retrieved = await dbGetCheckpointById(db, checkpoint.id);

      const file = retrieved?.filesSnapshot['/home/project/index.ts'];
      expect(file?.type === 'file' ? file.content : '').toContain('éàü 中文 🎉');
      expect(retrieved?.messagesSnapshot[0]?.content).toContain('🚀');
    });

    it('should handle concurrent checkpoint creation', async () => {
      const promises = Array.from({ length: 5 }, (_, i) =>
        dbCreateCheckpoint(db, {
          chatId: 'service-test-chat',
          filesSnapshot: mockFilesSnapshot,
          messagesSnapshot: [],
          description: `Concurrent ${i}`,
          triggerType: 'auto',
        }),
      );

      const checkpoints = await Promise.all(promises);
      expect(checkpoints).toHaveLength(5);

      // Verify all have unique IDs
      const ids = checkpoints.map((c) => c.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(5);
    });
  });

  describe('end-to-end workflow', () => {
    it('should complete full checkpoint lifecycle', async () => {
      // 1. Create checkpoint
      const checkpoint = await dbCreateCheckpoint(db, {
        chatId: 'service-test-chat',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: mockMessages,
        description: 'E2E Test Checkpoint',
        triggerType: 'manual',
      });

      // 2. Verify it was created
      expect(checkpoint.id).toBeDefined();

      // 3. Load it from database
      const loaded = await dbGetCheckpointById(db, checkpoint.id);
      expect(loaded).not.toBeNull();

      // 4. Verify snapshots match
      expect(loaded?.filesSnapshot).toEqual(mockFilesSnapshot);
      expect(loaded?.messagesSnapshot).toEqual(mockMessages);

      // 5. Calculate diff for restore
      const currentFiles: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'modified content', isBinary: false },
        '/home/project/new-file.ts': { type: 'file', content: 'new', isBinary: false },
      };

      const preview = previewSync(loaded!.filesSnapshot, currentFiles);
      expect(preview.toWrite).toHaveLength(2); // index.ts + utils.ts
      expect(preview.toDelete).toHaveLength(1); // new-file.ts

      // 6. Delete checkpoint
      await db.query('DELETE FROM checkpoints WHERE id = $1', [checkpoint.id]);

      // 7. Verify deletion
      const deleted = await dbGetCheckpointById(db, checkpoint.id);
      expect(deleted).toBeNull();
    });
  });
});
