/**
 * Tests for API Connection Pool
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { apiPool, getPooledClient, releasePooledClient, getAPIPoolStats, cleanupIdleConnections } from './api-pool';

// Mock Anthropic SDK
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation((config) => ({
      _config: config,
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg_test',
          content: [{ type: 'text', text: 'Hello' }],
        }),
      },
    })),
  };
});

describe('API Connection Pool', () => {
  beforeEach(() => {
    apiPool.clear();
  });

  describe('getClient', () => {
    it('should create a new client for new API key', () => {
      const client = getPooledClient('test-api-key-1');

      expect(client).toBeDefined();
      expect(client.messages).toBeDefined();
    });

    it('should reuse client for same API key', () => {
      const client1 = getPooledClient('test-api-key-1');
      releasePooledClient('test-api-key-1', client1);

      const client2 = getPooledClient('test-api-key-1');

      expect(client1).toBe(client2);
    });

    it('should create different clients for different API keys', () => {
      const client1 = getPooledClient('test-api-key-1');
      const client2 = getPooledClient('test-api-key-2');

      expect(client1).not.toBe(client2);
    });

    it('should track pool hits and misses', () => {
      const apiKey = 'test-api-key-stats';

      // First call - miss
      const client1 = getPooledClient(apiKey);
      releasePooledClient(apiKey, client1);

      // Second call - hit
      const client2 = getPooledClient(apiKey);
      releasePooledClient(apiKey, client2);

      // Third call - hit
      getPooledClient(apiKey);

      const stats = getAPIPoolStats();

      expect(stats.poolMisses).toBeGreaterThanOrEqual(1);
      expect(stats.poolHits).toBeGreaterThanOrEqual(2);
    });
  });

  describe('releaseClient', () => {
    it('should make client available for reuse', () => {
      const apiKey = 'test-api-key-release';

      const client1 = getPooledClient(apiKey);
      releasePooledClient(apiKey, client1);

      const client2 = getPooledClient(apiKey);

      expect(client1).toBe(client2);
    });

    it('should handle release of unknown client gracefully', () => {
      const mockClient = { messages: {} } as any;

      // Should not throw
      expect(() => {
        releasePooledClient('unknown-key', mockClient);
      }).not.toThrow();
    });
  });

  describe('pool capacity', () => {
    it('should limit clients per API key', () => {
      const apiKey = 'test-api-key-capacity';
      const clients: any[] = [];

      // Get multiple clients without releasing (simulating concurrent use)
      for (let i = 0; i < 5; i++) {
        clients.push(getPooledClient(apiKey));
      }

      const stats = getAPIPoolStats();

      // Pool should cap at maxClientsPerKey (default 3)
      // Additional clients are created but not pooled
      expect(stats.totalClients).toBeLessThanOrEqual(3);
    });
  });

  describe('statistics', () => {
    it('should track total requests', () => {
      for (let i = 0; i < 5; i++) {
        const client = getPooledClient(`api-key-${i}`);
        releasePooledClient(`api-key-${i}`, client);
      }

      const stats = getAPIPoolStats();

      expect(stats.totalRequests).toBe(5);
    });

    it('should track active vs total clients', () => {
      const apiKey = 'test-api-key-active';

      const client1 = getPooledClient(apiKey);
      const client2 = getPooledClient(apiKey);

      let stats = getAPIPoolStats();
      expect(stats.activeClients).toBeGreaterThanOrEqual(1);

      releasePooledClient(apiKey, client1);
      releasePooledClient(apiKey, client2);

      stats = getAPIPoolStats();
      expect(stats.activeClients).toBe(0);
    });

    it('should calculate hit rate', () => {
      const apiKey = 'test-api-key-hitrate';

      // 1 miss
      const client1 = getPooledClient(apiKey);
      releasePooledClient(apiKey, client1);

      // 3 hits
      for (let i = 0; i < 3; i++) {
        const client = getPooledClient(apiKey);
        releasePooledClient(apiKey, client);
      }

      const stats = getAPIPoolStats();

      // 3 hits / 4 total = 75%
      expect(stats.hitRate).toBe(75);
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should cleanup idle connections', () => {
      const apiKey = 'test-api-key-cleanup';

      const client = getPooledClient(apiKey);
      releasePooledClient(apiKey, client);

      expect(apiPool.getPoolSize(apiKey)).toBe(1);

      // Advance past idle timeout (default 5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000);

      const cleaned = cleanupIdleConnections();

      expect(cleaned).toBe(1);
      expect(apiPool.getPoolSize(apiKey)).toBe(0);
    });

    it('should not cleanup active connections', () => {
      const apiKey = 'test-api-key-active-cleanup';

      const client = getPooledClient(apiKey);

      // Don't release - client is still in use

      vi.advanceTimersByTime(6 * 60 * 1000);

      const cleaned = cleanupIdleConnections();

      expect(cleaned).toBe(0);

      // Cleanup
      releasePooledClient(apiKey, client);
    });

    it('should not cleanup connections before timeout', () => {
      const apiKey = 'test-api-key-early-cleanup';

      const client = getPooledClient(apiKey);
      releasePooledClient(apiKey, client);

      // Advance but not past timeout
      vi.advanceTimersByTime(4 * 60 * 1000);

      const cleaned = cleanupIdleConnections();

      expect(cleaned).toBe(0);
      expect(apiPool.getPoolSize(apiKey)).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear all pools', () => {
      // Create clients for multiple API keys
      for (let i = 0; i < 3; i++) {
        const client = getPooledClient(`api-key-${i}`);
        releasePooledClient(`api-key-${i}`, client);
      }

      expect(getAPIPoolStats().totalClients).toBeGreaterThan(0);

      apiPool.clear();

      const stats = getAPIPoolStats();
      expect(stats.totalClients).toBe(0);
      expect(stats.totalRequests).toBe(0);
    });
  });

  describe('getPoolSize', () => {
    it('should return 0 for unknown API key', () => {
      expect(apiPool.getPoolSize('unknown-key')).toBe(0);
    });

    it('should return correct size for known API key', () => {
      const apiKey = 'test-api-key-size';

      const client = getPooledClient(apiKey);
      releasePooledClient(apiKey, client);

      expect(apiPool.getPoolSize(apiKey)).toBe(1);
    });
  });

  describe('concurrent access', () => {
    it('should handle multiple concurrent requests', async () => {
      const apiKey = 'test-api-key-concurrent';

      // Simulate concurrent requests
      const promises = Array(10)
        .fill(null)
        .map(async (_, i) => {
          const client = getPooledClient(apiKey);

          // Simulate some async work
          await new Promise((r) => setTimeout(r, 10));
          releasePooledClient(apiKey, client);
          return client;
        });

      const clients = await Promise.all(promises);

      // All should have gotten clients
      expect(clients.every((c) => c !== undefined)).toBe(true);

      // Stats should show activity
      const stats = getAPIPoolStats();
      expect(stats.totalRequests).toBe(10);
    });
  });
});
