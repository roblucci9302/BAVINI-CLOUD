import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Message } from '~/types/message';
import type { FileMap } from '~/lib/stores/files';

// mock PGlite instance
const mockPGliteInstance = {
  waitReady: Promise.resolve(),
  exec: vi.fn().mockResolvedValue(undefined),
  query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0 }),
  close: vi.fn().mockResolvedValue(undefined),
};

// mock logger
vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// import after mocks
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
  type Checkpoint,
  type CheckpointInput,
} from './checkpoints-db';

describe('checkpoints-db', () => {
  const mockFilesSnapshot: FileMap = {
    '/home/project/index.ts': { type: 'file', content: 'console.log("hello")', isBinary: false },
    '/home/project/package.json': { type: 'file', content: '{}', isBinary: false },
  };

  const mockMessages: Message[] = [
    { id: 'msg-1', role: 'user', content: 'Create a hello world app' },
    { id: 'msg-2', role: 'assistant', content: 'Sure! Here is your app...' },
  ];

  const mockCheckpointRow = {
    id: 'ckpt_test123',
    chat_id: 'chat-1',
    files_snapshot: JSON.stringify(mockFilesSnapshot),
    messages_snapshot: JSON.stringify(mockMessages),
    actions_snapshot: null,
    description: 'Test checkpoint',
    trigger_type: 'manual' as const,
    message_id: null,
    is_full_snapshot: true,
    parent_checkpoint_id: null,
    compressed: false,
    size_bytes: 500,
    created_at: '2024-01-01T12:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('generateCheckpointId', () => {
    it('should generate unique IDs', () => {
      const id1 = generateCheckpointId();
      const id2 = generateCheckpointId();

      expect(id1).not.toBe(id2);
    });

    it('should start with ckpt_ prefix', () => {
      const id = generateCheckpointId();

      expect(id).toMatch(/^ckpt_/);
    });

    it('should have consistent format', () => {
      const id = generateCheckpointId();

      expect(id).toMatch(/^ckpt_[a-z0-9]+_[a-z0-9]+$/);
    });
  });

  describe('createCheckpoint', () => {
    it('should create a checkpoint with all required fields', async () => {
      const input: CheckpointInput = {
        chatId: 'chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: mockMessages,
        triggerType: 'manual',
        description: 'Test checkpoint',
      };

      mockPGliteInstance.query.mockResolvedValueOnce({
        rows: [{ ...mockCheckpointRow }],
      });

      const checkpoint = await createCheckpoint(mockPGliteInstance as never, input);

      expect(checkpoint.chatId).toBe('chat-1');
      expect(checkpoint.triggerType).toBe('manual');
      expect(checkpoint.description).toBe('Test checkpoint');
      expect(checkpoint.isFullSnapshot).toBe(true);
    });

    it('should auto-generate id', async () => {
      const input: CheckpointInput = {
        chatId: 'chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: mockMessages,
        triggerType: 'auto',
      };

      mockPGliteInstance.query.mockResolvedValueOnce({
        rows: [{ ...mockCheckpointRow, id: 'ckpt_generated' }],
      });

      await createCheckpoint(mockPGliteInstance as never, input);

      expect(mockPGliteInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO checkpoints'),
        expect.arrayContaining([expect.stringMatching(/^ckpt_/)]),
      );
    });

    it('should calculate size_bytes', async () => {
      const input: CheckpointInput = {
        chatId: 'chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: mockMessages,
        triggerType: 'manual',
      };

      mockPGliteInstance.query.mockResolvedValueOnce({
        rows: [{ ...mockCheckpointRow }],
      });

      await createCheckpoint(mockPGliteInstance as never, input);

      // verify size_bytes is passed as a number
      expect(mockPGliteInstance.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([expect.any(Number)]),
      );
    });

    it('should mark as incremental when parent is provided', async () => {
      const input: CheckpointInput = {
        chatId: 'chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: mockMessages,
        triggerType: 'auto',
        parentCheckpointId: 'ckpt_parent',
      };

      mockPGliteInstance.query.mockResolvedValueOnce({
        rows: [{ ...mockCheckpointRow, is_full_snapshot: false, parent_checkpoint_id: 'ckpt_parent' }],
      });

      const checkpoint = await createCheckpoint(mockPGliteInstance as never, input);

      expect(checkpoint.isFullSnapshot).toBe(false);
      expect(checkpoint.parentCheckpointId).toBe('ckpt_parent');
    });

    it('should store actions snapshot when provided', async () => {
      const actionsSnapshot = {
        'action-1': { type: 'file' as const, status: 'complete' as const },
      };

      const input: CheckpointInput = {
        chatId: 'chat-1',
        filesSnapshot: mockFilesSnapshot,
        messagesSnapshot: mockMessages,
        triggerType: 'before_action',
        actionsSnapshot: actionsSnapshot as never,
      };

      mockPGliteInstance.query.mockResolvedValueOnce({
        rows: [{ ...mockCheckpointRow, actions_snapshot: JSON.stringify(actionsSnapshot) }],
      });

      await createCheckpoint(mockPGliteInstance as never, input);

      expect(mockPGliteInstance.query).toHaveBeenCalledWith(
        expect.any(String),
        expect.arrayContaining([JSON.stringify(actionsSnapshot)]),
      );
    });
  });

  describe('getCheckpointsByChat', () => {
    it('should return checkpoints ordered by created_at DESC', async () => {
      const checkpoints = [
        { ...mockCheckpointRow, id: 'ckpt_2', created_at: '2024-01-02T12:00:00Z' },
        { ...mockCheckpointRow, id: 'ckpt_1', created_at: '2024-01-01T12:00:00Z' },
      ];

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: checkpoints });

      const result = await getCheckpointsByChat(mockPGliteInstance as never, 'chat-1');

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe('ckpt_2');
      expect(result[1].id).toBe('ckpt_1');
    });

    it('should return empty array for non-existent chat', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      const result = await getCheckpointsByChat(mockPGliteInstance as never, 'nonexistent');

      expect(result).toEqual([]);
    });

    it('should respect limit parameter', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [mockCheckpointRow] });

      await getCheckpointsByChat(mockPGliteInstance as never, 'chat-1', 5);

      expect(mockPGliteInstance.query).toHaveBeenCalledWith(expect.stringContaining('LIMIT $2'), ['chat-1', 5]);
    });

    it('should parse JSON snapshots correctly', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [mockCheckpointRow] });

      const result = await getCheckpointsByChat(mockPGliteInstance as never, 'chat-1');

      expect(result[0].filesSnapshot).toEqual(mockFilesSnapshot);
      expect(result[0].messagesSnapshot).toEqual(mockMessages);
    });
  });

  describe('getCheckpointById', () => {
    it('should return checkpoint when found', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [mockCheckpointRow] });

      const result = await getCheckpointById(mockPGliteInstance as never, 'ckpt_test123');

      expect(result).not.toBeNull();
      expect(result?.id).toBe('ckpt_test123');
    });

    it('should return null when not found', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      const result = await getCheckpointById(mockPGliteInstance as never, 'nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('getLatestCheckpoint', () => {
    it('should return most recent checkpoint', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [mockCheckpointRow] });

      const result = await getLatestCheckpoint(mockPGliteInstance as never, 'chat-1');

      expect(result).not.toBeNull();
      expect(mockPGliteInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at DESC LIMIT 1'),
        ['chat-1'],
      );
    });

    it('should return null when no checkpoints exist', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      const result = await getLatestCheckpoint(mockPGliteInstance as never, 'chat-1');

      expect(result).toBeNull();
    });
  });

  describe('getCheckpointsByTrigger', () => {
    it('should filter by trigger type', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({
        rows: [{ ...mockCheckpointRow, trigger_type: 'manual' }],
      });

      const result = await getCheckpointsByTrigger(mockPGliteInstance as never, 'chat-1', 'manual');

      expect(result).toHaveLength(1);
      expect(result[0].triggerType).toBe('manual');
    });

    it('should return empty array when no matching trigger', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      const result = await getCheckpointsByTrigger(mockPGliteInstance as never, 'chat-1', 'before_action');

      expect(result).toEqual([]);
    });
  });

  describe('deleteCheckpoint', () => {
    it('should delete checkpoint and return true', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ affectedRows: 1 });

      const result = await deleteCheckpoint(mockPGliteInstance as never, 'ckpt_test123');

      expect(result).toBe(true);
      expect(mockPGliteInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM checkpoints WHERE id = $1'),
        ['ckpt_test123'],
      );
    });

    it('should return false when checkpoint not found', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ affectedRows: 0 });

      const result = await deleteCheckpoint(mockPGliteInstance as never, 'nonexistent');

      expect(result).toBe(false);
    });
  });

  describe('deleteCheckpointsByChat', () => {
    it('should delete all checkpoints for chat', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ affectedRows: 5 });

      const count = await deleteCheckpointsByChat(mockPGliteInstance as never, 'chat-1');

      expect(count).toBe(5);
      expect(mockPGliteInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM checkpoints WHERE chat_id = $1'),
        ['chat-1'],
      );
    });

    it('should return 0 when no checkpoints to delete', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ affectedRows: 0 });

      const count = await deleteCheckpointsByChat(mockPGliteInstance as never, 'empty-chat');

      expect(count).toBe(0);
    });
  });

  describe('deleteOldCheckpoints', () => {
    it('should keep most recent N checkpoints', async () => {
      // mock getting IDs to keep
      mockPGliteInstance.query.mockResolvedValueOnce({
        rows: [{ id: 'ckpt_1' }, { id: 'ckpt_2' }, { id: 'ckpt_3' }],
      });

      // mock delete
      mockPGliteInstance.query.mockResolvedValueOnce({ affectedRows: 7 });

      const count = await deleteOldCheckpoints(mockPGliteInstance as never, 'chat-1', 3);

      expect(count).toBe(7);
    });

    it('should preserve manual checkpoints when option is set', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({
        rows: [{ id: 'ckpt_manual' }],
      });
      mockPGliteInstance.query.mockResolvedValueOnce({ affectedRows: 2 });

      await deleteOldCheckpoints(mockPGliteInstance as never, 'chat-1', 5, { preserveManual: true });

      expect(mockPGliteInstance.query).toHaveBeenCalledWith(
        expect.stringContaining("trigger_type = 'manual'"),
        expect.any(Array),
      );
    });

    it('should return 0 when no checkpoints to delete', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      const count = await deleteOldCheckpoints(mockPGliteInstance as never, 'chat-1', 10);

      expect(count).toBe(0);
    });
  });

  describe('getCheckpointCount', () => {
    it('should return count of checkpoints', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [{ count: '15' }] });

      const count = await getCheckpointCount(mockPGliteInstance as never, 'chat-1');

      expect(count).toBe(15);
    });

    it('should return 0 when no checkpoints', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [{ count: '0' }] });

      const count = await getCheckpointCount(mockPGliteInstance as never, 'empty-chat');

      expect(count).toBe(0);
    });
  });

  describe('getCheckpointsTotalSize', () => {
    it('should return total size in bytes', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [{ total: '102400' }] });

      const size = await getCheckpointsTotalSize(mockPGliteInstance as never, 'chat-1');

      expect(size).toBe(102400);
    });

    it('should return 0 when no checkpoints', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [{ total: null }] });

      const size = await getCheckpointsTotalSize(mockPGliteInstance as never, 'empty-chat');

      expect(size).toBe(0);
    });
  });

  describe('updateCheckpointDescription', () => {
    it('should update description and return true', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ affectedRows: 1 });

      const result = await updateCheckpointDescription(mockPGliteInstance as never, 'ckpt_test123', 'New description');

      expect(result).toBe(true);
      expect(mockPGliteInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE checkpoints SET description = $1'),
        ['New description', 'ckpt_test123'],
      );
    });

    it('should return false when checkpoint not found', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ affectedRows: 0 });

      const result = await updateCheckpointDescription(mockPGliteInstance as never, 'nonexistent', 'New description');

      expect(result).toBe(false);
    });
  });

  describe('checkpointExists', () => {
    it('should return true when checkpoint exists', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [{ exists: true }] });

      const exists = await checkpointExists(mockPGliteInstance as never, 'ckpt_test123');

      expect(exists).toBe(true);
    });

    it('should return false when checkpoint does not exist', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [{ exists: false }] });

      const exists = await checkpointExists(mockPGliteInstance as never, 'nonexistent');

      expect(exists).toBe(false);
    });
  });

  describe('getCheckpointsByTimeRange', () => {
    it('should return checkpoints within time range', async () => {
      const checkpoints = [{ ...mockCheckpointRow, created_at: '2024-01-15T12:00:00Z' }];
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: checkpoints });

      const startTime = new Date('2024-01-01T00:00:00Z');
      const endTime = new Date('2024-01-31T23:59:59Z');

      const result = await getCheckpointsByTimeRange(mockPGliteInstance as never, 'chat-1', startTime, endTime);

      expect(result).toHaveLength(1);
      expect(mockPGliteInstance.query).toHaveBeenCalledWith(
        expect.stringContaining('created_at >= $2 AND created_at <= $3'),
        ['chat-1', startTime.toISOString(), endTime.toISOString()],
      );
    });

    it('should return empty array when no checkpoints in range', async () => {
      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [] });

      const startTime = new Date('2025-01-01T00:00:00Z');
      const endTime = new Date('2025-01-31T23:59:59Z');

      const result = await getCheckpointsByTimeRange(mockPGliteInstance as never, 'chat-1', startTime, endTime);

      expect(result).toEqual([]);
    });
  });

  describe('row to checkpoint conversion', () => {
    it('should handle null optional fields', async () => {
      const rowWithNulls = {
        ...mockCheckpointRow,
        description: null,
        message_id: null,
        actions_snapshot: null,
        parent_checkpoint_id: null,
        size_bytes: null,
      };

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [rowWithNulls] });

      const result = await getCheckpointById(mockPGliteInstance as never, 'ckpt_test123');

      expect(result?.description).toBeUndefined();
      expect(result?.messageId).toBeUndefined();
      expect(result?.actionsSnapshot).toBeUndefined();
      expect(result?.parentCheckpointId).toBeUndefined();
      expect(result?.sizeBytes).toBeUndefined();
    });

    it('should parse already-parsed JSON objects', async () => {
      const rowWithParsedJson = {
        ...mockCheckpointRow,
        files_snapshot: mockFilesSnapshot, // already parsed
        messages_snapshot: mockMessages, // already parsed
      };

      mockPGliteInstance.query.mockResolvedValueOnce({ rows: [rowWithParsedJson] });

      const result = await getCheckpointById(mockPGliteInstance as never, 'ckpt_test123');

      expect(result?.filesSnapshot).toEqual(mockFilesSnapshot);
      expect(result?.messagesSnapshot).toEqual(mockMessages);
    });
  });
});
