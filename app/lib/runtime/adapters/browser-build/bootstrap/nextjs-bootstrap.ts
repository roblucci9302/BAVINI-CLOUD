/**
 * =============================================================================
 * BAVINI CLOUD - Next.js Bootstrap
 * =============================================================================
 * Bootstrap code generator for Next.js App Router applications.
 * Handles layout.tsx wrapping and page structure.
 * =============================================================================
 */

import type { BootstrapContext, RouteDefinition } from './types';

/**
 * Generate Next.js App Router bootstrap entry code
 *
 * @param entryPath - Entry file path
 * @param context - Bootstrap context
 * @returns Bootstrap JavaScript code
 */
export function createNextJSBootstrapEntry(
  entryPath: string,
  context: BootstrapContext
): string {
  const { files, findFile, detectRoutes, logger } = context;

  // Find layout and page files
  const layoutPath = findFile('/src/app/layout') || findFile('/app/layout');
  const pagePath = findFile('/src/app/page') || findFile('/app/page');

  logger.debug('Next.js bootstrap paths:', { layoutPath, pagePath, entryPath });

  // Get all page components for routing
  const filesList = Array.from(files.keys());
  const detectedRoutes = detectRoutes(filesList, files);

  // Build route imports
  const routeImports: string[] = [];
  const routeComponents: string[] = [];

  detectedRoutes.forEach((route: RouteDefinition, index: number) => {
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

// Match route to path (memoizable pure function)
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
// IMPORTANT: Uses global flag to prevent listener accumulation (fixes freeze issue)
function NextJSApp() {
  const [currentPath, setCurrentPath] = useState(getHashPath);

  useEffect(() => {
    // CRITICAL FIX: Use global flag to prevent listener accumulation
    // This fixes the freeze issue in multi-page sites with remounts
    // NOTE: We ONLY use hashchange - not custom events - to prevent double notifications
    if (window.__BAVINI_NEXTJS_ROUTER_INITIALIZED__) {
      // Listeners already setup by first instance, just sync state on hashchange
      const syncPath = () => setCurrentPath(getHashPath());
      window.addEventListener('hashchange', syncPath);
      return () => {
        window.removeEventListener('hashchange', syncPath);
      };
    }

    // First instance - setup global listeners and navigation handler
    window.__BAVINI_NEXTJS_ROUTER_INITIALIZED__ = true;

    const handleHashChange = () => setCurrentPath(getHashPath());
    window.addEventListener('hashchange', handleHashChange);

    // Setup global navigation handler (hash-based for Blob URL compatibility)
    // NOTE: Only sets hash - hashchange event handles all state updates
    window.__BAVINI_NAVIGATE__ = (url, options = {}) => {
      const newHash = '#' + (url.startsWith('/') ? url : '/' + url);
      if (options.replace) {
        window.location.replace(newHash);
      } else {
        window.location.hash = newHash;
      }
      // hashchange event will trigger the state update - no custom event needed
    };

    // CRITICAL: Set initial hash if not present (prevents blank state)
    if (!window.location.hash || window.location.hash === '#') {
      window.location.hash = '#/';
    }

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  const { route, params } = matchRoute(currentPath);
  const PageComponent = route?.component || (() => <div>Page not found</div>);

  // Store params for useParams hook
  if (typeof window !== 'undefined') {
    window.__BAVINI_ROUTE_PARAMS__ = params;
  }

  // Pass params as prop to PageComponent (Next.js App Router convention)
  // Pages receive { params: { id: '123' } } for dynamic routes like [id]
  const pageContent = <PageComponent params={params} />;

  ${hasLayout ? 'return <RootLayout>{pageContent}</RootLayout>;' : 'return pageContent;'}
}

// Mount the app
const container = document.getElementById('root') || document.getElementById('app') || document.body;
const root = createRoot(container);
root.render(<NextJSApp />);
`;
}
