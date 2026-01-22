/**
 * =============================================================================
 * BAVINI Container - Dependency Tree
 * =============================================================================
 * Builds and manages the dependency tree for npm packages.
 * Implements depth-first resolution with conflict detection.
 * =============================================================================
 */

import type { PackageMetadata, DependencyNode, ResolvedPackage, FlatDependency } from '../types';
import { PMError } from '../types';
import { RegistryClient } from '../registry/registry-client';
import { VersionResolver, parseVersion, formatVersion, sortVersions, satisfies } from './version-resolver';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DependencyTree');

/**
 * Resolution options
 */
export interface ResolutionOptions {
  /** Include dev dependencies */
  dev?: boolean;
  /** Include peer dependencies */
  peer?: boolean;
  /** Maximum resolution depth */
  maxDepth?: number;
  /** Progress callback */
  onProgress?: (pkg: string, depth: number) => void;
}

/**
 * Resolution result
 */
export interface ResolutionResult {
  tree: DependencyNode;
  flat: Map<string, FlatDependency>;
  warnings: string[];
}

/**
 * Builds dependency trees from npm packages
 * FIX 1.5: Added protection against circular dependency infinite loops
 */
export class DependencyTree {
  private _registry: RegistryClient;
  private _versionResolver: VersionResolver;
  private _resolving: Map<string, Promise<DependencyNode | null>> = new Map();
  private _resolved: Map<string, ResolvedPackage> = new Map();
  private _maxDepth = 50;

  /**
   * FIX 1.5: Track packages currently being resolved to detect cycles
   */
  private _inProgress: Set<string> = new Set();

  /**
   * FIX 1.5: Global iteration counter to prevent infinite loops
   */
  private _iterationCount = 0;
  private readonly MAX_ITERATIONS = 10000;

  constructor(registry?: RegistryClient) {
    this._registry = registry ?? new RegistryClient();
    this._versionResolver = new VersionResolver();
  }

  /**
   * Resolve dependencies for a package.json
   * FIX 1.5: Reset state and track iterations to prevent infinite loops
   */
  async resolve(
    dependencies: Record<string, string>,
    options: ResolutionOptions = {},
  ): Promise<ResolutionResult> {
    // FIX 1.5: Reset state for new resolution
    this._inProgress.clear();
    this._iterationCount = 0;

    const warnings: string[] = [];
    const rootNode: DependencyNode = {
      name: 'root',
      version: '0.0.0',
      resolved: {
        name: 'root',
        version: '0.0.0',
        resolved: '',
      },
      dependencies: new Map(),
      depth: 0,
    };

    this._maxDepth = options.maxDepth ?? 50;

    // Resolve all top-level dependencies
    const entries = Object.entries(dependencies);
    logger.debug(`Resolving ${entries.length} dependencies`);

    for (const [name, range] of entries) {
      try {
        options.onProgress?.(name, 0);

        const node = await this._resolvePackage(name, range, 1, rootNode, options);

        if (node) {
          rootNode.dependencies.set(name, node);
        }
      } catch (error) {
        if (error instanceof PMError) {
          warnings.push(`${name}: ${error.message}`);
        } else {
          warnings.push(`${name}: ${String(error)}`);
        }
      }
    }

    // Flatten tree for node_modules layout
    const flat = this._flatten(rootNode);

    return {
      tree: rootNode,
      flat,
      warnings,
    };
  }

  /**
   * Resolve a single package and its dependencies
   * FIX 1.5: Added iteration limit and in-progress tracking
   */
  private async _resolvePackage(
    name: string,
    range: string,
    depth: number,
    parent: DependencyNode,
    options: ResolutionOptions,
  ): Promise<DependencyNode | null> {
    // FIX 1.5: Check global iteration limit to prevent infinite loops
    this._iterationCount++;
    if (this._iterationCount > this.MAX_ITERATIONS) {
      throw new PMError(
        'RESOLUTION_LIMIT',
        `Resolution limit exceeded (${this.MAX_ITERATIONS} iterations). Possible infinite loop or extremely large dependency tree.`,
        name,
        range
      );
    }

    // Check depth limit
    if (depth > this._maxDepth) {
      logger.warn(`Max depth reached for ${name}`);
      return null;
    }

    // FIX 1.5: Check if package is currently being resolved (cycle in progress)
    if (this._inProgress.has(name)) {
      logger.debug(`Circular dependency detected (in-progress): ${name}`);
      return null;
    }

    // Check for circular dependency in ancestor chain
    if (this._hasCircular(name, parent)) {
      logger.debug(`Circular dependency detected (ancestor): ${name}`);
      return null;
    }

    // Create unique key for this resolution
    const key = `${name}@${range}`;

    // Check if already resolving (dedup)
    const existing = this._resolving.get(key);

    if (existing) {
      return existing;
    }

    // FIX 1.5: Mark as in-progress before starting resolution
    this._inProgress.add(name);

    const promise = this._doResolve(name, range, depth, parent, options);
    this._resolving.set(key, promise);

    try {
      return await promise;
    } finally {
      this._resolving.delete(key);
      // FIX 1.5: Remove from in-progress when done
      this._inProgress.delete(name);
    }
  }

  /**
   * Actually resolve a package
   */
  private async _doResolve(
    name: string,
    range: string,
    depth: number,
    parent: DependencyNode,
    options: ResolutionOptions,
  ): Promise<DependencyNode | null> {
    // Get package metadata
    const metadata = await this._registry.getPackageMetadata(name);

    // Resolve version
    const availableVersions = Object.keys(metadata.versions);
    const resolvedVersion = this._versionResolver.resolveVersion(
      availableVersions,
      range,
      metadata['dist-tags'],
    );

    if (!resolvedVersion) {
      throw new PMError('VERSION_NOT_FOUND', `No version matching '${range}' for '${name}'`, name, range);
    }

    // Get version info
    const versionInfo = metadata.versions[resolvedVersion];

    if (!versionInfo) {
      throw new PMError('VERSION_NOT_FOUND', `Version '${resolvedVersion}' not found for '${name}'`, name, resolvedVersion);
    }

    // Check if we already have this exact version resolved
    const cacheKey = `${name}@${resolvedVersion}`;
    const cached = this._resolved.get(cacheKey);

    if (cached) {
      // Return existing resolution
      return {
        name,
        version: resolvedVersion,
        resolved: cached,
        dependencies: new Map(),
        parent,
        depth,
      };
    }

    // Create resolved package
    const resolved: ResolvedPackage = {
      name,
      version: resolvedVersion,
      resolved: versionInfo.dist.tarball,
      integrity: versionInfo.dist.integrity,
      dependencies: versionInfo.dependencies,
      peerDependencies: versionInfo.peerDependencies,
    };

    // Cache it
    this._resolved.set(cacheKey, resolved);

    // Create node
    const node: DependencyNode = {
      name,
      version: resolvedVersion,
      resolved,
      dependencies: new Map(),
      parent,
      depth,
    };

    options.onProgress?.(name, depth);

    // Resolve sub-dependencies
    const deps = versionInfo.dependencies ?? {};

    for (const [depName, depRange] of Object.entries(deps)) {
      try {
        const childNode = await this._resolvePackage(depName, depRange, depth + 1, node, options);

        if (childNode) {
          node.dependencies.set(depName, childNode);
        }
      } catch (error) {
        logger.warn(`Failed to resolve ${depName}@${depRange}:`, error);
      }
    }

    // Optionally resolve peer dependencies
    if (options.peer) {
      const peerDeps = versionInfo.peerDependencies ?? {};

      for (const [peerName, peerRange] of Object.entries(peerDeps)) {
        // Check if peer is already satisfied by ancestors
        if (!this._peerSatisfied(peerName, peerRange, parent)) {
          try {
            const peerNode = await this._resolvePackage(peerName, peerRange, depth + 1, node, options);

            if (peerNode) {
              node.dependencies.set(peerName, peerNode);
            }
          } catch {
            logger.warn(`Unmet peer dependency: ${peerName}@${peerRange}`);
          }
        }
      }
    }

    return node;
  }

  /**
   * Check for circular dependency
   */
  private _hasCircular(name: string, node: DependencyNode | undefined): boolean {
    let current = node;

    while (current) {
      if (current.name === name) {
        return true;
      }

      current = current.parent;
    }

    return false;
  }

  /**
   * Check if a peer dependency is satisfied by ancestors
   */
  private _peerSatisfied(name: string, range: string, node: DependencyNode | undefined): boolean {
    let current = node;

    while (current) {
      if (current.name === name) {
        return satisfies(current.version, range);
      }

      current = current.parent;
    }

    return false;
  }

  /**
   * Flatten dependency tree for node_modules layout
   * Uses npm-style hoisting
   */
  private _flatten(root: DependencyNode): Map<string, FlatDependency> {
    const flat = new Map<string, FlatDependency>();
    const hoisted = new Map<string, string>(); // name -> version at root

    // First pass: collect all packages and try to hoist
    this._collectPackages(root, flat, hoisted, '');

    return flat;
  }

  /**
   * Collect packages recursively with hoisting
   */
  private _collectPackages(
    node: DependencyNode,
    flat: Map<string, FlatDependency>,
    hoisted: Map<string, string>,
    parentPath: string,
  ): void {
    for (const [name, child] of node.dependencies) {
      const hoistedVersion = hoisted.get(name);
      let path: string;

      if (!hoistedVersion) {
        // Hoist to root level
        path = `node_modules/${name}`;
        hoisted.set(name, child.version);
      } else if (hoistedVersion === child.version) {
        // Already hoisted with same version, skip
        continue;
      } else {
        // Version conflict, nest under parent
        path = `${parentPath}/node_modules/${name}`;
      }

      // Get binaries if any
      const binaries = this._extractBinaries(child.resolved);

      flat.set(path, {
        name,
        version: child.version,
        resolved: child.resolved.resolved,
        integrity: child.resolved.integrity,
        path,
        binaries,
      });

      // Recurse
      this._collectPackages(child, flat, hoisted, path);
    }
  }

  /**
   * Extract binary definitions from package
   */
  private _extractBinaries(resolved: ResolvedPackage): Record<string, string> | undefined {
    // Would need package.json bin field from versionInfo
    // For now return undefined, will be filled during install
    return undefined;
  }

  /**
   * Get resolution stats
   */
  getStats(): { resolved: number; cached: number } {
    return {
      resolved: this._resolved.size,
      cached: this._resolving.size,
    };
  }

  /**
   * Clear resolution caches
   * FIX 1.5: Also clears in-progress tracking
   */
  clearCache(): void {
    this._resolved.clear();
    this._resolving.clear();
    this._inProgress.clear();
    this._iterationCount = 0;
  }
}

/**
 * Analyze dependency tree for conflicts
 */
export function analyzeConflicts(
  flat: Map<string, FlatDependency>,
): Array<{ name: string; versions: string[]; paths: string[] }> {
  const byName = new Map<string, Array<{ version: string; path: string }>>();

  for (const [path, dep] of flat) {
    const existing = byName.get(dep.name) ?? [];
    existing.push({ version: dep.version, path });
    byName.set(dep.name, existing);
  }

  const conflicts: Array<{ name: string; versions: string[]; paths: string[] }> = [];

  for (const [name, instances] of byName) {
    const uniqueVersions = [...new Set(instances.map((i) => i.version))];

    if (uniqueVersions.length > 1) {
      conflicts.push({
        name,
        versions: uniqueVersions,
        paths: instances.map((i) => i.path),
      });
    }
  }

  return conflicts;
}

/**
 * Calculate total download size
 */
export function calculateSize(flat: Map<string, FlatDependency>): number {
  // Without actually downloading, we can't know the size
  // This would need size info from registry metadata
  return flat.size * 50000; // Rough estimate: 50KB per package
}
