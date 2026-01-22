/**
 * Tests for lockfile parser
 */

import { describe, it, expect } from 'vitest';
import {
  parseLockfile,
  generateLockfile,
  stringifyLockfile,
  extractFlatDeps,
  hasPackage,
  getPackageVersions,
  mergeLockfiles,
} from '../lockfile/lockfile-parser';
import type { FlatDependency } from '../types';

describe('lockfile-parser', () => {
  describe('parseLockfile', () => {
    it('should parse valid lockfile v3', () => {
      const content = JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          '': {
            version: '1.0.0',
          },
          'node_modules/lodash': {
            version: '4.17.21',
            resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
            integrity: 'sha512-xxx',
          },
        },
      });

      const { lockfile, warnings } = parseLockfile(content);

      expect(lockfile.name).toBe('test-project');
      expect(lockfile.version).toBe('1.0.0');
      expect(lockfile.lockfileVersion).toBe(3);
      expect(lockfile.packages['node_modules/lodash'].version).toBe('4.17.21');
      expect(warnings).toHaveLength(0);
    });

    it('should handle invalid JSON', () => {
      const { lockfile, warnings } = parseLockfile('invalid json');

      expect(lockfile.name).toBe('unknown');
      expect(warnings).toContain('Invalid JSON in lockfile');
    });

    it('should handle invalid JSON in strict mode', () => {
      expect(() => parseLockfile('invalid', { strict: true })).toThrow('Invalid JSON');
    });

    it('should parse dev dependencies', () => {
      const content = JSON.stringify({
        name: 'test',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          'node_modules/typescript': {
            version: '5.0.0',
            dev: true,
          },
        },
      });

      const { lockfile } = parseLockfile(content);
      expect(lockfile.packages['node_modules/typescript'].dev).toBe(true);
    });

    it('should parse optional dependencies', () => {
      const content = JSON.stringify({
        name: 'test',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          'node_modules/fsevents': {
            version: '2.3.0',
            optional: true,
          },
        },
      });

      const { lockfile } = parseLockfile(content);
      expect(lockfile.packages['node_modules/fsevents'].optional).toBe(true);
    });

    it('should parse package dependencies', () => {
      const content = JSON.stringify({
        name: 'test',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          'node_modules/express': {
            version: '4.18.0',
            dependencies: {
              'body-parser': '^1.20.0',
            },
          },
        },
      });

      const { lockfile } = parseLockfile(content);
      expect(lockfile.packages['node_modules/express'].dependencies).toEqual({
        'body-parser': '^1.20.0',
      });
    });
  });

  describe('generateLockfile', () => {
    it('should generate lockfile from flat deps', () => {
      const flatDeps = new Map<string, FlatDependency>([
        [
          'node_modules/lodash',
          {
            name: 'lodash',
            version: '4.17.21',
            resolved: 'https://registry.npmjs.org/lodash/-/lodash-4.17.21.tgz',
            integrity: 'sha512-xxx',
            path: 'node_modules/lodash',
          },
        ],
      ]);

      const lockfile = generateLockfile('my-project', '1.0.0', flatDeps);

      expect(lockfile.name).toBe('my-project');
      expect(lockfile.version).toBe('1.0.0');
      expect(lockfile.lockfileVersion).toBe(3);
      expect(lockfile.packages['node_modules/lodash'].version).toBe('4.17.21');
    });
  });

  describe('stringifyLockfile', () => {
    it('should stringify lockfile to JSON', () => {
      const lockfile = {
        name: 'test',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {},
      };

      const str = stringifyLockfile(lockfile);
      expect(str).toContain('"name": "test"');
      expect(str).toContain('"lockfileVersion": 3');
    });
  });

  describe('extractFlatDeps', () => {
    it('should extract flat deps from lockfile', () => {
      const lockfile = {
        name: 'test',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          '': { version: '1.0.0' },
          'node_modules/lodash': {
            version: '4.17.21',
            resolved: 'https://example.com/lodash.tgz',
            integrity: 'sha512-xxx',
          },
          'node_modules/@types/node': {
            version: '18.0.0',
            resolved: 'https://example.com/types-node.tgz',
          },
        },
      };

      const flat = extractFlatDeps(lockfile);

      expect(flat.size).toBe(2);
      expect(flat.get('node_modules/lodash')?.name).toBe('lodash');
      expect(flat.get('node_modules/@types/node')?.name).toBe('@types/node');
    });

    it('should skip root entry', () => {
      const lockfile = {
        name: 'test',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          '': { version: '1.0.0' },
        },
      };

      const flat = extractFlatDeps(lockfile);
      expect(flat.size).toBe(0);
    });
  });

  describe('hasPackage', () => {
    it('should find package in lockfile', () => {
      const lockfile = {
        name: 'test',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          'node_modules/lodash': { version: '4.17.21' },
        },
      };

      expect(hasPackage(lockfile, 'lodash')).toBe(true);
      expect(hasPackage(lockfile, 'lodash', '4.17.21')).toBe(true);
      expect(hasPackage(lockfile, 'lodash', '4.0.0')).toBe(false);
      expect(hasPackage(lockfile, 'underscore')).toBe(false);
    });
  });

  describe('getPackageVersions', () => {
    it('should get all versions of a package', () => {
      const lockfile = {
        name: 'test',
        version: '1.0.0',
        lockfileVersion: 3,
        packages: {
          'node_modules/lodash': { version: '4.17.21' },
          'node_modules/pkg/node_modules/lodash': { version: '4.17.0' },
        },
      };

      const versions = getPackageVersions(lockfile, 'lodash');
      expect(versions).toContain('4.17.21');
      expect(versions).toContain('4.17.0');
    });
  });

  describe('mergeLockfiles', () => {
    it('should merge two lockfiles', () => {
      const base = {
        name: 'test',
        version: '1.0.0',
        lockfileVersion: 2,
        packages: {
          'node_modules/lodash': { version: '4.17.21' },
        },
      };

      const update = {
        name: 'test',
        version: '1.1.0',
        lockfileVersion: 3,
        packages: {
          'node_modules/express': { version: '4.18.0' },
        },
      };

      const merged = mergeLockfiles(base, update);

      expect(merged.version).toBe('1.1.0');
      expect(merged.lockfileVersion).toBe(3);
      expect(merged.packages['node_modules/lodash']).toBeDefined();
      expect(merged.packages['node_modules/express']).toBeDefined();
    });
  });
});
