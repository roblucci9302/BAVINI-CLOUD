/**
 * =============================================================================
 * Tests: Timeout Utilities (timeout.ts)
 * =============================================================================
 * FIX 2.1: Tests for timeout utilities and retry logic.
 * =============================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  TIMEOUTS,
  TimeoutError,
  withTimeout,
  createTimeoutController,
  withRetry,
} from '../timeout';

describe('TIMEOUTS', () => {
  it('should have all required timeout constants', () => {
    expect(TIMEOUTS.ESBUILD_INIT).toBe(30_000);
    expect(TIMEOUTS.MODULE_FETCH).toBe(15_000);
    expect(TIMEOUTS.BUILD_TOTAL).toBe(120_000);
    expect(TIMEOUTS.TARBALL_DOWNLOAD).toBe(60_000);
    expect(TIMEOUTS.SERVICE_WORKER_PING).toBe(3_000);
    expect(TIMEOUTS.REGISTRY_METADATA).toBe(10_000);
    expect(TIMEOUTS.FS_OPERATION).toBe(5_000);
    expect(TIMEOUTS.TRANSFORM).toBe(30_000);
  });
});

describe('TimeoutError', () => {
  it('should create error with correct properties', () => {
    const error = new TimeoutError('Test timeout', 'test operation', 5000);

    expect(error.message).toBe('Test timeout');
    expect(error.operation).toBe('test operation');
    expect(error.timeoutMs).toBe(5000);
    expect(error.name).toBe('TimeoutError');
  });

  it('should be instanceof Error', () => {
    const error = new TimeoutError('Test', 'op', 1000);
    expect(error).toBeInstanceOf(Error);
    expect(error).toBeInstanceOf(TimeoutError);
  });
});

describe('withTimeout', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should resolve if promise completes before timeout', async () => {
    const promise = Promise.resolve('success');
    const result = await withTimeout(promise, 1000, 'test');
    expect(result).toBe('success');
  });

  it('should reject with TimeoutError if promise exceeds timeout', async () => {
    const slowPromise = new Promise((resolve) => {
      setTimeout(() => resolve('too late'), 5000);
    });

    const timeoutPromise = withTimeout(slowPromise, 100, 'slow operation');

    // Advance time past timeout
    vi.advanceTimersByTime(150);

    await expect(timeoutPromise).rejects.toThrow(TimeoutError);
    await expect(timeoutPromise).rejects.toMatchObject({
      operation: 'slow operation',
      timeoutMs: 100,
    });
  });

  it('should propagate original error if promise rejects before timeout', async () => {
    const error = new Error('Original error');
    const failingPromise = Promise.reject(error);

    await expect(withTimeout(failingPromise, 1000, 'test')).rejects.toThrow('Original error');
  });

  it('should clear timeout when promise resolves', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const promise = Promise.resolve('done');
    await withTimeout(promise, 1000, 'test');

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('should clear timeout when promise rejects', async () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');

    const promise = Promise.reject(new Error('fail'));
    await expect(withTimeout(promise, 1000, 'test')).rejects.toThrow();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });
});

describe('createTimeoutController', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return controller and cleanup function', () => {
    const { controller, cleanup } = createTimeoutController(1000);

    expect(controller).toBeInstanceOf(AbortController);
    expect(typeof cleanup).toBe('function');

    cleanup();
  });

  it('should abort after timeout', () => {
    const { controller } = createTimeoutController(1000);

    expect(controller.signal.aborted).toBe(false);

    vi.advanceTimersByTime(1100);

    expect(controller.signal.aborted).toBe(true);
  });

  it('should not abort if cleanup called before timeout', () => {
    const { controller, cleanup } = createTimeoutController(1000);

    cleanup();
    vi.advanceTimersByTime(2000);

    expect(controller.signal.aborted).toBe(false);
  });
});

describe('withRetry', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return result on first successful attempt', async () => {
    const fn = vi.fn().mockResolvedValue('success');

    const resultPromise = withRetry(fn, { maxAttempts: 3 });
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed', async () => {
    const fn = vi
      .fn()
      .mockRejectedValueOnce(new Error('fail 1'))
      .mockRejectedValueOnce(new Error('fail 2'))
      .mockResolvedValue('success');

    const resultPromise = withRetry(fn, {
      maxAttempts: 3,
      timeoutMs: 1000,
      backoffMs: 100,
    });

    // First attempt fails immediately
    await vi.advanceTimersByTimeAsync(10);

    // Wait for backoff (100ms * 2^0 = 100ms)
    await vi.advanceTimersByTimeAsync(100);

    // Second attempt fails
    await vi.advanceTimersByTimeAsync(10);

    // Wait for backoff (100ms * 2^1 = 200ms)
    await vi.advanceTimersByTimeAsync(200);

    // Third attempt succeeds
    const result = await resultPromise;

    expect(result).toBe('success');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after max attempts exceeded', async () => {
    const fn = vi.fn().mockImplementation(async () => {
      throw new Error('always fails');
    });

    let caughtError: Error | null = null;

    const resultPromise = withRetry(fn, {
      maxAttempts: 2,
      timeoutMs: 1000,
      backoffMs: 100,
    }).catch((err) => {
      caughtError = err;
    });

    // Advance through all attempts and backoffs
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toBe('always fails');
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('should use exponential backoff', async () => {
    const fn = vi.fn().mockImplementation(async () => {
      throw new Error('fail');
    });

    let caughtError: Error | null = null;

    const resultPromise = withRetry(fn, {
      maxAttempts: 4,
      timeoutMs: 1000,
      backoffMs: 100,
    }).catch((err) => {
      caughtError = err;
    });

    // Run through all retries
    await vi.runAllTimersAsync();
    await resultPromise;

    expect(caughtError).not.toBeNull();
    expect(caughtError!.message).toBe('fail');

    // Verify all attempts were made
    expect(fn).toHaveBeenCalledTimes(4);
  });

  it('should use default options', async () => {
    const fn = vi.fn().mockResolvedValue('done');

    const result = await withRetry(fn);

    expect(result).toBe('done');
  });
});
