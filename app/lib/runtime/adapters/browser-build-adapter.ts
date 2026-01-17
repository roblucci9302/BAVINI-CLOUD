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
 * Cache des modules résolus
 */
const moduleCache = new Map<string, string>();

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
 * BrowserBuildAdapter - Runtime sans WebContainer
 */
export class BrowserBuildAdapter extends BaseRuntimeAdapter {
  readonly name = 'BrowserBuild';
  readonly supportsTerminal = false;
  readonly supportsShell = false;
  readonly supportsNodeServer = false;
  readonly isBrowserOnly = true;
  readonly supportedFrameworks = ['react', 'vue', 'svelte', 'vanilla', 'preact'];

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

    this._status = 'initializing';
    this.emitStatusChange('initializing');

    try {
      logger.info('Initializing esbuild-wasm...');

      await esbuild.initialize({
        wasmURL: ESBUILD_WASM_URL,
      });

      // Set both instance and global flags
      this._esbuildInitialized = true;
      globalEsbuildInitialized = true;
      (globalThis as any).__esbuildInitialized = true;

      this._status = 'ready';
      this.emitStatusChange('ready');

      logger.info('esbuild-wasm initialized successfully');
    } catch (error) {
      this._status = 'error';
      this.emitStatusChange('error');
      logger.error('Failed to initialize esbuild-wasm:', error);
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async destroy(): Promise<void> {
    logger.info('Destroying BrowserBuildAdapter...');

    // Revoke blob URL
    if (this._blobUrl) {
      URL.revokeObjectURL(this._blobUrl);
      this._blobUrl = null;
    }

    // Remove iframe
    if (this._previewIframe) {
      this._previewIframe.remove();
      this._previewIframe = null;
    }

    // Clear files
    this._files.clear();
    this._preview = null;
    this._status = 'idle';

    // Note: esbuild doesn't have a cleanup method in browser
  }

  /**
   * Write multiple files
   */
  async writeFiles(files: FileMap): Promise<void> {
    for (const [path, content] of files) {
      this._files.set(this.normalizePath(path), content);
    }

    logger.debug(`Wrote ${files.size} files`);
  }

  /**
   * Write a single file
   */
  async writeFile(path: string, content: string): Promise<void> {
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

      const entryContent = this._files.get(foundEntry)!;
      const entryDir = foundEntry.substring(0, foundEntry.lastIndexOf('/')) || '/';

      logger.debug(`Building entry: ${foundEntry} in dir: ${entryDir}`);
      logger.debug(`Available files:`, Array.from(this._files.keys()));

      this.emitBuildProgress('bundling', 20);

      // Build with esbuild
      const result = await esbuild.build({
        stdin: {
          contents: entryContent,
          loader: this.getLoader(foundEntry),
          resolveDir: entryDir,
          sourcefile: foundEntry,
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
        // esm-sh first to handle CDN paths before virtual-fs tries to load them as local files
        plugins: [this.createEsmShPlugin(), this.createVirtualFsPlugin()],
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
  private createVirtualFsPlugin(): esbuild.Plugin {
    return {
      name: 'virtual-fs',
      setup: (build) => {
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
   * Resolve relative path
   */
  private resolveRelativePath(importer: string, relativePath: string): string {
    const importerDir = importer.substring(0, importer.lastIndexOf('/')) || '/';
    const parts = [...importerDir.split('/'), ...relativePath.split('/')];
    const resolved: string[] = [];

    for (const part of parts) {
      if (part === '..') {
        resolved.pop();
      } else if (part !== '.' && part !== '') {
        resolved.push(part);
      }
    }

    return '/' + resolved.join('/');
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
   */
  private async createPreview(code: string, css: string, options: BuildOptions): Promise<void> {
    // Revoke previous blob URL
    if (this._blobUrl) {
      URL.revokeObjectURL(this._blobUrl);
    }

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
    this._blobUrl = URL.createObjectURL(blob);

    this._preview = {
      url: this._blobUrl,
      ready: true,
      updatedAt: Date.now(),
    };

    logger.info('Emitting preview ready event:', this._blobUrl);
    logger.debug('Callbacks registered:', Object.keys(this.callbacks));

    this.emitPreviewReady(this._preview);

    logger.info('Preview created and callback emitted:', this._blobUrl);
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

    // Add console capture
    const consoleCapture = `
<script>
(function() {
  const originalConsole = { ...console };
  ['log', 'warn', 'error', 'info', 'debug'].forEach(type => {
    console[type] = (...args) => {
      originalConsole[type](...args);
      window.parent.postMessage({
        type: 'console',
        payload: { type, args: args.map(a => typeof a === 'object' ? JSON.stringify(a) : String(a)), timestamp: Date.now() }
      }, '*');
    };
  });
  window.onerror = (msg, src, line, col, err) => {
    window.parent.postMessage({
      type: 'error',
      payload: { message: msg, filename: src, lineno: line, colno: col, stack: err?.stack }
    }, '*');
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
