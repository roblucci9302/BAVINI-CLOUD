/**
 * =============================================================================
 * BAVINI CLOUD - ESM.sh Plugin
 * =============================================================================
 * esbuild plugin for resolving npm packages via esm.sh CDN.
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
 * CDN URLs
 */
const ESM_SH_CDN = 'https://esm.sh';
const ESM_SH_BASE = 'https://esm.sh';

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
          logger.debug(`CDN cache hit [${cdnCacheHits}]: ${url}`);
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
          contents = rewriteEsmImports(contents, response.url);

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
 * Get CDN statistics (for debugging)
 */
export function getCdnStats(): { fetchCount: number; cacheHits: number } {
  // Note: These would need to be tracked at module level for real stats
  return { fetchCount: 0, cacheHits: 0 };
}
