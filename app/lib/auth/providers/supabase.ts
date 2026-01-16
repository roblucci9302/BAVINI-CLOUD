/**
 * Supabase OAuth Provider Configuration.
 *
 * Supabase Management API OAuth 2.1 implementation with PKCE.
 * https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration.
 */

import type { OAuthProviderConfig } from '~/lib/auth/oauth';

/**
 * Supabase OAuth scopes.
 */
export const SUPABASE_SCOPES = {
  ALL: 'all',
} as const;

/**
 * Default scopes for BAVINI Supabase integration.
 */
export const DEFAULT_SUPABASE_SCOPES = [SUPABASE_SCOPES.ALL];

/**
 * Create Supabase OAuth provider configuration.
 */
export function createSupabaseProvider(clientId: string, clientSecret?: string): OAuthProviderConfig {
  return {
    id: 'supabase',
    name: 'Supabase',
    authorizationUrl: 'https://api.supabase.com/v1/oauth/authorize',
    tokenUrl: 'https://api.supabase.com/v1/oauth/token',
    scopes: DEFAULT_SUPABASE_SCOPES,
    clientId,
    clientSecret,
    usePKCE: true,
  };
}

/**
 * Supabase organization info.
 */
export interface SupabaseOrganization {
  id: string;
  name: string;
  slug: string;
}

/**
 * Supabase project info.
 */
export interface SupabaseProject {
  id: string;
  organization_id: string;
  name: string;
  region: string;
  created_at: string;
  status: string;
}

/**
 * Fetch Supabase organizations using access token.
 */
export async function getSupabaseOrganizations(accessToken: string): Promise<SupabaseOrganization[]> {
  const response = await fetch('https://api.supabase.com/v1/organizations', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Supabase organizations: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Fetch Supabase projects using access token.
 */
export async function getSupabaseProjects(accessToken: string): Promise<SupabaseProject[]> {
  const response = await fetch('https://api.supabase.com/v1/projects', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Supabase projects: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Verify Supabase token is still valid.
 */
export async function verifySupabaseToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.supabase.com/v1/organizations', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Refresh Supabase access token.
 */
export async function refreshSupabaseToken(
  clientId: string,
  clientSecret: string,
  refreshToken: string,
): Promise<{ access_token: string; refresh_token: string; expires_in: number }> {
  const response = await fetch('https://api.supabase.com/v1/oauth/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
    }).toString(),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to refresh Supabase token: ${response.status} - ${error}`);
  }

  return response.json();
}
