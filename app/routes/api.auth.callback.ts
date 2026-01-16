/**
 * OAuth Callback Route
 *
 * GET /api/auth/callback
 *
 * Handles OAuth callback from providers
 * Exchanges authorization code for tokens and returns to client
 */

import { type LoaderFunctionArgs, redirect } from '@remix-run/cloudflare';
import { validateState, isStateExpired, exchangeCodeForTokens } from '~/lib/auth/oauth';
import { getProviderConfig, type OAuthProviderId } from '~/lib/auth/providers';
import { generateOAuthSuccessPage } from '~/lib/auth/templates/oauth-success';
import type { CloudflareEnv } from '~/lib/auth/env';
import { checkRateLimit, createRateLimitResponse, RATE_LIMIT_CONFIGS } from '~/lib/security/rate-limiter';
import { setSecureToken, type SecureTokenData } from '~/lib/auth/secure-tokens';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('OAuthCallback');

/**
 * OAuth state stored in cookie
 */
interface OAuthStateCookie {
  provider: string;
  state: string;
  codeVerifier?: string;
  redirectUri: string;
  createdAt: number;
}

/**
 * Parse cookie header to get specific cookie value
 */
function getCookie(cookieHeader: string | null, name: string): string | null {
  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((c) => c.trim());

  for (const cookie of cookies) {
    const [cookieName, ...valueParts] = cookie.split('=');

    if (cookieName === name) {
      return decodeURIComponent(valueParts.join('='));
    }
  }

  return null;
}

export async function loader({ request, context }: LoaderFunctionArgs) {
  // Rate limiting: 10 requêtes/minute pour les routes d'authentification
  const rateLimitResult = await checkRateLimit(request, RATE_LIMIT_CONFIGS.auth);

  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult, RATE_LIMIT_CONFIGS.auth);
  }

  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const error = url.searchParams.get('error');
  const errorDescription = url.searchParams.get('error_description');

  // Handle OAuth errors from provider
  if (error) {
    const errorMessage = errorDescription || error;

    return redirect(`/?oauth_error=${encodeURIComponent(errorMessage)}`);
  }

  // Validate required parameters
  if (!code || !state) {
    return redirect('/?oauth_error=' + encodeURIComponent('Paramètres OAuth manquants'));
  }

  // Get stored state from cookie
  const cookieHeader = request.headers.get('Cookie');
  const storedStateJson = getCookie(cookieHeader, 'bavini_oauth_state');

  if (!storedStateJson) {
    return redirect('/?oauth_error=' + encodeURIComponent('Session OAuth expirée. Veuillez réessayer.'));
  }

  let storedState: OAuthStateCookie;

  try {
    storedState = JSON.parse(storedStateJson);
  } catch {
    return redirect('/?oauth_error=' + encodeURIComponent('Session OAuth invalide'));
  }

  // Validate state to prevent CSRF
  if (!validateState(state, storedState.state)) {
    return redirect('/?oauth_error=' + encodeURIComponent('Validation OAuth échouée (CSRF)'));
  }

  // Check if state is expired
  if (isStateExpired(storedState.createdAt)) {
    return redirect('/?oauth_error=' + encodeURIComponent('Session OAuth expirée. Veuillez réessayer.'));
  }

  const env = context.cloudflare.env as CloudflareEnv;
  const provider = storedState.provider as OAuthProviderId;

  // Get provider configuration
  const config = getProviderConfig(provider, env);

  if (!config) {
    return redirect('/?oauth_error=' + encodeURIComponent(`Provider ${provider} non configuré`));
  }

  try {
    // Standard OAuth token exchange for all providers
    const tokenResponse = await exchangeCodeForTokens(config, code, storedState.redirectUri, storedState.codeVerifier);

    const connectedAt = Date.now();
    const expiresAt = tokenResponse.expires_in ? connectedAt + tokenResponse.expires_in * 1000 : undefined;

    // Store token in httpOnly secure cookie for server-side access
    const secureTokenData: SecureTokenData = {
      provider,
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token,
      tokenType: tokenResponse.token_type || 'Bearer',
      expiresAt,
      scope: tokenResponse.scope,
      connectedAt,
    };

    const isDev = process.env.NODE_ENV === 'development';
    const secureTokenCookie = await setSecureToken(request, provider, secureTokenData, env, isDev);

    /*
     * Generate success page HTML (still sends to client for backward compatibility)
     * TODO: Remove client-side token storage once all API calls use server proxy
     */
    const successHtml = generateOAuthSuccessPage({
      provider,
      accessToken: tokenResponse.access_token,
      tokenType: tokenResponse.token_type || 'Bearer',
      expiresIn: tokenResponse.expires_in,
      refreshToken: tokenResponse.refresh_token,
      scope: tokenResponse.scope,
      connectedAt,
    });

    // Set both cookies: clear OAuth state + set secure token
    const headers = new Headers();
    headers.set('Content-Type', 'text/html; charset=utf-8');
    headers.append('Set-Cookie', 'bavini_oauth_state=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax');
    headers.append('Set-Cookie', secureTokenCookie);

    return new Response(successHtml, { status: 200, headers });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Échec de connexion OAuth';
    logger.error('OAuth callback error:', err);

    return redirect('/?oauth_error=' + encodeURIComponent(errorMessage));
  }
}
