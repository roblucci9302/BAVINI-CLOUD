/**
 * @fileoverview Classe abstraite de base pour tous les agents BAVINI
 *
 * Ce module définit la classe abstraite BaseAgent qui fournit les fonctionnalités
 * communes à tous les agents du système multi-agent:
 * - Appel au LLM Claude via l'API Anthropic
 * - Exécution d'outils avec le ToolRegistry
 * - Gestion des événements et logging
 * - Métriques et suivi des performances
 *
 * @module agents/core/base-agent
 * @see {@link AgentRegistry} pour l'enregistrement des agents
 * @see {@link ToolRegistry} pour la gestion des outils
 *
 * @example
 * ```typescript
 * // Créer un agent personnalisé
 * class MyAgent extends BaseAgent {
 *   constructor() {
 *     super({
 *       name: 'my-agent',
 *       description: 'Mon agent personnalisé',
 *       model: 'claude-sonnet-4-5-20250929',
 *       tools: [myToolDefinition],
 *     });
 *   }
 *
 *   async execute(task: Task): Promise<TaskResult> {
 *     return this.runAgentLoop(task.prompt);
 *   }
 *
 *   getSystemPrompt(): string {
 *     return 'Vous êtes un assistant...';
 *   }
 * }
 * ```
 */

import Anthropic from '@anthropic-ai/sdk';
import { createScopedLogger } from '~/utils/logger';
import { ToolRegistry, type ToolHandler } from './tool-registry';
import { getCachedSystemPrompt, getCachedToolConversion } from '../utils/prompt-cache';
import { getCachedResponse, cacheResponse } from '../cache/llm-cache';
import { getPooledClient, releasePooledClient } from '../cache/api-pool';
import { compressContext, needsCompression, estimateTokens } from '../utils/context-compressor';
import type { RetryStrategy, RetryContext } from '../queue/retry-strategies';
import type {
  AgentConfig,
  AgentStatus,
  AgentMessage,
  Task,
  TaskResult,
  TaskMetrics,
  ToolCall,
  ToolResult,
  ToolDefinition,
  ToolExecutionResult,
  AgentError,
  LogEntry,
  LogLevel,
  AgentEvent,
  AgentEventCallback,
  DEFAULT_MODEL,
} from '../types';

/*
 * ============================================================================
 * AGENT CONSTANTS
 * ============================================================================
 */

/** Maximum number of messages to keep in history to prevent memory issues */
const MAX_MESSAGE_HISTORY = 50;

/** Maximum number of retries for rate-limited requests */
const MAX_RATE_LIMIT_RETRIES = 5;

/** Base delay for exponential backoff (in ms) */
const BASE_BACKOFF_DELAY_MS = 1000;

/** Maximum backoff delay (in ms) */
const MAX_BACKOFF_DELAY_MS = 60000;

/**
 * Simple mutex implementation for preventing concurrent execution.
 * Used to protect agent run() from race conditions.
 */
class SimpleMutex {
  private _locked = false;
  private _waitQueue: Array<() => void> = [];

  async acquire(): Promise<void> {
    if (!this._locked) {
      this._locked = true;
      return;
    }

    // Wait for lock to be released
    return new Promise<void>((resolve) => {
      this._waitQueue.push(resolve);
    });
  }

  release(): void {
    if (this._waitQueue.length > 0) {
      // Give lock to next waiter
      const next = this._waitQueue.shift();
      next?.();
    } else {
      this._locked = false;
    }
  }

  isLocked(): boolean {
    return this._locked;
  }
}

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

/**
 * Classe abstraite de base pour tous les agents BAVINI
 *
 * Cette classe fournit l'infrastructure commune pour tous les agents:
 * - Gestion du cycle de vie (idle, thinking, executing, completed, failed)
 * - Communication avec le LLM Claude
 * - Exécution d'outils via le ToolRegistry
 * - Système d'événements pour le monitoring
 * - Collecte des métriques (tokens, temps d'exécution)
 *
 * @abstract
 * @class BaseAgent
 *
 * @property {AgentConfig} config - Configuration de l'agent
 * @property {AgentStatus} status - Statut actuel de l'agent
 * @property {Task | null} currentTask - Tâche en cours d'exécution
 * @property {AgentMessage[]} messageHistory - Historique des messages de la conversation
 * @property {ToolRegistry} toolRegistry - Registre des outils disponibles
 *
 * @fires agent:started - Émis au démarrage d'une tâche
 * @fires agent:completed - Émis à la fin réussie d'une tâche
 * @fires agent:failed - Émis en cas d'échec
 * @fires agent:tool_call - Émis lors d'un appel d'outil
 * @fires agent:tool_result - Émis après l'exécution d'un outil
 */
export abstract class BaseAgent {
  /** Configuration de l'agent incluant modèle, outils, timeouts */
  protected config: AgentConfig;
  protected status: AgentStatus = 'idle';
  protected currentTask: Task | null = null;
  protected messageHistory: AgentMessage[] = [];

  /** Compteur de tokens incrémental pour éviter recalcul O(n) */
  protected cumulativeTokens: number = 0;
  protected abortController: AbortController | null = null;
  protected logger: ReturnType<typeof createScopedLogger>;
  protected eventCallbacks: Set<AgentEventCallback> = new Set();
  protected metrics: TaskMetrics = this.createEmptyMetrics();

  // Client Anthropic (géré via le pool de connexions)
  protected anthropicClient: Anthropic | null = null;
  protected currentApiKey: string | null = null;

  // Registre d'outils pour l'exécution des tools
  protected toolRegistry: ToolRegistry = new ToolRegistry();

  // Stratégie de retry personnalisée (optionnel)
  protected retryStrategy: RetryStrategy | null = null;

  /**
   * Mutex pour protéger run() contre les exécutions concurrentes.
   * Empêche la corruption d'état si deux tâches sont lancées simultanément.
   */
  private readonly _runMutex = new SimpleMutex();

  /**
   * Crée une nouvelle instance d'agent
   *
   * @param {AgentConfig} config - Configuration de l'agent
   * @param {string} config.name - Nom unique de l'agent
   * @param {string} config.description - Description des capacités de l'agent
   * @param {string} config.model - Modèle Claude à utiliser
   * @param {ToolDefinition[]} config.tools - Outils disponibles pour l'agent
   * @param {number} [config.maxTokens=16384] - Limite de tokens par réponse
   * @param {number} [config.temperature=0.2] - Température pour la génération
   * @param {number} [config.timeout=300000] - Timeout en ms (défaut: 5 min)
   * @param {number} [config.maxRetries=3] - Nombre de tentatives en cas d'erreur
   */
  constructor(config: AgentConfig) {
    this.config = {
      maxTokens: 16384, // Increased from 8K to 16K
      temperature: 0.2,
      timeout: 300000,
      maxRetries: 3,
      ...config,
    };
    this.logger = createScopedLogger(`Agent:${config.name}`);
  }

  /*
   * ============================================================================
   * MÉTHODES ABSTRAITES (à implémenter par chaque agent)
   * ============================================================================
   */

  /**
   * Exécute la logique spécifique de l'agent
   *
   * Cette méthode doit être implémentée par chaque agent pour définir
   * son comportement spécifique. Elle est appelée par `run()` après
   * l'initialisation.
   *
   * @abstract
   * @param {Task} task - Tâche à exécuter contenant le prompt et le contexte
   * @returns {Promise<TaskResult>} Résultat de l'exécution avec output et artefacts
   *
   * @example
   * ```typescript
   * async execute(task: Task): Promise<TaskResult> {
   *   // Utiliser la boucle d'agent pour les tâches complexes
   *   return this.runAgentLoop(task.prompt);
   * }
   * ```
   */
  abstract execute(task: Task): Promise<TaskResult>;

  /**
   * Retourne le system prompt spécifique de l'agent
   *
   * Le system prompt définit le comportement et les instructions de l'agent.
   * Il est envoyé à Claude au début de chaque conversation.
   *
   * @abstract
   * @returns {string} Le system prompt de l'agent
   *
   * @example
   * ```typescript
   * getSystemPrompt(): string {
   *   return `Vous êtes un agent spécialisé dans l'exploration de code.
   *           Analysez les fichiers et fournissez des insights détaillés.`;
   * }
   * ```
   */
  abstract getSystemPrompt(): string;

  /*
   * ============================================================================
   * MÉTHODES PUBLIQUES
   * ============================================================================
   */

  /**
   * Lance l'exécution d'une tâche avec gestion complète du cycle de vie
   *
   * Cette méthode est le point d'entrée principal pour exécuter une tâche.
   * Elle gère:
   * - L'initialisation du client Anthropic
   * - La gestion des événements (started, completed, failed)
   * - Le timeout et l'annulation
   * - La collecte des métriques
   *
   * @param {Task} task - La tâche à exécuter
   * @param {string} apiKey - Clé API Anthropic pour l'authentification
   * @returns {Promise<TaskResult>} Le résultat de l'exécution
   *
   * @emits agent:started - Au début de l'exécution
   * @emits agent:completed - En cas de succès
   * @emits agent:failed - En cas d'échec
   *
   * @example
   * ```typescript
   * const agent = new MyAgent();
   * const result = await agent.run(
   *   { id: 'task-1', prompt: 'Analyse ce fichier', type: 'explore' },
   *   process.env.ANTHROPIC_API_KEY
   * );
   * if (result.success) {
   *   console.log(result.output);
   * }
   * ```
   */
  async run(task: Task, apiKey: string): Promise<TaskResult> {
    // Acquire mutex to prevent concurrent execution on same agent instance
    // This protects against race conditions when two tasks are started simultaneously
    await this._runMutex.acquire();

    this.log('info', `Starting task: ${task.id}`, { taskType: task.type });

    // Initialiser
    this.currentTask = task;
    this.status = 'thinking';
    this.messageHistory = [];
    this.metrics = this.createEmptyMetrics();
    this.abortController = new AbortController();

    // Obtenir un client du pool de connexions
    this.currentApiKey = apiKey;
    this.anthropicClient = getPooledClient(apiKey);

    const startTime = Date.now();

    try {
      // Émettre l'événement de démarrage
      this.emitEvent('agent:started', { taskId: task.id });

      // Exécuter la logique spécifique de l'agent
      const result = await this.executeWithTimeout(task);

      // Calculer les métriques finales
      this.metrics.executionTime = Date.now() - startTime;

      // Ajouter les métriques au résultat
      result.metrics = { ...this.metrics };

      this.status = result.success ? 'completed' : 'failed';
      this.emitEvent(result.success ? 'agent:completed' : 'agent:failed', {
        taskId: task.id,
        result,
      });

      this.log('info', `Task completed: ${task.id}`, {
        success: result.success,
        executionTime: this.metrics.executionTime,
      });

      return result;
    } catch (error) {
      this.status = 'failed';

      const agentError = this.createError(error);

      this.log('error', `Task failed: ${task.id}`, { error: agentError });
      this.emitEvent('agent:failed', { taskId: task.id, error: agentError });

      return {
        success: false,
        output: `Erreur lors de l'exécution: ${agentError.message}`,
        errors: [agentError],
        metrics: {
          ...this.metrics,
          executionTime: Date.now() - startTime,
        },
      };
    } finally {
      // Libérer le client dans le pool
      if (this.currentApiKey && this.anthropicClient) {
        releasePooledClient(this.currentApiKey, this.anthropicClient);
      }

      this.currentTask = null;
      this.abortController = null;
      this.anthropicClient = null;
      this.currentApiKey = null;

      // CRITICAL: Always release mutex, even on error
      this._runMutex.release();
    }
  }

  /**
   * Annule l'exécution en cours de manière propre
   *
   * L'annulation est gérée via AbortController et permet d'interrompre
   * les opérations longues (appels LLM, exécution d'outils).
   *
   * @returns {void}
   *
   * @example
   * ```typescript
   * const agent = new MyAgent();
   * // Démarrer une tâche en background
   * const promise = agent.run(task, apiKey);
   * // Annuler après 10 secondes
   * setTimeout(() => agent.abort(), 10000);
   * ```
   */
  abort(): void {
    if (this.abortController) {
      this.abortController.abort();
      this.status = 'aborted';
      this.log('warn', 'Task aborted', { taskId: this.currentTask?.id });
    }
  }

  /**
   * Retourne le statut actuel de l'agent
   */
  getStatus(): AgentStatus {
    return this.status;
  }

  /**
   * Retourne la configuration de l'agent
   */
  getConfig(): AgentConfig {
    return this.config;
  }

  /**
   * Retourne le nom de l'agent
   */
  getName(): string {
    return this.config.name;
  }

  /**
   * Retourne la description de l'agent
   */
  getDescription(): string {
    return this.config.description;
  }

  /**
   * Vérifie si l'agent est disponible
   */
  isAvailable(): boolean {
    return this.status === 'idle';
  }

  /**
   * S'abonner aux événements de l'agent
   *
   * Permet de recevoir des notifications sur l'activité de l'agent:
   * - agent:started, agent:completed, agent:failed
   * - agent:tool_call, agent:tool_result
   *
   * @param {AgentEventCallback} callback - Fonction appelée pour chaque événement
   * @returns {() => void} Fonction de désabonnement
   *
   * @example
   * ```typescript
   * const unsubscribe = agent.subscribe((event) => {
   *   console.log(`[${event.type}] ${event.agentName}:`, event.data);
   * });
   * // Plus tard, se désabonner
   * unsubscribe();
   * ```
   */
  subscribe(callback: AgentEventCallback): () => void {
    this.eventCallbacks.add(callback);
    return () => this.eventCallbacks.delete(callback);
  }

  /*
   * ============================================================================
   * GESTION DES OUTILS (Tool Registry)
   * ============================================================================
   */

  /**
   * Enregistrer un outil avec son handler d'exécution
   *
   * L'outil sera disponible pour le LLM et pourra être exécuté
   * automatiquement lors de la boucle d'agent.
   *
   * @param {ToolDefinition} definition - Définition de l'outil (nom, description, schéma)
   * @param {ToolHandler} handler - Fonction d'exécution de l'outil
   * @returns {void}
   *
   * @see {@link ToolRegistry.register}
   *
   * @example
   * ```typescript
   * agent.registerTool(
   *   {
   *     name: 'read_file',
   *     description: 'Lit le contenu d\'un fichier',
   *     inputSchema: { type: 'object', properties: { path: { type: 'string' } } }
   *   },
   *   async (input) => ({
   *     success: true,
   *     output: await fs.readFile(input.path, 'utf-8')
   *   })
   * );
   * ```
   */
  registerTool(definition: ToolDefinition, handler: ToolHandler): void {
    this.toolRegistry.register(definition, handler);

    // Ajouter à la config si pas déjà présent (pour le LLM)
    if (!this.config.tools.find((t) => t.name === definition.name)) {
      this.config.tools.push(definition);
    }

    this.log('debug', `Tool registered: ${definition.name}`);
  }

  /**
   * Enregistrer plusieurs outils d'un coup
   */
  registerTools(definitions: ToolDefinition[], handlers: Record<string, ToolHandler>, category?: string): void {
    this.toolRegistry.registerBatch(definitions, handlers, category);

    // Ajouter à la config
    for (const def of definitions) {
      if (handlers[def.name] && !this.config.tools.find((t) => t.name === def.name)) {
        this.config.tools.push(def);
      }
    }

    this.log('debug', `Registered ${definitions.length} tools`, { category });
  }

  /**
   * Désinscrire un outil
   */
  unregisterTool(name: string): boolean {
    const removed = this.toolRegistry.unregister(name);

    if (removed) {
      // Retirer de la config
      const index = this.config.tools.findIndex((t) => t.name === name);

      if (index !== -1) {
        this.config.tools.splice(index, 1);
      }
    }

    return removed;
  }

  /**
   * Obtenir le registre d'outils (pour les sous-classes)
   */
  protected getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  /**
   * Obtenir les définitions des outils enregistrés
   */
  getRegisteredTools(): ToolDefinition[] {
    return this.toolRegistry.getDefinitions();
  }

  /*
   * ============================================================================
   * MÉTHODES PROTÉGÉES (utilisables par les sous-classes)
   * ============================================================================
   */

  /**
   * Appelle le LLM Claude avec les messages fournis
   *
   * Cette méthode gère l'appel à l'API Anthropic avec:
   * - Conversion des messages au format Anthropic
   * - Injection du system prompt
   * - Comptabilisation des tokens utilisés
   *
   * @protected
   * @param {AgentMessage[]} messages - Historique de la conversation
   * @param {Object} [options] - Options supplémentaires
   * @param {ToolDefinition[]} [options.tools] - Outils disponibles pour cet appel
   * @param {number} [options.maxTokens] - Limite de tokens pour la réponse
   * @param {number} [options.temperature] - Température de génération
   * @returns {Promise<Anthropic.Message>} La réponse brute de Claude
   * @throws {Error} Si le client Anthropic n'est pas initialisé
   */
  protected async callLLM(
    messages: AgentMessage[],
    options?: {
      tools?: ToolDefinition[];
      maxTokens?: number;
      temperature?: number;
    },
  ): Promise<Anthropic.Message> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }

    this.status = 'thinking';
    this.metrics.llmCalls++;

    const startTime = Date.now();

    // Compresser le contexte si nécessaire (évite de dépasser les limites de tokens)
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

    // Convertir nos messages au format Anthropic (once, outside retry loop)
    const anthropicMessages = this.convertToAnthropicMessages(messagesToProcess);

    // Get cached system prompt (static per agent type)
    const systemPrompt = getCachedSystemPrompt(this.config.name, () => this.getSystemPrompt());

    // Get cached tool conversion (avoid repeated transformation)
    const tools = options?.tools || this.config.tools;
    const anthropicTools = getCachedToolConversion(tools, (t) => this.convertToAnthropicTools(t));

    // Check LLM cache first (only for non-tool responses)
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
      return cachedResponse;
    }

    // Retry loop with exponential backoff for rate limiting
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= MAX_RATE_LIMIT_RETRIES; attempt++) {
      try {
        // Préparer les paramètres de base
        const createParams: Anthropic.MessageCreateParamsNonStreaming = {
          model: this.config.model,
          max_tokens: options?.maxTokens || this.config.maxTokens || 16384,
          system: systemPrompt,
          messages: anthropicMessages,
          tools: anthropicTools.length > 0 ? anthropicTools : undefined,
          temperature: options?.temperature || this.config.temperature || 0.2,
        };

        // Ajouter Extended Thinking si activé (uniquement pour Opus/Sonnet 4.5+)
        // Extended Thinking nécessite temperature=1 et désactive certains paramètres
        if (this.config.extendedThinking) {
          const thinkingBudget = this.config.thinkingBudget || 16000; // Default: 16K tokens
          // Extended Thinking requiert temperature = 1
          createParams.temperature = 1;

          // Utiliser Object.assign pour ajouter la propriété thinking non typée dans le SDK
          Object.assign(createParams, {
            thinking: {
              type: 'enabled',
              budget_tokens: Math.min(thinkingBudget, 31999), // Max 31999
            },
          });
        }

        // Appeler l'API (non-streaming)
        const response = (await this.anthropicClient.messages.create(createParams)) as Anthropic.Message;

        // Comptabiliser les tokens
        this.metrics.inputTokens += response.usage.input_tokens;
        this.metrics.outputTokens += response.usage.output_tokens;

        this.log('debug', 'LLM call completed', {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
          stopReason: response.stop_reason,
          duration: Date.now() - startTime,
          attempt: attempt > 0 ? attempt : undefined,
        });

        // Cache the response for future identical requests
        cacheResponse(
          this.config.model,
          systemPrompt,
          anthropicMessages,
          anthropicTools.length > 0 ? anthropicTools : undefined,
          response,
        );

        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Check if this is a rate limit error (429)
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

        // For non-rate-limit errors or exhausted retries, log and throw
        this.log('error', 'LLM call failed', {
          error: lastError.message,
          isRateLimitError,
          attempts: attempt + 1,
        });

        throw lastError;
      }
    }

    // Should not reach here, but just in case
    throw lastError || new Error('LLM call failed after all retries');
  }

  /**
   * Exécute un outil et retourne le résultat
   */
  protected async executeTool(toolName: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    this.status = 'waiting_for_tool';
    this.metrics.toolCalls++;

    const startTime = Date.now();

    this.log('debug', `Executing tool: ${toolName}`, { input });
    this.emitEvent('agent:tool_call', { toolName, input });

    try {
      // Trouver l'outil dans la configuration
      const tool = this.config.tools.find((t) => t.name === toolName);

      if (!tool) {
        throw new Error(`Tool not found: ${toolName}`);
      }

      /*
       * L'exécution réelle sera gérée par les handlers spécifiques
       * Pour l'instant, on retourne un placeholder
       * Les sous-classes doivent override cette méthode ou fournir des handlers
       */
      const result = await this.executeToolHandler(toolName, input);

      const executionTime = Date.now() - startTime;
      this.metrics.toolExecutionTime += executionTime;

      this.emitEvent('agent:tool_result', { toolName, result, executionTime });

      return {
        success: true,
        output: result,
        executionTime,
      };
    } catch (error) {
      const executionTime = Date.now() - startTime;
      this.metrics.toolExecutionTime += executionTime;

      const errorMessage = error instanceof Error ? error.message : String(error);

      this.emitEvent('agent:tool_result', {
        toolName,
        error: errorMessage,
        executionTime,
      });

      return {
        success: false,
        output: null,
        error: errorMessage,
        executionTime,
      };
    }
  }

  /**
   * Handler d'exécution des outils
   * Utilise le ToolRegistry pour trouver et exécuter le handler approprié
   */
  protected async executeToolHandler(toolName: string, input: Record<string, unknown>): Promise<unknown> {
    // 1. Chercher dans le registre d'outils
    if (this.toolRegistry.has(toolName)) {
      const result = await this.toolRegistry.execute(toolName, input);

      if (!result.success) {
        throw new Error(result.error || `Tool '${toolName}' execution failed`);
      }

      return result.output;
    }

    // 2. Permettre aux sous-classes de gérer des outils personnalisés
    return this.handleCustomTool(toolName, input);
  }

  /**
   * Handler pour les outils personnalisés non enregistrés dans le registry
   * Les sous-classes peuvent override cette méthode pour gérer des cas spéciaux
   */
  protected async handleCustomTool(toolName: string, _input: Record<string, unknown>): Promise<unknown> {
    // Par défaut, retourne une erreur si l'outil n'est pas trouvé
    const availableTools = this.toolRegistry.getToolNames();
    const toolList =
      availableTools.length > 0 ? `Available tools: ${availableTools.join(', ')}` : 'No tools registered';

    throw new Error(`Tool '${toolName}' not found in registry and no custom handler provided. ${toolList}`);
  }

  /**
   * Boucle d'agent agentic : appel LLM -> exécution outils -> répéter jusqu'à completion
   *
   * Cette méthode implémente le pattern "agentic loop" où l'agent:
   * 1. Envoie le prompt au LLM
   * 2. Parse la réponse pour détecter les appels d'outils
   * 3. Exécute les outils demandés
   * 4. Renvoie les résultats au LLM
   * 5. Répète jusqu'à ce que le LLM réponde sans appel d'outil
   *
   * @protected
   * @param {string} initialPrompt - Le prompt initial de l'utilisateur
   * @returns {Promise<TaskResult>} Le résultat final de l'exécution
   * @throws {Error} Si la tâche est annulée ou si le max d'itérations est atteint
   *
   * @example
   * ```typescript
   * async execute(task: Task): Promise<TaskResult> {
   *   // Ajouter du contexte au prompt
   *   const enrichedPrompt = `Contexte: ${JSON.stringify(task.context)}\n${task.prompt}`;
   *   return this.runAgentLoop(enrichedPrompt);
   * }
   * ```
   */
  protected async runAgentLoop(initialPrompt: string): Promise<TaskResult> {
    // Initialiser avec le prompt utilisateur
    this.addToMessageHistory({
      role: 'user',
      content: initialPrompt,
    });

    let iterations = 0;
    const maxIterations = 15; // Sécurité contre les boucles infinies (ajusté pour tâches complexes)

    while (iterations < maxIterations) {
      iterations++;

      // Trim message history only when approaching capacity (80% threshold)
      // Évite les appels inutiles à chaque itération
      if (this.messageHistory.length >= MAX_MESSAGE_HISTORY * 0.8) {
        this.trimMessageHistory();
      }

      // Vérifier l'annulation
      if (this.abortController?.signal.aborted) {
        throw new Error('Task was aborted');
      }

      // ⚠️ Injecter un rappel d'itération après iter 3 pour inciter à terminer
      if (iterations >= 4) {
        const iterationReminder = this.getIterationReminder(iterations, maxIterations);
        this.addToMessageHistory({
          role: 'user',
          content: iterationReminder,
        });
        this.log('debug', `Iteration reminder injected`, { iteration: iterations, maxIterations });
      }

      // Appeler le LLM
      const response = await this.callLLM(this.messageHistory);

      // Traiter la réponse
      const { text, toolCalls } = this.parseResponse(response);

      // Ajouter la réponse à l'historique
      this.addToMessageHistory({
        role: 'assistant',
        content: text,
        toolCalls,
      });

      // Si pas d'appels d'outils, on a terminé
      if (!toolCalls || toolCalls.length === 0) {
        return this.createSuccessResult(text);
      }

      // Exécuter les outils en parallèle pour de meilleures performances
      // Les outils sont indépendants les uns des autres dans une même réponse LLM
      const toolResults: ToolResult[] = await Promise.all(
        toolCalls.map(async (toolCall) => {
          const result = await this.executeTool(toolCall.name, toolCall.input);
          return {
            toolCallId: toolCall.id,
            output: result.output,
            error: result.error,
            isError: !result.success,
          };
        }),
      );

      // Ajouter les résultats à l'historique
      this.addToMessageHistory({
        role: 'user',
        content: '', // Le contenu est dans toolResults
        toolResults,
      });
    }

    // Si on atteint la limite d'itérations
    return {
      success: false,
      output: 'Maximum iterations reached',
      errors: [
        {
          code: 'MAX_ITERATIONS',
          message: `Agent reached maximum iterations (${maxIterations})`,
          recoverable: false,
        },
      ],
    };
  }

  /**
   * Génère un message de rappel d'itération pour inciter l'agent à terminer
   * Ce message est injecté après l'itération 3 pour prévenir les boucles infinies
   *
   * @protected
   * @param {number} currentIteration - Numéro de l'itération actuelle
   * @param {number} maxIterations - Nombre maximum d'itérations autorisées
   * @returns {string} Message de rappel adapté à l'urgence
   */
  protected getIterationReminder(currentIteration: number, maxIterations: number): string {
    const remaining = maxIterations - currentIteration;
    const urgencyLevel = remaining <= 2 ? 'CRITIQUE' : remaining <= 4 ? 'IMPORTANT' : 'Rappel';

    return `[SYSTÈME - ${urgencyLevel}] ⚠️ Itération ${currentIteration}/${maxIterations}
${remaining <= 2 ? '🚨 DERNIÈRES ITÉRATIONS - Tu DOIS terminer MAINTENANT.' : ''}
${remaining <= 4 ? '⏰ Approche de la limite. Finalise ta tâche.' : ''}

RAPPEL:
- Si la tâche demandée est ACCOMPLIE → retourne le résultat final IMMÉDIATEMENT
- NE lance PAS de nouvelle analyse/review/amélioration
- NE recommence PAS un cycle déjà effectué
- Reste concentré sur ce qui a été DEMANDÉ initialement`;
  }

  /**
   * Logging centralisé
   */
  protected log(level: LogLevel, message: string, data?: Record<string, unknown>): void {
    const entry: LogEntry = {
      level,
      message,
      timestamp: new Date(),
      agentName: this.config.name,
      taskId: this.currentTask?.id,
      data,
    };

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

  /*
   * ============================================================================
   * MÉTHODES PRIVÉES
   * ============================================================================
   */

  /**
   * Exécute avec timeout
   */
  private async executeWithTimeout(task: Task): Promise<TaskResult> {
    const timeout = task.timeout || this.config.timeout || 300000;

    return Promise.race([
      this.execute(task),
      new Promise<TaskResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Task timeout after ${timeout}ms`));
        }, timeout);
      }),
    ]);
  }

  /**
   * Convertit nos messages au format Anthropic
   */
  private convertToAnthropicMessages(messages: AgentMessage[]): Anthropic.MessageParam[] {
    return messages.map((msg) => {
      if (msg.role === 'system') {
        // Les messages system sont gérés séparément
        return { role: 'user' as const, content: msg.content };
      }

      if (msg.toolResults && msg.toolResults.length > 0) {
        // Message avec résultats d'outils
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
        // Message assistant avec appels d'outils
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

      // Message simple
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
  private parseResponse(response: Anthropic.Message): {
    text: string;
    toolCalls: ToolCall[] | undefined;
  } {
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
    };
  }

  /**
   * Crée un résultat de succès
   */
  private createSuccessResult(output: string): TaskResult {
    return {
      success: true,
      output,
      artifacts: [],
      errors: [],
    };
  }

  /**
   * Crée une erreur structurée
   */
  private createError(error: unknown): AgentError {
    if (error instanceof Error) {
      return {
        code: 'AGENT_ERROR',
        message: error.message,
        recoverable: false,
        stack: error.stack,
      };
    }

    return {
      code: 'UNKNOWN_ERROR',
      message: String(error),
      recoverable: false,
    };
  }

  /**
   * Ajoute un message à l'historique et met à jour le compteur de tokens.
   * Performance: O(1) au lieu de recalculer O(n) à chaque vérification.
   */
  private addToMessageHistory(message: AgentMessage): void {
    // Estimer les tokens du message
    let messageTokens = 0;

    if (message.content) {
      messageTokens += estimateTokens(message.content);
    }

    if (message.toolCalls) {
      for (const call of message.toolCalls) {
        messageTokens += estimateTokens(JSON.stringify(call.input));
      }
    }

    if (message.toolResults) {
      for (const result of message.toolResults) {
        messageTokens += estimateTokens(String(result.output ?? ''));
        messageTokens += estimateTokens(String(result.error ?? ''));
      }
    }

    this.cumulativeTokens += messageTokens;
    this.messageHistory.push(message);
  }

  /**
   * Trim message history to prevent memory issues and context overflow.
   * Keeps the most recent messages, preserving the first message (usually the initial prompt).
   */
  private trimMessageHistory(): void {
    if (this.messageHistory.length <= MAX_MESSAGE_HISTORY) {
      return;
    }

    // Keep the first message (initial prompt) and the most recent messages
    const firstMessage = this.messageHistory[0];
    const recentMessages = this.messageHistory.slice(-(MAX_MESSAGE_HISTORY - 1));

    this.messageHistory = [firstMessage, ...recentMessages];

    // Recalculer le compteur de tokens après trim
    this.cumulativeTokens = 0;
    for (const msg of this.messageHistory) {
      if (msg.content) {
        this.cumulativeTokens += estimateTokens(msg.content);
      }
    }

    this.log('debug', `Trimmed message history to ${this.messageHistory.length} messages`, {
      maxHistory: MAX_MESSAGE_HISTORY,
      estimatedTokens: this.cumulativeTokens,
    });
  }

  /**
   * Crée des métriques vides
   */
  private createEmptyMetrics(): TaskMetrics {
    return {
      inputTokens: 0,
      outputTokens: 0,
      executionTime: 0,
      toolCalls: 0,
      llmCalls: 0,
      toolExecutionTime: 0,
    };
  }

  /*
   * ==========================================================================
   * RETRY STRATEGY SUPPORT
   * ==========================================================================
   */

  /**
   * Définir une stratégie de retry personnalisée
   *
   * @param strategy - Stratégie de retry à utiliser
   *
   * @example
   * ```typescript
   * import { createAgentRetryStrategy } from '../queue/retry-strategies';
   * agent.setRetryStrategy(createAgentRetryStrategy());
   * ```
   */
  setRetryStrategy(strategy: RetryStrategy): void {
    this.retryStrategy = strategy;
    this.log('debug', `Retry strategy set: ${strategy.name}`);
  }

  /**
   * Obtenir la stratégie de retry actuelle
   */
  getRetryStrategy(): RetryStrategy | null {
    return this.retryStrategy;
  }

  /**
   * Évaluer si une erreur doit être retentée avec la stratégie configurée
   *
   * @param error - Erreur à évaluer
   * @param attempt - Numéro de la tentative actuelle
   * @returns Décision de retry avec délai, ou null si pas de stratégie configurée
   */
  protected evaluateRetry(
    error: AgentError,
    attempt: number,
  ): { shouldRetry: boolean; delayMs: number; reason: string } | null {
    if (!this.retryStrategy) {
      return null;
    }

    const context: RetryContext = {
      attempt,
      error,
      firstErrorAt: new Date(),
      lastErrorAt: new Date(),
      taskId: this.currentTask?.id ?? 'unknown',
      agentType: this.config.name,
    };

    return this.retryStrategy.evaluate(context);
  }

  /**
   * Exécuter une fonction avec retry en utilisant la stratégie configurée
   *
   * @param fn - Fonction à exécuter
   * @param errorConverter - Fonction pour convertir les erreurs en AgentError
   * @returns Résultat de la fonction
   * @throws Si tous les retries échouent ou si pas de stratégie configurée
   */
  protected async executeWithRetryStrategy<T>(
    fn: () => Promise<T>,
    errorConverter: (error: unknown) => AgentError,
  ): Promise<T> {
    if (!this.retryStrategy) {
      // Sans stratégie, exécuter directement
      return fn();
    }

    let attempt = 0;
    const maxAttempts = this.retryStrategy.getMaxAttempts();
    let lastError: AgentError | null = null;

    while (attempt < maxAttempts) {
      try {
        return await fn();
      } catch (error) {
        lastError = errorConverter(error);

        const decision = this.evaluateRetry(lastError, attempt);

        if (!decision || !decision.shouldRetry) {
          this.log('debug', 'Retry not recommended', {
            reason: decision?.reason ?? 'No strategy',
            attempt,
          });
          throw error;
        }

        this.log('warn', `Retry attempt ${attempt + 1}/${maxAttempts}`, {
          reason: decision.reason,
          delayMs: decision.delayMs,
          error: lastError.message,
        });

        if (decision.delayMs > 0) {
          await new Promise((resolve) => setTimeout(resolve, decision.delayMs));
        }

        attempt++;
      }
    }

    throw lastError ?? new Error('All retries exhausted');
  }

  /**
   * Émet un événement
   */
  protected emitEvent(type: AgentEvent['type'], data: Record<string, unknown>): void {
    const event: AgentEvent = {
      type,
      timestamp: new Date(),
      agentName: this.config.name,
      taskId: this.currentTask?.id,
      data,
    };

    for (const callback of this.eventCallbacks) {
      try {
        callback(event);
      } catch (error) {
        this.logger.error('Event callback error', { error });
      }
    }
  }
}
