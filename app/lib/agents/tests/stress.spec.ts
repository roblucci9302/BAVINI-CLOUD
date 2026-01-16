/**
 * Stress Tests for Agent System
 *
 * Tests the system's ability to handle:
 * - Concurrent operations
 * - Resource management under load
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { CircuitBreaker, createCircuitBreaker, resetGlobalCircuitBreaker } from '../utils/circuit-breaker';
import { ToolRegistry } from '../core/tool-registry';

describe('Stress Tests', () => {
  describe('CircuitBreaker under load', () => {
    let breaker: CircuitBreaker;

    beforeEach(() => {
      resetGlobalCircuitBreaker();
      breaker = createCircuitBreaker({
        failureThreshold: 3,
        successThreshold: 2,
        resetTimeout: 50,
      });
    });

    afterEach(() => {
      resetGlobalCircuitBreaker();
    });

    it('should handle rapid success/failure transitions', async () => {
      // Rapid failures - should trip the circuit
      for (let i = 0; i < 5; i++) {
        breaker.recordFailure('coder');
      }

      // Circuit should be open (not allowed)
      expect(breaker.isAllowed('coder')).toBe(false);

      // Wait for reset timeout
      await new Promise((r) => setTimeout(r, 60));

      // Now it should be half-open, try a success
      breaker.recordSuccess('coder');
      breaker.recordSuccess('coder');

      // Circuit should be closed (allowed)
      expect(breaker.isAllowed('coder')).toBe(true);
    });

    it('should handle multiple agents independently', () => {
      // Trip coder circuit
      breaker.recordFailure('coder');
      breaker.recordFailure('coder');
      breaker.recordFailure('coder');

      expect(breaker.isAllowed('coder')).toBe(false);
      expect(breaker.isAllowed('builder')).toBe(true);

      // Trip builder circuit
      breaker.recordFailure('builder');
      breaker.recordFailure('builder');
      breaker.recordFailure('builder');

      expect(breaker.isAllowed('coder')).toBe(false);
      expect(breaker.isAllowed('builder')).toBe(false);
    });

    it('should handle many agents', () => {
      const agents = ['coder', 'builder', 'fixer', 'tester', 'reviewer', 'explore'] as const;

      for (const agent of agents) {
        breaker.recordSuccess(agent);
        breaker.recordSuccess(agent);
      }

      for (const agent of agents) {
        expect(breaker.isAllowed(agent)).toBe(true);
      }
    });

    it('should provide stats for agents', () => {
      breaker.recordFailure('coder');
      breaker.recordSuccess('coder');

      const stats = breaker.getStats('coder');

      expect(stats).toBeDefined();
      expect(stats.agent).toBe('coder');
      expect(stats.state).toBeDefined();
    });

    it('should recover from transient failures', async () => {
      // Trip the circuit
      breaker.recordFailure('fixer');
      breaker.recordFailure('fixer');
      breaker.recordFailure('fixer');

      expect(breaker.isAllowed('fixer')).toBe(false);

      // Wait for reset
      await new Promise((r) => setTimeout(r, 60));

      // Record successes to recover
      breaker.recordSuccess('fixer');
      breaker.recordSuccess('fixer');

      expect(breaker.isAllowed('fixer')).toBe(true);
    });
  });

  describe('ToolRegistry stress tests', () => {
    let registry: ToolRegistry;

    beforeEach(() => {
      registry = new ToolRegistry();
    });

    it('should handle 200 tool registrations', () => {
      for (let i = 0; i < 200; i++) {
        registry.register(
          {
            name: `tool-${i}`,
            description: `Tool ${i}`,
            inputSchema: { type: 'object', properties: {} },
          },
          async () => ({ success: true, output: i }),
          { category: `category-${i % 10}` },
        );
      }

      expect(registry.getToolNames()).toHaveLength(200);

      const category5Tools = registry.getByCategory('category-5');
      expect(category5Tools.length).toBe(20);
    });

    it('should handle concurrent tool executions', async () => {
      for (let i = 0; i < 10; i++) {
        registry.register(
          {
            name: `tool-${i}`,
            description: `Tool ${i}`,
            inputSchema: { type: 'object', properties: {} },
          },
          async () => {
            await new Promise((r) => setTimeout(r, 5));
            return { success: true, output: i };
          },
        );
      }

      const executions = registry.getToolNames().map((name) => registry.execute(name, {}));
      const results = await Promise.all(executions);

      expect(results.every((r) => r.success)).toBe(true);
    });
  });

  describe('Performance benchmarks', () => {
    it('should create circuit breaker quickly', () => {
      const start = Date.now();

      for (let i = 0; i < 1000; i++) {
        createCircuitBreaker();
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(1000);
    });

    it('should handle rapid tool lookups', () => {
      const registry = new ToolRegistry();

      for (let i = 0; i < 100; i++) {
        registry.register(
          {
            name: `tool-${i}`,
            description: `Tool ${i}`,
            inputSchema: { type: 'object', properties: {} },
          },
          async () => ({ success: true, output: null }),
        );
      }

      const start = Date.now();

      for (let i = 0; i < 10000; i++) {
        registry.get(`tool-${i % 100}`);
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500);
    });

    it('should handle rapid circuit breaker checks', () => {
      const breaker = createCircuitBreaker();

      const start = Date.now();

      for (let i = 0; i < 10000; i++) {
        breaker.isAllowed('coder');
        breaker.recordSuccess('coder');
      }

      const duration = Date.now() - start;
      expect(duration).toBeLessThan(500);
    });
  });
});
