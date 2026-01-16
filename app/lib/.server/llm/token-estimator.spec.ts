import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  TokenEstimator,
  getTokenEstimator,
  resetTokenEstimator,
  countTokens,
  countTokensSync,
  countMessageTokens,
  countMessagesTokens,
  estimateTokens,
} from './token-estimator';
import type { Message } from '~/types/message';

describe('TokenEstimator', () => {
  let estimator: TokenEstimator;

  beforeEach(() => {
    estimator = new TokenEstimator({ enableCache: false });
  });

  afterEach(() => {
    estimator.dispose();
  });

  describe('initialization', () => {
    it('should initialize successfully', async () => {
      await estimator.initialize();
      // Should not throw
    });

    it('should handle multiple initialization calls', async () => {
      await estimator.initialize();
      await estimator.initialize();
      await estimator.initialize();
      // Should not throw or cause issues
    });
  });

  describe('countTokens', () => {
    it('should return 0 for empty string', async () => {
      const result = await estimator.countTokens('');
      expect(result.count).toBe(0);
      expect(result.method).toBe('tiktoken');
    });

    it('should count tokens for simple text', async () => {
      const result = await estimator.countTokens('Hello, world!');
      expect(result.count).toBeGreaterThan(0);
      expect(result.count).toBeLessThan(10);
      expect(result.method).toBe('tiktoken');
    });

    it('should count tokens for longer text', async () => {
      const text = 'This is a longer piece of text that contains multiple words and should result in more tokens.';
      const result = await estimator.countTokens(text);
      expect(result.count).toBeGreaterThan(10);
      expect(result.method).toBe('tiktoken');
    });

    it('should count tokens for code', async () => {
      const code = `
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}
      `.trim();
      const result = await estimator.countTokens(code);
      expect(result.count).toBeGreaterThan(20);
      expect(result.method).toBe('tiktoken');
    });

    it('should count tokens for French text', async () => {
      const text = "Bonjour, comment allez-vous aujourd'hui ? C'est une belle journée.";
      const result = await estimator.countTokens(text);
      expect(result.count).toBeGreaterThan(10);
      expect(result.method).toBe('tiktoken');
    });

    it('should count tokens for mixed content', async () => {
      const text = `
# Documentation
This is some documentation with code:
\`\`\`javascript
const x = 42;
\`\`\`
And more text after.
      `.trim();
      const result = await estimator.countTokens(text);
      expect(result.count).toBeGreaterThan(15);
      expect(result.method).toBe('tiktoken');
    });
  });

  describe('countTokensSync', () => {
    it('should return 0 for empty string', () => {
      const count = estimator.countTokensSync('');
      expect(count).toBe(0);
    });

    it('should use heuristic before initialization', () => {
      const count = estimator.countTokensSync('Hello, world!');
      expect(count).toBeGreaterThan(0);
    });

    it('should use tiktoken after initialization', async () => {
      await estimator.initialize();
      const count = estimator.countTokensSync('Hello, world!');
      expect(count).toBeGreaterThan(0);
      expect(count).toBeLessThan(10);
    });
  });

  describe('caching', () => {
    it('should cache results when enabled', async () => {
      const cachedEstimator = new TokenEstimator({ enableCache: true });

      const result1 = await cachedEstimator.countTokens('Hello, world!');
      expect(result1.cached).toBe(false);

      const result2 = await cachedEstimator.countTokens('Hello, world!');
      expect(result2.cached).toBe(true);
      expect(result2.count).toBe(result1.count);

      cachedEstimator.dispose();
    });

    it('should not cache when disabled', async () => {
      const result1 = await estimator.countTokens('Hello, world!');
      expect(result1.cached).toBe(false);

      const result2 = await estimator.countTokens('Hello, world!');
      expect(result2.cached).toBe(false);
    });

    it('should clear cache', async () => {
      const cachedEstimator = new TokenEstimator({ enableCache: true });

      await cachedEstimator.countTokens('Hello, world!');
      const stats1 = cachedEstimator.getCacheStats();
      expect(stats1.size).toBeGreaterThan(0);

      cachedEstimator.clearCache();
      const stats2 = cachedEstimator.getCacheStats();
      expect(stats2.size).toBe(0);

      cachedEstimator.dispose();
    });
  });

  describe('countMessageTokens', () => {
    it('should count tokens for simple message', async () => {
      const message: Message = {
        id: '1',
        role: 'user',
        content: 'Hello, how are you?',
      };

      const breakdown = await estimator.countMessageTokens(message);
      expect(breakdown.content).toBeGreaterThan(0);
      expect(breakdown.overhead).toBe(4);
      expect(breakdown.total).toBeGreaterThan(breakdown.content);
    });

    it('should count tokens for message with tool invocations', async () => {
      const message: Message = {
        id: '2',
        role: 'assistant',
        content: 'Let me help you with that.',
        toolInvocations: [
          {
            toolCallId: 'call1',
            toolName: 'readFile',
            args: { path: '/test/file.txt' },
            state: 'result',
            result: { content: 'File contents here' },
          },
        ],
      };

      const breakdown = await estimator.countMessageTokens(message);
      expect(breakdown.content).toBeGreaterThan(0);
      expect(breakdown.toolInvocations).toBeGreaterThan(0);
      expect(breakdown.total).toBeGreaterThan(breakdown.content + breakdown.overhead);
    });

    it('should count tokens for message with attachments', async () => {
      const message: Message = {
        id: '3',
        role: 'user',
        content: 'Check this image',
        experimental_attachments: [
          { name: 'image.png', contentType: 'image/png', url: 'data:...' },
        ],
      };

      const breakdown = await estimator.countMessageTokens(message);
      expect(breakdown.attachments).toBeGreaterThan(0);
      expect(breakdown.total).toBeGreaterThan(breakdown.content + breakdown.overhead);
    });
  });

  describe('countMessagesTokens', () => {
    it('should count tokens for multiple messages', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi there! How can I help you today?' },
        { id: '3', role: 'user', content: 'I need help with coding.' },
      ];

      const result = await estimator.countMessagesTokens(messages);
      expect(result.total).toBeGreaterThan(0);
      expect(result.breakdown).toHaveLength(3);

      const sumBreakdown = result.breakdown.reduce((sum, b) => sum + b.total, 0);
      expect(result.total).toBe(sumBreakdown);
    });

    it('should return 0 for empty array', async () => {
      const result = await estimator.countMessagesTokens([]);
      expect(result.total).toBe(0);
      expect(result.breakdown).toHaveLength(0);
    });
  });
});

describe('Singleton and convenience functions', () => {
  beforeEach(() => {
    resetTokenEstimator();
  });

  afterEach(() => {
    resetTokenEstimator();
  });

  describe('getTokenEstimator', () => {
    it('should return singleton instance', () => {
      const estimator1 = getTokenEstimator();
      const estimator2 = getTokenEstimator();
      expect(estimator1).toBe(estimator2);
    });
  });

  describe('countTokens', () => {
    it('should count tokens asynchronously', async () => {
      const count = await countTokens('Hello, world!');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('countTokensSync', () => {
    it('should count tokens synchronously', () => {
      const count = countTokensSync('Hello, world!');
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('countMessageTokens', () => {
    it('should count message tokens', async () => {
      const message: Message = {
        id: '1',
        role: 'user',
        content: 'Hello, world!',
      };
      const count = await countMessageTokens(message);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('countMessagesTokens', () => {
    it('should count multiple messages tokens', async () => {
      const messages: Message[] = [
        { id: '1', role: 'user', content: 'Hello' },
        { id: '2', role: 'assistant', content: 'Hi there!' },
      ];
      const count = await countMessagesTokens(messages);
      expect(count).toBeGreaterThan(0);
    });
  });

  describe('estimateTokens (legacy)', () => {
    it('should work as backward-compatible function', () => {
      const count = estimateTokens('Hello, world!');
      expect(count).toBeGreaterThan(0);
    });

    it('should return 0 for empty string', () => {
      const count = estimateTokens('');
      expect(count).toBe(0);
    });
  });
});

describe('Token counting accuracy', () => {
  let estimator: TokenEstimator;

  beforeEach(async () => {
    estimator = new TokenEstimator({ enableCache: false });
    await estimator.initialize();
  });

  afterEach(() => {
    estimator.dispose();
  });

  it('should count "Hello world" as approximately 2-3 tokens', async () => {
    const result = await estimator.countTokens('Hello world');
    // tiktoken cl100k_base: "Hello" = 1, " world" = 1 = 2 tokens
    expect(result.count).toBeGreaterThanOrEqual(2);
    expect(result.count).toBeLessThanOrEqual(3);
  });

  it('should count numbers correctly', async () => {
    const result = await estimator.countTokens('123456789');
    // Numbers are often 1 token per 3-4 digits
    expect(result.count).toBeGreaterThanOrEqual(1);
    expect(result.count).toBeLessThanOrEqual(5);
  });

  it('should count special characters', async () => {
    const result = await estimator.countTokens('!@#$%^&*()');
    // Special chars often 1 token each
    expect(result.count).toBeGreaterThan(0);
  });

  it('should count unicode correctly', async () => {
    const result = await estimator.countTokens('こんにちは世界');
    // Japanese characters are typically 1-3 tokens each
    expect(result.count).toBeGreaterThan(0);
  });

  it('should count JSON correctly', async () => {
    const json = JSON.stringify({ name: 'John', age: 30, city: 'New York' });
    const result = await estimator.countTokens(json);
    expect(result.count).toBeGreaterThan(10);
    expect(result.count).toBeLessThan(30);
  });
});
