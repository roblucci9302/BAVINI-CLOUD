/**
 * Point d'entrée principal du système de sous-agents BAVINI
 * Exporte tous les composants nécessaires
 */

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export * from './types';

/*
 * ============================================================================
 * CORE
 * ============================================================================
 */

export { BaseAgent } from './core/base-agent';
export { AgentRegistry, agentRegistry } from './core/agent-registry';
export type { RegisteredAgent, RegistryStats } from './core/agent-registry';
export { TaskQueue, createTaskQueue } from './core/task-queue';
export type { TaskQueueConfig, QueueStats } from './core/task-queue';
export {
  ToolRegistry,
  createStandardToolRegistry,
  createReadToolsRegistry,
  createWriteToolsRegistry,
  createShellToolsRegistry,
  createGitToolsRegistry,
  createDesignToolsRegistry,
  createInspectToolsRegistry,
  createIntegrationToolsRegistry,
  createWebToolsRegistry,
} from './core/tool-registry';
export type {
  ToolHandler,
  RegisteredTool,
  RegisterOptions,
  RegistryStats as ToolRegistryStats,
} from './core/tool-registry';

// SRP Classes - Extracted from BaseAgent for better separation of concerns
export { LLMClient } from './core/llm-client';
export type { LLMClientConfig, LLMCallOptions, ParsedLLMResponse, LLMLogCallback } from './core/llm-client';
export { MessageHistory } from './core/message-history';
export type { MessageHistoryConfig, MessageHistoryStats, MessageHistoryLogCallback } from './core/message-history';
export { ToolExecutor } from './core/tool-executor';
export type {
  ToolExecutorConfig,
  ToolExecutorCallbacks,
  ToolExecutorLogCallback,
  CustomToolHandler,
} from './core/tool-executor';

/*
 * ============================================================================
 * AGENTS
 * ============================================================================
 */

export { ExploreAgent, createExploreAgent } from './agents/explore-agent';
export { Orchestrator, createOrchestrator } from './agents/orchestrator';
export { CoderAgent, createCoderAgent } from './agents/coder-agent';
export type { CoderFileSystem } from './agents/coder-agent';
export { BuilderAgent, createBuilderAgent } from './agents/builder-agent';
export { TesterAgent, createTesterAgent } from './agents/tester-agent';
export { DeployerAgent, createDeployerAgent } from './agents/deployer-agent';
export { ReviewerAgent, createReviewerAgent } from './agents/reviewer-agent';
export type { ReviewReport } from './agents/reviewer-agent';
export { FixerAgent, createFixerAgent } from './agents/fixer-agent';
export type { FixableError, FixableErrorType, AppliedFix, FixResult } from './agents/fixer-agent';
export { ArchitectAgent, createArchitectAgent } from './agents/architect-agent';

/*
 * ============================================================================
 * TOOLS - LECTURE
 * ============================================================================
 */

export {
  READ_TOOLS,
  ReadFileTool,
  GrepTool,
  GlobTool,
  ListDirectoryTool,
  createReadToolHandlers,
} from './tools/read-tools';
export type { FileSystem } from './tools/read-tools';

/*
 * ============================================================================
 * TOOLS - ÉCRITURE
 * ============================================================================
 */

export {
  WRITE_TOOLS,
  WriteFileTool,
  EditFileTool,
  DeleteFileTool,
  CreateDirectoryTool,
  MoveFileTool,
  createWriteToolHandlers,
  createMockWritableFileSystem,
} from './tools/write-tools';
export type { WritableFileSystem } from './tools/write-tools';

/*
 * ============================================================================
 * TOOLS - SHELL
 * ============================================================================
 */

export {
  SHELL_TOOLS,
  NpmCommandTool,
  ShellCommandTool,
  StartDevServerTool,
  StopServerTool,
  InstallDependenciesTool,
  GetProcessStatusTool,
  createShellToolHandlers,
  createMockShell,
} from './tools/shell-tools';
export type { ShellInterface, ShellResult, RunningProcess } from './tools/shell-tools';

/*
 * ============================================================================
 * TOOLS - TEST
 * ============================================================================
 */

export {
  TEST_TOOLS,
  RunTestsTool,
  AnalyzeTestResultsTool,
  CoverageReportTool,
  RunSingleTestTool,
  ListTestsTool,
  createTestToolHandlers,
  createMockTestRunner,
} from './tools/test-tools';
export type { TestRunner, TestResult, TestSuiteResult, CoverageReport } from './tools/test-tools';

/*
 * ============================================================================
 * TOOLS - GIT
 * ============================================================================
 */

export {
  GIT_TOOLS,
  GitInitTool,
  GitCloneTool,
  GitStatusTool,
  GitAddTool,
  GitCommitTool,
  GitPushTool,
  GitPullTool,
  GitBranchTool,
  GitLogTool,
  GitDiffTool,
  createGitToolHandlers,
  createMockGit,
} from './tools/git-tools';
export type { GitInterface, GitBranch, GitCommit, GitFileStatus } from './tools/git-tools';

/*
 * ============================================================================
 * TOOLS - REVIEW
 * ============================================================================
 */

export {
  REVIEW_TOOLS,
  AnalyzeCodeTool,
  ReviewChangesTool,
  CalculateComplexityTool,
  CheckStyleTool,
  DetectCodeSmellsTool,
  createReviewToolHandlers,
  createMockAnalyzer,
} from './tools/review-tools';
export type {
  CodeAnalyzer,
  AnalysisType,
  IssueSeverity,
  IssueType,
  CodeIssue,
  AnalysisResult,
  ChangeReviewResult,
  ComplexityResult,
  CodeSmell,
} from './tools/review-tools';

/*
 * ============================================================================
 * TOOLS - DESIGN
 * ============================================================================
 */

export {
  DESIGN_TOOLS,
  GenerateDesignInspirationTool,
  GetModernComponentsTool,
  GetPalette2025Tool,
  GetDesignTemplateTool,
  createDesignToolHandlers,
  createDesignToolHandlersV2,
  recommendTemplate,
  getDesignSystemSummary,
} from './tools/design-tools';
export type { DesignBrief } from './tools/design-tools';

/*
 * ============================================================================
 * TOOLS - INSPECT (Screenshots)
 * ============================================================================
 */

export { INSPECT_TOOLS, InspectSiteTool, CompareSitesTool, createInspectToolHandlers } from './tools/inspect-tools';
export type { InspectionResult, ScreenshotServiceInterface } from './tools/inspect-tools';

/*
 * ============================================================================
 * TOOLS - WEB (Recherche et navigation)
 * ============================================================================
 */

export {
  WEB_TOOLS,
  WebSearchTool,
  WebFetchTool,
  createWebToolHandlers,
  createWebSearchService,
  createWebSearchServiceFromEnv,
} from './tools/web-tools';
export type {
  WebSearchResult,
  WebSearchOptions,
  WebFetchResult,
  WebSearchServiceInterface,
  WebSearchServiceConfig,
} from './tools/web-tools';

/*
 * ============================================================================
 * TOOLS - INTEGRATIONS (Services connectés)
 * ============================================================================
 */

export {
  INTEGRATION_TOOLS,
  GetIntegrationsTool,
  GetDatabaseSchemaTool,
  RequestIntegrationTool,
  createIntegrationToolHandlers,
} from './tools/integration-tools';
export type {
  IntegrationId,
  IntegrationStatus,
  DatabaseSchema,
  TableSchema,
  ColumnSchema,
  ConnectorsStateInterface,
  SupabaseClientInterface,
} from './tools/integration-tools';

/*
 * ============================================================================
 * EXECUTION - PARALLEL EXECUTOR
 * ============================================================================
 */

export {
  DependencyGraph,
  createDependencyGraph,
  createGraphFromDefinitions,
  ParallelExecutor,
  createParallelExecutor,
} from './execution';
export type {
  GraphNode,
  ExecutionLevel,
  GraphValidation,
  SubtaskDefinition,
  SubtaskResult,
  ExecutionStats,
  ParallelExecutorOptions,
  TaskExecutor,
} from './execution';

/*
 * ============================================================================
 * UTILS
 * ============================================================================
 */

export {
  CheckpointManager,
  InMemoryCheckpointStorage,
  createCheckpointManager,
  createCheckpointManagerWithStorage,
} from './utils/checkpoint-manager';
export type { CheckpointState, CheckpointStorage, SaveOptions, ResumeOptions } from './utils/checkpoint-manager';

// ErrorRecovery déplacé vers ~/lib/errors/ - réexport pour compatibilité
export { ErrorRecovery, createErrorRecovery } from '~/lib/errors/error-recovery';
export type {
  ErrorType,
  ErrorSeverity,
  RecoveryAction,
  ErrorAnalysis,
  RecoveryConfig,
} from '~/lib/errors/error-recovery';

export { SwarmCoordinator, createSwarmCoordinator, PREDEFINED_RULES } from './utils/swarm-coordinator';
export type { HandoffRule, HandoffCondition, HandoffResult, SwarmChain, SwarmConfig } from './utils/swarm-coordinator';

// Dry-Run Mode pour les opérations destructrices
export {
  DryRunManager,
  DryRunBlockedError,
  dryRunManager,
  enableDryRun,
  disableDryRun,
  isDryRunEnabled,
  simulateIfDryRun,
  getDryRunSummary,
  formatDryRunSummary,
  clearDryRunOperations,
  withDryRun,
} from './utils/dry-run';
export type { OperationCategory, DryRunOperation, DryRunSummary, DryRunConfig } from './utils/dry-run';

/*
 * ============================================================================
 * PROMPTS
 * ============================================================================
 */

export { EXPLORE_SYSTEM_PROMPT } from './prompts/explore-prompt';
export {
  ORCHESTRATOR_SYSTEM_PROMPT,
  AGENT_CAPABILITIES,
  getOrchestratorSystemPrompt,
} from './prompts/orchestrator-prompt';
export { CODER_SYSTEM_PROMPT, getCoderSystemPrompt } from './prompts/coder-prompt';
export type { DesignGuidelinesConfig } from './prompts/coder-prompt';
export { BUILDER_SYSTEM_PROMPT } from './prompts/builder-prompt';
export { TESTER_SYSTEM_PROMPT } from './prompts/tester-prompt';
export { DEPLOYER_SYSTEM_PROMPT } from './prompts/deployer-prompt';
export { REVIEWER_SYSTEM_PROMPT } from './prompts/reviewer-prompt';
export { FIXER_SYSTEM_PROMPT } from './prompts/fixer-prompt';
export { ARCHITECT_SYSTEM_PROMPT } from './prompts/architect-prompt';

/*
 * ============================================================================
 * SECURITY
 * ============================================================================
 */

export * from './security';

/*
 * ============================================================================
 * ADAPTERS
 * ============================================================================
 */

export * from './adapters';

/*
 * ============================================================================
 * REACT INTEGRATION
 * ============================================================================
 */

export * from './react';

/*
 * ============================================================================
 * SYSTÈME D'AGENTS COMPLET
 * ============================================================================
 */

import { AgentRegistry } from './core/agent-registry';
import { TaskQueue } from './core/task-queue';
import { createExploreAgent } from './agents/explore-agent';
import { createOrchestrator } from './agents/orchestrator';
import { createCoderAgent } from './agents/coder-agent';
import { createBuilderAgent } from './agents/builder-agent';
import { createTesterAgent } from './agents/tester-agent';
import { createDeployerAgent } from './agents/deployer-agent';
import { createReviewerAgent } from './agents/reviewer-agent';
import { createFixerAgent } from './agents/fixer-agent';
import { createArchitectAgent } from './agents/architect-agent';
import type { FileSystem } from './tools/read-tools';
import type { CodeAnalyzer } from './tools/review-tools';
import { SwarmCoordinator, createSwarmCoordinator } from './utils/swarm-coordinator';
import type { WritableFileSystem } from './tools/write-tools';
import type { ShellInterface } from './tools/shell-tools';
import type { TestRunner } from './tools/test-tools';
import type { GitInterface } from './tools/git-tools';
import type { Task, TaskResult, AgentEventCallback, AgentType } from './types';
import { handleAgentEvent, updateAgentStatus, addAgentLog, resetAgentStores } from '../stores/agents';
import { CheckpointManager, createCheckpointManager } from './utils/checkpoint-manager';
import { ErrorRecovery, createErrorRecovery } from '~/lib/errors/error-recovery';

/**
 * Type FileSystem complète (lecture + écriture)
 * WritableFileSystem inclut toutes les méthodes de lecture et d'écriture
 */
export type FullFileSystem = WritableFileSystem;

/**
 * Configuration du système d'agents
 */
export interface AgentSystemConfig {
  /** Clé API Anthropic */
  apiKey: string;

  /** Système de fichiers (WebContainer) - lecture seule */
  fileSystem: FileSystem;

  /** Système de fichiers avec écriture (optionnel, pour Coder Agent) */
  writableFileSystem?: FullFileSystem;

  /** Interface shell (optionnel, pour Builder Agent) */
  shell?: ShellInterface;

  /** Runner de tests (optionnel, pour Tester Agent) */
  testRunner?: TestRunner;

  /** Interface Git (optionnel, pour Deployer Agent) */
  git?: GitInterface;

  /** Analyseur de code (optionnel, pour Reviewer Agent) */
  analyzer?: CodeAnalyzer;

  /** Callback pour les événements (optionnel) */
  onEvent?: AgentEventCallback;

  /** Activer les logs détaillés */
  verbose?: boolean;

  /** Nombre max de tâches parallèles */
  maxParallelTasks?: number;

  /** Activer les checkpoints automatiques */
  enableCheckpoints?: boolean;

  /** Activer la récupération automatique d'erreurs */
  enableErrorRecovery?: boolean;

  /** Activer le swarm coordinator avec les règles prédéfinies */
  enableSwarm?: boolean;
}

/**
 * Système d'agents BAVINI
 * Classe principale pour gérer tous les agents
 */
export class AgentSystem {
  private registry: AgentRegistry;
  private taskQueue: TaskQueue | null = null;
  private checkpointManager: CheckpointManager | null = null;
  private errorRecovery: ErrorRecovery | null = null;
  private swarmCoordinator: SwarmCoordinator | null = null;
  private apiKey: string;
  private fileSystem: FileSystem;
  private writableFileSystem?: FullFileSystem;
  private shell?: ShellInterface;
  private testRunner?: TestRunner;
  private git?: GitInterface;
  private analyzer?: CodeAnalyzer;
  private eventCallback?: AgentEventCallback;
  private maxParallelTasks: number;
  private enableCheckpoints: boolean;
  private enableErrorRecovery: boolean;
  private enableSwarm: boolean;
  private initialized = false;

  // Store unsubscribe function to prevent memory leaks
  private registryUnsubscribe: (() => void) | null = null;

  constructor(config: AgentSystemConfig) {
    this.registry = AgentRegistry.getInstance();

    // Valider l'API key
    this.validateApiKey(config.apiKey);
    this.apiKey = config.apiKey;

    this.fileSystem = config.fileSystem;
    this.writableFileSystem = config.writableFileSystem;
    this.shell = config.shell;
    this.testRunner = config.testRunner;
    this.git = config.git;
    this.analyzer = config.analyzer;
    this.eventCallback = config.onEvent;
    this.maxParallelTasks = config.maxParallelTasks ?? 3;
    this.enableCheckpoints = config.enableCheckpoints ?? false;
    this.enableErrorRecovery = config.enableErrorRecovery ?? true;
    this.enableSwarm = config.enableSwarm ?? false;

    // Réinitialiser les stores
    resetAgentStores();
  }

  /**
   * Valider le format de l'API key Anthropic
   * @throws Error si l'API key est invalide
   */
  private validateApiKey(apiKey: string): void {
    if (!apiKey) {
      throw new Error('API key Anthropic manquante. Veuillez fournir une clé API valide.');
    }

    if (typeof apiKey !== 'string') {
      throw new Error('API key doit être une chaîne de caractères.');
    }

    const trimmedKey = apiKey.trim();

    if (trimmedKey.length === 0) {
      throw new Error('API key ne peut pas être vide.');
    }

    // Vérifier le format Anthropic (sk-ant-...)
    if (!trimmedKey.startsWith('sk-ant-')) {
      throw new Error(
        'Format API key invalide. Les clés Anthropic commencent par "sk-ant-". ' +
          'Vérifiez votre clé sur https://console.anthropic.com/',
      );
    }

    // Vérifier la longueur minimale (les clés Anthropic font généralement 100+ caractères)
    if (trimmedKey.length < 50) {
      throw new Error('API key semble tronquée (trop courte). ' + 'Vérifiez que vous avez copié la clé complète.');
    }
  }

  /**
   * Initialiser le système d'agents
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    // Créer et enregistrer l'Explore Agent
    const exploreAgent = createExploreAgent(this.fileSystem);
    this.registry.register(exploreAgent);

    // Créer et enregistrer l'Architect Agent (lecture seule - planification)
    const architectAgent = createArchitectAgent(this.fileSystem);
    this.registry.register(architectAgent);

    // Créer et enregistrer le Coder Agent (si FileSystem writable disponible)
    if (this.writableFileSystem) {
      const coderAgent = createCoderAgent(this.writableFileSystem);
      this.registry.register(coderAgent);
    }

    // Créer et enregistrer le Builder Agent (si Shell disponible)
    if (this.shell) {
      const builderAgent = createBuilderAgent(this.shell);
      this.registry.register(builderAgent);
    }

    // Créer et enregistrer le Tester Agent (si TestRunner disponible)
    if (this.testRunner) {
      const testerAgent = createTesterAgent(this.testRunner);
      this.registry.register(testerAgent);
    }

    // Créer et enregistrer le Deployer Agent (si Git disponible)
    if (this.git) {
      const deployerAgent = createDeployerAgent(this.git);
      this.registry.register(deployerAgent);
    }

    // Créer et enregistrer le Reviewer Agent (si Analyzer disponible)
    if (this.analyzer) {
      const reviewerAgent = createReviewerAgent(this.analyzer, this.fileSystem);
      this.registry.register(reviewerAgent);
    }

    // Créer et enregistrer le Fixer Agent (si FileSystem writable disponible)
    if (this.writableFileSystem) {
      const fixerAgent = createFixerAgent(this.writableFileSystem);
      this.registry.register(fixerAgent);
    }

    // Créer et enregistrer l'Orchestrator
    const orchestrator = createOrchestrator();
    orchestrator.setApiKey(this.apiKey);
    this.registry.register(orchestrator);

    // Créer la task queue
    this.taskQueue = new TaskQueue(this.registry, this.apiKey, {
      maxParallel: this.maxParallelTasks,
      onEvent: (event) => {
        handleAgentEvent(event);

        if (this.eventCallback) {
          this.eventCallback(event);
        }
      },
    });

    // S'abonner aux événements du registry et stocker l'unsubscribe
    this.registryUnsubscribe = this.registry.subscribe((event) => {
      // Mettre à jour les stores
      handleAgentEvent(event);

      // Appeler le callback externe si fourni
      if (this.eventCallback) {
        this.eventCallback(event);
      }
    });

    // Créer le CheckpointManager si activé
    if (this.enableCheckpoints) {
      this.checkpointManager = createCheckpointManager();
    }

    // Créer l'ErrorRecovery si activé
    if (this.enableErrorRecovery) {
      this.errorRecovery = createErrorRecovery(this.registry);
    }

    // Créer le SwarmCoordinator si activé
    if (this.enableSwarm) {
      this.swarmCoordinator = createSwarmCoordinator(this.registry, this.apiKey, {
        eventCallback: this.eventCallback,
        enablePredefinedRules: true,
      });
    }

    this.initialized = true;

    addAgentLog('orchestrator', {
      level: 'info',
      message: 'Agent system initialized with ' + this.registry.getAll().size + ' agents',
    });
  }

  /**
   * Obtenir la task queue
   */
  getTaskQueue(): TaskQueue | null {
    return this.taskQueue;
  }

  /**
   * Obtenir le checkpoint manager
   */
  getCheckpointManager(): CheckpointManager | null {
    return this.checkpointManager;
  }

  /**
   * Obtenir l'error recovery
   */
  getErrorRecovery(): ErrorRecovery | null {
    return this.errorRecovery;
  }

  /**
   * Obtenir le swarm coordinator
   */
  getSwarmCoordinator(): SwarmCoordinator | null {
    return this.swarmCoordinator;
  }

  /**
   * Exécuter une tâche via l'orchestrateur
   */
  async executeTask(prompt: string, context?: Record<string, unknown>): Promise<TaskResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      type: 'user_request',
      prompt,
      context: context
        ? {
            additionalInfo: context,
          }
        : undefined,
      status: 'pending',
      createdAt: new Date(),
    };

    updateAgentStatus('orchestrator', 'thinking');

    try {
      const orchestrator = this.registry.get('orchestrator');

      if (!orchestrator) {
        throw new Error('Orchestrator not found');
      }

      const result = await orchestrator.run(task, this.apiKey);

      return result;
    } finally {
      updateAgentStatus('orchestrator', 'idle');
    }
  }

  /**
   * Exécuter directement avec un agent spécifique
   */
  async executeWithAgent(agentName: string, prompt: string, context?: Record<string, unknown>): Promise<TaskResult> {
    if (!this.initialized) {
      await this.initialize();
    }

    const agent = this.registry.get(agentName as AgentType);

    if (!agent) {
      return {
        success: false,
        output: `Agent '${agentName}' non trouvé`,
        errors: [
          {
            code: 'AGENT_NOT_FOUND',
            message: `Agent ${agentName} not found`,
            recoverable: false,
          },
        ],
      };
    }

    const task: Task = {
      id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
      type: agentName,
      prompt,
      context: context
        ? {
            additionalInfo: context,
          }
        : undefined,
      status: 'pending',
      createdAt: new Date(),
    };

    return agent.run(task, this.apiKey);
  }

  /**
   * Obtenir le statut du système
   */
  getStatus(): {
    initialized: boolean;
    agents: Array<{
      name: string;
      status: string;
      description: string;
    }>;
  } {
    return {
      initialized: this.initialized,
      agents: this.registry.getAgentsInfo().map((a) => ({
        name: a.name,
        status: a.status,
        description: a.description,
      })),
    };
  }

  /**
   * Arrêter le système
   */
  async shutdown(): Promise<void> {
    // Unsubscribe from registry events to prevent memory leaks
    if (this.registryUnsubscribe) {
      this.registryUnsubscribe();
      this.registryUnsubscribe = null;
    }

    // Annuler toutes les tâches en cours
    this.registry.getAll().forEach((agent) => {
      if (!agent.isAvailable()) {
        agent.abort();
      }
    });

    // Réinitialiser les stores
    resetAgentStores();

    this.initialized = false;
  }
}

/**
 * Créer une instance du système d'agents
 */
export function createAgentSystem(config: AgentSystemConfig): AgentSystem {
  return new AgentSystem(config);
}
