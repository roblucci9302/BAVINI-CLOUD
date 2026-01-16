/**
 * OAuth Integration Tests
 *
 * Tests the OAuth flow components working together:
 * - State generation and validation
 * - PKCE code_verifier/code_challenge pairs
 * - Token exchange simulation
 * - Error handling
 *
 * Core providers only: GitHub, Supabase, Netlify
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  generateCodeVerifier,
  generateCodeChallenge,
  generateState,
  buildAuthorizationUrl,
  validateState,
  isStateExpired,
  isValidCodeVerifier,
  isValidCodeChallenge,
  isValidState,
  secureCompare,
  type OAuthProviderConfig,
} from '~/lib/auth/oauth';
import { supportsOAuth, OAUTH_PROVIDER_IDS } from '~/lib/auth/providers';

describe('OAuth Integration Tests', () => {
  describe('Full PKCE Flow', () => {
    it('should generate valid PKCE pair that can be verified', async () => {
      // Step 1: Generate code_verifier on client
      const codeVerifier = generateCodeVerifier();

      expect(isValidCodeVerifier(codeVerifier)).toBe(true);

      // Step 2: Generate code_challenge from verifier
      const codeChallenge = await generateCodeChallenge(codeVerifier);

      expect(isValidCodeChallenge(codeChallenge)).toBe(true);

      // Step 3: Verify the challenge is deterministic
      const codeChallenge2 = await generateCodeChallenge(codeVerifier);

      expect(codeChallenge).toBe(codeChallenge2);
    });

    it('should generate unique PKCE pairs for each flow', async () => {
      const verifier1 = generateCodeVerifier();
      const verifier2 = generateCodeVerifier();

      expect(verifier1).not.toBe(verifier2);

      const challenge1 = await generateCodeChallenge(verifier1);
      const challenge2 = await generateCodeChallenge(verifier2);

      expect(challenge1).not.toBe(challenge2);
    });

    it('should build complete authorization URL with PKCE', async () => {
      const config: OAuthProviderConfig = {
        id: 'github',
        name: 'GitHub',
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        scopes: ['repo', 'user'],
        clientId: 'test_client_id',
        usePKCE: true,
      };

      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const redirectUri = 'https://example.com/callback';

      const authUrl = buildAuthorizationUrl(config, redirectUri, state, codeChallenge);

      // Verify URL contains all required parameters
      const url = new URL(authUrl);

      expect(url.origin).toBe('https://github.com');
      expect(url.pathname).toBe('/login/oauth/authorize');
      expect(url.searchParams.get('client_id')).toBe('test_client_id');
      expect(url.searchParams.get('redirect_uri')).toBe(redirectUri);
      expect(url.searchParams.get('response_type')).toBe('code');
      expect(url.searchParams.get('state')).toBe(state);
      expect(url.searchParams.get('scope')).toBe('repo user');
      expect(url.searchParams.get('code_challenge')).toBe(codeChallenge);
      expect(url.searchParams.get('code_challenge_method')).toBe('S256');
    });
  });

  describe('State Management Flow', () => {
    it('should validate state correctly in full flow', () => {
      // Step 1: Generate state before redirect
      const originalState = generateState();

      expect(isValidState(originalState)).toBe(true);

      // Step 2: Simulate callback with same state
      const receivedState = originalState;

      expect(validateState(receivedState, originalState)).toBe(true);
    });

    it('should reject tampered state', () => {
      const originalState = generateState();

      // Simulate attacker trying to use different state
      const tamperedState = generateState();

      expect(validateState(tamperedState, originalState)).toBe(false);
    });

    it('should reject expired state', () => {
      const oldCreatedAt = Date.now() - 11 * 60 * 1000; // 11 minutes ago

      expect(isStateExpired(oldCreatedAt)).toBe(true);
    });

    it('should accept fresh state', () => {
      const recentCreatedAt = Date.now() - 5 * 60 * 1000; // 5 minutes ago

      expect(isStateExpired(recentCreatedAt)).toBe(false);
    });
  });

  describe('Provider Support', () => {
    it('should support core OAuth providers', () => {
      expect(supportsOAuth('github')).toBe(true);
      expect(supportsOAuth('netlify')).toBe(true);
      expect(supportsOAuth('supabase')).toBe(true);
    });

    it('should not support unknown providers', () => {
      expect(supportsOAuth('unknown')).toBe(false);
      expect(supportsOAuth('invalid')).toBe(false);
    });

    it('should have exactly 6 OAuth providers', () => {
      expect(OAUTH_PROVIDER_IDS.length).toBe(6);
    });
  });

  describe('Security: Constant-Time Comparisons', () => {
    it('should use constant-time comparison for state validation', () => {
      const state1 = 'a'.repeat(43);
      const state2 = 'a'.repeat(43);
      const state3 = 'b'.repeat(43);

      /*
       * These should all take approximately the same time
       * (can't easily test timing, but we verify the function works)
       */
      expect(secureCompare(state1, state2)).toBe(true);
      expect(secureCompare(state1, state3)).toBe(false);
    });

    it('should prevent length oracle attacks', () => {
      const short = 'abc';
      const long = 'abcdef';

      // Different lengths should fail early but securely
      expect(secureCompare(short, long)).toBe(false);
    });
  });

  describe('Error Scenarios', () => {
    it('should handle empty credentials gracefully', () => {
      expect(isValidCodeVerifier('')).toBe(false);
      expect(isValidCodeChallenge('')).toBe(false);
      expect(isValidState('')).toBe(false);
    });

    it('should handle null/undefined gracefully', () => {
      expect(isValidCodeVerifier(null as any)).toBe(false);
      expect(isValidCodeChallenge(undefined as any)).toBe(false);
      expect(isValidState(null as any)).toBe(false);
    });

    it('should handle malformed data gracefully', () => {
      // Too short
      expect(isValidCodeVerifier('short')).toBe(false);

      // Invalid characters
      expect(isValidCodeChallenge('invalid+chars=')).toBe(false);

      // SQL injection attempt
      expect(isValidState("'; DROP TABLE users; --")).toBe(false);
    });
  });

  describe('OAuth State Cookie Simulation', () => {
    it('should simulate complete OAuth state lifecycle', async () => {
      // 1. Initial OAuth request - generate state and PKCE
      const state = generateState();
      const codeVerifier = generateCodeVerifier();
      const codeChallenge = await generateCodeChallenge(codeVerifier);
      const createdAt = Date.now();

      // 2. Store in "cookie" (simulated)
      const cookieData = {
        provider: 'github',
        state,
        codeVerifier,
        redirectUri: 'https://example.com/callback',
        createdAt,
      };

      // 3. Simulate callback - validate state
      const receivedState = state;

      expect(validateState(receivedState, cookieData.state)).toBe(true);
      expect(isStateExpired(cookieData.createdAt)).toBe(false);

      // 4. Token exchange would use codeVerifier
      expect(isValidCodeVerifier(cookieData.codeVerifier!)).toBe(true);
    });

    it('should reject callback with mismatched state', async () => {
      const originalState = generateState();
      const attackerState = generateState();

      expect(validateState(attackerState, originalState)).toBe(false);
    });

    it('should reject callback after state expiration', async () => {
      const state = generateState();
      const expiredCreatedAt = Date.now() - 15 * 60 * 1000; // 15 minutes ago

      expect(isStateExpired(expiredCreatedAt)).toBe(true);
    });
  });

  describe('Cross-Provider Compatibility', () => {
    const providers = ['github', 'netlify', 'supabase'] as const;

    providers.forEach((provider) => {
      it(`should generate valid PKCE parameters for ${provider}`, async () => {
        const state = generateState();
        const verifier = generateCodeVerifier();
        const challenge = await generateCodeChallenge(verifier);

        expect(isValidState(state)).toBe(true);
        expect(isValidCodeVerifier(verifier)).toBe(true);
        expect(isValidCodeChallenge(challenge)).toBe(true);
      });
    });
  });
});
