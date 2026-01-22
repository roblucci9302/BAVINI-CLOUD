/**
 * =============================================================================
 * BAVINI Performance - Performance Monitor Tests
 * =============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  PerformanceMonitor,
  getPerformanceMonitor,
  createPerformanceMonitor,
} from '../performance-monitor';

describe('PerformanceMonitor', () => {
  let monitor: PerformanceMonitor;

  beforeEach(() => {
    monitor = new PerformanceMonitor();
  });

  afterEach(() => {
    monitor.destroy();
  });

  describe('mark and measure', () => {
    it('should record a metric between mark and measure', () => {
      monitor.mark('test-operation');

      // Simulate some work
      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(0);

      const metric = monitor.measure('test-operation');

      expect(metric.name).toBe('test-operation');
      expect(metric.duration).toBeGreaterThanOrEqual(0);
      expect(metric.startTime).toBeGreaterThan(0);
    });

    it('should support metadata in measure', () => {
      monitor.mark('with-metadata');
      const metric = monitor.measure('with-metadata', undefined, { foo: 'bar' });

      expect(metric.metadata).toEqual({ foo: 'bar' });
    });

    it('should use different start mark if provided', () => {
      monitor.mark('start-mark');
      const metric = monitor.measure('result-metric', 'start-mark');

      expect(metric.name).toBe('result-metric');
    });

    it('should handle missing start mark gracefully', () => {
      const metric = monitor.measure('no-mark');

      expect(metric.duration).toBe(0);
    });

    it('should clean up mark after measure', () => {
      monitor.mark('cleanup-test');
      monitor.measure('cleanup-test');

      // Second measure should have no mark
      const metric = monitor.measure('cleanup-test');
      expect(metric.duration).toBe(0);
    });
  });

  describe('record', () => {
    it('should record a metric directly', () => {
      monitor.record('direct-metric', 100, { type: 'test' });

      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].name).toBe('direct-metric');
      expect(metrics[0].duration).toBe(100);
      expect(metrics[0].metadata).toEqual({ type: 'test' });
    });
  });

  describe('time', () => {
    it('should time an async function', async () => {
      const result = await monitor.time('async-op', async () => {
        await new Promise(resolve => setTimeout(resolve, 10));
        return 'done';
      });

      expect(result).toBe('done');

      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(1);
      expect(metrics[0].duration).toBeGreaterThanOrEqual(10);
    });

    it('should record error flag when function throws', async () => {
      await expect(
        monitor.time('failing-op', async () => {
          throw new Error('test error');
        })
      ).rejects.toThrow('test error');

      const metrics = monitor.getMetrics();
      expect(metrics[0].metadata?.error).toBe(true);
    });
  });

  describe('timeSync', () => {
    it('should time a sync function', () => {
      const result = monitor.timeSync('sync-op', () => {
        let sum = 0;
        for (let i = 0; i < 1000; i++) sum += i;
        return sum;
      });

      expect(result).toBe(499500);

      const metrics = monitor.getMetrics();
      expect(metrics).toHaveLength(1);
    });

    it('should record error flag when sync function throws', () => {
      expect(() =>
        monitor.timeSync('failing-sync', () => {
          throw new Error('sync error');
        })
      ).toThrow('sync error');

      const metrics = monitor.getMetrics();
      expect(metrics[0].metadata?.error).toBe(true);
    });
  });

  describe('startup timing', () => {
    it('should record startup phases', () => {
      monitor.recordStartupPhase('wasmLoad', 100);
      monitor.recordStartupPhase('workerInit', 50);
      monitor.recordStartupPhase('filesystemInit', 30);

      const timing = monitor.getStartupTiming();
      expect(timing.wasmLoad).toBe(100);
      expect(timing.workerInit).toBe(50);
      expect(timing.filesystemInit).toBe(30);
    });

    it('should log total startup time', () => {
      monitor.recordStartupPhase('total', 500);

      const timing = monitor.getStartupTiming();
      expect(timing.total).toBe(500);
    });
  });

  describe('memory snapshots', () => {
    it('should take memory snapshots', () => {
      const snapshot = monitor.snapshotMemory();

      expect(snapshot.timestamp).toBeGreaterThan(0);
    });

    it('should limit snapshots to 100', () => {
      for (let i = 0; i < 110; i++) {
        monitor.snapshotMemory();
      }

      const snapshots = monitor.getMemorySnapshots();
      expect(snapshots).toHaveLength(100);
    });

    it('should get current memory', () => {
      monitor.snapshotMemory();
      const current = monitor.getCurrentMemory();

      expect(current).not.toBeNull();
      expect(current?.timestamp).toBeGreaterThan(0);
    });

    it('should return null when no snapshots', () => {
      const current = monitor.getCurrentMemory();
      expect(current).toBeNull();
    });
  });

  describe('memory monitoring', () => {
    it('should start and stop memory monitoring', () => {
      vi.useFakeTimers();

      monitor.startMemoryMonitoring(1000);

      // Should not throw when starting twice
      monitor.startMemoryMonitoring(1000);

      vi.advanceTimersByTime(3000);

      const snapshots = monitor.getMemorySnapshots();
      expect(snapshots.length).toBeGreaterThanOrEqual(3);

      monitor.stopMemoryMonitoring();

      vi.useRealTimers();
    });
  });

  describe('build metrics', () => {
    it('should record build metrics', () => {
      monitor.recordBuildMetrics({
        totalTime: 1000,
        transformTime: 400,
        bundleTime: 600,
        moduleCount: 50,
        outputSize: 100000,
      });

      const metrics = monitor.getMetrics();
      expect(metrics.some(m => m.name === 'build:total')).toBe(true);
    });
  });

  describe('statistics', () => {
    it('should calculate average duration', () => {
      monitor.record('test', 100);
      monitor.record('test', 200);
      monitor.record('test', 300);

      expect(monitor.getAverageDuration('test')).toBe(200);
    });

    it('should return 0 for unknown metric', () => {
      expect(monitor.getAverageDuration('unknown')).toBe(0);
    });

    it('should calculate percentiles', () => {
      for (let i = 1; i <= 100; i++) {
        monitor.record('percentile-test', i);
      }

      expect(monitor.getPercentile('percentile-test', 50)).toBe(50);
      expect(monitor.getPercentile('percentile-test', 95)).toBe(95);
    });

    it('should return 0 for unknown metric percentile', () => {
      expect(monitor.getPercentile('unknown', 50)).toBe(0);
    });
  });

  describe('subscribe', () => {
    it('should notify subscribers on new metric', () => {
      const callback = vi.fn();
      monitor.subscribe(callback);

      monitor.record('subscribed-metric', 50);

      expect(callback).toHaveBeenCalledWith(
        expect.objectContaining({ name: 'subscribed-metric' })
      );
    });

    it('should allow unsubscribe', () => {
      const callback = vi.fn();
      const unsubscribe = monitor.subscribe(callback);

      unsubscribe();
      monitor.record('after-unsub', 50);

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('generateReport', () => {
    it('should generate a complete report', () => {
      monitor.record('test-metric', 100);
      monitor.recordStartupPhase('total', 500);
      monitor.snapshotMemory();

      const report = monitor.generateReport();

      expect(report.startup).toBeDefined();
      expect(report.metrics).toBeDefined();
      expect(report.budget).toBeDefined();
    });
  });

  describe('clear', () => {
    it('should clear all data', () => {
      monitor.record('metric', 100);
      monitor.mark('mark');
      monitor.snapshotMemory();
      monitor.recordStartupPhase('total', 500);

      monitor.clear();

      expect(monitor.getMetrics()).toHaveLength(0);
      expect(monitor.getMemorySnapshots()).toHaveLength(0);
      expect(monitor.getStartupTiming()).toEqual({});
    });
  });

  describe('global instance', () => {
    it('should return same global instance', () => {
      const instance1 = getPerformanceMonitor();
      const instance2 = getPerformanceMonitor();

      expect(instance1).toBe(instance2);
    });

    it('should create new instance with factory', () => {
      const custom = createPerformanceMonitor({ maxBootTime: 1000 });
      const global = getPerformanceMonitor();

      expect(custom).not.toBe(global);
    });
  });
});
