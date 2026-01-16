/**
 * GitHub SDK.
 *
 * Lightweight client for GitHub REST API.
 */

import { BaseHttpClient } from '../base-http-client';

// Types
export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  html_url: string;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  description: string | null;
  private: boolean;
  html_url: string;
  default_branch: string;
  owner: { login: string; id: number };
}

export interface GitHubIssue {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed';
  labels: Array<{ name: string }>;
  user: { login: string };
  html_url: string;
}

export interface GitHubPullRequest {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: 'open' | 'closed' | 'merged';
  head: { ref: string; sha: string };
  base: { ref: string };
  html_url: string;
  merged: boolean;
}

export interface GitHubBranch {
  name: string;
  commit: { sha: string };
  protected: boolean;
}

export interface GitHubContent {
  name: string;
  path: string;
  type: 'file' | 'dir';
  content?: string;
  encoding?: string;
  sha: string;
}

export interface CreateRepoOptions {
  name: string;
  description?: string;
  private?: boolean;
  auto_init?: boolean;
}

export interface CreateIssueOptions {
  title: string;
  body?: string;
  labels?: string[];
  assignees?: string[];
}

export interface CreatePROptions {
  title: string;
  head: string;
  base: string;
  body?: string;
  draft?: boolean;
}

// Client
export class GitHubClient extends BaseHttpClient {
  constructor(config: { token: string }) {
    super({
      baseUrl: 'https://api.github.com',
      token: config.token,
      serviceName: 'GitHub',
      additionalHeaders: {
        Accept: 'application/vnd.github.v3+json',
      },
    });
  }

  async getUser(): Promise<GitHubUser> {
    return this.get('/user');
  }
}

export function createGitHubClient(token: string): GitHubClient {
  return new GitHubClient({ token });
}

// Repository functions
export async function listRepos(
  client: GitHubClient,
  options?: { page?: number; perPage?: number; sort?: string },
): Promise<GitHubRepo[]> {
  const params = new URLSearchParams();

  if (options?.page) {
    params.set('page', String(options.page));
  }

  if (options?.perPage) {
    params.set('per_page', String(options.perPage));
  }

  if (options?.sort) {
    params.set('sort', options.sort);
  }

  const query = params.toString();

  return client.get(`/user/repos${query ? `?${query}` : ''}`);
}

export async function getRepo(client: GitHubClient, owner: string, repo: string): Promise<GitHubRepo> {
  return client.get(`/repos/${owner}/${repo}`);
}

export async function createRepo(client: GitHubClient, options: CreateRepoOptions): Promise<GitHubRepo> {
  return client.post('/user/repos', options);
}

export async function deleteRepo(client: GitHubClient, owner: string, repo: string): Promise<void> {
  await client.delete(`/repos/${owner}/${repo}`);
}

export async function listBranches(client: GitHubClient, owner: string, repo: string): Promise<GitHubBranch[]> {
  return client.get(`/repos/${owner}/${repo}/branches`);
}

export async function getContents(
  client: GitHubClient,
  owner: string,
  repo: string,
  path: string,
  ref?: string,
): Promise<GitHubContent | GitHubContent[]> {
  const query = ref ? `?ref=${ref}` : '';
  return client.get(`/repos/${owner}/${repo}/contents/${path}${query}`);
}

// Issue functions
export async function listIssues(
  client: GitHubClient,
  owner: string,
  repo: string,
  options?: { state?: 'open' | 'closed' | 'all'; labels?: string },
): Promise<GitHubIssue[]> {
  const params = new URLSearchParams();

  if (options?.state) {
    params.set('state', options.state);
  }

  if (options?.labels) {
    params.set('labels', options.labels);
  }

  const query = params.toString();

  return client.get(`/repos/${owner}/${repo}/issues${query ? `?${query}` : ''}`);
}

export async function createIssue(
  client: GitHubClient,
  owner: string,
  repo: string,
  options: CreateIssueOptions,
): Promise<GitHubIssue> {
  return client.post(`/repos/${owner}/${repo}/issues`, options);
}

export async function updateIssue(
  client: GitHubClient,
  owner: string,
  repo: string,
  issueNumber: number,
  updates: Partial<CreateIssueOptions> & { state?: 'open' | 'closed' },
): Promise<GitHubIssue> {
  return client.patch(`/repos/${owner}/${repo}/issues/${issueNumber}`, updates);
}

// Pull Request functions
export async function listPullRequests(
  client: GitHubClient,
  owner: string,
  repo: string,
  options?: { state?: 'open' | 'closed' | 'all' },
): Promise<GitHubPullRequest[]> {
  const query = options?.state ? `?state=${options.state}` : '';
  return client.get(`/repos/${owner}/${repo}/pulls${query}`);
}

export async function createPullRequest(
  client: GitHubClient,
  owner: string,
  repo: string,
  options: CreatePROptions,
): Promise<GitHubPullRequest> {
  return client.post(`/repos/${owner}/${repo}/pulls`, options);
}

export async function mergePullRequest(
  client: GitHubClient,
  owner: string,
  repo: string,
  pullNumber: number,
  options?: { merge_method?: 'merge' | 'squash' | 'rebase' },
): Promise<{ sha: string; merged: boolean }> {
  return client.put(`/repos/${owner}/${repo}/pulls/${pullNumber}/merge`, options);
}
