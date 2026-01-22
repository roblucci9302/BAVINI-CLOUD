/**
 * =============================================================================
 * BAVINI Performance - Public API
 * =============================================================================
 * Performance monitoring, caching, and optimization utilities.
 * =============================================================================
 */

// Types
export type {
  PerformanceMetric,
  PerformanceMark,
  MemorySnapshot,
  WorkerPoolConfig,
  PooledWorker,
  CacheConfig,
  CacheEntry,
  CacheStats,
  StartupTiming,
  BuildMetrics,
  PerformanceBudget,
  BudgetViolation,
} from './types';

// Performance Monitor
export {
  PerformanceMonitor,
  getPerformanceMonitor,
  createPerformanceMonitor,
} from './performance-monitor';

// Worker Pool
export {
  WorkerPool,
  createWorkerPool,
} from './worker-pool';

// Smart Cache
export {
  SmartCache,
  createSmartCache,
} from './smart-cache';

// Startup Optimizer
export {
  StartupOptimizer,
  getStartupOptimizer,
  createStartupOptimizer,
} from './startup-optimizer';
