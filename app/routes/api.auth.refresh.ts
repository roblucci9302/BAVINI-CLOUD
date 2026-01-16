/**
 * OAuth Token Refresh Route
 *
 * POST /api/auth/refresh
 *
 * Refreshes an expired access token using the refresh token
 * Returns new access token (and possibly new refresh token)
 */

import { type ActionFunctionArgs } from '@remix-run/cloudflare';
import { refreshAccessToken } from '~/lib/auth/oauth';
import { getProviderConfig, type OAuthProviderId } from '~/lib/auth/providers';
import type { CloudflareEnv } from '~/lib/auth/env';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('api.auth.refresh');

/**
 * Request body for token refresh
 */
interface RefreshRequest {
  provider: string;
  refreshToken: string;
}

export async function action({ request, context }: ActionFunctionArgs) {
  // Only allow POST
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let body: RefreshRequest;

  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid JSON body' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const { provider, refreshToken } = body;

  // Validate required fields
  if (!provider || !refreshToken) {
    return new Response(JSON.stringify({ error: 'provider et refreshToken sont requis' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const env = context.cloudflare.env as CloudflareEnv;

  // Get provider configuration
  const config = getProviderConfig(provider as OAuthProviderId, env);

  if (!config) {
    return new Response(JSON.stringify({ error: `Provider ${provider} non configuré` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // GitHub OAuth tokens don't expire (only OAuth Apps, not GitHub Apps)
    if (provider === 'github') {
      return new Response(JSON.stringify({ error: "Les tokens GitHub OAuth n'expirent pas" }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Standard OAuth refresh for Netlify and Supabase
    const tokenResponse = await refreshAccessToken(config, refreshToken);

    return new Response(
      JSON.stringify({
        success: true,
        accessToken: tokenResponse.access_token,
        tokenType: tokenResponse.token_type,
        expiresIn: tokenResponse.expires_in,
        refreshToken: tokenResponse.refresh_token,
        scope: tokenResponse.scope,
      }),
      {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  } catch (err) {
    // Log l'erreur complète côté serveur
    logger.error('Token refresh error:', err);

    // Message générique pour le client (ne pas exposer les détails)
    const networkErrorPatterns = ['fetch', 'ECONNREFUSED', 'ETIMEDOUT', 'ENOTFOUND', 'network'];
    const isNetworkError =
      err instanceof Error && networkErrorPatterns.some((pattern) => err.message.includes(pattern));
    const clientMessage = isNetworkError
      ? 'Erreur de connexion au serveur OAuth'
      : 'Échec du rafraîchissement du token';

    return new Response(JSON.stringify({ error: clientMessage }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}

/**
 * Reject GET requests
 */
export async function loader() {
  return new Response(JSON.stringify({ error: 'Use POST method' }), {
    status: 405,
    headers: { 'Content-Type': 'application/json' },
  });
}
