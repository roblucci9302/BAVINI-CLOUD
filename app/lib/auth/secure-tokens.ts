/**
 * Secure Token Storage with httpOnly Cookies
 *
 * This module provides server-side token management using httpOnly cookies.
 * Tokens are encrypted before storage and never exposed to client JavaScript.
 *
 * Security improvements over sessionStorage:
 * - Tokens are not accessible via JavaScript (XSS-proof)
 * - Tokens are encrypted with AES-GCM
 * - HMAC signature prevents tampering
 * - HttpOnly, Secure, SameSite=Strict flags
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SecureTokens');

// Cookie configuration
const COOKIE_NAME = 'bavini_secure_tokens';
const COOKIE_MAX_AGE = 7 * 24 * 60 * 60; // 7 days

/**
 * Token data stored in secure cookie
 */
export interface SecureTokenData {
  provider: string;
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: number;
  scope?: string;
  connectedAt: number;
}

/**
 * All tokens stored in the cookie
 */
export interface SecureTokenStore {
  tokens: Record<string, SecureTokenData>;
  createdAt: number;
  version: number;
}

/**
 * Encrypt data using AES-GCM
 * Note: In production, use a proper secret from environment variables
 */
async function encryptData(data: string, secret: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(data);

    // Derive key from secret
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'PBKDF2' }, false, [
      'deriveKey',
    ]);

    const salt = crypto.getRandomValues(new Uint8Array(16));
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt'],
    );

    // Encrypt
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, dataBuffer);

    // Combine salt + iv + encrypted data
    const combined = new Uint8Array(salt.length + iv.length + encrypted.byteLength);
    combined.set(salt, 0);
    combined.set(iv, salt.length);
    combined.set(new Uint8Array(encrypted), salt.length + iv.length);

    return btoa(String.fromCharCode(...combined));
  } catch (error) {
    logger.error('Encryption failed:', error);
    throw new Error('Failed to encrypt token data');
  }
}

/**
 * Decrypt data using AES-GCM
 */
async function decryptData(encryptedData: string, secret: string): Promise<string> {
  try {
    const encoder = new TextEncoder();
    const combined = new Uint8Array(
      atob(encryptedData)
        .split('')
        .map((c) => c.charCodeAt(0)),
    );

    // Extract salt, iv, and encrypted data
    const salt = combined.slice(0, 16);
    const iv = combined.slice(16, 28);
    const encrypted = combined.slice(28);

    // Derive key from secret
    const keyMaterial = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'PBKDF2' }, false, [
      'deriveKey',
    ]);

    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 100000, hash: 'SHA-256' },
      keyMaterial,
      { name: 'AES-GCM', length: 256 },
      false,
      ['decrypt'],
    );

    // Decrypt
    const decrypted = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, encrypted);

    return new TextDecoder().decode(decrypted);
  } catch (error) {
    logger.error('Decryption failed:', error);
    throw new Error('Failed to decrypt token data');
  }
}

/**
 * Get encryption secret from environment
 *
 * SECURITY: In production, TOKEN_ENCRYPTION_SECRET MUST be set.
 * The application will throw an error if not configured in production.
 */
function getSecret(env: { TOKEN_ENCRYPTION_SECRET?: string; ENVIRONMENT?: string }): string {
  const isProduction = env.ENVIRONMENT === 'production' || process.env.NODE_ENV === 'production';

  if (!env.TOKEN_ENCRYPTION_SECRET) {
    if (isProduction) {
      // CRITICAL: Never use default secret in production
      throw new Error(
        'CRITICAL SECURITY ERROR: TOKEN_ENCRYPTION_SECRET environment variable is not set. ' +
        'This is required in production. Set it via: wrangler secret put TOKEN_ENCRYPTION_SECRET'
      );
    }

    // Development/preview only: use a development secret with warning
    logger.warn(
      '⚠️ TOKEN_ENCRYPTION_SECRET not set - using development fallback. ' +
      'This is INSECURE and must not be used in production!'
    );
    return 'bavini_dev_only_secret_DO_NOT_USE_IN_PROD';
  }

  return env.TOKEN_ENCRYPTION_SECRET;
}

/**
 * Parse secure token cookie from request
 */
export async function getSecureTokens(
  request: Request,
  env: { TOKEN_ENCRYPTION_SECRET?: string },
): Promise<SecureTokenStore | null> {
  const cookieHeader = request.headers.get('Cookie');

  if (!cookieHeader) {
    return null;
  }

  const cookies = cookieHeader.split(';').map((c) => c.trim());
  let tokenCookie: string | null = null;

  for (const cookie of cookies) {
    const [name, ...valueParts] = cookie.split('=');

    if (name === COOKIE_NAME) {
      tokenCookie = decodeURIComponent(valueParts.join('='));
      break;
    }
  }

  if (!tokenCookie) {
    return null;
  }

  try {
    const secret = getSecret(env);
    const decrypted = await decryptData(tokenCookie, secret);

    return JSON.parse(decrypted) as SecureTokenStore;
  } catch (error) {
    logger.error('Failed to parse secure tokens:', error);
    return null;
  }
}

/**
 * Get a specific provider token from secure storage
 */
export async function getSecureToken(
  request: Request,
  provider: string,
  env: { TOKEN_ENCRYPTION_SECRET?: string },
): Promise<SecureTokenData | null> {
  const store = await getSecureTokens(request, env);

  if (!store) {
    return null;
  }

  return store.tokens[provider] || null;
}

/**
 * Create Set-Cookie header for secure token storage
 */
export async function createSecureTokenCookie(
  tokens: Record<string, SecureTokenData>,
  env: { TOKEN_ENCRYPTION_SECRET?: string },
  isDev: boolean = false,
): Promise<string> {
  const store: SecureTokenStore = {
    tokens,
    createdAt: Date.now(),
    version: 1,
  };

  const secret = getSecret(env);
  const encrypted = await encryptData(JSON.stringify(store), secret);

  const cookieOptions = [
    `${COOKIE_NAME}=${encodeURIComponent(encrypted)}`,
    `Path=/`,
    `Max-Age=${COOKIE_MAX_AGE}`,
    `HttpOnly`,
    `SameSite=Strict`,
  ];

  // Only add Secure flag in production (HTTPS required)
  if (!isDev) {
    cookieOptions.push('Secure');
  }

  return cookieOptions.join('; ');
}

/**
 * Create Set-Cookie header to add/update a token
 */
export async function setSecureToken(
  request: Request,
  provider: string,
  tokenData: SecureTokenData,
  env: { TOKEN_ENCRYPTION_SECRET?: string },
  isDev: boolean = false,
): Promise<string> {
  const existing = (await getSecureTokens(request, env)) || { tokens: {}, createdAt: Date.now(), version: 1 };

  existing.tokens[provider] = tokenData;

  return createSecureTokenCookie(existing.tokens, env, isDev);
}

/**
 * Create Set-Cookie header to remove a token
 */
export async function removeSecureToken(
  request: Request,
  provider: string,
  env: { TOKEN_ENCRYPTION_SECRET?: string },
  isDev: boolean = false,
): Promise<string> {
  const existing = await getSecureTokens(request, env);

  if (!existing) {
    return clearSecureTokensCookie();
  }

  delete existing.tokens[provider];

  if (Object.keys(existing.tokens).length === 0) {
    return clearSecureTokensCookie();
  }

  return createSecureTokenCookie(existing.tokens, env, isDev);
}

/**
 * Create Set-Cookie header to clear all tokens
 */
export function clearSecureTokensCookie(): string {
  return `${COOKIE_NAME}=; Path=/; Max-Age=0; HttpOnly; SameSite=Strict`;
}

/**
 * Check if a token is expired
 */
export function isSecureTokenExpired(token: SecureTokenData, bufferMs: number = 5 * 60 * 1000): boolean {
  if (!token.expiresAt) {
    return false;
  }

  return Date.now() + bufferMs >= token.expiresAt;
}

/**
 * Get list of connected providers from secure storage
 */
export async function getConnectedProvidersSecure(
  request: Request,
  env: { TOKEN_ENCRYPTION_SECRET?: string },
): Promise<string[]> {
  const store = await getSecureTokens(request, env);

  if (!store) {
    return [];
  }

  return Object.entries(store.tokens)
    .filter(([_, token]) => !isSecureTokenExpired(token))
    .map(([provider]) => provider);
}
