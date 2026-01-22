/**
 * =============================================================================
 * BAVINI Container - Version Resolver
 * =============================================================================
 * Resolves semver version ranges to specific versions.
 * Implements npm-compatible semver resolution.
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('VersionResolver');

/**
 * Parsed semver version
 */
export interface ParsedVersion {
  major: number;
  minor: number;
  patch: number;
  prerelease: string[];
  build: string[];
  raw: string;
}

/**
 * Semver range types
 */
export type RangeType =
  | 'exact' // 1.0.0
  | 'caret' // ^1.0.0
  | 'tilde' // ~1.0.0
  | 'gt' // >1.0.0
  | 'gte' // >=1.0.0
  | 'lt' // <1.0.0
  | 'lte' // <=1.0.0
  | 'range' // 1.0.0 - 2.0.0
  | 'or' // 1.0.0 || 2.0.0
  | 'any' // * or latest
  | 'tag'; // latest, next, etc.

/**
 * Parsed version range
 */
export interface ParsedRange {
  type: RangeType;
  version?: ParsedVersion;
  min?: ParsedVersion;
  max?: ParsedVersion;
  ranges?: ParsedRange[];
  tag?: string;
  raw: string;
}

/**
 * Version regex pattern
 * Matches: major.minor.patch[-prerelease][+build]
 */
const VERSION_REGEX = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?(?:\+([0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*))?$/;

/**
 * Parse a version string into components
 */
export function parseVersion(version: string): ParsedVersion | null {
  const trimmed = version.trim();
  const match = trimmed.match(VERSION_REGEX);

  if (!match) {
    return null;
  }

  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
    prerelease: match[4] ? match[4].split('.') : [],
    build: match[5] ? match[5].split('.') : [],
    raw: trimmed,
  };
}

/**
 * Format a parsed version back to string
 */
export function formatVersion(version: ParsedVersion): string {
  let str = `${version.major}.${version.minor}.${version.patch}`;

  if (version.prerelease.length > 0) {
    str += `-${version.prerelease.join('.')}`;
  }

  if (version.build.length > 0) {
    str += `+${version.build.join('.')}`;
  }

  return str;
}

/**
 * Compare two versions
 * Returns: -1 if a < b, 0 if a == b, 1 if a > b
 */
export function compareVersions(a: ParsedVersion, b: ParsedVersion): number {
  // Compare major.minor.patch
  if (a.major !== b.major) return a.major > b.major ? 1 : -1;
  if (a.minor !== b.minor) return a.minor > b.minor ? 1 : -1;
  if (a.patch !== b.patch) return a.patch > b.patch ? 1 : -1;

  // Prerelease versions have lower precedence
  if (a.prerelease.length === 0 && b.prerelease.length > 0) return 1;
  if (a.prerelease.length > 0 && b.prerelease.length === 0) return -1;

  // Compare prerelease identifiers
  const maxLen = Math.max(a.prerelease.length, b.prerelease.length);

  for (let i = 0; i < maxLen; i++) {
    if (i >= a.prerelease.length) return -1;
    if (i >= b.prerelease.length) return 1;

    const aId = a.prerelease[i];
    const bId = b.prerelease[i];

    const aNum = parseInt(aId, 10);
    const bNum = parseInt(bId, 10);

    // Numeric identifiers have lower precedence than alphanumeric
    if (!isNaN(aNum) && !isNaN(bNum)) {
      if (aNum !== bNum) return aNum > bNum ? 1 : -1;
    } else if (!isNaN(aNum)) {
      return -1;
    } else if (!isNaN(bNum)) {
      return 1;
    } else {
      // Both are strings, compare lexically
      if (aId !== bId) return aId > bId ? 1 : -1;
    }
  }

  return 0;
}

/**
 * Check if version a is greater than version b
 */
export function gt(a: ParsedVersion, b: ParsedVersion): boolean {
  return compareVersions(a, b) > 0;
}

/**
 * Check if version a is greater than or equal to version b
 */
export function gte(a: ParsedVersion, b: ParsedVersion): boolean {
  return compareVersions(a, b) >= 0;
}

/**
 * Check if version a is less than version b
 */
export function lt(a: ParsedVersion, b: ParsedVersion): boolean {
  return compareVersions(a, b) < 0;
}

/**
 * Check if version a is less than or equal to version b
 */
export function lte(a: ParsedVersion, b: ParsedVersion): boolean {
  return compareVersions(a, b) <= 0;
}

/**
 * Check if version a equals version b
 */
export function eq(a: ParsedVersion, b: ParsedVersion): boolean {
  return compareVersions(a, b) === 0;
}

/**
 * Parse a semver range string
 */
export function parseRange(range: string): ParsedRange {
  const trimmed = range.trim();

  // Handle OR ranges (||)
  if (trimmed.includes('||')) {
    const parts = trimmed.split('||').map((p) => p.trim());
    return {
      type: 'or',
      ranges: parts.map(parseRange),
      raw: trimmed,
    };
  }

  // Handle any/wildcard
  if (trimmed === '*' || trimmed === '' || trimmed === 'x' || trimmed === 'X') {
    return { type: 'any', raw: trimmed };
  }

  // Handle tags
  if (trimmed === 'latest' || trimmed === 'next' || trimmed === 'beta' || trimmed === 'alpha') {
    return { type: 'tag', tag: trimmed, raw: trimmed };
  }

  // Handle hyphen range (1.0.0 - 2.0.0)
  const hyphenMatch = trimmed.match(/^([^\s]+)\s+-\s+([^\s]+)$/);

  if (hyphenMatch) {
    const min = parseVersion(hyphenMatch[1]);
    const max = parseVersion(hyphenMatch[2]);

    if (min && max) {
      return { type: 'range', min, max, raw: trimmed };
    }
  }

  // Handle caret range (^1.0.0)
  if (trimmed.startsWith('^')) {
    const version = parseVersion(trimmed.slice(1));

    if (version) {
      return { type: 'caret', version, raw: trimmed };
    }
  }

  // Handle tilde range (~1.0.0)
  if (trimmed.startsWith('~')) {
    const version = parseVersion(trimmed.slice(1));

    if (version) {
      return { type: 'tilde', version, raw: trimmed };
    }
  }

  // Handle >= range
  if (trimmed.startsWith('>=')) {
    const version = parseVersion(trimmed.slice(2));

    if (version) {
      return { type: 'gte', version, raw: trimmed };
    }
  }

  // Handle > range
  if (trimmed.startsWith('>')) {
    const version = parseVersion(trimmed.slice(1));

    if (version) {
      return { type: 'gt', version, raw: trimmed };
    }
  }

  // Handle <= range
  if (trimmed.startsWith('<=')) {
    const version = parseVersion(trimmed.slice(2));

    if (version) {
      return { type: 'lte', version, raw: trimmed };
    }
  }

  // Handle < range
  if (trimmed.startsWith('<')) {
    const version = parseVersion(trimmed.slice(1));

    if (version) {
      return { type: 'lt', version, raw: trimmed };
    }
  }

  // Handle = prefix (exact)
  if (trimmed.startsWith('=')) {
    const version = parseVersion(trimmed.slice(1));

    if (version) {
      return { type: 'exact', version, raw: trimmed };
    }
  }

  // Handle exact version
  const exactVersion = parseVersion(trimmed);

  if (exactVersion) {
    return { type: 'exact', version: exactVersion, raw: trimmed };
  }

  // Treat unknown as tag
  return { type: 'tag', tag: trimmed, raw: trimmed };
}

/**
 * Check if a version satisfies a caret range (^)
 * ^1.2.3 := >=1.2.3 <2.0.0
 * ^0.2.3 := >=0.2.3 <0.3.0
 * ^0.0.3 := >=0.0.3 <0.0.4
 */
function satisfiesCaret(version: ParsedVersion, base: ParsedVersion): boolean {
  if (lt(version, base)) return false;

  if (base.major > 0) {
    // ^1.2.3 := >=1.2.3 <2.0.0
    return version.major === base.major;
  } else if (base.minor > 0) {
    // ^0.2.3 := >=0.2.3 <0.3.0
    return version.major === 0 && version.minor === base.minor;
  } else {
    // ^0.0.3 := >=0.0.3 <0.0.4
    return version.major === 0 && version.minor === 0 && version.patch === base.patch;
  }
}

/**
 * Check if a version satisfies a tilde range (~)
 * ~1.2.3 := >=1.2.3 <1.3.0
 */
function satisfiesTilde(version: ParsedVersion, base: ParsedVersion): boolean {
  if (lt(version, base)) return false;

  return version.major === base.major && version.minor === base.minor;
}

/**
 * Check if a version satisfies a range
 */
export function satisfies(version: ParsedVersion | string, range: ParsedRange | string): boolean {
  const ver = typeof version === 'string' ? parseVersion(version) : version;
  const rng = typeof range === 'string' ? parseRange(range) : range;

  if (!ver) {
    logger.warn(`Invalid version: ${version}`);
    return false;
  }

  switch (rng.type) {
    case 'any':
      return true;

    case 'exact':
      return rng.version ? eq(ver, rng.version) : false;

    case 'caret':
      return rng.version ? satisfiesCaret(ver, rng.version) : false;

    case 'tilde':
      return rng.version ? satisfiesTilde(ver, rng.version) : false;

    case 'gt':
      return rng.version ? gt(ver, rng.version) : false;

    case 'gte':
      return rng.version ? gte(ver, rng.version) : false;

    case 'lt':
      return rng.version ? lt(ver, rng.version) : false;

    case 'lte':
      return rng.version ? lte(ver, rng.version) : false;

    case 'range':
      if (!rng.min || !rng.max) return false;
      return gte(ver, rng.min) && lte(ver, rng.max);

    case 'or':
      if (!rng.ranges) return false;
      return rng.ranges.some((r) => satisfies(ver, r));

    case 'tag':
      // Tags need to be resolved via registry first
      return false;

    default:
      return false;
  }
}

/**
 * Find the maximum version that satisfies a range
 */
export function maxSatisfying(versions: string[], range: string): string | null {
  const parsedRange = parseRange(range);
  let best: ParsedVersion | null = null;

  for (const ver of versions) {
    const parsed = parseVersion(ver);

    if (!parsed) continue;

    // Skip prereleases unless range explicitly includes them
    if (parsed.prerelease.length > 0) {
      const rangeVersion = parsedRange.version;

      if (!rangeVersion || rangeVersion.prerelease.length === 0) {
        continue;
      }
    }

    if (satisfies(parsed, parsedRange)) {
      if (!best || gt(parsed, best)) {
        best = parsed;
      }
    }
  }

  return best ? formatVersion(best) : null;
}

/**
 * Find the minimum version that satisfies a range
 */
export function minSatisfying(versions: string[], range: string): string | null {
  const parsedRange = parseRange(range);
  let best: ParsedVersion | null = null;

  for (const ver of versions) {
    const parsed = parseVersion(ver);

    if (!parsed) continue;

    // Skip prereleases unless range explicitly includes them
    if (parsed.prerelease.length > 0) {
      const rangeVersion = parsedRange.version;

      if (!rangeVersion || rangeVersion.prerelease.length === 0) {
        continue;
      }
    }

    if (satisfies(parsed, parsedRange)) {
      if (!best || lt(parsed, best)) {
        best = parsed;
      }
    }
  }

  return best ? formatVersion(best) : null;
}

/**
 * Sort versions in descending order (highest first)
 */
export function sortVersions(versions: string[]): string[] {
  return versions
    .map((v) => ({ raw: v, parsed: parseVersion(v) }))
    .filter((v) => v.parsed !== null)
    .sort((a, b) => compareVersions(b.parsed!, a.parsed!))
    .map((v) => v.raw);
}

/**
 * Check if a version string is valid
 */
export function isValidVersion(version: string): boolean {
  return parseVersion(version) !== null;
}

/**
 * Check if a range string is valid
 */
export function isValidRange(range: string): boolean {
  const parsed = parseRange(range);
  return parsed.type !== 'tag' || ['latest', 'next', 'beta', 'alpha'].includes(parsed.tag ?? '');
}

/**
 * Clean a version string (remove leading v, etc.)
 */
export function cleanVersion(version: string): string | null {
  const parsed = parseVersion(version);
  return parsed ? formatVersion(parsed) : null;
}

/**
 * Version resolver class for registry integration
 */
export class VersionResolver {
  /**
   * Resolve a version range to a specific version
   */
  resolveVersion(availableVersions: string[], range: string, distTags?: Record<string, string>): string | null {
    const parsedRange = parseRange(range);

    // Handle tags
    if (parsedRange.type === 'tag' && distTags) {
      const taggedVersion = distTags[parsedRange.tag ?? 'latest'];

      if (taggedVersion) {
        return taggedVersion;
      }
    }

    // Find max satisfying version
    return maxSatisfying(availableVersions, range);
  }

  /**
   * Check if version A is compatible with version B
   * Uses caret range logic
   */
  isCompatible(versionA: string, versionB: string): boolean {
    const a = parseVersion(versionA);
    const b = parseVersion(versionB);

    if (!a || !b) return false;

    // Same major version (for non-zero major)
    if (a.major > 0 && b.major > 0) {
      return a.major === b.major;
    }

    // For 0.x versions, same minor
    if (a.major === 0 && b.major === 0) {
      return a.minor === b.minor;
    }

    return false;
  }

  /**
   * Find the intersection of two version ranges
   */
  intersect(rangeA: string, rangeB: string, availableVersions: string[]): string | null {
    const candidates = availableVersions.filter((v) => satisfies(v, rangeA) && satisfies(v, rangeB));

    if (candidates.length === 0) return null;

    const sorted = sortVersions(candidates);
    return sorted[0];
  }
}
