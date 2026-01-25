/**
 * Module d'exécution - Exécution parallèle avec gestion des dépendances
 */

export {
  DependencyGraph,
  createDependencyGraph,
  createGraphFromDefinitions,
  type GraphNode,
  type ExecutionLevel,
  type GraphValidation,
} from './dependency-graph';

export {
  ParallelExecutor,
  createParallelExecutor,
  type SubtaskDefinition,
  type SubtaskResult,
  type ExecutionStats,
  type ParallelExecutorOptions,
  type TaskExecutor,
} from './parallel-executor';

// Orchestrator execution (Phase 1.2 Refactoring)
export {
  executeDelegation,
  executeDecomposition,
  handleDelegateToAgent,
  handleCreateSubtasks,
  handleGetAgentStatus,
  type DelegationContext,
  type DecompositionContext,
  type ExecutorLogger,
  type ExecutorEventEmitter,
  type DelegateToAgentResult,
  type CreateSubtasksResult,
  type GetAgentStatusResult,
} from './orchestrator-executor';
