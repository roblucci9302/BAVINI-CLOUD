/**
 * Figma OAuth Provider Configuration
 *
 * Figma OAuth 2.0 implementation with PKCE support
 * https://www.figma.com/developers/api#oauth2
 */

import type { OAuthProviderConfig } from '../oauth';

/**
 * Figma OAuth scopes
 * https://www.figma.com/developers/api#oauth-scopes
 */
export const FIGMA_SCOPES = {
  FILE_READ: 'file_read',
  FILE_DEV_RESOURCES_READ: 'file_dev_resources:read',
  FILE_DEV_RESOURCES_WRITE: 'file_dev_resources:write',
  WEBHOOKS_WRITE: 'webhooks:write',
} as const;

/**
 * Default scopes for BAVINI Figma integration
 */
export const DEFAULT_FIGMA_SCOPES = [FIGMA_SCOPES.FILE_READ, FIGMA_SCOPES.FILE_DEV_RESOURCES_READ];

/**
 * Create Figma OAuth provider configuration
 */
export function createFigmaProvider(clientId: string, clientSecret?: string): OAuthProviderConfig {
  return {
    id: 'figma',
    name: 'Figma',
    authorizationUrl: 'https://www.figma.com/oauth',
    tokenUrl: 'https://www.figma.com/api/oauth/token',
    scopes: DEFAULT_FIGMA_SCOPES,
    clientId,
    clientSecret,
    usePKCE: true, // Figma supports PKCE
  };
}

/**
 * Figma user info response
 */
export interface FigmaUser {
  id: string;
  email: string;
  handle: string;
  img_url: string;
}

/**
 * Figma file info response
 */
export interface FigmaFile {
  name: string;
  lastModified: string;
  thumbnailUrl: string;
  version: string;
}

/**
 * Figma component info
 */
export interface FigmaComponent {
  key: string;
  name: string;
  description: string;
  node_id: string;
}

/**
 * Figma style info
 */
export interface FigmaStyle {
  key: string;
  name: string;
  description: string;
  style_type: 'FILL' | 'TEXT' | 'EFFECT' | 'GRID';
}

/**
 * Fetch Figma user info using access token
 */
export async function getFigmaUser(accessToken: string): Promise<FigmaUser> {
  const response = await fetch('https://api.figma.com/v1/me', {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Figma user: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Verify Figma token is still valid
 */
export async function verifyFigmaToken(accessToken: string): Promise<boolean> {
  try {
    const response = await fetch('https://api.figma.com/v1/me', {
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
 * Get Figma file info
 */
export async function getFigmaFile(accessToken: string, fileKey: string): Promise<FigmaFile> {
  const response = await fetch(`https://api.figma.com/v1/files/${fileKey}?depth=1`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Figma file: ${response.status} - ${error}`);
  }

  return response.json();
}

/**
 * Get file styles (colors, typography, effects)
 */
export async function getFigmaStyles(accessToken: string, fileKey: string): Promise<Record<string, FigmaStyle>> {
  const response = await fetch(`https://api.figma.com/v1/files/${fileKey}/styles`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Figma styles: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as { meta?: { styles?: Record<string, FigmaStyle> } };

  return data.meta?.styles || {};
}

/**
 * Get file components
 */
export async function getFigmaComponents(
  accessToken: string,
  fileKey: string,
): Promise<Record<string, FigmaComponent>> {
  const response = await fetch(`https://api.figma.com/v1/files/${fileKey}/components`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to fetch Figma components: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as { meta?: { components?: Record<string, FigmaComponent> } };

  return data.meta?.components || {};
}

/**
 * Export nodes as images (PNG, SVG, PDF, JPG)
 */
export async function exportFigmaImages(
  accessToken: string,
  fileKey: string,
  nodeIds: string[],
  format: 'png' | 'svg' | 'pdf' | 'jpg' = 'svg',
  scale: number = 1,
): Promise<Record<string, string>> {
  const ids = nodeIds.join(',');
  const response = await fetch(
    `https://api.figma.com/v1/images/${fileKey}?ids=${ids}&format=${format}&scale=${scale}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to export Figma images: ${response.status} - ${error}`);
  }

  const data = (await response.json()) as { images?: Record<string, string> };

  return data.images || {};
}
