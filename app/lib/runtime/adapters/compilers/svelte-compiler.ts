/**
 * =============================================================================
 * BAVINI CLOUD - Svelte Compiler Wrapper
 * =============================================================================
 * Wrapper for svelte/compiler with lazy loading.
 * Compiles .svelte components to JavaScript for browser preview.
 * =============================================================================
 */

import type { FrameworkCompiler, CompilationResult } from './compiler-registry';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SvelteCompiler');

/**
 * Types for svelte/compiler (loaded dynamically)
 */
interface SvelteCompilerModule {
  compile: (source: string, options?: SvelteCompileOptions) => SvelteCompileResult;
  parse: (source: string) => SvelteAST;
  preprocess: (
    source: string,
    preprocessors: SveltePreprocessor | SveltePreprocessor[],
    options?: { filename?: string }
  ) => Promise<{ code: string; map?: unknown }>;
  VERSION: string;
}

interface SvelteCompileOptions {
  filename?: string;
  name?: string;
  format?: 'esm' | 'cjs';
  generate?: 'dom' | 'ssr' | false;
  dev?: boolean;
  immutable?: boolean;
  hydratable?: boolean;
  legacy?: boolean;
  customElement?: boolean;
  css?: 'injected' | 'external' | 'none';
  cssHash?: (args: { hash: (input: string) => string; css: string; name: string; filename: string }) => string;
  preserveComments?: boolean;
  preserveWhitespace?: boolean;
  outputFilename?: string;
  cssOutputFilename?: string;
  sveltePath?: string;
  enableSourcemap?: boolean | { js: boolean; css: boolean };
}

interface SvelteCompileResult {
  js: {
    code: string;
    map?: unknown;
  };
  css: {
    code: string;
    map?: unknown;
  } | null;
  ast: SvelteAST;
  warnings: SvelteWarning[];
  vars: SvelteVar[];
  stats: {
    timings: { total: number };
  };
}

interface SvelteAST {
  html: unknown;
  css?: unknown;
  instance?: unknown;
  module?: unknown;
}

interface SvelteWarning {
  code: string;
  message: string;
  filename?: string;
  start?: { line: number; column: number };
  end?: { line: number; column: number };
  frame?: string;
}

interface SvelteVar {
  name: string;
  export_name?: string;
  injected?: boolean;
  module?: boolean;
  mutated?: boolean;
  reassigned?: boolean;
  referenced?: boolean;
  writable?: boolean;
}

interface SveltePreprocessor {
  markup?: (options: { content: string; filename?: string }) => Promise<{ code: string; map?: unknown }> | { code: string; map?: unknown };
  script?: (options: { content: string; filename?: string; attributes: Record<string, string> }) => Promise<{ code: string; map?: unknown }> | { code: string; map?: unknown };
  style?: (options: { content: string; filename?: string; attributes: Record<string, string> }) => Promise<{ code: string; map?: unknown }> | { code: string; map?: unknown };
}

/**
 * CDN URL for Svelte compiler
 */
const SVELTE_COMPILER_CDN = 'https://esm.sh/svelte@4.2.19/compiler';

/**
 * Svelte Component Compiler
 *
 * Compiles `.svelte` files to JavaScript using the Svelte compiler loaded from CDN.
 * Supports Svelte 4 features including:
 * - Reactive declarations (`$:`)
 * - Stores and bindings
 * - Transitions and animations
 * - Scoped CSS (automatically generated class names)
 *
 * @example
 * ```typescript
 * const compiler = new SvelteCompiler();
 * await compiler.init();
 *
 * const result = await compiler.compile(`
 *   <script>
 *     let count = 0;
 *     $: doubled = count * 2;
 *   </script>
 *
 *   <button on:click={() => count++}>
 *     Count: {count}, Doubled: {doubled}
 *   </button>
 *
 *   <style>
 *     button { background: #ff3e00; color: white; }
 *   </style>
 * `, 'Counter.svelte');
 *
 * console.log(result.code); // Compiled JavaScript
 * console.log(result.css);  // Scoped CSS
 * ```
 *
 * @implements {FrameworkCompiler}
 */
export class SvelteCompiler implements FrameworkCompiler {
  /** Compiler display name */
  name = 'Svelte';
  /** Supported file extensions */
  extensions = ['.svelte'];

  private _compiler: SvelteCompilerModule | null = null;
  private _initialized = false;

  /**
   * Initialize the Svelte compiler by loading from CDN.
   * Must be called before `compile()`.
   *
   * @throws {Error} If the compiler fails to load from CDN
   *
   * @example
   * ```typescript
   * const compiler = new SvelteCompiler();
   * await compiler.init(); // Loads Svelte 4 compiler from esm.sh
   * ```
   */
  async init(): Promise<void> {
    if (this._initialized) {
      return;
    }

    const startTime = performance.now();
    logger.info('Initializing Svelte compiler...');

    try {
      // Dynamically import the compiler from CDN
      const compilerModule = await import(/* @vite-ignore */ SVELTE_COMPILER_CDN);
      this._compiler = compilerModule;

      this._initialized = true;
      const loadTime = (performance.now() - startTime).toFixed(0);
      logger.info(`Svelte compiler initialized v${this._compiler?.VERSION || 'unknown'} (${loadTime}ms)`);
    } catch (error) {
      logger.error('Failed to initialize Svelte compiler:', error);
      throw new Error(`Failed to load Svelte compiler: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if this compiler can handle a given file based on its extension.
   *
   * @param filename - The filename to check (can include full path)
   * @returns `true` if the file has a `.svelte` extension
   *
   * @example
   * ```typescript
   * compiler.canHandle('App.svelte');           // true
   * compiler.canHandle('/src/Button.svelte');   // true
   * compiler.canHandle('component.vue');        // false
   * ```
   */
  canHandle(filename: string): boolean {
    return filename.endsWith('.svelte');
  }

  /**
   * Compile a Svelte component to JavaScript.
   *
   * The compilation process:
   * 1. Parses the Svelte component syntax
   * 2. Generates reactive JavaScript code
   * 3. Extracts and processes CSS with scoped class names
   * 4. Post-processes imports to use CDN URLs
   *
   * @param source - The Svelte component source code
   * @param filename - The filename (used for error messages and source maps)
   * @returns Compilation result with code, CSS, source map, and warnings
   *
   * @throws {Error} If the compiler is not initialized
   * @throws {Error} If the component has syntax errors
   *
   * @example
   * ```typescript
   * const result = await compiler.compile(svelteSource, 'Button.svelte');
   *
   * // result.code - Compiled JavaScript (ES module)
   * // result.css - Scoped CSS with generated class names
   * // result.map - Source map for debugging
   * // result.warnings - Svelte warnings (e.g., a11y issues)
   * ```
   */
  async compile(source: string, filename: string): Promise<CompilationResult> {
    if (!this._compiler || !this._initialized) {
      throw new Error('Svelte compiler not initialized. Call init() first.');
    }

    const startTime = performance.now();
    logger.debug(`Compiling: ${filename}`);

    try {
      const componentName = this.getComponentName(filename);

      // Compile the Svelte component
      const result = this._compiler.compile(source, {
        filename,
        name: componentName,
        format: 'esm',
        generate: 'dom',
        dev: true, // Enable dev mode for better error messages
        css: 'injected', // Inject CSS into the component
        hydratable: false,
        immutable: false,
        legacy: false,
        preserveComments: false,
        preserveWhitespace: false,
        enableSourcemap: true,
        // Use CDN for Svelte runtime
        sveltePath: 'https://esm.sh/svelte@4.2.19',
      });

      // Extract warnings
      const warnings = result.warnings.map((w) => {
        const location = w.start ? ` (${w.filename || filename}:${w.start.line}:${w.start.column})` : '';
        return `${w.message}${location}`;
      });

      // Post-process the code to ensure Svelte runtime imports work
      const processedCode = this.postProcessCode(result.js.code);

      const compileTime = (performance.now() - startTime).toFixed(0);
      logger.debug(`Compiled ${filename} (${compileTime}ms)`);

      return {
        code: processedCode,
        css: result.css?.code || undefined,
        map: typeof result.js.map === 'string' ? result.js.map : JSON.stringify(result.js.map),
        warnings,
        // CSS metadata for aggregation - CSS will be injected by the build adapter
        cssMetadata: result.css?.code ? { type: 'component' as const } : undefined,
      };
    } catch (error) {
      logger.error(`Failed to compile ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Post-process compiled Svelte code for browser compatibility
   */
  private postProcessCode(code: string): string {
    let processed = code;

    // Ensure Svelte internal imports use the CDN
    // The compiler already uses sveltePath, but we double-check here
    processed = processed
      .replace(/from\s+["']svelte\/internal["']/g, 'from "https://esm.sh/svelte@4.2.19/internal"')
      .replace(/from\s+["']svelte["']/g, 'from "https://esm.sh/svelte@4.2.19"')
      .replace(/from\s+["']svelte\/store["']/g, 'from "https://esm.sh/svelte@4.2.19/store"')
      .replace(/from\s+["']svelte\/motion["']/g, 'from "https://esm.sh/svelte@4.2.19/motion"')
      .replace(/from\s+["']svelte\/transition["']/g, 'from "https://esm.sh/svelte@4.2.19/transition"')
      .replace(/from\s+["']svelte\/animate["']/g, 'from "https://esm.sh/svelte@4.2.19/animate"')
      .replace(/from\s+["']svelte\/easing["']/g, 'from "https://esm.sh/svelte@4.2.19/easing"');

    return processed;
  }

  /**
   * Extract component name from filename
   */
  private getComponentName(filename: string): string {
    const base = filename.split('/').pop() || 'Component';
    const name = base.replace(/\.svelte$/, '');
    // Convert to PascalCase (Svelte convention)
    return name.replace(/(^|[-_])(\w)/g, (_, __, c) => c.toUpperCase());
  }
}
