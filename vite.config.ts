import { cloudflareDevProxyVitePlugin as remixCloudflareDevProxy, vitePlugin as remixVitePlugin } from '@remix-run/dev';
import UnoCSS from 'unocss/vite';
import { defineConfig, type Plugin } from 'vite';
import { nodePolyfills } from 'vite-plugin-node-polyfills';
import { optimizeCssModules } from 'vite-plugin-optimize-css-modules';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import viteCompression from 'vite-plugin-compression';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Custom plugin to provide path polyfill that works in both SSR and client contexts.
 * Uses native Node.js path in SSR, path-browserify in client.
 *
 * This plugin handles path resolution manually because vite-plugin-node-polyfills
 * uses resolve.alias which doesn't distinguish between SSR and client contexts,
 * and path-browserify (CJS) doesn't work in Vite's ESM-based SSR.
 */
function pathPolyfillPlugin(): Plugin {
  return {
    name: 'path-polyfill',
    enforce: 'pre',
    async resolveId(id, importer, options) {
      // Handle path module resolution
      if (id === 'path' || id === 'node:path') {
        if (options?.ssr) {
          // SSR: use native Node.js path
          return { id: 'node:path', external: true };
        }

        // Client: resolve path-browserify to its actual location
        const resolved = await this.resolve('path-browserify', importer, {
          skipSelf: true,
          ...options,
        });

        if (resolved) {
          return { id: resolved.id, external: false };
        }

        // Fallback: return the module name (let Vite resolve it)
        return null;
      }

      // Prevent path-browserify from loading in SSR
      if (options?.ssr && id === 'path-browserify') {
        return { id: 'node:path', external: true };
      }

      return null;
    },
  };
}

export default defineConfig((config) => {
  return {
    worker: {
      format: 'es', // Use ES modules for workers (supports code splitting)
    },
    build: {
      target: 'esnext', // Modern browsers (code uses top-level await)
      chunkSizeWarningLimit: 500, // Warn if chunk > 500KB
      minify: 'terser', // Use Terser for better minification
      terserOptions: {
        compress: {
          drop_console: true, // Remove console.* in production
          drop_debugger: true, // Remove debugger statements
          pure_funcs: ['console.log', 'console.debug', 'console.trace'], // Tree-shake these calls
          passes: 2, // Multiple compression passes for better results
        },
        mangle: {
          safari10: true, // Support older Safari versions
        },
        format: {
          comments: false, // Remove all comments
        },
      },
      // Note: Code splitting is handled via React.lazy() wrappers in:
      // - app/components/editor/codemirror/index.tsx (CodeMirror)
      // - app/components/ui/ColorBends.lazy.tsx (Three.js)
      // - app/components/chat/CodeBlock.lazy.tsx (Shiki)
      // Vite will automatically create separate chunks for these lazy-loaded modules
      rollupOptions: {
        output: {
          // Use a function for safer chunk creation
          manualChunks(id) {
            // Core React runtime
            if (id.includes('node_modules/react/') ||
                id.includes('node_modules/react-dom/') ||
                id.includes('node_modules/react-router')) {
              return 'vendor-react';
            }
            // AI SDK
            if (id.includes('node_modules/ai/') ||
                id.includes('node_modules/@ai-sdk/')) {
              return 'vendor-ai';
            }
            // UI components
            if (id.includes('node_modules/framer-motion/') ||
                id.includes('node_modules/@radix-ui/')) {
              return 'vendor-ui';
            }
            // State management
            if (id.includes('node_modules/nanostores/') ||
                id.includes('node_modules/@nanostores/')) {
              return 'vendor-state';
            }
            // Terminal
            if (id.includes('node_modules/@xterm/')) {
              return 'vendor-terminal';
            }
            // Git operations
            if (id.includes('node_modules/isomorphic-git/')) {
              return 'vendor-git';
            }
            return undefined;
          },
        },
      },
    },
    esbuild: {
      // Remove legal comments (licenses) from output for smaller bundles
      legalComments: 'none',
      // Remove pure function calls that have no side effects
      pure: ['console.log', 'console.debug'],
    },
    optimizeDeps: {
      exclude: ['@electric-sql/pglite', 'pyodide'],
    },
    ssr: {
      // Externalize CJS packages and browser-only packages from SSR bundling
      external: [
        'path-browserify',
        '@isomorphic-git/lightning-fs',
        '@isomorphic-git/idb-keyval',
        'isomorphic-git',
      ],
    },
    test: {
      environment: 'jsdom',
      globals: true,
      setupFiles: ['./app/test/setup.ts'],
      include: ['app/**/*.spec.{ts,tsx}'],
      exclude: ['app/lib/templates/**', 'app/e2e/**', 'node_modules/**'],
      testTimeout: 10000,
      hookTimeout: 10000,
      pool: 'forks',
      isolate: true,
      coverage: {
        provider: 'v8',
        reporter: ['text', 'text-summary', 'html'],
        reportsDirectory: './coverage',
        include: [
          'app/lib/agents/**/*.ts',
          'app/lib/agents/**/*.tsx',
        ],
        exclude: [
          'app/lib/agents/**/tests/**',
          'app/lib/agents/**/*.spec.ts',
          'app/lib/agents/**/*.spec.tsx',
          'app/lib/agents/**/index.ts',
          'node_modules/**',
        ],
        thresholds: {
          lines: 60,
          functions: 70,
          branches: 75,
          statements: 60,
        },
      },
    },
    plugins: [
      pathPolyfillPlugin(),
      nodePolyfills({
        // Path is handled by pathPolyfillPlugin for SSR compatibility
        include: ['buffer'],
      }),
      config.mode !== 'test' && remixCloudflareDevProxy(),
      config.mode !== 'test' &&
        remixVitePlugin({
          future: {
            v3_fetcherPersist: true,
            v3_relativeSplatPath: true,
            v3_throwAbortReason: true,
          },
          ignoredRouteFiles: ['**/*.spec.ts', '**/*.spec.tsx'],
        }),
      UnoCSS(),
      tsconfigPaths(),
      config.mode === 'production' && optimizeCssModules({ apply: 'build' }),
      config.mode !== 'test' &&
        viteStaticCopy({
          targets: [
            {
              src: 'node_modules/pyodide/*.{js,mjs,wasm,zip,json}',
              dest: 'assets/pyodide',
            },
          ],
        }),
      // Compression plugins - Brotli (best) and Gzip (fallback)
      config.mode === 'production' &&
        viteCompression({
          algorithm: 'brotliCompress',
          ext: '.br',
          threshold: 1024, // Only compress files > 1KB
        }),
      config.mode === 'production' &&
        viteCompression({
          algorithm: 'gzip',
          ext: '.gz',
          threshold: 1024,
        }),
    ],
  };
});

