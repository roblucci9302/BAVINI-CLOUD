/**
 * LLM Response Cache
 *
 * Caches LLM responses for identical requests to:
 * - Reduce API costs
 * - Improve response latency
 * - Handle rate limiting gracefully
 *
 * Cache key is computed from: model + systemPrompt + messages + tools
 *
 * @module agents/cache/llm-cache
 */

import { createScopedLogger } from '~/utils/logger';
import type Anthropic from '@anthropic-ai/sdk';

const logger = createScopedLogger('LLMCache');

/**
 * Cache entry structure
 */
interface CacheEntry {
  response: Anthropic.Message;
  timestamp: number;
  hits: number;
}

/**
 * Cache statistics
 */
export interface LLMCacheStats {
  hits: number;
  misses: number;
  size: number;
  maxSize: number;
  hitRate: number;
  savedTokens: number;
  savedCost: number; // Estimated in USD
}

/**
 * Cache configuration
 */
export interface LLMCacheConfig {
  /** Maximum number of cached entries */
  maxSize?: number;

  /** Time to live in milliseconds (default: 5 minutes) */
  ttl?: number;

  /** Enable/disable cache (default: true) */
  enabled?: boolean;
}

/**
 * LLM Response Cache implementation
 */
class LLMResponseCache {
  private cache: Map<string, CacheEntry> = new Map();
  private maxSize: number;
  private ttl: number;
  private enabled: boolean;

  private stats = {
    hits: 0,
    misses: 0,
    savedInputTokens: 0,
    savedOutputTokens: 0,
  };

  constructor(config: LLMCacheConfig = {}) {
    this.maxSize = config.maxSize ?? 100;
    this.ttl = config.ttl ?? 5 * 60 * 1000; // 5 minutes default
    this.enabled = config.enabled ?? true;
  }

  /**
   * Generate a cache key from request parameters
   */
  private generateKey(
    model: string,
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    tools?: Anthropic.Tool[],
  ): string {
    const keyData = {
      model,
      systemPrompt,
      messages: messages.map((m) => ({
        role: m.role,
        content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
      })),
      tools: tools?.map((t) => t.name).sort(),
    };

    // Simple hash function for cache key
    const str = JSON.stringify(keyData);
    let hash = 0;

    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }

    return `llm_${model}_${Math.abs(hash).toString(36)}`;
  }

  /**
   * Get cached response if available
   */
  get(
    model: string,
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    tools?: Anthropic.Tool[],
  ): Anthropic.Message | null {
    if (!this.enabled) {
      return null;
    }

    const key = this.generateKey(model, systemPrompt, messages, tools);
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Check TTL
    if (Date.now() - entry.timestamp > this.ttl) {
      this.cache.delete(key);
      this.stats.misses++;
      logger.debug(`Cache expired for key: ${key}`);
      return null;
    }

    // Update hit count
    entry.hits++;
    this.stats.hits++;

    // Track saved tokens
    if (entry.response.usage) {
      this.stats.savedInputTokens += entry.response.usage.input_tokens;
      this.stats.savedOutputTokens += entry.response.usage.output_tokens;
    }

    logger.debug(`Cache hit for key: ${key} (hits: ${entry.hits})`);
    return entry.response;
  }

  /**
   * Noms d'outils dont les réponses peuvent être cachées (décisions déterministes)
   */
  private static readonly CACHEABLE_TOOLS = new Set(['delegate_to_agent', 'create_subtasks']);

  /**
   * Vérifie si une réponse tool_use peut être cachée
   * Seules les réponses avec des outils de routing déterministes sont cacheables
   */
  private isCacheableToolUse(response: Anthropic.Message): boolean {
    let foundCacheableToolUse = false;

    // Chercher les tool_use dans la réponse
    for (const block of response.content) {
      if (block.type === 'tool_use') {
        // Si l'outil n'est pas dans la liste des outils cacheables, ne pas cacher
        if (!LLMResponseCache.CACHEABLE_TOOLS.has(block.name)) {
          return false;
        }
        foundCacheableToolUse = true;
      }
    }

    // Ne cacher que si on a trouvé au moins un outil cacheable
    return foundCacheableToolUse;
  }

  /**
   * Store a response in cache
   */
  set(
    model: string,
    systemPrompt: string,
    messages: Anthropic.MessageParam[],
    tools: Anthropic.Tool[] | undefined,
    response: Anthropic.Message,
  ): void {
    if (!this.enabled) {
      return;
    }

    // Don't cache responses with tool use (except for deterministic routing tools)
    if (response.stop_reason === 'tool_use' && !this.isCacheableToolUse(response)) {
      logger.debug('Skipping cache for non-cacheable tool_use response');
      return;
    }

    const key = this.generateKey(model, systemPrompt, messages, tools);

    // Evict oldest entries if at capacity
    if (this.cache.size >= this.maxSize) {
      this.evictOldest();
    }

    this.cache.set(key, {
      response,
      timestamp: Date.now(),
      hits: 0,
    });

    logger.debug(`Cached response for key: ${key}`);
  }

  /**
   * Evict the oldest entry
   */
  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.cache) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.cache.delete(oldestKey);
      logger.debug(`Evicted oldest entry: ${oldestKey}`);
    }
  }

  /**
   * Get cache statistics
   */
  getStats(): LLMCacheStats {
    const total = this.stats.hits + this.stats.misses;
    const hitRate = total > 0 ? (this.stats.hits / total) * 100 : 0;

    // Estimate cost savings (approximate pricing)
    // Sonnet: $3/1M input, $15/1M output
    // Opus: $15/1M input, $75/1M output
    const avgInputCost = 0.000009; // ~$9/1M tokens average
    const avgOutputCost = 0.000045; // ~$45/1M tokens average
    const savedCost = this.stats.savedInputTokens * avgInputCost + this.stats.savedOutputTokens * avgOutputCost;

    return {
      hits: this.stats.hits,
      misses: this.stats.misses,
      size: this.cache.size,
      maxSize: this.maxSize,
      hitRate,
      savedTokens: this.stats.savedInputTokens + this.stats.savedOutputTokens,
      savedCost,
    };
  }

  /**
   * Clear the cache
   */
  clear(): void {
    this.cache.clear();
    logger.debug('Cache cleared');
  }

  /**
   * Reset statistics
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      savedInputTokens: 0,
      savedOutputTokens: 0,
    };
  }

  /**
   * Enable or disable the cache
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    logger.info(`LLM cache ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Check if cache is enabled
   */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * Cleanup expired entries
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache) {
      if (now - entry.timestamp > this.ttl) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired entries`);
    }

    return cleaned;
  }
}

/**
 * Global LLM cache instance
 */
export const llmCache = new LLMResponseCache();

/**
 * Get cached LLM response
 */
export function getCachedResponse(
  model: string,
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools?: Anthropic.Tool[],
): Anthropic.Message | null {
  return llmCache.get(model, systemPrompt, messages, tools);
}

/**
 * Cache an LLM response
 */
export function cacheResponse(
  model: string,
  systemPrompt: string,
  messages: Anthropic.MessageParam[],
  tools: Anthropic.Tool[] | undefined,
  response: Anthropic.Message,
): void {
  llmCache.set(model, systemPrompt, messages, tools, response);
}

/**
 * Get cache statistics
 */
export function getLLMCacheStats(): LLMCacheStats {
  return llmCache.getStats();
}

/**
 * Clear the LLM cache
 */
export function clearLLMCache(): void {
  llmCache.clear();
}
