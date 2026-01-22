/**
 * =============================================================================
 * BAVINI CLOUD - Compiler Registry
 * =============================================================================
 * Centralized registry for lazy loading framework compilers.
 * Supports Astro, Vue, and Svelte with on-demand loading.
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CompilerRegistry');

/**
 * Supported framework types
 */
export type FrameworkType = 'react' | 'nextjs' | 'vue' | 'svelte' | 'astro' | 'vanilla' | 'preact';

/**
 * CSS metadata for aggregation
 */
export interface CSSMetadata {
  /** Type of CSS (component styles or tailwind utilities) */
  type: 'component' | 'tailwind';
  /** Scope ID for Vue scoped styles */
  scopeId?: string;
}

/**
 * Compilation result from a framework compiler
 */
export interface CompilationResult {
  /** Compiled JavaScript code */
  code: string;
  /** Extracted CSS (if any) */
  css?: string;
  /** Source map (if generated) */
  map?: string;
  /** Any compilation warnings */
  warnings?: string[];
  /** CSS metadata for aggregation (type, scopeId, etc.) */
  cssMetadata?: CSSMetadata;
}

/**
 * Common interface for all framework compilers
 */
export interface FrameworkCompiler {
  /** Compiler name for logging */
  name: string;
  /** File extensions this compiler handles */
  extensions: string[];
  /** Initialize the compiler (load WASM, etc.) */
  init(): Promise<void>;
  /** Compile a source file */
  compile(source: string, filename: string): Promise<CompilationResult>;
  /** Check if this compiler can handle a given file */
  canHandle(filename: string): boolean;
}

/**
 * Cache for loaded compilers
 */
const compilerCache = new Map<string, FrameworkCompiler>();

/**
 * Loading promises for concurrent access protection
 */
const loadingPromises = new Map<string, Promise<FrameworkCompiler>>();

/**
 * Load a compiler by extension type with lazy loading and caching
 */
export async function loadCompiler(ext: string): Promise<FrameworkCompiler> {
  // Normalize extension
  const normalizedExt = ext.startsWith('.') ? ext.slice(1) : ext;

  // Check cache first
  const cached = compilerCache.get(normalizedExt);
  if (cached) {
    return cached;
  }

  // Check if already loading
  const loading = loadingPromises.get(normalizedExt);
  if (loading) {
    return loading;
  }

  // Start loading
  const loadPromise = (async () => {
    const startTime = performance.now();
    logger.info(`Loading ${normalizedExt} compiler...`);

    try {
      let compiler: FrameworkCompiler;

      switch (normalizedExt) {
        case 'astro':
          const { AstroCompiler } = await import('./astro-compiler');
          compiler = new AstroCompiler();
          break;

        case 'vue':
          const { VueCompiler } = await import('./vue-compiler');
          compiler = new VueCompiler();
          break;

        case 'svelte':
          const { SvelteCompiler } = await import('./svelte-compiler');
          compiler = new SvelteCompiler();
          break;

        case 'css':
          const { TailwindCompiler } = await import('./tailwind-compiler');
          compiler = new TailwindCompiler();
          break;

        // FIX 3.3: SCSS/SASS compiler support
        case 'scss':
        case 'sass':
          const { SCSSCompiler } = await import('./scss-compiler');
          compiler = new SCSSCompiler();
          break;

        // Next.js compiler/transformer
        case 'nextjs':
          const { NextJSCompiler } = await import('./nextjs-compiler');
          compiler = new NextJSCompiler();
          break;

        default:
          throw new Error(`No compiler available for extension: ${normalizedExt}`);
      }

      // Initialize the compiler
      await compiler.init();

      // Cache it
      compilerCache.set(normalizedExt, compiler);

      const loadTime = (performance.now() - startTime).toFixed(0);
      logger.info(`${normalizedExt} compiler loaded (${loadTime}ms)`);

      return compiler;
    } catch (error) {
      logger.error(`Failed to load ${normalizedExt} compiler:`, error);
      throw error;
    } finally {
      // Clean up loading promise
      loadingPromises.delete(normalizedExt);
    }
  })();

  loadingPromises.set(normalizedExt, loadPromise);
  return loadPromise;
}

/**
 * Get a cached compiler without loading (returns null if not loaded)
 */
export function getCompiler(ext: string): FrameworkCompiler | null {
  const normalizedExt = ext.startsWith('.') ? ext.slice(1) : ext;
  return compilerCache.get(normalizedExt) ?? null;
}

/**
 * Check if a compiler is available for a given extension
 * FIX 3.3: Added scss and sass support
 * Added nextjs for Next.js framework support
 */
export function hasCompilerFor(ext: string): boolean {
  const normalizedExt = ext.startsWith('.') ? ext.slice(1) : ext;
  return ['astro', 'vue', 'svelte', 'css', 'scss', 'sass', 'nextjs'].includes(normalizedExt);
}

/**
 * Detect framework from project files
 */
export function detectFramework(files: Map<string, string>): FrameworkType {
  // 1. Check package.json first (most reliable)
  const pkgJson = files.get('/package.json');
  if (pkgJson) {
    try {
      const pkg = JSON.parse(pkgJson);
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // Order matters - check more specific frameworks first
      // IMPORTANT: Next.js MUST be checked before React (Next.js includes React)
      if (deps['astro']) return 'astro';
      if (deps['next']) return 'nextjs';
      if (deps['vue'] || deps['@vue/compiler-sfc']) return 'vue';
      if (deps['svelte']) return 'svelte';
      if (deps['preact']) return 'preact';
      if (deps['react'] || deps['react-dom']) return 'react';
    } catch (e) {
      logger.warn('Failed to parse package.json:', e);
    }
  }

  // 2. Check for Next.js config files
  if (files.has('/next.config.js') || files.has('/next.config.ts') || files.has('/next.config.mjs')) {
    return 'nextjs';
  }

  // 3. Check for Next.js App Router structure
  if (files.has('/src/app/layout.tsx') || files.has('/src/app/page.tsx') ||
      files.has('/app/layout.tsx') || files.has('/app/page.tsx')) {
    return 'nextjs';
  }

  // 4. Check file extensions for other frameworks
  for (const path of files.keys()) {
    if (path.endsWith('.astro')) return 'astro';
    if (path.endsWith('.vue')) return 'vue';
    if (path.endsWith('.svelte')) return 'svelte';
  }

  // 5. Check for React-specific files
  for (const path of files.keys()) {
    if (path.endsWith('.tsx') || path.endsWith('.jsx')) {
      // Could be React or Preact - default to React
      return 'react';
    }
  }

  return 'vanilla';
}

/**
 * Get JSX configuration for a framework
 */
export function getJsxConfig(framework: FrameworkType): { jsx: 'automatic' | 'transform'; jsxImportSource: string } {
  switch (framework) {
    case 'react':
      return { jsx: 'automatic', jsxImportSource: 'react' };
    case 'preact':
      return { jsx: 'automatic', jsxImportSource: 'preact' };
    case 'vue':
    case 'svelte':
    case 'astro':
      // These frameworks have their own compilation, JSX config is for any .tsx/.jsx files
      return { jsx: 'automatic', jsxImportSource: 'react' };
    case 'vanilla':
    default:
      return { jsx: 'automatic', jsxImportSource: 'react' };
  }
}

/**
 * Clear all cached compilers (for testing or memory management)
 */
export function clearCompilerCache(): void {
  compilerCache.clear();
  logger.debug('Compiler cache cleared');
}
