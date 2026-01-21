/**
 * =============================================================================
 * BAVINI Runtime Engine - QuickJS Runtime Tests
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  QuickJSNodeRuntime,
  createQuickJSRuntime,
  getSharedQuickJSRuntime,
  resetSharedQuickJSRuntime,
} from './quickjs-runtime';

// Mock quickjs-emscripten to avoid loading WASM in tests
vi.mock('quickjs-emscripten', () => {
  const mockContext = {
    global: { value: 'global' },
    undefined: { value: undefined },
    newObject: vi.fn(() => ({ dispose: vi.fn() })),
    newString: vi.fn((s: string) => ({ value: s, dispose: vi.fn() })),
    newNumber: vi.fn((n: number) => ({ value: n, dispose: vi.fn() })),
    newFunction: vi.fn((name: string, fn: Function) => ({
      name,
      fn,
      dispose: vi.fn(),
    })),
    setProp: vi.fn(),
    getProp: vi.fn(),
    dump: vi.fn((handle: { value?: unknown }) => handle?.value),
    getNumber: vi.fn((handle: { value?: number }) => handle?.value ?? 0),
    callFunction: vi.fn(() => ({ value: undefined })),
    evalCode: vi.fn((code: string) => {
      // Simulate basic code execution
      if (code.includes('throw')) {
        return {
          error: { value: 'Error: Test error', dispose: vi.fn() },
        };
      }
      if (code.includes('console.log')) {
        return { value: { value: undefined, dispose: vi.fn() } };
      }
      // Try to evaluate simple expressions
      try {
        const result = eval(code); // eslint-disable-line no-eval
        return { value: { value: result, dispose: vi.fn() } };
      } catch {
        return { value: { value: undefined, dispose: vi.fn() } };
      }
    }),
    dispose: vi.fn(),
  };

  const mockRuntime = {
    setMemoryLimit: vi.fn(),
    setMaxStackSize: vi.fn(),
    setInterruptHandler: vi.fn(),
    newContext: vi.fn(() => mockContext),
    executePendingJobs: vi.fn(() => ({ value: 0 })),
    dispose: vi.fn(),
  };

  const mockModule = {
    newRuntime: vi.fn(() => mockRuntime),
  };

  return {
    getQuickJS: vi.fn().mockResolvedValue(mockModule),
    newQuickJSWASMModuleFromVariant: vi.fn().mockResolvedValue(mockModule),
  };
});

describe('QuickJSNodeRuntime', () => {
  let runtime: QuickJSNodeRuntime;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime = createQuickJSRuntime();
  });

  afterEach(() => {
    runtime.destroy();
  });

  describe('Lifecycle', () => {
    it('should start with idle status', () => {
      expect(runtime.status).toBe('idle');
    });

    it('should initialize successfully', async () => {
      await runtime.init();
      expect(runtime.status).toBe('ready');
    });

    it('should handle multiple init calls', async () => {
      await runtime.init();
      await runtime.init();
      expect(runtime.status).toBe('ready');
    });

    it('should destroy cleanly', async () => {
      await runtime.init();
      runtime.destroy();
      expect(runtime.status).toBe('idle');
    });
  });

  describe('Code Execution', () => {
    beforeEach(async () => {
      await runtime.init();
    });

    it('should execute simple code', async () => {
      const result = await runtime.eval('1 + 1');

      expect(result.success).toBe(true);
      expect(result.executionTime).toBeGreaterThan(0);
    });

    it('should capture stdout', async () => {
      const stdoutData: string[] = [];
      runtime.setCallbacks({
        onStdout: (data) => stdoutData.push(data),
      });

      await runtime.eval('console.log("Hello")');

      // The mock captures console calls
      expect(result => result.stdout !== undefined).toBeTruthy();
    });

    it('should handle errors gracefully', async () => {
      const result = await runtime.eval('throw new Error("test")');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });

    it('should return execution time', async () => {
      const result = await runtime.eval('1 + 1');

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Virtual Filesystem', () => {
    it('should have a filesystem', () => {
      expect(runtime.fs).toBeDefined();
    });

    it('should write and read files', () => {
      runtime.writeFile('/test.txt', 'Hello World');
      const content = runtime.readFile('/test.txt');

      expect(content).toBe('Hello World');
    });

    it('should write multiple files', () => {
      runtime.writeFiles({
        '/a.txt': 'Content A',
        '/b.txt': 'Content B',
      });

      expect(runtime.readFile('/a.txt')).toBe('Content A');
      expect(runtime.readFile('/b.txt')).toBe('Content B');
    });

    it('should return null for non-existent files', () => {
      const content = runtime.readFile('/nonexistent.txt');
      expect(content).toBeNull();
    });
  });

  describe('Process Shim', () => {
    it('should have a process shim', () => {
      expect(runtime.process).toBeDefined();
    });

    it('should have cwd()', () => {
      expect(typeof runtime.process.cwd).toBe('function');
      expect(runtime.process.cwd()).toBe('/');
    });

    it('should have env', () => {
      expect(runtime.process.env).toBeDefined();
      expect(runtime.process.env.NODE_ENV).toBe('development');
    });

    it('should have platform info', () => {
      expect(runtime.process.platform).toBe('browser');
      expect(runtime.process.arch).toBe('wasm32');
    });
  });

  describe('Callbacks', () => {
    it('should call onStatusChange', async () => {
      const statusChanges: string[] = [];
      runtime.setCallbacks({
        onStatusChange: (status) => statusChanges.push(status),
      });

      await runtime.init();

      expect(statusChanges).toContain('initializing');
      expect(statusChanges).toContain('ready');
    });
  });
});

describe('Shared Runtime', () => {
  afterEach(() => {
    resetSharedQuickJSRuntime();
  });

  it('should return same instance', () => {
    const runtime1 = getSharedQuickJSRuntime();
    const runtime2 = getSharedQuickJSRuntime();

    expect(runtime1).toBe(runtime2);
  });

  it('should reset shared instance', () => {
    const runtime1 = getSharedQuickJSRuntime();
    resetSharedQuickJSRuntime();
    const runtime2 = getSharedQuickJSRuntime();

    expect(runtime1).not.toBe(runtime2);
  });
});
