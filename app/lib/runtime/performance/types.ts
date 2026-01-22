/**
 * =============================================================================
 * BAVINI Performance - Type Definitions
 * =============================================================================
 * Types for performance monitoring and optimization.
 * =============================================================================
 */

/**
 * Performance metric entry
 */
export interface PerformanceMetric {
  /** Metric name */
  name: string;
  /** Start timestamp */
  startTime: number;
  /** Duration in milliseconds */
  duration: number;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
}

/**
 * Performance mark
 */
export interface PerformanceMark {
  name: string;
  timestamp: number;
}

/**
 * Memory usage snapshot
 */
export interface MemorySnapshot {
  /** Total JS heap size (bytes) */
  totalJSHeapSize?: number;
  /** Used JS heap size (bytes) */
  usedJSHeapSize?: number;
  /** JS heap size limit (bytes) */
  jsHeapSizeLimit?: number;
  /** Timestamp */
  timestamp: number;
}

/**
 * Worker pool configuration
 */
export interface WorkerPoolConfig {
  /** Minimum number of workers to keep alive */
  minWorkers: number;
  /** Maximum number of workers */
  maxWorkers: number;
  /** Idle timeout before recycling (ms) */
  idleTimeout: number;
  /** Maximum tasks per worker before recycling */
  maxTasksPerWorker: number;
}

/**
 * Worker instance in pool
 */
export interface PooledWorker {
  /** Unique worker ID */
  id: string;
  /** Worker instance */
  worker: Worker;
  /** Current status */
  status: 'idle' | 'busy' | 'terminating';
  /** Number of tasks executed */
  taskCount: number;
  /** Last activity timestamp */
  lastActivity: number;
  /** Creation timestamp */
  createdAt: number;
}

/**
 * Cache configuration
 */
export interface CacheConfig {
  /** Maximum number of entries */
  maxEntries: number;
  /** Maximum size in bytes */
  maxSizeBytes: number;
  /** Time-to-live in milliseconds */
  ttlMs: number;
  /** Enable persistence */
  persistent: boolean;
}

/**
 * Cache entry
 */
export interface CacheEntry<T> {
  /** Cached value */
  value: T;
  /** Size in bytes */
  size: number;
  /** Creation timestamp */
  createdAt: number;
  /** Last access timestamp */
  lastAccess: number;
  /** Access count */
  accessCount: number;
}

/**
 * Cache statistics
 */
export interface CacheStats {
  /** Number of entries */
  entries: number;
  /** Total size in bytes */
  totalSize: number;
  /** Hit count */
  hits: number;
  /** Miss count */
  misses: number;
  /** Hit rate (0-1) */
  hitRate: number;
  /** Eviction count */
  evictions: number;
}

/**
 * Startup timing breakdown
 */
export interface StartupTiming {
  /** Total startup time */
  total: number;
  /** WASM loading time */
  wasmLoad: number;
  /** Worker initialization time */
  workerInit: number;
  /** Filesystem initialization time */
  filesystemInit: number;
  /** First render time */
  firstRender: number;
}

/**
 * Build metrics
 */
export interface BuildMetrics {
  /** Total build time */
  totalTime: number;
  /** Transform time */
  transformTime: number;
  /** Bundle time */
  bundleTime: number;
  /** Number of modules */
  moduleCount: number;
  /** Output size in bytes */
  outputSize: number;
}

/**
 * Performance budget
 */
export interface PerformanceBudget {
  /** Maximum boot time (ms) */
  maxBootTime: number;
  /** Maximum build time (ms) */
  maxBuildTime: number;
  /** Maximum memory usage (bytes) */
  maxMemoryUsage: number;
  /** Maximum bundle size (bytes) */
  maxBundleSize: number;
}

/**
 * Budget violation
 */
export interface BudgetViolation {
  /** Metric name */
  metric: string;
  /** Actual value */
  actual: number;
  /** Budget limit */
  limit: number;
  /** Severity */
  severity: 'warning' | 'error';
}
