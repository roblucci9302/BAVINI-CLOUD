/**
 * =============================================================================
 * BAVINI CLOUD - esbuild Plugins
 * =============================================================================
 * Plugin exports for the browser build system.
 * =============================================================================
 */

export type {
  PluginContext,
  PluginFactory,
  CSSResult,
  CompilerResult,
  ContentFile,
} from './types';

export { createVirtualFsPlugin } from './virtual-fs-plugin';
export {
  type ModuleCache,
  createEsmShPlugin,
  getCdnStats,
  resetCdnStats,
  warmupCache,
  prefetchPackages,
} from './esm-sh-plugin';
