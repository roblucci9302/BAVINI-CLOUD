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
// Phase 1.1: Import Build Worker Manager for off-thread compilation
import { BuildWorkerManager, getBuildWorkerManager } from '../build-worker-manager';
// Phase 1.3: Import Incremental Build System
import {
  IncrementalBuilder,
  getIncrementalBuilder,
  type ChangeAnalysis,
  type FileBuildDecision,
  type IncrementalBuildMetrics,
} from './browser-build/incremental';
// Phase 3 Refactoring: Import modular utilities
import {
  // Utils (Phase 3.1)
  LRUCache,
  moduleCache,
  yieldToEventLoop,
  normalizePath,
  generateHash,
  isPathSafe,
  // Preview (Phase 3.4)
  type PreviewMode,
  type PreviewModeConfig,
  setPreviewMode,
  getPreviewModeConfig,
  enableServiceWorkerPreference,
  disableServiceWorkerPreference,
  resetServiceWorkerFailures,
  setServiceWorkerReady,
  isServiceWorkerReady as isModularServiceWorkerReady,
  shouldAttemptServiceWorker,
  incrementSwFailures,
  generateDefaultHtml,
  generateBaseStyles,
  injectBundle as modularInjectBundle,
  injectBundleWithSSR as modularInjectBundleWithSSR,
  type SSRContent,
  type BundleInjectionOptions,
  // Preview Creator (Phase 1.2 - Use modular versions)
  type PreviewResult,
  type ServiceWorkerFunctions,
  createPreviewWithMode as modularCreatePreview,
  // Plugins (Phase 3.2)
  type PluginContext,
  createVirtualFsPlugin,
  createEsmShPlugin,
  // Bootstrap (Phase 3.3)
  type BootstrapContext,
  createBootstrapEntry,
  isMountingEntryFile,
  // Next.js Shims (Phase 1.2 Refactoring)
  NEXTJS_SHIMS,
  hasNextJsShim,
  getNextJsShim,
  // CSS Utilities (Phase 1.2 Refactoring)
  extractTailwindCustomColors,
  stripTailwindImports as stripTailwindImportsUtil,
  extractGoogleFontsCSS,
  findFileWithExtensions,
  // Vanilla Build (Phase 1.2 Refactoring)
  type VanillaBuildContext,
  type VanillaBuildCallbacks,
  buildVanillaProject as modularBuildVanillaProject,
  // Bundle Limits (Phase 1.2 Refactoring)
  checkBundleSizeLimits,
  logBundleSize,
} from './browser-build';

const logger = createScopedLogger('BrowserBuildAdapter');

// Note: yieldToEventLoop is now imported from './browser-build' (Phase 3.1)
// Note: PreviewMode, setPreviewMode, etc. are now imported from './browser-build' (Phase 3.4)

// Re-export preview functions for backwards compatibility
export type { PreviewMode };
export { setPreviewMode, getPreviewModeConfig, enableServiceWorkerPreference, disableServiceWorkerPreference, resetServiceWorkerFailures };

/**
 * URL du WASM esbuild
 */
const ESBUILD_WASM_URL = 'https://unpkg.com/esbuild-wasm@0.27.2/esbuild.wasm';

// Note: ESM_SH_CDN constant removed - now handled by modular esm-sh plugin (Phase 1.2)
// Note: BUNDLE_LIMITS constant removed - now handled by modular bundle-limits (Phase 1.2)
// Note: LRUCache and moduleCache are now imported from './browser-build' (Phase 3.1)
// Note: ESM_SH_BASE constant removed - now handled by modular esm-sh plugin (Phase 1.2)

/**
 * FIX 1.1: Import the thread-safe esbuild initialization lock
 * Replaces the old global flags that had race condition issues
 */
import { esbuildInitLock } from './esbuild-init-lock';

/**
 * @deprecated Use esbuildInitLock.isReady instead
 * Kept for backward compatibility checks
 */
let globalEsbuildInitialized: boolean = globalThis.__esbuildInitialized ?? false;

/**
 * @deprecated Use esbuildInitLock.initialize() instead
 * Kept for backward compatibility
 */
let globalEsbuildPromise: Promise<void> | null = globalThis.__esbuildPromise ?? null;

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

  /**
   * Phase 1.1: Build Worker Manager for off-thread compilation
   * When enabled, builds run in a Web Worker to prevent UI freezes
   */
  private _buildWorkerManager: BuildWorkerManager | null = null;
  private _useWorker = true; // Enable by default, falls back if not supported
  private _workerInitialized = false;

  /**
   * Phase 1.3: Incremental Builder for optimized rebuilds
   * Tracks dependencies and caches compiled bundles
   */
  private _incrementalBuilder: IncrementalBuilder = getIncrementalBuilder();
  private _lastChangeAnalysis: ChangeAnalysis | null = null;
  private _incrementalEnabled = true;

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
   * Phase 1.1: Check if worker build is available
   */
  get isWorkerBuildAvailable(): boolean {
    return this._workerInitialized && this._buildWorkerManager?.isReady() === true;
  }

  /**
   * Phase 1.1: Enable or disable worker builds
   * Useful for testing or when worker causes issues
   */
  setUseWorker(enabled: boolean): void {
    this._useWorker = enabled;
    if (!enabled && this._buildWorkerManager) {
      logger.info('Worker builds disabled, will use main thread');
    } else if (enabled && this._workerInitialized) {
      logger.info('Worker builds enabled');
    }
  }

  /**
   * Phase 1.3: Check if incremental builds are enabled
   */
  get isIncrementalEnabled(): boolean {
    return this._incrementalEnabled;
  }

  /**
   * Phase 1.3: Enable or disable incremental builds
   */
  setIncrementalEnabled(enabled: boolean): void {
    this._incrementalEnabled = enabled;
    logger.info(`Incremental builds ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Phase 1.3: Get incremental build metrics
   */
  getIncrementalMetrics(): IncrementalBuildMetrics {
    return this._incrementalBuilder.getMetrics();
  }

  /**
   * Phase 1.3: Get last change analysis for debugging
   */
  getLastChangeAnalysis(): ChangeAnalysis | null {
    return this._lastChangeAnalysis;
  }

  /**
   * Phase 1.3: Get combined incremental build statistics
   */
  getIncrementalStats(): ReturnType<IncrementalBuilder['getStats']> {
    return this._incrementalBuilder.getStats();
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

      // Phase 1.1: Build Worker disabled - main thread esbuild is sufficient and more stable
      // The worker was causing initialization errors and is redundant when main thread works
      // Keep the code path for future use but disable by default
      // this.initBuildWorker();
      this._useWorker = false;
      logger.debug('Build Worker disabled (main thread esbuild is sufficient)');

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
   * Phase 3.5: Uses modular preview config functions
   */
  private async initServiceWorker(): Promise<void> {
    try {
      logger.info('Initializing Preview Service Worker...');
      const success = await initPreviewServiceWorker();

      if (success) {
        setServiceWorkerReady(true);
        const config = getPreviewModeConfig();
        const willUseServiceWorker = config.mode === 'service-worker' ||
                                    (config.mode === 'auto' && config.autoPreferSW);
        logger.info(`Preview Service Worker initialized - swAvailable: true, useServiceWorker: ${willUseServiceWorker}`);
      } else {
        setServiceWorkerReady(false);
        logger.warn('Service Worker init failed - SW mode unavailable');
      }
    } catch (error) {
      setServiceWorkerReady(false);
      logger.warn('Service Worker initialization error:', error);
    }
  }

  /**
   * Phase 1.1: Initialize Build Worker for off-thread compilation
   * Non-blocking - falls back to main thread if worker not available
   */
  private async initBuildWorker(): Promise<void> {
    if (!this._useWorker) {
      logger.info('Build Worker disabled, using main thread');
      return;
    }

    if (!BuildWorkerManager.isSupported()) {
      logger.warn('Web Workers not supported, using main thread fallback');
      this._useWorker = false;
      return;
    }

    try {
      this._buildWorkerManager = getBuildWorkerManager();
      await this._buildWorkerManager.init();
      this._workerInitialized = true;
      logger.info('Build Worker initialized - builds will run off main thread');
    } catch (error) {
      logger.warn('Build Worker initialization failed, using main thread fallback:', error);
      this._useWorker = false;
      this._buildWorkerManager = null;
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

    // Phase 1.1: Dispose Build Worker
    if (this._buildWorkerManager) {
      try {
        await this._buildWorkerManager.dispose();
        this._buildWorkerManager = null;
        this._workerInitialized = false;
        logger.debug('Build Worker disposed');
      } catch (error) {
        logger.warn('Failed to dispose Build Worker:', error);
        errors.push(error instanceof Error ? error : new Error(String(error)));
      }
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

    // Phase 1.3: Reset incremental builder
    try {
      this._incrementalBuilder.reset();
      this._lastChangeAnalysis = null;
      logger.debug('Incremental builder reset');
    } catch (error) {
      logger.warn('Failed to reset incremental builder:', error);
      errors.push(error instanceof Error ? error : new Error(String(error)));
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
   * Phase 1.1: Build on main thread (fallback or when worker not available)
   * Extracted to allow worker build with fallback
   */
  private async buildOnMainThread(
    bootstrapEntry: string,
    entryDir: string,
    options: BuildOptions,
    jsxConfig: { jsx: 'transform' | 'automatic'; jsxImportSource?: string }
  ): Promise<esbuild.BuildResult> {
    return withTimeout(
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
        // Phase 1.2: Use modular plugins with centralized context
        plugins: [
          createVirtualFsPlugin(this.getPluginContext()),
          createEsmShPlugin(this.getPluginContext()),
        ],
        write: false,
        outdir: '/dist', // Required for outputFiles to be populated
        logLevel: 'warning',
      }),
      TIMEOUTS.BUILD_TOTAL,
      'esbuild bundle'
    );
  }

  /**
   * Build the project using esbuild-wasm
   * Phase 1.3: Now uses incremental build analysis for optimized rebuilds
   */
  async build(options: BuildOptions): Promise<BundleResult> {
    const startTime = performance.now();

    this._status = 'building';
    this.emitStatusChange('building');
    this.emitBuildProgress('starting', 0);

    // Phase 1.3: Analyze changes for incremental build
    let changeAnalysis: ChangeAnalysis | null = null;
    if (this._incrementalEnabled) {
      changeAnalysis = this._incrementalBuilder.analyzeChanges(this._files);
      this._lastChangeAnalysis = changeAnalysis;
      logger.info(
        `Change analysis: ${changeAnalysis.added.length} added, ${changeAnalysis.modified.length} modified, ` +
        `${changeAnalysis.deleted.length} deleted, ${changeAnalysis.affected.length} affected`
      );
    }

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

      // Phase 1.1: Try worker build first, fall back to main thread
      let result: esbuild.BuildResult;

      if (this._workerInitialized && this._buildWorkerManager?.isReady()) {
        try {
          logger.debug('Using Build Worker for off-thread compilation');
          const workerResult = await this._buildWorkerManager.build(
            this._files,
            bootstrapEntry,
            entryDir,
            options,
            jsxConfig
          );

          // Worker build succeeded - convert result to esbuild format
          // Note: Worker doesn't handle CSS aggregation, so we'll do it after
          result = {
            outputFiles: [
              { path: '/dist/stdin.js', text: workerResult.code, contents: new Uint8Array(), hash: '' },
              ...(workerResult.css ? [{ path: '/dist/stdin.css', text: workerResult.css, contents: new Uint8Array(), hash: '' }] : []),
            ],
            errors: workerResult.errors.map((e) => ({
              text: e.message,
              location: e.file
                ? {
                    file: e.file,
                    line: e.line ?? 0,
                    column: e.column ?? 0,
                    lineText: e.snippet ?? '',
                    length: 0,
                    namespace: '',
                    suggestion: '',
                  }
                : null,
              notes: [],
              id: '',
              pluginName: '',
              detail: undefined,
            })),
            warnings: workerResult.warnings.map((w) => ({
              text: w.message,
              location: w.file
                ? {
                    file: w.file,
                    line: w.line ?? 0,
                    column: w.column ?? 0,
                    lineText: '',
                    length: 0,
                    namespace: '',
                    suggestion: '',
                  }
                : null,
              notes: [],
              id: '',
              pluginName: '',
              detail: undefined,
            })),
            metafile: undefined,
            mangleCache: undefined,
          };

          logger.info(`Worker build completed in ${workerResult.buildTime.toFixed(0)}ms`);
        } catch (workerError) {
          logger.warn('Worker build failed, falling back to main thread:', workerError);
          // Fall through to main thread build
          result = await this.buildOnMainThread(bootstrapEntry, entryDir, options, jsxConfig);
        }
      } else {
        // Build with esbuild on main thread
        // FIX 2.1: Added timeout to prevent infinite hangs
        result = await this.buildOnMainThread(bootstrapEntry, entryDir, options, jsxConfig);
      }

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
        const googleFontsCss = extractGoogleFontsCSS(this._files, logger);
        if (googleFontsCss) {
          css = googleFontsCss + '\n\n' + css;
          logger.info('Injected Google Fonts CSS for Next.js project');
        }
      }

      // Remove @import statements for tailwindcss/* - these are handled by CDN
      css = stripTailwindImportsUtil(css, logger);

      logger.info(`CSS Aggregation: ${this._cssAggregator.size} sources, ${aggregatedCss.length} chars`);

      // Phase 1.2: Use modular bundle limits checking
      const bundleCheck = checkBundleSizeLimits(code, css);
      logBundleSize(bundleCheck.jsKB, bundleCheck.cssKB, bundleCheck.totalKB);

      // Convert esbuild errors/warnings and merge with bundle size checks
      const errors: BuildError[] = [
        ...bundleCheck.errors,
        ...result.errors.map((e) => ({
          message: e.text,
          file: e.location?.file,
          line: e.location?.line,
          column: e.location?.column,
          snippet: e.location?.lineText,
        })),
      ];

      // Merge bundle warnings with esbuild warnings
      const warnings: BuildWarning[] = [
        ...bundleCheck.warnings,
        ...result.warnings.map((w) => ({
          message: w.text,
          file: w.location?.file,
          line: w.location?.line,
          column: w.location?.column,
        })),
      ];

      // Generate hash
      const hash = generateHash(code);

      this.emitBuildProgress('generating preview', 90);

      // Create preview
      logger.debug(`Build result: code=${code.length} chars, errors=${errors.length}`);

      if (code && errors.length === 0) {
        logger.debug('Creating preview...');
        await this.createPreview(code, css, options);
        logger.debug('Preview created');
      } else {
        logger.warn(`Skipping preview: code empty=${!code}, errors=${errors.length}`);
      }

      this.emitBuildProgress('complete', 100);

      this._status = 'ready';
      this.emitStatusChange('ready');

      // Phase 1.3: Cache the successful build and update metrics
      if (this._incrementalEnabled && code) {
        const wasFullRebuild = changeAnalysis?.requiresFullRebuild ?? true;
        const cachedCount = changeAnalysis?.skippable.length ?? 0;
        const rebuiltCount = this._files.size - cachedCount;

        // Cache the bundle for the entry point
        this._incrementalBuilder.cacheBundle(
          options.entryPoint,
          this._files.get(this.normalizePath(options.entryPoint)) || '',
          code,
          { css, imports: [], npmDependencies: [] }
        );

        // Complete the build with metrics
        this._incrementalBuilder.completeBuild(rebuiltCount, cachedCount, wasFullRebuild);

        const metrics = this._incrementalBuilder.getMetrics();
        logger.debug(
          `Incremental: ${metrics.rebuiltFiles} rebuilt, ${metrics.cachedFiles} cached ` +
          `(${metrics.cacheHitRate.toFixed(1)}% hit rate)`
        );
      }

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
   * Create plugin context for modular esbuild plugins
   * Phase 1.2: Centralizes dependencies needed by virtual-fs and esm-sh plugins
   */
  private getPluginContext(): PluginContext {
    // Phase 1.3: Track collected dependencies during build
    const collectedImports: string[] = [];
    const collectedNpmDeps: string[] = [];

    return {
      files: this._files,
      cssAggregator: this._cssAggregator,
      findFile: (path: string) => this.findFile(path),
      resolveRelativePath: (base: string, relative: string) => this.resolveRelativePath(base, relative),
      getLoader: (path: string) => this.getLoader(path),
      nextjsShims: NEXTJS_SHIMS,
      moduleCache: moduleCache,
      logger: {
        debug: (...args: unknown[]) => logger.debug(...args),
        info: (...args: unknown[]) => logger.info(...args),
        warn: (...args: unknown[]) => logger.warn(...args),
        error: (...args: unknown[]) => logger.error(...args),
      },
      // Phase 1.3: Callback to track dependencies during resolution
      onDependencyResolved: this._incrementalEnabled
        ? (importer: string, resolved: string, isNpm: boolean) => {
            if (isNpm) {
              if (!collectedNpmDeps.includes(resolved)) {
                collectedNpmDeps.push(resolved);
              }
            } else {
              if (!collectedImports.includes(resolved)) {
                collectedImports.push(resolved);
              }
            }
            // Update dependency graph in real-time
            const content = this._files.get(importer) || '';
            if (content) {
              this._incrementalBuilder.updateDependencyGraph(
                importer,
                content,
                collectedImports,
                collectedNpmDeps
              );
            }
          }
        : undefined,
    };
  }

  // Note: createVirtualFsPlugin is now imported from './browser-build' and used via getPluginContext()
  // Phase 1.2: Removed local implementation (~375 lines) in favor of modular plugin

  /**
   * Extract custom colors from tailwind.config.js/ts for Tailwind CDN @theme
   * Phase 1.2: Delegates to extracted utility function
   */
  private extractTailwindCustomColors(): string {
    return extractTailwindCustomColors(this._files, logger);
  }

  /**
   * Strip Tailwind CSS @import statements from CSS content
   * Phase 1.2: Delegates to extracted utility function
   */
  private stripTailwindImports(css: string): string {
    return stripTailwindImportsUtil(css, logger);
  }

  /**
   * Find a file in the virtual filesystem, trying various extensions
   * Phase 1.2: Delegates to extracted utility function
   */
  private findFile(path: string): string | null {
    return findFileWithExtensions(path, this._files);
  }

  // Note: createEsmShPlugin is now imported from './browser-build' and used via getPluginContext()
  // Phase 1.2: Removed local implementation (~115 lines) in favor of modular plugin

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
   *
   * Phase 3.5: Now uses modular bootstrap module
   */
  private createBootstrapEntry(entryPath: string): string {
    // Create BootstrapContext for the modular function
    const context: BootstrapContext = {
      files: this._files,
      framework: this._detectedFramework,
      findFile: (path: string) => this.findFile(path),
      isMountingEntry: (content: string) => isMountingEntryFile(content, this._detectedFramework),
      detectRoutes: (filesList: string[], files: Map<string, string>) => detectRoutesFromFiles(filesList, files),
      logger: {
        debug: (...args: unknown[]) => logger.debug(...args),
        info: (...args: unknown[]) => logger.info(...args),
        warn: (...args: unknown[]) => logger.warn(...args),
        error: (...args: unknown[]) => logger.error(...args),
      },
    };

    // Use modular bootstrap entry creation
    return createBootstrapEntry(entryPath, this._detectedFramework, context);
  }

  // Note: isMountingEntryFile and generateHash are now imported from './browser-build' (Phase 3.3 & 3.1)
  // Note: extractGoogleFontsCSS is now imported from './browser-build' (Phase 1.2)

  /**
   * Create preview using Service Worker (preferred) or srcdoc (fallback)
   * Phase 1.2: Uses modular preview creator with adapter-specific state management
   */
  private async createPreview(code: string, css: string, options: BuildOptions): Promise<void> {
    try {
      // Find HTML template
      let htmlTemplate = this._files.get('/index.html') || this._files.get('/public/index.html');
      const templateSource = htmlTemplate ? 'project' : 'generated';

      if (!htmlTemplate) {
        htmlTemplate = generateDefaultHtml();
      }

      logger.debug(`Using ${templateSource} HTML template`);

      // Try SSR if enabled and available
      let ssrContent: SSRContent | null = null;
      if (this._ssrEnabled && this._ssrBridge) {
        ssrContent = await this.trySSRRender(options);
      }

      // Inject bundle into HTML (with SSR content if available)
      const html = this.injectBundleWithSSR(htmlTemplate, code, css, ssrContent);

      // Phase 1.2: Use modular preview creator with SW functions
      const swFunctions: ServiceWorkerFunctions = {
        setPreviewFiles,
        getPreviewUrl,
      };

      // Helper to revoke old blob URL
      const revokeOldBlobUrl = () => {
        if (this._blobUrl) {
          URL.revokeObjectURL(this._blobUrl);
          this._blobUrl = null;
        }
      };

      // Use modular preview creator
      const result = await modularCreatePreview(html, swFunctions, revokeOldBlobUrl);

      // Update adapter state and emit event
      if (result.mode === 'service-worker') {
        resetServiceWorkerFailures();
      }

      this._preview = result.preview;
      this.emitPreviewReady(this._preview);
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
   * Phase 1.2: Delegates to modular bundle-injector
   */
  private injectBundleWithSSR(
    html: string,
    code: string,
    css: string,
    ssrContent: SSRContent | null,
  ): string {
    // Get bundle injection options
    const customTheme = this.extractTailwindCustomColors();
    const hasCustomColors = customTheme.length > 0;
    const hmrClientScript = this._hmrManager.getHMRClientScript();

    const options: BundleInjectionOptions = {
      framework: this._detectedFramework,
      customTheme,
      hasCustomColors,
      hmrClientScript,
      alwaysInjectTailwind: true,
    };

    // Use modular bundle injector with SSR support
    return modularInjectBundleWithSSR(html, code, css, ssrContent, options);
  }

  // Note: Preview methods (createPreviewWithServiceWorker, verifyServiceWorkerServing, createPreviewWithSrcdoc)
  // are now imported from './browser-build' (Phase 1.2) and used via modularCreatePreview

  /**
   * Build a vanilla HTML/CSS/JS project without esbuild bundling.
   * Phase 1.2: Delegates to modular vanilla-build module
   */
  private async buildVanillaProject(
    htmlPath: string,
    options: BuildOptions,
    startTime: number
  ): Promise<BundleResult> {
    // Create vanilla build context
    const context: VanillaBuildContext = {
      files: this._files,
      extractTailwindCustomColors: () => this.extractTailwindCustomColors(),
      revokeOldBlobUrl: () => {
        if (this._blobUrl) {
          URL.revokeObjectURL(this._blobUrl);
          this._blobUrl = null;
        }
      },
    };

    // Create callbacks for adapter integration
    const callbacks: VanillaBuildCallbacks = {
      onProgress: (phase, progress) => this.emitBuildProgress(phase, progress),
      onPreviewReady: (preview) => {
        this._preview = preview;
        this.emitPreviewReady(preview);
      },
    };

    // Use modular vanilla build
    const result = await modularBuildVanillaProject(htmlPath, context, callbacks, startTime);

    // Update status
    this._status = 'ready';
    this.emitStatusChange('ready');

    return result;
  }
}

/**
 * Factory function
 */
export function createBrowserBuildAdapter(): BrowserBuildAdapter {
  return new BrowserBuildAdapter();
}
