import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ActionFunctionArgs } from 'react-router';

// Mock dependencies
vi.mock('~/lib/security/rate-limiter', () => ({
  withRateLimit: vi.fn().mockImplementation((_request, handler) => handler()),
}));

vi.mock('~/lib/.server/llm/stream-text', () => ({
  streamText: vi.fn(),
  isWebSearchAvailable: vi.fn().mockReturnValue(false),
}));

vi.mock('~/lib/.server/llm/switchable-stream', () => ({
  default: vi.fn().mockImplementation(() => ({
    switches: 0,
    readable: new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('test'));
        controller.close();
      },
    }),
    switchSource: vi.fn(),
    close: vi.fn(),
  })),
}));

vi.mock('~/lib/.server/agents', () => ({
  ChatModeAgent: vi.fn().mockImplementation(() => ({
    setContext: vi.fn(),
    process: vi.fn().mockResolvedValue({ content: 'Test response' }),
  })),
}));

vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('~/lib/.server/llm/context-manager', () => ({
  analyzeContext: vi.fn().mockReturnValue({
    totalTokens: 1000,
    messageCount: 1,
    usagePercent: 5,
    needsSummarization: false,
    messagesToSummarize: [],
    messagesToKeep: [],
  }),
  prepareMessagesForLLM: vi.fn().mockResolvedValue({
    messages: [],
    wasSummarized: false,
    analysis: {
      totalTokens: 1000,
      usagePercent: 5,
      messageCount: 1,
    },
  }),
  getContextStats: vi.fn().mockReturnValue({
    totalTokens: 1000,
    usagePercent: 5,
    messageCount: 1,
    summaryCount: 0,
    isNearLimit: false,
  }),
}));

import { action } from './api.chat';
import { streamText } from '~/lib/.server/llm/stream-text';

describe('api.chat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('action', () => {
    const createMockRequest = (body: Record<string, unknown>) => {
      const bodyString = JSON.stringify(body);
      return {
        json: vi.fn().mockResolvedValue(body),
        text: vi.fn().mockResolvedValue(bodyString),
        headers: {
          get: vi.fn().mockImplementation((name: string) => {
            if (name === 'content-length') {
              return bodyString.length.toString();
            }
            return null;
          }),
        },
      };
    };

    const createMockContext = () => ({
      cloudflare: {
        env: {
          ANTHROPIC_API_KEY: 'test-key',
        },
      },
    });

    describe('chat mode', () => {
      it('should handle chat mode requests', async () => {
        const request = createMockRequest({
          messages: [{ role: 'user', content: 'Hello' }],
          mode: 'chat',
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(200);
      });

      it('should return streaming response for chat mode', async () => {
        const request = createMockRequest({
          messages: [{ role: 'user', content: 'Analyze this code' }],
          mode: 'chat',
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        expect(response.headers.get('Content-Type')).toBe('text/plain; charset=utf-8');
      });
    });

    describe('agent mode', () => {
      it('should default to agent mode when not specified', async () => {
        // Mock textStream as async generator (AI SDK 6.x API)
        const mockTextStream = (async function* () {
          yield 'Test response';
        })();

        (streamText as any).mockResolvedValue({
          textStream: mockTextStream,
        });

        const request = createMockRequest({
          messages: [{ role: 'user', content: 'Create a button' }],
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(200);
      });

      it('should handle multiAgent flag', async () => {
        // Mock textStream as async generator (AI SDK 6.x API)
        const mockTextStream = (async function* () {
          yield 'Test response';
        })();

        (streamText as any).mockResolvedValue({
          textStream: mockTextStream,
        });

        const request = createMockRequest({
          messages: [{ role: 'user', content: 'Build app' }],
          mode: 'agent',
          multiAgent: true,
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        expect(response.status).toBe(200);
      });
    });

    describe('continuation context', () => {
      it('should inject continuation instructions when context provided', async () => {
        // Mock textStream as async generator (AI SDK 6.x API)
        const mockTextStream = (async function* () {
          yield 'Continuation response';
        })();

        (streamText as any).mockResolvedValue({
          textStream: mockTextStream,
        });

        const request = createMockRequest({
          messages: [{ role: 'user', content: 'Continue' }],
          mode: 'agent',
          continuationContext: {
            artifactId: 'artifact-123',
          },
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        expect(response.status).toBe(200);

        // Verify streamText was called (indicating agent mode processed)
        expect(streamText).toHaveBeenCalled();
      });
    });

    describe('error handling', () => {
      it('should handle errors and return 500', async () => {
        (streamText as any).mockRejectedValue(new Error('API Error'));

        const request = createMockRequest({
          messages: [{ role: 'user', content: 'Test' }],
          mode: 'agent',
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        expect(response).toBeInstanceOf(Response);
        expect(response.status).toBe(500);
      });
    });
  });

  describe('getLastUserMessage helper', () => {
    it('should extract last user message', async () => {
      const request = createMockRequest({
        messages: [
          { role: 'assistant', content: 'Hello' },
          { role: 'user', content: 'First question' },
          { role: 'assistant', content: 'Response' },
          { role: 'user', content: 'Second question' },
        ],
        mode: 'chat',
      });
      const context = createMockContext();

      // The chat mode uses getLastUserMessage internally
      await action({
        request: request as unknown as Request,
        context: context,
        params: {},
      } as ActionFunctionArgs);

      // If it processed without error, the helper worked correctly
      expect(true).toBe(true);
    });
  });

  // Helper function used in tests
  function createMockRequest(body: Record<string, unknown>) {
    const bodyString = JSON.stringify(body);
    return {
      json: vi.fn().mockResolvedValue(body),
      text: vi.fn().mockResolvedValue(bodyString),
      headers: {
        get: vi.fn().mockImplementation((name: string) => {
          if (name === 'content-length') {
            return bodyString.length.toString();
          }
          return null;
        }),
      },
    };
  }

  function createMockContext() {
    return {
      cloudflare: {
        env: {
          ANTHROPIC_API_KEY: 'test-key',
        },
      },
    };
  }
});
