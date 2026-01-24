/**
 * =============================================================================
 * BAVINI CLOUD - Astro Compiler Tests
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { AstroCompiler } from './astro-compiler';

describe('AstroCompiler', () => {
  let compiler: AstroCompiler;

  beforeEach(() => {
    compiler = new AstroCompiler();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Properties', () => {
    it('should have correct name', () => {
      expect(compiler.name).toBe('Astro');
    });

    it('should handle .astro extensions', () => {
      expect(compiler.extensions).toEqual(['.astro']);
    });

    it('should identify Astro files', () => {
      expect(compiler.canHandle('Page.astro')).toBe(true);
      expect(compiler.canHandle('/src/pages/index.astro')).toBe(true);
      expect(compiler.canHandle('/src/components/Header.astro')).toBe(true);
      expect(compiler.canHandle('component.tsx')).toBe(false);
      expect(compiler.canHandle('styles.css')).toBe(false);
      expect(compiler.canHandle('index.vue')).toBe(false);
      expect(compiler.canHandle('app.svelte')).toBe(false);
    });
  });

  describe('Initialization', () => {
    it('should throw error if compile called before init', async () => {
      const source = '---\nconst title = "Hello";\n---\n<h1>{title}</h1>';

      await expect(compiler.compile(source, 'Test.astro')).rejects.toThrow(
        'Astro compiler not initialized'
      );
    });
  });

  describe('Component Name Extraction', () => {
    it('should extract PascalCase component name from filename', () => {
      // @ts-expect-error - accessing private method for testing
      const getName = (filename: string) => compiler.getComponentName(filename);

      expect(getName('Header.astro')).toBe('Header');
      expect(getName('/src/pages/index.astro')).toBe('Index');
      expect(getName('/src/components/nav-bar.astro')).toBe('NavBar');
      expect(getName('about-us.astro')).toBe('AboutUs');
    });
  });

  describe('Style Extraction', () => {
    it('should extract styles from <style> tags', () => {
      // @ts-expect-error - accessing private method for testing
      const extractStyles = (source: string, filename: string) =>
        compiler.extractStylesFromSource(source, filename);

      const source = `
---
const title = "Test";
---
<h1>{title}</h1>
<style>
  h1 { color: red; }
  .container { padding: 20px; }
</style>
`;

      const css = extractStyles(source, 'Test.astro');

      // CSS is now scoped with auto-generated class names like h1.astro-xxxxx
      expect(css).toContain('color: red;');
      expect(css).toContain('padding: 20px;');
      expect(css).toMatch(/h1\.astro-\w+/); // Scoped selector
    });

    it('should extract multiple style blocks', () => {
      // @ts-expect-error - accessing private method for testing
      const extractStyles = (source: string, filename: string) =>
        compiler.extractStylesFromSource(source, filename);

      const source = `
<div>Content</div>
<style>
  .first { color: blue; }
</style>
<style is:global>
  body { margin: 0; }
</style>
`;

      const css = extractStyles(source, 'Multi.astro');

      // Scoped styles have auto-generated class suffixes
      expect(css).toContain('color: blue;');
      expect(css).toMatch(/\.first\.astro-\w+/); // Scoped selector
      // Global styles remain unchanged
      expect(css).toContain('body { margin: 0; }');
    });

    it('should return empty string for components without styles', () => {
      // @ts-expect-error - accessing private method for testing
      const extractStyles = (source: string, filename: string) =>
        compiler.extractStylesFromSource(source, filename);

      const source = '<h1>No styles here</h1>';

      const css = extractStyles(source, 'NoStyles.astro');

      expect(css).toBe('');
    });
  });

  describe('TypeScript Declaration Stripping', () => {
    it('should remove interface declarations', () => {
      // @ts-expect-error - accessing private method for testing
      const stripTS = (code: string) => compiler.stripTypeScriptDeclarations(code);

      const code = `
interface Props {
  title: string;
  count: number;
}
const x = 1;
`;

      const result = stripTS(code);

      expect(result).not.toContain('interface Props');
      expect(result).toContain('const x = 1');
    });

    it('should remove type aliases', () => {
      // @ts-expect-error - accessing private method for testing
      const stripTS = (code: string) => compiler.stripTypeScriptDeclarations(code);

      const code = `
type ButtonVariant = 'primary' | 'secondary';
const variant = 'primary';
`;

      const result = stripTS(code);

      expect(result).not.toContain('type ButtonVariant');
      expect(result).toContain("const variant = 'primary'");
    });

    it('should remove type-only imports', () => {
      // @ts-expect-error - accessing private method for testing
      const stripTS = (code: string) => compiler.stripTypeScriptDeclarations(code);

      const code = `
import type { Props } from './types';
import { something } from './utils';
`;

      const result = stripTS(code);

      expect(result).not.toContain("import type { Props }");
      expect(result).toContain("import { something }");
    });

    it('should remove type annotations from variable declarations', () => {
      // @ts-expect-error - accessing private method for testing
      const stripTS = (code: string) => compiler.stripTypeScriptDeclarations(code);

      const code = `const title: string = "Hello";`;

      const result = stripTS(code);

      expect(result).toContain('const title = "Hello"');
      expect(result).not.toContain(': string');
    });

    it('should remove as Type assertions', () => {
      // @ts-expect-error - accessing private method for testing
      const stripTS = (code: string) => compiler.stripTypeScriptDeclarations(code);

      const code = `const props = Astro.props as Props;`;

      const result = stripTS(code);

      expect(result).not.toContain('as Props');
    });
  });

  describe('Astro Shims Generation', () => {
    it('should generate Astro runtime shims', () => {
      // @ts-expect-error - accessing private method for testing
      const shims = compiler.getMissingAstroFunctions();

      // Check for key shim functions
      expect(shims).toContain('$$createComponent');
      expect(shims).toContain('$$renderTemplate');
      expect(shims).toContain('$$renderComponent');
      expect(shims).toContain('$$addAttribute');
      expect(shims).toContain('$$maybeRenderHead');
      expect(shims).toContain('$result');
      expect(shims).toContain('$$createAstro');
    });

    it('should attach shims to globalThis', () => {
      // @ts-expect-error - accessing private method for testing
      const shims = compiler.getMissingAstroFunctions();

      expect(shims).toContain('globalThis');
      expect(shims).toContain('g.$$createComponent');
      expect(shims).toContain('g.$result');
    });
  });

  describe('Compile with Mock', () => {
    beforeEach(() => {
      // Set up mock compiler
      const mockCompiler = {
        transform: vi.fn().mockResolvedValue({
          code: `
const $$createComponent = (fn) => fn;
const title = "Hello World";
export const Component = $$createComponent((result, props) => {
  return $$renderTemplate\`<h1>\${title}</h1>\`;
});
export default Component;
`,
          map: '{"version":3}',
          diagnostics: [],
        }),
        parse: vi.fn().mockResolvedValue({ ast: {}, diagnostics: [] }),
        initialize: vi.fn().mockResolvedValue(undefined),
      };

      // @ts-expect-error - accessing private property for testing
      compiler._compiler = mockCompiler;
      // @ts-expect-error - accessing private property for testing
      compiler._initialized = true;
    });

    it('should compile an Astro component successfully', async () => {
      const source = `
---
const title = "Hello World";
---
<h1>{title}</h1>
<style>
  h1 { color: navy; }
</style>
`;

      const result = await compiler.compile(source, 'Page.astro');

      expect(result.code).toBeDefined();
      expect(result.code.length).toBeGreaterThan(0);
      // CSS is scoped with auto-generated class names
      expect(result.css).toContain('color: navy;');
      expect(result.css).toMatch(/h1\.astro-\w+/);
      expect(result.warnings).toEqual([]);
    });

    it('should include cssMetadata for component styles', async () => {
      const source = `
<div>Test</div>
<style>.test { color: red; }</style>
`;

      const result = await compiler.compile(source, 'Test.astro');

      expect(result.cssMetadata).toBeDefined();
      expect(result.cssMetadata?.type).toBe('component');
    });

    it('should handle components without styles', async () => {
      const source = `
---
const message = "No styles";
---
<p>{message}</p>
`;

      const result = await compiler.compile(source, 'NoStyles.astro');

      expect(result.code).toBeDefined();
      expect(result.css).toBeUndefined();
      expect(result.cssMetadata).toBeUndefined();
    });

    it('should collect compilation warnings', async () => {
      // @ts-expect-error - accessing private property for testing
      compiler._compiler.transform.mockResolvedValue({
        code: 'export default Component;',
        diagnostics: [
          {
            code: 1001,
            text: 'Unused variable: foo',
            severity: 2, // warning
            location: { file: 'Test.astro', line: 5, column: 0 },
          },
        ],
      });

      const result = await compiler.compile('<div>Test</div>', 'Test.astro');

      expect(result.warnings?.length).toBe(1);
      expect(result.warnings?.[0]).toContain('Unused variable');
    });

    it('should throw on compilation errors', async () => {
      // @ts-expect-error - accessing private property for testing
      compiler._compiler.transform.mockResolvedValue({
        code: '',
        diagnostics: [
          {
            code: 1000,
            text: 'Syntax error: Unexpected token',
            severity: 1, // error
            location: { file: 'Bad.astro', line: 3, column: 5 },
          },
        ],
      });

      await expect(compiler.compile('<div>Bad', 'Bad.astro')).rejects.toThrow(
        'Astro compilation failed'
      );
    });
  });

  describe('Post-Processing', () => {
    beforeEach(() => {
      // @ts-expect-error - accessing private property for testing
      compiler._compiler = {
        transform: vi.fn(),
        initialize: vi.fn(),
      };
      // @ts-expect-error - accessing private property for testing
      compiler._initialized = true;
    });

    it('should remove astro/internal imports', () => {
      // @ts-expect-error - accessing private method for testing
      const processed = compiler.postProcessCode(`
import { $$createComponent, $$render } from "astro/internal";
const Component = $$createComponent(() => {});
`, 'Test.astro');

      expect(processed).not.toContain('from "astro/internal"');
      expect(processed).toContain('Astro internals provided via shims');
    });

    it('should remove CSS virtual imports', () => {
      // @ts-expect-error - accessing private method for testing
      const processed = compiler.postProcessCode(`
import "/src/pages/index.astro?astro&type=style&index=0&lang.css";
const Component = () => {};
`, 'Test.astro');

      expect(processed).not.toContain('?astro&type=style');
      expect(processed).toContain('CSS extracted separately');
    });

    it('should replace $result property access with globalThis', () => {
      // @ts-expect-error - accessing private method for testing
      const processed = compiler.postProcessCode(`
const astro = $result.createAstro(Astro, props);
`, 'Test.astro');

      expect(processed).toContain('globalThis.$result.createAstro');
    });

    it('should replace $$ function calls with globalThis', () => {
      // @ts-expect-error - accessing private method for testing
      const processed = compiler.postProcessCode(`
const comp = $$renderComponent(result, "Button", Button, {});
const created = $$createComponent(() => {});
const head = $$maybeRenderHead(result);
`, 'Test.astro');

      // Function calls with () should be replaced
      expect(processed).toContain('globalThis.$$renderComponent(');
      expect(processed).toContain('globalThis.$$createComponent(');
      expect(processed).toContain('globalThis.$$maybeRenderHead(');
    });

    it('should handle tagged template literals in shims', () => {
      // @ts-expect-error - accessing private method for testing
      const processed = compiler.postProcessCode(`
const html = $$renderTemplate\`<div>Test</div>\`;
`, 'Test.astro');

      // Tagged template literals are handled via the shims injected at the top
      // The shims define globalThis.$$renderTemplate which gets called
      expect(processed).toContain('g.$$renderTemplate');
    });

    it('should inject Astro shims at the beginning', () => {
      // @ts-expect-error - accessing private method for testing
      const processed = compiler.postProcessCode(`
const Component = $$createComponent(() => {});
export default Component;
`, 'Test.astro');

      // Shims should be at the beginning
      expect(processed.indexOf('globalThis')).toBeLessThan(processed.indexOf('Component'));
    });
  });

  describe('Browser Wrapping', () => {
    beforeEach(() => {
      // @ts-expect-error - accessing private property for testing
      compiler._compiler = {
        transform: vi.fn(),
        initialize: vi.fn(),
      };
      // @ts-expect-error - accessing private property for testing
      compiler._initialized = true;
    });

    it('should wrap component for browser preview when no default export', () => {
      // @ts-expect-error - accessing private method for testing
      const wrapped = compiler.wrapForBrowser(`
const Component = $$createComponent(() => {
  return $$renderTemplate\`<div>Hello</div>\`;
});
`, 'Hello.astro');

      // The wrapper now uses a different pattern - checking for __astroComponent
      expect(wrapped).toContain('__astroComponent');
      expect(wrapped).toContain('Browser preview wrapper');
    });
  });

  describe('SSR Availability', () => {
    it('should check SSR availability', async () => {
      // This will fail in test environment since SSR engine is not available
      const available = await compiler.isSSRAvailable();

      // In test environment, SSR is typically not available
      expect(typeof available).toBe('boolean');
    });
  });
});
