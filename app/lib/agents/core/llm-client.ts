/**
 * @fileoverview Client LLM pour les agents BAVINI
 *
 * Ce module encapsule la communication avec l'API Anthropic, incluant:
 * - Appels au LLM avec conversion des messages
 * - Retry avec exponential backoff pour les rate limits
 * - Intégration avec le cache LLM et le pool de connexions
 * - Compression de contexte automatique
 *
 * @module agents/core/llm-client
 * @see {@link BaseAgent} pour l'utilisation dans les agents
 */

import Anthropic from '@anthropic-ai/sdk';
import { createScopedLogger } from '~/utils/logger';
import { getCachedSystemPrompt, getCachedToolConversion } from '../utils/prompt-cache';
import { getCachedResponse, cacheResponse } from '../cache/llm-cache';
import { compressContext, needsCompression } from '../utils/context-compressor';
import type { AgentMessage, ToolDefinition, ToolCall } from '../types';

/*
 * ============================================================================
 * CONSTANTS
 * ============================================================================
 */

/** Maximum number of retries for rate-limited requests */
const MAX_RATE_LIMIT_RETRIES = 5;

/** Base delay for exponential backoff (in ms) */
const BASE_BACKOFF_DELAY_MS = 1000;

/** Maximum backoff delay (in ms) */
const MAX_BACKOFF_DELAY_MS = 60000;

/*
 * ============================================================================
 * UTILITY FUNCTIONS
 * ============================================================================
 */

/**
 * Sleep for a given number of milliseconds
 */
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Calculate exponential backoff delay with jitter
 */
function calculateBackoffDelay(attempt: number): number {
  const exponentialDelay = BASE_BACKOFF_DELAY_MS * Math.pow(2, attempt);
  const jitter = Math.random() * 0.3 * exponentialDelay; // 0-30% jitter

  return Math.min(exponentialDelay + jitter, MAX_BACKOFF_DELAY_MS);
}

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Configuration du client LLM
 */
export interface LLMClientConfig {
  /** Nom de l'agent (utilisé pour le cache et les logs) */
  agentName: string;
  /** Modèle Claude à utiliser */
  model: string;
  /** Limite de tokens par réponse */
  maxTokens?: number;
  /** Température pour la génération */
  temperature?: number;
  /** Activer Extended Thinking (Opus/Sonnet 4.5+) */
  extendedThinking?: boolean;
  /** Budget de tokens pour Extended Thinking */
  thinkingBudget?: number;
}

/**
 * Options pour un appel LLM individuel
 */
export interface LLMCallOptions {
  /** Outils disponibles pour cet appel */
  tools?: ToolDefinition[];
  /** Limite de tokens pour la réponse */
  maxTokens?: number;
  /** Température de génération */
  temperature?: number;
}

/**
 * Résultat parsé d'une réponse LLM
 */
export interface ParsedLLMResponse {
  /** Texte de la réponse */
  text: string;
  /** Appels d'outils détectés */
  toolCalls: ToolCall[] | undefined;
  /** Tokens d'entrée utilisés */
  inputTokens: number;
  /** Tokens de sortie générés */
  outputTokens: number;
}

/**
 * Callback pour les événements de logging
 */
export type LLMLogCallback = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>,
) => void;

/*
 * ============================================================================
 * LLM CLIENT CLASS
 * ============================================================================
 */

/**
 * Client pour la communication avec l'API Anthropic
 *
 * Responsabilités:
 * - Appels au LLM avec retry automatique
 * - Conversion des messages au format Anthropic
 * - Gestion du cache et de la compression
 *
 * @class LLMClient
 *
 * @example
 * ```typescript
 * const client = new LLMClient({
 *   agentName: 'coder-agent',
 *   model: 'claude-sonnet-4-5-20250929',
 *   maxTokens: 16384,
 * });
 *
 * const response = await client.call(
 *   anthropicClient,
 *   messages,
 *   () => 'You are a coding assistant...',
 *   { tools: myTools }
 * );
 * ```
 */
export class LLMClient {
  private config: Required<LLMClientConfig>;
  private logger: ReturnType<typeof createScopedLogger>;
  private logCallback: LLMLogCallback | null = null;

  constructor(config: LLMClientConfig) {
    this.config = {
      maxTokens: 16384,
      temperature: 0.2,
      extendedThinking: false,
      thinkingBudget: 16000,
      ...config,
    };
    this.logger = createScopedLogger(`LLMClient:${config.agentName}`);
  }

  /**
   * Définir un callback de logging personnalisé
   */
  setLogCallback(callback: LLMLogCallback): void {
    this.logCallback = callback;
  }

  /**
   * Appelle le LLM Claude avec les messages fournis
   *
   * @param client - Client Anthropic initialisé
   * @param messages - Historique de la conversation
   * @param getSystemPrompt - Fonction retournant le system prompt
   * @param options - Options supplémentaires
   * @returns Réponse parsée avec texte, tool calls et métriques
   */
  async call(
    client: Anthropic,
    messages: AgentMessage[],
    getSystemPrompt: () => string,
    options?: LLMCallOptions,
  ): Promise<ParsedLLMResponse> {
    const startTime = Date.now();

    // Compresser le contexte si nécessaire
    let messagesToProcess = messages;

    if (needsCompression(messages)) {
      const { messages: compressed, stats } = compressContext(messages);
      messagesToProcess = compressed;
      this.log('debug', 'Context compressed', {
        originalMessages: stats.originalMessages,
        compressedMessages: stats.compressedMessages,
        compressionRatio: stats.compressionRatio.toFixed(2),
      });
    }

    // Convertir les messages au format Anthropic
    const anthropicMessages = this.convertToAnthropicMessages(messagesToProcess);

    // Obtenir le system prompt (avec cache)
    const systemPrompt = getCachedSystemPrompt(this.config.agentName, getSystemPrompt);

    // Convertir les outils (avec cache)
    const tools = options?.tools || [];
    const anthropicTools = getCachedToolConversion(tools, (t) => this.convertToAnthropicTools(t));

    // Vérifier le cache LLM
    const cachedResponse = getCachedResponse(
      this.config.model,
      systemPrompt,
      anthropicMessages,
      anthropicTools.length > 0 ? anthropicTools : undefined,
    );

    if (cachedResponse) {
      this.log('debug', 'LLM cache hit', {
        duration: Date.now() - startTime,
      });
      return this.parseResponse(cachedResponse);
    }

    // Appeler l'API avec retry
    const response = await this.callWithRetry(client, systemPrompt, anthropicMessages, anthropicTools, options);

    // Mettre en cache la réponse
    cacheResponse(
      this.config.model,
      systemPrompt,
      anthropicMessages,
      anthropicTools.length > 0 ? anthropicTools : undefined,
      response,
    );

    this.log('debug', 'LLM call completed', {
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      stopReason: response.stop_reason,
      duration: Date.now() - startTime,
    });

    return this.parseResponse(response);
  }

  /**
   * Appelle l'API avec retry et exponential backoff
   */
  private async callWithRetry(
    client: Anthropic,
    systemPrompt: string,
    anthropicMessages: Anthropic.MessageParam[],
    anthropicTools: Anthropic.Tool[],
    options?: LLMCallOptions,
  ): Promise<Anthropic.Message> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      try {
        // Préparer les paramètres
        const createParams: Anthropic.MessageCreateParamsNonStreaming = {
          model: this.config.model,
          max_tokens: options?.maxTokens || this.config.maxTokens,
          system: systemPrompt,
          messages: anthropicMessages,
          tools: anthropicTools.length > 0 ? anthropicTools : undefined,
          temperature: options?.temperature || this.config.temperature,
        };

        // Extended Thinking si activé
        if (this.config.extendedThinking) {
          const thinkingBudget = this.config.thinkingBudget;
          createParams.temperature = 1;
          Object.assign(createParams, {
            thinking: {
              type: 'enabled',
              budget_tokens: Math.min(thinkingBudget, 31999),
            },
          });
        }

        // Appeler l'API
        const response = (await client.messages.create(createParams)) as Anthropic.Message;
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Vérifier si c'est une erreur de rate limit
        const isRateLimitError =
          error instanceof Anthropic.RateLimitError ||
          (error instanceof Error && error.message.includes('rate limit')) ||
          (error instanceof Error && 'status' in error && (error as { status?: number }).status === 429);

        if (isRateLimitError && attempt < MAX_RATE_LIMIT_RETRIES) {
          const backoffDelay = calculateBackoffDelay(attempt);

          this.log('warn', `Rate limit hit, retrying in ${Math.round(backoffDelay / 1000)}s`, {
            attempt: attempt + 1,
            maxRetries: MAX_RATE_LIMIT_RETRIES,
            backoffMs: backoffDelay,
          });

          await sleep(backoffDelay);
          continue;
        }

        // Erreur non-récupérable ou retries épuisés
        this.log('error', 'LLM call failed', {
          error: lastError.message,
          isRateLimitError,
          attempts: attempt + 1,
        });

        throw lastError;
      }
    }

    throw lastError || new Error('LLM call failed after all retries');
  }

  /**
   * Convertit nos messages au format Anthropic
   */
  private convertToAnthropicMessages(messages: AgentMessage[]): Anthropic.MessageParam[] {
    return messages.map((msg) => {
      if (msg.role === 'system') {
        return { role: 'user' as const, content: msg.content };
      }

      if (msg.toolResults && msg.toolResults.length > 0) {
        return {
          role: 'user' as const,
          content: msg.toolResults.map((tr) => ({
            type: 'tool_result' as const,
            tool_use_id: tr.toolCallId,
            content: typeof tr.output === 'string' ? tr.output : JSON.stringify(tr.output),
            is_error: tr.isError,
          })),
        };
      }

      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const content: Anthropic.ContentBlockParam[] = [];

        if (msg.content) {
          content.push({ type: 'text' as const, text: msg.content });
        }

        for (const tc of msg.toolCalls) {
          content.push({
            type: 'tool_use' as const,
            id: tc.id,
            name: tc.name,
            input: tc.input,
          });
        }

        return { role: 'assistant' as const, content };
      }

      return {
        role: msg.role as 'user' | 'assistant',
        content: msg.content,
      };
    });
  }

  /**
   * Convertit nos outils au format Anthropic
   */
  private convertToAnthropicTools(tools: ToolDefinition[]): Anthropic.Tool[] {
    return tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.inputSchema as Anthropic.Tool['input_schema'],
    }));
  }

  /**
   * Parse la réponse du LLM
   */
  private parseResponse(response: Anthropic.Message): ParsedLLMResponse {
    let text = '';
    const toolCalls: ToolCall[] = [];

    for (const block of response.content) {
      if (block.type === 'text') {
        text += block.text;
      } else if (block.type === 'tool_use') {
        toolCalls.push({
          id: block.id,
          name: block.name,
          input: block.input as Record<string, unknown>,
        });
      }
    }

    return {
      text,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
    };
  }

  /**
   * Logging interne
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void {
    // Utiliser le callback si défini
    if (this.logCallback) {
      this.logCallback(level, message, data);
      return;
    }

    // Sinon utiliser le logger par défaut
    switch (level) {
      case 'debug':
        this.logger.debug(message, data);
        break;
      case 'info':
        this.logger.info(message, data);
        break;
      case 'warn':
        this.logger.warn(message, data);
        break;
      case 'error':
        this.logger.error(message, data);
        break;
    }
  }
}
