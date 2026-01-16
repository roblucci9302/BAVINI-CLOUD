/**
 * API Utilities
 * Outils pour optimiser les requêtes API
 */

// Named exports for better tree-shaking (avoid export *)

// Request Deduplication (request-cache.ts)
export {
  type DedupedFetchOptions,
  dedupedFetch,
  dedupedFetchWithTimeout,
  cancelPendingRequest,
  cancelAllPendingRequests,
  getPendingRequestCount,
  getRequestCacheStats,
  resetRequestCacheStats,
  isRequestPending,
} from './request-cache';

// Response Cache (response-cache.ts)
export {
  type ResponseCacheOptions,
  ResponseCache,
  getCached,
  setCache,
  hasCache,
  deleteCache,
  clearCache,
  getOrCompute,
  invalidateCachePattern,
  getCacheStats,
  cleanupCache,
  createCache,
} from './response-cache';

// Cache Headers (cache-headers.ts)
export {
  API_SECURITY_HEADERS,
  CachePresets,
  type CachePreset,
  type CacheHeaderOptions,
  createCacheHeaders,
  getCachePreset,
  withCacheHeaders,
  createCachedResponse,
  jsonWithCache,
  createStreamingResponse,
  createSecureJsonResponse,
  isCacheableRequest,
  checkConditionalRequest,
  notModifiedResponse,
} from './cache-headers';
