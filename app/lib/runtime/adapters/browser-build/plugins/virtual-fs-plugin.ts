/**
 * =============================================================================
 * BAVINI CLOUD - Virtual FS Plugin
 * =============================================================================
 * esbuild plugin for resolving files from a virtual filesystem (Map).
 *
 * This plugin handles:
 * - Next.js shims (next/image, next/link, etc.)
 * - Tailwind CSS imports
 * - Path aliases (@/)
 * - Relative imports
 * - Framework compilation (Vue, Svelte, Astro)
 * - CSS aggregation
 * =============================================================================
 */

import type * as esbuild from 'esbuild-wasm';
import type { PluginContext, ContentFile } from './types';
import {
  loadCompiler,
  hasCompilerFor,
  type CSSMetadata,
} from '../../compilers/compiler-registry';
import type { TailwindCompiler } from '../../compilers/tailwind-compiler';
import type { CSSType } from '../../css-aggregator';

/**
 * Create the virtual filesystem plugin
 *
 * @param context - Plugin context with dependencies
 * @returns esbuild plugin
 */
export function createVirtualFsPlugin(context: PluginContext): esbuild.Plugin {
  const {
    files,
    cssAggregator,
    findFile,
    resolveRelativePath,
    getLoader,
    nextjsShims,
    logger,
  } = context;

  return {
    name: 'virtual-fs',
    setup: (build) => {
      // =========================================================================
      // Next.js Shims
      // =========================================================================

      // Handle Next.js-specific imports with browser shims
      // This MUST come before esm-sh plugin tries to fetch from CDN
      build.onResolve({ filter: /^next(\/|$)/ }, (args) => {
        // Skip if coming from esm-sh namespace
        if (args.namespace === 'esm-sh') {
          return null;
        }

        // Check if we have a shim for this import
        const shimKey = args.path;
        if (nextjsShims[shimKey]) {
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
        const shimCode = nextjsShims[args.path];

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
          loader: 'js',
        };
      });

      // =========================================================================
      // Tailwind CSS Shims
      // =========================================================================

      // Handle tailwindcss imports - Tailwind CDN is injected separately
      build.onResolve({ filter: /^tailwindcss(\/|$)/ }, (args) => {
        logger.debug(`Intercepting Tailwind import: ${args.path} (handled by CDN)`);
        return { path: args.path, namespace: 'tailwind-shim' };
      });

      // Load empty content for tailwindcss imports (CDN handles actual styles)
      build.onLoad({ filter: /.*/, namespace: 'tailwind-shim' }, (args) => {
        logger.debug(`Providing empty shim for Tailwind: ${args.path}`);
        return {
          contents: `/* Tailwind CSS handled by CDN: ${args.path} */`,
          loader: 'css',
        };
      });

      // =========================================================================
      // Path Alias Resolution (@/)
      // =========================================================================

      // Resolve @/ path aliases (e.g., @/components/Header -> /src/components/Header)
      build.onResolve({ filter: /^@\// }, (args) => {
        // Skip if coming from esm-sh namespace
        if (args.namespace === 'esm-sh') {
          return null;
        }

        const pathWithoutAlias = args.path.replace(/^@\//, '');

        // Try multiple paths in order of preference
        const pathsToTry = [
          `/src/${pathWithoutAlias}`,
          `/${pathWithoutAlias}`,
        ];

        for (const tryPath of pathsToTry) {
          const foundPath = findFile(tryPath);
          if (foundPath) {
            const resolveDir = foundPath.substring(0, foundPath.lastIndexOf('/')) || '/';
            logger.debug(`Resolving @/ alias: ${args.path} -> ${foundPath}`);
            return { path: foundPath, namespace: 'virtual-fs', pluginData: { resolveDir } };
          }
        }

        // Fallback to /src/ path even if not found
        const virtualPath = `/src/${pathWithoutAlias}`;
        const resolveDir = virtualPath.substring(0, virtualPath.lastIndexOf('/')) || '/';
        logger.debug(`Resolving @/ alias (fallback): ${args.path} -> ${virtualPath}`);
        return { path: virtualPath, namespace: 'virtual-fs', pluginData: { resolveDir } };
      });

      // =========================================================================
      // Relative Import Resolution
      // =========================================================================

      // Resolve relative imports (./file or ../file)
      build.onResolve({ filter: /^\./ }, (args) => {
        // Skip if coming from esm-sh namespace
        if (args.namespace === 'esm-sh') {
          return null;
        }

        // Determine the base path for resolution
        let basePath: string;

        if (args.importer && args.importer.startsWith('/')) {
          basePath = args.importer;
        } else if (args.resolveDir && args.resolveDir.startsWith('/')) {
          basePath = args.resolveDir + '/_entry';
        } else {
          basePath = '/_entry';
        }

        const resolvedPath = resolveRelativePath(basePath, args.path);
        logger.debug(`Resolving relative import: ${args.path} from ${basePath} -> ${resolvedPath}`);

        const resolveDir = resolvedPath.substring(0, resolvedPath.lastIndexOf('/')) || '/';
        return { path: resolvedPath, namespace: 'virtual-fs', pluginData: { resolveDir } };
      });

      // =========================================================================
      // Absolute Path Resolution
      // =========================================================================

      // Resolve absolute imports from virtual fs - but NOT esm.sh CDN paths
      build.onResolve({ filter: /^\// }, (args) => {
        // Skip if coming from esm-sh namespace
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

      // =========================================================================
      // File Loading
      // =========================================================================

      // Load from virtual filesystem
      build.onLoad({ filter: /.*/, namespace: 'virtual-fs' }, async (args) => {
        const foundPath = findFile(args.path);

        if (!foundPath) {
          logger.debug(`File not found: ${args.path}. Available files:`, Array.from(files.keys()).slice(0, 20));
          return { errors: [{ text: `File not found: ${args.path}` }] };
        }

        const content = files.get(foundPath)!;
        const ext = foundPath.split('.').pop()?.toLowerCase();
        const resolveDir = foundPath.substring(0, foundPath.lastIndexOf('/')) || '/';

        // Handle framework-specific files with their compilers
        if (ext && hasCompilerFor(ext)) {
          try {
            // Special case for CSS files (Tailwind compilation)
            if (ext === 'css') {
              return await handleCssFile(foundPath, content, resolveDir, files, cssAggregator, logger);
            }

            // Standard compiler handling (Vue, Svelte, Astro, etc.)
            const compiler = await loadCompiler(ext);
            const result = await compiler.compile(content, foundPath);

            // If the compiler produced CSS, add it to the aggregator
            if (result.css && result.css.trim()) {
              const cssType: CSSType = result.cssMetadata?.type === 'tailwind' ? 'tailwind' : 'component';
              cssAggregator.addCSS({
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
              return handleCssError(foundPath, errorMsg, resolveDir, logger);
            }

            return { errors: [{ text: `Compilation failed for ${foundPath}: ${errorMsg}` }] };
          }
        }

        const loader = getLoader(foundPath);

        // For CSS files without compiler, add to aggregator
        if (loader === 'css') {
          return await handlePlainCssFile(foundPath, content, resolveDir, files, cssAggregator, logger);
        }

        // For image files, export as module
        if (loader === 'dataurl') {
          return handleImageFile(foundPath, content, resolveDir);
        }

        return {
          contents: content,
          loader,
          resolveDir,
        };
      });
    },
  };
}

/**
 * Handle CSS file compilation with Tailwind support
 */
async function handleCssFile(
  foundPath: string,
  content: string,
  resolveDir: string,
  files: Map<string, string>,
  cssAggregator: any,
  logger: any
): Promise<esbuild.OnLoadResult> {
  const compiler = await loadCompiler('css') as TailwindCompiler;

  // Provide content files for Tailwind class extraction
  const contentFiles: ContentFile[] = Array.from(files.entries())
    .filter(([path]) => /\.(tsx?|jsx?|vue|svelte|html|astro)$/.test(path))
    .map(([path, fileContent]) => ({ path, content: fileContent }));

  compiler.setContentFiles(contentFiles);

  const result = await compiler.compile(content, foundPath);

  // Add compiled CSS to aggregator
  if (result.code && result.code.trim()) {
    cssAggregator.addCSS({
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

/**
 * Handle CSS compilation error with fallback
 */
function handleCssError(
  foundPath: string,
  errorMsg: string,
  resolveDir: string,
  logger: any
): esbuild.OnLoadResult {
  logger.warn(`CSS compilation failed, using fallback: ${errorMsg}`);

  // Sanitize error message for CSS comment
  const sanitizedError = errorMsg.replace(/\*\//g, '* /').replace(/</g, '&lt;');
  const fallbackCSS = `/* Tailwind compilation failed: ${sanitizedError} */\n:root { --background: transparent; --foreground: inherit; }`;
  const fallbackInjector = `(function(){if(typeof document!=='undefined'){var s=document.createElement('style');s.setAttribute('data-source',${JSON.stringify(foundPath)});s.textContent=${JSON.stringify(fallbackCSS)};document.head.appendChild(s);}})();`;

  return {
    contents: fallbackInjector,
    loader: 'js' as const,
    resolveDir,
  };
}

/**
 * Handle plain CSS files (possibly with Tailwind directives)
 */
async function handlePlainCssFile(
  foundPath: string,
  content: string,
  resolveDir: string,
  files: Map<string, string>,
  cssAggregator: any,
  logger: any
): Promise<esbuild.OnLoadResult> {
  try {
    let cssContent = content;

    // Check if CSS has Tailwind directives
    const hasTailwindDirectives =
      content.includes('@tailwind') ||
      content.includes('@apply') ||
      content.includes('@layer');

    if (hasTailwindDirectives) {
      try {
        const compiler = await loadCompiler('css') as TailwindCompiler;

        const contentFiles: ContentFile[] = Array.from(files.entries())
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
        cssContent = `/* Tailwind compilation failed - using CDN fallback */
:root { --background: transparent; --foreground: inherit; }`;
      }
    }

    // Add CSS to aggregator
    if (cssContent && cssContent.trim()) {
      cssAggregator.addCSS({
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
    logger.error(`Critical error handling CSS ${foundPath}:`, cssError);
    return {
      contents: `/* CSS error: ${foundPath} */`,
      loader: 'js' as const,
      resolveDir,
    };
  }
}

/**
 * Handle image files
 */
function handleImageFile(
  foundPath: string,
  content: string,
  resolveDir: string
): esbuild.OnLoadResult {
  const imageExt = foundPath.split('.').pop()?.toLowerCase();
  const mimeTypes: Record<string, string> = {
    jpg: 'image/jpeg',
    jpeg: 'image/jpeg',
    png: 'image/png',
    gif: 'image/gif',
    webp: 'image/webp',
    svg: 'image/svg+xml',
    ico: 'image/x-icon',
    bmp: 'image/bmp',
    avif: 'image/avif',
  };
  const mimeType = mimeTypes[imageExt || ''] || 'application/octet-stream';

  // SVG can be used as data URL directly
  if (imageExt === 'svg' || content.startsWith('<')) {
    const encoded = btoa(unescape(encodeURIComponent(content)));
    return {
      contents: `export default "data:${mimeType};base64,${encoded}";`,
      loader: 'js',
      resolveDir,
    };
  }

  // Check if content is already base64
  if (content.startsWith('data:')) {
    return {
      contents: `export default "${content}";`,
      loader: 'js',
      resolveDir,
    };
  }

  // Return path as fallback for images that can't be embedded
  return {
    contents: `export default "${foundPath}";`,
    loader: 'js',
    resolveDir,
  };
}
