/**
 * =============================================================================
 * Tests: Post-Fix Verification Loop
 * =============================================================================
 * Phase 0 Task 2.4: Tests for verification loop functionality
 * =============================================================================
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  createSnapshot,
  shouldRetry,
  verifyFix,
  buildRetryFixerPrompt,
  runAutoFixWithVerification,
  getVerificationMetrics,
  resetVerificationMetrics,
  formatMetricsReport,
  DEFAULT_VERIFICATION_CONFIG,
} from './verification';
import type { DetectedError, ChatMessage } from './types';

describe('verification', () => {
  beforeEach(() => {
    resetVerificationMetrics();
  });

  describe('createSnapshot', () => {
    it('should create a snapshot with output and messages', () => {
      const output = 'test output';
      const messages: ChatMessage[] = [
        { role: 'user', content: 'test message' },
      ];

      const snapshot = createSnapshot(output, messages);

      expect(snapshot.originalOutput).toBe(output);
      expect(snapshot.messages).toEqual(messages);
      expect(snapshot.timestamp).toBeLessThanOrEqual(Date.now());
    });

    it('should clone messages to prevent mutation', () => {
      const messages: ChatMessage[] = [
        { role: 'user', content: 'original' },
      ];

      const snapshot = createSnapshot('output', messages);
      messages[0].content = 'modified';

      expect(snapshot.messages[0].content).toBe('original');
    });
  });

  describe('shouldRetry', () => {
    it('should return true for high severity errors', () => {
      const errors: DetectedError[] = [
        { type: 'typescript', message: 'TS2345', severity: 'high' },
      ];

      expect(shouldRetry(errors, DEFAULT_VERIFICATION_CONFIG)).toBe(true);
    });

    it('should return false when errors are below min severity', () => {
      const errors: DetectedError[] = [
        { type: 'test', message: 'Test warning', severity: 'low' },
      ];

      expect(shouldRetry(errors, DEFAULT_VERIFICATION_CONFIG)).toBe(false);
    });

    it('should respect custom minSeverityForRetry', () => {
      const errors: DetectedError[] = [
        { type: 'test', message: 'Medium issue', severity: 'medium' },
      ];

      const configMedium = { ...DEFAULT_VERIFICATION_CONFIG, minSeverityForRetry: 'medium' as const };
      const configHigh = { ...DEFAULT_VERIFICATION_CONFIG, minSeverityForRetry: 'high' as const };

      expect(shouldRetry(errors, configMedium)).toBe(true);
      expect(shouldRetry(errors, configHigh)).toBe(false);
    });

    it('should return false for empty errors', () => {
      expect(shouldRetry([], DEFAULT_VERIFICATION_CONFIG)).toBe(false);
    });
  });

  describe('verifyFix', () => {
    it('should return success true when no errors detected', () => {
      const cleanOutput = 'const x = 1;\nconsole.log(x);';

      const result = verifyFix(cleanOutput, DEFAULT_VERIFICATION_CONFIG);

      expect(result.success).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('should return success false when high severity errors detected', () => {
      const errorOutput = 'error TS2345: Argument of type string is not assignable';

      const result = verifyFix(errorOutput, DEFAULT_VERIFICATION_CONFIG);

      expect(result.success).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should return success true for low severity errors with high min severity', () => {
      const output = 'Test passed with warnings';

      const result = verifyFix(output, DEFAULT_VERIFICATION_CONFIG);

      // No actual errors in this output
      expect(result.success).toBe(true);
    });
  });

  describe('buildRetryFixerPrompt', () => {
    it('should include attempt number', () => {
      const errors: DetectedError[] = [
        { type: 'typescript', message: 'TS2345', severity: 'high' },
      ];

      const prompt = buildRetryFixerPrompt(errors, 'coder', 2, 'previous output');

      expect(prompt).toContain('TENTATIVE DE CORRECTION #2');
    });

    it('should include previous output', () => {
      const errors: DetectedError[] = [
        { type: 'typescript', message: 'TS2345', severity: 'high' },
      ];

      const prompt = buildRetryFixerPrompt(errors, 'coder', 2, 'const x = 1;');

      expect(prompt).toContain('const x = 1;');
    });

    it('should truncate long previous output', () => {
      const errors: DetectedError[] = [
        { type: 'typescript', message: 'TS2345', severity: 'high' },
      ];

      const longOutput = 'x'.repeat(3000);
      const prompt = buildRetryFixerPrompt(errors, 'coder', 2, longOutput);

      expect(prompt).toContain('...');
      // The prompt contains the base fixer prompt + retry instructions + truncated output
      // Max output is 2000 chars, so prompt should be < 2000 + base prompt size (~2500)
      expect(prompt.length).toBeLessThan(5000);
    });
  });

  describe('runAutoFixWithVerification', () => {
    // Use proper error format: "error TS####: message" to match detectErrorsInOutput regex
    const TS_ERROR = 'error TS2345: Argument of type string is not assignable to parameter of type number';
    const TS_ERROR_NEW = 'error TS9999: Another type mismatch found in the code';

    it('should succeed on first attempt when fixer produces clean output', async () => {
      const mockFixer = vi.fn().mockResolvedValue('const x: number = 1;');

      const result = await runAutoFixWithVerification(
        mockFixer,
        TS_ERROR,
        'coder',
        [{ role: 'user', content: 'fix this' }],
      );

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(1);
      expect(result.rolledBack).toBe(false);
      expect(mockFixer).toHaveBeenCalledTimes(1);
    });

    it('should retry when first fix still has errors', async () => {
      const mockFixer = vi.fn()
        .mockResolvedValueOnce(TS_ERROR)
        .mockResolvedValueOnce('const x: number = 1;');

      const result = await runAutoFixWithVerification(
        mockFixer,
        TS_ERROR,
        'coder',
        [{ role: 'user', content: 'fix this' }],
        { maxRetries: 3 },
      );

      expect(result.success).toBe(true);
      expect(result.totalAttempts).toBe(2);
      expect(mockFixer).toHaveBeenCalledTimes(2);
    });

    it('should rollback after max retries exhausted', async () => {
      const mockFixer = vi.fn().mockResolvedValue(TS_ERROR_NEW);

      const result = await runAutoFixWithVerification(
        mockFixer,
        TS_ERROR,
        'coder',
        [{ role: 'user', content: 'fix this' }],
        { maxRetries: 2, rollbackOnFailure: true },
      );

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(2);
      expect(result.rolledBack).toBe(true);
      expect(result.finalOutput).toBe(TS_ERROR);
    });

    it('should not rollback when rollbackOnFailure is false', async () => {
      const mockFixer = vi.fn().mockResolvedValue(TS_ERROR_NEW);

      const result = await runAutoFixWithVerification(
        mockFixer,
        TS_ERROR,
        'coder',
        [{ role: 'user', content: 'fix this' }],
        { maxRetries: 1, rollbackOnFailure: false },
      );

      expect(result.rolledBack).toBe(false);
      expect(result.finalOutput).toBe(TS_ERROR_NEW);
    });

    it('should handle fixer throwing error', async () => {
      const mockFixer = vi.fn().mockRejectedValue(new Error('LLM timeout'));

      const result = await runAutoFixWithVerification(
        mockFixer,
        TS_ERROR,
        'coder',
        [{ role: 'user', content: 'fix this' }],
        { maxRetries: 1 },
      );

      expect(result.success).toBe(false);
      expect(result.totalAttempts).toBe(1);
    });

    it('should track attempt results', async () => {
      const mockFixer = vi.fn()
        .mockResolvedValueOnce(TS_ERROR)
        .mockResolvedValueOnce('const x = 1;');

      const result = await runAutoFixWithVerification(
        mockFixer,
        TS_ERROR,
        'coder',
        [{ role: 'user', content: 'fix this' }],
      );

      expect(result.attempts).toHaveLength(2);
      expect(result.attempts[0].success).toBe(false);
      expect(result.attempts[0].attempt).toBe(1);
      expect(result.attempts[1].success).toBe(true);
      expect(result.attempts[1].attempt).toBe(2);
    });
  });

  describe('getVerificationMetrics', () => {
    // Use proper error format: "error TS####: message" to match detectErrorsInOutput regex
    const TS_ERROR = 'error TS2345: Argument of type string is not assignable to parameter';

    it('should return initial metrics', () => {
      const metrics = getVerificationMetrics();

      expect(metrics.totalFixOperations).toBe(0);
      expect(metrics.firstAttemptSuccesses).toBe(0);
      expect(metrics.successRate).toBe(0);
    });

    it('should track first attempt successes', async () => {
      const mockFixer = vi.fn().mockResolvedValue('clean code');

      await runAutoFixWithVerification(
        mockFixer,
        TS_ERROR,
        'coder',
        [],
      );

      const metrics = getVerificationMetrics();

      expect(metrics.totalFixOperations).toBe(1);
      expect(metrics.firstAttemptSuccesses).toBe(1);
      expect(metrics.successRate).toBe(1);
    });

    it('should track retry successes', async () => {
      const mockFixer = vi.fn()
        .mockResolvedValueOnce(TS_ERROR)
        .mockResolvedValueOnce('clean code');

      await runAutoFixWithVerification(
        mockFixer,
        TS_ERROR,
        'coder',
        [],
      );

      const metrics = getVerificationMetrics();

      expect(metrics.retrySuccesses).toBe(1);
      expect(metrics.firstAttemptSuccesses).toBe(0);
    });

    it('should track failures and rollbacks', async () => {
      const mockFixer = vi.fn().mockResolvedValue(TS_ERROR);

      await runAutoFixWithVerification(
        mockFixer,
        TS_ERROR,
        'coder',
        [],
        { maxRetries: 1, rollbackOnFailure: true },
      );

      const metrics = getVerificationMetrics();

      expect(metrics.failures).toBe(1);
      expect(metrics.rollbacks).toBe(1);
    });

    it('should calculate average attempts', async () => {
      const mockFixer1 = vi.fn().mockResolvedValue('clean code');
      const mockFixer2 = vi.fn()
        .mockResolvedValueOnce(TS_ERROR)
        .mockResolvedValueOnce('clean code');

      await runAutoFixWithVerification(mockFixer1, TS_ERROR, 'coder', []);
      await runAutoFixWithVerification(mockFixer2, TS_ERROR, 'coder', []);

      const metrics = getVerificationMetrics();

      // (1 + 2) / 2 = 1.5
      expect(metrics.averageAttempts).toBe(1.5);
    });
  });

  describe('formatMetricsReport', () => {
    it('should format metrics as markdown table', async () => {
      const mockFixer = vi.fn().mockResolvedValue('clean code');
      const TS_ERROR = 'error TS2345: Type mismatch found';

      await runAutoFixWithVerification(mockFixer, TS_ERROR, 'coder', []);

      const report = formatMetricsReport();

      expect(report).toContain('## Verification Metrics Report');
      expect(report).toContain('Total Fix Operations');
      expect(report).toContain('Success Rate');
    });
  });

  describe('resetVerificationMetrics', () => {
    it('should reset all metrics to zero', async () => {
      const mockFixer = vi.fn().mockResolvedValue('clean code');
      const TS_ERROR = 'error TS2345: Type mismatch found';

      await runAutoFixWithVerification(mockFixer, TS_ERROR, 'coder', []);

      let metrics = getVerificationMetrics();

      expect(metrics.totalFixOperations).toBe(1);

      resetVerificationMetrics();
      metrics = getVerificationMetrics();

      expect(metrics.totalFixOperations).toBe(0);
      expect(metrics.successRate).toBe(0);
    });
  });
});
