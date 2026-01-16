/**
 * Tests pour la route api.auth.callback
 *
 * GET /api/auth/callback
 * Route de callback OAuth - échange le code contre des tokens
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { loader } from './api.auth.callback';
import type { LoaderFunctionArgs } from 'react-router';

// Mock rate limiter
vi.mock('~/lib/security/rate-limiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true, remaining: 9, resetAt: Date.now() + 60000, total: 1 }),
  createRateLimitResponse: vi.fn(),
  RATE_LIMIT_CONFIGS: {
    auth: { maxRequests: 10, windowSeconds: 60, message: 'Too many requests' },
  },
}));

// Mock des modules d'authentification
vi.mock('~/lib/auth/oauth', () => ({
  validateState: vi.fn((received: string, stored: string) => received === stored),
  isStateExpired: vi.fn((createdAt: number) => {
    const tenMinutes = 10 * 60 * 1000;
    return Date.now() - createdAt > tenMinutes;
  }),
  exchangeCodeForTokens: vi.fn(() =>
    Promise.resolve({
      access_token: 'mock-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'mock-refresh-token',
      scope: 'read:user',
    }),
  ),
}));

vi.mock('~/lib/auth/providers', () => ({
  getProviderConfig: vi.fn((provider: string) => {
    if (provider === 'github' || provider === 'supabase') {
      return {
        clientId: 'test-client-id',
        clientSecret: 'test-secret',
        tokenUrl: 'https://provider.com/token',
      };
    }

    return null;
  }),
}));

vi.mock('~/lib/auth/templates/oauth-success', () => ({
  generateOAuthSuccessPage: vi.fn((data) => `<html><body>Success: ${data.provider}</body></html>`),
}));

describe('api.auth.callback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2024-01-15T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  /**
   * Crée un state cookie valide
   */
  function createValidStateCookie(
    overrides: Partial<{
      provider: string;
      state: string;
      codeVerifier: string;
      redirectUri: string;
      createdAt: number;
    }> = {},
  ) {
    const stateData = {
      provider: 'github',
      state: 'valid-state-token',
      codeVerifier: 'mock-code-verifier',
      redirectUri: 'https://bavini.app/api/auth/callback',
      createdAt: Date.now() - 60000, // 1 minute ago
      ...overrides,
    };
    return `bavini_oauth_state=${encodeURIComponent(JSON.stringify(stateData))}`;
  }

  /**
   * Crée un mock LoaderFunctionArgs
   */
  function createLoaderArgs(
    options: {
      code?: string | null;
      state?: string | null;
      error?: string | null;
      errorDescription?: string | null;
      cookie?: string | null;
    } = {},
  ): LoaderFunctionArgs {
    const params = new URLSearchParams();

    if (options.code) {
      params.set('code', options.code);
    }

    if (options.state) {
      params.set('state', options.state);
    }

    if (options.error) {
      params.set('error', options.error);
    }

    if (options.errorDescription) {
      params.set('error_description', options.errorDescription);
    }

    const headers: Record<string, string> = {};

    if (options.cookie !== null) {
      headers.Cookie = options.cookie ?? createValidStateCookie();
    }

    return {
      params: {},
      request: new Request(`https://bavini.app/api/auth/callback?${params}`, {
        headers,
      }),
      context: {
        cloudflare: {
          env: {
            GITHUB_CLIENT_ID: 'test-id',
            GITHUB_CLIENT_SECRET: 'test-secret',
          },
        },
      },
    } as unknown as LoaderFunctionArgs;
  }

  describe('loader', () => {
    describe('Échange de code réussi', () => {
      it('devrait échanger le code contre des tokens avec succès', async () => {
        const args = createLoaderArgs({
          code: 'valid-auth-code',
          state: 'valid-state-token',
        });

        const response = await loader(args);

        expect(response.status).toBe(200);
        expect(response.headers.get('Content-Type')).toContain('text/html');
      });

      it('devrait effacer le cookie OAuth state après succès', async () => {
        const args = createLoaderArgs({
          code: 'valid-auth-code',
          state: 'valid-state-token',
        });

        const response = await loader(args);

        const setCookie = response.headers.get('Set-Cookie');
        expect(setCookie).toContain('bavini_oauth_state=');
        expect(setCookie).toContain('Max-Age=0');
      });

      it('devrait appeler exchangeCodeForTokens avec les bons paramètres', async () => {
        const { exchangeCodeForTokens } = await import('~/lib/auth/oauth');

        const args = createLoaderArgs({
          code: 'test-auth-code',
          state: 'valid-state-token',
        });

        await loader(args);

        expect(exchangeCodeForTokens).toHaveBeenCalledWith(
          expect.anything(),
          'test-auth-code',
          'https://bavini.app/api/auth/callback',
          'mock-code-verifier',
        );
      });
    });

    describe('Erreurs du provider', () => {
      it('devrait rediriger avec erreur si le provider retourne une erreur', async () => {
        const args = createLoaderArgs({
          error: 'access_denied',
          errorDescription: 'User denied access',
        });

        const response = await loader(args);

        expect(response.status).toBe(302);

        const location = response.headers.get('Location');
        expect(location).toContain('oauth_error=');
        expect(location).toContain('User%20denied%20access');
      });

      it('devrait utiliser le code erreur si pas de description', async () => {
        const args = createLoaderArgs({
          error: 'access_denied',
        });

        const response = await loader(args);

        const location = response.headers.get('Location');
        expect(location).toContain('access_denied');
      });
    });

    describe('Paramètres manquants', () => {
      it('devrait rediriger avec erreur si code manquant', async () => {
        const args = createLoaderArgs({
          state: 'valid-state-token',

          // code manquant
        });

        const response = await loader(args);

        expect(response.status).toBe(302);

        const location = response.headers.get('Location');
        expect(location).toContain('oauth_error=');
        expect(location).toContain('manquants');
      });

      it('devrait rediriger avec erreur si state manquant', async () => {
        const args = createLoaderArgs({
          code: 'valid-auth-code',

          // state manquant
        });

        const response = await loader(args);

        expect(response.status).toBe(302);

        const location = response.headers.get('Location');
        expect(location).toContain('oauth_error=');
      });
    });

    describe('Validation du state (CSRF)', () => {
      it('devrait rejeter si state ne correspond pas (CSRF)', async () => {
        const args = createLoaderArgs({
          code: 'valid-auth-code',
          state: 'invalid-state-token', // Ne correspond pas
          cookie: createValidStateCookie({ state: 'valid-state-token' }),
        });

        const response = await loader(args);

        expect(response.status).toBe(302);

        const location = response.headers.get('Location');
        expect(location).toContain('CSRF');
      });

      it('devrait rejeter si pas de cookie state', async () => {
        const args = createLoaderArgs({
          code: 'valid-auth-code',
          state: 'valid-state-token',
          cookie: '', // Pas de cookie
        });

        const response = await loader(args);

        expect(response.status).toBe(302);

        const location = response.headers.get('Location');
        expect(location).toContain('expir');
      });

      it('devrait rejeter si cookie state invalide (JSON malformé)', async () => {
        const args = createLoaderArgs({
          code: 'valid-auth-code',
          state: 'valid-state-token',
          cookie: 'bavini_oauth_state=not-valid-json',
        });

        const response = await loader(args);

        expect(response.status).toBe(302);

        const location = response.headers.get('Location');
        expect(location).toContain('invalide');
      });
    });

    describe('Expiration du state', () => {
      it('devrait rejeter si state expiré (>10 minutes)', async () => {
        const { isStateExpired } = await import('~/lib/auth/oauth');
        vi.mocked(isStateExpired).mockReturnValueOnce(true);

        const args = createLoaderArgs({
          code: 'valid-auth-code',
          state: 'valid-state-token',
        });

        const response = await loader(args);

        expect(response.status).toBe(302);

        const location = response.headers.get('Location');
        expect(location).toContain('expir');
      });
    });

    describe('Configuration du provider', () => {
      it('devrait rejeter si provider non configuré', async () => {
        const { getProviderConfig } = await import('~/lib/auth/providers');
        vi.mocked(getProviderConfig).mockReturnValueOnce(null);

        const args = createLoaderArgs({
          code: 'valid-auth-code',
          state: 'valid-state-token',
          cookie: createValidStateCookie({ provider: 'unknown-provider' }),
        });

        const response = await loader(args);

        expect(response.status).toBe(302);

        const location = response.headers.get('Location');
        expect(location).toContain('non%20configur');
      });
    });

    describe("Échec d'échange de tokens", () => {
      it('devrait rediriger avec erreur si échange échoue', async () => {
        const { exchangeCodeForTokens } = await import('~/lib/auth/oauth');
        vi.mocked(exchangeCodeForTokens).mockRejectedValueOnce(new Error('Token exchange failed'));

        const args = createLoaderArgs({
          code: 'valid-auth-code',
          state: 'valid-state-token',
        });

        const response = await loader(args);

        expect(response.status).toBe(302);

        const location = response.headers.get('Location');
        expect(location).toContain('oauth_error=');
        expect(location).toContain('Token%20exchange%20failed');
      });
    });
  });
});
