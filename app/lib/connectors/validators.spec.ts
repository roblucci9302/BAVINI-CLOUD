import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { validateConnector, hasValidator } from './validators';

describe('validators', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('hasValidator', () => {
    it('should return true for connectors with validators', () => {
      expect(hasValidator('github')).toBe(true);
      expect(hasValidator('supabase')).toBe(true);
      expect(hasValidator('netlify')).toBe(true);
    });
  });

  describe('validateConnector - GitHub', () => {
    it('should return error when token is missing', async () => {
      const result = await validateConnector('github', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token requis');
    });

    it('should return success on valid token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ login: 'testuser', name: 'Test User' }),
      } as Response);

      const result = await validateConnector('github', { token: 'ghp_valid_token' });

      expect(result.success).toBe(true);
      expect(result.details).toEqual({ login: 'testuser', name: 'Test User' });
    });

    it('should return error on 401', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const result = await validateConnector('github', { token: 'invalid_token' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token invalide ou expiré');
    });

    it('should return error on network failure', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const result = await validateConnector('github', { token: 'ghp_token' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Impossible de contacter GitHub');
    });
  });

  describe('validateConnector - Supabase', () => {
    it('should return error when url is missing', async () => {
      const result = await validateConnector('supabase', { anonKey: 'key' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('URL et clé anon requis');
    });

    it('should return error when anonKey is missing', async () => {
      const result = await validateConnector('supabase', { url: 'https://test.supabase.co' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('URL et clé anon requis');
    });

    it('should return success on valid credentials', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
      } as Response);

      const result = await validateConnector('supabase', {
        url: 'https://test.supabase.co',
        anonKey: 'valid_key',
      });

      expect(result.success).toBe(true);
    });

    it('should return error on 401', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const result = await validateConnector('supabase', {
        url: 'https://test.supabase.co',
        anonKey: 'invalid_key',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Clé API invalide');
    });
  });

  describe('validateConnector - Netlify', () => {
    it('should return error when accessToken is missing', async () => {
      const result = await validateConnector('netlify', {});

      expect(result.success).toBe(false);
      expect(result.error).toBe("Token d'accès requis");
    });

    it('should return success on valid token', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: true,
        json: async () => ({ email: 'test@example.com', full_name: 'Test User' }),
      } as Response);

      const result = await validateConnector('netlify', { accessToken: 'valid_token' });

      expect(result.success).toBe(true);
      expect(result.details).toEqual({ email: 'test@example.com', full_name: 'Test User' });
    });

    it('should return error on 401', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce({
        ok: false,
        status: 401,
      } as Response);

      const result = await validateConnector('netlify', { accessToken: 'invalid' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Token invalide');
    });

    it('should return error on network failure', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValueOnce(new Error('Network error'));

      const result = await validateConnector('netlify', { accessToken: 'token' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Impossible de contacter Netlify');
    });
  });
});
