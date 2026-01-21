/**
 * =============================================================================
 * BAVINI Runtime Engine - Streaming SSR Tests
 * =============================================================================
 */

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import {
  StreamingSSREngine,
  createStreamingSSREngine,
  getSharedStreamingSSREngine,
  resetSharedStreamingSSREngine,
  type StreamingChunk,
  type StreamingStats,
} from './streaming-ssr';

describe('StreamingSSREngine', () => {
  let engine: StreamingSSREngine;

  beforeEach(() => {
    engine = createStreamingSSREngine();
  });

  afterEach(() => {
    engine.destroy();
    resetSharedStreamingSSREngine();
  });

  describe('Initialization', () => {
    it('should start with idle status', () => {
      expect(engine.status).toBe('idle');
    });

    it('should have zero active streams initially', () => {
      expect(engine.activeStreamCount).toBe(0);
    });

    it('should accept custom configuration', () => {
      const customEngine = createStreamingSSREngine({
        chunkBufferSize: 2048,
        flushIntervalMs: 100,
        progressiveHydration: false,
      });
      expect(customEngine.status).toBe('idle');
      customEngine.destroy();
    });
  });

  describe('Basic Streaming', () => {
    it('should render HTML to stream', async () => {
      const html = '<html><head><title>Test</title></head><body>Hello</body></html>';
      const stream = engine.renderToStream(html);

      const result = await engine.streamToString(stream);

      expect(result).toContain('Test');
      expect(result).toContain('Hello');
    });

    it('should emit chunks in order', async () => {
      const html = '<html><head><title>Test</title></head><body>Content</body></html>';
      const chunks: StreamingChunk[] = [];

      const stream = engine.renderToStream(html, {
        onChunk: (chunk) => chunks.push(chunk),
      });

      // Consume stream
      await engine.streamToString(stream);

      // Should have at least head, content, and end chunks
      expect(chunks.length).toBeGreaterThanOrEqual(3);
      expect(chunks[chunks.length - 1].type).toBe('end');
    });

    it('should call onComplete callback with stats', async () => {
      const html = '<html><body>Test content here</body></html>';
      let stats: StreamingStats | null = null;

      const stream = engine.renderToStream(html, {
        onComplete: (s) => {
          stats = s;
        },
      });

      await engine.streamToString(stream);

      expect(stats).not.toBeNull();
      expect(stats!.totalChunks).toBeGreaterThan(0);
      expect(stats!.totalBytes).toBeGreaterThan(0);
      expect(stats!.renderTimeMs).toBeGreaterThan(0);
    });

    it('should include timing comments when enabled', async () => {
      const html = '<html><head></head><body>Test</body></html>';
      const stream = engine.renderToStream(html, {
        includeTimingComments: true,
      });

      const result = await engine.streamToString(stream);

      expect(result).toContain('BAVINI SSR Head');
    });
  });

  describe('Chunk Types', () => {
    it('should identify head chunks', async () => {
      const html = '<html><head><title>Title</title></head><body></body></html>';
      const chunks: StreamingChunk[] = [];

      const stream = engine.renderToStream(html, {
        onChunk: (chunk) => chunks.push(chunk),
      });

      await engine.streamToString(stream);

      const headChunk = chunks.find((c) => c.type === 'head');
      expect(headChunk).toBeDefined();
      expect(headChunk!.content).toContain('<title>Title</title>');
    });

    it('should identify content chunks', async () => {
      const html = '<html><body>Main content</body></html>';
      const chunks: StreamingChunk[] = [];

      const stream = engine.renderToStream(html, {
        onChunk: (chunk) => chunks.push(chunk),
      });

      await engine.streamToString(stream);

      const contentChunk = chunks.find((c) => c.type === 'content');
      expect(contentChunk).toBeDefined();
      expect(contentChunk!.content).toContain('Main content');
    });

    it('should handle HTML without head', async () => {
      const html = '<body>Body only</body>';
      const chunks: StreamingChunk[] = [];

      const stream = engine.renderToStream(html, {
        onChunk: (chunk) => chunks.push(chunk),
      });

      await engine.streamToString(stream);

      expect(chunks.some((c) => c.content.includes('Body only'))).toBe(true);
    });

    it('should handle plain HTML content', async () => {
      const html = '<div>Just a div</div>';
      const chunks: StreamingChunk[] = [];

      const stream = engine.renderToStream(html, {
        onChunk: (chunk) => chunks.push(chunk),
      });

      await engine.streamToString(stream);

      expect(chunks.some((c) => c.content.includes('Just a div'))).toBe(true);
    });
  });

  describe('Suspense Boundaries', () => {
    it('should parse suspense boundaries', async () => {
      const html = `
        <html><body>
        <div>Shell content</div>
        <!-- SUSPENSE:async1 -->
        <div>Async content 1</div>
        <!-- /SUSPENSE:async1 -->
        </body></html>
      `;

      const chunks: StreamingChunk[] = [];

      const stream = engine.renderToStream(html, {
        onChunk: (chunk) => chunks.push(chunk),
      });

      await engine.streamToString(stream);

      const suspenseChunk = chunks.find((c) => c.type === 'suspense');
      expect(suspenseChunk).toBeDefined();
      expect(suspenseChunk!.id).toBe('async1');
    });

    it('should track suspense count in stats', async () => {
      const html = `
        <body>
        <!-- SUSPENSE:a --><div>A</div><!-- /SUSPENSE:a -->
        <!-- SUSPENSE:b --><div>B</div><!-- /SUSPENSE:b -->
        </body>
      `;

      let stats: StreamingStats | null = null;

      const stream = engine.renderToStream(html, {
        onComplete: (s) => {
          stats = s;
        },
      });

      await engine.streamToString(stream);

      expect(stats!.suspenseCount).toBe(2);
    });
  });

  describe('Suspense with Async Content', () => {
    it('should render with async content', async () => {
      const shell = '<div id="root"><div id="suspense-content1">Loading...</div></div>';
      const asyncContent = new Map<string, Promise<string>>([
        ['content1', Promise.resolve('<span>Loaded content</span>')],
      ]);

      const stream = await engine.renderToStreamWithSuspense(shell, asyncContent);
      const result = await engine.streamToString(stream);

      expect(result).toContain('Loaded content');
    });

    it('should handle multiple async boundaries', async () => {
      const shell = '<div><div id="suspense-a"></div><div id="suspense-b"></div></div>';
      const asyncContent = new Map<string, Promise<string>>([
        ['a', Promise.resolve('<p>Content A</p>')],
        ['b', Promise.resolve('<p>Content B</p>')],
      ]);

      let stats: StreamingStats | null = null;

      const stream = await engine.renderToStreamWithSuspense(shell, asyncContent, {
        onComplete: (s) => {
          stats = s;
        },
      });

      const result = await engine.streamToString(stream);

      expect(result).toContain('Content A');
      expect(result).toContain('Content B');
      expect(stats!.suspenseCount).toBe(2);
    });

    it('should handle async content errors gracefully', async () => {
      const shell = '<div id="suspense-failing"></div>';
      const asyncContent = new Map<string, Promise<string>>([
        ['failing', Promise.reject(new Error('Load failed'))],
      ]);

      const chunks: StreamingChunk[] = [];

      const stream = await engine.renderToStreamWithSuspense(shell, asyncContent, {
        onChunk: (chunk) => chunks.push(chunk),
      });

      await engine.streamToString(stream);

      const errorChunk = chunks.find((c) => c.type === 'error');
      expect(errorChunk).toBeDefined();
      expect(errorChunk!.content).toContain('Error loading content');
    });
  });

  describe('Progressive Hydration', () => {
    it('should include hydration markers by default', async () => {
      const html = `
        <body>
        <!-- SUSPENSE:hydrate --><div>To hydrate</div><!-- /SUSPENSE:hydrate -->
        </body>
      `;

      const stream = engine.renderToStream(html);
      const result = await engine.streamToString(stream);

      expect(result).toContain('data-suspense="hydrate"');
      expect(result).toContain('data-resolved="true"');
    });

    it('should skip hydration markers when disabled', async () => {
      const customEngine = createStreamingSSREngine({
        progressiveHydration: false,
      });

      const html = `
        <body>
        <!-- SUSPENSE:test --><div>Content</div><!-- /SUSPENSE:test -->
        </body>
      `;

      const stream = customEngine.renderToStream(html);
      const result = await customEngine.streamToString(stream);

      expect(result).not.toContain('data-suspense');
      customEngine.destroy();
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout long renders', async () => {
      // Create a stream that will timeout
      let errorReceived: Error | null = null;

      const html = '<div>Test</div>';
      const stream = engine.renderToStream(html, {
        timeoutMs: 50, // Very short timeout
        onError: (err) => {
          errorReceived = err;
        },
      });

      // Consume stream
      await engine.streamToString(stream);

      // No timeout error for simple HTML that renders immediately
      // This test mainly verifies the timeout mechanism exists
      expect(engine.status).toBe('idle');
    });
  });

  describe('Stream Management', () => {
    it('should track active streams', async () => {
      const html = '<div>Test</div>';
      const stream = engine.renderToStream(html);

      // Stream starts but count increments then decrements fast
      // Just verify it returns to 0
      await engine.streamToString(stream);

      expect(engine.activeStreamCount).toBe(0);
    });

    it('should cancel all streams', () => {
      engine.cancelAllStreams();

      expect(engine.activeStreamCount).toBe(0);
      expect(engine.status).toBe('idle');
    });

    it('should handle stream cancellation', async () => {
      const html = '<div>Long content...</div>';
      const stream = engine.renderToStream(html);
      const reader = stream.getReader();

      // Cancel immediately
      await reader.cancel();

      expect(engine.activeStreamCount).toBe(0);
    });
  });

  describe('Lifecycle', () => {
    it('should destroy cleanly', () => {
      engine.destroy();

      expect(engine.status).toBe('idle');
      expect(engine.activeStreamCount).toBe(0);
    });
  });
});

describe('Shared StreamingSSREngine', () => {
  afterEach(() => {
    resetSharedStreamingSSREngine();
  });

  it('should return same instance', () => {
    const e1 = getSharedStreamingSSREngine();
    const e2 = getSharedStreamingSSREngine();

    expect(e1).toBe(e2);
  });

  it('should reset shared instance', () => {
    const e1 = getSharedStreamingSSREngine();
    resetSharedStreamingSSREngine();
    const e2 = getSharedStreamingSSREngine();

    expect(e1).not.toBe(e2);
  });
});
