/**
 * Auth Status API Route
 *
 * GET /api/auth/status
 * GET /api/auth/status?provider=github
 *
 * Returns the connection status for all OAuth providers.
 * Reads from httpOnly secure cookies - tokens are never exposed to client.
 * If provider query param is passed, returns configured status for that provider.
 */

import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { getSecureTokens, isSecureTokenExpired } from '~/lib/auth/secure-tokens';
import { OAUTH_PROVIDER_IDS, type OAuthProviderId } from '~/lib/auth/providers';
import type { CloudflareEnv } from '~/lib/auth/env';

interface ProviderStatus {
  connected: boolean;
  configured: boolean;
  connectedAt?: number;
  expiresAt?: number;
  hasRefreshToken: boolean;
  scope?: string;
}

interface AuthStatusResponse {
  providers: Record<string, ProviderStatus>;
  timestamp: number;
  // Single provider query response
  configured?: boolean;
  provider?: string;
}

/**
 * Check if OAuth provider has required environment variables configured
 */
function isProviderConfigured(providerId: OAuthProviderId, env: CloudflareEnv): boolean {
  switch (providerId) {
    case 'github':
      return !!(env.GITHUB_CLIENT_ID && env.GITHUB_CLIENT_SECRET);
    case 'netlify':
      return !!(env.NETLIFY_CLIENT_ID && env.NETLIFY_CLIENT_SECRET);
    case 'supabase':
      return !!(env.SUPABASE_CLIENT_ID && env.SUPABASE_CLIENT_SECRET);
    case 'figma':
      return !!(env.FIGMA_CLIENT_ID && env.FIGMA_CLIENT_SECRET);
    case 'notion':
      return !!(env.NOTION_CLIENT_ID && env.NOTION_CLIENT_SECRET);
    case 'stripe':
      return !!(env.STRIPE_CLIENT_ID && env.STRIPE_SECRET_KEY);
    default:
      return false;
  }
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as CloudflareEnv;
  const url = new URL(request.url);
  const providerQuery = url.searchParams.get('provider');

  // Single provider check
  if (providerQuery && OAUTH_PROVIDER_IDS.includes(providerQuery as OAuthProviderId)) {
    const configured = isProviderConfigured(providerQuery as OAuthProviderId, env);
    return json({ configured, provider: providerQuery, timestamp: Date.now() }, {
      headers: { 'Cache-Control': 'private, no-cache, no-store, must-revalidate' },
    });
  }

  const store = await getSecureTokens(request, env);

  const providers: Record<string, ProviderStatus> = {};

  // Initialize all providers with their configured status
  for (const providerId of OAUTH_PROVIDER_IDS) {
    providers[providerId] = {
      connected: false,
      configured: isProviderConfigured(providerId, env),
      hasRefreshToken: false,
    };
  }

  // Update with actual connection status from tokens
  if (store) {
    for (const [provider, token] of Object.entries(store.tokens)) {
      const expired = isSecureTokenExpired(token);

      if (providers[provider]) {
        providers[provider] = {
          ...providers[provider],
          connected: !expired,
          connectedAt: token.connectedAt,
          expiresAt: token.expiresAt,
          hasRefreshToken: !!token.refreshToken,
          scope: token.scope,
        };
      }
    }
  }

  const response: AuthStatusResponse = {
    providers,
    timestamp: Date.now(),
  };

  return json(response, {
    headers: {
      'Cache-Control': 'private, no-cache, no-store, must-revalidate',
    },
  });
}
