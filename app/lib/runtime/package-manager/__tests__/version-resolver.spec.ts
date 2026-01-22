/**
 * Tests for version resolver
 */

import { describe, it, expect } from 'vitest';
import {
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
} from '../resolver/version-resolver';

describe('version-resolver', () => {
  describe('parseVersion', () => {
    it('should parse simple version', () => {
      const v = parseVersion('1.2.3');
      expect(v).not.toBeNull();
      expect(v?.major).toBe(1);
      expect(v?.minor).toBe(2);
      expect(v?.patch).toBe(3);
    });

    it('should parse version with v prefix', () => {
      const v = parseVersion('v1.2.3');
      expect(v?.major).toBe(1);
    });

    it('should parse version with prerelease', () => {
      const v = parseVersion('1.2.3-alpha.1');
      expect(v?.prerelease).toEqual(['alpha', '1']);
    });

    it('should parse version with build metadata', () => {
      const v = parseVersion('1.2.3+build.123');
      expect(v?.build).toEqual(['build', '123']);
    });

    it('should return null for invalid version', () => {
      expect(parseVersion('invalid')).toBeNull();
      expect(parseVersion('1.2')).toBeNull();
      expect(parseVersion('a.b.c')).toBeNull();
    });
  });

  describe('formatVersion', () => {
    it('should format simple version', () => {
      const v = parseVersion('1.2.3')!;
      expect(formatVersion(v)).toBe('1.2.3');
    });

    it('should format version with prerelease', () => {
      const v = parseVersion('1.2.3-alpha.1')!;
      expect(formatVersion(v)).toBe('1.2.3-alpha.1');
    });
  });

  describe('compareVersions', () => {
    it('should compare major versions', () => {
      const a = parseVersion('2.0.0')!;
      const b = parseVersion('1.0.0')!;
      expect(compareVersions(a, b)).toBe(1);
      expect(compareVersions(b, a)).toBe(-1);
    });

    it('should compare minor versions', () => {
      const a = parseVersion('1.2.0')!;
      const b = parseVersion('1.1.0')!;
      expect(compareVersions(a, b)).toBe(1);
    });

    it('should compare patch versions', () => {
      const a = parseVersion('1.0.2')!;
      const b = parseVersion('1.0.1')!;
      expect(compareVersions(a, b)).toBe(1);
    });

    it('should return 0 for equal versions', () => {
      const a = parseVersion('1.2.3')!;
      const b = parseVersion('1.2.3')!;
      expect(compareVersions(a, b)).toBe(0);
    });

    it('should handle prerelease versions', () => {
      const release = parseVersion('1.0.0')!;
      const prerelease = parseVersion('1.0.0-alpha')!;
      expect(compareVersions(release, prerelease)).toBe(1);
    });

    it('should compare prerelease identifiers', () => {
      const a = parseVersion('1.0.0-alpha.2')!;
      const b = parseVersion('1.0.0-alpha.1')!;
      expect(compareVersions(a, b)).toBe(1);
    });
  });

  describe('comparison functions', () => {
    it('gt should return true when a > b', () => {
      expect(gt(parseVersion('2.0.0')!, parseVersion('1.0.0')!)).toBe(true);
      expect(gt(parseVersion('1.0.0')!, parseVersion('2.0.0')!)).toBe(false);
    });

    it('gte should return true when a >= b', () => {
      expect(gte(parseVersion('2.0.0')!, parseVersion('1.0.0')!)).toBe(true);
      expect(gte(parseVersion('1.0.0')!, parseVersion('1.0.0')!)).toBe(true);
    });

    it('lt should return true when a < b', () => {
      expect(lt(parseVersion('1.0.0')!, parseVersion('2.0.0')!)).toBe(true);
    });

    it('lte should return true when a <= b', () => {
      expect(lte(parseVersion('1.0.0')!, parseVersion('2.0.0')!)).toBe(true);
      expect(lte(parseVersion('1.0.0')!, parseVersion('1.0.0')!)).toBe(true);
    });

    it('eq should return true when a == b', () => {
      expect(eq(parseVersion('1.0.0')!, parseVersion('1.0.0')!)).toBe(true);
      expect(eq(parseVersion('1.0.0')!, parseVersion('1.0.1')!)).toBe(false);
    });
  });

  describe('parseRange', () => {
    it('should parse exact version', () => {
      const r = parseRange('1.0.0');
      expect(r.type).toBe('exact');
      expect(r.version?.major).toBe(1);
    });

    it('should parse caret range', () => {
      const r = parseRange('^1.2.3');
      expect(r.type).toBe('caret');
      expect(r.version?.minor).toBe(2);
    });

    it('should parse tilde range', () => {
      const r = parseRange('~1.2.3');
      expect(r.type).toBe('tilde');
    });

    it('should parse >= range', () => {
      const r = parseRange('>=1.0.0');
      expect(r.type).toBe('gte');
    });

    it('should parse > range', () => {
      const r = parseRange('>1.0.0');
      expect(r.type).toBe('gt');
    });

    it('should parse <= range', () => {
      const r = parseRange('<=1.0.0');
      expect(r.type).toBe('lte');
    });

    it('should parse < range', () => {
      const r = parseRange('<1.0.0');
      expect(r.type).toBe('lt');
    });

    it('should parse wildcard', () => {
      expect(parseRange('*').type).toBe('any');
      expect(parseRange('').type).toBe('any');
    });

    it('should parse OR ranges', () => {
      const r = parseRange('1.0.0 || 2.0.0');
      expect(r.type).toBe('or');
      expect(r.ranges).toHaveLength(2);
    });

    it('should parse hyphen range', () => {
      const r = parseRange('1.0.0 - 2.0.0');
      expect(r.type).toBe('range');
      expect(r.min?.major).toBe(1);
      expect(r.max?.major).toBe(2);
    });

    it('should parse tag', () => {
      const r = parseRange('latest');
      expect(r.type).toBe('tag');
      expect(r.tag).toBe('latest');
    });
  });

  describe('satisfies', () => {
    it('should satisfy exact version', () => {
      expect(satisfies('1.0.0', '1.0.0')).toBe(true);
      expect(satisfies('1.0.1', '1.0.0')).toBe(false);
    });

    it('should satisfy wildcard', () => {
      expect(satisfies('1.0.0', '*')).toBe(true);
      expect(satisfies('99.99.99', '*')).toBe(true);
    });

    it('should satisfy caret range', () => {
      expect(satisfies('1.2.3', '^1.0.0')).toBe(true);
      expect(satisfies('1.9.9', '^1.0.0')).toBe(true);
      expect(satisfies('2.0.0', '^1.0.0')).toBe(false);
    });

    it('should satisfy caret range for 0.x', () => {
      expect(satisfies('0.2.3', '^0.2.0')).toBe(true);
      expect(satisfies('0.3.0', '^0.2.0')).toBe(false);
    });

    it('should satisfy caret range for 0.0.x', () => {
      expect(satisfies('0.0.3', '^0.0.3')).toBe(true);
      expect(satisfies('0.0.4', '^0.0.3')).toBe(false);
    });

    it('should satisfy tilde range', () => {
      expect(satisfies('1.2.5', '~1.2.0')).toBe(true);
      expect(satisfies('1.3.0', '~1.2.0')).toBe(false);
    });

    it('should satisfy >= range', () => {
      expect(satisfies('1.0.0', '>=1.0.0')).toBe(true);
      expect(satisfies('2.0.0', '>=1.0.0')).toBe(true);
      expect(satisfies('0.9.9', '>=1.0.0')).toBe(false);
    });

    it('should satisfy > range', () => {
      expect(satisfies('1.0.1', '>1.0.0')).toBe(true);
      expect(satisfies('1.0.0', '>1.0.0')).toBe(false);
    });

    it('should satisfy <= range', () => {
      expect(satisfies('1.0.0', '<=1.0.0')).toBe(true);
      expect(satisfies('0.9.9', '<=1.0.0')).toBe(true);
      expect(satisfies('1.0.1', '<=1.0.0')).toBe(false);
    });

    it('should satisfy < range', () => {
      expect(satisfies('0.9.9', '<1.0.0')).toBe(true);
      expect(satisfies('1.0.0', '<1.0.0')).toBe(false);
    });

    it('should satisfy hyphen range', () => {
      expect(satisfies('1.5.0', '1.0.0 - 2.0.0')).toBe(true);
      expect(satisfies('1.0.0', '1.0.0 - 2.0.0')).toBe(true);
      expect(satisfies('2.0.0', '1.0.0 - 2.0.0')).toBe(true);
      expect(satisfies('2.0.1', '1.0.0 - 2.0.0')).toBe(false);
    });

    it('should satisfy OR range', () => {
      expect(satisfies('1.0.0', '1.0.0 || 2.0.0')).toBe(true);
      expect(satisfies('2.0.0', '1.0.0 || 2.0.0')).toBe(true);
      expect(satisfies('1.5.0', '1.0.0 || 2.0.0')).toBe(false);
    });
  });

  describe('maxSatisfying', () => {
    it('should find max satisfying version', () => {
      const versions = ['1.0.0', '1.1.0', '1.2.0', '2.0.0'];
      expect(maxSatisfying(versions, '^1.0.0')).toBe('1.2.0');
    });

    it('should return null if none satisfy', () => {
      const versions = ['1.0.0', '1.1.0'];
      expect(maxSatisfying(versions, '^2.0.0')).toBeNull();
    });

    it('should skip prerelease unless range includes it', () => {
      const versions = ['1.0.0', '1.1.0-alpha'];
      expect(maxSatisfying(versions, '^1.0.0')).toBe('1.0.0');
    });
  });

  describe('minSatisfying', () => {
    it('should find min satisfying version', () => {
      const versions = ['1.0.0', '1.1.0', '1.2.0', '2.0.0'];
      expect(minSatisfying(versions, '^1.0.0')).toBe('1.0.0');
    });
  });

  describe('sortVersions', () => {
    it('should sort versions in descending order', () => {
      const versions = ['1.0.0', '2.0.0', '1.5.0'];
      expect(sortVersions(versions)).toEqual(['2.0.0', '1.5.0', '1.0.0']);
    });
  });

  describe('isValidVersion', () => {
    it('should validate valid versions', () => {
      expect(isValidVersion('1.0.0')).toBe(true);
      expect(isValidVersion('v1.0.0')).toBe(true);
    });

    it('should reject invalid versions', () => {
      expect(isValidVersion('invalid')).toBe(false);
      expect(isValidVersion('1.0')).toBe(false);
    });
  });

  describe('isValidRange', () => {
    it('should validate valid ranges', () => {
      expect(isValidRange('^1.0.0')).toBe(true);
      expect(isValidRange('*')).toBe(true);
      expect(isValidRange('latest')).toBe(true);
    });
  });

  describe('cleanVersion', () => {
    it('should clean version string', () => {
      expect(cleanVersion('v1.0.0')).toBe('1.0.0');
      expect(cleanVersion('1.0.0')).toBe('1.0.0');
    });

    it('should return null for invalid', () => {
      expect(cleanVersion('invalid')).toBeNull();
    });
  });

  describe('VersionResolver', () => {
    it('should resolve version from available versions', () => {
      const resolver = new VersionResolver();
      const versions = ['1.0.0', '1.1.0', '1.2.0', '2.0.0'];
      const distTags = { latest: '2.0.0', next: '2.1.0-beta' };

      expect(resolver.resolveVersion(versions, '^1.0.0', distTags)).toBe('1.2.0');
      expect(resolver.resolveVersion(versions, 'latest', distTags)).toBe('2.0.0');
    });

    it('should check version compatibility', () => {
      const resolver = new VersionResolver();
      expect(resolver.isCompatible('1.2.0', '1.3.0')).toBe(true);
      expect(resolver.isCompatible('1.0.0', '2.0.0')).toBe(false);
    });

    it('should find version intersection', () => {
      const resolver = new VersionResolver();
      const versions = ['1.0.0', '1.1.0', '1.2.0', '2.0.0'];

      expect(resolver.intersect('^1.0.0', '<1.2.0', versions)).toBe('1.1.0');
    });
  });
});
