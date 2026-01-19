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
 * Astro Compiler implementation
 */
export class AstroCompiler implements FrameworkCompiler {
  name = 'Astro';
  extensions = ['.astro'];

  private _compiler: AstroCompilerModule | null = null;
  private _initialized = false;

  /**
   * Initialize the Astro compiler with WASM
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
   * Check if this compiler can handle a file
   */
  canHandle(filename: string): boolean {
    return filename.endsWith('.astro');
  }

  /**
   * Compile an Astro component to JavaScript
   */
  async compile(source: string, filename: string): Promise<CompilationResult> {
    if (!this._compiler || !this._initialized) {
      throw new Error('Astro compiler not initialized. Call init() first.');
    }

    const startTime = performance.now();
    logger.debug(`Compiling: ${filename}`);

    try {
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
      logger.debug(`Compiled ${filename} (${compileTime}ms)`);

      return {
        code: processedCode,
        map: result.map,
        warnings,
      };
    } catch (error) {
      logger.error(`Failed to compile ${filename}:`, error);
      throw error;
    }
  }

  /**
   * Post-process compiled Astro code for browser compatibility
   */
  private postProcessCode(code: string, filename: string): string {
    // Replace Astro internal imports with browser-compatible versions
    let processed = code;

    // Replace 'astro/internal' imports with a shim
    // The compiled Astro code typically imports runtime helpers
    if (processed.includes('from "astro/internal"') || processed.includes("from 'astro/internal'")) {
      // Prepend Astro runtime shim
      processed = `${this.getAstroRuntimeShim()}\n${processed}`;

      // Replace the imports with local references
      processed = processed
        .replace(/from\s+["']astro\/internal["']/g, 'from "/__astro_internal__"')
        .replace(/import\s*{([^}]+)}\s*from\s*["']__astro_internal__["']/g, '/* Astro internals provided via shim */');
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
  if (typeof Component === 'function') {
    const result = await Component(props, slots);
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
};
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
}
