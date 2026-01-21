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

const logger = createScopedLogger('AstroCompiler');

/**
 * Types for @astrojs/compiler (loaded dynamically)
 */
interface AstroCompilerModule {
  transform: (source: string, options?: AstroTransformOptions) => Promise<AstroTransformResult>;
  parse: (source: string) => Promise<AstroParseResult>;
  initialize: (options?: { wasmURL?: string }) => Promise<void>;
}

interface AstroTransformOptions {
  filename?: string;
  sourcemap?: boolean | 'inline' | 'external';
  internalURL?: string;
  site?: string;
  projectRoot?: string;
  resultScopedSlot?: boolean;
  compact?: boolean;
}

interface AstroTransformResult {
  code: string;
  map?: string;
  diagnostics: AstroDiagnostic[];
}

interface AstroDiagnostic {
  code: number;
  text: string;
  severity: 1 | 2;
  location?: {
    file: string;
    line: number;
    column: number;
  };
}

interface AstroParseResult {
  ast: unknown;
  diagnostics: AstroDiagnostic[];
}

/**
 * CDN URL for Astro compiler WASM
 */
const ASTRO_COMPILER_CDN = 'https://esm.sh/@astrojs/compiler@2.10.3';
const ASTRO_WASM_CDN = 'https://esm.sh/@astrojs/compiler@2.10.3/astro.wasm';

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
      // Extract CSS from <style> tags BEFORE compilation
      // The Astro compiler creates virtual CSS files, but our browser build
      // doesn't support those - so we extract styles manually
      const extractedCss = this.extractStylesFromSource(source, filename);

      // Transform the Astro source to JavaScript
      const result = await this._compiler.transform(source, {
        filename,
        sourcemap: 'inline',
        // Use a simplified internal URL for browser context
        internalURL: 'astro/internal',
        compact: false,
      });

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
      const processedCode = this.postProcessCode(result.code, filename);

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
   * Extract CSS from <style> tags in the Astro source
   * Handles both global and scoped styles
   */
  private extractStylesFromSource(source: string, filename: string): string {
    const styles: string[] = [];

    // Match all <style> tags with their content
    // Handles: <style>, <style is:global>, <style scoped>, etc.
    const styleRegex = /<style(?:\s+[^>]*)?>([^]*?)<\/style>/gi;
    let match;

    while ((match = styleRegex.exec(source)) !== null) {
      const styleContent = match[1].trim();
      if (styleContent) {
        styles.push(styleContent);
      }
    }

    if (styles.length > 0) {
      logger.debug(`Extracted ${styles.length} style block(s) from ${filename}`);
    }

    return styles.join('\n\n');
  }

  /**
   * Strip TypeScript-specific declarations from compiled code
   * esbuild is configured for JavaScript, so TS syntax causes parse errors
   */
  private stripTypeScriptDeclarations(code: string): string {
    let processed = code;

    // Remove interface declarations: interface Name { ... }
    // Handles multi-line interfaces with nested braces
    processed = processed.replace(
      /^\s*interface\s+\w+\s*\{[^}]*\}\s*;?\s*$/gm,
      '// [TypeScript interface removed]'
    );

    // More robust interface removal for complex/nested interfaces
    // This handles interfaces that span multiple lines with nested objects
    processed = processed.replace(
      /interface\s+\w+\s*\{[\s\S]*?\n\}/g,
      '// [TypeScript interface removed]'
    );

    // Remove type aliases: type Name = ...;
    processed = processed.replace(
      /^\s*type\s+\w+\s*=\s*[^;]+;\s*$/gm,
      '// [TypeScript type alias removed]'
    );

    // Remove type-only imports: import type { ... } from '...'
    processed = processed.replace(
      /import\s+type\s*\{[^}]*\}\s*from\s*['"][^'"]+['"];?\s*\n?/g,
      ''
    );

    // Remove inline type annotations from variable declarations
    // const foo: Type = ... → const foo = ...
    processed = processed.replace(
      /(\bconst\s+\w+)\s*:\s*\w+(\s*=)/g,
      '$1$2'
    );

    // Remove type assertions: as Type
    processed = processed.replace(
      /\s+as\s+\w+(?:<[^>]+>)?/g,
      ''
    );

    // Remove generic type parameters from function calls: func<Type>(...)
    // But be careful not to break JSX: <Component />
    processed = processed.replace(
      /(\w+)<(\w+(?:\s*,\s*\w+)*)>\s*\(/g,
      '$1('
    );

    return processed;
  }

  /**
   * Post-process compiled Astro code for browser compatibility
   */
  private postProcessCode(code: string, filename: string): string {
    let processed = code;

    // The Astro compiler v2+ generates code with $$ (double dollar) prefix:
    // - $$createComponent, $$render, $$renderComponent, $$renderTemplate, etc.
    // We need to:
    // - Remove the import statements completely (provide our own shims)
    // - Handle CSS import statements that reference non-existent files
    // - Remove TypeScript-specific syntax (interface, type declarations)

    // CRITICAL: Remove TypeScript interface/type declarations
    // esbuild is configured for JS, not TS, so these cause parse errors
    processed = this.stripTypeScriptDeclarations(processed);

    // Check if the code has Astro v2+ shim definitions (uses $$ prefix)
    const hasInlineShims = /const \$\$(?:render|createComponent|renderComponent|renderTemplate)\s*=/.test(processed);
    // Also check for older v1 style (single $) just in case
    const hasLegacyShims = /const \$(?:render|createComponent|renderComponent)\s*=/.test(processed) && !hasInlineShims;

    // ALWAYS inject our shims first - they will be overridden by inline definitions if present
    // This ensures $$renderTemplate is available even if the compiler doesn't define it inline
    processed = `${this.getMissingAstroFunctions()}\n${processed}`;

    if (hasInlineShims || hasLegacyShims) {
      // Remove ALL import statements from astro/internal or /__astro_internal__
      // These are redundant since shims are now defined
      processed = processed.replace(
        /import\s*\{[^}]*\}\s*from\s*["'](?:astro\/internal|\/?__astro_internal__)["'];?\n?/g,
        '// Astro internals provided via shims\n'
      );
    } else if (processed.includes('from "astro/internal"') || processed.includes("from 'astro/internal'")) {
      // No inline shims at all - replace imports
      processed = processed.replace(
        /import\s*\{[^}]*\}\s*from\s*["']astro\/internal["'];?\n?/g,
        '// Astro internals provided via shims\n'
      );
    }

    // Remove CSS imports that reference non-existent virtual files
    // e.g., import "/src/pages/index.astro?astro&type=style&index=0&lang.css";
    processed = processed.replace(
      /import\s+["'][^"']*\?astro&type=style[^"']*["'];?\n?/g,
      '// CSS extracted separately\n'
    );

    // CRITICAL FIX: Replace local $result declarations with our global
    // The Astro compiler generates: const $result = { styles: new Set(), ... }
    // But this shadows our global $result which has createAstro method
    // We need to ensure all $result references use our global
    processed = processed.replace(
      /(?:const|let|var)\s+\$result\s*=\s*\{[^}]*styles:\s*new\s+Set\(\)[^}]*\};?/g,
      '// Using global $result from shims (has createAstro method)'
    );

    // Also handle $$result declarations
    processed = processed.replace(
      /(?:const|let|var)\s+\$\$result\s*=\s*\{[^}]*styles:\s*new\s+Set\(\)[^}]*\};?/g,
      '// Using global $$result from shims'
    );

    // CRITICAL: Replace property access references to $result and $$result with globalThis.xxx
    // This prevents esbuild from renaming these variables during bundling
    // Property accesses like globalThis.$result.createAstro() cannot be renamed
    //
    // IMPORTANT: Do NOT replace standalone $result - it's used as function parameters!
    // e.g., $createComponent(($result, $props) => ...) - $result is a param name, not a reference
    //
    // CRITICAL: Process $$ (double dollar) BEFORE $ (single dollar) to avoid partial matches!
    // Otherwise $$result gets partially matched as $result → $globalThis.$result (BUG!)

    // Replace $$result.xxx with globalThis.$$result.xxx (ONLY property access)
    // Must be done FIRST before single $ patterns
    processed = processed.replace(/(?<!globalThis\.)(?<![\w\$])(\$\$result)\.(\w+)/g, 'globalThis.$$result.$2');

    // Replace $result.xxx with globalThis.$result.xxx (ONLY property access)
    // Use negative lookbehind to avoid already-prefixed, word chars, and $ before the pattern
    processed = processed.replace(/(?<!globalThis\.)(?<![\w\$])(\$result)\.(\w+)/g, 'globalThis.$result.$2');

    // Replace $$ prefixed function calls with globalThis.$$xxx
    // e.g., $$renderTemplate(...) → globalThis.$$renderTemplate(...)
    // BUT NOT inside function parameter lists - use lookbehind to avoid ($$func pattern
    // NOTE: In String.replace(), $$ is a special pattern producing single $
    // So we use $$$$ to produce $$ in the output
    const doubleDollarFuncs = [
      'renderTemplate', 'renderComponent', 'createComponent', 'render',
      'addAttribute', 'spreadAttributes', 'maybeRenderHead', 'renderHead',
      'renderSlot', 'mergeSlots', 'createAstro', 'unescapeHTML', 'defineScriptVars',
    ];
    for (const func of doubleDollarFuncs) {
      // Match $$func( but not when preceded by ( which would indicate parameter position
      const regex = new RegExp(`(?<!globalThis\\.)(?<![\\w\\(])\\$\\$${func}\\s*\\(`, 'g');
      // Use $$$$ to produce $$ (each $$ produces one $ in replacement string)
      processed = processed.replace(regex, `globalThis.$$$$${func}(`);
    }

    // Replace $ prefixed function calls with globalThis.$xxx
    // e.g., $renderTemplate(...) → globalThis.$renderTemplate(...)
    const singleDollarFuncs = [
      'createComponent', 'render', 'renderComponent', 'renderHead', 'maybeRenderHead',
      'addAttribute', 'spreadAttributes', 'defineStyleVars', 'defineScriptVars',
      'renderSlot', 'mergeSlots', 'createMetadata', 'renderTemplate',
    ];
    for (const func of singleDollarFuncs) {
      // Match $func( but not when preceded by ( which would indicate parameter position
      const regex = new RegExp(`(?<!globalThis\\.)(?<![\\w\\$\\(])\\$${func}\\s*\\(`, 'g');
      processed = processed.replace(regex, `globalThis.$${func}(`);
    }

    // Handle Astro component rendering for browser preview
    // Astro components typically export a default render function
    if (!processed.includes('export default')) {
      // Wrap the component for browser rendering
      processed = this.wrapForBrowser(processed, filename);
    }

    return processed;
  }

  /**
   * Get missing Astro functions that might not be defined inline
   * CRITICAL: These must be attached to globalThis to be truly global across ES modules
   * Using 'var' alone doesn't work because ES modules have their own scope
   */
  private getMissingAstroFunctions(): string {
    // Astro compiler v2+ uses:
    // - $$ (double dollar) for runtime functions: $$render, $$renderComponent, $$renderTemplate
    // - $ (single dollar) for metadata: $createMetadata (we provide), $metadata (Astro declares using $createMetadata)
    return `
// ============================================================================
// ASTRO RUNTIME SHIMS - Attached to globalThis for cross-module availability
// ============================================================================
(function(g) {
  // Single $ prefix functions
  if (!g.$createComponent) g.$createComponent = (fn) => fn;

  if (!g.$render) g.$render = async function(component, props, slots) {
    if (typeof component === 'function') {
      return await component(props, slots);
    }
    return component;
  };

  if (!g.$renderComponent) g.$renderComponent = async function(result, name, Component, props, slots) {
    // Handle undefined/null Component
    if (!Component) {
      console.warn('[Astro] Component "' + name + '" is undefined');
      return '';
    }
    // Handle ES module with default export
    const Comp = Component.default || Component;
    if (typeof Comp === 'function') {
      const output = await Comp(props, slots);
      return output?.toString?.() || '';
    }
    return '';
  };

  if (!g.$renderHead) g.$renderHead = function(result) { return ''; };
  if (!g.$maybeRenderHead) g.$maybeRenderHead = function(result) { return ''; };

  if (!g.$addAttribute) g.$addAttribute = function(value, name) {
    if (value == null || value === false) return '';
    if (value === true) return ' ' + name;
    return ' ' + name + '="' + String(value).replace(/"/g, '&quot;') + '"';
  };

  if (!g.$spreadAttributes) g.$spreadAttributes = function(attrs) {
    if (!attrs) return '';
    return Object.entries(attrs).map(([k, v]) => g.$addAttribute(v, k)).join('');
  };

  if (!g.$defineStyleVars) g.$defineStyleVars = function(vars) {
    return Object.entries(vars || {}).map(([k, v]) => '--' + k + ':' + v).join(';');
  };

  if (!g.$defineScriptVars) g.$defineScriptVars = function(vars) {
    return Object.entries(vars || {}).map(([k, v]) => 'let ' + k + ' = ' + JSON.stringify(v) + ';').join('\\n');
  };

  if (!g.$renderSlot) g.$renderSlot = async function(result, slotted, fallback) {
    if (slotted) {
      return typeof slotted === 'function' ? await slotted() : slotted;
    }
    return fallback ? (typeof fallback === 'function' ? await fallback() : fallback) : '';
  };

  if (!g.$mergeSlots) g.$mergeSlots = function(...slots) {
    return Object.assign({}, ...slots.filter(Boolean));
  };

  if (!g.$createMetadata) g.$createMetadata = (filePathname, opts = {}) => ({
    modules: opts.modules || [],
    hydratedComponents: opts.hydratedComponents || [],
    clientOnlyComponents: opts.clientOnlyComponents || [],
    hydrationDirectives: opts.hydrationDirectives || new Set(),
    hoisted: opts.hoisted || [],
  });

  if (!g.$renderTemplate) g.$renderTemplate = function(strings, ...values) {
    let result = strings[0] || '';
    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      let strVal = '';
      if (val == null) {
        strVal = '';
      } else if (typeof val === 'string') {
        strVal = val;
      } else if (Array.isArray(val)) {
        strVal = val.map(v => typeof v === 'string' ? v : (v?.toString?.() || '')).join('');
      } else if (typeof val.toString === 'function') {
        strVal = val.toString();
        if (strVal === '[object Object]') strVal = '';
      } else {
        strVal = String(val);
      }
      result += strVal + (strings[i + 1] || '');
    }
    return result;
  };

  // CRITICAL: $result object with createAstro method
  if (!g.$result) g.$result = {
    styles: new Set(),
    scripts: new Set(),
    links: new Set(),
    propagation: new Map(),
    propagators: new Map(),
    extraHead: [],
    componentMetadata: new Map(),
    hasRenderedHead: false,
    renderers: [],
    createAstro: function(Astro, props, slots) {
      return { ...Astro, props: props || {}, slots: slots || {} };
    },
    resolve: function(path) { return path; },
    _metadata: { hasHydrationScript: false, rendererSpecificHydrationScripts: new Set() },
  };

  // Safe URL constructor that handles invalid URLs gracefully
  const safeURL = (urlStr, base) => {
    if (!urlStr) return base ? new URL(base) : new URL('http://localhost/');
    try {
      return new URL(urlStr, base || 'http://localhost/');
    } catch {
      return new URL('http://localhost/');
    }
  };

  // Double $$ prefix functions (Astro v2+)
  // NOTE: site must ALWAYS be a valid URL (never undefined) because user code
  // often does: new URL(Astro.url.pathname, Astro.site) which fails if site is undefined
  if (!g.$$createAstro) g.$$createAstro = (filePathname, url, site) => ({
    site: safeURL(site),  // Always valid URL, defaults to http://localhost/
    generator: 'Astro v4',
    glob: () => Promise.resolve([]),
    resolve: (path) => path,
    props: {},
    request: { url: url || '' },
    redirect: (path) => ({ redirect: path }),
    url: safeURL(url),
    cookies: { get: () => undefined, set: () => {}, delete: () => {}, has: () => false },
    params: {},
    slots: {},
  });

  if (!g.$$createComponent) g.$$createComponent = (fn) => fn;
  if (!g.$$defineScriptVars) g.$$defineScriptVars = (vars) => Object.entries(vars || {}).map(([k, v]) => \`let \${k} = \${JSON.stringify(v)};\`).join('\\n');
  if (!g.$$unescapeHTML) g.$$unescapeHTML = (str) => ({ toString: () => str, toHTML: () => str });

  if (!g.$$renderSlot) g.$$renderSlot = async (result, slotted, fallback) => {
    if (slotted) {
      return typeof slotted === 'function' ? await slotted() : slotted;
    }
    return fallback ? (typeof fallback === 'function' ? await fallback() : fallback) : '';
  };

  if (!g.$$mergeSlots) g.$$mergeSlots = (...slots) => Object.assign({}, ...slots.filter(Boolean));
  if (!g.$$maybeRenderHead) g.$$maybeRenderHead = (result) => '';
  if (!g.$$renderHead) g.$$renderHead = (result) => '';

  if (!g.$$addAttribute) g.$$addAttribute = function(value, name, shouldEscape) {
    if (value == null || value === false) return '';
    if (value === true) return ' ' + name;
    return ' ' + name + '="' + String(value).replace(/"/g, '&quot;') + '"';
  };

  if (!g.$$spreadAttributes) g.$$spreadAttributes = function(attrs, _name, _opts) {
    if (!attrs) return '';
    return Object.entries(attrs).map(([k, v]) => g.$$addAttribute(v, k)).join('');
  };

  if (!g.$$render) g.$$render = async function(result, Component, props, slots) {
    if (typeof Component === 'function') {
      const output = await Component(result, props, slots);
      return output?.toString?.() || '';
    }
    return '';
  };

  if (!g.$$renderComponent) g.$$renderComponent = async function(result, name, Component, props, slots) {
    // Handle undefined/null Component
    if (!Component) {
      console.warn('[Astro] Component "' + name + '" is undefined');
      return '';
    }
    // Handle ES module with default export
    const Comp = Component.default || Component;
    if (typeof Comp === 'function') {
      const output = await Comp(result, props, slots);
      return output?.toString?.() || '';
    }
    return '';
  };

  // CRITICAL: $$renderTemplate - tagged template literal handler
  if (!g.$$renderTemplate) g.$$renderTemplate = function(strings, ...values) {
    let result = strings[0] || '';
    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      let strVal = '';
      if (val === null || val === undefined) {
        strVal = '';
      } else if (typeof val === 'string') {
        strVal = val;
      } else if (val && typeof val.then === 'function') {
        strVal = '[ASYNC_PENDING]';
      } else if (Array.isArray(val)) {
        strVal = val.map(v => typeof v === 'string' ? v : (v?.toString?.() || '')).join('');
      } else if (val && typeof val.toString === 'function') {
        strVal = val.toString();
        if (strVal === '[object Object]') strVal = '';
      } else {
        strVal = String(val);
      }
      result += strVal + (strings[i + 1] || '');
    }
    return result;
  };

  // Also expose as $$result
  if (!g.$$result) g.$$result = g.$result;

  // NOTE: We do NOT create local var aliases here because esbuild renames them
  // during bundling, which breaks references. Instead, we replace all $result
  // and $$xxx references with globalThis.xxx in postProcessCode().
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
`;
  }

  /**
   * Get the Astro runtime shim for browser context
   */
  private getAstroRuntimeShim(): string {
    return `
// Astro Runtime Shim for Browser Preview
const $$createComponent = (fn) => fn;
const $$render = async (component, props, slots) => {
  if (typeof component === 'function') {
    return await component(props, slots);
  }
  return component;
};
const $$renderComponent = async (Component, props, slots) => {
  if (!Component) return '';
  const Comp = Component.default || Component;
  if (typeof Comp === 'function') {
    const result = await Comp(props, slots);
    return result?.toString?.() || '';
  }
  return '';
};
const $$maybeRenderHead = () => '';
const $$renderHead = () => '';
const $$addAttribute = (value, name) => value ? \` \${name}="\${value}"\` : '';
const $$spreadAttributes = (attrs) => Object.entries(attrs || {}).map(([k, v]) => \` \${k}="\${v}"\`).join('');
const $$escapeHTML = (str) => String(str).replace(/[&<>"']/g, (m) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m]));
const $$createSlot = (name, fallback) => ({ name, fallback });
const $$result = {
  styles: new Set(),
  scripts: new Set(),
  links: new Set(),
  propagation: new Map(),
  propagators: new Map(),
  extraHead: [],
  componentMetadata: new Map(),
  hasRenderedHead: false,
  renderers: [],
  createAstro: (Astro, props, slots) => {
    return {
      ...Astro,
      props: props || {},
      slots: slots || {},
    };
  },
  resolve: (path) => path,
  _metadata: { hasHydrationScript: false, rendererSpecificHydrationScripts: new Set() },
};
// Also create $result (single $) as some compiled code uses that
const $result = $$result;
${this.getMissingAstroFunctions()}
`;
  }

  /**
   * Wrap Astro component output for browser rendering
   */
  private wrapForBrowser(code: string, filename: string): string {
    const componentName = this.getComponentName(filename);

    return `
${code}

// Browser preview wrapper
const __astroComponent = typeof Component !== 'undefined' ? Component : (typeof $$Component !== 'undefined' ? $$Component : null);

export default function ${componentName}Preview(props = {}) {
  if (__astroComponent) {
    // Return the Astro component for rendering
    return __astroComponent(props);
  }
  return null;
}
`;
  }

  /**
   * Extract component name from filename
   */
  private getComponentName(filename: string): string {
    const base = filename.split('/').pop() || 'Component';
    const name = base.replace(/\.astro$/, '');
    // Convert to PascalCase
    return name.replace(/(^|-)(\w)/g, (_, __, c) => c.toUpperCase());
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
