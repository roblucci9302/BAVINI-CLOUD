/**
 * =============================================================================
 * Tests: SCSS Compiler (scss-compiler.ts)
 * =============================================================================
 * FIX 3.3: Tests for SCSS/SASS browser compilation.
 * =============================================================================
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the global Sass object that would be loaded from CDN
const mockSass = {
  compile: vi.fn(),
};

// Mock global window/self for browser environment
const originalSelf = global.self;

beforeEach(() => {
  // Setup mock Sass on global
  (global as any).Sass = mockSass;
  (global as any).self = {
    ...originalSelf,
    Sass: mockSass,
  };
  vi.clearAllMocks();
});

afterEach(() => {
  delete (global as any).Sass;
  (global as any).self = originalSelf;
});

// Import after mocks are setup
import { SCSSCompiler, createSCSSCompiler } from '../scss-compiler';

describe('SCSSCompiler', () => {
  let compiler: SCSSCompiler;

  beforeEach(() => {
    compiler = new SCSSCompiler();
    // Mark as initialized and set mock sass (skip CDN load in tests)
    (compiler as any)._initialized = true;
    (compiler as any)._sass = mockSass;
  });

  describe('metadata', () => {
    it('should have correct name', () => {
      expect(compiler.name).toBe('SCSS');
    });

    it('should support scss and sass extensions', () => {
      expect(compiler.extensions).toContain('scss');
      expect(compiler.extensions).toContain('sass');
    });
  });

  describe('canHandle', () => {
    it('should return true for .scss files', () => {
      expect(compiler.canHandle('/src/styles.scss')).toBe(true);
      expect(compiler.canHandle('/components/Button.scss')).toBe(true);
    });

    it('should return true for .sass files', () => {
      expect(compiler.canHandle('/src/styles.sass')).toBe(true);
    });

    it('should return false for other files', () => {
      expect(compiler.canHandle('/src/styles.css')).toBe(false);
      expect(compiler.canHandle('/src/index.ts')).toBe(false);
      expect(compiler.canHandle('/src/App.tsx')).toBe(false);
    });

    it('should handle various path formats', () => {
      expect(compiler.canHandle('styles.scss')).toBe(true);
      expect(compiler.canHandle('./styles.scss')).toBe(true);
      expect(compiler.canHandle('../styles.sass')).toBe(true);
    });
  });

  describe('compile', () => {
    beforeEach(() => {
      mockSass.compile.mockImplementation(
        (source: string, options: unknown, callback: (result: any) => void) => {
          // Simulate successful compilation
          callback({
            status: 0,
            text: `/* compiled */ ${source}`,
          });
        }
      );
    });

    it('should compile SCSS to CSS', async () => {
      const source = '$color: red; body { color: $color; }';
      const result = await compiler.compile(source, '/src/styles.scss');

      expect(result.css).toContain('compiled');
      expect(result.warnings).toHaveLength(0);
    });

    it('should return empty code for CSS-only output', async () => {
      const source = 'body { margin: 0; }';
      const result = await compiler.compile(source, '/src/styles.scss');

      expect(result.code).toBe('');
    });

    it('should return warning on compilation error', async () => {
      mockSass.compile.mockImplementation(
        (source: string, options: unknown, callback: (result: any) => void) => {
          callback({
            status: 1,
            message: 'Syntax error',
            line: 1,
            column: 5,
          });
        }
      );

      const source = 'invalid { scss }';
      const result = await compiler.compile(source, '/src/styles.scss');

      expect(result.css).toBe('');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('Syntax error');
    });

    it('should handle empty source', async () => {
      mockSass.compile.mockImplementation(
        (source: string, options: unknown, callback: (result: any) => void) => {
          callback({ status: 0, text: '' });
        }
      );

      const result = await compiler.compile('', '/src/empty.scss');

      expect(result.css).toBe('');
      expect(result.warnings).toHaveLength(0);
    });

    it('should include CSS metadata', async () => {
      const result = await compiler.compile('body {}', '/test.scss');

      expect(result.cssMetadata).toBeDefined();
      expect(result.cssMetadata?.type).toBe('component');
    });
  });

  describe('compileSync', () => {
    it('should return warning when not initialized', () => {
      const freshCompiler = new SCSSCompiler();
      const result = freshCompiler.compileSync('body {}', '/test.scss');

      expect(result.css).toBe('');
      expect(result.warnings.length).toBeGreaterThan(0);
    });

    it('should warn when sync compilation not available', () => {
      // Our mock doesn't have compileSync
      const result = compiler.compileSync('body {}', '/test.scss');

      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('not available');
    });
  });
});

describe('createSCSSCompiler', () => {
  it('should create new SCSSCompiler instance', () => {
    const compiler = createSCSSCompiler();
    expect(compiler).toBeInstanceOf(SCSSCompiler);
    expect(compiler.name).toBe('SCSS');
  });
});

describe('SCSS file detection', () => {
  let compiler: SCSSCompiler;

  beforeEach(() => {
    compiler = new SCSSCompiler();
  });

  it('should detect SCSS files correctly', () => {
    const scssFiles = [
      '/src/styles.scss',
      '/components/Button.scss',
      'global.scss',
      './partial/_variables.scss',
    ];

    for (const file of scssFiles) {
      expect(compiler.canHandle(file)).toBe(true);
    }
  });

  it('should detect SASS files correctly', () => {
    const sassFiles = ['/src/styles.sass', '/components/Button.sass', 'global.sass'];

    for (const file of sassFiles) {
      expect(compiler.canHandle(file)).toBe(true);
    }
  });

  it('should not match non-SCSS/SASS files', () => {
    const otherFiles = [
      '/src/styles.css',
      '/src/index.ts',
      '/src/App.tsx',
      '/package.json',
      '/styles.less',
      '/styles.styl',
    ];

    for (const file of otherFiles) {
      expect(compiler.canHandle(file)).toBe(false);
    }
  });
});
