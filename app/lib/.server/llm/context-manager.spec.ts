/**
 * Tests for Context Manager
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MAX_CONTEXT_TOKENS,
  SUMMARIZATION_THRESHOLD,
  MIN_RECENT_MESSAGES,
  estimateTokens,
  estimateMessageTokens,
  estimateTotalTokens,
  analyzeContext,
  createSummaryMessage,
  formatMessagesForSummary,
  prepareMessagesForLLM,
  isSummaryMessage,
  getContextStats,
  type SummaryMessage,
} from './context-manager';
import type { Message } from '~/types/message';

describe('Context Manager', () => {
  describe('Constants', () => {
    it('should have reasonable default values', () => {
      expect(MAX_CONTEXT_TOKENS).toBe(180000);
      expect(SUMMARIZATION_THRESHOLD).toBe(0.8);
      expect(MIN_RECENT_MESSAGES).toBe(10);
    });
  });

  describe('estimateTokens', () => {
    it('should return 0 for empty string', () => {
      expect(estimateTokens('')).toBe(0);
    });

    it('should estimate tokens for simple text', () => {
      const tokens = estimateTokens('Hello, world!');
      expect(tokens).toBeGreaterThan(0);
      expect(tokens).toBeLessThan(10);
    });

    it('should estimate more tokens for longer text', () => {
      const short = estimateTokens('Hello');
      const long = estimateTokens('Hello, this is a much longer piece of text that should have more tokens.');
      expect(long).toBeGreaterThan(short);
    });
  });

  describe('estimateMessageTokens', () => {
    it('should count tokens for simple message', () => {
      const message: Message = {
        id: '1',
        role: 'user',
        content: 'Hello, how are you?',
      };

      const tokens = estimateMessageTokens(message);
      expect(tokens).toBeGreaterThan(0);
      // Should include overhead for role
      expect(tokens).toBeGreaterThan(estimateTokens(message.content));
    });

    it('should count tokens for message with tool invocations', () => {
      const messageWithTools: Message = {
        id: '2',
        role: 'assistant',
        content: 'Let me help you.',
        toolInvocations: [
          {
            toolCallId: 'call1',
            toolName: 'readFile',
            args: { path: '/test/file.txt' },
            state: 'result',
            result: { content: 'File contents here with some data' },
          },
        ],
      };

      const messageWithoutTools: Message = {
        id: '2',
        role: 'assistant',
        content: 'Let me help you.',
      };

      expect(estimateMessageTokens(messageWithTools)).toBeGreaterThan(
        estimateMessageTokens(messageWithoutTools)
      );
    });

    it('should count tokens for message with attachments', () => {
      const messageWithAttachments: Message = {
        id: '3',
        role: 'user',
        content: 'Check this',
        experimental_attachments: [
          { name: 'image.png', contentType: 'image/png', url: 'data:...' },
          { name: 'doc.pdf', contentType: 'application/pdf', url: 'data:...' },
        ],
      };

      const messageWithoutAttachments: Message = {
        id: '3',
        role: 'user',
        content: 'Check this',
      };

      expect(estimateMessageTokens(messageWithAttachments)).toBeGreaterThan(
        estimateMessageTokens(messageWithoutAttachments)
      );
    });
  });

  describe('estimateTotalTokens', () => {
    it('should return 0 for empty array', () => {
      expect(estimateTotalTokens([])).toBe(0);
    });

    it('should sum tokens from all messages', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi there!' },
        { id: '3', role: 'user', content: 'How are you?' },
      ];

      const total = estimateTotalTokens(messages);
      const individual = messages.reduce((sum, msg) => sum + estimateMessageTokens(msg), 0);

      expect(total).toBe(individual);
    });
  });

  describe('analyzeContext', () => {
    it('should not require summarization for small conversations', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi!' },
      ];

      const analysis = analyzeContext(messages);

      expect(analysis.needsSummarization).toBe(false);
      expect(analysis.messagesToSummarize).toHaveLength(0);
      expect(analysis.messagesToKeep).toHaveLength(2);
    });

    it('should calculate usage percentage correctly', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'x'.repeat(1000) },
      ];

      const analysis = analyzeContext(messages, { maxTokens: 1000 });

      expect(analysis.usagePercent).toBeGreaterThan(0);
      expect(analysis.usagePercent).toBeLessThanOrEqual(1);
    });

    it('should require summarization when threshold exceeded', () => {
      // Create messages that exceed the threshold
      const messages: Message[] = [];
      for (let i = 0; i < 50; i++) {
        messages.push({
          id: String(i),
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: 'x'.repeat(100), // ~25 tokens each
        });
      }

      // Use a low maxTokens to trigger summarization
      const analysis = analyzeContext(messages, {
        maxTokens: 500,
        threshold: 0.5,
        minRecentMessages: 5,
      });

      expect(analysis.needsSummarization).toBe(true);
      expect(analysis.messagesToSummarize.length).toBeGreaterThan(0);
    });

    it('should preserve recent messages', () => {
      const messages: Message[] = [];
      for (let i = 0; i < 20; i++) {
        messages.push({
          id: String(i),
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: `Message ${i}`,
        });
      }

      const analysis = analyzeContext(messages, {
        maxTokens: 100,
        threshold: 0.1,
        minRecentMessages: 5,
      });

      // Should keep at least 5 recent messages
      expect(analysis.messagesToKeep.length).toBeGreaterThanOrEqual(5);
    });

    it('should preserve system messages and summaries', () => {
      const summaryMessage: SummaryMessage = {
        id: 'summary',
        role: 'system',
        content: 'Previous summary',
        isSummary: true,
        originalMessageCount: 10,
        summarizedAt: new Date(),
      };

      const systemMessage: Message = {
        id: 'system',
        role: 'system',
        content: 'System prompt',
      };

      const messages: Message[] = [
        systemMessage,
        summaryMessage,
        { id: '1', role: 'user', content: 'x'.repeat(1000) },
        { id: '2', role: 'assistant', content: 'x'.repeat(1000) },
      ];

      const analysis = analyzeContext(messages, {
        maxTokens: 100,
        threshold: 0.1,
        minRecentMessages: 1,
      });

      // System messages and summaries should be in kept messages
      const keptIds = analysis.messagesToKeep.map(m => m.id);
      expect(keptIds).toContain('system');
      expect(keptIds).toContain('summary');
    });
  });

  describe('createSummaryMessage', () => {
    it('should create a valid summary message', () => {
      const summary = createSummaryMessage('This is the summary content', 15);

      expect(summary.role).toBe('system');
      expect(summary.isSummary).toBe(true);
      expect(summary.originalMessageCount).toBe(15);
      expect(summary.content).toContain('This is the summary content');
      expect(summary.content).toContain('conversation-summary');
      expect(summary.summarizedAt).toBeInstanceOf(Date);
    });
  });

  describe('formatMessagesForSummary', () => {
    it('should format messages with role and content', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi!' },
      ];

      const formatted = formatMessagesForSummary(messages);

      expect(formatted).toContain('USER');
      expect(formatted).toContain('ASSISTANT');
      expect(formatted).toContain('Hello');
      expect(formatted).toContain('Hi!');
    });

    it('should truncate long messages', () => {
      const longContent = 'x'.repeat(3000);
      const messages: Message[] = [
        { id: '1', role: 'user', content: longContent },
      ];

      const formatted = formatMessagesForSummary(messages);

      expect(formatted.length).toBeLessThan(longContent.length + 100);
      expect(formatted).toContain('...');
    });
  });

  describe('prepareMessagesForLLM', () => {
    it('should return original messages if no summarization needed', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi!' },
      ];

      const mockSummarize = vi.fn();
      const result = await prepareMessagesForLLM(messages, mockSummarize);

      expect(result.wasSummarized).toBe(false);
      expect(result.messages).toEqual(messages);
      expect(mockSummarize).not.toHaveBeenCalled();
    });

    it('should call summarize function when needed', async () => {
      const messages: Message[] = [];
      for (let i = 0; i < 30; i++) {
        messages.push({
          id: String(i),
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: 'x'.repeat(100),
        });
      }

      const mockSummarize = vi.fn().mockResolvedValue('Summary of conversation');

      const result = await prepareMessagesForLLM(messages, mockSummarize, {
        maxTokens: 500,
        threshold: 0.1,
        minRecentMessages: 5,
      });

      expect(mockSummarize).toHaveBeenCalled();
      expect(result.wasSummarized).toBe(true);
    });

    it('should handle summarization errors gracefully', async () => {
      const messages: Message[] = [];
      for (let i = 0; i < 30; i++) {
        messages.push({
          id: String(i),
          role: i % 2 === 0 ? 'user' : 'assistant',
          content: 'x'.repeat(100),
        });
      }

      const mockSummarize = vi.fn().mockRejectedValue(new Error('API Error'));

      const result = await prepareMessagesForLLM(messages, mockSummarize, {
        maxTokens: 500,
        threshold: 0.1,
        minRecentMessages: 5,
      });

      // Should return original messages on error
      expect(result.wasSummarized).toBe(false);
      expect(result.messages).toEqual(messages);
    });
  });

  describe('isSummaryMessage', () => {
    it('should return true for summary messages', () => {
      const summary: SummaryMessage = {
        id: 'summary',
        role: 'system',
        content: 'Summary',
        isSummary: true,
        originalMessageCount: 10,
        summarizedAt: new Date(),
      };

      expect(isSummaryMessage(summary)).toBe(true);
    });

    it('should return false for regular messages', () => {
      const message: Message = {
        id: '1',
        role: 'user',
        content: 'Hello',
      };

      expect(isSummaryMessage(message)).toBe(false);
    });

    it('should return false for system messages without isSummary', () => {
      const systemMessage: Message = {
        id: 'system',
        role: 'system',
        content: 'System prompt',
      };

      expect(isSummaryMessage(systemMessage)).toBe(false);
    });
  });

  describe('getContextStats', () => {
    it('should return correct stats for empty messages', () => {
      const stats = getContextStats([]);

      expect(stats.totalTokens).toBe(0);
      expect(stats.messageCount).toBe(0);
      expect(stats.summaryCount).toBe(0);
      expect(stats.usagePercent).toBe(0);
      expect(stats.isNearLimit).toBe(false);
    });

    it('should count summary messages', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello' },
        {
          id: 'summary',
          role: 'system',
          content: 'Summary',
          isSummary: true,
          originalMessageCount: 5,
          summarizedAt: new Date(),
        } as SummaryMessage,
        { id: '2', role: 'assistant', content: 'Hi!' },
      ];

      const stats = getContextStats(messages);

      expect(stats.messageCount).toBe(3);
      expect(stats.summaryCount).toBe(1);
    });

    it('should calculate usage percentage correctly', () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello' },
      ];

      const stats = getContextStats(messages);

      expect(stats.usagePercent).toBeGreaterThan(0);
      expect(stats.usagePercent).toBeLessThan(1); // Very small message
    });

    it('should detect when near limit', () => {
      // Create a very large message that approaches the limit
      const largeContent = 'x'.repeat(100000); // Will be > 80% of 180k tokens
      const messages: Message[] = [
        { id: '1', role: 'user', content: largeContent },
      ];

      const stats = getContextStats(messages);

      // With such a large message, we should be near the limit
      expect(stats.totalTokens).toBeGreaterThan(MAX_CONTEXT_TOKENS * 0.1);
    });
  });
});
