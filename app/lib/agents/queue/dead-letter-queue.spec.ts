/**
 * Tests pour DeadLetterQueue et RetryStrategies
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { Task, AgentError } from '../types';
import { DeadLetterQueue, createDeadLetterQueue } from './dead-letter-queue';
import {
  ExponentialBackoffStrategy,
  LinearBackoffStrategy,
  FixedDelayStrategy,
  ImmediateRetryStrategy,
  ErrorAwareStrategy,
  createDefaultRetryStrategy,
  createAgentRetryStrategy,
  executeWithRetry,
} from './retry-strategies';
import type { RetryContext } from './retry-strategies';

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
    status: 'failed',
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockError(overrides: Partial<AgentError> = {}): AgentError {
  return {
    code: 'TEST_ERROR',
    message: 'Test error message',
    recoverable: true,
    ...overrides,
  };
}

function createRetryContext(overrides: Partial<RetryContext> = {}): RetryContext {
  return {
    attempt: 0,
    error: createMockError(),
    firstErrorAt: new Date(),
    lastErrorAt: new Date(),
    taskId: 'test-task',
    ...overrides,
  };
}

/*
 * ============================================================================
 * RETRY STRATEGIES TESTS
 * ============================================================================
 */

describe('Retry Strategies', () => {
  describe('ExponentialBackoffStrategy', () => {
    it('should allow retry when under max attempts', () => {
      const strategy = new ExponentialBackoffStrategy({ maxAttempts: 5 });
      const context = createRetryContext({ attempt: 2 });

      const decision = strategy.evaluate(context);

      expect(decision.shouldRetry).toBe(true);
      expect(decision.delayMs).toBeGreaterThan(0);
    });

    it('should not retry when max attempts reached', () => {
      const strategy = new ExponentialBackoffStrategy({ maxAttempts: 3 });
      const context = createRetryContext({ attempt: 3 });

      const decision = strategy.evaluate(context);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toContain('Max attempts');
    });

    it('should not retry non-recoverable errors', () => {
      const strategy = new ExponentialBackoffStrategy();
      const context = createRetryContext({
        error: createMockError({ recoverable: false }),
      });

      const decision = strategy.evaluate(context);

      expect(decision.shouldRetry).toBe(false);
      expect(decision.reason).toContain('not recoverable');
    });

    it('should increase delay exponentially', () => {
      const strategy = new ExponentialBackoffStrategy({
        baseDelayMs: 1000,
        multiplier: 2,
        jitter: 0, // Disable jitter for predictable testing
      });

      const delay0 = strategy.evaluate(createRetryContext({ attempt: 0 })).delayMs;
      const delay1 = strategy.evaluate(createRetryContext({ attempt: 1 })).delayMs;
      const delay2 = strategy.evaluate(createRetryContext({ attempt: 2 })).delayMs;

      expect(delay1).toBeGreaterThan(delay0);
      expect(delay2).toBeGreaterThan(delay1);
    });

    it('should respect max delay', () => {
      const strategy = new ExponentialBackoffStrategy({
        baseDelayMs: 10000,
        maxDelayMs: 5000,
        multiplier: 10,
        jitter: 0,
      });

      const decision = strategy.evaluate(createRetryContext({ attempt: 5 }));

      expect(decision.delayMs).toBeLessThanOrEqual(5000);
    });
  });

  describe('LinearBackoffStrategy', () => {
    it('should increase delay linearly', () => {
      const strategy = new LinearBackoffStrategy({
        baseDelayMs: 1000,
        incrementMs: 500,
        maxAttempts: 10,
      });

      const delay0 = strategy.evaluate(createRetryContext({ attempt: 0 })).delayMs;
      const delay1 = strategy.evaluate(createRetryContext({ attempt: 1 })).delayMs;
      const delay2 = strategy.evaluate(createRetryContext({ attempt: 2 })).delayMs;

      expect(delay1 - delay0).toBe(500);
      expect(delay2 - delay1).toBe(500);
    });
  });

  describe('FixedDelayStrategy', () => {
    it('should use fixed delay for all attempts', () => {
      const strategy = new FixedDelayStrategy({
        delayMs: 2000,
        maxAttempts: 5,
      });

      const delay0 = strategy.evaluate(createRetryContext({ attempt: 0 })).delayMs;
      const delay1 = strategy.evaluate(createRetryContext({ attempt: 1 })).delayMs;
      const delay2 = strategy.evaluate(createRetryContext({ attempt: 2 })).delayMs;

      expect(delay0).toBe(2000);
      expect(delay1).toBe(2000);
      expect(delay2).toBe(2000);
    });
  });

  describe('ImmediateRetryStrategy', () => {
    it('should retry immediately (no delay)', () => {
      const strategy = new ImmediateRetryStrategy(3);

      const decision = strategy.evaluate(createRetryContext({ attempt: 0 }));

      expect(decision.shouldRetry).toBe(true);
      expect(decision.delayMs).toBe(0);
    });
  });

  describe('ErrorAwareStrategy', () => {
    it('should use appropriate strategy for error code', () => {
      const rateLimitStrategy = new ExponentialBackoffStrategy({
        baseDelayMs: 5000,
        maxAttempts: 5,
      });

      const strategy = new ErrorAwareStrategy(
        [
          {
            errorCodes: ['RATE_LIMIT'],
            strategy: rateLimitStrategy,
          },
        ],
        new FixedDelayStrategy({ delayMs: 1000, maxAttempts: 3 }),
      );

      // Rate limit error should use exponential
      const rateLimitContext = createRetryContext({
        error: createMockError({ code: 'RATE_LIMIT' }),
      });
      const rateLimitDecision = strategy.evaluate(rateLimitContext);
      expect(rateLimitDecision.delayMs).toBeGreaterThanOrEqual(5000);

      // Other errors should use fixed
      const otherContext = createRetryContext({
        error: createMockError({ code: 'OTHER_ERROR' }),
      });
      const otherDecision = strategy.evaluate(otherContext);
      expect(otherDecision.delayMs).toBe(1000);
    });
  });

  describe('Factory Functions', () => {
    it('should create default retry strategy', () => {
      const strategy = createDefaultRetryStrategy();
      expect(strategy.name).toBe('exponential-backoff');
      expect(strategy.getMaxAttempts()).toBe(5);
    });

    it('should create agent retry strategy', () => {
      const strategy = createAgentRetryStrategy();
      expect(strategy.name).toBe('error-aware');
    });
  });

  describe('executeWithRetry', () => {
    it('should succeed on first attempt', async () => {
      const fn = vi.fn().mockResolvedValue('success');
      const strategy = createDefaultRetryStrategy();

      const result = await executeWithRetry(fn, strategy, 'task-1', (e) => createMockError({ message: String(e) }));

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('should retry on failure', async () => {
      const fn = vi
        .fn()
        .mockRejectedValueOnce(new Error('fail1'))
        .mockRejectedValueOnce(new Error('fail2'))
        .mockResolvedValue('success');

      const strategy = new ImmediateRetryStrategy(5);

      const result = await executeWithRetry(fn, strategy, 'task-1', (e) => createMockError({ message: String(e) }));

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('should throw after max retries', async () => {
      const fn = vi.fn().mockRejectedValue(new Error('always fails'));
      const strategy = new ImmediateRetryStrategy(2);

      await expect(
        executeWithRetry(fn, strategy, 'task-1', (e) => createMockError({ message: String(e) })),
      ).rejects.toThrow();

      expect(fn).toHaveBeenCalledTimes(2);
    });
  });
});

/*
 * ============================================================================
 * DEAD-LETTER QUEUE TESTS
 * ============================================================================
 */

describe('DeadLetterQueue', () => {
  let dlq: DeadLetterQueue;

  beforeEach(() => {
    dlq = createDeadLetterQueue({
      retentionMs: 60000, // 1 minute for tests
      purgeIntervalMs: 0, // Disable auto-purge
    });
  });

  afterEach(() => {
    dlq.destroy();
  });

  describe('basic operations', () => {
    it('should add entry to DLQ', async () => {
      const task = createMockTask();
      const error = createMockError();

      const entry = await dlq.add(task, error, 3);

      expect(entry.task.id).toBe(task.id);
      expect(entry.error.code).toBe(error.code);
      expect(entry.attempts).toBe(3);
      expect(dlq.size()).toBe(1);
    });

    it('should get entry by ID', async () => {
      const task = createMockTask();
      const error = createMockError();

      const entry = await dlq.add(task, error, 1);
      const retrieved = dlq.get(entry.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.id).toBe(entry.id);
    });

    it('should get entry by task ID', async () => {
      const task = createMockTask();
      const error = createMockError();

      await dlq.add(task, error, 1);
      const retrieved = dlq.getByTaskId(task.id);

      expect(retrieved).toBeDefined();
      expect(retrieved!.task.id).toBe(task.id);
    });

    it('should list all entries', async () => {
      await dlq.add(createMockTask(), createMockError(), 1);
      await dlq.add(createMockTask(), createMockError(), 2);
      await dlq.add(createMockTask(), createMockError(), 3);

      const list = dlq.list();
      expect(list.length).toBe(3);
    });

    it('should remove entry', async () => {
      const task = createMockTask();
      const entry = await dlq.add(task, createMockError(), 1);

      const removed = await dlq.remove(entry.id);
      expect(removed).toBe(true);
      expect(dlq.size()).toBe(0);
    });
  });

  describe('filtering', () => {
    it('should list by error code', async () => {
      await dlq.add(createMockTask(), createMockError({ code: 'ERROR_A' }), 1);
      await dlq.add(createMockTask(), createMockError({ code: 'ERROR_A' }), 1);
      await dlq.add(createMockTask(), createMockError({ code: 'ERROR_B' }), 1);

      const errorAList = dlq.listByErrorCode('ERROR_A');
      const errorBList = dlq.listByErrorCode('ERROR_B');

      expect(errorAList.length).toBe(2);
      expect(errorBList.length).toBe(1);
    });

    it('should list by task type', async () => {
      await dlq.add(createMockTask({ type: 'coder' }), createMockError(), 1);
      await dlq.add(createMockTask({ type: 'coder' }), createMockError(), 1);
      await dlq.add(createMockTask({ type: 'builder' }), createMockError(), 1);

      const coderList = dlq.listByTaskType('coder');
      const builderList = dlq.listByTaskType('builder');

      expect(coderList.length).toBe(2);
      expect(builderList.length).toBe(1);
    });
  });

  describe('retry functionality', () => {
    it('should prepare task for retry', async () => {
      const task = createMockTask({ status: 'failed' });
      const entry = await dlq.add(task, createMockError(), 3);

      const retryTask = await dlq.prepareForRetry(entry.id);

      expect(retryTask).not.toBeNull();
      expect(retryTask!.status).toBe('pending');
      expect(retryTask!.metadata?.retriedFromDLQ).toBe(true);
      expect(retryTask!.metadata?.retryCount).toBe(1);
      expect(dlq.size()).toBe(0);
    });

    it('should return null when preparing non-existent entry', async () => {
      const retryTask = await dlq.prepareForRetry('non-existent');
      expect(retryTask).toBeNull();
    });
  });

  describe('expiration and purge', () => {
    it('should list expired entries', async () => {
      vi.useFakeTimers();

      // Add entry with short retention
      const dlqShort = createDeadLetterQueue({
        retentionMs: 1000, // 1 second
        purgeIntervalMs: 0,
      });

      await dlqShort.add(createMockTask(), createMockError(), 1);

      // Initially not expired
      expect(dlqShort.listExpired().length).toBe(0);

      // After retention period
      vi.advanceTimersByTime(1500);
      expect(dlqShort.listExpired().length).toBe(1);

      dlqShort.destroy();
      vi.useRealTimers();
    });

    it('should purge expired entries', async () => {
      vi.useFakeTimers();

      const dlqShort = createDeadLetterQueue({
        retentionMs: 1000,
        purgeIntervalMs: 0,
      });

      await dlqShort.add(createMockTask(), createMockError(), 1);
      await dlqShort.add(createMockTask(), createMockError(), 1);

      vi.advanceTimersByTime(1500);

      const purged = await dlqShort.purgeExpired();
      expect(purged).toBe(2);
      expect(dlqShort.size()).toBe(0);

      dlqShort.destroy();
      vi.useRealTimers();
    });
  });

  describe('max size handling', () => {
    it('should remove oldest when max size reached', async () => {
      const smallDlq = createDeadLetterQueue({
        maxSize: 2,
        retentionMs: 60000,
        purgeIntervalMs: 0,
      });

      const task1 = createMockTask({ id: 'task-1' });
      const task2 = createMockTask({ id: 'task-2' });
      const task3 = createMockTask({ id: 'task-3' });

      await smallDlq.add(task1, createMockError(), 1);
      await smallDlq.add(task2, createMockError(), 1);
      await smallDlq.add(task3, createMockError(), 1);

      expect(smallDlq.size()).toBe(2);

      // task-1 should have been removed (oldest)
      expect(smallDlq.getByTaskId('task-1')).toBeUndefined();
      expect(smallDlq.getByTaskId('task-2')).toBeDefined();
      expect(smallDlq.getByTaskId('task-3')).toBeDefined();

      smallDlq.destroy();
    });
  });

  describe('statistics', () => {
    it('should return correct stats', async () => {
      await dlq.add(createMockTask({ type: 'coder' }), createMockError({ code: 'ERR_A' }), 1);
      await dlq.add(createMockTask({ type: 'coder' }), createMockError({ code: 'ERR_A' }), 2);
      await dlq.add(createMockTask({ type: 'builder' }), createMockError({ code: 'ERR_B' }), 3);

      const stats = dlq.getStats();

      expect(stats.total).toBe(3);
      expect(stats.byErrorCode.ERR_A).toBe(2);
      expect(stats.byErrorCode.ERR_B).toBe(1);
      expect(stats.byTaskType.coder).toBe(2);
      expect(stats.byTaskType.builder).toBe(1);
    });

    it('should track retried count', async () => {
      const entry = await dlq.add(createMockTask(), createMockError(), 1);
      await dlq.prepareForRetry(entry.id);

      const stats = dlq.getStats();
      expect(stats.retriedCount).toBe(1);
    });

    it('should track purged count', async () => {
      vi.useFakeTimers();

      const dlqShort = createDeadLetterQueue({
        retentionMs: 1000,
        purgeIntervalMs: 0,
      });

      await dlqShort.add(createMockTask(), createMockError(), 1);
      vi.advanceTimersByTime(1500);
      await dlqShort.purgeExpired();

      const stats = dlqShort.getStats();
      expect(stats.purgedCount).toBe(1);

      dlqShort.destroy();
      vi.useRealTimers();
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      await dlq.add(createMockTask(), createMockError(), 1);
      await dlq.add(createMockTask(), createMockError(), 1);

      const cleared = await dlq.clear();

      expect(cleared).toBe(2);
      expect(dlq.isEmpty()).toBe(true);
    });
  });
});
