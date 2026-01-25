/**
 * =============================================================================
 * BAVINI CLOUD - Incremental Builder
 * =============================================================================
 * Coordinates incremental builds by analyzing changes and determining
 * what needs to be rebuilt.
 *
 * @module lib/runtime/adapters/browser-build/incremental/incremental-builder
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';
import { DependencyGraph, hashContent } from './dependency-graph';
import { BundleCache, getBundleCache, type CacheStats } from './bundle-cache';

const logger = createScopedLogger('IncrementalBuilder');

/**
 * Types of changes that can occur.
 */
export type ChangeType = 'added' | 'modified' | 'deleted' | 'unchanged';

/**
 * Information about a file change.
 */
export interface FileChange {
  path: string;
  type: ChangeType;
  oldHash?: string;
  newHash?: string;
}

/**
 * Result of change analysis.
 */
export interface ChangeAnalysis {
  /** Files that were added */
  added: string[];
  /** Files that were modified */
  modified: string[];
  /** Files that were deleted */
  deleted: string[];
  /** Files affected by changes (need rebuilding) */
  affected: string[];
  /** Whether NPM dependencies changed */
  npmChanged: boolean;
  /** Whether a full rebuild is required */
  requiresFullRebuild: boolean;
  /** Reason for full rebuild (if required) */
  fullRebuildReason?: string;
  /** Files that can be skipped (unchanged and cached) */
  skippable: string[];
}

/**
 * Build decision for a file.
 */
export interface FileBuildDecision {
  path: string;
  /** Whether to rebuild this file */
  rebuild: boolean;
  /** Reason for decision */
  reason: 'changed' | 'dependency-changed' | 'cached' | 'new' | 'deleted';
  /** Cached bundle if available and valid */
  cachedCode?: string;
  cachedCSS?: string;
}

/**
 * Metrics for incremental build performance.
 */
export interface IncrementalBuildMetrics {
  /** Total files in project */
  totalFiles: number;
  /** Files that needed rebuilding */
  rebuiltFiles: number;
  /** Files served from cache */
  cachedFiles: number;
  /** Cache hit rate */
  cacheHitRate: number;
  /** Time saved estimate (ms) */
  timeSavedEstimate: number;
  /** Whether full rebuild was triggered */
  wasFullRebuild: boolean;
}

/**
 * IncrementalBuilder manages incremental build logic.
 */
export class IncrementalBuilder {
  #dependencyGraph: DependencyGraph;
  #bundleCache: BundleCache;
  #previousFiles = new Map<string, string>(); // path -> hash
  #metrics: IncrementalBuildMetrics = {
    totalFiles: 0,
    rebuiltFiles: 0,
    cachedFiles: 0,
    cacheHitRate: 0,
    timeSavedEstimate: 0,
    wasFullRebuild: false,
  };

  constructor(dependencyGraph?: DependencyGraph, bundleCache?: BundleCache) {
    this.#dependencyGraph = dependencyGraph ?? new DependencyGraph();
    this.#bundleCache = bundleCache ?? getBundleCache();
  }

  /**
   * Analyze changes between previous and current file state.
   */
  analyzeChanges(currentFiles: Map<string, string>): ChangeAnalysis {
    const added: string[] = [];
    const modified: string[] = [];
    const deleted: string[] = [];
    const currentHashes = new Map<string, string>();

    // Check for added and modified files
    for (const [path, content] of currentFiles) {
      const newHash = hashContent(content);
      currentHashes.set(path, newHash);

      const oldHash = this.#previousFiles.get(path);

      if (!oldHash) {
        added.push(path);
      } else if (oldHash !== newHash) {
        modified.push(path);
      }
    }

    // Check for deleted files
    for (const path of this.#previousFiles.keys()) {
      if (!currentFiles.has(path)) {
        deleted.push(path);
      }
    }

    // Determine affected files (transitive dependencies)
    const changedPaths = [...added, ...modified];
    const affected = this.#dependencyGraph.getAffectedFilesForChanges(changedPaths);

    // Add deleted files' dependents to affected
    for (const deletedPath of deleted) {
      for (const dependent of this.#dependencyGraph.getDependents(deletedPath)) {
        affected.add(dependent);
      }
    }

    // Determine if NPM dependencies changed
    const currentNpmDeps = this.#extractNpmDependencies(currentFiles);
    const npmChanged = this.#dependencyGraph.hasNpmDependenciesChanged(currentNpmDeps);

    // Determine if full rebuild is required
    let requiresFullRebuild = false;
    let fullRebuildReason: string | undefined;

    if (this.#previousFiles.size === 0) {
      requiresFullRebuild = true;
      fullRebuildReason = 'First build (no previous state)';
    } else if (npmChanged) {
      requiresFullRebuild = true;
      fullRebuildReason = 'NPM dependencies changed';
    } else if (deleted.some((p) => this.#isConfigFile(p))) {
      requiresFullRebuild = true;
      fullRebuildReason = 'Config file deleted';
    } else if (modified.some((p) => this.#isConfigFile(p))) {
      requiresFullRebuild = true;
      fullRebuildReason = 'Config file modified';
    }

    // Determine skippable files (unchanged and have valid cache)
    const skippable: string[] = [];
    for (const [path, content] of currentFiles) {
      if (!affected.has(path) && this.#bundleCache.hasBundle(path, content)) {
        skippable.push(path);
      }
    }

    // Update previous files for next comparison
    this.#previousFiles = currentHashes;

    const analysis: ChangeAnalysis = {
      added,
      modified,
      deleted,
      affected: Array.from(affected),
      npmChanged,
      requiresFullRebuild,
      fullRebuildReason,
      skippable,
    };

    this.#logAnalysis(analysis);
    return analysis;
  }

  /**
   * Get build decisions for all files based on change analysis.
   */
  getBuildDecisions(currentFiles: Map<string, string>, analysis: ChangeAnalysis): Map<string, FileBuildDecision> {
    const decisions = new Map<string, FileBuildDecision>();

    for (const [path, content] of currentFiles) {
      let decision: FileBuildDecision;

      if (analysis.requiresFullRebuild) {
        // Full rebuild - rebuild everything
        decision = {
          path,
          rebuild: true,
          reason: analysis.added.includes(path) ? 'new' : 'changed',
        };
      } else if (analysis.added.includes(path)) {
        decision = {
          path,
          rebuild: true,
          reason: 'new',
        };
      } else if (analysis.modified.includes(path)) {
        decision = {
          path,
          rebuild: true,
          reason: 'changed',
        };
      } else if (analysis.affected.includes(path)) {
        decision = {
          path,
          rebuild: true,
          reason: 'dependency-changed',
        };
      } else {
        // Try to get from cache
        const cached = this.#bundleCache.getBundle(path, content);
        if (cached) {
          decision = {
            path,
            rebuild: false,
            reason: 'cached',
            cachedCode: cached.code,
            cachedCSS: cached.css,
          };
        } else {
          // Not in cache, need to rebuild
          decision = {
            path,
            rebuild: true,
            reason: 'changed', // Cache miss treated as change
          };
        }
      }

      decisions.set(path, decision);
    }

    // Handle deleted files
    for (const path of analysis.deleted) {
      decisions.set(path, {
        path,
        rebuild: false,
        reason: 'deleted',
      });

      // Invalidate cache for deleted file
      this.#bundleCache.invalidateBundle(path);
      this.#dependencyGraph.removeFile(path);
    }

    return decisions;
  }

  /**
   * Update the dependency graph after a build.
   */
  updateDependencyGraph(
    path: string,
    content: string,
    imports: string[],
    npmDependencies: string[],
  ): void {
    this.#dependencyGraph.addFile(path, content, imports, npmDependencies);
  }

  /**
   * Cache a compiled bundle.
   */
  cacheBundle(
    path: string,
    content: string,
    code: string,
    options: {
      sourceMap?: string;
      css?: string;
      imports?: string[];
      npmDependencies?: string[];
    } = {},
  ): void {
    this.#bundleCache.setBundle(path, content, code, options);
  }

  /**
   * Invalidate cache for a file and its dependents.
   */
  invalidateFile(path: string): void {
    this.#bundleCache.invalidateBundle(path);
    this.#bundleCache.invalidateDependents(path);
  }

  /**
   * Mark build as complete and update metrics.
   */
  completeBuild(rebuiltCount: number, cachedCount: number, wasFullRebuild: boolean): void {
    this.#dependencyGraph.markBuildComplete();

    const totalFiles = rebuiltCount + cachedCount;
    this.#metrics = {
      totalFiles,
      rebuiltFiles: rebuiltCount,
      cachedFiles: cachedCount,
      cacheHitRate: totalFiles > 0 ? (cachedCount / totalFiles) * 100 : 0,
      timeSavedEstimate: cachedCount * 50, // Estimate 50ms saved per cached file
      wasFullRebuild,
    };

    logger.info(
      `Build complete: ${rebuiltCount} rebuilt, ${cachedCount} cached (${this.#metrics.cacheHitRate.toFixed(1)}% hit rate)`,
    );
  }

  /**
   * Get the dependency graph.
   */
  get dependencyGraph(): DependencyGraph {
    return this.#dependencyGraph;
  }

  /**
   * Get the bundle cache.
   */
  get bundleCache(): BundleCache {
    return this.#bundleCache;
  }

  /**
   * Get current metrics.
   */
  getMetrics(): IncrementalBuildMetrics {
    return { ...this.#metrics };
  }

  /**
   * Get cache statistics.
   */
  getCacheStats(): CacheStats {
    return this.#bundleCache.getStats();
  }

  /**
   * Get combined statistics.
   */
  getStats(): {
    metrics: IncrementalBuildMetrics;
    cache: CacheStats;
    graph: ReturnType<DependencyGraph['getStats']>;
  } {
    return {
      metrics: this.getMetrics(),
      cache: this.getCacheStats(),
      graph: this.#dependencyGraph.getStats(),
    };
  }

  /**
   * Reset all state (for testing or fresh start).
   */
  reset(): void {
    this.#dependencyGraph.clear();
    this.#bundleCache.clear();
    this.#previousFiles.clear();
    this.#metrics = {
      totalFiles: 0,
      rebuiltFiles: 0,
      cachedFiles: 0,
      cacheHitRate: 0,
      timeSavedEstimate: 0,
      wasFullRebuild: false,
    };
    logger.info('Incremental builder reset');
  }

  /**
   * Check if a file is a config file that requires full rebuild.
   */
  #isConfigFile(path: string): boolean {
    const configPatterns = [
      /package\.json$/,
      /tsconfig\.json$/,
      /vite\.config\.[jt]s$/,
      /tailwind\.config\.[jt]s$/,
      /postcss\.config\.[jt]s$/,
      /\.env$/,
    ];

    return configPatterns.some((pattern) => pattern.test(path));
  }

  /**
   * Extract NPM dependencies from all files.
   */
  #extractNpmDependencies(files: Map<string, string>): Set<string> {
    const deps = new Set<string>();

    // Check package.json
    const pkgJson = files.get('/package.json');
    if (pkgJson) {
      try {
        const pkg = JSON.parse(pkgJson);
        for (const dep of Object.keys(pkg.dependencies ?? {})) {
          deps.add(dep);
        }
        for (const dep of Object.keys(pkg.devDependencies ?? {})) {
          deps.add(dep);
        }
      } catch {
        // Ignore parse errors
      }
    }

    return deps;
  }

  /**
   * Log change analysis for debugging.
   */
  #logAnalysis(analysis: ChangeAnalysis): void {
    if (analysis.requiresFullRebuild) {
      logger.info(`Full rebuild required: ${analysis.fullRebuildReason}`);
    } else {
      logger.info(
        `Incremental build: ${analysis.added.length} added, ${analysis.modified.length} modified, ` +
          `${analysis.deleted.length} deleted, ${analysis.affected.length} affected, ` +
          `${analysis.skippable.length} skippable`,
      );
    }
  }
}

/**
 * Singleton incremental builder instance.
 */
let incrementalBuilderInstance: IncrementalBuilder | null = null;

/**
 * Get the singleton incremental builder instance.
 */
export function getIncrementalBuilder(): IncrementalBuilder {
  if (!incrementalBuilderInstance) {
    incrementalBuilderInstance = new IncrementalBuilder();
  }
  return incrementalBuilderInstance;
}

/**
 * Reset the singleton incremental builder (for testing).
 */
export function resetIncrementalBuilder(): void {
  incrementalBuilderInstance?.reset();
  incrementalBuilderInstance = null;
}
