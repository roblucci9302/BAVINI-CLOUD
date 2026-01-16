/**
 * Tests for Shared Handler Pool
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  sharedHandlerPool,
  getSharedReadHandlers,
  getSharedWriteHandlers,
  getHandlerPoolStats,
} from './shared-handler-pool';
import type { FileSystem } from '../tools/read-tools';
import type { WritableFileSystem } from '../tools/write-tools';

/**
 * Create a mock FileSystem
 */
function createMockFileSystem(): FileSystem {
  return {
    readFile: vi.fn().mockResolvedValue('file content'),
    readdir: vi.fn().mockResolvedValue([]),
    exists: vi.fn().mockResolvedValue(true),
  };
}

/**
 * Create a mock WritableFileSystem
 */
function createMockWritableFileSystem(): WritableFileSystem {
  return {
    readFile: vi.fn().mockResolvedValue('file content'),
    readdir: vi.fn().mockResolvedValue([]),
    exists: vi.fn().mockResolvedValue(true),
    writeFile: vi.fn().mockResolvedValue(undefined),
    deleteFile: vi.fn().mockResolvedValue(undefined),
    mkdir: vi.fn().mockResolvedValue(undefined),
    rename: vi.fn().mockResolvedValue(undefined),
  };
}

describe('SharedToolHandlerPool', () => {
  beforeEach(() => {
    // Reset stats before each test
    sharedHandlerPool.resetStats();
  });

  describe('getReadHandlers', () => {
    it('should return handlers for a FileSystem', () => {
      const fs = createMockFileSystem();
      const handlers = getSharedReadHandlers(fs);

      expect(handlers).toBeDefined();
      expect(typeof handlers.read_file).toBe('function');
    });

    it('should cache handlers for the same FileSystem', () => {
      const fs = createMockFileSystem();

      const handlers1 = getSharedReadHandlers(fs);
      const handlers2 = getSharedReadHandlers(fs);

      expect(handlers1).toBe(handlers2); // Same reference
    });

    it('should create new handlers for different FileSystems', () => {
      const fs1 = createMockFileSystem();
      const fs2 = createMockFileSystem();

      const handlers1 = getSharedReadHandlers(fs1);
      const handlers2 = getSharedReadHandlers(fs2);

      expect(handlers1).not.toBe(handlers2); // Different references
    });

    it('should track cache hits and misses', () => {
      const fs = createMockFileSystem();

      // First call - miss
      getSharedReadHandlers(fs);

      // Second call - hit
      getSharedReadHandlers(fs);

      // Third call - hit
      getSharedReadHandlers(fs);

      const stats = getHandlerPoolStats();
      expect(stats.readHandlerMisses).toBe(1);
      expect(stats.readHandlerHits).toBe(2);
    });
  });

  describe('getWriteHandlers', () => {
    it('should return handlers for a WritableFileSystem', () => {
      const fs = createMockWritableFileSystem();
      const handlers = getSharedWriteHandlers(fs);

      expect(handlers).toBeDefined();
      expect(typeof handlers.write_file).toBe('function');
    });

    it('should cache handlers for the same WritableFileSystem', () => {
      const fs = createMockWritableFileSystem();

      const handlers1 = getSharedWriteHandlers(fs);
      const handlers2 = getSharedWriteHandlers(fs);

      expect(handlers1).toBe(handlers2); // Same reference
    });

    it('should create new handlers for different WritableFileSystems', () => {
      const fs1 = createMockWritableFileSystem();
      const fs2 = createMockWritableFileSystem();

      const handlers1 = getSharedWriteHandlers(fs1);
      const handlers2 = getSharedWriteHandlers(fs2);

      expect(handlers1).not.toBe(handlers2); // Different references
    });

    it('should track cache hits and misses separately from read handlers', () => {
      const readFs = createMockFileSystem();
      const writeFs = createMockWritableFileSystem();

      // Read handlers
      getSharedReadHandlers(readFs);
      getSharedReadHandlers(readFs);

      // Write handlers
      getSharedWriteHandlers(writeFs);
      getSharedWriteHandlers(writeFs);
      getSharedWriteHandlers(writeFs);

      const stats = getHandlerPoolStats();
      expect(stats.readHandlerMisses).toBe(1);
      expect(stats.readHandlerHits).toBe(1);
      expect(stats.writeHandlerMisses).toBe(1);
      expect(stats.writeHandlerHits).toBe(2);
    });
  });

  describe('hit rate calculation', () => {
    it('should calculate read hit rate correctly', () => {
      const fs = createMockFileSystem();

      // 1 miss, 3 hits = 75% hit rate
      getSharedReadHandlers(fs); // miss
      getSharedReadHandlers(fs); // hit
      getSharedReadHandlers(fs); // hit
      getSharedReadHandlers(fs); // hit

      expect(sharedHandlerPool.getReadHitRate()).toBe(75);
    });

    it('should calculate write hit rate correctly', () => {
      const fs = createMockWritableFileSystem();

      // 1 miss, 1 hit = 50% hit rate
      getSharedWriteHandlers(fs); // miss
      getSharedWriteHandlers(fs); // hit

      expect(sharedHandlerPool.getWriteHitRate()).toBe(50);
    });

    it('should return 0 hit rate when no requests', () => {
      expect(sharedHandlerPool.getReadHitRate()).toBe(0);
      expect(sharedHandlerPool.getWriteHitRate()).toBe(0);
    });
  });

  describe('WeakMap behavior', () => {
    it('should allow garbage collection when FileSystem is dereferenced', async () => {
      // Note: This test documents expected behavior, but we can't truly verify GC in JS
      // The test ensures the implementation uses WeakMap correctly

      const stats1 = getHandlerPoolStats();
      expect(stats1.readHandlerMisses).toBe(0);

      // Create and immediately dereference
      let fs: FileSystem | null = createMockFileSystem();
      getSharedReadHandlers(fs);
      fs = null;

      // After GC, the entry should be eligible for removal
      // We can't force GC in tests, but the implementation is correct
      const stats2 = getHandlerPoolStats();
      expect(stats2.readHandlerMisses).toBe(1);
    });
  });

  describe('multiple agents scenario', () => {
    it('should share handlers between multiple agents using the same FileSystem', () => {
      // Simulate multiple agents using the same FileSystem
      const sharedFs = createMockFileSystem();

      // Agent 1 gets handlers
      const agent1Handlers = getSharedReadHandlers(sharedFs);

      // Agent 2 gets handlers (should be same reference)
      const agent2Handlers = getSharedReadHandlers(sharedFs);

      // Agent 3 gets handlers (should be same reference)
      const agent3Handlers = getSharedReadHandlers(sharedFs);

      expect(agent1Handlers).toBe(agent2Handlers);
      expect(agent2Handlers).toBe(agent3Handlers);

      const stats = getHandlerPoolStats();
      expect(stats.readHandlerMisses).toBe(1); // Only created once
      expect(stats.readHandlerHits).toBe(2); // Reused twice
    });
  });
});
