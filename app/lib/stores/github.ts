/**
 * GitHub store for managing GitHub state (user, repos, issues, PRs).
 * Uses the GitHub API client and OAuth tokens for authentication.
 */

import { atom, computed } from 'nanostores';
import * as githubApi from '~/lib/github/api';
import type { GitHubUser, GitHubRepo, GitHubIssue, GitHubPullRequest } from '~/lib/github/types';
import { getAccessToken } from '~/lib/auth/tokens';

/*
 * ============================================
 * Types
 * ============================================
 */

export interface GitHubState {
  user: GitHubUser | null;
  repos: GitHubRepo[];
  selectedRepo: { owner: string; repo: string } | null;
  issues: GitHubIssue[];
  pullRequests: GitHubPullRequest[];
  loading: {
    user: boolean;
    repos: boolean;
    issues: boolean;
    pullRequests: boolean;
  };
  error: string | null;
}

/*
 * ============================================
 * Store
 * ============================================
 */

const initialState: GitHubState = {
  user: null,
  repos: [],
  selectedRepo: null,
  issues: [],
  pullRequests: [],
  loading: {
    user: false,
    repos: false,
    issues: false,
    pullRequests: false,
  },
  error: null,
};

export const githubStore = atom<GitHubState>(initialState);

/*
 * ============================================
 * Computed
 * ============================================
 */

export const isGitHubConnected = computed(githubStore, (state) => state.user !== null);

export const githubUser = computed(githubStore, (state) => state.user);

export const githubRepos = computed(githubStore, (state) => state.repos);

export const selectedGitHubRepo = computed(githubStore, (state) => state.selectedRepo);

export const githubIssues = computed(githubStore, (state) => state.issues);

export const githubPullRequests = computed(githubStore, (state) => state.pullRequests);

export const isLoading = computed(githubStore, (state) => {
  return state.loading.user || state.loading.repos || state.loading.issues || state.loading.pullRequests;
});

export const githubError = computed(githubStore, (state) => state.error);

/*
 * ============================================
 * Actions
 * ============================================
 */

/**
 * Set loading state for a specific resource.
 */
function setLoading(resource: keyof GitHubState['loading'], isLoading: boolean): void {
  const state = githubStore.get();
  githubStore.set({
    ...state,
    loading: { ...state.loading, [resource]: isLoading },
    error: isLoading ? null : state.error,
  });
}

/**
 * Set error state.
 */
function setError(error: string | null): void {
  const state = githubStore.get();
  githubStore.set({ ...state, error });
}

/**
 * Fetch the authenticated GitHub user.
 */
export async function fetchGitHubUser(): Promise<GitHubUser | null> {
  const token = getAccessToken('github');

  if (!token) {
    setError('Token GitHub non configuré');
    return null;
  }

  setLoading('user', true);

  const result = await githubApi.getAuthenticatedUser(token);

  setLoading('user', false);

  if (!result.success) {
    setError(result.error || "Erreur lors de la récupération de l'utilisateur");
    return null;
  }

  const state = githubStore.get();
  githubStore.set({ ...state, user: result.data || null, error: null });

  return result.data || null;
}

/**
 * Fetch repositories for the authenticated user.
 */
export async function fetchUserRepos(): Promise<GitHubRepo[]> {
  const token = getAccessToken('github');

  if (!token) {
    setError('Token GitHub non configuré');
    return [];
  }

  setLoading('repos', true);

  const result = await githubApi.listUserRepos(token, { sort: 'updated', perPage: 100 });

  setLoading('repos', false);

  if (!result.success) {
    setError(result.error || 'Erreur lors de la récupération des repositories');
    return [];
  }

  const state = githubStore.get();
  githubStore.set({ ...state, repos: result.data || [], error: null });

  return result.data || [];
}

/**
 * Select a repository to view issues and PRs.
 */
export function selectRepo(owner: string, repo: string): void {
  const state = githubStore.get();
  githubStore.set({
    ...state,
    selectedRepo: { owner, repo },
    issues: [],
    pullRequests: [],
  });
}

/**
 * Clear selected repository.
 */
export function clearSelectedRepo(): void {
  const state = githubStore.get();
  githubStore.set({
    ...state,
    selectedRepo: null,
    issues: [],
    pullRequests: [],
  });
}

/**
 * Fetch issues for the selected repository.
 */
export async function fetchRepoIssues(state?: 'open' | 'closed' | 'all'): Promise<GitHubIssue[]> {
  const token = getAccessToken('github');
  const currentState = githubStore.get();
  const { selectedRepo } = currentState;

  if (!token) {
    setError('Token GitHub non configuré');
    return [];
  }

  if (!selectedRepo) {
    setError('Aucun repository sélectionné');
    return [];
  }

  setLoading('issues', true);

  const result = await githubApi.listIssues(token, selectedRepo.owner, selectedRepo.repo, {
    state: state || 'open',
    perPage: 50,
  });

  setLoading('issues', false);

  if (!result.success) {
    setError(result.error || 'Erreur lors de la récupération des issues');
    return [];
  }

  githubStore.set({ ...githubStore.get(), issues: result.data || [], error: null });

  return result.data || [];
}

/**
 * Fetch pull requests for the selected repository.
 */
export async function fetchRepoPullRequests(state?: 'open' | 'closed' | 'all'): Promise<GitHubPullRequest[]> {
  const token = getAccessToken('github');
  const currentState = githubStore.get();
  const { selectedRepo } = currentState;

  if (!token) {
    setError('Token GitHub non configuré');
    return [];
  }

  if (!selectedRepo) {
    setError('Aucun repository sélectionné');
    return [];
  }

  setLoading('pullRequests', true);

  const result = await githubApi.listPullRequests(token, selectedRepo.owner, selectedRepo.repo, {
    state: state || 'open',
    perPage: 50,
  });

  setLoading('pullRequests', false);

  if (!result.success) {
    setError(result.error || 'Erreur lors de la récupération des pull requests');
    return [];
  }

  githubStore.set({ ...githubStore.get(), pullRequests: result.data || [], error: null });

  return result.data || [];
}

/**
 * Create a new issue in the selected repository.
 */
export async function createIssue(title: string, body?: string, labels?: string[]): Promise<GitHubIssue | null> {
  const token = getAccessToken('github');
  const { selectedRepo } = githubStore.get();

  if (!token) {
    setError('Token GitHub non configuré');
    return null;
  }

  if (!selectedRepo) {
    setError('Aucun repository sélectionné');
    return null;
  }

  setLoading('issues', true);

  const result = await githubApi.createIssue(token, selectedRepo.owner, selectedRepo.repo, {
    title,
    body,
    labels,
  });

  setLoading('issues', false);

  if (!result.success) {
    setError(result.error || "Erreur lors de la création de l'issue");
    return null;
  }

  // Refresh issues list
  await fetchRepoIssues();

  return result.data || null;
}

/**
 * Create a new pull request in the selected repository.
 */
export async function createPullRequest(
  title: string,
  head: string,
  base: string,
  body?: string,
): Promise<GitHubPullRequest | null> {
  const token = getAccessToken('github');
  const { selectedRepo } = githubStore.get();

  if (!token) {
    setError('Token GitHub non configuré');
    return null;
  }

  if (!selectedRepo) {
    setError('Aucun repository sélectionné');
    return null;
  }

  setLoading('pullRequests', true);

  const result = await githubApi.createPullRequest(token, selectedRepo.owner, selectedRepo.repo, {
    title,
    head,
    base,
    body,
  });

  setLoading('pullRequests', false);

  if (!result.success) {
    setError(result.error || 'Erreur lors de la création de la pull request');
    return null;
  }

  // Refresh PRs list
  await fetchRepoPullRequests();

  return result.data || null;
}

/**
 * Initialize GitHub connection by fetching user and repos.
 * Optimized: fetches user and repos in parallel for faster initialization.
 */
export async function initializeGitHub(): Promise<boolean> {
  // Fetch user and repos in parallel for better performance
  const [user] = await Promise.all([fetchGitHubUser(), fetchUserRepos()]);

  // Return false if user fetch failed (invalid token)
  return user !== null;
}

/**
 * Disconnect from GitHub (clear state).
 */
export function disconnectGitHub(): void {
  githubStore.set(initialState);
}

/**
 * Reset error state.
 */
export function clearGitHubError(): void {
  setError(null);
}
