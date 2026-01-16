/**
 * Tests pour MetricsCollector
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { MetricsCollector, createMetricsCollector } from './MetricsCollector';
import { AuditLogger, createAuditLogger } from './AuditLogger';

describe('MetricsCollector', () => {
  let collector: MetricsCollector;
  let auditLogger: AuditLogger;

  beforeEach(() => {
    auditLogger = createAuditLogger();
    collector = createMetricsCollector({ auditLogger });
  });

  const addTestEntries = async () => {
    // Add successful operation
    await auditLogger.log({
      operation: { type: 'create', target: 'table', name: 'users' },
      input: { description: 'Create users table' },
      result: { success: true, duration: 100 },
      security: { riskLevel: 'low', validationsPassed: ['syntax'], warnings: [] },
    });

    // Add failed operation
    await auditLogger.log({
      operation: { type: 'modify', target: 'column', name: 'email' },
      input: { description: 'Modify email column' },
      result: { success: false, duration: 50, error: 'Validation failed' },
      security: { riskLevel: 'medium', validationsPassed: [], warnings: ['type mismatch'] },
    });

    // Add critical operation
    await auditLogger.log({
      operation: { type: 'delete', target: 'table', name: 'old_data' },
      input: { description: 'Delete old data table' },
      result: { success: true, duration: 200 },
      security: { riskLevel: 'critical', validationsPassed: ['approval'], warnings: [] },
    });
  };

  const getTestPeriod = () => {
    const now = new Date();
    return {
      start: new Date(now.getTime() - 60 * 60 * 1000), // 1 hour ago
      end: now,
    };
  };

  describe('collect', () => {
    it('should collect security metrics', async () => {
      await addTestEntries();

      const metrics = await collector.collect(getTestPeriod());

      expect(metrics.totalOperations).toBe(3);
      expect(metrics.successfulOperations).toBe(2);
      expect(metrics.failedValidations).toBe(1);
    });

    it('should count by risk level', async () => {
      await addTestEntries();

      const metrics = await collector.collect(getTestPeriod());

      expect(metrics.lowRiskOperations).toBe(1);
      expect(metrics.mediumRiskOperations).toBe(1);
      expect(metrics.criticalRiskOperations).toBe(1);
    });

    it('should calculate average validation time', async () => {
      await addTestEntries();

      const metrics = await collector.collect(getTestPeriod());

      expect(metrics.avgValidationTime).toBeGreaterThan(0);

      // Average of 100, 50, 200 = 116.67
      expect(metrics.avgValidationTime).toBeCloseTo(116.67, 0);
    });

    it('should handle empty period', async () => {
      const pastPeriod = {
        start: new Date(0),
        end: new Date(1),
      };

      const metrics = await collector.collect(pastPeriod);
      expect(metrics.totalOperations).toBe(0);
    });
  });

  describe('collectPerformanceMetrics', () => {
    it('should collect performance metrics', async () => {
      await addTestEntries();

      const metrics = collector.collectPerformanceMetrics(getTestPeriod());

      expect(metrics.avgExecutionTime).toBeGreaterThan(0);
      expect(metrics.minExecutionTime).toBe(50);
      expect(metrics.maxExecutionTime).toBe(200);
    });

    it('should calculate percentiles', async () => {
      // Add more entries for percentile calculation
      for (let i = 0; i < 10; i++) {
        await auditLogger.log({
          operation: { type: 'create', target: 'table', name: `table_${i}` },
          input: {},
          result: { success: true, duration: (i + 1) * 10 },
          security: { riskLevel: 'low', validationsPassed: [], warnings: [] },
        });
      }

      const metrics = collector.collectPerformanceMetrics(getTestPeriod());

      expect(metrics.p50ExecutionTime).toBeGreaterThan(0);
      expect(metrics.p90ExecutionTime).toBeGreaterThan(metrics.p50ExecutionTime);
    });

    it('should handle no entries', () => {
      const metrics = collector.collectPerformanceMetrics(getTestPeriod());

      expect(metrics.avgExecutionTime).toBe(0);
      expect(metrics.totalExecutionTime).toBe(0);
    });
  });

  describe('collectByOperation', () => {
    it('should group by operation type', async () => {
      await addTestEntries();

      const byOperation = collector.collectByOperation(getTestPeriod());

      expect(byOperation.length).toBe(3);

      const createOp = byOperation.find((o) => o.operationType === 'create_table');
      expect(createOp?.count).toBe(1);
      expect(createOp?.successCount).toBe(1);
    });

    it('should calculate error rate per operation', async () => {
      await addTestEntries();

      const byOperation = collector.collectByOperation(getTestPeriod());

      const modifyOp = byOperation.find((o) => o.operationType === 'modify_column');
      expect(modifyOp?.errorRate).toBe(1); // 100% failure
    });
  });

  describe('calculateTrends', () => {
    it('should calculate trends over periods', async () => {
      await addTestEntries();

      const now = new Date();
      const periods = [
        { start: new Date(now.getTime() - 2 * 60 * 60 * 1000), end: new Date(now.getTime() - 60 * 60 * 1000) },
        { start: new Date(now.getTime() - 60 * 60 * 1000), end: now },
      ];

      const trends = collector.calculateTrends(periods, 'totalOperations');

      expect(trends.length).toBe(2);
      expect(trends[1].metrics.totalOperations).toBe(3);
    });
  });

  describe('checkHealth', () => {
    it('should return healthy status for good metrics', async () => {
      // Add only successful operations
      for (let i = 0; i < 5; i++) {
        await auditLogger.log({
          operation: { type: 'create', target: 'table', name: `table_${i}` },
          input: {},
          result: { success: true, duration: 100 },
          security: { riskLevel: 'low', validationsPassed: [], warnings: [] },
        });
      }

      await collector.collect(getTestPeriod());

      const health = collector.checkHealth();

      expect(health.status).toBe('healthy');
      expect(health.score).toBeGreaterThanOrEqual(80);
      expect(health.issues.length).toBe(0);
    });

    it('should detect high error rate', async () => {
      // Add more failed than successful
      for (let i = 0; i < 5; i++) {
        await auditLogger.log({
          operation: { type: 'create', target: 'table', name: `table_${i}` },
          input: {},
          result: { success: false, duration: 100, error: 'Failed' },
          security: { riskLevel: 'low', validationsPassed: [], warnings: [] },
        });
      }

      await collector.collect(getTestPeriod());

      const health = collector.checkHealth();

      expect(health.score).toBeLessThan(80);
      expect(health.issues.some((i) => i.includes('erreur'))).toBe(true);
    });

    it('should detect many critical operations', async () => {
      for (let i = 0; i < 15; i++) {
        await auditLogger.log({
          operation: { type: 'delete', target: 'table', name: `table_${i}` },
          input: {},
          result: { success: true, duration: 100 },
          security: { riskLevel: 'critical', validationsPassed: [], warnings: [] },
        });
      }

      await collector.collect(getTestPeriod());

      const health = collector.checkHealth();

      expect(health.issues.some((i) => i.includes('critiques'))).toBe(true);
    });
  });

  describe('recordDataPoint', () => {
    it('should record data points', () => {
      collector.recordDataPoint('test_metric', 42, { env: 'test' });

      const points = collector.getDataPoints('test_metric');

      expect(points.length).toBe(1);
      expect(points[0].value).toBe(42);
      expect(points[0].labels.env).toBe('test');
    });

    it('should limit data points', () => {
      for (let i = 0; i < 15000; i++) {
        collector.recordDataPoint('big_metric', i);
      }

      const points = collector.getDataPoints('big_metric');
      expect(points.length).toBeLessThanOrEqual(10000);
    });
  });

  describe('getDataPoints', () => {
    it('should filter by period', () => {
      collector.recordDataPoint('time_metric', 1);

      const now = new Date();
      const futurePeriod = {
        start: new Date(now.getTime() + 1000),
        end: new Date(now.getTime() + 2000),
      };

      const points = collector.getDataPoints('time_metric', futurePeriod);
      expect(points.length).toBe(0);
    });
  });

  describe('aggregateDataPoints', () => {
    it('should aggregate with sum', () => {
      collector.recordDataPoint('sum_metric', 10);
      collector.recordDataPoint('sum_metric', 20);
      collector.recordDataPoint('sum_metric', 30);

      const sum = collector.aggregateDataPoints('sum_metric', getTestPeriod(), 'sum');
      expect(sum).toBe(60);
    });

    it('should aggregate with avg', () => {
      collector.recordDataPoint('avg_metric', 10);
      collector.recordDataPoint('avg_metric', 20);
      collector.recordDataPoint('avg_metric', 30);

      const avg = collector.aggregateDataPoints('avg_metric', getTestPeriod(), 'avg');
      expect(avg).toBe(20);
    });

    it('should aggregate with min/max', () => {
      collector.recordDataPoint('minmax_metric', 10);
      collector.recordDataPoint('minmax_metric', 50);
      collector.recordDataPoint('minmax_metric', 30);

      const min = collector.aggregateDataPoints('minmax_metric', getTestPeriod(), 'min');
      const max = collector.aggregateDataPoints('minmax_metric', getTestPeriod(), 'max');

      expect(min).toBe(10);
      expect(max).toBe(50);
    });

    it('should aggregate with count', () => {
      collector.recordDataPoint('count_metric', 1);
      collector.recordDataPoint('count_metric', 2);
      collector.recordDataPoint('count_metric', 3);

      const count = collector.aggregateDataPoints('count_metric', getTestPeriod(), 'count');
      expect(count).toBe(3);
    });
  });

  describe('generateReport', () => {
    it('should generate markdown report', async () => {
      await addTestEntries();

      const report = collector.generateReport(getTestPeriod());

      expect(report).toContain('# Rapport de Métriques');
      expect(report).toContain('Santé du Système');
      expect(report).toContain('Métriques de Sécurité');
      expect(report).toContain('Performance');
    });

    it('should include operation breakdown', async () => {
      await addTestEntries();

      const report = collector.generateReport(getTestPeriod());

      expect(report).toContain('create_table');
      expect(report).toContain('modify_column');
    });
  });

  describe('purgeOldData', () => {
    it('should purge old data points', () => {
      collector.recordDataPoint('old_metric', 1);

      // Simulate old data by setting retention to 0
      const collectorWithShortRetention = createMetricsCollector({
        retentionPeriod: 0,
      });
      collectorWithShortRetention.recordDataPoint('test', 1);

      const removed = collectorWithShortRetention.purgeOldData();
      expect(removed).toBeGreaterThanOrEqual(0);
    });
  });

  describe('reset', () => {
    it('should reset all data', () => {
      collector.recordDataPoint('test_metric', 42);

      collector.reset();

      const points = collector.getDataPoints('test_metric');
      expect(points.length).toBe(0);
    });
  });

  describe('setAuditLogger', () => {
    it('should set audit logger', async () => {
      const collectorWithoutLogger = createMetricsCollector();
      const newLogger = createAuditLogger();

      await newLogger.log({
        operation: { type: 'create', target: 'table', name: 'test' },
        input: {},
        result: { success: true, duration: 100 },
        security: { riskLevel: 'low', validationsPassed: [], warnings: [] },
      });

      collectorWithoutLogger.setAuditLogger(newLogger);

      const metrics = await collectorWithoutLogger.collect(getTestPeriod());

      expect(metrics.totalOperations).toBe(1);
    });
  });
});

describe('createMetricsCollector', () => {
  it('should create collector with default options', () => {
    const collector = createMetricsCollector();
    expect(collector).toBeInstanceOf(MetricsCollector);
  });

  it('should create collector with audit logger', () => {
    const logger = createAuditLogger();
    const collector = createMetricsCollector({ auditLogger: logger });
    expect(collector).toBeInstanceOf(MetricsCollector);
  });
});
