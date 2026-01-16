/**
 * Tests for the checkpoints store.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Checkpoint } from '~/types/checkpoint';
import type { FileMap } from '~/lib/stores/files';

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

// Import after mock
import {
  checkpointsMap,
  currentCheckpointId,
  isRestoring,
  isLoading,
  checkpointError,
  lastAutoCheckpointTime,
  currentChatId,
  checkpointConfig,
  checkpointsList,
  currentChatCheckpoints,
  latestCheckpoint,
  checkpointCount,
  hasCheckpoints,
  checkpointStats,
  addCheckpoint,
  addCheckpoints,
  removeCheckpoint,
  clearCheckpoints,
  clearCheckpointsForChat,
  getCheckpoint,
  updateCheckpointDescription,
  setCurrentCheckpoint,
  setRestoring,
  setLoading,
  setError,
  setCurrentChatId,
  canCreateAutoCheckpoint,
  recordAutoCheckpoint,
  updateConfig,
  subscribeToEvents,
  filterExcludedFiles,
  shouldCleanupCheckpoints,
  getCheckpointsToCleanup,
  formatCheckpointForTimeline,
} from './checkpoints';
import { DEFAULT_CHECKPOINT_CONFIG } from '~/types/checkpoint';

describe('checkpoints store', () => {
  const mockFilesSnapshot: FileMap = {
    '/home/project/index.ts': { type: 'file', content: 'console.log("test")', isBinary: false },
  };

  const createMockCheckpoint = (overrides: Partial<Checkpoint> = {}): Checkpoint => ({
    id: `ckpt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    chatId: 'chat-1',
    filesSnapshot: mockFilesSnapshot,
    messagesSnapshot: [{ id: 'msg-1', role: 'user', content: 'test' }],
    triggerType: 'manual',
    isFullSnapshot: true,
    compressed: false,
    createdAt: new Date().toISOString(),
    ...overrides,
  });

  beforeEach(() => {
    // Reset all stores
    checkpointsMap.set({});
    currentCheckpointId.set(null);
    isRestoring.set(false);
    isLoading.set(false);
    checkpointError.set(null);
    lastAutoCheckpointTime.set(0);
    currentChatId.set(null);
    checkpointConfig.set({ ...DEFAULT_CHECKPOINT_CONFIG });
  });

  describe('basic state management', () => {
    it('should start with empty checkpoints', () => {
      expect(checkpointsMap.get()).toEqual({});
      expect(checkpointsList.get()).toEqual([]);
    });

    it('should add a checkpoint', () => {
      const checkpoint = createMockCheckpoint();
      addCheckpoint(checkpoint);

      expect(checkpointsMap.get()[checkpoint.id]).toEqual(checkpoint);
    });

    it('should add multiple checkpoints', () => {
      const cp1 = createMockCheckpoint({ id: 'ckpt_1' });
      const cp2 = createMockCheckpoint({ id: 'ckpt_2' });

      addCheckpoints([cp1, cp2]);

      expect(Object.keys(checkpointsMap.get())).toHaveLength(2);
    });

    it('should remove a checkpoint', () => {
      const checkpoint = createMockCheckpoint();
      addCheckpoint(checkpoint);

      const removed = removeCheckpoint(checkpoint.id);

      expect(removed).toBe(true);
      expect(checkpointsMap.get()[checkpoint.id]).toBeUndefined();
    });

    it('should return false when removing non-existent checkpoint', () => {
      const removed = removeCheckpoint('nonexistent');
      expect(removed).toBe(false);
    });

    it('should clear all checkpoints', () => {
      addCheckpoint(createMockCheckpoint({ id: 'ckpt_1' }));
      addCheckpoint(createMockCheckpoint({ id: 'ckpt_2' }));

      clearCheckpoints();

      expect(checkpointsMap.get()).toEqual({});
    });

    it('should clear checkpoints for specific chat', () => {
      addCheckpoint(createMockCheckpoint({ id: 'ckpt_1', chatId: 'chat-1' }));
      addCheckpoint(createMockCheckpoint({ id: 'ckpt_2', chatId: 'chat-2' }));

      clearCheckpointsForChat('chat-1');

      const remaining = Object.values(checkpointsMap.get());
      expect(remaining).toHaveLength(1);
      expect(remaining[0].chatId).toBe('chat-2');
    });

    it('should get checkpoint by ID', () => {
      const checkpoint = createMockCheckpoint();
      addCheckpoint(checkpoint);

      expect(getCheckpoint(checkpoint.id)).toEqual(checkpoint);
      expect(getCheckpoint('nonexistent')).toBeUndefined();
    });

    it('should update checkpoint description', () => {
      const checkpoint = createMockCheckpoint({ description: 'Original' });
      addCheckpoint(checkpoint);

      const updated = updateCheckpointDescription(checkpoint.id, 'Updated');

      expect(updated).toBe(true);
      expect(getCheckpoint(checkpoint.id)?.description).toBe('Updated');
    });
  });

  describe('computed values', () => {
    it('should sort checkpoints by date (newest first)', () => {
      const older = createMockCheckpoint({
        id: 'ckpt_older',
        createdAt: '2024-01-01T10:00:00Z',
      });
      const newer = createMockCheckpoint({
        id: 'ckpt_newer',
        createdAt: '2024-01-01T12:00:00Z',
      });

      addCheckpoint(older);
      addCheckpoint(newer);

      const list = checkpointsList.get();
      expect(list[0].id).toBe('ckpt_newer');
      expect(list[1].id).toBe('ckpt_older');
    });

    it('should filter checkpoints by current chat', () => {
      addCheckpoint(createMockCheckpoint({ id: 'ckpt_1', chatId: 'chat-1' }));
      addCheckpoint(createMockCheckpoint({ id: 'ckpt_2', chatId: 'chat-2' }));

      setCurrentChatId('chat-1');

      const filtered = currentChatCheckpoints.get();
      expect(filtered).toHaveLength(1);
      expect(filtered[0].chatId).toBe('chat-1');
    });

    it('should return latest checkpoint', () => {
      const older = createMockCheckpoint({
        id: 'ckpt_older',
        chatId: 'chat-1',
        createdAt: '2024-01-01T10:00:00Z',
      });
      const newer = createMockCheckpoint({
        id: 'ckpt_newer',
        chatId: 'chat-1',
        createdAt: '2024-01-01T12:00:00Z',
      });

      addCheckpoint(older);
      addCheckpoint(newer);
      setCurrentChatId('chat-1');

      expect(latestCheckpoint.get()?.id).toBe('ckpt_newer');
    });

    it('should calculate checkpoint count', () => {
      addCheckpoint(createMockCheckpoint({ chatId: 'chat-1' }));
      addCheckpoint(createMockCheckpoint({ chatId: 'chat-1' }));
      addCheckpoint(createMockCheckpoint({ chatId: 'chat-2' }));

      setCurrentChatId('chat-1');
      expect(checkpointCount.get()).toBe(2);
    });

    it('should indicate if has checkpoints', () => {
      setCurrentChatId('chat-1');
      expect(hasCheckpoints.get()).toBe(false);

      addCheckpoint(createMockCheckpoint({ chatId: 'chat-1' }));
      expect(hasCheckpoints.get()).toBe(true);
    });

    it('should calculate stats correctly', () => {
      addCheckpoint(createMockCheckpoint({ chatId: 'chat-1', triggerType: 'auto', sizeBytes: 100 }));
      addCheckpoint(createMockCheckpoint({ chatId: 'chat-1', triggerType: 'manual', sizeBytes: 200 }));
      addCheckpoint(createMockCheckpoint({ chatId: 'chat-1', triggerType: 'before_action', sizeBytes: 150 }));

      setCurrentChatId('chat-1');

      const stats = checkpointStats.get();
      expect(stats.totalCount).toBe(3);
      expect(stats.autoCount).toBe(1);
      expect(stats.manualCount).toBe(1);
      expect(stats.beforeActionCount).toBe(1);
      expect(stats.totalSizeBytes).toBe(450);
    });
  });

  describe('state setters', () => {
    it('should set current checkpoint ID', () => {
      setCurrentCheckpoint('ckpt_123');
      expect(currentCheckpointId.get()).toBe('ckpt_123');
    });

    it('should set restoring state', () => {
      setRestoring(true);
      expect(isRestoring.get()).toBe(true);
    });

    it('should set loading state', () => {
      setLoading(true);
      expect(isLoading.get()).toBe(true);
    });

    it('should set error', () => {
      const error = new Error('Test error');
      setError(error);
      expect(checkpointError.get()).toBe(error);
    });

    it('should set current chat ID', () => {
      setCurrentChatId('chat-123');
      expect(currentChatId.get()).toBe('chat-123');
    });
  });

  describe('auto checkpoint throttling', () => {
    it('should allow auto checkpoint when never created', () => {
      expect(canCreateAutoCheckpoint()).toBe(true);
    });

    it('should throttle auto checkpoints', () => {
      recordAutoCheckpoint();
      expect(canCreateAutoCheckpoint()).toBe(false);
    });

    it('should allow after throttle period', () => {
      // Set last checkpoint time to past the throttle period
      lastAutoCheckpointTime.set(Date.now() - 120000); // 2 minutes ago
      expect(canCreateAutoCheckpoint()).toBe(true);
    });
  });

  describe('config management', () => {
    it('should update config', () => {
      updateConfig({ maxCheckpointsPerChat: 100 });
      expect(checkpointConfig.get().maxCheckpointsPerChat).toBe(100);
    });

    it('should preserve other config values when updating', () => {
      const original = checkpointConfig.get();
      updateConfig({ maxCheckpointsPerChat: 100 });

      expect(checkpointConfig.get().autoCheckpointThrottleMs).toBe(original.autoCheckpointThrottleMs);
    });
  });

  describe('event system', () => {
    it('should emit events when checkpoint is added', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeToEvents(listener);

      const checkpoint = createMockCheckpoint();
      addCheckpoint(checkpoint);

      expect(listener).toHaveBeenCalledWith({
        type: 'created',
        checkpoint,
      });

      unsubscribe();
    });

    it('should emit events when checkpoint is removed', () => {
      const checkpoint = createMockCheckpoint();
      addCheckpoint(checkpoint);

      const listener = vi.fn();
      const unsubscribe = subscribeToEvents(listener);

      removeCheckpoint(checkpoint.id);

      expect(listener).toHaveBeenCalledWith({
        type: 'deleted',
        checkpointId: checkpoint.id,
      });

      unsubscribe();
    });

    it('should emit events when description is updated', () => {
      const checkpoint = createMockCheckpoint();
      addCheckpoint(checkpoint);

      const listener = vi.fn();
      const unsubscribe = subscribeToEvents(listener);

      updateCheckpointDescription(checkpoint.id, 'New description');

      expect(listener).toHaveBeenCalledWith({
        type: 'updated',
        checkpointId: checkpoint.id,
        field: 'description',
      });

      unsubscribe();
    });

    it('should unsubscribe correctly', () => {
      const listener = vi.fn();
      const unsubscribe = subscribeToEvents(listener);

      unsubscribe();

      addCheckpoint(createMockCheckpoint());
      expect(listener).not.toHaveBeenCalled();
    });
  });

  describe('file filtering', () => {
    it('should filter excluded files', () => {
      const files: FileMap = {
        '/home/project/index.ts': { type: 'file', content: 'test', isBinary: false },
        '/home/project/.env': { type: 'file', content: 'SECRET=123', isBinary: false },
        '/home/project/.env.local': { type: 'file', content: 'LOCAL=456', isBinary: false },
        '/home/project/src/app.ts': { type: 'file', content: 'app', isBinary: false },
      };

      const filtered = filterExcludedFiles(files);

      expect(filtered['/home/project/index.ts']).toBeDefined();
      expect(filtered['/home/project/src/app.ts']).toBeDefined();
      expect(filtered['/home/project/.env']).toBeUndefined();
      expect(filtered['/home/project/.env.local']).toBeUndefined();
    });
  });

  describe('cleanup detection', () => {
    it('should detect when cleanup is needed', () => {
      updateConfig({ maxCheckpointsPerChat: 3 });

      for (let i = 0; i < 5; i++) {
        addCheckpoint(createMockCheckpoint({ chatId: 'chat-1' }));
      }

      expect(shouldCleanupCheckpoints('chat-1')).toBe(true);
    });

    it('should not need cleanup when under limit', () => {
      updateConfig({ maxCheckpointsPerChat: 10 });

      for (let i = 0; i < 3; i++) {
        addCheckpoint(createMockCheckpoint({ chatId: 'chat-1' }));
      }

      expect(shouldCleanupCheckpoints('chat-1')).toBe(false);
    });

    it('should get checkpoints to cleanup', () => {
      updateConfig({ maxCheckpointsPerChat: 2, preserveManualOnCleanup: false });

      const cp1 = createMockCheckpoint({ id: 'ckpt_1', chatId: 'chat-1', createdAt: '2024-01-01T10:00:00Z' });
      const cp2 = createMockCheckpoint({ id: 'ckpt_2', chatId: 'chat-1', createdAt: '2024-01-01T11:00:00Z' });
      const cp3 = createMockCheckpoint({ id: 'ckpt_3', chatId: 'chat-1', createdAt: '2024-01-01T12:00:00Z' });
      const cp4 = createMockCheckpoint({ id: 'ckpt_4', chatId: 'chat-1', createdAt: '2024-01-01T13:00:00Z' });

      addCheckpoints([cp1, cp2, cp3, cp4]);

      const toCleanup = getCheckpointsToCleanup('chat-1');

      // Should keep 2 newest (ckpt_3, ckpt_4), cleanup oldest 2
      expect(toCleanup).toContain('ckpt_1');
      expect(toCleanup).toContain('ckpt_2');
      expect(toCleanup).not.toContain('ckpt_3');
      expect(toCleanup).not.toContain('ckpt_4');
    });

    it('should preserve manual checkpoints during cleanup', () => {
      updateConfig({ maxCheckpointsPerChat: 2, preserveManualOnCleanup: true });

      const oldManual = createMockCheckpoint({
        id: 'ckpt_manual',
        chatId: 'chat-1',
        triggerType: 'manual',
        createdAt: '2024-01-01T08:00:00Z',
      });
      const auto1 = createMockCheckpoint({
        id: 'ckpt_auto1',
        chatId: 'chat-1',
        triggerType: 'auto',
        createdAt: '2024-01-01T10:00:00Z',
      });
      const auto2 = createMockCheckpoint({
        id: 'ckpt_auto2',
        chatId: 'chat-1',
        triggerType: 'auto',
        createdAt: '2024-01-01T12:00:00Z',
      });
      const auto3 = createMockCheckpoint({
        id: 'ckpt_auto3',
        chatId: 'chat-1',
        triggerType: 'auto',
        createdAt: '2024-01-01T14:00:00Z',
      });

      addCheckpoints([oldManual, auto1, auto2, auto3]);

      const toCleanup = getCheckpointsToCleanup('chat-1');

      // Manual checkpoint should NOT be in cleanup list
      expect(toCleanup).not.toContain('ckpt_manual');

      // Oldest auto should be cleaned up
      expect(toCleanup).toContain('ckpt_auto1');
    });
  });

  describe('formatCheckpointForTimeline', () => {
    it('should format checkpoint with description', () => {
      const checkpoint = createMockCheckpoint({
        description: 'My checkpoint',
        triggerType: 'manual',
        sizeBytes: 1024,
        createdAt: new Date().toISOString(),
      });

      const formatted = formatCheckpointForTimeline(checkpoint);

      expect(formatted.description).toBe('My checkpoint');
      expect(formatted.type).toBe('manual');
      expect(formatted.sizeLabel).toBe('1.0 KB');
      expect(formatted.timeAgo).toBeDefined();
    });

    it('should generate default description based on trigger type', () => {
      const autoCheckpoint = createMockCheckpoint({ triggerType: 'auto' });
      const manualCheckpoint = createMockCheckpoint({ triggerType: 'manual' });
      const beforeActionCheckpoint = createMockCheckpoint({ triggerType: 'before_action' });

      expect(formatCheckpointForTimeline(autoCheckpoint).description).toBe('Checkpoint automatique');
      expect(formatCheckpointForTimeline(manualCheckpoint).description).toBe('Point de sauvegarde manuel');
      expect(formatCheckpointForTimeline(beforeActionCheckpoint).description).toBe('Avant modification');
    });

    it('should format size correctly', () => {
      const small = createMockCheckpoint({ sizeBytes: 500 });
      const medium = createMockCheckpoint({ sizeBytes: 5000 });
      const large = createMockCheckpoint({ sizeBytes: 2000000 });

      expect(formatCheckpointForTimeline(small).sizeLabel).toBe('500 B');
      expect(formatCheckpointForTimeline(medium).sizeLabel).toBe('4.9 KB');
      expect(formatCheckpointForTimeline(large).sizeLabel).toBe('1.9 MB');
    });

    it('should format time ago correctly', () => {
      const now = new Date();
      const checkpoint = createMockCheckpoint({
        createdAt: now.toISOString(),
      });

      const formatted = formatCheckpointForTimeline(checkpoint);
      expect(formatted.timeAgo).toBe("À l'instant");
    });
  });
});
