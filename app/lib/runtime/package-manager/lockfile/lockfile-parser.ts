/**
 * =============================================================================
 * BAVINI Container - Lockfile Parser
 * =============================================================================
 * Parses and generates npm lockfiles (package-lock.json).
 * Supports npm v2/v3 lockfile format.
 * =============================================================================
 */

import type { PackageLock, PackageLockEntry, FlatDependency } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('LockfileParser');

/**
 * Parse options
 */
export interface ParseOptions {
  /** Strict mode - throw on invalid format */
  strict?: boolean;
}

/**
 * Lockfile parse result
 */
export interface ParseResult {
  lockfile: PackageLock;
  warnings: string[];
}

/**
 * Parse a package-lock.json string
 */
export function parseLockfile(content: string, options: ParseOptions = {}): ParseResult {
  const warnings: string[] = [];

  let data: unknown;

  try {
    data = JSON.parse(content);
  } catch (error) {
    if (options.strict) {
      throw new Error(`Invalid JSON in lockfile: ${error}`);
    }

    warnings.push('Invalid JSON in lockfile');
    return { lockfile: createEmptyLockfile(), warnings };
  }

  if (!isObject(data)) {
    if (options.strict) {
      throw new Error('Lockfile must be an object');
    }

    warnings.push('Lockfile must be an object');
    return { lockfile: createEmptyLockfile(), warnings };
  }

  // Extract basic fields
  const lockfile: PackageLock = {
    name: getString(data, 'name') ?? 'unknown',
    version: getString(data, 'version') ?? '0.0.0',
    lockfileVersion: getNumber(data, 'lockfileVersion') ?? 3,
    packages: {},
  };

  // Parse packages (v2/v3 format)
  if (hasKey(data, 'packages') && isObject(data.packages)) {
    for (const [path, pkgData] of Object.entries(data.packages)) {
      if (!isObject(pkgData)) {
        warnings.push(`Invalid package entry at ${path}`);
        continue;
      }

      lockfile.packages[path] = parsePackageEntry(pkgData, warnings);
    }
  }

  // Parse dependencies (v1 format fallback)
  if (Object.keys(lockfile.packages).length === 0 && hasKey(data, 'dependencies')) {
    parseLegacyDependencies(data.dependencies, lockfile.packages, '', warnings);
  }

  logger.debug(`Parsed lockfile with ${Object.keys(lockfile.packages).length} entries`);

  return { lockfile, warnings };
}

/**
 * Parse a package entry from lockfile
 */
function parsePackageEntry(data: Record<string, unknown>, warnings: string[]): PackageLockEntry {
  const entry: PackageLockEntry = {
    version: getString(data, 'version') ?? '0.0.0',
  };

  if (hasKey(data, 'resolved') && typeof data.resolved === 'string') {
    entry.resolved = data.resolved;
  }

  if (hasKey(data, 'integrity') && typeof data.integrity === 'string') {
    entry.integrity = data.integrity;
  }

  if (hasKey(data, 'dev') && data.dev === true) {
    entry.dev = true;
  }

  if (hasKey(data, 'optional') && data.optional === true) {
    entry.optional = true;
  }

  if (hasKey(data, 'dependencies') && isObject(data.dependencies)) {
    entry.dependencies = {};

    for (const [name, version] of Object.entries(data.dependencies)) {
      if (typeof version === 'string') {
        entry.dependencies[name] = version;
      }
    }
  }

  if (hasKey(data, 'peerDependencies') && isObject(data.peerDependencies)) {
    entry.peerDependencies = {};

    for (const [name, version] of Object.entries(data.peerDependencies)) {
      if (typeof version === 'string') {
        entry.peerDependencies[name] = version;
      }
    }
  }

  return entry;
}

/**
 * Parse v1 format dependencies recursively
 */
function parseLegacyDependencies(
  deps: unknown,
  packages: Record<string, PackageLockEntry>,
  parentPath: string,
  warnings: string[],
): void {
  if (!isObject(deps)) return;

  for (const [name, data] of Object.entries(deps)) {
    if (!isObject(data)) {
      warnings.push(`Invalid dependency entry for ${name}`);
      continue;
    }

    const path = parentPath ? `${parentPath}/node_modules/${name}` : `node_modules/${name}`;

    packages[path] = {
      version: getString(data, 'version') ?? '0.0.0',
      resolved: getString(data, 'resolved'),
      integrity: getString(data, 'integrity'),
      dev: data.dev === true,
      optional: data.optional === true,
    };

    // Recurse into nested dependencies
    if (hasKey(data, 'dependencies')) {
      parseLegacyDependencies(data.dependencies, packages, path, warnings);
    }
  }
}

/**
 * Generate a package-lock.json from flat dependencies
 */
export function generateLockfile(
  projectName: string,
  projectVersion: string,
  flatDeps: Map<string, FlatDependency>,
): PackageLock {
  const packages: Record<string, PackageLockEntry> = {
    '': {
      version: projectVersion,
    },
  };

  for (const [path, dep] of flatDeps) {
    packages[path] = {
      version: dep.version,
      resolved: dep.resolved,
      integrity: dep.integrity,
    };
  }

  return {
    name: projectName,
    version: projectVersion,
    lockfileVersion: 3,
    packages,
  };
}

/**
 * Stringify a lockfile to JSON
 */
export function stringifyLockfile(lockfile: PackageLock): string {
  return JSON.stringify(lockfile, null, 2);
}

/**
 * Extract flat dependencies from lockfile
 */
export function extractFlatDeps(lockfile: PackageLock): Map<string, FlatDependency> {
  const flat = new Map<string, FlatDependency>();

  for (const [path, entry] of Object.entries(lockfile.packages)) {
    // Skip root entry
    if (path === '') continue;

    // Extract package name from path
    const name = extractPackageName(path);

    if (!name) continue;

    flat.set(path, {
      name,
      version: entry.version,
      resolved: entry.resolved ?? '',
      integrity: entry.integrity,
      path,
    });
  }

  return flat;
}

/**
 * Extract package name from node_modules path
 */
function extractPackageName(path: string): string | null {
  // Handle: node_modules/@scope/name or node_modules/name
  const match = path.match(/node_modules\/(@[^/]+\/[^/]+|[^/]+)$/);
  return match ? match[1] : null;
}

/**
 * Create an empty lockfile
 */
function createEmptyLockfile(): PackageLock {
  return {
    name: 'unknown',
    version: '0.0.0',
    lockfileVersion: 3,
    packages: {},
  };
}

/**
 * Type guard for objects
 */
function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Check if object has key
 */
function hasKey<K extends string>(obj: Record<string, unknown>, key: K): obj is Record<K, unknown> {
  return key in obj;
}

/**
 * Safely get string value
 */
function getString(obj: Record<string, unknown>, key: string): string | undefined {
  const value = obj[key];
  return typeof value === 'string' ? value : undefined;
}

/**
 * Safely get number value
 */
function getNumber(obj: Record<string, unknown>, key: string): number | undefined {
  const value = obj[key];
  return typeof value === 'number' ? value : undefined;
}

/**
 * Check if lockfile has a specific package
 */
export function hasPackage(lockfile: PackageLock, name: string, version?: string): boolean {
  for (const [path, entry] of Object.entries(lockfile.packages)) {
    const pkgName = extractPackageName(path);

    if (pkgName === name) {
      if (version === undefined || entry.version === version) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get all versions of a package in lockfile
 */
export function getPackageVersions(lockfile: PackageLock, name: string): string[] {
  const versions: string[] = [];

  for (const [path, entry] of Object.entries(lockfile.packages)) {
    const pkgName = extractPackageName(path);

    if (pkgName === name) {
      versions.push(entry.version);
    }
  }

  return [...new Set(versions)];
}

/**
 * Merge two lockfiles (for incremental updates)
 */
export function mergeLockfiles(base: PackageLock, update: PackageLock): PackageLock {
  return {
    name: update.name || base.name,
    version: update.version || base.version,
    lockfileVersion: Math.max(base.lockfileVersion, update.lockfileVersion),
    packages: {
      ...base.packages,
      ...update.packages,
    },
  };
}
