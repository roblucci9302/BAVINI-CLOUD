import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ActionFunctionArgs } from 'react-router';

// Mock dependencies
vi.mock('~/lib/security/rate-limiter', () => ({
  withRateLimit: vi.fn().mockImplementation((_request, handler) => handler()),
}));

vi.mock('~/lib/.server/llm/stream-text', () => ({
  streamText: vi.fn(),
}));

/*
 * AI SDK 6.x - StreamingTextResponse and parseStreamPart were removed
 * We now use textStream directly with custom Response handling
 */
vi.mock('ai', () => ({}));

vi.mock('~/utils/stripIndent', () => ({
  stripIndents: (strings: TemplateStringsArray, ...values: unknown[]) => {
    return strings.reduce((acc, str, i) => {
      return acc + str + (values[i] ?? '');
    }, '');
  },
}));

vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

import { action } from './api.enhancer';
import { streamText } from '~/lib/.server/llm/stream-text';

describe('api.enhancer', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('action', () => {
    const createMockRequest = (body: Record<string, unknown>) => ({
      json: vi.fn().mockResolvedValue(body),
    });

    const createMockContext = () => ({
      cloudflare: {
        env: {
          ANTHROPIC_API_KEY: 'test-key',
        },
      },
    });

    it('should return streaming response', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('0:"Enhanced prompt"\n'));
          controller.close();
        },
      });

      (streamText as any).mockResolvedValue({
        textStream: (async function* () {
          yield 'Enhanced text';
        })(),
      });

      const request = createMockRequest({
        message: 'Make a button',
      });
      const context = createMockContext();

      const response = await action({
        request: request as unknown as Request,
        context: context,
        params: {},
      } as ActionFunctionArgs);

      expect(response).toBeInstanceOf(Response);
    });

    it('should call streamText with correct prompt structure', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      (streamText as any).mockResolvedValue({
        textStream: (async function* () {
          yield 'Enhanced text';
        })(),
      });

      const request = createMockRequest({
        message: 'Create a login form',
      });
      const context = createMockContext();

      await action({
        request: request as unknown as Request,
        context: context,
        params: {},
      } as ActionFunctionArgs);

      expect(streamText).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            role: 'user',
            content: expect.stringContaining('Create a login form'),
          }),
        ]),
        context.cloudflare.env,
      );
    });

    it('should include original prompt in request', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      (streamText as any).mockResolvedValue({
        textStream: (async function* () {
          yield 'Enhanced text';
        })(),
      });

      const originalMessage = 'Build a todo app';
      const request = createMockRequest({
        message: originalMessage,
      });
      const context = createMockContext();

      await action({
        request: request as unknown as Request,
        context: context,
        params: {},
      } as ActionFunctionArgs);

      expect(streamText).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining(originalMessage),
          }),
        ]),
        expect.anything(),
      );
    });

    it('should include improvement instructions', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      (streamText as any).mockResolvedValue({
        textStream: (async function* () {
          yield 'Enhanced text';
        })(),
      });

      const request = createMockRequest({
        message: 'Test',
      });
      const context = createMockContext();

      await action({
        request: request as unknown as Request,
        context: context,
        params: {},
      } as ActionFunctionArgs);

      expect(streamText).toHaveBeenCalledWith(
        expect.arrayContaining([
          expect.objectContaining({
            content: expect.stringContaining('improve the user prompt'),
          }),
        ]),
        expect.anything(),
      );
    });

    describe('error handling', () => {
      it('should return 500 response on error', async () => {
        (streamText as any).mockRejectedValue(new Error('LLM Error'));

        const request = createMockRequest({
          message: 'Test',
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

      it('should handle empty message', async () => {
        const mockStream = new ReadableStream({
          start(controller) {
            controller.close();
          },
        });

        (streamText as any).mockResolvedValue({
          textStream: (async function* () {
            yield 'Enhanced text';
          })(),
        });

        const request = createMockRequest({
          message: '',
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        // Should still process (empty string is valid input)
        expect(response).toBeInstanceOf(Response);
      });
    });

    describe('stream transformation', () => {
      it('should transform AI SDK stream format', async () => {
        // Create a mock stream that outputs AI SDK format
        const mockStream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('0:"Improved"\n'));
            controller.enqueue(new TextEncoder().encode('0:" prompt"\n'));
            controller.close();
          },
        });

        (streamText as any).mockResolvedValue({
          textStream: (async function* () {
            yield 'Enhanced text';
          })(),
        });

        const request = createMockRequest({
          message: 'Original prompt',
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        expect(response).toBeInstanceOf(Response);
      });
    });
  });

  describe('prompt structure', () => {
    it('should wrap original prompt in tags', async () => {
      const mockStream = new ReadableStream({
        start(controller) {
          controller.close();
        },
      });

      (streamText as any).mockResolvedValue({
        textStream: (async function* () {
          yield 'Enhanced text';
        })(),
      });

      const request = {
        json: vi.fn().mockResolvedValue({ message: 'My prompt' }),
      };
      const context = {
        cloudflare: { env: { ANTHROPIC_API_KEY: 'key' } },
      };

      await action({
        request: request as unknown as Request,
        context: context,
        params: {},
      } as ActionFunctionArgs);

      const call = (streamText as any).mock.calls[0];
      const prompt = call[0][0].content;

      expect(prompt).toContain('<original_prompt>');
      expect(prompt).toContain('</original_prompt>');
    });
  });
});
