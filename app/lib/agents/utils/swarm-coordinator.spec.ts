/**
 * Tests for SwarmCoordinator with anti-loop protection
 * @module agents/utils/swarm-coordinator.spec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { SwarmCoordinator, createSwarmCoordinator, type HandoffRule, type SwarmChain } from './swarm-coordinator';
import { AgentRegistry } from '../core/agent-registry';
import type { Task, TaskResult, AgentType } from '../types';

// Mock agent for testing
function createMockAgent(name: string, executeResult: TaskResult) {
  return {
    getName: () => name,
    getDescription: () => `Mock ${name} agent`,
    getStatus: () => 'idle' as const,
    isAvailable: () => true,
    run: vi.fn().mockResolvedValue(executeResult),
    getMetrics: () => ({
      inputTokens: 0,
      outputTokens: 0,
      executionTime: 0,
      toolCalls: 0,
      llmCalls: 0,
      toolExecutionTime: 0,
    }),
    subscribe: vi.fn().mockReturnValue(() => {}), // Return unsubscribe function
  };
}

describe('SwarmCoordinator', () => {
  let registry: AgentRegistry;
  let coordinator: SwarmCoordinator;

  beforeEach(() => {
    // Reset singleton
    (AgentRegistry as any).instance = null;
    registry = AgentRegistry.getInstance();

    // Register mock agents
    registry.register(createMockAgent('coder', { success: true, output: 'Code written' }) as any);
    registry.register(createMockAgent('reviewer', { success: true, output: 'Code reviewed' }) as any);
    registry.register(createMockAgent('fixer', { success: true, output: 'Code fixed' }) as any);
    registry.register(createMockAgent('tester', { success: true, output: 'Tests passed' }) as any);
    registry.register(createMockAgent('explore', { success: true, output: 'Explored' }) as any);

    coordinator = createSwarmCoordinator(registry, 'test-api-key');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Basic functionality', () => {
    it('should create a coordinator with default config', () => {
      expect(coordinator).toBeDefined();
      expect(coordinator.getAllRules()).toEqual([]);
    });

    it('should add handoff rules', () => {
      const rule: HandoffRule = {
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      };

      coordinator.addRule(rule);
      expect(coordinator.getRulesFor('coder')).toHaveLength(1);
      expect(coordinator.getRulesFor('coder')[0].to).toBe('reviewer');
    });

    it('should add multiple rules', () => {
      coordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });
      coordinator.addRule({
        from: 'reviewer',
        to: 'fixer',
        condition: { type: 'on_failure' },
        priority: 10,
      });
      expect(coordinator.getAllRules()).toHaveLength(2);
    });
  });

  describe('Anti-loop protection - maxVisitsPerAgent', () => {
    it('should stop when agent is visited more than maxVisitsPerAgent times', async () => {
      // Create coordinator with strict limit
      const strictCoordinator = createSwarmCoordinator(registry, 'test-api-key', {
        config: {
          maxVisitsPerAgent: 2,
          allowCycles: true, // Allow cycles but limit visits
          maxHandoffs: 10,
          handoffTimeout: 60000,
          verbose: false,
          stagnationThreshold: 2,
          enableStagnationDetection: true,
        },
      });

      // Add rules that create a cycle: coder -> reviewer -> coder -> reviewer -> ...
      strictCoordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });
      strictCoordinator.addRule({
        from: 'reviewer',
        to: 'coder',
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'test-task',
        type: 'coder',
        prompt: 'Write some code',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await strictCoordinator.executeWithHandoffs('coder', task);

      // With maxVisitsPerAgent = 2 in a coder <-> reviewer cycle:
      // coder(1) -> reviewer(1) -> coder(2) -> reviewer(2) -> STOP
      // The chain should stop once an agent would exceed the visit limit
      // Each visit may record a handoff, so expect <= 4 handoffs
      expect(result.chain.handoffs.length).toBeLessThanOrEqual(4);
      expect(result.chain.status).toBe('completed');
    });

    it('should track visit counts per agent correctly', async () => {
      const strictCoordinator = createSwarmCoordinator(registry, 'test-api-key', {
        config: {
          maxVisitsPerAgent: 3,
          allowCycles: true,
          maxHandoffs: 10,
          handoffTimeout: 60000,
          verbose: false,
          stagnationThreshold: 2,
          enableStagnationDetection: true,
        },
      });

      // coder -> reviewer -> fixer -> coder (cycle)
      strictCoordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });
      strictCoordinator.addRule({
        from: 'reviewer',
        to: 'fixer',
        condition: { type: 'on_success' },
        priority: 10,
      });
      strictCoordinator.addRule({
        from: 'fixer',
        to: 'coder',
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'test-task',
        type: 'coder',
        prompt: 'Write code',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await strictCoordinator.executeWithHandoffs('coder', task);

      // Check that agentVisitCount is properly tracked
      expect(result.chain.agentVisitCount).toBeDefined();
      expect(result.chain.agentVisitCount.get('coder')).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Anti-loop protection - stagnation detection', () => {
    it('should detect stagnation when outputs are identical', async () => {
      // Create agents that return identical outputs
      (AgentRegistry as any).instance = null;
      const stagnantRegistry = AgentRegistry.getInstance();

      const identicalOutput = { success: true, output: 'Same output every time' };
      stagnantRegistry.register(createMockAgent('coder', identicalOutput) as any);
      stagnantRegistry.register(createMockAgent('reviewer', identicalOutput) as any);
      stagnantRegistry.register(createMockAgent('fixer', identicalOutput) as any);

      const stagnantCoordinator = createSwarmCoordinator(stagnantRegistry, 'test-api-key', {
        config: {
          maxVisitsPerAgent: 10, // High limit
          stagnationThreshold: 2, // Detect after 2 identical outputs
          enableStagnationDetection: true,
          allowCycles: true,
          maxHandoffs: 10,
          handoffTimeout: 60000,
          verbose: false,
        },
      });

      stagnantCoordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });
      stagnantCoordinator.addRule({
        from: 'reviewer',
        to: 'fixer',
        condition: { type: 'on_success' },
        priority: 10,
      });
      stagnantCoordinator.addRule({
        from: 'fixer',
        to: 'coder',
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'test-task',
        type: 'coder',
        prompt: 'Write code',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await stagnantCoordinator.executeWithHandoffs('coder', task);

      // Should stop due to stagnation, not max handoffs
      expect(result.chain.lastOutputHashes.length).toBeGreaterThanOrEqual(2);
      expect(result.chain.status).toBe('completed');
    });

    it('should not detect stagnation when outputs differ', async () => {
      // Create agents that return different outputs
      (AgentRegistry as any).instance = null;
      const diverseRegistry = AgentRegistry.getInstance();

      let callCount = 0;
      const dynamicAgent = (name: string) => ({
        getName: () => name,
        getDescription: () => `Mock ${name} agent`,
        getStatus: () => 'idle' as const,
        isAvailable: () => true,
        run: vi.fn().mockImplementation(async () => {
          callCount++;
          return { success: true, output: `Output ${callCount} from ${name}` };
        }),
        getMetrics: () => ({
          inputTokens: 0,
          outputTokens: 0,
          executionTime: 0,
          toolCalls: 0,
          llmCalls: 0,
          toolExecutionTime: 0,
        }),
        subscribe: vi.fn().mockReturnValue(() => {}),
      });

      diverseRegistry.register(dynamicAgent('coder') as any);
      diverseRegistry.register(dynamicAgent('reviewer') as any);

      const diverseCoordinator = createSwarmCoordinator(diverseRegistry, 'test-api-key', {
        config: {
          maxHandoffs: 4,
          maxVisitsPerAgent: 3,
          stagnationThreshold: 2,
          enableStagnationDetection: true,
          allowCycles: true,
          handoffTimeout: 60000,
          verbose: false,
        },
      });

      diverseCoordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });
      diverseCoordinator.addRule({
        from: 'reviewer',
        to: 'coder',
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'test-task',
        type: 'coder',
        prompt: 'Write code',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await diverseCoordinator.executeWithHandoffs('coder', task);

      // Should stop due to maxHandoffs or maxVisitsPerAgent, not stagnation
      // because outputs are different each time
      const hashSet = new Set(result.chain.lastOutputHashes);
      expect(hashSet.size).toBeGreaterThan(1); // Hashes should be different
    });

    it('should disable stagnation detection when configured', async () => {
      const noStagnationCoordinator = createSwarmCoordinator(registry, 'test-api-key', {
        config: {
          maxHandoffs: 5,
          maxVisitsPerAgent: 10,
          enableStagnationDetection: false, // Disabled
          allowCycles: true,
          handoffTimeout: 60000,
          verbose: false,
          stagnationThreshold: 2,
        },
      });

      noStagnationCoordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });
      noStagnationCoordinator.addRule({
        from: 'reviewer',
        to: 'coder',
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'test-task',
        type: 'coder',
        prompt: 'Write code',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await noStagnationCoordinator.executeWithHandoffs('coder', task);

      // Should stop due to maxHandoffs, not stagnation
      expect(result.chain.handoffs.length).toBeLessThanOrEqual(5);
    });
  });

  describe('Cycle detection (legacy)', () => {
    it('should prevent cycles when allowCycles is false', async () => {
      const noCycleCoordinator = createSwarmCoordinator(registry, 'test-api-key', {
        config: {
          allowCycles: false,
          maxHandoffs: 10,
          handoffTimeout: 60000,
          verbose: false,
          maxVisitsPerAgent: 2,
          stagnationThreshold: 2,
          enableStagnationDetection: true,
        },
      });

      noCycleCoordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });
      noCycleCoordinator.addRule({
        from: 'reviewer',
        to: 'coder',
        condition: { type: 'on_success' },
        priority: 10,
      }); // Would create cycle

      const task: Task = {
        id: 'test-task',
        type: 'coder',
        prompt: 'Write code',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await noCycleCoordinator.executeWithHandoffs('coder', task);

      // Should stop after coder -> reviewer (no return to coder)
      expect(result.chain.handoffs.length).toBeLessThanOrEqual(2);
    });
  });

  describe('Handoff rules', () => {
    it('should execute on_success handoff when task succeeds', async () => {
      coordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'test-task',
        type: 'coder',
        prompt: 'Write code',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await coordinator.executeWithHandoffs('coder', task);

      expect(result.chain.handoffs.length).toBe(1);
      expect(result.chain.handoffs[0].fromAgent).toBe('coder');
      expect(result.chain.handoffs[0].toAgent).toBe('reviewer');
    });

    it('should execute on_failure handoff when task fails', async () => {
      // Replace coder with failing agent
      (AgentRegistry as any).instance = null;
      const failRegistry = AgentRegistry.getInstance();

      failRegistry.register(createMockAgent('coder', { success: false, output: 'Error' }) as any);
      failRegistry.register(createMockAgent('fixer', { success: true, output: 'Fixed' }) as any);

      const failCoordinator = createSwarmCoordinator(failRegistry, 'test-api-key');

      failCoordinator.addRule({
        from: 'coder',
        to: 'fixer',
        condition: { type: 'on_failure' },
        priority: 10,
      });

      const task: Task = {
        id: 'test-task',
        type: 'coder',
        prompt: 'Write code',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await failCoordinator.executeWithHandoffs('coder', task);

      expect(result.chain.handoffs.length).toBe(1);
      expect(result.chain.handoffs[0].fromAgent).toBe('coder');
      expect(result.chain.handoffs[0].toAgent).toBe('fixer');
    });

    it('should execute on_pattern handoff when output matches', async () => {
      (AgentRegistry as any).instance = null;
      const patternRegistry = AgentRegistry.getInstance();

      patternRegistry.register(
        createMockAgent('coder', { success: true, output: 'Code has TypeScript errors' }) as any,
      );
      patternRegistry.register(createMockAgent('fixer', { success: true, output: 'Fixed' }) as any);

      const patternCoordinator = createSwarmCoordinator(patternRegistry, 'test-api-key');

      patternCoordinator.addRule({
        from: 'coder',
        to: 'fixer',
        condition: { type: 'on_pattern', pattern: /error/i },
        priority: 10,
      });

      const task: Task = {
        id: 'test-task',
        type: 'coder',
        prompt: 'Write code',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await patternCoordinator.executeWithHandoffs('coder', task);

      expect(result.chain.handoffs.length).toBe(1);
      expect(result.chain.handoffs[0].toAgent).toBe('fixer');
    });
  });

  describe('Chain management', () => {
    it('should track active chains', async () => {
      coordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'test-task',
        type: 'coder',
        prompt: 'Write code',
        status: 'pending',
        createdAt: new Date(),
      };

      // Start execution
      const resultPromise = coordinator.executeWithHandoffs('coder', task);

      // Chain should be tracked (may already be completed in fast execution)
      const result = await resultPromise;
      expect(result.chain.id).toBeDefined();
      expect(result.chain.startAgent).toBe('coder');
    });

    it('should return final result from last agent in chain', async () => {
      (AgentRegistry as any).instance = null;
      const resultRegistry = AgentRegistry.getInstance();

      resultRegistry.register(createMockAgent('coder', { success: true, output: 'Code' }) as any);
      resultRegistry.register(createMockAgent('reviewer', { success: true, output: 'Final review result' }) as any);

      const resultCoordinator = createSwarmCoordinator(resultRegistry, 'test-api-key');

      resultCoordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'test-task',
        type: 'coder',
        prompt: 'Write code',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await resultCoordinator.executeWithHandoffs('coder', task);

      expect(result.result.output).toBe('Final review result');
    });
  });

  describe('Configuration', () => {
    it('should respect maxHandoffs limit', async () => {
      const limitedCoordinator = createSwarmCoordinator(registry, 'test-api-key', {
        config: {
          maxHandoffs: 2,
          allowCycles: true,
          maxVisitsPerAgent: 10,
          handoffTimeout: 60000,
          verbose: false,
          stagnationThreshold: 2,
          enableStagnationDetection: true,
        },
      });

      limitedCoordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 10,
      });
      limitedCoordinator.addRule({
        from: 'reviewer',
        to: 'fixer',
        condition: { type: 'on_success' },
        priority: 10,
      });
      limitedCoordinator.addRule({
        from: 'fixer',
        to: 'tester',
        condition: { type: 'on_success' },
        priority: 10,
      });
      limitedCoordinator.addRule({
        from: 'tester',
        to: 'coder',
        condition: { type: 'on_success' },
        priority: 10,
      });

      const task: Task = {
        id: 'test-task',
        type: 'coder',
        prompt: 'Write code',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await limitedCoordinator.executeWithHandoffs('coder', task);

      expect(result.chain.handoffs.length).toBeLessThanOrEqual(2);
    });

    it('should use custom stagnation threshold', async () => {
      const customThresholdCoordinator = createSwarmCoordinator(registry, 'test-api-key', {
        config: {
          maxHandoffs: 10,
          stagnationThreshold: 3, // Need 3 identical outputs
          enableStagnationDetection: true,
          allowCycles: true,
          maxVisitsPerAgent: 10,
          handoffTimeout: 60000,
          verbose: false,
        },
      });

      // This tests that the threshold is configurable
      expect(customThresholdCoordinator).toBeDefined();
    });
  });
});
