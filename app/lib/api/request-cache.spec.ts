import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  dedupedFetch,
  cancelAllPendingRequests,
  getPendingRequestCount,
  getRequestCacheStats,
  resetRequestCacheStats,
  isRequestPending,
} from './request-cache';

describe('Request Cache', () => {
  beforeEach(() => {
    cancelAllPendingRequests();
    resetRequestCacheStats();
    vi.restoreAllMocks();
  });

  afterEach(() => {
    cancelAllPendingRequests();
    vi.restoreAllMocks();
  });

  describe('dedupedFetch', () => {
    it('should fetch normally for single request', async () => {
      const mockResponse = new Response('test data', { status: 200 });
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

      const response = await dedupedFetch('/api/test');

      expect(response.status).toBe(200);
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should deduplicate concurrent identical requests', async () => {
      let resolvePromise: (value: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      });

      vi.spyOn(global, 'fetch').mockReturnValueOnce(fetchPromise);

      // Start two concurrent requests
      const promise1 = dedupedFetch('/api/test');
      const promise2 = dedupedFetch('/api/test');

      // Should only have one pending request
      expect(getPendingRequestCount()).toBe(1);

      // Resolve the fetch
      resolvePromise!(new Response('test data', { status: 200 }));

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Both should get responses
      expect(result1.status).toBe(200);
      expect(result2.status).toBe(200);

      // But fetch should only have been called once
      expect(global.fetch).toHaveBeenCalledTimes(1);

      // Check stats
      const stats = getRequestCacheStats();
      expect(stats.deduped).toBe(1);
      expect(stats.misses).toBe(1);
    });

    it('should not deduplicate different URLs', async () => {
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response('data1'))
        .mockResolvedValueOnce(new Response('data2'));

      await Promise.all([dedupedFetch('/api/test1'), dedupedFetch('/api/test2')]);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should not deduplicate different methods', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValueOnce(new Response('get')).mockResolvedValueOnce(new Response('post'));

      await Promise.all([dedupedFetch('/api/test', { method: 'GET' }), dedupedFetch('/api/test', { method: 'POST' })]);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should not deduplicate requests with different body content', async () => {
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response('response1'))
        .mockResolvedValueOnce(new Response('response2'));

      await Promise.all([
        dedupedFetch('/api/test', { method: 'POST', body: JSON.stringify({ id: 1 }) }),
        dedupedFetch('/api/test', { method: 'POST', body: JSON.stringify({ id: 2 }) }),
      ]);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should deduplicate requests with same body content', async () => {
      let resolvePromise: (value: Response) => void;
      const fetchPromise = new Promise<Response>((resolve) => {
        resolvePromise = resolve;
      });

      vi.spyOn(global, 'fetch').mockReturnValueOnce(fetchPromise);

      const body = JSON.stringify({ id: 1, data: 'test' });
      const promise1 = dedupedFetch('/api/test', { method: 'POST', body });
      const promise2 = dedupedFetch('/api/test', { method: 'POST', body });

      expect(getPendingRequestCount()).toBe(1);

      resolvePromise!(new Response('data'));
      await Promise.all([promise1, promise2]);

      expect(global.fetch).toHaveBeenCalledTimes(1);
    });

    it('should skip deduplication when skipDedup is true', async () => {
      let callCount = 0;
      vi.spyOn(global, 'fetch').mockImplementation(async () => {
        callCount++;
        await new Promise((resolve) => setTimeout(resolve, 10));

        return new Response(`data${callCount}`);
      });

      await Promise.all([
        dedupedFetch('/api/test', { skipDedup: true }),
        dedupedFetch('/api/test', { skipDedup: true }),
      ]);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });

    it('should use custom cache key when provided', async () => {
      vi.spyOn(global, 'fetch')
        .mockResolvedValueOnce(new Response('data1'))
        .mockResolvedValueOnce(new Response('data2'));

      // Same URL but different cache keys - should make 2 requests
      await Promise.all([
        dedupedFetch('/api/test', { cacheKey: 'key1' }),
        dedupedFetch('/api/test', { cacheKey: 'key2' }),
      ]);

      expect(global.fetch).toHaveBeenCalledTimes(2);
    });
  });

  describe('pending request tracking', () => {
    it('should track pending requests', async () => {
      let resolvePromise: (value: Response) => void;
      vi.spyOn(global, 'fetch').mockReturnValueOnce(
        new Promise<Response>((resolve) => {
          resolvePromise = resolve;
        }),
      );

      expect(getPendingRequestCount()).toBe(0);

      const promise = dedupedFetch('/api/test');

      expect(getPendingRequestCount()).toBe(1);
      expect(isRequestPending('/api/test')).toBe(true);

      resolvePromise!(new Response('data'));
      await promise;

      expect(getPendingRequestCount()).toBe(0);
      expect(isRequestPending('/api/test')).toBe(false);
    });

    it('should cancel all pending requests', async () => {
      vi.spyOn(global, 'fetch').mockReturnValue(
        new Promise(() => {}), // Never resolves
      );

      dedupedFetch('/api/test1');
      dedupedFetch('/api/test2');

      expect(getPendingRequestCount()).toBe(2);

      const cancelled = cancelAllPendingRequests();

      expect(cancelled).toBe(2);
      expect(getPendingRequestCount()).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should track cache statistics', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response('data'));

      // First request - miss
      await dedupedFetch('/api/test1');

      // Concurrent requests - one miss, one dedup
      const pending = dedupedFetch('/api/test2');
      await dedupedFetch('/api/test2'); // deduped
      await pending;

      const stats = getRequestCacheStats();

      expect(stats.misses).toBe(2);
      expect(stats.deduped).toBe(1);
      expect(stats.dedupRate).toBeCloseTo(1 / 3);
    });

    it('should reset statistics', () => {
      resetRequestCacheStats();

      const stats = getRequestCacheStats();
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.deduped).toBe(0);
    });
  });
});
