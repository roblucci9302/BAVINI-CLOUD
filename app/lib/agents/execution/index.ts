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
