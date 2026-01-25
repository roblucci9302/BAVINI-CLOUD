/**
 * =============================================================================
 * BAVINI CLOUD - Astro Compiler Wrapper
 * =============================================================================
 * Wrapper for @astrojs/compiler with lazy loading and WASM initialization.
 * Compiles .astro files to JavaScript for browser preview.
 * =============================================================================
 */

import type { FrameworkCompiler, CompilationResult } from './compiler-registry';
import { createScopedLogger } from '~/utils/logger';
import {
  type AstroCompilerModule,
  ASTRO_COMPILER_CDN,
  ASTRO_WASM_CDN,
  extractStylesFromSource,
  postProcessCode,
  wrapForBrowser,
} from './astro';

const logger = createScopedLogger('AstroCompiler');

/**
 * Astro Component Compiler
 *
 * Compiles `.astro` files to JavaScript using `@astrojs/compiler` loaded from CDN.
 * The compiler uses WASM for high-performance parsing.
 *
 * Supports Astro features including:
 * - Frontmatter scripts (`---`)
 * - Component expressions (`{expression}`)
 * - Slot-based content projection
 * - Scoped and global styles
 * - Integration with React, Vue, Svelte components
 *
 * @example
 * ```typescript
 * const compiler = new AstroCompiler();
 * await compiler.init();
 *
 * const result = await compiler.compile(`
 *   ---
 *   const title = "Hello World";
 *   const items = ['One', 'Two', 'Three'];
 *   ---
 *   <html>
 *     <head><title>{title}</title></head>
 *     <body>
 *       <h1>{title}</h1>
 *       <ul>
 *         {items.map(item => <li>{item}</li>)}
 *       </ul>
 *     </body>
 *   </html>
 *   <style>
 *     h1 { color: purple; }
 *   </style>
 * `, 'index.astro');
 *
 * console.log(result.code); // Compiled JavaScript
 * console.log(result.css);  // Extracted CSS
 * ```
 *
 * @implements {FrameworkCompiler}
 */
export class AstroCompiler implements FrameworkCompiler {
  /** Compiler display name */
  name = 'Astro';
  /** Supported file extensions */
  extensions = ['.astro'];

  private _compiler: AstroCompilerModule | null = null;
  private _initialized = false;

  /**
   * Initialize the Astro compiler by loading WASM module from CDN.
   * Must be called before `compile()`.
   *
   * The initialization loads:
   * 1. The Astro compiler module from esm.sh
   * 2. The WASM binary for the parser
   *
   * @throws {Error} If the compiler or WASM fails to load
   *
   * @example
   * ```typescript
   * const compiler = new AstroCompiler();
   * await compiler.init(); // Loads compiler + WASM from CDN
   * ```
   */
  async init(): Promise<void> {
    if (this._initialized) {
      return;
    }

    const startTime = performance.now();
    logger.info('Initializing Astro compiler...');

    try {
      // Dynamically import the compiler from CDN
      const compilerModule = await import(/* @vite-ignore */ ASTRO_COMPILER_CDN);
      this._compiler = compilerModule;

      // Initialize WASM
      if (this._compiler?.initialize) {
        await this._compiler.initialize({
          wasmURL: ASTRO_WASM_CDN,
        });
      }

      this._initialized = true;
      const loadTime = (performance.now() - startTime).toFixed(0);
      logger.info(`Astro compiler initialized (${loadTime}ms)`);
    } catch (error) {
      logger.error('Failed to initialize Astro compiler:', error);
      throw new Error(`Failed to load Astro compiler: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Check if this compiler can handle a given file based on its extension.
   *
   * @param filename - The filename to check (can include full path)
   * @returns `true` if the file has an `.astro` extension
   *
   * @example
   * ```typescript
   * compiler.canHandle('index.astro');           // true
   * compiler.canHandle('/src/pages/about.astro'); // true
   * compiler.canHandle('component.vue');          // false
   * ```
   */
  canHandle(filename: string): boolean {
    return filename.endsWith('.astro');
  }

  /**
   * Compile an Astro component to JavaScript.
   *
   * The compilation process:
   * 1. Extracts CSS from `<style>` tags (before transformation)
   * 2. Transforms the Astro source to JavaScript
   * 3. Strips TypeScript declarations for browser compatibility
   * 4. Injects Astro runtime shims for browser execution
   * 5. Post-processes function calls to use globalThis
   *
   * @param source - The Astro component source code
   * @param filename - The filename (used for error messages and source maps)
   * @returns Compilation result with code, CSS, source map, and warnings
   *
   * @throws {Error} If the compiler is not initialized
   * @throws {Error} If the component has compilation errors (severity 1)
   *
   * @example
   * ```typescript
   * const result = await compiler.compile(astroSource, 'Page.astro');
   *
   * // result.code - Compiled JavaScript with Astro shims
   * // result.css - Extracted CSS from <style> blocks
   * // result.map - Inline source map
   * // result.warnings - Astro diagnostics (severity 2)
   * ```
   */
  async compile(source: string, filename: string): Promise<CompilationResult> {
    if (!this._compiler || !this._initialized) {
      throw new Error('Astro compiler not initialized. Call init() first.');
    }

    const startTime = performance.now();
    logger.debug(`Compiling: ${filename}`);

    try {
      // Transform the Astro source to JavaScript FIRST
      // We need the compiled code to extract the actual scope hash Astro generates
      const result = await this._compiler.transform(source, {
        filename,
        sourcemap: 'inline',
        // Use a simplified internal URL for browser context
        internalURL: 'astro/internal',
        compact: false,
      });

      // Extract the actual scope hash from the compiled code
      // Astro adds classes like "astro-bbe6dxrz" to elements
      const scopeMatch = result.code.match(/astro-([a-z0-9]+)/i);
      const actualScopeHash = scopeMatch ? scopeMatch[1] : null;

      // Extract CSS from <style> tags using the actual scope hash
      const extractedCss = extractStylesFromSource(source, filename, actualScopeHash);

      // Extract any warnings from diagnostics
      const warnings = result.diagnostics
        .filter((d) => d.severity === 2)
        .map((d) => `${d.text} (${d.location?.file || filename}:${d.location?.line || 0})`);

      // Check for errors
      const errors = result.diagnostics.filter((d) => d.severity === 1);
      if (errors.length > 0) {
        const errorMsg = errors.map((e) => e.text).join('\n');
        throw new Error(`Astro compilation failed:\n${errorMsg}`);
      }

      // Post-process the code to work in browser context
      let processedCode = postProcessCode(result.code, filename);

      // Handle Astro component rendering for browser preview
      // Astro components typically export a default render function
      if (!processedCode.includes('export default')) {
        // Wrap the component for browser rendering
        processedCode = wrapForBrowser(processedCode, filename);
      }

      const compileTime = (performance.now() - startTime).toFixed(0);
      logger.debug(`Compiled ${filename} (${compileTime}ms), CSS: ${extractedCss.length} chars`);

      return {
        code: processedCode,
        css: extractedCss || undefined,
        map: result.map,
        warnings,
        // CSS metadata for aggregation - CSS will be injected by the build adapter
        cssMetadata: extractedCss ? { type: 'component' as const } : undefined,
      };
    } catch (error) {
      logger.error(`Failed to compile ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Render an Astro component using Server-Side Rendering (SSR).
   *
   * Uses the QuickJS-based SSR engine to execute the compiled Astro code
   * and produce static HTML. This enables true SSR in the browser environment.
   *
   * @param source - The Astro source code to compile and render
   * @param filename - The filename (used for compilation and error messages)
   * @param props - Props to pass to the Astro component
   * @returns SSR result containing HTML, CSS, head content, and any errors
   *
   * @example
   * ```typescript
   * const compiler = new AstroCompiler();
   * await compiler.init();
   *
   * const result = await compiler.renderSSR(`
   *   ---
   *   const { name } = Astro.props;
   *   ---
   *   <h1>Hello, {name}!</h1>
   * `, 'Greeting.astro', { name: 'World' });
   *
   * console.log(result.html); // '<h1>Hello, World!</h1>'
   * ```
   */
  async renderSSR(
    source: string,
    filename: string,
    props: Record<string, unknown> = {},
  ): Promise<{
    html: string;
    css: string;
    head: string;
    error?: string;
  }> {
    // Lazy import SSR engine to avoid circular dependencies
    const { getSharedSSREngine } = await import('../../quickjs/ssr-engine');
    const ssrEngine = getSharedSSREngine();

    try {
      // First compile the Astro source to JavaScript
      const compiled = await this.compile(source, filename);

      // Then render it using the SSR engine
      const result = await ssrEngine.renderAstro(compiled.code, {
        props,
        url: filename,
      });

      return {
        html: result.html,
        css: compiled.css || result.css,
        head: result.head,
        error: result.error,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`SSR render failed for ${filename}:`, errorMessage);

      return {
        html: `<div style="color:red;padding:20px;border:2px solid red;">
          <h2>Astro SSR Error</h2>
          <pre>${errorMessage}</pre>
        </div>`,
        css: '',
        head: '',
        error: errorMessage,
      };
    }
  }

  /**
   * Check if Server-Side Rendering is available.
   *
   * SSR requires the QuickJS WASM engine to be loaded and initialized.
   * This method can be used to conditionally enable SSR features.
   *
   * @returns `true` if SSR engine is available and initialized
   *
   * @example
   * ```typescript
   * const compiler = new AstroCompiler();
   * await compiler.init();
   *
   * if (await compiler.isSSRAvailable()) {
   *   const result = await compiler.renderSSR(source, filename);
   * } else {
   *   // Fall back to client-side rendering
   * }
   * ```
   */
  async isSSRAvailable(): Promise<boolean> {
    try {
      const { getSharedSSREngine } = await import('../../quickjs/ssr-engine');
      const ssrEngine = getSharedSSREngine();
      await ssrEngine.init();
      return true;
    } catch {
      return false;
    }
  }
}
