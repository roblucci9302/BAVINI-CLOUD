/**
 * Tests for memory backend
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryBackend } from '../backends/memory-backend';
import { TextUtils } from '../types';

describe('MemoryBackend', () => {
  let backend: MemoryBackend;

  beforeEach(async () => {
    backend = new MemoryBackend();
    await backend.init();
  });

  afterEach(async () => {
    await backend.destroy();
  });

  describe('capabilities', () => {
    it('should report correct capabilities', () => {
      expect(backend.name).toBe('memory');
      expect(backend.capabilities.persistent).toBe(false);
      expect(backend.capabilities.syncAccess).toBe(true);
    });
  });

  describe('file operations', () => {
    it('should write and read a file', async () => {
      const content = 'Hello, World!';
      await backend.writeFile('/test.txt', TextUtils.encode(content));

      const data = await backend.readFile('/test.txt');
      expect(TextUtils.decode(data)).toBe(content);
    });

    it('should overwrite existing file', async () => {
      await backend.writeFile('/test.txt', TextUtils.encode('first'));
      await backend.writeFile('/test.txt', TextUtils.encode('second'));

      const data = await backend.readFile('/test.txt');
      expect(TextUtils.decode(data)).toBe('second');
    });

    it('should throw ENOENT for non-existent file', async () => {
      await expect(backend.readFile('/nonexistent.txt')).rejects.toThrow('ENOENT');
    });

    it('should unlink a file', async () => {
      await backend.writeFile('/test.txt', TextUtils.encode('content'));
      await backend.unlink('/test.txt');

      await expect(backend.readFile('/test.txt')).rejects.toThrow('ENOENT');
    });

    it('should throw EISDIR when reading directory as file', async () => {
      await backend.mkdir('/testdir');
      await expect(backend.readFile('/testdir')).rejects.toThrow('EISDIR');
    });

    it('should copy a file', async () => {
      await backend.writeFile('/source.txt', TextUtils.encode('content'));
      await backend.copyFile('/source.txt', '/dest.txt');

      const data = await backend.readFile('/dest.txt');
      expect(TextUtils.decode(data)).toBe('content');
    });
  });

  describe('directory operations', () => {
    it('should create a directory', async () => {
      await backend.mkdir('/testdir');
      const stat = await backend.stat('/testdir');
      expect(stat.isDirectory).toBe(true);
    });

    it('should create nested directories with recursive', async () => {
      await backend.mkdir('/a/b/c', { recursive: true });
      expect(await backend.exists('/a/b/c')).toBe(true);
    });

    it('should throw ENOENT without recursive for nested dir', async () => {
      await expect(backend.mkdir('/a/b/c')).rejects.toThrow('ENOENT');
    });

    it('should list directory contents', async () => {
      await backend.mkdir('/testdir');
      await backend.writeFile('/testdir/file1.txt', TextUtils.encode(''));
      await backend.writeFile('/testdir/file2.txt', TextUtils.encode(''));

      const entries = await backend.readdir('/testdir');
      expect(entries).toContain('file1.txt');
      expect(entries).toContain('file2.txt');
    });

    it('should list directory with types', async () => {
      await backend.mkdir('/testdir');
      await backend.mkdir('/testdir/subdir');
      await backend.writeFile('/testdir/file.txt', TextUtils.encode(''));

      const entries = await backend.readdirWithTypes('/testdir');
      const subdir = entries.find((e) => e.name === 'subdir');
      const file = entries.find((e) => e.name === 'file.txt');

      expect(subdir?.isDirectory).toBe(true);
      expect(file?.isFile).toBe(true);
    });

    it('should remove empty directory', async () => {
      await backend.mkdir('/testdir');
      await backend.rmdir('/testdir');
      expect(await backend.exists('/testdir')).toBe(false);
    });

    it('should throw ENOTEMPTY for non-empty directory', async () => {
      await backend.mkdir('/testdir');
      await backend.writeFile('/testdir/file.txt', TextUtils.encode(''));

      await expect(backend.rmdir('/testdir')).rejects.toThrow('ENOTEMPTY');
    });

    it('should remove non-empty directory with recursive', async () => {
      await backend.mkdir('/testdir');
      await backend.writeFile('/testdir/file.txt', TextUtils.encode(''));

      await backend.rmdir('/testdir', { recursive: true });
      expect(await backend.exists('/testdir')).toBe(false);
    });
  });

  describe('stat', () => {
    it('should return stats for file', async () => {
      await backend.writeFile('/test.txt', TextUtils.encode('hello'));

      const stat = await backend.stat('/test.txt');
      expect(stat.isFile).toBe(true);
      expect(stat.isDirectory).toBe(false);
      expect(stat.size).toBe(5);
    });

    it('should return stats for directory', async () => {
      await backend.mkdir('/testdir');

      const stat = await backend.stat('/testdir');
      expect(stat.isFile).toBe(false);
      expect(stat.isDirectory).toBe(true);
    });

    it('should throw ENOENT for non-existent path', async () => {
      await expect(backend.stat('/nonexistent')).rejects.toThrow('ENOENT');
    });
  });

  describe('rename', () => {
    it('should rename a file', async () => {
      await backend.writeFile('/old.txt', TextUtils.encode('content'));
      await backend.rename('/old.txt', '/new.txt');

      expect(await backend.exists('/old.txt')).toBe(false);
      const data = await backend.readFile('/new.txt');
      expect(TextUtils.decode(data)).toBe('content');
    });

    it('should rename a directory', async () => {
      await backend.mkdir('/olddir');
      await backend.writeFile('/olddir/file.txt', TextUtils.encode(''));

      await backend.rename('/olddir', '/newdir');

      expect(await backend.exists('/olddir')).toBe(false);
      expect(await backend.exists('/newdir/file.txt')).toBe(true);
    });
  });

  describe('exists', () => {
    it('should return true for existing path', async () => {
      await backend.mkdir('/testdir');
      expect(await backend.exists('/testdir')).toBe(true);
    });

    it('should return false for non-existing path', async () => {
      expect(await backend.exists('/nonexistent')).toBe(false);
    });
  });
});
