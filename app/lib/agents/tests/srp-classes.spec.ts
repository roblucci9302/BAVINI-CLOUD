/**
 * Tests pour les classes SRP extraites de BaseAgent
 * - LLMClient
 * - MessageHistory
 * - ToolExecutor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageHistory } from '../core/message-history';
import { ToolExecutor } from '../core/tool-executor';
import { ToolRegistry } from '../core/tool-registry';
import type { AgentMessage, ToolCall, ToolDefinition } from '../types';

/*
 * ============================================================================
 * MESSAGE HISTORY TESTS
 * ============================================================================
 */

describe('MessageHistory', () => {
  let history: MessageHistory;

  beforeEach(() => {
    history = new MessageHistory({ maxMessages: 10 });
  });

  describe('add', () => {
    it('should add a message to history', () => {
      history.add({ role: 'user', content: 'Hello' });

      expect(history.count()).toBe(1);
      expect(history.getMessages()).toHaveLength(1);
      expect(history.getMessages()[0].content).toBe('Hello');
    });

    it('should track token count incrementally', () => {
      history.add({ role: 'user', content: 'Hello world' });

      expect(history.getTokenCount()).toBeGreaterThan(0);
    });

    it('should add multiple messages', () => {
      history.add({ role: 'user', content: 'Hello' });
      history.add({ role: 'assistant', content: 'Hi there!' });
      history.add({ role: 'user', content: 'How are you?' });

      expect(history.count()).toBe(3);
    });
  });

  describe('addUserMessage', () => {
    it('should add a user message with correct role', () => {
      history.addUserMessage('Test message');

      expect(history.getMessages()[0]).toEqual({
        role: 'user',
        content: 'Test message',
      });
    });
  });

  describe('addAssistantMessage', () => {
    it('should add an assistant message with correct role', () => {
      history.addAssistantMessage('Response');

      expect(history.getMessages()[0]).toEqual({
        role: 'assistant',
        content: 'Response',
      });
    });
  });

  describe('addToolResultsMessage', () => {
    it('should add tool results with correct structure', () => {
      history.addToolResultsMessage([
        { toolCallId: 'call-1', output: 'Result 1', isError: false },
        { toolCallId: 'call-2', output: 'Result 2', isError: false },
      ]);

      const msg = history.getMessages()[0];
      expect(msg.role).toBe('user');
      expect(msg.content).toBe('');
      expect(msg.toolResults).toHaveLength(2);
    });
  });

  describe('trim', () => {
    it('should trim history when exceeding max messages', () => {
      // Ajouter plus que le max
      for (let i = 0; i < 15; i++) {
        history.add({ role: 'user', content: `Message ${i}` });
      }

      expect(history.count()).toBe(15);

      history.trim();

      // Devrait conserver maxMessages (10)
      expect(history.count()).toBe(10);
    });

    it('should keep first message (initial prompt) during trim', () => {
      history.add({ role: 'user', content: 'Initial prompt' });

      for (let i = 0; i < 14; i++) {
        history.add({ role: 'user', content: `Message ${i}` });
      }

      history.trim();

      expect(history.getFirstMessage()?.content).toBe('Initial prompt');
    });

    it('should keep most recent messages during trim', () => {
      for (let i = 0; i < 15; i++) {
        history.add({ role: 'user', content: `Message ${i}` });
      }

      history.trim();

      expect(history.getLastMessage()?.content).toBe('Message 14');
    });
  });

  describe('trimIfNeeded', () => {
    it('should not trim if below threshold', () => {
      for (let i = 0; i < 5; i++) {
        history.add({ role: 'user', content: `Message ${i}` });
      }

      const trimmed = history.trimIfNeeded();

      expect(trimmed).toBe(false);
      expect(history.count()).toBe(5);
    });

    it('should trim if above threshold (80%)', () => {
      for (let i = 0; i < 12; i++) {
        history.add({ role: 'user', content: `Message ${i}` });
      }

      const trimmed = history.trimIfNeeded();

      expect(trimmed).toBe(true);
      expect(history.count()).toBe(10);
    });
  });

  describe('needsTrim', () => {
    it('should return false when below threshold', () => {
      history.add({ role: 'user', content: 'Hello' });
      expect(history.needsTrim()).toBe(false);
    });

    it('should return true when at or above 80% threshold', () => {
      for (let i = 0; i < 8; i++) {
        history.add({ role: 'user', content: `Message ${i}` });
      }

      expect(history.needsTrim()).toBe(true);
    });
  });

  describe('clear', () => {
    it('should clear all messages', () => {
      history.add({ role: 'user', content: 'Hello' });
      history.add({ role: 'assistant', content: 'Hi' });

      history.clear();

      expect(history.count()).toBe(0);
      expect(history.getTokenCount()).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      history.add({ role: 'user', content: 'Hello world' });
      history.add({ role: 'assistant', content: 'Hi there' });

      const stats = history.getStats();

      expect(stats.messageCount).toBe(2);
      expect(stats.maxMessages).toBe(10);
      expect(stats.fillPercentage).toBe(20);
      expect(stats.estimatedTokens).toBeGreaterThan(0);
    });
  });

  describe('getLastMessage', () => {
    it('should return undefined for empty history', () => {
      expect(history.getLastMessage()).toBeUndefined();
    });

    it('should return the last message', () => {
      history.add({ role: 'user', content: 'First' });
      history.add({ role: 'assistant', content: 'Last' });

      expect(history.getLastMessage()?.content).toBe('Last');
    });
  });

  describe('getLastMessages', () => {
    it('should return the last N messages', () => {
      for (let i = 0; i < 5; i++) {
        history.add({ role: 'user', content: `Message ${i}` });
      }

      const last2 = history.getLastMessages(2);

      expect(last2).toHaveLength(2);
      expect(last2[0].content).toBe('Message 3');
      expect(last2[1].content).toBe('Message 4');
    });
  });

  describe('popLastMessage', () => {
    it('should remove and return the last message', () => {
      history.add({ role: 'user', content: 'First' });
      history.add({ role: 'assistant', content: 'Last' });

      const popped = history.popLastMessage();

      expect(popped?.content).toBe('Last');
      expect(history.count()).toBe(1);
    });

    it('should return undefined for empty history', () => {
      expect(history.popLastMessage()).toBeUndefined();
    });
  });

  describe('clone', () => {
    it('should create an independent copy', () => {
      history.add({ role: 'user', content: 'Original' });

      const cloned = history.clone();
      cloned.add({ role: 'user', content: 'Added to clone' });

      expect(history.count()).toBe(1);
      expect(cloned.count()).toBe(2);
    });
  });
});

/*
 * ============================================================================
 * TOOL EXECUTOR TESTS
 * ============================================================================
 */

describe('ToolExecutor', () => {
  let registry: ToolRegistry;
  let executor: ToolExecutor;

  beforeEach(() => {
    registry = new ToolRegistry();
    executor = new ToolExecutor(registry, {
      enableParallelExecution: true,
      maxParallelTools: 5,
    });
  });

  describe('execute', () => {
    it('should execute a registered tool', async () => {
      const definition: ToolDefinition = {
        name: 'test_tool',
        description: 'A test tool',
        inputSchema: {
          type: 'object' as const,
          properties: {
            value: { type: 'string' },
          },
        },
      };

      registry.register(definition, async (input) => ({
        success: true,
        output: `Received: ${input.value}`,
      }));

      const result = await executor.execute('test_tool', { value: 'hello' });

      expect(result.success).toBe(true);
      expect(result.output).toBe('Received: hello');
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should handle tool errors gracefully', async () => {
      const definition: ToolDefinition = {
        name: 'failing_tool',
        description: 'A tool that fails',
        inputSchema: { type: 'object' as const, properties: {} },
      };

      registry.register(definition, async () => {
        throw new Error('Tool failed');
      });

      const result = await executor.execute('failing_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Tool failed');
    });

    it('should return error for unknown tool', async () => {
      const result = await executor.execute('unknown_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('executeAll', () => {
    beforeEach(() => {
      const toolA: ToolDefinition = {
        name: 'tool_a',
        description: 'Tool A',
        inputSchema: { type: 'object' as const, properties: {} },
      };

      const toolB: ToolDefinition = {
        name: 'tool_b',
        description: 'Tool B',
        inputSchema: { type: 'object' as const, properties: {} },
      };

      registry.register(toolA, async () => ({
        success: true,
        output: 'Result A',
      }));

      registry.register(toolB, async () => ({
        success: true,
        output: 'Result B',
      }));
    });

    it('should execute multiple tools in parallel', async () => {
      const toolCalls: ToolCall[] = [
        { id: 'call-1', name: 'tool_a', input: {} },
        { id: 'call-2', name: 'tool_b', input: {} },
      ];

      const results = await executor.executeAll(toolCalls);

      expect(results).toHaveLength(2);
      expect(results[0].toolCallId).toBe('call-1');
      expect(results[0].output).toBe('Result A');
      expect(results[1].toolCallId).toBe('call-2');
      expect(results[1].output).toBe('Result B');
    });

    it('should handle mixed success and failure', async () => {
      const failingTool: ToolDefinition = {
        name: 'failing',
        description: 'Failing tool',
        inputSchema: { type: 'object' as const, properties: {} },
      };

      registry.register(failingTool, async () => {
        throw new Error('Intentional failure');
      });

      const toolCalls: ToolCall[] = [
        { id: 'call-1', name: 'tool_a', input: {} },
        { id: 'call-2', name: 'failing', input: {} },
      ];

      const results = await executor.executeAll(toolCalls);

      expect(results[0].isError).toBe(false);
      expect(results[1].isError).toBe(true);
      expect(results[1].error).toContain('Intentional failure');
    });
  });

  describe('callbacks', () => {
    it('should call onToolCall before execution', async () => {
      const onToolCall = vi.fn();
      executor.setCallbacks({ onToolCall });

      const definition: ToolDefinition = {
        name: 'callback_test',
        description: 'Callback test',
        inputSchema: { type: 'object' as const, properties: {} },
      };

      registry.register(definition, async () => ({
        success: true,
        output: 'done',
      }));

      await executor.execute('callback_test', { key: 'value' });

      expect(onToolCall).toHaveBeenCalledWith('callback_test', { key: 'value' });
    });

    it('should call onToolResult after execution', async () => {
      const onToolResult = vi.fn();
      executor.setCallbacks({ onToolResult });

      const definition: ToolDefinition = {
        name: 'result_test',
        description: 'Result test',
        inputSchema: { type: 'object' as const, properties: {} },
      };

      registry.register(definition, async () => ({
        success: true,
        output: 'test result',
      }));

      await executor.execute('result_test', {});

      expect(onToolResult).toHaveBeenCalled();
      expect(onToolResult.mock.calls[0][0]).toBe('result_test');
      expect(onToolResult.mock.calls[0][1].success).toBe(true);
    });

    it('should call onToolError on failure', async () => {
      const onToolError = vi.fn();
      executor.setCallbacks({ onToolError });

      const definition: ToolDefinition = {
        name: 'error_test',
        description: 'Error test',
        inputSchema: { type: 'object' as const, properties: {} },
      };

      registry.register(definition, async () => {
        throw new Error('Test error');
      });

      await executor.execute('error_test', {});

      expect(onToolError).toHaveBeenCalledWith('error_test', expect.stringContaining('Test error'), expect.any(Number));
    });
  });

  describe('customToolHandler', () => {
    it('should use custom handler for unregistered tools', async () => {
      const customHandler = vi.fn().mockResolvedValue('Custom result');
      executor.setCustomToolHandler(customHandler);

      const result = await executor.execute('unregistered_tool', { data: 123 });

      expect(customHandler).toHaveBeenCalledWith('unregistered_tool', { data: 123 });
      expect(result.success).toBe(true);
      expect(result.output).toBe('Custom result');
    });
  });

  describe('hasTools', () => {
    it('should return true for registered tool', () => {
      const definition: ToolDefinition = {
        name: 'existing',
        description: 'Existing tool',
        inputSchema: { type: 'object' as const, properties: {} },
      };

      registry.register(definition, async () => ({ success: true, output: null }));

      expect(executor.hasTools('existing')).toBe(true);
    });

    it('should return false for unregistered tool without custom handler', () => {
      expect(executor.hasTools('nonexistent')).toBe(false);
    });

    it('should return true for any tool if custom handler is set', () => {
      executor.setCustomToolHandler(async () => 'fallback');

      expect(executor.hasTools('anything')).toBe(true);
    });
  });

  describe('getAvailableTools', () => {
    it('should return list of registered tool names', () => {
      const tool1: ToolDefinition = {
        name: 'tool_one',
        description: 'Tool 1',
        inputSchema: { type: 'object' as const, properties: {} },
      };

      const tool2: ToolDefinition = {
        name: 'tool_two',
        description: 'Tool 2',
        inputSchema: { type: 'object' as const, properties: {} },
      };

      registry.register(tool1, async () => ({ success: true, output: null }));
      registry.register(tool2, async () => ({ success: true, output: null }));

      const tools = executor.getAvailableTools();

      expect(tools).toContain('tool_one');
      expect(tools).toContain('tool_two');
    });
  });
});

/*
 * ============================================================================
 * INTEGRATION TESTS
 * ============================================================================
 */

describe('SRP Classes Integration', () => {
  it('should work together for a typical agent loop', async () => {
    // Setup
    const history = new MessageHistory();
    const registry = new ToolRegistry();
    const executor = new ToolExecutor(registry);

    // Register a test tool
    registry.register(
      {
        name: 'get_weather',
        description: 'Get weather',
        inputSchema: { type: 'object' as const, properties: { city: { type: 'string' } } },
      },
      async (input) => ({
        success: true,
        output: `Weather in ${input.city}: Sunny, 25°C`,
      }),
    );

    // Simulate agent loop
    history.addUserMessage("What's the weather in Paris?");

    // Simulate LLM response with tool call
    const toolCalls: ToolCall[] = [{ id: 'call-1', name: 'get_weather', input: { city: 'Paris' } }];

    history.add({
      role: 'assistant',
      content: 'Let me check the weather for you.',
      toolCalls,
    });

    // Execute tools
    const results = await executor.executeAll(toolCalls);

    // Add results to history
    history.addToolResultsMessage(results);

    // Verify
    expect(history.count()).toBe(3);
    expect(results[0].output).toContain('Paris');
    expect(results[0].output).toContain('Sunny');
  });

  it('should properly handle message history trimming during long conversations', () => {
    const history = new MessageHistory({ maxMessages: 5 });

    // Simulate a long conversation
    for (let i = 0; i < 20; i++) {
      history.add({
        role: i % 2 === 0 ? 'user' : 'assistant',
        content: `Message ${i}`,
      });

      history.trimIfNeeded();
    }

    const stats = history.getStats();

    expect(stats.messageCount).toBeLessThanOrEqual(5);
    expect(history.getFirstMessage()?.content).toBe('Message 0');
    expect(history.getLastMessage()?.content).toBe('Message 19');
  });
});
