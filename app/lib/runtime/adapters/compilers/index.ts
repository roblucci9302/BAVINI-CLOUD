/**
 * =============================================================================
 * BAVINI CLOUD - Framework Compilers
 * =============================================================================
 * Re-exports for the framework compiler system.
 * =============================================================================
 */

export {
  loadCompiler,
  getCompiler,
  hasCompilerFor,
  detectFramework,
  getJsxConfig,
  clearCompilerCache,
  type FrameworkType,
  type FrameworkCompiler,
  type CompilationResult,
} from './compiler-registry';

export { AstroCompiler } from './astro-compiler';
export { VueCompiler } from './vue-compiler';
export { SvelteCompiler } from './svelte-compiler';
export { NextJSCompiler, isNextJSProject, getNextJSEntryPoint } from './nextjs-compiler';
