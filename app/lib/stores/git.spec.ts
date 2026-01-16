import { describe, expect, it, beforeEach } from 'vitest';
import {
  gitStore,
  isGitBusy,
  gitError,
  setGitStatus,
  setGitProgress,
  setGitError,
  setRepoInfo,
  setBranches,
  setChanges,
  setStagedChanges,
  setCommits,
  setRemotes,
  setHasAuth,
  type GitStatus,
  type GitFileChange,
  type GitCommit,
  type GitRemote,
} from './git';

/**
 * Helper to reset the git store to initial state for tests
 */
function resetStore(): void {
  gitStore.setKey('initialized', false);
  gitStore.setKey('repoPath', null);
  gitStore.setKey('remoteUrl', null);
  gitStore.setKey('currentBranch', null);
  gitStore.setKey('branches', []);
  gitStore.setKey('changes', []);
  gitStore.setKey('stagedChanges', []);
  gitStore.setKey('commits', []);
  gitStore.setKey('remotes', []);
  gitStore.setKey('status', 'idle');
  gitStore.setKey('progress', 0);
  gitStore.setKey('progressMessage', '');
  gitStore.setKey('error', null);
  gitStore.setKey('hasAuth', false);
  isGitBusy.set(false);
  gitError.set(null);
}

describe('git store', () => {
  beforeEach(() => {
    resetStore();
  });

  describe('initial state', () => {
    it('should have correct initial values', () => {
      const state = gitStore.get();

      expect(state.initialized).toBe(false);
      expect(state.repoPath).toBeNull();
      expect(state.remoteUrl).toBeNull();
      expect(state.currentBranch).toBeNull();
      expect(state.branches).toEqual([]);
      expect(state.changes).toEqual([]);
      expect(state.stagedChanges).toEqual([]);
      expect(state.commits).toEqual([]);
      expect(state.remotes).toEqual([]);
      expect(state.status).toBe('idle');
      expect(state.progress).toBe(0);
      expect(state.progressMessage).toBe('');
      expect(state.error).toBeNull();
      expect(state.hasAuth).toBe(false);
    });

    it('should have isGitBusy as false initially', () => {
      expect(isGitBusy.get()).toBe(false);
    });

    it('should have gitError as null initially', () => {
      expect(gitError.get()).toBeNull();
    });
  });

  describe('setGitStatus', () => {
    it('should update status', () => {
      setGitStatus('cloning', 'Cloning repository...');

      expect(gitStore.get().status).toBe('cloning');
      expect(gitStore.get().progressMessage).toBe('Cloning repository...');
    });

    it('should set isGitBusy to true when not idle', () => {
      setGitStatus('pushing');

      expect(isGitBusy.get()).toBe(true);
    });

    it('should set isGitBusy to false when idle', () => {
      setGitStatus('pushing');
      setGitStatus('idle');

      expect(isGitBusy.get()).toBe(false);
    });

    const statuses: GitStatus[] = ['cloning', 'pushing', 'pulling', 'fetching', 'committing'];

    statuses.forEach((status) => {
      it(`should handle ${status} status`, () => {
        setGitStatus(status);

        expect(gitStore.get().status).toBe(status);
        expect(isGitBusy.get()).toBe(true);
      });
    });
  });

  describe('setGitProgress', () => {
    it('should update progress value', () => {
      setGitProgress(50);

      expect(gitStore.get().progress).toBe(50);
    });

    it('should update progress with message', () => {
      setGitProgress(75, 'Almost done...');

      expect(gitStore.get().progress).toBe(75);
      expect(gitStore.get().progressMessage).toBe('Almost done...');
    });

    it('should not update message if not provided', () => {
      setGitProgress(25, 'Initial');
      setGitProgress(50);

      expect(gitStore.get().progressMessage).toBe('Initial');
    });
  });

  describe('setGitError', () => {
    it('should set error in store', () => {
      setGitError('Authentication failed');

      expect(gitStore.get().error).toBe('Authentication failed');
    });

    it('should update gitError atom', () => {
      setGitError('Network error');

      expect(gitError.get()).toBe('Network error');
    });

    it('should handle null error', () => {
      setGitError('Some error');
      setGitError(null);

      expect(gitStore.get().error).toBeNull();
      expect(gitError.get()).toBeNull();
    });
  });

  describe('setRepoInfo', () => {
    it('should set repository info', () => {
      setRepoInfo('/path/to/repo', 'https://github.com/user/repo.git');

      const state = gitStore.get();

      expect(state.initialized).toBe(true);
      expect(state.repoPath).toBe('/path/to/repo');
      expect(state.remoteUrl).toBe('https://github.com/user/repo.git');
    });

    it('should handle null remote URL', () => {
      setRepoInfo('/path/to/repo');

      expect(gitStore.get().remoteUrl).toBeNull();
    });
  });

  describe('setBranches', () => {
    it('should set current branch and all branches', () => {
      setBranches('main', ['main', 'develop', 'feature/test']);

      const state = gitStore.get();

      expect(state.currentBranch).toBe('main');
      expect(state.branches).toEqual(['main', 'develop', 'feature/test']);
    });

    it('should handle null current branch', () => {
      setBranches(null, []);

      expect(gitStore.get().currentBranch).toBeNull();
    });
  });

  describe('setChanges', () => {
    it('should set file changes', () => {
      const changes: GitFileChange[] = [
        { path: 'src/index.ts', status: 'modified' },
        { path: 'src/new.ts', status: 'added' },
        { path: 'src/old.ts', status: 'deleted' },
      ];

      setChanges(changes);

      expect(gitStore.get().changes).toEqual(changes);
    });

    it('should handle empty changes', () => {
      setChanges([]);

      expect(gitStore.get().changes).toEqual([]);
    });
  });

  describe('setStagedChanges', () => {
    it('should set staged changes', () => {
      const staged: GitFileChange[] = [{ path: 'src/index.ts', status: 'modified' }];

      setStagedChanges(staged);

      expect(gitStore.get().stagedChanges).toEqual(staged);
    });
  });

  describe('setCommits', () => {
    it('should set commit history', () => {
      const commits: GitCommit[] = [
        {
          oid: 'abc123',
          message: 'Initial commit',
          author: {
            name: 'Test User',
            email: 'test@example.com',
            timestamp: Date.now(),
          },
        },
        {
          oid: 'def456',
          message: 'Add feature',
          author: {
            name: 'Test User',
            email: 'test@example.com',
            timestamp: Date.now(),
          },
        },
      ];

      setCommits(commits);

      expect(gitStore.get().commits).toEqual(commits);
      expect(gitStore.get().commits).toHaveLength(2);
    });
  });

  describe('setRemotes', () => {
    it('should set remotes', () => {
      const remotes: GitRemote[] = [
        { name: 'origin', url: 'https://github.com/user/repo.git' },
        { name: 'upstream', url: 'https://github.com/org/repo.git' },
      ];

      setRemotes(remotes);

      expect(gitStore.get().remotes).toEqual(remotes);
    });
  });

  describe('setHasAuth', () => {
    it('should set authentication status', () => {
      setHasAuth(true);

      expect(gitStore.get().hasAuth).toBe(true);
    });

    it('should toggle authentication status', () => {
      setHasAuth(true);
      setHasAuth(false);

      expect(gitStore.get().hasAuth).toBe(false);
    });
  });

  describe('integration scenarios', () => {
    it('should handle clone workflow', () => {
      // Start cloning
      setGitStatus('cloning', 'Cloning repository...');
      setGitProgress(0);

      expect(isGitBusy.get()).toBe(true);

      // Progress updates
      setGitProgress(50, 'Receiving objects...');

      expect(gitStore.get().progress).toBe(50);

      // Complete
      setRepoInfo('/workspace', 'https://github.com/user/repo.git');
      setBranches('main', ['main']);
      setGitStatus('idle');
      setGitProgress(100, 'Done');

      expect(isGitBusy.get()).toBe(false);
      expect(gitStore.get().initialized).toBe(true);
    });

    it('should handle push with error', () => {
      setRepoInfo('/workspace', 'https://github.com/user/repo.git');
      setGitStatus('pushing', 'Pushing changes...');

      // Error occurs
      setGitError('Permission denied');
      setGitStatus('idle');

      expect(gitStore.get().error).toBe('Permission denied');
      expect(isGitBusy.get()).toBe(false);

      // Clear error using setGitError(null)
      setGitError(null);

      expect(gitStore.get().error).toBeNull();
    });
  });
});
