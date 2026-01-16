/**
 * Tests for CheckpointService.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import type { Checkpoint } from '~/types/checkpoint';
import type { FileMap } from '~/lib/stores/files';

// Mock PGLite - define inline to avoid hoisting issues
vi.mock('~/lib/persistence/pglite', () => {
  const mockPGliteInstance = {
    waitReady: Promise.resolve(),
    exec: vi.fn().mockResolvedValue(undefined),
    query: vi.fn().mockResolvedValue({ rows: [], affectedRows: 0 }),
    close: vi.fn().mockResolvedValue(undefined),
  };
  return {
    getPGlite: vi.fn().mockResolvedValue(mockPGliteInstance),
    initPGlite: vi.fn().mockResolvedValue(mockPGliteInstance),
  };
});

// Mock checkpoints-db
vi.mock('~/lib/persistence/checkpoints-db', () => ({
  createCheckpoint: vi.fn(),
  getCheckpointsByChat: vi.fn().mockResolvedValue([]),
  getCheckpointById: vi.fn(),
  deleteCheckpoint: vi.fn().mockResolvedValue(true),
  deleteOldCheckpoints: vi.fn().mockResolvedValue(0),
  updateCheckpointDescription: vi.fn().mockResolvedValue(true),
  getCheckpointsByTimeRange: vi.fn().mockResolvedValue([]),
}));

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

// Import after mocks
import { CheckpointService, createCheckpointService } from './index';
import * as checkpointsDb from '~/lib/persistence/checkpoints-db';
import * as checkpointsStore from '~/lib/stores/checkpoints';

describe('CheckpointService', () => {
  const mockFilesSnapshot: FileMap = {
    '/home/project/index.ts': { type: 'file', content: 'test', isBinary: false },
  };

  const mockMessages = [{ id: 'msg-1', role: 'user' as const, content: 'Hello' }];

  const createMockCheckpoint = (overrides: Partial<Checkpoint> = {}): Checkpoint => ({
    id: `ckpt_${Date.now()}_test`,
    chatId: 'test-chat',
    filesSnapshot: mockFilesSnapshot,
    messagesSnapshot: mockMessages,
    triggerType: 'manual',
    isFullSnapshot: true,
    compressed: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  let service: CheckpointService;

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store state
    checkpointsStore.clearCheckpoints();
    checkpointsStore.setCurrentChatId(null);
    checkpointsStore.setRestoring(false);
    checkpointsStore.setLoading(false);
    checkpointsStore.setError(null);
    checkpointsStore.setCurrentCheckpoint(null);

    service = new CheckpointService({
      chatId: 'test-chat',
      getFilesSnapshot: () => mockFilesSnapshot,
      getMessages: () => mockMessages,
    });
  });

  afterEach(() => {
    service.dispose();
  });

  describe('initialization', () => {
    it('should initialize with correct chat ID', () => {
      expect(service.chatId).toBe('test-chat');
    });

    it('should have default config', () => {
      expect(service.config.maxCheckpointsPerChat).toBe(50);
      expect(service.config.autoCheckpointThrottleMs).toBe(60000);
    });

    it('should accept custom config', () => {
      const customService = new CheckpointService({
        chatId: 'test',
        getFilesSnapshot: () => ({}),
        getMessages: () => [],
        config: { maxCheckpointsPerChat: 100 },
      });

      expect(customService.config.maxCheckpointsPerChat).toBe(100);
      customService.dispose();
    });
  });

  describe('createCheckpointService factory', () => {
    it('should create a service instance', () => {
      const factoryService = createCheckpointService({
        chatId: 'factory-test',
        getFilesSnapshot: () => ({}),
        getMessages: () => [],
      });

      expect(factoryService).toBeInstanceOf(CheckpointService);
      expect(factoryService.chatId).toBe('factory-test');
      factoryService.dispose();
    });
  });

  describe('loadCheckpoints', () => {
    it('should load checkpoints from database', async () => {
      const mockCheckpoints = [createMockCheckpoint(), createMockCheckpoint()];
      vi.mocked(checkpointsDb.getCheckpointsByChat).mockResolvedValueOnce(mockCheckpoints);

      const loaded = await service.loadCheckpoints();

      expect(loaded).toHaveLength(2);
      expect(checkpointsDb.getCheckpointsByChat).toHaveBeenCalled();
    });

    it('should update store with loaded checkpoints', async () => {
      const mockCheckpoints = [createMockCheckpoint()];
      vi.mocked(checkpointsDb.getCheckpointsByChat).mockResolvedValueOnce(mockCheckpoints);

      await service.loadCheckpoints();

      expect(service.checkpoints).toHaveLength(1);
    });

    it('should handle load errors', async () => {
      vi.mocked(checkpointsDb.getCheckpointsByChat).mockRejectedValueOnce(new Error('Load failed'));

      await expect(service.loadCheckpoints()).rejects.toThrow('Load failed');
    });
  });

  describe('createCheckpoint', () => {
    it('should create a checkpoint', async () => {
      const newCheckpoint = createMockCheckpoint();
      vi.mocked(checkpointsDb.createCheckpoint).mockResolvedValueOnce(newCheckpoint);

      const created = await service.createCheckpoint({ description: 'Test' });

      expect(created).not.toBeNull();
      expect(checkpointsDb.createCheckpoint).toHaveBeenCalled();
    });

    it('should add checkpoint to store', async () => {
      const newCheckpoint = createMockCheckpoint();
      vi.mocked(checkpointsDb.createCheckpoint).mockResolvedValueOnce(newCheckpoint);

      await service.createCheckpoint();

      expect(service.checkpoints).toHaveLength(1);
    });

    it('should throttle auto checkpoints', async () => {
      const newCheckpoint = createMockCheckpoint({ triggerType: 'auto' });
      vi.mocked(checkpointsDb.createCheckpoint).mockResolvedValue(newCheckpoint);

      // First auto checkpoint should succeed
      const first = await service.createCheckpoint({ triggerType: 'auto', force: true });
      expect(first).not.toBeNull();

      // Second should be throttled (within 60s)
      const second = await service.createCheckpoint({ triggerType: 'auto' });
      expect(second).toBeNull();
    });

    it('should bypass throttle with force option', async () => {
      const newCheckpoint = createMockCheckpoint({ triggerType: 'auto' });
      vi.mocked(checkpointsDb.createCheckpoint).mockResolvedValue(newCheckpoint);

      await service.createCheckpoint({ triggerType: 'auto', force: true });

      const forced = await service.createCheckpoint({ triggerType: 'auto', force: true });

      expect(forced).not.toBeNull();
    });

    it('should filter excluded files', async () => {
      const serviceWithSecrets = new CheckpointService({
        chatId: 'test',
        getFilesSnapshot: () => ({
          '/home/project/index.ts': { type: 'file', content: 'code', isBinary: false },
          '/home/project/.env': { type: 'file', content: 'SECRET=123', isBinary: false },
        }),
        getMessages: () => [],
      });

      const newCheckpoint = createMockCheckpoint();
      vi.mocked(checkpointsDb.createCheckpoint).mockResolvedValueOnce(newCheckpoint);

      await serviceWithSecrets.createCheckpoint();

      const call = vi.mocked(checkpointsDb.createCheckpoint).mock.calls[0];
      const input = call[1];

      expect(input.filesSnapshot['/home/project/index.ts']).toBeDefined();
      expect(input.filesSnapshot['/home/project/.env']).toBeUndefined();

      serviceWithSecrets.dispose();
    });
  });

  describe('restoreCheckpoint', () => {
    it('should restore a checkpoint', async () => {
      const checkpoint = createMockCheckpoint();
      vi.mocked(checkpointsDb.getCheckpointById).mockResolvedValueOnce(checkpoint);
      vi.mocked(checkpointsDb.createCheckpoint).mockResolvedValueOnce(createMockCheckpoint({ id: 'restore-point' }));

      const onFilesRestored = vi.fn();
      const serviceWithCallback = new CheckpointService({
        chatId: 'test-chat',
        getFilesSnapshot: () => mockFilesSnapshot,
        getMessages: () => mockMessages,
        onFilesRestored,
      });

      const result = await serviceWithCallback.restoreCheckpoint(checkpoint.id);

      expect(result.success).toBe(true);
      expect(onFilesRestored).toHaveBeenCalledWith(checkpoint.filesSnapshot);

      serviceWithCallback.dispose();
    });

    it('should create restore point before restoring', async () => {
      const checkpoint = createMockCheckpoint();
      const restorePoint = createMockCheckpoint({ id: 'restore-point' });

      vi.mocked(checkpointsDb.getCheckpointById).mockResolvedValueOnce(checkpoint);
      vi.mocked(checkpointsDb.createCheckpoint).mockResolvedValueOnce(restorePoint);

      const result = await service.restoreCheckpoint(checkpoint.id, { createRestorePoint: true });

      expect(result.restorePointId).toBe('restore-point');
    });

    it('should skip restore point when disabled', async () => {
      const checkpoint = createMockCheckpoint();
      vi.mocked(checkpointsDb.getCheckpointById).mockResolvedValueOnce(checkpoint);

      const result = await service.restoreCheckpoint(checkpoint.id, { createRestorePoint: false });

      expect(result.restorePointId).toBeUndefined();
    });

    it('should handle missing checkpoint', async () => {
      vi.mocked(checkpointsDb.getCheckpointById).mockResolvedValueOnce(null);

      const result = await service.restoreCheckpoint('nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should restore messages when enabled', async () => {
      const checkpoint = createMockCheckpoint();
      vi.mocked(checkpointsDb.getCheckpointById).mockResolvedValueOnce(checkpoint);

      const onMessagesRestored = vi.fn();
      const serviceWithCallback = new CheckpointService({
        chatId: 'test-chat',
        getFilesSnapshot: () => mockFilesSnapshot,
        getMessages: () => mockMessages,
        onMessagesRestored,
      });

      await serviceWithCallback.restoreCheckpoint(checkpoint.id, {
        restoreConversation: true,
        createRestorePoint: false,
      });

      expect(onMessagesRestored).toHaveBeenCalledWith(checkpoint.messagesSnapshot);

      serviceWithCallback.dispose();
    });
  });

  describe('previewRestore', () => {
    it('should return preview of changes', () => {
      const checkpoint = createMockCheckpoint({
        filesSnapshot: {
          '/home/project/index.ts': { type: 'file', content: 'new', isBinary: false },
          '/home/project/new-file.ts': { type: 'file', content: 'new', isBinary: false },
        },
      });

      const preview = service.previewRestore(checkpoint);

      expect(preview.toWrite).toBeDefined();
      expect(preview.toDelete).toBeDefined();
      expect(preview.unchanged).toBeDefined();
    });
  });

  describe('deleteCheckpoint', () => {
    it('should delete a checkpoint', async () => {
      vi.mocked(checkpointsDb.deleteCheckpoint).mockResolvedValueOnce(true);

      const deleted = await service.deleteCheckpoint('ckpt-to-delete');

      expect(deleted).toBe(true);
      expect(checkpointsDb.deleteCheckpoint).toHaveBeenCalledWith(expect.anything(), 'ckpt-to-delete');
    });

    it('should remove from store on delete', async () => {
      const checkpoint = createMockCheckpoint();
      checkpointsStore.addCheckpoint(checkpoint);
      checkpointsStore.setCurrentChatId('test-chat');

      vi.mocked(checkpointsDb.deleteCheckpoint).mockResolvedValueOnce(true);

      await service.deleteCheckpoint(checkpoint.id);

      expect(checkpointsStore.getCheckpoint(checkpoint.id)).toBeUndefined();
    });
  });

  describe('updateDescription', () => {
    it('should update checkpoint description', async () => {
      const checkpoint = createMockCheckpoint();
      checkpointsStore.addCheckpoint(checkpoint);
      checkpointsStore.setCurrentChatId('test-chat');

      vi.mocked(checkpointsDb.updateCheckpointDescription).mockResolvedValueOnce(true);

      const updated = await service.updateDescription(checkpoint.id, 'New description');

      expect(updated).toBe(true);
    });
  });

  describe('getCheckpointsByTimeRange', () => {
    it('should get checkpoints within time range', async () => {
      const mockCheckpoints = [createMockCheckpoint()];
      vi.mocked(checkpointsDb.getCheckpointsByTimeRange).mockResolvedValueOnce(mockCheckpoints);

      const startTime = new Date('2024-01-01');
      const endTime = new Date('2024-01-31');

      const result = await service.getCheckpointsByTimeRange(startTime, endTime);

      expect(result).toHaveLength(1);
      expect(checkpointsDb.getCheckpointsByTimeRange).toHaveBeenCalledWith(
        expect.anything(),
        'test-chat',
        startTime,
        endTime,
      );
    });
  });

  describe('clearAllCheckpoints', () => {
    it('should clear all checkpoints', async () => {
      const checkpoint = createMockCheckpoint();
      checkpointsStore.addCheckpoint(checkpoint);
      checkpointsStore.setCurrentChatId('test-chat');

      await service.clearAllCheckpoints();

      expect(service.checkpoints).toHaveLength(0);
    });
  });

  describe('updateConfig', () => {
    it('should update config', () => {
      service.updateConfig({ maxCheckpointsPerChat: 100 });

      expect(service.config.maxCheckpointsPerChat).toBe(100);
    });
  });

  describe('subscribeToEvents', () => {
    it('should subscribe to events', () => {
      const listener = vi.fn();
      const unsubscribe = service.subscribeToEvents(listener);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });

  describe('stats', () => {
    it('should return checkpoint stats', () => {
      const checkpoint = createMockCheckpoint();
      checkpointsStore.addCheckpoint(checkpoint);
      checkpointsStore.setCurrentChatId('test-chat');

      const stats = service.stats;

      expect(stats.totalCount).toBe(1);
    });
  });
});
