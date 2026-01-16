/**
 * OAuth Initiation Route
 *
 * GET /api/auth/:provider
 *
 * Initiates OAuth flow by redirecting to the provider's authorization page
 * Generates and stores PKCE code_verifier and state for CSRF protection
 */

import { type LoaderFunctionArgs, redirect } from '@remix-run/cloudflare';
import { generateCodeVerifier, generateCodeChallenge, generateState, buildAuthorizationUrl } from '~/lib/auth/oauth';
import { supportsOAuth, getProviderConfig, type OAuthProviderId } from '~/lib/auth/providers';
import type { CloudflareEnv } from '~/lib/auth/env';
import { checkRateLimit, createRateLimitResponse, RATE_LIMIT_CONFIGS } from '~/lib/security/rate-limiter';

export async function loader({ params, request, context }: LoaderFunctionArgs) {
  // Rate limiting: 10 requêtes/minute pour les routes d'authentification
  const rateLimitResult = await checkRateLimit(request, RATE_LIMIT_CONFIGS.auth);

  if (!rateLimitResult.allowed) {
    return createRateLimitResponse(rateLimitResult, RATE_LIMIT_CONFIGS.auth);
  }

  const provider = params.provider;

  // Validate provider
  if (!provider || !supportsOAuth(provider)) {
    return new Response(JSON.stringify({ error: `Provider non supporté: ${provider}` }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const env = context.cloudflare.env as CloudflareEnv;

  // Get provider configuration
  const config = getProviderConfig(provider as OAuthProviderId, env);

  if (!config) {
    return new Response(
      JSON.stringify({
        error: `Provider ${provider} non configuré. Vérifiez les variables d'environnement.`,
      }),
      {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      },
    );
  }

  // Generate PKCE parameters
  const codeVerifier = generateCodeVerifier();
  const codeChallenge = config.usePKCE ? await generateCodeChallenge(codeVerifier) : undefined;

  // Generate state for CSRF protection
  const state = generateState();

  // Build redirect URI
  const url = new URL(request.url);
  const redirectUri = `${url.origin}/api/auth/callback`;

  // Build authorization URL
  const authUrl = buildAuthorizationUrl(config, redirectUri, state, codeChallenge);

  // Store state and code_verifier in a secure cookie for later validation
  const stateData = JSON.stringify({
    provider,
    state,
    codeVerifier: config.usePKCE ? codeVerifier : undefined,
    redirectUri,
    createdAt: Date.now(),
  });

  // Set secure cookie with OAuth state
  const cookieOptions = [
    `bavini_oauth_state=${encodeURIComponent(stateData)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    'Max-Age=600', // 10 minutes
  ];

  // Add Secure flag in production
  if (url.protocol === 'https:') {
    cookieOptions.push('Secure');
  }

  // Redirect to provider authorization page
  return redirect(authUrl, {
    headers: {
      'Set-Cookie': cookieOptions.join('; '),
    },
  });
}
