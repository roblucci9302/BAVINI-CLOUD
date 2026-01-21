/**
 * =============================================================================
 * BAVINI CLOUD - Vue Compiler Tests
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { VueCompiler } from './vue-compiler';

// Mock the CDN import
vi.mock(/* @vite-ignore */ 'https://esm.sh/@vue/compiler-sfc@3.5.13', () => ({
  parse: vi.fn(),
  compileScript: vi.fn(),
  compileTemplate: vi.fn(),
  compileStyleAsync: vi.fn(),
}));

describe('VueCompiler', () => {
  let compiler: VueCompiler;

  beforeEach(() => {
    compiler = new VueCompiler();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Properties', () => {
    it('should have correct name', () => {
      expect(compiler.name).toBe('Vue');
    });

    it('should handle .vue extensions', () => {
      expect(compiler.extensions).toEqual(['.vue']);
    });

    it('should identify Vue files', () => {
      expect(compiler.canHandle('App.vue')).toBe(true);
      expect(compiler.canHandle('/src/components/Button.vue')).toBe(true);
      expect(compiler.canHandle('component.tsx')).toBe(false);
      expect(compiler.canHandle('styles.css')).toBe(false);
      expect(compiler.canHandle('index.svelte')).toBe(false);
    });
  });

  describe('Initialization', () => {
    it('should throw error if compile called before init', async () => {
      const source = '<template><div>Test</div></template>';

      await expect(compiler.compile(source, 'Test.vue')).rejects.toThrow(
        'Vue compiler not initialized'
      );
    });

    it('should handle multiple init calls', async () => {
      // Mock successful init
      const mockCompiler = {
        parse: vi.fn().mockReturnValue({
          descriptor: {
            template: { content: '<div>Test</div>' },
            script: null,
            scriptSetup: null,
            styles: [],
          },
          errors: [],
        }),
        compileScript: vi.fn(),
        compileTemplate: vi.fn().mockReturnValue({
          code: 'function render() {}',
          errors: [],
          tips: [],
        }),
        compileStyleAsync: vi.fn(),
      };

      // @ts-expect-error - accessing private property for testing
      compiler._compiler = mockCompiler;
      // @ts-expect-error - accessing private property for testing
      compiler._initialized = true;

      // Multiple calls should work
      const result1 = await compiler.compile('<template><div>Test</div></template>', 'Test.vue');
      const result2 = await compiler.compile('<template><div>Test2</div></template>', 'Test2.vue');

      expect(result1).toBeDefined();
      expect(result2).toBeDefined();
    });
  });

  describe('Component Name Extraction', () => {
    it('should extract PascalCase component name from filename', () => {
      // Access private method via compile output
      // @ts-expect-error - accessing private method for testing
      const getName = (filename: string) => compiler.getComponentName(filename);

      expect(getName('Button.vue')).toBe('Button');
      expect(getName('/src/components/my-component.vue')).toBe('MyComponent');
      expect(getName('user_profile.vue')).toBe('UserProfile');
      expect(getName('index.vue')).toBe('Index');
    });
  });

  describe('Compile with Mock', () => {
    beforeEach(() => {
      // Set up mock compiler
      const mockCompiler = {
        parse: vi.fn().mockReturnValue({
          descriptor: {
            filename: 'Test.vue',
            source: '',
            template: { content: '<div class="test">Hello</div>', type: 'template', attrs: {}, loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } } },
            script: null,
            scriptSetup: {
              content: 'const message = ref("Hello");',
              type: 'script',
              attrs: { setup: true },
              setup: true,
              loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
            },
            styles: [
              {
                content: '.test { color: red; }',
                scoped: true,
                type: 'style',
                attrs: { scoped: true },
                loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
              },
            ],
            customBlocks: [],
          },
          errors: [],
        }),
        compileScript: vi.fn().mockReturnValue({
          content: `
import { ref } from 'vue';
const message = ref("Hello");
export default { setup() { return { message }; } }
`,
          type: 'script',
          attrs: {},
          loc: { start: { line: 1, column: 0 }, end: { line: 1, column: 0 } },
        }),
        compileTemplate: vi.fn().mockReturnValue({
          code: 'function render(_ctx) { return h("div", { class: "test" }, "Hello"); }',
          source: '<div class="test">Hello</div>',
          errors: [],
          tips: [],
        }),
        compileStyleAsync: vi.fn().mockResolvedValue({
          code: '.test[data-v-abc123] { color: red; }',
          errors: [],
        }),
      };

      // @ts-expect-error - accessing private property for testing
      compiler._compiler = mockCompiler;
      // @ts-expect-error - accessing private property for testing
      compiler._initialized = true;
    });

    it('should compile a Vue SFC successfully', async () => {
      const source = `
<template>
  <div class="test">{{ message }}</div>
</template>

<script setup>
const message = ref("Hello");
</script>

<style scoped>
.test { color: red; }
</style>
`;

      const result = await compiler.compile(source, 'Test.vue');

      expect(result.code).toBeDefined();
      expect(result.code.length).toBeGreaterThan(0);
      expect(result.css).toBe('.test[data-v-abc123] { color: red; }');
      expect(result.warnings).toEqual([]);
    });

    it('should include cssMetadata for scoped styles', async () => {
      const source = `
<template><div>Test</div></template>
<style scoped>.test { color: red; }</style>
`;

      const result = await compiler.compile(source, 'Test.vue');

      expect(result.cssMetadata).toBeDefined();
      expect(result.cssMetadata?.type).toBe('component');
      expect(result.cssMetadata?.scopeId).toBeDefined();
    });

    it('should handle components without styles', async () => {
      // Override mock for this test
      // @ts-expect-error - accessing private property for testing
      compiler._compiler.parse.mockReturnValue({
        descriptor: {
          template: { content: '<div>No styles</div>' },
          script: null,
          scriptSetup: { content: 'const x = 1;', setup: true },
          styles: [],
        },
        errors: [],
      });
      // @ts-expect-error - accessing private property for testing
      compiler._compiler.compileScript.mockReturnValue({
        content: 'const x = 1; export default {};',
      });

      const source = `
<template><div>No styles</div></template>
<script setup>const x = 1;</script>
`;

      const result = await compiler.compile(source, 'NoStyles.vue');

      expect(result.code).toBeDefined();
      expect(result.css).toBe('');
      expect(result.cssMetadata).toBeUndefined();
    });

    it('should handle parse errors', async () => {
      // @ts-expect-error - accessing private property for testing
      compiler._compiler.parse.mockReturnValue({
        descriptor: {},
        errors: [{ message: 'Unexpected token' }],
      });

      const badSource = '<template><div>Unclosed';

      await expect(compiler.compile(badSource, 'Bad.vue')).rejects.toThrow('Vue parsing failed');
    });

    it('should collect template compilation warnings', async () => {
      // @ts-expect-error - accessing private property for testing
      compiler._compiler.parse.mockReturnValue({
        descriptor: {
          template: { content: '<div v-if="x">Test</div>' },
          script: { content: 'export default {}' },
          scriptSetup: null,
          styles: [],
        },
        errors: [],
      });
      // @ts-expect-error - accessing private property for testing
      compiler._compiler.compileScript.mockReturnValue({
        content: 'export default {}',
      });
      // @ts-expect-error - accessing private property for testing
      compiler._compiler.compileTemplate.mockReturnValue({
        code: 'function render() {}',
        errors: [{ message: 'v-if without v-else' }],
        tips: [],
      });

      const source = `
<template><div v-if="x">Test</div></template>
<script>export default {}</script>
`;

      const result = await compiler.compile(source, 'Warning.vue');

      expect(result.warnings).toContain('v-if without v-else');
    });
  });

  describe('ID Generation', () => {
    it('should generate unique IDs', () => {
      // @ts-expect-error - accessing private method for testing
      const id1 = compiler.generateId();
      // @ts-expect-error - accessing private method for testing
      const id2 = compiler.generateId();
      // @ts-expect-error - accessing private method for testing
      const id3 = compiler.generateId();

      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });

  describe('Code Assembly', () => {
    it('should include Vue runtime imports', async () => {
      // Set up mock for this test
      // @ts-expect-error - accessing private property for testing
      compiler._compiler = {
        parse: vi.fn().mockReturnValue({
          descriptor: {
            template: { content: '<div>Test</div>' },
            script: null,
            scriptSetup: { content: 'const x = ref(1);', setup: true },
            styles: [],
          },
          errors: [],
        }),
        compileScript: vi.fn().mockReturnValue({
          content: `
import { ref } from 'vue';
export default { setup() { return { x: ref(1) }; } }
`,
        }),
        compileTemplate: vi.fn().mockReturnValue({
          code: 'function render() {}',
          errors: [],
          tips: [],
        }),
        compileStyleAsync: vi.fn(),
      };
      // @ts-expect-error - accessing private property for testing
      compiler._initialized = true;

      const result = await compiler.compile('<template><div>Test</div></template>', 'Test.vue');

      // Should include Vue imports
      expect(result.code).toContain('from \'vue\'');
    });
  });
});
