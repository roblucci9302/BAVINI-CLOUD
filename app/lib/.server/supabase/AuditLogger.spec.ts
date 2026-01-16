/**
 * Tests pour AuditLogger
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AuditLogger, createAuditLogger } from './AuditLogger';
import type { AuditEntry } from './types';

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = createAuditLogger();
  });

  const createTestEntry = () => ({
    operation: {
      type: 'create' as const,
      target: 'table' as const,
      name: 'users',
    },
    input: {
      description: 'Create users table',
      sql: 'CREATE TABLE users (id uuid PRIMARY KEY);',
    },
    result: {
      success: true,
      duration: 100,
      affectedRows: 1,
    },
    security: {
      riskLevel: 'low' as const,
      validationsPassed: ['syntax', 'structure'],
      warnings: [],
    },
  });

  describe('log', () => {
    it('should create audit entry', async () => {
      const entry = await logger.log(createTestEntry());

      expect(entry.id).toBeDefined();
      expect(entry.timestamp).toBeInstanceOf(Date);
      expect(entry.sessionId).toBeDefined();
      expect(entry.operation.type).toBe('create');
      expect(entry.operation.target).toBe('table');
    });

    it('should include user ID if provided', async () => {
      const entry = await logger.log({
        ...createTestEntry(),
        userId: 'user_123',
      });

      expect(entry.userId).toBe('user_123');
    });

    it('should use persist function if provided', async () => {
      let persisted: AuditEntry | null = null as AuditEntry | null;
      const persistFn = async (entry: AuditEntry) => {
        persisted = entry;
      };

      const loggerWithPersist = createAuditLogger({ persistFn });
      await loggerWithPersist.log(createTestEntry());

      expect(persisted).not.toBeNull();
      expect(persisted?.operation.type).toBe('create');
    });

    it('should respect max entries limit', async () => {
      const loggerWithLimit = createAuditLogger({ maxEntries: 5 });

      for (let i = 0; i < 10; i++) {
        await loggerWithLimit.log(createTestEntry());
      }

      const entries = loggerWithLimit.getHistory();
      expect(entries.length).toBeLessThanOrEqual(5);
    });
  });

  describe('startOperation / endOperation', () => {
    it('should track operation timing', async () => {
      const { entryId, startTime } = logger.startOperation({
        operation: {
          type: 'create',
          target: 'table',
          name: 'users',
        },
        input: { description: 'Create table' },
        security: {
          riskLevel: 'low',
          warnings: [],
        },
      });

      // Simulate some work
      await new Promise((resolve) => setTimeout(resolve, 10));

      const entry = await logger.endOperation({
        entryId,
        startTime,
        operation: {
          type: 'create',
          target: 'table',
          name: 'users',
        },
        input: { description: 'Create table' },
        success: true,
        security: {
          riskLevel: 'low',
          validationsPassed: ['syntax'],
          warnings: [],
        },
      });

      expect(entry.result.duration).toBeGreaterThan(0);
    });
  });

  describe('getHistory', () => {
    it('should return all entries', async () => {
      await logger.log(createTestEntry());
      await logger.log(createTestEntry());

      const entries = logger.getHistory();
      expect(entries.length).toBe(2);
    });

    it('should filter by date range', async () => {
      const entry1 = await logger.log(createTestEntry());
      await new Promise((resolve) => setTimeout(resolve, 10));

      const entry2 = await logger.log(createTestEntry());

      const entries = logger.getHistory({
        startDate: entry2.timestamp,
      });

      expect(entries.length).toBe(1);
    });

    it('should filter by operation type', async () => {
      await logger.log(createTestEntry());
      await logger.log({
        ...createTestEntry(),
        operation: { type: 'delete', target: 'table', name: 'posts' },
      });

      const entries = logger.getHistory({ operationType: 'create' });
      expect(entries.length).toBe(1);
      expect(entries[0].operation.type).toBe('create');
    });

    it('should filter by success', async () => {
      await logger.log(createTestEntry());
      await logger.log({
        ...createTestEntry(),
        result: { success: false, duration: 50, error: 'Failed' },
      });

      const successEntries = logger.getHistory({ success: true });
      expect(successEntries.length).toBe(1);
    });

    it('should filter by risk level', async () => {
      await logger.log(createTestEntry());
      await logger.log({
        ...createTestEntry(),
        security: { riskLevel: 'critical', validationsPassed: [], warnings: [] },
      });

      const criticalEntries = logger.getHistory({ riskLevel: 'critical' });
      expect(criticalEntries.length).toBe(1);
    });
  });

  describe('getEntry', () => {
    it('should get entry by ID', async () => {
      const created = await logger.log(createTestEntry());
      const retrieved = logger.getEntry(created.id);

      expect(retrieved).toBeDefined();
      expect(retrieved?.id).toBe(created.id);
    });

    it('should return undefined for non-existent entry', () => {
      const entry = logger.getEntry('non_existent');
      expect(entry).toBeUndefined();
    });
  });

  describe('getSessionEntries', () => {
    it('should get entries for current session', async () => {
      await logger.log(createTestEntry());
      await logger.log(createTestEntry());

      const entries = logger.getSessionEntries();
      expect(entries.length).toBe(2);
    });

    it('should filter by session ID', async () => {
      const logger1 = createAuditLogger({ sessionId: 'session1' });
      const logger2 = createAuditLogger({ sessionId: 'session2' });

      await logger1.log(createTestEntry());
      await logger2.log(createTestEntry());

      const entries1 = logger1.getSessionEntries('session1');
      expect(entries1.length).toBe(1);
    });
  });

  describe('exportAuditTrail', () => {
    it('should export as JSON', async () => {
      await logger.log(createTestEntry());

      const now = new Date();
      const export_ = logger.exportAuditTrail(new Date(now.getTime() - 60000), now, { format: 'json' });

      const parsed = JSON.parse(export_);
      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(1);
    });

    it('should export as CSV', async () => {
      await logger.log(createTestEntry());

      const now = new Date();
      const export_ = logger.exportAuditTrail(new Date(now.getTime() - 60000), now, { format: 'csv' });

      expect(export_).toContain('ID,Timestamp');
      expect(export_).toContain('create');
    });

    it('should export as Markdown', async () => {
      await logger.log(createTestEntry());

      const now = new Date();
      const export_ = logger.exportAuditTrail(new Date(now.getTime() - 60000), now, { format: 'markdown' });

      expect(export_).toContain('# Audit Trail Report');
      expect(export_).toContain('create table');
    });
  });

  describe('getStatistics', () => {
    it('should return statistics', async () => {
      await logger.log(createTestEntry());
      await logger.log({
        ...createTestEntry(),
        result: { success: false, duration: 50 },
      });

      const stats = logger.getStatistics();

      expect(stats.total).toBe(2);
      expect(stats.successful).toBe(1);
      expect(stats.failed).toBe(1);
      expect(stats.avgDuration).toBeGreaterThan(0);
    });

    it('should calculate by operation', async () => {
      await logger.log(createTestEntry());
      await logger.log({
        ...createTestEntry(),
        operation: { type: 'delete', target: 'table', name: 'posts' },
      });

      const stats = logger.getStatistics();
      expect(stats.byOperation.create_table).toBe(1);
      expect(stats.byOperation.delete_table).toBe(1);
    });

    it('should calculate by risk level', async () => {
      await logger.log(createTestEntry());
      await logger.log({
        ...createTestEntry(),
        security: { riskLevel: 'high', validationsPassed: [], warnings: [] },
      });

      const stats = logger.getStatistics();
      expect(stats.byRiskLevel.low).toBe(1);
      expect(stats.byRiskLevel.high).toBe(1);
    });
  });

  describe('search', () => {
    it('should search by operation name', async () => {
      await logger.log({
        ...createTestEntry(),
        input: { description: 'Create table', sql: 'CREATE TABLE test (id uuid);' },
      });
      await logger.log({
        ...createTestEntry(),
        operation: { type: 'create', target: 'table', name: 'posts' },
        input: { description: 'Create posts', sql: 'CREATE TABLE posts (id uuid);' },
      });

      const results = logger.search('users');
      expect(results.length).toBe(1);
      expect(results[0].operation.name).toBe('users');
    });

    it('should search in SQL', async () => {
      await logger.log(createTestEntry());

      const results = logger.search('PRIMARY KEY');
      expect(results.length).toBe(1);
    });

    it('should search in description', async () => {
      await logger.log({
        ...createTestEntry(),
        input: { description: 'Create users table for auth' },
      });

      const results = logger.search('auth');
      expect(results.length).toBe(1);
    });
  });

  describe('getRecent', () => {
    it('should get recent entries', async () => {
      for (let i = 0; i < 5; i++) {
        await logger.log({
          ...createTestEntry(),
          operation: { type: 'create', target: 'table', name: `table_${i}` },
        });
      }

      const recent = logger.getRecent(3);
      expect(recent.length).toBe(3);
      expect(recent[0].operation.name).toBe('table_4'); // Most recent first
    });
  });

  describe('getRecentErrors', () => {
    it('should get recent errors', async () => {
      await logger.log(createTestEntry());
      await logger.log({
        ...createTestEntry(),
        result: { success: false, duration: 50, error: 'Error 1' },
      });
      await logger.log({
        ...createTestEntry(),
        result: { success: false, duration: 50, error: 'Error 2' },
      });

      const errors = logger.getRecentErrors();
      expect(errors.length).toBe(2);
      expect(errors[0].result.error).toBe('Error 2');
    });
  });

  describe('getCriticalOperations', () => {
    it('should get critical operations', async () => {
      await logger.log(createTestEntry());
      await logger.log({
        ...createTestEntry(),
        security: { riskLevel: 'critical', validationsPassed: [], warnings: [] },
      });

      const critical = logger.getCriticalOperations();
      expect(critical.length).toBe(1);
      expect(critical[0].security.riskLevel).toBe('critical');
    });
  });

  describe('purge', () => {
    it('should purge old entries', async () => {
      await logger.log(createTestEntry());
      await new Promise((resolve) => setTimeout(resolve, 10));

      const removedCount = logger.purge(new Date());
      expect(removedCount).toBe(1);
      expect(logger.count()).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      await logger.log(createTestEntry());
      await logger.log(createTestEntry());

      logger.clear();
      expect(logger.count()).toBe(0);
    });
  });

  describe('session management', () => {
    it('should set and get session ID', () => {
      logger.setSessionId('new_session');
      expect(logger.getSessionId()).toBe('new_session');
    });
  });
});

describe('createAuditLogger', () => {
  it('should create logger with default options', () => {
    const logger = createAuditLogger();
    expect(logger).toBeInstanceOf(AuditLogger);
  });

  it('should create logger with custom session ID', () => {
    const logger = createAuditLogger({ sessionId: 'custom_session' });
    expect(logger.getSessionId()).toBe('custom_session');
  });
});
