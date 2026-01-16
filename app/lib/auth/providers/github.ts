/**
 * GitHub OAuth Provider Configuration
 *
 * GitHub OAuth 2.0 implementation with PKCE support
 * https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
 */

import type { OAuthProviderConfig } from '../oauth';

/**
 * GitHub OAuth scopes
 * https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/scopes-for-oauth-apps
 */
export const GITHUB_SCOPES = {
  REPO: 'repo',
  READ_USER: 'read:user',
  USER_EMAIL: 'user:email',
  READ_ORG: 'read:org',
  GIST: 'gist',
  WORKFLOW: 'workflow',
} as const;

/**
 * Default scopes for BAVINI GitHub integration
 */
export const DEFAULT_GITHUB_SCOPES = [GITHUB_SCOPES.REPO, GITHUB_SCOPES.READ_USER, GITHUB_SCOPES.USER_EMAIL];

/**
 * Create GitHub OAuth provider configuration
 */
export function createGitHubProvider(clientId: string, clientSecret?: string): OAuthProviderConfig {
  return {
    id: 'github',
    name: 'GitHub',
    authorizationUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scopes: DEFAULT_GITHUB_SCOPES,
    clientId,
    clientSecret,
    usePKCE: false, // GitHub doesn't support PKCE for OAuth Apps yet
  };
}

/**
 * GitHub user info response
 */
export interface GitHubUser {
  id: number;
  login: string;
  name: string | null;
  email: string | null;
  avatar_url: string;
  html_url: string;
  type: string;
  public_repos: number;
  followers: number;
  following: number;
}

/**
 * Fetch GitHub user info using access token
 */
export async function getGitHubUser(accessToken: string): Promise<GitHubUser> {
  const response = await fetch('https://api.github.com/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch GitHub user: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Verify GitHub token is still valid
 */
export async function verifyGitHubToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.github.com/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/vnd.github.v3+json',
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}
