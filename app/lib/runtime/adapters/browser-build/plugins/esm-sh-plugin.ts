/**
 * =============================================================================
 * BAVINI CLOUD - ESM.sh Plugin (Optimized)
 * =============================================================================
 * esbuild plugin for resolving npm packages via esm.sh CDN.
 *
 * Phase 0 Optimizations:
 * - Pending fetches deduplication (avoid duplicate concurrent requests)
 * - Cache warming for common packages
 * - Batch prefetch with Promise.all()
 *
 * This plugin handles:
 * - Bare imports (e.g., 'react', 'lodash')
 * - CDN-relative paths (e.g., /react@19.2.3/es2022/react.mjs)
 * - Relative imports within CDN modules
 * - Caching of fetched modules
 * =============================================================================
 */

import type * as esbuild from 'esbuild-wasm';
import type { PluginContext } from './types';

/**
 * Module cache interface - compatible with both Map and LRUCache
 */
export interface ModuleCache {
  has(key: string): boolean;
  get(key: string): string | undefined;
  set(key: string, value: string): void;
}

/**
 * CDN URLs
 */
const ESM_SH_CDN = 'https://esm.sh';
const ESM_SH_BASE = 'https://esm.sh';

/**
 * Common packages to prefetch for cache warming
 * These are the most frequently used packages in web development
 */
const COMMON_PACKAGES = [
  'react',
  'react-dom',
  'react-dom/client',
  'react/jsx-runtime',
  'react/jsx-dev-runtime',
] as const;

/**
 * Extended common packages for full cache warming
 */
const EXTENDED_COMMON_PACKAGES = [
  ...COMMON_PACKAGES,
  'lucide-react',
  'clsx',
  'tailwind-merge',
  'framer-motion',
  'zustand',
  'nanostores',
  '@nanostores/react',
] as const;

/**
 * Pending fetches map to avoid duplicate concurrent requests
 * Key: URL, Value: Promise of the fetch result
 */
const pendingFetches = new Map<string, Promise<string>>();

/**
 * CDN fetch statistics (module-level for persistence)
 */
let cdnFetchCount = 0;
let cdnCacheHits = 0;
let cdnPendingHits = 0;

/**
 * Rewrite relative imports in esm.sh responses to absolute URLs
 *
 * @param code - JavaScript code from esm.sh
 * @param baseUrl - Base URL for resolution
 * @returns Code with rewritten imports
 */
function rewriteEsmImports(code: string, baseUrl: string): string {
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
 * Fetch a single URL with deduplication
 * If a fetch for this URL is already in progress, return the pending promise
 *
 * @param url - URL to fetch
 * @param moduleCache - Cache to store results
 * @param logger - Logger instance
 * @returns Promise of the module contents
 */
async function fetchWithDeduplication(
  url: string,
  moduleCache: ModuleCache,
  logger: { debug: (msg: string, ...args: unknown[]) => void; error: (msg: string, ...args: unknown[]) => void },
): Promise<string> {
  // Check cache first
  if (moduleCache.has(url)) {
    cdnCacheHits++;
    logger.debug(`CDN cache hit [${cdnCacheHits}]: ${url}`);
    return moduleCache.get(url)!;
  }

  // Check if fetch is already in progress
  if (pendingFetches.has(url)) {
    cdnPendingHits++;
    logger.debug(`CDN pending hit [${cdnPendingHits}]: ${url}`);
    return pendingFetches.get(url)!;
  }

  // Start new fetch
  cdnFetchCount++;
  logger.debug(`Fetching CDN [${cdnFetchCount}]: ${url}`);

  const fetchPromise = (async () => {
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

    // Rewrite relative imports to absolute URLs
    contents = rewriteEsmImports(contents, response.url);

    // Cache the result
    moduleCache.set(url, contents);

    // Also cache by final URL if redirected
    if (response.url !== url) {
      moduleCache.set(response.url, contents);
    }

    return contents;
  })();

  // Track pending fetch
  pendingFetches.set(url, fetchPromise);

  try {
    const result = await fetchPromise;
    return result;
  } finally {
    // Clean up pending fetch
    pendingFetches.delete(url);
  }
}

/**
 * Prefetch multiple packages in parallel (cache warming)
 *
 * @param packages - Array of package names to prefetch
 * @param moduleCache - Cache to store results
 * @param logger - Logger instance
 * @returns Promise that resolves when all prefetches complete
 */
export async function prefetchPackages(
  packages: readonly string[],
  moduleCache: ModuleCache,
  logger: { debug: (msg: string, ...args: unknown[]) => void; error: (msg: string, ...args: unknown[]) => void },
): Promise<void> {
  const urls = packages.map((pkg) => `${ESM_SH_CDN}/${pkg}`);

  logger.debug(`Prefetching ${urls.length} packages in parallel...`);
  const startTime = Date.now();

  // Fetch all in parallel with Promise.allSettled to not fail on individual errors
  const results = await Promise.allSettled(
    urls.map((url) => fetchWithDeduplication(url, moduleCache, logger)),
  );

  const elapsed = Date.now() - startTime;
  const succeeded = results.filter((r) => r.status === 'fulfilled').length;
  const failed = results.filter((r) => r.status === 'rejected').length;

  logger.debug(`Prefetch complete: ${succeeded} succeeded, ${failed} failed in ${elapsed}ms`);
}

/**
 * Warm up cache with common packages
 *
 * @param moduleCache - Cache to store results
 * @param logger - Logger instance
 * @param extended - Whether to prefetch extended package list
 */
export async function warmupCache(
  moduleCache: ModuleCache,
  logger: { debug: (msg: string, ...args: unknown[]) => void; error: (msg: string, ...args: unknown[]) => void },
  extended = false,
): Promise<void> {
  const packages = extended ? EXTENDED_COMMON_PACKAGES : COMMON_PACKAGES;
  await prefetchPackages(packages, moduleCache, logger);
}

/**
 * Create the esm.sh plugin for npm package resolution
 *
 * @param context - Plugin context with dependencies
 * @returns esbuild plugin
 */
export function createEsmShPlugin(context: PluginContext): esbuild.Plugin {
  const { moduleCache, logger } = context;

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

      // Load from esm.sh with deduplication
      build.onLoad({ filter: /.*/, namespace: 'esm-sh' }, async (args) => {
        let url = args.path;

        // Ensure it's a full URL
        if (!url.startsWith('http')) {
          url = `${ESM_SH_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
        }

        try {
          const contents = await fetchWithDeduplication(url, moduleCache, logger);
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
 * Get CDN statistics (for debugging and metrics)
 */
export function getCdnStats(): {
  fetchCount: number;
  cacheHits: number;
  pendingHits: number;
  pendingCount: number;
} {
  return {
    fetchCount: cdnFetchCount,
    cacheHits: cdnCacheHits,
    pendingHits: cdnPendingHits,
    pendingCount: pendingFetches.size,
  };
}

/**
 * Reset CDN statistics (for testing)
 */
export function resetCdnStats(): void {
  cdnFetchCount = 0;
  cdnCacheHits = 0;
  cdnPendingHits = 0;
}
