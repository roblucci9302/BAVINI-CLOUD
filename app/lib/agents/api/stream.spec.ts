/**
 * Tests for stream utilities module
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createStreamChunk, enqueueChunk, sendAgentStatus, sendText, sendError, sendDone } from './stream';
import type { StreamChunk } from './types';

describe('stream utilities', () => {
  describe('createStreamChunk', () => {
    it('should create JSON string with newline', () => {
      const chunk: StreamChunk = { type: 'text', content: 'Hello' };
      const result = createStreamChunk(chunk);

      expect(result).toBe('{"type":"text","content":"Hello"}\n');
    });

    it('should handle agent_status type', () => {
      const chunk: StreamChunk = { type: 'agent_status', agent: 'coder', status: 'executing' };
      const result = createStreamChunk(chunk);
      const parsed = JSON.parse(result.trim());

      expect(parsed.type).toBe('agent_status');
      expect(parsed.agent).toBe('coder');
      expect(parsed.status).toBe('executing');
    });

    it('should handle error type', () => {
      const chunk: StreamChunk = { type: 'error', error: 'Something went wrong' };
      const result = createStreamChunk(chunk);
      const parsed = JSON.parse(result.trim());

      expect(parsed.type).toBe('error');
      expect(parsed.error).toBe('Something went wrong');
    });

    it('should handle done type', () => {
      const chunk: StreamChunk = { type: 'done' };
      const result = createStreamChunk(chunk);
      const parsed = JSON.parse(result.trim());

      expect(parsed.type).toBe('done');
    });

    it('should handle content with special characters', () => {
      const chunk: StreamChunk = { type: 'text', content: 'Line 1\nLine 2\t"quoted"' };
      const result = createStreamChunk(chunk);
      const parsed = JSON.parse(result.trim());

      expect(parsed.content).toBe('Line 1\nLine 2\t"quoted"');
    });

    it('should handle unicode content', () => {
      const chunk: StreamChunk = { type: 'text', content: 'Créé avec succès 🎉' };
      const result = createStreamChunk(chunk);
      const parsed = JSON.parse(result.trim());

      expect(parsed.content).toBe('Créé avec succès 🎉');
    });
  });

  describe('enqueueChunk', () => {
    let mockController: ReadableStreamDefaultController;
    let encoder: TextEncoder;
    let enqueuedData: Uint8Array[];

    beforeEach(() => {
      enqueuedData = [];
      mockController = {
        enqueue: vi.fn((data: Uint8Array) => {
          enqueuedData.push(data);
        }),
        close: vi.fn(),
        error: vi.fn(),
        desiredSize: 1,
      } as unknown as ReadableStreamDefaultController;
      encoder = new TextEncoder();
    });

    it('should encode and enqueue chunk', () => {
      const chunk: StreamChunk = { type: 'text', content: 'test' };
      enqueueChunk(mockController, encoder, chunk);

      expect(mockController.enqueue).toHaveBeenCalledTimes(1);
      expect(enqueuedData.length).toBe(1);

      const decoded = new TextDecoder().decode(enqueuedData[0]);
      expect(decoded).toBe('{"type":"text","content":"test"}\n');
    });

    it('should handle multiple enqueues', () => {
      enqueueChunk(mockController, encoder, { type: 'text', content: 'one' });
      enqueueChunk(mockController, encoder, { type: 'text', content: 'two' });
      enqueueChunk(mockController, encoder, { type: 'text', content: 'three' });

      expect(mockController.enqueue).toHaveBeenCalledTimes(3);
      expect(enqueuedData.length).toBe(3);
    });
  });

  describe('sendAgentStatus', () => {
    let mockController: ReadableStreamDefaultController;
    let encoder: TextEncoder;
    let enqueuedData: Uint8Array[];

    beforeEach(() => {
      enqueuedData = [];
      mockController = {
        enqueue: vi.fn((data: Uint8Array) => {
          enqueuedData.push(data);
        }),
        close: vi.fn(),
        error: vi.fn(),
        desiredSize: 1,
      } as unknown as ReadableStreamDefaultController;
      encoder = new TextEncoder();
    });

    it('should send agent status with correct format', () => {
      sendAgentStatus(mockController, encoder, 'orchestrator', 'thinking');

      const decoded = new TextDecoder().decode(enqueuedData[0]);
      const parsed = JSON.parse(decoded.trim());

      expect(parsed.type).toBe('agent_status');
      expect(parsed.agent).toBe('orchestrator');
      expect(parsed.status).toBe('thinking');
    });

    it('should handle different agent names', () => {
      const agents = ['coder', 'builder', 'fixer', 'tester', 'reviewer', 'explore'];

      agents.forEach((agent) => {
        enqueuedData = [];
        sendAgentStatus(mockController, encoder, agent, 'executing');

        const decoded = new TextDecoder().decode(enqueuedData[0]);
        const parsed = JSON.parse(decoded.trim());

        expect(parsed.agent).toBe(agent);
      });
    });

    it('should handle different statuses', () => {
      const statuses = ['thinking', 'executing', 'completed', 'failed', 'waiting'];

      statuses.forEach((status) => {
        enqueuedData = [];
        sendAgentStatus(mockController, encoder, 'coder', status);

        const decoded = new TextDecoder().decode(enqueuedData[0]);
        const parsed = JSON.parse(decoded.trim());

        expect(parsed.status).toBe(status);
      });
    });
  });

  describe('sendText', () => {
    let mockController: ReadableStreamDefaultController;
    let encoder: TextEncoder;
    let enqueuedData: Uint8Array[];

    beforeEach(() => {
      enqueuedData = [];
      mockController = {
        enqueue: vi.fn((data: Uint8Array) => {
          enqueuedData.push(data);
        }),
        close: vi.fn(),
        error: vi.fn(),
        desiredSize: 1,
      } as unknown as ReadableStreamDefaultController;
      encoder = new TextEncoder();
    });

    it('should send text with correct format', () => {
      sendText(mockController, encoder, 'Hello, world!');

      const decoded = new TextDecoder().decode(enqueuedData[0]);
      const parsed = JSON.parse(decoded.trim());

      expect(parsed.type).toBe('text');
      expect(parsed.content).toBe('Hello, world!');
    });

    it('should handle empty string', () => {
      sendText(mockController, encoder, '');

      const decoded = new TextDecoder().decode(enqueuedData[0]);
      const parsed = JSON.parse(decoded.trim());

      expect(parsed.content).toBe('');
    });

    it('should handle multiline text', () => {
      const multiline = 'Line 1\nLine 2\nLine 3';
      sendText(mockController, encoder, multiline);

      const decoded = new TextDecoder().decode(enqueuedData[0]);
      const parsed = JSON.parse(decoded.trim());

      expect(parsed.content).toBe(multiline);
    });

    it('should handle code blocks', () => {
      const code = '```typescript\nconst x = 1;\n```';
      sendText(mockController, encoder, code);

      const decoded = new TextDecoder().decode(enqueuedData[0]);
      const parsed = JSON.parse(decoded.trim());

      expect(parsed.content).toBe(code);
    });

    it('should handle large text content', () => {
      const largeText = 'x'.repeat(10000);
      sendText(mockController, encoder, largeText);

      const decoded = new TextDecoder().decode(enqueuedData[0]);
      const parsed = JSON.parse(decoded.trim());

      expect(parsed.content.length).toBe(10000);
    });
  });

  describe('sendError', () => {
    let mockController: ReadableStreamDefaultController;
    let encoder: TextEncoder;
    let enqueuedData: Uint8Array[];

    beforeEach(() => {
      enqueuedData = [];
      mockController = {
        enqueue: vi.fn((data: Uint8Array) => {
          enqueuedData.push(data);
        }),
        close: vi.fn(),
        error: vi.fn(),
        desiredSize: 1,
      } as unknown as ReadableStreamDefaultController;
      encoder = new TextEncoder();
    });

    it('should send error with correct format', () => {
      sendError(mockController, encoder, 'Something went wrong');

      const decoded = new TextDecoder().decode(enqueuedData[0]);
      const parsed = JSON.parse(decoded.trim());

      expect(parsed.type).toBe('error');
      expect(parsed.error).toBe('Something went wrong');
    });

    it('should handle error with stack trace', () => {
      const errorWithStack = 'Error: Test\n    at Function.x (file.js:1:1)\n    at main (app.js:10:5)';
      sendError(mockController, encoder, errorWithStack);

      const decoded = new TextDecoder().decode(enqueuedData[0]);
      const parsed = JSON.parse(decoded.trim());

      expect(parsed.error).toBe(errorWithStack);
    });

    it('should handle timeout error', () => {
      sendError(mockController, encoder, 'Request timeout: operation took too long');

      const decoded = new TextDecoder().decode(enqueuedData[0]);
      const parsed = JSON.parse(decoded.trim());

      expect(parsed.error).toContain('timeout');
    });
  });

  describe('sendDone', () => {
    let mockController: ReadableStreamDefaultController;
    let encoder: TextEncoder;
    let enqueuedData: Uint8Array[];

    beforeEach(() => {
      enqueuedData = [];
      mockController = {
        enqueue: vi.fn((data: Uint8Array) => {
          enqueuedData.push(data);
        }),
        close: vi.fn(),
        error: vi.fn(),
        desiredSize: 1,
      } as unknown as ReadableStreamDefaultController;
      encoder = new TextEncoder();
    });

    it('should send done signal with correct format', () => {
      sendDone(mockController, encoder);

      const decoded = new TextDecoder().decode(enqueuedData[0]);
      const parsed = JSON.parse(decoded.trim());

      expect(parsed.type).toBe('done');
    });

    it('should have no additional properties', () => {
      sendDone(mockController, encoder);

      const decoded = new TextDecoder().decode(enqueuedData[0]);
      const parsed = JSON.parse(decoded.trim());

      expect(Object.keys(parsed)).toEqual(['type']);
    });
  });

  describe('Integration: Full streaming sequence', () => {
    let mockController: ReadableStreamDefaultController;
    let encoder: TextEncoder;
    let enqueuedData: Uint8Array[];

    beforeEach(() => {
      enqueuedData = [];
      mockController = {
        enqueue: vi.fn((data: Uint8Array) => {
          enqueuedData.push(data);
        }),
        close: vi.fn(),
        error: vi.fn(),
        desiredSize: 1,
      } as unknown as ReadableStreamDefaultController;
      encoder = new TextEncoder();
    });

    it('should handle typical streaming sequence', () => {
      // Simulate a typical agent response sequence
      sendAgentStatus(mockController, encoder, 'orchestrator', 'thinking');
      sendAgentStatus(mockController, encoder, 'orchestrator', 'completed');
      sendAgentStatus(mockController, encoder, 'coder', 'executing');
      sendText(mockController, encoder, 'Creating your component...');
      sendText(mockController, encoder, '```tsx\nconst Button = () => <button>Click me</button>;\n```');
      sendAgentStatus(mockController, encoder, 'coder', 'completed');
      sendDone(mockController, encoder);

      expect(enqueuedData.length).toBe(7);

      // Verify sequence
      const messages = enqueuedData.map((d) => JSON.parse(new TextDecoder().decode(d).trim()));

      expect(messages[0]).toEqual({ type: 'agent_status', agent: 'orchestrator', status: 'thinking' });
      expect(messages[1]).toEqual({ type: 'agent_status', agent: 'orchestrator', status: 'completed' });
      expect(messages[2]).toEqual({ type: 'agent_status', agent: 'coder', status: 'executing' });
      expect(messages[3].type).toBe('text');
      expect(messages[4].type).toBe('text');
      expect(messages[5]).toEqual({ type: 'agent_status', agent: 'coder', status: 'completed' });
      expect(messages[6]).toEqual({ type: 'done' });
    });

    it('should handle error sequence', () => {
      sendAgentStatus(mockController, encoder, 'orchestrator', 'thinking');
      sendAgentStatus(mockController, encoder, 'builder', 'executing');
      sendError(mockController, encoder, 'Build failed: missing dependency');
      sendAgentStatus(mockController, encoder, 'builder', 'failed');
      sendDone(mockController, encoder);

      expect(enqueuedData.length).toBe(5);

      const messages = enqueuedData.map((d) => JSON.parse(new TextDecoder().decode(d).trim()));

      expect(messages[2].type).toBe('error');
      expect(messages[3].status).toBe('failed');
    });
  });
});
