/**
 * Integration tests for checkpoints store with real PGLite database.
 * These tests verify that the store works correctly with the database layer.
 */

import { describe, expect, it, beforeEach, afterEach, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import type { Checkpoint } from '~/types/checkpoint';
import type { FileMap } from '~/lib/stores/files';
import { CREATE_TABLES_SQL, CREATE_CHECKPOINTS_TABLE_SQL } from '~/lib/persistence/schema';
import {
  createCheckpoint,
  getCheckpointsByChat,
  getCheckpointById,
  deleteCheckpoint,
} from '~/lib/persistence/checkpoints-db';
import {
  checkpointsMap,
  currentChatId,
  addCheckpoint,
  addCheckpoints,
  removeCheckpoint,
  clearCheckpoints,
  setCurrentChatId,
  currentChatCheckpoints,
  latestCheckpoint,
  checkpointCount,
  hasCheckpoints,
  checkpointStats,
  getCheckpoint,
  filterExcludedFiles,
  formatCheckpointForTimeline,
} from './checkpoints';

describe('checkpoints store integration', () => {
  let db: PGlite;

  const mockFilesSnapshot: FileMap = {
    '/home/project/index.ts': { type: 'file', content: 'console.log("test")', isBinary: false },
    '/home/project/utils.ts': { type: 'file', content: 'export const add = (a, b) => a + b;', isBinary: false },
  };

  beforeAll(async () => {
    // Create in-memory PGLite instance
    db = new PGlite();
    await db.waitReady;

    // Initialize schema
    await db.exec(CREATE_TABLES_SQL);
    await db.exec(CREATE_CHECKPOINTS_TABLE_SQL);

    // Create a test chat for foreign key constraint
    await db.query(`INSERT INTO chats (id, url_id, description, messages) VALUES ($1, $2, $3, $4)`, [
      'integration-chat-1',
      'url-1',
      'Test Chat',
      '[]',
    ]);
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(() => {
    // Reset store state
    checkpointsMap.set({});
    setCurrentChatId('integration-chat-1');
  });

  afterEach(async () => {
    // Clean up checkpoints from database
    await db.query('DELETE FROM checkpoints WHERE chat_id = $1', ['integration-chat-1']);
  });

  describe('store and database synchronization', () => {
    it('should create checkpoint in database and add to store', async () => {
      // Create checkpoint in database
      const checkpoint = await createCheckpoint(db, {
        chatId: 'integration-chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
        description: 'Integration test checkpoint',
        triggerType: 'manual',
      });

      // Add to store
      addCheckpoint(checkpoint);

      // Verify store state
      const storeCheckpoint = getCheckpoint(checkpoint.id);
      expect(storeCheckpoint).toBeDefined();
      expect(storeCheckpoint?.id).toBe(checkpoint.id);
      expect(storeCheckpoint?.description).toBe('Integration test checkpoint');

      // Verify database state
      const dbCheckpoint = await getCheckpointById(db, checkpoint.id);
      expect(dbCheckpoint).toBeDefined();
      expect(dbCheckpoint?.id).toBe(checkpoint.id);
    });

    it('should load checkpoints from database and populate store', async () => {
      // Create multiple checkpoints in database
      const checkpoint1 = await createCheckpoint(db, {
        chatId: 'integration-chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [],
        triggerType: 'auto',
      });

      const checkpoint2 = await createCheckpoint(db, {
        chatId: 'integration-chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [],
        triggerType: 'manual',
      });

      // Load from database and add to store
      const dbCheckpoints = await getCheckpointsByChat(db, 'integration-chat-1');
      addCheckpoints(dbCheckpoints);

      // Verify store has both checkpoints
      expect(checkpointCount.get()).toBe(2);
      expect(hasCheckpoints.get()).toBe(true);
      expect(getCheckpoint(checkpoint1.id)).toBeDefined();
      expect(getCheckpoint(checkpoint2.id)).toBeDefined();
    });

    it('should delete checkpoint from database and remove from store', async () => {
      // Create checkpoint
      const checkpoint = await createCheckpoint(db, {
        chatId: 'integration-chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [],
        triggerType: 'manual',
      });

      addCheckpoint(checkpoint);
      expect(getCheckpoint(checkpoint.id)).toBeDefined();

      // Delete from database
      const deleted = await deleteCheckpoint(db, checkpoint.id);
      expect(deleted).toBe(true);

      // Remove from store
      removeCheckpoint(checkpoint.id);

      // Verify both are empty
      expect(getCheckpoint(checkpoint.id)).toBeUndefined();

      const dbCheckpoint = await getCheckpointById(db, checkpoint.id);
      expect(dbCheckpoint).toBeNull();
    });
  });

  describe('computed values with real data', () => {
    it('should compute correct stats from database checkpoints', async () => {
      // Create checkpoints with different trigger types
      const auto1 = await createCheckpoint(db, {
        chatId: 'integration-chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [],
        triggerType: 'auto',
      });

      const manual1 = await createCheckpoint(db, {
        chatId: 'integration-chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [],
        triggerType: 'manual',
      });

      const beforeAction1 = await createCheckpoint(db, {
        chatId: 'integration-chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [],
        triggerType: 'before_action',
      });

      // Load and add to store
      addCheckpoints([auto1, manual1, beforeAction1]);

      // Verify stats
      const stats = checkpointStats.get();
      expect(stats.totalCount).toBe(3);
      expect(stats.autoCount).toBe(1);
      expect(stats.manualCount).toBe(1);
      expect(stats.beforeActionCount).toBe(1);
    });

    it('should get latest checkpoint correctly', async () => {
      // Create checkpoints with time delay
      const older = await createCheckpoint(db, {
        chatId: 'integration-chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [],
        description: 'Older checkpoint',
        triggerType: 'manual',
      });

      // Small delay to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const newer = await createCheckpoint(db, {
        chatId: 'integration-chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [],
        description: 'Newer checkpoint',
        triggerType: 'manual',
      });

      addCheckpoints([older, newer]);

      // Latest should be the newer one
      const latest = latestCheckpoint.get();
      expect(latest?.description).toBe('Newer checkpoint');
    });

    it('should filter by current chat ID', async () => {
      // Create another chat
      await db.query(
        `INSERT INTO chats (id, url_id, description, messages) VALUES ($1, $2, $3, $4)
         ON CONFLICT (id) DO NOTHING`,
        ['integration-chat-2', 'url-2', 'Test Chat 2', '[]'],
      );

      // Create checkpoints for both chats
      const chat1Checkpoint = await createCheckpoint(db, {
        chatId: 'integration-chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [],
        triggerType: 'manual',
      });

      const chat2Checkpoint = await createCheckpoint(db, {
        chatId: 'integration-chat-2',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [],
        triggerType: 'manual',
      });

      addCheckpoints([chat1Checkpoint, chat2Checkpoint]);

      // Current chat is chat-1, should only see its checkpoint
      const chatCheckpoints = currentChatCheckpoints.get();
      expect(chatCheckpoints.length).toBe(1);
      expect(chatCheckpoints[0].chatId).toBe('integration-chat-1');

      // Cleanup
      await db.query('DELETE FROM checkpoints WHERE chat_id = $1', ['integration-chat-2']);
    });
  });

  describe('utility functions with real data', () => {
    it('should filter excluded files correctly', () => {
      const filesWithSecrets: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'code', isBinary: false },
        '/home/project/.env': { type: 'file', content: 'SECRET=123', isBinary: false },
        '/home/project/.env.local': { type: 'file', content: 'LOCAL=456', isBinary: false },
        '/home/project/config.json': { type: 'file', content: '{}', isBinary: false },
        '/home/project/credentials.json': { type: 'file', content: '{}', isBinary: false },
      };

      const filtered = filterExcludedFiles(filesWithSecrets);

      expect(Object.keys(filtered)).toHaveLength(2);
      expect(filtered['/home/project/index.ts']).toBeDefined();
      expect(filtered['/home/project/config.json']).toBeDefined();
      expect(filtered['/home/project/.env']).toBeUndefined();
      expect(filtered['/home/project/.env.local']).toBeUndefined();
      expect(filtered['/home/project/credentials.json']).toBeUndefined();
    });

    it('should format checkpoint for timeline correctly', async () => {
      const checkpoint = await createCheckpoint(db, {
        chatId: 'integration-chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [],
        description: 'Test checkpoint',
        triggerType: 'manual',
      });

      const formatted = formatCheckpointForTimeline(checkpoint);

      expect(formatted.id).toBe(checkpoint.id);
      expect(formatted.description).toBe('Test checkpoint');
      expect(formatted.type).toBe('manual');
      expect(formatted.timeAgo).toBeDefined();
      expect(formatted.sizeLabel).toBeDefined();
    });
  });

  describe('data integrity', () => {
    it('should maintain consistency between store and database', async () => {
      // Create multiple operations
      const checkpoint = await createCheckpoint(db, {
        chatId: 'integration-chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: [{ id: 'msg-1', role: 'user', content: 'Test' }],
        triggerType: 'manual',
      });

      addCheckpoint(checkpoint);

      // Verify snapshot data integrity
      const storeCheckpoint = getCheckpoint(checkpoint.id);
      const dbCheckpoint = await getCheckpointById(db, checkpoint.id);

      // Files snapshot should match
      expect(JSON.stringify(storeCheckpoint?.filesSnapshot)).toBe(JSON.stringify(dbCheckpoint?.filesSnapshot));

      // Messages snapshot should match
      expect(JSON.stringify(storeCheckpoint?.messagesSnapshot)).toBe(JSON.stringify(dbCheckpoint?.messagesSnapshot));
    });

    it('should handle concurrent operations correctly', async () => {
      // Create multiple checkpoints concurrently
      const promises = Array.from({ length: 5 }, (_, i) =>
        createCheckpoint(db, {
          chatId: 'integration-chat-1',
          filesSnapshot: mockFilesSnapshot,
          messagesSnapshot: [],
          description: `Concurrent checkpoint ${i}`,
          triggerType: 'auto',
        }),
      );

      const checkpoints = await Promise.all(promises);

      // Add all to store
      addCheckpoints(checkpoints);

      // Verify all are present
      expect(checkpointCount.get()).toBe(5);

      for (const checkpoint of checkpoints) {
        expect(getCheckpoint(checkpoint.id)).toBeDefined();
      }
    });
  });
});
