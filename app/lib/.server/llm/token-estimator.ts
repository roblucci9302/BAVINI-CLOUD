/**
 * Token Estimator - Accurate token counting using tiktoken
 *
 * This module provides token counting capabilities for Claude models:
 * - Fast local estimation using tiktoken (cl100k_base encoding)
 * - Accurate API-based counting using Anthropic's countTokens API
 * - Caching to avoid redundant calculations
 *
 * @module llm/token-estimator
 */

import { getEncoding, type Tiktoken } from 'js-tiktoken';
import type Anthropic from '@anthropic-ai/sdk';
import type { Message } from '~/types/message';
import { createScopedLogger } from '~/utils/logger';
import { TTLMap } from '~/lib/utils/ttl-map';

const logger = createScopedLogger('TokenEstimator');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Token count result
 */
export interface TokenCount {
  /** Number of tokens */
  count: number;

  /** Estimation method used */
  method: 'tiktoken' | 'anthropic-api' | 'heuristic';

  /** Whether this is cached */
  cached: boolean;
}

/**
 * Message token breakdown
 */
export interface MessageTokenBreakdown {
  /** Content tokens */
  content: number;

  /** Tool invocation tokens */
  toolInvocations: number;

  /** Attachment metadata tokens */
  attachments: number;

  /** Overhead tokens (role, structure) */
  overhead: number;

  /** Total tokens */
  total: number;
}

/**
 * Token estimator options
 */
export interface TokenEstimatorOptions {
  /** Enable caching (default: true) */
  enableCache?: boolean;

  /** Cache TTL in milliseconds (default: 10 minutes) */
  cacheTTLMs?: number;

  /** Max cache size (default: 10000) */
  maxCacheSize?: number;
}

/*
 * ============================================================================
 * CONSTANTS
 * ============================================================================
 */

/**
 * Token overhead for message structure
 * Each message has overhead for role markers, etc.
 */
const MESSAGE_OVERHEAD_TOKENS = 4;

/**
 * Token overhead per tool invocation
 */
const TOOL_INVOCATION_OVERHEAD = 10;

/**
 * Tokens per image attachment (approximation)
 * Images are converted to tokens based on their size
 */
const TOKENS_PER_IMAGE = 85; // ~85 tokens for a small image

/*
 * ============================================================================
 * TOKEN ESTIMATOR CLASS
 * ============================================================================
 */

/**
 * Token estimator using tiktoken for fast, accurate estimation
 */
export class TokenEstimator {
  private encoding: Tiktoken | null = null;
  private cache: TTLMap<string, number>;
  private initPromise: Promise<void> | null = null;
  private initError: Error | null = null;
  private options: Required<TokenEstimatorOptions>;

  constructor(options: TokenEstimatorOptions = {}) {
    this.options = {
      enableCache: options.enableCache ?? true,
      cacheTTLMs: options.cacheTTLMs ?? 10 * 60 * 1000, // 10 minutes
      maxCacheSize: options.maxCacheSize ?? 10000,
    };

    this.cache = new TTLMap<string, number>({
      ttlMs: this.options.cacheTTLMs,
      maxSize: this.options.maxCacheSize,
      cleanupIntervalMs: 60 * 1000,
      name: 'TokenEstimator.cache',
    });
  }

  /**
   * Initialize the tiktoken encoder
   * Uses cl100k_base which is close to Claude's tokenization
   */
  async initialize(): Promise<void> {
    if (this.encoding) {
      return;
    }

    if (this.initError) {
      throw this.initError;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = (async () => {
      try {
        // cl100k_base is used by GPT-4 and is reasonably close to Claude's tokenization
        this.encoding = getEncoding('cl100k_base');
        logger.debug('TokenEstimator initialized with cl100k_base encoding');
      } catch (error) {
        this.initError = error instanceof Error ? error : new Error(String(error));
        logger.error('Failed to initialize tiktoken', { error: this.initError.message });
        throw this.initError;
      }
    })();

    return this.initPromise;
  }

  /**
   * Count tokens in a text string using tiktoken
   */
  async countTokens(text: string): Promise<TokenCount> {
    if (!text) {
      return { count: 0, method: 'tiktoken', cached: false };
    }

    // Check cache first
    if (this.options.enableCache) {
      const cacheKey = this.getCacheKey(text);
      const cached = this.cache.get(cacheKey);

      if (cached !== undefined) {
        return { count: cached, method: 'tiktoken', cached: true };
      }
    }

    // Initialize if needed
    await this.initialize();

    if (!this.encoding) {
      // Fallback to heuristic if encoding failed to load
      return this.countTokensHeuristic(text);
    }

    try {
      const tokens = this.encoding.encode(text);
      const count = tokens.length;

      // Cache the result
      if (this.options.enableCache) {
        const cacheKey = this.getCacheKey(text);
        this.cache.set(cacheKey, count);
      }

      return { count, method: 'tiktoken', cached: false };
    } catch (error) {
      logger.warn('Tiktoken encoding failed, using heuristic', { error });
      return this.countTokensHeuristic(text);
    }
  }

  /**
   * Synchronous token count (uses cached result or heuristic)
   * Use this when you can't await and approximate is OK
   */
  countTokensSync(text: string): number {
    if (!text) {
      return 0;
    }

    // Check cache
    if (this.options.enableCache) {
      const cacheKey = this.getCacheKey(text);
      const cached = this.cache.get(cacheKey);

      if (cached !== undefined) {
        return cached;
      }
    }

    // Use encoding if available
    if (this.encoding) {
      try {
        const tokens = this.encoding.encode(text);
        const count = tokens.length;

        if (this.options.enableCache) {
          const cacheKey = this.getCacheKey(text);
          this.cache.set(cacheKey, count);
        }

        return count;
      } catch {
        // Fall through to heuristic
      }
    }

    // Fallback to heuristic
    return this.estimateTokensHeuristic(text);
  }

  /**
   * Count tokens for a message, including tool invocations and attachments
   */
  async countMessageTokens(message: Message): Promise<MessageTokenBreakdown> {
    const breakdown: MessageTokenBreakdown = {
      content: 0,
      toolInvocations: 0,
      attachments: 0,
      overhead: MESSAGE_OVERHEAD_TOKENS,
      total: 0,
    };

    // Count content tokens
    const contentResult = await this.countTokens(message.content);
    breakdown.content = contentResult.count;

    // Count tool invocations
    if (message.toolInvocations && message.toolInvocations.length > 0) {
      for (const invocation of message.toolInvocations) {
        const argsResult = await this.countTokens(JSON.stringify(invocation.args || {}));
        const resultResult = await this.countTokens(JSON.stringify(invocation.result || {}));
        breakdown.toolInvocations += argsResult.count + resultResult.count + TOOL_INVOCATION_OVERHEAD;
      }
    }

    // Count attachments (images, files)
    if (message.experimental_attachments && message.experimental_attachments.length > 0) {
      // Each image attachment costs approximately 85-1000+ tokens depending on size
      // Using a conservative estimate
      breakdown.attachments = message.experimental_attachments.length * TOKENS_PER_IMAGE;
    }

    breakdown.total = breakdown.content + breakdown.toolInvocations + breakdown.attachments + breakdown.overhead;

    return breakdown;
  }

  /**
   * Count tokens for an array of messages
   */
  async countMessagesTokens(messages: Message[]): Promise<{
    total: number;
    breakdown: MessageTokenBreakdown[];
  }> {
    const breakdown: MessageTokenBreakdown[] = [];
    let total = 0;

    for (const message of messages) {
      const msgBreakdown = await this.countMessageTokens(message);
      breakdown.push(msgBreakdown);
      total += msgBreakdown.total;
    }

    return { total, breakdown };
  }

  /**
   * Count tokens using Anthropic's official API (most accurate)
   * Use this sparingly as it makes API calls
   */
  async countTokensWithAPI(
    client: Anthropic,
    messages: Array<{ role: 'user' | 'assistant'; content: string }>,
    model: string = 'claude-sonnet-4-20250514',
  ): Promise<TokenCount> {
    try {
      const result = await client.messages.countTokens({
        model,
        messages,
      });

      return {
        count: result.input_tokens,
        method: 'anthropic-api',
        cached: false,
      };
    } catch (error) {
      logger.warn('API token count failed, falling back to tiktoken', { error });

      // Fall back to local counting
      let total = 0;

      for (const msg of messages) {
        const result = await this.countTokens(msg.content);
        total += result.count + MESSAGE_OVERHEAD_TOKENS;
      }

      return { count: total, method: 'tiktoken', cached: false };
    }
  }

  /**
   * Get cache statistics
   */
  getCacheStats() {
    return this.cache.getStats();
  }

  /**
   * Clear the token cache
   */
  clearCache(): void {
    this.cache.clear();
    logger.debug('Token cache cleared');
  }

  /**
   * Dispose resources
   */
  dispose(): void {
    this.cache.dispose();
    this.encoding = null;
    this.initPromise = null;
    logger.debug('TokenEstimator disposed');
  }

  /**
   * Heuristic token count (fallback)
   */
  private countTokensHeuristic(text: string): TokenCount {
    return {
      count: this.estimateTokensHeuristic(text),
      method: 'heuristic',
      cached: false,
    };
  }

  /**
   * Estimate tokens using heuristics
   */
  private estimateTokensHeuristic(text: string): number {
    if (!text) {
      return 0;
    }

    const words = text.split(/\s+/).length;
    const chars = text.length;

    // Code tends to have more tokens per character
    const hasCode = text.includes('```') || text.includes('function') || text.includes('const ');

    if (hasCode) {
      return Math.ceil(chars / 3.5);
    }

    // Regular text: ~0.75 tokens per word, or ~4 chars per token
    return Math.max(Math.ceil(words * 0.75), Math.ceil(chars / 4));
  }

  /**
   * Generate cache key for text
   * Uses hash for long texts to avoid memory issues
   */
  private getCacheKey(text: string): string {
    if (text.length <= 100) {
      return `t:${text}`;
    }

    // Simple hash for longer texts
    let hash = 0;

    for (let i = 0; i < text.length; i++) {
      const char = text.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    return `h:${hash}:${text.length}`;
  }
}

/*
 * ============================================================================
 * SINGLETON INSTANCE
 * ============================================================================
 */

let defaultEstimator: TokenEstimator | null = null;

/**
 * Get the default token estimator instance
 */
export function getTokenEstimator(): TokenEstimator {
  if (!defaultEstimator) {
    defaultEstimator = new TokenEstimator();
  }

  return defaultEstimator;
}

/**
 * Reset the default estimator (for testing)
 */
export function resetTokenEstimator(): void {
  if (defaultEstimator) {
    defaultEstimator.dispose();
    defaultEstimator = null;
  }
}

/*
 * ============================================================================
 * CONVENIENCE FUNCTIONS
 * ============================================================================
 */

/**
 * Count tokens in text (async, uses tiktoken)
 */
export async function countTokens(text: string): Promise<number> {
  const estimator = getTokenEstimator();
  const result = await estimator.countTokens(text);
  return result.count;
}

/**
 * Count tokens in text (sync, uses cached or heuristic)
 */
export function countTokensSync(text: string): number {
  const estimator = getTokenEstimator();
  return estimator.countTokensSync(text);
}

/**
 * Count tokens for a message
 */
export async function countMessageTokens(message: Message): Promise<number> {
  const estimator = getTokenEstimator();
  const breakdown = await estimator.countMessageTokens(message);
  return breakdown.total;
}

/**
 * Count tokens for an array of messages
 */
export async function countMessagesTokens(messages: Message[]): Promise<number> {
  const estimator = getTokenEstimator();
  const result = await estimator.countMessagesTokens(messages);
  return result.total;
}

/**
 * Legacy compatibility: estimate tokens (sync, uses heuristic or cached tiktoken)
 * This maintains backward compatibility with the old estimateTokens function
 */
export function estimateTokens(text: string): number {
  return countTokensSync(text);
}
