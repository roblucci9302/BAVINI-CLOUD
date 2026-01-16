import { describe, expect, it, vi, beforeEach } from 'vitest';
import type { ActionFunctionArgs } from 'react-router';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Create hoisted mock for streamText
const mockStreamText = vi.hoisted(() => vi.fn());

// Mock rate limiter
vi.mock('~/lib/security/rate-limiter', () => ({
  withRateLimit: vi.fn().mockImplementation((_request, handler) => handler()),
}));

vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

/*
 * Mock AI SDK with controllable behavior (AI SDK 6.x API)
 * Note: convertToCoreMessages was removed in SDK 6.x, we use direct message arrays now
 */
vi.mock('ai', () => ({
  streamText: mockStreamText,
}));

// Mock LLM functions
vi.mock('~/lib/.server/llm/api-key', () => ({
  getAPIKey: vi.fn().mockReturnValue('test-api-key'),
}));

vi.mock('~/lib/.server/llm/model', () => ({
  getAnthropicModel: vi.fn().mockReturnValue({}),
}));

vi.mock('~/lib/.server/llm/prompts', () => ({
  getSystemPrompt: vi.fn().mockReturnValue('Test system prompt'),
}));

// Mock agent prompts
vi.mock('~/lib/agents/prompts/explore-prompt', () => ({
  EXPLORE_SYSTEM_PROMPT: 'Explore prompt',
}));

vi.mock('~/lib/agents/prompts/builder-prompt', () => ({
  BUILDER_SYSTEM_PROMPT: 'Builder prompt',
}));

vi.mock('~/lib/agents/prompts/tester-prompt', () => ({
  TESTER_SYSTEM_PROMPT: 'Tester prompt',
}));

vi.mock('~/lib/agents/prompts/reviewer-prompt', () => ({
  REVIEWER_SYSTEM_PROMPT: 'Reviewer prompt',
}));

vi.mock('~/lib/agents/prompts/fixer-prompt', () => ({
  FIXER_SYSTEM_PROMPT: 'Fixer prompt',
}));

import { action } from './api.agent';

describe('api.agent', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Default successful mock for streamText
    mockStreamText.mockReturnValue({
      textStream: (async function* () {
        yield 'Test response';
      })(),
    });
  });

  describe('action', () => {
    const createMockRequest = (body: Record<string, unknown>) => ({
      url: 'http://localhost:3000/api/agent',
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
      // Mock chat API response
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode('0:"Hello"\n'));
            controller.close();
          },
        }),
      });

      const request = createMockRequest({
        message: 'Create a component',
        controlMode: 'strict',
        multiAgent: true,
      });
      const context = createMockContext();

      const response = await action({
        request: request as unknown as Request,
        context: context,
        params: {},
      } as ActionFunctionArgs);

      expect(response).toBeInstanceOf(Response);
      expect(response.status).toBe(200);
      expect(response.headers.get('Content-Type')).toBe('text/event-stream');
    });

    it('should include Cache-Control header', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      });

      const request = createMockRequest({
        message: 'Test',
      });
      const context = createMockContext();

      const response = await action({
        request: request as unknown as Request,
        context: context,
        params: {},
      } as ActionFunctionArgs);

      expect(response.headers.get('Cache-Control')).toBe('no-cache');
    });

    it('should stream orchestrator status updates', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: new ReadableStream({
          start(controller) {
            controller.close();
          },
        }),
      });

      const request = createMockRequest({
        message: 'Build an app',
      });
      const context = createMockContext();

      const response = await action({
        request: request as unknown as Request,
        context: context,
        params: {},
      } as ActionFunctionArgs);

      const reader = response.body?.getReader();
      const chunks: string[] = [];
      const decoder = new TextDecoder();

      if (reader) {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          chunks.push(decoder.decode(value));
        }
      }

      const fullResponse = chunks.join('');

      // Should contain orchestrator status
      expect(fullResponse).toContain('orchestrator');
      expect(fullResponse).toContain('thinking');
    });

    describe('control modes', () => {
      it('should accept strict control mode', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
        });

        const request = createMockRequest({
          message: 'Test',
          controlMode: 'strict',
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        expect(response.status).toBe(200);
      });

      it('should accept moderate control mode', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
        });

        const request = createMockRequest({
          message: 'Test',
          controlMode: 'moderate',
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        expect(response.status).toBe(200);
      });

      it('should accept permissive control mode', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
        });

        const request = createMockRequest({
          message: 'Test',
          controlMode: 'permissive',
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

    describe('error handling', () => {
      it('should handle chat API errors', async () => {
        // Make streamText throw an error
        mockStreamText.mockRejectedValueOnce(new Error('API Error'));

        const request = createMockRequest({
          message: 'Test',
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        const reader = response.body?.getReader();
        const chunks: string[] = [];
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            chunks.push(decoder.decode(value));
          }
        }

        const fullResponse = chunks.join('');

        // Should contain error status
        expect(fullResponse).toContain('error');
        expect(fullResponse).toContain('failed');
      });

      it('should stream failed status on error', async () => {
        // Make streamText throw an error
        mockStreamText.mockRejectedValueOnce(new Error('Network error'));

        const request = createMockRequest({
          message: 'Test',
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        const reader = response.body?.getReader();
        const chunks: string[] = [];
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            chunks.push(decoder.decode(value));
          }
        }

        const fullResponse = chunks.join('');

        expect(fullResponse).toContain('"status":"failed"');
      });
    });

    describe('stream format', () => {
      it('should stream JSON chunks with newlines', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.enqueue(new TextEncoder().encode('0:"Test content"\n'));
              controller.close();
            },
          }),
        });

        const request = createMockRequest({
          message: 'Test',
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        const reader = response.body?.getReader();
        const chunks: string[] = [];
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            chunks.push(decoder.decode(value));
          }
        }

        const fullResponse = chunks.join('');
        const lines = fullResponse.trim().split('\n');

        // Each line should be valid JSON
        for (const line of lines) {
          expect(() => JSON.parse(line)).not.toThrow();
        }
      });

      it('should include done chunk at end', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
        });

        const request = createMockRequest({
          message: 'Test',
        });
        const context = createMockContext();

        const response = await action({
          request: request as unknown as Request,
          context: context,
          params: {},
        } as ActionFunctionArgs);

        const reader = response.body?.getReader();
        const chunks: string[] = [];
        const decoder = new TextDecoder();

        if (reader) {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            chunks.push(decoder.decode(value));
          }
        }

        const fullResponse = chunks.join('');

        expect(fullResponse).toContain('"type":"done"');
      });
    });
  });
});
