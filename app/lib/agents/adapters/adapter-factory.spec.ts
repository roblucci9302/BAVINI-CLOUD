/**
 * =============================================================================
 * Tests for Adapter Factory
 * =============================================================================
 * Tests the BAVINI adapter factory which creates filesystem and shell adapters.
 * WebContainer has been removed - only BAVINI adapters are used now.
 * =============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BaviniFSAdapter } from './bavini-fs-adapter';
import { BaviniShellAdapter } from './bavini-shell-adapter';
import { MemoryBackend, MountManager } from '~/lib/runtime/filesystem';

// Mock the agent stores
vi.mock('~/lib/stores/agents', () => ({
  addAgentLog: vi.fn(),
}));

// Mock the shared mount manager
vi.mock('~/lib/runtime/filesystem', async (importOriginal) => {
  const actual = await importOriginal<typeof import('~/lib/runtime/filesystem')>();
  return {
    ...actual,
    getSharedMountManager: vi.fn(() => {
      const manager = new actual.MountManager();
      return manager;
    }),
  };
});

// Import after mocks are set up
import {
  createFSAdapter,
  createShellAdapter,
  getFSAdapterForAgent,
  getShellAdapterForAgent,
  getActiveRuntime,
  setRuntimeOverride,
  resetRuntimeCache,
  resetFSAdapters,
  resetShellAdapters,
  resetAllAdaptersAndCache,
  type RuntimeType,
} from './adapter-factory';

describe('AdapterFactory', () => {
  let mountManager: MountManager;

  beforeEach(async () => {
    // Reset all caches
    resetAllAdaptersAndCache();

    // Create fresh mount manager with memory backend for testing
    mountManager = new MountManager();
    const memoryBackend = new MemoryBackend();
    await mountManager.init({
      mounts: [{ path: '/', backend: memoryBackend }],
    });

    // Create default directories
    await mountManager.mkdir('/home', { recursive: true });
    await mountManager.mkdir('/src', { recursive: true });
  });

  afterEach(async () => {
    await mountManager.destroy();
    resetAllAdaptersAndCache();
    vi.clearAllMocks();
  });

  describe('getActiveRuntime', () => {
    it('should always return browser (BAVINI is the only runtime)', () => {
      const runtime = getActiveRuntime();
      expect(runtime).toBe('browser');
    });

    it('should ignore runtime override (no-op for compatibility)', () => {
      // setRuntimeOverride is now a no-op, kept for API compatibility
      setRuntimeOverride('browser');
      expect(getActiveRuntime()).toBe('browser');

      setRuntimeOverride(null);
      resetRuntimeCache();
      expect(getActiveRuntime()).toBe('browser');
    });
  });

  describe('createFSAdapter', () => {
    beforeEach(() => {
      setRuntimeOverride('browser');
    });

    it('should create BaviniFSAdapter for browser runtime', () => {
      const adapter = createFSAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      expect(adapter).toBeInstanceOf(BaviniFSAdapter);
    });

    it('should cache adapters by agent and task', () => {
      const adapter1 = createFSAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      const adapter2 = createFSAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      // Should return cached instance
      expect(adapter1).toBe(adapter2);
    });

    it('should create different adapters for different agents', () => {
      const adapter1 = createFSAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      const adapter2 = createFSAdapter(
        {
          agentName: 'architect',
          strictMode: false,
        },
        mountManager,
      );

      expect(adapter1).not.toBe(adapter2);
    });

    it('should create different adapters for different tasks', () => {
      const adapter1 = createFSAdapter(
        {
          agentName: 'coder',
          taskId: 'task1',
          strictMode: false,
        },
        mountManager,
      );

      const adapter2 = createFSAdapter(
        {
          agentName: 'coder',
          taskId: 'task2',
          strictMode: false,
        },
        mountManager,
      );

      expect(adapter1).not.toBe(adapter2);
    });

    it('should pass through config options', async () => {
      const onApprovalRequired = vi.fn().mockResolvedValue(true);

      const adapter = createFSAdapter(
        {
          agentName: 'coder',
          strictMode: true,
          onApprovalRequired,
          basePath: '/src',
        },
        mountManager,
      );

      // Create a file to trigger approval
      await (adapter as BaviniFSAdapter).createFile('test.txt', 'content');

      expect(onApprovalRequired).toHaveBeenCalled();
    });
  });

  describe('getFSAdapterForAgent', () => {
    beforeEach(() => {
      setRuntimeOverride('browser');
    });

    it('should create adapter with minimal config', () => {
      const adapter = getFSAdapterForAgent('coder');

      expect(adapter).toBeInstanceOf(BaviniFSAdapter);
    });

    it('should allow partial config override', () => {
      const adapter = getFSAdapterForAgent('coder', {
        strictMode: true,
        basePath: '/src',
      });

      expect(adapter).toBeDefined();
    });
  });

  describe('createShellAdapter', () => {
    beforeEach(() => {
      setRuntimeOverride('browser');
    });

    it('should create BaviniShellAdapter for browser runtime', () => {
      const adapter = createShellAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      expect(adapter).toBeInstanceOf(BaviniShellAdapter);
    });

    it('should cache adapters by agent and task', () => {
      const adapter1 = createShellAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      const adapter2 = createShellAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      expect(adapter1).toBe(adapter2);
    });

    it('should create different adapters for different agents', () => {
      const adapter1 = createShellAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      const adapter2 = createShellAdapter(
        {
          agentName: 'architect',
          strictMode: false,
        },
        mountManager,
      );

      expect(adapter1).not.toBe(adapter2);
    });

    it('should pass through config options', () => {
      const adapter = createShellAdapter(
        {
          agentName: 'coder',
          strictMode: false,
          cwd: '/src',
          env: { MY_VAR: 'value' },
          defaultTimeout: 30000,
        },
        mountManager,
      );

      const shellAdapter = adapter as BaviniShellAdapter;
      expect(shellAdapter.getCwd()).toBe('/src');
      expect(shellAdapter.getEnv().MY_VAR).toBe('value');
    });
  });

  describe('getShellAdapterForAgent', () => {
    beforeEach(() => {
      setRuntimeOverride('browser');
    });

    it('should create adapter with minimal config', () => {
      const adapter = getShellAdapterForAgent('coder');

      expect(adapter).toBeInstanceOf(BaviniShellAdapter);
    });

    it('should allow partial config override', () => {
      const adapter = getShellAdapterForAgent('coder', {
        strictMode: true,
        cwd: '/src',
      });

      expect(adapter).toBeDefined();
    });
  });

  describe('resetFSAdapters', () => {
    beforeEach(() => {
      setRuntimeOverride('browser');
    });

    it('should clear the FS adapter cache', () => {
      const adapter1 = createFSAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      resetFSAdapters();

      const adapter2 = createFSAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      // Should be different instances after reset
      expect(adapter1).not.toBe(adapter2);
    });
  });

  describe('resetShellAdapters', () => {
    beforeEach(() => {
      setRuntimeOverride('browser');
    });

    it('should clear the Shell adapter cache', () => {
      const adapter1 = createShellAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      resetShellAdapters();

      const adapter2 = createShellAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      expect(adapter1).not.toBe(adapter2);
    });
  });

  describe('resetAllAdaptersAndCache', () => {
    it('should clear all caches', () => {
      const fsAdapter1 = createFSAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      const shellAdapter1 = createShellAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      resetAllAdaptersAndCache();

      const fsAdapter2 = createFSAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      const shellAdapter2 = createShellAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      expect(fsAdapter1).not.toBe(fsAdapter2);
      expect(shellAdapter1).not.toBe(shellAdapter2);
    });
  });

  describe('Runtime switching', () => {
    it('should create appropriate adapter based on runtime', () => {
      // Browser runtime
      setRuntimeOverride('browser');
      resetFSAdapters();

      const browserAdapter = createFSAdapter(
        {
          agentName: 'coder',
          strictMode: false,
        },
        mountManager,
      );

      expect(browserAdapter).toBeInstanceOf(BaviniFSAdapter);
    });
  });
});
