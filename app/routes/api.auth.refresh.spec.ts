/**
 * Tests pour la route api.auth.refresh
 *
 * POST /api/auth/refresh
 * Route de rafraîchissement de token OAuth
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { action, loader } from './api.auth.refresh';
import type { ActionFunctionArgs } from 'react-router';

// Type pour les réponses JSON du endpoint
interface RefreshResponse {
  success?: boolean;
  accessToken?: string;
  refreshToken?: string;
  expiresIn?: number;
  error?: string;
}

// Mock des modules d'authentification
vi.mock('~/lib/auth/oauth', () => ({
  refreshAccessToken: vi.fn(() =>
    Promise.resolve({
      access_token: 'new-access-token',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'new-refresh-token',
      scope: 'read:user',
    }),
  ),
}));

vi.mock('~/lib/auth/providers', () => ({
  getProviderConfig: vi.fn((provider: string) => {
    const configs: Record<string, unknown> = {
      github: {
        clientId: 'test-id',
        clientSecret: 'test-secret',
        tokenUrl: 'https://github.com/login/oauth/access_token',
      },
      supabase: {
        clientId: 'test-id',
        clientSecret: 'test-secret',
        tokenUrl: 'https://supabase.io/oauth/token',
      },
      netlify: {
        clientId: 'test-id',
        clientSecret: 'test-secret',
        tokenUrl: 'https://api.netlify.com/oauth/token',
      },
    };
    return configs[provider] || null;
  }),
}));

describe('api.auth.refresh', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  /**
   * Crée un mock ActionFunctionArgs pour POST
   */
  function createActionArgs(body: unknown, method = 'POST'): ActionFunctionArgs {
    return {
      params: {},
      request: new Request('https://bavini.app/api/auth/refresh', {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: typeof body === 'string' ? body : JSON.stringify(body),
      }),
      context: {
        cloudflare: {
          env: {
            SUPABASE_CLIENT_ID: 'test-id',
            SUPABASE_CLIENT_SECRET: 'test-secret',
          },
        },
      },
    } as unknown as ActionFunctionArgs;
  }

  describe('action (POST)', () => {
    describe('Rafraîchissement réussi', () => {
      it('devrait rafraîchir un token Supabase avec succès', async () => {
        const args = createActionArgs({
          provider: 'supabase',
          refreshToken: 'valid-refresh-token',
        });

        const response = await action(args);
        const body = (await response.json()) as RefreshResponse;

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.accessToken).toBe('new-access-token');
        expect(body.refreshToken).toBe('new-refresh-token');
        expect(body.expiresIn).toBe(3600);
      });

      it('devrait rafraîchir un token Netlify avec succès', async () => {
        const args = createActionArgs({
          provider: 'netlify',
          refreshToken: 'valid-refresh-token',
        });

        const response = await action(args);
        const body = (await response.json()) as RefreshResponse;

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
      });

      it('devrait appeler refreshAccessToken avec les bons paramètres', async () => {
        const { refreshAccessToken } = await import('~/lib/auth/oauth');

        const args = createActionArgs({
          provider: 'supabase',
          refreshToken: 'test-refresh-token',
        });

        await action(args);

        expect(refreshAccessToken).toHaveBeenCalledWith(
          expect.objectContaining({ clientId: 'test-id' }),
          'test-refresh-token',
        );
      });
    });

    describe('Cas spécial GitHub', () => {
      it("devrait retourner erreur pour GitHub (tokens n'expirent pas)", async () => {
        const args = createActionArgs({
          provider: 'github',
          refreshToken: 'github-refresh-token',
        });

        const response = await action(args);
        const body = (await response.json()) as RefreshResponse;

        expect(response.status).toBe(400);
        expect(body.error).toContain("n'expirent pas");
      });
    });

    describe('Méthode non autorisée', () => {
      it('devrait rejeter les requêtes non-POST', async () => {
        const args = createActionArgs({ provider: 'supabase', refreshToken: 'token' }, 'PUT');

        const response = await action(args);
        const body = (await response.json()) as RefreshResponse;

        expect(response.status).toBe(405);
        expect(body.error).toContain('not allowed');
      });
    });

    describe('Body invalide', () => {
      it('devrait retourner 400 pour JSON invalide', async () => {
        const args = {
          params: {},
          request: new Request('https://bavini.app/api/auth/refresh', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: 'not-valid-json{',
          }),
          context: { cloudflare: { env: {} } },
        } as unknown as ActionFunctionArgs;

        const response = await action(args);
        const body = (await response.json()) as RefreshResponse;

        expect(response.status).toBe(400);
        expect(body.error).toContain('Invalid JSON');
      });

      it('devrait retourner 400 si provider manquant', async () => {
        const args = createActionArgs({
          refreshToken: 'valid-token',

          // provider manquant
        });

        const response = await action(args);
        const body = (await response.json()) as RefreshResponse;

        expect(response.status).toBe(400);
        expect(body.error).toContain('provider');
        expect(body.error).toContain('requis');
      });

      it('devrait retourner 400 si refreshToken manquant', async () => {
        const args = createActionArgs({
          provider: 'supabase',

          // refreshToken manquant
        });

        const response = await action(args);
        const body = (await response.json()) as RefreshResponse;

        expect(response.status).toBe(400);
        expect(body.error).toContain('refreshToken');
        expect(body.error).toContain('requis');
      });
    });

    describe('Provider non configuré', () => {
      it('devrait retourner 400 pour provider inconnu', async () => {
        const args = createActionArgs({
          provider: 'unknown-provider',
          refreshToken: 'valid-token',
        });

        const response = await action(args);
        const body = (await response.json()) as RefreshResponse;

        expect(response.status).toBe(400);
        expect(body.error).toContain('non configuré');
      });
    });

    describe('Échec de rafraîchissement', () => {
      it('devrait retourner 500 si rafraîchissement échoue', async () => {
        const { refreshAccessToken } = await import('~/lib/auth/oauth');
        vi.mocked(refreshAccessToken).mockRejectedValueOnce(new Error('Token expired or revoked'));

        const args = createActionArgs({
          provider: 'supabase',
          refreshToken: 'expired-token',
        });

        const response = await action(args);
        const body = (await response.json()) as RefreshResponse;

        expect(response.status).toBe(500);

        // Error messages are sanitized for security - we don't expose internal error details
        expect(body.error).toContain('rafraîchissement');
      });

      it('devrait gérer les erreurs non-Error', async () => {
        const { refreshAccessToken } = await import('~/lib/auth/oauth');
        vi.mocked(refreshAccessToken).mockRejectedValueOnce('String error');

        const args = createActionArgs({
          provider: 'supabase',
          refreshToken: 'token',
        });

        const response = await action(args);
        const body = (await response.json()) as RefreshResponse;

        expect(response.status).toBe(500);
        expect(body.error).toContain('rafraîchissement');
      });

      it('devrait retourner message connexion pour erreurs réseau', async () => {
        const { refreshAccessToken } = await import('~/lib/auth/oauth');
        vi.mocked(refreshAccessToken).mockRejectedValueOnce(new Error('ECONNREFUSED'));

        const args = createActionArgs({
          provider: 'supabase',
          refreshToken: 'token',
        });

        const response = await action(args);
        const body = (await response.json()) as RefreshResponse;

        expect(response.status).toBe(500);
        expect(body.error).toContain('connexion');
      });
    });
  });

  describe('loader (GET)', () => {
    it('devrait rejeter les requêtes GET avec 405', async () => {
      const response = await loader();
      const body = (await response.json()) as RefreshResponse;

      expect(response.status).toBe(405);
      expect(body.error).toContain('POST');
    });
  });
});
