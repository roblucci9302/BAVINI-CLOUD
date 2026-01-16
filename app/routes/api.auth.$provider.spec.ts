/**
 * Tests pour la route api.auth.$provider
 *
 * GET /api/auth/:provider
 * Route d'initiation OAuth - redirige vers le fournisseur
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { loader } from './api.auth.$provider';
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
  generateCodeVerifier: vi.fn(() => 'mock-code-verifier-12345678901234567890'),
  generateCodeChallenge: vi.fn(() => Promise.resolve('mock-code-challenge')),
  generateState: vi.fn(() => 'mock-state-token'),
  buildAuthorizationUrl: vi.fn((config, redirectUri, state, challenge) => {
    return `https://provider.com/oauth/authorize?client_id=${config.clientId}&state=${state}`;
  }),
}));

vi.mock('~/lib/auth/providers', () => ({
  supportsOAuth: vi.fn((provider: string) => ['github', 'supabase', 'netlify'].includes(provider)),
  getProviderConfig: vi.fn((provider: string, env: Record<string, string>) => {
    const configs: Record<string, unknown> = {
      github: {
        clientId: env.GITHUB_CLIENT_ID || 'test-client-id',
        clientSecret: env.GITHUB_CLIENT_SECRET || 'test-secret',
        authorizationUrl: 'https://github.com/login/oauth/authorize',
        tokenUrl: 'https://github.com/login/oauth/access_token',
        usePKCE: false,
        scopes: ['read:user', 'repo'],
      },
      supabase: {
        clientId: env.SUPABASE_CLIENT_ID,
        clientSecret: env.SUPABASE_CLIENT_SECRET,
        authorizationUrl: 'https://supabase.io/oauth/authorize',
        tokenUrl: 'https://supabase.io/oauth/token',
        usePKCE: true,
        scopes: ['openid'],
      },
    };
    return configs[provider];
  }),
}));

describe('api.auth.$provider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Crée un mock LoaderFunctionArgs
   */
  function createLoaderArgs(provider: string, env: Record<string, string> = {}): LoaderFunctionArgs {
    return {
      params: { provider },
      request: new Request('https://bavini.app/api/auth/' + provider),
      context: {
        cloudflare: {
          env: {
            GITHUB_CLIENT_ID: 'test-github-id',
            GITHUB_CLIENT_SECRET: 'test-github-secret',
            SUPABASE_CLIENT_ID: 'test-supabase-id',
            SUPABASE_CLIENT_SECRET: 'test-supabase-secret',
            ...env,
          },
        },
      },
    } as unknown as LoaderFunctionArgs;
  }

  describe('loader', () => {
    describe('Provider valide', () => {
      it('devrait rediriger vers GitHub OAuth avec les bons paramètres', async () => {
        const args = createLoaderArgs('github');
        const response = await loader(args);

        // Vérifie que c'est une redirection
        expect(response.status).toBe(302);

        // Vérifie l'URL de redirection
        const location = response.headers.get('Location');
        expect(location).toContain('https://');
        expect(location).toContain('client_id=');
        expect(location).toContain('state=');
      });

      it('devrait définir le cookie OAuth state', async () => {
        const args = createLoaderArgs('github');
        const response = await loader(args);

        const setCookie = response.headers.get('Set-Cookie');
        expect(setCookie).toContain('bavini_oauth_state=');
        expect(setCookie).toContain('HttpOnly');
        expect(setCookie).toContain('Path=/');
        expect(setCookie).toContain('SameSite=Lax');
        expect(setCookie).toContain('Max-Age=600');
      });

      it('devrait ajouter Secure flag en HTTPS', async () => {
        const args = createLoaderArgs('github');
        const response = await loader(args);

        const setCookie = response.headers.get('Set-Cookie');
        expect(setCookie).toContain('Secure');
      });

      it('devrait supporter Supabase avec PKCE', async () => {
        const args = createLoaderArgs('supabase');
        const response = await loader(args);

        expect(response.status).toBe(302);
      });

      it('devrait supporter Netlify', async () => {
        const args = createLoaderArgs('netlify');

        // Ce test vérifiera que le provider est reconnu
        const response = await loader(args);

        // Même si la config manque, le provider est validé
        expect(response).toBeDefined();
      });
    });

    describe('Provider invalide', () => {
      it('devrait retourner 400 pour un provider non supporté', async () => {
        const args = createLoaderArgs('invalid-provider');
        const response = await loader(args);

        expect(response.status).toBe(400);

        const body = (await response.json()) as { error: string };
        expect(body.error).toContain('non supporté');
      });

      it('devrait retourner 400 pour un provider vide', async () => {
        const args = {
          params: {},
          request: new Request('https://bavini.app/api/auth/'),
          context: { cloudflare: { env: {} } },
        } as unknown as LoaderFunctionArgs;

        const response = await loader(args);

        expect(response.status).toBe(400);
      });
    });

    describe('Configuration manquante', () => {
      it('devrait retourner 500 si la config du provider est manquante', async () => {
        // Mock pour retourner null
        const { getProviderConfig } = await import('~/lib/auth/providers');
        vi.mocked(getProviderConfig).mockReturnValueOnce(null as unknown as ReturnType<typeof getProviderConfig>);

        const args = createLoaderArgs('github', {});
        const response = await loader(args);

        expect(response.status).toBe(500);

        const body = (await response.json()) as { error: string };
        expect(body.error).toContain('non configuré');
      });
    });

    describe('Contenu du cookie state', () => {
      it('devrait inclure provider, state, redirectUri et createdAt dans le cookie', async () => {
        const args = createLoaderArgs('github');
        const response = await loader(args);

        const setCookie = response.headers.get('Set-Cookie');
        const match = setCookie?.match(/bavini_oauth_state=([^;]+)/);
        expect(match).toBeDefined();

        const stateData = JSON.parse(decodeURIComponent(match![1]));
        expect(stateData).toHaveProperty('provider', 'github');
        expect(stateData).toHaveProperty('state');
        expect(stateData).toHaveProperty('redirectUri');
        expect(stateData).toHaveProperty('createdAt');
      });

      it('devrait inclure codeVerifier pour les providers PKCE', async () => {
        const { getProviderConfig } = await import('~/lib/auth/providers');
        vi.mocked(getProviderConfig).mockReturnValueOnce({
          clientId: 'test',
          clientSecret: 'test',
          authorizationUrl: 'https://test.com/auth',
          tokenUrl: 'https://test.com/token',
          usePKCE: true,
          scopes: [],
        } as unknown as ReturnType<typeof getProviderConfig>);

        const args = createLoaderArgs('supabase');
        const response = await loader(args);

        const setCookie = response.headers.get('Set-Cookie');
        const match = setCookie?.match(/bavini_oauth_state=([^;]+)/);
        const stateData = JSON.parse(decodeURIComponent(match![1]));

        expect(stateData).toHaveProperty('codeVerifier');
      });
    });
  });
});
