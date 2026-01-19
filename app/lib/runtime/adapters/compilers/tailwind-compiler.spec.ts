/**
 * =============================================================================
 * BAVINI CLOUD - Tailwind Compiler Tests
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TailwindCompiler, createTailwindCompiler } from './tailwind-compiler';

// Note: Dynamic CDN imports cannot be mocked directly, so tests run against
// the fallback behavior (without JIT initialization). This tests the core
// logic paths without requiring actual CDN access.

describe('TailwindCompiler', () => {
  let compiler: TailwindCompiler;

  beforeEach(() => {
    compiler = new TailwindCompiler();
    // Reset global state
    (globalThis as any).__tailwindInitialized = false;
    (globalThis as any).__tailwindPromise = null;
    (globalThis as any).__tailwindProcessor = null;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Properties', () => {
    it('should have correct name', () => {
      expect(compiler.name).toBe('Tailwind');
    });

    it('should handle .css extensions', () => {
      expect(compiler.extensions).toEqual(['.css']);
    });

    it('should identify CSS files', () => {
      expect(compiler.canHandle('styles.css')).toBe(true);
      expect(compiler.canHandle('/src/index.css')).toBe(true);
      expect(compiler.canHandle('app.scss')).toBe(false);
      expect(compiler.canHandle('component.tsx')).toBe(false);
    });
  });

  describe('needsCompilation', () => {
    it('should detect @tailwind directives', () => {
      expect(compiler.needsCompilation('@tailwind base;')).toBe(true);
      expect(compiler.needsCompilation('@tailwind components;')).toBe(true);
      expect(compiler.needsCompilation('@tailwind utilities;')).toBe(true);
    });

    it('should detect @apply directives', () => {
      expect(compiler.needsCompilation('.btn { @apply px-4 py-2; }')).toBe(true);
    });

    it('should detect @layer directives', () => {
      expect(compiler.needsCompilation('@layer base { * { box-sizing: border-box; } }')).toBe(true);
    });

    it('should return false for plain CSS', () => {
      expect(compiler.needsCompilation('.button { color: red; }')).toBe(false);
      expect(compiler.needsCompilation(':root { --color: blue; }')).toBe(false);
    });
  });

  describe('compile (without JIT)', () => {
    it('should pass through CSS without Tailwind directives', async () => {
      const css = '.button { color: red; background: blue; }';
      const result = await compiler.compile(css, 'test.css');

      expect(result.code).toBe(css);
      expect(result.warnings).toEqual([]);
    });

    it('should strip @tailwind directives in fallback mode', async () => {
      const css = `
@tailwind base;
@tailwind components;
@tailwind utilities;

.custom { color: red; }
`;
      const result = await compiler.compile(css, 'test.css');

      expect(result.code).not.toContain('@tailwind');
      expect(result.code).toContain('.custom { color: red; }');
      expect(result.warnings?.length).toBeGreaterThan(0);
    });

    it('should remove @apply directives in fallback mode', async () => {
      const css = `
.btn {
  @apply px-4 py-2;
  color: red;
}
`;
      const result = await compiler.compile(css, 'test.css');

      // @apply should be removed (not the whole rule)
      expect(result.code).not.toContain('@apply');
      expect(result.code).toContain('color: red');
      expect(result.warnings?.length).toBeGreaterThan(0);
    });

    it('should handle @layer blocks in fallback mode', async () => {
      const css = `
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
  }
}
`;
      const result = await compiler.compile(css, 'test.css');

      expect(result.code).not.toContain('@layer');
      expect(result.code).toContain('/* Layer: base */');
      expect(result.code).toContain('--background');
    });
  });

  describe('setContentFiles', () => {
    it('should accept content files', () => {
      const files = [
        { path: '/src/App.tsx', content: '<div className="flex items-center">' },
        { path: '/src/Button.tsx', content: '<button className="px-4 py-2">' },
      ];

      // Should not throw
      compiler.setContentFiles(files);
    });

    it('should handle empty content files', () => {
      compiler.setContentFiles([]);
      // Should not throw
    });
  });

  describe('Factory function', () => {
    it('should create a TailwindCompiler instance', () => {
      const instance = createTailwindCompiler();
      expect(instance).toBeInstanceOf(TailwindCompiler);
      expect(instance.name).toBe('Tailwind');
    });
  });

  describe('Real-world CSS examples', () => {
    it('should handle Shadcn-style CSS', async () => {
      const shadcnCSS = `
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
  }

  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
  }
}

@layer base {
  * {
    @apply border-border;
  }
  body {
    @apply bg-background text-foreground;
  }
}
`;
      const result = await compiler.compile(shadcnCSS, '/src/index.css');

      // Should not contain raw directives in fallback mode
      expect(result.code).not.toContain('@tailwind base');
      expect(result.code).not.toContain('@tailwind components');
      expect(result.code).not.toContain('@tailwind utilities');

      // CSS variables should be preserved
      expect(result.code).toContain('--background');
      expect(result.code).toContain('--foreground');
    });

    it('should preserve CSS custom properties', async () => {
      const css = `
:root {
  --primary: 222.2 47.4% 11.2%;
  --secondary: 210 40% 96.1%;
}
`;
      const result = await compiler.compile(css, 'vars.css');

      expect(result.code).toContain('--primary');
      expect(result.code).toContain('--secondary');
    });
  });
});
