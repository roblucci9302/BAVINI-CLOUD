/**
 * =============================================================================
 * BAVINI CLOUD - Browser Build Adapter
 * =============================================================================
 * Runtime adapter utilisant esbuild-wasm pour bundler le code directement
 * dans le navigateur, sans dépendre de WebContainer.
 *
 * Caractéristiques:
 * - Build 100% côté client avec esbuild-wasm
 * - Résolution des packages npm via esm.sh CDN
 * - Preview via Blob URL (pas de serveur)
 * - Support React, Vue, Svelte, Vanilla JS/TS
 * =============================================================================
 */

import * as esbuild from 'esbuild-wasm';
import { BaseRuntimeAdapter } from '../adapter';
import type {
  FileMap,
  BundleResult,
  BuildOptions,
  TransformOptions,
  PreviewInfo,
  RuntimeStatus,
  BuildError,
  BuildWarning,
} from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('BrowserBuildAdapter');

/**
 * URL du WASM esbuild
 */
const ESBUILD_WASM_URL = 'https://unpkg.com/esbuild-wasm@0.27.2/esbuild.wasm';

/**
 * CDN pour les packages npm
 */
const ESM_SH_CDN = 'https://esm.sh';

/**
 * LRU Cache with TTL for module caching.
 * Prevents unbounded memory growth from cached CDN responses.
 */
class LRUCache<K, V> {
  private cache = new Map<K, { value: V; lastAccess: number }>();
  private maxSize: number;
  private maxAge: number;

  constructor(maxSize: number = 100, maxAgeMs: number = 3600000) {
    this.maxSize = maxSize;
    this.maxAge = maxAgeMs;
  }

  get(key: K): V | undefined {
    const entry = this.cache.get(key);

    if (!entry) {
      return undefined;
    }

    // Check expiration
    if (Date.now() - entry.lastAccess > this.maxAge) {
      this.cache.delete(key);
      return undefined;
    }

    // Update lastAccess (move to end for LRU)
    entry.lastAccess = Date.now();

    return entry.value;
  }

  set(key: K, value: V): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    this.cache.set(key, { value, lastAccess: Date.now() });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  private evictOldest(): void {
    let oldest: K | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < oldestTime) {
        oldest = key;
        oldestTime = entry.lastAccess;
      }
    }

    if (oldest !== null) {
      this.cache.delete(oldest);
    }
  }

  clear(): void {
    this.cache.clear();
  }

  get size(): number {
    return this.cache.size;
  }
}

/**
 * Cache des modules résolus avec LRU et TTL.
 * - Max 150 modules en cache
 * - TTL de 1 heure
 */
const moduleCache = new LRUCache<string, string>(
  150,      // Max 150 modules cached
  3600000   // 1 hour TTL
);

/**
 * Base URL for esm.sh CDN (used to resolve relative paths in CDN responses)
 */
const ESM_SH_BASE = 'https://esm.sh';

/**
 * Global flag to track esbuild initialization (esbuild-wasm can only be initialized once)
 * Preserved across HMR and instance recreation
 */
let globalEsbuildInitialized: boolean = (globalThis as any).__esbuildInitialized ?? false;

/**
 * Global Promise to synchronize concurrent init calls (prevents race condition)
 */
let globalEsbuildPromise: Promise<void> | null = (globalThis as any).__esbuildPromise ?? null;

/**
 * BrowserBuildAdapter - Runtime sans WebContainer
 */
export class BrowserBuildAdapter extends BaseRuntimeAdapter {
  readonly name = 'BrowserBuild';
  readonly supportsTerminal = false;
  readonly supportsShell = false;
  readonly supportsNodeServer = false;
  readonly isBrowserOnly = true;
  readonly supportedFrameworks = ['react', 'vue', 'svelte', 'vanilla', 'preact'];

  /**
   * SECURITY: Allowed file extensions for the virtual file system.
   * Prevents execution of arbitrary file types.
   */
  private readonly ALLOWED_EXTENSIONS = new Set([
    '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
    '.json', '.css', '.scss', '.sass', '.less',
    '.html', '.md', '.txt', '.svg', '.xml',
    '.vue', '.svelte', '.astro',
    '.yaml', '.yml', '.toml',
    '.env', '.env.local', '.env.development', '.env.production',
    '.gitignore', '.npmrc', '.prettierrc', '.eslintrc',
  ]);

  /**
   * SECURITY: Maximum file size (5MB).
   * Prevents memory exhaustion from large files.
   */
  private readonly MAX_FILE_SIZE = 5 * 1024 * 1024;

  private _status: RuntimeStatus = 'idle';
  private _files: Map<string, string> = new Map();
  private _preview: PreviewInfo | null = null;
  private _esbuildInitialized = false;
  private _previewIframe: HTMLIFrameElement | null = null;
  private _blobUrl: string | null = null;

  get status(): RuntimeStatus {
    return this._status;
  }

  /**
   * Initialize esbuild-wasm
   * Thread-safe: handles concurrent init calls via shared Promise
   */
  async init(): Promise<void> {
    // Check global flag first (esbuild-wasm can only be initialized once globally)
    if (globalEsbuildInitialized) {
      logger.debug('esbuild already initialized globally, reusing');
      this._esbuildInitialized = true;
      this._status = 'ready';
      this.emitStatusChange('ready');
      return;
    }

    // If initialization is in progress, wait for the existing Promise
    // This prevents race condition when multiple adapters call init() simultaneously
    if (globalEsbuildPromise) {
      logger.debug('esbuild initialization in progress, waiting...');
      try {
        await globalEsbuildPromise;
        this._esbuildInitialized = true;
        this._status = 'ready';
        this.emitStatusChange('ready');
        return;
      } catch (error) {
        // Previous init failed, we'll try again below
        logger.warn('Previous esbuild init failed, retrying...');
      }
    }

    this._status = 'initializing';
    this.emitStatusChange('initializing');

    try {
      logger.info('Initializing esbuild-wasm...');

      // Create the Promise BEFORE calling initialize to prevent race condition
      globalEsbuildPromise = esbuild.initialize({
        wasmURL: ESBUILD_WASM_URL,
      });
      (globalThis as any).__esbuildPromise = globalEsbuildPromise;

      await globalEsbuildPromise;

      // Set both instance and global flags
      this._esbuildInitialized = true;
      globalEsbuildInitialized = true;
      (globalThis as any).__esbuildInitialized = true;

      this._status = 'ready';
      this.emitStatusChange('ready');

      logger.info('esbuild-wasm initialized successfully');
    } catch (error) {
      // Reset the Promise on failure to allow retry
      globalEsbuildPromise = null;
      (globalThis as any).__esbuildPromise = null;

      this._status = 'error';
      this.emitStatusChange('error');
      logger.error('Failed to initialize esbuild-wasm:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   * Robust: handles errors during cleanup to ensure all resources are freed
   */
  async destroy(): Promise<void> {
    logger.info('Destroying BrowserBuildAdapter...');

    const errors: Error[] = [];

    // Revoke blob URL with error handling
    if (this._blobUrl) {
      try {
        URL.revokeObjectURL(this._blobUrl);
        logger.debug('Revoked blob URL during destroy');
      } catch (error) {
        logger.warn('Failed to revoke blob URL:', error);
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
      this._blobUrl = null;
    }

    // Remove iframe with error handling
    if (this._previewIframe) {
      try {
        this._previewIframe.remove();
        logger.debug('Removed preview iframe');
      } catch (error) {
        logger.warn('Failed to remove iframe:', error);
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
      this._previewIframe = null;
    }

    // Clear files (always execute even if previous steps failed)
    try {
      this._files.clear();
    } catch (error) {
      logger.warn('Failed to clear files:', error);
    }

    this._preview = null;
    this._status = 'idle';

    if (errors.length > 0) {
      logger.error(`Cleanup completed with ${errors.length} error(s)`);
    } else {
      logger.info('BrowserBuildAdapter destroyed successfully');
    }

    // Note: esbuild doesn't have a cleanup method in browser
  }

  /**
   * SECURITY: Validate file before writing to virtual file system.
   * Checks extension, size, and content for suspicious patterns.
   */
  private validateFile(path: string, content: string): void {
    const normalizedPath = this.normalizePath(path);

    // Get file extension (handle files without extension like .gitignore)
    const lastDotIndex = normalizedPath.lastIndexOf('.');
    const lastSlashIndex = normalizedPath.lastIndexOf('/');

    let ext: string;

    if (lastDotIndex > lastSlashIndex) {
      ext = normalizedPath.substring(lastDotIndex).toLowerCase();
    } else {
      // File has no extension - check if it's a known dotfile
      const fileName = normalizedPath.substring(lastSlashIndex + 1);

      if (fileName.startsWith('.')) {
        ext = fileName; // Use full filename as "extension" for dotfiles
      } else {
        ext = ''; // No extension
      }
    }

    // Check if extension is allowed (skip validation for files without extension that aren't dotfiles)
    if (ext && !this.ALLOWED_EXTENSIONS.has(ext)) {
      logger.warn(`SECURITY: Blocked file with disallowed extension: ${path} (${ext})`);
      throw new Error(`Type de fichier non autorisé: ${ext}`);
    }

    // Check file size
    const sizeBytes = new TextEncoder().encode(content).length;

    if (sizeBytes > this.MAX_FILE_SIZE) {
      const sizeMB = (sizeBytes / 1024 / 1024).toFixed(2);
      const maxMB = (this.MAX_FILE_SIZE / 1024 / 1024).toFixed(0);
      logger.warn(`SECURITY: Blocked file exceeding size limit: ${path} (${sizeMB}MB)`);
      throw new Error(`Fichier trop volumineux: ${sizeMB}MB (max: ${maxMB}MB)`);
    }

    // Check for suspicious content patterns
    if (content.startsWith('#!') && !path.endsWith('.sh')) {
      logger.warn(`SECURITY: Shebang detected in non-shell file: ${path}`);
      // Don't block, just warn - shebangs in wrong files are suspicious but not always malicious
    }

    // Check for base64 encoded executables
    if (content.includes('TVqQAAMAAAAE') || content.includes('f0VMRgI')) {
      logger.error(`SECURITY: Possible embedded binary detected in: ${path}`);
      throw new Error(`Contenu binaire détecté dans: ${path}`);
    }
  }

  /**
   * Write multiple files with validation
   */
  async writeFiles(files: FileMap): Promise<void> {
    // Validate all files first before writing any
    for (const [path, content] of files) {
      this.validateFile(path, content);
    }

    // Write files after validation passes
    for (const [path, content] of files) {
      this._files.set(this.normalizePath(path), content);
    }

    logger.debug(`Wrote ${files.size} files`);
  }

  /**
   * Write a single file with validation
   */
  async writeFile(path: string, content: string): Promise<void> {
    this.validateFile(path, content);
    this._files.set(this.normalizePath(path), content);
  }

  /**
   * Read a file
   */
  async readFile(path: string): Promise<string | null> {
    return this._files.get(this.normalizePath(path)) ?? null;
  }

  /**
   * Delete a file
   */
  async deleteFile(path: string): Promise<void> {
    this._files.delete(this.normalizePath(path));
  }

  /**
   * List directory contents
   */
  async readdir(path: string): Promise<string[]> {
    const normalizedPath = this.normalizePath(path);
    const prefix = normalizedPath === '/' ? '/' : normalizedPath + '/';
    const entries = new Set<string>();

    for (const filePath of this._files.keys()) {
      if (filePath.startsWith(prefix)) {
        const relativePath = filePath.substring(prefix.length);
        const firstPart = relativePath.split('/')[0];

        if (firstPart) {
          entries.add(firstPart);
        }
      }
    }

    return Array.from(entries);
  }

  /**
   * Build the project using esbuild-wasm
   */
  async build(options: BuildOptions): Promise<BundleResult> {
    const startTime = performance.now();

    this._status = 'building';
    this.emitStatusChange('building');
    this.emitBuildProgress('starting', 0);

    try {
      // Check entry point exists
      const entryPoint = this.normalizePath(options.entryPoint);
      const foundEntry = this.findFile(entryPoint);

      if (!foundEntry) {
        // Reset to ready - we're not in a failed state, just waiting for more files
        this._status = 'ready';
        this.emitStatusChange('ready');
        logger.warn(`Entry point not found: ${entryPoint}. Available files:`, Array.from(this._files.keys()));

        return {
          code: '',
          css: '',
          errors: [{ message: `Entry point not found: ${entryPoint}`, file: entryPoint }],
          warnings: [],
          buildTime: performance.now() - startTime,
          hash: '',
        };
      }

      // Create a virtual bootstrap entry that mounts React
      // This wraps the actual entry point with React mounting code
      const bootstrapEntry = this.createBootstrapEntry(foundEntry);
      const entryDir = foundEntry.substring(0, foundEntry.lastIndexOf('/')) || '/';

      logger.debug(`Building entry: ${foundEntry} in dir: ${entryDir}`);
      logger.debug(`Available files:`, Array.from(this._files.keys()));

      this.emitBuildProgress('bundling', 20);

      // Build with esbuild
      const result = await esbuild.build({
        stdin: {
          contents: bootstrapEntry,
          loader: 'tsx',
          resolveDir: entryDir,
          sourcefile: '/__bootstrap__.tsx',
        },
        bundle: true,
        format: 'esm',
        target: 'es2020',
        minify: options.minify ?? options.mode === 'production',
        sourcemap: options.sourcemap ? 'inline' : false,
        define: {
          'process.env.NODE_ENV': `"${options.mode}"`,
          ...options.define,
        },
        jsx: 'automatic',
        jsxImportSource: 'react',
        // virtual-fs first to handle local files and path aliases (@/) before esm-sh
        // esm-sh will handle remaining bare imports (npm packages)
        plugins: [this.createVirtualFsPlugin(), this.createEsmShPlugin()],
        write: false,
        outdir: '/dist', // Required for outputFiles to be populated
        logLevel: 'warning',
      });

      this.emitBuildProgress('bundling', 80);

      // Debug: log all output files
      logger.debug('esbuild outputFiles:', result.outputFiles?.map((f) => ({ path: f.path, size: f.text.length })));

      // Extract outputs - esbuild may use different extensions or paths
      const jsOutput = result.outputFiles?.find((f) => f.path.endsWith('.js') || f.path.includes('stdin'));
      const cssOutput = result.outputFiles?.find((f) => f.path.endsWith('.css'));

      const code = jsOutput?.text || '';
      const css = cssOutput?.text || '';

      logger.debug(`Extracted code: ${code.length} chars, css: ${css.length} chars`);

      // Convert esbuild errors/warnings
      const errors: BuildError[] = result.errors.map((e) => ({
        message: e.text,
        file: e.location?.file,
        line: e.location?.line,
        column: e.location?.column,
        snippet: e.location?.lineText,
      }));

      const warnings: BuildWarning[] = result.warnings.map((w) => ({
        message: w.text,
        file: w.location?.file,
        line: w.location?.line,
        column: w.location?.column,
      }));

      // Generate hash
      const hash = this.generateHash(code);

      this.emitBuildProgress('generating preview', 90);

      // Create preview
      logger.debug(`Build result: code=${code.length} chars, errors=${errors.length}`);

      if (code && errors.length === 0) {
        logger.info('Creating preview...');
        await this.createPreview(code, css, options);
        logger.info('Preview creation completed');
      } else {
        logger.warn(`Skipping preview: code empty=${!code}, errors=${errors.length}`);
      }

      this.emitBuildProgress('complete', 100);

      this._status = 'ready';
      this.emitStatusChange('ready');

      return {
        code,
        css,
        errors,
        warnings,
        buildTime: performance.now() - startTime,
        hash,
      };
    } catch (error) {
      // Reset to ready instead of staying in error - allows retries when more files are written
      // This is important because the build may fail due to missing files that haven't been written yet
      this._status = 'ready';
      this.emitStatusChange('ready');

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.warn('Build failed (will retry when files change):', errorMessage);

      return {
        code: '',
        css: '',
        errors: [{ message: errorMessage }],
        warnings: [],
        buildTime: performance.now() - startTime,
        hash: '',
      };
    }
  }

  /**
   * Transform a single file
   */
  async transform(code: string, options: TransformOptions): Promise<string> {
    const result = await esbuild.transform(code, {
      loader: options.loader,
      sourcefile: options.filename,
      jsx: 'automatic',
      jsxImportSource: 'react',
      target: 'es2020',
    });

    return result.code;
  }

  /**
   * Get current preview info
   */
  getPreview(): PreviewInfo | null {
    return this._preview;
  }

  /**
   * Refresh preview
   */
  async refreshPreview(): Promise<void> {
    if (this._preview && this._previewIframe) {
      this._previewIframe.src = this._preview.url;
      this._preview = {
        ...this._preview,
        updatedAt: Date.now(),
      };
      this.emitPreviewReady(this._preview);
    }
  }

  // ===========================================================================
  // PRIVATE METHODS
  // ===========================================================================

  /**
   * Normalize file path
   */
  private normalizePath(path: string): string {
    if (!path.startsWith('/')) {
      path = '/' + path;
    }

    return path.replace(/\/+/g, '/');
  }

  /**
   * Get esbuild loader from file extension
   */
  private getLoader(path: string): esbuild.Loader {
    const ext = path.split('.').pop()?.toLowerCase();

    switch (ext) {
      case 'ts':
        return 'ts';
      case 'tsx':
        return 'tsx';
      case 'jsx':
        return 'jsx';
      case 'js':
      case 'mjs':
        return 'js';
      case 'css':
        return 'css';
      case 'json':
        return 'json';
      case 'txt':
      case 'md':
        return 'text';
      default:
        return 'tsx';
    }
  }

  /**
   * Create virtual filesystem plugin for esbuild
   */
  /**
   * Next.js shims for browser-only builds
   * These provide browser-compatible implementations of Next.js-specific modules
   */
  private readonly NEXTJS_SHIMS: Record<string, string> = {
    'next/font/google': `
      // Browser shim for next/font/google
      export function Inter(options) {
        return {
          className: 'font-inter',
          variable: options?.variable || '--font-inter',
          style: { fontFamily: 'Inter, system-ui, sans-serif' }
        };
      }
      export function Roboto(options) {
        return {
          className: 'font-roboto',
          variable: options?.variable || '--font-roboto',
          style: { fontFamily: 'Roboto, system-ui, sans-serif' }
        };
      }
      export function Open_Sans(options) {
        return {
          className: 'font-open-sans',
          variable: options?.variable || '--font-open-sans',
          style: { fontFamily: '"Open Sans", system-ui, sans-serif' }
        };
      }
      export function Poppins(options) {
        return {
          className: 'font-poppins',
          variable: options?.variable || '--font-poppins',
          style: { fontFamily: 'Poppins, system-ui, sans-serif' }
        };
      }
      // Default export for any font
      export default function GoogleFont(options) {
        return {
          className: 'font-sans',
          variable: '--font-sans',
          style: { fontFamily: 'system-ui, sans-serif' }
        };
      }
    `,
    'next/image': `
      // Browser shim for next/image
      import React from 'react';

      function Image({ src, alt, width, height, fill, className, style, priority, ...props }) {
        const imgStyle = fill
          ? { position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', objectFit: style?.objectFit || 'cover', ...style }
          : { width, height, ...style };

        return React.createElement('img', {
          src: typeof src === 'object' ? src.src : src,
          alt: alt || '',
          className,
          style: imgStyle,
          loading: priority ? 'eager' : 'lazy',
          ...props
        });
      }

      export default Image;
    `,
    'next/link': `
      // Browser shim for next/link
      import React from 'react';

      function Link({ href, children, className, style, onClick, ...props }) {
        const handleClick = (e) => {
          if (onClick) onClick(e);
          // For browser preview, just use normal anchor behavior
        };

        return React.createElement('a', {
          href: typeof href === 'object' ? href.pathname : href,
          className,
          style,
          onClick: handleClick,
          ...props
        }, children);
      }

      export default Link;
    `,
    'next/navigation': `
      // Browser shim for next/navigation
      export function useRouter() {
        return {
          push: (url) => { window.location.href = url; },
          replace: (url) => { window.location.replace(url); },
          back: () => { window.history.back(); },
          forward: () => { window.history.forward(); },
          refresh: () => { window.location.reload(); },
          prefetch: () => Promise.resolve(),
        };
      }

      export function usePathname() {
        return typeof window !== 'undefined' ? window.location.pathname : '/';
      }

      export function useSearchParams() {
        const params = typeof window !== 'undefined'
          ? new URLSearchParams(window.location.search)
          : new URLSearchParams();
        return {
          get: (key) => params.get(key),
          getAll: (key) => params.getAll(key),
          has: (key) => params.has(key),
          keys: () => params.keys(),
          values: () => params.values(),
          entries: () => params.entries(),
          forEach: (fn) => params.forEach(fn),
          toString: () => params.toString(),
        };
      }

      export function useParams() {
        return {};
      }

      export function notFound() {
        throw new Error('Not Found');
      }

      export function redirect(url) {
        if (typeof window !== 'undefined') {
          window.location.href = url;
        }
      }
    `,
    'next': `
      // Browser shim for next
      export const Metadata = {};
      export default {};
    `,
  };

  private createVirtualFsPlugin(): esbuild.Plugin {
    return {
      name: 'virtual-fs',
      setup: (build) => {
        // Handle Next.js-specific imports with browser shims
        // This MUST come before esm-sh plugin tries to fetch from CDN
        build.onResolve({ filter: /^next(\/|$)/ }, (args) => {
          // Skip if coming from esm-sh namespace
          if (args.namespace === 'esm-sh') {
            return null;
          }

          // Check if we have a shim for this import
          const shimKey = args.path;
          if (this.NEXTJS_SHIMS[shimKey]) {
            logger.debug(`Resolving Next.js shim: ${args.path}`);
            return { path: args.path, namespace: 'nextjs-shim' };
          }

          // For other next/* imports, still try to use shim namespace
          // so we can provide a fallback
          logger.debug(`Resolving Next.js import (no specific shim): ${args.path}`);
          return { path: args.path, namespace: 'nextjs-shim' };
        });

        // Load Next.js shims
        build.onLoad({ filter: /.*/, namespace: 'nextjs-shim' }, (args) => {
          const shimCode = this.NEXTJS_SHIMS[args.path];

          if (shimCode) {
            logger.debug(`Loading Next.js shim for: ${args.path}`);
            return { contents: shimCode, loader: 'jsx' };
          }

          // Provide a minimal fallback for unknown next/* imports
          logger.warn(`No shim for Next.js import: ${args.path}, providing empty module`);
          return {
            contents: `
              // Empty shim for ${args.path}
              export default {};
            `,
            loader: 'js'
          };
        });

        // Resolve @/ path aliases (e.g., @/components/Header -> /src/components/Header)
        // This MUST be handled BEFORE esm-sh plugin tries to resolve as npm package
        build.onResolve({ filter: /^@\// }, (args) => {
          // Skip if coming from esm-sh namespace
          if (args.namespace === 'esm-sh') {
            return null;
          }

          // Convert @/path to /src/path
          const virtualPath = args.path.replace(/^@\//, '/src/');
          const resolveDir = virtualPath.substring(0, virtualPath.lastIndexOf('/')) || '/';

          logger.debug(`Resolving @/ alias: ${args.path} -> ${virtualPath}`);

          return { path: virtualPath, namespace: 'virtual-fs', pluginData: { resolveDir } };
        });

        // Resolve relative imports (./file or ../file) - only from virtual-fs or no namespace
        build.onResolve({ filter: /^\./ }, (args) => {
          // Skip if coming from esm-sh namespace - let esm-sh handle its own relative imports
          if (args.namespace === 'esm-sh') {
            return null;
          }

          // Determine the base path for resolution
          let basePath: string;

          if (args.importer && args.importer.startsWith('/')) {
            // Importer is already an absolute virtual path
            basePath = args.importer;
          } else if (args.resolveDir && args.resolveDir.startsWith('/')) {
            // Use resolveDir (for stdin entries or when importer is not absolute)
            // Create a fake file path in the resolveDir
            basePath = args.resolveDir + '/_entry';
          } else {
            // Fallback to root
            basePath = '/_entry';
          }

          const resolvedPath = this.resolveRelativePath(basePath, args.path);

          logger.debug(`Resolving relative import: ${args.path} from ${basePath} -> ${resolvedPath}`);

          // Return with resolveDir so bare imports in loaded files can be resolved by esm-sh
          const resolveDir = resolvedPath.substring(0, resolvedPath.lastIndexOf('/')) || '/';

          return { path: resolvedPath, namespace: 'virtual-fs', pluginData: { resolveDir } };
        });

        // Resolve absolute imports from virtual fs - but NOT esm.sh CDN paths
        build.onResolve({ filter: /^\// }, (args) => {
          // Skip if coming from esm-sh namespace - these are CDN paths like /react@19.2.3/...
          if (args.namespace === 'esm-sh') {
            return null;
          }

          // Skip CDN-like paths (contain @ version specifiers)
          if (args.path.match(/^\/@?[a-z0-9-]+@/i) || args.path.includes('/es2022/')) {
            return null;
          }

          const resolveDir = args.path.substring(0, args.path.lastIndexOf('/')) || '/';
          return { path: args.path, namespace: 'virtual-fs', pluginData: { resolveDir } };
        });

        // Load from virtual filesystem
        build.onLoad({ filter: /.*/, namespace: 'virtual-fs' }, (args) => {
          const foundPath = this.findFile(args.path);

          if (!foundPath) {
            // Log available files for debugging
            logger.debug(`File not found: ${args.path}. Available files:`, Array.from(this._files.keys()).slice(0, 20));
            return { errors: [{ text: `File not found: ${args.path}` }] };
          }

          const content = this._files.get(foundPath)!;
          const loader = this.getLoader(foundPath);

          // Set resolveDir so bare imports (like 'react') can be resolved by esm-sh plugin
          const resolveDir = foundPath.substring(0, foundPath.lastIndexOf('/')) || '/';

          // For CSS files, we inject them as a JS module that adds a style tag
          if (loader === 'css') {
            const escapedCSS = content
              .replace(/\\/g, '\\\\')
              .replace(/`/g, '\\`')
              .replace(/\$/g, '\\$');

            const cssInjector = `
              (function() {
                if (typeof document !== 'undefined') {
                  const style = document.createElement('style');
                  style.textContent = \`${escapedCSS}\`;
                  document.head.appendChild(style);
                }
              })();
            `;

            return {
              contents: cssInjector,
              loader: 'js',
              resolveDir, // Critical: allows bare imports in generated JS to be resolved
            };
          }

          return {
            contents: content,
            loader,
            resolveDir, // Critical: allows bare imports like 'react' to be resolved by esm-sh
          };
        });
      },
    };
  }

  /**
   * Find a file in the virtual filesystem, trying various extensions
   */
  private findFile(path: string): string | null {
    // Try exact path first
    if (this._files.has(path)) {
      return path;
    }

    // Try with common extensions
    const extensions = ['.tsx', '.ts', '.jsx', '.js', '.json', '.css', '.mjs'];

    for (const ext of extensions) {
      const pathWithExt = path + ext;

      if (this._files.has(pathWithExt)) {
        return pathWithExt;
      }
    }

    // Try index files
    const indexFiles = ['/index.tsx', '/index.ts', '/index.jsx', '/index.js'];

    for (const indexFile of indexFiles) {
      const indexPath = path + indexFile;

      if (this._files.has(indexPath)) {
        return indexPath;
      }
    }

    return null;
  }

  /**
   * Create esm.sh plugin for npm packages
   */
  private createEsmShPlugin(): esbuild.Plugin {
    return {
      name: 'esm-sh',
      setup: (build) => {
        // Handle CDN-relative paths starting with / (like /react@19.2.3/es2022/react.mjs)
        // These come from esm.sh module internals and need to be resolved to full URLs
        build.onResolve({ filter: /^\// }, (args) => {
          // Only handle if coming from esm-sh namespace or if it looks like a CDN path
          const isCdnPath = args.path.match(/^\/@?[a-z0-9-]+@/i) || args.path.includes('/es2022/');

          if (args.namespace === 'esm-sh' || isCdnPath) {
            const url = `${ESM_SH_BASE}${args.path}`;
            logger.debug(`Resolving CDN-relative path: ${args.path} -> ${url}`);
            return { path: url, namespace: 'esm-sh' };
          }

          // Let virtual-fs handle non-CDN absolute paths
          return null;
        });

        // Resolve bare imports (npm packages) - packages without ./ or ../
        build.onResolve({ filter: /^[^./]/ }, (args) => {
          // Skip if already a full URL (from rewritten imports in CDN code)
          // This prevents URL duplication like https://esm.sh/https://esm.sh/...
          if (args.path.startsWith('http://') || args.path.startsWith('https://')) {
            return { path: args.path, namespace: 'esm-sh' };
          }

          // Skip if already in esm-sh namespace (internal resolution)
          if (args.namespace === 'esm-sh') {
            // It's another npm package import from within esm.sh module
            return { path: `${ESM_SH_CDN}/${args.path}`, namespace: 'esm-sh' };
          }

          // Handle imports from virtual-fs files (like 'react' from App.tsx)
          // This is the critical case - bare imports need to go to esm.sh
          const packageName = args.path;

          // Use esm.sh CDN
          const url = `${ESM_SH_CDN}/${packageName}`;
          logger.debug(`Resolving bare import: ${args.path} -> ${url}`);

          return { path: url, namespace: 'esm-sh' };
        });

        // Handle relative imports within esm.sh modules (like /../pkg@version/... or ./file.mjs)
        build.onResolve({ filter: /^\.\.?\//, namespace: 'esm-sh' }, (args) => {
          // Resolve relative to the importer's URL
          const importerUrl = new URL(args.importer);
          const resolvedUrl = new URL(args.path, importerUrl);
          logger.debug(`Resolving esm.sh relative import: ${args.path} -> ${resolvedUrl.href}`);
          return { path: resolvedUrl.href, namespace: 'esm-sh' };
        });

        // Load from esm.sh
        build.onLoad({ filter: /.*/, namespace: 'esm-sh' }, async (args) => {
          let url = args.path;

          // Ensure it's a full URL
          if (!url.startsWith('http')) {
            url = `${ESM_SH_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
          }

          // Check cache
          if (moduleCache.has(url)) {
            return { contents: moduleCache.get(url)!, loader: 'js' };
          }

          try {
            logger.debug(`Fetching CDN: ${url}`);
            const response = await fetch(url, {
              redirect: 'follow',
              headers: {
                'User-Agent': 'BAVINI-Cloud/1.0',
              },
            });

            if (!response.ok) {
              throw new Error(`Failed to fetch ${url}: ${response.status}`);
            }

            let contents = await response.text();

            // esm.sh returns JavaScript that may import from relative paths
            // We need to rewrite those to absolute esm.sh URLs
            contents = this.rewriteEsmImports(contents, response.url);

            // Cache the result using the final URL (after redirects)
            moduleCache.set(url, contents);

            if (response.url !== url) {
              moduleCache.set(response.url, contents);
            }

            return { contents, loader: 'js' };
          } catch (error) {
            logger.error(`Failed to fetch CDN package: ${url}`, error);
            return {
              errors: [{ text: `Failed to fetch npm package: ${args.path}` }],
            };
          }
        });
      },
    };
  }

  /**
   * Rewrite relative imports in esm.sh responses to absolute URLs
   */
  private rewriteEsmImports(code: string, baseUrl: string): string {
    // Match ES module imports with relative paths
    // import X from "/../path" or import X from "/path"
    const importRegex = /from\s+["'](\/(\.\.\/)*[^"']+)["']/g;

    return code.replace(importRegex, (match, path) => {
      // Convert relative CDN path to absolute URL
      const absoluteUrl = new URL(path, baseUrl).href;
      return `from "${absoluteUrl}"`;
    });
  }

  /**
   * Resolve relative path with path traversal protection.
   * SECURITY: Prevents escaping the virtual file system root.
   */
  private resolveRelativePath(importer: string, relativePath: string): string {
    const importerDir = importer.substring(0, importer.lastIndexOf('/')) || '/';
    const parts = [...importerDir.split('/'), ...relativePath.split('/')];
    const resolved: string[] = [];

    for (const part of parts) {
      if (part === '..') {
        // SECURITY FIX: Never allow traversing above root
        if (resolved.length > 0) {
          resolved.pop();
        } else {
          logger.warn(`Path traversal attempt blocked: ${relativePath} from ${importer}`);
          // Don't pop - stay at root level
        }
      } else if (part !== '.' && part !== '') {
        resolved.push(part);
      }
    }

    const finalPath = '/' + resolved.join('/');

    // Additional validation: check for dangerous patterns
    if (!this.isPathSafe(finalPath)) {
      logger.error(`Unsafe path rejected: ${finalPath}`);
      throw new Error(`Invalid import path: ${relativePath}`);
    }

    return finalPath;
  }

  /**
   * Check if a resolved path is safe (no traversal attempts).
   * SECURITY: Additional validation layer.
   */
  private isPathSafe(path: string): boolean {
    // Must start with /
    if (!path.startsWith('/')) {
      return false;
    }

    // Must not contain dangerous patterns
    const dangerousPatterns = [
      /\.\./,           // Parent directory (should be resolved by now)
      /\/\//,           // Double slash
      /%2e/i,           // URL encoded .
      /%2f/i,           // URL encoded /
      /\\/,             // Backslash (Windows-style)
    ];

    return !dangerousPatterns.some((p) => p.test(path));
  }

  /**
   * Create a bootstrap entry that mounts React with the app
   * This handles Next.js-style layouts and pages, as well as standard React entry files
   */
  private createBootstrapEntry(entryPath: string): string {
    // Get the content of the entry file to analyze it
    const entryContent = this._files.get(entryPath) || '';

    // Check if this is already a mounting entry file (contains ReactDOM.render or createRoot)
    // These files don't export components - they just execute and mount the app
    const isMountingEntry = this.isMountingEntryFile(entryContent);

    if (isMountingEntry) {
      // For mounting entry files, just import them for side effects
      // The file will handle its own ReactDOM.createRoot().render() call
      logger.debug(`Entry ${entryPath} is a mounting file, importing for side effects`);
      return `import '${entryPath.replace(/\.tsx?$/, '')}';`;
    }

    // Find the main page component (for Next.js style apps)
    const pagePath = this.findFile('/src/app/page');

    // Build import statements based on what files exist
    const imports: string[] = [
      `import React from 'react';`,
      `import { createRoot } from 'react-dom/client';`,
    ];

    let appComponent = '';

    if (pagePath) {
      // We have both layout and page (Next.js style)
      imports.push(`import RootLayout from '${entryPath.replace(/\.tsx?$/, '')}';`);
      imports.push(`import HomePage from '${pagePath.replace(/\.tsx?$/, '')}';`);

      appComponent = `
function App() {
  return (
    <RootLayout>
      <HomePage />
    </RootLayout>
  );
}`;
    } else {
      // Check if the entry exports a default or named component
      const hasDefaultExport = /export\s+default\s+/.test(entryContent);
      const hasNamedAppExport = /export\s+(function|const|class)\s+App/.test(entryContent);

      if (hasDefaultExport) {
        imports.push(`import MainComponent from '${entryPath.replace(/\.tsx?$/, '')}';`);
        appComponent = `
function App() {
  return <MainComponent />;
}`;
      } else if (hasNamedAppExport) {
        imports.push(`import { App as MainComponent } from '${entryPath.replace(/\.tsx?$/, '')}';`);
        appComponent = `
function App() {
  return <MainComponent />;
}`;
      } else {
        // Fallback: try to find the main App component file
        const appFilePath = this.findFile('/src/App');
        if (appFilePath) {
          const appContent = this._files.get(appFilePath) || '';
          const appHasDefault = /export\s+default\s+/.test(appContent);
          const appHasNamed = /export\s+(function|const|class)\s+App/.test(appContent);

          if (appHasDefault) {
            imports.push(`import MainComponent from '${appFilePath.replace(/\.tsx?$/, '')}';`);
          } else if (appHasNamed) {
            imports.push(`import { App as MainComponent } from '${appFilePath.replace(/\.tsx?$/, '')}';`);
          } else {
            imports.push(`import MainComponent from '${appFilePath.replace(/\.tsx?$/, '')}';`);
          }
        } else {
          // Last resort: try default import
          imports.push(`import MainComponent from '${entryPath.replace(/\.tsx?$/, '')}';`);
        }

        appComponent = `
function App() {
  return <MainComponent />;
}`;
      }
    }

    // Generate the bootstrap code
    return `
${imports.join('\n')}

${appComponent}

// Mount the app
const container = document.getElementById('root');
if (container) {
  const root = createRoot(container);
  root.render(
    <React.StrictMode>
      <App />
    </React.StrictMode>
  );
} else {
  console.error('Root element not found');
}
`;
  }

  /**
   * Check if a file is a mounting entry file (handles its own React mounting)
   * These files typically contain ReactDOM.render() or createRoot().render() calls
   */
  private isMountingEntryFile(content: string): boolean {
    // Check for ReactDOM.render or createRoot patterns
    const mountingPatterns = [
      /ReactDOM\.render\s*\(/,           // ReactDOM.render(
      /ReactDOM\.createRoot\s*\(/,       // ReactDOM.createRoot(
      /createRoot\s*\([^)]*\)\.render/,  // createRoot(...).render
      /\.render\s*\(\s*<.*>/,            // .render(<Component>)
    ];

    return mountingPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Generate simple hash
   */
  private generateHash(content: string): string {
    let hash = 0;

    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }

    return Math.abs(hash).toString(16);
  }

  /**
   * Create preview with Blob URL
   * Safe: handles errors and ensures blob URLs are properly cleaned up
   */
  private async createPreview(code: string, css: string, options: BuildOptions): Promise<void> {
    // Store old blob URL and clear reference first
    const oldBlobUrl = this._blobUrl;
    this._blobUrl = null;

    // Revoke previous blob URL with error handling
    if (oldBlobUrl) {
      try {
        URL.revokeObjectURL(oldBlobUrl);
        logger.debug('Revoked previous blob URL');
      } catch (e) {
        logger.warn('Failed to revoke old blob URL:', e);
      }
    }

    let newBlobUrl: string | null = null;

    try {
      // Find HTML template
      let htmlTemplate = this._files.get('/index.html') || this._files.get('/public/index.html');

      if (!htmlTemplate) {
        // Generate default HTML
        htmlTemplate = this.generateDefaultHtml(options);
      }

      // Inject bundle into HTML
      const html = this.injectBundle(htmlTemplate, code, css);

      // Create blob URL
      const blob = new Blob([html], { type: 'text/html' });
      newBlobUrl = URL.createObjectURL(blob);

      // Create preview object
      const preview: PreviewInfo = {
        url: newBlobUrl,
        ready: true,
        updatedAt: Date.now(),
      };

      // Only assign to instance properties AFTER all operations succeed
      this._blobUrl = newBlobUrl;
      this._preview = preview;

      logger.info('Emitting preview ready event:', this._blobUrl);
      logger.debug('Callbacks registered:', Object.keys(this.callbacks));

      this.emitPreviewReady(this._preview);

      logger.info('Preview created and callback emitted:', this._blobUrl);
    } catch (error) {
      // Clean up the new blob URL if it was created but something failed
      if (newBlobUrl) {
        try {
          URL.revokeObjectURL(newBlobUrl);
          logger.debug('Cleaned up blob URL after error');
        } catch (e) {
          logger.warn('Failed to cleanup blob URL after error:', e);
        }
      }

      logger.error('Failed to create preview:', error);
      throw error;
    }
  }

  /**
   * Generate default HTML template
   */
  private generateDefaultHtml(options: BuildOptions): string {
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BAVINI Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }
  </style>
</head>
<body>
  <div id="root"></div>
  <!-- BAVINI_BUNDLE -->
</body>
</html>`;
  }

  /**
   * Inject bundle into HTML
   */
  private injectBundle(html: string, code: string, css: string): string {
    // Inject CSS
    if (css) {
      const styleTag = `<style>${css}</style>`;
      html = html.replace('</head>', `${styleTag}\n</head>`);
    }

    // Inject JS
    const scriptTag = `<script type="module">${code}</script>`;

    // Replace placeholder or add before </body>
    if (html.includes('<!-- BAVINI_BUNDLE -->')) {
      html = html.replace('<!-- BAVINI_BUNDLE -->', scriptTag);
    } else {
      html = html.replace('</body>', `${scriptTag}\n</body>`);
    }

    // Add console capture with secure origin
    // SECURITY FIX: Use ancestorOrigins when available, fallback to '*' for blob: URLs
    // The origin is passed at build time to avoid cross-origin access issues
    const parentOrigin = typeof window !== 'undefined' ? window.location.origin : '*';
    const consoleCapture = `
<script>
(function() {
  // SECURITY: Use specific origin instead of '*' when possible
  // ancestorOrigins is the safest way to get parent origin from a blob: URL
  const PARENT_ORIGIN = window.location.ancestorOrigins?.[0] || '${parentOrigin}';

  const originalConsole = { ...console };
  ['log', 'warn', 'error', 'info', 'debug'].forEach(type => {
    console[type] = (...args) => {
      originalConsole[type](...args);
      try {
        window.parent.postMessage({
          type: 'console',
          payload: { type, args: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)), timestamp: Date.now() }
        }, PARENT_ORIGIN);
      } catch (e) {
        // Silently fail if postMessage fails (origin mismatch)
      }
    };
  });
  window.onerror = (msg, src, line, col, err) => {
    try {
      window.parent.postMessage({
        type: 'error',
        payload: { message: msg, filename: src, lineno: line, colno: col, stack: err?.stack }
      }, PARENT_ORIGIN);
    } catch (e) {
      // Silently fail if postMessage fails
    }
  };
})();
</script>`;

    html = html.replace('<head>', `<head>\n${consoleCapture}`);

    return html;
  }
}

/**
 * Factory function
 */
export function createBrowserBuildAdapter(): BrowserBuildAdapter {
  return new BrowserBuildAdapter();
}
