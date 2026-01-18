/**
 * Tests pour la détection avancée des poison pills dans la DLQ
 *
 * @module agents/tests/dead-letter-queue-poison-pill.spec
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  DeadLetterQueue,
  createDeadLetterQueue,
  DEFAULT_POISON_PILL_CONFIG,
  type DLQEntry,
  type PoisonPillConfig,
} from '../persistence/dead-letter-queue';
import type { Task, AgentError } from '../types';

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

function createMockTask(id?: string): Task {
  return {
    id: id || `task-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
    type: 'test',
    prompt: 'Test task',
    status: 'failed',
    createdAt: new Date(),
  };
}

function createMockError(message: string, code?: string): AgentError {
  return {
    code: code || 'TEST_ERROR',
    message,
    recoverable: true,
  };
}

/*
 * ============================================================================
 * POISON PILL DETECTION TESTS
 * ============================================================================
 */

describe('DeadLetterQueue - Poison Pill Detection', () => {
  let dlq: DeadLetterQueue;

  afterEach(() => {
    dlq?.shutdown();
  });

  describe('Default Configuration', () => {
    it('should have poison pill detection enabled by default', () => {
      dlq = createDeadLetterQueue(undefined, {
        autoRetryEnabled: false,
      });

      const config = dlq.getConfig();

      expect(config.poisonPill).toBeDefined();
      expect(config.poisonPill.enabled).toBe(true);
      expect(config.poisonPill.minFailures).toBe(3);
      expect(config.poisonPill.errorSimilarityThreshold).toBe(0.8);
      expect(config.poisonPill.action).toBe('quarantine');
    });

    it('should merge custom poison pill config with defaults', () => {
      dlq = createDeadLetterQueue(undefined, {
        autoRetryEnabled: false,
        poisonPill: {
          enabled: true,
          minFailures: 5,
          errorSimilarityThreshold: 0.9,
          action: 'skip',
        },
      });

      const config = dlq.getConfig();

      expect(config.poisonPill.minFailures).toBe(5);
      expect(config.poisonPill.errorSimilarityThreshold).toBe(0.9);
      expect(config.poisonPill.action).toBe('skip');
    });
  });

  describe('Levenshtein Distance and Similarity', () => {
    beforeEach(() => {
      dlq = createDeadLetterQueue(undefined, {
        autoRetryEnabled: false,
        maxRetries: 10,
        poisonPill: {
          enabled: true,
          minFailures: 3,
          errorSimilarityThreshold: 0.8,
          action: 'quarantine',
        },
      });

      // Configure a mock task executor
      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Task failed')],
      }));
    });

    it('should detect identical error messages as poison pill (similarity = 1.0)', async () => {
      const task = createMockTask();

      // Configure task executor to return the SAME error for consistency
      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Connection timeout')],
      }));

      // Add initial entry
      const entry = await dlq.add(task, createMockError('Connection timeout'));

      // Simulate 2 more identical failures by manually adding to error history
      // (entry starts with 1, we add 2 more = 3 total before retry)
      entry.errorHistory.push(
        { message: 'Connection timeout', code: 'TIMEOUT', timestamp: new Date(), attemptNumber: 2 },
      );
      entry.retryCount = 1;

      // Trigger poison pill detection via retry (this adds the 3rd error)
      await dlq.retryEntry(entry);

      // Now we have 3 identical "Connection timeout" errors
      expect(entry.isPoisonPill).toBe(true);
      expect(entry.errorSimilarityScore).toBe(1);
      expect(entry.status).toBe('quarantined');
    });

    it('should detect similar error messages as poison pill', async () => {
      const task = createMockTask();

      // Configure task executor to return a similar error
      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Connection timeout after 32s')],
      }));

      // Add initial entry
      const entry = await dlq.add(task, createMockError('Connection timeout after 30s'));

      // Add similar (not identical) error message
      entry.errorHistory.push({
        message: 'Connection timeout after 31s',
        code: 'TIMEOUT',
        timestamp: new Date(),
        attemptNumber: 2,
      });
      entry.retryCount = 1;

      // Trigger poison pill detection (adds 3rd similar error)
      await dlq.retryEntry(entry);

      // Similarity should be high (only 1-2 chars different in each message)
      expect(entry.errorSimilarityScore).toBeGreaterThan(0.9);
      expect(entry.isPoisonPill).toBe(true);
    });

    it('should not detect as poison pill when errors are different', async () => {
      const task = createMockTask();

      // Add initial entry with very different errors
      const entry = await dlq.add(task, createMockError('Network error'));

      entry.errorHistory.push(
        { message: 'File not found', code: 'NOT_FOUND', timestamp: new Date(), attemptNumber: 2 },
        { message: 'Permission denied', code: 'FORBIDDEN', timestamp: new Date(), attemptNumber: 3 },
      );
      entry.retryCount = 2;

      // Configure DLQ to return a new error
      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Different error',
        errors: [createMockError('Database connection failed')],
      }));

      await dlq.retryEntry(entry);

      // Low similarity should not trigger poison pill
      expect(entry.errorSimilarityScore).toBeLessThan(0.5);
      expect(entry.isPoisonPill).toBe(false);
    });

    it('should not check poison pill when disabled', async () => {
      dlq.updateConfig({
        poisonPill: {
          enabled: false,
          minFailures: 3,
          errorSimilarityThreshold: 0.8,
          action: 'quarantine',
        },
      });

      const task = createMockTask();
      const entry = await dlq.add(task, createMockError('Same error'));

      entry.errorHistory.push(
        { message: 'Same error', timestamp: new Date(), attemptNumber: 2 },
        { message: 'Same error', timestamp: new Date(), attemptNumber: 3 },
      );
      entry.retryCount = 2;

      await dlq.retryEntry(entry);

      expect(entry.isPoisonPill).toBe(false);
    });
  });

  describe('Poison Pill Actions', () => {
    it('should quarantine poison pills with action=quarantine', async () => {
      dlq = createDeadLetterQueue(undefined, {
        autoRetryEnabled: false,
        maxRetries: 10,
        poisonPill: {
          enabled: true,
          minFailures: 3,
          errorSimilarityThreshold: 0.8,
          action: 'quarantine',
        },
      });

      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Consistent error')],
      }));

      const task = createMockTask();
      const entry = await dlq.add(task, createMockError('Consistent error'));

      // Add identical errors
      entry.errorHistory.push(
        { message: 'Consistent error', timestamp: new Date(), attemptNumber: 2 },
        { message: 'Consistent error', timestamp: new Date(), attemptNumber: 3 },
      );
      entry.retryCount = 2;

      await dlq.retryEntry(entry);

      expect(entry.status).toBe('quarantined');
      expect(entry.quarantinedAt).toBeDefined();
      expect(entry.nextRetryAt).toBeUndefined();
      expect(entry.poisonPillReason).toContain('similarity');
    });

    it('should skip poison pills with action=skip', async () => {
      dlq = createDeadLetterQueue(undefined, {
        autoRetryEnabled: false,
        maxRetries: 10,
        poisonPill: {
          enabled: true,
          minFailures: 3,
          errorSimilarityThreshold: 0.8,
          action: 'skip',
        },
      });

      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Skippable error')],
      }));

      const task = createMockTask();
      const entry = await dlq.add(task, createMockError('Skippable error'));

      entry.errorHistory.push(
        { message: 'Skippable error', timestamp: new Date(), attemptNumber: 2 },
        { message: 'Skippable error', timestamp: new Date(), attemptNumber: 3 },
      );
      entry.retryCount = 2;

      await dlq.retryEntry(entry);

      expect(entry.status).toBe('skipped');
      expect(entry.nextRetryAt).toBeUndefined();
    });

    it('should emit alert for poison pills with action=alert', async () => {
      dlq = createDeadLetterQueue(undefined, {
        autoRetryEnabled: false,
        maxRetries: 10,
        poisonPill: {
          enabled: true,
          minFailures: 3,
          errorSimilarityThreshold: 0.8,
          action: 'alert',
        },
      });

      const events: Array<{ type: string; entryId: string }> = [];
      dlq.setEventCallback((event) => {
        events.push({ type: event.type, entryId: event.entryId });
      });

      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Alert error')],
      }));

      const task = createMockTask();
      const entry = await dlq.add(task, createMockError('Alert error'));

      entry.errorHistory.push(
        { message: 'Alert error', timestamp: new Date(), attemptNumber: 2 },
        { message: 'Alert error', timestamp: new Date(), attemptNumber: 3 },
      );
      entry.retryCount = 2;

      await dlq.retryEntry(entry);

      // Alert action keeps entry in pending_retry but emits event
      expect(entry.isPoisonPill).toBe(true);
      expect(events.some((e) => e.type === 'poison_pill_detected')).toBe(true);
    });
  });

  describe('Quarantine Management', () => {
    beforeEach(() => {
      dlq = createDeadLetterQueue(undefined, {
        autoRetryEnabled: false,
        maxRetries: 10,
        poisonPill: {
          enabled: true,
          minFailures: 3,
          errorSimilarityThreshold: 0.8,
          action: 'quarantine',
        },
      });

      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Quarantine error')],
      }));
    });

    it('should list quarantined entries', async () => {
      const task1 = createMockTask('task-1');
      const task2 = createMockTask('task-2');

      // Configure task executor to return the same error
      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Error 1')],
      }));

      const entry1 = await dlq.add(task1, createMockError('Error 1'));
      const entry2 = await dlq.add(task2, createMockError('Error 2'));

      // Make entry1 a poison pill (need 2 errors before retry adds 3rd)
      entry1.errorHistory.push({ message: 'Error 1', timestamp: new Date(), attemptNumber: 2 });
      entry1.retryCount = 1;
      await dlq.retryEntry(entry1);

      const quarantined = dlq.getQuarantinedEntries();

      expect(quarantined.length).toBe(1);
      expect(quarantined[0].task.id).toBe('task-1');
    });

    it('should release entry from quarantine', async () => {
      // Configure task executor
      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Quarantined error')],
      }));

      const task = createMockTask();
      const entry = await dlq.add(task, createMockError('Quarantined error'));

      // Make it a poison pill (need 2 errors before retry adds 3rd)
      entry.errorHistory.push({ message: 'Quarantined error', timestamp: new Date(), attemptNumber: 2 });
      entry.retryCount = 1;
      await dlq.retryEntry(entry);

      expect(entry.status).toBe('quarantined');

      // Release from quarantine
      const released = await dlq.releaseFromQuarantine(entry.id);

      expect(released).toBe(true);
      expect(entry.status).toBe('pending_retry');
      expect(entry.isPoisonPill).toBe(false);
      expect(entry.quarantinedAt).toBeUndefined();
      expect(entry.nextRetryAt).toBeDefined();
    });

    it('should return false when releasing non-quarantined entry', async () => {
      const task = createMockTask();
      const entry = await dlq.add(task, createMockError('Normal error'));

      const released = await dlq.releaseFromQuarantine(entry.id);

      expect(released).toBe(false);
    });

    it('should return false when releasing non-existent entry', async () => {
      const released = await dlq.releaseFromQuarantine('non-existent-id');

      expect(released).toBe(false);
    });
  });

  describe('Statistics', () => {
    beforeEach(() => {
      dlq = createDeadLetterQueue(undefined, {
        autoRetryEnabled: false,
        maxRetries: 10,
        poisonPill: {
          enabled: true,
          minFailures: 3,
          errorSimilarityThreshold: 0.8,
          action: 'quarantine',
        },
      });

      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Stats error')],
      }));
    });

    it('should include quarantined and skipped counts in stats', async () => {
      // Configure task executor for quarantine test
      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Quarantine me')],
      }));

      // Add a quarantined entry
      const task1 = createMockTask();
      const entry1 = await dlq.add(task1, createMockError('Quarantine me'));
      entry1.errorHistory.push({ message: 'Quarantine me', timestamp: new Date(), attemptNumber: 2 });
      entry1.retryCount = 1;
      await dlq.retryEntry(entry1);

      // Change action and add a skipped entry
      dlq.updateConfig({
        poisonPill: {
          enabled: true,
          minFailures: 3,
          errorSimilarityThreshold: 0.8,
          action: 'skip',
        },
      });

      // Configure task executor for skip test
      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Skip me')],
      }));

      const task2 = createMockTask();
      const entry2 = await dlq.add(task2, createMockError('Skip me'));
      entry2.errorHistory.push({ message: 'Skip me', timestamp: new Date(), attemptNumber: 2 });
      entry2.retryCount = 1;
      await dlq.retryEntry(entry2);

      const stats = dlq.getStats();

      expect(stats.quarantined).toBe(1);
      expect(stats.skipped).toBe(1);
      expect(stats.poisonPills).toBe(2);
    });

    it('should calculate average poison pill similarity', async () => {
      // Configure task executor for first entry
      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Identical error')],
      }));

      const task1 = createMockTask();
      const entry1 = await dlq.add(task1, createMockError('Identical error'));
      entry1.errorHistory.push({ message: 'Identical error', timestamp: new Date(), attemptNumber: 2 });
      entry1.retryCount = 1;
      await dlq.retryEntry(entry1);

      // Configure task executor for second entry (similar errors)
      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Similar error 3')],
      }));

      const task2 = createMockTask();
      const entry2 = await dlq.add(task2, createMockError('Similar error 1'));
      entry2.errorHistory.push({ message: 'Similar error 2', timestamp: new Date(), attemptNumber: 2 });
      entry2.retryCount = 1;
      await dlq.retryEntry(entry2);

      const stats = dlq.getStats();

      expect(stats.averagePoisonPillSimilarity).toBeGreaterThan(0);
      expect(stats.averagePoisonPillSimilarity).toBeLessThanOrEqual(1);
    });
  });

  describe('Similarity Threshold Edge Cases', () => {
    it('should respect custom similarity threshold', async () => {
      // Set a very high threshold (99%)
      dlq = createDeadLetterQueue(undefined, {
        autoRetryEnabled: false,
        maxRetries: 10,
        poisonPill: {
          enabled: true,
          minFailures: 3,
          errorSimilarityThreshold: 0.99,
          action: 'quarantine',
        },
      });

      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Error with timestamp 12345')],
      }));

      const task = createMockTask();
      const entry = await dlq.add(task, createMockError('Error with timestamp 12344'));

      entry.errorHistory.push(
        { message: 'Error with timestamp 12346', timestamp: new Date(), attemptNumber: 2 },
        { message: 'Error with timestamp 12347', timestamp: new Date(), attemptNumber: 3 },
      );
      entry.retryCount = 2;

      await dlq.retryEntry(entry);

      // High similarity but not 99%, so should not be detected as poison pill
      expect(entry.isPoisonPill).toBe(false);
    });

    it('should handle minFailures correctly', async () => {
      dlq = createDeadLetterQueue(undefined, {
        autoRetryEnabled: false,
        maxRetries: 10,
        poisonPill: {
          enabled: true,
          minFailures: 5, // Require 5 failures
          errorSimilarityThreshold: 0.8,
          action: 'quarantine',
        },
      });

      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Same error')],
      }));

      const task = createMockTask();
      const entry = await dlq.add(task, createMockError('Same error'));

      // Only 3 failures (less than minFailures=5)
      entry.errorHistory.push(
        { message: 'Same error', timestamp: new Date(), attemptNumber: 2 },
        { message: 'Same error', timestamp: new Date(), attemptNumber: 3 },
      );
      entry.retryCount = 2;

      await dlq.retryEntry(entry);

      // Not enough failures to check for poison pill
      expect(entry.isPoisonPill).toBe(false);
    });
  });

  describe('Error Similarity Score Access', () => {
    beforeEach(() => {
      dlq = createDeadLetterQueue(undefined, {
        autoRetryEnabled: false,
        maxRetries: 10,
        poisonPill: {
          enabled: true,
          minFailures: 3,
          errorSimilarityThreshold: 0.8,
          action: 'quarantine',
        },
      });

      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Test error')],
      }));
    });

    it('should return error similarity score', async () => {
      // Configure task executor
      dlq.setTaskExecutor(async () => ({
        success: false,
        output: 'Failed',
        errors: [createMockError('Test error')],
      }));

      const task = createMockTask();
      const entry = await dlq.add(task, createMockError('Test error'));

      entry.errorHistory.push({ message: 'Test error', timestamp: new Date(), attemptNumber: 2 });
      entry.retryCount = 1;

      await dlq.retryEntry(entry);

      const score = dlq.getErrorSimilarityScore(entry.id);

      expect(score).toBe(1); // Identical errors = 100% similarity
    });

    it('should return undefined for non-existent entry', () => {
      const score = dlq.getErrorSimilarityScore('non-existent');

      expect(score).toBeUndefined();
    });
  });
});
