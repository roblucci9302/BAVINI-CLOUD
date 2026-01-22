/**
 * =============================================================================
 * BAVINI Container - Package Manager Types
 * =============================================================================
 * Type definitions for the virtual npm package manager.
 * =============================================================================
 */

/**
 * Package.json structure (partial)
 */
export interface PackageJson {
  name: string;
  version: string;
  description?: string;
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, string | Record<string, string>>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  scripts?: Record<string, string>;
  bin?: string | Record<string, string>;
  files?: string[];
  repository?: { type: string; url: string } | string;
  license?: string;
  engines?: { node?: string; npm?: string };
}

/**
 * Package metadata from npm registry
 */
export interface PackageMetadata {
  name: string;
  description?: string;
  'dist-tags': Record<string, string>;
  versions: Record<string, PackageVersionInfo>;
  time?: Record<string, string>;
  repository?: { type: string; url: string };
  license?: string;
}

/**
 * Package version info from registry
 */
export interface PackageVersionInfo {
  name: string;
  version: string;
  description?: string;
  main?: string;
  module?: string;
  types?: string;
  exports?: Record<string, string | Record<string, string>>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
  bin?: string | Record<string, string>;
  dist: {
    tarball: string;
    shasum: string;
    integrity?: string;
    fileCount?: number;
    unpackedSize?: number;
  };
}

/**
 * Resolved package in dependency tree
 */
export interface ResolvedPackage {
  name: string;
  version: string;
  resolved: string; // tarball URL
  integrity?: string;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optional?: boolean;
  dev?: boolean;
}

/**
 * Dependency tree node
 */
export interface DependencyNode {
  name: string;
  version: string;
  resolved: ResolvedPackage;
  dependencies: Map<string, DependencyNode>;
  parent?: DependencyNode;
  depth: number;
}

/**
 * Flattened dependency for node_modules
 */
export interface FlatDependency {
  name: string;
  version: string;
  resolved: string;
  integrity?: string;
  path: string; // path in node_modules
  binaries?: Record<string, string>;
}

/**
 * Install options
 */
export interface InstallOptions {
  /** Save to dependencies */
  save?: boolean;
  /** Save to devDependencies */
  saveDev?: boolean;
  /** Install production deps only */
  production?: boolean;
  /** Don't save to package.json */
  noSave?: boolean;
  /** Force reinstall */
  force?: boolean;
  /** Progress callback */
  onProgress?: (progress: InstallProgress) => void;
}

/**
 * Install progress
 */
export interface InstallProgress {
  phase: 'resolving' | 'downloading' | 'extracting' | 'linking';
  current: number;
  total: number;
  package?: string;
  message?: string;
}

/**
 * Install result
 */
export interface InstallResult {
  success: boolean;
  installed: Array<{ name: string; version: string }>;
  warnings: string[];
  errors: string[];
  duration: number;
}

/**
 * Package-lock.json structure (npm v2/v3)
 */
export interface PackageLock {
  name: string;
  version: string;
  lockfileVersion: number;
  packages: Record<string, PackageLockEntry>;
}

/**
 * Package-lock.json entry
 */
export interface PackageLockEntry {
  version: string;
  resolved?: string;
  integrity?: string;
  dev?: boolean;
  optional?: boolean;
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/**
 * Cached package info
 */
export interface CachedPackage {
  name: string;
  version: string;
  tarballUrl: string;
  integrity?: string;
  files: Map<string, Uint8Array>;
  packageJson: PackageJson;
  cachedAt: number;
  lastUsed: number;
  size: number;
}

/**
 * Script execution result
 */
export interface ScriptResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  duration: number;
}

/**
 * Semver range types
 */
export type SemverRange =
  | string // "^1.0.0", "~2.0.0", ">=1.0.0", etc.
  | '*'
  | 'latest';

/**
 * Resolved version with source
 */
export interface ResolvedVersion {
  version: string;
  source: 'registry' | 'cache' | 'lockfile';
}

/**
 * Registry endpoint configuration
 */
export interface RegistryConfig {
  url: string;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Default npm registry
 */
export const DEFAULT_REGISTRY = 'https://registry.npmjs.org';

/**
 * ESM.sh CDN for direct imports
 */
export const ESM_SH_REGISTRY = 'https://esm.sh';

/**
 * Error codes for package manager
 */
export const PMErrorCode = {
  PACKAGE_NOT_FOUND: 'PACKAGE_NOT_FOUND',
  VERSION_NOT_FOUND: 'VERSION_NOT_FOUND',
  NETWORK_ERROR: 'NETWORK_ERROR',
  TARBALL_ERROR: 'TARBALL_ERROR',
  INTEGRITY_ERROR: 'INTEGRITY_ERROR',
  DEPENDENCY_CONFLICT: 'DEPENDENCY_CONFLICT',
  SCRIPT_ERROR: 'SCRIPT_ERROR',
  INVALID_PACKAGE_JSON: 'INVALID_PACKAGE_JSON',
  /** FIX 1.5: Added for circular dependency / infinite loop protection */
  RESOLUTION_LIMIT: 'RESOLUTION_LIMIT',
} as const;

/**
 * Package manager error
 */
export class PMError extends Error {
  code: keyof typeof PMErrorCode;
  package?: string;
  version?: string;

  constructor(code: keyof typeof PMErrorCode, message: string, pkg?: string, version?: string) {
    super(message);
    this.name = 'PMError';
    this.code = code;
    this.package = pkg;
    this.version = version;
  }
}
