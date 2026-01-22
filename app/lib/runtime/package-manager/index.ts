/**
 * =============================================================================
 * BAVINI Container - Package Manager Module
 * =============================================================================
 * Public exports for npm-compatible package management.
 * =============================================================================
 */

// Main package manager
export { BaviniPM, type BaviniPMConfig } from './bavini-pm';

// Types
export type {
  PackageJson,
  PackageMetadata,
  PackageVersionInfo,
  ResolvedPackage,
  DependencyNode,
  FlatDependency,
  InstallOptions,
  InstallProgress,
  InstallResult,
  PackageLock,
  PackageLockEntry,
  CachedPackage,
  ScriptResult,
  SemverRange,
  ResolvedVersion,
  RegistryConfig,
} from './types';

export { PMError, PMErrorCode, DEFAULT_REGISTRY, ESM_SH_REGISTRY } from './types';

// Registry
export { RegistryClient, getRegistryClient } from './registry/registry-client';
export { extractTarball, shouldIncludeFile, getFileExtension, type ExtractionResult, type ExtractedFile } from './registry/tarball-extractor';

// Resolver
export {
  VersionResolver,
  parseVersion,
  formatVersion,
  compareVersions,
  satisfies,
  maxSatisfying,
  minSatisfying,
  sortVersions,
  isValidVersion,
  isValidRange,
  DependencyTree,
  analyzeConflicts,
  type ParsedVersion,
  type ParsedRange,
  type ResolutionOptions,
  type ResolutionResult,
} from './resolver';

// Cache
export { PackageCache, getPackageCache, type CacheConfig } from './cache';

// Lockfile
export {
  parseLockfile,
  generateLockfile,
  stringifyLockfile,
  extractFlatDeps,
  hasPackage,
  getPackageVersions,
  mergeLockfiles,
} from './lockfile';
