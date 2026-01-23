/**
 * =============================================================================
 * BAVINI CLOUD - Bootstrap Module
 * =============================================================================
 * Framework-specific bootstrap code generators for browser-based preview.
 * =============================================================================
 */

// Export types
export type { BootstrapContext, BootstrapGenerator, RouteDefinition } from './types';
export { MOUNTING_PATTERNS, isMountingEntryFile } from './types';

// Export router utilities
export {
  generateRouterCode,
  generateRouteImports,
  generateAppWithRouter,
} from './router';

// Export framework-specific bootstrap generators
export { createVueBootstrapEntry } from './vue-bootstrap';
export { createSvelteBootstrapEntry } from './svelte-bootstrap';
export { createAstroBootstrapEntry } from './astro-bootstrap';
export { createPreactBootstrapEntry } from './preact-bootstrap';
export { createNextJSBootstrapEntry } from './nextjs-bootstrap';
export { createReactBootstrapEntry } from './react-bootstrap';

import type { BootstrapContext } from './types';
import type { FrameworkType } from '../../compilers/compiler-registry';
import { createVueBootstrapEntry } from './vue-bootstrap';
import { createSvelteBootstrapEntry } from './svelte-bootstrap';
import { createAstroBootstrapEntry } from './astro-bootstrap';
import { createPreactBootstrapEntry } from './preact-bootstrap';
import { createNextJSBootstrapEntry } from './nextjs-bootstrap';
import { createReactBootstrapEntry } from './react-bootstrap';

/**
 * Create framework-specific bootstrap entry code
 *
 * @param entryPath - Entry file path
 * @param framework - Detected framework type
 * @param context - Bootstrap context
 * @returns Bootstrap JavaScript code
 */
export function createBootstrapEntry(
  entryPath: string,
  framework: FrameworkType,
  context: BootstrapContext
): string {
  switch (framework) {
    case 'vue':
      return createVueBootstrapEntry(entryPath, context);
    case 'svelte':
      return createSvelteBootstrapEntry(entryPath, context);
    case 'astro':
      return createAstroBootstrapEntry(entryPath, context);
    case 'preact':
      return createPreactBootstrapEntry(entryPath, context);
    case 'nextjs':
      return createNextJSBootstrapEntry(entryPath, context);
    case 'react':
    default:
      return createReactBootstrapEntry(entryPath, context);
  }
}
