/**
 * GitHub API Module
 * Exports all GitHub API functionality
 */

// Named exports for better tree-shaking (avoid export *)

// Types (types.ts)
export type {
  GitHubUser,
  GitHubRepo,
  GitHubLicense,
  GitHubBranch,
  GitHubIssue,
  GitHubLabel,
  GitHubMilestone,
  GitHubPullRequest,
  GitHubPullRequestRef,
  GitHubResult,
  PaginationInfo,
  PaginatedResponse,
  ListReposOptions,
  ListIssuesOptions,
  ListPullRequestsOptions,
  CreateIssueOptions,
  CreatePullRequestOptions,
  SearchReposOptions,
} from './types';

// API Functions (api.ts)
export {
  getAuthenticatedUser,
  listUserRepos,
  getRepo,
  listBranches,
  searchRepos,
  listIssues,
  createIssue,
  listPullRequests,
  createPullRequest,
} from './api';
