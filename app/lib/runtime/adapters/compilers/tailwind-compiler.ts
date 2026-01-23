/**
 * =============================================================================
 * BAVINI CLOUD - Tailwind CSS Compiler
 * =============================================================================
 * Compiles Tailwind CSS directives (@tailwind, @apply, @layer) in the browser
 * using jit-browser-tailwindcss for browser-compatible JIT compilation.
 * =============================================================================
 */

import type { FrameworkCompiler, CompilationResult } from './compiler-registry';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TailwindCompiler');

/**
 * Content file for class extraction
 */
export interface ContentFile {
  path: string;
  content: string;
}

/**
 * Types for jit-browser-tailwindcss (loaded dynamically)
 */
interface TailwindJIT {
  createTailwindcss: (config?: TailwindConfig) => TailwindProcessor;
}

interface TailwindConfig {
  corePlugins?: Record<string, boolean>;
  theme?: Record<string, unknown>;
  plugins?: unknown[];
}

interface TailwindProcessor {
  generateStylesFromContent: (css: string, content: string[]) => Promise<string>;
}

/**
 * CDN URL for jit-browser-tailwindcss
 * This library is based on Tailwind v3.1.8 and works in browsers without SharedArrayBuffer
 */
const TAILWIND_JIT_CDN = 'https://esm.sh/@mhsdesign/jit-browser-tailwindcss@0.4.0';

/**
 * Global flag to track initialization (can only be initialized once)
 * Preserved across HMR and instance recreation
 */
let globalTailwindInitialized: boolean = (globalThis as any).__tailwindInitialized ?? false;

/**
 * Global Promise to synchronize concurrent init calls
 */
let globalTailwindPromise: Promise<void> | null = (globalThis as any).__tailwindPromise ?? null;

/**
 * Cached TailwindProcessor instance
 */
let cachedProcessor: TailwindProcessor | null = (globalThis as any).__tailwindProcessor ?? null;

/**
 * Enhanced LRU Cache for compiled CSS results with better performance
 *
 * Optimizations:
 * - Larger cache size (150 entries instead of 50)
 * - Longer TTL (30 minutes instead of 5)
 * - MRU ordering for better hit rate
 * - Separate class-level cache for individual utility classes
 */
class TailwindCache {
  private _cache = new Map<string, { css: string; timestamp: number }>();
  private readonly _maxSize = 150; // Increased from 50
  private readonly _maxAge = 1800000; // 30 minutes (increased from 5)

  /** Class-level cache for individual Tailwind classes */
  private _classCache = new Map<string, string>();
  private readonly _classMaxSize = 500;

  get(key: string): string | null {
    const entry = this._cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > this._maxAge) {
      this._cache.delete(key);
      return null;
    }

    // Move to end for MRU ordering
    this._cache.delete(key);
    this._cache.set(key, entry);

    return entry.css;
  }

  set(key: string, css: string): void {
    // Evict oldest entries if at capacity
    while (this._cache.size >= this._maxSize) {
      const oldest = this._cache.keys().next().value;

      if (oldest) {
        this._cache.delete(oldest);
      } else {
        break;
      }
    }

    this._cache.set(key, { css, timestamp: Date.now() });
  }

  /**
   * Get cached CSS for a specific class
   */
  getClass(className: string): string | null {
    return this._classCache.get(className) ?? null;
  }

  /**
   * Cache CSS for a specific class
   */
  setClass(className: string, css: string): void {
    if (this._classCache.size >= this._classMaxSize) {
      // Remove oldest class entries (first 50)
      const keys = Array.from(this._classCache.keys()).slice(0, 50);
      keys.forEach((k) => this._classCache.delete(k));
    }

    this._classCache.set(className, css);
  }

  /**
   * Get multiple classes from cache
   * @returns Object with cached classes and missing class names
   */
  getClasses(classNames: string[]): { cached: Map<string, string>; missing: string[] } {
    const cached = new Map<string, string>();
    const missing: string[] = [];

    for (const className of classNames) {
      const css = this._classCache.get(className);

      if (css !== undefined) {
        cached.set(className, css);
      } else {
        missing.push(className);
      }
    }

    return { cached, missing };
  }

  generateKey(source: string, contentHash: string): string {
    // Improved hash using FNV-1a algorithm for better distribution
    let hash = 2166136261; // FNV offset basis
    const combined = source + '|' + contentHash;

    for (let i = 0; i < combined.length; i++) {
      hash ^= combined.charCodeAt(i);
      hash = Math.imul(hash, 16777619); // FNV prime
    }

    return (hash >>> 0).toString(36); // Unsigned conversion
  }

  /**
   * Clear all caches
   */
  clear(): void {
    this._cache.clear();
    this._classCache.clear();
    logger.debug('Tailwind caches cleared');
  }

  /**
   * Get cache statistics
   */
  getStats(): { compilationSize: number; classSize: number } {
    return {
      compilationSize: this._cache.size,
      classSize: this._classCache.size,
    };
  }
}

const compilationCache = new TailwindCache();

/**
 * Extract Tailwind class names from content (static extraction)
 * This pre-extracts classes before compilation for better caching
 */
function extractTailwindClasses(content: string): string[] {
  const classSet = new Set<string>();

  // Pattern for class attributes: class="..." or className="..."
  const classAttrRegex = /(?:class|className)=["']([^"']+)["']/g;
  let match;

  while ((match = classAttrRegex.exec(content)) !== null) {
    const classes = match[1].split(/\s+/).filter(Boolean);
    classes.forEach((c) => classSet.add(c));
  }

  // Pattern for template literals: `${...}` in className
  const templateRegex = /(?:class|className)=\{`([^`]+)`\}/g;

  while ((match = templateRegex.exec(content)) !== null) {
    // Extract static parts only
    const staticParts = match[1].replace(/\$\{[^}]+\}/g, ' ').split(/\s+/).filter(Boolean);
    staticParts.forEach((c) => classSet.add(c));
  }

  // Pattern for Tailwind arbitrary values: [...], w-[100px], etc.
  const arbitraryRegex = /\b([a-z]+-\[[^\]]+\])/g;

  while ((match = arbitraryRegex.exec(content)) !== null) {
    classSet.add(match[1]);
  }

  return Array.from(classSet);
}

/**
 * Tailwind CSS Compiler implementation
 */
export class TailwindCompiler implements FrameworkCompiler {
  name = 'Tailwind';
  extensions = ['.css'];

  private _jitModule: TailwindJIT | null = null;
  private _processor: TailwindProcessor | null = null;
  private _initialized = false;
  private _contentFiles: ContentFile[] = [];

  /**
   * Initialize the Tailwind JIT compiler
   */
  async init(): Promise<void> {
    // Check global flag first (can only be initialized once globally)
    if (globalTailwindInitialized && cachedProcessor) {
      logger.debug('Tailwind JIT already initialized globally, reusing');
      this._processor = cachedProcessor;
      this._initialized = true;

      return;
    }

    // If initialization is in progress, wait for the existing Promise
    if (globalTailwindPromise) {
      logger.debug('Tailwind JIT initialization in progress, waiting...');

      try {
        await globalTailwindPromise;
        this._processor = cachedProcessor;
        this._initialized = true;

        return;
      } catch {
        logger.warn('Previous Tailwind init failed, retrying...');
      }
    }

    const startTime = performance.now();
    logger.info('Initializing Tailwind JIT compiler...');

    try {
      // Create the Promise BEFORE calling import to prevent race condition
      globalTailwindPromise = this._loadAndInitialize();
      (globalThis as any).__tailwindPromise = globalTailwindPromise;

      await globalTailwindPromise;

      const loadTime = (performance.now() - startTime).toFixed(0);
      logger.info(`Tailwind JIT compiler initialized (${loadTime}ms)`);
    } catch (error) {
      // Reset the Promise on failure to allow retry
      globalTailwindPromise = null;
      (globalThis as any).__tailwindPromise = null;

      // Don't throw - just log and continue with fallback mode
      // This can happen due to CSP restrictions blocking esm.sh
      logger.warn('Tailwind JIT unavailable (CSP or network issue), using fallback mode:', error);
      this._initialized = false;
    }
  }

  /**
   * Load and initialize the Tailwind JIT module
   */
  private async _loadAndInitialize(): Promise<void> {
    // Dynamically import the compiler from CDN
    const jitModule = await import(/* @vite-ignore */ TAILWIND_JIT_CDN);
    this._jitModule = jitModule;

    // Create the processor with default config
    const processor = jitModule.createTailwindcss({
      corePlugins: {
        preflight: true, // Include Tailwind's base styles
      },
    });

    this._processor = processor;
    cachedProcessor = processor;
    (globalThis as any).__tailwindProcessor = processor;

    this._initialized = true;
    globalTailwindInitialized = true;
    (globalThis as any).__tailwindInitialized = true;
  }

  /**
   * Check if this compiler can handle a file
   */
  canHandle(filename: string): boolean {
    return filename.endsWith('.css');
  }

  /**
   * Check if CSS content needs Tailwind compilation
   */
  needsCompilation(css: string): boolean {
    return css.includes('@tailwind') || css.includes('@apply') || css.includes('@layer');
  }

  /** Pre-extracted classes from content files */
  private _extractedClasses: string[] = [];

  /** Last content hash for cache invalidation */
  private _lastContentHash = '';

  /**
   * Set content files for class extraction
   * These files are scanned to extract Tailwind class names
   */
  setContentFiles(files: ContentFile[]): void {
    this._contentFiles = files;

    // Pre-extract classes when content files change
    this._extractedClasses = [];

    for (const file of files) {
      const classes = extractTailwindClasses(file.content);
      this._extractedClasses.push(...classes);
    }

    // Deduplicate
    this._extractedClasses = [...new Set(this._extractedClasses)];

    logger.debug(`Pre-extracted ${this._extractedClasses.length} unique Tailwind classes`);
  }

  /**
   * Get pre-extracted classes
   */
  getExtractedClasses(): string[] {
    return this._extractedClasses;
  }

  /**
   * Extract all content strings for Tailwind to scan
   */
  private _getContentStrings(): string[] {
    return this._contentFiles.map((f) => f.content);
  }

  /**
   * Generate a hash of content files for cache invalidation
   * Uses FNV-1a for better distribution
   */
  private _getContentHash(): string {
    let hash = 2166136261; // FNV offset basis

    for (const file of this._contentFiles) {
      for (let i = 0; i < file.content.length; i++) {
        hash ^= file.content.charCodeAt(i);
        hash = Math.imul(hash, 16777619);
      }
    }

    return (hash >>> 0).toString(36);
  }

  /**
   * Check if content has changed since last compilation
   */
  hasContentChanged(): boolean {
    const currentHash = this._getContentHash();
    const changed = currentHash !== this._lastContentHash;

    if (changed) {
      this._lastContentHash = currentHash;
    }

    return changed;
  }

  /**
   * Get cache statistics for debugging
   */
  getCacheStats(): { compilationSize: number; classSize: number } {
    return compilationCache.getStats();
  }

  /**
   * Clear all caches (useful for testing or manual refresh)
   */
  clearCaches(): void {
    compilationCache.clear();
    this._extractedClasses = [];
    this._lastContentHash = '';
  }

  /**
   * Compile Tailwind CSS
   */
  async compile(source: string, filename: string): Promise<CompilationResult> {
    const startTime = performance.now();
    logger.debug(`Compiling Tailwind CSS: ${filename}`);

    // If CSS doesn't need Tailwind compilation, return as-is
    if (!this.needsCompilation(source)) {
      logger.debug(`No Tailwind directives in ${filename}, skipping compilation`);
      return {
        code: source,
        warnings: [],
      };
    }

    // Check cache
    const contentHash = this._getContentHash();
    const cacheKey = compilationCache.generateKey(source, contentHash);
    const cached = compilationCache.get(cacheKey);

    if (cached) {
      logger.debug(`Cache hit for ${filename}`);
      return {
        code: cached,
        warnings: [],
      };
    }

    // Try JIT compilation first
    if (this._processor && this._initialized) {
      try {
        const contentStrings = this._getContentStrings();

        /*
         * If no content files provided, add a minimal content string
         * This ensures base styles are generated even without class extraction
         */
        if (contentStrings.length === 0) {
          contentStrings.push('<div class="container mx-auto p-4"></div>');
        }

        const compiledCSS = await this._processor.generateStylesFromContent(source, contentStrings);

        // Cache the result
        compilationCache.set(cacheKey, compiledCSS);

        const compileTime = (performance.now() - startTime).toFixed(0);
        logger.debug(`Compiled ${filename} via JIT (${compileTime}ms)`);

        return {
          code: compiledCSS,
          warnings: [],
        };
      } catch (error) {
        logger.warn(`JIT compilation failed for ${filename}, using fallback:`, error);

        // Fall through to fallback
      }
    }

    /*
     * Fallback: Include marker so browser-build-adapter.ts triggers CDN fallback
     * The CDN fallback will provide Tailwind with custom theme from tailwind.config.js
     */
    const strippedCSS = this._stripTailwindDirectives(source);

    // Include marker that triggers CDN fallback in browser-build-adapter.ts (line ~2877)
    const fallbackCSS = `/* Tailwind compilation failed - using CDN fallback */
${strippedCSS}`;

    const compileTime = (performance.now() - startTime).toFixed(0);
    logger.debug(`Used fallback for ${filename} (${compileTime}ms)`);

    return {
      code: fallbackCSS,
      warnings: [`Tailwind JIT unavailable, using CDN fallback for ${filename}`],
    };
  }

  /**
   * Strip Tailwind directives while preserving other CSS
   * Used as fallback when JIT compilation fails
   */
  private _stripTailwindDirectives(css: string): string {
    // Remove @tailwind directives
    let result = css.replace(/@tailwind\s+[^;]+;\s*/g, '');

    // Remove @apply directives (they're invalid without Tailwind)
    result = result.replace(/@apply\s+[^;]+;\s*/g, '');

    // Handle @layer blocks with nested braces
    // We need to properly match balanced braces
    result = this._processLayerBlocks(result);

    // Clean up empty rules like "* { }" or "body { }"
    result = result.replace(/[a-zA-Z*][^{}]*\{\s*\}/g, '');

    // Clean up multiple empty lines
    result = result.replace(/\n{3,}/g, '\n\n');

    return result.trim();
  }

  /**
   * Process @layer blocks, extracting their content
   * Handles nested braces correctly using a simple state machine
   */
  private _processLayerBlocks(css: string): string {
    // Find all @layer blocks and process them
    const layerRegex = /@layer\s+(base|components|utilities)\s*\{/g;
    let result = '';
    let lastIndex = 0;
    let match;

    while ((match = layerRegex.exec(css)) !== null) {
      // Add everything before this @layer
      result += css.slice(lastIndex, match.index);

      // Find the matching closing brace
      const startBrace = match.index + match[0].length - 1;
      const endBrace = this._findMatchingBrace(css, startBrace);

      if (endBrace !== -1) {
        // Extract content between braces
        const content = css.slice(startBrace + 1, endBrace);

        // Remove @apply from content and clean up
        const processedContent = content
          .replace(/@apply\s+[^;]+;\s*/g, '')
          .trim();

        // Clean up empty selectors (e.g., "* { }")
        const cleanedContent = processedContent
          .replace(/[a-zA-Z*][^{}]*\{\s*\}/g, '')
          .trim();

        if (cleanedContent) {
          result += `/* Layer: ${match[1]} */\n${cleanedContent}\n`;
        }

        lastIndex = endBrace + 1;
        // Update regex lastIndex to continue from after this block
        layerRegex.lastIndex = lastIndex;
      } else {
        // No matching brace, skip this match
        lastIndex = match.index + match[0].length;
      }
    }

    // Add remaining content after last @layer
    result += css.slice(lastIndex);

    return result;
  }

  /**
   * Find the matching closing brace for an opening brace
   */
  private _findMatchingBrace(css: string, start: number): number {
    if (css[start] !== '{') {
      return -1;
    }

    let depth = 1;
    let i = start + 1;

    while (i < css.length && depth > 0) {
      if (css[i] === '{') {
        depth++;
      } else if (css[i] === '}') {
        depth--;
      }

      i++;
    }

    return depth === 0 ? i - 1 : -1;
  }
}

/**
 * Factory function
 */
export function createTailwindCompiler(): TailwindCompiler {
  return new TailwindCompiler();
}
