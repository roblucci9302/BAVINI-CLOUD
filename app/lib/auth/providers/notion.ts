/**
 * Notion OAuth Provider Configuration
 *
 * Notion OAuth 2.0 implementation
 * https://developers.notion.com/docs/authorization
 */

import type { OAuthProviderConfig } from '../oauth';

/**
 * Notion doesn't use traditional scopes - permissions are granted per page/database
 * during the OAuth flow by the user selecting which pages to share.
 */
export const NOTION_SCOPES: string[] = [];

/**
 * Create Notion OAuth provider configuration
 */
export function createNotionProvider(clientId: string, clientSecret?: string): OAuthProviderConfig {
  return {
    id: 'notion',
    name: 'Notion',
    authorizationUrl: 'https://api.notion.com/v1/oauth/authorize',
    tokenUrl: 'https://api.notion.com/v1/oauth/token',
    scopes: NOTION_SCOPES,
    clientId,
    clientSecret,
    usePKCE: false, // Notion doesn't support PKCE
  };
}

/**
 * Notion user/bot info response
 */
export interface NotionUser {
  id: string;
  type: 'person' | 'bot';
  name?: string;
  avatar_url?: string | null;
  person?: {
    email: string;
  };
  bot?: {
    owner: {
      type: 'workspace' | 'user';
      workspace?: boolean;
      user?: NotionUser;
    };
    workspace_name?: string;
  };
}

/**
 * Notion workspace info
 */
export interface NotionWorkspace {
  id: string;
  name: string;
  icon?: string | null;
}

/**
 * Notion OAuth token response
 */
export interface NotionOAuthResponse {
  access_token: string;
  token_type: string;
  bot_id: string;
  workspace_id: string;
  workspace_name?: string;
  workspace_icon?: string;
  owner: NotionUser;
  duplicated_template_id?: string;
}

/**
 * Fetch Notion user/bot info using access token
 */
export async function getNotionUser(accessToken: string): Promise<NotionUser> {
  const response = await fetch('https://api.notion.com/v1/users/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Notion-Version': '2022-06-28',
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Notion user: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Verify Notion token is still valid
 */
export async function verifyNotionToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.notion.com/v1/users/me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Notion-Version': '2022-06-28',
      },
    });

    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Search Notion pages and databases
 */
export async function searchNotion(
  accessToken: string,
  query?: string,
  filter?: { property: 'object'; value: 'page' | 'database' },
): Promise<{ results: unknown[]; has_more: boolean; next_cursor: string | null }> {
  const response = await fetch('https://api.notion.com/v1/search', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'Notion-Version': '2022-06-28',
    },
    body: JSON.stringify({
      query,
      filter,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to search Notion: ${response.status} - ${error}`);
  }

  return response.json();
}
