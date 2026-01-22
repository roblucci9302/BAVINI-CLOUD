/**
 * =============================================================================
 * Tests: esbuild Init Lock (esbuild-init-lock.ts)
 * =============================================================================
 * FIX 1.1: Tests for thread-safe esbuild initialization.
 * =============================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { EsbuildInitLock } from '../esbuild-init-lock';

// Mock esbuild-wasm
vi.mock('esbuild-wasm', () => ({
  initialize: vi.fn(),
}));

// Mock the timeout utility
vi.mock('../../utils/timeout', () => ({
  withTimeout: vi.fn((promise) => promise),
  TIMEOUTS: {
    ESBUILD_INIT: 30000,
  },
}));

import * as esbuild from 'esbuild-wasm';

describe('EsbuildInitLock', () => {
  let lock: EsbuildInitLock;

  beforeEach(() => {
    // Reset singleton and global state
    (EsbuildInitLock as any)._instance = null;
    (globalThis as any).__esbuildInitialized = false;

    // Reset mock
    vi.mocked(esbuild.initialize).mockReset();
    vi.mocked(esbuild.initialize).mockResolvedValue(undefined);

    // Get fresh instance
    lock = EsbuildInitLock.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = EsbuildInitLock.getInstance();
      const instance2 = EsbuildInitLock.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should recover state from globalThis', () => {
      (globalThis as any).__esbuildInitialized = true;
      (EsbuildInitLock as any)._instance = null;

      const recovered = EsbuildInitLock.getInstance();

      expect(recovered.state).toBe('ready');
      expect(recovered.isReady).toBe(true);
    });
  });

  describe('state machine', () => {
    it('should start in idle state', () => {
      expect(lock.state).toBe('idle');
      expect(lock.isReady).toBe(false);
    });

    it('should transition to ready after successful init', async () => {
      await lock.initialize();

      expect(lock.state).toBe('ready');
      expect(lock.isReady).toBe(true);
    });

    it('should transition to error on failure', async () => {
      vi.mocked(esbuild.initialize).mockRejectedValueOnce(new Error('WASM load failed'));

      await expect(lock.initialize()).rejects.toThrow('WASM load failed');

      expect(lock.state).toBe('error');
      expect(lock.isReady).toBe(false);
    });

    it('should set globalThis flag on success', async () => {
      await lock.initialize();

      expect((globalThis as any).__esbuildInitialized).toBe(true);
    });
  });

  describe('concurrent calls', () => {
    it('should return immediately if already ready', async () => {
      await lock.initialize();
      vi.mocked(esbuild.initialize).mockClear();

      await lock.initialize();
      await lock.initialize();

      // Should not call esbuild.initialize again
      expect(esbuild.initialize).not.toHaveBeenCalled();
    });

    it('should share promise during initialization', async () => {
      const slowInit = new Promise<void>((resolve) => {
        setTimeout(resolve, 100);
      });
      vi.mocked(esbuild.initialize).mockReturnValueOnce(slowInit);

      // Start multiple concurrent initializations
      const p1 = lock.initialize();
      const p2 = lock.initialize();
      const p3 = lock.initialize();

      // All should resolve together
      await Promise.all([p1, p2, p3]);

      // esbuild.initialize should only be called once
      expect(esbuild.initialize).toHaveBeenCalledTimes(1);
    });

    it('should rethrow stored error on subsequent calls', async () => {
      vi.mocked(esbuild.initialize).mockRejectedValueOnce(new Error('Init failed'));

      await expect(lock.initialize()).rejects.toThrow('Init failed');
      await expect(lock.initialize()).rejects.toThrow('Init failed');

      // Should not retry automatically
      expect(esbuild.initialize).toHaveBeenCalledTimes(1);
    });
  });

  describe('reset', () => {
    it('should reset from error state to idle', async () => {
      vi.mocked(esbuild.initialize).mockRejectedValueOnce(new Error('Failed'));

      await expect(lock.initialize()).rejects.toThrow();
      expect(lock.state).toBe('error');

      lock.reset();

      expect(lock.state).toBe('idle');
    });

    it('should not reset from ready state', async () => {
      await lock.initialize();
      expect(lock.state).toBe('ready');

      lock.reset();

      expect(lock.state).toBe('ready');
    });

    it('should allow retry after reset', async () => {
      vi.mocked(esbuild.initialize)
        .mockRejectedValueOnce(new Error('Failed first'))
        .mockResolvedValueOnce(undefined);

      await expect(lock.initialize()).rejects.toThrow();
      lock.reset();

      await lock.initialize();

      expect(lock.state).toBe('ready');
      expect(esbuild.initialize).toHaveBeenCalledTimes(2);
    });
  });

  describe('initCount', () => {
    it('should track number of init calls', async () => {
      expect(lock.initCount).toBe(0);

      await lock.initialize();
      expect(lock.initCount).toBe(1);

      await lock.initialize();
      expect(lock.initCount).toBe(2);

      await lock.initialize();
      expect(lock.initCount).toBe(3);
    });
  });

  describe('_forceReset', () => {
    it('should force reset all state', async () => {
      await lock.initialize();
      expect(lock.state).toBe('ready');
      expect((globalThis as any).__esbuildInitialized).toBe(true);

      lock._forceReset();

      expect(lock.state).toBe('idle');
      expect((globalThis as any).__esbuildInitialized).toBe(false);
    });
  });
});
