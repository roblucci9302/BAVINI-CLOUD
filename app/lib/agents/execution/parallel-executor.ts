/**
 * @fileoverview Exécuteur parallèle de tâches avec gestion des dépendances
 *
 * Ce module fournit le ParallelExecutor qui permet d'exécuter des sous-tâches
 * en parallèle tout en respectant leurs dépendances. Il utilise un graphe
 * de dépendances pour déterminer l'ordre d'exécution optimal.
 *
 * Fonctionnalités:
 * - Exécution par niveaux (toutes les tâches d'un niveau en parallèle)
 * - Gestion de la concurrence maximum
 * - Timeout global et par tâche
 * - Callbacks de progression
 * - Statistiques d'exécution (temps, efficacité parallèle)
 *
 * @module agents/execution/parallel-executor
 * @see {@link DependencyGraph} pour la gestion des dépendances
 * @see {@link Orchestrator} pour l'utilisation dans l'orchestration
 *
 * @example
 * ```typescript
 * const executor = createParallelExecutor({
 *   maxConcurrency: 3,
 *   continueOnError: true,
 *   onProgress: (completed, total) => {
 *     console.log(`Progress: ${completed}/${total}`);
 *   }
 * });
 *
 * const results = await executor.execute(subtasks, async (task, agent) => {
 *   return await registry.get(agent).run(task, apiKey);
 * });
 *
 * const stats = ParallelExecutor.calculateStats(results);
 * console.log(`Efficacité: ${stats.parallelEfficiency}x`);
 * ```
 */

import { DependencyGraph, type ExecutionLevel } from './dependency-graph';
import type { Task, TaskResult, AgentType } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ParallelExecutor');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Définition d'une sous-tâche pour l'exécuteur
 */
export interface SubtaskDefinition {
  id: string;
  agent: AgentType;
  task: Task;
  dependencies?: string[];
  timeout?: number;
}

/**
 * Résultat d'exécution d'une sous-tâche
 */
export interface SubtaskResult {
  id: string;
  success: boolean;
  result: TaskResult;
  executionTime: number;
  level: number;
}

/**
 * Statistiques d'exécution
 */
export interface ExecutionStats {
  total: number;
  successful: number;
  failed: number;
  levels: number;
  totalTime: number;
  parallelEfficiency: number;
}

/**
 * Options de l'exécuteur
 */
export interface ParallelExecutorOptions {
  /** Nombre max de tâches en parallèle (default: 5) */
  maxConcurrency?: number;

  /** Timeout global en ms (default: 300000 = 5 min) */
  globalTimeout?: number;

  /** Timeout par tâche en ms (default: 60000 = 1 min) */
  taskTimeout?: number;

  /** Continuer même si une tâche échoue (default: false) */
  continueOnError?: boolean;

  /** Callback pour le progress */
  onProgress?: (completed: number, total: number, current: SubtaskResult) => void;

  /** Callback pour le début d'une tâche */
  onTaskStart?: (subtask: SubtaskDefinition, level: number) => void;

  /** Callback pour le début d'un niveau */
  onLevelStart?: (level: number, taskCount: number) => void;

  /** Callback pour la fin d'un niveau */
  onLevelComplete?: (level: number, results: SubtaskResult[]) => void;
}

/**
 * Fonction d'exécution d'une tâche
 */
export type TaskExecutor = (task: Task, agent: AgentType) => Promise<TaskResult>;

/*
 * ============================================================================
 * PARALLEL EXECUTOR
 * ============================================================================
 */

/**
 * Exécuteur parallèle de tâches avec gestion des dépendances
 *
 * Cette classe coordonne l'exécution de sous-tâches en respectant:
 * - Les dépendances entre tâches (via DependencyGraph)
 * - La limite de concurrence maximale
 * - Les timeouts (global et par tâche)
 *
 * @class ParallelExecutor
 *
 * @example
 * ```typescript
 * const executor = new ParallelExecutor({
 *   maxConcurrency: 3,
 *   globalTimeout: 300000,
 *   continueOnError: false
 * });
 *
 * const subtasks = [
 *   { id: 'explore', agent: 'explorer', task: {...}, dependencies: [] },
 *   { id: 'code', agent: 'coder', task: {...}, dependencies: ['explore'] },
 *   { id: 'test', agent: 'tester', task: {...}, dependencies: ['code'] }
 * ];
 *
 * const results = await executor.execute(subtasks, async (task, agent) => {
 *   return await agentRegistry.get(agent).run(task, apiKey);
 * });
 * ```
 */
export class ParallelExecutor {
  private options: Required<
    Omit<ParallelExecutorOptions, 'onProgress' | 'onTaskStart' | 'onLevelStart' | 'onLevelComplete'>
  > &
    Pick<ParallelExecutorOptions, 'onProgress' | 'onTaskStart' | 'onLevelStart' | 'onLevelComplete'>;

  constructor(options: ParallelExecutorOptions = {}) {
    this.options = {
      maxConcurrency: options.maxConcurrency ?? 5,
      globalTimeout: options.globalTimeout ?? 300000,
      taskTimeout: options.taskTimeout ?? 60000,
      continueOnError: options.continueOnError ?? false,
      onProgress: options.onProgress,
      onTaskStart: options.onTaskStart,
      onLevelStart: options.onLevelStart,
      onLevelComplete: options.onLevelComplete,
    };
  }

  /**
   * Exécuter les sous-tâches avec gestion des dépendances
   *
   * Cette méthode:
   * 1. Construit un graphe de dépendances
   * 2. Valide qu'il n'y a pas de cycles
   * 3. Trie les tâches par niveau topologique
   * 4. Exécute chaque niveau en parallèle (avec limite de concurrence)
   *
   * @param {SubtaskDefinition[]} subtasks - Liste des sous-tâches à exécuter
   * @param {TaskExecutor} executor - Fonction qui exécute une tâche
   * @returns {Promise<SubtaskResult[]>} Résultats de toutes les exécutions
   * @throws {Error} Si le graphe contient des cycles
   *
   * @example
   * ```typescript
   * const results = await executor.execute(subtasks, async (task, agent) => {
   *   const a = agentRegistry.get(agent);
   *   if (!a) throw new Error(`Agent ${agent} not found`);
   *   return a.run(task, apiKey);
   * });
   *
   * const successful = results.filter(r => r.success);
   * console.log(`${successful.length}/${results.length} tâches réussies`);
   * ```
   */
  async execute(subtasks: SubtaskDefinition[], executor: TaskExecutor): Promise<SubtaskResult[]> {
    if (subtasks.length === 0) {
      logger.info('No subtasks to execute');
      return [];
    }

    const startTime = Date.now();

    // Construire le graphe de dépendances
    const graph = this.buildGraph(subtasks);

    // Valider le graphe
    const validation = graph.validate();

    if (validation.hasCycle) {
      throw new Error('Cannot execute: dependency graph contains cycles');
    }

    if (validation.missingDependencies.length > 0) {
      logger.warn('Some dependencies are missing', { missing: validation.missingDependencies });
    }

    // Obtenir les niveaux d'exécution
    const levels = graph.topologicalSort();

    logger.info(`Executing ${subtasks.length} subtasks in ${levels.length} levels`, {
      maxConcurrency: this.options.maxConcurrency,
    });

    const results: SubtaskResult[] = [];
    const completedIds = new Set<string>();
    const failedIds = new Set<string>();
    let totalCompleted = 0;

    // Exécuter niveau par niveau
    for (const level of levels) {
      // Vérifier le timeout global
      if (Date.now() - startTime > this.options.globalTimeout) {
        logger.error('Global timeout exceeded');
        break;
      }

      // Notifier le début du niveau
      this.options.onLevelStart?.(level.level, level.nodes.length);

      logger.debug(`Executing level ${level.level} with ${level.nodes.length} tasks`);

      // Filtrer les tâches dont les dépendances ont échoué
      const executableNodes = level.nodes.filter((node) => {
        // Guard: vérifier que node et node.id existent
        if (!node?.id) {
          logger.warn('Skipping node with missing id');
          return false;
        }

        const deps = graph.getDependencies(node.id) ?? [];
        const hasFailedDep = deps.some((depId) => failedIds.has(depId));

        if (hasFailedDep && !this.options.continueOnError) {
          logger.debug(`Skipping ${node.id} due to failed dependency`);
          return false;
        }

        return true;
      });

      // Exécuter les tâches du niveau en parallèle (avec limite)
      const levelResults = await this.executeLevel(
        { level: level.level, nodes: executableNodes },
        executor,
        completedIds,
        (result) => {
          totalCompleted++;
          this.options.onProgress?.(totalCompleted, subtasks.length, result);
        },
      );

      results.push(...levelResults);

      // Marquer comme complétées ou échouées
      for (const result of levelResults) {
        if (result.success) {
          completedIds.add(result.id);
        } else {
          failedIds.add(result.id);
        }
      }

      // Notifier la fin du niveau
      this.options.onLevelComplete?.(level.level, levelResults);

      // Vérifier les échecs
      const failures = levelResults.filter((r) => !r.success);

      if (failures.length > 0 && !this.options.continueOnError) {
        logger.warn(`Level ${level.level} had ${failures.length} failures, stopping execution`);
        break;
      }
    }

    const totalTime = Date.now() - startTime;
    logger.info(`Execution complete`, {
      total: results.length,
      successful: results.filter((r) => r.success).length,
      failed: results.filter((r) => !r.success).length,
      totalTime,
    });

    return results;
  }

  /**
   * Construire le graphe de dépendances
   */
  private buildGraph(subtasks: SubtaskDefinition[]): DependencyGraph<SubtaskDefinition> {
    const graph = new DependencyGraph<SubtaskDefinition>();

    for (const subtask of subtasks) {
      graph.addNode(subtask.id, subtask, subtask.dependencies || []);
    }

    return graph;
  }

  /**
   * Exécuter un niveau de tâches
   */
  private async executeLevel(
    level: ExecutionLevel<SubtaskDefinition>,
    executor: TaskExecutor,
    completedIds: Set<string>,
    onComplete: (result: SubtaskResult) => void,
  ): Promise<SubtaskResult[]> {
    // Filter out nodes with missing data and extract tasks
    const tasks = level.nodes
      .filter((node): node is typeof node & { data: SubtaskDefinition } => {
        if (!node?.data) {
          logger.warn(`Node missing data in level ${level.level}`);
          return false;
        }

        return true;
      })
      .map((node) => node.data);

    // Limiter la concurrence
    const results: SubtaskResult[] = [];
    const batches = this.chunk(tasks, this.options.maxConcurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(async (subtask) => {
        // Notifier le début de la tâche
        this.options.onTaskStart?.(subtask, level.level);

        const startTime = Date.now();

        try {
          // Vérifier que toutes les dépendances sont complétées
          for (const depId of subtask.dependencies || []) {
            if (!completedIds.has(depId)) {
              throw new Error(`Dependency '${depId}' not completed`);
            }
          }

          const result = await this.executeWithTimeout(
            () => executor(subtask.task, subtask.agent),
            subtask.timeout || this.options.taskTimeout,
          );

          const subtaskResult: SubtaskResult = {
            id: subtask.id,
            success: result.success,
            result,
            executionTime: Date.now() - startTime,
            level: level.level,
          };

          onComplete(subtaskResult);

          return subtaskResult;
        } catch (error) {
          const subtaskResult: SubtaskResult = {
            id: subtask.id,
            success: false,
            result: {
              success: false,
              output: `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
              errors: [
                {
                  code: 'EXECUTION_ERROR',
                  message: error instanceof Error ? error.message : String(error),
                  recoverable: false,
                },
              ],
            },
            executionTime: Date.now() - startTime,
            level: level.level,
          };

          onComplete(subtaskResult);

          return subtaskResult;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Exécuter avec timeout
   */
  private async executeWithTimeout<T>(fn: () => Promise<T>, timeout: number): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(`Execution timeout after ${timeout}ms`)), timeout);
      }),
    ]);
  }

  /**
   * Diviser en chunks
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];

    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }

    return chunks;
  }

  /**
   * Calculer les statistiques d'exécution
   *
   * Analyse les résultats pour fournir des métriques sur l'exécution:
   * - Nombre de tâches réussies/échouées
   * - Temps total d'exécution
   * - Efficacité parallèle (ratio temps séquentiel / temps réel)
   *
   * @static
   * @param {SubtaskResult[]} results - Résultats de l'exécution
   * @returns {ExecutionStats} Statistiques calculées
   *
   * @example
   * ```typescript
   * const stats = ParallelExecutor.calculateStats(results);
   *
   * console.log(`Tâches: ${stats.successful}/${stats.total} réussies`);
   * console.log(`Niveaux: ${stats.levels}`);
   * console.log(`Temps: ${stats.totalTime}ms`);
   * console.log(`Efficacité: ${stats.parallelEfficiency}x`);
   * // Ex: efficacité de 2.5x = 2.5 fois plus rapide qu'en séquentiel
   * ```
   */
  static calculateStats(results: SubtaskResult[]): ExecutionStats {
    if (results.length === 0) {
      return {
        total: 0,
        successful: 0,
        failed: 0,
        levels: 0,
        totalTime: 0,
        parallelEfficiency: 0,
      };
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success).length;
    const levels = new Set(results.map((r) => r.level)).size;
    const totalTime = results.reduce((sum, r) => sum + r.executionTime, 0);

    // Calculer le temps réel (max par niveau)
    const timeByLevel = new Map<number, number>();

    for (const r of results) {
      const current = timeByLevel.get(r.level) || 0;
      timeByLevel.set(r.level, Math.max(current, r.executionTime));
    }

    const realTime = Array.from(timeByLevel.values()).reduce((sum, t) => sum + t, 0);

    // Efficacité = temps séquentiel / temps parallèle
    const parallelEfficiency = realTime > 0 ? totalTime / realTime : 1;

    return {
      total: results.length,
      successful,
      failed,
      levels,
      totalTime: realTime,
      parallelEfficiency: Math.round(parallelEfficiency * 100) / 100,
    };
  }
}

/*
 * ============================================================================
 * FACTORY FUNCTIONS
 * ============================================================================
 */

/**
 * Factory pour créer un exécuteur parallèle
 */
export function createParallelExecutor(options?: ParallelExecutorOptions): ParallelExecutor {
  return new ParallelExecutor(options);
}
