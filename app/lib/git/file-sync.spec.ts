import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { WebContainer } from '@webcontainer/api';

// mock LightningFS via operations
const mockFs = {
  promises: {
    readdir: vi.fn(),
    stat: vi.fn(),
    readFile: vi.fn(),
    writeFile: vi.fn(),
    mkdir: vi.fn(),
  },
};

vi.mock('./operations', () => ({
  getFs: vi.fn(() => mockFs),
}));

// mock logger
vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

describe('GitFileSync', () => {
  let mockWebContainer: WebContainer;

  beforeEach(() => {
    vi.clearAllMocks();

    // create mock WebContainer
    mockWebContainer = {
      fs: {
        mkdir: vi.fn().mockResolvedValue(undefined),
        writeFile: vi.fn().mockResolvedValue(undefined),
        readFile: vi.fn().mockResolvedValue(new Uint8Array()),
        readdir: vi.fn().mockResolvedValue([]),
        rm: vi.fn().mockResolvedValue(undefined),
      },
    } as unknown as WebContainer;
  });

  describe('syncToWebContainer', () => {
    it('should sync files from LightningFS to WebContainer', async () => {
      const { syncToWebContainer } = await import('./file-sync');

      // mock directory structure
      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path === '/home/project') {
          return ['src', 'package.json'];
        }

        if (path === '/home/project/src') {
          return ['index.ts'];
        }

        return [];
      });

      mockFs.promises.stat.mockImplementation(async (path: string) => {
        if (path.includes('src') && !path.includes('.')) {
          return { isDirectory: () => true };
        }

        return { isDirectory: () => false };
      });

      mockFs.promises.readFile.mockResolvedValue('file content');

      const stats = await syncToWebContainer(mockWebContainer, '/home/project');

      expect(stats.files).toBeGreaterThan(0);
      expect(mockWebContainer.fs.writeFile).toHaveBeenCalled();
    });

    it('should skip .git directory', async () => {
      const { syncToWebContainer } = await import('./file-sync');

      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path === '/home/project') {
          return ['.git', 'src'];
        }

        if (path === '/home/project/src') {
          return ['index.ts'];
        }

        return [];
      });

      mockFs.promises.stat.mockImplementation(async (path: string) => {
        if (path.includes('.git') || (path.includes('src') && !path.includes('.'))) {
          return { isDirectory: () => true };
        }

        return { isDirectory: () => false };
      });

      mockFs.promises.readFile.mockResolvedValue('content');

      await syncToWebContainer(mockWebContainer, '/home/project');

      // .git should not be created
      const mkdirCalls = vi.mocked(mockWebContainer.fs.mkdir).mock.calls;
      const gitDirCreated = mkdirCalls.some((call) => call[0].includes('.git'));

      expect(gitDirCreated).toBe(false);
    });

    it('should skip node_modules directory', async () => {
      const { syncToWebContainer } = await import('./file-sync');

      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path === '/home/project') {
          return ['node_modules', 'src'];
        }

        return [];
      });

      mockFs.promises.stat.mockImplementation(async () => ({ isDirectory: () => true }));

      await syncToWebContainer(mockWebContainer, '/home/project');

      const mkdirCalls = vi.mocked(mockWebContainer.fs.mkdir).mock.calls;
      const nodeModulesCreated = mkdirCalls.some((call) => call[0].includes('node_modules'));

      expect(nodeModulesCreated).toBe(false);
    });

    it('should handle empty directory', async () => {
      const { syncToWebContainer } = await import('./file-sync');

      mockFs.promises.readdir.mockResolvedValue([]);

      const stats = await syncToWebContainer(mockWebContainer, '/home/project');

      expect(stats.files).toBe(0);
      expect(stats.folders).toBe(0);
    });

    it('should track errors for failed file syncs', async () => {
      const { syncToWebContainer } = await import('./file-sync');

      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path === '/home/project') {
          return ['broken.txt'];
        }

        return [];
      });

      mockFs.promises.stat.mockResolvedValue({ isDirectory: () => false });
      mockFs.promises.readFile.mockRejectedValue(new Error('Read error'));

      const stats = await syncToWebContainer(mockWebContainer, '/home/project');

      expect(stats.errors.length).toBeGreaterThan(0);
    });

    it('should handle Uint8Array file content', async () => {
      const { syncToWebContainer } = await import('./file-sync');

      mockFs.promises.readdir.mockImplementation(async (path: string) => {
        if (path === '/home/project') {
          return ['binary.png'];
        }

        return [];
      });

      mockFs.promises.stat.mockResolvedValue({ isDirectory: () => false });

      const binaryContent = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
      mockFs.promises.readFile.mockResolvedValue(binaryContent);

      const stats = await syncToWebContainer(mockWebContainer, '/home/project');

      expect(stats.files).toBe(1);
      expect(mockWebContainer.fs.writeFile).toHaveBeenCalledWith('binary.png', binaryContent);
    });
  });

  describe('syncFileToLightningFS', () => {
    it('should sync a single file to LightningFS', async () => {
      const { syncFileToLightningFS } = await import('./file-sync');

      vi.mocked(mockWebContainer.fs.readFile).mockResolvedValue(new Uint8Array([72, 101, 108, 108, 111]) as any);

      await syncFileToLightningFS(mockWebContainer, '/home/project', 'src/index.ts');

      expect(mockWebContainer.fs.readFile).toHaveBeenCalledWith('src/index.ts');
      expect(mockFs.promises.writeFile).toHaveBeenCalled();
    });

    it('should skip .git files', async () => {
      const { syncFileToLightningFS } = await import('./file-sync');

      await syncFileToLightningFS(mockWebContainer, '/home/project', '.git/config');

      expect(mockWebContainer.fs.readFile).not.toHaveBeenCalled();
    });

    it('should create parent directories', async () => {
      const { syncFileToLightningFS } = await import('./file-sync');

      vi.mocked(mockWebContainer.fs.readFile).mockResolvedValue(new Uint8Array([65]) as any);

      await syncFileToLightningFS(mockWebContainer, '/home/project', 'src/components/Button.tsx');

      // should create src and src/components directories
      expect(mockFs.promises.mkdir).toHaveBeenCalled();
    });

    it('should propagate errors when file read fails', async () => {
      const { syncFileToLightningFS } = await import('./file-sync');

      vi.mocked(mockWebContainer.fs.readFile).mockRejectedValue(new Error('File not found'));

      await expect(syncFileToLightningFS(mockWebContainer, '/home/project', 'missing.ts')).rejects.toThrow(
        'File not found',
      );
    });

    it('should handle files in root directory (no parent dir)', async () => {
      const { syncFileToLightningFS } = await import('./file-sync');

      vi.mocked(mockWebContainer.fs.readFile).mockResolvedValue(new Uint8Array([65]) as any);

      await syncFileToLightningFS(mockWebContainer, '/home/project', 'package.json');

      expect(mockWebContainer.fs.readFile).toHaveBeenCalledWith('package.json');
      expect(mockFs.promises.writeFile).toHaveBeenCalledWith('/home/project/package.json', expect.any(Uint8Array));
    });
  });

  describe('syncAllToLightningFS', () => {
    it('should sync multiple files', async () => {
      const { syncAllToLightningFS } = await import('./file-sync');

      vi.mocked(mockWebContainer.fs.readFile).mockResolvedValue(new Uint8Array([65]) as any);

      const stats = await syncAllToLightningFS(mockWebContainer, '/home/project', [
        'src/index.ts',
        'src/app.ts',
        'package.json',
      ]);

      expect(stats.files).toBe(3);
    });

    it('should skip excluded patterns', async () => {
      const { syncAllToLightningFS } = await import('./file-sync');

      vi.mocked(mockWebContainer.fs.readFile).mockResolvedValue(new Uint8Array([65]) as any);

      const stats = await syncAllToLightningFS(mockWebContainer, '/home/project', [
        'src/index.ts',
        '.git/config',
        'node_modules/package/index.js',
      ]);

      // only src/index.ts should be synced
      expect(stats.files).toBe(1);
    });

    it('should track errors for failed file syncs', async () => {
      const { syncAllToLightningFS } = await import('./file-sync');

      vi.mocked(mockWebContainer.fs.readFile)
        .mockResolvedValueOnce(new Uint8Array([65]) as any)
        .mockRejectedValueOnce(new Error('Read error'))
        .mockResolvedValueOnce(new Uint8Array([66]) as any);

      const stats = await syncAllToLightningFS(mockWebContainer, '/home/project', ['file1.ts', 'file2.ts', 'file3.ts']);

      expect(stats.files).toBe(2);
      expect(stats.errors.length).toBe(1);
      expect(stats.errors[0]).toContain('Read error');
    });
  });

  describe('clearWebContainerWorkdir', () => {
    it('should remove files from WebContainer', async () => {
      const { clearWebContainerWorkdir } = await import('./file-sync');

      vi.mocked(mockWebContainer.fs.readdir).mockResolvedValue([
        { name: 'src', isDirectory: () => true },
        { name: 'package.json', isDirectory: () => false },
      ] as any);

      await clearWebContainerWorkdir(mockWebContainer);

      expect(mockWebContainer.fs.rm).toHaveBeenCalledWith('src', { recursive: true });
      expect(mockWebContainer.fs.rm).toHaveBeenCalledWith('package.json', { recursive: true });
    });

    it('should skip .git and node_modules', async () => {
      const { clearWebContainerWorkdir } = await import('./file-sync');

      vi.mocked(mockWebContainer.fs.readdir).mockResolvedValue([
        { name: '.git', isDirectory: () => true },
        { name: 'node_modules', isDirectory: () => true },
        { name: 'src', isDirectory: () => true },
      ] as any);

      await clearWebContainerWorkdir(mockWebContainer);

      const rmCalls = vi.mocked(mockWebContainer.fs.rm).mock.calls;
      const gitRemoved = rmCalls.some((call) => call[0] === '.git');
      const nodeModulesRemoved = rmCalls.some((call) => call[0] === 'node_modules');

      expect(gitRemoved).toBe(false);
      expect(nodeModulesRemoved).toBe(false);
      expect(mockWebContainer.fs.rm).toHaveBeenCalledWith('src', { recursive: true });
    });

    it('should handle string entries (legacy format)', async () => {
      const { clearWebContainerWorkdir } = await import('./file-sync');

      // some WebContainer versions return string arrays
      vi.mocked(mockWebContainer.fs.readdir).mockResolvedValue(['src', 'package.json', 'README.md'] as any);

      await clearWebContainerWorkdir(mockWebContainer);

      expect(mockWebContainer.fs.rm).toHaveBeenCalledWith('src', { recursive: true });
      expect(mockWebContainer.fs.rm).toHaveBeenCalledWith('package.json', { recursive: true });
      expect(mockWebContainer.fs.rm).toHaveBeenCalledWith('README.md', { recursive: true });
    });

    it('should handle rm errors gracefully', async () => {
      const { clearWebContainerWorkdir } = await import('./file-sync');

      vi.mocked(mockWebContainer.fs.readdir).mockResolvedValue(['locked-file'] as any);
      vi.mocked(mockWebContainer.fs.rm).mockRejectedValue(new Error('Permission denied'));

      // should not throw
      await expect(clearWebContainerWorkdir(mockWebContainer)).resolves.not.toThrow();
    });
  });
});
