/**
 * Context Compressor
 *
 * Compresses long conversation contexts to:
 * - Stay within token limits
 * - Preserve important information
 * - Prioritize recent messages
 *
 * Uses tiktoken for accurate token counting.
 *
 * @module agents/utils/context-compressor
 */

import { createScopedLogger } from '~/utils/logger';
import { countTokensSync } from '~/lib/.server/llm/token-estimator';
import type { AgentMessage } from '../types';

const logger = createScopedLogger('ContextCompressor');

/**
 * Compression statistics
 */
export interface CompressionStats {
  originalMessages: number;
  compressedMessages: number;
  originalTokens: number;
  compressedTokens: number;
  compressionRatio: number;
}

/**
 * Compression configuration
 */
export interface CompressionConfig {
  /** Maximum total tokens (default: 100000) */
  maxTokens?: number;

  /** Maximum tokens per message (default: 4000) */
  maxTokensPerMessage?: number;

  /** Number of recent messages to preserve fully (default: 5) */
  preserveRecentCount?: number;

  /** Enable summarization of old messages (default: true) */
  summarizeOld?: boolean;

  /** Truncation indicator */
  truncationMarker?: string;
}

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<CompressionConfig> = {
  maxTokens: 150000, // Increased from 100K to 150K for larger project contexts
  maxTokensPerMessage: 4000,
  preserveRecentCount: 5,
  summarizeOld: true,
  truncationMarker: '\n\n[... contenu tronqué ...]',
};

/**
 * Estimate token count from text using tiktoken
 * Uses cl100k_base encoding which is close to Claude's tokenization
 */
export function estimateTokens(text: string): number {
  return countTokensSync(text);
}

/**
 * Get content string from message
 */
function getMessageContent(message: AgentMessage): string {
  // AgentMessage.content is always a string
  return message.content;
}

/**
 * Truncate a single message to fit within token limit
 */
export function truncateMessage(
  message: AgentMessage,
  maxTokens: number,
  marker: string = DEFAULT_CONFIG.truncationMarker,
): AgentMessage {
  const content = getMessageContent(message);
  const currentTokens = estimateTokens(content);

  if (currentTokens <= maxTokens) {
    return message;
  }

  // Calculate how much to keep
  const markerTokens = estimateTokens(marker);
  const targetTokens = maxTokens - markerTokens;
  const keepRatio = targetTokens / currentTokens;
  const keepChars = Math.floor(content.length * keepRatio);

  // Keep the beginning (most important context)
  const truncatedContent = content.substring(0, keepChars) + marker;

  logger.debug(`Truncated message from ${currentTokens} to ~${maxTokens} tokens`);

  return {
    ...message,
    content: truncatedContent,
  };
}

/**
 * Compress a list of messages to fit within token budget
 */
export function compressContext(
  messages: AgentMessage[],
  config: CompressionConfig = {},
): { messages: AgentMessage[]; stats: CompressionStats } {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Calculate original stats
  const originalTokens = messages.reduce((sum, msg) => sum + estimateTokens(getMessageContent(msg)), 0);

  // If already within limits, return as-is
  if (originalTokens <= cfg.maxTokens) {
    return {
      messages,
      stats: {
        originalMessages: messages.length,
        compressedMessages: messages.length,
        originalTokens,
        compressedTokens: originalTokens,
        compressionRatio: 1,
      },
    };
  }

  logger.debug(`Compressing context: ${originalTokens} tokens exceeds ${cfg.maxTokens} limit`);

  const result: AgentMessage[] = [];
  let remainingBudget = cfg.maxTokens;

  // Phase 1: Preserve recent messages (fully or truncated)
  const recentMessages = messages.slice(-cfg.preserveRecentCount);
  const olderMessages = messages.slice(0, -cfg.preserveRecentCount);

  // Process recent messages first (they get priority)
  for (const msg of recentMessages) {
    const tokens = estimateTokens(getMessageContent(msg));

    if (tokens <= cfg.maxTokensPerMessage && tokens <= remainingBudget) {
      result.push(msg);
      remainingBudget -= tokens;
    } else {
      // Truncate to fit
      const truncated = truncateMessage(msg, Math.min(cfg.maxTokensPerMessage, remainingBudget), cfg.truncationMarker);
      result.push(truncated);
      remainingBudget -= estimateTokens(getMessageContent(truncated));
    }
  }

  // Phase 2: Add older messages if budget remains
  if (remainingBudget > 0 && olderMessages.length > 0) {
    // Process from newest to oldest within the older set
    const reversedOlder = [...olderMessages].reverse();

    for (const msg of reversedOlder) {
      if (remainingBudget <= 0) {
        break;
      }

      const tokens = estimateTokens(getMessageContent(msg));

      if (tokens <= remainingBudget) {
        result.unshift(msg);
        remainingBudget -= tokens;
      } else if (remainingBudget > 100) {
        // Truncate if we have enough budget for a meaningful snippet
        const truncated = truncateMessage(msg, remainingBudget, cfg.truncationMarker);
        result.unshift(truncated);
        remainingBudget -= estimateTokens(getMessageContent(truncated));
      }
    }
  }

  // Phase 3: Add summary placeholder if we dropped messages
  const droppedCount = messages.length - result.length;

  if (droppedCount > 0 && cfg.summarizeOld) {
    const summaryMessage: AgentMessage = {
      role: 'user',
      content: `[Note: ${droppedCount} messages précédents ont été omis pour respecter la limite de contexte]`,
    };
    result.unshift(summaryMessage);
  }

  const compressedTokens = result.reduce((sum, msg) => sum + estimateTokens(getMessageContent(msg)), 0);

  logger.debug(`Compression complete: ${originalTokens} → ${compressedTokens} tokens (${result.length} messages)`);

  return {
    messages: result,
    stats: {
      originalMessages: messages.length,
      compressedMessages: result.length,
      originalTokens,
      compressedTokens,
      compressionRatio: compressedTokens / originalTokens,
    },
  };
}

/**
 * Check if context needs compression
 */
export function needsCompression(messages: AgentMessage[], maxTokens: number = DEFAULT_CONFIG.maxTokens): boolean {
  const totalTokens = messages.reduce((sum, msg) => sum + estimateTokens(getMessageContent(msg)), 0);
  return totalTokens > maxTokens;
}

/**
 * Get total token count for messages
 */
export function countContextTokens(messages: AgentMessage[]): number {
  return messages.reduce((sum, msg) => sum + estimateTokens(getMessageContent(msg)), 0);
}
