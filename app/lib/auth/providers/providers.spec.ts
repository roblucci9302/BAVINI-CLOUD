import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  OAUTH_PROVIDER_IDS,
  supportsOAuth,
  getProviderConfig,
  getProviderUser,
  verifyProviderToken,
  PROVIDER_DISPLAY_INFO,
  type OAuthProviderId,
} from './index';
import { createGitHubProvider, getGitHubUser, verifyGitHubToken, DEFAULT_GITHUB_SCOPES } from './github';
import { createNetlifyProvider, getNetlifyUser, verifyNetlifyToken } from './netlify';
import { createSupabaseProvider, verifySupabaseToken, DEFAULT_SUPABASE_SCOPES } from './supabase';

describe('OAuth Providers Registry', () => {
  describe('OAUTH_PROVIDER_IDS', () => {
    it('should include all supported providers', () => {
      expect(OAUTH_PROVIDER_IDS).toContain('github');
      expect(OAUTH_PROVIDER_IDS).toContain('netlify');
      expect(OAUTH_PROVIDER_IDS).toContain('supabase');
    });

    it('should be a constant tuple with 6 providers', () => {
      expect(Array.isArray(OAUTH_PROVIDER_IDS)).toBe(true);
      expect(OAUTH_PROVIDER_IDS.length).toBe(6);
    });

    it('should include new connectors', () => {
      expect(OAUTH_PROVIDER_IDS).toContain('figma');
      expect(OAUTH_PROVIDER_IDS).toContain('notion');
      expect(OAUTH_PROVIDER_IDS).toContain('stripe');
    });
  });

  describe('supportsOAuth', () => {
    it('should return true for supported providers', () => {
      expect(supportsOAuth('github')).toBe(true);
      expect(supportsOAuth('netlify')).toBe(true);
      expect(supportsOAuth('supabase')).toBe(true);
    });

    it('should return false for unsupported providers', () => {
      expect(supportsOAuth('unknown')).toBe(false);
    });

    it('should act as type guard', () => {
      const id = 'github';

      if (supportsOAuth(id)) {
        const providerId: OAuthProviderId = id;

        expect(providerId).toBe('github');
      }
    });
  });

  describe('PROVIDER_DISPLAY_INFO', () => {
    it('should have info for all providers', () => {
      for (const id of OAUTH_PROVIDER_IDS) {
        expect(PROVIDER_DISPLAY_INFO[id]).toBeDefined();
        expect(PROVIDER_DISPLAY_INFO[id].name).toBeTruthy();
        expect(PROVIDER_DISPLAY_INFO[id].icon).toBeTruthy();
        expect(PROVIDER_DISPLAY_INFO[id].description).toBeTruthy();
      }
    });

    it('should have valid icon classes', () => {
      for (const id of OAUTH_PROVIDER_IDS) {
        expect(PROVIDER_DISPLAY_INFO[id].icon).toMatch(/^i-ph:/);
      }
    });

    it('should have correct provider names', () => {
      expect(PROVIDER_DISPLAY_INFO.github.name).toBe('GitHub');
      expect(PROVIDER_DISPLAY_INFO.netlify.name).toBe('Netlify');
      expect(PROVIDER_DISPLAY_INFO.supabase.name).toBe('Supabase');
    });
  });

  describe('getProviderConfig', () => {
    it('should return null when client ID is missing', () => {
      const config = getProviderConfig('github', {});

      expect(config).toBeNull();
    });

    it('should return config when client ID is provided', () => {
      const config = getProviderConfig('github', {
        GITHUB_CLIENT_ID: 'test_client_id',
      });

      expect(config).not.toBeNull();
      expect(config?.id).toBe('github');
      expect(config?.clientId).toBe('test_client_id');
    });

    it('should include client secret when provided', () => {
      const config = getProviderConfig('github', {
        GITHUB_CLIENT_ID: 'client_id',
        GITHUB_CLIENT_SECRET: 'client_secret',
      });

      expect(config?.clientSecret).toBe('client_secret');
    });

    it('should return correct config for each provider', () => {
      const githubConfig = getProviderConfig('github', { GITHUB_CLIENT_ID: 'gh_id' });
      const netlifyConfig = getProviderConfig('netlify', { NETLIFY_CLIENT_ID: 'netlify_id' });
      const supabaseConfig = getProviderConfig('supabase', { SUPABASE_CLIENT_ID: 'supabase_id' });

      expect(githubConfig?.name).toBe('GitHub');
      expect(netlifyConfig?.name).toBe('Netlify');
      expect(supabaseConfig?.name).toBe('Supabase');
    });
  });
});

describe('GitHub Provider', () => {
  describe('createGitHubProvider', () => {
    it('should create provider with correct URLs', () => {
      const provider = createGitHubProvider('client_id', 'client_secret');

      expect(provider.authorizationUrl).toBe('https://github.com/login/oauth/authorize');
      expect(provider.tokenUrl).toBe('https://github.com/login/oauth/access_token');
    });

    it('should set usePKCE to false', () => {
      const provider = createGitHubProvider('client_id');

      expect(provider.usePKCE).toBe(false);
    });

    it('should include default scopes', () => {
      const provider = createGitHubProvider('client_id');

      expect(provider.scopes).toEqual(DEFAULT_GITHUB_SCOPES);
      expect(provider.scopes).toContain('repo');
      expect(provider.scopes).toContain('read:user');
    });
  });

  describe('getGitHubUser', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should fetch user info with correct headers', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 123,
          login: 'testuser',
          name: 'Test User',
          avatar_url: 'https://avatar.url',
        }),
      } as Response);

      await getGitHubUser('test_token');

      expect(fetch).toHaveBeenCalledWith('https://api.github.com/user', {
        headers: {
          Authorization: 'Bearer test_token',
          Accept: 'application/vnd.github.v3+json',
        },
      });
    });

    it('should throw on API error', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      } as Response);

      await expect(getGitHubUser('invalid_token')).rejects.toThrow('Failed to fetch GitHub user');
    });
  });

  describe('verifyGitHubToken', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should return true for valid token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
      } as Response);

      const result = await verifyGitHubToken('valid_token');

      expect(result).toBe(true);
    });

    it('should return false for invalid token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: false,
      } as Response);

      const result = await verifyGitHubToken('invalid_token');

      expect(result).toBe(false);
    });

    it('should return false on network error', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('Network error'));

      const result = await verifyGitHubToken('any_token');

      expect(result).toBe(false);
    });
  });
});

describe('Netlify Provider', () => {
  describe('createNetlifyProvider', () => {
    it('should create provider with correct URLs', () => {
      const provider = createNetlifyProvider('client_id', 'client_secret');

      expect(provider.authorizationUrl).toBe('https://app.netlify.com/authorize');
      expect(provider.tokenUrl).toBe('https://api.netlify.com/oauth/token');
    });
  });

  describe('getNetlifyUser', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should fetch user info', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => ({
          id: 'user123',
          email: 'test@netlify.com',
          full_name: 'Test User',
          avatar_url: 'https://avatar.url',
        }),
      } as Response);

      const user = await getNetlifyUser('test_token');

      expect(user.id).toBe('user123');
      expect(user.email).toBe('test@netlify.com');
    });
  });

  describe('verifyNetlifyToken', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should return true for valid token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as Response);

      expect(await verifyNetlifyToken('valid')).toBe(true);
    });

    it('should return false for invalid token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);

      expect(await verifyNetlifyToken('invalid')).toBe(false);
    });
  });
});

describe('Supabase Provider', () => {
  describe('createSupabaseProvider', () => {
    it('should create provider with correct URLs', () => {
      const provider = createSupabaseProvider('client_id', 'client_secret');

      expect(provider.authorizationUrl).toBe('https://api.supabase.com/v1/oauth/authorize');
      expect(provider.tokenUrl).toBe('https://api.supabase.com/v1/oauth/token');
    });

    it('should include default scopes', () => {
      const provider = createSupabaseProvider('client_id');

      expect(provider.scopes).toEqual(DEFAULT_SUPABASE_SCOPES);
    });
  });

  describe('verifySupabaseToken', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('should return true for valid token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({
        ok: true,
        json: async () => [],
      } as Response);

      expect(await verifySupabaseToken('valid')).toBe(true);
    });

    it('should return false for invalid token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue({ ok: false } as Response);

      expect(await verifySupabaseToken('invalid')).toBe(false);
    });
  });
});

describe('Provider User Fetching', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should fetch GitHub user through getProviderUser', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 1,
        login: 'ghuser',
        name: 'GH User',
        avatar_url: 'https://gh.avatar',
      }),
    } as Response);

    const user = await getProviderUser('github', 'token');

    expect(user).toHaveProperty('login', 'ghuser');
  });

  it('should fetch Netlify user through getProviderUser', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 'netlify123',
        email: 'netlify@example.com',
        full_name: 'Netlify User',
        avatar_url: 'https://netlify.avatar',
      }),
    } as Response);

    const user = await getProviderUser('netlify', 'token');

    expect(user).toHaveProperty('email', 'netlify@example.com');
  });

  it('should throw for unknown provider', async () => {
    await expect(getProviderUser('unknown' as OAuthProviderId, 'token')).rejects.toThrow('Unknown provider');
  });
});

describe('Provider Token Verification', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('should verify tokens through verifyProviderToken', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValue({ ok: true, json: async () => [] } as Response);

    expect(await verifyProviderToken('github', 'token')).toBe(true);
    expect(await verifyProviderToken('netlify', 'token')).toBe(true);
    expect(await verifyProviderToken('supabase', 'token')).toBe(true);
  });

  it('should return false for unknown provider', async () => {
    const result = await verifyProviderToken('unknown' as OAuthProviderId, 'token');

    expect(result).toBe(false);
  });
});
