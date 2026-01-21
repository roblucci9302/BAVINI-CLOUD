/**
 * =============================================================================
 * BAVINI CLOUD - Svelte Compiler Tests
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { SvelteCompiler } from './svelte-compiler';

describe('SvelteCompiler', () => {
  let compiler: SvelteCompiler;

  beforeEach(() => {
    compiler = new SvelteCompiler();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Properties', () => {
    it('should have correct name', () => {
      expect(compiler.name).toBe('Svelte');
    });

    it('should handle .svelte extensions', () => {
      expect(compiler.extensions).toEqual(['.svelte']);
    });

    it('should identify Svelte files', () => {
      expect(compiler.canHandle('App.svelte')).toBe(true);
      expect(compiler.canHandle('/src/components/Button.svelte')).toBe(true);
      expect(compiler.canHandle('component.tsx')).toBe(false);
      expect(compiler.canHandle('styles.css')).toBe(false);
      expect(compiler.canHandle('index.vue')).toBe(false);
      expect(compiler.canHandle('page.astro')).toBe(false);
    });
  });

  describe('Initialization', () => {
    it('should throw error if compile called before init', async () => {
      const source = '<script>let count = 0;</script><button>{count}</button>';

      await expect(compiler.compile(source, 'Test.svelte')).rejects.toThrow(
        'Svelte compiler not initialized'
      );
    });
  });

  describe('Component Name Extraction', () => {
    it('should extract PascalCase component name from filename', () => {
      // @ts-expect-error - accessing private method for testing
      const getName = (filename: string) => compiler.getComponentName(filename);

      expect(getName('Button.svelte')).toBe('Button');
      expect(getName('/src/components/my-component.svelte')).toBe('MyComponent');
      expect(getName('user_profile.svelte')).toBe('UserProfile');
      expect(getName('index.svelte')).toBe('Index');
      expect(getName('nav-bar.svelte')).toBe('NavBar');
    });
  });

  describe('Compile with Mock', () => {
    beforeEach(() => {
      // Set up mock compiler
      const mockCompiler = {
        compile: vi.fn().mockReturnValue({
          js: {
            code: `
import { SvelteComponent, init, safe_not_equal, element, text, append } from "svelte/internal";

function create_fragment(ctx) {
  let button;
  let t;
  return {
    c() {
      button = element("button");
      t = text(ctx[0]);
    },
    m(target, anchor) {
      append(target, button);
      append(button, t);
    },
    p(ctx, [dirty]) {
      if (dirty & 1) set_data(t, ctx[0]);
    },
    d(detaching) {
      if (detaching) detach(button);
    }
  };
}

export default class Counter extends SvelteComponent {
  constructor(options) {
    super();
    init(this, options, null, create_fragment, safe_not_equal, {});
  }
}
`,
            map: { version: 3, sources: ['Counter.svelte'] },
          },
          css: {
            code: '.counter { color: blue; }',
            map: null,
          },
          ast: { html: {}, css: {}, instance: {} },
          warnings: [],
          vars: [{ name: 'count', export_name: undefined }],
          stats: { timings: { total: 5 } },
        }),
        parse: vi.fn(),
        preprocess: vi.fn(),
        VERSION: '4.2.19',
      };

      // @ts-expect-error - accessing private property for testing
      compiler._compiler = mockCompiler;
      // @ts-expect-error - accessing private property for testing
      compiler._initialized = true;
    });

    it('should compile a Svelte component successfully', async () => {
      const source = `
<script>
  let count = 0;
</script>

<button on:click={() => count++}>
  Clicked {count} times
</button>

<style>
  .counter { color: blue; }
</style>
`;

      const result = await compiler.compile(source, 'Counter.svelte');

      expect(result.code).toBeDefined();
      expect(result.code.length).toBeGreaterThan(0);
      expect(result.css).toBe('.counter { color: blue; }');
      expect(result.warnings).toEqual([]);
    });

    it('should include cssMetadata for component styles', async () => {
      const source = `
<script>let x = 1;</script>
<div>Test</div>
<style>.test { color: red; }</style>
`;

      const result = await compiler.compile(source, 'Test.svelte');

      expect(result.cssMetadata).toBeDefined();
      expect(result.cssMetadata?.type).toBe('component');
    });

    it('should handle components without styles', async () => {
      // Override mock for this test
      // @ts-expect-error - accessing private property for testing
      compiler._compiler.compile.mockReturnValue({
        js: { code: 'export default class NoStyles {}', map: null },
        css: null,
        ast: {},
        warnings: [],
        vars: [],
        stats: { timings: { total: 1 } },
      });

      const source = `
<script>let x = 1;</script>
<div>{x}</div>
`;

      const result = await compiler.compile(source, 'NoStyles.svelte');

      expect(result.code).toBeDefined();
      expect(result.css).toBeUndefined();
      expect(result.cssMetadata).toBeUndefined();
    });

    it('should collect compilation warnings', async () => {
      // @ts-expect-error - accessing private property for testing
      compiler._compiler.compile.mockReturnValue({
        js: { code: 'export default class Test {}', map: null },
        css: null,
        ast: {},
        warnings: [
          {
            code: 'a11y-missing-attribute',
            message: '<img> element should have an alt attribute',
            filename: 'Test.svelte',
            start: { line: 3, column: 0 },
            end: { line: 3, column: 10 },
          },
        ],
        vars: [],
        stats: { timings: { total: 1 } },
      });

      const source = `
<script>let src = 'image.png';</script>
<img {src}>
`;

      const result = await compiler.compile(source, 'Test.svelte');

      expect(result.warnings?.length).toBe(1);
      expect(result.warnings?.[0]).toContain('alt attribute');
    });

    it('should handle compilation errors', async () => {
      // @ts-expect-error - accessing private property for testing
      compiler._compiler.compile.mockImplementation(() => {
        throw new Error('Unexpected token at line 2');
      });

      const badSource = `
<script>
  let x = ;  // syntax error
</script>
`;

      await expect(compiler.compile(badSource, 'Bad.svelte')).rejects.toThrow('Unexpected token');
    });
  });

  describe('Post-Processing', () => {
    beforeEach(() => {
      // @ts-expect-error - accessing private property for testing
      compiler._compiler = {
        compile: vi.fn(),
        VERSION: '4.2.19',
      };
      // @ts-expect-error - accessing private property for testing
      compiler._initialized = true;
    });

    it('should replace Svelte internal imports with CDN URLs', () => {
      // @ts-expect-error - accessing private method for testing
      const processed = compiler.postProcessCode(`
import { SvelteComponent } from "svelte/internal";
import { writable } from "svelte/store";
import { fade } from "svelte/transition";
`);

      expect(processed).toContain('from "https://esm.sh/svelte@4.2.19/internal"');
      expect(processed).toContain('from "https://esm.sh/svelte@4.2.19/store"');
      expect(processed).toContain('from "https://esm.sh/svelte@4.2.19/transition"');
    });

    it('should replace svelte imports with CDN URLs', () => {
      // @ts-expect-error - accessing private method for testing
      const processed = compiler.postProcessCode(`
import { onMount } from "svelte";
`);

      expect(processed).toContain('from "https://esm.sh/svelte@4.2.19"');
    });

    it('should replace svelte/motion imports', () => {
      // @ts-expect-error - accessing private method for testing
      const processed = compiler.postProcessCode(`
import { spring, tweened } from "svelte/motion";
`);

      expect(processed).toContain('from "https://esm.sh/svelte@4.2.19/motion"');
    });

    it('should replace svelte/animate imports', () => {
      // @ts-expect-error - accessing private method for testing
      const processed = compiler.postProcessCode(`
import { flip } from "svelte/animate";
`);

      expect(processed).toContain('from "https://esm.sh/svelte@4.2.19/animate"');
    });

    it('should replace svelte/easing imports', () => {
      // @ts-expect-error - accessing private method for testing
      const processed = compiler.postProcessCode(`
import { cubicOut } from "svelte/easing";
`);

      expect(processed).toContain('from "https://esm.sh/svelte@4.2.19/easing"');
    });
  });

  describe('Source Map', () => {
    beforeEach(() => {
      // @ts-expect-error - accessing private property for testing
      compiler._compiler = {
        compile: vi.fn().mockReturnValue({
          js: {
            code: 'export default class Test {}',
            map: { version: 3, sources: ['Test.svelte'], mappings: 'AAAA' },
          },
          css: null,
          ast: {},
          warnings: [],
          vars: [],
          stats: { timings: { total: 1 } },
        }),
        VERSION: '4.2.19',
      };
      // @ts-expect-error - accessing private property for testing
      compiler._initialized = true;
    });

    it('should include source map in result', async () => {
      const result = await compiler.compile('<div>Test</div>', 'Test.svelte');

      expect(result.map).toBeDefined();
      expect(result.map).toContain('version');
    });

    it('should handle string source maps', async () => {
      // @ts-expect-error - accessing private property for testing
      compiler._compiler.compile.mockReturnValue({
        js: {
          code: 'export default class Test {}',
          map: '{"version":3,"sources":["Test.svelte"]}',
        },
        css: null,
        ast: {},
        warnings: [],
        vars: [],
        stats: { timings: { total: 1 } },
      });

      const result = await compiler.compile('<div>Test</div>', 'Test.svelte');

      expect(result.map).toBe('{"version":3,"sources":["Test.svelte"]}');
    });
  });
});
