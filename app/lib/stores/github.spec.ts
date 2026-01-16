import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  githubStore,
  isGitHubConnected,
  githubUser,
  githubRepos,
  selectedGitHubRepo,
  githubIssues,
  githubPullRequests,
  isLoading,
  githubError,
  fetchGitHubUser,
  fetchUserRepos,
  selectRepo,
  clearSelectedRepo,
  fetchRepoIssues,
  fetchRepoPullRequests,
  initializeGitHub,
  disconnectGitHub,
  clearGitHubError,
} from './github';
import * as authTokens from '~/lib/auth/tokens';
import * as githubApi from '~/lib/github/api';

vi.mock('~/lib/auth/tokens', () => ({
  getAccessToken: vi.fn(),
}));

vi.mock('~/lib/github/api', () => ({
  getAuthenticatedUser: vi.fn(),
  listUserRepos: vi.fn(),
  listIssues: vi.fn(),
  listPullRequests: vi.fn(),
  createIssue: vi.fn(),
  createPullRequest: vi.fn(),
}));

describe('GitHub Store', () => {
  const mockToken = 'ghp_test_token';
  const mockUser = {
    login: 'testuser',
    id: 123,
    name: 'Test User',
    avatar_url: 'https://avatars.githubusercontent.com/u/123',
  };
  const mockRepos = [
    { id: 1, name: 'repo1', full_name: 'testuser/repo1', owner: { login: 'testuser' } },
    { id: 2, name: 'repo2', full_name: 'testuser/repo2', owner: { login: 'testuser' } },
  ];
  const mockIssues = [
    {
      id: 1,
      number: 1,
      title: 'Issue 1',
      state: 'open',
      user: { login: 'testuser' },
      html_url: 'https://github.com/testuser/repo1/issues/1',
    },
  ];
  const mockPullRequests = [
    {
      id: 1,
      number: 1,
      title: 'PR 1',
      state: 'open',
      user: { login: 'testuser' },
      html_url: 'https://github.com/testuser/repo1/pull/1',
      head: { ref: 'feature' },
      base: { ref: 'main' },
    },
  ];

  beforeEach(() => {
    disconnectGitHub(); // Reset store state
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('initial state', () => {
    it('should have empty initial state', () => {
      expect(githubStore.get().user).toBeNull();
      expect(githubStore.get().repos).toEqual([]);
      expect(githubStore.get().selectedRepo).toBeNull();
      expect(githubStore.get().issues).toEqual([]);
      expect(githubStore.get().pullRequests).toEqual([]);
      expect(githubStore.get().error).toBeNull();
    });

    it('should not be connected initially', () => {
      expect(isGitHubConnected.get()).toBe(false);
    });
  });

  describe('fetchGitHubUser', () => {
    it('should fetch and store user when token is present', async () => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue(mockToken);
      vi.mocked(githubApi.getAuthenticatedUser).mockResolvedValue({
        success: true,
        data: mockUser as any,
      });

      const result = await fetchGitHubUser();

      expect(result).toEqual(mockUser);
      expect(githubUser.get()).toEqual(mockUser);
      expect(isGitHubConnected.get()).toBe(true);
    });

    it('should return null when no token', async () => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue(undefined);

      const result = await fetchGitHubUser();

      expect(result).toBeNull();
      expect(githubError.get()).toBe('Token GitHub non configuré');
    });

    it('should handle API error', async () => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue(mockToken);
      vi.mocked(githubApi.getAuthenticatedUser).mockResolvedValue({
        success: false,
        error: 'API Error',
      });

      const result = await fetchGitHubUser();

      expect(result).toBeNull();
      expect(githubError.get()).toBe('API Error');
    });
  });

  describe('fetchUserRepos', () => {
    it('should fetch and store repos', async () => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue(mockToken);
      vi.mocked(githubApi.listUserRepos).mockResolvedValue({
        success: true,
        data: mockRepos as any,
      });

      const result = await fetchUserRepos();

      expect(result).toEqual(mockRepos);
      expect(githubRepos.get()).toEqual(mockRepos);
    });

    it('should return empty array when no token', async () => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue(undefined);

      const result = await fetchUserRepos();

      expect(result).toEqual([]);
      expect(githubError.get()).toBe('Token GitHub non configuré');
    });
  });

  describe('selectRepo', () => {
    it('should select a repository', () => {
      selectRepo('testuser', 'repo1');

      expect(selectedGitHubRepo.get()).toEqual({ owner: 'testuser', repo: 'repo1' });
    });

    it('should clear issues and PRs when selecting new repo', async () => {
      // First set some issues/PRs
      vi.mocked(authTokens.getAccessToken).mockReturnValue(mockToken);
      vi.mocked(githubApi.listIssues).mockResolvedValue({ success: true, data: mockIssues as any });
      selectRepo('testuser', 'repo1');
      await fetchRepoIssues();

      expect(githubIssues.get()).toHaveLength(1);

      // Select new repo - should clear
      selectRepo('testuser', 'repo2');

      expect(githubIssues.get()).toEqual([]);
      expect(githubPullRequests.get()).toEqual([]);
    });
  });

  describe('clearSelectedRepo', () => {
    it('should clear selected repo and related data', () => {
      selectRepo('testuser', 'repo1');
      clearSelectedRepo();

      expect(selectedGitHubRepo.get()).toBeNull();
      expect(githubIssues.get()).toEqual([]);
      expect(githubPullRequests.get()).toEqual([]);
    });
  });

  describe('fetchRepoIssues', () => {
    beforeEach(() => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue(mockToken);
      selectRepo('testuser', 'repo1');
    });

    it('should fetch issues for selected repo', async () => {
      vi.mocked(githubApi.listIssues).mockResolvedValue({
        success: true,
        data: mockIssues as any,
      });

      const result = await fetchRepoIssues();

      expect(result).toEqual(mockIssues);
      expect(githubIssues.get()).toEqual(mockIssues);
    });

    it('should return empty array when no repo selected', async () => {
      clearSelectedRepo();

      const result = await fetchRepoIssues();

      expect(result).toEqual([]);
      expect(githubError.get()).toBe('Aucun repository sélectionné');
    });
  });

  describe('fetchRepoPullRequests', () => {
    beforeEach(() => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue(mockToken);
      selectRepo('testuser', 'repo1');
    });

    it('should fetch pull requests for selected repo', async () => {
      vi.mocked(githubApi.listPullRequests).mockResolvedValue({
        success: true,
        data: mockPullRequests as any,
      });

      const result = await fetchRepoPullRequests();

      expect(result).toEqual(mockPullRequests);
      expect(githubPullRequests.get()).toEqual(mockPullRequests);
    });
  });

  describe('initializeGitHub', () => {
    it('should fetch user and repos on initialization', async () => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue(mockToken);
      vi.mocked(githubApi.getAuthenticatedUser).mockResolvedValue({
        success: true,
        data: mockUser as any,
      });
      vi.mocked(githubApi.listUserRepos).mockResolvedValue({
        success: true,
        data: mockRepos as any,
      });

      const result = await initializeGitHub();

      expect(result).toBe(true);
      expect(githubUser.get()).toEqual(mockUser);
      expect(githubRepos.get()).toEqual(mockRepos);
    });

    it('should return false when user fetch fails', async () => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue(mockToken);
      vi.mocked(githubApi.getAuthenticatedUser).mockResolvedValue({
        success: false,
        error: 'Auth failed',
      });

      // Also mock listUserRepos since initializeGitHub calls both in parallel
      vi.mocked(githubApi.listUserRepos).mockResolvedValue({
        success: false,
        error: 'Auth failed',
      });

      const result = await initializeGitHub();

      expect(result).toBe(false);
    });
  });

  describe('disconnectGitHub', () => {
    it('should reset all state', async () => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue(mockToken);
      vi.mocked(githubApi.getAuthenticatedUser).mockResolvedValue({
        success: true,
        data: mockUser as any,
      });
      await fetchGitHubUser();

      disconnectGitHub();

      expect(githubUser.get()).toBeNull();
      expect(githubRepos.get()).toEqual([]);
      expect(isGitHubConnected.get()).toBe(false);
    });
  });

  describe('clearGitHubError', () => {
    it('should clear error state', async () => {
      vi.mocked(authTokens.getAccessToken).mockReturnValue(undefined);
      await fetchGitHubUser(); // This will set an error

      expect(githubError.get()).not.toBeNull();

      clearGitHubError();

      expect(githubError.get()).toBeNull();
    });
  });

  describe('computed stores', () => {
    it('isLoading should reflect loading state', () => {
      expect(isLoading.get()).toBe(false);
    });

    it('isGitHubConnected should reflect user presence', async () => {
      expect(isGitHubConnected.get()).toBe(false);

      vi.mocked(authTokens.getAccessToken).mockReturnValue(mockToken);
      vi.mocked(githubApi.getAuthenticatedUser).mockResolvedValue({
        success: true,
        data: mockUser as any,
      });
      await fetchGitHubUser();

      expect(isGitHubConnected.get()).toBe(true);
    });
  });
});
