/**
 * Tests for LLM Response Cache
 */

import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { llmCache, getCachedResponse, cacheResponse, getLLMCacheStats, clearLLMCache } from './llm-cache';
import type Anthropic from '@anthropic-ai/sdk';

/**
 * Create a mock Anthropic message response
 */
function createMockResponse(content: string, stopReason: 'end_turn' | 'tool_use' = 'end_turn'): Anthropic.Message {
  return {
    id: 'msg_test_123',
    type: 'message',
    role: 'assistant',
    content: [{ type: 'text', text: content, citations: null }],
    model: 'claude-sonnet-4-5-20250929',
    stop_reason: stopReason,
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: 0,
      cache_read_input_tokens: 0,
    },
  } as Anthropic.Message;
}

/**
 * Create mock messages
 */
function createMockMessages(): Anthropic.MessageParam[] {
  return [{ role: 'user', content: 'Hello, how are you?' }];
}

/**
 * Create mock tools
 */
function createMockTools(): Anthropic.Tool[] {
  return [
    {
      name: 'read_file',
      description: 'Read a file',
      input_schema: {
        type: 'object' as const,
        properties: {
          path: { type: 'string' },
        },
        required: ['path'],
      },
    },
  ];
}

describe('LLM Cache', () => {
  beforeEach(() => {
    clearLLMCache();
    llmCache.resetStats();
  });

  describe('basic operations', () => {
    it('should return null for cache miss', () => {
      const result = getCachedResponse(
        'claude-sonnet-4-5-20250929',
        'You are a helpful assistant',
        createMockMessages(),
      );

      expect(result).toBeNull();
    });

    it('should cache and retrieve a response', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'You are a helpful assistant';
      const messages = createMockMessages();
      const response = createMockResponse('Hello! I am doing well.');

      // Cache the response
      cacheResponse(model, systemPrompt, messages, undefined, response);

      // Retrieve it
      const cached = getCachedResponse(model, systemPrompt, messages);

      expect(cached).not.toBeNull();
      expect(cached?.id).toBe(response.id);
      expect(cached?.content).toEqual(response.content);
    });

    it('should return same response for identical requests', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'You are a helpful assistant';
      const messages = createMockMessages();
      const response = createMockResponse('Hello!');

      cacheResponse(model, systemPrompt, messages, undefined, response);

      const cached1 = getCachedResponse(model, systemPrompt, messages);
      const cached2 = getCachedResponse(model, systemPrompt, messages);

      expect(cached1).toBe(cached2); // Same reference
    });

    it('should not cache tool_use responses', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'You are a helpful assistant';
      const messages = createMockMessages();
      const response = createMockResponse('Using tool...', 'tool_use');

      cacheResponse(model, systemPrompt, messages, undefined, response);

      const cached = getCachedResponse(model, systemPrompt, messages);

      expect(cached).toBeNull();
    });
  });

  describe('cache key generation', () => {
    it('should differentiate by model', () => {
      const systemPrompt = 'You are a helpful assistant';
      const messages = createMockMessages();
      const response1 = createMockResponse('From Sonnet');
      const response2 = createMockResponse('From Opus');

      cacheResponse('claude-sonnet-4-5-20250929', systemPrompt, messages, undefined, response1);
      cacheResponse('claude-opus-4-5-20251101', systemPrompt, messages, undefined, response2);

      const cached1 = getCachedResponse('claude-sonnet-4-5-20250929', systemPrompt, messages);
      const cached2 = getCachedResponse('claude-opus-4-5-20251101', systemPrompt, messages);

      expect(cached1?.content).not.toEqual(cached2?.content);
    });

    it('should differentiate by system prompt', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const messages = createMockMessages();
      const response1 = createMockResponse('As assistant');
      const response2 = createMockResponse('As coder');

      cacheResponse(model, 'You are a helpful assistant', messages, undefined, response1);
      cacheResponse(model, 'You are a code expert', messages, undefined, response2);

      const cached1 = getCachedResponse(model, 'You are a helpful assistant', messages);
      const cached2 = getCachedResponse(model, 'You are a code expert', messages);

      expect(cached1?.content).not.toEqual(cached2?.content);
    });

    it('should differentiate by messages', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'You are a helpful assistant';
      const response1 = createMockResponse('Response 1');
      const response2 = createMockResponse('Response 2');

      const messages1: Anthropic.MessageParam[] = [{ role: 'user', content: 'Question 1' }];
      const messages2: Anthropic.MessageParam[] = [{ role: 'user', content: 'Question 2' }];

      cacheResponse(model, systemPrompt, messages1, undefined, response1);
      cacheResponse(model, systemPrompt, messages2, undefined, response2);

      const cached1 = getCachedResponse(model, systemPrompt, messages1);
      const cached2 = getCachedResponse(model, systemPrompt, messages2);

      expect(cached1?.content).not.toEqual(cached2?.content);
    });

    it('should differentiate by tools', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'You are a helpful assistant';
      const messages = createMockMessages();
      const response1 = createMockResponse('No tools');
      const response2 = createMockResponse('With tools');

      cacheResponse(model, systemPrompt, messages, undefined, response1);
      cacheResponse(model, systemPrompt, messages, createMockTools(), response2);

      const cached1 = getCachedResponse(model, systemPrompt, messages, undefined);
      const cached2 = getCachedResponse(model, systemPrompt, messages, createMockTools());

      expect(cached1?.content).not.toEqual(cached2?.content);
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'You are a helpful assistant';
      const messages = createMockMessages();
      const response = createMockResponse('Hello!');

      cacheResponse(model, systemPrompt, messages, undefined, response);

      // Should be cached
      expect(getCachedResponse(model, systemPrompt, messages)).not.toBeNull();

      // Advance past TTL (default 5 minutes)
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Should be expired
      expect(getCachedResponse(model, systemPrompt, messages)).toBeNull();
    });

    it('should not expire entries before TTL', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'You are a helpful assistant';
      const messages = createMockMessages();
      const response = createMockResponse('Hello!');

      cacheResponse(model, systemPrompt, messages, undefined, response);

      // Advance but not past TTL
      vi.advanceTimersByTime(4 * 60 * 1000);

      // Should still be cached
      expect(getCachedResponse(model, systemPrompt, messages)).not.toBeNull();
    });
  });

  describe('cache eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      const systemPrompt = 'Test';
      const model = 'claude-sonnet-4-5-20250929';

      // Fill cache beyond default capacity (100)
      for (let i = 0; i < 105; i++) {
        const messages: Anthropic.MessageParam[] = [{ role: 'user', content: `Message ${i}` }];
        const response = createMockResponse(`Response ${i}`);
        cacheResponse(model, systemPrompt, messages, undefined, response);
      }

      // First few entries should be evicted
      const oldMessages: Anthropic.MessageParam[] = [{ role: 'user', content: 'Message 0' }];
      expect(getCachedResponse(model, systemPrompt, oldMessages)).toBeNull();

      // Recent entries should still be cached
      const recentMessages: Anthropic.MessageParam[] = [{ role: 'user', content: 'Message 104' }];
      expect(getCachedResponse(model, systemPrompt, recentMessages)).not.toBeNull();
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'Test';
      const messages = createMockMessages();
      const response = createMockResponse('Hello!');

      // Miss
      getCachedResponse(model, systemPrompt, messages);

      // Cache and hit
      cacheResponse(model, systemPrompt, messages, undefined, response);
      getCachedResponse(model, systemPrompt, messages);
      getCachedResponse(model, systemPrompt, messages);

      const stats = getLLMCacheStats();

      expect(stats.misses).toBe(1);
      expect(stats.hits).toBe(2);
    });

    it('should calculate hit rate', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'Test';
      const messages = createMockMessages();
      const response = createMockResponse('Hello!');

      // 1 miss
      getCachedResponse(model, systemPrompt, messages);

      // Cache then 3 hits
      cacheResponse(model, systemPrompt, messages, undefined, response);
      getCachedResponse(model, systemPrompt, messages);
      getCachedResponse(model, systemPrompt, messages);
      getCachedResponse(model, systemPrompt, messages);

      const stats = getLLMCacheStats();

      // 3 hits / 4 total = 75%
      expect(stats.hitRate).toBe(75);
    });

    it('should track saved tokens', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'Test';
      const messages = createMockMessages();
      const response = createMockResponse('Hello!');

      // Response has 100 input + 50 output = 150 tokens

      cacheResponse(model, systemPrompt, messages, undefined, response);

      // 2 cache hits
      getCachedResponse(model, systemPrompt, messages);
      getCachedResponse(model, systemPrompt, messages);

      const stats = getLLMCacheStats();

      // 2 hits * 150 tokens = 300 saved tokens
      expect(stats.savedTokens).toBe(300);
    });

    it('should report cache size', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'Test';

      for (let i = 0; i < 5; i++) {
        const messages: Anthropic.MessageParam[] = [{ role: 'user', content: `Msg ${i}` }];
        const response = createMockResponse(`Response ${i}`);
        cacheResponse(model, systemPrompt, messages, undefined, response);
      }

      const stats = getLLMCacheStats();

      expect(stats.size).toBe(5);
    });
  });

  describe('enable/disable', () => {
    it('should not cache when disabled', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'Test';
      const messages = createMockMessages();
      const response = createMockResponse('Hello!');

      llmCache.setEnabled(false);

      cacheResponse(model, systemPrompt, messages, undefined, response);
      const cached = getCachedResponse(model, systemPrompt, messages);

      expect(cached).toBeNull();

      // Re-enable for other tests
      llmCache.setEnabled(true);
    });

    it('should report enabled status', () => {
      expect(llmCache.isEnabled()).toBe(true);

      llmCache.setEnabled(false);
      expect(llmCache.isEnabled()).toBe(false);

      llmCache.setEnabled(true);
      expect(llmCache.isEnabled()).toBe(true);
    });
  });

  describe('cleanup', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should cleanup expired entries', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'Test';

      // Add some entries
      for (let i = 0; i < 5; i++) {
        const messages: Anthropic.MessageParam[] = [{ role: 'user', content: `Msg ${i}` }];
        const response = createMockResponse(`Response ${i}`);
        cacheResponse(model, systemPrompt, messages, undefined, response);
      }

      expect(getLLMCacheStats().size).toBe(5);

      // Advance past TTL
      vi.advanceTimersByTime(6 * 60 * 1000);

      // Cleanup
      const cleaned = llmCache.cleanup();

      expect(cleaned).toBe(5);
      expect(getLLMCacheStats().size).toBe(0);
    });
  });

  describe('clear', () => {
    it('should clear all entries', () => {
      const model = 'claude-sonnet-4-5-20250929';
      const systemPrompt = 'Test';

      for (let i = 0; i < 10; i++) {
        const messages: Anthropic.MessageParam[] = [{ role: 'user', content: `Msg ${i}` }];
        const response = createMockResponse(`Response ${i}`);
        cacheResponse(model, systemPrompt, messages, undefined, response);
      }

      expect(getLLMCacheStats().size).toBe(10);

      clearLLMCache();

      expect(getLLMCacheStats().size).toBe(0);
    });
  });
});
