/**
 * CORS Proxy configuration for isomorphic-git.
 *
 * Git operations require a CORS proxy because browsers block cross-origin
 * requests to git servers. This module provides configuration for the proxy.
 */

// default CORS proxy provided by isomorphic-git community
const DEFAULT_CORS_PROXY = 'https://cors.isomorphic-git.org';

// alternative proxies (can be used as fallbacks)
const ALTERNATIVE_PROXIES = ['https://cors.isomorphic-git.org'];

let currentProxyIndex = 0;
let customProxyUrl: string | null = null;

/**
 * Get the current CORS proxy URL.
 */
export function getCorsProxyUrl(): string {
  if (customProxyUrl) {
    return customProxyUrl;
  }

  return ALTERNATIVE_PROXIES[currentProxyIndex] || DEFAULT_CORS_PROXY;
}

/**
 * Set a custom CORS proxy URL.
 * Useful for self-hosted proxies or Cloudflare Workers.
 */
export function setCorsProxyUrl(url: string): void {
  customProxyUrl = url;
}

/**
 * Reset to the default CORS proxy.
 */
export function resetCorsProxy(): void {
  customProxyUrl = null;
  currentProxyIndex = 0;
}

/**
 * Try the next available proxy (for failover).
 * Returns true if there's another proxy to try, false if all have been tried.
 */
export function tryNextProxy(): boolean {
  if (customProxyUrl) {
    // if using custom proxy, don't failover
    return false;
  }

  currentProxyIndex++;

  if (currentProxyIndex >= ALTERNATIVE_PROXIES.length) {
    currentProxyIndex = 0;
    return false;
  }

  return true;
}

/**
 * Check if a URL needs a CORS proxy.
 * GitHub, GitLab, Bitbucket, etc. all need proxying.
 */
export function needsCorsProxy(url: string): boolean {
  try {
    const parsedUrl = new URL(url);

    // localhost doesn't need proxy
    if (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1') {
      return false;
    }

    // same origin doesn't need proxy
    if (typeof window !== 'undefined' && parsedUrl.origin === window.location.origin) {
      return false;
    }

    return true;
  } catch {
    return true;
  }
}

/**
 * Parse a git remote URL and extract useful information.
 */
export function parseGitUrl(url: string): {
  provider: 'github' | 'gitlab' | 'bitbucket' | 'other';
  owner: string | null;
  repo: string | null;
  fullName: string | null;
} {
  try {
    // handle SSH URLs (git@github.com:owner/repo.git)
    const sshMatch = url.match(/^git@([^:]+):([^/]+)\/(.+?)(?:\.git)?$/);

    if (sshMatch) {
      const [, host, owner, repo] = sshMatch;
      const provider = host.includes('github')
        ? 'github'
        : host.includes('gitlab')
          ? 'gitlab'
          : host.includes('bitbucket')
            ? 'bitbucket'
            : 'other';

      return {
        provider,
        owner,
        repo,
        fullName: `${owner}/${repo}`,
      };
    }

    // handle HTTPS URLs
    const parsedUrl = new URL(url);
    const pathParts = parsedUrl.pathname.split('/').filter(Boolean);

    if (pathParts.length >= 2) {
      const owner = pathParts[0];
      const repo = pathParts[1].replace(/\.git$/, '');
      const provider = parsedUrl.hostname.includes('github')
        ? 'github'
        : parsedUrl.hostname.includes('gitlab')
          ? 'gitlab'
          : parsedUrl.hostname.includes('bitbucket')
            ? 'bitbucket'
            : 'other';

      return {
        provider,
        owner,
        repo,
        fullName: `${owner}/${repo}`,
      };
    }

    return { provider: 'other', owner: null, repo: null, fullName: null };
  } catch {
    return { provider: 'other', owner: null, repo: null, fullName: null };
  }
}

/**
 * Convert SSH URL to HTTPS URL.
 * isomorphic-git only supports HTTPS.
 */
export function sshToHttps(url: string): string {
  const sshMatch = url.match(/^git@([^:]+):(.+)$/);

  if (sshMatch) {
    const [, host, path] = sshMatch;
    return `https://${host}/${path}`;
  }

  return url;
}
