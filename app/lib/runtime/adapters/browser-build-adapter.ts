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
import {
  loadCompiler,
  hasCompilerFor,
  detectFramework,
  getJsxConfig,
  type FrameworkType,
} from './compilers/compiler-registry';
import type { TailwindCompiler, ContentFile } from './compilers/tailwind-compiler';
import {
  detectRoutingNeeds,
  detectRoutesFromFiles,
  type RouteDefinition,
  type RouterConfig,
} from './plugins/router-plugin';

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
  readonly supportedFrameworks = ['react', 'vue', 'svelte', 'vanilla', 'preact', 'astro'];

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
    '.env', '.env.local', '.env.development', '.env.production', '.env.example',
    '.gitignore', '.npmrc', '.prettierrc', '.eslintrc',
    '.example', // For .env.example and other example files
    '.local', // For compound extensions like .env.local (extracted as .local)
    // Image files (stored as base64/data URLs in virtual fs)
    '.jpg', '.jpeg', '.png', '.gif', '.webp', '.ico', '.bmp', '.avif',
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
  private _detectedFramework: FrameworkType = 'vanilla';

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
      // Detect framework from project files
      this._detectedFramework = detectFramework(this._files);
      logger.info(`Detected framework: ${this._detectedFramework}`);

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

      // Get JSX configuration for the detected framework
      const jsxConfig = getJsxConfig(this._detectedFramework);

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
        jsx: jsxConfig.jsx,
        jsxImportSource: jsxConfig.jsxImportSource,
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
      // Framework-specific files are compiled to JS before reaching esbuild
      case 'astro':
      case 'vue':
      case 'svelte':
        return 'js';
      // Image files - use dataurl loader for inline embedding
      case 'jpg':
      case 'jpeg':
      case 'png':
      case 'gif':
      case 'webp':
      case 'ico':
      case 'bmp':
      case 'avif':
      case 'svg':
        return 'dataurl';
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
      // Browser shim for next/link - Uses HASH-BASED routing for Blob URL compatibility
      import React from 'react';

      // Get current path from hash (for Blob URL routing)
      function getHashPath() {
        const hash = window.location.hash || '#/';
        return hash.startsWith('#') ? hash.slice(1) || '/' : '/';
      }

      // Global navigation handler using hash routing
      window.__BAVINI_NAVIGATE__ = window.__BAVINI_NAVIGATE__ || ((url, options = {}) => {
        const newHash = '#' + (url.startsWith('/') ? url : '/' + url);
        if (options.replace) {
          window.location.replace(newHash);
        } else {
          window.location.hash = newHash;
        }
        // Dispatch custom event for listeners
        window.dispatchEvent(new CustomEvent('bavini-navigate', { detail: { path: url } }));
      });

      function Link({ href, children, className, style, onClick, prefetch, replace, scroll, ...props }) {
        const resolvedHref = typeof href === 'object' ? href.pathname + (href.search || '') + (href.hash || '') : href;

        const handleClick = (e) => {
          // Allow default behavior for external links or modified clicks
          if (
            e.defaultPrevented ||
            e.button !== 0 ||
            e.metaKey ||
            e.ctrlKey ||
            e.shiftKey ||
            e.altKey ||
            (resolvedHref && (resolvedHref.startsWith('http') || resolvedHref.startsWith('mailto:') || resolvedHref.startsWith('tel:')))
          ) {
            return;
          }

          e.preventDefault();
          if (onClick) onClick(e);

          // Use hash-based navigation (works in Blob URLs)
          window.__BAVINI_NAVIGATE__(resolvedHref, { replace: !!replace });

          // Scroll to top if needed
          if (scroll !== false) {
            window.scrollTo(0, 0);
          }
        };

        // Display href as normal path, but navigate via hash
        return React.createElement('a', {
          href: '#' + (resolvedHref.startsWith('/') ? resolvedHref : '/' + resolvedHref),
          className,
          style,
          onClick: handleClick,
          ...props
        }, children);
      }

      export default Link;
    `,
    'next/navigation': `
      // Browser shim for next/navigation - HASH-BASED routing for Blob URL compatibility
      import { useState, useEffect, useSyncExternalStore, useCallback } from 'react';

      // Get current path from hash
      function getHashPath() {
        const hash = window.location.hash || '#/';
        const path = hash.startsWith('#') ? hash.slice(1) : '/';
        // Parse path and search params
        const [pathname, search] = path.split('?');
        return { pathname: pathname || '/', search: search ? '?' + search : '' };
      }

      // Navigation state store
      const listeners = new Set();

      function subscribe(listener) {
        listeners.add(listener);
        return () => listeners.delete(listener);
      }

      function notifyListeners() {
        listeners.forEach(listener => listener());
      }

      // Listen for hash changes and custom navigation events
      if (typeof window !== 'undefined') {
        window.addEventListener('hashchange', notifyListeners);
        window.addEventListener('bavini-navigate', notifyListeners);

        // Set global navigation handler using hash routing
        window.__BAVINI_NAVIGATE__ = window.__BAVINI_NAVIGATE__ || ((url, options = {}) => {
          const newHash = '#' + (url.startsWith('/') ? url : '/' + url);
          if (options.replace) {
            window.location.replace(newHash);
          } else {
            window.location.hash = newHash;
          }
          notifyListeners();
        });
      }

      export function useRouter() {
        const navigate = useCallback((url, options = {}) => {
          if (typeof window !== 'undefined' && window.__BAVINI_NAVIGATE__) {
            window.__BAVINI_NAVIGATE__(url, options);
          }
        }, []);

        return {
          push: (url, options) => navigate(url, { ...options, replace: false }),
          replace: (url, options) => navigate(url, { ...options, replace: true }),
          back: () => { window.history.back(); },
          forward: () => { window.history.forward(); },
          refresh: () => { notifyListeners(); },
          prefetch: () => Promise.resolve(),
        };
      }

      export function usePathname() {
        return useSyncExternalStore(
          subscribe,
          () => typeof window !== 'undefined' ? getHashPath().pathname : '/',
          () => '/'
        );
      }

      export function useSearchParams() {
        const [params, setParams] = useState(() => {
          if (typeof window === 'undefined') return new URLSearchParams();
          const { search } = getHashPath();
          return new URLSearchParams(search);
        });

        useEffect(() => {
          const unsubscribe = subscribe(() => {
            const { search } = getHashPath();
            setParams(new URLSearchParams(search));
          });
          return unsubscribe;
        }, []);

        return params;
      }

      export function useParams() {
        // Get route params set by BaviniRouter
        const [params, setParams] = useState(() =>
          typeof window !== 'undefined' && window.__BAVINI_ROUTE_PARAMS__
            ? window.__BAVINI_ROUTE_PARAMS__
            : {}
        );

        useEffect(() => {
          const unsubscribe = subscribe(() => {
            setParams(window.__BAVINI_ROUTE_PARAMS__ || {});
          });
          return unsubscribe;
        }, []);

        return params;
      }

      export function notFound() {
        throw new Error('NEXT_NOT_FOUND');
      }

      export function redirect(url, type = 'replace') {
        if (typeof window !== 'undefined' && window.__BAVINI_NAVIGATE__) {
          window.__BAVINI_NAVIGATE__(url, { replace: type === 'replace' });
        }
      }

      export function permanentRedirect(url) {
        redirect(url, 'replace');
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

        // Resolve @/ path aliases (e.g., @/components/Header -> /src/components/Header or /components/Header)
        // This MUST be handled BEFORE esm-sh plugin tries to resolve as npm package
        build.onResolve({ filter: /^@\// }, (args) => {
          // Skip if coming from esm-sh namespace
          if (args.namespace === 'esm-sh') {
            return null;
          }

          const pathWithoutAlias = args.path.replace(/^@\//, '');

          // Try multiple paths in order of preference:
          // 1. /src/path (standard Vite/Next.js convention)
          // 2. /path (root level, common in Next.js App Router)
          const pathsToTry = [
            `/src/${pathWithoutAlias}`,
            `/${pathWithoutAlias}`,
          ];

          for (const tryPath of pathsToTry) {
            // Check if file exists (with common extensions)
            const foundPath = this.findFile(tryPath);
            if (foundPath) {
              const resolveDir = foundPath.substring(0, foundPath.lastIndexOf('/')) || '/';
              logger.debug(`Resolving @/ alias: ${args.path} -> ${foundPath}`);
              return { path: foundPath, namespace: 'virtual-fs', pluginData: { resolveDir } };
            }
          }

          // Fallback to /src/ path even if not found (will produce helpful error)
          const virtualPath = `/src/${pathWithoutAlias}`;
          const resolveDir = virtualPath.substring(0, virtualPath.lastIndexOf('/')) || '/';

          logger.debug(`Resolving @/ alias (fallback): ${args.path} -> ${virtualPath}`);

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

          // eslint-disable-next-line no-console
          console.log(`[ESBUILD-RESOLVE] Relative: ${args.path} from ${basePath} -> ${resolvedPath}`);
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
        build.onLoad({ filter: /.*/, namespace: 'virtual-fs' }, async (args) => {
          // eslint-disable-next-line no-console
          console.log(`[ESBUILD-ONLOAD] Called for: ${args.path}, namespace: ${args.namespace}`);

          const foundPath = this.findFile(args.path);

          if (!foundPath) {
            // Log available files for debugging
            logger.debug(`File not found: ${args.path}. Available files:`, Array.from(this._files.keys()).slice(0, 20));
            return { errors: [{ text: `File not found: ${args.path}` }] };
          }

          const content = this._files.get(foundPath)!;
          const ext = foundPath.split('.').pop()?.toLowerCase();

          // Set resolveDir so bare imports (like 'react') can be resolved by esm-sh plugin
          const resolveDir = foundPath.substring(0, foundPath.lastIndexOf('/')) || '/';

          // Handle framework-specific files with their compilers
          // IMPORTANT: CSS files need special handling - the compiled output is CSS, not JS
          if (ext && hasCompilerFor(ext)) {
            try {
              // Special case for CSS files (Tailwind compilation)
              if (ext === 'css') {
                // eslint-disable-next-line no-console
                console.log(`[CSS-COMPILER] Compiling CSS file: ${foundPath}`);

                const compiler = await loadCompiler('css') as TailwindCompiler;

                // Provide content files for Tailwind class extraction
                const contentFiles: ContentFile[] = Array.from(this._files.entries())
                  .filter(([path]) => /\.(tsx?|jsx?|vue|svelte|html|astro)$/.test(path))
                  .map(([path, fileContent]) => ({ path, content: fileContent }));

                compiler.setContentFiles(contentFiles);

                const result = await compiler.compile(content, foundPath);

                // eslint-disable-next-line no-console
                console.log(`[CSS-COMPILER] Compilation done, CSS length: ${result.code.length}`);

                // CSS compiler returns CSS, we need to wrap it in a JS injector
                const cssInjector = `(function(){if(typeof document!=='undefined'){var s=document.createElement('style');s.setAttribute('data-source',${JSON.stringify(foundPath)});s.textContent=${JSON.stringify(result.code)};document.head.appendChild(s);}})();`;

                // eslint-disable-next-line no-console
                console.log(`[CSS-COMPILER] Created JS injector, length: ${cssInjector.length}`);

                return {
                  contents: cssInjector,
                  loader: 'js' as const,
                  resolveDir,
                };
              }

              // Standard compiler handling (Vue, Svelte, Astro, etc.)
              const compiler = await loadCompiler(ext);
              const result = await compiler.compile(content, foundPath);

              // If the compiler produced CSS, inject it as a side effect
              let compiledCode = result.code;

              if (result.css) {
                const escapedCSS = result.css
                  .replace(/\\/g, '\\\\')
                  .replace(/`/g, '\\`')
                  .replace(/\$/g, '\\$');

                compiledCode = `
// Injected CSS from ${foundPath}
(function() {
  if (typeof document !== 'undefined') {
    const style = document.createElement('style');
    style.textContent = \`${escapedCSS}\`;
    document.head.appendChild(style);
  }
})();

${result.code}`;
              }

              // Log any warnings
              if (result.warnings && result.warnings.length > 0) {
                result.warnings.forEach((w) => logger.warn(`[${ext}] ${w}`));
              }

              return {
                contents: compiledCode,
                loader: 'js',
                resolveDir,
              };
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              logger.error(`Failed to compile ${foundPath}:`, error);

              // For CSS files, return fallback instead of error
              if (ext === 'css') {
                // eslint-disable-next-line no-console
                console.log(`[CSS-COMPILER] Compilation failed, using fallback: ${errorMsg}`);
                const fallbackCSS = `/* Tailwind compilation failed: ${errorMsg} */\n:root { --background: 0 0% 100%; --foreground: 222.2 84% 4.9%; }`;
                const fallbackInjector = `(function(){if(typeof document!=='undefined'){var s=document.createElement('style');s.setAttribute('data-source',${JSON.stringify(foundPath)});s.textContent=${JSON.stringify(fallbackCSS)};document.head.appendChild(s);}})();`;

                return {
                  contents: fallbackInjector,
                  loader: 'js' as const,
                  resolveDir,
                };
              }

              return { errors: [{ text: `Compilation failed for ${foundPath}: ${errorMsg}` }] };
            }
          }

          const loader = this.getLoader(foundPath);

          // DEBUG: Log what we're processing
          // eslint-disable-next-line no-console
          console.log(`[ESBUILD-DEBUG] Processing ${foundPath}, loader: ${loader}`);

          // For CSS files, we ALWAYS inject them as a JS module that adds a style tag
          // This ensures esbuild never tries to parse CSS directly
          if (loader === 'css') {
            // eslint-disable-next-line no-console
            console.log(`[CSS-FLOW] Step 1: Entering CSS handler for ${foundPath}`);

            // Wrap EVERYTHING in try-catch to ensure we always return with loader: 'js'
            try {
              let cssContent = content;

              // Check if CSS has Tailwind directives and needs compilation
              const hasTailwindDirectives =
                content.includes('@tailwind') ||
                content.includes('@apply') ||
                content.includes('@layer');

              // eslint-disable-next-line no-console
              console.log(`[CSS-FLOW] Step 2: hasTailwindDirectives=${hasTailwindDirectives}`);

              if (hasTailwindDirectives) {
                try {
                  // eslint-disable-next-line no-console
                  console.log(`[CSS-FLOW] Step 3: About to load Tailwind compiler`);

                  const compiler = await loadCompiler('css') as TailwindCompiler;

                  // eslint-disable-next-line no-console
                  console.log(`[CSS-FLOW] Step 4: Compiler loaded, setting content files`);

                  // Provide content files for Tailwind class extraction
                  const contentFiles: ContentFile[] = Array.from(this._files.entries())
                    .filter(([path]) => /\.(tsx?|jsx?|vue|svelte|html|astro)$/.test(path))
                    .map(([path, fileContent]) => ({ path, content: fileContent }));

                  compiler.setContentFiles(contentFiles);

                  // eslint-disable-next-line no-console
                  console.log(`[CSS-FLOW] Step 5: Compiling CSS`);

                  const result = await compiler.compile(content, foundPath);
                  cssContent = result.code;

                  // eslint-disable-next-line no-console
                  console.log(`[CSS-FLOW] Step 6: Compilation done, CSS length: ${cssContent.length}`);

                  if (result.warnings && result.warnings.length > 0) {
                    result.warnings.forEach((w) => logger.warn(`[Tailwind] ${w}`));
                  }
                } catch (compileError) {
                  // eslint-disable-next-line no-console
                  console.log(`[CSS-FLOW] Step 3-ERROR: Tailwind compilation failed:`, compileError);
                  logger.warn(`Tailwind compilation failed for ${foundPath}:`, compileError);

                  // Use minimal fallback - just strip @tailwind directives
                  cssContent = `/* Tailwind compilation failed - using CDN fallback */
:root { --background: 0 0% 100%; --foreground: 222.2 84% 4.9%; }`;
                }
              }

              // Create JS injector - this MUST succeed
              // eslint-disable-next-line no-console
              console.log(`[CSS-FLOW] Step 7: Creating JS injector`);

              const cssInjector = `(function(){if(typeof document!=='undefined'){var s=document.createElement('style');s.setAttribute('data-source',${JSON.stringify(foundPath)});s.textContent=${JSON.stringify(cssContent)};document.head.appendChild(s);}})();`;

              // eslint-disable-next-line no-console
              console.log(`[CSS-FLOW] Step 8: Returning with loader: js, injector length: ${cssInjector.length}`);

              return {
                contents: cssInjector,
                loader: 'js' as const,
                resolveDir,
              };
            } catch (cssError) {
              // Ultimate fallback - return empty JS module
              // eslint-disable-next-line no-console
              console.error(`[CSS-FLOW] CRITICAL ERROR in CSS handling:`, cssError);
              logger.error(`Critical error handling CSS ${foundPath}:`, cssError);

              return {
                contents: `/* CSS error: ${foundPath} */`,
                loader: 'js' as const,
                resolveDir,
              };
            }
          }

          // For image files, export as a module with the path or placeholder
          if (loader === 'dataurl') {
            const imageExt = foundPath.split('.').pop()?.toLowerCase();
            const mimeTypes: Record<string, string> = {
              'jpg': 'image/jpeg',
              'jpeg': 'image/jpeg',
              'png': 'image/png',
              'gif': 'image/gif',
              'webp': 'image/webp',
              'svg': 'image/svg+xml',
              'ico': 'image/x-icon',
              'bmp': 'image/bmp',
              'avif': 'image/avif',
            };
            const mimeType = mimeTypes[imageExt || ''] || 'application/octet-stream';

            // If content looks like base64 or is SVG, use it directly
            if (imageExt === 'svg' || content.startsWith('<')) {
              // SVG can be used as data URL directly
              const encoded = btoa(unescape(encodeURIComponent(content)));
              return {
                contents: `export default "data:${mimeType};base64,${encoded}";`,
                loader: 'js',
                resolveDir,
              };
            }

            // For other images, check if content is already base64
            if (content.startsWith('data:')) {
              return {
                contents: `export default "${content}";`,
                loader: 'js',
                resolveDir,
              };
            }

            // Return a placeholder URL for images that can't be embedded
            // In browser-only mode, we use the path as a fallback
            return {
              contents: `export default "${foundPath}";`,
              loader: 'js',
              resolveDir,
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
    // Normalize paths - files might be stored with or without leading /
    const pathsToTry = [path];

    // Also try without leading slash
    if (path.startsWith('/')) {
      pathsToTry.push(path.slice(1));
    } else {
      pathsToTry.push('/' + path);
    }

    // Try with common extensions (including framework-specific)
    const extensions = ['', '.tsx', '.ts', '.jsx', '.js', '.vue', '.svelte', '.astro', '.json', '.css', '.mjs'];

    for (const basePath of pathsToTry) {
      for (const ext of extensions) {
        const pathWithExt = basePath + ext;

        if (this._files.has(pathWithExt)) {
          return pathWithExt;
        }
      }

      // Try index files (including framework-specific)
      const indexFiles = [
        '/index.tsx', '/index.ts', '/index.jsx', '/index.js',
        '/index.vue', '/index.svelte', '/index.astro'
      ];

      for (const indexFile of indexFiles) {
        const indexPath = basePath + indexFile;

        if (this._files.has(indexPath)) {
          return indexPath;
        }
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
   * Create a bootstrap entry that mounts the app based on the detected framework
   * This handles React, Vue, Svelte, Astro, and Next.js-style layouts
   */
  private createBootstrapEntry(entryPath: string): string {
    // Dispatch to framework-specific bootstrap creation
    switch (this._detectedFramework) {
      case 'vue':
        return this.createVueBootstrapEntry(entryPath);
      case 'svelte':
        return this.createSvelteBootstrapEntry(entryPath);
      case 'astro':
        return this.createAstroBootstrapEntry(entryPath);
      case 'preact':
        return this.createPreactBootstrapEntry(entryPath);
      case 'react':
      default:
        return this.createReactBootstrapEntry(entryPath);
    }
  }

  /**
   * Create React bootstrap entry with routing support
   */
  private createReactBootstrapEntry(entryPath: string): string {
    // Get the content of the entry file to analyze it
    const entryContent = this._files.get(entryPath) || '';

    // Check if this is already a mounting entry file (contains ReactDOM.render or createRoot)
    const isMountingEntry = this.isMountingEntryFile(entryContent);

    if (isMountingEntry) {
      logger.debug(`Entry ${entryPath} is a mounting file, importing for side effects`);
      return `import '${entryPath.replace(/\.tsx?$/, '')}';`;
    }

    // Detect routes from file structure
    const filesList = Array.from(this._files.keys());
    const detectedRoutes = detectRoutesFromFiles(filesList, this._files);
    const hasMultiplePages = detectedRoutes.length > 1;

    // Check if project already has a router configured
    const allContent = Array.from(this._files.values()).join('\n');
    const hasExistingRouter =
      allContent.includes('react-router-dom') ||
      allContent.includes('BrowserRouter') ||
      allContent.includes('@tanstack/react-router');

    logger.debug('Bootstrap routing detection:', {
      detectedRoutes: detectedRoutes.length,
      hasMultiplePages,
      hasExistingRouter,
    });

    // Find layout and page files
    const layoutPath = entryPath;
    const homePage = this.findFile('/app/page') || this.findFile('/src/app/page');

    // Build import statements
    const imports: string[] = [
      `import React, { useState, useEffect, Suspense, lazy } from 'react';`,
      `import { createRoot } from 'react-dom/client';`,
    ];

    let appComponent = '';
    let routerWrapper = '';

    // Generate routing-aware bootstrap if multiple pages detected
    if (hasMultiplePages && !hasExistingRouter) {
      // Create route imports and components
      const routeImports: string[] = [];
      const routeComponents: string[] = [];

      // Import layout if it exists
      if (layoutPath && layoutPath.includes('layout')) {
        imports.push(`import RootLayout from '${layoutPath.replace(/\.tsx?$/, '')}';`);
      }

      // Generate lazy imports for each page
      detectedRoutes.forEach((route, index) => {
        const componentName = `Page${index}`;
        const importPath = route.component.replace(/\.tsx?$/, '');
        routeImports.push(`const ${componentName} = lazy(() => import('${importPath}'));`);
        routeComponents.push(`    { path: '${route.path}', component: ${componentName} }`);
      });

      imports.push(...routeImports);

      // Create the router component with HASH-BASED routing for Blob URL compatibility
      routerWrapper = `
// BAVINI Client-Side Router - Hash-based for Blob URL support
const routes = [
${routeComponents.join(',\n')}
];

// Get path from hash (e.g., #/about -> /about)
function getHashPath() {
  const hash = window.location.hash || '#/';
  const path = hash.startsWith('#') ? hash.slice(1) : '/';
  return path.split('?')[0] || '/';
}

function BaviniRouter({ children, Layout }) {
  const [currentPath, setCurrentPath] = useState(getHashPath);

  useEffect(() => {
    const handleHashChange = () => {
      setCurrentPath(getHashPath());
    };

    const handleNavigate = () => {
      setCurrentPath(getHashPath());
    };

    window.addEventListener('hashchange', handleHashChange);
    window.addEventListener('bavini-navigate', handleNavigate);

    // Override global navigation handler with hash routing
    window.__BAVINI_NAVIGATE__ = (url, options = {}) => {
      const newHash = '#' + (url.startsWith('/') ? url : '/' + url);
      if (options.replace) {
        window.location.replace(newHash);
      } else {
        window.location.hash = newHash;
      }
      setCurrentPath(url.split('?')[0].split('#')[0] || '/');
    };

    // Set initial hash if not present
    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = '#/';
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
      window.removeEventListener('bavini-navigate', handleNavigate);
    };
  }, []);

  // Find matching route
  const matchRoute = (path) => {
    const normalizedPath = path || '/';

    // Exact match first
    let match = routes.find(r => r.path === normalizedPath);
    if (match) return { route: match, params: {} };

    // Dynamic route matching (e.g., /products/:id)
    for (const route of routes) {
      if (route.path.includes(':')) {
        const routeParts = route.path.split('/');
        const pathParts = normalizedPath.split('/');

        if (routeParts.length === pathParts.length) {
          const params = {};
          let isMatch = true;

          for (let i = 0; i < routeParts.length; i++) {
            if (routeParts[i].startsWith(':')) {
              params[routeParts[i].slice(1)] = pathParts[i];
            } else if (routeParts[i] !== pathParts[i]) {
              isMatch = false;
              break;
            }
          }

          if (isMatch) {
            return { route, params };
          }
        }
      }
    }

    // Fallback to index route
    return { route: routes.find(r => r.path === '/') || routes[0], params: {} };
  };

  const { route: currentRoute, params } = matchRoute(currentPath);
  const PageComponent = currentRoute?.component;

  // Store params globally for useParams hook
  window.__BAVINI_ROUTE_PARAMS__ = params;

  const content = PageComponent ? (
    <Suspense fallback={<div style={{ padding: '20px', textAlign: 'center' }}>Loading...</div>}>
      <PageComponent />
    </Suspense>
  ) : children;

  if (Layout) {
    return <Layout>{content}</Layout>;
  }

  return content;
}
`;

      // Create the App component with router
      if (layoutPath && layoutPath.includes('layout')) {
        appComponent = `
function App() {
  return (
    <BaviniRouter Layout={RootLayout}>
      {/* Fallback content if no routes match */}
      <div>Loading...</div>
    </BaviniRouter>
  );
}`;
      } else {
        appComponent = `
function App() {
  return (
    <BaviniRouter>
      {/* Fallback content if no routes match */}
      <div>Loading...</div>
    </BaviniRouter>
  );
}`;
      }
    } else if (homePage) {
      // Simple Next.js style: layout + single page (no routing needed yet)
      imports.push(`import RootLayout from '${layoutPath.replace(/\.tsx?$/, '')}';`);
      imports.push(`import HomePage from '${homePage.replace(/\.tsx?$/, '')}';`);

      appComponent = `
function App() {
  return (
    <RootLayout>
      <HomePage />
    </RootLayout>
  );
}`;
    } else {
      // Standard single component app
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
        const appFilePath = this.findFile('/src/App') || this.findFile('/App') || this.findFile('/components/App');
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
${routerWrapper}
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
   * Create Vue bootstrap entry
   */
  private createVueBootstrapEntry(entryPath: string): string {
    const entryContent = this._files.get(entryPath) || '';

    // Check if this is already a mounting entry file
    if (entryContent.includes('createApp') && entryContent.includes('.mount(')) {
      logger.debug(`Entry ${entryPath} is a Vue mounting file, importing for side effects`);
      return `import '${entryPath.replace(/\.(ts|js|vue)$/, '')}';`;
    }

    // Find main App.vue if entry is not a .vue file
    let appPath = entryPath;
    if (!entryPath.endsWith('.vue')) {
      const appVue = this.findFile('/src/App.vue') || this.findFile('/App.vue');
      if (appVue) {
        appPath = appVue;
      }
    }

    return `
import { createApp } from 'vue';
import App from '${appPath.replace(/\.vue$/, '')}';

// Mount the Vue app
const container = document.getElementById('root') || document.getElementById('app');
if (container) {
  const app = createApp(App);
  app.mount(container);
} else {
  console.error('Root element not found');
}
`;
  }

  /**
   * Create Svelte bootstrap entry
   */
  private createSvelteBootstrapEntry(entryPath: string): string {
    const entryContent = this._files.get(entryPath) || '';

    // Check if this is already a mounting entry file
    if (entryContent.includes('new ') && entryContent.includes('target:')) {
      logger.debug(`Entry ${entryPath} is a Svelte mounting file, importing for side effects`);
      return `import '${entryPath.replace(/\.(ts|js|svelte)$/, '')}';`;
    }

    // Find main App.svelte if entry is not a .svelte file
    let appPath = entryPath;
    if (!entryPath.endsWith('.svelte')) {
      const appSvelte = this.findFile('/src/App.svelte') || this.findFile('/App.svelte');
      if (appSvelte) {
        appPath = appSvelte;
      }
    }

    return `
import App from '${appPath.replace(/\.svelte$/, '')}';

// Mount the Svelte app
const container = document.getElementById('root') || document.getElementById('app');
if (container) {
  const app = new App({
    target: container,
    props: {}
  });
} else {
  console.error('Root element not found');
}
`;
  }

  /**
   * Create Astro bootstrap entry
   * Note: Astro is primarily SSG/SSR, so we render static HTML for preview
   */
  private createAstroBootstrapEntry(entryPath: string): string {
    // Find the main page or layout
    let mainPage = entryPath;
    if (!entryPath.endsWith('.astro')) {
      const indexAstro = this.findFile('/src/pages/index.astro') ||
                         this.findFile('/src/pages/index') ||
                         this.findFile('/index.astro');
      if (indexAstro) {
        mainPage = indexAstro;
      }
    }

    // For Astro, we render the component and inject its output as static HTML
    // This is a simplified approach - full Astro requires SSR
    return `
import Component from '${mainPage.replace(/\.astro$/, '')}';

// Render Astro component
async function renderAstro() {
  const container = document.getElementById('root') || document.getElementById('app');
  if (!container) {
    console.error('Root element not found');
    return;
  }

  try {
    // Astro components compile to functions that return HTML
    if (typeof Component === 'function') {
      const result = await Component({});
      // Handle Astro's render result
      if (typeof result === 'string') {
        container.innerHTML = result;
      } else if (result && typeof result.toString === 'function') {
        container.innerHTML = result.toString();
      } else if (result && result.html) {
        container.innerHTML = result.html;
      } else {
        console.log('Astro component rendered:', result);
      }
    } else {
      console.log('Astro component loaded:', Component);
    }
  } catch (error) {
    console.error('Failed to render Astro component:', error);
    container.innerHTML = '<div style="color: red; padding: 20px;">Error rendering Astro component. Check console for details.</div>';
  }
}

renderAstro();
`;
  }

  /**
   * Create Preact bootstrap entry
   */
  private createPreactBootstrapEntry(entryPath: string): string {
    const entryContent = this._files.get(entryPath) || '';

    // Check if this is already a mounting entry file
    if (entryContent.includes('render(') && entryContent.includes('preact')) {
      logger.debug(`Entry ${entryPath} is a Preact mounting file, importing for side effects`);
      return `import '${entryPath.replace(/\.tsx?$/, '')}';`;
    }

    // Find main App component
    let appPath = entryPath;
    const appFile = this.findFile('/src/App') || this.findFile('/App');
    if (appFile) {
      appPath = appFile;
    }

    return `
import { h, render } from 'preact';
import App from '${appPath.replace(/\.tsx?$/, '')}';

// Mount the Preact app
const container = document.getElementById('root') || document.getElementById('app');
if (container) {
  render(h(App, {}), container);
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
  <base href="/">
  <title>BAVINI Preview</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: system-ui, -apple-system, sans-serif; }

    /* Shadcn UI CSS Variables */
    :root {
      --background: 0 0% 100%;
      --foreground: 222.2 84% 4.9%;
      --card: 0 0% 100%;
      --card-foreground: 222.2 84% 4.9%;
      --popover: 0 0% 100%;
      --popover-foreground: 222.2 84% 4.9%;
      --primary: 222.2 47.4% 11.2%;
      --primary-foreground: 210 40% 98%;
      --secondary: 210 40% 96.1%;
      --secondary-foreground: 222.2 47.4% 11.2%;
      --muted: 210 40% 96.1%;
      --muted-foreground: 215.4 16.3% 46.9%;
      --accent: 210 40% 96.1%;
      --accent-foreground: 222.2 47.4% 11.2%;
      --destructive: 0 84.2% 60.2%;
      --destructive-foreground: 210 40% 98%;
      --border: 214.3 31.8% 91.4%;
      --input: 214.3 31.8% 91.4%;
      --ring: 222.2 84% 4.9%;
      --radius: 0.5rem;
    }

    .dark {
      --background: 222.2 84% 4.9%;
      --foreground: 210 40% 98%;
      --card: 222.2 84% 4.9%;
      --card-foreground: 210 40% 98%;
      --popover: 222.2 84% 4.9%;
      --popover-foreground: 210 40% 98%;
      --primary: 210 40% 98%;
      --primary-foreground: 222.2 47.4% 11.2%;
      --secondary: 217.2 32.6% 17.5%;
      --secondary-foreground: 210 40% 98%;
      --muted: 217.2 32.6% 17.5%;
      --muted-foreground: 215 20.2% 65.1%;
      --accent: 217.2 32.6% 17.5%;
      --accent-foreground: 210 40% 98%;
      --destructive: 0 62.8% 30.6%;
      --destructive-foreground: 210 40% 98%;
      --border: 217.2 32.6% 17.5%;
      --input: 217.2 32.6% 17.5%;
      --ring: 212.7 26.8% 83.9%;
    }
  </style>
</head>
<body class="bg-background text-foreground">
  <div id="root"></div>
  <!-- BAVINI_BUNDLE -->
</body>
</html>`;
  }

  /**
   * Inject bundle into HTML
   */
  private injectBundle(html: string, code: string, css: string): string {
    // Inject Tailwind CSS via SYNCHRONOUS link tag (loads BEFORE JavaScript executes)
    // This ensures CSS is available when React renders components
    const tailwindCSS = `
<link rel="stylesheet" href="https://unpkg.com/tailwindcss@3.4.1/dist/tailwind.min.css" crossorigin="anonymous">
<style>
  /* Shadcn UI CSS Variables */
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 84% 4.9%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 84% 4.9%;
    --popover: 0 0% 100%;
    --popover-foreground: 222.2 84% 4.9%;
    --primary: 222.2 47.4% 11.2%;
    --primary-foreground: 210 40% 98%;
    --secondary: 210 40% 96.1%;
    --secondary-foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --accent: 210 40% 96.1%;
    --accent-foreground: 222.2 47.4% 11.2%;
    --destructive: 0 84.2% 60.2%;
    --destructive-foreground: 210 40% 98%;
    --border: 214.3 31.8% 91.4%;
    --input: 214.3 31.8% 91.4%;
    --ring: 222.2 84% 4.9%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 222.2 84% 4.9%;
    --foreground: 210 40% 98%;
    --card: 222.2 84% 4.9%;
    --card-foreground: 210 40% 98%;
    --popover: 222.2 84% 4.9%;
    --popover-foreground: 210 40% 98%;
    --primary: 210 40% 98%;
    --primary-foreground: 222.2 47.4% 11.2%;
    --secondary: 217.2 32.6% 17.5%;
    --secondary-foreground: 210 40% 98%;
    --muted: 217.2 32.6% 17.5%;
    --muted-foreground: 215 20.2% 65.1%;
    --accent: 217.2 32.6% 17.5%;
    --accent-foreground: 210 40% 98%;
    --destructive: 0 62.8% 30.6%;
    --destructive-foreground: 210 40% 98%;
    --border: 217.2 32.6% 17.5%;
    --input: 217.2 32.6% 17.5%;
    --ring: 212.7 26.8% 83.9%;
  }
  /* Base styles */
  body {
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    -webkit-font-smoothing: antialiased;
  }
</style>`;

    // Inject Tailwind CSS link SYNCHRONOUSLY in head (before any scripts)
    html = html.replace('<head>', `<head>\n${tailwindCSS}`);

    // Inject CSS (additional custom styles)
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
