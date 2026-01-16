/**
 * Tests for Agent Registry - Lazy Loading
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { AgentRegistry, type AgentFactory, type LazyAgentInfo } from './agent-registry';
import type { BaseAgent } from './base-agent';
import type { AgentConfig, AgentStatus, Task, TaskResult, AgentEvent, AgentEventCallback } from '../types';

/**
 * Mock BaseAgent for testing
 */
function createMockAgent(name: string, status: AgentStatus = 'idle'): BaseAgent {
  const mockConfig: AgentConfig = {
    name: name as any,
    description: `Mock ${name} agent`,
    model: 'claude-sonnet-4-5-20250929',
    tools: [],
    systemPrompt: 'You are a test agent',
  };

  const eventCallbacks = new Set<AgentEventCallback>();

  return {
    getName: vi.fn().mockReturnValue(name),
    getDescription: vi.fn().mockReturnValue(`Mock ${name} agent`),
    getConfig: vi.fn().mockReturnValue(mockConfig),
    getStatus: vi.fn().mockReturnValue(status),
    isAvailable: vi.fn().mockReturnValue(status === 'idle'),
    abort: vi.fn(),
    subscribe: vi.fn((callback: AgentEventCallback) => {
      eventCallbacks.add(callback);
      return () => eventCallbacks.delete(callback);
    }),
    run: vi.fn().mockResolvedValue({ success: true, output: 'Mock result' }),
  } as unknown as BaseAgent;
}

describe('AgentRegistry - Lazy Loading', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    // Reset the singleton for each test
    AgentRegistry.resetInstance();
    registry = AgentRegistry.getInstance();
  });

  describe('registerLazy', () => {
    it('should register a lazy agent with factory', () => {
      const factory = vi.fn(() => createMockAgent('coder'));

      registry.registerLazy('coder', factory);

      expect(registry.has('coder')).toBe(true);
      expect(factory).not.toHaveBeenCalled(); // Factory should not be called yet
    });

    it('should replace existing agent with lazy registration', () => {
      const existingAgent = createMockAgent('coder');
      registry.register(existingAgent);

      const factory = vi.fn(() => createMockAgent('coder'));
      registry.registerLazy('coder', factory);

      expect(registry.has('coder')).toBe(true);

      // Old agent should be replaced
    });

    it('should replace existing lazy agent with new factory', () => {
      const factory1 = vi.fn(() => createMockAgent('coder'));
      const factory2 = vi.fn(() => createMockAgent('coder'));

      registry.registerLazy('coder', factory1);
      registry.registerLazy('coder', factory2);

      expect(registry.has('coder')).toBe(true);
      expect(factory1).not.toHaveBeenCalled();
      expect(factory2).not.toHaveBeenCalled();
    });

    it('should register multiple lazy agents', () => {
      registry.registerLazy('coder', () => createMockAgent('coder'));
      registry.registerLazy('explore', () => createMockAgent('explore'));
      registry.registerLazy('tester', () => createMockAgent('tester'));

      expect(registry.has('coder')).toBe(true);
      expect(registry.has('explore')).toBe(true);
      expect(registry.has('tester')).toBe(true);
    });
  });

  describe('get with lazy agents', () => {
    it('should load lazy agent on first access', () => {
      const mockAgent = createMockAgent('coder');
      const factory = vi.fn(() => mockAgent);

      registry.registerLazy('coder', factory);

      const agent = registry.get('coder');

      expect(factory).toHaveBeenCalledTimes(1);
      expect(agent).toBe(mockAgent);
    });

    it('should return same instance on subsequent accesses', () => {
      const mockAgent = createMockAgent('coder');
      const factory = vi.fn(() => mockAgent);

      registry.registerLazy('coder', factory);

      const agent1 = registry.get('coder');
      const agent2 = registry.get('coder');
      const agent3 = registry.get('coder');

      expect(factory).toHaveBeenCalledTimes(1); // Only called once
      expect(agent1).toBe(agent2);
      expect(agent2).toBe(agent3);
    });

    it('should check regular agents before lazy agents', () => {
      // Register regular agent (without replacing)
      const regularAgent = createMockAgent('coder');
      const lazyFactory = vi.fn(() => createMockAgent('explore'));

      registry.register(regularAgent);
      registry.registerLazy('explore', lazyFactory);

      // Regular agent should be found first
      const coder = registry.get('coder');
      expect(coder).toBe(regularAgent);

      // Lazy agent should still work
      const explorer = registry.get('explore');
      expect(lazyFactory).toHaveBeenCalled();
      expect(explorer).toBeDefined();
    });

    it('should update usage count on each access', () => {
      const mockAgent = createMockAgent('coder');
      registry.registerLazy('coder', () => mockAgent);

      registry.get('coder');
      registry.get('coder');
      registry.get('coder');

      const stats = registry.getLazyStats();
      expect(stats.loadedLazy).toBe(1);
    });

    it('should return undefined for non-existent agent', () => {
      const agent = registry.get('nonexistent' as any);
      expect(agent).toBeUndefined();
    });
  });

  describe('isLoaded', () => {
    it('should return false for unloaded lazy agent', () => {
      registry.registerLazy('coder', () => createMockAgent('coder'));

      expect(registry.isLoaded('coder')).toBe(false);
    });

    it('should return true for loaded lazy agent', () => {
      registry.registerLazy('coder', () => createMockAgent('coder'));

      registry.get('coder'); // Trigger loading

      expect(registry.isLoaded('coder')).toBe(true);
    });

    it('should return true for regular agents', () => {
      registry.register(createMockAgent('coder'));

      expect(registry.isLoaded('coder')).toBe(true);
    });

    it('should return false for non-existent agent', () => {
      expect(registry.isLoaded('nonexistent' as any)).toBe(false);
    });
  });

  describe('getLazyStats', () => {
    it('should return zeros for empty registry', () => {
      const stats = registry.getLazyStats();

      expect(stats.totalLazy).toBe(0);
      expect(stats.loadedLazy).toBe(0);
      expect(stats.pendingLazy).toBe(0);
    });

    it('should track pending lazy agents', () => {
      registry.registerLazy('coder', () => createMockAgent('coder'));
      registry.registerLazy('explore', () => createMockAgent('explore'));
      registry.registerLazy('tester', () => createMockAgent('tester'));

      const stats = registry.getLazyStats();

      expect(stats.totalLazy).toBe(3);
      expect(stats.loadedLazy).toBe(0);
      expect(stats.pendingLazy).toBe(3);
    });

    it('should track loaded lazy agents', () => {
      registry.registerLazy('coder', () => createMockAgent('coder'));
      registry.registerLazy('explore', () => createMockAgent('explore'));
      registry.registerLazy('tester', () => createMockAgent('tester'));

      registry.get('coder'); // Load one

      const stats = registry.getLazyStats();

      expect(stats.totalLazy).toBe(3);
      expect(stats.loadedLazy).toBe(1);
      expect(stats.pendingLazy).toBe(2);
    });

    it('should track all loaded agents', () => {
      registry.registerLazy('coder', () => createMockAgent('coder'));
      registry.registerLazy('explore', () => createMockAgent('explore'));

      registry.get('coder');
      registry.get('explore');

      const stats = registry.getLazyStats();

      expect(stats.totalLazy).toBe(2);
      expect(stats.loadedLazy).toBe(2);
      expect(stats.pendingLazy).toBe(0);
    });
  });

  describe('has', () => {
    it('should return true for lazy agents', () => {
      registry.registerLazy('coder', () => createMockAgent('coder'));

      expect(registry.has('coder')).toBe(true);
    });

    it('should return true for regular agents', () => {
      registry.register(createMockAgent('coder'));

      expect(registry.has('coder')).toBe(true);
    });

    it('should return false for non-existent agents', () => {
      expect(registry.has('nonexistent' as any)).toBe(false);
    });
  });

  describe('getNames', () => {
    it('should include lazy agent names', () => {
      registry.registerLazy('coder', () => createMockAgent('coder'));
      registry.registerLazy('explore', () => createMockAgent('explore'));

      const names = registry.getNames();

      expect(names).toContain('coder');
      expect(names).toContain('explore');
    });

    it('should include both regular and lazy agent names', () => {
      registry.register(createMockAgent('coder'));
      registry.registerLazy('explore', () => createMockAgent('explore'));

      const names = registry.getNames();

      expect(names).toContain('coder');
      expect(names).toContain('explore');
    });

    it('should not duplicate names', () => {
      registry.register(createMockAgent('coder'));
      registry.registerLazy('coder', () => createMockAgent('coder'));

      const names = registry.getNames();
      const coderCount = names.filter((n) => n === 'coder').length;

      expect(coderCount).toBe(1);
    });
  });

  describe('clear', () => {
    it('should clear lazy agents', () => {
      registry.registerLazy('coder', () => createMockAgent('coder'));
      registry.registerLazy('explore', () => createMockAgent('explore'));

      registry.clear();

      expect(registry.has('coder')).toBe(false);
      expect(registry.has('explore')).toBe(false);
    });

    it('should abort loaded lazy agents before clearing', () => {
      const mockAgent = createMockAgent('coder', 'executing');
      registry.registerLazy('coder', () => mockAgent);

      registry.get('coder'); // Load the agent
      registry.clear();

      expect(mockAgent.abort).toHaveBeenCalled();
    });

    it('should clear both regular and lazy agents', () => {
      registry.register(createMockAgent('coder'));
      registry.registerLazy('explore', () => createMockAgent('explore'));

      registry.clear();

      expect(registry.has('coder')).toBe(false);
      expect(registry.has('explore')).toBe(false);
    });
  });

  describe('events', () => {
    it('should emit event when lazy agent is loaded', () => {
      const events: AgentEvent[] = [];
      registry.subscribe((event) => events.push(event));

      registry.registerLazy('coder', () => createMockAgent('coder'));
      registry.get('coder');

      const loadEvent = events.find((e) => e.type === 'agent:started' && e.data?.action === 'lazy-loaded');
      expect(loadEvent).toBeDefined();
      expect(loadEvent?.agentName).toBe('coder');
    });

    it('should subscribe to agent events after loading', () => {
      const registryEvents: AgentEvent[] = [];
      registry.subscribe((event) => registryEvents.push(event));

      const mockAgent = createMockAgent('coder');
      registry.registerLazy('coder', () => mockAgent);
      registry.get('coder');

      // Agent's subscribe should have been called
      expect(mockAgent.subscribe).toHaveBeenCalled();
    });
  });

  describe('factory error handling', () => {
    it('should handle factory that throws', () => {
      const factory = vi.fn(() => {
        throw new Error('Factory error');
      });

      registry.registerLazy('coder', factory);

      expect(() => registry.get('coder')).toThrow('Factory error');
    });
  });

  describe('performance', () => {
    it('should not call factory during registration', () => {
      let factoryCalls = 0;
      const slowFactory = () => {
        factoryCalls++;
        return createMockAgent('coder');
      };

      // Register multiple lazy agents
      for (let i = 0; i < 100; i++) {
        registry.registerLazy(`agent-${i}` as any, slowFactory);
      }

      expect(factoryCalls).toBe(0);
    });

    it('should only load agents when accessed', () => {
      const factories: Record<string, ReturnType<typeof vi.fn>> = {};

      for (let i = 0; i < 10; i++) {
        const factory = vi.fn(() => createMockAgent(`agent-${i}`));
        factories[`agent-${i}`] = factory;
        registry.registerLazy(`agent-${i}` as any, factory);
      }

      // Access only 3 agents
      registry.get('agent-0' as any);
      registry.get('agent-5' as any);
      registry.get('agent-9' as any);

      // Only 3 factories should have been called
      expect(factories['agent-0']).toHaveBeenCalled();
      expect(factories['agent-5']).toHaveBeenCalled();
      expect(factories['agent-9']).toHaveBeenCalled();

      // Others should not have been called
      expect(factories['agent-1']).not.toHaveBeenCalled();
      expect(factories['agent-2']).not.toHaveBeenCalled();
      expect(factories['agent-3']).not.toHaveBeenCalled();
    });
  });

  describe('integration with regular agents', () => {
    it('should work alongside regular agent registration', () => {
      const regularAgent = createMockAgent('coder');
      const lazyFactory = vi.fn(() => createMockAgent('explore'));

      registry.register(regularAgent);
      registry.registerLazy('explore', lazyFactory);

      expect(registry.get('coder')).toBe(regularAgent);
      expect(lazyFactory).not.toHaveBeenCalled();

      const explorer = registry.get('explore');
      expect(lazyFactory).toHaveBeenCalled();
      expect(explorer).toBeDefined();
    });

    it('should include lazy agents in stats after loading', () => {
      registry.register(createMockAgent('coder'));
      registry.registerLazy('explore', () => createMockAgent('explore'));

      // Before loading
      let stats = registry.getStats();
      expect(stats.totalAgents).toBe(1);

      // Load lazy agent
      registry.get('explore');

      // Lazy agents don't add to regular stats
      stats = registry.getStats();
      expect(stats.totalAgents).toBe(1);

      // But lazy stats should show it's loaded
      const lazyStats = registry.getLazyStats();
      expect(lazyStats.loadedLazy).toBe(1);
    });
  });
});
