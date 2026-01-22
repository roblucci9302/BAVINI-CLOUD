/**
 * =============================================================================
 * BAVINI Container - Module System
 * =============================================================================
 * Export module system components.
 * =============================================================================
 */

// Types
export type {
  NodeModule,
  RequireFunction,
  RequireResolve,
  ResolveOptions,
  ResolvedModule,
  PackageJson,
  ModuleCacheEntry,
  ModuleLoaderOptions,
  ModuleFS,
  ImportMeta,
  ModuleNamespace,
} from './types';

// Resolver
export { ModuleResolver, createResolver } from './resolver';

// CommonJS Loader
export { ModuleLoader, createModuleLoader, createRequire } from './require';

// ESM Loader
export { ESMLoader, createESMLoader } from './esm-loader';
