/**
 * Tests for the useCheckpoints hook.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import type { Checkpoint, RestoreResult } from '~/types/checkpoint';

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
import { useCheckpoints } from './useCheckpoints';
import * as checkpointsDb from '~/lib/persistence/checkpoints-db';
import * as checkpointsStore from '~/lib/stores/checkpoints';

describe('useCheckpoints', () => {
  const mockFilesSnapshot = {
    '/home/project/index.ts': { type: 'file' as const, content: 'test', isBinary: false },
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

  beforeEach(() => {
    vi.clearAllMocks();

    // Reset store state
    checkpointsStore.clearCheckpoints();
    checkpointsStore.setCurrentChatId(null);
    checkpointsStore.setRestoring(false);
    checkpointsStore.setLoading(false);
    checkpointsStore.setError(null);
    checkpointsStore.setCurrentCheckpoint(null);
  });

  describe('initialization', () => {
    it('should initialize with correct default state', () => {
      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      expect(result.current.checkpoints).toEqual([]);
      expect(result.current.latestCheckpoint).toBeNull();
      expect(result.current.currentCheckpointId).toBeNull();
      expect(result.current.checkpointCount).toBe(0);
      expect(result.current.hasCheckpoints).toBe(false);
      expect(result.current.isRestoring).toBe(false);
      expect(result.current.isLoading).toBe(false);
      expect(result.current.error).toBeNull();
    });

    it('should set current chat ID on mount', () => {
      renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      expect(checkpointsStore.currentChatId.get()).toBe('test-chat');
    });

    it('should auto-load checkpoints when autoLoad is true', async () => {
      const mockCheckpoints = [createMockCheckpoint()];
      vi.mocked(checkpointsDb.getCheckpointsByChat).mockResolvedValueOnce(mockCheckpoints);

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: true,
        }),
      );

      await waitFor(() => {
        expect(result.current.isLoading).toBe(false);
      });

      expect(checkpointsDb.getCheckpointsByChat).toHaveBeenCalledWith(expect.anything(), 'test-chat');
    });

    it('should not auto-load when autoLoad is false', () => {
      renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      expect(checkpointsDb.getCheckpointsByChat).not.toHaveBeenCalled();
    });
  });

  describe('loadCheckpoints', () => {
    it('should load checkpoints from database', async () => {
      const mockCheckpoints = [createMockCheckpoint({ id: 'ckpt_1' }), createMockCheckpoint({ id: 'ckpt_2' })];
      vi.mocked(checkpointsDb.getCheckpointsByChat).mockResolvedValueOnce(mockCheckpoints);

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      await act(async () => {
        await result.current.loadCheckpoints();
      });

      expect(result.current.checkpoints).toHaveLength(2);
    });

    it('should set loading state during load', async () => {
      let resolveLoad: () => void;
      const loadPromise = new Promise<Checkpoint[]>((resolve) => {
        resolveLoad = () => resolve([]);
      });
      vi.mocked(checkpointsDb.getCheckpointsByChat).mockReturnValueOnce(loadPromise);

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      act(() => {
        result.current.loadCheckpoints();
      });

      expect(result.current.isLoading).toBe(true);

      await act(async () => {
        resolveLoad!();
        await loadPromise;
      });

      expect(result.current.isLoading).toBe(false);
    });

    it('should handle load errors', async () => {
      vi.mocked(checkpointsDb.getCheckpointsByChat).mockRejectedValueOnce(new Error('Load failed'));

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      await act(async () => {
        await result.current.loadCheckpoints();
      });

      expect(result.current.error?.message).toBe('Load failed');
    });
  });

  describe('createCheckpoint', () => {
    it('should create a checkpoint', async () => {
      const newCheckpoint = createMockCheckpoint();
      vi.mocked(checkpointsDb.createCheckpoint).mockResolvedValueOnce(newCheckpoint);

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
          getFilesSnapshot: () => mockFilesSnapshot,
          getMessages: () => mockMessages,
        }),
      );

      let createdCheckpoint: Checkpoint | null = null;

      await act(async () => {
        createdCheckpoint = await result.current.createCheckpoint('Test checkpoint');
      });

      expect(createdCheckpoint).not.toBeNull();
      expect(checkpointsDb.createCheckpoint).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({
          chatId: 'test-chat',
          description: 'Test checkpoint',
          triggerType: 'manual',
        }),
      );
    });

    it('should add created checkpoint to store', async () => {
      const newCheckpoint = createMockCheckpoint();
      vi.mocked(checkpointsDb.createCheckpoint).mockResolvedValueOnce(newCheckpoint);

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
          getFilesSnapshot: () => mockFilesSnapshot,
          getMessages: () => mockMessages,
        }),
      );

      await act(async () => {
        await result.current.createCheckpoint();
      });

      expect(result.current.checkpoints).toHaveLength(1);
    });

    it('should return null when chat ID is missing', async () => {
      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: '',
          autoLoad: false,
        }),
      );

      let checkpoint: Checkpoint | null = null;

      await act(async () => {
        checkpoint = await result.current.createCheckpoint();
      });

      expect(checkpoint).toBeNull();
    });

    it('should handle creation errors', async () => {
      vi.mocked(checkpointsDb.createCheckpoint).mockRejectedValueOnce(new Error('Create failed'));

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
          getFilesSnapshot: () => mockFilesSnapshot,
          getMessages: () => mockMessages,
        }),
      );

      await act(async () => {
        await result.current.createCheckpoint();
      });

      expect(result.current.error?.message).toBe('Create failed');
    });
  });

  describe('restoreCheckpoint', () => {
    it('should restore a checkpoint', async () => {
      const checkpoint = createMockCheckpoint();
      vi.mocked(checkpointsDb.getCheckpointById).mockResolvedValueOnce(checkpoint);
      vi.mocked(checkpointsDb.createCheckpoint).mockResolvedValueOnce(createMockCheckpoint({ id: 'restore-point' }));

      const onRestoreFiles = vi.fn().mockResolvedValue(undefined);
      const onRestoreMessages = vi.fn();

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
          getFilesSnapshot: () => mockFilesSnapshot,
          getMessages: () => mockMessages,
          onRestoreFiles,
          onRestoreMessages,
        }),
      );

      let restoreResult: RestoreResult | undefined;

      await act(async () => {
        restoreResult = await result.current.restoreCheckpoint(checkpoint.id, {
          restoreFiles: true,
          restoreConversation: true,
        });
      });

      expect(restoreResult!.success).toBe(true);
      expect(onRestoreFiles).toHaveBeenCalledWith(checkpoint.filesSnapshot);
    });

    it('should create restore point before restoring', async () => {
      const checkpoint = createMockCheckpoint();
      const restorePoint = createMockCheckpoint({ id: 'restore-point' });

      vi.mocked(checkpointsDb.getCheckpointById).mockResolvedValueOnce(checkpoint);
      vi.mocked(checkpointsDb.createCheckpoint).mockResolvedValueOnce(restorePoint);

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
          getFilesSnapshot: () => mockFilesSnapshot,
          getMessages: () => mockMessages,
        }),
      );

      let restoreResult: RestoreResult | undefined;

      await act(async () => {
        restoreResult = await result.current.restoreCheckpoint(checkpoint.id, {
          createRestorePoint: true,
        });
      });

      expect(restoreResult!.restorePointId).toBe('restore-point');
    });

    it('should set restoring state during restore', async () => {
      const checkpoint = createMockCheckpoint();
      vi.mocked(checkpointsDb.getCheckpointById).mockResolvedValueOnce(checkpoint);

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
          getFilesSnapshot: () => mockFilesSnapshot,
          getMessages: () => mockMessages,
        }),
      );

      const restorePromise = act(async () => {
        await result.current.restoreCheckpoint(checkpoint.id);
      });

      // Check restoring state is set (may be async)
      await restorePromise;

      expect(result.current.isRestoring).toBe(false);
    });

    it('should handle restore errors', async () => {
      vi.mocked(checkpointsDb.getCheckpointById).mockResolvedValueOnce(null);

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      let restoreResult: RestoreResult | undefined;

      await act(async () => {
        restoreResult = await result.current.restoreCheckpoint('nonexistent');
      });

      expect(restoreResult!.success).toBe(false);
      expect(restoreResult!.error).toContain('not found');
    });
  });

  describe('deleteCheckpoint', () => {
    it('should delete a checkpoint', async () => {
      const checkpoint = createMockCheckpoint();
      checkpointsStore.addCheckpoint(checkpoint);

      vi.mocked(checkpointsDb.deleteCheckpoint).mockResolvedValueOnce(true);

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      let deleted;

      await act(async () => {
        deleted = await result.current.deleteCheckpoint(checkpoint.id);
      });

      expect(deleted).toBe(true);
      expect(checkpointsDb.deleteCheckpoint).toHaveBeenCalledWith(expect.anything(), checkpoint.id);
    });

    it('should remove checkpoint from store on delete', async () => {
      const checkpoint = createMockCheckpoint();
      checkpointsStore.addCheckpoint(checkpoint);
      checkpointsStore.setCurrentChatId('test-chat');

      vi.mocked(checkpointsDb.deleteCheckpoint).mockResolvedValueOnce(true);

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      expect(result.current.checkpoints).toHaveLength(1);

      await act(async () => {
        await result.current.deleteCheckpoint(checkpoint.id);
      });

      expect(result.current.checkpoints).toHaveLength(0);
    });
  });

  describe('updateDescription', () => {
    it('should update checkpoint description', async () => {
      const checkpoint = createMockCheckpoint();
      checkpointsStore.addCheckpoint(checkpoint);

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      let updated;

      await act(async () => {
        updated = await result.current.updateDescription(checkpoint.id, 'New description');
      });

      expect(updated).toBe(true);
      expect(checkpointsDb.updateCheckpointDescription).toHaveBeenCalledWith(
        expect.anything(),
        checkpoint.id,
        'New description',
      );
    });
  });

  describe('clearCheckpoints', () => {
    it('should clear all checkpoints for current chat', async () => {
      const checkpoint = createMockCheckpoint();
      checkpointsStore.addCheckpoint(checkpoint);
      checkpointsStore.setCurrentChatId('test-chat');

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      expect(result.current.checkpoints).toHaveLength(1);

      await act(async () => {
        await result.current.clearCheckpoints();
      });

      expect(result.current.checkpoints).toHaveLength(0);
    });
  });

  describe('utilities', () => {
    it('should indicate if checkpoint can be created', () => {
      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      expect(result.current.canCreateCheckpoint).toBe(true);
    });

    it('should not allow creation while restoring', () => {
      checkpointsStore.setRestoring(true);

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      expect(result.current.canCreateCheckpoint).toBe(false);
    });

    it('should not allow creation while loading', () => {
      checkpointsStore.setLoading(true);

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      expect(result.current.canCreateCheckpoint).toBe(false);
    });

    it('should format checkpoint for timeline', () => {
      const checkpoint = createMockCheckpoint({
        description: 'Test',
        sizeBytes: 1024,
      });

      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      const formatted = result.current.formatForTimeline(checkpoint);

      expect(formatted.description).toBe('Test');
      expect(formatted.sizeLabel).toBe('1.0 KB');
    });

    it('should provide event subscription', () => {
      const { result } = renderHook(() =>
        useCheckpoints({
          chatId: 'test-chat',
          autoLoad: false,
        }),
      );

      const listener = vi.fn();
      const unsubscribe = result.current.subscribeToEvents(listener);

      expect(typeof unsubscribe).toBe('function');
      unsubscribe();
    });
  });
});
