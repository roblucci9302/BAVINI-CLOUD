/**
 * Router Plugin for BAVINI Runtime
 *
 * Provides client-side routing capabilities for browser-based preview.
 * Supports React Router, TanStack Router, and basic hash routing.
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RouterPlugin');

// Route definition for multi-page apps
export interface RouteDefinition {
  path: string;
  component: string;
  children?: RouteDefinition[];
  index?: boolean;
  layout?: string;
}

// Router configuration
export interface RouterConfig {
  type: 'react-router' | 'tanstack-router' | 'hash' | 'none';
  basePath: string;
  routes: RouteDefinition[];
  enableHistoryFallback: boolean;
}

// Default router configuration
export const defaultRouterConfig: RouterConfig = {
  type: 'react-router',
  basePath: '/',
  routes: [],
  enableHistoryFallback: true,
};

/**
 * Detect if a project has routing configured
 */
export function detectRoutingNeeds(files: Map<string, string>): {
  hasRouter: boolean;
  routerType: RouterConfig['type'];
  detectedRoutes: RouteDefinition[];
} {
  const filesList = Array.from(files.keys());
  const filesContent = Array.from(files.values()).join('\n');

  // Check for existing router imports
  // Note: Check TanStack first because '@tanstack/react-router' contains 'react-router'
  const hasTanStackRouter =
    filesContent.includes('@tanstack/react-router') ||
    filesContent.includes('@tanstack/router');
  const hasReactRouter =
    !hasTanStackRouter &&
    (filesContent.includes('react-router-dom') ||
      filesContent.includes("from 'react-router'") ||
      filesContent.includes('from "react-router"'));
  const hasNextRouter =
    filesContent.includes('next/router') ||
    filesContent.includes('next/navigation');

  // Check for page-based structure (Next.js, file-based routing)
  const pageFiles = filesList.filter(
    (f) =>
      f.includes('/pages/') ||
      f.includes('/app/') ||
      f.match(/\/routes\/.*\.(tsx?|jsx?)$/)
  );

  // Check for multiple navigation links
  const hasMultipleLinks =
    (filesContent.match(/<Link\s+/g) || []).length > 2 ||
    (filesContent.match(/href=["'][^"'#][^"']*["']/g) || []).length > 3;

  // Detect routes from file structure
  const detectedRoutes = detectRoutesFromFiles(filesList, files);

  // Determine if routing is needed
  const hasRouter = hasReactRouter || hasTanStackRouter || hasNextRouter;
  const needsRouter = !hasRouter && (pageFiles.length > 1 || hasMultipleLinks || detectedRoutes.length > 1);

  let routerType: RouterConfig['type'] = 'none';

  if (hasReactRouter) {
    routerType = 'react-router';
  } else if (hasTanStackRouter) {
    routerType = 'tanstack-router';
  } else if (needsRouter) {
    routerType = 'react-router'; // Default to React Router for auto-injection
  }

  logger.debug('Routing detection:', {
    hasRouter,
    routerType,
    pageFiles: pageFiles.length,
    detectedRoutes: detectedRoutes.length,
    needsRouter,
  });

  return {
    hasRouter: hasRouter || needsRouter,
    routerType,
    detectedRoutes,
  };
}

/**
 * Detect routes from file structure (Next.js App Router style)
 */
export function detectRoutesFromFiles(
  filesList: string[],
  files: Map<string, string>
): RouteDefinition[] {
  const routes: RouteDefinition[] = [];

  // Next.js App Router pattern: app/page.tsx, src/app/about/page.tsx
  // Handle both with and without leading slash
  const appRouterPages = filesList.filter((f) =>
    f.match(/^\/?(src\/)?app\/.*page\.(tsx?|jsx?)$/)
  );

  logger.debug('App Router pages found:', appRouterPages);

  for (const pagePath of appRouterPages) {
    const routePath = pagePath
      .replace(/^\/?(?:src\/)?app/, '')
      .replace(/\/page\.(tsx?|jsx?)$/, '')
      .replace(/\/\[([^\]]+)\]/g, '/:$1') // Convert [id] to :id
      || '/';

    routes.push({
      path: routePath,
      component: pagePath,
      index: routePath === '/',
    });
  }

  // Pages Router pattern: pages/index.tsx, src/pages/about.tsx
  // Handle both with and without leading slash
  const pagesRouterPages = filesList.filter((f) =>
    f.match(/^\/?(src\/)?pages\/.*\.(tsx?|jsx?)$/) &&
    !f.includes('/_') && // Exclude _app, _document
    !f.includes('/api/') // Exclude API routes
  );

  for (const pagePath of pagesRouterPages) {
    let routePath = pagePath
      .replace(/^\/?(?:src\/)?pages/, '')
      .replace(/\.(tsx?|jsx?)$/, '')
      .replace(/\/index$/, '/')
      .replace(/\/\[([^\]]+)\]/g, '/:$1');

    if (routePath === '') routePath = '/';

    // Avoid duplicates from app router
    if (!routes.find((r) => r.path === routePath)) {
      routes.push({
        path: routePath,
        component: pagePath,
        index: routePath === '/',
      });
    }
  }

  // Sort routes: index first, then alphabetically, dynamic routes last
  routes.sort((a, b) => {
    if (a.index) return -1;
    if (b.index) return 1;
    if (a.path.includes(':') && !b.path.includes(':')) return 1;
    if (!a.path.includes(':') && b.path.includes(':')) return -1;
    return a.path.localeCompare(b.path);
  });

  logger.debug('Detected routes:', routes);
  return routes;
}

/**
 * Generate React Router wrapper code
 */
export function generateReactRouterWrapper(
  routes: RouteDefinition[],
  mainComponent: string
): string {
  if (routes.length === 0) {
    // Simple wrapper without routes
    return `
import { BrowserRouter, Routes, Route } from 'react-router-dom';

function RouterWrapper({ children }) {
  return (
    <BrowserRouter>
      {children}
    </BrowserRouter>
  );
}
`;
  }

  // Generate route elements
  const routeElements = routes
    .map((route) => {
      const componentName = getComponentNameFromPath(route.component);
      return `      <Route path="${route.path}" element={<${componentName} />} />`;
    })
    .join('\n');

  // Generate imports
  const routeImports = routes
    .map((route) => {
      const componentName = getComponentNameFromPath(route.component);
      const importPath = route.component.replace(/\.(tsx?|jsx?)$/, '');
      return `import ${componentName} from '${importPath}';`;
    })
    .join('\n');

  return `
import { BrowserRouter, Routes, Route } from 'react-router-dom';
${routeImports}

function AppRoutes() {
  return (
    <BrowserRouter>
      <Routes>
${routeElements}
      </Routes>
    </BrowserRouter>
  );
}
`;
}

/**
 * Generate the esm.sh import for React Router
 */
export function getReactRouterCDNImport(): string {
  return `
// React Router DOM from CDN
import { BrowserRouter, Routes, Route, Link, useNavigate, useParams, useLocation } from 'https://esm.sh/react-router-dom@6.22.0?deps=react@18.2.0,react-dom@18.2.0';
`;
}

/**
 * Get component name from file path
 */
function getComponentNameFromPath(filePath: string): string {
  // /app/about/page.tsx -> AboutPage
  // /pages/contact.tsx -> Contact
  const parts = filePath
    .replace(/\.(tsx?|jsx?)$/, '')
    .split('/')
    .filter(Boolean);

  const fileName = parts[parts.length - 1];

  if (fileName === 'page' || fileName === 'index') {
    // Use parent folder name
    const parentName = parts[parts.length - 2] || 'Home';
    return capitalize(parentName) + 'Page';
  }

  return capitalize(fileName);
}

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

/**
 * Check if a link href is an internal route
 */
export function isInternalRoute(href: string): boolean {
  if (!href) return false;
  if (href.startsWith('#')) return false;
  if (href.startsWith('http://') || href.startsWith('https://')) return false;
  if (href.startsWith('mailto:') || href.startsWith('tel:')) return false;
  return true;
}

/**
 * Transform static <a> tags to <Link> components
 */
export function transformLinksToRouterLinks(code: string): string {
  // Transform <a href="/about"> to <Link to="/about">
  // This is a simple regex-based transformation
  // More robust: use AST transformation

  // Match <a href="..." ...>
  const aTagRegex = /<a\s+([^>]*?)href=["']([^"'#][^"']*)["']([^>]*)>/gi;

  return code.replace(aTagRegex, (match, before, href, after) => {
    if (!isInternalRoute(href)) {
      return match; // Keep external links as-is
    }
    // Transform to Link
    return `<Link ${before}to="${href}"${after}>`;
  });
}

/**
 * Generate hash-based router for simpler routing
 */
export function generateHashRouter(routes: RouteDefinition[]): string {
  const routeHandlers = routes
    .map((route) => {
      return `    '${route.path}': () => import('${route.component.replace(/\.(tsx?|jsx?)$/, '')}'),`;
    })
    .join('\n');

  return `
// Simple hash-based router
const routes = {
${routeHandlers}
};

function HashRouter({ children }) {
  const [CurrentPage, setCurrentPage] = React.useState(null);

  React.useEffect(() => {
    const handleHashChange = async () => {
      const hash = window.location.hash.slice(1) || '/';
      const loadPage = routes[hash];
      if (loadPage) {
        const module = await loadPage();
        setCurrentPage(() => module.default);
      }
    };

    window.addEventListener('hashchange', handleHashChange);
    handleHashChange(); // Initial load

    return () => window.removeEventListener('hashchange', handleHashChange);
  }, []);

  if (!CurrentPage) return children;
  return React.createElement(CurrentPage);
}
`;
}
