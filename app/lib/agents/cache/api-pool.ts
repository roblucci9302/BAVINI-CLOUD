/**
 * API Connection Pool
 *
 * Manages a pool of Anthropic client connections to:
 * - Reuse connections across agents
 * - Reduce connection overhead
 * - Manage rate limiting per client
 *
 * @module agents/cache/api-pool
 */

import Anthropic from '@anthropic-ai/sdk';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('APIPool');

/**
 * Pool statistics
 */
export interface APIPoolStats {
  totalClients: number;
  activeClients: number;
  totalRequests: number;
  poolHits: number;
  poolMisses: number;
  hitRate: number;
  queuedRequests: number;
  queueTimeouts: number;
  currentQueueSize: number;
}

/**
 * Pooled client entry
 */
interface PooledClient {
  client: Anthropic;
  apiKey: string;
  lastUsed: number;
  requestCount: number;
  inUse: boolean;
}

/**
 * Pool configuration
 */
export interface APIPoolConfig {
  /** Maximum clients per API key */
  maxClientsPerKey?: number;

  /** Client idle timeout in ms (default: 5 minutes) */
  idleTimeout?: number;

  /** Enable connection reuse (default: true) */
  reuseConnections?: boolean;

  /** Maximum queue size for waiting requests (default: 10) */
  maxQueueSize?: number;

  /** Queue timeout in ms (default: 30000) */
  queueTimeout?: number;
}

/**
 * Queued request waiting for a client
 */
interface QueuedRequest {
  resolve: (client: Anthropic) => void;
  reject: (error: Error) => void;
  timestamp: number;
}

/**
 * Anthropic API Connection Pool
 */
class AnthropicConnectionPool {
  private pools: Map<string, PooledClient[]> = new Map();
  private queues: Map<string, QueuedRequest[]> = new Map();
  private maxClientsPerKey: number;
  private idleTimeout: number;
  private reuseConnections: boolean;
  private maxQueueSize: number;
  private queueTimeout: number;

  private stats = {
    totalRequests: 0,
    poolHits: 0,
    poolMisses: 0,
    queuedRequests: 0,
    queueTimeouts: 0,
  };

  constructor(config: APIPoolConfig = {}) {
    this.maxClientsPerKey = config.maxClientsPerKey ?? 3;
    this.idleTimeout = config.idleTimeout ?? 5 * 60 * 1000; // 5 minutes
    this.reuseConnections = config.reuseConnections ?? true;
    this.maxQueueSize = config.maxQueueSize ?? 10;
    this.queueTimeout = config.queueTimeout ?? 30000; // 30 seconds
  }

  /**
   * Get or create a client for the given API key (sync version for backwards compatibility)
   */
  getClient(apiKey: string): Anthropic {
    this.stats.totalRequests++;

    if (!this.reuseConnections) {
      this.stats.poolMisses++;
      return this.createNewClient(apiKey);
    }

    let pool = this.pools.get(apiKey);

    if (!pool) {
      pool = [];
      this.pools.set(apiKey, pool);
    }

    // Find an available client
    const availableClient = pool.find((p) => !p.inUse);

    if (availableClient) {
      availableClient.inUse = true;
      availableClient.lastUsed = Date.now();
      availableClient.requestCount++;
      this.stats.poolHits++;

      logger.debug('Pool hit - reusing existing client', {
        requestCount: availableClient.requestCount,
      });

      return availableClient.client;
    }

    // Create new client if pool not full
    if (pool.length < this.maxClientsPerKey) {
      const client = this.createNewClient(apiKey);
      const pooledClient: PooledClient = {
        client,
        apiKey,
        lastUsed: Date.now(),
        requestCount: 1,
        inUse: true,
      };

      pool.push(pooledClient);
      this.stats.poolMisses++;

      logger.debug('Pool miss - created new client', {
        poolSize: pool.length,
        maxSize: this.maxClientsPerKey,
      });

      return client;
    }

    // Pool is full - for sync version, create temporary client
    this.stats.poolMisses++;
    logger.debug('Pool full - creating temporary client (sync)');

    return this.createNewClient(apiKey);
  }

  /**
   * Get a client with queueing support (async version - prevents resource leaks)
   * Waits for an available client instead of creating unlimited temporaries
   */
  async getClientAsync(apiKey: string): Promise<Anthropic> {
    this.stats.totalRequests++;

    if (!this.reuseConnections) {
      this.stats.poolMisses++;
      return this.createNewClient(apiKey);
    }

    let pool = this.pools.get(apiKey);

    if (!pool) {
      pool = [];
      this.pools.set(apiKey, pool);
    }

    // Find an available client
    const availableClient = pool.find((p) => !p.inUse);

    if (availableClient) {
      availableClient.inUse = true;
      availableClient.lastUsed = Date.now();
      availableClient.requestCount++;
      this.stats.poolHits++;

      return availableClient.client;
    }

    // Create new client if pool not full
    if (pool.length < this.maxClientsPerKey) {
      const client = this.createNewClient(apiKey);
      const pooledClient: PooledClient = {
        client,
        apiKey,
        lastUsed: Date.now(),
        requestCount: 1,
        inUse: true,
      };

      pool.push(pooledClient);
      this.stats.poolMisses++;

      return client;
    }

    // Pool is full - add to queue and wait
    let queue = this.queues.get(apiKey);

    if (!queue) {
      queue = [];
      this.queues.set(apiKey, queue);
    }

    // Check queue size limit
    if (queue.length >= this.maxQueueSize) {
      throw new Error(`API pool queue full (max ${this.maxQueueSize}). Try again later.`);
    }

    this.stats.queuedRequests++;
    logger.debug('Pool full - request queued', { queueSize: queue.length + 1 });

    // Wait for available client with timeout
    return new Promise<Anthropic>((resolve, reject) => {
      const queuedRequest: QueuedRequest = {
        resolve,
        reject,
        timestamp: Date.now(),
      };

      queue!.push(queuedRequest);

      // Setup timeout
      setTimeout(() => {
        const idx = queue!.indexOf(queuedRequest);

        if (idx !== -1) {
          queue!.splice(idx, 1);
          this.stats.queueTimeouts++;
          reject(new Error(`API pool queue timeout after ${this.queueTimeout}ms`));
        }
      }, this.queueTimeout);
    });
  }

  /**
   * Release a client back to the pool
   */
  releaseClient(apiKey: string, client: Anthropic): void {
    const pool = this.pools.get(apiKey);

    if (!pool) {
      return;
    }

    const pooledClient = pool.find((p) => p.client === client);

    if (pooledClient) {
      // Check if there are queued requests waiting
      const queue = this.queues.get(apiKey);

      if (queue && queue.length > 0) {
        // Give client to next queued request instead of releasing
        const nextRequest = queue.shift()!;
        pooledClient.lastUsed = Date.now();
        pooledClient.requestCount++;
        this.stats.poolHits++;

        logger.debug('Client transferred to queued request', {
          queueRemaining: queue.length,
        });

        nextRequest.resolve(pooledClient.client);
        return;
      }

      // No queued requests - release normally
      pooledClient.inUse = false;
      pooledClient.lastUsed = Date.now();

      logger.debug('Client released back to pool', {
        requestCount: pooledClient.requestCount,
      });
    }
  }

  /**
   * Create a new Anthropic client
   */
  private createNewClient(apiKey: string): Anthropic {
    return new Anthropic({
      apiKey,

      // Enable keep-alive for connection reuse
      defaultHeaders: {
        Connection: 'keep-alive',
      },
    });
  }

  /**
   * Cleanup idle clients
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [apiKey, pool] of this.pools) {
      const activeClients = pool.filter((p) => {
        if (!p.inUse && now - p.lastUsed > this.idleTimeout) {
          cleaned++;
          return false;
        }

        return true;
      });

      if (activeClients.length === 0) {
        this.pools.delete(apiKey);
      } else {
        this.pools.set(apiKey, activeClients);
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} idle clients`);
    }

    return cleaned;
  }

  /**
   * Get pool statistics
   */
  getStats(): APIPoolStats {
    let totalClients = 0;
    let activeClients = 0;
    let currentQueueSize = 0;

    for (const pool of this.pools.values()) {
      totalClients += pool.length;
      activeClients += pool.filter((p) => p.inUse).length;
    }

    for (const queue of this.queues.values()) {
      currentQueueSize += queue.length;
    }

    const totalRequests = this.stats.totalRequests;
    const hitRate = totalRequests > 0 ? (this.stats.poolHits / totalRequests) * 100 : 0;

    return {
      totalClients,
      activeClients,
      totalRequests,
      poolHits: this.stats.poolHits,
      poolMisses: this.stats.poolMisses,
      hitRate,
      queuedRequests: this.stats.queuedRequests,
      queueTimeouts: this.stats.queueTimeouts,
      currentQueueSize,
    };
  }

  /**
   * Clear all pools
   */
  clear(): void {
    // Reject all queued requests
    for (const queue of this.queues.values()) {
      for (const request of queue) {
        request.reject(new Error('Pool cleared'));
      }
    }

    this.pools.clear();
    this.queues.clear();
    this.stats = {
      totalRequests: 0,
      poolHits: 0,
      poolMisses: 0,
      queuedRequests: 0,
      queueTimeouts: 0,
    };
    logger.debug('All connection pools and queues cleared');
  }

  /**
   * Get pool size for an API key
   */
  getPoolSize(apiKey: string): number {
    return this.pools.get(apiKey)?.length ?? 0;
  }
}

/**
 * Global connection pool instance
 */
export const apiPool = new AnthropicConnectionPool();

/**
 * Get a client from the pool (sync version)
 */
export function getPooledClient(apiKey: string): Anthropic {
  return apiPool.getClient(apiKey);
}

/**
 * Get a client from the pool with queueing support (async version - recommended)
 * Waits for an available client instead of creating unlimited temporaries
 */
export function getPooledClientAsync(apiKey: string): Promise<Anthropic> {
  return apiPool.getClientAsync(apiKey);
}

/**
 * Release a client back to the pool
 */
export function releasePooledClient(apiKey: string, client: Anthropic): void {
  apiPool.releaseClient(apiKey, client);
}

/**
 * Get pool statistics
 */
export function getAPIPoolStats(): APIPoolStats {
  return apiPool.getStats();
}

/**
 * Cleanup idle connections
 */
export function cleanupIdleConnections(): number {
  return apiPool.cleanup();
}
