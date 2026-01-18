/**
 * @fileoverview Exécuteur d'outils pour les agents BAVINI
 *
 * Ce module encapsule l'exécution des outils, incluant:
 * - Exécution individuelle et en parallèle des outils
 * - Gestion des erreurs et des timeouts
 * - Intégration avec le ToolRegistry
 *
 * @module agents/core/tool-executor
 * @see {@link BaseAgent} pour l'utilisation dans les agents
 * @see {@link ToolRegistry} pour la gestion des outils
 */

import type { ToolRegistry } from './tool-registry';
import type { ToolCall, ToolResult, ToolExecutionResult } from '../types';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Configuration de l'exécuteur d'outils
 */
export interface ToolExecutorConfig {
  /** Timeout par défaut pour l'exécution d'un outil (ms) */
  defaultTimeout?: number;
  /** Activer l'exécution parallèle */
  enableParallelExecution?: boolean;
  /** Nombre maximum d'outils en parallèle */
  maxParallelTools?: number;
}

/**
 * Callback pour les événements d'exécution d'outils
 */
export interface ToolExecutorCallbacks {
  /** Appelé avant l'exécution d'un outil */
  onToolCall?: (toolName: string, input: Record<string, unknown>) => void;
  /** Appelé après l'exécution d'un outil */
  onToolResult?: (toolName: string, result: ToolExecutionResult, executionTime: number) => void;
  /** Appelé en cas d'erreur */
  onToolError?: (toolName: string, error: string, executionTime: number) => void;
}

/**
 * Callback pour les événements de logging
 */
export type ToolExecutorLogCallback = (
  level: 'debug' | 'info' | 'warn' | 'error',
  message: string,
  data?: Record<string, unknown>,
) => void;

/**
 * Handler personnalisé pour les outils non enregistrés
 */
export type CustomToolHandler = (toolName: string, input: Record<string, unknown>) => Promise<unknown>;

/*
 * ============================================================================
 * TOOL EXECUTOR CLASS
 * ============================================================================
 */

/**
 * Exécuteur d'outils pour les agents
 *
 * Responsabilités:
 * - Exécution des outils via le ToolRegistry
 * - Gestion des erreurs et des timeouts
 * - Exécution parallèle avec Promise.allSettled
 *
 * @class ToolExecutor
 *
 * @example
 * ```typescript
 * const executor = new ToolExecutor(toolRegistry, {
 *   defaultTimeout: 30000,
 *   enableParallelExecution: true,
 * });
 *
 * // Exécution d'un seul outil
 * const result = await executor.execute('read_file', { path: '/tmp/test.txt' });
 *
 * // Exécution en parallèle
 * const results = await executor.executeAll(toolCalls);
 * ```
 */
export class ToolExecutor {
  private registry: ToolRegistry;
  private config: Required<ToolExecutorConfig>;
  private callbacks: ToolExecutorCallbacks = {};
  private logCallback: ToolExecutorLogCallback | null = null;
  private customToolHandler: CustomToolHandler | null = null;

  constructor(registry: ToolRegistry, config?: ToolExecutorConfig) {
    this.registry = registry;
    this.config = {
      defaultTimeout: 30000,
      enableParallelExecution: true,
      maxParallelTools: 10,
      ...config,
    };
  }

  /**
   * Définir les callbacks d'événements
   */
  setCallbacks(callbacks: ToolExecutorCallbacks): void {
    this.callbacks = { ...this.callbacks, ...callbacks };
  }

  /**
   * Définir le callback de logging
   */
  setLogCallback(callback: ToolExecutorLogCallback): void {
    this.logCallback = callback;
  }

  /**
   * Définir un handler pour les outils personnalisés non enregistrés
   */
  setCustomToolHandler(handler: CustomToolHandler): void {
    this.customToolHandler = handler;
  }

  /**
   * Exécute un outil et retourne le résultat
   *
   * @param toolName - Nom de l'outil à exécuter
   * @param input - Paramètres d'entrée de l'outil
   * @returns Résultat de l'exécution
   */
  async execute(toolName: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    this.log('debug', `Executing tool: ${toolName}`, { input });
    this.callbacks.onToolCall?.(toolName, input);

    try {
      // Exécuter l'outil
      const output = await this.executeHandler(toolName, input);

      const executionTime = Date.now() - startTime;

      const result: ToolExecutionResult = {
        success: true,
        output,
        executionTime,
      };

      this.callbacks.onToolResult?.(toolName, result, executionTime);

      return result;
    } catch (error) {
      const executionTime = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : String(error);

      this.callbacks.onToolError?.(toolName, errorMessage, executionTime);

      return {
        success: false,
        output: null,
        error: errorMessage,
        executionTime,
      };
    }
  }

  /**
   * Exécute plusieurs outils en parallèle
   *
   * Utilise Promise.allSettled pour garantir que tous les outils s'exécutent
   * même si certains échouent.
   *
   * @param toolCalls - Liste des appels d'outils
   * @returns Liste des résultats
   */
  async executeAll(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    if (!this.config.enableParallelExecution || toolCalls.length === 1) {
      // Exécution séquentielle
      return this.executeSequential(toolCalls);
    }

    // Limiter le parallélisme si nécessaire
    const batches = this.batchToolCalls(toolCalls);
    const results: ToolResult[] = [];

    for (const batch of batches) {
      const batchResults = await this.executeParallelBatch(batch);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Vérifie si un outil est disponible
   */
  hasTools(toolName: string): boolean {
    return this.registry.has(toolName) || this.customToolHandler !== null;
  }

  /**
   * Retourne la liste des outils disponibles
   */
  getAvailableTools(): string[] {
    return this.registry.getToolNames();
  }

  /**
   * Exécute le handler d'un outil
   */
  private async executeHandler(toolName: string, input: Record<string, unknown>): Promise<unknown> {
    // 1. Chercher dans le registre d'outils
    if (this.registry.has(toolName)) {
      const result = await this.registry.execute(toolName, input);

      if (!result.success) {
        throw new Error(result.error || `Tool '${toolName}' execution failed`);
      }

      return result.output;
    }

    // 2. Utiliser le handler personnalisé si défini
    if (this.customToolHandler) {
      return this.customToolHandler(toolName, input);
    }

    // 3. Outil non trouvé
    const availableTools = this.registry.getToolNames();
    const toolList =
      availableTools.length > 0 ? `Available tools: ${availableTools.join(', ')}` : 'No tools registered';

    throw new Error(`Tool '${toolName}' not found in registry and no custom handler provided. ${toolList}`);
  }

  /**
   * Exécute les outils séquentiellement
   */
  private async executeSequential(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const results: ToolResult[] = [];

    for (const toolCall of toolCalls) {
      const result = await this.execute(toolCall.name, toolCall.input);

      results.push({
        toolCallId: toolCall.id,
        output: result.output,
        error: result.error,
        isError: !result.success,
      });
    }

    return results;
  }

  /**
   * Exécute un batch d'outils en parallèle
   */
  private async executeParallelBatch(toolCalls: ToolCall[]): Promise<ToolResult[]> {
    const settledResults = await Promise.allSettled(
      toolCalls.map(async (toolCall) => {
        const result = await this.execute(toolCall.name, toolCall.input);
        return { toolCall, result };
      }),
    );

    // Mapper les résultats
    return settledResults.map((settled, index) => {
      const toolCall = toolCalls[index];

      if (settled.status === 'fulfilled') {
        const { result } = settled.value;
        return {
          toolCallId: toolCall.id,
          output: result.output,
          error: result.error,
          isError: !result.success,
        };
      } else {
        // Exception non capturée
        const errorMessage = settled.reason instanceof Error ? settled.reason.message : String(settled.reason);

        this.log('error', `Tool ${toolCall.name} threw exception`, {
          error: errorMessage,
          toolId: toolCall.id,
        });

        return {
          toolCallId: toolCall.id,
          output: null,
          error: `Tool execution failed: ${errorMessage}`,
          isError: true,
        };
      }
    });
  }

  /**
   * Divise les appels d'outils en batches pour limiter le parallélisme
   */
  private batchToolCalls(toolCalls: ToolCall[]): ToolCall[][] {
    const batches: ToolCall[][] = [];
    const maxParallel = this.config.maxParallelTools;

    for (let i = 0; i < toolCalls.length; i += maxParallel) {
      batches.push(toolCalls.slice(i, i + maxParallel));
    }

    return batches;
  }

  /**
   * Logging interne
   */
  private log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (this.logCallback) {
      this.logCallback(level, message, data);
    }
  }
}
