/**
 * =============================================================================
 * BAVINI CLOUD - Dependency Graph
 * =============================================================================
 * Tracks file dependencies for incremental builds.
 * Records which files import which other files, enabling targeted rebuilds.
 *
 * @module lib/runtime/adapters/browser-build/incremental/dependency-graph
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DependencyGraph');

/**
 * Information about a single file in the dependency graph.
 */
export interface FileNode {
  /** Absolute path of the file */
  path: string;
  /** Files this file imports (dependencies) */
  imports: Set<string>;
  /** Files that import this file (dependents/reverse dependencies) */
  importedBy: Set<string>;
  /** NPM packages this file uses */
  npmDependencies: Set<string>;
  /** Hash of the file content for change detection */
  contentHash: string;
  /** Last modification timestamp */
  lastModified: number;
}

/**
 * Serializable version of FileNode for persistence.
 */
export interface SerializedFileNode {
  path: string;
  imports: string[];
  importedBy: string[];
  npmDependencies: string[];
  contentHash: string;
  lastModified: number;
}

/**
 * Serializable version of the entire graph.
 */
export interface SerializedDependencyGraph {
  version: number;
  files: SerializedFileNode[];
  buildTime: number;
}

/**
 * Simple hash function for content change detection.
 * Uses djb2 algorithm for speed.
 */
export function hashContent(content: string): string {
  let hash = 5381;
  for (let i = 0; i < content.length; i++) {
    hash = (hash * 33) ^ content.charCodeAt(i);
  }
  return (hash >>> 0).toString(36);
}

/**
 * DependencyGraph tracks all file dependencies in a project.
 * Used to determine which files need rebuilding when a file changes.
 */
export class DependencyGraph {
  /** Map of file path to file node */
  #nodes = new Map<string, FileNode>();

  /** Graph version for cache invalidation */
  #version = 1;

  /** Timestamp of last build */
  #buildTime = 0;

  /**
   * Add or update a file in the graph.
   */
  addFile(path: string, content: string, imports: string[] = [], npmDeps: string[] = []): void {
    const contentHash = hashContent(content);
    const existing = this.#nodes.get(path);

    // Create or update the node
    const node: FileNode = {
      path,
      imports: new Set(imports),
      importedBy: existing?.importedBy ?? new Set(),
      npmDependencies: new Set(npmDeps),
      contentHash,
      lastModified: Date.now(),
    };

    // If updating, first remove old import relationships
    if (existing) {
      for (const oldImport of existing.imports) {
        const importedNode = this.#nodes.get(oldImport);
        if (importedNode) {
          importedNode.importedBy.delete(path);
        }
      }
    }

    // Add new import relationships (reverse pointers)
    for (const importPath of imports) {
      let importedNode = this.#nodes.get(importPath);
      if (!importedNode) {
        // Create placeholder for imported file
        importedNode = {
          path: importPath,
          imports: new Set(),
          importedBy: new Set(),
          npmDependencies: new Set(),
          contentHash: '',
          lastModified: 0,
        };
        this.#nodes.set(importPath, importedNode);
      }
      importedNode.importedBy.add(path);
    }

    this.#nodes.set(path, node);
  }

  /**
   * Remove a file from the graph.
   */
  removeFile(path: string): void {
    const node = this.#nodes.get(path);
    if (!node) return;

    // Remove from imports' importedBy sets
    for (const importPath of node.imports) {
      const importedNode = this.#nodes.get(importPath);
      if (importedNode) {
        importedNode.importedBy.delete(path);
      }
    }

    // Remove from dependents' imports sets
    for (const dependentPath of node.importedBy) {
      const dependentNode = this.#nodes.get(dependentPath);
      if (dependentNode) {
        dependentNode.imports.delete(path);
      }
    }

    this.#nodes.delete(path);
  }

  /**
   * Check if a file's content has changed.
   */
  hasFileChanged(path: string, newContent: string): boolean {
    const node = this.#nodes.get(path);
    if (!node) return true; // New file = changed

    const newHash = hashContent(newContent);
    return node.contentHash !== newHash;
  }

  /**
   * Get all files that need rebuilding when a file changes.
   * Returns the changed file + all files that depend on it (transitively).
   */
  getAffectedFiles(changedPath: string): Set<string> {
    const affected = new Set<string>();
    const queue = [changedPath];

    while (queue.length > 0) {
      const current = queue.shift()!;
      if (affected.has(current)) continue;

      affected.add(current);

      // Add all files that import this file
      const node = this.#nodes.get(current);
      if (node) {
        for (const dependent of node.importedBy) {
          if (!affected.has(dependent)) {
            queue.push(dependent);
          }
        }
      }
    }

    return affected;
  }

  /**
   * Get all files affected by multiple file changes.
   */
  getAffectedFilesForChanges(changedPaths: string[]): Set<string> {
    const affected = new Set<string>();
    for (const path of changedPaths) {
      for (const file of this.getAffectedFiles(path)) {
        affected.add(file);
      }
    }
    return affected;
  }

  /**
   * Get direct imports of a file.
   */
  getImports(path: string): string[] {
    const node = this.#nodes.get(path);
    return node ? Array.from(node.imports) : [];
  }

  /**
   * Get files that directly import a file.
   */
  getDependents(path: string): string[] {
    const node = this.#nodes.get(path);
    return node ? Array.from(node.importedBy) : [];
  }

  /**
   * Get NPM dependencies for a file.
   */
  getNpmDependencies(path: string): string[] {
    const node = this.#nodes.get(path);
    return node ? Array.from(node.npmDependencies) : [];
  }

  /**
   * Get all NPM packages used in the project.
   */
  getAllNpmDependencies(): Set<string> {
    const allDeps = new Set<string>();
    for (const node of this.#nodes.values()) {
      for (const dep of node.npmDependencies) {
        allDeps.add(dep);
      }
    }
    return allDeps;
  }

  /**
   * Check if any NPM dependencies changed.
   */
  hasNpmDependenciesChanged(newDeps: Set<string>): boolean {
    const currentDeps = this.getAllNpmDependencies();
    if (currentDeps.size !== newDeps.size) return true;

    for (const dep of newDeps) {
      if (!currentDeps.has(dep)) return true;
    }
    return false;
  }

  /**
   * Get entry points (files with no dependents).
   */
  getEntryPoints(): string[] {
    const entries: string[] = [];
    for (const node of this.#nodes.values()) {
      if (node.importedBy.size === 0 && node.contentHash !== '') {
        entries.push(node.path);
      }
    }
    return entries;
  }

  /**
   * Get leaf nodes (files with no imports).
   */
  getLeafNodes(): string[] {
    const leaves: string[] = [];
    for (const node of this.#nodes.values()) {
      if (node.imports.size === 0 && node.contentHash !== '') {
        leaves.push(node.path);
      }
    }
    return leaves;
  }

  /**
   * Check if the graph contains a file.
   */
  hasFile(path: string): boolean {
    return this.#nodes.has(path);
  }

  /**
   * Get total number of files in the graph.
   */
  get size(): number {
    return this.#nodes.size;
  }

  /**
   * Get all file paths in the graph.
   */
  getAllFiles(): string[] {
    return Array.from(this.#nodes.keys());
  }

  /**
   * Clear all data from the graph.
   */
  clear(): void {
    this.#nodes.clear();
    this.#buildTime = 0;
  }

  /**
   * Mark the current build time.
   */
  markBuildComplete(): void {
    this.#buildTime = Date.now();
  }

  /**
   * Get the last build time.
   */
  get buildTime(): number {
    return this.#buildTime;
  }

  /**
   * Serialize the graph for persistence.
   */
  serialize(): SerializedDependencyGraph {
    const files: SerializedFileNode[] = [];

    for (const node of this.#nodes.values()) {
      files.push({
        path: node.path,
        imports: Array.from(node.imports),
        importedBy: Array.from(node.importedBy),
        npmDependencies: Array.from(node.npmDependencies),
        contentHash: node.contentHash,
        lastModified: node.lastModified,
      });
    }

    return {
      version: this.#version,
      files,
      buildTime: this.#buildTime,
    };
  }

  /**
   * Restore the graph from serialized data.
   */
  static deserialize(data: SerializedDependencyGraph): DependencyGraph {
    const graph = new DependencyGraph();

    if (data.version !== graph.#version) {
      logger.warn(`Graph version mismatch: ${data.version} vs ${graph.#version}, starting fresh`);
      return graph;
    }

    for (const file of data.files) {
      const node: FileNode = {
        path: file.path,
        imports: new Set(file.imports),
        importedBy: new Set(file.importedBy),
        npmDependencies: new Set(file.npmDependencies),
        contentHash: file.contentHash,
        lastModified: file.lastModified,
      };
      graph.#nodes.set(file.path, node);
    }

    graph.#buildTime = data.buildTime;
    return graph;
  }

  /**
   * Get statistics about the graph.
   */
  getStats(): {
    totalFiles: number;
    totalImports: number;
    totalNpmDeps: number;
    avgImportsPerFile: number;
    maxDependents: { path: string; count: number };
  } {
    let totalImports = 0;
    const allNpmDeps = new Set<string>();
    let maxDependents = { path: '', count: 0 };

    for (const node of this.#nodes.values()) {
      totalImports += node.imports.size;
      for (const dep of node.npmDependencies) {
        allNpmDeps.add(dep);
      }
      if (node.importedBy.size > maxDependents.count) {
        maxDependents = { path: node.path, count: node.importedBy.size };
      }
    }

    return {
      totalFiles: this.#nodes.size,
      totalImports,
      totalNpmDeps: allNpmDeps.size,
      avgImportsPerFile: this.#nodes.size > 0 ? totalImports / this.#nodes.size : 0,
      maxDependents,
    };
  }

  /**
   * Debug: Print the graph structure.
   */
  debugPrint(): void {
    logger.info('=== Dependency Graph ===');
    for (const [path, node] of this.#nodes) {
      logger.info(`${path}:`);
      logger.info(`  imports: ${Array.from(node.imports).join(', ') || '(none)'}`);
      logger.info(`  importedBy: ${Array.from(node.importedBy).join(', ') || '(none)'}`);
      logger.info(`  npm: ${Array.from(node.npmDependencies).join(', ') || '(none)'}`);
    }
    logger.info('========================');
  }
}
