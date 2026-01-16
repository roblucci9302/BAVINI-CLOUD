/**
 * Token storage and management utilities
 *
 * Handles secure storage of OAuth tokens with expiration tracking
 * and automatic refresh capabilities.
 *
 * Security:
 * - Tokens are stored in sessionStorage (cleared on tab close)
 * - Tokens are obfuscated to prevent casual inspection
 * - For production environments with sensitive data, consider
 *   migrating to httpOnly cookies with server-side token storage
 */

import { atom, map } from 'nanostores';
import type { OAuthTokenResponse } from './oauth';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('auth.tokens');

/*
 * ============================================================================
 * Token Obfuscation Layer
 * Note: This is NOT encryption - it's obfuscation to prevent casual inspection
 * For true security, use httpOnly cookies with server-side token management
 * ============================================================================
 */

const OBFUSCATION_KEY = 'bavini_secure_2024';

/**
 * Simple XOR obfuscation for token storage
 * This prevents tokens from appearing in plain text in dev tools
 */
function obfuscate(data: string): string {
  try {
    const encoded = btoa(
      data
        .split('')
        .map((char, i) =>
          String.fromCharCode(char.charCodeAt(0) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length)),
        )
        .join(''),
    );
    return encoded;
  } catch {
    logger.warn('Failed to obfuscate data');
    return data;
  }
}

/**
 * Deobfuscate stored token data
 */
function deobfuscate(encoded: string): string {
  try {
    const decoded = atob(encoded);
    return decoded
      .split('')
      .map((char, i) =>
        String.fromCharCode(char.charCodeAt(0) ^ OBFUSCATION_KEY.charCodeAt(i % OBFUSCATION_KEY.length)),
      )
      .join('');
  } catch {
    // If deobfuscation fails, assume it's legacy plain data
    return encoded;
  }
}

/**
 * Stored token data with metadata
 */
export interface StoredToken {
  accessToken: string;
  refreshToken?: string;
  tokenType: string;
  expiresAt?: number;
  scope?: string;
  connectedAt: number;
}

/**
 * Token storage key prefix
 */
const TOKEN_STORAGE_KEY = 'bavini_oauth_tokens';
const PENDING_STATE_KEY = 'bavini_oauth_pending';

/**
 * Store for OAuth tokens by provider
 */
export const oauthTokensStore = map<Record<string, StoredToken>>({});

/**
 * Store for pending OAuth states (for CSRF validation)
 */
export const pendingOAuthStates = map<
  Record<
    string,
    {
      provider: string;
      state: string;
      codeVerifier?: string;
      redirectUri: string;
      createdAt: number;
    }
  >
>({});

/**
 * Loading state for OAuth operations
 */
export const oauthLoadingStore = atom<string | null>(null);

/**
 * Initialize tokens from sessionStorage (with migration from localStorage)
 * Handles both obfuscated (new) and plain (legacy) formats
 */
export function initializeOAuthTokens(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    // Try sessionStorage first (new secure storage)
    let stored = sessionStorage.getItem(TOKEN_STORAGE_KEY);

    // Migration: check localStorage for legacy tokens
    if (!stored) {
      const legacyStored = localStorage.getItem(TOKEN_STORAGE_KEY);

      if (legacyStored) {
        logger.info('Migrating OAuth tokens from localStorage to sessionStorage');

        // Try to parse legacy (might be plain JSON)
        try {
          const tokens = JSON.parse(legacyStored) as Record<string, StoredToken>;
          oauthTokensStore.set(tokens);

          // Re-store with obfuscation
          persistTokens();
        } catch {
          // Already obfuscated or corrupted
          stored = legacyStored;
        }

        // Clear localStorage (security improvement)
        localStorage.removeItem(TOKEN_STORAGE_KEY);
      }
    }

    if (stored) {
      // Try to deobfuscate first (new format)
      let tokenData: string;

      try {
        tokenData = deobfuscate(stored);

        // Verify it's valid JSON
        JSON.parse(tokenData);
      } catch {
        // Fallback to treating as plain JSON (legacy format)
        tokenData = stored;
      }

      const tokens = JSON.parse(tokenData) as Record<string, StoredToken>;
      oauthTokensStore.set(tokens);
    }

    const pendingStored = sessionStorage.getItem(PENDING_STATE_KEY);

    if (pendingStored) {
      const pending = JSON.parse(pendingStored);
      pendingOAuthStates.set(pending);
    }
  } catch (error) {
    logger.error('Failed to load OAuth tokens:', error);
  }
}

/**
 * Save tokens to sessionStorage with obfuscation
 */
function persistTokens(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const tokens = oauthTokensStore.get();
    const jsonData = JSON.stringify(tokens);
    const obfuscated = obfuscate(jsonData);
    sessionStorage.setItem(TOKEN_STORAGE_KEY, obfuscated);
  } catch (error) {
    logger.error('Failed to persist OAuth tokens:', error);
  }
}

/**
 * Save pending states to sessionStorage
 */
function persistPendingStates(): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    const states = pendingOAuthStates.get();
    sessionStorage.setItem(PENDING_STATE_KEY, JSON.stringify(states));
  } catch (error) {
    logger.error('Failed to persist pending OAuth states:', error);
  }
}

/**
 * Store a new OAuth token
 */
export function storeToken(provider: string, tokenResponse: OAuthTokenResponse): void {
  const storedToken: StoredToken = {
    accessToken: tokenResponse.access_token,
    refreshToken: tokenResponse.refresh_token,
    tokenType: tokenResponse.token_type,
    scope: tokenResponse.scope,
    connectedAt: Date.now(),
    expiresAt: tokenResponse.expires_in ? Date.now() + tokenResponse.expires_in * 1000 : undefined,
  };

  oauthTokensStore.setKey(provider, storedToken);
  persistTokens();
}

/**
 * Get stored token for a provider
 */
export function getToken(provider: string): StoredToken | undefined {
  return oauthTokensStore.get()[provider];
}

/**
 * Get access token for a provider (convenience method)
 */
export function getAccessToken(provider: string): string | undefined {
  const token = getToken(provider);

  return token?.accessToken;
}

/**
 * Check if token is expired or about to expire (within 10 minutes)
 * Buffer augmenté pour gérer les décalages d'horloge et latences réseau
 */
export function isTokenExpired(provider: string, bufferMs: number = 10 * 60 * 1000): boolean {
  const token = getToken(provider);

  if (!token) {
    return true;
  }

  if (!token.expiresAt) {
    return false;
  }

  return Date.now() + bufferMs >= token.expiresAt;
}

/**
 * Check if provider is connected (has valid token)
 */
export function isProviderConnected(provider: string): boolean {
  const token = getToken(provider);

  if (!token) {
    return false;
  }

  if (token.expiresAt && Date.now() >= token.expiresAt) {
    return !!token.refreshToken;
  }

  return true;
}

/**
 * Remove token for a provider (disconnect)
 */
export function removeToken(provider: string): void {
  const tokens = oauthTokensStore.get();
  const { [provider]: _, ...rest } = tokens;
  oauthTokensStore.set(rest);
  persistTokens();
}

/**
 * Store pending OAuth state for CSRF validation
 */
export function storePendingState(
  stateKey: string,
  data: {
    provider: string;
    state: string;
    codeVerifier?: string;
    redirectUri: string;
  },
): void {
  pendingOAuthStates.setKey(stateKey, {
    ...data,
    createdAt: Date.now(),
  });
  persistPendingStates();
}

/**
 * Get and remove pending OAuth state
 */
export function consumePendingState(stateKey: string): {
  provider: string;
  state: string;
  codeVerifier?: string;
  redirectUri: string;
  createdAt: number;
} | null {
  const states = pendingOAuthStates.get();
  const state = states[stateKey];

  if (!state) {
    return null;
  }

  const { [stateKey]: _, ...rest } = states;
  pendingOAuthStates.set(rest);
  persistPendingStates();

  return state;
}

/**
 * Clean up expired pending states (older than 10 minutes)
 */
export function cleanupExpiredStates(): void {
  const states = pendingOAuthStates.get();
  const now = Date.now();
  const maxAge = 10 * 60 * 1000;

  const validStates = Object.entries(states).reduce(
    (acc, [key, state]) => {
      if (now - state.createdAt < maxAge) {
        acc[key] = state;
      }

      return acc;
    },
    {} as typeof states,
  );

  pendingOAuthStates.set(validStates);
  persistPendingStates();
}

/**
 * Get all connected providers
 */
export function getConnectedProviders(): string[] {
  const tokens = oauthTokensStore.get();

  return Object.keys(tokens).filter((provider) => isProviderConnected(provider));
}

/**
 * Clear all OAuth tokens (full disconnect)
 */
export function clearAllTokens(): void {
  oauthTokensStore.set({});
  pendingOAuthStates.set({});

  if (typeof window !== 'undefined') {
    // Clear both storages for complete cleanup
    sessionStorage.removeItem(TOKEN_STORAGE_KEY);
    sessionStorage.removeItem(PENDING_STATE_KEY);

    // Also clear legacy localStorage if present
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  }
}
