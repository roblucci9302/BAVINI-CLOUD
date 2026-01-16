import type { RouteConfig } from '@react-router/dev/routes';
import { flatRoutes } from '@react-router/fs-routes';

/**
 * React Router 7 route configuration using file-system based routing.
 * Routes are defined in app/routes/ directory following Remix v2 flat routes convention.
 */
export default flatRoutes({
  // Ignore test files - they should not be included as routes
  ignoredRouteFiles: ['**/*.spec.ts', '**/*.spec.tsx', '**/*.test.ts', '**/*.test.tsx'],
}) satisfies RouteConfig;
