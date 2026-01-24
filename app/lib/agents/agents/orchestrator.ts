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
  TaskStatus,
  AgentType,
  AgentMessage,
  ToolDefinition,
  OrchestrationDecision,
  ExecutionPlan,
  ExecutionStep,
  Artifact,
  ToolExecutionResult,
  ToolCall,
} from '../types';
import { getModelForAgent, MAX_DECOMPOSITION_DEPTH } from '../types';
import { createScopedLogger } from '~/utils/logger';
import {
  ParallelExecutor,
  createParallelExecutor,
  type SubtaskDefinition,
  type SubtaskResult,
} from '../execution/parallel-executor';
import { getGlobalCircuitBreaker } from '../utils/circuit-breaker';
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

const logger = createScopedLogger('Orchestrator');

/*
 * ============================================================================
 * OUTILS DE L'ORCHESTRATEUR
 * ============================================================================
 */

/**
 * Outil pour déléguer une tâche à un agent
 */
const DelegateToAgentTool: ToolDefinition = {
  name: 'delegate_to_agent',
  description:
    'Déléguer une tâche à un agent spécialisé. ' +
    "Utilise cet outil quand une tâche correspond aux capacités d'un agent.",
  inputSchema: {
    type: 'object',
    properties: {
      agent: {
        type: 'string',
        description: "Nom de l'agent cible (explore, coder, builder, tester, deployer, reviewer, fixer, architect)",
        enum: ['explore', 'coder', 'builder', 'tester', 'deployer', 'reviewer', 'fixer', 'architect'],
      },
      task: {
        type: 'string',
        description: "Description précise de la tâche pour l'agent",
      },
      context: {
        type: 'object',
        description: "Contexte additionnel pour l'agent (fichiers, infos, etc.)",
      },
    },
    required: ['agent', 'task'],
  },
};

/**
 * Outil pour créer des sous-tâches
 */
const CreateSubtasksTool: ToolDefinition = {
  name: 'create_subtasks',
  description:
    'Décomposer une tâche complexe en sous-tâches. ' + 'Utilise quand la tâche nécessite plusieurs agents ou étapes.',
  inputSchema: {
    type: 'object',
    properties: {
      tasks: {
        type: 'array',
        description: 'Liste des sous-tâches à créer',
        items: {
          type: 'object',
          properties: {
            agent: { type: 'string', description: 'Agent assigné' },
            description: { type: 'string', description: 'Description de la tâche' },
            dependsOn: {
              type: 'array',
              description: 'Indices des tâches dont celle-ci dépend',
              items: { type: 'number' },
            },
          },
        },
      },
      reasoning: {
        type: 'string',
        description: 'Explication de la décomposition',
      },
    },
    required: ['tasks', 'reasoning'],
  },
};

/**
 * Outil pour obtenir le statut des agents
 */
const GetAgentStatusTool: ToolDefinition = {
  name: 'get_agent_status',
  description: 'Obtenir le statut et les capacités des agents disponibles.',
  inputSchema: {
    type: 'object',
    properties: {
      agent: {
        type: 'string',
        description: "Nom de l'agent (optionnel, tous si omis)",
      },
    },
    required: [],
  },
};

/**
 * Outil pour signaler que la tâche est terminée
 * CRITIQUE: Cet outil permet à l'orchestrateur d'arrêter explicitement
 * au lieu de boucler indéfiniment.
 */
const CompleteTaskTool: ToolDefinition = {
  name: 'complete_task',
  description:
    "Signaler que la tâche demandée par l'utilisateur est TERMINÉE. " +
    'Utilise cet outil quand: (1) la demande est satisfaite, (2) le résultat est prêt à être présenté, ' +
    "(3) aucune action supplémentaire n'est nécessaire. " +
    'NE PAS utiliser si des étapes restent à faire.',
  inputSchema: {
    type: 'object',
    properties: {
      result: {
        type: 'string',
        description: "Résultat final à présenter à l'utilisateur (résumé clair et concis)",
      },
      summary: {
        type: 'string',
        description: 'Résumé des actions effectuées',
      },
      artifacts: {
        type: 'array',
        description: 'Liste des fichiers créés/modifiés (optionnel)',
        items: { type: 'string' },
      },
    },
    required: ['result'],
  },
};

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
        const result = await this.handleDelegateToAgent(
          input as {
            agent: AgentType;
            task: string;
            context?: Record<string, unknown>;
          },
        );
        return { success: true, output: result };
      },

      create_subtasks: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
        const result = await this.handleCreateSubtasks(
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
        const result = await this.handleGetAgentStatus(input as { agent?: AgentType });
        return { success: true, output: result };
      },

      complete_task: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
        // Cet outil signale la fin de la tâche
        // Le résultat sera utilisé par parseDecision pour générer l'action 'complete'
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

    this.registerTools(
      [DelegateToAgentTool, CreateSubtasksTool, GetAgentStatusTool, CompleteTaskTool],
      orchestratorHandlers,
      'orchestration',
    );

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
          return await this.executeDelegation(decision, task);

        case 'decompose':
          return await this.executeDecomposition(decision, task);

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

    // Parser la réponse pour extraire la décision
    const decision = this.parseDecision(response);

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
   * Liste des agents valides pour la validation
   */
  private static readonly VALID_AGENTS: AgentType[] = [
    'explore',
    'coder',
    'builder',
    'tester',
    'deployer',
    'reviewer',
    'fixer',
    'architect',
  ];

  /**
   * Valider qu'un agent est valide
   */
  private validateAgent(agent: unknown, context: string): AgentType {
    if (!agent || typeof agent !== 'string') {
      throw new Error(`${context}: Agent name is required and must be a string`);
    }

    const normalizedAgent = agent.toLowerCase().trim() as AgentType;
    if (!Orchestrator.VALID_AGENTS.includes(normalizedAgent)) {
      throw new Error(
        `${context}: Invalid agent "${agent}". ` + `Valid agents are: ${Orchestrator.VALID_AGENTS.join(', ')}`,
      );
    }

    return normalizedAgent;
  }

  /**
   * Valider une description de tâche
   */
  private validateTaskDescription(description: unknown, context: string): string {
    if (!description || typeof description !== 'string') {
      throw new Error(`${context}: Task description is required and must be a string`);
    }

    const trimmed = description.trim();
    if (trimmed.length === 0) {
      throw new Error(`${context}: Task description cannot be empty`);
    }

    if (trimmed.length < 5) {
      this.log('warn', `${context}: Very short task description`, { length: trimmed.length });
    }

    return trimmed;
  }

  /**
   * Parser la décision du LLM avec validation stricte
   * Accepte le format retourné par callLLM: { text, toolCalls }
   */
  private parseDecision(response: { text: string; toolCalls: ToolCall[] | undefined }): OrchestrationDecision {
    // Chercher les appels d'outils
    if (response.toolCalls && response.toolCalls.length > 0) {
      for (const toolCall of response.toolCalls) {
        const input = toolCall.input;

        try {
          if (toolCall.name === 'delegate_to_agent') {
            // Validation stricte de l'agent
            const agent = this.validateAgent(input.agent, 'delegate_to_agent');

            // Validation stricte de la tâche
            const task = this.validateTaskDescription(input.task, 'delegate_to_agent');

            // Validation optionnelle du contexte
            if (input.context !== undefined && typeof input.context !== 'object') {
              this.log('warn', 'delegate_to_agent: context should be an object, ignoring', {
                type: typeof input.context,
              });
            }

            return {
              action: 'delegate',
              targetAgent: agent,
              reasoning: `Délégation à ${agent}: ${task}`,
            };
          }

          if (toolCall.name === 'create_subtasks') {
            const tasks = input.tasks as unknown;

            // Validation stricte: tasks doit être un tableau non vide
            if (!Array.isArray(tasks)) {
              throw new Error('create_subtasks: "tasks" must be an array');
            }

            if (tasks.length === 0) {
              throw new Error('create_subtasks: At least one subtask is required');
            }

            // Limite le nombre de sous-tâches pour éviter les abus
            if (tasks.length > 20) {
              throw new Error(`create_subtasks: Too many subtasks (${tasks.length}). Maximum is 20.`);
            }

            // Valider chaque sous-tâche
            const validatedTasks = tasks.map((t, idx) => {
              if (!t || typeof t !== 'object') {
                throw new Error(`create_subtasks: Subtask at index ${idx} must be an object`);
              }

              const subtask = t as Record<string, unknown>;

              // Description est obligatoire
              const description = this.validateTaskDescription(
                subtask.description,
                `create_subtasks[${idx}].description`,
              );

              // Agent est optionnel mais doit être valide si présent
              let agent: AgentType | undefined;
              if (subtask.agent !== undefined && subtask.agent !== null && subtask.agent !== '') {
                agent = this.validateAgent(subtask.agent, `create_subtasks[${idx}].agent`);
              }

              // Validation des dépendances
              let dependsOn: number[] | undefined;
              if (subtask.dependsOn !== undefined) {
                if (!Array.isArray(subtask.dependsOn)) {
                  throw new Error(`create_subtasks[${idx}].dependsOn must be an array of indices`);
                }

                dependsOn = (subtask.dependsOn as unknown[]).map((dep, depIdx) => {
                  if (typeof dep !== 'number' || !Number.isInteger(dep) || dep < 0) {
                    throw new Error(
                      `create_subtasks[${idx}].dependsOn[${depIdx}] must be a non-negative integer`,
                    );
                  }
                  if (dep >= tasks.length) {
                    throw new Error(
                      `create_subtasks[${idx}].dependsOn[${depIdx}] references invalid task index ${dep}`,
                    );
                  }
                  if (dep >= idx) {
                    this.log('warn', `create_subtasks: Circular or forward dependency detected`, {
                      taskIndex: idx,
                      dependsOn: dep,
                    });
                  }
                  return dep;
                });
              }

              return {
                agent,
                description,
                dependsOn,
              };
            });

            // Validation du reasoning
            const reasoning = input.reasoning as string | undefined;
            if (reasoning !== undefined && typeof reasoning !== 'string') {
              this.log('warn', 'create_subtasks: reasoning should be a string');
            }

            return {
              action: 'decompose',
              subTasks: validatedTasks.map((t, idx) => ({
                type: t.agent || 'explore',
                prompt: t.description,
                dependencies: t.dependsOn?.map((i) => `subtask-${i}`) || [],
                priority: validatedTasks.length - idx,
              })),
              reasoning: (reasoning && typeof reasoning === 'string' ? reasoning : '') || 'Task decomposition',
            };
          }

          if (toolCall.name === 'complete_task') {
            const result = input.result as unknown;
            const summary = input.summary as string | undefined;

            // Validation stricte du résultat
            if (!result || typeof result !== 'string') {
              throw new Error('complete_task: "result" is required and must be a string');
            }

            const trimmedResult = result.trim();
            if (trimmedResult.length === 0) {
              throw new Error('complete_task: "result" cannot be empty');
            }

            // Validation optionnelle du summary
            if (summary !== undefined && typeof summary !== 'string') {
              this.log('warn', 'complete_task: summary should be a string');
            }

            // Validation optionnelle des artifacts
            const artifacts = input.artifacts as unknown;
            if (artifacts !== undefined) {
              if (!Array.isArray(artifacts)) {
                this.log('warn', 'complete_task: artifacts should be an array');
              } else {
                // Valider que chaque artifact est une string
                for (const [idx, artifact] of artifacts.entries()) {
                  if (typeof artifact !== 'string') {
                    this.log('warn', `complete_task: artifacts[${idx}] should be a string`);
                  }
                }
              }
            }

            return {
              action: 'complete',
              response: trimmedResult,
              reasoning: (summary && typeof summary === 'string' ? summary : '') || 'Tâche terminée avec succès',
            };
          }
        } catch (error) {
          // Log l'erreur de validation et propager
          this.log('error', `Validation error in parseDecision for tool ${toolCall.name}`, {
            error: error instanceof Error ? error.message : String(error),
            toolName: toolCall.name,
            input: JSON.stringify(input).substring(0, 500),
          });
          throw error;
        }
      }
    }

    // Si pas d'outil appelé, c'est une réponse directe
    const textContent = response.text || '';

    // Validation: la réponse directe ne doit pas être vide
    if (!textContent.trim()) {
      this.log('warn', 'parseDecision: Empty response without tool use');
    }

    return {
      action: 'execute_directly',
      response: textContent,
      reasoning: 'Réponse directe sans délégation',
    };
  }

  /**
   * Exécuter une délégation à un agent
   */
  private async executeDelegation(decision: OrchestrationDecision, originalTask: Task): Promise<TaskResult> {
    if (!decision.targetAgent) {
      throw new Error('No target agent specified for delegation');
    }

    const circuitBreaker = getGlobalCircuitBreaker();

    // Vérifier le circuit breaker avant de déléguer
    if (!circuitBreaker.isAllowed(decision.targetAgent)) {
      const stats = circuitBreaker.getStats(decision.targetAgent);
      this.log('warn', `Circuit breaker OPEN for agent ${decision.targetAgent}`, {
        state: stats.state,
        failureCount: stats.failureCount,
      });

      return {
        success: false,
        output: `Agent '${decision.targetAgent}' temporairement indisponible (circuit ouvert après ${stats.failureCount} échecs)`,
        errors: [
          {
            code: 'CIRCUIT_OPEN',
            message: `Agent ${decision.targetAgent} circuit breaker is OPEN`,
            recoverable: true,
            suggestion: 'Réessayer plus tard ou utiliser un autre agent',
            context: {
              state: stats.state,
              failureCount: stats.failureCount,
              lastFailure: stats.lastFailure?.toISOString(),
            },
          },
        ],
      };
    }

    const agent = this.registry.get(decision.targetAgent);

    if (!agent) {
      return {
        success: false,
        output: `Agent '${decision.targetAgent}' non disponible`,
        errors: [
          {
            code: 'AGENT_NOT_FOUND',
            message: `Agent ${decision.targetAgent} not found in registry`,
            recoverable: false,
          },
        ],
      };
    }

    if (!agent.isAvailable()) {
      return {
        success: false,
        output: `Agent '${decision.targetAgent}' est occupé`,
        errors: [
          {
            code: 'AGENT_BUSY',
            message: `Agent ${decision.targetAgent} is busy`,
            recoverable: true,
            suggestion: "Attendre que l'agent soit disponible",
          },
        ],
      };
    }

    // Créer la sous-tâche
    const subTask: Task = {
      id: `${originalTask.id}-${decision.targetAgent}-${Date.now()}`,
      type: decision.targetAgent,
      prompt: decision.reasoning,
      context: originalTask.context,
      status: 'pending',
      metadata: {
        parentTaskId: originalTask.id,
        source: 'orchestrator',
      },
      createdAt: new Date(),
    };

    this.log('info', `Delegating to ${decision.targetAgent}`, {
      subTaskId: subTask.id,
    });

    // Créer un checkpoint AVANT la délégation
    await this.checkpointScheduler.createDelegationCheckpoint(originalTask.id, decision.targetAgent, 'before');

    // Exécuter l'agent avec suivi du circuit breaker
    try {
      const result = await agent.run(subTask, this.apiKey);

      // Créer un checkpoint APRÈS la délégation (succès ou échec)
      await this.checkpointScheduler.createDelegationCheckpoint(originalTask.id, decision.targetAgent, 'after');

      // Enregistrer le succès ou l'échec dans le circuit breaker
      if (result.success) {
        circuitBreaker.recordSuccess(decision.targetAgent);
      } else {
        circuitBreaker.recordFailure(decision.targetAgent, result.output);
      }

      // Enrichir le résultat
      return {
        ...result,
        output: `[${decision.targetAgent}] ${result.output}`,
        data: {
          ...result.data,
          delegatedTo: decision.targetAgent,
          subTaskId: subTask.id,
          circuitState: circuitBreaker.getState(decision.targetAgent),
        },
      };
    } catch (error) {
      // Créer un checkpoint d'erreur avant de propager
      await this.checkpointScheduler.createErrorCheckpoint(
        originalTask.id,
        error instanceof Error ? error : new Error(String(error)),
      );

      // Enregistrer l'échec dans le circuit breaker
      const errorMessage = error instanceof Error ? error.message : String(error);
      circuitBreaker.recordFailure(decision.targetAgent, errorMessage);

      throw error;
    }
  }

  /**
   * Exécuter une décomposition en sous-tâches avec exécution parallèle
   */
  private async executeDecomposition(decision: OrchestrationDecision, originalTask: Task): Promise<TaskResult> {
    // Check decomposition depth to prevent infinite recursion
    const currentDepth = originalTask.metadata?.decompositionDepth ?? 0;

    if (currentDepth >= MAX_DECOMPOSITION_DEPTH) {
      this.log('warn', `Max decomposition depth (${MAX_DECOMPOSITION_DEPTH}) reached, refusing to decompose further`);

      return {
        success: false,
        output: `Profondeur maximum de décomposition atteinte (${MAX_DECOMPOSITION_DEPTH}). La tâche est trop complexe pour être décomposée davantage.`,
        errors: [
          {
            code: 'MAX_DEPTH_EXCEEDED',
            message: `Maximum decomposition depth (${MAX_DECOMPOSITION_DEPTH}) exceeded`,
            recoverable: false,
          },
        ],
      };
    }

    if (!decision.subTasks || decision.subTasks.length === 0) {
      return {
        success: false,
        output: 'Aucune sous-tâche définie',
        errors: [
          {
            code: 'NO_SUBTASKS',
            message: 'Decomposition produced no subtasks',
            recoverable: false,
          },
        ],
      };
    }

    this.log('info', `Decomposing into ${decision.subTasks.length} subtasks`, {
      subtasks: decision.subTasks.map((t) => t.type),
    });

    // Convertir les sous-tâches en format pour l'exécuteur parallèle
    // Increment decomposition depth for subtasks to track recursion
    const subtaskDefinitions: SubtaskDefinition[] = decision.subTasks.map((subTaskDef, i) => ({
      id: `${originalTask.id}-step-${i}`,
      agent: (subTaskDef.type || 'explore') as AgentType,
      task: {
        id: `${originalTask.id}-step-${i}`,
        type: subTaskDef.type || 'explore',
        prompt: subTaskDef.prompt,
        context: {
          ...originalTask.context,
        },
        status: 'pending' as const,
        metadata: {
          parentTaskId: originalTask.id,
          source: 'orchestrator' as const,
          decompositionDepth: currentDepth + 1,
        },
        createdAt: new Date(),
      },

      // Convertir les indices en IDs de dépendances
      dependencies: subTaskDef.dependencies?.map((idx) => `${originalTask.id}-step-${idx}`),
    }));

    // Créer l'exécuteur parallèle
    const executor = createParallelExecutor({
      maxConcurrency: 3, // Limite de 3 agents en parallèle
      continueOnError: true, // Continuer même si une tâche échoue
      taskTimeout: 120000, // 2 minutes par tâche
      onProgress: (completed, total, current) => {
        this.log('debug', `Progress: ${completed}/${total}`, {
          subtaskId: current.id,
          success: current.success,
        });
        this.emitEvent('task:progress', {
          completed,
          total,
          current: current.id,
        });
      },
      onLevelStart: (level, taskCount) => {
        this.log('info', `Starting level ${level} with ${taskCount} task(s)`);
      },
      onLevelComplete: (level, results) => {
        const successful = results.filter((r) => r.success).length;
        this.log('info', `Level ${level} complete: ${successful}/${results.length} successful`);
      },
    });

    // Exécuter avec le callback qui utilise le registry d'agents et le circuit breaker
    const circuitBreaker = getGlobalCircuitBreaker();

    const results = await executor.execute(subtaskDefinitions, async (task, agentType) => {
      // Vérifier le circuit breaker
      if (!circuitBreaker.isAllowed(agentType)) {
        const stats = circuitBreaker.getStats(agentType);
        return {
          success: false,
          output: `Agent ${agentType} temporairement indisponible (circuit ouvert)`,
          errors: [
            {
              code: 'CIRCUIT_OPEN',
              message: `Agent ${agentType} circuit breaker is OPEN`,
              recoverable: true,
              context: { state: stats.state, failureCount: stats.failureCount },
            },
          ],
        };
      }

      const agent = this.registry.get(agentType);

      if (!agent) {
        return {
          success: false,
          output: `Agent ${agentType} non disponible`,
          errors: [
            {
              code: 'AGENT_NOT_FOUND',
              message: `Agent ${agentType} not found in registry`,
              recoverable: false,
            },
          ],
        };
      }

      try {
        const result = await agent.run(task, this.apiKey);

        // Enregistrer succès/échec dans le circuit breaker
        if (result.success) {
          circuitBreaker.recordSuccess(agentType);
        } else {
          circuitBreaker.recordFailure(agentType, result.output);
        }

        // Créer un checkpoint après chaque sous-tâche complétée
        await this.checkpointScheduler.createSubtaskCheckpoint(originalTask.id, task.id, result);

        return result;
      } catch (error) {
        // Créer un checkpoint d'erreur pour la sous-tâche
        await this.checkpointScheduler.createErrorCheckpoint(
          originalTask.id,
          error instanceof Error ? error : new Error(String(error)),
        );

        const errorMessage = error instanceof Error ? error.message : String(error);
        circuitBreaker.recordFailure(agentType, errorMessage);
        throw error;
      }
    });

    // Agréger les artefacts
    const artifacts: Artifact[] = [];

    for (const r of results) {
      if (r.result.artifacts) {
        artifacts.push(...r.result.artifacts);
      }
    }

    // Calculer les statistiques
    const stats = ParallelExecutor.calculateStats(results);

    // Grouper par niveau pour un meilleur affichage
    const byLevel = new Map<number, SubtaskResult[]>();

    for (const r of results) {
      const level = byLevel.get(r.level) || [];
      level.push(r);
      byLevel.set(r.level, level);
    }

    const combinedOutput = Array.from(byLevel.entries())
      .sort(([a], [b]) => a - b)
      .map(([level, levelResults]) => {
        const levelOutput = levelResults.map((r) => `#### ${r.id}\n${r.result.output}`).join('\n\n');
        return `### Niveau ${level} (${levelResults.length} tâche(s), parallèle)\n${levelOutput}`;
      })
      .join('\n\n---\n\n');

    return {
      success: stats.failed === 0,
      output:
        `## Résultat de l'exécution parallèle (${stats.successful}/${stats.total} réussies)\n\n` +
        `**Niveaux d'exécution:** ${stats.levels}\n` +
        `**Efficacité parallèle:** ${stats.parallelEfficiency}x\n` +
        `**Temps total:** ${stats.totalTime}ms\n\n` +
        combinedOutput,
      artifacts,
      data: {
        subtaskResults: results,
        reasoning: decision.reasoning,
        executionStats: stats,
      },
    };
  }

  /**
   * Handler: Déléguer à un agent
   */
  private async handleDelegateToAgent(input: {
    agent: AgentType;
    task: string;
    context?: Record<string, unknown>;
  }): Promise<{ delegated: boolean; agent: string; task: string }> {
    /*
     * Ce handler est utilisé par le LLM pour signaler sa décision
     * L'exécution réelle se fait dans executeDelegation
     */
    return {
      delegated: true,
      agent: input.agent,
      task: input.task,
    };
  }

  /**
   * Handler: Créer des sous-tâches
   */
  private async handleCreateSubtasks(input: {
    tasks: Array<{
      agent: AgentType;
      description: string;
      dependsOn?: number[];
    }>;
    reasoning: string;
  }): Promise<{ created: boolean; count: number; reasoning: string }> {
    return {
      created: true,
      count: input.tasks.length,
      reasoning: input.reasoning,
    };
  }

  /**
   * Handler: Obtenir le statut des agents
   */
  private async handleGetAgentStatus(input: { agent?: AgentType }): Promise<unknown> {
    if (input.agent) {
      const agent = this.registry.get(input.agent);

      if (!agent) {
        return { error: `Agent ${input.agent} not found` };
      }

      return {
        name: input.agent,
        status: agent.getStatus(),
        description: agent.getDescription(),
        available: agent.isAvailable(),
      };
    }

    return this.registry.getAgentsInfo();
  }
}

/**
 * Factory pour créer l'orchestrateur
 */
export function createOrchestrator(): Orchestrator {
  return new Orchestrator();
}
