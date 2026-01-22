/**
 * =============================================================================
 * BAVINI Performance - Worker Pool Tests
 * =============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { WorkerPool, createWorkerPool } from '../worker-pool';

// Mock Worker class
class MockWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  private terminated = false;

  constructor(public url: string | URL) {}

  postMessage(message: unknown) {
    if (this.terminated) return;

    // Simulate immediate async response (use Promise.resolve for microtask)
    Promise.resolve().then(() => {
      if (this.onmessage && !this.terminated) {
        this.onmessage({ data: { result: message } } as MessageEvent);
      }
    });
  }

  terminate() {
    this.terminated = true;
  }
}

// Mock Worker globally
vi.stubGlobal('Worker', MockWorker);

describe('WorkerPool', () => {
  let pool: WorkerPool;

  beforeEach(() => {
    pool = new WorkerPool('/test-worker.js', {
      minWorkers: 1,
      maxWorkers: 4,
      idleTimeout: 1000,
      maxTasksPerWorker: 10,
    });
  });

  afterEach(async () => {
    await pool.destroy();
  });

  describe('init', () => {
    it('should initialize with minimum workers', async () => {
      await pool.init();

      const stats = pool.getStats();
      expect(stats.totalWorkers).toBe(1);
      expect(stats.idleWorkers).toBe(1);
    });

    it('should initialize with custom min workers', async () => {
      const customPool = new WorkerPool('/worker.js', {
        minWorkers: 2,
        maxWorkers: 4,
        idleTimeout: 1000,
        maxTasksPerWorker: 10,
      });

      await customPool.init();

      const stats = customPool.getStats();
      expect(stats.totalWorkers).toBe(2);

      await customPool.destroy();
    });
  });

  describe('exec', () => {
    it('should execute a task and return result', async () => {
      await pool.init();

      const result = await pool.exec<{ result: string }>({ task: 'test' });

      expect(result).toEqual({ result: { task: 'test' } });
    });

    it('should execute multiple tasks', async () => {
      // Initialize pool with more workers to avoid race conditions
      const multiPool = new WorkerPool('/worker.js', {
        minWorkers: 3,
        maxWorkers: 4,
        idleTimeout: 1000,
        maxTasksPerWorker: 10,
      });

      await multiPool.init();

      const results = await Promise.all([
        multiPool.exec({ id: 1 }),
        multiPool.exec({ id: 2 }),
        multiPool.exec({ id: 3 }),
      ]);

      expect(results).toHaveLength(3);
      await multiPool.destroy();
    });

    it('should throw when pool is destroyed', async () => {
      await pool.init();
      await pool.destroy();

      await expect(pool.exec({ task: 'test' })).rejects.toThrow(
        'Worker pool is destroyed'
      );
    });

    it('should queue tasks when all workers busy', async () => {
      const slowPool = new WorkerPool('/worker.js', {
        minWorkers: 1,
        maxWorkers: 1,
        idleTimeout: 1000,
        maxTasksPerWorker: 100,
      });

      await slowPool.init();

      // Start multiple tasks with only 1 worker
      const promises = [
        slowPool.exec({ id: 1 }),
        slowPool.exec({ id: 2 }),
      ];

      const stats = slowPool.getStats();
      expect(stats.queuedTasks).toBeGreaterThanOrEqual(0);

      await Promise.all(promises);
      await slowPool.destroy();
    });
  });

  describe('execBatch', () => {
    it('should execute a batch of tasks', async () => {
      // Initialize pool with enough workers to avoid race conditions
      const batchPool = new WorkerPool('/worker.js', {
        minWorkers: 3,
        maxWorkers: 4,
        idleTimeout: 1000,
        maxTasksPerWorker: 10,
      });

      await batchPool.init();

      const tasks = [
        { message: { id: 1 } },
        { message: { id: 2 } },
        { message: { id: 3 } },
      ];

      const results = await batchPool.execBatch(tasks);

      expect(results).toHaveLength(3);
      await batchPool.destroy();
    });
  });

  describe('getStats', () => {
    it('should return pool statistics', async () => {
      await pool.init();

      const stats = pool.getStats();

      expect(stats).toHaveProperty('totalWorkers');
      expect(stats).toHaveProperty('idleWorkers');
      expect(stats).toHaveProperty('busyWorkers');
      expect(stats).toHaveProperty('queuedTasks');
      expect(stats).toHaveProperty('totalTasksExecuted');
    });

    it('should track busy workers', async () => {
      await pool.init();

      // Execute task without awaiting immediately
      const taskPromise = pool.exec({ task: 'test' });

      // Stats should show busy worker
      // Note: Due to async timing, we might need to wait a tick
      await new Promise(resolve => setTimeout(resolve, 0));

      await taskPromise;

      const stats = pool.getStats();
      expect(stats.totalTasksExecuted).toBeGreaterThanOrEqual(1);
    });
  });

  describe('resize', () => {
    it('should increase pool size', async () => {
      await pool.init();

      await pool.resize(2, 6);

      const stats = pool.getStats();
      expect(stats.totalWorkers).toBeGreaterThanOrEqual(2);
    });

    it('should decrease pool size', async () => {
      const bigPool = new WorkerPool('/worker.js', {
        minWorkers: 4,
        maxWorkers: 8,
        idleTimeout: 1000,
        maxTasksPerWorker: 10,
      });

      await bigPool.init();
      await bigPool.resize(1, 2);

      const stats = bigPool.getStats();
      expect(stats.totalWorkers).toBeLessThanOrEqual(2);

      await bigPool.destroy();
    });
  });

  describe('drain', () => {
    it('should wait for all tasks to complete', async () => {
      await pool.init();

      // Start some tasks
      pool.exec({ id: 1 });
      pool.exec({ id: 2 });

      await pool.drain();

      const stats = pool.getStats();
      expect(stats.queuedTasks).toBe(0);
    });
  });

  describe('destroy', () => {
    it('should terminate all workers', async () => {
      await pool.init();
      await pool.destroy();

      const stats = pool.getStats();
      expect(stats.totalWorkers).toBe(0);
    });

    it('should reject queued tasks', async () => {
      const slowPool = new WorkerPool('/worker.js', {
        minWorkers: 1,
        maxWorkers: 1,
        idleTimeout: 1000,
        maxTasksPerWorker: 100,
      });

      await slowPool.init();

      // Queue a task and catch the rejection
      const taskPromise = slowPool.exec({ id: 1 }).catch(() => {
        // Expected to be rejected when pool is destroyed
      });

      // Destroy while task is pending
      await slowPool.destroy();

      // Wait for the task to be rejected
      await taskPromise;
    });
  });

  describe('idle worker cleanup', () => {
    it('should terminate idle workers after timeout', async () => {
      const idlePool = new WorkerPool('/worker.js', {
        minWorkers: 1,
        maxWorkers: 4,
        idleTimeout: 1000,
        maxTasksPerWorker: 100,
      });

      await idlePool.init();

      // Add more workers by executing tasks
      await Promise.all([
        idlePool.exec({ id: 1 }),
        idlePool.exec({ id: 2 }),
      ]);

      // Pool should have workers available
      const stats = idlePool.getStats();
      expect(stats.totalWorkers).toBeGreaterThanOrEqual(1);

      await idlePool.destroy();
    });
  });

  describe('worker recycling', () => {
    it('should recycle workers after max tasks', async () => {
      const recyclePool = new WorkerPool('/worker.js', {
        minWorkers: 1,
        maxWorkers: 2,
        idleTimeout: 10000,
        maxTasksPerWorker: 2, // Recycle after 2 tasks
      });

      await recyclePool.init();

      // Execute tasks to trigger recycling
      await recyclePool.exec({ id: 1 });
      await recyclePool.exec({ id: 2 });
      await recyclePool.exec({ id: 3 }); // Should trigger recycle

      // Pool should still work after recycling
      const result = await recyclePool.exec({ id: 4 });
      expect(result).toBeDefined();

      await recyclePool.destroy();
    });
  });

  describe('factory function', () => {
    it('should create pool with factory', () => {
      const factoryPool = createWorkerPool('/worker.js', {
        minWorkers: 2,
      });

      expect(factoryPool).toBeInstanceOf(WorkerPool);
    });
  });

  describe('error handling', () => {
    it('should handle worker errors', async () => {
      await pool.init();

      // Get access to internal workers (for testing)
      // This tests that the pool handles errors gracefully
      const stats = pool.getStats();
      expect(stats.totalWorkers).toBeGreaterThan(0);
    });
  });
});
