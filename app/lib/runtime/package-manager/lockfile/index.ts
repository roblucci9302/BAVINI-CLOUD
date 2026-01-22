/**
 * =============================================================================
 * BAVINI Container - Lockfile Module
 * =============================================================================
 * Public exports for lockfile handling.
 * =============================================================================
 */

export {
  parseLockfile,
  generateLockfile,
  stringifyLockfile,
  extractFlatDeps,
  hasPackage,
  getPackageVersions,
  mergeLockfiles,
  type ParseOptions,
  type ParseResult,
} from './lockfile-parser';
