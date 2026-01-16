/**
 * Tests pour le Circuit Breaker des agents BAVINI
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import {
  CircuitBreaker,
  createCircuitBreaker,
  getGlobalCircuitBreaker,
  resetGlobalCircuitBreaker,
  type CircuitState,
} from '../utils/circuit-breaker';
import type { AgentType } from '../types';

describe('CircuitBreaker', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 1000, // 1 second for faster tests
      failureWindow: 5000, // 5 seconds
    });
  });

  describe('Initial State', () => {
    it('should start in CLOSED state', () => {
      expect(breaker.getState('explore')).toBe('CLOSED');
    });

    it('should allow requests when CLOSED', () => {
      expect(breaker.isAllowed('explore')).toBe(true);
    });

    it('should return correct initial stats', () => {
      const stats = breaker.getStats('explore');

      expect(stats.state).toBe('CLOSED');
      expect(stats.failureCount).toBe(0);
      expect(stats.consecutiveSuccesses).toBe(0);
      expect(stats.isAllowed).toBe(true);
      expect(stats.lastFailure).toBeNull();
    });
  });

  describe('Recording Successes', () => {
    it('should stay CLOSED after success', () => {
      breaker.recordSuccess('explore');

      expect(breaker.getState('explore')).toBe('CLOSED');
    });

    it('should not affect failure count on success', () => {
      breaker.recordFailure('explore');
      breaker.recordSuccess('explore');

      const stats = breaker.getStats('explore');
      expect(stats.failureCount).toBe(1);
    });
  });

  describe('Recording Failures', () => {
    it('should stay CLOSED below threshold', () => {
      breaker.recordFailure('explore');
      breaker.recordFailure('explore');

      expect(breaker.getState('explore')).toBe('CLOSED');
      expect(breaker.getStats('explore').failureCount).toBe(2);
    });

    it('should open circuit after reaching threshold', () => {
      breaker.recordFailure('explore');
      breaker.recordFailure('explore');
      breaker.recordFailure('explore');

      expect(breaker.getState('explore')).toBe('OPEN');
    });

    it('should block requests when OPEN', () => {
      // Trigger OPEN state
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure('explore');
      }

      expect(breaker.isAllowed('explore')).toBe(false);
    });

    it('should track last failure timestamp', () => {
      breaker.recordFailure('explore', 'Test error');

      const stats = breaker.getStats('explore');
      expect(stats.lastFailure).not.toBeNull();
      expect(stats.lastFailure!.getTime()).toBeLessThanOrEqual(Date.now());
    });
  });

  describe('State Transitions', () => {
    it('should transition from OPEN to HALF_OPEN after timeout', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure('explore');
      }
      expect(breaker.getState('explore')).toBe('OPEN');

      // Wait for timeout
      await new Promise((r) => setTimeout(r, 1100));

      // isAllowed should trigger transition to HALF_OPEN
      expect(breaker.isAllowed('explore')).toBe(true);
      expect(breaker.getState('explore')).toBe('HALF_OPEN');
    });

    it('should close circuit after successes in HALF_OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure('explore');
      }

      // Wait for timeout to HALF_OPEN
      await new Promise((r) => setTimeout(r, 1100));
      breaker.isAllowed('explore'); // Triggers HALF_OPEN

      // Record successes
      breaker.recordSuccess('explore');
      expect(breaker.getState('explore')).toBe('HALF_OPEN');

      breaker.recordSuccess('explore');
      expect(breaker.getState('explore')).toBe('CLOSED');
    });

    it('should reopen circuit on failure in HALF_OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure('explore');
      }

      // Wait for timeout to HALF_OPEN
      await new Promise((r) => setTimeout(r, 1100));
      breaker.isAllowed('explore'); // Triggers HALF_OPEN

      // Failure in HALF_OPEN
      breaker.recordFailure('explore');

      expect(breaker.getState('explore')).toBe('OPEN');
      expect(breaker.isAllowed('explore')).toBe(false);
    });
  });

  describe('Failure Window', () => {
    it('should not count old failures outside window', async () => {
      const quickBreaker = new CircuitBreaker({
        failureThreshold: 3,
        failureWindow: 500, // 500ms window
        resetTimeout: 1000,
        successThreshold: 2,
      });

      quickBreaker.recordFailure('explore');
      quickBreaker.recordFailure('explore');

      // Wait for failures to expire
      await new Promise((r) => setTimeout(r, 600));

      quickBreaker.recordFailure('explore');

      // Only 1 failure should be counted (the recent one)
      expect(quickBreaker.getStats('explore').failureCount).toBe(1);
      expect(quickBreaker.getState('explore')).toBe('CLOSED');
    });
  });

  describe('Multiple Agents', () => {
    it('should track circuits independently', () => {
      breaker.recordFailure('explore');
      breaker.recordFailure('explore');
      breaker.recordFailure('explore');

      breaker.recordSuccess('coder');

      expect(breaker.getState('explore')).toBe('OPEN');
      expect(breaker.getState('coder')).toBe('CLOSED');
    });

    it('should return all stats', () => {
      breaker.recordFailure('explore');
      breaker.recordSuccess('coder');

      const allStats = breaker.getAllStats();

      expect(allStats.length).toBe(2);
      expect(allStats.find((s) => s.agent === 'explore')).toBeDefined();
      expect(allStats.find((s) => s.agent === 'coder')).toBeDefined();
    });
  });

  describe('Reset Operations', () => {
    it('should reset single agent circuit', () => {
      breaker.recordFailure('explore');
      breaker.recordFailure('explore');
      breaker.recordFailure('explore');

      breaker.reset('explore');

      expect(breaker.getState('explore')).toBe('CLOSED');
      expect(breaker.getStats('explore').failureCount).toBe(0);
    });

    it('should reset all circuits', () => {
      breaker.recordFailure('explore');
      breaker.recordFailure('coder');

      breaker.resetAll();

      expect(breaker.getAllStats().length).toBe(0);
    });
  });

  describe('Force Operations', () => {
    it('should force open circuit', () => {
      expect(breaker.getState('explore')).toBe('CLOSED');

      breaker.forceOpen('explore');

      expect(breaker.getState('explore')).toBe('OPEN');
      expect(breaker.isAllowed('explore')).toBe(false);
    });

    it('should force close circuit', () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure('explore');
      }

      breaker.forceClose('explore');

      expect(breaker.getState('explore')).toBe('CLOSED');
      expect(breaker.getStats('explore').failureCount).toBe(0);
      expect(breaker.isAllowed('explore')).toBe(true);
    });
  });

  describe('Execute with Circuit Breaker', () => {
    it('should execute function when circuit is CLOSED', async () => {
      const result = await breaker.execute('explore', async () => 'success');

      expect(result.success).toBe(true);
      expect(result.result).toBe('success');
      expect(result.wasBlocked).toBe(false);
      expect(result.circuitState).toBe('CLOSED');
    });

    it('should block execution when circuit is OPEN', async () => {
      // Open the circuit
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure('explore');
      }

      const result = await breaker.execute('explore', async () => 'should not run');

      expect(result.success).toBe(false);
      expect(result.result).toBeUndefined();
      expect(result.wasBlocked).toBe(true);
      expect(result.error).toContain('temporarily unavailable');
    });

    it('should record failure on exception', async () => {
      await breaker.execute('explore', async () => {
        throw new Error('Test error');
      });

      expect(breaker.getStats('explore').failureCount).toBe(1);
    });

    it('should record success on successful execution', async () => {
      // Put in HALF_OPEN
      for (let i = 0; i < 3; i++) {
        breaker.recordFailure('explore');
      }
      await new Promise((r) => setTimeout(r, 1100));
      breaker.isAllowed('explore');

      await breaker.execute('explore', async () => 'success');

      expect(breaker.getStats('explore').consecutiveSuccesses).toBe(1);
    });
  });
});

describe('Global Circuit Breaker', () => {
  beforeEach(() => {
    resetGlobalCircuitBreaker();
  });

  afterEach(() => {
    resetGlobalCircuitBreaker();
  });

  it('should return same instance', () => {
    const breaker1 = getGlobalCircuitBreaker();
    const breaker2 = getGlobalCircuitBreaker();

    expect(breaker1).toBe(breaker2);
  });

  it('should reset global instance', () => {
    const breaker1 = getGlobalCircuitBreaker();
    breaker1.recordFailure('explore');

    resetGlobalCircuitBreaker();

    const breaker2 = getGlobalCircuitBreaker();
    expect(breaker2).not.toBe(breaker1);
    expect(breaker2.getStats('explore').failureCount).toBe(0);
  });
});

describe('createCircuitBreaker Factory', () => {
  it('should create breaker with custom config', () => {
    const breaker = createCircuitBreaker({
      failureThreshold: 10,
      resetTimeout: 60000,
    });

    // Record 9 failures - should stay CLOSED with threshold of 10
    for (let i = 0; i < 9; i++) {
      breaker.recordFailure('explore');
    }

    expect(breaker.getState('explore')).toBe('CLOSED');

    // 10th failure should open
    breaker.recordFailure('explore');
    expect(breaker.getState('explore')).toBe('OPEN');
  });
});
