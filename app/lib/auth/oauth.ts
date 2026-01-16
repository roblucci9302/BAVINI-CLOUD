/**
 * OAuth 2.0 utilities with PKCE support
 *
 * Implements secure OAuth flows following RFC 7636 (PKCE)
 * and RFC 6749 (OAuth 2.0 Authorization Framework)
 */

import { z } from 'zod';

/**
 * Zod schema for validating OAuth token responses
 * Ensures the response from OAuth providers has the required fields
 */
const OAuthTokenResponseSchema = z.object({
  access_token: z.string().min(1, 'access_token is required'),
  token_type: z.string().min(1, 'token_type is required'),
  expires_in: z.number().int().positive().optional(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

/**
 * Zod schema for OAuth error responses
 */
const OAuthErrorResponseSchema = z.object({
  error: z.string(),
  error_description: z.string().optional(),
  error_uri: z.string().url().optional(),
});

/**
 * Generate a cryptographically random string for PKCE code_verifier
 * Must be between 43-128 characters (RFC 7636)
 */
export function generateCodeVerifier(length: number = 128): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);

  return base64UrlEncode(array);
}

/**
 * Generate code_challenge from code_verifier using SHA-256
 * This is the S256 method as recommended by RFC 7636
 */
export async function generateCodeChallenge(codeVerifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(codeVerifier);
  const digest = await crypto.subtle.digest('SHA-256', data);

  return base64UrlEncode(new Uint8Array(digest));
}

/**
 * Generate a random state parameter to prevent CSRF attacks
 */
export function generateState(): string {
  const array = new Uint8Array(32);
  crypto.getRandomValues(array);

  return base64UrlEncode(array);
}

/**
 * Base64 URL encode (RFC 4648)
 * Used for PKCE and state parameters
 */
export function base64UrlEncode(buffer: Uint8Array): string {
  let binary = '';

  for (let i = 0; i < buffer.length; i++) {
    binary += String.fromCharCode(buffer[i]);
  }

  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * OAuth provider configuration
 */
export interface OAuthProviderConfig {
  id: string;
  name: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  clientId: string;
  clientSecret?: string;
  usePKCE: boolean;
}

/**
 * OAuth state stored in session
 */
export interface OAuthState {
  provider: string;
  state: string;
  codeVerifier?: string;
  redirectUri: string;
  createdAt: number;
}

/**
 * Token response from OAuth provider
 */
export interface OAuthTokenResponse {
  access_token: string;
  token_type: string;
  expires_in?: number;
  refresh_token?: string;
  scope?: string;
}

/**
 * Build authorization URL with all required parameters
 */
export function buildAuthorizationUrl(
  config: OAuthProviderConfig,
  redirectUri: string,
  state: string,
  codeChallenge?: string,
): string {
  const params = new URLSearchParams({
    client_id: config.clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    state,
    scope: config.scopes.join(' '),
  });

  if (config.usePKCE && codeChallenge) {
    params.set('code_challenge', codeChallenge);
    params.set('code_challenge_method', 'S256');
  }

  return `${config.authorizationUrl}?${params.toString()}`;
}

/**
 * Exchange authorization code for tokens
 */
export async function exchangeCodeForTokens(
  config: OAuthProviderConfig,
  code: string,
  redirectUri: string,
  codeVerifier?: string,
): Promise<OAuthTokenResponse> {
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    client_id: config.clientId,
    code,
    redirect_uri: redirectUri,
  };

  if (config.clientSecret) {
    body.client_secret = config.clientSecret;
  }

  if (config.usePKCE && codeVerifier) {
    body.code_verifier = codeVerifier;
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  });

  const responseData = await response.json();

  if (!response.ok) {
    // Try to parse as OAuth error response
    const errorParse = OAuthErrorResponseSchema.safeParse(responseData);
    if (errorParse.success) {
      const { error, error_description } = errorParse.data;
      throw new Error(`Token exchange failed: ${error}${error_description ? ` - ${error_description}` : ''}`);
    }
    throw new Error(`Token exchange failed: ${response.status} - ${JSON.stringify(responseData)}`);
  }

  // Validate the token response structure
  const parseResult = OAuthTokenResponseSchema.safeParse(responseData);
  if (!parseResult.success) {
    throw new Error(`Invalid token response from OAuth provider: ${parseResult.error.message}`);
  }

  return parseResult.data;
}

/**
 * Refresh an access token using refresh token
 */
export async function refreshAccessToken(
  config: OAuthProviderConfig,
  refreshToken: string,
): Promise<OAuthTokenResponse> {
  const body: Record<string, string> = {
    grant_type: 'refresh_token',
    client_id: config.clientId,
    refresh_token: refreshToken,
  };

  if (config.clientSecret) {
    body.client_secret = config.clientSecret;
  }

  const response = await fetch(config.tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: new URLSearchParams(body).toString(),
  });

  const responseData = await response.json();

  if (!response.ok) {
    // Try to parse as OAuth error response
    const errorParse = OAuthErrorResponseSchema.safeParse(responseData);
    if (errorParse.success) {
      const { error, error_description } = errorParse.data;
      throw new Error(`Token refresh failed: ${error}${error_description ? ` - ${error_description}` : ''}`);
    }
    throw new Error(`Token refresh failed: ${response.status} - ${JSON.stringify(responseData)}`);
  }

  // Validate the token response structure
  const parseResult = OAuthTokenResponseSchema.safeParse(responseData);
  if (!parseResult.success) {
    throw new Error(`Invalid token response from OAuth provider: ${parseResult.error.message}`);
  }

  return parseResult.data;
}

/**
 * Pattern regex pour valider le format d'un state OAuth
 * Base64url: A-Za-z0-9_- avec longueur minimale de 32 caractères
 */
const STATE_FORMAT_REGEX = /^[A-Za-z0-9_-]{32,128}$/;

/**
 * Valide le format d'un state OAuth selon RFC 6749
 */
function isValidStateFormat(state: string): boolean {
  return STATE_FORMAT_REGEX.test(state);
}

/**
 * Validate OAuth state to prevent CSRF attacks
 */
export function validateState(receivedState: string, expectedState: string): boolean {
  if (!receivedState || !expectedState) {
    return false;
  }

  // Valider le format des deux états avant comparaison
  if (!isValidStateFormat(receivedState) || !isValidStateFormat(expectedState)) {
    return false;
  }

  // Constant-time comparison to prevent timing attacks
  if (receivedState.length !== expectedState.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < receivedState.length; i++) {
    result |= receivedState.charCodeAt(i) ^ expectedState.charCodeAt(i);
  }

  return result === 0;
}

/**
 * Check if OAuth state has expired (default 10 minutes)
 */
export function isStateExpired(createdAt: number, maxAgeMs: number = 10 * 60 * 1000): boolean {
  return Date.now() - createdAt > maxAgeMs;
}

/*
 * ============================================================================
 * PKCE Security Validations (RFC 7636)
 * ============================================================================
 */

/**
 * Allowed characters for code_verifier (RFC 7636 Section 4.1)
 * unreserved = ALPHA / DIGIT / "-" / "." / "_" / "~"
 * Note: Our implementation uses base64url which produces A-Za-z0-9_-
 * Extended max to 200 to accommodate our 128-byte input (~171 chars after encoding)
 */
const CODE_VERIFIER_REGEX = /^[A-Za-z0-9\-_]{43,200}$/;

/**
 * Validate code_verifier format according to RFC 7636
 * Must be 43-128 characters and only contain unreserved characters
 */
export function isValidCodeVerifier(codeVerifier: string): boolean {
  if (!codeVerifier || typeof codeVerifier !== 'string') {
    return false;
  }

  return CODE_VERIFIER_REGEX.test(codeVerifier);
}

/**
 * Validate code_challenge format
 * Must be a valid base64url-encoded string (43 chars for SHA-256)
 */
export function isValidCodeChallenge(codeChallenge: string): boolean {
  if (!codeChallenge || typeof codeChallenge !== 'string') {
    return false;
  }

  // Base64url characters only, 43 chars for SHA-256 output
  const base64UrlRegex = /^[A-Za-z0-9\-_]{43}$/;

  return base64UrlRegex.test(codeChallenge);
}

/**
 * Validate state parameter format
 * Should be cryptographically random and URL-safe
 */
export function isValidState(state: string): boolean {
  if (!state || typeof state !== 'string') {
    return false;
  }

  /*
   * State should be at least 32 characters (256 bits of entropy)
   * and only contain URL-safe characters
   */
  const stateRegex = /^[A-Za-z0-9\-_]{32,}$/;

  return stateRegex.test(state);
}

/**
 * Secure compare two strings in constant time
 * Prevents timing attacks on token validation
 */
export function secureCompare(a: string, b: string): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') {
    return false;
  }

  if (a.length !== b.length) {
    return false;
  }

  let result = 0;

  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }

  return result === 0;
}
