import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  oauthTokensStore,
  pendingOAuthStates,
  initializeOAuthTokens,
  storeToken,
  getToken,
  getAccessToken,
  isTokenExpired,
  isProviderConnected,
  removeToken,
  storePendingState,
  consumePendingState,
  cleanupExpiredStates,
  getConnectedProviders,
  clearAllTokens,
  type StoredToken,
} from './tokens';
import type { OAuthTokenResponse } from './oauth';

describe('OAuth Token Management', () => {
  beforeEach(() => {
    // Clear stores before each test
    oauthTokensStore.set({});
    pendingOAuthStates.set({});

    // Clear localStorage and sessionStorage
    localStorage.clear();
    sessionStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('storeToken', () => {
    it('should store a token with all fields', () => {
      const tokenResponse: OAuthTokenResponse = {
        access_token: 'access123',
        token_type: 'Bearer',
        expires_in: 3600,
        refresh_token: 'refresh456',
        scope: 'read write',
      };

      storeToken('github', tokenResponse);

      const stored = getToken('github');

      expect(stored).toBeDefined();
      expect(stored?.accessToken).toBe('access123');
      expect(stored?.refreshToken).toBe('refresh456');
      expect(stored?.tokenType).toBe('Bearer');
      expect(stored?.scope).toBe('read write');
      expect(stored?.connectedAt).toBeGreaterThan(0);
    });

    it('should calculate expiresAt from expires_in', () => {
      const now = Date.now();
      const tokenResponse: OAuthTokenResponse = {
        access_token: 'access',
        token_type: 'Bearer',
        expires_in: 3600, // 1 hour
      };

      storeToken('github', tokenResponse);

      const stored = getToken('github');

      expect(stored?.expiresAt).toBeDefined();

      // Should be approximately 1 hour from now
      expect(stored?.expiresAt).toBeGreaterThan(now + 3500 * 1000);
      expect(stored?.expiresAt).toBeLessThan(now + 3700 * 1000);
    });

    it('should not set expiresAt if no expires_in', () => {
      const tokenResponse: OAuthTokenResponse = {
        access_token: 'access',
        token_type: 'Bearer',
      };

      storeToken('supabase', tokenResponse);

      const stored = getToken('supabase');

      expect(stored?.expiresAt).toBeUndefined();
    });

    it('should persist to sessionStorage', () => {
      storeToken('github', {
        access_token: 'persisted_token',
        token_type: 'Bearer',
      });

      // Tokens are now stored in sessionStorage with obfuscation
      const stored = sessionStorage.getItem('bavini_oauth_tokens');

      expect(stored).toBeTruthy();

      // Verify via getToken (handles deobfuscation internally)
      const token = getToken('github');

      expect(token?.accessToken).toBe('persisted_token');
    });

    it('should overwrite existing token for same provider', () => {
      storeToken('github', { access_token: 'first', token_type: 'Bearer' });
      storeToken('github', { access_token: 'second', token_type: 'Bearer' });

      const stored = getToken('github');

      expect(stored?.accessToken).toBe('second');
    });
  });

  describe('getToken / getAccessToken', () => {
    it('should return undefined for non-existent provider', () => {
      expect(getToken('nonexistent')).toBeUndefined();
      expect(getAccessToken('nonexistent')).toBeUndefined();
    });

    it('should return stored token', () => {
      storeToken('github', { access_token: 'test_token', token_type: 'Bearer' });

      expect(getToken('github')).toBeDefined();
      expect(getAccessToken('github')).toBe('test_token');
    });
  });

  describe('isTokenExpired', () => {
    it('should return true for non-existent token', () => {
      expect(isTokenExpired('nonexistent')).toBe(true);
    });

    it('should return false for token without expiration', () => {
      storeToken('supabase', { access_token: 'token', token_type: 'Bearer' });

      expect(isTokenExpired('supabase')).toBe(false);
    });

    it('should return false for non-expired token', () => {
      storeToken('github', {
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: 3600, // 1 hour
      });

      expect(isTokenExpired('github')).toBe(false);
    });

    it('should return true for expired token', () => {
      // Manually set expired token
      oauthTokensStore.setKey('github', {
        accessToken: 'expired',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 1000, // 1 second ago
        connectedAt: Date.now() - 3600000,
      });

      expect(isTokenExpired('github')).toBe(true);
    });

    it('should return true for token expiring within buffer', () => {
      // Token expires in 2 minutes, but buffer is 5 minutes
      oauthTokensStore.setKey('github', {
        accessToken: 'soon_expired',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 2 * 60 * 1000,
        connectedAt: Date.now(),
      });

      expect(isTokenExpired('github', 5 * 60 * 1000)).toBe(true);
    });

    it('should return false for token with buffer room', () => {
      // Token expires in 10 minutes, buffer is 5 minutes
      oauthTokensStore.setKey('github', {
        accessToken: 'valid',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 10 * 60 * 1000,
        connectedAt: Date.now(),
      });

      expect(isTokenExpired('github', 5 * 60 * 1000)).toBe(false);
    });
  });

  describe('isProviderConnected', () => {
    it('should return false for non-existent provider', () => {
      expect(isProviderConnected('nonexistent')).toBe(false);
    });

    it('should return true for valid non-expiring token', () => {
      storeToken('supabase', { access_token: 'token', token_type: 'Bearer' });

      expect(isProviderConnected('supabase')).toBe(true);
    });

    it('should return true for non-expired token', () => {
      storeToken('github', {
        access_token: 'token',
        token_type: 'Bearer',
        expires_in: 3600,
      });

      expect(isProviderConnected('github')).toBe(true);
    });

    it('should return true for expired token with refresh token', () => {
      oauthTokensStore.setKey('netlify', {
        accessToken: 'expired',
        refreshToken: 'refresh_available',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 1000,
        connectedAt: Date.now() - 3600000,
      });

      expect(isProviderConnected('netlify')).toBe(true);
    });

    it('should return false for expired token without refresh token', () => {
      oauthTokensStore.setKey('github', {
        accessToken: 'expired',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 1000,
        connectedAt: Date.now() - 3600000,
      });

      expect(isProviderConnected('github')).toBe(false);
    });
  });

  describe('removeToken', () => {
    it('should remove token for provider', () => {
      storeToken('github', { access_token: 'token', token_type: 'Bearer' });

      expect(getToken('github')).toBeDefined();

      removeToken('github');

      expect(getToken('github')).toBeUndefined();
    });

    it('should preserve other providers', () => {
      storeToken('github', { access_token: 'github_token', token_type: 'Bearer' });
      storeToken('supabase', { access_token: 'supabase_token', token_type: 'Bearer' });

      removeToken('github');

      expect(getToken('github')).toBeUndefined();
      expect(getToken('supabase')).toBeDefined();
    });

    it('should update localStorage', () => {
      storeToken('github', { access_token: 'token', token_type: 'Bearer' });
      removeToken('github');

      const stored = JSON.parse(localStorage.getItem('bavini_oauth_tokens') || '{}');

      expect(stored.github).toBeUndefined();
    });

    it('should not throw for non-existent provider', () => {
      expect(() => removeToken('nonexistent')).not.toThrow();
    });
  });

  describe('Pending OAuth States', () => {
    describe('storePendingState', () => {
      it('should store pending state', () => {
        storePendingState('state123', {
          provider: 'github',
          state: 'state123',
          codeVerifier: 'verifier',
          redirectUri: 'https://callback.com',
        });

        const states = pendingOAuthStates.get();

        expect(states.state123).toBeDefined();
        expect(states.state123.provider).toBe('github');
        expect(states.state123.createdAt).toBeGreaterThan(0);
      });

      it('should persist to sessionStorage', () => {
        storePendingState('state456', {
          provider: 'netlify',
          state: 'state456',
          redirectUri: 'https://callback.com',
        });

        const stored = sessionStorage.getItem('bavini_oauth_pending');

        expect(stored).toBeTruthy();

        const parsed = JSON.parse(stored!);

        expect(parsed.state456).toBeDefined();
      });
    });

    describe('consumePendingState', () => {
      it('should return and remove pending state', () => {
        storePendingState('state789', {
          provider: 'supabase',
          state: 'state789',
          redirectUri: 'https://callback.com',
        });

        const consumed = consumePendingState('state789');

        expect(consumed).toBeDefined();
        expect(consumed?.provider).toBe('supabase');

        // Should be removed
        expect(pendingOAuthStates.get().state789).toBeUndefined();
      });

      it('should return null for non-existent state', () => {
        expect(consumePendingState('nonexistent')).toBeNull();
      });
    });

    describe('cleanupExpiredStates', () => {
      it('should remove expired states', () => {
        // Add a fresh state
        storePendingState('fresh', {
          provider: 'github',
          state: 'fresh',
          redirectUri: 'https://callback.com',
        });

        // Manually add an expired state
        pendingOAuthStates.setKey('expired', {
          provider: 'netlify',
          state: 'expired',
          redirectUri: 'https://callback.com',
          createdAt: Date.now() - 15 * 60 * 1000, // 15 minutes ago
        });

        cleanupExpiredStates();

        const states = pendingOAuthStates.get();

        expect(states.fresh).toBeDefined();
        expect(states.expired).toBeUndefined();
      });
    });
  });

  describe('getConnectedProviders', () => {
    it('should return empty array when no providers connected', () => {
      expect(getConnectedProviders()).toEqual([]);
    });

    it('should return connected provider IDs', () => {
      storeToken('github', { access_token: 'token1', token_type: 'Bearer' });
      storeToken('supabase', { access_token: 'token2', token_type: 'Bearer' });

      const connected = getConnectedProviders();

      expect(connected).toContain('github');
      expect(connected).toContain('supabase');
      expect(connected.length).toBe(2);
    });

    it('should not include expired providers without refresh token', () => {
      storeToken('supabase', { access_token: 'valid', token_type: 'Bearer' });
      oauthTokensStore.setKey('github', {
        accessToken: 'expired',
        tokenType: 'Bearer',
        expiresAt: Date.now() - 1000,
        connectedAt: Date.now() - 3600000,
      });

      const connected = getConnectedProviders();

      expect(connected).toContain('supabase');
      expect(connected).not.toContain('github');
    });
  });

  describe('clearAllTokens', () => {
    it('should clear all tokens and states', () => {
      storeToken('github', { access_token: 'token1', token_type: 'Bearer' });
      storeToken('supabase', { access_token: 'token2', token_type: 'Bearer' });
      storePendingState('state', { provider: 'netlify', state: 'state', redirectUri: 'https://cb.com' });

      clearAllTokens();

      expect(oauthTokensStore.get()).toEqual({});
      expect(pendingOAuthStates.get()).toEqual({});
    });

    it('should clear localStorage and sessionStorage', () => {
      storeToken('github', { access_token: 'token', token_type: 'Bearer' });
      storePendingState('state', { provider: 'github', state: 'state', redirectUri: 'https://cb.com' });

      clearAllTokens();

      expect(localStorage.getItem('bavini_oauth_tokens')).toBeNull();
      expect(sessionStorage.getItem('bavini_oauth_pending')).toBeNull();
    });
  });

  describe('initializeOAuthTokens', () => {
    it('should load tokens from localStorage', () => {
      const storedTokens = {
        github: {
          accessToken: 'loaded_token',
          tokenType: 'Bearer',
          connectedAt: Date.now(),
        },
      };
      localStorage.setItem('bavini_oauth_tokens', JSON.stringify(storedTokens));

      initializeOAuthTokens();

      expect(getToken('github')).toBeDefined();
      expect(getAccessToken('github')).toBe('loaded_token');
    });

    it('should load pending states from sessionStorage', () => {
      const pendingStates = {
        state123: {
          provider: 'github',
          state: 'state123',
          redirectUri: 'https://cb.com',
          createdAt: Date.now(),
        },
      };
      sessionStorage.setItem('bavini_oauth_pending', JSON.stringify(pendingStates));

      initializeOAuthTokens();

      expect(pendingOAuthStates.get().state123).toBeDefined();
    });

    it('should handle corrupted localStorage gracefully', () => {
      localStorage.setItem('bavini_oauth_tokens', 'invalid json');

      expect(() => initializeOAuthTokens()).not.toThrow();
    });
  });
});

describe('Token Edge Cases', () => {
  beforeEach(() => {
    oauthTokensStore.set({});
    pendingOAuthStates.set({});
    localStorage.clear();
    sessionStorage.clear();
  });

  it('should handle multiple rapid token updates', () => {
    for (let i = 0; i < 100; i++) {
      storeToken('github', { access_token: `token_${i}`, token_type: 'Bearer' });
    }

    expect(getAccessToken('github')).toBe('token_99');
  });

  it('should handle concurrent provider operations', () => {
    const providers = ['github', 'supabase', 'netlify'];

    providers.forEach((provider, i) => {
      storeToken(provider, { access_token: `token_${i}`, token_type: 'Bearer' });
    });

    providers.forEach((provider, i) => {
      expect(getAccessToken(provider)).toBe(`token_${i}`);
    });

    expect(getConnectedProviders().length).toBe(3);
  });

  it('should handle token with special characters in scope', () => {
    storeToken('github', {
      access_token: 'token',
      token_type: 'Bearer',
      scope: 'read:user write:repo admin:org',
    });

    const stored = getToken('github');

    expect(stored?.scope).toBe('read:user write:repo admin:org');
  });
});
