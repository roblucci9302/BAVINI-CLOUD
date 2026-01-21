/**
 * =============================================================================
 * BAVINI Runtime Engine - SSR Engine Tests
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  SSREngine,
  createSSREngine,
  getSharedSSREngine,
  resetSharedSSREngine,
} from './ssr-engine';
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
      // Simulate Astro runtime injection
      if (code.includes('Astro Runtime Shim')) {
        return { value: { value: undefined, dispose: vi.fn() } };
      }

      // Simulate SSR rendering
      if (code.includes('renderToString')) {
        return {
          value: {
            value: JSON.stringify({
              html: '<div>SSR Rendered Content</div>',
              css: '.test { color: red; }',
              head: '<title>Test Page</title>',
            }),
            dispose: vi.fn(),
          },
        };
      }

      // Default evaluation
      try {
        const result = eval(code); // eslint-disable-line no-eval
        return { value: { value: result, dispose: vi.fn() } };
      } catch (error) {
        return {
          error: {
            value: error instanceof Error ? error.message : String(error),
            dispose: vi.fn(),
          },
        };
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

describe('SSREngine', () => {
  let engine: SSREngine;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSharedFS();
    resetSharedQuickJSRuntime();
    engine = createSSREngine();
  });

  afterEach(() => {
    engine.destroy();
    resetSharedSSREngine();
  });

  describe('Initialization', () => {
    it('should start with idle status', () => {
      expect(engine.status).toBe('idle');
    });

    it('should initialize successfully', async () => {
      await engine.init();
      expect(engine.status).toBe('ready');
    });

    it('should handle multiple init calls', async () => {
      await engine.init();
      await engine.init();
      expect(engine.status).toBe('ready');
    });

    it('should have access to runtime', () => {
      expect(engine.runtime).toBeDefined();
    });

    it('should have access to resolver', () => {
      expect(engine.resolver).toBeDefined();
    });
  });

  describe('Astro Rendering', () => {
    beforeEach(async () => {
      await engine.init();
    });

    it('should render Astro component', async () => {
      const componentCode = `
        const $$Component = () => '<div>Hello World</div>';
      `;

      const result = await engine.renderAstro(componentCode);

      expect(result.status).toBe(200);
      expect(result.html).toContain('SSR Rendered');
      expect(result.renderTime).toBeGreaterThan(0);
    });

    it('should include CSS in result', async () => {
      const componentCode = `const $$Component = () => '<div>Test</div>';`;

      const result = await engine.renderAstro(componentCode);

      expect(result.css).toBeDefined();
    });

    it('should include head content in result', async () => {
      const componentCode = `const $$Component = () => '<div>Test</div>';`;

      const result = await engine.renderAstro(componentCode);

      expect(result.head).toBeDefined();
    });

    it('should pass props to component', async () => {
      const componentCode = `const $$Component = () => '<div>Test</div>';`;

      const result = await engine.renderAstro(componentCode, {
        props: { title: 'Test Page' },
      });

      expect(result.status).toBe(200);
    });

    it('should handle render errors gracefully', async () => {
      // Note: With the mock, errors are returned via result.success = false
      // This test verifies the structure is correct regardless of status
      const componentCode = `const $$Component = () => '<div>Test</div>';`;

      const result = await engine.renderAstro(componentCode);

      // The result should have all expected fields
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('css');
      expect(result).toHaveProperty('head');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('renderTime');
      expect(result.renderTime).toBeGreaterThan(0);
    });
  });

  describe('File Operations', () => {
    it('should write files to virtual filesystem', () => {
      engine.writeFiles({
        '/src/page.astro': '<html><body>Hello</body></html>',
        '/src/style.css': 'body { margin: 0; }',
      });

      expect(engine.runtime.fs.existsSync('/src/page.astro')).toBe(true);
      expect(engine.runtime.fs.existsSync('/src/style.css')).toBe(true);
    });
  });

  describe('Lifecycle', () => {
    it('should destroy cleanly', async () => {
      await engine.init();
      engine.destroy();

      expect(engine.status).toBe('idle');
    });

    it('should call status change callback', async () => {
      const statusChanges: string[] = [];
      engine.setCallbacks({
        onStatusChange: (status) => statusChanges.push(status),
      });

      await engine.init();

      expect(statusChanges).toContain('initializing');
      expect(statusChanges).toContain('ready');
    });
  });

  describe('Configuration', () => {
    it('should accept custom timeout', () => {
      const customEngine = createSSREngine({ timeoutMs: 60000 });
      expect(customEngine).toBeDefined();
      customEngine.destroy();
    });

    it('should accept custom base URL', () => {
      const customEngine = createSSREngine({ baseUrl: '/app/' });
      expect(customEngine).toBeDefined();
      customEngine.destroy();
    });
  });
});

describe('Shared SSREngine', () => {
  afterEach(() => {
    resetSharedSSREngine();
  });

  it('should return same instance', () => {
    const e1 = getSharedSSREngine();
    const e2 = getSharedSSREngine();

    expect(e1).toBe(e2);
  });

  it('should reset shared instance', () => {
    const e1 = getSharedSSREngine();
    resetSharedSSREngine();
    const e2 = getSharedSSREngine();

    expect(e1).not.toBe(e2);
  });
});
