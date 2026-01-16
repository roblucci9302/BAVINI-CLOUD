/**
 * GitHub REST API Client
 * Client pour interagir avec l'API GitHub v3
 */

import type {
  GitHubUser,
  GitHubRepo,
  GitHubBranch,
  GitHubIssue,
  GitHubPullRequest,
  GitHubResult,
  PaginatedResponse,
  PaginationInfo,
  ListReposOptions,
  ListIssuesOptions,
  ListPullRequestsOptions,
  CreateIssueOptions,
  CreatePullRequestOptions,
  SearchReposOptions,
} from './types';

const GITHUB_API_BASE = 'https://api.github.com';

/**
 * Creates headers for GitHub API requests
 */
function createHeaders(token: string): HeadersInit {
  return {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github.v3+json',
  };
}

/**
 * Parses Link header for pagination
 */
function parseLinkHeader(linkHeader: string | null): PaginationInfo | undefined {
  if (!linkHeader) {
    return undefined;
  }

  const links: PaginationInfo = {};
  const parts = linkHeader.split(',');

  for (const part of parts) {
    const match = part.match(/<([^>]+)>;\s*rel="([^"]+)"/);

    if (match) {
      const [, url, rel] = match;

      if (rel === 'next' || rel === 'prev' || rel === 'first' || rel === 'last') {
        links[rel] = url;
      }
    }
  }

  return Object.keys(links).length > 0 ? links : undefined;
}

/**
 * Makes a GitHub API request
 */
async function githubFetch<T>(token: string, endpoint: string, options: RequestInit = {}): Promise<GitHubResult<T>> {
  try {
    const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...createHeaders(token),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      return {
        success: false,
        error: `GitHub API error: ${response.status} - ${errorData.message || response.statusText}`,
      };
    }

    const data = (await response.json()) as T;

    return { success: true, data };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Makes a paginated GitHub API request
 */
async function githubFetchPaginated<T>(
  token: string,
  endpoint: string,
  options: RequestInit = {},
): Promise<PaginatedResponse<T>> {
  try {
    const response = await fetch(`${GITHUB_API_BASE}${endpoint}`, {
      ...options,
      headers: {
        ...createHeaders(token),
        ...options.headers,
      },
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      return {
        success: false,
        error: `GitHub API error: ${response.status} - ${errorData.message || response.statusText}`,
      };
    }

    const data = (await response.json()) as T[];
    const pagination = parseLinkHeader(response.headers.get('Link'));

    return { success: true, data, pagination };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/*
 * ============================================
 * User API
 * ============================================
 */

/**
 * Get the authenticated user
 */
export async function getAuthenticatedUser(token: string): Promise<GitHubResult<GitHubUser>> {
  return githubFetch<GitHubUser>(token, '/user');
}

/*
 * ============================================
 * Repository API
 * ============================================
 */

/**
 * List repositories for the authenticated user
 */
export async function listUserRepos(
  token: string,
  options: ListReposOptions = {},
): Promise<PaginatedResponse<GitHubRepo>> {
  const params = new URLSearchParams();

  if (options.type) {
    params.set('type', options.type);
  }

  if (options.sort) {
    params.set('sort', options.sort);
  }

  if (options.direction) {
    params.set('direction', options.direction);
  }

  if (options.page) {
    params.set('page', String(options.page));
  }

  if (options.perPage) {
    params.set('per_page', String(options.perPage));
  }

  const query = params.toString();

  return githubFetchPaginated<GitHubRepo>(token, `/user/repos${query ? `?${query}` : ''}`);
}

/**
 * Get a specific repository
 */
export async function getRepo(token: string, owner: string, repo: string): Promise<GitHubResult<GitHubRepo>> {
  return githubFetch<GitHubRepo>(token, `/repos/${owner}/${repo}`);
}

/**
 * List branches for a repository
 */
export async function listBranches(
  token: string,
  owner: string,
  repo: string,
  options: { page?: number; perPage?: number } = {},
): Promise<PaginatedResponse<GitHubBranch>> {
  const params = new URLSearchParams();

  if (options.page) {
    params.set('page', String(options.page));
  }

  if (options.perPage) {
    params.set('per_page', String(options.perPage));
  }

  const query = params.toString();

  return githubFetchPaginated<GitHubBranch>(token, `/repos/${owner}/${repo}/branches${query ? `?${query}` : ''}`);
}

/**
 * Search repositories
 */
export async function searchRepos(
  token: string,
  query: string,
  options: SearchReposOptions = {},
): Promise<PaginatedResponse<GitHubRepo>> {
  const params = new URLSearchParams();
  params.set('q', query);

  if (options.sort) {
    params.set('sort', options.sort);
  }

  if (options.order) {
    params.set('order', options.order);
  }

  if (options.page) {
    params.set('page', String(options.page));
  }

  if (options.perPage) {
    params.set('per_page', String(options.perPage));
  }

  try {
    const response = await fetch(`${GITHUB_API_BASE}/search/repositories?${params.toString()}`, {
      headers: createHeaders(token),
    });

    if (!response.ok) {
      const errorData = (await response.json().catch(() => ({}))) as { message?: string };
      return {
        success: false,
        error: `GitHub API error: ${response.status} - ${errorData.message || response.statusText}`,
      };
    }

    const data = (await response.json()) as { items: GitHubRepo[] };
    const pagination = parseLinkHeader(response.headers.get('Link'));

    return { success: true, data: data.items, pagination };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/*
 * ============================================
 * Issues API
 * ============================================
 */

/**
 * List issues for a repository
 */
export async function listIssues(
  token: string,
  owner: string,
  repo: string,
  options: ListIssuesOptions = {},
): Promise<PaginatedResponse<GitHubIssue>> {
  const params = new URLSearchParams();

  if (options.state) {
    params.set('state', options.state);
  }

  if (options.sort) {
    params.set('sort', options.sort);
  }

  if (options.direction) {
    params.set('direction', options.direction);
  }

  if (options.page) {
    params.set('page', String(options.page));
  }

  if (options.perPage) {
    params.set('per_page', String(options.perPage));
  }

  const query = params.toString();

  return githubFetchPaginated<GitHubIssue>(token, `/repos/${owner}/${repo}/issues${query ? `?${query}` : ''}`);
}

/**
 * Create a new issue
 */
export async function createIssue(
  token: string,
  owner: string,
  repo: string,
  options: CreateIssueOptions,
): Promise<GitHubResult<GitHubIssue>> {
  return githubFetch<GitHubIssue>(token, `/repos/${owner}/${repo}/issues`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
}

/*
 * ============================================
 * Pull Requests API
 * ============================================
 */

/**
 * List pull requests for a repository
 */
export async function listPullRequests(
  token: string,
  owner: string,
  repo: string,
  options: ListPullRequestsOptions = {},
): Promise<PaginatedResponse<GitHubPullRequest>> {
  const params = new URLSearchParams();

  if (options.state) {
    params.set('state', options.state);
  }

  if (options.sort) {
    params.set('sort', options.sort);
  }

  if (options.direction) {
    params.set('direction', options.direction);
  }

  if (options.page) {
    params.set('page', String(options.page));
  }

  if (options.perPage) {
    params.set('per_page', String(options.perPage));
  }

  const query = params.toString();

  return githubFetchPaginated<GitHubPullRequest>(token, `/repos/${owner}/${repo}/pulls${query ? `?${query}` : ''}`);
}

/**
 * Create a new pull request
 */
export async function createPullRequest(
  token: string,
  owner: string,
  repo: string,
  options: CreatePullRequestOptions,
): Promise<GitHubResult<GitHubPullRequest>> {
  return githubFetch<GitHubPullRequest>(token, `/repos/${owner}/${repo}/pulls`, {
    method: 'POST',
    body: JSON.stringify(options),
  });
}
