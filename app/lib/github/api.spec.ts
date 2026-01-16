import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getAuthenticatedUser,
  listUserRepos,
  getRepo,
  listBranches,
  listIssues,
  createIssue,
  listPullRequests,
  createPullRequest,
  searchRepos,
} from './api';

describe('GitHub API', () => {
  const mockToken = 'ghp_test_token_123';

  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getAuthenticatedUser', () => {
    it('should fetch authenticated user', async () => {
      const mockUser = {
        login: 'testuser',
        id: 123,
        name: 'Test User',
        email: 'test@example.com',
        avatar_url: 'https://avatars.githubusercontent.com/u/123',
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockUser),
      } as Response);

      const result = await getAuthenticatedUser(mockToken);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockUser);
      expect(fetch).toHaveBeenCalledWith('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${mockToken}`,
          Accept: 'application/vnd.github.v3+json',
        },
      });
    });

    it('should handle authentication error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: () => Promise.resolve({ message: 'Bad credentials' }),
      } as Response);

      const result = await getAuthenticatedUser(mockToken);

      expect(result.success).toBe(false);
      expect(result.error).toContain('401');
    });

    it('should handle network error', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new Error('Network error'));

      const result = await getAuthenticatedUser(mockToken);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Network error');
    });
  });

  describe('listUserRepos', () => {
    it('should list user repositories', async () => {
      const mockRepos = [
        { id: 1, name: 'repo1', full_name: 'user/repo1' },
        { id: 2, name: 'repo2', full_name: 'user/repo2' },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRepos),
        headers: new Headers(),
      } as Response);

      const result = await listUserRepos(mockToken);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockRepos);
    });

    it('should handle pagination options', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      } as Response);

      await listUserRepos(mockToken, { page: 2, perPage: 50 });

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('page=2'), expect.any(Object));
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('per_page=50'), expect.any(Object));
    });

    it('should parse Link header for pagination', async () => {
      const linkHeader =
        '<https://api.github.com/user/repos?page=2>; rel="next", <https://api.github.com/user/repos?page=5>; rel="last"';

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Headers({ Link: linkHeader }),
      } as Response);

      const result = await listUserRepos(mockToken);

      expect(result.success).toBe(true);
      expect(result.pagination?.next).toBe('https://api.github.com/user/repos?page=2');
      expect(result.pagination?.last).toBe('https://api.github.com/user/repos?page=5');
    });
  });

  describe('getRepo', () => {
    it('should get repository details', async () => {
      const mockRepo = {
        id: 1,
        name: 'test-repo',
        full_name: 'owner/test-repo',
        description: 'A test repository',
        private: false,
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockRepo),
      } as Response);

      const result = await getRepo(mockToken, 'owner', 'test-repo');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockRepo);
      expect(fetch).toHaveBeenCalledWith('https://api.github.com/repos/owner/test-repo', expect.any(Object));
    });

    it('should handle 404 for non-existent repo', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ message: 'Not Found' }),
      } as Response);

      const result = await getRepo(mockToken, 'owner', 'non-existent');

      expect(result.success).toBe(false);
      expect(result.error).toContain('404');
    });
  });

  describe('listBranches', () => {
    it('should list repository branches', async () => {
      const mockBranches = [
        { name: 'main', commit: { sha: 'abc123' } },
        { name: 'develop', commit: { sha: 'def456' } },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockBranches),
        headers: new Headers(),
      } as Response);

      const result = await listBranches(mockToken, 'owner', 'repo');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockBranches);
    });
  });

  describe('listIssues', () => {
    it('should list repository issues', async () => {
      const mockIssues = [
        { id: 1, number: 1, title: 'Bug fix', state: 'open' },
        { id: 2, number: 2, title: 'Feature', state: 'closed' },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockIssues),
        headers: new Headers(),
      } as Response);

      const result = await listIssues(mockToken, 'owner', 'repo');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockIssues);
    });

    it('should filter by state', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      } as Response);

      await listIssues(mockToken, 'owner', 'repo', { state: 'closed' });

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('state=closed'), expect.any(Object));
    });
  });

  describe('createIssue', () => {
    it('should create a new issue', async () => {
      const mockIssue = {
        id: 1,
        number: 42,
        title: 'New Bug',
        body: 'Description',
        state: 'open',
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockIssue),
      } as Response);

      const result = await createIssue(mockToken, 'owner', 'repo', {
        title: 'New Bug',
        body: 'Description',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockIssue);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/issues',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({ title: 'New Bug', body: 'Description' }),
        }),
      );
    });

    it('should create issue with labels', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve({ id: 1 }),
      } as Response);

      await createIssue(mockToken, 'owner', 'repo', {
        title: 'Bug',
        labels: ['bug', 'priority-high'],
      });

      expect(fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"labels":["bug","priority-high"]'),
        }),
      );
    });

    it('should handle permission error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ message: 'Resource not accessible' }),
      } as Response);

      const result = await createIssue(mockToken, 'owner', 'repo', {
        title: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('403');
    });
  });

  describe('listPullRequests', () => {
    it('should list pull requests', async () => {
      const mockPRs = [
        { id: 1, number: 1, title: 'Feature PR', state: 'open' },
        { id: 2, number: 2, title: 'Bugfix PR', state: 'merged' },
      ];

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockPRs),
        headers: new Headers(),
      } as Response);

      const result = await listPullRequests(mockToken, 'owner', 'repo');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockPRs);
    });

    it('should filter by state', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve([]),
        headers: new Headers(),
      } as Response);

      await listPullRequests(mockToken, 'owner', 'repo', { state: 'all' });

      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('state=all'), expect.any(Object));
    });
  });

  describe('createPullRequest', () => {
    it('should create a new pull request', async () => {
      const mockPR = {
        id: 1,
        number: 10,
        title: 'New Feature',
        state: 'open',
        html_url: 'https://github.com/owner/repo/pull/10',
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: () => Promise.resolve(mockPR),
      } as Response);

      const result = await createPullRequest(mockToken, 'owner', 'repo', {
        title: 'New Feature',
        head: 'feature-branch',
        base: 'main',
        body: 'This PR adds a new feature',
      });

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockPR);
      expect(fetch).toHaveBeenCalledWith(
        'https://api.github.com/repos/owner/repo/pulls',
        expect.objectContaining({
          method: 'POST',
          body: JSON.stringify({
            title: 'New Feature',
            head: 'feature-branch',
            base: 'main',
            body: 'This PR adds a new feature',
          }),
        }),
      );
    });

    it('should handle validation error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 422,
        json: () =>
          Promise.resolve({
            message: 'Validation Failed',
            errors: [{ message: 'No commits between main and feature' }],
          }),
      } as Response);

      const result = await createPullRequest(mockToken, 'owner', 'repo', {
        title: 'Test',
        head: 'feature',
        base: 'main',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('422');
    });
  });

  describe('searchRepos', () => {
    it('should search repositories', async () => {
      const mockSearchResult = {
        total_count: 2,
        items: [
          { id: 1, name: 'react', full_name: 'facebook/react' },
          { id: 2, name: 'react-native', full_name: 'facebook/react-native' },
        ],
      };

      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockSearchResult),
        headers: new Headers(),
      } as Response);

      const result = await searchRepos(mockToken, 'react');

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockSearchResult.items);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining('q=react'), expect.any(Object));
    });

    it('should handle empty search results', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ total_count: 0, items: [] }),
        headers: new Headers(),
      } as Response);

      const result = await searchRepos(mockToken, 'nonexistentrepo12345');

      expect(result.success).toBe(true);
      expect(result.data).toEqual([]);
    });
  });

  describe('error handling', () => {
    it('should handle rate limit error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({
            message: 'API rate limit exceeded',
            documentation_url: 'https://docs.github.com/rest/rate-limit',
          }),
      } as Response);

      const result = await getAuthenticatedUser(mockToken);

      expect(result.success).toBe(false);
      expect(result.error).toContain('403');
    });

    it('should handle server error', async () => {
      vi.mocked(fetch).mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.resolve({ message: 'Internal Server Error' }),
      } as Response);

      const result = await listUserRepos(mockToken);

      expect(result.success).toBe(false);
      expect(result.error).toContain('500');
    });
  });
});
