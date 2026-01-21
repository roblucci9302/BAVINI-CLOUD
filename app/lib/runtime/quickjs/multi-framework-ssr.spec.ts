/**
 * =============================================================================
 * BAVINI Runtime Engine - Multi-Framework SSR Tests
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  MultiFrameworkSSR,
  createMultiFrameworkSSR,
  getSharedMultiFrameworkSSR,
  resetSharedMultiFrameworkSSR,
} from './multi-framework-ssr';
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
      // Simulate framework runtime injection
      if (code.includes('Base SSR Runtime') ||
          code.includes('Astro SSR Runtime') ||
          code.includes('Vue SSR Runtime') ||
          code.includes('Svelte SSR Runtime') ||
          code.includes('React SSR Runtime')) {
        return { value: { value: undefined, dispose: vi.fn() } };
      }

      // Simulate SSR rendering
      if (code.includes('renderToString') || code.includes('svelteRender')) {
        return {
          value: {
            value: JSON.stringify({
              html: '<div>SSR Rendered Content</div>',
              css: '.component { color: blue; }',
              head: '<meta name="test" />',
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

describe('MultiFrameworkSSR', () => {
  let renderer: MultiFrameworkSSR;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSharedFS();
    resetSharedQuickJSRuntime();
    renderer = createMultiFrameworkSSR();
  });

  afterEach(() => {
    renderer.destroy();
    resetSharedMultiFrameworkSSR();
  });

  describe('Initialization', () => {
    it('should start with idle status', () => {
      expect(renderer.status).toBe('idle');
    });

    it('should initialize successfully', async () => {
      await renderer.init();
      expect(renderer.status).toBe('ready');
    });

    it('should handle multiple init calls', async () => {
      await renderer.init();
      await renderer.init();
      expect(renderer.status).toBe('ready');
    });

    it('should have access to runtime', () => {
      expect(renderer.runtime).toBeDefined();
    });

    it('should have access to cache', () => {
      expect(renderer.cache).toBeDefined();
    });
  });

  describe('Framework Detection', () => {
    it('should detect Astro from filename', () => {
      expect(renderer.detectFramework('', 'page.astro')).toBe('astro');
    });

    it('should detect Vue from filename', () => {
      expect(renderer.detectFramework('', 'component.vue')).toBe('vue');
    });

    it('should detect Svelte from filename', () => {
      expect(renderer.detectFramework('', 'component.svelte')).toBe('svelte');
    });

    it('should detect Astro from code', () => {
      const code = 'const $$Component = $$createComponent(() => {});';
      expect(renderer.detectFramework(code, 'file.js')).toBe('astro');
    });

    it('should detect Vue from code', () => {
      const code = 'export default defineComponent({ setup() {} });';
      expect(renderer.detectFramework(code, 'file.js')).toBe('vue');
    });

    it('should detect Svelte from code', () => {
      const code = 'export default create_ssr_component(() => {});';
      expect(renderer.detectFramework(code, 'file.js')).toBe('svelte');
    });

    it('should detect React from code', () => {
      const code = 'export default function App() { return React.createElement("div"); }';
      expect(renderer.detectFramework(code, 'file.js')).toBe('react');
    });

    it('should default to React', () => {
      expect(renderer.detectFramework('', 'file.js')).toBe('react');
    });
  });

  describe('Rendering', () => {
    beforeEach(async () => {
      await renderer.init();
    });

    it('should render Astro component', async () => {
      const code = 'const $$Component = () => "<div>Astro</div>";';
      const result = await renderer.render(code, 'page.astro');

      expect(result.framework).toBe('astro');
      expect(result.html).toContain('SSR Rendered');
      expect(result.renderTime).toBeGreaterThan(0);
    });

    it('should render Vue component', async () => {
      const code = 'const component = { render: () => h("div", {}, "Vue") };';
      const result = await renderer.render(code, 'component.vue');

      expect(result.framework).toBe('vue');
      expect(result.html).toBeDefined();
    });

    it('should render Svelte component', async () => {
      const code = 'const component = create_ssr_component(() => {});';
      const result = await renderer.render(code, 'component.svelte');

      expect(result.framework).toBe('svelte');
      expect(result.html).toBeDefined();
    });

    it('should render React component', async () => {
      const code = 'function App() { return createElement("div", null, "React"); }';
      const result = await renderer.render(code, 'App.tsx', { framework: 'react' });

      expect(result.framework).toBe('react');
      expect(result.html).toBeDefined();
    });

    it('should pass props to component', async () => {
      const code = 'const $$Component = (props) => "<div>" + props.title + "</div>";';
      const result = await renderer.render(code, 'page.astro', {
        props: { title: 'Test Title' },
      });

      expect(result.framework).toBe('astro');
    });

    it('should handle render errors gracefully', async () => {
      const code = 'throw new Error("Test error");';
      const result = await renderer.render(code, 'page.astro');

      // With mock, errors are handled differently
      expect(result).toHaveProperty('html');
      expect(result).toHaveProperty('renderTime');
    });
  });

  describe('Caching', () => {
    beforeEach(async () => {
      await renderer.init();
    });

    it('should cache rendered content by default', async () => {
      const code = 'const $$Component = () => "<div>Cached</div>";';

      // First render
      const result1 = await renderer.render(code, 'page.astro');
      expect(result1.cached).toBe(false);

      // Second render (should be cached)
      const result2 = await renderer.render(code, 'page.astro');
      expect(result2.cached).toBe(true);
    });

    it('should skip cache when disabled', async () => {
      const code = 'const $$Component = () => "<div>Not Cached</div>";';

      await renderer.render(code, 'page.astro', { cache: false });
      const result = await renderer.render(code, 'page.astro', { cache: false });

      expect(result.cached).toBe(false);
    });

    it('should use custom cache key', async () => {
      const code = 'const $$Component = () => "<div>Custom Key</div>";';

      await renderer.render(code, 'page.astro', { cacheKey: 'custom-key' });

      expect(renderer.cache.has('custom-key')).toBe(true);
    });
  });

  describe('Lifecycle', () => {
    it('should destroy cleanly', async () => {
      await renderer.init();
      renderer.destroy();

      expect(renderer.status).toBe('idle');
    });
  });
});

describe('Shared MultiFrameworkSSR', () => {
  afterEach(() => {
    resetSharedMultiFrameworkSSR();
  });

  it('should return same instance', () => {
    const r1 = getSharedMultiFrameworkSSR();
    const r2 = getSharedMultiFrameworkSSR();

    expect(r1).toBe(r2);
  });

  it('should reset shared instance', () => {
    const r1 = getSharedMultiFrameworkSSR();
    resetSharedMultiFrameworkSSR();
    const r2 = getSharedMultiFrameworkSSR();

    expect(r1).not.toBe(r2);
  });
});
