/**
 * Integration tests for multi-agent interactions
 * Tests workflows where multiple agents collaborate
 *
 * @module agents/tests/agent-integration.spec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AgentRegistry } from '../core/agent-registry';
import { SwarmCoordinator, createSwarmCoordinator } from '../utils/swarm-coordinator';
import type { Task, TaskResult, AgentType, TaskMetrics } from '../types';
import type { BaseAgent } from '../core/base-agent';

// Mock agent factory
function createMockAgent(
  name: string,
  behavior: {
    executeResult?: TaskResult;
    executeDelay?: number;
    shouldFail?: boolean;
    dynamicOutput?: (task: Task) => TaskResult;
  } = {},
): BaseAgent {
  const {
    executeResult = { success: true, output: `${name} completed` },
    executeDelay = 0,
    shouldFail = false,
    dynamicOutput,
  } = behavior;

  const metrics: TaskMetrics = {
    inputTokens: 100,
    outputTokens: 50,
    executionTime: executeDelay || 100,
    toolCalls: 1,
    llmCalls: 1,
    toolExecutionTime: 0,
  };

  return {
    getName: () => name,
    getDescription: () => `Mock ${name} agent for integration tests`,
    getStatus: () => 'idle' as const,
    isAvailable: () => true,
    run: vi.fn().mockImplementation(async (task: Task) => {
      if (executeDelay > 0) {
        await new Promise((resolve) => setTimeout(resolve, executeDelay));
      }

      if (shouldFail) {
        return {
          success: false,
          output: `${name} failed`,
          errors: [{ code: 'MOCK_FAIL', message: 'Mock failure', recoverable: true }],
        };
      }

      if (dynamicOutput) {
        return dynamicOutput(task);
      }

      return executeResult;
    }),
    getMetrics: () => metrics,
    subscribe: vi.fn().mockReturnValue(() => {}), // Return unsubscribe function
  } as unknown as BaseAgent;
}

describe('Agent Integration - Orchestrator to Specialized Agents', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    // Reset singleton
    (AgentRegistry as any).instance = null;
    registry = AgentRegistry.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Coder -> Reviewer workflow', () => {
    it('should successfully pass code from coder to reviewer', async () => {
      // Setup: Coder produces code, Reviewer reviews it
      const coderOutput = {
        success: true,
        output: 'Created function calculateSum in utils.ts',
        artifacts: [
          {
            type: 'file' as const,
            path: 'utils.ts',
            content: 'export const calculateSum = (a, b) => a + b;',
            title: 'utils.ts',
            action: 'created' as const,
          },
        ],
      };

      const reviewerOutput = {
        success: true,
        output: 'Code review passed. Score: 85/100. Suggestions: Add TypeScript types.',
        data: { score: 85, issues: [] },
      };

      registry.register(createMockAgent('coder', { executeResult: coderOutput }));
      registry.register(createMockAgent('reviewer', { executeResult: reviewerOutput }));

      const coordinator = createSwarmCoordinator(registry, 'test-key');
      coordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'integration-1',
        type: 'coder',
        prompt: 'Create a sum function',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await coordinator.executeWithHandoffs('coder', task);

      // Verify workflow
      expect(result.chain.handoffs).toHaveLength(1);
      expect(result.chain.handoffs[0].fromAgent).toBe('coder');
      expect(result.chain.handoffs[0].toAgent).toBe('reviewer');
      expect(result.result.success).toBe(true);
      expect(result.result.output).toContain('Code review');
    });

    it('should handle reviewer finding issues and passing to fixer', async () => {
      const coderOutput = {
        success: true,
        output: 'Created code with potential issues',
      };

      const reviewerOutput = {
        success: true,
        output: 'Found 3 issues: missing types, no error handling, inconsistent naming',
        data: { score: 60, issues: ['missing_types', 'no_error_handling', 'naming'] },
      };

      const fixerOutput = {
        success: true,
        output: 'Fixed all 3 issues',
        artifacts: [
          {
            type: 'file' as const,
            path: 'utils.ts',
            content: 'fixed code',
            title: 'Fixed utils.ts',
            action: 'modified' as const,
          },
        ],
      };

      registry.register(createMockAgent('coder', { executeResult: coderOutput }));
      registry.register(
        createMockAgent('reviewer', {
          dynamicOutput: () => reviewerOutput,
        }),
      );
      registry.register(createMockAgent('fixer', { executeResult: fixerOutput }));

      const coordinator = createSwarmCoordinator(registry, 'test-key');
      coordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });
      coordinator.addRule({
        from: 'reviewer',
        to: 'fixer',
        condition: { type: 'on_pattern', pattern: /issues/i },
        priority: 10,
      });

      const task: Task = {
        id: 'integration-2',
        type: 'coder',
        prompt: 'Create code',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await coordinator.executeWithHandoffs('coder', task);

      // Should go: coder -> reviewer -> fixer
      expect(result.chain.handoffs).toHaveLength(2);
      expect(result.chain.handoffs[0].toAgent).toBe('reviewer');
      expect(result.chain.handoffs[1].toAgent).toBe('fixer');
    });
  });

  describe('Builder -> Tester workflow', () => {
    it('should run tests after successful build', async () => {
      const builderOutput = {
        success: true,
        output: 'Build successful. 0 errors, 2 warnings.',
        data: { errors: 0, warnings: 2 },
      };

      const testerOutput = {
        success: true,
        output: '42 tests passed, 0 failed. Coverage: 85%',
        data: { passed: 42, failed: 0, coverage: 85 },
      };

      registry.register(createMockAgent('builder', { executeResult: builderOutput }));
      registry.register(createMockAgent('tester', { executeResult: testerOutput }));

      const coordinator = createSwarmCoordinator(registry, 'test-key');
      coordinator.addRule({
        from: 'builder',
        to: 'tester',
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'integration-3',
        type: 'builder',
        prompt: 'Build and test the project',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await coordinator.executeWithHandoffs('builder', task);

      expect(result.chain.handoffs).toHaveLength(1);
      expect(result.result.success).toBe(true);
      expect(result.result.output).toContain('tests passed');
    });

    it('should trigger fixer when tests fail', async () => {
      const builderOutput = { success: true, output: 'Build OK' };
      const testerOutput = {
        success: false,
        output: '3 tests failed',
        errors: [{ code: 'TEST_FAIL', message: '3 tests failed', recoverable: true }],
      };
      const fixerOutput = { success: true, output: 'Fixed failing tests' };

      registry.register(createMockAgent('builder', { executeResult: builderOutput }));
      registry.register(createMockAgent('tester', { executeResult: testerOutput }));
      registry.register(createMockAgent('fixer', { executeResult: fixerOutput }));

      const coordinator = createSwarmCoordinator(registry, 'test-key');
      coordinator.addRule({
        from: 'builder',
        to: 'tester',
        condition: { type: 'on_success' },
        priority: 10,
      });
      coordinator.addRule({
        from: 'tester',
        to: 'fixer',
        condition: { type: 'on_failure' },
        priority: 10,
      });

      const task: Task = {
        id: 'integration-4',
        type: 'builder',
        prompt: 'Build and test',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await coordinator.executeWithHandoffs('builder', task);

      // builder -> tester (fail) -> fixer
      expect(result.chain.handoffs).toHaveLength(2);
      expect(result.chain.handoffs[1].fromAgent).toBe('tester');
      expect(result.chain.handoffs[1].toAgent).toBe('fixer');
    });
  });

  describe('Explore -> Coder workflow', () => {
    it('should coder receive context from explore', async () => {
      const exploreOutput = {
        success: true,
        output: 'Found relevant files: src/utils.ts, src/helpers.ts. Architecture: modular.',
        artifacts: [
          { type: 'file' as const, path: 'src/utils.ts', content: '// utils', title: 'utils.ts' },
          { type: 'file' as const, path: 'src/helpers.ts', content: '// helpers', title: 'helpers.ts' },
        ],
      };

      const coderOutput = {
        success: true,
        output: 'Created new feature using discovered architecture',
      };

      registry.register(createMockAgent('explore', { executeResult: exploreOutput }));
      registry.register(createMockAgent('coder', { executeResult: coderOutput }));

      const coordinator = createSwarmCoordinator(registry, 'test-key');
      coordinator.addRule({
        from: 'explore',
        to: 'coder',
        condition: { type: 'on_success' },
        priority: 10,
        transformTask: (task, result) => ({
          ...task,
          id: `${task.id}-coder`,
          prompt: `${task.prompt}\n\nContext from exploration:\n${result.output}`,
          context: { ...task.context, artifacts: result.artifacts },
        }),
      });

      const task: Task = {
        id: 'integration-5',
        type: 'explore',
        prompt: 'Find relevant files and then implement feature',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await coordinator.executeWithHandoffs('explore', task);

      expect(result.chain.handoffs).toHaveLength(1);
      expect(result.result.success).toBe(true);
    });
  });
});

describe('Agent Integration - Error Handling', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    (AgentRegistry as any).instance = null;
    registry = AgentRegistry.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Agent failure recovery', () => {
    it('should handle agent throwing exception', async () => {
      const failingAgent = {
        getName: () => 'failing',
        getDescription: () => 'Agent that throws',
        getStatus: () => 'idle' as const,
        isAvailable: () => true,
        run: vi.fn().mockRejectedValue(new Error('Agent crashed')),
        getMetrics: () => ({
          inputTokens: 0,
          outputTokens: 0,
          executionTime: 0,
          toolCalls: 0,
          llmCalls: 0,
          toolExecutionTime: 0,
        }),
        subscribe: vi.fn().mockReturnValue(() => {}),
      } as unknown as BaseAgent;

      registry.register(failingAgent);

      const coordinator = createSwarmCoordinator(registry, 'test-key');

      const task: Task = {
        id: 'error-1',
        type: 'failing' as AgentType,
        prompt: 'Do something',
        status: 'pending',
        createdAt: new Date(),
      };

      // The coordinator handles the error and returns a failed result
      const result = await coordinator.executeWithHandoffs('failing' as AgentType, task);

      expect(result.chain.status).toBe('failed');
      expect(result.result.success).toBe(false);
    });

    it('should handle missing agent gracefully', async () => {
      // Register only coder, not reviewer
      registry.register(createMockAgent('coder', { executeResult: { success: true, output: 'Done' } }));

      const coordinator = createSwarmCoordinator(registry, 'test-key');
      coordinator.addRule({
        from: 'coder',
        to: 'reviewer', // reviewer is not registered
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'error-2',
        type: 'coder',
        prompt: 'Create code',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await coordinator.executeWithHandoffs('coder', task);

      // Should fail because reviewer is not available
      expect(result.chain.status).toBe('failed');
    });
  });

  describe('Timeout handling', () => {
    it('should handle slow agents within timeout', async () => {
      registry.register(
        createMockAgent('slow', {
          executeDelay: 100,
          executeResult: { success: true, output: 'Finally done' },
        }),
      );

      const coordinator = createSwarmCoordinator(registry, 'test-key', {
        config: {
          handoffTimeout: 5000, // 5 second timeout
          maxHandoffs: 10,
          verbose: false,
          allowCycles: false,
          maxVisitsPerAgent: 2,
          stagnationThreshold: 2,
          enableStagnationDetection: true,
        },
      });

      const task: Task = {
        id: 'timeout-1',
        type: 'slow' as AgentType,
        prompt: 'Do slow work',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await coordinator.executeWithHandoffs('slow' as AgentType, task);

      expect(result.result.success).toBe(true);
    });
  });
});

describe('Agent Integration - Data Flow', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    (AgentRegistry as any).instance = null;
    registry = AgentRegistry.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Artifact propagation', () => {
    it('should collect artifacts from all agents in chain', async () => {
      const coderOutput = {
        success: true,
        output: 'Created files',
        artifacts: [
          { type: 'file' as const, path: 'src/new.ts', content: 'code', title: 'new.ts', action: 'created' as const },
        ],
      };

      const reviewerOutput = {
        success: true,
        output: 'Review complete',
        artifacts: [{ type: 'analysis' as const, path: 'review.md', content: '# Review Report', title: 'Review' }],
      };

      registry.register(createMockAgent('coder', { executeResult: coderOutput }));
      registry.register(createMockAgent('reviewer', { executeResult: reviewerOutput }));

      const coordinator = createSwarmCoordinator(registry, 'test-key');
      coordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'artifacts-1',
        type: 'coder',
        prompt: 'Create and review',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await coordinator.executeWithHandoffs('coder', task);

      // Final result has reviewer's artifacts
      expect(result.result.artifacts).toBeDefined();
    });
  });

  describe('Context enrichment through chain', () => {
    it('should pass enriched context through transforms', async () => {
      let receivedContext: any = null;

      const exploreAgent = createMockAgent('explore', {
        executeResult: {
          success: true,
          output: 'Found: utils.ts',
          data: { files: ['utils.ts'] },
        },
      });

      const coderAgent = {
        ...createMockAgent('coder'),
        run: vi.fn().mockImplementation(async (task: Task) => {
          receivedContext = task.context;
          return { success: true, output: 'Code created with context' };
        }),
      } as unknown as BaseAgent;

      registry.register(exploreAgent);
      registry.register(coderAgent);

      const coordinator = createSwarmCoordinator(registry, 'test-key');
      coordinator.addRule({
        from: 'explore',
        to: 'coder',
        condition: { type: 'on_success' },
        priority: 10,
        transformTask: (task, result) => ({
          ...task,
          id: `${task.id}-coder`,
          context: {
            ...task.context,
            additionalInfo: { discoveredFiles: result.data?.files || [] },
          },
        }),
      });

      const task: Task = {
        id: 'context-1',
        type: 'explore',
        prompt: 'Explore and code',
        status: 'pending',
        createdAt: new Date(),
        context: { files: ['initial.ts'] },
      };

      await coordinator.executeWithHandoffs('explore', task);

      // Verify context was enriched
      expect(receivedContext).toBeDefined();
      expect(receivedContext.additionalInfo?.discoveredFiles).toEqual(['utils.ts']);
    });
  });
});

describe('Agent Integration - Performance', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    (AgentRegistry as any).instance = null;
    registry = AgentRegistry.getInstance();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Chain execution timing', () => {
    it('should track execution duration for each handoff', async () => {
      registry.register(
        createMockAgent('agent1', { executeDelay: 50, executeResult: { success: true, output: 'Done 1' } }),
      );
      registry.register(
        createMockAgent('agent2', { executeDelay: 50, executeResult: { success: true, output: 'Done 2' } }),
      );

      const coordinator = createSwarmCoordinator(registry, 'test-key');
      coordinator.addRule({
        from: 'agent1' as AgentType,
        to: 'agent2' as AgentType,
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'perf-1',
        type: 'agent1' as AgentType,
        prompt: 'Test',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await coordinator.executeWithHandoffs('agent1' as AgentType, task);

      // Each handoff should have duration recorded
      for (const handoff of result.chain.handoffs) {
        expect(handoff.duration).toBeGreaterThanOrEqual(0);
      }
    });
  });
});
