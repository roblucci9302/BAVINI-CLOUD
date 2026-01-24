/**
 * =============================================================================
 * Tests for BaviniFSAdapter
 * =============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest';
import { BaviniFSAdapter, createBaviniFSAdapter, type BaviniFSConfig } from './bavini-fs-adapter';
import { MemoryBackend, MountManager } from '~/lib/runtime/filesystem';

// Mock the agent stores
vi.mock('~/lib/stores/agents', () => ({
  addAgentLog: vi.fn(),
}));

describe('BaviniFSAdapter', () => {
  let adapter: BaviniFSAdapter;
  let mountManager: MountManager;
  let config: BaviniFSConfig;

  beforeEach(async () => {
    // Create fresh mount manager with memory backend for testing
    mountManager = new MountManager();
    const memoryBackend = new MemoryBackend();
    await mountManager.init({
      mounts: [{ path: '/', backend: memoryBackend }],
    });

    // Create default directories
    await mountManager.mkdir('/home', { recursive: true });
    await mountManager.mkdir('/src', { recursive: true });

    // Default config
    config = {
      strictMode: false,
      agentName: 'coder',
    };

    adapter = new BaviniFSAdapter(config, mountManager);
  });

  afterEach(async () => {
    await mountManager.destroy();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with provided config', () => {
      expect(adapter).toBeInstanceOf(BaviniFSAdapter);
    });

    it('should use factory function', () => {
      const factoryAdapter = createBaviniFSAdapter(config, mountManager);
      expect(factoryAdapter).toBeInstanceOf(BaviniFSAdapter);
    });
  });

  describe('readFile', () => {
    it('should read existing file', async () => {
      await mountManager.writeTextFile('/test.txt', 'Hello World');

      const result = await adapter.readFile('/test.txt');

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        content: 'Hello World',
        exists: true,
        size: 11,
      });
    });

    it('should return exists: false for non-existent file', async () => {
      const result = await adapter.readFile('/nonexistent.txt');

      expect(result.success).toBe(true);
      expect(result.output).toEqual({
        content: '',
        exists: false,
      });
    });

    it('should include execution time', async () => {
      await mountManager.writeTextFile('/test.txt', 'content');

      const result = await adapter.readFile('/test.txt');

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });
  });

  describe('listDirectory', () => {
    it('should list directory contents', async () => {
      await mountManager.writeTextFile('/src/app.ts', 'code');
      await mountManager.writeTextFile('/src/utils.ts', 'utils');
      await mountManager.mkdir('/src/components', { recursive: true });

      const result = await adapter.listDirectory('/src');

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        path: '/src',
      });

      const entries = (result.output as { entries: Array<{ name: string; type: string }> }).entries;
      expect(entries).toContainEqual({ name: 'app.ts', type: 'file' });
      expect(entries).toContainEqual({ name: 'utils.ts', type: 'file' });
      expect(entries).toContainEqual({ name: 'components', type: 'directory' });
    });

    it('should return error for non-existent directory', async () => {
      const result = await adapter.listDirectory('/nonexistent');

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
    });
  });

  describe('exists', () => {
    it('should return true for existing file', async () => {
      await mountManager.writeTextFile('/test.txt', 'content');

      const exists = await adapter.exists('/test.txt');

      expect(exists).toBe(true);
    });

    it('should return true for existing directory', async () => {
      const exists = await adapter.exists('/home');

      expect(exists).toBe(true);
    });

    it('should return false for non-existent path', async () => {
      const exists = await adapter.exists('/nonexistent');

      expect(exists).toBe(false);
    });
  });

  describe('stat', () => {
    it('should return file stats', async () => {
      await mountManager.writeTextFile('/test.txt', 'Hello');

      const result = await adapter.stat('/test.txt');

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        isFile: true,
        isDirectory: false,
        size: 5,
      });
    });

    it('should return directory stats', async () => {
      const result = await adapter.stat('/home');

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        isFile: false,
        isDirectory: true,
      });
    });

    it('should return exists: false for non-existent path', async () => {
      const result = await adapter.stat('/nonexistent');

      expect(result.success).toBe(true);
      expect(result.output).toEqual({ exists: false });
    });
  });

  describe('createFile', () => {
    it('should create new file', async () => {
      // Use relative path (action validator blocks absolute paths)
      const result = await adapter.createFile('src/newfile.txt', 'New content');

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        path: 'src/newfile.txt',
        size: 11,
      });

      // Verify file was created
      const content = await mountManager.readTextFile('/src/newfile.txt');
      expect(content).toBe('New content');
    });

    it('should create parent directories if needed', async () => {
      const result = await adapter.createFile('deep/nested/path/file.txt', 'content');

      expect(result.success).toBe(true);

      const exists = await mountManager.exists('/deep/nested/path');
      expect(exists).toBe(true);
    });

    it('should require approval in strict mode', async () => {
      const onApprovalRequired = vi.fn().mockResolvedValue(true);
      const strictAdapter = new BaviniFSAdapter(
        {
          ...config,
          strictMode: true,
          onApprovalRequired,
        },
        mountManager,
      );

      await strictAdapter.createFile('src/approved.txt', 'content');

      expect(onApprovalRequired).toHaveBeenCalled();
    });

    it('should reject if approval denied', async () => {
      const onApprovalRequired = vi.fn().mockResolvedValue(false);
      const strictAdapter = new BaviniFSAdapter(
        {
          ...config,
          strictMode: true,
          onApprovalRequired,
        },
        mountManager,
      );

      const result = await strictAdapter.createFile('src/rejected.txt', 'content');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Action rejected by user');
    });
  });

  describe('writeFile', () => {
    it('should create file if not exists', async () => {
      const result = await adapter.writeFile('src/new.txt', 'content');

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        path: 'src/new.txt',
        modified: false,
      });
    });

    it('should modify existing file', async () => {
      await mountManager.writeTextFile('/src/existing.txt', 'old content');

      const result = await adapter.writeFile('src/existing.txt', 'new content');

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        path: 'src/existing.txt',
        modified: true,
      });

      const content = await mountManager.readTextFile('/src/existing.txt');
      expect(content).toBe('new content');
    });
  });

  describe('deleteFile', () => {
    it('should delete existing file', async () => {
      await mountManager.writeTextFile('/src/todelete.txt', 'content');

      const result = await adapter.deleteFile('src/todelete.txt');

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        path: 'src/todelete.txt',
        deleted: true,
      });

      const exists = await mountManager.exists('/src/todelete.txt');
      expect(exists).toBe(false);
    });
  });

  describe('createDirectory', () => {
    it('should create directory', async () => {
      const result = await adapter.createDirectory('newdir');

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        path: 'newdir',
        created: true,
      });

      const exists = await mountManager.exists('/newdir');
      expect(exists).toBe(true);
    });

    it('should create nested directories', async () => {
      const result = await adapter.createDirectory('a/b/c/d');

      expect(result.success).toBe(true);

      const exists = await mountManager.exists('/a/b/c/d');
      expect(exists).toBe(true);
    });
  });

  describe('deleteDirectory', () => {
    it('should delete empty directory', async () => {
      await mountManager.mkdir('/emptydir', { recursive: true });

      const result = await adapter.deleteDirectory('emptydir');

      expect(result.success).toBe(true);
    });

    it('should delete directory recursively', async () => {
      await mountManager.mkdir('/dir/subdir', { recursive: true });
      await mountManager.writeTextFile('/dir/subdir/file.txt', 'content');

      const result = await adapter.deleteDirectory('dir', true);

      expect(result.success).toBe(true);

      const exists = await mountManager.exists('/dir');
      expect(exists).toBe(false);
    });
  });

  describe('copyFile', () => {
    it('should copy file', async () => {
      await mountManager.writeTextFile('/src/original.txt', 'original content');

      const result = await adapter.copyFile('src/original.txt', 'src/copy.txt');

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        src: 'src/original.txt',
        dest: 'src/copy.txt',
        copied: true,
      });

      const content = await mountManager.readTextFile('/src/copy.txt');
      expect(content).toBe('original content');
    });
  });

  describe('rename', () => {
    it('should rename file', async () => {
      await mountManager.writeTextFile('/src/old.txt', 'content');

      const result = await adapter.rename('src/old.txt', 'src/new.txt');

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        oldPath: 'src/old.txt',
        newPath: 'src/new.txt',
        renamed: true,
      });

      const oldExists = await mountManager.exists('/src/old.txt');
      const newExists = await mountManager.exists('/src/new.txt');
      expect(oldExists).toBe(false);
      expect(newExists).toBe(true);
    });
  });

  describe('getAllFiles', () => {
    it('should return all files recursively', async () => {
      await mountManager.writeTextFile('/src/app.ts', 'code');
      await mountManager.mkdir('/src/utils', { recursive: true });
      await mountManager.writeTextFile('/src/utils/helper.ts', 'helper');

      const files = await adapter.getAllFiles('src');

      expect(files).toContain('/src/app.ts');
      expect(files).toContain('/src/utils/helper.ts');
    });
  });

  describe('exportToJSON', () => {
    it('should export filesystem to JSON', async () => {
      await mountManager.writeTextFile('/src/file1.txt', 'content1');
      await mountManager.writeTextFile('/src/file2.txt', 'content2');

      const json = await adapter.exportToJSON('src');

      expect(json).toMatchObject({
        '/src/file1.txt': 'content1',
        '/src/file2.txt': 'content2',
      });
    });
  });

  describe('importFromJSON', () => {
    it('should import files from JSON', async () => {
      // Use relative paths without leading slash (action validator requirement)
      const data = {
        'imported/file1.txt': 'content1',
        'imported/file2.txt': 'content2',
      };

      const result = await adapter.importFromJSON(data);

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        imported: 2,
        total: 2,
      });

      const content1 = await mountManager.readTextFile('/imported/file1.txt');
      const content2 = await mountManager.readTextFile('/imported/file2.txt');
      expect(content1).toBe('content1');
      expect(content2).toBe('content2');
    });
  });

  describe('approval callbacks', () => {
    it('should call onActionExecuted after successful action', async () => {
      const onActionExecuted = vi.fn();
      const callbackAdapter = new BaviniFSAdapter(
        {
          ...config,
          onActionExecuted,
        },
        mountManager,
      );

      // Use relative path (action validator blocks absolute paths)
      await callbackAdapter.createFile('src/callback.txt', 'content');

      expect(onActionExecuted).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'file_create',
          agent: 'coder',
        }),
        expect.objectContaining({
          success: true,
        }),
      );
    });
  });
});
