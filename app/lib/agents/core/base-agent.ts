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
import { LLMClient, type LLMCallOptions } from './llm-client';
import { MessageHistory, type MessageHistoryConfig } from './message-history';
import { ToolExecutor, type ToolExecutorCallbacks } from './tool-executor';
import { getPooledClient, releasePooledClient } from '../cache/api-pool';
import { isPromptSafe, type SanitizationConfig } from '../security/prompt-sanitizer';
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

/** Maximum number of iterations in the agent loop */
const MAX_AGENT_ITERATIONS = 15;

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

  // Classes SRP extraites
  /** Client LLM pour la communication avec Claude */
  protected llmClient: LLMClient;
  /** Gestionnaire d'historique des messages */
  protected msgHistory: MessageHistory;
  /** Exécuteur d'outils */
  protected toolExec: ToolExecutor;

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

    // Initialiser les classes SRP
    this.llmClient = new LLMClient({
      agentName: config.name,
      model: this.config.model,
      maxTokens: this.config.maxTokens,
      temperature: this.config.temperature,
      extendedThinking: this.config.extendedThinking,
      thinkingBudget: this.config.thinkingBudget,
    });

    // Configurer le logging pour le LLM client
    this.llmClient.setLogCallback((level, message, data) => {
      this.log(level, message, data);
    });

    this.msgHistory = new MessageHistory({ maxMessages: 50 });
    this.msgHistory.setLogCallback((level, message, data) => {
      this.log(level, message, data);
    });

    this.toolExec = new ToolExecutor(this.toolRegistry, {
      defaultTimeout: 30000,
      enableParallelExecution: true,
    });

    // Configurer les callbacks de l'exécuteur d'outils
    this.toolExec.setCallbacks({
      onToolCall: (toolName, input) => {
        this.emitEvent('agent:tool_call', { toolName, input });
      },
      onToolResult: (toolName, result, executionTime) => {
        this.emitEvent('agent:tool_result', { toolName, result, executionTime });
      },
    });

    this.toolExec.setLogCallback((level, message, data) => {
      this.log(level, message, data);
    });

    // Handler pour les outils personnalisés
    this.toolExec.setCustomToolHandler((toolName, input) => {
      return this.handleCustomTool(toolName, input);
    });
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
    this.msgHistory.clear(); // Utiliser la classe SRP
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
   * Cette méthode délègue au LLMClient (SRP) pour:
   * - Conversion des messages au format Anthropic
   * - Injection du system prompt
   * - Comptabilisation des tokens utilisés
   * - Retry avec exponential backoff
   *
   * @protected
   * @param {AgentMessage[]} messages - Historique de la conversation
   * @param {Object} [options] - Options supplémentaires
   * @param {ToolDefinition[]} [options.tools] - Outils disponibles pour cet appel
   * @param {number} [options.maxTokens] - Limite de tokens pour la réponse
   * @param {number} [options.temperature] - Température de génération
   * @returns {Promise<{text: string, toolCalls: ToolCall[] | undefined}>} Réponse parsée
   * @throws {Error} Si le client Anthropic n'est pas initialisé
   */
  protected async callLLM(
    messages: AgentMessage[],
    options?: LLMCallOptions,
  ): Promise<{ text: string; toolCalls: ToolCall[] | undefined }> {
    if (!this.anthropicClient) {
      throw new Error('Anthropic client not initialized');
    }

    this.status = 'thinking';
    this.metrics.llmCalls++;

    // Déléguer au LLMClient (SRP)
    const response = await this.llmClient.call(
      this.anthropicClient,
      messages,
      () => this.getSystemPrompt(),
      {
        tools: options?.tools || this.config.tools,
        maxTokens: options?.maxTokens,
        temperature: options?.temperature,
      },
    );

    // Comptabiliser les tokens
    this.metrics.inputTokens += response.inputTokens;
    this.metrics.outputTokens += response.outputTokens;

    return {
      text: response.text,
      toolCalls: response.toolCalls,
    };
  }

  /**
   * Exécute un outil et retourne le résultat
   *
   * Délègue au ToolExecutor (SRP) pour l'exécution réelle.
   */
  protected async executeTool(toolName: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    this.status = 'waiting_for_tool';
    this.metrics.toolCalls++;

    // Déléguer au ToolExecutor (SRP)
    const result = await this.toolExec.execute(toolName, input);

    // Comptabiliser le temps d'exécution
    if (result.executionTime) {
      this.metrics.toolExecutionTime += result.executionTime;
    }

    return result;
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
    // SÉCURITÉ: Sanitizer le prompt utilisateur avant traitement
    const sanitizationConfig: Partial<SanitizationConfig> = {
      mode: 'permissive', // Log mais n'empêche pas l'exécution
      riskThreshold: 60, // Seuil de suspicion
    };

    const safetyCheck = isPromptSafe(initialPrompt, sanitizationConfig);

    // Log si le prompt a été modifié ou est suspect
    if (safetyCheck.result.wasModified) {
      this.log('debug', 'Prompt was sanitized', {
        originalLength: initialPrompt.length,
        sanitizedLength: safetyCheck.result.sanitized.length,
      });
    }

    if (!safetyCheck.safe) {
      this.log('warn', 'Suspicious prompt detected', {
        riskScore: safetyCheck.result.riskScore,
        patterns: safetyCheck.result.detectedPatterns.map((p) => p.name),
        reason: safetyCheck.reason,
      });

      // En mode strict, on pourrait bloquer ici. En mode permissif, on continue avec un warning
      // Pour l'instant, on continue mais on pourrait ajouter une config pour bloquer
    }

    // Utiliser le prompt sanitizé
    const processedPrompt = safetyCheck.result.sanitized;

    // Initialiser avec le prompt utilisateur sanitizé (utiliser MessageHistory SRP)
    this.msgHistory.addUserMessage(processedPrompt);

    let iterations = 0;

    while (iterations < MAX_AGENT_ITERATIONS) {
      iterations++;

      // Trim message history si nécessaire (déléguer à MessageHistory SRP)
      this.msgHistory.trimIfNeeded();

      // Vérifier l'annulation
      if (this.abortController?.signal.aborted) {
        throw new Error('Task was aborted');
      }

      // ⚠️ Injecter un rappel d'itération après iter 3 pour inciter à terminer
      if (iterations >= 4) {
        const iterationReminder = this.getIterationReminder(iterations, MAX_AGENT_ITERATIONS);
        this.msgHistory.addUserMessage(iterationReminder);
        this.log('debug', `Iteration reminder injected`, { iteration: iterations, maxIterations: MAX_AGENT_ITERATIONS });
      }

      // Appeler le LLM (callLLM retourne directement { text, toolCalls })
      const { text, toolCalls } = await this.callLLM(this.msgHistory.getMessages());

      // Ajouter la réponse à l'historique (utiliser MessageHistory SRP)
      this.msgHistory.add({
        role: 'assistant',
        content: text,
        toolCalls,
      });

      // Si pas d'appels d'outils, on a terminé
      if (!toolCalls || toolCalls.length === 0) {
        return this.createSuccessResult(text);
      }

      // Exécuter les outils via ToolExecutor (SRP)
      const toolResults = await this.toolExec.executeAll(toolCalls);

      // Log le résumé si des outils ont échoué
      const failedTools = toolResults.filter((r) => r.isError);
      if (failedTools.length > 0) {
        this.log('warn', `${failedTools.length}/${toolCalls.length} tools failed`);
      }

      // Ajouter les résultats à l'historique (utiliser MessageHistory SRP)
      this.msgHistory.addToolResultsMessage(toolResults);
    }

    // Si on atteint la limite d'itérations
    return {
      success: false,
      output: 'Maximum iterations reached',
      errors: [
        {
          code: 'MAX_ITERATIONS',
          message: `Agent reached maximum iterations (${MAX_AGENT_ITERATIONS})`,
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
