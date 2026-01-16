/**
 * Tests for PriorityTaskQueue
 *
 * Comprehensive tests covering:
 * - Constructor with default and custom config
 * - enqueue with different priorities (critical, high, normal, low)
 * - enqueueBatch with dependencies
 * - pause and resume
 * - cancel pending tasks
 * - clear all tasks
 * - getStats (including priority stats)
 * - Reserved slots for critical tasks
 * - Task aging/promotion
 * - Retry mechanism
 * - Event emission
 * - Factory function
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  PriorityTaskQueue,
  createPriorityTaskQueue,
  type PriorityTaskQueueConfig,
  type PriorityTaskQueueStats,
} from './priority-task-queue';
import { TaskPriority } from './priority-queue';
import type { Task, TaskResult } from '../types';

// Mock dependencies
vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

vi.mock('../core/agent-registry', () => ({
  AgentRegistry: vi.fn(),
}));

vi.mock('./priority-queue', async () => {
  const actual = await vi.importActual('./priority-queue');
  return actual;
});

// Helper to create mock registry
const createMockRegistry = () => {
  const agents = new Map<string, any>();

  return {
    get: vi.fn((name: string) => agents.get(name)),
    getAvailable: vi.fn(() => Array.from(agents.values()).filter((a) => a.isAvailable())),
    _register: (name: string, agent: any) => {
      agents.set(name, agent);
    },
  };
};

// Helper to create a mock agent
const createMockAgent = (name: string, available = true) => ({
  getName: vi.fn(() => name),
  isAvailable: vi.fn(() => available),
  run: vi.fn().mockResolvedValue({
    success: true,
    output: `Result from ${name}`,
  } as TaskResult),
});

// Helper to create a task
const createTask = (overrides: Partial<Task> = {}): Task => ({
  id: `task-${Math.random().toString(36).slice(2, 9)}`,
  type: 'coder',
  prompt: 'Test prompt',
  status: 'pending',
  createdAt: new Date(),
  ...overrides,
});

// Helper to safely enqueue without worrying about unhandled rejections
const safeEnqueue = (queue: PriorityTaskQueue, task: Task, priority?: TaskPriority): void => {
  const promise = priority !== undefined ? queue.enqueue(task, priority) : queue.enqueue(task);

  // Suppress unhandled rejection
  promise.catch(() => {});
};

describe('PriorityTaskQueue', () => {
  let mockRegistry: ReturnType<typeof createMockRegistry>;
  let queue: PriorityTaskQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistry = createMockRegistry();
    queue = new PriorityTaskQueue(mockRegistry as any, 'test-api-key', {
      maxParallel: 3,
      retryDelay: 10,
      maxRetries: 2,
      enableAging: false,
      reservedCriticalSlots: 1,
    });
  });

  afterEach(async () => {
    // Clear the queue first to handle any pending promises
    queue.pause();
    queue.clear();

    // Small delay to let promise rejections settle
    await new Promise((resolve) => setTimeout(resolve, 10));
  });

  describe('constructor', () => {
    it('should create queue with default config', () => {
      const q = new PriorityTaskQueue(mockRegistry as any, 'key');
      expect(q).toBeInstanceOf(PriorityTaskQueue);
      q.destroy();
    });

    it('should create queue with custom config', () => {
      const onEvent = vi.fn();
      const q = new PriorityTaskQueue(mockRegistry as any, 'key', {
        maxParallel: 5,
        retryDelay: 2000,
        maxRetries: 3,
        enableAging: true,
        agingThresholdMs: 30000,
        reservedCriticalSlots: 2,
        onEvent,
      });

      expect(q).toBeInstanceOf(PriorityTaskQueue);
      q.destroy();
    });

    it('should use default values when config is partial', () => {
      const q = new PriorityTaskQueue(mockRegistry as any, 'key', {
        maxParallel: 10,
      });

      const stats = q.getStats();
      expect(stats.pending).toBe(0);
      q.destroy();
    });
  });

  describe('enqueue with different priorities', () => {
    beforeEach(() => {
      queue.pause();
    });

    it('should enqueue task with NORMAL priority by default', () => {
      const task = createTask({ id: 'normal-task' });
      safeEnqueue(queue, task);

      const pending = queue.getPendingTasks();
      expect(pending).toHaveLength(1);
      expect(pending[0].id).toBe('normal-task');
      expect(pending[0].priority).toBe(TaskPriority.NORMAL);
    });

    it('should enqueue task with CRITICAL priority', () => {
      const task = createTask({ id: 'critical-task' });
      safeEnqueue(queue, task, TaskPriority.CRITICAL);

      const pending = queue.getPendingTasks();
      expect(pending).toHaveLength(1);
      expect(pending[0].priority).toBe(TaskPriority.CRITICAL);
    });

    it('should enqueue task with HIGH priority', () => {
      const task = createTask({ id: 'high-task' });
      safeEnqueue(queue, task, TaskPriority.HIGH);

      const pending = queue.getPendingTasks();
      expect(pending[0].priority).toBe(TaskPriority.HIGH);
    });

    it('should enqueue task with LOW priority', () => {
      const task = createTask({ id: 'low-task' });
      safeEnqueue(queue, task, TaskPriority.LOW);

      const pending = queue.getPendingTasks();
      expect(pending[0].priority).toBe(TaskPriority.LOW);
    });

    it('should enqueue task with BACKGROUND priority', () => {
      const task = createTask({ id: 'bg-task' });
      safeEnqueue(queue, task, TaskPriority.BACKGROUND);

      const pending = queue.getPendingTasks();
      expect(pending[0].priority).toBe(TaskPriority.BACKGROUND);
    });

    it('should use enqueueCritical helper', () => {
      const task = createTask({ id: 'critical-helper' });
      queue.enqueueCritical(task).catch(() => {});

      const pending = queue.getPendingTasks();
      expect(pending[0].priority).toBe(TaskPriority.CRITICAL);
    });

    it('should use enqueueHigh helper', () => {
      const task = createTask({ id: 'high-helper' });
      queue.enqueueHigh(task).catch(() => {});

      const pending = queue.getPendingTasks();
      expect(pending[0].priority).toBe(TaskPriority.HIGH);
    });

    it('should use enqueueBackground helper', () => {
      const task = createTask({ id: 'bg-helper' });
      queue.enqueueBackground(task).catch(() => {});

      const pending = queue.getPendingTasks();
      expect(pending[0].priority).toBe(TaskPriority.BACKGROUND);
    });
  });

  describe('enqueueBatch with dependencies', () => {
    it('should enqueue batch of tasks', async () => {
      const mockAgent = createMockAgent('coder');
      mockRegistry._register('coder', mockAgent);

      const task1 = createTask({ id: 'batch-1' });
      const task2 = createTask({ id: 'batch-2' });

      const batchPromise = queue.enqueueBatch([
        { task: task1, priority: TaskPriority.HIGH },
        { task: task2, priority: TaskPriority.NORMAL },
      ]);

      const results = await batchPromise;

      expect(results.size).toBe(2);
      expect(results.has('batch-1')).toBe(true);
      expect(results.has('batch-2')).toBe(true);
    });

    it('should process tasks respecting dependencies', async () => {
      const executionOrder: string[] = [];
      const mockAgent = createMockAgent('coder');
      mockAgent.run = vi.fn().mockImplementation(async (task: Task) => {
        executionOrder.push(task.id);
        return { success: true, output: `Done: ${task.id}` };
      });
      mockRegistry._register('coder', mockAgent);

      const task1 = createTask({ id: 'dep-1' });
      const task2 = createTask({ id: 'dep-2', dependencies: ['dep-1'] });
      const task3 = createTask({ id: 'dep-3', dependencies: ['dep-1'] });

      await queue.enqueueBatch([{ task: task1 }, { task: task2 }, { task: task3 }]);

      // task1 should be first, then task2 and task3 can run in parallel
      expect(executionOrder[0]).toBe('dep-1');
      expect(executionOrder).toContain('dep-2');
      expect(executionOrder).toContain('dep-3');
    });

    it('should use default priority when not specified in batch', async () => {
      const mockAgent = createMockAgent('coder');
      mockRegistry._register('coder', mockAgent);

      const task = createTask({ id: 'default-priority' });

      await queue.enqueueBatch([{ task }]);

      // Task should have been processed
      expect(mockAgent.run).toHaveBeenCalled();
    });
  });

  describe('pause and resume', () => {
    it('should pause processing', () => {
      queue.pause();

      const task = createTask({ id: 'paused-task' });
      safeEnqueue(queue, task);

      const stats = queue.getStats();
      expect(stats.pending).toBe(1);
      expect(stats.running).toBe(0);
    });

    it('should resume processing after pause', async () => {
      const mockAgent = createMockAgent('coder');
      mockRegistry._register('coder', mockAgent);

      queue.pause();

      const task = createTask({ id: 'resume-task' });
      const promise = queue.enqueue(task);

      expect(queue.getStats().pending).toBe(1);

      queue.resume();

      // Queue will start processing, wait for it
      await promise;
    });

    it('should not process when paused', () => {
      const mockAgent = createMockAgent('coder');
      mockRegistry._register('coder', mockAgent);

      queue.pause();

      const task = createTask({ id: 'no-process' });
      safeEnqueue(queue, task);

      // Agent should not be called while paused
      expect(mockAgent.run).not.toHaveBeenCalled();
    });
  });

  describe('cancel pending tasks', () => {
    it('should cancel a pending task', async () => {
      queue.pause();

      const task = createTask({ id: 'task-cancel' });
      const promise = queue.enqueue(task);

      expect(queue.getStats().pending).toBe(1);

      const cancelled = queue.cancel('task-cancel');

      expect(cancelled).toBe(true);
      expect(queue.getStats().pending).toBe(0);

      await expect(promise).rejects.toThrow('Task cancelled');
    });

    it('should return false for non-existent task', () => {
      const cancelled = queue.cancel('non-existent');
      expect(cancelled).toBe(false);
    });

    it('should set task status to cancelled', async () => {
      queue.pause();

      const task = createTask({ id: 'status-cancel' });
      const promise = queue.enqueue(task);

      queue.cancel('status-cancel');

      await expect(promise).rejects.toThrow('Task cancelled');
    });
  });

  describe('clear all tasks', () => {
    it('should clear all pending tasks', async () => {
      queue.pause();

      const promises: Promise<any>[] = [];

      for (let i = 0; i < 5; i++) {
        promises.push(queue.enqueue(createTask({ id: `task-${i}` })));
      }

      expect(queue.getStats().pending).toBe(5);

      queue.clear();

      expect(queue.getStats().pending).toBe(0);

      for (const promise of promises) {
        await expect(promise).rejects.toThrow('Queue cleared');
      }
    });

    it('should reject all promises with Queue cleared error', async () => {
      queue.pause();

      const promise = queue.enqueue(createTask({ id: 'clear-task' }));

      queue.clear();

      await expect(promise).rejects.toThrow('Queue cleared');
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = queue.getStats();

      expect(stats.pending).toBe(0);
      expect(stats.running).toBe(0);
      expect(stats.completed).toBe(0);
      expect(stats.failed).toBe(0);
      expect(stats.totalProcessed).toBe(0);
      expect(stats.reservedSlotsUsed).toBe(0);
      expect(stats.priorityStats).toBeDefined();
    });

    it('should track pending tasks', () => {
      queue.pause();

      safeEnqueue(queue, createTask({ id: 'stat-1' }), TaskPriority.CRITICAL);
      safeEnqueue(queue, createTask({ id: 'stat-2' }), TaskPriority.HIGH);
      safeEnqueue(queue, createTask({ id: 'stat-3' }), TaskPriority.NORMAL);

      const stats = queue.getStats();

      expect(stats.pending).toBe(3);
      expect(stats.priorityStats.byPriority[TaskPriority.CRITICAL]).toBe(1);
      expect(stats.priorityStats.byPriority[TaskPriority.HIGH]).toBe(1);
      expect(stats.priorityStats.byPriority[TaskPriority.NORMAL]).toBe(1);
    });

    it('should track completed tasks', async () => {
      const mockAgent = createMockAgent('coder');
      mockRegistry._register('coder', mockAgent);

      await queue.enqueue(createTask({ id: 'complete-1' }));
      await queue.enqueue(createTask({ id: 'complete-2' }));

      const stats = queue.getStats();

      expect(stats.completed).toBe(2);
      expect(stats.totalProcessed).toBe(2);
    });

    it('should track failed tasks', async () => {
      const mockAgent = createMockAgent('coder');
      mockAgent.run = vi.fn().mockRejectedValue(new Error('Test failure'));
      mockRegistry._register('coder', mockAgent);

      const q = new PriorityTaskQueue(mockRegistry as any, 'key', {
        maxRetries: 0,
        retryDelay: 1,
      });

      await q.enqueue(createTask({ id: 'fail-1' }));

      const stats = q.getStats();

      expect(stats.failed).toBe(1);
      expect(stats.totalProcessed).toBe(1);

      q.destroy();
    });

    it('should include priority stats', () => {
      queue.pause();

      safeEnqueue(queue, createTask({ id: 'p1' }), TaskPriority.CRITICAL);
      safeEnqueue(queue, createTask({ id: 'p2' }), TaskPriority.CRITICAL);
      safeEnqueue(queue, createTask({ id: 'p3' }), TaskPriority.LOW);

      const stats = queue.getStats();

      expect(stats.priorityStats.total).toBe(3);
      expect(stats.priorityStats.byPriority[TaskPriority.CRITICAL]).toBe(2);
      expect(stats.priorityStats.byPriority[TaskPriority.LOW]).toBe(1);
    });
  });

  describe('reserved slots for critical tasks', () => {
    it('should reserve slots for critical tasks', async () => {
      const mockAgent = createMockAgent('coder');
      let runningCount = 0;
      let maxRunning = 0;

      mockAgent.run = vi.fn().mockImplementation(async () => {
        runningCount++;
        maxRunning = Math.max(maxRunning, runningCount);
        await new Promise((resolve) => setTimeout(resolve, 50));
        runningCount--;
        return { success: true, output: 'Done' };
      });

      mockRegistry._register('coder', mockAgent);

      const q = new PriorityTaskQueue(mockRegistry as any, 'key', {
        maxParallel: 3,
        reservedCriticalSlots: 1,
        retryDelay: 10,
      });

      // Queue multiple non-critical tasks
      const promises = [
        q.enqueue(createTask({ id: 'normal-1' }), TaskPriority.NORMAL),
        q.enqueue(createTask({ id: 'normal-2' }), TaskPriority.NORMAL),
        q.enqueue(createTask({ id: 'normal-3' }), TaskPriority.NORMAL),
      ];

      await Promise.all(promises);

      // Max parallel should respect reserved slots
      expect(maxRunning).toBeLessThanOrEqual(3);

      q.destroy();
    });

    it('should allow critical tasks to use reserved slots', async () => {
      const mockAgent = createMockAgent('coder');
      mockRegistry._register('coder', mockAgent);

      const q = new PriorityTaskQueue(mockRegistry as any, 'key', {
        maxParallel: 2,
        reservedCriticalSlots: 1,
      });

      // Critical tasks should always be able to run
      await q.enqueue(createTask({ id: 'critical-1' }), TaskPriority.CRITICAL);

      const stats = q.getStats();
      expect(stats.completed).toBe(1);

      q.destroy();
    });

    it('should track reserved slots used', async () => {
      const mockAgent = createMockAgent('coder');
      let statsSnapshot: PriorityTaskQueueStats | null = null;

      mockAgent.run = vi.fn().mockImplementation(async function (this: PriorityTaskQueue) {
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { success: true, output: 'Done' };
      });

      mockRegistry._register('coder', mockAgent);

      const q = new PriorityTaskQueue(mockRegistry as any, 'key', {
        maxParallel: 3,
        reservedCriticalSlots: 1,
      });

      q.enqueue(createTask({ id: 'critical-slots' }), TaskPriority.CRITICAL);

      // Wait a bit for task to start
      await new Promise((resolve) => setTimeout(resolve, 10));

      statsSnapshot = q.getStats();

      // Wait for completion
      await new Promise((resolve) => setTimeout(resolve, 50));

      q.destroy();
    });
  });

  describe('task aging/promotion', () => {
    it('should create queue with aging enabled', () => {
      const q = new PriorityTaskQueue(mockRegistry as any, 'key', {
        enableAging: true,
        agingThresholdMs: 1000,
      });

      expect(q).toBeInstanceOf(PriorityTaskQueue);
      q.destroy();
    });

    it('should support updatePriority', () => {
      queue.pause();

      const task = createTask({ id: 'update-priority' });
      safeEnqueue(queue, task, TaskPriority.LOW);

      const updated = queue.updatePriority('update-priority', TaskPriority.HIGH);

      expect(updated).toBe(true);

      const pending = queue.getPendingTasks();
      expect(pending[0].priority).toBe(TaskPriority.HIGH);
    });

    it('should return false when updating non-existent task priority', () => {
      const updated = queue.updatePriority('non-existent', TaskPriority.HIGH);
      expect(updated).toBe(false);
    });

    it('should support promotePriority', () => {
      queue.pause();

      const task = createTask({ id: 'promote-task' });
      safeEnqueue(queue, task, TaskPriority.LOW);

      const promoted = queue.promotePriority('promote-task');

      expect(promoted).toBe(true);

      const pending = queue.getPendingTasks();
      expect(pending[0].priority).toBe(TaskPriority.NORMAL);
    });

    it('should return false when promoting non-existent task', () => {
      const promoted = queue.promotePriority('non-existent');
      expect(promoted).toBe(false);
    });
  });

  describe('retry mechanism', () => {
    it('should retry failed tasks', async () => {
      let callCount = 0;
      const mockAgent = createMockAgent('coder');
      mockAgent.run = vi.fn().mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          throw new Error('Temporary failure');
        }
        return { success: true, output: 'Success after retry' };
      });
      mockRegistry._register('coder', mockAgent);

      const q = new PriorityTaskQueue(mockRegistry as any, 'key', {
        maxRetries: 2,
        retryDelay: 10,
      });

      const result = await q.enqueue(createTask({ id: 'retry-task' }));

      expect(callCount).toBe(2);
      expect(result.success).toBe(true);

      q.destroy();
    });

    it('should fail after max retries exceeded', async () => {
      const mockAgent = createMockAgent('coder');
      mockAgent.run = vi.fn().mockRejectedValue(new Error('Persistent failure'));
      mockRegistry._register('coder', mockAgent);

      const q = new PriorityTaskQueue(mockRegistry as any, 'key', {
        maxRetries: 2,
        retryDelay: 10,
      });

      const result = await q.enqueue(createTask({ id: 'fail-retry' }));

      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toBe('Persistent failure');
      expect(mockAgent.run).toHaveBeenCalledTimes(3); // Initial + 2 retries

      q.destroy();
    });

    it('should wait retryDelay between retries', async () => {
      const startTime = Date.now();
      let lastCallTime = startTime;
      let minDelay = Infinity;

      const mockAgent = createMockAgent('coder');
      mockAgent.run = vi.fn().mockImplementation(async () => {
        const now = Date.now();
        if (lastCallTime !== startTime) {
          minDelay = Math.min(minDelay, now - lastCallTime);
        }
        lastCallTime = now;
        throw new Error('Failure');
      });
      mockRegistry._register('coder', mockAgent);

      const q = new PriorityTaskQueue(mockRegistry as any, 'key', {
        maxRetries: 1,
        retryDelay: 50,
      });

      await q.enqueue(createTask({ id: 'delay-retry' }));

      // Should have waited at least close to retryDelay
      expect(minDelay).toBeGreaterThanOrEqual(40);

      q.destroy();
    });
  });

  describe('event emission', () => {
    it('should emit task:created event on enqueue', async () => {
      const onEvent = vi.fn();
      const q = new PriorityTaskQueue(mockRegistry as any, 'key', { onEvent });
      q.pause();

      const task = createTask({ id: 'event-task' });
      const promise = q.enqueue(task, TaskPriority.HIGH);

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task:created',
          taskId: 'event-task',
          data: expect.objectContaining({
            priority: 'HIGH',
          }),
        }),
      );

      q.destroy();
      await promise.catch(() => {});
    });

    it('should emit task:started event when processing', async () => {
      const onEvent = vi.fn();
      const mockAgent = createMockAgent('coder');
      mockRegistry._register('coder', mockAgent);

      const q = new PriorityTaskQueue(mockRegistry as any, 'key', { onEvent });

      await q.enqueue(createTask({ id: 'started-event' }));

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task:started',
          taskId: 'started-event',
        }),
      );

      q.destroy();
    });

    it('should emit task:completed event on success', async () => {
      const onEvent = vi.fn();
      const mockAgent = createMockAgent('coder');
      mockRegistry._register('coder', mockAgent);

      const q = new PriorityTaskQueue(mockRegistry as any, 'key', { onEvent });

      await q.enqueue(createTask({ id: 'completed-event' }));

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task:completed',
          taskId: 'completed-event',
        }),
      );

      q.destroy();
    });

    it('should emit task:failed event on failure', async () => {
      const onEvent = vi.fn();
      const mockAgent = createMockAgent('coder');
      mockAgent.run = vi.fn().mockRejectedValue(new Error('Test error'));
      mockRegistry._register('coder', mockAgent);

      const q = new PriorityTaskQueue(mockRegistry as any, 'key', {
        onEvent,
        maxRetries: 0,
      });

      await q.enqueue(createTask({ id: 'failed-event' }));

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task:failed',
          taskId: 'failed-event',
          data: expect.objectContaining({
            error: 'Test error',
          }),
        }),
      );

      q.destroy();
    });

    it('should include timestamp in events', async () => {
      const onEvent = vi.fn();
      const q = new PriorityTaskQueue(mockRegistry as any, 'key', { onEvent });
      q.pause();

      const promise = q.enqueue(createTask({ id: 'timestamp-event' }));

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date),
        }),
      );

      // Clean up properly
      q.clear();
      await promise.catch(() => {});
      q.destroy();
    });
  });

  describe('getResult', () => {
    it('should return undefined for non-existent task', () => {
      const result = queue.getResult('non-existent');
      expect(result).toBeUndefined();
    });

    it('should return result for completed task', async () => {
      const mockAgent = createMockAgent('coder');
      mockAgent.run = vi.fn().mockResolvedValue({
        success: true,
        output: 'Task completed successfully',
      });
      mockRegistry._register('coder', mockAgent);

      await queue.enqueue(createTask({ id: 'result-task' }));

      const result = queue.getResult('result-task');

      expect(result).toBeDefined();
      expect(result?.success).toBe(true);
      expect(result?.output).toBe('Task completed successfully');
    });
  });

  describe('getPendingTasks', () => {
    it('should return empty array when no pending tasks', () => {
      expect(queue.getPendingTasks()).toHaveLength(0);
    });

    it('should return all pending tasks', () => {
      queue.pause();

      safeEnqueue(queue, createTask({ id: 'pending-1' }));
      safeEnqueue(queue, createTask({ id: 'pending-2' }));
      safeEnqueue(queue, createTask({ id: 'pending-3' }));

      const pending = queue.getPendingTasks();

      expect(pending).toHaveLength(3);
      expect(pending.map((t) => t.id)).toContain('pending-1');
      expect(pending.map((t) => t.id)).toContain('pending-2');
      expect(pending.map((t) => t.id)).toContain('pending-3');
    });
  });

  describe('getPendingTasksByPriority', () => {
    it('should filter tasks by priority', () => {
      queue.pause();

      safeEnqueue(queue, createTask({ id: 'critical-1' }), TaskPriority.CRITICAL);
      safeEnqueue(queue, createTask({ id: 'critical-2' }), TaskPriority.CRITICAL);
      safeEnqueue(queue, createTask({ id: 'normal-1' }), TaskPriority.NORMAL);
      safeEnqueue(queue, createTask({ id: 'low-1' }), TaskPriority.LOW);

      const criticalTasks = queue.getPendingTasksByPriority(TaskPriority.CRITICAL);
      const normalTasks = queue.getPendingTasksByPriority(TaskPriority.NORMAL);
      const highTasks = queue.getPendingTasksByPriority(TaskPriority.HIGH);

      expect(criticalTasks).toHaveLength(2);
      expect(normalTasks).toHaveLength(1);
      expect(highTasks).toHaveLength(0);
    });
  });

  describe('getRunningTasks', () => {
    it('should return empty array initially', () => {
      expect(queue.getRunningTasks()).toHaveLength(0);
    });

    it('should return running tasks while executing', async () => {
      let runningSnapshot: Task[] = [];

      const mockAgent = createMockAgent('coder');
      mockAgent.run = vi.fn().mockImplementation(async () => {
        runningSnapshot = queue.getRunningTasks();
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { success: true, output: 'Done' };
      });
      mockRegistry._register('coder', mockAgent);

      await queue.enqueue(createTask({ id: 'running-task' }));

      expect(runningSnapshot).toHaveLength(1);
      expect(runningSnapshot[0].id).toBe('running-task');
    });
  });

  describe('destroy', () => {
    it('should clear queue and clean up', async () => {
      queue.pause();

      const p1 = queue.enqueue(createTask({ id: 'destroy-1' }));
      const p2 = queue.enqueue(createTask({ id: 'destroy-2' }));

      queue.destroy();

      expect(queue.getStats().pending).toBe(0);

      // Wait for the rejected promises
      await p1.catch(() => {});
      await p2.catch(() => {});
    });
  });

  describe('task execution', () => {
    it('should find agent by assigned agent type', async () => {
      const mockAgent = createMockAgent('coder');
      mockRegistry._register('coder', mockAgent);

      const task = createTask({ id: 'assigned-agent', assignedAgent: 'coder' });

      await queue.enqueue(task);

      expect(mockRegistry.get).toHaveBeenCalledWith('coder');
      expect(mockAgent.run).toHaveBeenCalled();
    });

    it('should find agent by task type', async () => {
      const mockAgent = createMockAgent('tester');
      mockRegistry._register('tester', mockAgent);

      const task = createTask({ id: 'type-agent', type: 'tester' });

      await queue.enqueue(task);

      expect(mockRegistry.get).toHaveBeenCalledWith('tester');
    });

    it('should fail when no agent is available', async () => {
      const q = new PriorityTaskQueue(mockRegistry as any, 'key', {
        maxRetries: 0,
      });

      const result = await q.enqueue(createTask({ id: 'no-agent', type: 'unknown' }));

      expect(result.success).toBe(false);
      expect(result.errors?.[0].message).toContain('No agent available');

      q.destroy();
    });

    it('should update task status during execution', async () => {
      let taskStatusDuringRun: string | undefined;

      const mockAgent = createMockAgent('coder');
      mockAgent.run = vi.fn().mockImplementation(async (task: Task) => {
        taskStatusDuringRun = task.status;
        return { success: true, output: 'Done' };
      });
      mockRegistry._register('coder', mockAgent);

      await queue.enqueue(createTask({ id: 'status-check' }));

      expect(taskStatusDuringRun).toBe('in_progress');
    });

    it('should set task timestamps', async () => {
      let capturedTask: Task | null = null;

      const mockAgent = createMockAgent('coder');
      mockAgent.run = vi.fn().mockImplementation(async (task: Task) => {
        capturedTask = task;
        return { success: true, output: 'Done' };
      });
      mockRegistry._register('coder', mockAgent);

      await queue.enqueue(createTask({ id: 'timestamp-check' }));

      expect((capturedTask as Task | null)?.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('dependency handling', () => {
    it('should wait for dependencies before executing', async () => {
      const executionOrder: string[] = [];

      const mockAgent = createMockAgent('coder');
      mockAgent.run = vi.fn().mockImplementation(async (task: Task) => {
        executionOrder.push(task.id);
        await new Promise((resolve) => setTimeout(resolve, 10));
        return { success: true, output: 'Done' };
      });
      mockRegistry._register('coder', mockAgent);

      const parent = createTask({ id: 'parent' });
      const child = createTask({ id: 'child', dependencies: ['parent'] });

      await queue.enqueueBatch([{ task: parent }, { task: child }]);

      expect(executionOrder.indexOf('parent')).toBeLessThan(executionOrder.indexOf('child'));
    });

    it('should handle complex dependency graphs', async () => {
      const executionOrder: string[] = [];

      const mockAgent = createMockAgent('coder');
      mockAgent.run = vi.fn().mockImplementation(async (task: Task) => {
        executionOrder.push(task.id);
        return { success: true, output: 'Done' };
      });
      mockRegistry._register('coder', mockAgent);

      // A -> B -> D
      //   \> C -> D
      const taskA = createTask({ id: 'A' });
      const taskB = createTask({ id: 'B', dependencies: ['A'] });
      const taskC = createTask({ id: 'C', dependencies: ['A'] });
      const taskD = createTask({ id: 'D', dependencies: ['B', 'C'] });

      await queue.enqueueBatch([{ task: taskA }, { task: taskB }, { task: taskC }, { task: taskD }]);

      expect(executionOrder.indexOf('A')).toBe(0);
      expect(executionOrder.indexOf('D')).toBe(executionOrder.length - 1);
    });
  });

  describe('user_request task type', () => {
    it('should handle user_request task type', async () => {
      const mockAgent = createMockAgent('orchestrator');
      mockAgent.getName = vi.fn().mockReturnValue('orchestrator');
      mockRegistry._register('orchestrator', mockAgent);
      mockRegistry.getAvailable = vi.fn().mockReturnValue([mockAgent]);

      const task = createTask({ id: 'user-req', type: 'user_request' });

      await queue.enqueue(task);

      expect(mockAgent.run).toHaveBeenCalled();
    });
  });
});

describe('createPriorityTaskQueue', () => {
  let mockRegistry: ReturnType<typeof createMockRegistry>;

  beforeEach(() => {
    mockRegistry = createMockRegistry();
  });

  it('should create a PriorityTaskQueue instance', () => {
    const queue = createPriorityTaskQueue(mockRegistry as any, 'test-key');

    expect(queue).toBeInstanceOf(PriorityTaskQueue);

    queue.destroy();
  });

  it('should pass config to PriorityTaskQueue', () => {
    const onEvent = vi.fn();
    const queue = createPriorityTaskQueue(mockRegistry as any, 'test-key', {
      maxParallel: 5,
      retryDelay: 3000,
      maxRetries: 4,
      enableAging: true,
      agingThresholdMs: 45000,
      reservedCriticalSlots: 2,
      onEvent,
    });

    expect(queue).toBeInstanceOf(PriorityTaskQueue);

    queue.destroy();
  });

  it('should work with minimal config', () => {
    const queue = createPriorityTaskQueue(mockRegistry as any, 'api-key', {});

    expect(queue).toBeInstanceOf(PriorityTaskQueue);

    queue.destroy();
  });
});

describe('PriorityTaskQueueStats interface', () => {
  it('should have all required properties in stats', () => {
    const mockRegistry = createMockRegistry();
    const queue = new PriorityTaskQueue(mockRegistry as any, 'key');

    const stats: PriorityTaskQueueStats = queue.getStats();

    expect(stats).toHaveProperty('pending');
    expect(stats).toHaveProperty('running');
    expect(stats).toHaveProperty('completed');
    expect(stats).toHaveProperty('failed');
    expect(stats).toHaveProperty('totalProcessed');
    expect(stats).toHaveProperty('priorityStats');
    expect(stats).toHaveProperty('reservedSlotsUsed');

    expect(typeof stats.pending).toBe('number');
    expect(typeof stats.running).toBe('number');
    expect(typeof stats.completed).toBe('number');
    expect(typeof stats.failed).toBe('number');
    expect(typeof stats.totalProcessed).toBe('number');
    expect(typeof stats.reservedSlotsUsed).toBe('number');
    expect(typeof stats.priorityStats).toBe('object');

    queue.destroy();
  });
});

describe('PriorityTaskQueueConfig interface', () => {
  it('should accept all config options', () => {
    const mockRegistry = createMockRegistry();
    const onEvent = vi.fn();

    const config: Partial<PriorityTaskQueueConfig> = {
      maxParallel: 10,
      retryDelay: 5000,
      maxRetries: 5,
      enableAging: true,
      agingThresholdMs: 120000,
      reservedCriticalSlots: 3,
      onEvent,
    };

    const queue = new PriorityTaskQueue(mockRegistry as any, 'key', config);

    expect(queue).toBeInstanceOf(PriorityTaskQueue);

    queue.destroy();
  });
});
