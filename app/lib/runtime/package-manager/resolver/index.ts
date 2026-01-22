/**
 * =============================================================================
 * BAVINI Container - Resolver Module
 * =============================================================================
 * Public exports for dependency resolution.
 * =============================================================================
 */

// Version resolver
export {
  parseVersion,
  formatVersion,
  compareVersions,
  gt,
  gte,
  lt,
  lte,
  eq,
  parseRange,
  satisfies,
  maxSatisfying,
  minSatisfying,
  sortVersions,
  isValidVersion,
  isValidRange,
  cleanVersion,
  VersionResolver,
  type ParsedVersion,
  type ParsedRange,
  type RangeType,
} from './version-resolver';

// Dependency tree
export {
  DependencyTree,
  analyzeConflicts,
  calculateSize,
  type ResolutionOptions,
  type ResolutionResult,
} from './dependency-tree';
