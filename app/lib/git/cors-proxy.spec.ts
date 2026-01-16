import { describe, expect, it, beforeEach } from 'vitest';
import {
  getCorsProxyUrl,
  setCorsProxyUrl,
  resetCorsProxy,
  tryNextProxy,
  needsCorsProxy,
  parseGitUrl,
  sshToHttps,
} from './cors-proxy';

describe('CORS Proxy', () => {
  beforeEach(() => {
    resetCorsProxy();
  });

  describe('getCorsProxyUrl', () => {
    it('should return default proxy URL', () => {
      const url = getCorsProxyUrl();

      expect(url).toBe('https://cors.isomorphic-git.org');
    });

    it('should return custom proxy URL when set', () => {
      setCorsProxyUrl('https://my-proxy.example.com');

      const url = getCorsProxyUrl();

      expect(url).toBe('https://my-proxy.example.com');
    });
  });

  describe('setCorsProxyUrl', () => {
    it('should set a custom proxy URL', () => {
      setCorsProxyUrl('https://custom.proxy.io');

      expect(getCorsProxyUrl()).toBe('https://custom.proxy.io');
    });
  });

  describe('resetCorsProxy', () => {
    it('should reset to default proxy', () => {
      setCorsProxyUrl('https://custom.proxy.io');
      resetCorsProxy();

      expect(getCorsProxyUrl()).toBe('https://cors.isomorphic-git.org');
    });
  });

  describe('tryNextProxy', () => {
    it('should return false when using custom proxy', () => {
      setCorsProxyUrl('https://custom.proxy.io');

      const result = tryNextProxy();

      expect(result).toBe(false);
    });

    it('should return false when all proxies have been tried', () => {
      // try to cycle through all proxies
      let hasMore = true;

      while (hasMore) {
        hasMore = tryNextProxy();
      }

      expect(hasMore).toBe(false);
    });
  });

  describe('needsCorsProxy', () => {
    it('should return false for localhost', () => {
      expect(needsCorsProxy('http://localhost:3000/repo.git')).toBe(false);
    });

    it('should return false for 127.0.0.1', () => {
      expect(needsCorsProxy('http://127.0.0.1:8080/repo.git')).toBe(false);
    });

    it('should return true for github.com', () => {
      expect(needsCorsProxy('https://github.com/user/repo.git')).toBe(true);
    });

    it('should return true for gitlab.com', () => {
      expect(needsCorsProxy('https://gitlab.com/user/repo.git')).toBe(true);
    });

    it('should return true for invalid URLs', () => {
      expect(needsCorsProxy('not-a-valid-url')).toBe(true);
    });
  });

  describe('parseGitUrl', () => {
    it('should parse GitHub HTTPS URL', () => {
      const result = parseGitUrl('https://github.com/owner/repo.git');

      expect(result).toEqual({
        provider: 'github',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });

    it('should parse GitHub SSH URL', () => {
      const result = parseGitUrl('git@github.com:owner/repo.git');

      expect(result).toEqual({
        provider: 'github',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });

    it('should parse GitLab URL', () => {
      const result = parseGitUrl('https://gitlab.com/owner/repo.git');

      expect(result).toEqual({
        provider: 'gitlab',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });

    it('should parse Bitbucket URL', () => {
      const result = parseGitUrl('https://bitbucket.org/owner/repo.git');

      expect(result).toEqual({
        provider: 'bitbucket',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });

    it('should handle URL without .git extension', () => {
      const result = parseGitUrl('https://github.com/owner/repo');

      expect(result).toEqual({
        provider: 'github',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });

    it('should return other for unknown providers', () => {
      const result = parseGitUrl('https://example.com/owner/repo.git');

      expect(result).toEqual({
        provider: 'other',
        owner: 'owner',
        repo: 'repo',
        fullName: 'owner/repo',
      });
    });

    it('should handle invalid URLs', () => {
      const result = parseGitUrl('not-a-url');

      expect(result).toEqual({
        provider: 'other',
        owner: null,
        repo: null,
        fullName: null,
      });
    });

    it('should handle URLs with only one path segment', () => {
      const result = parseGitUrl('https://github.com/owner');

      expect(result).toEqual({
        provider: 'other',
        owner: null,
        repo: null,
        fullName: null,
      });
    });
  });

  describe('sshToHttps', () => {
    it('should convert GitHub SSH URL to HTTPS', () => {
      const result = sshToHttps('git@github.com:owner/repo.git');

      expect(result).toBe('https://github.com/owner/repo.git');
    });

    it('should convert GitLab SSH URL to HTTPS', () => {
      const result = sshToHttps('git@gitlab.com:owner/repo.git');

      expect(result).toBe('https://gitlab.com/owner/repo.git');
    });

    it('should return HTTPS URLs unchanged', () => {
      const url = 'https://github.com/owner/repo.git';
      const result = sshToHttps(url);

      expect(result).toBe(url);
    });

    it('should return non-SSH URLs unchanged', () => {
      const url = 'http://example.com/repo.git';
      const result = sshToHttps(url);

      expect(result).toBe(url);
    });
  });
});
