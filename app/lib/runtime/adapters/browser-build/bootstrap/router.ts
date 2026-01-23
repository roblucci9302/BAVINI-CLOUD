/**
 * =============================================================================
 * BAVINI CLOUD - Client-Side Router
 * =============================================================================
 * Hash-based router component for React/Next.js applications.
 * Uses hash routing for Blob URL compatibility.
 * =============================================================================
 */

import type { RouteDefinition } from './types';

/**
 * Generate the hash-based router code for React applications
 *
 * @param routes - Route definitions
 * @param hasLayout - Whether to wrap with layout
 * @returns Router component code
 */
export function generateRouterCode(routes: RouteDefinition[], hasLayout: boolean): string {
  const routeComponents = routes.map((route, index) => {
    return `    { path: '${route.path}', component: Page${index} }`;
  });

  return `
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
}

/**
 * Generate route imports for React applications
 *
 * @param routes - Route definitions
 * @returns Array of import statements
 */
export function generateRouteImports(routes: RouteDefinition[]): string[] {
  return routes.map((route, index) => {
    const componentName = `Page${index}`;
    const importPath = route.component.replace(/\.tsx?$/, '');
    return `import ${componentName} from '${importPath}';`;
  });
}

/**
 * Generate App component with router
 *
 * @param hasLayout - Whether to use layout wrapper
 * @returns App component code
 */
export function generateAppWithRouter(hasLayout: boolean): string {
  if (hasLayout) {
    return `
function App() {
  return (
    <BaviniRouter Layout={RootLayout}>
      {/* Fallback content if no routes match */}
      <div>Loading...</div>
    </BaviniRouter>
  );
}`;
  }

  return `
function App() {
  return (
    <BaviniRouter>
      {/* Fallback content if no routes match */}
      <div>Loading...</div>
    </BaviniRouter>
  );
}`;
}
