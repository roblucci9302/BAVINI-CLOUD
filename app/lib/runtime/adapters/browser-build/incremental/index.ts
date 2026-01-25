/**
 * =============================================================================
 * BAVINI CLOUD - Incremental Build Module
 * =============================================================================
 * Barrel export for incremental build system.
 *
 * @module lib/runtime/adapters/browser-build/incremental
 * =============================================================================
 */

// Dependency Graph
export {
  DependencyGraph,
  hashContent,
  type FileNode,
  type SerializedFileNode,
  type SerializedDependencyGraph,
} from './dependency-graph';

// Bundle Cache
export {
  BundleCache,
  getBundleCache,
  resetBundleCache,
  type CachedBundle,
  type CachedCSS,
  type CacheStats,
  type BundleCacheConfig,
} from './bundle-cache';

// Incremental Builder
export {
  IncrementalBuilder,
  getIncrementalBuilder,
  resetIncrementalBuilder,
  type ChangeType,
  type FileChange,
  type ChangeAnalysis,
  type FileBuildDecision,
  type IncrementalBuildMetrics,
} from './incremental-builder';
