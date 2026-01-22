/**
 * =============================================================================
 * BAVINI Performance - Performance Monitor
 * =============================================================================
 * Collects and reports performance metrics for the runtime.
 * =============================================================================
 */

import type {
  PerformanceMetric,
  PerformanceMark,
  MemorySnapshot,
  StartupTiming,
  BuildMetrics,
  PerformanceBudget,
  BudgetViolation,
} from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PerformanceMonitor');

/**
 * Default performance budget
 */
const DEFAULT_BUDGET: PerformanceBudget = {
  maxBootTime: 2500,      // 2.5 seconds
  maxBuildTime: 5000,     // 5 seconds
  maxMemoryUsage: 256 * 1024 * 1024, // 256MB
  maxBundleSize: 3 * 1024 * 1024,    // 3MB
};

/**
 * Performance Monitor
 * Tracks and reports runtime performance metrics
 */
export class PerformanceMonitor {
  private metrics: PerformanceMetric[] = [];
  private marks: Map<string, PerformanceMark> = new Map();
  private memorySnapshots: MemorySnapshot[] = [];
  private budget: PerformanceBudget;
  private startupTiming: Partial<StartupTiming> = {};
  private observers: Set<(metric: PerformanceMetric) => void> = new Set();
  private memoryInterval: ReturnType<typeof setInterval> | null = null;

  constructor(budget: Partial<PerformanceBudget> = {}) {
    this.budget = { ...DEFAULT_BUDGET, ...budget };
  }

  /**
   * Start tracking a metric
   */
  mark(name: string): void {
    this.marks.set(name, {
      name,
      timestamp: performance.now(),
    });
  }

  /**
   * End tracking and record metric
   */
  measure(name: string, startMark?: string, metadata?: Record<string, unknown>): PerformanceMetric {
    const endTime = performance.now();
    const markName = startMark || name;
    const startMark_ = this.marks.get(markName);

    if (!startMark_) {
      logger.warn(`No start mark found for: ${markName}`);
      return {
        name,
        startTime: endTime,
        duration: 0,
        metadata,
      };
    }

    const metric: PerformanceMetric = {
      name,
      startTime: startMark_.timestamp,
      duration: endTime - startMark_.timestamp,
      metadata,
    };

    this.metrics.push(metric);
    this.marks.delete(markName);

    // Notify observers
    this.observers.forEach(cb => cb(metric));

    // Log if over budget
    this.checkBudget(metric);

    return metric;
  }

  /**
   * Record a metric directly
   */
  record(name: string, duration: number, metadata?: Record<string, unknown>): void {
    const metric: PerformanceMetric = {
      name,
      startTime: performance.now() - duration,
      duration,
      metadata,
    };

    this.metrics.push(metric);
    this.observers.forEach(cb => cb(metric));
    this.checkBudget(metric);
  }

  /**
   * Time an async function
   */
  async time<T>(name: string, fn: () => Promise<T>, metadata?: Record<string, unknown>): Promise<T> {
    this.mark(name);
    try {
      const result = await fn();
      this.measure(name, name, metadata);
      return result;
    } catch (error) {
      this.measure(name, name, { ...metadata, error: true });
      throw error;
    }
  }

  /**
   * Time a sync function
   */
  timeSync<T>(name: string, fn: () => T, metadata?: Record<string, unknown>): T {
    this.mark(name);
    try {
      const result = fn();
      this.measure(name, name, metadata);
      return result;
    } catch (error) {
      this.measure(name, name, { ...metadata, error: true });
      throw error;
    }
  }

  /**
   * Record startup timing
   */
  recordStartupPhase(phase: keyof StartupTiming, duration: number): void {
    this.startupTiming[phase] = duration;

    if (phase === 'total') {
      logger.info(`Startup completed in ${duration.toFixed(2)}ms`);

      if (duration > this.budget.maxBootTime) {
        logger.warn(`Startup exceeded budget: ${duration.toFixed(0)}ms > ${this.budget.maxBootTime}ms`);
      }
    }
  }

  /**
   * Get startup timing breakdown
   */
  getStartupTiming(): Partial<StartupTiming> {
    return { ...this.startupTiming };
  }

  /**
   * Take a memory snapshot
   */
  snapshotMemory(): MemorySnapshot {
    const snapshot: MemorySnapshot = {
      timestamp: Date.now(),
    };

    // Use Performance Memory API if available (Chrome only)
    const perf = performance as Performance & {
      memory?: {
        totalJSHeapSize: number;
        usedJSHeapSize: number;
        jsHeapSizeLimit: number;
      };
    };

    if (perf.memory) {
      snapshot.totalJSHeapSize = perf.memory.totalJSHeapSize;
      snapshot.usedJSHeapSize = perf.memory.usedJSHeapSize;
      snapshot.jsHeapSizeLimit = perf.memory.jsHeapSizeLimit;
    }

    this.memorySnapshots.push(snapshot);

    // Keep only last 100 snapshots
    if (this.memorySnapshots.length > 100) {
      this.memorySnapshots.shift();
    }

    return snapshot;
  }

  /**
   * Start periodic memory monitoring
   */
  startMemoryMonitoring(intervalMs = 5000): void {
    if (this.memoryInterval) {
      return;
    }

    this.memoryInterval = setInterval(() => {
      const snapshot = this.snapshotMemory();

      if (snapshot.usedJSHeapSize && snapshot.usedJSHeapSize > this.budget.maxMemoryUsage) {
        logger.warn(
          `Memory usage exceeded budget: ${(snapshot.usedJSHeapSize / 1024 / 1024).toFixed(1)}MB > ` +
          `${(this.budget.maxMemoryUsage / 1024 / 1024).toFixed(1)}MB`
        );
      }
    }, intervalMs);
  }

  /**
   * Stop memory monitoring
   */
  stopMemoryMonitoring(): void {
    if (this.memoryInterval) {
      clearInterval(this.memoryInterval);
      this.memoryInterval = null;
    }
  }

  /**
   * Get memory snapshots
   */
  getMemorySnapshots(): MemorySnapshot[] {
    return [...this.memorySnapshots];
  }

  /**
   * Get current memory usage
   */
  getCurrentMemory(): MemorySnapshot | null {
    return this.memorySnapshots[this.memorySnapshots.length - 1] || null;
  }

  /**
   * Record build metrics
   */
  recordBuildMetrics(metrics: BuildMetrics): void {
    this.record('build:total', metrics.totalTime, {
      transformTime: metrics.transformTime,
      bundleTime: metrics.bundleTime,
      moduleCount: metrics.moduleCount,
      outputSize: metrics.outputSize,
    });

    if (metrics.totalTime > this.budget.maxBuildTime) {
      logger.warn(`Build exceeded budget: ${metrics.totalTime.toFixed(0)}ms > ${this.budget.maxBuildTime}ms`);
    }

    if (metrics.outputSize > this.budget.maxBundleSize) {
      logger.warn(
        `Bundle size exceeded budget: ${(metrics.outputSize / 1024).toFixed(1)}KB > ` +
        `${(this.budget.maxBundleSize / 1024).toFixed(1)}KB`
      );
    }
  }

  /**
   * Check metric against budget
   */
  private checkBudget(metric: PerformanceMetric): void {
    const violations: BudgetViolation[] = [];

    if (metric.name === 'boot' && metric.duration > this.budget.maxBootTime) {
      violations.push({
        metric: 'bootTime',
        actual: metric.duration,
        limit: this.budget.maxBootTime,
        severity: metric.duration > this.budget.maxBootTime * 1.5 ? 'error' : 'warning',
      });
    }

    if (metric.name.startsWith('build') && metric.duration > this.budget.maxBuildTime) {
      violations.push({
        metric: 'buildTime',
        actual: metric.duration,
        limit: this.budget.maxBuildTime,
        severity: metric.duration > this.budget.maxBuildTime * 1.5 ? 'error' : 'warning',
      });
    }

    violations.forEach(v => {
      const level = v.severity === 'error' ? 'error' : 'warn';
      logger[level](`Budget violation: ${v.metric} = ${v.actual.toFixed(0)}ms (limit: ${v.limit}ms)`);
    });
  }

  /**
   * Subscribe to metric events
   */
  subscribe(callback: (metric: PerformanceMetric) => void): () => void {
    this.observers.add(callback);
    return () => this.observers.delete(callback);
  }

  /**
   * Get all recorded metrics
   */
  getMetrics(): PerformanceMetric[] {
    return [...this.metrics];
  }

  /**
   * Get metrics by name
   */
  getMetricsByName(name: string): PerformanceMetric[] {
    return this.metrics.filter(m => m.name === name);
  }

  /**
   * Get average duration for a metric
   */
  getAverageDuration(name: string): number {
    const metrics = this.getMetricsByName(name);
    if (metrics.length === 0) return 0;

    const total = metrics.reduce((sum, m) => sum + m.duration, 0);
    return total / metrics.length;
  }

  /**
   * Get percentile duration for a metric
   */
  getPercentile(name: string, percentile: number): number {
    const metrics = this.getMetricsByName(name);
    if (metrics.length === 0) return 0;

    const sorted = metrics.map(m => m.duration).sort((a, b) => a - b);
    const index = Math.ceil((percentile / 100) * sorted.length) - 1;
    return sorted[Math.max(0, index)];
  }

  /**
   * Generate performance report
   */
  generateReport(): Record<string, unknown> {
    const memory = this.getCurrentMemory();

    return {
      startup: this.startupTiming,
      metrics: {
        count: this.metrics.length,
        byName: this.getMetricsSummary(),
      },
      memory: memory ? {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
        limit: memory.jsHeapSizeLimit,
      } : null,
      budget: this.budget,
    };
  }

  /**
   * Get metrics summary grouped by name
   */
  private getMetricsSummary(): Record<string, { count: number; avg: number; p50: number; p95: number }> {
    const names = [...new Set(this.metrics.map(m => m.name))];
    const summary: Record<string, { count: number; avg: number; p50: number; p95: number }> = {};

    for (const name of names) {
      const metrics = this.getMetricsByName(name);
      summary[name] = {
        count: metrics.length,
        avg: this.getAverageDuration(name),
        p50: this.getPercentile(name, 50),
        p95: this.getPercentile(name, 95),
      };
    }

    return summary;
  }

  /**
   * Clear all metrics
   */
  clear(): void {
    this.metrics = [];
    this.marks.clear();
    this.memorySnapshots = [];
    this.startupTiming = {};
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.stopMemoryMonitoring();
    this.observers.clear();
    this.clear();
  }
}

/**
 * Global performance monitor instance
 */
let globalMonitor: PerformanceMonitor | null = null;

/**
 * Get or create global performance monitor
 */
export function getPerformanceMonitor(): PerformanceMonitor {
  if (!globalMonitor) {
    globalMonitor = new PerformanceMonitor();
  }
  return globalMonitor;
}

/**
 * Create a new performance monitor
 */
export function createPerformanceMonitor(budget?: Partial<PerformanceBudget>): PerformanceMonitor {
  return new PerformanceMonitor(budget);
}

export default PerformanceMonitor;
