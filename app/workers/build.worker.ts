/**
 * =============================================================================
 * BAVINI CLOUD - Build Worker
 * =============================================================================
 * Web Worker for esbuild compilation.
 * Moves heavy build operations off the main thread to prevent UI freezes.
 *
 * Phase 1.1 Implementation
 * =============================================================================
 */

import * as esbuild from 'esbuild-wasm';

// =============================================================================
// Global Error Handlers (to capture unhandled errors with details)
// =============================================================================

self.onerror = (message, filename, lineno, colno, error) => {
  console.error('[BuildWorker] Uncaught error:', { message, filename, lineno, colno, error: error?.message || error });
  self.postMessage({
    type: 'error',
    error: `Worker error: ${error?.message || message || 'Unknown error'}`,
  });
  return true; // Prevent default handling
};

self.onunhandledrejection = (event) => {
  const reason = event.reason;
  const errorMessage = reason instanceof Error ? reason.message : String(reason);
  console.error('[BuildWorker] Unhandled rejection:', errorMessage);
  self.postMessage({
    type: 'error',
    error: `Unhandled promise rejection: ${errorMessage}`,
  });
};

// =============================================================================
// Types
// =============================================================================

export interface BuildWorkerRequest {
  id: string;
  type: 'init' | 'build' | 'dispose';
  payload?: BuildPayload;
}

export interface BuildPayload {
  /** Virtual files map (path -> content) */
  files: Record<string, string>;
  /** Bootstrap entry code */
  bootstrapEntry: string;
  /** Entry directory for resolution */
  entryDir: string;
  /** Build options */
  options: {
    minify: boolean;
    sourcemap: boolean;
    mode: 'development' | 'production';
    define?: Record<string, string>;
  };
  /** JSX configuration */
  jsxConfig: {
    jsx: 'transform' | 'automatic';
    jsxImportSource?: string;
  };
}

export interface BuildWorkerResponse {
  id: string;
  type: 'init_done' | 'build_result' | 'build_error' | 'error';
  result?: {
    code: string;
    css: string;
    errors: BuildErrorInfo[];
    warnings: BuildWarningInfo[];
    buildTime: number;
  };
  error?: string;
}

export interface BuildErrorInfo {
  message: string;
  file?: string;
  line?: number;
  column?: number;
  snippet?: string;
}

export interface BuildWarningInfo {
  message: string;
  file?: string;
  line?: number;
  column?: number;
}

// =============================================================================
// State
// =============================================================================

let initialized = false;
let initPromise: Promise<void> | null = null;

// ESM.sh CDN for npm packages
const ESM_SH_CDN = 'https://esm.sh';

// Module cache for CDN fetches
const moduleCache = new Map<string, string>();

// Pending fetches to avoid duplicate requests
const pendingFetches = new Map<string, Promise<string>>();

// =============================================================================
// esbuild Initialization
// =============================================================================

async function initEsbuild(): Promise<void> {
  if (initialized) return;
  if (initPromise) return initPromise;

  initPromise = (async () => {
    try {
      // Check if already initialized globally (for HMR scenarios)
      if ((globalThis as Record<string, unknown>).__esbuildInitialized) {
        console.log('[BuildWorker] esbuild already initialized globally');
        initialized = true;
        return;
      }

      console.log('[BuildWorker] Initializing esbuild-wasm...');
      await esbuild.initialize({
        wasmURL: 'https://unpkg.com/esbuild-wasm@0.24.2/esbuild.wasm',
        worker: false, // We're already in a worker
      });

      console.log('[BuildWorker] esbuild-wasm initialized successfully');
      (globalThis as Record<string, unknown>).__esbuildInitialized = true;
      initialized = true;
    } catch (error) {
      // Handle "already initialized" error gracefully
      if (error instanceof Error && error.message.includes('already')) {
        console.log('[BuildWorker] esbuild was already initialized');
        initialized = true;
        (globalThis as Record<string, unknown>).__esbuildInitialized = true;
      } else {
        console.error('[BuildWorker] Failed to initialize esbuild:', error);
        throw error;
      }
    }
  })();

  return initPromise;
}

// =============================================================================
// CDN Fetch with Deduplication
// =============================================================================

async function fetchWithDedup(url: string): Promise<string> {
  // Check cache first
  const cached = moduleCache.get(url);
  if (cached) return cached;

  // Check if fetch is already in progress
  const pending = pendingFetches.get(url);
  if (pending) return pending;

  // Start new fetch
  const fetchPromise = (async () => {
    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${url}: ${response.status}`);
      }
      const content = await response.text();

      // Cache the result
      moduleCache.set(url, content);

      return content;
    } finally {
      pendingFetches.delete(url);
    }
  })();

  pendingFetches.set(url, fetchPromise);
  return fetchPromise;
}

/**
 * Rewrite relative imports in esm.sh responses to absolute URLs
 */
function rewriteEsmImports(code: string, baseUrl: string): string {
  const importRegex = /from\s+["'](\/(\.\.\/)*[^"']+)["']/g;
  return code.replace(importRegex, (match, path) => {
    const absoluteUrl = new URL(path, baseUrl).href;
    return `from "${absoluteUrl}"`;
  });
}

// =============================================================================
// Path Utilities
// =============================================================================

function normalizePath(path: string): string {
  // Ensure path starts with /
  if (!path.startsWith('/')) {
    path = '/' + path;
  }

  // Resolve .. and . in path
  const parts = path.split('/');
  const result: string[] = [];

  for (const part of parts) {
    if (part === '..') {
      result.pop();
    } else if (part !== '.' && part !== '') {
      result.push(part);
    }
  }

  return '/' + result.join('/');
}

function resolveRelativePath(from: string, to: string): string {
  if (to.startsWith('/')) return normalizePath(to);

  const fromDir = from.substring(0, from.lastIndexOf('/')) || '/';
  return normalizePath(fromDir + '/' + to);
}

function getLoader(path: string): esbuild.Loader {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const loaders: Record<string, esbuild.Loader> = {
    ts: 'ts',
    tsx: 'tsx',
    js: 'js',
    jsx: 'jsx',
    mjs: 'js',
    cjs: 'js',
    css: 'css',
    json: 'json',
    svg: 'text',
    png: 'dataurl',
    jpg: 'dataurl',
    jpeg: 'dataurl',
    gif: 'dataurl',
    webp: 'dataurl',
  };
  return loaders[ext] || 'text';
}

// =============================================================================
// esbuild Plugins
// =============================================================================

function createVirtualFsPlugin(files: Record<string, string>): esbuild.Plugin {
  return {
    name: 'virtual-fs-worker',
    setup(build) {
      // Handle path alias @/ -> /src/
      build.onResolve({ filter: /^@\// }, (args) => {
        const resolved = normalizePath('/src/' + args.path.slice(2));
        return { path: resolved, namespace: 'virtual' };
      });

      // Handle relative imports
      build.onResolve({ filter: /^\./ }, (args) => {
        const resolved = resolveRelativePath(args.importer || args.resolveDir, args.path);

        // Try exact match first
        if (files[resolved]) {
          return { path: resolved, namespace: 'virtual' };
        }

        // Try with extensions
        const extensions = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'];
        for (const ext of extensions) {
          if (files[resolved + ext]) {
            return { path: resolved + ext, namespace: 'virtual' };
          }
        }

        // Try index files
        for (const ext of extensions) {
          const indexPath = resolved + '/index' + ext;
          if (files[indexPath]) {
            return { path: indexPath, namespace: 'virtual' };
          }
        }

        // Not found in virtual FS, let it fall through
        return null;
      });

      // Handle absolute paths from virtual namespace
      build.onResolve({ filter: /^\//, namespace: 'virtual' }, (args) => {
        const resolved = normalizePath(args.path);

        if (files[resolved]) {
          return { path: resolved, namespace: 'virtual' };
        }

        // Try with extensions
        const extensions = ['.tsx', '.ts', '.jsx', '.js', '.mjs', '.json'];
        for (const ext of extensions) {
          if (files[resolved + ext]) {
            return { path: resolved + ext, namespace: 'virtual' };
          }
        }

        return null;
      });

      // Load virtual files
      build.onLoad({ filter: /.*/, namespace: 'virtual' }, (args) => {
        const content = files[args.path];
        if (content !== undefined) {
          return {
            contents: content,
            loader: getLoader(args.path),
          };
        }
        return null;
      });
    },
  };
}

function createEsmShPlugin(): esbuild.Plugin {
  return {
    name: 'esm-sh-worker',
    setup(build) {
      // Handle bare imports (npm packages)
      build.onResolve({ filter: /^[^./]/ }, (args) => {
        // Skip if already in esm-sh namespace
        if (args.namespace === 'esm-sh') return null;
        // Skip if it's a virtual file
        if (args.namespace === 'virtual') return null;

        // Construct CDN URL
        const url = `${ESM_SH_CDN}/${args.path}`;
        return { path: url, namespace: 'esm-sh' };
      });

      // Handle CDN-relative paths
      build.onResolve({ filter: /.*/, namespace: 'esm-sh' }, (args) => {
        if (args.path.startsWith('http')) {
          return { path: args.path, namespace: 'esm-sh' };
        }

        // Resolve relative to CDN
        if (args.path.startsWith('/') || args.path.startsWith('.')) {
          const resolvedUrl = new URL(args.path, args.importer).href;
          return { path: resolvedUrl, namespace: 'esm-sh' };
        }

        // Bare import within esm-sh
        const url = `${ESM_SH_CDN}/${args.path}`;
        return { path: url, namespace: 'esm-sh' };
      });

      // Load from CDN
      build.onLoad({ filter: /.*/, namespace: 'esm-sh' }, async (args) => {
        try {
          const code = await fetchWithDedup(args.path);
          const rewrittenCode = rewriteEsmImports(code, args.path);

          return {
            contents: rewrittenCode,
            loader: 'js',
          };
        } catch (error) {
          return {
            errors: [
              {
                text: `Failed to fetch ${args.path}: ${error instanceof Error ? error.message : 'Unknown error'}`,
              },
            ],
          };
        }
      });
    },
  };
}

// =============================================================================
// Build Execution
// =============================================================================

async function executeBuild(payload: BuildPayload): Promise<BuildWorkerResponse['result']> {
  const startTime = performance.now();

  const result = await esbuild.build({
    stdin: {
      contents: payload.bootstrapEntry,
      loader: 'tsx',
      resolveDir: payload.entryDir,
      sourcefile: '/__bootstrap__.tsx',
    },
    bundle: true,
    format: 'esm',
    target: 'es2020',
    minify: payload.options.minify,
    sourcemap: payload.options.sourcemap ? 'inline' : false,
    define: {
      'process.env.NODE_ENV': `"${payload.options.mode}"`,
      ...payload.options.define,
    },
    jsx: payload.jsxConfig.jsx,
    jsxImportSource: payload.jsxConfig.jsxImportSource,
    plugins: [createVirtualFsPlugin(payload.files), createEsmShPlugin()],
    write: false,
    outdir: '/dist',
    logLevel: 'warning',
  });

  // Extract outputs
  const jsOutput = result.outputFiles?.find((f) => f.path.endsWith('.js') || f.path.includes('stdin'));
  const cssOutput = result.outputFiles?.find((f) => f.path.endsWith('.css'));

  const code = jsOutput?.text || '';
  const css = cssOutput?.text || '';

  // Convert errors and warnings
  const errors: BuildErrorInfo[] = result.errors.map((e) => ({
    message: e.text,
    file: e.location?.file,
    line: e.location?.line,
    column: e.location?.column,
    snippet: e.location?.lineText,
  }));

  const warnings: BuildWarningInfo[] = result.warnings.map((w) => ({
    message: w.text,
    file: w.location?.file,
    line: w.location?.line,
    column: w.location?.column,
  }));

  return {
    code,
    css,
    errors,
    warnings,
    buildTime: performance.now() - startTime,
  };
}

// =============================================================================
// Message Handler
// =============================================================================

function sendResponse(response: BuildWorkerResponse): void {
  self.postMessage(response);
}

self.onmessage = async (event: MessageEvent<BuildWorkerRequest>) => {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'init': {
        await initEsbuild();
        sendResponse({ id, type: 'init_done' });
        break;
      }

      case 'build': {
        if (!initialized) {
          await initEsbuild();
        }

        if (!payload) {
          sendResponse({ id, type: 'error', error: 'Build payload is required' });
          return;
        }

        const result = await executeBuild(payload);
        sendResponse({ id, type: 'build_result', result });
        break;
      }

      case 'dispose': {
        // Clear caches
        moduleCache.clear();
        pendingFetches.clear();
        sendResponse({ id, type: 'init_done' });
        break;
      }

      default:
        sendResponse({ id, type: 'error', error: `Unknown message type: ${type}` });
    }
  } catch (error) {
    sendResponse({
      id,
      type: 'build_error',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
};

// Signal worker is ready
self.postMessage({ type: 'ready' });
