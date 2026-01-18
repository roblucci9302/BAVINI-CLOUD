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

describe('Estimate Recovery Time', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 1000, // 1 second for faster tests
      failureWindow: 60000,
    });
  });

  it('should return null when circuit is CLOSED', () => {
    expect(breaker.estimateRecoveryTime('explore')).toBeNull();
  });

  it('should return 0 when circuit is HALF_OPEN', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure('explore');
    }

    // Wait for timeout to transition to HALF_OPEN
    await new Promise((r) => setTimeout(r, 1100));
    breaker.isAllowed('explore'); // Trigger HALF_OPEN

    expect(breaker.estimateRecoveryTime('explore')).toBe(0);
  });

  it('should return remaining time when circuit is OPEN', () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure('explore');
    }

    const recoveryTime = breaker.estimateRecoveryTime('explore');
    expect(recoveryTime).not.toBeNull();
    expect(recoveryTime).toBeGreaterThan(0);
    expect(recoveryTime).toBeLessThanOrEqual(1000);
  });

  it('should show in stats', () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure('explore');
    }

    const stats = breaker.getStats('explore');
    expect(stats.estimatedRecoveryTime).not.toBeNull();
    expect(stats.estimatedRecoveryTime).toBeGreaterThan(0);
  });
});

describe('Suggest Fallback', () => {
  it('should return null when fallback not configured', () => {
    const breaker = new CircuitBreaker();
    expect(breaker.suggestFallback('coder')).toBeNull();
  });

  it('should return null when fallback disabled', () => {
    const breaker = new CircuitBreaker({
      fallback: {
        enabled: false,
        fallbackAgents: { coder: 'explore' },
      },
    });
    expect(breaker.suggestFallback('coder')).toBeNull();
  });

  it('should return fallback agent when configured', () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 1000,
      failureWindow: 5000,
      fallback: {
        enabled: true,
        fallbackAgents: {
          coder: 'explore',
          deployer: 'orchestrator',
        },
      },
    });

    expect(breaker.suggestFallback('coder')).toBe('explore');
    expect(breaker.suggestFallback('deployer')).toBe('orchestrator');
    expect(breaker.suggestFallback('tester')).toBeNull(); // Not configured
  });

  it('should show suggested fallback in stats', () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 1000,
      failureWindow: 5000,
      fallback: {
        enabled: true,
        fallbackAgents: { coder: 'explore' },
      },
    });

    const stats = breaker.getStats('coder');
    expect(stats.suggestedFallbackAgent).toBe('explore');
  });
});

describe('Blocked Request Count', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 30000,
      failureWindow: 60000,
    });
  });

  it('should track blocked requests', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure('explore');
    }

    // Try to execute (will be blocked)
    await breaker.execute('explore', async () => 'should not run');
    await breaker.execute('explore', async () => 'should not run');

    const stats = breaker.getStats('explore');
    expect(stats.blockedRequestCount).toBe(2);
  });

  it('should return blockedRequestCount in execute result', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure('explore');
    }

    const result = await breaker.execute('explore', async () => 'should not run');
    expect(result.wasBlocked).toBe(true);
    expect(result.estimatedRecoveryTime).toBeDefined();
    expect(result.recommendation).toBeDefined();
  });
});

describe('Execute With Fallback', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 30000,
      failureWindow: 60000,
      fallback: {
        enabled: true,
        fallbackAgents: { coder: 'explore' },
      },
    });
  });

  it('should execute primary function when circuit is CLOSED', async () => {
    const result = await breaker.executeWithFallback('explore', async () => 'primary result');

    expect(result.success).toBe(true);
    expect(result.result).toBe('primary result');
    expect(result.usedFallback).toBe(false);
    expect(result.wasBlocked).toBe(false);
  });

  it('should use custom fallback when primary fails', async () => {
    const result = await breaker.executeWithFallback(
      'explore',
      async () => {
        throw new Error('Primary failed');
      },
      async () => 'fallback result',
    );

    expect(result.success).toBe(true);
    expect(result.result).toBe('fallback result');
    expect(result.usedFallback).toBe(true);
  });

  it('should use configured fallback function when circuit is OPEN', async () => {
    const breakerWithFn = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 30000,
      failureWindow: 60000,
      fallback: {
        enabled: true,
        fallbackFn: async (agent, error) => `fallback for ${agent}: ${error.message}`,
      },
    });

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breakerWithFn.recordFailure('explore');
    }

    const result = await breakerWithFn.executeWithFallback('explore', async () => 'should not run');

    expect(result.success).toBe(true);
    expect(result.result).toBe('fallback for explore: Circuit is open');
    expect(result.usedFallback).toBe(true);
    expect(result.wasBlocked).toBe(true);
  });

  it('should track fallback usage count', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure('explore');
    }

    await breaker.executeWithFallback(
      'explore',
      async () => 'should not run',
      async () => 'fallback',
    );

    await breaker.executeWithFallback(
      'explore',
      async () => 'should not run',
      async () => 'fallback',
    );

    const stats = breaker.getStats('explore');
    expect(stats.fallbackUsageCount).toBe(2);
  });

  it('should fail when no fallback available and circuit is OPEN', async () => {
    const breakerNoFallback = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 30000,
      failureWindow: 60000,
    });

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breakerNoFallback.recordFailure('explore');
    }

    const result = await breakerNoFallback.executeWithFallback('explore', async () => 'should not run');

    expect(result.success).toBe(false);
    expect(result.wasBlocked).toBe(true);
    expect(result.usedFallback).toBe(false);
    expect(result.recommendation).toBeDefined();
  });
});

describe('Degraded Mode', () => {
  let breaker: CircuitBreaker;

  beforeEach(() => {
    breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 30000,
      failureWindow: 60000,
      degradedMode: {
        enabled: true,
        maxConcurrentRequests: 2,
        timeout: 1000, // 1 second timeout
        maxRetries: 0,
      },
    });
  });

  it('should execute in degraded mode when circuit is OPEN and fallback not available', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure('explore');
    }

    const result = await breaker.executeWithFallback('explore', async () => 'degraded result');

    expect(result.success).toBe(true);
    expect(result.result).toBe('degraded result');
    expect(result.usedDegradedMode).toBe(true);
  });

  it('should track degraded mode usage count', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure('explore');
    }

    await breaker.executeWithFallback('explore', async () => 'result1');

    const stats = breaker.getStats('explore');
    expect(stats.degradedModeUsageCount).toBe(1);
  });

  it('should respect concurrent request limit', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure('explore');
    }

    // Start 3 concurrent requests (limit is 2)
    const results = await Promise.all([
      breaker.executeWithFallback('explore', async () => {
        await new Promise((r) => setTimeout(r, 200));
        return 'result1';
      }),
      breaker.executeWithFallback('explore', async () => {
        await new Promise((r) => setTimeout(r, 200));
        return 'result2';
      }),
      breaker.executeWithFallback('explore', async () => {
        await new Promise((r) => setTimeout(r, 200));
        return 'result3';
      }),
    ]);

    // One should fail due to capacity
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    expect(successes.length).toBe(2);
    expect(failures.length).toBe(1);
    expect(failures[0].error).toContain('at capacity');
  });

  it('should timeout in degraded mode', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure('explore');
    }

    const result = await breaker.executeWithFallback('explore', async () => {
      await new Promise((r) => setTimeout(r, 2000)); // Wait longer than timeout
      return 'should not complete';
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain('timeout');
    expect(result.usedDegradedMode).toBe(true);
  });

  it('should record success in degraded mode to help close circuit', async () => {
    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure('explore');
    }

    // Execute successfully in degraded mode
    await breaker.executeWithFallback('explore', async () => 'success');

    // The success should have been recorded, moving toward HALF_OPEN recovery
    const stats = breaker.getStats('explore');
    expect(stats.degradedModeUsageCount).toBe(1);
  });
});

describe('Generate Recommendation', () => {
  it('should suggest fallback agent when available', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 30000,
      failureWindow: 60000,
      fallback: {
        enabled: true,
        fallbackAgents: { coder: 'explore' },
      },
    });

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure('coder');
    }

    const result = await breaker.execute('coder', async () => 'should not run');
    expect(result.recommendation).toContain('explore');
  });

  it('should show recovery time when no fallback', async () => {
    const breaker = new CircuitBreaker({
      failureThreshold: 3,
      successThreshold: 2,
      resetTimeout: 30000,
      failureWindow: 60000,
    });

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      breaker.recordFailure('explore');
    }

    const result = await breaker.execute('explore', async () => 'should not run');
    expect(result.recommendation).toContain('seconds');
  });
});
