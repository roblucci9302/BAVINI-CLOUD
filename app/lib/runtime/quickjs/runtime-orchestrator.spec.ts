/**
 * =============================================================================
 * BAVINI Runtime Engine - Runtime Orchestrator Tests
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  RuntimeOrchestrator,
  createRuntimeOrchestrator,
  getSharedOrchestrator,
  resetSharedOrchestrator,
} from './runtime-orchestrator';
import { resetSharedFS } from './unified-fs';
import { resetSharedQuickJSRuntime } from './quickjs-runtime';

// Mock quickjs-emscripten
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
      // Simulate SSR render
      if (code.includes('SSR Placeholder')) {
        return {
          value: {
            value: JSON.stringify({
              html: '<div data-ssr="true">SSR Placeholder</div>',
              css: '',
              head: '',
            }),
            dispose: vi.fn(),
          },
        };
      }
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

describe('RuntimeOrchestrator', () => {
  let orchestrator: RuntimeOrchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSharedFS();
    resetSharedQuickJSRuntime();
    orchestrator = createRuntimeOrchestrator();
  });

  afterEach(() => {
    orchestrator.destroy();
    resetSharedOrchestrator();
  });

  describe('Initialization', () => {
    it('should start with idle status', () => {
      expect(orchestrator.status).toBe('idle');
    });

    it('should initialize successfully with SSR enabled', async () => {
      await orchestrator.init();
      expect(orchestrator.status).toBe('ready');
    });

    it('should handle multiple init calls', async () => {
      await orchestrator.init();
      await orchestrator.init();
      expect(orchestrator.status).toBe('ready');
    });

    it('should report SSR availability after init', async () => {
      await orchestrator.init();
      expect(orchestrator.isSSRAvailable()).toBe(true);
    });

    it('should create orchestrator without SSR', async () => {
      const noSSR = createRuntimeOrchestrator({ enableSSR: false });
      await noSSR.init();

      expect(noSSR.status).toBe('ready');
      expect(noSSR.isSSRAvailable()).toBe(false);

      noSSR.destroy();
    });
  });

  describe('File Synchronization', () => {
    it('should sync files from Map to QuickJS', () => {
      const files = new Map([
        ['/src/app.tsx', 'export default function App() {}'],
        ['/src/index.css', 'body { margin: 0; }'],
      ]);

      orchestrator.syncFilesToQuickJS(files);

      expect(orchestrator.fs.existsSync('/src/app.tsx')).toBe(true);
      expect(orchestrator.fs.existsSync('/src/index.css')).toBe(true);
    });

    it('should sync files from Record to QuickJS', () => {
      const files = {
        '/src/main.ts': 'console.log("Hello");',
        '/package.json': '{"name": "test"}',
      };

      orchestrator.syncFilesToQuickJS(files);

      expect(orchestrator.fs.readFileSync('/src/main.ts', 'utf-8')).toBe('console.log("Hello");');
    });
  });

  describe('Filesystem Snapshots', () => {
    it('should get filesystem snapshot', () => {
      orchestrator.fs.writeFileSync('/test.txt', 'content');

      const snapshot = orchestrator.getFilesystemSnapshot();

      expect(snapshot['/test.txt']).toBe('content');
    });

    it('should restore filesystem from snapshot', () => {
      const snapshot = {
        '/restored.txt': 'restored content',
        '/dir/file.js': 'export const x = 1;',
      };

      orchestrator.restoreFilesystemSnapshot(snapshot);

      expect(orchestrator.fs.readFileSync('/restored.txt', 'utf-8')).toBe('restored content');
      expect(orchestrator.fs.readFileSync('/dir/file.js', 'utf-8')).toBe('export const x = 1;');
    });
  });

  describe('SSR Rendering', () => {
    beforeEach(async () => {
      await orchestrator.init();
    });

    it('should render SSR with placeholder', async () => {
      const result = await orchestrator.renderSSR('/src/Page.astro', {});

      expect(result.html).toContain('SSR');
    });

    it('should return error when SSR not initialized', async () => {
      const noSSR = createRuntimeOrchestrator({ enableSSR: false });
      await noSSR.init();

      const result = await noSSR.renderSSR('/src/Page.astro');

      expect(result.error).toBeDefined();
      noSSR.destroy();
    });
  });

  describe('Code Execution', () => {
    beforeEach(async () => {
      await orchestrator.init();
    });

    it('should execute code in QuickJS', async () => {
      const result = await orchestrator.executeInQuickJS('1 + 1');

      expect(result.success).toBe(true);
    });

    it('should return error when QuickJS not available', async () => {
      const noSSR = createRuntimeOrchestrator({ enableSSR: false });
      await noSSR.init();

      const result = await noSSR.executeInQuickJS('1 + 1');

      expect(result.success).toBe(false);
      expect(result.error).toContain('not enabled');
      noSSR.destroy();
    });
  });

  describe('Lifecycle', () => {
    it('should destroy cleanly', async () => {
      await orchestrator.init();
      orchestrator.destroy();

      expect(orchestrator.status).toBe('idle');
      expect(orchestrator.quickjs).toBeNull();
    });

    it('should call status change callback', async () => {
      const statusChanges: string[] = [];
      orchestrator.setCallbacks({
        onStatusChange: (status) => statusChanges.push(status),
      });

      await orchestrator.init();

      expect(statusChanges).toContain('initializing');
      expect(statusChanges).toContain('ready');
    });
  });
});

describe('Shared Orchestrator', () => {
  afterEach(() => {
    resetSharedOrchestrator();
  });

  it('should return same instance', () => {
    const o1 = getSharedOrchestrator();
    const o2 = getSharedOrchestrator();

    expect(o1).toBe(o2);
  });

  it('should reset shared instance', () => {
    const o1 = getSharedOrchestrator();
    resetSharedOrchestrator();
    const o2 = getSharedOrchestrator();

    expect(o1).not.toBe(o2);
  });
});
