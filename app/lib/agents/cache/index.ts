/**
 * Cache module exports
 */

export {
  llmCache,
  getCachedResponse,
  cacheResponse,
  getLLMCacheStats,
  clearLLMCache,
  type LLMCacheStats,
  type LLMCacheConfig,
} from './llm-cache';

export {
  apiPool,
  getPooledClient,
  getPooledClientAsync,
  releasePooledClient,
  getAPIPoolStats,
  cleanupIdleConnections,
  type APIPoolStats,
  type APIPoolConfig,
} from './api-pool';

export {
  routingCache,
  getCachedRouting,
  cacheRouting,
  getRoutingCacheStats,
  clearRoutingCache,
  cleanupRoutingCache,
  analyzePromptPatterns,
  type RoutingCacheStats,
  type RoutingCacheConfig,
  type RoutingCacheContext,
} from './routing-cache';
