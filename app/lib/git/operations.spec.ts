import { describe, expect, it, vi, beforeEach } from 'vitest';
import git from 'isomorphic-git';

// mock isomorphic-git
vi.mock('isomorphic-git', () => ({
  default: {
    clone: vi.fn(),
    init: vi.fn(),
    commit: vi.fn(),
    push: vi.fn(),
    pull: vi.fn(),
    add: vi.fn(),
    statusMatrix: vi.fn(),
    currentBranch: vi.fn(),
    listBranches: vi.fn(),
    log: vi.fn(),
    checkout: vi.fn(),
    branch: vi.fn(),
    listRemotes: vi.fn(),
    addRemote: vi.fn(),
    findRoot: vi.fn(),
    fetch: vi.fn(),
    remove: vi.fn(),
  },
}));

// mock LightningFS
vi.mock('@isomorphic-git/lightning-fs', () => ({
  default: vi.fn(() => ({
    promises: {
      readFile: vi.fn(),
      writeFile: vi.fn(),
      mkdir: vi.fn(),
      rmdir: vi.fn(),
      readdir: vi.fn(),
      stat: vi.fn(),
      unlink: vi.fn(),
    },
  })),
}));

// mock cors-proxy
vi.mock('./cors-proxy', () => ({
  getCorsProxyUrl: vi.fn(() => 'https://cors.proxy'),
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

describe('Git Operations', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('clone', () => {
    it('should clone a repository with default options', async () => {
      const { clone } = await import('./operations');

      vi.mocked(git.clone).mockResolvedValue(undefined);

      await clone({
        url: 'https://github.com/example/repo',
        dir: '/home/project',
      });

      expect(git.clone).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://github.com/example/repo',
          dir: '/home/project',
          singleBranch: true,
          depth: 1,
        }),
      );
    });

    it('should clone with custom depth', async () => {
      const { clone } = await import('./operations');

      vi.mocked(git.clone).mockResolvedValue(undefined);

      await clone({
        url: 'https://github.com/example/repo',
        dir: '/home/project',
        depth: 10,
      });

      expect(git.clone).toHaveBeenCalledWith(
        expect.objectContaining({
          depth: 10,
        }),
      );
    });

    it('should clone with authentication', async () => {
      const { clone } = await import('./operations');

      vi.mocked(git.clone).mockResolvedValue(undefined);

      const onAuth = vi.fn().mockResolvedValue({
        username: 'oauth2',
        password: 'token123',
      });

      await clone({
        url: 'https://github.com/private/repo',
        dir: '/home/project',
        onAuth,
      });

      expect(git.clone).toHaveBeenCalledWith(
        expect.objectContaining({
          onAuth: expect.any(Function),
        }),
      );
    });

    it('should throw on clone failure', async () => {
      const { clone } = await import('./operations');

      vi.mocked(git.clone).mockRejectedValue(new Error('Network error'));

      await expect(
        clone({
          url: 'https://github.com/example/repo',
          dir: '/home/project',
        }),
      ).rejects.toThrow('Network error');
    });
  });

  describe('init', () => {
    it('should initialize a repository with main as default branch', async () => {
      const { init } = await import('./operations');

      vi.mocked(git.init).mockResolvedValue(undefined);

      await init('/home/project');

      expect(git.init).toHaveBeenCalledWith(
        expect.objectContaining({
          dir: '/home/project',
          defaultBranch: 'main',
        }),
      );
    });
  });

  describe('commit', () => {
    it('should create a commit with default author', async () => {
      const { commit } = await import('./operations');

      vi.mocked(git.commit).mockResolvedValue('abc123def456');

      const sha = await commit({
        dir: '/home/project',
        message: 'Test commit',
      });

      expect(sha).toBe('abc123def456');
      expect(git.commit).toHaveBeenCalledWith(
        expect.objectContaining({
          message: 'Test commit',
          author: {
            name: 'BAVINI User',
            email: 'user@bavini.app',
          },
        }),
      );
    });

    it('should create a commit with custom author', async () => {
      const { commit } = await import('./operations');

      vi.mocked(git.commit).mockResolvedValue('def456abc789');

      await commit({
        dir: '/home/project',
        message: 'Custom author commit',
        author: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      });

      expect(git.commit).toHaveBeenCalledWith(
        expect.objectContaining({
          author: {
            name: 'John Doe',
            email: 'john@example.com',
          },
        }),
      );
    });
  });

  describe('status', () => {
    it('should parse status matrix for modified files', async () => {
      const { status } = await import('./operations');

      vi.mocked(git.statusMatrix).mockResolvedValue([
        ['file1.txt', 1, 2, 1], // modified, unstaged
        ['file2.txt', 0, 2, 2], // added, staged
        ['file3.txt', 1, 0, 0], // deleted
        ['file4.txt', 0, 2, 0], // untracked
        ['file5.txt', 1, 1, 1], // unchanged
      ]);

      const result = await status('/home/project');

      expect(result).toEqual([
        { path: 'file1.txt', status: 'modified' },
        { path: 'file2.txt', status: 'added' },
        { path: 'file3.txt', status: 'deleted' },
        { path: 'file4.txt', status: 'untracked' },
        { path: 'file5.txt', status: 'unchanged' },
      ]);
    });

    it('should return empty array on error', async () => {
      const { status } = await import('./operations');

      vi.mocked(git.statusMatrix).mockRejectedValue(new Error('Not a git repo'));

      const result = await status('/home/project');

      expect(result).toEqual([]);
    });
  });

  describe('add', () => {
    it('should add a file to staging', async () => {
      const { add } = await import('./operations');

      vi.mocked(git.add).mockResolvedValue(undefined);

      await add('/home/project', 'src/index.ts');

      expect(git.add).toHaveBeenCalledWith(
        expect.objectContaining({
          dir: '/home/project',
          filepath: 'src/index.ts',
        }),
      );
    });
  });

  describe('push', () => {
    it('should push to origin/main by default', async () => {
      const { push } = await import('./operations');

      vi.mocked(git.push).mockResolvedValue(undefined as any);
      vi.mocked(git.currentBranch).mockResolvedValue('main');

      await push({ dir: '/home/project' });

      expect(git.push).toHaveBeenCalledWith(
        expect.objectContaining({
          remote: 'origin',
          ref: 'main',
        }),
      );
    });

    it('should push with authentication', async () => {
      const { push } = await import('./operations');

      vi.mocked(git.push).mockResolvedValue(undefined as any);
      vi.mocked(git.currentBranch).mockResolvedValue('main');

      const onAuth = vi.fn().mockResolvedValue({
        username: 'oauth2',
        password: 'token',
      });

      await push({
        dir: '/home/project',
        onAuth,
      });

      expect(git.push).toHaveBeenCalledWith(
        expect.objectContaining({
          onAuth: expect.any(Function),
        }),
      );
    });
  });

  describe('pull', () => {
    it('should pull from origin/main by default', async () => {
      const { pull } = await import('./operations');

      vi.mocked(git.pull).mockResolvedValue(undefined);
      vi.mocked(git.currentBranch).mockResolvedValue('main');

      await pull({ dir: '/home/project' });

      expect(git.pull).toHaveBeenCalledWith(
        expect.objectContaining({
          remote: 'origin',
          ref: 'main',
          singleBranch: true,
        }),
      );
    });
  });

  describe('currentBranch', () => {
    it('should return the current branch name', async () => {
      const { currentBranch } = await import('./operations');

      vi.mocked(git.currentBranch).mockResolvedValue('feature-branch');

      const result = await currentBranch('/home/project');

      expect(result).toBe('feature-branch');
    });

    it('should return undefined on error', async () => {
      const { currentBranch } = await import('./operations');

      vi.mocked(git.currentBranch).mockRejectedValue(new Error('No branch'));

      const result = await currentBranch('/home/project');

      expect(result).toBeUndefined();
    });
  });

  describe('listBranches', () => {
    it('should return list of branches', async () => {
      const { listBranches } = await import('./operations');

      vi.mocked(git.listBranches).mockResolvedValue(['main', 'develop', 'feature']);

      const result = await listBranches('/home/project');

      expect(result).toEqual(['main', 'develop', 'feature']);
    });

    it('should return empty array on error', async () => {
      const { listBranches } = await import('./operations');

      vi.mocked(git.listBranches).mockRejectedValue(new Error('Error'));

      const result = await listBranches('/home/project');

      expect(result).toEqual([]);
    });
  });

  describe('log', () => {
    it('should return commit log entries', async () => {
      const { log } = await import('./operations');

      vi.mocked(git.log).mockResolvedValue([
        {
          oid: 'abc123',
          commit: {
            message: 'First commit',
            author: {
              name: 'Test User',
              email: 'test@example.com',
              timestamp: 1700000000,
            },
          },
        } as any,
      ]);

      const result = await log('/home/project', 5);

      expect(result).toEqual([
        {
          oid: 'abc123',
          message: 'First commit',
          author: {
            name: 'Test User',
            email: 'test@example.com',
            timestamp: 1700000000,
          },
        },
      ]);
    });

    it('should return empty array on error', async () => {
      const { log } = await import('./operations');

      vi.mocked(git.log).mockRejectedValue(new Error('No commits'));

      const result = await log('/home/project');

      expect(result).toEqual([]);
    });
  });

  describe('isGitRepo', () => {
    it('should return true for a git repository', async () => {
      const { isGitRepo } = await import('./operations');

      vi.mocked(git.findRoot).mockResolvedValue('/home/project');

      const result = await isGitRepo('/home/project');

      expect(result).toBe(true);
    });

    it('should return false for non-git directory', async () => {
      const { isGitRepo } = await import('./operations');

      vi.mocked(git.findRoot).mockRejectedValue(new Error('Not a git repo'));

      const result = await isGitRepo('/home/project');

      expect(result).toBe(false);
    });
  });

  describe('addAll', () => {
    it('should add all files to staging', async () => {
      const { addAll } = await import('./operations');

      vi.mocked(git.statusMatrix).mockResolvedValue([
        ['file1.txt', 1, 2, 1],
        ['file2.txt', 0, 2, 0],
      ]);
      vi.mocked(git.add).mockResolvedValue(undefined);

      await addAll('/home/project');

      expect(git.add).toHaveBeenCalledTimes(2);
    });

    it('should handle empty status matrix', async () => {
      const { addAll } = await import('./operations');

      vi.mocked(git.statusMatrix).mockResolvedValue([]);

      await addAll('/home/project');

      expect(git.add).not.toHaveBeenCalled();
    });
  });

  describe('fetch', () => {
    it('should fetch from remote with default origin', async () => {
      const { fetch } = await import('./operations');

      vi.mocked(git.fetch).mockResolvedValue(undefined as any);

      await fetch('/home/project');

      expect(git.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          dir: '/home/project',
          remote: 'origin',
        }),
      );
    });

    it('should fetch with custom remote', async () => {
      const { fetch } = await import('./operations');

      vi.mocked(git.fetch).mockResolvedValue(undefined as any);

      await fetch('/home/project', 'upstream');

      expect(git.fetch).toHaveBeenCalledWith(
        expect.objectContaining({
          remote: 'upstream',
        }),
      );
    });
  });

  describe('checkout', () => {
    it('should checkout a branch', async () => {
      const { checkout } = await import('./operations');

      vi.mocked(git.checkout).mockResolvedValue(undefined);

      await checkout('/home/project', 'feature-branch');

      expect(git.checkout).toHaveBeenCalledWith(
        expect.objectContaining({
          dir: '/home/project',
          ref: 'feature-branch',
        }),
      );
    });
  });

  describe('createBranch', () => {
    it('should create a new branch with checkout by default', async () => {
      const { createBranch } = await import('./operations');

      vi.mocked(git.branch).mockResolvedValue(undefined);

      await createBranch('/home/project', 'new-feature');

      expect(git.branch).toHaveBeenCalledWith(
        expect.objectContaining({
          dir: '/home/project',
          ref: 'new-feature',
          checkout: true,
        }),
      );
    });

    it('should create branch without checkout when specified', async () => {
      const { createBranch } = await import('./operations');

      vi.mocked(git.branch).mockResolvedValue(undefined);

      await createBranch('/home/project', 'new-feature', false);

      expect(git.branch).toHaveBeenCalledWith(
        expect.objectContaining({
          ref: 'new-feature',
          checkout: false,
        }),
      );
    });
  });

  describe('listRemotes', () => {
    it('should return list of remotes', async () => {
      const { listRemotes } = await import('./operations');

      vi.mocked(git.listRemotes).mockResolvedValue([{ remote: 'origin', url: 'https://github.com/user/repo' }]);

      const result = await listRemotes('/home/project');

      expect(result).toEqual([{ remote: 'origin', url: 'https://github.com/user/repo' }]);
    });

    it('should return empty array on error', async () => {
      const { listRemotes } = await import('./operations');

      vi.mocked(git.listRemotes).mockRejectedValue(new Error('No remotes'));

      const result = await listRemotes('/home/project');

      expect(result).toEqual([]);
    });
  });

  describe('addRemote', () => {
    it('should add a remote', async () => {
      const { addRemote } = await import('./operations');

      vi.mocked(git.addRemote).mockResolvedValue(undefined);

      await addRemote('/home/project', 'upstream', 'https://github.com/other/repo');

      expect(git.addRemote).toHaveBeenCalledWith(
        expect.objectContaining({
          dir: '/home/project',
          remote: 'upstream',
          url: 'https://github.com/other/repo',
        }),
      );
    });
  });
});
