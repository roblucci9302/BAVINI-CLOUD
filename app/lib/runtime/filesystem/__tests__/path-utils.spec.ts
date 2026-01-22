/**
 * Tests for path utilities
 */

import { describe, it, expect } from 'vitest';
import {
  normalizePath,
  dirname,
  basename,
  extname,
  join,
  resolve,
  relative,
  isAbsolute,
  isRoot,
  isInside,
  parse,
  isValidPath,
  getAncestors,
} from '../path-utils';

describe('path-utils', () => {
  describe('normalizePath', () => {
    it('should normalize absolute paths', () => {
      expect(normalizePath('/foo/bar')).toBe('/foo/bar');
      expect(normalizePath('/foo/bar/')).toBe('/foo/bar');
      expect(normalizePath('/foo//bar')).toBe('/foo/bar');
    });

    it('should resolve relative paths', () => {
      expect(normalizePath('foo/bar', '/home')).toBe('/home/foo/bar');
      expect(normalizePath('./foo', '/home')).toBe('/home/foo');
    });

    it('should resolve . and ..', () => {
      expect(normalizePath('/foo/./bar')).toBe('/foo/bar');
      expect(normalizePath('/foo/../bar')).toBe('/bar');
      expect(normalizePath('/foo/bar/../baz')).toBe('/foo/baz');
      expect(normalizePath('/foo/bar/../../baz')).toBe('/baz');
    });

    it('should handle root path', () => {
      expect(normalizePath('/')).toBe('/');
      expect(normalizePath('/..')).toBe('/');
    });

    it('should handle empty path', () => {
      expect(normalizePath('', '/home')).toBe('/home');
    });
  });

  describe('dirname', () => {
    it('should return parent directory', () => {
      expect(dirname('/foo/bar')).toBe('/foo');
      expect(dirname('/foo/bar/baz')).toBe('/foo/bar');
    });

    it('should return root for single-level paths', () => {
      expect(dirname('/foo')).toBe('/');
    });

    it('should return root for root', () => {
      expect(dirname('/')).toBe('/');
    });
  });

  describe('basename', () => {
    it('should return last component', () => {
      expect(basename('/foo/bar')).toBe('bar');
      expect(basename('/foo/bar/baz.txt')).toBe('baz.txt');
    });

    it('should return empty string for root', () => {
      expect(basename('/')).toBe('');
    });
  });

  describe('extname', () => {
    it('should return extension', () => {
      expect(extname('/foo/bar.txt')).toBe('.txt');
      expect(extname('/foo/bar.spec.ts')).toBe('.ts');
    });

    it('should return empty string for no extension', () => {
      expect(extname('/foo/bar')).toBe('');
      expect(extname('/foo/.gitignore')).toBe('');
    });
  });

  describe('join', () => {
    it('should join path segments', () => {
      expect(join('/foo', 'bar', 'baz')).toBe('/foo/bar/baz');
      expect(join('/foo', 'bar/baz')).toBe('/foo/bar/baz');
    });

    it('should handle empty segments', () => {
      expect(join('/')).toBe('/');
      expect(join()).toBe('/');
    });
  });

  describe('resolve', () => {
    it('should resolve relative to base', () => {
      expect(resolve('/home', 'foo')).toBe('/home/foo');
      expect(resolve('/home', './foo')).toBe('/home/foo');
    });

    it('should handle absolute paths', () => {
      expect(resolve('/home', '/foo')).toBe('/foo');
    });
  });

  describe('relative', () => {
    it('should return relative path', () => {
      expect(relative('/home', '/home/foo/bar')).toBe('foo/bar');
      expect(relative('/home/foo', '/home/bar')).toBe('../bar');
    });

    it('should return . for same path', () => {
      expect(relative('/home', '/home')).toBe('.');
    });
  });

  describe('isAbsolute', () => {
    it('should detect absolute paths', () => {
      expect(isAbsolute('/foo')).toBe(true);
      expect(isAbsolute('foo')).toBe(false);
    });
  });

  describe('isRoot', () => {
    it('should detect root path', () => {
      expect(isRoot('/')).toBe(true);
      expect(isRoot('/foo')).toBe(false);
    });
  });

  describe('isInside', () => {
    it('should check if path is inside parent', () => {
      expect(isInside('/home', '/home/foo')).toBe(true);
      expect(isInside('/home', '/home')).toBe(true);
      expect(isInside('/home', '/other')).toBe(false);
    });

    it('should handle root as parent', () => {
      expect(isInside('/', '/foo')).toBe(true);
    });
  });

  describe('parse', () => {
    it('should parse path components', () => {
      const result = parse('/foo/bar.txt');
      expect(result.dir).toBe('/foo');
      expect(result.base).toBe('bar.txt');
      expect(result.ext).toBe('.txt');
      expect(result.name).toBe('bar');
    });
  });

  describe('isValidPath', () => {
    it('should reject paths with null bytes', () => {
      expect(isValidPath('/foo\0bar')).toBe(false);
    });

    it('should accept valid paths', () => {
      expect(isValidPath('/foo/bar')).toBe(true);
    });
  });

  describe('getAncestors', () => {
    it('should return all ancestor paths', () => {
      expect(getAncestors('/foo/bar/baz')).toEqual(['/', '/foo', '/foo/bar', '/foo/bar/baz']);
    });

    it('should handle root', () => {
      expect(getAncestors('/')).toEqual(['/']);
    });
  });
});
