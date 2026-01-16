/**
 * Integration tests for checkpoints-db.
 * These tests use real PGLite (no mocks) to verify the system works end-to-end.
 */

import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { Message } from '~/types/message';
import type { FileMap } from '~/lib/stores/files';
import { CREATE_TABLES_SQL, CREATE_CHECKPOINTS_TABLE_SQL } from './schema';
import {
  createCheckpoint,
  getCheckpointsByChat,
  getCheckpointById,
  getLatestCheckpoint,
  getCheckpointsByTrigger,
  deleteCheckpoint,
  deleteCheckpointsByChat,
  deleteOldCheckpoints,
  getCheckpointCount,
  getCheckpointsTotalSize,
  updateCheckpointDescription,
  checkpointExists,
  getCheckpointsByTimeRange,
  generateCheckpointId,
  type CheckpointInput,
} from './checkpoints-db';

describe('checkpoints-db Integration Tests', () => {
  let db: PGlite;

  // Test data
  const testFilesSnapshot: FileMap = {
    '/home/project/index.ts': { type: 'file', content: 'console.log("hello world")', isBinary: false },
    '/home/project/package.json': { type: 'file', content: '{"name":"test","version":"1.0.0"}', isBinary: false },
    '/home/project/src': { type: 'folder' },
  };

  const testMessages: Message[] = [
    { id: 'msg-1', role: 'user', content: 'Create a hello world app' },
    { id: 'msg-2', role: 'assistant', content: 'Sure! Here is your app...' },
  ];

  beforeAll(async () => {
    // Create a real in-memory PGLite database
    db = new PGlite();
    await db.waitReady;

    // Create schema
    await db.exec(CREATE_TABLES_SQL);
    await db.exec(CREATE_CHECKPOINTS_TABLE_SQL);

    // Create a test chat for foreign key constraints
    await db.query(
      `INSERT INTO chats (id, url_id, description, messages, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      ['test-chat-1', 'test-url-1', 'Test Chat', '[]'],
    );

    await db.query(
      `INSERT INTO chats (id, url_id, description, messages, created_at, updated_at)
       VALUES ($1, $2, $3, $4, NOW(), NOW())`,
      ['test-chat-2', 'test-url-2', 'Test Chat 2', '[]'],
    );
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    // Clean up checkpoints before each test
    await db.query('DELETE FROM checkpoints');
  });

  describe('generateCheckpointId', () => {
    it('should generate unique IDs with correct format', () => {
      const ids = new Set<string>();

      for (let i = 0; i < 100; i++) {
        const id = generateCheckpointId();

        expect(id).toMatch(/^ckpt_[a-z0-9]+_[a-z0-9]+$/);
        expect(ids.has(id)).toBe(false);
        ids.add(id);
      }
    });
  });

  describe('createCheckpoint', () => {
    it('should create a checkpoint and store it in the database', async () => {
      const input: CheckpointInput = {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'manual',
        description: 'Test checkpoint',
      };

      const checkpoint = await createCheckpoint(db, input);

      expect(checkpoint.id).toMatch(/^ckpt_/);
      expect(checkpoint.chatId).toBe('test-chat-1');
      expect(checkpoint.filesSnapshot).toEqual(testFilesSnapshot);
      expect(checkpoint.messagesSnapshot).toEqual(testMessages);
      expect(checkpoint.triggerType).toBe('manual');
      expect(checkpoint.description).toBe('Test checkpoint');
      expect(checkpoint.isFullSnapshot).toBe(true);
      expect(checkpoint.compressed).toBe(false);
      expect(checkpoint.sizeBytes).toBeGreaterThan(0);
      expect(checkpoint.createdAt).toBeDefined();

      // Verify it's actually in the database
      const result = await db.query('SELECT * FROM checkpoints WHERE id = $1', [checkpoint.id]);
      expect(result.rows).toHaveLength(1);
    });

    it('should calculate correct size_bytes', async () => {
      const input: CheckpointInput = {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
      };

      const checkpoint = await createCheckpoint(db, input);

      // Size should be roughly the size of the JSON strings
      const expectedSize = new Blob([JSON.stringify(testFilesSnapshot), JSON.stringify(testMessages)]).size;

      expect(checkpoint.sizeBytes).toBe(expectedSize);
    });

    it('should mark as incremental when parent is provided', async () => {
      // Create parent checkpoint
      const parent = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
      });

      // Create child checkpoint
      const child = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
        parentCheckpointId: parent.id,
      });

      expect(child.isFullSnapshot).toBe(false);
      expect(child.parentCheckpointId).toBe(parent.id);
    });
  });

  describe('getCheckpointsByChat', () => {
    it('should return checkpoints ordered by created_at DESC', async () => {
      // Create multiple checkpoints with slight delays
      const cp1 = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
        description: 'First',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const cp2 = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'manual',
        description: 'Second',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const cp3 = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
        description: 'Third',
      });

      const checkpoints = await getCheckpointsByChat(db, 'test-chat-1');

      expect(checkpoints).toHaveLength(3);
      expect(checkpoints[0].id).toBe(cp3.id); // Most recent first
      expect(checkpoints[1].id).toBe(cp2.id);
      expect(checkpoints[2].id).toBe(cp1.id);
    });

    it('should respect limit parameter', async () => {
      for (let i = 0; i < 5; i++) {
        await createCheckpoint(db, {
          chatId: 'test-chat-1',
          filesSnapshot: testFilesSnapshot,
          messagesSnapshot: testMessages,
          triggerType: 'auto',
        });
      }

      const checkpoints = await getCheckpointsByChat(db, 'test-chat-1', 3);

      expect(checkpoints).toHaveLength(3);
    });

    it('should only return checkpoints for specified chat', async () => {
      await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
      });

      await createCheckpoint(db, {
        chatId: 'test-chat-2',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
      });

      const chat1Checkpoints = await getCheckpointsByChat(db, 'test-chat-1');
      const chat2Checkpoints = await getCheckpointsByChat(db, 'test-chat-2');

      expect(chat1Checkpoints).toHaveLength(1);
      expect(chat2Checkpoints).toHaveLength(1);
      expect(chat1Checkpoints[0].chatId).toBe('test-chat-1');
      expect(chat2Checkpoints[0].chatId).toBe('test-chat-2');
    });
  });

  describe('getCheckpointById', () => {
    it('should return checkpoint when found', async () => {
      const created = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'manual',
      });

      const found = await getCheckpointById(db, created.id);

      expect(found).not.toBeNull();
      expect(found?.id).toBe(created.id);
      expect(found?.filesSnapshot).toEqual(testFilesSnapshot);
    });

    it('should return null when not found', async () => {
      const result = await getCheckpointById(db, 'nonexistent-id');

      expect(result).toBeNull();
    });
  });

  describe('getLatestCheckpoint', () => {
    it('should return the most recent checkpoint', async () => {
      await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
        description: 'Old',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const latest = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'manual',
        description: 'Latest',
      });

      const result = await getLatestCheckpoint(db, 'test-chat-1');

      expect(result?.id).toBe(latest.id);
      expect(result?.description).toBe('Latest');
    });

    it('should return null when no checkpoints exist', async () => {
      const result = await getLatestCheckpoint(db, 'test-chat-1');

      expect(result).toBeNull();
    });
  });

  describe('getCheckpointsByTrigger', () => {
    it('should filter by trigger type', async () => {
      await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
      });

      await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'manual',
      });

      await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'before_action',
      });

      const manualCheckpoints = await getCheckpointsByTrigger(db, 'test-chat-1', 'manual');
      const autoCheckpoints = await getCheckpointsByTrigger(db, 'test-chat-1', 'auto');

      expect(manualCheckpoints).toHaveLength(1);
      expect(autoCheckpoints).toHaveLength(1);
      expect(manualCheckpoints[0].triggerType).toBe('manual');
      expect(autoCheckpoints[0].triggerType).toBe('auto');
    });
  });

  describe('deleteCheckpoint', () => {
    it('should delete checkpoint and return true', async () => {
      const checkpoint = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
      });

      const deleted = await deleteCheckpoint(db, checkpoint.id);

      expect(deleted).toBe(true);

      const found = await getCheckpointById(db, checkpoint.id);
      expect(found).toBeNull();
    });

    it('should return false when checkpoint not found', async () => {
      const deleted = await deleteCheckpoint(db, 'nonexistent');

      expect(deleted).toBe(false);
    });
  });

  describe('deleteCheckpointsByChat', () => {
    it('should delete all checkpoints for a chat', async () => {
      for (let i = 0; i < 5; i++) {
        await createCheckpoint(db, {
          chatId: 'test-chat-1',
          filesSnapshot: testFilesSnapshot,
          messagesSnapshot: testMessages,
          triggerType: 'auto',
        });
      }

      const count = await deleteCheckpointsByChat(db, 'test-chat-1');

      expect(count).toBe(5);

      const remaining = await getCheckpointsByChat(db, 'test-chat-1');
      expect(remaining).toHaveLength(0);
    });
  });

  describe('deleteOldCheckpoints', () => {
    it('should keep most recent N checkpoints', async () => {
      for (let i = 0; i < 10; i++) {
        await createCheckpoint(db, {
          chatId: 'test-chat-1',
          filesSnapshot: testFilesSnapshot,
          messagesSnapshot: testMessages,
          triggerType: 'auto',
          description: `Checkpoint ${i}`,
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      const deletedCount = await deleteOldCheckpoints(db, 'test-chat-1', 3, { preserveManual: false });

      expect(deletedCount).toBe(7);

      const remaining = await getCheckpointsByChat(db, 'test-chat-1');
      expect(remaining).toHaveLength(3);
    });

    it('should preserve manual checkpoints when preserveManual is true', async () => {
      // Create auto checkpoints
      for (let i = 0; i < 5; i++) {
        await createCheckpoint(db, {
          chatId: 'test-chat-1',
          filesSnapshot: testFilesSnapshot,
          messagesSnapshot: testMessages,
          triggerType: 'auto',
        });
        await new Promise((resolve) => setTimeout(resolve, 5));
      }

      // Create a manual checkpoint (old)
      const manualCheckpoint = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'manual',
        description: 'Important manual checkpoint',
      });

      await deleteOldCheckpoints(db, 'test-chat-1', 2, { preserveManual: true });

      // Verify manual checkpoint still exists
      const manual = await getCheckpointById(db, manualCheckpoint.id);
      expect(manual).not.toBeNull();
    });
  });

  describe('getCheckpointCount', () => {
    it('should return correct count', async () => {
      for (let i = 0; i < 7; i++) {
        await createCheckpoint(db, {
          chatId: 'test-chat-1',
          filesSnapshot: testFilesSnapshot,
          messagesSnapshot: testMessages,
          triggerType: 'auto',
        });
      }

      const count = await getCheckpointCount(db, 'test-chat-1');

      expect(count).toBe(7);
    });

    it('should return 0 when no checkpoints', async () => {
      const count = await getCheckpointCount(db, 'test-chat-1');

      expect(count).toBe(0);
    });
  });

  describe('getCheckpointsTotalSize', () => {
    it('should return sum of all checkpoint sizes', async () => {
      const cp1 = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
      });

      const cp2 = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'manual',
      });

      const totalSize = await getCheckpointsTotalSize(db, 'test-chat-1');

      expect(totalSize).toBe((cp1.sizeBytes ?? 0) + (cp2.sizeBytes ?? 0));
    });
  });

  describe('updateCheckpointDescription', () => {
    it('should update description', async () => {
      const checkpoint = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
        description: 'Original',
      });

      const updated = await updateCheckpointDescription(db, checkpoint.id, 'Updated description');

      expect(updated).toBe(true);

      const found = await getCheckpointById(db, checkpoint.id);
      expect(found?.description).toBe('Updated description');
    });
  });

  describe('checkpointExists', () => {
    it('should return true when exists', async () => {
      const checkpoint = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
      });

      const exists = await checkpointExists(db, checkpoint.id);

      expect(exists).toBe(true);
    });

    it('should return false when not exists', async () => {
      const exists = await checkpointExists(db, 'nonexistent');

      expect(exists).toBe(false);
    });
  });

  describe('getCheckpointsByTimeRange', () => {
    it('should return checkpoints within time range', async () => {
      const startTime = new Date();

      await new Promise((resolve) => setTimeout(resolve, 10));

      await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
      });

      await new Promise((resolve) => setTimeout(resolve, 10));

      const endTime = new Date();

      const checkpoints = await getCheckpointsByTimeRange(db, 'test-chat-1', startTime, endTime);

      expect(checkpoints).toHaveLength(1);
    });
  });

  describe('Foreign Key Cascade Delete', () => {
    it('should delete checkpoints when chat is deleted', async () => {
      // Create a temporary chat
      await db.query(
        `INSERT INTO chats (id, url_id, description, messages)
         VALUES ($1, $2, $3, $4)`,
        ['temp-chat', 'temp-url', 'Temp', '[]'],
      );

      // Create checkpoints for this chat
      await createCheckpoint(db, {
        chatId: 'temp-chat',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'auto',
      });

      await createCheckpoint(db, {
        chatId: 'temp-chat',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: testMessages,
        triggerType: 'manual',
      });

      // Verify checkpoints exist
      let count = await getCheckpointCount(db, 'temp-chat');
      expect(count).toBe(2);

      // Delete the chat
      await db.query('DELETE FROM chats WHERE id = $1', ['temp-chat']);

      // Verify checkpoints are also deleted (CASCADE)
      count = await getCheckpointCount(db, 'temp-chat');
      expect(count).toBe(0);
    });
  });

  describe('CHECK constraint validation', () => {
    it('should reject invalid trigger_type', async () => {
      await expect(
        db.query(
          `INSERT INTO checkpoints (id, chat_id, files_snapshot, messages_snapshot, trigger_type)
           VALUES ($1, $2, $3, $4, $5)`,
          ['test-id', 'test-chat-1', '{}', '[]', 'invalid_type'],
        ),
      ).rejects.toThrow();
    });
  });

  describe('Data integrity - JSON parsing', () => {
    it('should correctly serialize and deserialize complex FileMap', async () => {
      const complexFileMap: FileMap = {
        '/home/project/src/index.ts': {
          type: 'file',
          content: `import { something } from 'somewhere';\n\nconst x = "hello \\"world\\"";\nconsole.log(x);`,
          isBinary: false,
        },
        '/home/project/assets/image.png': {
          type: 'file',
          content: 'binary-content-placeholder',
          isBinary: true,
        },
        '/home/project/src': { type: 'folder' },
        '/home/project/src/utils': { type: 'folder' },
      };

      const checkpoint = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: complexFileMap,
        messagesSnapshot: testMessages,
        triggerType: 'manual',
      });

      const retrieved = await getCheckpointById(db, checkpoint.id);

      expect(retrieved?.filesSnapshot).toEqual(complexFileMap);
    });

    it('should correctly handle messages with special characters', async () => {
      const messagesWithSpecialChars: Message[] = [
        { id: 'msg-1', role: 'user', content: 'Create a "hello world" app with <html> tags' },
        { id: 'msg-2', role: 'assistant', content: 'Here\'s your app:\n```typescript\nconst x = "test";\n```' },
      ];

      const checkpoint = await createCheckpoint(db, {
        chatId: 'test-chat-1',
        filesSnapshot: testFilesSnapshot,
        messagesSnapshot: messagesWithSpecialChars,
        triggerType: 'auto',
      });

      const retrieved = await getCheckpointById(db, checkpoint.id);

      expect(retrieved?.messagesSnapshot).toEqual(messagesWithSpecialChars);
    });
  });
});
