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
  type CSSMetadata,
} from './compilers/compiler-registry';
import { CSSAggregator, createCSSAggregator, type CSSType } from './css-aggregator';
import type { TailwindCompiler, ContentFile } from './compilers/tailwind-compiler';
import {
  detectRoutingNeeds,
  detectRoutesFromFiles,
  type RouteDefinition,
  type RouterConfig,
} from './plugins/router-plugin';
import {
  initPreviewServiceWorker,
  setPreviewFiles,
  isServiceWorkerReady,
  getPreviewUrl,
  PREVIEW_URL,
} from '../preview-service-worker';
import {
  SSRBridge,
  createSSRBridge,
  type SSRMode,
  type SSRBridgeConfig,
} from '../quickjs/ssr-bridge';
import { withTimeout, TIMEOUTS, TimeoutError } from '../utils/timeout';
// FIX 3.1: Import HMR manager
import { HMRManager, createHMRManager, classifyChange } from './hmr-manager';
// Phase 3 Refactoring: Import modular utilities
import {
  LRUCache as ModularLRUCache,
  moduleCache as modularModuleCache,
  yieldToEventLoop as modularYieldToEventLoop,
  normalizePath as modularNormalizePath,
  generateHash as modularGenerateHash,
  isPathSafe as modularIsPathSafe,
} from './browser-build';
import {
  type PreviewMode as ModularPreviewMode,
  setPreviewMode as modularSetPreviewMode,
  getPreviewModeConfig as modularGetPreviewModeConfig,
  enableServiceWorkerPreference as modularEnableServiceWorkerPreference,
  disableServiceWorkerPreference as modularDisableServiceWorkerPreference,
  resetServiceWorkerFailures as modularResetServiceWorkerFailures,
  setServiceWorkerReady,
  isServiceWorkerReady as modularIsServiceWorkerReady,
  shouldAttemptServiceWorker as modularShouldAttemptServiceWorker,
} from './browser-build';

const logger = createScopedLogger('BrowserBuildAdapter');

/**
 * Yield to the event loop to allow the browser to process pending events.
 * This prevents UI freeze during heavy operations like builds.
 * FIX: Bug #2 - Input freeze during build
 */
async function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    // Use scheduler.postTask with background priority if available (Chrome 94+)
    if (typeof globalThis !== 'undefined' && 'scheduler' in globalThis) {
      const scheduler = (globalThis as { scheduler?: { postTask?: (cb: () => void, opts: { priority: string }) => void } }).scheduler;

      if (scheduler?.postTask) {
        scheduler.postTask(() => resolve(), { priority: 'background' });
        return;
      }
    }

    // Fallback to requestIdleCallback if available
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => resolve(), { timeout: 50 });
      return;
    }

    // Final fallback to setTimeout
    setTimeout(resolve, 0);
  });
}

/**
 * Preview mode configuration
 * FIX: Bug #3 - Service Worker iframe issues
 *
 * Service Worker mode provides:
 * - Normal origin (not null from blob:)
 * - Working localStorage and sessionStorage
 * - Proper cookie handling
 * - Better compatibility with some browser APIs
 *
 * srcdoc mode provides:
 * - More reliable across browsers
 * - No SW registration issues
 * - Works in incognito/private mode
 * - No service worker scope limitations
 */
export type PreviewMode = 'auto' | 'service-worker' | 'srcdoc';

interface PreviewModeConfig {
  /** Current mode preference */
  mode: PreviewMode;
  /** Whether SW is actually available and working */
  swAvailable: boolean;
  /** Whether to attempt SW mode when 'auto' */
  autoPreferSW: boolean;
}

const previewModeConfig: PreviewModeConfig = {
  mode: 'auto',
  swAvailable: false,
  autoPreferSW: false, // Default to srcdoc for reliability
};

/**
 * Flag to track if we're using Service Worker or srcdoc fallback
 */
let useServiceWorker = false;

/**
 * Number of consecutive SW failures - after MAX_SW_FAILURES we disable SW for this session
 */
let swFailureCount = 0;
const MAX_SW_FAILURES = 3;

/**
 * Set the preview mode preference
 * @param mode - 'auto' | 'service-worker' | 'srcdoc'
 */
export function setPreviewMode(mode: PreviewMode): void {
  previewModeConfig.mode = mode;
  logger.info(`Preview mode set to: ${mode}`);
}

/**
 * Get current preview mode configuration
 */
export function getPreviewModeConfig(): Readonly<PreviewModeConfig> {
  return { ...previewModeConfig };
}

/**
 * Enable Service Worker preference in auto mode
 * Call this if your preview needs localStorage, sessionStorage, or cookies
 */
export function enableServiceWorkerPreference(): void {
  previewModeConfig.autoPreferSW = true;
  logger.info('Service Worker preference enabled for auto mode');
}

/**
 * Disable Service Worker preference in auto mode
 */
export function disableServiceWorkerPreference(): void {
  previewModeConfig.autoPreferSW = false;
  logger.info('Service Worker preference disabled for auto mode');
}

/**
 * Reset Service Worker failure count (useful after fixing issues)
 */
export function resetServiceWorkerFailures(): void {
  swFailureCount = 0;
  logger.info('Service Worker failure count reset');
}

/**
 * Check if Service Worker mode should be attempted
 */
function shouldAttemptServiceWorker(): boolean {
  // Explicit srcdoc mode requested
  if (previewModeConfig.mode === 'srcdoc') {
    return false;
  }

  // Explicit SW mode requested
  if (previewModeConfig.mode === 'service-worker') {
    return previewModeConfig.swAvailable && swFailureCount < MAX_SW_FAILURES;
  }

  // Auto mode: only use SW if explicitly preferred and available
  if (previewModeConfig.mode === 'auto') {
    return previewModeConfig.autoPreferSW &&
           previewModeConfig.swAvailable &&
           swFailureCount < MAX_SW_FAILURES;
  }

  return false;
}

/**
 * URL du WASM esbuild
 */
const ESBUILD_WASM_URL = 'https://unpkg.com/esbuild-wasm@0.27.2/esbuild.wasm';

/**
 * CDN pour les packages npm
 */
const ESM_SH_CDN = 'https://esm.sh';

/**
 * FIX 3.4: Bundle size limits configuration
 * Provides clear warnings and errors for oversized bundles
 */
const BUNDLE_LIMITS = {
  /** Warning threshold for JS bundle (1.5MB) */
  JS_WARNING_KB: 1500,
  /** Error threshold for JS bundle (5MB) - browser may freeze */
  JS_ERROR_KB: 5000,
  /** Warning threshold for CSS bundle (500KB) */
  CSS_WARNING_KB: 500,
  /** Error threshold for CSS bundle (2MB) */
  CSS_ERROR_KB: 2000,
  /** Warning threshold for total bundle (2MB) */
  TOTAL_WARNING_KB: 2000,
  /** Error threshold for total bundle (8MB) */
  TOTAL_ERROR_KB: 8000,
} as const;

/**
 * LRU Cache with TTL for module caching.
 * Prevents unbounded memory growth from cached CDN responses.
 *
 * FIX 2.3: Separated cachedAt (for TTL expiration) from lastAccess (for LRU eviction)
 * This ensures that frequently accessed items still expire after maxAge.
 */
class LRUCache<K, V> {
  private cache = new Map<K, { value: V; cachedAt: number; lastAccess: number }>();
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

    // FIX 2.3: Check expiration based on cachedAt, not lastAccess
    // This ensures entries expire even if frequently accessed
    if (Date.now() - entry.cachedAt > this.maxAge) {
      this.cache.delete(key);
      return undefined;
    }

    // Update lastAccess for LRU eviction (separate from TTL)
    entry.lastAccess = Date.now();

    return entry.value;
  }

  set(key: K, value: V): void {
    // Evict if at capacity
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      this.evictOldest();
    }

    const now = Date.now();
    // FIX 2.3: Store both cachedAt and lastAccess
    this.cache.set(key, { value, cachedAt: now, lastAccess: now });
  }

  has(key: K): boolean {
    return this.get(key) !== undefined;
  }

  private evictOldest(): void {
    let oldest: K | null = null;
    let oldestTime = Infinity;

    // Evict based on lastAccess (LRU) - least recently accessed
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

  /**
   * FIX 2.3: Proactively remove all expired entries
   */
  pruneExpired(): number {
    const now = Date.now();
    let removed = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.cachedAt > this.maxAge) {
        this.cache.delete(key);
        removed++;
      }
    }

    return removed;
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
 * FIX 1.1: Import the thread-safe esbuild initialization lock
 * Replaces the old global flags that had race condition issues
 */
import { esbuildInitLock } from './esbuild-init-lock';

/**
 * @deprecated Use esbuildInitLock.isReady instead
 * Kept for backward compatibility checks
 */
let globalEsbuildInitialized: boolean = (globalThis as any).__esbuildInitialized ?? false;

/**
 * @deprecated Use esbuildInitLock.initialize() instead
 * Kept for backward compatibility
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
  private _cssAggregator: CSSAggregator = createCSSAggregator();
  private _ssrBridge: SSRBridge | null = null;
  private _ssrEnabled = false;

  /**
   * FIX 1.2: Track all created Blob URLs for proper cleanup
   * Prevents memory leaks when switching runtimes rapidly
   */
  private _trackedBlobUrls: Set<string> = new Set();

  /**
   * FIX 3.1: HMR manager for hot module replacement
   */
  private _hmrManager: HMRManager = createHMRManager();

  get status(): RuntimeStatus {
    return this._status;
  }

  /**
   * FIX 3.1: Get the HMR manager for external use
   */
  get hmrManager(): HMRManager {
    return this._hmrManager;
  }

  /**
   * Check if SSR is enabled and available
   */
  get isSSREnabled(): boolean {
    return this._ssrEnabled && this._ssrBridge?.isEnabled === true;
  }

  /**
   * Initialize esbuild-wasm
   * FIX 1.1: Uses thread-safe esbuild-init-lock to prevent race conditions
   */
  async init(): Promise<void> {
    // FIX 1.1: Use the thread-safe singleton lock
    if (esbuildInitLock.isReady) {
      logger.debug('esbuild already initialized via lock, reusing');
      this._esbuildInitialized = true;
      this._status = 'ready';
      this.emitStatusChange('ready');
      return;
    }

    this._status = 'initializing';
    this.emitStatusChange('initializing');

    try {
      // FIX 1.1: Use the thread-safe initialization lock
      // This handles concurrent calls and prevents double initialization
      await esbuildInitLock.initialize(ESBUILD_WASM_URL);

      // Update local and legacy global flags
      this._esbuildInitialized = true;
      globalEsbuildInitialized = true;

      this._status = 'ready';
      this.emitStatusChange('ready');

      logger.info('esbuild-wasm initialized via lock');

      // Initialize Service Worker for preview (non-blocking)
      this.initServiceWorker();
    } catch (error) {
      this._status = 'error';
      this.emitStatusChange('error');
      logger.error('Failed to initialize esbuild-wasm:', error);
      throw error;
    }
  }

  /**
   * Initialize Service Worker for preview (non-blocking)
   * FIX: Bug #3 - Improved SW initialization with proper status tracking
   */
  private async initServiceWorker(): Promise<void> {
    try {
      logger.info('Initializing Preview Service Worker...');
      const success = await initPreviewServiceWorker();

      if (success) {
        previewModeConfig.swAvailable = true;
        useServiceWorker = previewModeConfig.mode === 'service-worker' ||
                          (previewModeConfig.mode === 'auto' && previewModeConfig.autoPreferSW);
        logger.info(`Preview Service Worker initialized - swAvailable: true, useServiceWorker: ${useServiceWorker}`);
      } else {
        previewModeConfig.swAvailable = false;
        useServiceWorker = false;
        logger.warn('Service Worker init failed - SW mode unavailable');
      }
    } catch (error) {
      previewModeConfig.swAvailable = false;
      useServiceWorker = false;
      logger.warn('Service Worker initialization error:', error);
    }
  }

  /**
   * Cleanup resources
   * FIX 1.2: Now revokes ALL tracked Blob URLs to prevent memory leaks
   * Robust: handles errors during cleanup to ensure all resources are freed
   */
  async destroy(): Promise<void> {
    logger.info('Destroying BrowserBuildAdapter...');

    const errors: Error[] = [];

    // FIX 1.2: Revoke ALL tracked blob URLs first
    if (this._trackedBlobUrls.size > 0) {
      logger.debug(`Revoking ${this._trackedBlobUrls.size} tracked blob URLs...`);
      for (const url of this._trackedBlobUrls) {
        try {
          URL.revokeObjectURL(url);
        } catch (error) {
          logger.warn(`Failed to revoke tracked blob URL ${url.substring(0, 30)}:`, error);
          errors.push(error instanceof Error ? error : new Error(String(error)));
        }
      }
      this._trackedBlobUrls.clear();
      logger.debug('All tracked blob URLs revoked');
    }

    // Revoke current blob URL with error handling (legacy)
    if (this._blobUrl) {
      try {
        URL.revokeObjectURL(this._blobUrl);
        logger.debug('Revoked current blob URL during destroy');
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

    // Cleanup SSR bridge
    if (this._ssrBridge) {
      try {
        this._ssrBridge.destroy();
      } catch (error) {
        logger.warn('Failed to destroy SSR bridge:', error);
      }
      this._ssrBridge = null;
    }

    // FIX 3.1: Cleanup HMR manager
    try {
      this._hmrManager.destroy();
    } catch (error) {
      logger.warn('Failed to destroy HMR manager:', error);
      errors.push(error instanceof Error ? error : new Error(String(error)));
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
   * Enable SSR for preview rendering
   * @param config - Optional SSR configuration
   */
  async enableSSR(config?: SSRBridgeConfig): Promise<void> {
    if (!this._ssrBridge) {
      this._ssrBridge = createSSRBridge(config);
    }

    try {
      await this._ssrBridge.init();
      this._ssrEnabled = true;
      logger.info('SSR enabled for preview rendering');
    } catch (error) {
      logger.warn('Failed to enable SSR:', error);
      this._ssrEnabled = false;
    }
  }

  /**
   * Disable SSR (use client-side only rendering)
   */
  disableSSR(): void {
    this._ssrEnabled = false;
    if (this._ssrBridge) {
      this._ssrBridge.disable();
    }
    logger.info('SSR disabled');
  }

  /**
   * Set SSR mode
   * @param mode - 'disabled' | 'auto' | 'always'
   */
  setSSRMode(mode: SSRMode): void {
    if (!this._ssrBridge) {
      this._ssrBridge = createSSRBridge({ mode });
    }

    if (mode === 'disabled') {
      this.disableSSR();
    } else {
      this._ssrEnabled = true;
      logger.info(`SSR mode set to: ${mode}`);
    }
  }

  /**
   * Get SSR cache statistics
   */
  getSSRCacheStats(): { size: number; hitRate: number; hits: number; misses: number } | null {
    return this._ssrBridge?.getCacheStats() ?? null;
  }

  /**
   * Clear SSR cache
   */
  clearSSRCache(): void {
    this._ssrBridge?.clearCache();
  }

  /**
   * Invalidate SSR cache for a specific file
   * @param filename - File path to invalidate
   */
  invalidateSSRCache(filename: string): void {
    this._ssrBridge?.invalidateCache(filename);
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
   * FIX 3.1: Notifies HMR manager of changes
   */
  async writeFile(path: string, content: string): Promise<void> {
    this.validateFile(path, content);
    const normalizedPath = this.normalizePath(path);
    this._files.set(normalizedPath, content);

    // FIX 3.1: Notify HMR manager of file change
    this._hmrManager.notifyChange(normalizedPath, content);
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

    // Clear CSS aggregator for fresh build
    this._cssAggregator.clear();

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

      // VANILLA HTML SUPPORT:
      // If entry point is an HTML file, handle it as a vanilla project
      // Don't run through esbuild - just serve the HTML directly
      if (foundEntry.endsWith('.html')) {
        logger.info(`Vanilla HTML project detected, using direct HTML preview`);
        return this.buildVanillaProject(foundEntry, options, startTime);
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

      // FIX: Bug #2 - Yield to event loop before heavy esbuild operation
      // This allows the browser to process pending input events
      await yieldToEventLoop();

      // Build with esbuild
      // FIX 2.1: Added timeout to prevent infinite hangs
      const result = await withTimeout(
        esbuild.build({
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
        }),
        TIMEOUTS.BUILD_TOTAL,
        'esbuild bundle'
      );

      this.emitBuildProgress('bundling', 80);

      // Debug: log all output files
      logger.debug('esbuild outputFiles:', result.outputFiles?.map((f) => ({ path: f.path, size: f.text.length })));

      // Extract outputs - esbuild may use different extensions or paths
      const jsOutput = result.outputFiles?.find((f) => f.path.endsWith('.js') || f.path.includes('stdin'));
      const cssOutput = result.outputFiles?.find((f) => f.path.endsWith('.css'));

      const code = jsOutput?.text || '';

      // Aggregate CSS from the aggregator (Tailwind, Vue, Svelte, Astro components)
      // and combine with any direct CSS output from esbuild
      const aggregatedCss = this._cssAggregator.aggregate();
      const esbuildCss = cssOutput?.text || '';
      let css = aggregatedCss + (esbuildCss ? `\n\n/* esbuild output */\n${esbuildCss}` : '');

      // For Next.js projects, extract and inject Google Fonts CSS
      if (this._detectedFramework === 'nextjs') {
        const googleFontsCss = this.extractGoogleFontsCSS();
        if (googleFontsCss) {
          css = googleFontsCss + '\n\n' + css;
          logger.info('Injected Google Fonts CSS for Next.js project');
        }
      }

      // Remove @import statements for tailwindcss/* - these are handled by CDN
      css = this.stripTailwindImports(css);

      logger.info(`CSS Aggregation: ${this._cssAggregator.size} sources, ${aggregatedCss.length} chars`);

      // Log bundle size in KB/MB for better diagnostics
      const codeKB = code.length / 1024;
      const cssKB = css.length / 1024;
      const totalKB = codeKB + cssKB;
      logger.info(`Bundle size: JS=${codeKB.toFixed(1)}KB, CSS=${cssKB.toFixed(1)}KB, Total=${totalKB.toFixed(1)}KB`);

      // FIX 3.4: Check bundle size limits and collect warnings/errors
      const bundleWarnings: BuildWarning[] = [];
      const bundleErrors: BuildError[] = [];

      // Check JS bundle size
      if (codeKB > BUNDLE_LIMITS.JS_ERROR_KB) {
        bundleErrors.push({
          message: `JS bundle too large (${codeKB.toFixed(0)}KB > ${BUNDLE_LIMITS.JS_ERROR_KB}KB limit). Browser may freeze or crash. Split your code or use fewer dependencies.`,
          file: 'bundle.js',
        });
        logger.error(`JS bundle exceeds error limit: ${codeKB.toFixed(0)}KB`);
      } else if (codeKB > BUNDLE_LIMITS.JS_WARNING_KB) {
        bundleWarnings.push({
          message: `JS bundle is large (${codeKB.toFixed(0)}KB). Consider code splitting or removing unused dependencies.`,
          file: 'bundle.js',
        });
        logger.warn(`JS bundle exceeds warning limit: ${codeKB.toFixed(0)}KB`);
      }

      // Check CSS bundle size
      if (cssKB > BUNDLE_LIMITS.CSS_ERROR_KB) {
        bundleErrors.push({
          message: `CSS bundle too large (${cssKB.toFixed(0)}KB > ${BUNDLE_LIMITS.CSS_ERROR_KB}KB limit). Remove unused styles or split CSS.`,
          file: 'bundle.css',
        });
        logger.error(`CSS bundle exceeds error limit: ${cssKB.toFixed(0)}KB`);
      } else if (cssKB > BUNDLE_LIMITS.CSS_WARNING_KB) {
        bundleWarnings.push({
          message: `CSS bundle is large (${cssKB.toFixed(0)}KB). Consider purging unused styles.`,
          file: 'bundle.css',
        });
        logger.warn(`CSS bundle exceeds warning limit: ${cssKB.toFixed(0)}KB`);
      }

      // Check total bundle size
      if (totalKB > BUNDLE_LIMITS.TOTAL_ERROR_KB) {
        bundleErrors.push({
          message: `Total bundle too large (${totalKB.toFixed(0)}KB > ${BUNDLE_LIMITS.TOTAL_ERROR_KB}KB limit). Application may not load properly.`,
        });
        logger.error(`Total bundle exceeds error limit: ${totalKB.toFixed(0)}KB`);
      } else if (totalKB > BUNDLE_LIMITS.TOTAL_WARNING_KB) {
        bundleWarnings.push({
          message: `Total bundle is large (${totalKB.toFixed(0)}KB). Consider optimizations for better performance.`,
        });
        logger.warn(`Total bundle exceeds warning limit: ${totalKB.toFixed(0)}KB`);
      }

      // Convert esbuild errors/warnings and merge with bundle size checks
      const errors: BuildError[] = [
        ...bundleErrors,
        ...result.errors.map((e) => ({
          message: e.text,
          file: e.location?.file,
          line: e.location?.line,
          column: e.location?.column,
          snippet: e.location?.lineText,
        })),
      ];

      // FIX 3.4: Merge bundle warnings with esbuild warnings
      const warnings: BuildWarning[] = [
        ...bundleWarnings,
        ...result.warnings.map((w) => ({
          message: w.text,
          file: w.location?.file,
          line: w.location?.line,
          column: w.location?.column,
        })),
      ];

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

      // FIX 2.1: Handle timeout errors specifically
      if (error instanceof TimeoutError) {
        logger.error(`Build timeout: ${error.message}`);
        return {
          code: '',
          css: '',
          errors: [{ message: `Build timed out after ${TIMEOUTS.BUILD_TOTAL / 1000}s. The project may be too large or have circular dependencies.` }],
          warnings: [],
          buildTime: TIMEOUTS.BUILD_TOTAL,
          hash: '',
        };
      }

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
   * FIX 2.1: Added timeout to prevent infinite hangs
   */
  async transform(code: string, options: TransformOptions): Promise<string> {
    const result = await withTimeout(
      esbuild.transform(code, {
        loader: options.loader,
        sourcefile: options.filename,
        jsx: 'automatic',
        jsxImportSource: 'react',
        target: 'es2020',
      }),
      TIMEOUTS.TRANSFORM,
      `transform:${options.filename}`
    );

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
        // Use 'jsx' loader for .js files - many React projects use JSX in .js files
        // The JSX transform is safe on pure JS (no-op if no JSX present)
        return 'jsx';
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
      // Browser shim for next/font/google - Dynamic font generator
      // Converts font name to CSS-friendly format (e.g., Space_Grotesk -> "Space Grotesk")
      function createFontLoader(fontName) {
        const cssName = fontName.replace(/_/g, ' ');
        const varName = fontName.toLowerCase().replace(/_/g, '-');
        return function(options) {
          return {
            className: 'font-' + varName,
            variable: options?.variable || '--font-' + varName,
            style: { fontFamily: '"' + cssName + '", system-ui, sans-serif' }
          };
        };
      }

      // Export common fonts explicitly for direct imports
      export const Inter = createFontLoader('Inter');
      export const Roboto = createFontLoader('Roboto');
      export const Open_Sans = createFontLoader('Open_Sans');
      export const Poppins = createFontLoader('Poppins');
      export const Space_Grotesk = createFontLoader('Space_Grotesk');
      export const Playfair_Display = createFontLoader('Playfair_Display');
      export const Montserrat = createFontLoader('Montserrat');
      export const Lato = createFontLoader('Lato');
      export const Oswald = createFontLoader('Oswald');
      export const Raleway = createFontLoader('Raleway');
      export const Nunito = createFontLoader('Nunito');
      export const Source_Sans_3 = createFontLoader('Source_Sans_3');
      export const Work_Sans = createFontLoader('Work_Sans');
      export const DM_Sans = createFontLoader('DM_Sans');
      export const Manrope = createFontLoader('Manrope');
      export const Outfit = createFontLoader('Outfit');
      export const Plus_Jakarta_Sans = createFontLoader('Plus_Jakarta_Sans');
      export const Sora = createFontLoader('Sora');
      export const Fira_Code = createFontLoader('Fira_Code');
      export const JetBrains_Mono = createFontLoader('JetBrains_Mono');

      // Additional display/accent fonts
      export const Antonio = createFontLoader('Antonio');
      export const Archivo = createFontLoader('Archivo');
      export const Archivo_Black = createFontLoader('Archivo_Black');
      export const Bebas_Neue = createFontLoader('Bebas_Neue');
      export const IBM_Plex_Sans = createFontLoader('IBM_Plex_Sans');
      export const IBM_Plex_Mono = createFontLoader('IBM_Plex_Mono');
      export const Nunito_Sans = createFontLoader('Nunito_Sans');
      export const Cabin = createFontLoader('Cabin');
      export const Karla = createFontLoader('Karla');
      export const Lexend = createFontLoader('Lexend');
      export const Figtree = createFontLoader('Figtree');
      export const Geist = createFontLoader('Geist');
      export const Geist_Mono = createFontLoader('Geist_Mono');

      // 2025 Trendy fonts
      export const Syne = createFontLoader('Syne');
      export const Space_Mono = createFontLoader('Space_Mono');
      export const Instrument_Sans = createFontLoader('Instrument_Sans');
      export const Bricolage_Grotesque = createFontLoader('Bricolage_Grotesque');
      export const Darker_Grotesque = createFontLoader('Darker_Grotesque');
      export const Unbounded = createFontLoader('Unbounded');
      export const Onest = createFontLoader('Onest');
      export const General_Sans = createFontLoader('General_Sans');
      export const Clash_Display = createFontLoader('Clash_Display');
      export const Cabinet_Grotesk = createFontLoader('Cabinet_Grotesk');

      // Default export for dynamic imports
      export default createFontLoader;
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

      // Navigation state store - singleton pattern to prevent duplicate listeners
      const listeners = new Set();
      let isListenerSetup = false;

      function subscribe(listener) {
        listeners.add(listener);
        // Setup listeners only once, lazily
        if (!isListenerSetup && typeof window !== 'undefined') {
          isListenerSetup = true;
          window.addEventListener('hashchange', notifyListeners);
          window.addEventListener('bavini-navigate', notifyListeners);
        }
        return () => listeners.delete(listener);
      }

      function notifyListeners() {
        listeners.forEach(listener => listener());
      }

      // Set global navigation handler (without adding listeners here - BaviniRouter handles that)
      if (typeof window !== 'undefined' && !window.__BAVINI_NAVIGATE__) {
        window.__BAVINI_NAVIGATE__ = (url, options = {}) => {
          const newHash = '#' + (url.startsWith('/') ? url : '/' + url);
          if (options.replace) {
            window.location.replace(newHash);
          } else {
            window.location.hash = newHash;
          }
          notifyListeners();
        };
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
          // Listen specifically for params changes (more efficient than navigation events)
          const handleParamsChange = () => {
            setParams(window.__BAVINI_ROUTE_PARAMS__ || {});
          };

          window.addEventListener('bavini-params-change', handleParamsChange);
          return () => window.removeEventListener('bavini-params-change', handleParamsChange);
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

        // Handle tailwindcss imports - Tailwind CDN is injected separately
        // This intercepts: @import 'tailwindcss/base', import 'tailwindcss', etc.
        build.onResolve({ filter: /^tailwindcss(\/|$)/ }, (args) => {
          logger.debug(`Intercepting Tailwind import: ${args.path} (handled by CDN)`);
          return { path: args.path, namespace: 'tailwind-shim' };
        });

        // Load empty content for tailwindcss imports (CDN handles actual styles)
        build.onLoad({ filter: /.*/, namespace: 'tailwind-shim' }, (args) => {
          logger.debug(`Providing empty shim for Tailwind: ${args.path}`);
          // Return empty CSS - Tailwind CDN browser script handles everything
          return {
            contents: `/* Tailwind CSS handled by CDN: ${args.path} */`,
            loader: 'css'
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
                const compiler = await loadCompiler('css') as TailwindCompiler;

                // Provide content files for Tailwind class extraction
                const contentFiles: ContentFile[] = Array.from(this._files.entries())
                  .filter(([path]) => /\.(tsx?|jsx?|vue|svelte|html|astro)$/.test(path))
                  .map(([path, fileContent]) => ({ path, content: fileContent }));

                compiler.setContentFiles(contentFiles);

                const result = await compiler.compile(content, foundPath);

                // Add compiled CSS to aggregator (type: tailwind for utility-first CSS)
                if (result.code && result.code.trim()) {
                  this._cssAggregator.addCSS({
                    source: foundPath,
                    css: result.code,
                    type: 'tailwind',
                  });
                  logger.debug(`Added Tailwind CSS to aggregator: ${foundPath}`);
                }

                // Return empty module - CSS is now in aggregator
                return {
                  contents: `/* CSS aggregated: ${foundPath} */`,
                  loader: 'js' as const,
                  resolveDir,
                };
              }

              // Standard compiler handling (Vue, Svelte, Astro, etc.)
              const compiler = await loadCompiler(ext);
              const result = await compiler.compile(content, foundPath);

              // If the compiler produced CSS, add it to the aggregator
              // CSS will be injected once in the HTML by injectBundle()
              if (result.css && result.css.trim()) {
                const cssType: CSSType = result.cssMetadata?.type === 'tailwind' ? 'tailwind' : 'component';
                this._cssAggregator.addCSS({
                  source: foundPath,
                  css: result.css,
                  type: cssType,
                  scopeId: result.cssMetadata?.scopeId,
                });
                logger.debug(`Added CSS to aggregator: ${foundPath} (${cssType})`);
              }

              // Log any warnings
              if (result.warnings && result.warnings.length > 0) {
                result.warnings.forEach((w) => logger.warn(`[${ext}] ${w}`));
              }

              return {
                contents: result.code,
                loader: 'js',
                resolveDir,
              };
            } catch (error) {
              const errorMsg = error instanceof Error ? error.message : String(error);
              logger.error(`Failed to compile ${foundPath}:`, error);

              // For CSS files, return fallback instead of error
              if (ext === 'css') {
                logger.warn(`CSS compilation failed, using fallback: ${errorMsg}`);
                // Sanitize error message for CSS comment (prevent comment injection via */)
                const sanitizedError = errorMsg.replace(/\*\//g, '* /').replace(/</g, '&lt;');
                const fallbackCSS = `/* Tailwind compilation failed: ${sanitizedError} */\n:root { --background: transparent; --foreground: inherit; }`;
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

          // For CSS files, add to aggregator and return empty module
          // CSS will be injected once in the HTML by injectBundle()
          if (loader === 'css') {
            try {
              let cssContent = content;

              // Check if CSS has Tailwind directives and needs compilation
              const hasTailwindDirectives =
                content.includes('@tailwind') ||
                content.includes('@apply') ||
                content.includes('@layer');

              if (hasTailwindDirectives) {
                try {
                  const compiler = await loadCompiler('css') as TailwindCompiler;

                  // Provide content files for Tailwind class extraction
                  const contentFiles: ContentFile[] = Array.from(this._files.entries())
                    .filter(([path]) => /\.(tsx?|jsx?|vue|svelte|html|astro)$/.test(path))
                    .map(([path, fileContent]) => ({ path, content: fileContent }));

                  compiler.setContentFiles(contentFiles);

                  const result = await compiler.compile(content, foundPath);
                  cssContent = result.code;

                  if (result.warnings && result.warnings.length > 0) {
                    result.warnings.forEach((w) => logger.warn(`[Tailwind] ${w}`));
                  }
                } catch (compileError) {
                  logger.warn(`Tailwind compilation failed for ${foundPath}:`, compileError);

                  // Use minimal fallback - just strip @tailwind directives
                  cssContent = `/* Tailwind compilation failed - using CDN fallback */
:root { --background: transparent; --foreground: inherit; }`;
                }
              }

              // Add CSS to aggregator (tailwind if has directives, otherwise base)
              if (cssContent && cssContent.trim()) {
                this._cssAggregator.addCSS({
                  source: foundPath,
                  css: cssContent,
                  type: hasTailwindDirectives ? 'tailwind' : 'base',
                });
                logger.debug(`Added CSS to aggregator: ${foundPath} (${hasTailwindDirectives ? 'tailwind' : 'base'})`);
              }

              // Return empty module - CSS is now in aggregator
              return {
                contents: `/* CSS aggregated: ${foundPath} */`,
                loader: 'js' as const,
                resolveDir,
              };
            } catch (cssError) {
              // Ultimate fallback - return empty JS module
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
   * Extract custom colors from tailwind.config.js/ts for Tailwind CDN @theme
   * Handles nested color objects like:
   * colors: { cream: { 50: '#...', 100: '#...' }, terracotta: { ... } }
   */
  private extractTailwindCustomColors(): string {
    const configContent = this._files.get('/tailwind.config.js') || this._files.get('/tailwind.config.ts');
    if (!configContent) {
      return '';
    }

    const colorDefs: string[] = [];

    // Try to find the colors object in extend or theme
    // We need to handle nested objects like: cream: { 50: '#fff', 100: '#eee' }
    const colorsBlockMatch = configContent.match(/colors\s*:\s*\{([\s\S]*?)\n\s{4}\}/);
    if (!colorsBlockMatch) {
      // Try simpler patterns
      const simpleMatch = configContent.match(/colors\s*:\s*\{([^}]+)\}/);
      if (simpleMatch) {
        // Simple color: value pairs
        const simpleColorRegex = /['"]?(\w+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
        let match;
        while ((match = simpleColorRegex.exec(simpleMatch[1])) !== null) {
          colorDefs.push(`--color-${match[1]}: ${match[2]};`);
        }
      }
      if (colorDefs.length > 0) {
        logger.debug(`Extracted ${colorDefs.length} simple custom colors from tailwind.config`);
        return colorDefs.join('\n    ');
      }
      return '';
    }

    const colorsBlock = colorsBlockMatch[1];

    // Parse nested color objects: colorName: { shade: 'value', ... }
    // Pattern matches: colorName: { ... }
    const nestedColorRegex = /['"]?(\w+)['"]?\s*:\s*\{([^}]+)\}/g;
    let nestedMatch;

    while ((nestedMatch = nestedColorRegex.exec(colorsBlock)) !== null) {
      const colorName = nestedMatch[1];
      const shadesBlock = nestedMatch[2];

      // Extract shade: value pairs
      const shadeRegex = /['"]?(\w+)['"]?\s*:\s*['"]([^'"]+)['"]/g;
      let shadeMatch;

      while ((shadeMatch = shadeRegex.exec(shadesBlock)) !== null) {
        const shade = shadeMatch[1];
        const value = shadeMatch[2];

        // Generate CSS variable: --color-colorName-shade: value
        if (shade === 'DEFAULT') {
          colorDefs.push(`--color-${colorName}: ${value};`);
        } else {
          colorDefs.push(`--color-${colorName}-${shade}: ${value};`);
        }
      }
    }

    // Also extract any simple color: value pairs at the top level
    // These would be single-value colors, not nested objects
    const lines = colorsBlock.split('\n');
    for (const line of lines) {
      // Match: colorName: 'value' (not followed by {)
      const simpleMatch = line.match(/^\s*['"]?(\w+)['"]?\s*:\s*['"]([^'"]+)['"]\s*,?\s*$/);
      if (simpleMatch) {
        colorDefs.push(`--color-${simpleMatch[1]}: ${simpleMatch[2]};`);
      }
    }

    if (colorDefs.length > 0) {
      logger.info(`Extracted ${colorDefs.length} custom colors from tailwind.config`);
    }

    return colorDefs.join('\n    ');
  }

  /**
   * Strip Tailwind CSS @import statements from CSS content
   * These are handled by the Tailwind CDN browser script
   */
  private stripTailwindImports(css: string): string {
    // Remove @import statements for tailwindcss
    // Patterns: @import 'tailwindcss/base', @import "tailwindcss", @import url(tailwindcss/...)
    const patterns = [
      // @import 'tailwindcss/base'; or @import "tailwindcss/base";
      /@import\s+['"][^'"]*tailwindcss[^'"]*['"]\s*;?/gi,
      // @import url('tailwindcss/...') or @import url("tailwindcss/...")
      /@import\s+url\s*\(\s*['"]?[^)]*tailwindcss[^)]*['"]?\s*\)\s*;?/gi,
      // @tailwind base; @tailwind components; @tailwind utilities;
      /@tailwind\s+\w+\s*;?/gi,
    ];

    let result = css;
    for (const pattern of patterns) {
      const matches = result.match(pattern);
      if (matches && matches.length > 0) {
        logger.debug(`Stripping ${matches.length} Tailwind import(s): ${matches.join(', ')}`);
      }
      result = result.replace(pattern, '/* Tailwind handled by CDN */');
    }

    return result;
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

        // Track CDN fetch statistics
        let cdnFetchCount = 0;
        let cdnCacheHits = 0;

        // Load from esm.sh
        build.onLoad({ filter: /.*/, namespace: 'esm-sh' }, async (args) => {
          let url = args.path;

          // Ensure it's a full URL
          if (!url.startsWith('http')) {
            url = `${ESM_SH_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
          }

          // Check cache
          if (moduleCache.has(url)) {
            cdnCacheHits++;
            return { contents: moduleCache.get(url)!, loader: 'js' };
          }

          try {
            cdnFetchCount++;
            logger.debug(`Fetching CDN [${cdnFetchCount}]: ${url}`);
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
      case 'nextjs':
        // Next.js uses React, but we need to handle App Router structure
        return this.createNextJSBootstrapEntry(entryPath);
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
    // NOTE: We don't use lazy/Suspense for page components since blob URLs
    // don't support code splitting - everything is bundled together
    const imports: string[] = [
      `import React, { useState, useEffect, useRef, useMemo } from 'react';`,
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

      // Generate STATIC imports for each page
      // NOTE: We use static imports instead of lazy() because code splitting
      // doesn't work with blob URLs - everything must be in one bundle
      detectedRoutes.forEach((route, index) => {
        const componentName = `Page${index}`;
        const importPath = route.component.replace(/\.tsx?$/, '');
        routeImports.push(`import ${componentName} from '${importPath}';`);
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

// Memoized route matching function (defined outside component)
function matchRouteImpl(path, routeList) {
  const normalizedPath = path || '/';

  // Exact match first (fast path)
  const exactMatch = routeList.find(r => r.path === normalizedPath);
  if (exactMatch) return { route: exactMatch, params: {} };

  // Dynamic route matching (e.g., /products/:id)
  for (const route of routeList) {
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
  return { route: routeList.find(r => r.path === '/') || routeList[0], params: {} };
}

function BaviniRouter({ children, Layout }) {
  const [currentPath, setCurrentPath] = useState(getHashPath);
  const prevParamsRef = useRef({});

  useEffect(() => {
    // Use GLOBAL flag to prevent listener accumulation across component instances
    // This fixes the freeze issue in complex projects with multiple remounts
    if (window.__BAVINI_ROUTER_INITIALIZED__) {
      // Listeners already setup by another instance, just sync state
      const syncPath = () => setCurrentPath(getHashPath());
      window.addEventListener('hashchange', syncPath);
      window.addEventListener('bavini-navigate', syncPath);
      return () => {
        window.removeEventListener('hashchange', syncPath);
        window.removeEventListener('bavini-navigate', syncPath);
      };
    }

    // First instance - setup global listeners
    window.__BAVINI_ROUTER_INITIALIZED__ = true;

    const handlePathChange = () => {
      setCurrentPath(getHashPath());
    };

    window.addEventListener('hashchange', handlePathChange);
    window.addEventListener('bavini-navigate', handlePathChange);

    // Set global navigation handler with hash routing
    window.__BAVINI_NAVIGATE__ = (url, options = {}) => {
      const newHash = '#' + (url.startsWith('/') ? url : '/' + url);
      if (options.replace) {
        window.location.replace(newHash);
      } else {
        window.location.hash = newHash;
      }
      // Let hashchange event handle the state update - don't call setCurrentPath here
    };

    // Set initial hash if not present
    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = '#/';
    }

    // NOTE: We intentionally do NOT reset __BAVINI_ROUTER_INITIALIZED__ on cleanup
    // This prevents listener accumulation during hot reloads and remounts
    return () => {
      window.removeEventListener('hashchange', handlePathChange);
      window.removeEventListener('bavini-navigate', handlePathChange);
    };
  }, []);

  // Memoize route matching to prevent recalculation on every render
  const { route: currentRoute, params } = useMemo(
    () => matchRouteImpl(currentPath, routes),
    [currentPath]
  );
  const PageComponent = currentRoute?.component;

  // Update global params only when they actually change
  useEffect(() => {
    const paramsStr = JSON.stringify(params);
    const prevParamsStr = JSON.stringify(prevParamsRef.current);
    if (paramsStr !== prevParamsStr) {
      prevParamsRef.current = params;
      window.__BAVINI_ROUTE_PARAMS__ = params;
      // Dispatch event to notify useParams hooks
      window.dispatchEvent(new CustomEvent('bavini-params-change'));
    }
  }, [params]);

  // No Suspense needed since we use static imports (no lazy loading)
  const content = PageComponent ? <PageComponent /> : children;

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
    // NOTE: StrictMode removed to avoid double renders that can cause performance issues
    return `
${imports.join('\n')}
${routerWrapper}
${appComponent}

// Mount the app
const container = document.getElementById('root');
if (container) {
  try {
    const root = createRoot(container);
    root.render(<App />);
  } catch (error) {
    console.error('[BAVINI] Failed to render application:', error);
    // XSS-safe error display using textContent
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'padding:20px;color:#dc3545;font-family:system-ui;';
    const title = document.createElement('h2');
    title.textContent = 'Render Error';
    const pre = document.createElement('pre');
    pre.style.overflow = 'auto';
    pre.textContent = error.message || String(error);
    errorDiv.appendChild(title);
    errorDiv.appendChild(pre);
    container.appendChild(errorDiv);
  }
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
    // Astro's compiled output is complex - it uses async generators and $render functions
    return `
import Component from '${mainPage.replace(/\.astro$/, '')}';

// Helper to collect async iterator/generator output
async function collectAsyncOutput(gen) {
  if (!gen) return '';

  // If it's already a string, return it
  if (typeof gen === 'string') return gen;

  // CRITICAL: Handle render result objects with .render() method
  // This is the async-aware format from our $render handler
  if (gen && typeof gen.render === 'function') {
    console.log('[BAVINI Astro] Detected render result object, calling .render()');
    const rendered = await gen.render();
    return await collectAsyncOutput(rendered);
  }

  // CRITICAL: Detect Astro's template literal array format
  // Format: ['string1', 'string2', ..., raw: Array(n)]
  // The actual content is often in the array values, not the raw strings
  if (Array.isArray(gen) && gen.raw !== undefined) {
    console.log('[BAVINI Astro] Detected template literal array, processing...');
    // This is a tagged template literal result
    // The strings array contains the literal parts, values are interpolated
    // But Astro often puts the HTML content in a specific pattern

    // Try to find HTML content in the array
    let html = '';
    for (let i = 0; i < gen.length; i++) {
      const part = gen[i];
      if (typeof part === 'string') {
        html += part;
      } else if (part && typeof part === 'object') {
        // Recursively process nested content
        html += await collectAsyncOutput(part);
      }
    }

    // If we got content, return it
    if (html && html.trim()) {
      return html;
    }

    // Fallback: try joining with empty string
    return gen.join('');
  }

  // If it's a regular array (not template literal), process each element
  if (Array.isArray(gen)) {
    let html = '';
    for (const item of gen) {
      html += await collectAsyncOutput(item);
    }
    return html;
  }

  // If it has a toHTML method (Astro's Response-like object)
  if (gen.toHTML) return await gen.toHTML();

  // If it has toString that returns something useful
  if (gen.toString && gen.toString() !== '[object Object]') {
    const str = gen.toString();
    if (str && str !== '[object Object]' && str !== '[object AsyncGenerator]') {
      return str;
    }
  }

  // If it's an async iterator/generator, collect all chunks
  if (gen[Symbol.asyncIterator]) {
    let html = '';
    for await (const chunk of gen) {
      if (typeof chunk === 'string') {
        html += chunk;
      } else if (chunk && chunk.toString) {
        const chunkStr = await collectAsyncOutput(chunk);
        html += chunkStr;
      }
    }
    return html;
  }

  // If it's a regular iterator
  if (gen[Symbol.iterator] && typeof gen !== 'string') {
    let html = '';
    for (const chunk of gen) {
      if (typeof chunk === 'string') {
        html += chunk;
      } else if (chunk && chunk.toString) {
        const chunkStr = await collectAsyncOutput(chunk);
        html += chunkStr;
      }
    }
    return html;
  }

  // If it's a promise, await it
  if (gen.then) {
    return await collectAsyncOutput(await gen);
  }

  // Last resort: try to get html property
  if (gen.html) return gen.html;

  return '';
}

// Render Astro component
async function renderAstro() {
  const container = document.getElementById('root') || document.getElementById('app');
  if (!container) {
    console.error('[BAVINI Astro] Root element not found');
    return;
  }

  console.log('[BAVINI Astro] Starting render, Component type:', typeof Component);

  try {
    let html = '';

    // Try different ways to render the Astro component
    // CRITICAL: Astro components expect (result, props, slots) not just (props)
    // The $result object contains createAstro and other runtime methods
    const $result = globalThis.$result || {
      styles: new Set(),
      scripts: new Set(),
      links: new Set(),
      createAstro: (Astro, props, slots) => ({ ...Astro, props: props || {}, slots: slots || {} }),
      resolve: (path) => path,
    };

    if (typeof Component === 'function') {
      console.log('[BAVINI Astro] Component is a function, calling with $result...');
      // Try with $result first (Astro v2+ pattern)
      let result = await Component($result, {}, {});
      console.log('[BAVINI Astro] Component result type:', typeof result, 'length:', String(result).length);

      // If result is empty, try without $result (some components are wrapped differently)
      if (!result || (typeof result === 'string' && result.length === 0)) {
        console.log('[BAVINI Astro] Empty result, trying alternative call patterns...');
        result = await Component({}, {});
      }

      html = await collectAsyncOutput(result);
    } else if (Component && Component.default && typeof Component.default === 'function') {
      console.log('[BAVINI Astro] Using Component.default');
      const result = await Component.default($result, {}, {});
      html = await collectAsyncOutput(result);
    } else if (Component && typeof Component.render === 'function') {
      console.log('[BAVINI Astro] Using Component.render');
      const result = await Component.render($result, {}, {});
      html = await collectAsyncOutput(result);
    } else {
      console.log('[BAVINI Astro] Component structure:', Object.keys(Component || {}));
    }

    console.log('[BAVINI Astro] Rendered HTML length:', html.length);

    if (html) {
      container.innerHTML = html;
      console.log('[BAVINI Astro] HTML injected successfully');
    } else {
      container.innerHTML = '<div style="padding: 40px; text-align: center; color: #666;"><h2>Astro Preview</h2><p>Component rendered but produced no HTML output.</p><p>Check the console for details.</p></div>';
    }
  } catch (error) {
    console.error('[BAVINI Astro] Failed to render:', error);
    // XSS-safe error display using textContent
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'color: red; padding: 20px; font-family: monospace;';
    const title = document.createElement('h3');
    title.textContent = 'Astro Render Error';
    const pre = document.createElement('pre');
    pre.textContent = error.message || String(error);
    errorDiv.appendChild(title);
    errorDiv.appendChild(pre);
    container.innerHTML = '';
    container.appendChild(errorDiv);
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
   * Create Next.js App Router bootstrap entry
   * Handles layout.tsx wrapping and page structure
   */
  private createNextJSBootstrapEntry(entryPath: string): string {
    // Find layout and page files
    const layoutPath = this.findFile('/src/app/layout') || this.findFile('/app/layout');
    const pagePath = this.findFile('/src/app/page') || this.findFile('/app/page');

    logger.debug('Next.js bootstrap paths:', { layoutPath, pagePath, entryPath });

    // Get all page components for routing
    const filesList = Array.from(this._files.keys());
    const detectedRoutes = detectRoutesFromFiles(filesList, this._files);

    // Build route imports
    const routeImports: string[] = [];
    const routeComponents: string[] = [];

    detectedRoutes.forEach((route, index) => {
      const componentName = `Page${index}`;
      const importPath = route.component.replace(/\.tsx?$/, '');
      routeImports.push(`import ${componentName} from '${importPath}';`);
      routeComponents.push(`    { path: '${route.path}', component: ${componentName} }`);
    });

    // If we have a layout, wrap everything in it
    const hasLayout = !!layoutPath;
    const layoutImport = hasLayout
      ? `import RootLayout from '${layoutPath!.replace(/\.tsx?$/, '')}';`
      : '';

    return `
import React, { useState, useEffect } from 'react';
import { createRoot } from 'react-dom/client';
${layoutImport}
${routeImports.join('\n')}

// Route configuration
const routes = [
${routeComponents.join(',\n')}
];

// Get path from hash for client-side routing
function getHashPath() {
  const hash = window.location.hash || '#/';
  return hash.startsWith('#') ? hash.slice(1) : '/';
}

// Match route to path
function matchRoute(path) {
  const normalizedPath = path || '/';

  // Exact match first
  const exactMatch = routes.find(r => r.path === normalizedPath);
  if (exactMatch) return { route: exactMatch, params: {} };

  // Dynamic route matching
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

        if (isMatch) return { route, params };
      }
    }
  }

  // Fallback to index
  return { route: routes[0], params: {} };
}

// Next.js App Router Wrapper
function NextJSApp() {
  const [currentPath, setCurrentPath] = useState(getHashPath);

  useEffect(() => {
    const handleHashChange = () => setCurrentPath(getHashPath());
    window.addEventListener('hashchange', handleHashChange);
    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  const { route, params } = matchRoute(currentPath);
  const PageComponent = route?.component || (() => <div>Page not found</div>);

  // Store params for useParams hook
  if (typeof window !== 'undefined') {
    window.__BAVINI_ROUTE_PARAMS__ = params;
  }

  const pageContent = <PageComponent />;

  ${hasLayout ? 'return <RootLayout>{pageContent}</RootLayout>;' : 'return pageContent;'}
}

// Mount the app
const container = document.getElementById('root') || document.getElementById('app') || document.body;
const root = createRoot(container);
root.render(<NextJSApp />);
`;
  }

  /**
   * Extract Google Fonts from Next.js project files
   * Parses imports like: import { Playfair_Display, Inter } from 'next/font/google'
   * Returns CSS @import statements for Google Fonts
   */
  extractGoogleFontsCSS(): string {
    const fontNames = new Set<string>();
    const fontVariables: Map<string, { font: string; fallback: string }> = new Map();

    // Scan all files for next/font/google imports
    for (const [path, content] of this._files) {
      if (!path.endsWith('.tsx') && !path.endsWith('.ts') && !path.endsWith('.jsx') && !path.endsWith('.js')) {
        continue;
      }

      // Match: import { FontName, FontName2 } from 'next/font/google'
      const importMatch = content.match(/import\s*\{([^}]+)\}\s*from\s*['"]next\/font\/google['"]/);
      if (importMatch) {
        const imports = importMatch[1].split(',').map(s => s.trim()).filter(Boolean);
        imports.forEach(font => fontNames.add(font));
      }

      // Match font initialization to get CSS variables
      // const inter = Inter({ variable: '--font-body', ... })
      const initRegex = /const\s+(\w+)\s*=\s*(\w+)\s*\(\s*\{[^}]*variable\s*:\s*['"]([^'"]+)['"]/g;
      let match;
      while ((match = initRegex.exec(content)) !== null) {
        const [, , fontName, variable] = match;
        const displayName = fontName.replace(/_/g, ' ');
        const isSerif = ['Playfair_Display', 'Merriweather', 'Lora', 'Crimson_Text'].includes(fontName);
        const isMono = ['Fira_Code', 'JetBrains_Mono', 'Source_Code_Pro'].includes(fontName);
        const fallback = isMono ? 'monospace' : isSerif ? 'serif' : 'sans-serif';
        fontVariables.set(variable, { font: displayName, fallback });
      }
    }

    if (fontNames.size === 0) {
      return '';
    }

    // Build Google Fonts URL
    const fontParams = Array.from(fontNames).map(font => {
      const urlName = font.replace(/_/g, '+');
      return `family=${urlName}:wght@300;400;500;600;700`;
    });

    const googleFontsUrl = `https://fonts.googleapis.com/css2?${fontParams.join('&')}&display=swap`;

    // Build CSS
    let css = `@import url('${googleFontsUrl}');\n\n`;

    // Add CSS variables
    if (fontVariables.size > 0) {
      css += ':root {\n';
      for (const [variable, { font, fallback }] of fontVariables) {
        css += `  ${variable}: "${font}", ${fallback};\n`;
      }
      css += '}\n';
    }

    logger.info(`Extracted ${fontNames.size} Google Font(s) for Next.js project`);
    return css;
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
   * Create preview using Service Worker (preferred) or Blob URL (fallback)
   *
   * Service Worker mode:
   * - Preview has normal origin (same as parent)
   * - localStorage, form inputs, and all browser APIs work correctly
   * - URL: /preview/index.html
   *
   * Blob URL fallback:
   * - Preview has "null" origin
   * - Some browser APIs may not work correctly
   * - URL: blob:https://...
   */
  private async createPreview(code: string, css: string, options: BuildOptions): Promise<void> {
    try {
      // Find HTML template
      let htmlTemplate = this._files.get('/index.html') || this._files.get('/public/index.html');
      let templateSource = 'project';

      if (!htmlTemplate) {
        // Generate default HTML
        htmlTemplate = this.generateDefaultHtml(options);
        templateSource = 'generated';
      }

      // DEBUG: Log which template is being used and its body tag
      const templateBodyTag = htmlTemplate.match(/<body[^>]*>/i);
      logger.info(`[TEMPLATE DEBUG] Using ${templateSource} HTML template`);
      logger.info(`[TEMPLATE DEBUG] Original body tag: ${templateBodyTag?.[0] || 'NOT FOUND'}`);

      // Try SSR if enabled and available
      let ssrContent: { html: string; css: string; head: string } | null = null;

      if (this._ssrEnabled && this._ssrBridge) {
        ssrContent = await this.trySSRRender(options);
      }

      // Inject bundle into HTML (with SSR content if available)
      const html = this.injectBundleWithSSR(htmlTemplate, code, css, ssrContent);

      // FIX: Bug #3 - Improved preview mode selection
      // Default: srcdoc mode (most reliable across browsers)
      // Optional: Service Worker mode (for localStorage/cookies support)
      if (shouldAttemptServiceWorker() && isServiceWorkerReady()) {
        logger.info(`Attempting Service Worker mode for preview (mode: ${previewModeConfig.mode}, failures: ${swFailureCount}/${MAX_SW_FAILURES})`);

        const swSuccess = await this.createPreviewWithServiceWorker(html);

        if (swSuccess) {
          logger.info('Preview created via Service Worker');
          return;
        }

        swFailureCount++;
        logger.warn(`Service Worker mode failed (${swFailureCount}/${MAX_SW_FAILURES}), falling back to srcdoc`);

        // If we've failed too many times, disable SW for this session
        if (swFailureCount >= MAX_SW_FAILURES) {
          logger.info('Service Worker disabled for this session after multiple failures');
        }
      } else {
        const reason = !previewModeConfig.swAvailable ? 'SW unavailable' :
                       previewModeConfig.mode === 'srcdoc' ? 'srcdoc mode selected' :
                       swFailureCount >= MAX_SW_FAILURES ? 'too many SW failures' :
                       'auto mode prefers srcdoc';
        logger.debug(`Using srcdoc mode (${reason})`);
      }

      // Fallback to srcdoc mode
      logger.info('Creating preview with srcdoc mode');
      await this.createPreviewWithSrcdoc(html);
    } catch (error) {
      logger.error('Failed to create preview:', error);
      throw error;
    }
  }

  /**
   * Try to render SSR content for eligible files
   * Returns null if SSR is not applicable or fails
   */
  private async trySSRRender(options: BuildOptions): Promise<{ html: string; css: string; head: string } | null> {
    if (!this._ssrBridge) {
      return null;
    }

    // Find SSR-eligible files (Astro, Vue, Svelte pages)
    const ssrEligibleExtensions = ['.astro', '.vue', '.svelte'];
    const pagePatterns = ['/src/pages/', '/pages/', '/src/app/', '/app/'];

    for (const [filePath, content] of this._files.entries()) {
      // Check if file is SSR-eligible
      const isEligible = ssrEligibleExtensions.some((ext) => filePath.endsWith(ext));
      const isPage = pagePatterns.some((pattern) => filePath.includes(pattern)) ||
                     filePath.includes('index') ||
                     filePath.includes('App');

      if (!isEligible) {
        continue;
      }

      // Check if SSR should be used for this file
      const decision = this._ssrBridge.shouldUseSSR(filePath, content);

      if (!decision.shouldSSR) {
        logger.debug(`SSR skipped for ${filePath}: ${decision.reason}`);
        continue;
      }

      logger.info(`Attempting SSR render for ${filePath} (${decision.framework})`);

      try {
        const result = await this._ssrBridge.render(content, filePath);

        if (result && result.html) {
          logger.info(`SSR render successful for ${filePath}: ${result.html.length} chars`);

          return {
            html: result.html,
            css: result.css || '',
            head: result.head || '',
          };
        }
      } catch (error) {
        logger.warn(`SSR render failed for ${filePath}:`, error);
      }
    }

    return null;
  }

  /**
   * Inject bundle into HTML with optional SSR content
   */
  private injectBundleWithSSR(
    html: string,
    code: string,
    css: string,
    ssrContent: { html: string; css: string; head: string } | null,
  ): string {
    // If no SSR content, use standard injection
    if (!ssrContent) {
      return this.injectBundle(html, code, css);
    }

    logger.info('Injecting SSR content into preview');

    // Combine CSS (SSR CSS + aggregated CSS)
    const combinedCss = ssrContent.css ? `${ssrContent.css}\n${css}` : css;

    // First inject normal bundle
    let result = this.injectBundle(html, code, combinedCss);

    // Inject SSR head content if available
    if (ssrContent.head) {
      result = result.replace('</head>', `${ssrContent.head}\n</head>`);
    }

    // Inject SSR HTML content into body
    // Replace #root or #app content, or add before script
    if (ssrContent.html) {
      // Try to inject into #root or #app
      const rootPatterns = [
        /(<div\s+id="root"[^>]*>)(<\/div>)/,
        /(<div\s+id="app"[^>]*>)(<\/div>)/,
        /(<div\s+id="__next"[^>]*>)(<\/div>)/,
      ];

      let injected = false;

      for (const pattern of rootPatterns) {
        if (pattern.test(result)) {
          result = result.replace(pattern, `$1${ssrContent.html}$2`);
          injected = true;
          logger.debug('SSR content injected into root element');
          break;
        }
      }

      // Fallback: add as first element in body
      if (!injected) {
        result = result.replace(
          '<body>',
          `<body>\n<div id="ssr-content">${ssrContent.html}</div>`,
        );
        logger.debug('SSR content injected as new element');
      }
    }

    return result;
  }

  /**
   * Create preview using Service Worker
   * This gives the preview a normal origin, fixing issues with localStorage, inputs, etc.
   * Returns false if SW fails, so caller can fallback to srcdoc
   */
  private async createPreviewWithServiceWorker(html: string): Promise<boolean> {
    const buildId = Date.now().toString();

    // Send the HTML to the Service Worker and wait for confirmation
    const files: Record<string, string> = {
      'index.html': html,
    };

    const success = await setPreviewFiles(files, buildId);

    if (!success) {
      logger.warn('Service Worker failed to store files');
      // Note: swFailureCount is incremented by caller
      return false;
    }

    // Use the Service Worker URL
    const previewUrl = getPreviewUrl();
    const fullUrl = `${previewUrl}?t=${buildId}`;

    // NOTE: We skip fetch verification because it fails due to SW scope limitations.
    // The SW only intercepts requests from pages WITHIN its scope (/preview/).
    // A fetch from the main page (/) won't be intercepted, but the iframe WILL work
    // because it loads a page within the SW scope.
    // We trust the SW since setPreviewFiles confirmed the files are stored.

    // Reset failure count on success
    swFailureCount = 0;

    // Create preview object with a cache-busting query param
    const preview: PreviewInfo = {
      url: fullUrl,
      ready: true,
      updatedAt: Date.now(),
    };

    this._preview = preview;

    logger.info('Preview created via Service Worker:', preview.url);
    this.emitPreviewReady(this._preview);
    return true;
  }

  /**
   * Verify that the Service Worker is actually serving content
   * Makes a test fetch to ensure the SW intercepts the request
   */
  private async verifyServiceWorkerServing(url: string): Promise<boolean> {
    try {
      // Use a short timeout - if SW works, it should respond very fast
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 2000);

      const response = await fetch(url, {
        signal: controller.signal,
        cache: 'no-store', // Don't use browser cache
      });

      clearTimeout(timeoutId);

      // Check if we got a valid response
      if (!response.ok) {
        logger.warn(`SW verification failed: status ${response.status}`);
        return false;
      }

      // Check if response came from our Service Worker
      const servedBy = response.headers.get('X-Served-By');
      if (!servedBy || !servedBy.includes('BAVINI-Preview-SW')) {
        logger.warn('SW verification failed: response not from our Service Worker');
        return false;
      }

      // Check that we got actual content
      const text = await response.text();
      if (text.length < 100) {
        logger.warn('SW verification failed: response too short');
        return false;
      }

      logger.info('Service Worker verification passed');
      return true;
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        logger.warn('SW verification timed out');
      } else {
        logger.warn('SW verification error:', error);
      }
      return false;
    }
  }

  /**
   * Create preview using srcdoc (recommended - avoids blob URL origin issues)
   *
   * Using srcdoc instead of blob URL because:
   * - Blob URLs have a "null" origin which breaks form inputs, localStorage, etc.
   * - srcdoc with allow-same-origin sandbox gives the iframe the parent's origin
   * - This is more reliable than Service Worker which can fail to initialize
   */
  private async createPreviewWithSrcdoc(html: string): Promise<void> {
    // Revoke any previous blob URL (cleanup from old mode)
    if (this._blobUrl) {
      try {
        URL.revokeObjectURL(this._blobUrl);
        this._blobUrl = null;
        logger.debug('Revoked previous blob URL (switching to srcdoc mode)');
      } catch (e) {
        logger.warn('Failed to revoke old blob URL:', e);
      }
    }

    // Create preview object with srcdoc
    // URL is set to 'about:srcdoc' as a marker for the Preview component
    const preview: PreviewInfo = {
      url: 'about:srcdoc',
      ready: true,
      updatedAt: Date.now(),
      srcdoc: html,
    };

    this._preview = preview;

    logger.info('Preview created via srcdoc (recommended mode)');
    this.emitPreviewReady(this._preview);
  }

  /**
   * Generate default HTML template
   */
  private generateDefaultHtml(options: BuildOptions): string {
    // NOTE: Do NOT use <base href="/"> - it's blocked by CSP in Blob URLs
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BAVINI Preview</title>
  <!-- BAVINI: localStorage protection for blob URLs -->
  <script>
  (function() {
    // Wrap localStorage/sessionStorage to prevent errors in blob URL context
    try {
      // Test if localStorage works
      localStorage.setItem('__bavini_test__', '1');
      localStorage.removeItem('__bavini_test__');
    } catch (e) {
      // localStorage doesn't work in this context, provide a memory fallback
      console.warn('[BAVINI] localStorage not available, using memory fallback');
      var memoryStorage = {};
      window.localStorage = {
        getItem: function(k) { return memoryStorage[k] || null; },
        setItem: function(k, v) { memoryStorage[k] = String(v); },
        removeItem: function(k) { delete memoryStorage[k]; },
        clear: function() { memoryStorage = {}; },
        get length() { return Object.keys(memoryStorage).length; },
        key: function(i) { return Object.keys(memoryStorage)[i] || null; }
      };
    }
  })();
  </script>
  <style>
    /* Base reset */
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      min-height: 100%;
    }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.5;
    }

    /* Responsive media - safety net */
    img, video, svg, canvas {
      max-width: 100%;
      height: auto;
    }

    /* BAVINI Design System - Default CSS Variables */
    :root {
      --color-primary: #6366f1;
      --color-primary-light: #818cf8;
      --color-primary-dark: #4f46e5;
      --color-secondary: #f1f5f9;
      --color-accent: #06b6d4;
      --color-background: #fafbfc;
      --color-background-alt: #f1f5f9;
      --color-surface: #ffffff;
      --color-text: #1a1f36;
      --color-text-muted: #64748b;
      --color-success: #10b981;
      --color-warning: #f59e0b;
      --color-error: #ef4444;
      --color-border: #e2e8f0;
      --font-heading: system-ui, sans-serif;
      --font-body: system-ui, sans-serif;
      --radius-lg: 0.75rem;
      --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
      /* Legacy aliases */
      --bavini-bg: var(--color-background);
      --bavini-fg: var(--color-text);
      --bavini-primary: var(--color-primary);
    }

    .dark {
      --color-primary: #818cf8;
      --color-background: #0f172a;
      --color-surface: #1e293b;
      --color-text: #f1f5f9;
      --color-text-muted: #94a3b8;
      --color-border: #334155;
    }
  </style>
</head>
<body style="background: var(--color-background); color: var(--color-text);">
  <div id="root"></div>
  <!-- BAVINI_BUNDLE -->
</body>
</html>`;
  }

  /**
   * Inject bundle into HTML
   */
  private injectBundle(html: string, code: string, css: string): string {
    // NOTE: We don't use Tailwind CDN because COEP headers block it
    // Instead, TailwindCompiler JIT compiles CSS which is passed via the 'css' parameter
    //
    // CSS Variable Strategy:
    // 1. Default CSS variables provide sensible fallbacks
    // 2. Claude can override these with project-specific values
    // 3. Legacy --bavini-* variables kept for backwards compatibility
    const baseStyles = `
<style>
  /* ===== BAVINI DESIGN SYSTEM - DEFAULT CSS VARIABLES ===== */
  /* Claude can override these with creative, project-specific values */
  :root {
    /* Color palette (defaults) */
    --color-primary: #6366f1;
    --color-primary-light: #818cf8;
    --color-primary-dark: #4f46e5;
    --color-secondary: #f1f5f9;
    --color-secondary-light: #f8fafc;
    --color-secondary-dark: #e2e8f0;
    --color-accent: #06b6d4;
    --color-accent-light: #22d3ee;
    --color-accent-dark: #0891b2;
    --color-background: #fafbfc;
    --color-background-alt: #f1f5f9;
    --color-surface: #ffffff;
    --color-surface-hover: #f8fafc;
    --color-text: #1a1f36;
    --color-text-muted: #64748b;
    --color-text-inverse: #ffffff;
    --color-success: #10b981;
    --color-warning: #f59e0b;
    --color-error: #ef4444;
    --color-info: #3b82f6;
    --color-border: #e2e8f0;
    --color-border-hover: #cbd5e1;

    /* Typography defaults */
    --font-heading: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --font-body: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

    /* Spacing defaults */
    --container-max-width: 1280px;
    --container-padding: 1.5rem;
    --section-padding-y: 6rem;
    --grid-gap: 1.5rem;

    /* Effects defaults */
    --radius-sm: 0.25rem;
    --radius-base: 0.375rem;
    --radius-md: 0.5rem;
    --radius-lg: 0.75rem;
    --radius-xl: 1rem;
    --radius-2xl: 1.5rem;
    --radius-full: 9999px;
    --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
    --shadow-base: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
    --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
    --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
    --transition-fast: 150ms ease;
    --transition-base: 200ms ease;
    --transition-slow: 300ms ease;

    /* Legacy BAVINI variables (for backwards compatibility) */
    --bavini-bg: var(--color-background);
    --bavini-fg: var(--color-text);
    --bavini-primary: var(--color-primary);
    --bavini-primary-hover: var(--color-primary-dark);
    --bavini-secondary: var(--color-secondary);
    --bavini-accent: var(--color-accent);
    --bavini-success: var(--color-success);
    --bavini-warning: var(--color-warning);
    --bavini-error: var(--color-error);
    --bavini-border: var(--color-border);
    --bavini-muted: var(--color-text-muted);
    --bavini-card: var(--color-surface);
    --bavini-radius: var(--radius-lg);
    --bavini-shadow: var(--shadow-md);
  }

  .dark {
    --color-primary: #818cf8;
    --color-primary-light: #a5b4fc;
    --color-primary-dark: #6366f1;
    --color-secondary: #1e293b;
    --color-secondary-light: #334155;
    --color-secondary-dark: #0f172a;
    --color-accent: #22d3ee;
    --color-accent-light: #67e8f9;
    --color-accent-dark: #06b6d4;
    --color-background: #0f172a;
    --color-background-alt: #1e293b;
    --color-surface: #1e293b;
    --color-surface-hover: #334155;
    --color-text: #f1f5f9;
    --color-text-muted: #94a3b8;
    --color-text-inverse: #0f172a;
    --color-success: #34d399;
    --color-warning: #fbbf24;
    --color-error: #f87171;
    --color-info: #60a5fa;
    --color-border: #334155;
    --color-border-hover: #475569;
  }

  /* Base reset */
  *, *::before, *::after {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
    min-height: 100%;
  }

  body {
    font-family: var(--font-body);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    line-height: 1.5;
    /* NOTE: No background/color set to allow SFC components to define their own */
  }

  /* Responsive media - safety net */
  img, video, svg, canvas {
    max-width: 100%;
    height: auto;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading);
    line-height: 1.25;
  }

  a {
    color: var(--color-primary);
    transition: color var(--transition-fast);
  }

  a:hover {
    color: var(--color-primary-dark);
  }
</style>`;

    // Inject base styles (CSS variables, reset) in head
    html = html.replace('<head>', `<head>\n${baseStyles}`);

    // Inject CSS (additional custom styles)
    if (css) {
      const styleTag = `<style>${css}</style>`;
      html = html.replace('</head>', `${styleTag}\n</head>`);
    }

    // Extract custom theme from tailwind.config.js/ts
    const customTheme = this.extractTailwindCustomColors();
    const hasCustomColors = customTheme.length > 0;

    // DEBUG: Log custom theme extraction
    logger.info(`[TAILWIND DEBUG] hasCustomColors: ${hasCustomColors}`);
    logger.info(`[TAILWIND DEBUG] customTheme length: ${customTheme.length}`);
    logger.info(`[TAILWIND DEBUG] detectedFramework: ${this._detectedFramework}`);
    if (customTheme) {
      logger.info(`[TAILWIND DEBUG] customTheme preview:\n${customTheme.substring(0, 800)}`);
    }

    // ALWAYS inject Tailwind CDN browser script when:
    // 1. No compiled CSS is available, OR
    // 2. CSS contains "Tailwind compilation failed" (JIT explicitly failed), OR
    // 3. Custom colors are defined in tailwind.config (JIT doesn't know about them), OR
    // 4. Framework is SFC-based (Vue, Svelte, Astro) - JIT can't properly extract classes from templates
    const jitFailed = css?.includes('Tailwind compilation failed');
    const isSfcFramework = ['vue', 'svelte', 'astro'].includes(this._detectedFramework);
    const needsTailwindCdn = !css || css.length < 100 || jitFailed || hasCustomColors || isSfcFramework;

    // FIX: For Astro and SFC frameworks, DON'T remove body inline styles
    // SFC frameworks (Vue, Svelte) should control their own styles without BAVINI interference
    // Only apply body style removal for non-SFC projects with custom colors
    const isAstro = this._detectedFramework === 'astro';
    const needsBodyStyleRemoval = !isAstro && !isSfcFramework && hasCustomColors;

    if (needsBodyStyleRemoval) {
      // DEBUG: Log body tag BEFORE modification
      const bodyTagBefore = html.match(/<body[^>]*>/i);
      logger.info(`[BODY DEBUG] Body tag BEFORE removal: ${bodyTagBefore?.[0] || 'NOT FOUND'}`);

      // Remove inline style from body tag to let components control their own backgrounds
      const htmlBefore = html;
      html = html.replace(
        /<body([^>]*)\s+style="[^"]*"([^>]*)>/gi,
        '<body$1$2>'
      );

      // DEBUG: Log body tag AFTER modification
      const bodyTagAfter = html.match(/<body[^>]*>/i);
      logger.info(`[BODY DEBUG] Body tag AFTER removal: ${bodyTagAfter?.[0] || 'NOT FOUND'}`);
      logger.info(`[BODY DEBUG] HTML changed: ${htmlBefore !== html}`);
      logger.info(`[TAILWIND DEBUG] Removed inline style from body tag (reason: custom colors)`);
    }

    if (needsTailwindCdn) {
      // FIX: Don't apply aggressive background override for SFC frameworks
      // The transparent !important was breaking user-defined Tailwind backgrounds (bg-gradient-*, bg-blue-*, etc.)
      // Only apply minimal reset for BAVINI CSS variables, let user CSS take precedence
      const needsBackgroundOverride = !isAstro && !isSfcFramework && hasCustomColors;
      const backgroundOverride = needsBackgroundOverride ? `
<style id="bavini-bg-override">
  /* Override BAVINI default background for projects with custom Tailwind colors */
  /* NOTE: Astro and SFC frameworks (Vue, Svelte) are excluded - they work with their own styles */
  :root {
    --color-background: transparent;
    --bavini-bg: transparent;
  }
</style>` : '';

      // Use Tailwind Browser Runtime for dynamic compilation of all Tailwind classes
      // This handles custom colors via @theme and all standard Tailwind utilities
      let tailwindCdnScript = `
<script src="https://unpkg.com/@tailwindcss/browser@4"></script>
<style type="text/tailwindcss">
  @theme {
    ${customTheme || '/* Using Tailwind default theme */'}
  }
</style>
<style id="tailwind-base-fixes">
/* Minimal base fixes - Tailwind Browser Runtime handles everything else */
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
</style>${backgroundOverride}`;

      // Tailwind Browser Runtime handles all utilities via @theme - no manual generation needed
      html = html.replace('</head>', `${tailwindCdnScript}\n</head>`);
      const reason = !css ? 'no CSS' : css.length < 100 ? 'CSS too short' : jitFailed ? 'JIT failed' : isSfcFramework ? `SFC framework (${this._detectedFramework})` : 'custom colors detected';
      logger.info(`Injected Tailwind CDN (reason: ${reason}, ${customTheme.split('\n').length} custom vars)`);

      // DEBUG: Log what we're injecting
      logger.info(`[TAILWIND DEBUG] backgroundOverride applied: ${needsBackgroundOverride} (customColors: ${hasCustomColors}, sfcFramework: ${isSfcFramework})`);
      if (needsBackgroundOverride) {
        logger.info(`[BG OVERRIDE DEBUG] backgroundOverride content:\n${backgroundOverride}`);
      }
      // Note: tailwindCdnScript log removed - too long and floods logs
    }

    // DEBUG: Log the HTML head section to see what's in there
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
    if (headMatch) {
      logger.info(`[TAILWIND DEBUG] Final HTML <head> section (first 2000 chars):\n${headMatch[1].substring(0, 2000)}`);
    }

    // DEBUG: Log the final body tag to confirm style removal
    const finalBodyTag = html.match(/<body[^>]*>/i);
    logger.info(`[BODY DEBUG] FINAL body tag in HTML: ${finalBodyTag?.[0] || 'NOT FOUND'}`);

    // Remove original entry point script tags to prevent 404 errors
    // These patterns match common Vite/React entry scripts:
    // <script type="module" src="/src/main.tsx"></script>
    // <script type="module" src="./src/main.tsx"></script>
    // <script type="module" src="/src/main.ts"></script>
    // etc.
    const entryScriptPatterns = [
      /<script[^>]*\s+src=["'][^"']*\/src\/main\.(tsx?|jsx?)["'][^>]*><\/script>/gi,
      /<script[^>]*\s+src=["'][^"']*\/src\/index\.(tsx?|jsx?)["'][^>]*><\/script>/gi,
      /<script[^>]*\s+src=["'][^"']*main\.(tsx?|jsx?)["'][^>]*><\/script>/gi,
      /<script[^>]*\s+src=["'][^"']*index\.(tsx?|jsx?)["'][^>]*><\/script>/gi,
    ];

    for (const pattern of entryScriptPatterns) {
      // Reset lastIndex before each operation (regex with 'g' flag maintains state)
      pattern.lastIndex = 0;
      if (pattern.test(html)) {
        logger.debug(`Removing original entry script matching: ${pattern}`);
        // Reset again before replace (test() modifies lastIndex)
        pattern.lastIndex = 0;
        html = html.replace(pattern, '<!-- BAVINI: Original entry script removed, using bundled code -->');
      }
    }

    // Remove <link> tags that try to load Tailwind CSS from virtual filesystem
    // These would fail with MIME type errors since they resolve to parent page URL
    // Tailwind is handled by CDN or JIT compilation instead
    const tailwindLinkPatterns = [
      // <link rel="stylesheet" href="...tailwindcss...">
      /<link[^>]*\s+href=["'][^"']*tailwindcss[^"']*["'][^>]*\/?>/gi,
      // <link rel="stylesheet" href="...tailwind.css...">
      /<link[^>]*\s+href=["'][^"']*tailwind\.css[^"']*["'][^>]*\/?>/gi,
      // <link rel="stylesheet" href="/node_modules/tailwindcss/...">
      /<link[^>]*\s+href=["'][^"']*\/node_modules\/tailwindcss[^"']*["'][^>]*\/?>/gi,
    ];

    for (const pattern of tailwindLinkPatterns) {
      pattern.lastIndex = 0;
      if (pattern.test(html)) {
        logger.debug(`Removing Tailwind link tag matching: ${pattern}`);
        pattern.lastIndex = 0;
        html = html.replace(pattern, '<!-- BAVINI: Tailwind CSS link removed, handled by CDN/JIT -->');
      }
    }

    // Inject JS bundle using base64 encoding
    // This completely avoids all escaping issues (backticks, </script>, quotes, etc.)
    // The code is base64 encoded and decoded at runtime
    // Use btoa with UTF-8 encoding (encodeURIComponent + unescape trick for Unicode support)
    const base64Code = btoa(unescape(encodeURIComponent(code)));
    const loaderScript = '<script type="module">\n' +
      '(async function() {\n' +
      '  try {\n' +
      '    const base64 = "' + base64Code + '";\n' +
      '    const code = decodeURIComponent(escape(atob(base64)));\n' +
      '    const blob = new Blob([code], { type: "text/javascript" });\n' +
      '    const url = URL.createObjectURL(blob);\n' +
      '    await import(url);\n' +
      '    URL.revokeObjectURL(url);\n' +
      '  } catch (e) {\n' +
      '    console.error("[BAVINI] Failed to load bundle:", e);\n' +
      '  }\n' +
      '})();\n' +
      '</script>';

    // Replace placeholder or add before </body>
    if (html.includes('<!-- BAVINI_BUNDLE -->')) {
      html = html.replace('<!-- BAVINI_BUNDLE -->', loaderScript);
    } else {
      html = html.replace('</body>', `${loaderScript}\n</body>`);
    }

    // TEMPORARILY DISABLED: Console capture for debugging input freeze issue
    // TODO: Re-enable once input freeze is fixed
    // The console capture was intercepting console.log and sending via postMessage
    // We're disabling it to test if postMessage/console interception causes the freeze

    // html = html.replace('<head>', `<head>\n${consoleCapture}`);

    // Keyboard event forwarding script
    // This script receives keyboard events forwarded from the parent window
    // and applies them to the currently focused element in the iframe
    const keyboardForwardingScript = `
<script>
(function() {
  console.log('[BAVINI] Keyboard forwarding helper loaded');

  var currentFocusedElement = null;

  // Track the currently focused element
  document.addEventListener('focus', function(e) {
    currentFocusedElement = e.target;
    var tag = e.target.tagName;
    var isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;

    if (isInput) {
      console.log('[BAVINI] Input focused:', tag, e.target.type || '', e.target.name || '');
      // Notify parent that we have focus on an input
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'bavini-input-focused', target: tag }, '*');
      }
    }
  }, true);

  document.addEventListener('blur', function(e) {
    if (e.target === currentFocusedElement) {
      // Notify parent that input lost focus
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'bavini-input-blurred' }, '*');
      }
    }
  }, true);

  // Listen for forwarded keyboard events from parent
  window.addEventListener('message', function(e) {
    if (!e.data || e.data.type !== 'bavini-keyboard-event') return;

    var payload = e.data.payload;
    var target = currentFocusedElement || document.activeElement;

    if (!target) return;

    var tag = target.tagName;
    var isInput = tag === 'INPUT' || tag === 'TEXTAREA';
    var isEditable = target.isContentEditable;

    console.log('[BAVINI] Received keyboard event:', payload.key, 'for', tag);

    // For text inputs, directly manipulate the value
    if (isInput && payload.eventType === 'keydown') {
      var inputType = target.type || 'text';
      var isTextInput = ['text', 'email', 'password', 'search', 'tel', 'url', 'number'].includes(inputType);

      if (isTextInput || tag === 'TEXTAREA') {
        var currentValue = target.value || '';
        var selStart = target.selectionStart || currentValue.length;
        var selEnd = target.selectionEnd || currentValue.length;
        var newValue = currentValue;
        var newCursorPos = selStart;

        if (payload.key === 'Backspace') {
          if (selStart !== selEnd) {
            // Delete selection
            newValue = currentValue.slice(0, selStart) + currentValue.slice(selEnd);
            newCursorPos = selStart;
          } else if (selStart > 0) {
            // Delete character before cursor
            newValue = currentValue.slice(0, selStart - 1) + currentValue.slice(selStart);
            newCursorPos = selStart - 1;
          }
        } else if (payload.key === 'Delete') {
          if (selStart !== selEnd) {
            newValue = currentValue.slice(0, selStart) + currentValue.slice(selEnd);
            newCursorPos = selStart;
          } else if (selStart < currentValue.length) {
            newValue = currentValue.slice(0, selStart) + currentValue.slice(selStart + 1);
            newCursorPos = selStart;
          }
        } else if (payload.key.length === 1 && !payload.ctrlKey && !payload.metaKey) {
          // Insert character
          newValue = currentValue.slice(0, selStart) + payload.key + currentValue.slice(selEnd);
          newCursorPos = selStart + 1;
        } else if (payload.key === 'Enter' && tag === 'TEXTAREA') {
          newValue = currentValue.slice(0, selStart) + '\\n' + currentValue.slice(selEnd);
          newCursorPos = selStart + 1;
        }

        if (newValue !== currentValue) {
          // Update value using native setter to trigger React's onChange
          var nativeInputValueSetter = Object.getOwnPropertyDescriptor(
            tag === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype,
            'value'
          ).set;
          nativeInputValueSetter.call(target, newValue);

          // Dispatch input event for React
          var inputEvent = new Event('input', { bubbles: true, cancelable: true });
          target.dispatchEvent(inputEvent);

          // Also dispatch change event
          var changeEvent = new Event('change', { bubbles: true, cancelable: true });
          target.dispatchEvent(changeEvent);

          // Restore cursor position
          setTimeout(function() {
            target.setSelectionRange(newCursorPos, newCursorPos);
          }, 0);

          console.log('[BAVINI] Input updated, new length:', newValue.length);
        }
      }
    }
  });
})();
</script>`;
    html = html.replace('<head>', `<head>\n${keyboardForwardingScript}`);

    // FIX 3.1: Inject HMR client script for hot module replacement
    const hmrClientScript = this._hmrManager.getHMRClientScript();
    html = html.replace('</body>', `${hmrClientScript}\n</body>`);

    return html;
  }

  /**
   * Build a vanilla HTML/CSS/JS project without esbuild bundling.
   * Simply serves the HTML with inlined CSS and JS.
   */
  private async buildVanillaProject(
    htmlPath: string,
    options: BuildOptions,
    startTime: number
  ): Promise<BundleResult> {
    this.emitBuildProgress('bundling', 20);

    // Get the HTML content
    let html = this._files.get(htmlPath) || '';

    if (!html) {
      return {
        code: '',
        css: '',
        errors: [{ message: `HTML file not found: ${htmlPath}`, file: htmlPath }],
        warnings: [],
        buildTime: performance.now() - startTime,
        hash: '',
      };
    }

    // Find and collect CSS files
    const cssFiles: string[] = [];
    const cssPatterns = ['/style.css', '/styles.css', '/main.css', '/index.css', '/css/style.css', '/css/main.css'];

    for (const pattern of cssPatterns) {
      if (this._files.has(pattern)) {
        cssFiles.push(pattern);
      }
    }

    // Also find any CSS files referenced in the HTML
    const cssLinkRegex = /<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi;
    let match;
    while ((match = cssLinkRegex.exec(html)) !== null) {
      const cssPath = match[1].startsWith('/') ? match[1] : '/' + match[1];
      if (this._files.has(cssPath) && !cssFiles.includes(cssPath)) {
        cssFiles.push(cssPath);
      }
    }

    // Collect all CSS content
    let css = '';
    for (const cssFile of cssFiles) {
      const cssContent = this._files.get(cssFile);
      if (cssContent) {
        css += `/* ${cssFile} */\n${cssContent}\n\n`;
      }
    }

    // Remove CSS link tags (we'll inline the CSS)
    html = html.replace(/<link[^>]+href=["'][^"']+\.css["'][^>]*\/?>/gi, '');

    // Find and collect JS files
    const jsFiles: string[] = [];
    const jsPatterns = ['/script.js', '/main.js', '/app.js', '/index.js', '/js/script.js', '/js/main.js', '/js/app.js'];

    for (const pattern of jsPatterns) {
      if (this._files.has(pattern)) {
        jsFiles.push(pattern);
      }
    }

    // Also find any JS files referenced in the HTML
    const jsScriptRegex = /<script[^>]+src=["']([^"']+\.js)["'][^>]*><\/script>/gi;
    while ((match = jsScriptRegex.exec(html)) !== null) {
      const jsPath = match[1].startsWith('/') ? match[1] : '/' + match[1];
      if (this._files.has(jsPath) && !jsFiles.includes(jsPath)) {
        jsFiles.push(jsPath);
      }
    }

    // Collect all JS content
    let code = '';
    for (const jsFile of jsFiles) {
      const jsContent = this._files.get(jsFile);
      if (jsContent) {
        code += `// ${jsFile}\n${jsContent}\n\n`;
      }
    }

    // Remove JS script tags with src (we'll inline the JS)
    html = html.replace(/<script[^>]+src=["'][^"']+\.js["'][^>]*><\/script>/gi, '');

    this.emitBuildProgress('bundling', 60);

    logger.info(`Vanilla project: ${cssFiles.length} CSS files, ${jsFiles.length} JS files`);
    logger.info(`Bundle size: JS=${(code.length / 1024).toFixed(1)}KB, CSS=${(css.length / 1024).toFixed(1)}KB`);

    // Inject CSS into head
    if (css) {
      const styleTag = `<style>\n${css}</style>`;
      if (html.includes('</head>')) {
        html = html.replace('</head>', `${styleTag}\n</head>`);
      } else {
        // No head tag, add one
        html = html.replace('<html', '<html>\n<head>' + styleTag + '</head');
      }
    }

    // Extract custom theme from tailwind.config if present
    const customTheme = this.extractTailwindCustomColors();
    const hasCustomColors = customTheme.length > 0;

    // Inject Tailwind CDN if the CSS uses Tailwind classes
    const usesTailwind = html.includes('class="') && (
      html.includes('flex') || html.includes('grid') || html.includes('bg-') ||
      html.includes('text-') || html.includes('p-') || html.includes('m-') ||
      css.includes('@tailwind') || css.includes('tailwindcss')
    );

    if (usesTailwind || hasCustomColors) {
      const tailwindCdnScript = `
<script src="https://unpkg.com/@tailwindcss/browser@4"></script>
${hasCustomColors ? `<style type="text/tailwindcss">
  @theme {
    ${customTheme}
  }
</style>` : ''}`;
      html = html.replace('</head>', `${tailwindCdnScript}\n</head>`);
      logger.info(`Injected Tailwind CDN for vanilla project (custom colors: ${hasCustomColors})`);
    }

    // Inject JS before closing body
    if (code) {
      const scriptTag = `<script>\n${code}</script>`;
      if (html.includes('</body>')) {
        html = html.replace('</body>', `${scriptTag}\n</body>`);
      } else {
        // No body closing tag, append
        html += scriptTag;
      }
    }

    // Add localStorage protection script
    const localStorageProtection = `
<script>
(function() {
  try {
    localStorage.setItem('__bavini_test__', '1');
    localStorage.removeItem('__bavini_test__');
  } catch (e) {
    console.warn('[BAVINI] localStorage not available, using memory fallback');
    var memoryStorage = {};
    window.localStorage = {
      getItem: function(k) { return memoryStorage[k] || null; },
      setItem: function(k, v) { memoryStorage[k] = String(v); },
      removeItem: function(k) { delete memoryStorage[k]; },
      clear: function() { memoryStorage = {}; },
      get length() { return Object.keys(memoryStorage).length; },
      key: function(i) { return Object.keys(memoryStorage)[i] || null; }
    };
  }
})();
</script>`;
    html = html.replace('<head>', `<head>\n${localStorageProtection}`);

    this.emitBuildProgress('bundling', 80);

    // Create preview
    logger.info('Creating vanilla HTML preview...');
    await this.createVanillaPreview(html);

    this.emitBuildProgress('complete', 100);

    const buildTime = performance.now() - startTime;
    logger.info(`Vanilla build completed in ${buildTime.toFixed(0)}ms`);

    this._status = 'ready';
    this.emitStatusChange('ready');

    return {
      code,
      css,
      errors: [],
      warnings: [],
      buildTime,
      hash: this.generateHash(code + css),
    };
  }

  /**
   * Create preview for vanilla HTML project using srcdoc
   */
  private async createVanillaPreview(html: string): Promise<void> {
    // Clean up previous blob URL
    if (this._blobUrl) {
      try {
        URL.revokeObjectURL(this._blobUrl);
        this._blobUrl = null;
        logger.debug('Revoked previous blob URL (vanilla preview)');
      } catch (e) {
        logger.warn('Failed to revoke old blob URL:', e);
      }
    }

    // Add keyboard forwarding script
    const keyboardForwardingScript = `
<script>
(function() {
  console.log('[BAVINI] Keyboard forwarding helper loaded');
  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'BAVINI_KEY_EVENT') {
      var payload = event.data.payload;
      var target = document.activeElement;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA')) {
        if (payload.key.length === 1) {
          var start = target.selectionStart || 0;
          var end = target.selectionEnd || 0;
          var value = target.value;
          target.value = value.slice(0, start) + payload.key + value.slice(end);
          target.setSelectionRange(start + 1, start + 1);
          target.dispatchEvent(new Event('input', { bubbles: true }));
        }
      }
    }
  });
})();
</script>`;
    html = html.replace('<head>', `<head>\n${keyboardForwardingScript}`);

    // Create preview object with srcdoc (same pattern as createPreviewWithSrcdoc)
    const preview: PreviewInfo = {
      url: 'about:srcdoc',
      ready: true,
      updatedAt: Date.now(),
      srcdoc: html,
    };

    this._preview = preview;

    logger.info('Vanilla preview created via srcdoc');
    this.emitPreviewReady(this._preview);
  }
}

/**
 * Factory function
 */
export function createBrowserBuildAdapter(): BrowserBuildAdapter {
  return new BrowserBuildAdapter();
}
