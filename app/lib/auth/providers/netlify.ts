/**
 * Netlify OAuth Provider Configuration.
 *
 * Netlify OAuth 2.0 implementation.
 * https://docs.netlify.com/api/get-started/#authentication.
 */

import type { OAuthProviderConfig } from '~/lib/auth/oauth';

/**
 * Create Netlify OAuth provider configuration.
 */
export function createNetlifyProvider(clientId: string, clientSecret?: string): OAuthProviderConfig {
  return {
    id: 'netlify',
    name: 'Netlify',
    authorizationUrl: 'https://app.netlify.com/authorize',
    tokenUrl: 'https://api.netlify.com/oauth/token',
    scopes: [],
    clientId,
    clientSecret,
    usePKCE: false,
  };
}

/**
 * Netlify user info response.
 */
export interface NetlifyUser {
  id: string;
  uid: string;
  full_name: string;
  avatar_url: string;
  email: string;
  slug: string;
  created_at: string;
  last_login: string;
  site_count: number;
}

/**
 * Fetch Netlify user info using access token.
 */
export async function getNetlifyUser(accessToken: string): Promise<NetlifyUser> {
  const response = await fetch('https://api.netlify.com/api/v1/user', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Netlify user: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Verify Netlify token is still valid.
 */
export async function verifyNetlifyToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.netlify.com/api/v1/user', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}
