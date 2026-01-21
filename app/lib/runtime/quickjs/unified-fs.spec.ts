/**
 * =============================================================================
 * BAVINI Runtime Engine - Unified FS Tests
 * =============================================================================
 */

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  UnifiedFSInstance,
  createUnifiedFS,
  getSharedFS,
  resetSharedFS,
} from './unified-fs';

describe('UnifiedFSInstance', () => {
  let fs: UnifiedFSInstance;

  beforeEach(() => {
    fs = createUnifiedFS();
  });

  describe('Basic File Operations', () => {
    it('should write and read files', () => {
      fs.writeFileSync('/test.txt', 'Hello World');
      const content = fs.readFileSync('/test.txt', 'utf-8');

      expect(content).toBe('Hello World');
    });

    it('should check file existence', () => {
      expect(fs.existsSync('/test.txt')).toBe(false);
      fs.writeFileSync('/test.txt', 'content');
      expect(fs.existsSync('/test.txt')).toBe(true);
    });

    it('should delete files', () => {
      fs.writeFileSync('/test.txt', 'content');
      expect(fs.existsSync('/test.txt')).toBe(true);

      fs.unlinkSync('/test.txt');
      expect(fs.existsSync('/test.txt')).toBe(false);
    });

    it('should rename files', () => {
      fs.writeFileSync('/old.txt', 'content');
      fs.renameSync('/old.txt', '/new.txt');

      expect(fs.existsSync('/old.txt')).toBe(false);
      expect(fs.existsSync('/new.txt')).toBe(true);
      expect(fs.readFileSync('/new.txt', 'utf-8')).toBe('content');
    });

    it('should copy files', () => {
      fs.writeFileSync('/source.txt', 'content');
      fs.copyFileSync('/source.txt', '/dest.txt');

      expect(fs.readFileSync('/source.txt', 'utf-8')).toBe('content');
      expect(fs.readFileSync('/dest.txt', 'utf-8')).toBe('content');
    });
  });

  describe('Directory Operations', () => {
    it('should create directories', () => {
      fs.mkdirSync('/mydir');
      expect(fs.existsSync('/mydir')).toBe(true);
    });

    it('should create nested directories with recursive option', () => {
      fs.mkdirSync('/a/b/c', { recursive: true });
      expect(fs.existsSync('/a/b/c')).toBe(true);
    });

    it('should list directory contents', () => {
      fs.writeFileSync('/dir/file1.txt', 'a');
      fs.writeFileSync('/dir/file2.txt', 'b');
      fs.mkdirSync('/dir/subdir', { recursive: true });

      const entries = fs.readdirSync('/dir');

      expect(entries).toContain('file1.txt');
      expect(entries).toContain('file2.txt');
      expect(entries).toContain('subdir');
    });

    it('should remove directories', () => {
      fs.mkdirSync('/mydir');
      fs.rmdirSync('/mydir');

      expect(fs.existsSync('/mydir')).toBe(false);
    });

    it('should remove directories recursively', () => {
      fs.mkdirSync('/dir/subdir', { recursive: true });
      fs.writeFileSync('/dir/subdir/file.txt', 'content');

      fs.rmdirSync('/dir', { recursive: true });

      expect(fs.existsSync('/dir')).toBe(false);
    });
  });

  describe('File Stats', () => {
    it('should return stats for files', () => {
      fs.writeFileSync('/test.txt', 'Hello');
      const stats = fs.statSync('/test.txt');

      expect(stats.isFile()).toBe(true);
      expect(stats.isDirectory()).toBe(false);
      expect(stats.size).toBe(5);
    });

    it('should return stats for directories', () => {
      fs.mkdirSync('/mydir');
      const stats = fs.statSync('/mydir');

      expect(stats.isFile()).toBe(false);
      expect(stats.isDirectory()).toBe(true);
    });
  });

  describe('Path Normalization', () => {
    it('should normalize relative paths', () => {
      fs.writeFileSync('test.txt', 'content');
      const content = fs.readFileSync('/test.txt', 'utf-8');

      expect(content).toBe('content');
    });

    it('should handle . and ..', () => {
      fs.writeFileSync('/a/b/test.txt', 'content');
      const content = fs.readFileSync('/a/b/../b/./test.txt', 'utf-8');

      expect(content).toBe('content');
    });
  });

  describe('Current Working Directory', () => {
    it('should have default cwd of /', () => {
      expect(fs.getCwd()).toBe('/');
    });

    it('should change cwd', () => {
      fs.mkdirSync('/mydir');
      fs.setCwd('/mydir');

      expect(fs.getCwd()).toBe('/mydir');
    });

    it('should throw when changing to non-existent directory', () => {
      expect(() => fs.setCwd('/nonexistent')).toThrow();
    });
  });

  describe('Async Operations', () => {
    it('should read files async', async () => {
      fs.writeFileSync('/test.txt', 'Hello');
      const content = await fs.readFile('/test.txt', 'utf-8');

      expect(content).toBe('Hello');
    });

    it('should write files async', async () => {
      await fs.writeFile('/test.txt', 'Hello');
      const content = fs.readFileSync('/test.txt', 'utf-8');

      expect(content).toBe('Hello');
    });
  });

  describe('Serialization', () => {
    it('should export to JSON', () => {
      fs.writeFileSync('/a.txt', 'content a');
      fs.writeFileSync('/b.txt', 'content b');

      const json = fs.toJSON();

      expect(json['/a.txt']).toBe('content a');
      expect(json['/b.txt']).toBe('content b');
    });

    it('should import from JSON', () => {
      fs.fromJSON({
        '/imported.txt': 'imported content',
        '/dir/nested.txt': 'nested content',
      });

      expect(fs.readFileSync('/imported.txt', 'utf-8')).toBe('imported content');
      expect(fs.readFileSync('/dir/nested.txt', 'utf-8')).toBe('nested content');
    });

    it('should clear all files', () => {
      fs.writeFileSync('/test.txt', 'content');
      fs.clear();

      expect(fs.existsSync('/test.txt')).toBe(false);
    });
  });

  describe('Default Directories', () => {
    it('should have /tmp', () => {
      expect(fs.existsSync('/tmp')).toBe(true);
    });

    it('should have /home', () => {
      expect(fs.existsSync('/home')).toBe(true);
    });

    it('should have /src', () => {
      expect(fs.existsSync('/src')).toBe(true);
    });
  });
});

describe('Shared FS', () => {
  afterEach(() => {
    resetSharedFS();
  });

  it('should return same instance', () => {
    const fs1 = getSharedFS();
    const fs2 = getSharedFS();

    expect(fs1).toBe(fs2);
  });

  it('should share data between calls', () => {
    const fs1 = getSharedFS();
    fs1.writeFileSync('/shared.txt', 'shared content');

    const fs2 = getSharedFS();
    expect(fs2.readFileSync('/shared.txt', 'utf-8')).toBe('shared content');
  });

  it('should reset shared instance', () => {
    const fs1 = getSharedFS();
    fs1.writeFileSync('/test.txt', 'content');

    resetSharedFS();

    const fs2 = getSharedFS();
    expect(fs2.existsSync('/test.txt')).toBe(false);
  });
});
