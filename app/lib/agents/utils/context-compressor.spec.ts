/**
 * Tests for Context Compressor
 */

import { describe, it, expect } from 'vitest';
import {
  estimateTokens,
  truncateMessage,
  compressContext,
  needsCompression,
  countContextTokens,
} from './context-compressor';
import type { AgentMessage } from '../types';

/**
 * Helper to create a message
 */
function createMessage(role: 'user' | 'assistant', content: string): AgentMessage {
  return { role, content };
}

/**
 * Helper to create a message with specific token count (approximately)
 */
function createMessageWithTokens(role: 'user' | 'assistant', approxTokens: number): AgentMessage {
  // ~4 chars per token for regular text
  const content = 'word '.repeat(Math.ceil(approxTokens * 1.33));
  return { role, content: content.trim() };
}

describe('Context Compressor', () => {
  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should return 0 for null/undefined', () => {
      expect(estimateTokens(null as unknown as string)).toBe(0);
      expect(estimateTokens(undefined as unknown as string)).toBe(0);
    });

    it('should estimate tokens for short text', () => {
      const text = 'Hello world';
      const tokens = estimateTokens(text);

      // ~2-3 tokens for "Hello world"
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('should estimate tokens for longer text', () => {
      const text =
        'This is a longer piece of text that contains multiple sentences. It should have more tokens than a short phrase.';
      const tokens = estimateTokens(text);

      // Should be roughly text.length / 4
      expect(tokens).toBeGreaterThan(20);
      expect(tokens).toBeLessThan(50);
    });

    it('should estimate more tokens for code content', () => {
      const regularText = 'This is some regular text content for comparison.';
      const codeText = '```javascript\nfunction hello() {\n  const x = 1;\n  return x;\n}\n```';

      const regularTokens = estimateTokens(regularText);
      const codeTokens = estimateTokens(codeText);

      // Code should have higher token density
      // Both have similar length, but code uses chars/3.5 vs chars/4
      expect(codeTokens / codeText.length).toBeGreaterThan(regularTokens / regularText.length);
    });

    it('should detect code by function keyword', () => {
      const text = 'function myFunction() { return true; }';
      const tokens = estimateTokens(text);

      // Uses code estimation (chars / 3.5)
      expect(tokens).toBe(Math.ceil(text.length / 3.5));
    });

    it('should detect code by const keyword', () => {
      const text = 'const myVariable = 42;';
      const tokens = estimateTokens(text);

      // Uses code estimation (chars / 3.5)
      expect(tokens).toBe(Math.ceil(text.length / 3.5));
    });
  });

  describe('truncateMessage', () => {
    it('should not truncate message within limit', () => {
      const message = createMessage('user', 'Short message');
      const result = truncateMessage(message, 100);

      expect(result.content).toBe('Short message');
      expect(result.role).toBe('user');
    });

    it('should truncate message exceeding limit', () => {
      const longContent = 'word '.repeat(500); // ~500 words
      const message = createMessage('user', longContent);
      const result = truncateMessage(message, 50);

      expect(result.content.length).toBeLessThan(longContent.length);
      expect(result.content).toContain('[... contenu tronqué ...]');
    });

    it('should use custom truncation marker', () => {
      const longContent = 'word '.repeat(500);
      const message = createMessage('user', longContent);
      const customMarker = '... [TRUNCATED]';
      const result = truncateMessage(message, 50, customMarker);

      expect(result.content).toContain('[TRUNCATED]');
    });

    it('should preserve message role', () => {
      const message = createMessage('assistant', 'word '.repeat(500));
      const result = truncateMessage(message, 50);

      expect(result.role).toBe('assistant');
    });

    it('should preserve other message properties', () => {
      const message: AgentMessage = {
        role: 'user',
        content: 'word '.repeat(500),
        toolCalls: [{ id: 'test', name: 'test_tool', input: {} }],
      };
      const result = truncateMessage(message, 50);

      expect(result.toolCalls).toEqual(message.toolCalls);
    });
  });

  describe('compressContext', () => {
    it('should not compress when within limits', () => {
      const messages: AgentMessage[] = [createMessage('user', 'Hello'), createMessage('assistant', 'Hi there!')];

      const { messages: compressed, stats } = compressContext(messages);

      expect(compressed).toEqual(messages);
      expect(stats.compressionRatio).toBe(1);
      expect(stats.originalMessages).toBe(2);
      expect(stats.compressedMessages).toBe(2);
    });

    it('should compress when exceeding limits', () => {
      // Create messages that exceed the default 100k token limit
      const messages: AgentMessage[] = [];

      for (let i = 0; i < 50; i++) {
        messages.push(createMessageWithTokens('user', 3000)); // ~150k tokens total
      }

      const { messages: compressed, stats } = compressContext(messages);

      expect(stats.compressionRatio).toBeLessThan(1);
      expect(stats.compressedTokens).toBeLessThan(stats.originalTokens);
    });

    it('should preserve recent messages', () => {
      const messages: AgentMessage[] = [];

      // Add older messages
      for (let i = 0; i < 10; i++) {
        messages.push(createMessage('user', `Old message ${i}`));
      }

      // Add recent messages with identifiable content
      messages.push(createMessage('user', 'RECENT_MESSAGE_1'));
      messages.push(createMessage('assistant', 'RECENT_MESSAGE_2'));
      messages.push(createMessage('user', 'RECENT_MESSAGE_3'));

      const { messages: compressed } = compressContext(messages, {
        maxTokens: 100, // Very low to force compression
        preserveRecentCount: 3,
      });

      // Recent messages should be preserved
      const contents = compressed.map((m) => m.content);
      expect(contents.some((c) => c.includes('RECENT_MESSAGE_1'))).toBe(true);
      expect(contents.some((c) => c.includes('RECENT_MESSAGE_2'))).toBe(true);
      expect(contents.some((c) => c.includes('RECENT_MESSAGE_3'))).toBe(true);
    });

    it('should add summary when messages are dropped', () => {
      const messages: AgentMessage[] = [];

      for (let i = 0; i < 20; i++) {
        messages.push(createMessageWithTokens('user', 1000));
      }

      const { messages: compressed } = compressContext(messages, {
        maxTokens: 5000,
        summarizeOld: true,
      });

      // First message should be the summary
      expect(compressed[0].content).toContain('messages précédents ont été omis');
    });

    it('should not add summary when summarizeOld is false', () => {
      const messages: AgentMessage[] = [];

      for (let i = 0; i < 20; i++) {
        messages.push(createMessageWithTokens('user', 1000));
      }

      const { messages: compressed } = compressContext(messages, {
        maxTokens: 5000,
        summarizeOld: false,
      });

      // No summary message
      expect(compressed[0].content).not.toContain('messages précédents ont été omis');
    });

    it('should respect maxTokensPerMessage', () => {
      const longMessage = createMessageWithTokens('user', 10000);
      const messages: AgentMessage[] = [longMessage];

      // maxTokensPerMessage is only applied during compression
      // Force compression by setting maxTokens lower than message tokens
      const { messages: compressed } = compressContext(messages, {
        maxTokens: 500,
        maxTokensPerMessage: 100,
      });

      const compressedTokens = estimateTokens(compressed[0].content);
      expect(compressedTokens).toBeLessThanOrEqual(150); // Some margin for truncation marker
    });

    it('should return correct statistics', () => {
      const messages: AgentMessage[] = [
        createMessageWithTokens('user', 500),
        createMessageWithTokens('assistant', 500),
        createMessageWithTokens('user', 500),
      ];

      const { stats } = compressContext(messages, { maxTokens: 500 });

      expect(stats.originalMessages).toBe(3);
      expect(stats.originalTokens).toBeGreaterThan(0);
      expect(stats.compressedTokens).toBeLessThanOrEqual(stats.originalTokens);
      expect(stats.compressionRatio).toBeGreaterThan(0);
      expect(stats.compressionRatio).toBeLessThanOrEqual(1);
    });

    it('should handle empty message array', () => {
      const { messages: compressed, stats } = compressContext([]);

      expect(compressed).toEqual([]);
      expect(stats.originalMessages).toBe(0);
      expect(stats.compressedMessages).toBe(0);
      expect(stats.compressionRatio).toBe(1);
    });

    it('should handle single message', () => {
      const messages: AgentMessage[] = [createMessage('user', 'Single message')];

      const { messages: compressed, stats } = compressContext(messages);

      expect(compressed.length).toBe(1);
      expect(stats.originalMessages).toBe(1);
    });

    it('should use custom truncation marker', () => {
      const messages: AgentMessage[] = [createMessageWithTokens('user', 10000)];

      const { messages: compressed } = compressContext(messages, {
        maxTokens: 100,
        truncationMarker: '<<CUT>>',
      });

      expect(compressed[0].content).toContain('<<CUT>>');
    });

    it('should prioritize newer older messages over oldest', () => {
      const messages: AgentMessage[] = [
        createMessage('user', 'OLDEST'),
        createMessage('user', 'MIDDLE'),
        createMessage('user', 'NEWER'),
        createMessage('user', 'RECENT_1'),
        createMessage('user', 'RECENT_2'),
      ];

      const { messages: compressed } = compressContext(messages, {
        maxTokens: 50,
        preserveRecentCount: 2,
        summarizeOld: false,
      });

      const contents = compressed.map((m) => m.content);

      // RECENT messages should definitely be there
      expect(contents).toContain('RECENT_1');
      expect(contents).toContain('RECENT_2');

      // If any older message is included, NEWER should be preferred over OLDEST
      if (contents.includes('NEWER') || contents.includes('MIDDLE')) {
        expect(contents.indexOf('NEWER')).toBeLessThanOrEqual(contents.indexOf('OLDEST') || Infinity);
      }
    });
  });

  describe('needsCompression', () => {
    it('should return false for small context', () => {
      const messages: AgentMessage[] = [createMessage('user', 'Hello'), createMessage('assistant', 'Hi!')];

      expect(needsCompression(messages)).toBe(false);
    });

    it('should return true for large context', () => {
      const messages: AgentMessage[] = [];

      // Create messages exceeding 100k tokens
      for (let i = 0; i < 50; i++) {
        messages.push(createMessageWithTokens('user', 3000));
      }

      expect(needsCompression(messages)).toBe(true);
    });

    it('should respect custom maxTokens', () => {
      const messages: AgentMessage[] = [createMessageWithTokens('user', 100)];

      expect(needsCompression(messages, 50)).toBe(true);
      expect(needsCompression(messages, 500)).toBe(false);
    });

    it('should return false for empty array', () => {
      expect(needsCompression([])).toBe(false);
    });
  });

  describe('countContextTokens', () => {
    it('should return 0 for empty array', () => {
      expect(countContextTokens([])).toBe(0);
    });

    it('should count tokens for single message', () => {
      const messages: AgentMessage[] = [createMessage('user', 'Hello world')];

      const tokens = countContextTokens(messages);
      expect(tokens).toBeGreaterThan(0);
    });

    it('should sum tokens across multiple messages', () => {
      const msg1 = createMessage('user', 'First message');
      const msg2 = createMessage('assistant', 'Second message');

      const tokens1 = estimateTokens(msg1.content);
      const tokens2 = estimateTokens(msg2.content);
      const totalTokens = countContextTokens([msg1, msg2]);

      expect(totalTokens).toBe(tokens1 + tokens2);
    });

    it('should handle messages with varying lengths', () => {
      const messages: AgentMessage[] = [
        createMessage('user', 'Short'),
        createMessageWithTokens('assistant', 1000),
        createMessage('user', 'Another short one'),
      ];

      const tokens = countContextTokens(messages);
      expect(tokens).toBeGreaterThan(1000);
    });
  });

  describe('integration scenarios', () => {
    it('should handle realistic conversation compression', () => {
      // Simulate a realistic conversation that needs compression
      const messages: AgentMessage[] = [];

      // System context (large)
      messages.push(createMessage('user', 'You are an expert developer. ' + 'Context: '.repeat(500)));

      // Back and forth conversation
      for (let i = 0; i < 20; i++) {
        messages.push(createMessage('user', `Question ${i}: ${'detail '.repeat(100)}`));
        messages.push(createMessage('assistant', `Answer ${i}: ${'explanation '.repeat(150)}`));
      }

      // Final question
      messages.push(createMessage('user', 'Final important question that must be preserved'));

      const { messages: compressed, stats } = compressContext(messages, {
        maxTokens: 10000,
        preserveRecentCount: 5,
      });

      // Should compress (ratio < 1 means compression occurred)
      expect(stats.compressionRatio).toBeLessThan(1);

      // Final message should be preserved
      const lastMessage = compressed[compressed.length - 1];
      expect(lastMessage.content).toContain('Final important question');
    });

    it('should handle code-heavy conversation', () => {
      const messages: AgentMessage[] = [
        createMessage('user', 'Help me write a function'),
        createMessage(
          'assistant',
          '```javascript\nfunction example() {\n  const data = [];\n  for (let i = 0; i < 100; i++) {\n    data.push(i);\n  }\n  return data;\n}\n```',
        ),
        createMessage('user', 'Can you add error handling?'),
        createMessage(
          'assistant',
          '```javascript\nfunction example() {\n  try {\n    const data = [];\n    for (let i = 0; i < 100; i++) {\n      data.push(i);\n    }\n    return data;\n  } catch (error) {\n    console.error(error);\n    return [];\n  }\n}\n```',
        ),
      ];

      const tokens = countContextTokens(messages);
      expect(tokens).toBeGreaterThan(0);

      // Should not need compression for this small conversation
      expect(needsCompression(messages)).toBe(false);
    });
  });
});
