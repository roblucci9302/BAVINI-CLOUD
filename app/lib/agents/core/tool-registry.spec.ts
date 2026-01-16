/**
 * Tests pour ToolRegistry
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry } from './tool-registry';
import type { ToolDefinition, ToolExecutionResult } from '../types';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  // Mock tool definition
  const mockTool: ToolDefinition = {
    name: 'test_tool',
    description: 'A test tool for unit testing',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Test input' },
        count: { type: 'number', description: 'Test count' },
      },
      required: ['input'],
    },
  };

  // Mock handler
  const mockHandler = vi.fn().mockResolvedValue({
    success: true,
    output: 'test result',
  } as ToolExecutionResult);

  beforeEach(() => {
    registry = new ToolRegistry();
    vi.clearAllMocks();
  });

  /*
   * ==========================================================================
   * REGISTRATION TESTS
   * ==========================================================================
   */

  describe('register', () => {
    it('should register a tool successfully', () => {
      registry.register(mockTool, mockHandler);

      expect(registry.has('test_tool')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should store the definition and handler', () => {
      registry.register(mockTool, mockHandler);

      const registered = registry.get('test_tool');

      expect(registered).toBeDefined();
      expect(registered?.definition).toEqual(mockTool);
      expect(registered?.handler).toBe(mockHandler);
    });

    it('should store category and priority', () => {
      registry.register(mockTool, mockHandler, {
        category: 'test',
        priority: 10,
      });

      const registered = registry.get('test_tool');

      expect(registered?.category).toBe('test');
      expect(registered?.priority).toBe(10);
    });

    it('should throw if tool already registered without override', () => {
      registry.register(mockTool, mockHandler);

      expect(() => registry.register(mockTool, mockHandler)).toThrow("Tool 'test_tool' is already registered");
    });

    it('should allow override with override option', () => {
      const newHandler = vi.fn().mockResolvedValue({ success: true, output: 'new' });

      registry.register(mockTool, mockHandler);
      registry.register(mockTool, newHandler, { override: true });

      expect(registry.getHandler('test_tool')).toBe(newHandler);
    });

    it('should set registeredAt timestamp', () => {
      const before = new Date();
      registry.register(mockTool, mockHandler);

      const after = new Date();

      const registered = registry.get('test_tool');

      expect(registered?.registeredAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(registered?.registeredAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('registerBatch', () => {
    it('should register multiple tools', () => {
      const tools: ToolDefinition[] = [
        { ...mockTool, name: 'tool1' },
        { ...mockTool, name: 'tool2' },
        { ...mockTool, name: 'tool3' },
      ];

      const handlers = {
        tool1: mockHandler,
        tool2: mockHandler,
        tool3: mockHandler,
      };

      registry.registerBatch(tools, handlers, 'batch');

      expect(registry.size).toBe(3);
      expect(registry.has('tool1')).toBe(true);
      expect(registry.has('tool2')).toBe(true);
      expect(registry.has('tool3')).toBe(true);
    });

    it('should assign category to all tools', () => {
      const tools: ToolDefinition[] = [
        { ...mockTool, name: 'tool1' },
        { ...mockTool, name: 'tool2' },
      ];

      const handlers = {
        tool1: mockHandler,
        tool2: mockHandler,
      };

      registry.registerBatch(tools, handlers, 'myCategory');

      expect(registry.getByCategory('myCategory')).toHaveLength(2);
    });

    it('should skip tools without handlers', () => {
      const tools: ToolDefinition[] = [
        { ...mockTool, name: 'tool1' },
        { ...mockTool, name: 'tool2' },
      ];

      const handlers = {
        tool1: mockHandler,

        // tool2 has no handler
      };

      registry.registerBatch(tools, handlers);

      expect(registry.size).toBe(1);
      expect(registry.has('tool1')).toBe(true);
      expect(registry.has('tool2')).toBe(false);
    });
  });

  describe('unregister', () => {
    it('should remove a registered tool', () => {
      registry.register(mockTool, mockHandler);
      expect(registry.has('test_tool')).toBe(true);

      const removed = registry.unregister('test_tool');

      expect(removed).toBe(true);
      expect(registry.has('test_tool')).toBe(false);
    });

    it('should return false for non-existent tool', () => {
      const removed = registry.unregister('non_existent');

      expect(removed).toBe(false);
    });
  });

  describe('unregisterCategory', () => {
    it('should remove all tools in a category', () => {
      registry.register({ ...mockTool, name: 'tool1' }, mockHandler, { category: 'cat1' });
      registry.register({ ...mockTool, name: 'tool2' }, mockHandler, { category: 'cat1' });
      registry.register({ ...mockTool, name: 'tool3' }, mockHandler, { category: 'cat2' });

      const count = registry.unregisterCategory('cat1');

      expect(count).toBe(2);
      expect(registry.size).toBe(1);
      expect(registry.has('tool3')).toBe(true);
    });
  });

  /*
   * ==========================================================================
   * QUERY TESTS
   * ==========================================================================
   */

  describe('has', () => {
    it('should return true for existing tool', () => {
      registry.register(mockTool, mockHandler);

      expect(registry.has('test_tool')).toBe(true);
    });

    it('should return false for non-existing tool', () => {
      expect(registry.has('non_existent')).toBe(false);
    });
  });

  describe('get', () => {
    it('should return registered tool', () => {
      registry.register(mockTool, mockHandler);

      const tool = registry.get('test_tool');

      expect(tool).toBeDefined();
      expect(tool?.definition.name).toBe('test_tool');
    });

    it('should return undefined for non-existing tool', () => {
      expect(registry.get('non_existent')).toBeUndefined();
    });
  });

  describe('getHandler', () => {
    it('should return handler function', () => {
      registry.register(mockTool, mockHandler);

      const handler = registry.getHandler('test_tool');

      expect(handler).toBe(mockHandler);
    });

    it('should return undefined for non-existing tool', () => {
      expect(registry.getHandler('non_existent')).toBeUndefined();
    });
  });

  describe('getDefinition', () => {
    it('should return tool definition', () => {
      registry.register(mockTool, mockHandler);

      const definition = registry.getDefinition('test_tool');

      expect(definition).toEqual(mockTool);
    });
  });

  describe('getDefinitions', () => {
    it('should return all tool definitions', () => {
      registry.register({ ...mockTool, name: 'tool1' }, mockHandler);
      registry.register({ ...mockTool, name: 'tool2' }, mockHandler);

      const definitions = registry.getDefinitions();

      expect(definitions).toHaveLength(2);
      expect(definitions.map((d) => d.name)).toContain('tool1');
      expect(definitions.map((d) => d.name)).toContain('tool2');
    });

    it('should sort by priority (higher first)', () => {
      registry.register({ ...mockTool, name: 'low' }, mockHandler, { priority: 1 });
      registry.register({ ...mockTool, name: 'high' }, mockHandler, { priority: 10 });
      registry.register({ ...mockTool, name: 'medium' }, mockHandler, { priority: 5 });

      const definitions = registry.getDefinitions();

      expect(definitions[0].name).toBe('high');
      expect(definitions[1].name).toBe('medium');
      expect(definitions[2].name).toBe('low');
    });
  });

  describe('getToolNames', () => {
    it('should return all tool names', () => {
      registry.register({ ...mockTool, name: 'tool1' }, mockHandler);
      registry.register({ ...mockTool, name: 'tool2' }, mockHandler);

      const names = registry.getToolNames();

      expect(names).toContain('tool1');
      expect(names).toContain('tool2');
    });
  });

  describe('getByCategory', () => {
    it('should return tools in category', () => {
      registry.register({ ...mockTool, name: 'tool1' }, mockHandler, { category: 'cat1' });
      registry.register({ ...mockTool, name: 'tool2' }, mockHandler, { category: 'cat1' });
      registry.register({ ...mockTool, name: 'tool3' }, mockHandler, { category: 'cat2' });

      const cat1Tools = registry.getByCategory('cat1');

      expect(cat1Tools).toHaveLength(2);
      expect(cat1Tools.map((t) => t.definition.name)).toContain('tool1');
      expect(cat1Tools.map((t) => t.definition.name)).toContain('tool2');
    });

    it('should return empty array for non-existing category', () => {
      expect(registry.getByCategory('non_existent')).toHaveLength(0);
    });
  });

  describe('getCategories', () => {
    it('should return all unique categories', () => {
      registry.register({ ...mockTool, name: 'tool1' }, mockHandler, { category: 'cat1' });
      registry.register({ ...mockTool, name: 'tool2' }, mockHandler, { category: 'cat2' });
      registry.register({ ...mockTool, name: 'tool3' }, mockHandler, { category: 'cat1' });

      const categories = registry.getCategories();

      expect(categories).toHaveLength(2);
      expect(categories).toContain('cat1');
      expect(categories).toContain('cat2');
    });
  });

  /*
   * ==========================================================================
   * EXECUTION TESTS
   * ==========================================================================
   */

  describe('execute', () => {
    it('should execute registered tool', async () => {
      registry.register(mockTool, mockHandler);

      const result = await registry.execute('test_tool', { input: 'hello' });

      expect(result.success).toBe(true);
      expect(result.output).toBe('test result');
      expect(mockHandler).toHaveBeenCalledWith({ input: 'hello' });
    });

    it('should return error for unknown tool', async () => {
      const result = await registry.execute('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
      expect(result.error).toContain('unknown_tool');
    });

    it('should handle handler errors', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Handler crashed!'));
      registry.register(mockTool, failingHandler);

      const result = await registry.execute('test_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Handler crashed!');
    });

    it('should include execution time', async () => {
      const slowHandler = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 50));
        return { success: true, output: 'done' };
      });

      registry.register(mockTool, slowHandler);

      const result = await registry.execute('test_tool', {});

      expect(result.executionTime).toBeDefined();

      // Use 40ms tolerance to account for timing variations
      expect(result.executionTime).toBeGreaterThanOrEqual(40);
    });

    it('should update stats on success', async () => {
      registry.register(mockTool, mockHandler);

      await registry.execute('test_tool', {});
      await registry.execute('test_tool', {});

      const stats = registry.getStats();

      expect(stats.executionCount).toBe(2);
      expect(stats.successCount).toBe(2);
      expect(stats.failureCount).toBe(0);
    });

    it('should update stats on failure', async () => {
      const failingHandler = vi.fn().mockResolvedValue({ success: false, output: null });
      registry.register(mockTool, failingHandler);

      await registry.execute('test_tool', {});

      const stats = registry.getStats();

      expect(stats.executionCount).toBe(1);
      expect(stats.successCount).toBe(0);
      expect(stats.failureCount).toBe(1);
    });
  });

  describe('executeParallel', () => {
    it('should execute multiple tools in parallel', async () => {
      const handler1 = vi.fn().mockResolvedValue({ success: true, output: 'result1' });
      const handler2 = vi.fn().mockResolvedValue({ success: true, output: 'result2' });

      registry.register({ ...mockTool, name: 'tool1' }, handler1);
      registry.register({ ...mockTool, name: 'tool2' }, handler2);

      const results = await registry.executeParallel([
        { name: 'tool1', input: { input: 'a' } },
        { name: 'tool2', input: { input: 'b' } },
      ]);

      expect(results).toHaveLength(2);
      expect(results[0].output).toBe('result1');
      expect(results[1].output).toBe('result2');
    });

    it('should execute truly in parallel', async () => {
      const delay = 50;
      const slowHandler = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, delay));
        return { success: true, output: 'done' };
      });

      registry.register({ ...mockTool, name: 'tool1' }, slowHandler);
      registry.register({ ...mockTool, name: 'tool2' }, slowHandler);

      const start = Date.now();
      await registry.executeParallel([
        { name: 'tool1', input: {} },
        { name: 'tool2', input: {} },
      ]);

      const duration = Date.now() - start;

      // Should take ~50ms (parallel), not ~100ms (sequential)
      // Use 2x tolerance to avoid flaky tests in CI environments
      expect(duration).toBeLessThan(delay * 2);
    });
  });

  describe('executeSequential', () => {
    it('should execute tools in sequence', async () => {
      const order: number[] = [];

      const handler1 = vi.fn().mockImplementation(async () => {
        order.push(1);
        return { success: true, output: 'result1' };
      });

      const handler2 = vi.fn().mockImplementation(async () => {
        order.push(2);
        return { success: true, output: 'result2' };
      });

      registry.register({ ...mockTool, name: 'tool1' }, handler1);
      registry.register({ ...mockTool, name: 'tool2' }, handler2);

      await registry.executeSequential([
        { name: 'tool1', input: {} },
        { name: 'tool2', input: {} },
      ]);

      expect(order).toEqual([1, 2]);
    });

    it('should stop on error by default', async () => {
      const handler1 = vi.fn().mockResolvedValue({ success: false, output: null });
      const handler2 = vi.fn().mockResolvedValue({ success: true, output: 'result2' });

      registry.register({ ...mockTool, name: 'tool1' }, handler1);
      registry.register({ ...mockTool, name: 'tool2' }, handler2);

      const results = await registry.executeSequential([
        { name: 'tool1', input: {} },
        { name: 'tool2', input: {} },
      ]);

      expect(results).toHaveLength(1);
      expect(handler2).not.toHaveBeenCalled();
    });

    it('should continue on error when stopOnError is false', async () => {
      const handler1 = vi.fn().mockResolvedValue({ success: false, output: null });
      const handler2 = vi.fn().mockResolvedValue({ success: true, output: 'result2' });

      registry.register({ ...mockTool, name: 'tool1' }, handler1);
      registry.register({ ...mockTool, name: 'tool2' }, handler2);

      const results = await registry.executeSequential(
        [
          { name: 'tool1', input: {} },
          { name: 'tool2', input: {} },
        ],
        false,
      );

      expect(results).toHaveLength(2);
      expect(handler2).toHaveBeenCalled();
    });
  });

  /*
   * ==========================================================================
   * UTILITY TESTS
   * ==========================================================================
   */

  describe('size', () => {
    it('should return number of registered tools', () => {
      expect(registry.size).toBe(0);

      registry.register({ ...mockTool, name: 'tool1' }, mockHandler);
      expect(registry.size).toBe(1);

      registry.register({ ...mockTool, name: 'tool2' }, mockHandler);
      expect(registry.size).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all tools', () => {
      registry.register({ ...mockTool, name: 'tool1' }, mockHandler);
      registry.register({ ...mockTool, name: 'tool2' }, mockHandler);

      registry.clear();

      expect(registry.size).toBe(0);
    });

    it('should reset stats', async () => {
      registry.register(mockTool, mockHandler);
      await registry.execute('test_tool', {});

      registry.clear();

      const stats = registry.getStats();
      expect(stats.executionCount).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return correct stats', async () => {
      registry.register({ ...mockTool, name: 'tool1' }, mockHandler, { category: 'cat1' });
      registry.register({ ...mockTool, name: 'tool2' }, mockHandler, { category: 'cat2' });

      await registry.execute('tool1', {});
      await registry.execute('tool2', {});

      const stats = registry.getStats();

      expect(stats.totalTools).toBe(2);
      expect(stats.byCategory).toEqual({ cat1: 1, cat2: 1 });
      expect(stats.executionCount).toBe(2);
      expect(stats.successCount).toBe(2);
    });
  });

  describe('clone', () => {
    it('should create independent copy', () => {
      registry.register(mockTool, mockHandler);

      const cloned = registry.clone();

      expect(cloned.size).toBe(1);
      expect(cloned.has('test_tool')).toBe(true);

      // Modifying original shouldn't affect clone
      registry.unregister('test_tool');
      expect(cloned.has('test_tool')).toBe(true);
    });
  });

  describe('merge', () => {
    it('should merge tools from another registry', () => {
      registry.register({ ...mockTool, name: 'tool1' }, mockHandler);

      const other = new ToolRegistry();
      other.register({ ...mockTool, name: 'tool2' }, mockHandler);

      registry.merge(other);

      expect(registry.size).toBe(2);
      expect(registry.has('tool1')).toBe(true);
      expect(registry.has('tool2')).toBe(true);
    });

    it('should not replace existing tools', () => {
      const handler1 = vi.fn().mockResolvedValue({ success: true, output: 'original' });
      const handler2 = vi.fn().mockResolvedValue({ success: true, output: 'merged' });

      registry.register(mockTool, handler1);

      const other = new ToolRegistry();
      other.register(mockTool, handler2);

      registry.merge(other);

      expect(registry.getHandler('test_tool')).toBe(handler1);
    });
  });
});
