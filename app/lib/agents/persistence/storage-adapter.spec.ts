/**
 * Tests pour le module de persistance
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Task, AgentError } from '../types';
import type { CheckpointState } from '../utils/checkpoint-manager';
import { LocalStorageAdapter } from './local-storage';
import { TaskPersistenceManager, createTaskPersistenceManager } from './task-persistence-manager';
import { STORAGE_SCHEMA_VERSION, DEFAULT_DLQ_RETENTION_MS } from './storage-adapter';

/*
 * ============================================================================
 * MOCKS
 * ============================================================================
 */

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {};
  return {
    getItem: vi.fn((key: string) => store[key] ?? null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value;
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
    get length() {
      return Object.keys(store).length;
    },
    key: vi.fn((index: number) => Object.keys(store)[index] ?? null),
  };
})();

Object.defineProperty(global, 'localStorage', {
  value: localStorageMock,
  writable: true,
});

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    type: 'test',
    prompt: 'Test task',
    status: 'pending',
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockCheckpoint(taskId: string, overrides: Partial<CheckpointState> = {}): CheckpointState {
  return {
    id: `cp-${taskId}-${Date.now()}`,
    taskId,
    task: createMockTask({ id: taskId }),
    messageHistory: [],
    agentName: 'test-agent',
    createdAt: new Date(),
    updatedAt: new Date(),
    reason: 'auto',
    ...overrides,
  };
}

function createMockError(overrides: Partial<AgentError> = {}): AgentError {
  return {
    code: 'TEST_ERROR',
    message: 'Test error message',
    recoverable: false,
    ...overrides,
  };
}

/*
 * ============================================================================
 * LOCALSTORAGE ADAPTER TESTS
 * ============================================================================
 */

describe('LocalStorageAdapter', () => {
  let adapter: LocalStorageAdapter;

  beforeEach(async () => {
    localStorageMock.clear();
    vi.clearAllMocks();
    adapter = new LocalStorageAdapter();
    await adapter.initialize();
  });

  afterEach(async () => {
    await adapter.close();
  });

  describe('lifecycle', () => {
    it('should initialize successfully', async () => {
      const newAdapter = new LocalStorageAdapter();
      const result = await newAdapter.initialize();

      expect(result).toBe(true);
      expect(newAdapter.isAvailable()).toBe(true);
      expect(newAdapter.getStorageType()).toBe('localstorage');

      await newAdapter.close();
    });

    it('should close properly', async () => {
      await adapter.close();
      expect(adapter.isAvailable()).toBe(false);
    });
  });

  describe('task operations', () => {
    it('should save and load a task', async () => {
      const task = createMockTask();

      const saveResult = await adapter.saveTask(task);
      expect(saveResult.success).toBe(true);

      const loaded = await adapter.loadTask(task.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.task.id).toBe(task.id);
      expect(loaded!.schemaVersion).toBe(STORAGE_SCHEMA_VERSION);
    });

    it('should load pending tasks', async () => {
      const pendingTask = createMockTask({ status: 'pending' });
      const inProgressTask = createMockTask({ status: 'in_progress' });
      const completedTask = createMockTask({ status: 'completed' });

      await adapter.saveTask(pendingTask);
      await adapter.saveTask(inProgressTask);
      await adapter.saveTask(completedTask);

      const pending = await adapter.loadPendingTasks();

      expect(pending.length).toBe(2);
      expect(pending.map((p) => p.task.id)).toContain(pendingTask.id);
      expect(pending.map((p) => p.task.id)).toContain(inProgressTask.id);
    });

    it('should query tasks with filters', async () => {
      const task1 = createMockTask({ status: 'pending', priority: 1 });
      const task2 = createMockTask({ status: 'pending', priority: 2 });
      const task3 = createMockTask({ status: 'completed', priority: 3 });

      await adapter.saveTask(task1);
      await adapter.saveTask(task2);
      await adapter.saveTask(task3);

      const results = await adapter.queryTasks({
        status: 'pending',
        orderBy: 'priority',
        order: 'desc',
      });

      expect(results.length).toBe(2);
      expect(results[0].task.priority).toBe(2);
      expect(results[1].task.priority).toBe(1);
    });

    it('should update a task', async () => {
      const task = createMockTask({ status: 'pending' });
      await adapter.saveTask(task);

      const updateResult = await adapter.updateTask(task.id, { status: 'in_progress' });
      expect(updateResult.success).toBe(true);

      const loaded = await adapter.loadTask(task.id);
      expect(loaded!.task.status).toBe('in_progress');
    });

    it('should delete a task', async () => {
      const task = createMockTask();
      await adapter.saveTask(task);

      const deleteResult = await adapter.deleteTask(task.id);
      expect(deleteResult.success).toBe(true);

      const loaded = await adapter.loadTask(task.id);
      expect(loaded).toBeNull();
    });

    it('should cleanup old tasks', async () => {
      vi.useFakeTimers();

      const oldTask = createMockTask({ status: 'completed' });
      const recentTask = createMockTask({ status: 'completed' });

      await adapter.saveTask(oldTask);

      // Avancer le temps de 2 heures
      vi.advanceTimersByTime(2 * 60 * 60 * 1000);

      await adapter.saveTask(recentTask);

      // Cleanup des tâches de plus d'une heure
      const result = await adapter.cleanupTasks(60 * 60 * 1000);

      expect(result.success).toBe(true);
      expect(result.affectedCount).toBe(1);

      const oldLoaded = await adapter.loadTask(oldTask.id);
      const recentLoaded = await adapter.loadTask(recentTask.id);

      expect(oldLoaded).toBeNull();
      expect(recentLoaded).not.toBeNull();

      vi.useRealTimers();
    });
  });

  describe('checkpoint operations', () => {
    it('should save and load a checkpoint', async () => {
      const checkpoint = createMockCheckpoint('task-123');

      const saveResult = await adapter.saveCheckpoint(checkpoint);
      expect(saveResult.success).toBe(true);

      const loaded = await adapter.loadCheckpoint(checkpoint.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.taskId).toBe('task-123');
    });

    it('should load checkpoint by task ID', async () => {
      const checkpoint = createMockCheckpoint('task-456');
      await adapter.saveCheckpoint(checkpoint);

      const loaded = await adapter.loadCheckpointByTaskId('task-456');
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(checkpoint.id);
    });

    it('should list all checkpoints', async () => {
      await adapter.saveCheckpoint(createMockCheckpoint('task-1'));
      await adapter.saveCheckpoint(createMockCheckpoint('task-2'));

      const list = await adapter.listCheckpoints();
      expect(list.length).toBe(2);
    });

    it('should delete a checkpoint', async () => {
      const checkpoint = createMockCheckpoint('task-789');
      await adapter.saveCheckpoint(checkpoint);

      const deleteResult = await adapter.deleteCheckpoint(checkpoint.id);
      expect(deleteResult.success).toBe(true);

      const loaded = await adapter.loadCheckpoint(checkpoint.id);
      expect(loaded).toBeNull();
    });
  });

  describe('dead-letter queue operations', () => {
    it('should add and list DLQ entries', async () => {
      const task = createMockTask();
      const entry = {
        id: `dlq-${task.id}`,
        task,
        error: createMockError(),
        attempts: 3,
        firstFailedAt: new Date(),
        lastFailedAt: new Date(),
        expiresAt: new Date(Date.now() + DEFAULT_DLQ_RETENTION_MS),
      };

      const addResult = await adapter.addToDeadLetterQueue(entry);
      expect(addResult.success).toBe(true);

      const list = await adapter.listDeadLetterQueue();
      expect(list.length).toBe(1);
      expect(list[0].task.id).toBe(task.id);
    });

    it('should remove DLQ entry', async () => {
      const task = createMockTask();
      const entry = {
        id: `dlq-${task.id}`,
        task,
        error: createMockError(),
        attempts: 1,
        firstFailedAt: new Date(),
        lastFailedAt: new Date(),
        expiresAt: new Date(Date.now() + DEFAULT_DLQ_RETENTION_MS),
      };

      await adapter.addToDeadLetterQueue(entry);

      const removeResult = await adapter.removeFromDeadLetterQueue(entry.id);
      expect(removeResult.success).toBe(true);

      const list = await adapter.listDeadLetterQueue();
      expect(list.length).toBe(0);
    });

    it('should purge expired DLQ entries', async () => {
      vi.useFakeTimers();

      const expiredEntry = {
        id: 'dlq-expired',
        task: createMockTask(),
        error: createMockError(),
        attempts: 1,
        firstFailedAt: new Date(),
        lastFailedAt: new Date(),
        expiresAt: new Date(Date.now() + 1000), // Expire dans 1 seconde
      };

      const validEntry = {
        id: 'dlq-valid',
        task: createMockTask(),
        error: createMockError(),
        attempts: 1,
        firstFailedAt: new Date(),
        lastFailedAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // Expire dans 24h
      };

      await adapter.addToDeadLetterQueue(expiredEntry);
      await adapter.addToDeadLetterQueue(validEntry);

      // Avancer de 2 secondes
      vi.advanceTimersByTime(2000);

      const purgeResult = await adapter.purgeDeadLetterQueue();
      expect(purgeResult.success).toBe(true);
      expect(purgeResult.affectedCount).toBe(1);

      const list = await adapter.listDeadLetterQueue();
      expect(list.length).toBe(1);
      expect(list[0].id).toBe('dlq-valid');

      vi.useRealTimers();
    });
  });

  describe('utility operations', () => {
    it('should get stats', async () => {
      await adapter.saveTask(createMockTask());
      await adapter.saveTask(createMockTask());
      await adapter.saveCheckpoint(createMockCheckpoint('task-1'));

      const stats = await adapter.getStats();

      expect(stats.taskCount).toBe(2);
      expect(stats.checkpointCount).toBe(1);
      expect(stats.dlqCount).toBe(0);
      expect(stats.storageType).toBe('localstorage');
    });

    it('should clear all data', async () => {
      await adapter.saveTask(createMockTask());
      await adapter.saveCheckpoint(createMockCheckpoint('task-1'));

      const clearResult = await adapter.clear();
      expect(clearResult.success).toBe(true);

      const stats = await adapter.getStats();
      expect(stats.taskCount).toBe(0);
      expect(stats.checkpointCount).toBe(0);
    });

    it('should export and import data', async () => {
      const task = createMockTask();
      const checkpoint = createMockCheckpoint(task.id);

      await adapter.saveTask(task);
      await adapter.saveCheckpoint(checkpoint);

      const exported = await adapter.exportData();
      expect(exported.tasks.length).toBe(1);
      expect(exported.checkpoints.length).toBe(1);

      // Clear and reimport
      await adapter.clear();

      const importResult = await adapter.importData({
        tasks: exported.tasks,
        checkpoints: exported.checkpoints,
      });

      expect(importResult.success).toBe(true);
      expect(importResult.affectedCount).toBe(2);

      const stats = await adapter.getStats();
      expect(stats.taskCount).toBe(1);
      expect(stats.checkpointCount).toBe(1);
    });
  });
});

/*
 * ============================================================================
 * TASK PERSISTENCE MANAGER TESTS
 * ============================================================================
 */

describe('TaskPersistenceManager', () => {
  let manager: TaskPersistenceManager;

  beforeEach(async () => {
    localStorageMock.clear();
    vi.clearAllMocks();
    manager = createTaskPersistenceManager({ forceLocalStorage: true });
    await manager.initialize();
  });

  afterEach(async () => {
    await manager.close();
  });

  describe('lifecycle', () => {
    it('should initialize with localStorage fallback', async () => {
      const state = manager.getState();

      expect(state.initialized).toBe(true);
      expect(state.storageType).toBe('localstorage');
      expect(manager.isReady()).toBe(true);
    });

    it('should close properly', async () => {
      await manager.close();

      const state = manager.getState();
      expect(state.initialized).toBe(false);
      expect(state.storageType).toBe('none');
    });
  });

  describe('task management', () => {
    it('should persist and load a task', async () => {
      const task = createMockTask();

      const persistResult = await manager.persistTask(task);
      expect(persistResult).toBe(true);

      const loaded = await manager.loadTask(task.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.id).toBe(task.id);
    });

    it('should load pending tasks', async () => {
      await manager.persistTask(createMockTask({ status: 'pending' }));
      await manager.persistTask(createMockTask({ status: 'queued' }));
      await manager.persistTask(createMockTask({ status: 'completed' }));

      const pending = await manager.loadPendingTasks();
      expect(pending.length).toBe(2);
    });

    it('should complete a task', async () => {
      const task = createMockTask({ status: 'in_progress' });
      await manager.persistTask(task);

      const result = await manager.completeTask(task.id, {
        success: true,
        output: 'Task completed',
      });

      expect(result).toBe(true);

      const loaded = await manager.loadTask(task.id);
      expect(loaded!.status).toBe('completed');
      expect(loaded!.result?.success).toBe(true);
    });

    it('should fail a task', async () => {
      const task = createMockTask({ status: 'in_progress' });
      await manager.persistTask(task);

      const error = createMockError();
      const result = await manager.failTask(task.id, error);

      expect(result).toBe(true);

      const loaded = await manager.loadTask(task.id);
      expect(loaded!.status).toBe('failed');
      expect(loaded!.result?.success).toBe(false);
    });
  });

  describe('checkpoint management', () => {
    it('should save and load checkpoints', async () => {
      const checkpoint = createMockCheckpoint('task-123');

      const saveResult = await manager.saveCheckpoint(checkpoint);
      expect(saveResult).toBe(true);

      const loaded = await manager.loadCheckpoint(checkpoint.id);
      expect(loaded).not.toBeNull();
      expect(loaded!.taskId).toBe('task-123');
    });

    it('should check if checkpoint exists', async () => {
      const checkpoint = createMockCheckpoint('task-456');
      await manager.saveCheckpoint(checkpoint);

      const hasCheckpoint = await manager.hasCheckpoint('task-456');
      expect(hasCheckpoint).toBe(true);

      const noCheckpoint = await manager.hasCheckpoint('task-789');
      expect(noCheckpoint).toBe(false);
    });

    it('should delete checkpoint by task ID', async () => {
      const checkpoint = createMockCheckpoint('task-delete');
      await manager.saveCheckpoint(checkpoint);

      const deleteResult = await manager.deleteCheckpointByTaskId('task-delete');
      expect(deleteResult).toBe(true);

      const hasCheckpoint = await manager.hasCheckpoint('task-delete');
      expect(hasCheckpoint).toBe(false);
    });
  });

  describe('dead-letter queue', () => {
    it('should add failed task to DLQ', async () => {
      const task = createMockTask();
      const error = createMockError();

      const result = await manager.addToDeadLetterQueue(task, error, 3);
      expect(result).toBe(true);

      const dlq = await manager.listDeadLetterQueue();
      expect(dlq.length).toBe(1);
      expect(dlq[0].task.id).toBe(task.id);
      expect(dlq[0].attempts).toBe(3);
    });

    it('should retry task from DLQ', async () => {
      const task = createMockTask({ status: 'failed' });
      const error = createMockError();

      await manager.addToDeadLetterQueue(task, error, 2);

      const dlq = await manager.listDeadLetterQueue();
      const entryId = dlq[0].id;

      const retryTask = await manager.retryFromDeadLetterQueue(entryId);

      expect(retryTask).not.toBeNull();
      expect(retryTask!.id).toBe(task.id);
      expect(retryTask!.status).toBe('pending');
      expect(retryTask!.metadata?.retryCount).toBe(1);

      // DLQ should be empty now
      const dlqAfter = await manager.listDeadLetterQueue();
      expect(dlqAfter.length).toBe(0);
    });
  });

  describe('utilities', () => {
    it('should get stats', async () => {
      await manager.persistTask(createMockTask());
      await manager.saveCheckpoint(createMockCheckpoint('task-1'));

      const stats = await manager.getStats();

      expect(stats).not.toBeNull();
      expect(stats!.taskCount).toBe(1);
      expect(stats!.checkpointCount).toBe(1);
    });

    it('should export and import data', async () => {
      const task = createMockTask();
      await manager.persistTask(task);

      const jsonData = await manager.exportData();
      expect(jsonData).not.toBeNull();

      // Clear and reimport
      await manager.clearAll();

      const importResult = await manager.importData(jsonData!);
      expect(importResult).toBe(true);

      const loaded = await manager.loadTask(task.id);
      expect(loaded).not.toBeNull();
    });

    it('should cleanup old data', async () => {
      vi.useFakeTimers();

      // Create old completed task
      await manager.persistTask(createMockTask({ status: 'completed' }));

      // Advance time
      vi.advanceTimersByTime(8 * 24 * 60 * 60 * 1000); // 8 days

      // Create recent task
      await manager.persistTask(createMockTask({ status: 'pending' }));

      const result = await manager.cleanup();

      expect(result.tasks).toBe(1); // Old completed task cleaned
      expect(result.checkpoints).toBe(0);
      expect(result.dlq).toBe(0);

      vi.useRealTimers();
    });
  });
});
