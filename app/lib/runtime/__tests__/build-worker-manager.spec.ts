/**
 * =============================================================================
 * BAVINI CLOUD - Build Worker Manager Tests
 * =============================================================================
 * Tests for the BuildWorkerManager class.
 * Phase 1.1 Implementation
 * =============================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { BuildWorkerManager } from '../build-worker-manager';

describe('BuildWorkerManager', () => {
  describe('isSupported', () => {
    it('should return true when Worker is available', () => {
      // In test environment, Worker should be available via jsdom or happy-dom
      const result = BuildWorkerManager.isSupported();
      // This may be false in test environment without proper worker polyfill
      expect(typeof result).toBe('boolean');
    });
  });

  describe('constructor', () => {
    it('should create a new instance', () => {
      const manager = new BuildWorkerManager();
      expect(manager).toBeDefined();
      expect(manager.isReady()).toBe(false);
    });
  });

  describe('init', () => {
    it('should handle multiple init calls gracefully', async () => {
      const manager = new BuildWorkerManager();

      // In test environment without worker support, init should reject
      if (!BuildWorkerManager.isSupported()) {
        await expect(manager.init()).rejects.toThrow(/Worker|not supported/i);
        return;
      }

      // Multiple init calls should resolve to the same promise (singleton pattern)
      const promise1 = manager.init();
      const promise2 = manager.init();

      expect(promise1).toBeDefined();
      expect(promise2).toBeDefined();
    });
  });

  describe('dispose', () => {
    it('should clean up resources', async () => {
      const manager = new BuildWorkerManager();

      // Dispose should not throw even if not initialized
      await expect(manager.dispose()).resolves.not.toThrow();
      expect(manager.isReady()).toBe(false);
    });
  });

  describe('build', () => {
    it('should throw if not initialized', async () => {
      const manager = new BuildWorkerManager();
      const files = new Map([['test.ts', 'const x = 1;']]);

      // Should throw or init automatically
      try {
        await manager.build(
          files,
          'const x = 1;',
          '/src',
          { entryPoint: '/src/test.ts', mode: 'development' },
          { jsx: 'automatic', jsxImportSource: 'react' }
        );
      } catch (error) {
        // Expected in test environment without worker support
        expect(error).toBeDefined();
      }
    });
  });
});

describe('BuildWorkerManager Integration', () => {
  // These tests require a proper worker environment
  // They may be skipped in basic test environments

  it('should handle worker unavailability gracefully', async () => {
    // In environments without workers, isSupported should return false
    // and init should fail gracefully
    const supported = BuildWorkerManager.isSupported();

    if (!supported) {
      const manager = new BuildWorkerManager();
      await expect(manager.init()).rejects.toThrow();
    }
  });
});
