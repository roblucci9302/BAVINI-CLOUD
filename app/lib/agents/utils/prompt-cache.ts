/**
 * Prompt and Tool Definition Cache
 *
 * Provides caching for:
 * - System prompts (static per agent type)
 * - Anthropic tool conversions (avoid repeated transformations)
 *
 * @module agents/utils/prompt-cache
 */

import type Anthropic from '@anthropic-ai/sdk';
import type { ToolDefinition } from '../types';

/**
 * Cache for system prompts indexed by agent name
 * Since system prompts are static per agent type, we cache them
 */
const systemPromptCache = new Map<string, string>();

/**
 * Cache for converted Anthropic tools
 * Key: hash of tool definitions, Value: converted tools
 */
const toolConversionCache = new Map<string, Anthropic.Tool[]>();

/**
 * Stats for monitoring cache effectiveness
 */
interface CacheStats {
  promptHits: number;
  promptMisses: number;
  toolHits: number;
  toolMisses: number;
}

const stats: CacheStats = {
  promptHits: 0,
  promptMisses: 0,
  toolHits: 0,
  toolMisses: 0,
};

/**
 * Generate a hash key for tool definitions
 * Uses tool names as key since definitions rarely change at runtime
 */
function generateToolsKey(tools: ToolDefinition[]): string {
  return tools
    .map((t) => t.name)
    .sort()
    .join('|');
}

/**
 * Get cached system prompt or compute and cache it
 *
 * @param agentName - Unique agent identifier
 * @param computeFn - Function to compute the prompt if not cached
 * @returns The system prompt string
 */
export function getCachedSystemPrompt(agentName: string, computeFn: () => string): string {
  const cached = systemPromptCache.get(agentName);

  if (cached !== undefined) {
    stats.promptHits++;
    return cached;
  }

  stats.promptMisses++;
  const prompt = computeFn();
  systemPromptCache.set(agentName, prompt);

  return prompt;
}

/**
 * Invalidate cached prompt for an agent
 * Useful when agent configuration changes
 *
 * @param agentName - Agent to invalidate, or undefined to clear all
 */
export function invalidatePromptCache(agentName?: string): void {
  if (agentName) {
    systemPromptCache.delete(agentName);
  } else {
    systemPromptCache.clear();
  }
}

/**
 * Get cached tool conversion or compute and cache it
 *
 * @param tools - Tool definitions to convert
 * @param convertFn - Function to convert tools to Anthropic format
 * @returns Converted Anthropic tools
 */
export function getCachedToolConversion(
  tools: ToolDefinition[],
  convertFn: (tools: ToolDefinition[]) => Anthropic.Tool[],
): Anthropic.Tool[] {
  if (tools.length === 0) {
    return [];
  }

  const key = generateToolsKey(tools);
  const cached = toolConversionCache.get(key);

  if (cached !== undefined) {
    stats.toolHits++;
    return cached;
  }

  stats.toolMisses++;
  const converted = convertFn(tools);
  toolConversionCache.set(key, converted);

  return converted;
}

/**
 * Invalidate tool conversion cache
 *
 * @param tools - Specific tools to invalidate, or undefined to clear all
 */
export function invalidateToolCache(tools?: ToolDefinition[]): void {
  if (tools) {
    const key = generateToolsKey(tools);
    toolConversionCache.delete(key);
  } else {
    toolConversionCache.clear();
  }
}

/**
 * Get cache statistics for monitoring
 *
 * @returns Cache hit/miss statistics
 */
export function getCacheStats(): CacheStats & { promptCacheSize: number; toolCacheSize: number } {
  return {
    ...stats,
    promptCacheSize: systemPromptCache.size,
    toolCacheSize: toolConversionCache.size,
  };
}

/**
 * Reset all caches and statistics
 * Useful for testing or memory management
 */
export function resetCaches(): void {
  systemPromptCache.clear();
  toolConversionCache.clear();
  stats.promptHits = 0;
  stats.promptMisses = 0;
  stats.toolHits = 0;
  stats.toolMisses = 0;
}

/**
 * Get cache hit rate for prompts
 * @returns Hit rate as percentage (0-100)
 */
export function getPromptCacheHitRate(): number {
  const total = stats.promptHits + stats.promptMisses;

  if (total === 0) {
    return 0;
  }

  return (stats.promptHits / total) * 100;
}

/**
 * Get cache hit rate for tool conversions
 * @returns Hit rate as percentage (0-100)
 */
export function getToolCacheHitRate(): number {
  const total = stats.toolHits + stats.toolMisses;

  if (total === 0) {
    return 0;
  }

  return (stats.toolHits / total) * 100;
}
