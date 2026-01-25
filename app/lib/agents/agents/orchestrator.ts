/**
 * @fileoverview Orchestrator - Agent principal du système multi-agent BAVINI
 *
 * L'Orchestrator est l'agent de coordination qui:
 * - Analyse les demandes utilisateur pour déterminer la stratégie d'exécution
 * - Décompose les tâches complexes en sous-tâches
 * - Délègue aux agents spécialisés (Explorer, Coder, Builder, Tester, Deployer)
 * - Agrège les résultats des sous-agents
 * - Gère l'exécution parallèle avec le ParallelExecutor
 *
 * @module agents/agents/orchestrator
 * @see {@link BaseAgent} pour la classe de base
 * @see {@link AgentRegistry} pour l'accès aux agents
 * @see {@link ParallelExecutor} pour l'exécution parallèle
 *
 * @example
 * ```typescript
 * // Créer et utiliser l'orchestrateur
 * const orchestrator = createOrchestrator();
 * orchestrator.setApiKey(process.env.ANTHROPIC_API_KEY);
 *
 * const result = await orchestrator.run({
 *   id: 'task-1',
 *   type: 'orchestrator',
 *   prompt: 'Crée une API REST avec Express et des tests',
 * }, apiKey);
 *
 * // L'orchestrateur va:
 * // 1. Analyser la demande
 * // 2. Créer des sous-tâches (coder -> API, tester -> tests)
 * // 3. Les exécuter en parallèle si possible
 * // 4. Agréger et retourner les résultats
 * ```
 */

import { BaseAgent } from '../core/base-agent';
import type { ToolHandler } from '../core/tool-registry';
import { AgentRegistry } from '../core/agent-registry';
import {
  ORCHESTRATOR_SYSTEM_PROMPT,
  AGENT_CAPABILITIES,
  getOrchestratorSystemPrompt,
  type DesignGuidelinesConfig,
} from '../prompts/orchestrator-prompt';
import type {
  Task,
  TaskResult,
  AgentType,
  AgentMessage,
  OrchestrationDecision,
  ExecutionPlan,
  ToolExecutionResult,
} from '../types';
import { getModelForAgent } from '../types';
import { createScopedLogger } from '~/utils/logger';
import { getCachedRouting, cacheRouting } from '../cache';
import {
  CheckpointScheduler,
  createAgentCheckpointScheduler,
  type TaskCheckpointState,
} from '../persistence/checkpoint-scheduler';
import {
  INTERACTION_TOOLS,
  createInteractionToolHandlers,
  formatTodosForPrompt,
  type AskUserCallback,
  type UpdateTodosCallback,
} from '../tools/interaction-tools';
import { ExecutionModeManager, createExecutionModeManager, type PendingAction } from '../utils/execution-mode';
import { ProjectMemoryLoader, createProjectMemoryLoader } from '../utils/project-memory';
import type { ExecutionMode, ProjectMemory } from '../types';
import {
  WEB_TOOLS,
  createWebToolHandlers,
  createWebSearchService,
  createWebSearchServiceFromEnv,
  type WebSearchServiceInterface,
  type WebSearchServiceConfig,
} from '../tools/web-tools';

// Phase 1.2 Refactoring - Modular imports
import {
  DelegateToAgentTool,
  CreateSubtasksTool,
  GetAgentStatusTool,
  CompleteTaskTool,
  ORCHESTRATOR_TOOLS,
} from '../tools/orchestrator-tools';
import {
  parseDecision,
  type DecisionParserLogger,
} from '../utils/decision-parser';
import {
  executeDelegation,
  executeDecomposition,
  handleDelegateToAgent,
  handleCreateSubtasks,
  handleGetAgentStatus,
  type DelegationContext,
  type DecompositionContext,
} from '../execution/orchestrator-executor';

const logger = createScopedLogger('Orchestrator');

/*
 * ============================================================================
 * ORCHESTRATOR
 * ============================================================================
 */

/**
 * Agent orchestrateur principal du système multi-agent
 *
 * L'Orchestrator analyse les demandes, détermine la meilleure stratégie
 * d'exécution, et coordonne les agents spécialisés pour accomplir
 * les tâches complexes.
 *
 * @class Orchestrator
 * @extends BaseAgent
 *
 * @property {AgentRegistry} registry - Accès aux agents enregistrés
 * @property {ExecutionPlan | null} currentPlan - Plan d'exécution en cours
 * @property {string} apiKey - Clé API pour les sous-agents
 *
 * @example
 * ```typescript
 * const orchestrator = new Orchestrator();
 * orchestrator.setApiKey(apiKey);
 *
 * // Exécuter une demande utilisateur
 * const result = await orchestrator.run({
 *   id: 'task-123',
 *   type: 'orchestrator',
 *   prompt: 'Ajoute une fonctionnalité de dark mode',
 *   context: { projectPath: '/app' }
 * }, apiKey);
 *
 * // Vérifier le type de décision prise
 * if (result.data?.delegatedTo) {
 *   console.log(`Délégué à: ${result.data.delegatedTo}`);
 * }
 * ```
 */
export class Orchestrator extends BaseAgent {
  private registry: AgentRegistry;
  private currentPlan: ExecutionPlan | null = null;
  private apiKey: string = '';
  private checkpointScheduler: CheckpointScheduler;
  private askUserCallback: AskUserCallback | null = null;
  private updateTodosCallback: UpdateTodosCallback | null = null;
  private executionModeManager: ExecutionModeManager;
  private projectMemoryLoader: ProjectMemoryLoader;
  private projectMemory: ProjectMemory | null = null;
  private webSearchService: WebSearchServiceInterface | null = null;

  /** Configuration des design guidelines */
  private designGuidelinesConfig: DesignGuidelinesConfig | undefined;

  constructor(designGuidelinesConfig?: DesignGuidelinesConfig) {
    // Generate system prompt with design guidelines if config is provided
    const systemPrompt = designGuidelinesConfig
      ? getOrchestratorSystemPrompt(designGuidelinesConfig)
      : ORCHESTRATOR_SYSTEM_PROMPT;

    super({
      name: 'orchestrator',
      description:
        'Agent principal qui coordonne les autres agents. ' +
        'Analyse les demandes, décompose les tâches complexes, et délègue aux agents spécialisés.',
      model: getModelForAgent('orchestrator'), // Opus 4.5 pour le raisonnement stratégique
      tools: [
        DelegateToAgentTool,
        CreateSubtasksTool,
        GetAgentStatusTool,
        CompleteTaskTool, // Permet à l'orchestrateur de signaler la fin de tâche
        ...INTERACTION_TOOLS, // AskUserQuestion et TodoWrite
        ...WEB_TOOLS, // WebSearch et WebFetch pour la recherche web
      ],
      systemPrompt,
      maxTokens: 16384, // Increased from 8K to 16K for coordination
      temperature: 0.3, // Un peu de créativité pour la planification
      timeout: 300000, // 5 minutes
      maxRetries: 3,
      extendedThinking: true, // Activer le raisonnement approfondi
      thinkingBudget: 16000, // 16K tokens pour la réflexion
    });

    this.designGuidelinesConfig = designGuidelinesConfig;

    this.registry = AgentRegistry.getInstance();

    // Initialiser le checkpoint scheduler pour les tâches longues
    this.checkpointScheduler = createAgentCheckpointScheduler();

    // Initialiser le gestionnaire de mode d'exécution (plan/execute/strict)
    this.executionModeManager = createExecutionModeManager('execute', this.handleApprovalRequest.bind(this));

    // Initialiser le chargeur de mémoire projet (BAVINI.md)
    this.projectMemoryLoader = createProjectMemoryLoader();

    // Enregistrer les outils d'orchestration dans le ToolRegistry
    this.registerOrchestratorTools();

    // Enregistrer les outils d'interaction (AskUser, TodoWrite)
    this.registerInteractionTools();

    // Enregistrer les outils web (WebSearch, WebFetch) avec service mock par défaut
    this.registerWebTools();
  }

  /**
   * Gestionnaire des demandes d'approbation pour les actions
   * Utilise le callback AskUser si disponible
   */
  private async handleApprovalRequest(action: PendingAction): Promise<boolean> {
    // Si pas de callback, rejeter par défaut
    if (!this.askUserCallback) {
      this.log('warn', 'Approval requested but no askUserCallback configured', { action: action.toolType });
      return false;
    }

    try {
      // Demander l'approbation via AskUser
      const answers = await this.askUserCallback([
        {
          question: `Autoriser l'action "${action.description}" (${action.toolType})?`,
          header: 'Approbation',
          options: [
            { label: 'Autoriser', description: 'Exécuter cette action' },
            { label: 'Refuser', description: 'Bloquer cette action' },
          ],
          multiSelect: false,
        },
      ]);

      const approved = answers[0]?.selected.includes('Autoriser') ?? false;
      this.log('info', 'Approval response', { action: action.toolType, approved });
      return approved;
    } catch (error) {
      this.log('error', 'Error requesting approval', { error });
      return false;
    }
  }

  /**
   * Enregistrer les outils d'orchestration dans le ToolRegistry
   */
  private registerOrchestratorTools(): void {
    const orchestratorHandlers: Record<string, ToolHandler> = {
      delegate_to_agent: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
        // Use modular handler from orchestrator-executor
        const result = handleDelegateToAgent(
          input as {
            agent: AgentType;
            task: string;
            context?: Record<string, unknown>;
          },
        );
        return { success: true, output: result };
      },

      create_subtasks: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
        // Use modular handler from orchestrator-executor
        const result = handleCreateSubtasks(
          input as {
            tasks: Array<{
              agent: AgentType;
              description: string;
              dependsOn?: number[];
            }>;
            reasoning: string;
          },
        );
        return { success: true, output: result };
      },

      get_agent_status: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
        // Use modular handler from orchestrator-executor
        const result = handleGetAgentStatus(input as { agent?: AgentType }, this.registry);
        return { success: true, output: result };
      },

      complete_task: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
        // This tool signals task completion
        // The result will be used by parseDecision to generate the 'complete' action
        const result = input.result as string;
        const summary = input.summary as string | undefined;
        const artifacts = input.artifacts as string[] | undefined;

        this.log('info', 'Task completion signaled', {
          resultLength: result?.length,
          hasArtifacts: !!artifacts?.length,
        });

        return {
          success: true,
          output: JSON.stringify({
            completed: true,
            result,
            summary,
            artifacts,
          }),
        };
      },
    };

    this.registerTools(ORCHESTRATOR_TOOLS, orchestratorHandlers, 'orchestration');

    this.log('info', 'Orchestrator tools registered in ToolRegistry');
  }

  /**
   * Enregistrer les outils d'interaction (AskUser, TodoWrite)
   */
  private registerInteractionTools(): void {
    const interactionHandlers = createInteractionToolHandlers(

      // Callback pour AskUser - utilise le callback externe si défini
      async (questions) => {
        if (this.askUserCallback) {
          return this.askUserCallback(questions);
        }

        // Mode mock: simule une réponse avec la première option
        return questions.map((q) => ({
          question: q.question,
          selected: [q.options[0]?.label || 'Option 1'],
          answeredAt: new Date(),
        }));
      },

      // Callback pour TodoWrite - utilise le callback externe si défini
      async (todos) => {
        if (this.updateTodosCallback) {
          await this.updateTodosCallback(todos);
        }
      },
    );

    this.registerTools(INTERACTION_TOOLS, interactionHandlers, 'interaction');

    this.log('info', 'Interaction tools registered (AskUserQuestion, TodoWrite)');
  }

  /**
   * Enregistrer les outils web (WebSearch, WebFetch)
   */
  private registerWebTools(): void {
    // Utiliser le service configuré ou créer un mock par défaut
    const service = this.webSearchService || createWebSearchService({ provider: 'mock' });
    const webHandlers = createWebToolHandlers(service);

    this.registerTools(WEB_TOOLS, webHandlers, 'web');

    this.log('info', 'Web tools registered (web_search, web_fetch)', {
      serviceAvailable: service.isAvailable(),
    });
  }

  /**
   * Configurer le service de recherche web avec une clé API
   * @param config Configuration du service (provider + apiKey)
   */
  configureWebSearch(config: WebSearchServiceConfig): void {
    this.webSearchService = createWebSearchService(config);

    // Ré-enregistrer les handlers avec le nouveau service
    const webHandlers = createWebToolHandlers(this.webSearchService);
    this.registerTools(WEB_TOOLS, webHandlers, 'web');

    this.log('info', 'Web search service configured', {
      provider: config.provider,
      available: this.webSearchService.isAvailable(),
    });
  }

  /**
   * Configurer le service de recherche web depuis les variables d'environnement
   * @param env Variables d'environnement contenant WEB_SEARCH_PROVIDER, WEB_SEARCH_API_KEY ou TAVILY_API_KEY
   */
  configureWebSearchFromEnv(env: {
    WEB_SEARCH_PROVIDER?: string;
    WEB_SEARCH_API_KEY?: string;
    TAVILY_API_KEY?: string;
  }): void {
    this.webSearchService = createWebSearchServiceFromEnv(env);

    // Ré-enregistrer les handlers avec le nouveau service
    const webHandlers = createWebToolHandlers(this.webSearchService);
    this.registerTools(WEB_TOOLS, webHandlers, 'web');

    this.log('info', 'Web search service configured from environment', {
      available: this.webSearchService.isAvailable(),
    });
  }

  /**
   * Vérifier si la recherche web est disponible
   */
  isWebSearchAvailable(): boolean {
    return this.webSearchService?.isAvailable() ?? false;
  }

  /**
   * Configurer le callback pour les questions utilisateur
   * Permet à l'UI de recevoir et répondre aux questions
   */
  setAskUserCallback(callback: AskUserCallback): void {
    this.askUserCallback = callback;
    this.log('info', 'AskUser callback configured');
  }

  /**
   * Configurer le callback pour les mises à jour de tâches
   * Permet à l'UI d'afficher la progression
   */
  setUpdateTodosCallback(callback: UpdateTodosCallback): void {
    this.updateTodosCallback = callback;
    this.log('info', 'TodoWrite callback configured');
  }

  /*
   * ============================================================================
   * EXECUTION MODE MANAGEMENT
   * ============================================================================
   */

  /**
   * Obtenir le mode d'exécution actuel
   */
  getExecutionMode(): ExecutionMode {
    return this.executionModeManager.getMode();
  }

  /**
   * Définir le mode d'exécution
   * @param mode - 'plan' (lecture seule), 'execute' (normal), 'strict' (tout approuver)
   */
  setExecutionMode(mode: ExecutionMode): void {
    this.executionModeManager.setMode(mode);
    this.log('info', `Execution mode changed to: ${mode}`);
  }

  /**
   * Entrer en mode plan (exploration, lecture seule)
   */
  enterPlanMode(): void {
    this.executionModeManager.enterPlanMode();
    this.log('info', 'Entered plan mode (read-only)');
  }

  /**
   * Sortir du mode plan (revenir en mode execute)
   */
  exitPlanMode(): void {
    this.executionModeManager.exitPlanMode();
    this.log('info', 'Exited plan mode, back to execute mode');
  }

  /**
   * Vérifier si on est en mode plan
   */
  isPlanMode(): boolean {
    return this.executionModeManager.isPlanMode();
  }

  /**
   * Vérifier si une action est autorisée dans le mode actuel
   */
  checkActionPermission(
    toolType: string,
    params: Record<string, unknown>,
  ): {
    allowed: boolean;
    needsApproval: boolean;
    reason?: string;
  } {
    return this.executionModeManager.checkPermission(toolType, params);
  }

  /*
   * ============================================================================
   * PROJECT MEMORY MANAGEMENT
   * ============================================================================
   */

  /**
   * Charger la mémoire projet depuis BAVINI.md ou CLAUDE.md
   * @param projectRoot - Chemin racine du projet
   * @param fileReader - Fonction pour lire les fichiers (pour environnement navigateur)
   */
  async loadProjectMemory(
    projectRoot?: string,
    fileReader?: (path: string) => Promise<string | null>,
  ): Promise<ProjectMemory | null> {
    const loader = createProjectMemoryLoader({
      projectRoot,
      fileReader,
    });

    const result = await loader.load();

    if (result.memory) {
      this.projectMemory = result.memory;
      this.log('info', 'Project memory loaded', {
        source: result.source,
        hasInstructions: !!result.memory.instructions,
        hasContext: !!result.memory.context,
      });
    } else {
      this.log('debug', 'No project memory file found', {
        searchedPaths: result.searchedPaths,
      });
    }

    return result.memory;
  }

  /**
   * Définir la mémoire projet directement depuis un contenu
   * @param content - Contenu markdown du fichier BAVINI.md
   * @param source - Nom de la source (optionnel)
   */
  setProjectMemoryFromContent(content: string, source?: string): ProjectMemory {
    this.projectMemory = this.projectMemoryLoader.loadFromContent(content, source);
    this.log('info', 'Project memory set from content', { source: this.projectMemory.source });
    return this.projectMemory;
  }

  /**
   * Obtenir la mémoire projet actuelle
   */
  getProjectMemory(): ProjectMemory | null {
    return this.projectMemory;
  }

  /**
   * Vider la mémoire projet
   */
  clearProjectMemory(): void {
    this.projectMemory = null;
    this.log('info', 'Project memory cleared');
  }

  /**
   * Implémentation du system prompt
   */
  getSystemPrompt(): string {
    // Enrichir le prompt avec les agents disponibles
    const availableAgents = this.registry
      .getAgentsInfo()
      .filter((a) => a.name !== 'orchestrator')
      .map((a) => `- ${a.name}: ${a.description} (status: ${a.status})`)
      .join('\n');

    // Ajouter les todos en cours si présents
    const todosSection = formatTodosForPrompt();

    // Section mode d'exécution
    const executionMode = this.executionModeManager.getMode();
    const modeDescriptions: Record<ExecutionMode, string> = {
      plan: 'Mode Plan - Lecture seule, exploration du code. Pas de modifications autorisées.',
      execute: 'Mode Execute - Exécution normale avec permissions standards.',
      strict: 'Mode Strict - Toutes les actions de modification nécessitent une approbation.',
    };
    const executionModeSection = `\n\n## Mode d'Exécution Actuel\n**${executionMode.toUpperCase()}**: ${modeDescriptions[executionMode]}`;

    // Section mémoire projet si chargée
    let projectMemorySection = '';
    if (this.projectMemory) {
      projectMemorySection = '\n\n' + this.projectMemoryLoader.formatForPrompt(this.projectMemory);
    }

    // Section recherche web
    const webSearchAvailable = this.webSearchService?.isAvailable() ?? false;
    const webSearchSection = webSearchAvailable
      ? '\n\n## 🌐 Recherche Web ACTIVE\nTu peux utiliser `web_search` et `web_fetch` pour rechercher des informations actuelles sur le web.'
      : '\n\n## 🌐 Recherche Web\n⚠️ Service non configuré. Les outils web retourneront des résultats mock.';

    // Use dynamic prompt with design guidelines if configured
    const basePrompt = this.designGuidelinesConfig
      ? getOrchestratorSystemPrompt(this.designGuidelinesConfig)
      : ORCHESTRATOR_SYSTEM_PROMPT;

    return (
      basePrompt +
      `\n\n## Agents Actuellement Disponibles\n${availableAgents || 'Aucun agent disponible'}` +
      executionModeSection +
      webSearchSection +
      projectMemorySection +
      todosSection
    );
  }

  /**
   * Exécution principale - Point d'entrée pour les demandes utilisateur
   */
  async execute(task: Task): Promise<TaskResult> {
    this.log('info', 'Orchestrator received task', {
      taskId: task.id,
      prompt: task.prompt.substring(0, 100) + '...',
    });

    // Configurer le callback pour les checkpoints automatiques
    this.checkpointScheduler.setTaskStateCallback((taskId: string) => {
      if (taskId === task.id) {
        return this.createTaskCheckpointState(task);
      }

      return null;
    });

    // Planifier des checkpoints par intervalle (30s par défaut)
    const intervalScheduleId = this.checkpointScheduler.scheduleByInterval(task.id);

    try {
      // Analyser la demande et décider de l'action
      const decision = await this.analyzeAndDecide(task);

      this.log('info', 'Orchestration decision', {
        action: decision.action,
        targetAgent: decision.targetAgent,
        reasoning: decision.reasoning,
      });

      // Exécuter selon la décision
      switch (decision.action) {
        case 'delegate':
          return await this.executeDelegationImpl(decision, task);

        case 'decompose':
          return await this.executeDecompositionImpl(decision, task);

        case 'execute_directly':
          return {
            success: true,
            output: decision.response || 'Tâche complétée',
          };

        case 'ask_user':
          return {
            success: true,
            output: decision.question || 'Pouvez-vous préciser votre demande?',
            data: { needsClarification: true },
          };

        case 'complete':
          return {
            success: true,
            output: decision.response || 'Tâche terminée',
          };

        default:
          throw new Error(`Unknown decision action: ${decision.action}`);
      }
    } catch (error) {
      this.log('error', 'Orchestration failed', { error });

      // Créer un checkpoint d'erreur
      await this.checkpointScheduler.createErrorCheckpoint(
        task.id,
        error instanceof Error ? error : new Error(String(error)),
      );

      throw error;
    } finally {
      // Nettoyer les schedules de checkpoint pour cette tâche
      this.checkpointScheduler.cancelAllForTask(task.id);
    }
  }

  /**
   * Définir la clé API pour les sous-agents
   */
  setApiKey(apiKey: string): void {
    this.apiKey = apiKey;
  }

  /**
   * Obtenir le checkpoint scheduler pour configuration externe
   */
  getCheckpointScheduler(): CheckpointScheduler {
    return this.checkpointScheduler;
  }

  /**
   * Créer l'état de checkpoint pour une tâche
   */
  private createTaskCheckpointState(task: Task): TaskCheckpointState {
    // Calculer la progression si un plan existe
    let progress: number | undefined;
    let currentStep: number | undefined;

    if (this.currentPlan && this.currentPlan.steps.length > 0) {
      // Compter les étapes complétées (celles avec un statut 'completed' sur leur tâche)
      const completedSteps = this.currentPlan.steps.filter((step) => step.task.status === 'completed').length;
      progress = completedSteps / this.currentPlan.steps.length;
      currentStep = completedSteps;
    }

    return {
      task,
      agentName: this.getName(),
      messageHistory: [...this.msgHistory.getMessages()],
      partialResults: this.currentPlan
        ? {
            output: `Plan en cours: ${this.currentPlan.id}`,
            data: { plan: this.currentPlan },
          }
        : undefined,
      progress,
      currentStep,
      totalSteps: this.currentPlan?.steps.length,
    };
  }

  // executeToolHandler est hérité de BaseAgent et utilise le ToolRegistry

  /*
   * ============================================================================
   * MÉTHODES PRIVÉES
   * ============================================================================
   */

  /**
   * Analyser la demande et décider de l'action
   */
  private async analyzeAndDecide(task: Task): Promise<OrchestrationDecision> {
    // Vérifier le cache de routing d'abord
    const cachedDecision = getCachedRouting(task.prompt);

    if (cachedDecision) {
      this.logger.debug('Routing cache hit', {
        action: cachedDecision.action,
        targetAgent: cachedDecision.targetAgent,
      });
      return cachedDecision;
    }

    // Construire le prompt d'analyse
    const analysisPrompt = this.buildAnalysisPrompt(task);

    // Appeler le LLM pour la décision
    const routingMessages: AgentMessage[] = [{ role: 'user', content: analysisPrompt }];

    const response = await this.callLLM(routingMessages);

    // Use modular parseDecision from decision-parser
    const parserLogger: DecisionParserLogger = {
      warn: (msg, data) => this.log('warn', msg, data),
      error: (msg, data) => this.log('error', msg, data),
    };
    const decision = parseDecision(response, parserLogger);

    // Mettre en cache la décision pour les prompts similaires futurs
    cacheRouting(task.prompt, decision);

    return decision;
  }

  /**
   * Construire le prompt d'analyse
   */
  private buildAnalysisPrompt(task: Task): string {
    const agentsInfo = Object.values(AGENT_CAPABILITIES)
      .map(
        (a) =>
          `### ${a.name}\n` +
          `Description: ${a.description}\n` +
          `Capacités: ${a.capabilities.join(', ')}\n` +
          `Limites: ${a.limitations.join(', ')}\n` +
          `Cas d'usage: ${a.useCases.join(', ')}`,
      )
      .join('\n\n');

    return `Analyse cette demande et décide comment la traiter.

## Demande de l'utilisateur
${task.prompt}

## Contexte
${task.context ? JSON.stringify(task.context, null, 2) : 'Aucun contexte fourni'}

## Agents disponibles
${agentsInfo}

## Instructions
1. Analyse la demande
2. Détermine si elle nécessite un ou plusieurs agents
3. Utilise l'outil approprié:
   - delegate_to_agent: pour une tâche simple assignable à un agent
   - create_subtasks: pour une tâche complexe nécessitant plusieurs étapes
   - Réponds directement si c'est une question simple

Choisis la meilleure approche.`;
  }

  /**
   * Execute delegation to an agent using modular executor
   */
  private async executeDelegationImpl(decision: OrchestrationDecision, originalTask: Task): Promise<TaskResult> {
    // Create delegation context for modular executor
    const context: DelegationContext = {
      registry: this.registry,
      apiKey: this.apiKey,
      checkpointScheduler: this.checkpointScheduler,
      log: {
        info: (msg, data) => this.log('info', msg, data),
        warn: (msg, data) => this.log('warn', msg, data),
        debug: (msg, data) => this.log('debug', msg, data),
      },
    };

    return executeDelegation(decision, originalTask, context);
  }

  /**
   * Execute decomposition into subtasks using modular executor
   */
  private async executeDecompositionImpl(decision: OrchestrationDecision, originalTask: Task): Promise<TaskResult> {
    // Create decomposition context for modular executor
    const context: DecompositionContext = {
      registry: this.registry,
      apiKey: this.apiKey,
      checkpointScheduler: this.checkpointScheduler,
      log: {
        info: (msg, data) => this.log('info', msg, data),
        warn: (msg, data) => this.log('warn', msg, data),
        debug: (msg, data) => this.log('debug', msg, data),
      },
      eventEmitter: {
        emitEvent: (event, data) => this.emitEvent(event, data),
      },
    };

    return executeDecomposition(decision, originalTask, context);
  }
}

/**
 * Factory pour créer l'orchestrateur
 */
export function createOrchestrator(): Orchestrator {
  return new Orchestrator();
}
