/**
 * Tests for TaskQueue - Unit tests without async complexity
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskQueue, createTaskQueue } from './task-queue';
import type { Task } from '../types';

// Mock dependencies
vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
  }),
}));

// Mock AgentRegistry
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

describe('TaskQueue', () => {
  let mockRegistry: ReturnType<typeof createMockRegistry>;
  let queue: TaskQueue;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistry = createMockRegistry();
    queue = new TaskQueue(mockRegistry as any, 'test-api-key', {
      maxParallel: 2,
      retryDelay: 10,
      maxRetries: 1,
    });
  });

  describe('constructor', () => {
    it('should create queue with default config', () => {
      const q = new TaskQueue(mockRegistry as any, 'key');
      expect(q).toBeInstanceOf(TaskQueue);
    });

    it('should create queue with custom config', () => {
      const onEvent = vi.fn();
      const q = new TaskQueue(mockRegistry as any, 'key', {
        maxParallel: 5,
        retryDelay: 2000,
        maxRetries: 3,
        onEvent,
      });

      expect(q).toBeInstanceOf(TaskQueue);
    });
  });

  describe('getStats', () => {
    it('should return initial stats', () => {
      const stats = queue.getStats();

      expect(stats).toEqual({
        pending: 0,
        running: 0,
        completed: 0,
        failed: 0,
        totalProcessed: 0,
      });
    });
  });

  describe('pause and resume', () => {
    it('should pause processing', () => {
      queue.pause();

      const task: Task = {
        id: 'task-1',
        type: 'coder',
        prompt: 'Test',
        status: 'pending',
        createdAt: new Date(),
      };

      queue.enqueue(task);

      const stats = queue.getStats();
      expect(stats.pending).toBe(1);
      expect(stats.running).toBe(0);
    });

    it('should resume processing after pause', () => {
      queue.pause();

      const task: Task = {
        id: 'task-1',
        type: 'coder',
        prompt: 'Test',
        status: 'pending',
        createdAt: new Date(),
      };

      queue.enqueue(task);
      expect(queue.getStats().pending).toBe(1);

      queue.resume();

      // Queue will try to process but no agent is available
    });
  });

  describe('cancel', () => {
    it('should cancel a pending task', async () => {
      queue.pause();

      const task: Task = {
        id: 'task-cancel',
        type: 'coder',
        prompt: 'Test',
        status: 'pending',
        createdAt: new Date(),
      };

      const promise = queue.enqueue(task);
      expect(queue.getStats().pending).toBe(1);

      const cancelled = queue.cancel('task-cancel');

      expect(cancelled).toBe(true);
      expect(queue.getStats().pending).toBe(0);

      // Catch the expected rejection
      await expect(promise).rejects.toThrow('Task cancelled');
    });

    it('should return false for non-existent task', () => {
      const cancelled = queue.cancel('non-existent');
      expect(cancelled).toBe(false);
    });
  });

  describe('clear', () => {
    it('should clear all pending tasks', async () => {
      queue.pause();

      const promises: Promise<any>[] = [];

      for (let i = 0; i < 5; i++) {
        promises.push(
          queue.enqueue({
            id: `task-${i}`,
            type: 'coder',
            prompt: 'Test',
            status: 'pending',
            createdAt: new Date(),
          }),
        );
      }

      expect(queue.getStats().pending).toBe(5);

      queue.clear();

      expect(queue.getStats().pending).toBe(0);

      // All promises should reject with "Queue cleared"
      for (const promise of promises) {
        await expect(promise).rejects.toThrow('Queue cleared');
      }
    });
  });

  describe('getResult', () => {
    it('should return undefined for non-existent task', () => {
      const result = queue.getResult('non-existent');
      expect(result).toBeUndefined();
    });
  });

  describe('getPendingTasks', () => {
    it('should return pending tasks', () => {
      queue.pause();

      queue.enqueue({
        id: 'task-1',
        type: 'coder',
        prompt: 'Test 1',
        status: 'pending',
        createdAt: new Date(),
      });

      queue.enqueue({
        id: 'task-2',
        type: 'coder',
        prompt: 'Test 2',
        status: 'pending',
        createdAt: new Date(),
      });

      const pending = queue.getPendingTasks();

      expect(pending).toHaveLength(2);
      expect(pending.map((t) => t.id)).toEqual(['task-1', 'task-2']);
    });
  });

  describe('getRunningTasks', () => {
    it('should return empty array initially', () => {
      expect(queue.getRunningTasks()).toHaveLength(0);
    });
  });

  describe('enqueue with events', () => {
    it('should emit task:created event', () => {
      const onEvent = vi.fn();
      const q = new TaskQueue(mockRegistry as any, 'key', { onEvent });
      q.pause();

      const task: Task = {
        id: 'task-1',
        type: 'coder',
        prompt: 'Test',
        status: 'pending',
        createdAt: new Date(),
      };

      q.enqueue(task);

      expect(onEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'task:created',
          taskId: 'task-1',
        }),
      );
    });
  });
});

describe('createTaskQueue', () => {
  it('should create a TaskQueue instance', () => {
    const mockRegistry = createMockRegistry();
    const queue = createTaskQueue(mockRegistry as any, 'test-key');

    expect(queue).toBeInstanceOf(TaskQueue);
  });

  it('should pass config to TaskQueue', () => {
    const mockRegistry = createMockRegistry();
    const onEvent = vi.fn();
    const queue = createTaskQueue(mockRegistry as any, 'test-key', {
      maxParallel: 5,
      onEvent,
    });

    expect(queue).toBeInstanceOf(TaskQueue);
  });
});
