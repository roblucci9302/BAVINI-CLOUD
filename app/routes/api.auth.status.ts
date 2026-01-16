/**
 * Auth Status API Route
 *
 * GET /api/auth/status
 *
 * Returns the connection status for all OAuth providers.
 * Reads from httpOnly secure cookies - tokens are never exposed to client.
 */

import { type LoaderFunctionArgs, json } from '@remix-run/cloudflare';
import { getSecureTokens, isSecureTokenExpired, type SecureTokenData } from '~/lib/auth/secure-tokens';
import type { CloudflareEnv } from '~/lib/auth/env';

interface ProviderStatus {
  connected: boolean;
  connectedAt?: number;
  expiresAt?: number;
  hasRefreshToken: boolean;
  scope?: string;
}

interface AuthStatusResponse {
  providers: Record<string, ProviderStatus>;
  timestamp: number;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  const env = context.cloudflare.env as CloudflareEnv;

  const store = await getSecureTokens(request, env);

  const providers: Record<string, ProviderStatus> = {};

  if (store) {
    for (const [provider, token] of Object.entries(store.tokens)) {
      const expired = isSecureTokenExpired(token);

      providers[provider] = {
        connected: !expired,
        connectedAt: token.connectedAt,
        expiresAt: token.expiresAt,
        hasRefreshToken: !!token.refreshToken,
        scope: token.scope,
      };
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
