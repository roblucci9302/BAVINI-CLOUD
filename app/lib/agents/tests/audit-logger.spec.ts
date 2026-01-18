/**
 * Tests pour l'Audit Logger
 *
 * @module agents/tests/audit-logger.spec
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  AuditLogger,
  createAuditLogger,
  getGlobalAuditLogger,
  resetGlobalAuditLogger,
  MemoryAuditStorage,
  auditLogger,
  type AuditEntry,
  type AuditEntryInput,
  type AuditQueryFilter,
} from '../logging/audit-logger';

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

function createTestEntry(overrides: Partial<AuditEntryInput> = {}): AuditEntryInput {
  return {
    type: 'file_operation',
    action: 'write_file',
    agent: 'coder',
    taskId: 'task-123',
    details: { path: '/test/file.ts' },
    outcome: 'success',
    ...overrides,
  };
}

/*
 * ============================================================================
 * AUDIT LOGGER TESTS
 * ============================================================================
 */

describe('AuditLogger', () => {
  let logger: AuditLogger;

  beforeEach(() => {
    logger = createAuditLogger({
      consoleOutput: false, // Disable console output for tests
    });
  });

  afterEach(() => {
    logger.shutdown();
  });

  describe('Basic Logging', () => {
    it('should log an entry and return it', async () => {
      const input = createTestEntry();

      const entry = await logger.log(input);

      expect(entry).not.toBeNull();
      expect(entry!.id).toBeDefined();
      expect(entry!.timestamp).toBeInstanceOf(Date);
      expect(entry!.type).toBe('file_operation');
      expect(entry!.action).toBe('write_file');
      expect(entry!.agent).toBe('coder');
      expect(entry!.taskId).toBe('task-123');
      expect(entry!.outcome).toBe('success');
    });

    it('should not log when disabled', async () => {
      const disabledLogger = createAuditLogger({
        enabled: false,
        consoleOutput: false,
      });

      const entry = await disabledLogger.log(createTestEntry());

      expect(entry).toBeNull();
      expect(await disabledLogger.count()).toBe(0);

      disabledLogger.shutdown();
    });

    it('should respect included types filter', async () => {
      const filteredLogger = createAuditLogger({
        includedTypes: ['security_event'],
        consoleOutput: false,
      });

      await filteredLogger.log(createTestEntry({ type: 'file_operation' }));
      await filteredLogger.log(createTestEntry({ type: 'security_event' }));

      expect(await filteredLogger.count()).toBe(1);

      filteredLogger.shutdown();
    });

    it('should respect excluded types filter', async () => {
      const filteredLogger = createAuditLogger({
        excludedTypes: ['file_operation'],
        consoleOutput: false,
      });

      await filteredLogger.log(createTestEntry({ type: 'file_operation' }));
      await filteredLogger.log(createTestEntry({ type: 'shell_command' }));

      expect(await filteredLogger.count()).toBe(1);

      filteredLogger.shutdown();
    });

    it('should respect minimum severity filter', async () => {
      const filteredLogger = createAuditLogger({
        minSeverity: 'high',
        consoleOutput: false,
      });

      await filteredLogger.log(createTestEntry({ severity: 'low' }));
      await filteredLogger.log(createTestEntry({ severity: 'medium' }));
      await filteredLogger.log(createTestEntry({ severity: 'high' }));
      await filteredLogger.log(createTestEntry({ severity: 'critical' }));

      expect(await filteredLogger.count()).toBe(2);

      filteredLogger.shutdown();
    });
  });

  describe('Specialized Logging Methods', () => {
    it('should log file operations', async () => {
      const entry = await logger.logFileOperation(
        'write_file',
        'coder',
        'task-1',
        { path: '/src/app.ts', size: 1234 },
        'success',
        150,
      );

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('file_operation');
      expect(entry!.action).toBe('write_file');
      expect(entry!.details.path).toBe('/src/app.ts');
      expect(entry!.duration).toBe(150);
    });

    it('should log shell commands', async () => {
      const entry = await logger.logShellCommand('npm install', 'builder', 'task-2', 'success', { exitCode: 0 }, 5000);

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('shell_command');
      expect(entry!.details.command).toBe('npm install');
      expect(entry!.details.exitCode).toBe(0);
    });

    it('should assign high severity to dangerous shell commands', async () => {
      const entry = await logger.logShellCommand('rm -rf /tmp/test', 'builder', 'task-3', 'success');

      expect(entry).not.toBeNull();
      expect(entry!.severity).toBe('critical');
    });

    it('should log git operations', async () => {
      const entry = await logger.logGitOperation(
        'commit',
        'deployer',
        'task-4',
        { message: 'feat: add feature', files: 3 },
        'success',
        200,
      );

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('git_operation');
      expect(entry!.action).toBe('commit');
      expect(entry!.details.message).toBe('feat: add feature');
    });

    it('should log security events', async () => {
      const entry = await logger.logSecurityEvent(
        'secret_detected',
        'coder',
        'task-5',
        { pattern: 'API_KEY', file: 'config.js' },
        'blocked',
        'critical',
      );

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('security_event');
      expect(entry!.severity).toBe('critical');
      expect(entry!.outcome).toBe('blocked');
    });

    it('should log API calls', async () => {
      const entry = await logger.logApiCall('/api/users', 'GET', 'coder', 'task-6', 'success', { statusCode: 200 }, 100);

      expect(entry).not.toBeNull();
      expect(entry!.type).toBe('api_call');
      expect(entry!.action).toBe('GET /api/users');
      expect(entry!.details.statusCode).toBe(200);
    });
  });

  describe('Querying', () => {
    beforeEach(async () => {
      await logger.log(createTestEntry({ type: 'file_operation', outcome: 'success', agent: 'coder' }));
      await logger.log(createTestEntry({ type: 'file_operation', outcome: 'failure', agent: 'coder' }));
      await logger.log(createTestEntry({ type: 'shell_command', outcome: 'success', agent: 'builder' }));
      await logger.log(createTestEntry({ type: 'git_operation', outcome: 'blocked', agent: 'deployer' }));
      await logger.log(createTestEntry({ type: 'security_event', outcome: 'blocked', agent: 'coder' }));
    });

    it('should query all entries', async () => {
      const entries = await logger.query();
      expect(entries.length).toBe(5);
    });

    it('should filter by type', async () => {
      const entries = await logger.query({ type: 'file_operation' });
      expect(entries.length).toBe(2);
    });

    it('should filter by multiple types', async () => {
      const entries = await logger.query({ type: ['file_operation', 'shell_command'] });
      expect(entries.length).toBe(3);
    });

    it('should filter by outcome', async () => {
      const entries = await logger.query({ outcome: 'blocked' });
      expect(entries.length).toBe(2);
    });

    it('should filter by agent', async () => {
      const entries = await logger.query({ agent: 'coder' });
      expect(entries.length).toBe(3);
    });

    it('should support pagination', async () => {
      const page1 = await logger.query({}, { limit: 2, offset: 0 });
      const page2 = await logger.query({}, { limit: 2, offset: 2 });

      expect(page1.length).toBe(2);
      expect(page2.length).toBe(2);
      expect(page1[0].id).not.toBe(page2[0].id);
    });

    it('should sort entries', async () => {
      const ascending = await logger.query({}, { sortBy: 'timestamp', sortOrder: 'asc' });
      const descending = await logger.query({}, { sortBy: 'timestamp', sortOrder: 'desc' });

      expect(ascending[0].timestamp.getTime()).toBeLessThanOrEqual(ascending[1].timestamp.getTime());
      expect(descending[0].timestamp.getTime()).toBeGreaterThanOrEqual(descending[1].timestamp.getTime());
    });

    it('should get recent entries', async () => {
      const recent = await logger.getRecent(3);
      expect(recent.length).toBe(3);
    });

    it('should get recent failures', async () => {
      const failures = await logger.getRecentFailures();
      expect(failures.length).toBe(3); // 1 failure + 2 blocked
      expect(failures.every((e) => e.outcome === 'failure' || e.outcome === 'blocked')).toBe(true);
    });

    it('should get entries by agent', async () => {
      const coderEntries = await logger.getByAgent('coder');
      expect(coderEntries.length).toBe(3);
    });
  });

  describe('Date Filtering', () => {
    it('should filter by date range', async () => {
      const now = Date.now();

      // Mock entries with different timestamps
      const storage = new MemoryAuditStorage();
      const testLogger = new AuditLogger({ consoleOutput: false }, storage);

      // Add entries with specific timestamps
      await storage.save({
        id: '1',
        timestamp: new Date(now - 3600000), // 1 hour ago
        type: 'file_operation',
        action: 'test',
        agent: 'coder',
        taskId: 'task-1',
        details: {},
        outcome: 'success',
      });

      await storage.save({
        id: '2',
        timestamp: new Date(now - 1800000), // 30 min ago
        type: 'file_operation',
        action: 'test',
        agent: 'coder',
        taskId: 'task-2',
        details: {},
        outcome: 'success',
      });

      await storage.save({
        id: '3',
        timestamp: new Date(now - 600000), // 10 min ago
        type: 'file_operation',
        action: 'test',
        agent: 'coder',
        taskId: 'task-3',
        details: {},
        outcome: 'success',
      });

      // Query last 45 minutes
      const results = await testLogger.query({
        fromDate: new Date(now - 2700000), // 45 min ago
      });

      expect(results.length).toBe(2);

      testLogger.shutdown();
    });
  });

  describe('Statistics', () => {
    beforeEach(async () => {
      await logger.log(createTestEntry({ type: 'file_operation', outcome: 'success', duration: 100 }));
      await logger.log(createTestEntry({ type: 'file_operation', outcome: 'failure', duration: 200 }));
      await logger.log(createTestEntry({ type: 'shell_command', outcome: 'success', duration: 300 }));
      await logger.log(createTestEntry({ type: 'git_operation', outcome: 'blocked' }));
    });

    it('should calculate total entries', async () => {
      const stats = await logger.getStats();
      expect(stats.totalEntries).toBe(4);
    });

    it('should count by type', async () => {
      const stats = await logger.getStats();
      expect(stats.byType.file_operation).toBe(2);
      expect(stats.byType.shell_command).toBe(1);
      expect(stats.byType.git_operation).toBe(1);
    });

    it('should count by outcome', async () => {
      const stats = await logger.getStats();
      expect(stats.byOutcome.success).toBe(2);
      expect(stats.byOutcome.failure).toBe(1);
      expect(stats.byOutcome.blocked).toBe(1);
    });

    it('should calculate average duration', async () => {
      const stats = await logger.getStats();
      expect(stats.averageDuration).toBe(200); // (100 + 200 + 300) / 3
    });

    it('should calculate failure rate', async () => {
      const stats = await logger.getStats();
      expect(stats.failureRate).toBe(50); // 2 failures (failure + blocked) out of 4
    });

    it('should track time range', async () => {
      const stats = await logger.getStats();
      expect(stats.timeRange.earliest).not.toBeNull();
      expect(stats.timeRange.latest).not.toBeNull();
    });
  });

  describe('Export', () => {
    beforeEach(async () => {
      await logger.log(createTestEntry({ type: 'file_operation', outcome: 'success' }));
      await logger.log(createTestEntry({ type: 'shell_command', outcome: 'failure' }));
    });

    it('should export to JSON', async () => {
      const json = await logger.export('json');
      const parsed = JSON.parse(json);

      expect(Array.isArray(parsed)).toBe(true);
      expect(parsed.length).toBe(2);
      expect(parsed[0].type).toBe('file_operation');
    });

    it('should export to CSV', async () => {
      const csv = await logger.export('csv');
      const lines = csv.split('\n');

      expect(lines.length).toBe(3); // header + 2 entries
      expect(lines[0]).toContain('id,timestamp,type,action');
    });

    it('should export with filter', async () => {
      const json = await logger.export('json', { type: 'file_operation' });
      const parsed = JSON.parse(json);

      expect(parsed.length).toBe(1);
    });
  });

  describe('Memory Management', () => {
    it('should limit memory entries', async () => {
      const smallLogger = createAuditLogger({
        maxMemoryEntries: 5,
        consoleOutput: false,
      });

      for (let i = 0; i < 10; i++) {
        await smallLogger.log(createTestEntry({ taskId: `task-${i}` }));
      }

      const entries = await smallLogger.query();
      expect(entries.length).toBe(5);

      smallLogger.shutdown();
    });

    it('should purge old entries', async () => {
      const shortRetentionLogger = createAuditLogger({
        retentionMs: 100, // 100ms retention
        consoleOutput: false,
      });

      await shortRetentionLogger.log(createTestEntry());

      // Wait for entry to become old
      await new Promise((r) => setTimeout(r, 150));

      const purged = await shortRetentionLogger.purgeOldEntries();
      expect(purged).toBe(1);
      expect(await shortRetentionLogger.count()).toBe(0);

      shortRetentionLogger.shutdown();
    });

    it('should clear all entries', async () => {
      await logger.log(createTestEntry());
      await logger.log(createTestEntry());

      await logger.clear();

      expect(await logger.count()).toBe(0);
    });
  });

  describe('Configuration', () => {
    it('should update configuration', () => {
      logger.updateConfig({ enabled: false });

      const config = logger.getConfig();
      expect(config.enabled).toBe(false);
    });

    it('should return current configuration', () => {
      const config = logger.getConfig();

      expect(config.enabled).toBe(true);
      expect(config.consoleOutput).toBe(false);
      expect(config.maxMemoryEntries).toBeDefined();
    });
  });
});

describe('MemoryAuditStorage', () => {
  let storage: MemoryAuditStorage;

  beforeEach(() => {
    storage = new MemoryAuditStorage(100);
  });

  it('should save and retrieve entries', async () => {
    const entry: AuditEntry = {
      id: 'test-1',
      timestamp: new Date(),
      type: 'file_operation',
      action: 'test',
      agent: 'coder',
      taskId: 'task-1',
      details: {},
      outcome: 'success',
    };

    await storage.save(entry);
    const results = await storage.query({});

    expect(results.length).toBe(1);
    expect(results[0].id).toBe('test-1');
  });

  it('should respect max entries limit', async () => {
    const smallStorage = new MemoryAuditStorage(3);

    for (let i = 0; i < 5; i++) {
      await smallStorage.save({
        id: `entry-${i}`,
        timestamp: new Date(),
        type: 'file_operation',
        action: 'test',
        agent: 'coder',
        taskId: 'task-1',
        details: {},
        outcome: 'success',
      });
    }

    const count = await smallStorage.count();
    expect(count).toBe(3);
  });

  it('should purge entries older than date', async () => {
    const now = Date.now();

    await storage.save({
      id: 'old',
      timestamp: new Date(now - 10000),
      type: 'file_operation',
      action: 'test',
      agent: 'coder',
      taskId: 'task-1',
      details: {},
      outcome: 'success',
    });

    await storage.save({
      id: 'new',
      timestamp: new Date(now),
      type: 'file_operation',
      action: 'test',
      agent: 'coder',
      taskId: 'task-2',
      details: {},
      outcome: 'success',
    });

    const purged = await storage.purgeOlderThan(new Date(now - 5000));

    expect(purged).toBe(1);
    expect(await storage.count()).toBe(1);
  });

  it('should clear all entries', async () => {
    await storage.save({
      id: 'test',
      timestamp: new Date(),
      type: 'file_operation',
      action: 'test',
      agent: 'coder',
      taskId: 'task-1',
      details: {},
      outcome: 'success',
    });

    await storage.clear();

    expect(await storage.count()).toBe(0);
  });
});

describe('Global Audit Logger', () => {
  afterEach(() => {
    resetGlobalAuditLogger();
  });

  it('should return the same instance', () => {
    const logger1 = getGlobalAuditLogger();
    const logger2 = getGlobalAuditLogger();

    expect(logger1).toBe(logger2);
  });

  it('should reset global instance', () => {
    const logger1 = getGlobalAuditLogger();
    resetGlobalAuditLogger();
    const logger2 = getGlobalAuditLogger();

    expect(logger1).not.toBe(logger2);
  });

  it('should provide convenient alias', async () => {
    // Use the auditLogger alias
    const entry = await auditLogger.log(createTestEntry());

    expect(entry).not.toBeNull();

    const stats = await auditLogger.getStats();
    expect(stats.totalEntries).toBe(1);
  });
});
