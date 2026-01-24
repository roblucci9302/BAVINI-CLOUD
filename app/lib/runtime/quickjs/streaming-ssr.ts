/**
 * =============================================================================
 * BAVINI Runtime Engine - Streaming SSR
 * =============================================================================
 * Provides streaming SSR capabilities using ReadableStream API.
 * Allows progressive rendering of components as they become available.
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';
import type { RuntimeStatus } from './types';

const logger = createScopedLogger('StreamingSSR');

/**
 * Streaming chunk types
 */
export type StreamingChunkType = 'head' | 'shell' | 'content' | 'suspense' | 'error' | 'end';

/**
 * A single chunk in the SSR stream
 */
export interface StreamingChunk {
  type: StreamingChunkType;
  content: string;
  id?: string;
  timestamp: number;
}

/**
 * Streaming SSR options
 */
export interface StreamingSSROptions {
  /** Callback for each chunk emitted */
  onChunk?: (chunk: StreamingChunk) => void;
  /** Callback when streaming completes */
  onComplete?: (stats: StreamingStats) => void;
  /** Callback on error */
  onError?: (error: Error) => void;
  /** Timeout for rendering (default: 10s) */
  timeoutMs?: number;
  /** Whether to include timing comments in HTML */
  includeTimingComments?: boolean;
}

/**
 * Statistics for the streaming render
 */
export interface StreamingStats {
  totalChunks: number;
  totalBytes: number;
  renderTimeMs: number;
  firstChunkTimeMs: number;
  suspenseCount: number;
}

/**
 * Streaming SSR renderer configuration
 */
export interface StreamingSSRConfig {
  /** Buffer size for chunks (default: 1KB) */
  chunkBufferSize?: number;
  /** Flush interval for buffered content (default: 50ms) */
  flushIntervalMs?: number;
  /** Enable progressive hydration markers */
  progressiveHydration?: boolean;
}

const DEFAULT_CONFIG: Required<StreamingSSRConfig> = {
  chunkBufferSize: 1024,
  flushIntervalMs: 50,
  progressiveHydration: true,
};

/**
 * Streaming SSR Engine
 * Renders components progressively using ReadableStream
 */
export class StreamingSSREngine {
  private _config: Required<StreamingSSRConfig>;
  private _status: RuntimeStatus = 'idle';
  private _activeStreams = new Map<string, ReadableStreamDefaultController<StreamingChunk>>();

  constructor(config: StreamingSSRConfig = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    logger.debug('StreamingSSREngine created', this._config);
  }

  /**
   * Get the current status
   */
  get status(): RuntimeStatus {
    return this._status;
  }

  /**
   * Get count of active streams
   */
  get activeStreamCount(): number {
    return this._activeStreams.size;
  }

  /**
   * Render a component as a ReadableStream
   */
  renderToStream(
    html: string,
    options: StreamingSSROptions = {},
  ): ReadableStream<StreamingChunk> {
    const streamId = `stream-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const startTime = performance.now();
    let firstChunkTime = 0;
    let totalChunks = 0;
    let totalBytes = 0;
    let suspenseCount = 0;

    const { timeoutMs = 10000, includeTimingComments = false } = options;

    logger.debug(`Starting streaming render: ${streamId}`);

    return new ReadableStream<StreamingChunk>({
      start: (controller) => {
        this._activeStreams.set(streamId, controller);
        this._status = 'executing';

        // Set timeout
        const timeoutId = setTimeout(() => {
          logger.warn(`Stream ${streamId} timed out after ${timeoutMs}ms`);
          this.emitError(controller, new Error(`Streaming SSR timeout after ${timeoutMs}ms`), options);
          this.endStream(streamId, controller);
        }, timeoutMs);

        try {
          // Parse HTML and emit chunks
          const chunks = this.parseAndChunk(html, includeTimingComments);

          for (const chunk of chunks) {
            if (firstChunkTime === 0) {
              firstChunkTime = performance.now() - startTime;
            }

            totalChunks++;
            totalBytes += chunk.content.length;

            if (chunk.type === 'suspense') {
              suspenseCount++;
            }

            controller.enqueue(chunk);
            options.onChunk?.(chunk);
          }

          // Emit end chunk
          const endChunk: StreamingChunk = {
            type: 'end',
            content: '',
            timestamp: Date.now(),
          };
          controller.enqueue(endChunk);
          options.onChunk?.(endChunk);

          clearTimeout(timeoutId);

          // Calculate and emit stats
          const stats: StreamingStats = {
            totalChunks,
            totalBytes,
            renderTimeMs: performance.now() - startTime,
            firstChunkTimeMs: firstChunkTime,
            suspenseCount,
          };

          options.onComplete?.(stats);
          logger.info(`Stream ${streamId} complete:`, stats);

          this.endStream(streamId, controller);
        } catch (error) {
          clearTimeout(timeoutId);
          const err = error instanceof Error ? error : new Error(String(error));
          this.emitError(controller, err, options);
          this.endStream(streamId, controller);
        }
      },

      cancel: () => {
        logger.debug(`Stream ${streamId} cancelled`);
        this._activeStreams.delete(streamId);

        if (this._activeStreams.size === 0) {
          this._status = 'idle';
        }
      },
    });
  }

  /**
   * Render with async content (simulates suspense boundaries)
   */
  async renderToStreamWithSuspense(
    shellHtml: string,
    asyncContent: Map<string, Promise<string>>,
    options: StreamingSSROptions = {},
  ): Promise<ReadableStream<StreamingChunk>> {
    const streamId = `stream-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
    const startTime = performance.now();
    let firstChunkTime = 0;
    let totalChunks = 0;
    let totalBytes = 0;
    let suspenseCount = asyncContent.size;

    const { timeoutMs = 10000, includeTimingComments = false } = options;

    logger.debug(`Starting streaming render with suspense: ${streamId}, ${suspenseCount} boundaries`);

    return new ReadableStream<StreamingChunk>({
      start: async (controller) => {
        this._activeStreams.set(streamId, controller);
        this._status = 'executing';

        const timeoutId = setTimeout(() => {
          logger.warn(`Stream ${streamId} timed out after ${timeoutMs}ms`);
          this.emitError(controller, new Error(`Streaming SSR timeout after ${timeoutMs}ms`), options);
          this.endStream(streamId, controller);
        }, timeoutMs);

        try {
          // 1. Emit shell HTML first (synchronous parts)
          const shellChunks = this.parseAndChunk(shellHtml, includeTimingComments);

          for (const chunk of shellChunks) {
            if (firstChunkTime === 0) {
              firstChunkTime = performance.now() - startTime;
            }

            totalChunks++;
            totalBytes += chunk.content.length;
            controller.enqueue(chunk);
            options.onChunk?.(chunk);
          }

          // 2. Resolve async content and emit as suspense chunks
          const resolvePromises = Array.from(asyncContent.entries()).map(
            async ([id, promise]) => {
              try {
                const content = await promise;

                const suspenseChunk: StreamingChunk = {
                  type: 'suspense',
                  content: this.wrapSuspenseContent(id, content),
                  id,
                  timestamp: Date.now(),
                };

                totalChunks++;
                totalBytes += suspenseChunk.content.length;
                controller.enqueue(suspenseChunk);
                options.onChunk?.(suspenseChunk);
              } catch (error) {
                const errorContent = `<div data-suspense-error="${id}">Error loading content</div>`;
                const errorChunk: StreamingChunk = {
                  type: 'error',
                  content: errorContent,
                  id,
                  timestamp: Date.now(),
                };

                totalChunks++;
                totalBytes += errorChunk.content.length;
                controller.enqueue(errorChunk);
                options.onChunk?.(errorChunk);
              }
            },
          );

          await Promise.all(resolvePromises);

          // 3. Emit end chunk
          const endChunk: StreamingChunk = {
            type: 'end',
            content: '',
            timestamp: Date.now(),
          };
          controller.enqueue(endChunk);
          options.onChunk?.(endChunk);

          clearTimeout(timeoutId);

          // Calculate and emit stats
          const stats: StreamingStats = {
            totalChunks,
            totalBytes,
            renderTimeMs: performance.now() - startTime,
            firstChunkTimeMs: firstChunkTime,
            suspenseCount,
          };

          options.onComplete?.(stats);
          logger.info(`Stream ${streamId} complete:`, stats);

          this.endStream(streamId, controller);
        } catch (error) {
          clearTimeout(timeoutId);
          const err = error instanceof Error ? error : new Error(String(error));
          this.emitError(controller, err, options);
          this.endStream(streamId, controller);
        }
      },

      cancel: () => {
        logger.debug(`Stream ${streamId} cancelled`);
        this._activeStreams.delete(streamId);

        if (this._activeStreams.size === 0) {
          this._status = 'idle';
        }
      },
    });
  }

  /**
   * Convert stream to complete HTML string
   */
  async streamToString(stream: ReadableStream<StreamingChunk>): Promise<string> {
    const reader = stream.getReader();
    const chunks: string[] = [];

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done || value?.type === 'end') {
          break;
        }

        if (value) {
          chunks.push(value.content);
        }
      }
    } finally {
      reader.releaseLock();
    }

    return chunks.join('');
  }

  /**
   * Parse HTML and split into chunks
   */
  private parseAndChunk(html: string, includeTimingComments: boolean): StreamingChunk[] {
    const chunks: StreamingChunk[] = [];

    // Extract head content
    const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);

    if (headMatch) {
      const headContent = includeTimingComments
        ? `<!-- BAVINI SSR Head: ${Date.now()} -->${headMatch[0]}`
        : headMatch[0];

      chunks.push({
        type: 'head',
        content: headContent,
        timestamp: Date.now(),
      });
    }

    // Extract body/shell content
    const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);

    if (bodyMatch) {
      const bodyContent = bodyMatch[1];

      // Look for suspense boundaries (<!-- SUSPENSE:id --> markers)
      const suspensePattern = /<!--\s*SUSPENSE:(\w+)\s*-->([\s\S]*?)<!--\s*\/SUSPENSE:\1\s*-->/g;
      let lastIndex = 0;
      let match;

      while ((match = suspensePattern.exec(bodyContent)) !== null) {
        // Add content before suspense boundary
        if (match.index > lastIndex) {
          const shellContent = bodyContent.substring(lastIndex, match.index);

          if (shellContent.trim()) {
            chunks.push({
              type: 'shell',
              content: shellContent,
              timestamp: Date.now(),
            });
          }
        }

        // Add suspense content
        chunks.push({
          type: 'suspense',
          content: this.wrapSuspenseContent(match[1], match[2]),
          id: match[1],
          timestamp: Date.now(),
        });

        lastIndex = match.index + match[0].length;
      }

      // Add remaining content
      if (lastIndex < bodyContent.length) {
        const remainingContent = bodyContent.substring(lastIndex);

        if (remainingContent.trim()) {
          chunks.push({
            type: 'content',
            content: remainingContent,
            timestamp: Date.now(),
          });
        }
      }

      // If no suspense boundaries found, add whole body as content
      if (chunks.length === (headMatch ? 1 : 0)) {
        chunks.push({
          type: 'content',
          content: bodyContent,
          timestamp: Date.now(),
        });
      }
    } else if (!headMatch) {
      // No head or body, treat entire html as content
      chunks.push({
        type: 'content',
        content: html,
        timestamp: Date.now(),
      });
    }

    return chunks;
  }

  /**
   * Wrap suspense content with hydration markers
   */
  private wrapSuspenseContent(id: string, content: string): string {
    if (!this._config.progressiveHydration) {
      return content;
    }

    return `
<template data-suspense="${id}" data-resolved="true">
${content}
</template>
<script>
(function() {
  var t = document.querySelector('template[data-suspense="${id}"]');
  if (t) {
    var p = document.getElementById('suspense-${id}');
    if (p) {
      p.replaceWith(t.content.cloneNode(true));
      t.remove();
    }
  }
})();
</script>`;
  }

  /**
   * Emit an error chunk
   */
  private emitError(
    controller: ReadableStreamDefaultController<StreamingChunk>,
    error: Error,
    options: StreamingSSROptions,
  ): void {
    const errorChunk: StreamingChunk = {
      type: 'error',
      content: `<!-- SSR Error: ${error.message} -->`,
      timestamp: Date.now(),
    };

    try {
      controller.enqueue(errorChunk);
      options.onChunk?.(errorChunk);
      options.onError?.(error);
    } catch {
      // Controller may already be closed
      logger.warn('Failed to emit error chunk');
    }
  }

  /**
   * End a stream and clean up
   */
  private endStream(
    streamId: string,
    controller: ReadableStreamDefaultController<StreamingChunk>,
  ): void {
    try {
      controller.close();
    } catch {
      // Controller may already be closed
    }

    this._activeStreams.delete(streamId);

    if (this._activeStreams.size === 0) {
      this._status = 'idle';
    }
  }

  /**
   * Cancel all active streams
   */
  cancelAllStreams(): void {
    for (const [streamId, controller] of this._activeStreams.entries()) {
      logger.debug(`Cancelling stream: ${streamId}`);

      try {
        controller.close();
      } catch {
        // Ignore
      }
    }

    this._activeStreams.clear();
    this._status = 'idle';
    logger.info('All streams cancelled');
  }

  /**
   * Destroy the engine
   */
  destroy(): void {
    this.cancelAllStreams();
    logger.info('StreamingSSREngine destroyed');
  }
}

/**
 * Factory function
 */
export function createStreamingSSREngine(config?: StreamingSSRConfig): StreamingSSREngine {
  return new StreamingSSREngine(config);
}

/**
 * Singleton instance
 */
let _sharedEngine: StreamingSSREngine | null = null;

export function getSharedStreamingSSREngine(): StreamingSSREngine {
  if (!_sharedEngine) {
    _sharedEngine = createStreamingSSREngine();
  }

  return _sharedEngine;
}

export function resetSharedStreamingSSREngine(): void {
  if (_sharedEngine) {
    _sharedEngine.destroy();
    _sharedEngine = null;
  }
}
