/**
 * =============================================================================
 * BAVINI CLOUD - Astro Compiler Module
 * =============================================================================
 * Barrel export for Astro compiler submodules.
 *
 * @module lib/runtime/adapters/compilers/astro
 * =============================================================================
 */

// Types
export type {
  AstroCompilerModule,
  AstroTransformOptions,
  AstroTransformResult,
  AstroDiagnostic,
  AstroParseResult,
} from './types';

// Constants
export { ASTRO_COMPILER_CDN, ASTRO_WASM_CDN } from './constants';

// Runtime shims
export { getAstroRuntimeShims } from './runtime-shims';

// CSS scoping
export { generateScopeHash, extractStylesFromSource, scopeCSS } from './css-scoping';

// Post-processor
export {
  stripTypeScriptDeclarations,
  postProcessCode,
  getComponentName,
  wrapForBrowser,
} from './post-processor';
