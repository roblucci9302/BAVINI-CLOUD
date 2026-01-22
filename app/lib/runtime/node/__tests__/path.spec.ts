/**
 * Unit tests for Node.js path module
 */

import { describe, it, expect } from 'vitest';
import * as path from '../core-modules/path';

describe('path module', () => {
  describe('join', () => {
    it('should join path segments', () => {
      expect(path.join('foo', 'bar', 'baz')).toBe('foo/bar/baz');
      expect(path.join('/foo', 'bar', 'baz')).toBe('/foo/bar/baz');
      expect(path.join('/foo', '/bar', 'baz')).toBe('/foo/bar/baz');
    });

    it('should normalize resulting path', () => {
      expect(path.join('foo', '..', 'bar')).toBe('bar');
      expect(path.join('foo', '.', 'bar')).toBe('foo/bar');
    });

    it('should handle empty segments', () => {
      expect(path.join('', 'foo')).toBe('foo');
      expect(path.join('foo', '')).toBe('foo');
    });
  });

  describe('resolve', () => {
    it('should resolve absolute paths', () => {
      const result1 = path.resolve('/foo/bar', './baz');
      expect(result1.replace(/\/$/, '')).toBe('/foo/bar/baz');
      expect(path.resolve('/foo/bar', '/tmp/file').replace(/\/$/, '')).toBe('/tmp/file');
    });

    it('should resolve relative paths', () => {
      const result = path.resolve('foo', 'bar');
      expect(result).toMatch(/foo\/bar/);
    });
  });

  describe('dirname', () => {
    it('should return directory name', () => {
      expect(path.dirname('/foo/bar/baz.txt')).toBe('/foo/bar');
      expect(path.dirname('/foo/bar')).toBe('/foo');
      expect(path.dirname('/foo')).toBe('/');
    });
  });

  describe('basename', () => {
    it('should return base name', () => {
      expect(path.basename('/foo/bar/baz.txt')).toBe('baz.txt');
      expect(path.basename('/foo/bar/baz.txt', '.txt')).toBe('baz');
    });
  });

  describe('extname', () => {
    it('should return extension', () => {
      expect(path.extname('foo.txt')).toBe('.txt');
      expect(path.extname('foo.bar.txt')).toBe('.txt');
      expect(path.extname('foo')).toBe('');
      expect(path.extname('.hidden')).toBe('');
    });
  });

  describe('normalize', () => {
    it('should normalize paths', () => {
      expect(path.normalize('/foo/bar//baz/asdf/quux/..')).toBe('/foo/bar/baz/asdf');
      expect(path.normalize('foo/../bar')).toBe('bar');
    });
  });

  describe('isAbsolute', () => {
    it('should check if path is absolute', () => {
      expect(path.isAbsolute('/foo/bar')).toBe(true);
      expect(path.isAbsolute('foo/bar')).toBe(false);
      expect(path.isAbsolute('./foo')).toBe(false);
    });
  });

  describe('relative', () => {
    it('should compute relative path', () => {
      expect(path.relative('/data/orandea/test/aaa', '/data/orandea/impl/bbb')).toBe('../../impl/bbb');
    });
  });

  describe('parse', () => {
    it('should parse path', () => {
      const parsed = path.parse('/home/user/dir/file.txt');
      expect(parsed.root).toBe('/');
      expect(parsed.dir).toBe('/home/user/dir');
      expect(parsed.base).toBe('file.txt');
      expect(parsed.ext).toBe('.txt');
      expect(parsed.name).toBe('file');
    });
  });

  describe('format', () => {
    it('should format path object', () => {
      const formatted = path.format({
        root: '/',
        dir: '/home/user/dir',
        base: 'file.txt',
      });
      expect(formatted).toBe('/home/user/dir/file.txt');
    });
  });

  describe('sep and delimiter', () => {
    it('should have correct separator', () => {
      expect(path.sep).toBe('/');
    });

    it('should have correct delimiter', () => {
      expect(path.delimiter).toBe(':');
    });
  });
});
