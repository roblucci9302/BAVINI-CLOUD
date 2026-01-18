/**
 * Task Queue - Système de file d'attente et d'exécution parallèle des tâches
 * Gère les dépendances entre tâches et l'exécution concurrente
 */

import { EventEmitter } from 'events';
import type { Task, TaskResult, TaskStatus, AgentType, AgentEvent } from '../types';
import { AgentRegistry } from './agent-registry';
import { createScopedLogger } from '~/utils/logger';
import { TTLMap } from '~/lib/utils/ttl-map';

const logger = createScopedLogger('TaskQueue');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Configuration de la queue
 */
export interface TaskQueueConfig {
  /** Nombre maximum de tâches parallèles */
  maxParallel: number;

  /** Délai avant retry (ms) */
  retryDelay: number;

  /** Nombre maximum de retries */
  maxRetries: number;

  /** Callback pour les événements */
  onEvent?: (event: AgentEvent) => void;

  /** TTL for completed tasks in milliseconds (default: 1 hour) */
  completedTTLMs?: number;

  /** TTL for failed tasks in milliseconds (default: 2 hours) */
  failedTTLMs?: number;

  /** Cleanup interval for expired entries (default: 5 minutes) */
  cleanupIntervalMs?: number;

  /** Maximum number of completed tasks to keep (default: 10000) */
  maxCompletedSize?: number;

  /** Maximum number of failed tasks to keep (default: 1000) */
  maxFailedSize?: number;
}

/**
 * Élément de la queue
 */
interface QueueItem {
  task: Task;
  resolve: (result: TaskResult) => void;
  reject: (error: Error) => void;
  retryCount: number;
}

/**
 * Statistiques de la queue
 */
export interface QueueStats {
  pending: number;
  running: number;
  completed: number;
  failed: number;
  totalProcessed: number;
}

/*
 * ============================================================================
 * TASK QUEUE
 * ============================================================================
 */

/**
 * File d'attente des tâches avec exécution parallèle
 */
export class TaskQueue {
  private config: TaskQueueConfig;
  private registry: AgentRegistry;
  private apiKey: string;

  private queue: QueueItem[] = [];
  private running: Map<string, QueueItem> = new Map();
  private completed: TTLMap<string, TaskResult>;
  private failed: TTLMap<string, { task: Task; error: string }>;

  private isProcessing = false;
  private isPaused = false;

  /**
   * EventEmitter interne pour les événements de tâches
   * Permet d'attendre la fin d'une tâche sans polling
   */
  private taskEvents = new EventEmitter();

  constructor(registry: AgentRegistry, apiKey: string, config?: Partial<TaskQueueConfig>) {
    this.registry = registry;
    this.apiKey = apiKey;

    const completedTTLMs = config?.completedTTLMs ?? 60 * 60 * 1000; // 1 hour
    const failedTTLMs = config?.failedTTLMs ?? 2 * 60 * 60 * 1000; // 2 hours
    const cleanupIntervalMs = config?.cleanupIntervalMs ?? 5 * 60 * 1000; // 5 minutes

    this.config = {
      maxParallel: config?.maxParallel ?? 3,
      retryDelay: config?.retryDelay ?? 1000,
      maxRetries: config?.maxRetries ?? 2,
      onEvent: config?.onEvent,
      completedTTLMs,
      failedTTLMs,
      cleanupIntervalMs,
      maxCompletedSize: config?.maxCompletedSize ?? 10000,
      maxFailedSize: config?.maxFailedSize ?? 1000,
    };

    // Initialize TTLMaps for completed and failed tasks
    this.completed = new TTLMap<string, TaskResult>({
      ttlMs: completedTTLMs,
      maxSize: this.config.maxCompletedSize,
      cleanupIntervalMs,
      touchOnGet: true, // Extend TTL when result is accessed
      name: 'TaskQueue.completed',
      onExpire: (taskId) => {
        logger.debug('Completed task expired', { taskId });
      },
    });

    this.failed = new TTLMap<string, { task: Task; error: string }>({
      ttlMs: failedTTLMs,
      maxSize: this.config.maxFailedSize,
      cleanupIntervalMs,
      touchOnGet: false, // Don't extend TTL for failed tasks
      name: 'TaskQueue.failed',
      onExpire: (taskId) => {
        logger.debug('Failed task expired', { taskId });
      },
    });
  }

  /*
   * ==========================================================================
   * PUBLIC API
   * ==========================================================================
   */

  /**
   * Ajouter une tâche à la queue
   */
  async enqueue(task: Task): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      const item: QueueItem = {
        task: { ...task, status: 'queued' },
        resolve,
        reject,
        retryCount: 0,
      };

      this.queue.push(item);
      this.emitEvent('task:created', task.id, { task });
      this.log('info', `Task enqueued: ${task.id}`, { taskType: task.type });

      // Démarrer le traitement si pas déjà en cours
      this.processQueue();
    });
  }

  /**
   * Ajouter plusieurs tâches avec gestion des dépendances
   */
  async enqueueBatch(tasks: Task[]): Promise<Map<string, TaskResult>> {
    const results = new Map<string, TaskResult>();

    // Trier les tâches par dépendances
    const sortedTasks = this.topologicalSort(tasks);

    // Regrouper les tâches par niveau de dépendance
    const levels = this.groupByDependencyLevel(sortedTasks);

    for (const level of levels) {
      // Exécuter les tâches d'un même niveau en parallèle
      const levelPromises = level.map(async (task) => {
        // Attendre que les dépendances soient terminées
        if (task.dependencies) {
          for (const depId of task.dependencies) {
            if (!this.completed.has(depId)) {
              // Attendre que la dépendance soit dans completed
              await this.waitForTask(depId);
            }
          }
        }

        const result = await this.enqueue(task);
        results.set(task.id, result);

        return result;
      });

      await Promise.all(levelPromises);
    }

    return results;
  }

  /**
   * Pause le traitement de la queue
   */
  pause(): void {
    this.isPaused = true;
    this.log('info', 'Queue paused');
  }

  /**
   * Reprend le traitement
   */
  resume(): void {
    this.isPaused = false;
    this.log('info', 'Queue resumed');
    this.processQueue();
  }

  /**
   * Annuler une tâche en attente
   */
  cancel(taskId: string): boolean {
    const index = this.queue.findIndex((item) => item.task.id === taskId);

    if (index !== -1) {
      const item = this.queue.splice(index, 1)[0];
      item.task.status = 'cancelled';
      item.reject(new Error('Task cancelled'));
      this.log('info', `Task cancelled: ${taskId}`);

      return true;
    }

    return false;
  }

  /**
   * Vider la queue
   */
  clear(): void {
    for (const item of this.queue) {
      item.task.status = 'cancelled';
      item.reject(new Error('Queue cleared'));
    }

    this.queue = [];
    this.log('info', 'Queue cleared');
  }

  /**
   * Obtenir les statistiques
   */
  getStats(): QueueStats {
    return {
      pending: this.queue.length,
      running: this.running.size,
      completed: this.completed.size,
      failed: this.failed.size,
      totalProcessed: this.completed.size + this.failed.size,
    };
  }

  /**
   * Obtenir le résultat d'une tâche terminée
   */
  getResult(taskId: string): TaskResult | undefined {
    return this.completed.get(taskId);
  }

  /**
   * Obtenir toutes les tâches en attente
   */
  getPendingTasks(): Task[] {
    return this.queue.map((item) => item.task);
  }

  /**
   * Obtenir les tâches en cours d'exécution
   */
  getRunningTasks(): Task[] {
    return Array.from(this.running.values()).map((item) => item.task);
  }

  /**
   * Get detailed TTL map statistics
   */
  getTTLStats() {
    return {
      completed: this.completed.getStats(),
      failed: this.failed.getStats(),
    };
  }

  /**
   * Dispose resources and stop cleanup timers
   */
  dispose(): void {
    this.log('info', 'Disposing TaskQueue');
    this.clear();
    this.completed.dispose();
    this.failed.dispose();
    // Nettoyer tous les listeners de l'EventEmitter
    this.taskEvents.removeAllListeners();
  }

  /**
   * S'abonner aux événements de tâches
   *
   * Événements disponibles:
   * - `task:completed` - Émis quand une tâche est terminée ({ taskId, result })
   * - `task:failed` - Émis quand une tâche échoue ({ taskId, result })
   * - `task:${taskId}:completed` - Émis quand une tâche spécifique est terminée
   * - `task:${taskId}:failed` - Émis quand une tâche spécifique échoue
   *
   * @param event - Nom de l'événement
   * @param listener - Callback à appeler
   * @returns Fonction pour se désabonner
   */
  onTaskEvent(
    event: string,
    listener: (data: TaskResult | { taskId: string; result: TaskResult }) => void,
  ): () => void {
    this.taskEvents.on(event, listener);
    return () => {
      this.taskEvents.off(event, listener);
    };
  }

  /**
   * S'abonner à un événement une seule fois
   */
  onceTaskEvent(
    event: string,
    listener: (data: TaskResult | { taskId: string; result: TaskResult }) => void,
  ): () => void {
    this.taskEvents.once(event, listener);
    return () => {
      this.taskEvents.off(event, listener);
    };
  }

  /*
   * ==========================================================================
   * PROCESSING
   * ==========================================================================
   */

  /**
   * Traiter la queue
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.isPaused) {
      return;
    }

    this.isProcessing = true;

    // Protection contre les boucles infinies
    let consecutiveSkips = 0;
    const maxConsecutiveSkips = this.queue.length + 1;

    try {
      while (this.queue.length > 0 && this.running.size < this.config.maxParallel && !this.isPaused) {
        // Protection: si on a trop de skips consécutifs, on attend un peu
        if (consecutiveSkips >= maxConsecutiveSkips) {
          this.log('warn', 'All pending tasks have unmet dependencies, waiting...', {
            pending: this.queue.length,
            running: this.running.size,
          });

          // Attendre que des tâches en cours se terminent
          if (this.running.size > 0) {
            await new Promise((resolve) => setTimeout(resolve, 100));
            consecutiveSkips = 0;
          } else {
            // Aucune tâche en cours et toutes les tâches ont des dépendances non satisfaites
            // Cela peut indiquer des dépendances circulaires ou des dépendances manquantes
            this.log('error', 'Potential deadlock: no running tasks and all pending tasks have unmet dependencies');
            break;
          }
        }

        const item = this.queue.shift();

        if (!item) {
          break;
        }

        // Vérifier les dépendances
        if (item.task.dependencies) {
          // Check for failed dependencies first to prevent deadlock
          const failedDeps = item.task.dependencies.filter((depId) => this.failed.has(depId));
          if (failedDeps.length > 0) {
            // Dependency failed - reject this task immediately
            const failedDepNames = failedDeps.join(', ');
            item.task.status = 'failed';
            const result: TaskResult = {
              success: false,
              output: `Dependency task(s) failed: ${failedDepNames}`,
              errors: [
                {
                  code: 'DEPENDENCY_FAILED',
                  message: `Cannot execute task because dependency failed: ${failedDepNames}`,
                  recoverable: false,
                },
              ],
            };
            this.failed.set(item.task.id, { task: item.task, error: result.output });
            // Émettre les événements (externe et interne)
            this.emitEvent('task:failed', item.task.id, { task: item.task, error: result.output });
            this.emitTaskEvent(item.task.id, 'failed', result);
            this.log('error', `Task ${item.task.id} failed due to dependency failure`, { failedDeps });
            item.resolve(result);
            continue;
          }

          const unmetDeps = item.task.dependencies.filter((depId) => !this.completed.has(depId));

          if (unmetDeps.length > 0) {
            // Remettre dans la queue
            this.queue.push(item);
            consecutiveSkips++;
            continue;
          }
        }

        // Reset skip counter since we're processing a task
        consecutiveSkips = 0;

        // Démarrer l'exécution
        this.running.set(item.task.id, item);
        this.executeTask(item);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Exécuter une tâche
   */
  private async executeTask(item: QueueItem): Promise<void> {
    const { task } = item;
    task.status = 'in_progress';
    task.startedAt = new Date();

    this.emitEvent('task:started', task.id, { task });
    this.log('info', `Task started: ${task.id}`, { agent: task.assignedAgent });

    try {
      // Trouver l'agent approprié
      const agent = this.findAgentForTask(task);

      if (!agent) {
        throw new Error(`No agent available for task type: ${task.type}`);
      }

      // Exécuter la tâche
      const result = await agent.run(task, this.apiKey);

      // Succès
      task.status = 'completed';
      task.completedAt = new Date();
      task.result = result;

      this.completed.set(task.id, result);
      this.running.delete(task.id);

      // Émettre les événements (externe et interne)
      this.emitEvent('task:completed', task.id, { task, result });
      this.emitTaskEvent(task.id, 'completed', result);
      this.log('info', `Task completed: ${task.id}`, { success: result.success });

      item.resolve(result);
    } catch (error) {
      // Gestion des erreurs avec retry
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (item.retryCount < this.config.maxRetries) {
        // Retry
        item.retryCount++;
        this.running.delete(task.id);
        this.log('warn', `Task retry ${item.retryCount}/${this.config.maxRetries}: ${task.id}`, {
          error: errorMessage,
        });

        // Attendre avant de réessayer
        await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay));
        this.queue.unshift(item);
      } else {
        // Échec définitif
        task.status = 'failed';
        task.completedAt = new Date();

        const result: TaskResult = {
          success: false,
          output: errorMessage,
          errors: [
            {
              code: 'TASK_EXECUTION_FAILED',
              message: errorMessage,
              recoverable: false,
            },
          ],
        };

        task.result = result;

        this.failed.set(task.id, { task, error: errorMessage });
        this.running.delete(task.id);

        // Émettre les événements (externe et interne)
        this.emitEvent('task:failed', task.id, { task, error: errorMessage });
        this.emitTaskEvent(task.id, 'failed', result);
        this.log('error', `Task failed: ${task.id}`, { error: errorMessage });

        item.resolve(result);
      }
    }

    // Continuer le traitement
    this.processQueue();
  }

  /**
   * Émettre un événement interne pour une tâche
   * Utilisé par waitForTask() pour éviter le polling
   */
  private emitTaskEvent(taskId: string, status: 'completed' | 'failed', result: TaskResult): void {
    this.taskEvents.emit(`task:${taskId}:${status}`, result);
    this.taskEvents.emit(`task:${status}`, { taskId, result });
  }

  /**
   * Trouver l'agent approprié pour une tâche
   */
  private findAgentForTask(task: Task): ReturnType<AgentRegistry['get']> | undefined {
    // Si un agent est assigné, l'utiliser
    if (task.assignedAgent) {
      return this.registry.get(task.assignedAgent);
    }

    // Sinon, chercher par type de tâche
    const agentType = task.type as AgentType;
    const agent = this.registry.get(agentType);

    if (agent && agent.isAvailable()) {
      return agent;
    }

    // Chercher un agent disponible par capacité
    const available = this.registry.getAvailable();

    for (const a of available) {
      if (a.getName() === task.type || task.type === 'user_request') {
        return a;
      }
    }

    return undefined;
  }

  /*
   * ==========================================================================
   * HELPERS
   * ==========================================================================
   */

  /**
   * Attendre qu'une tâche soit terminée (basé sur EventEmitter, pas de polling)
   *
   * Cette méthode utilise un système d'événements pour attendre la fin d'une tâche,
   * ce qui est plus efficace que le polling à intervalle fixe.
   *
   * @param taskId - ID de la tâche à attendre
   * @param timeout - Timeout en ms (défaut: 5 minutes)
   * @returns Le résultat de la tâche
   * @throws Error si la tâche échoue ou si le timeout est atteint
   */
  private async waitForTask(taskId: string, timeout = 300000): Promise<TaskResult> {
    // Vérifier si la tâche est déjà terminée
    if (this.completed.has(taskId)) {
      return this.completed.get(taskId)!;
    }

    // Vérifier si la tâche a déjà échoué
    if (this.failed.has(taskId)) {
      const failedInfo = this.failed.get(taskId);
      throw new Error(`Dependency task failed: ${taskId}${failedInfo ? ` - ${failedInfo.error}` : ''}`);
    }

    // Vérifier si la tâche existe (en attente ou en cours)
    const taskExists = this.queue.some((item) => item.task.id === taskId) || this.running.has(taskId);

    if (!taskExists) {
      throw new Error(`Task not found: ${taskId}`);
    }

    // Attendre avec événements (pas de polling)
    return new Promise<TaskResult>((resolve, reject) => {
      // Timeout handler
      const timeoutId = setTimeout(() => {
        cleanup();
        reject(new Error(`Timeout waiting for task: ${taskId} (${timeout}ms)`));
      }, timeout);

      // Handler de succès
      const onCompleted = (result: TaskResult) => {
        cleanup();
        resolve(result);
      };

      // Handler d'échec
      const onFailed = (result: TaskResult) => {
        cleanup();
        reject(new Error(`Dependency task failed: ${taskId} - ${result.output}`));
      };

      // Fonction de nettoyage pour éviter les fuites de mémoire
      const cleanup = () => {
        clearTimeout(timeoutId);
        this.taskEvents.off(`task:${taskId}:completed`, onCompleted);
        this.taskEvents.off(`task:${taskId}:failed`, onFailed);
      };

      // S'abonner aux événements (once = auto-remove après premier appel)
      this.taskEvents.once(`task:${taskId}:completed`, onCompleted);
      this.taskEvents.once(`task:${taskId}:failed`, onFailed);

      // Double-vérification après l'abonnement (race condition protection)
      // La tâche pourrait s'être terminée entre la vérification initiale et l'abonnement
      if (this.completed.has(taskId)) {
        cleanup();
        resolve(this.completed.get(taskId)!);
        return;
      }

      if (this.failed.has(taskId)) {
        cleanup();
        const failedInfo = this.failed.get(taskId);
        reject(new Error(`Dependency task failed: ${taskId}${failedInfo ? ` - ${failedInfo.error}` : ''}`));
        return;
      }
    });
  }

  /**
   * Tri topologique des tâches par dépendances
   */
  private topologicalSort(tasks: Task[]): Task[] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]));
    const visited = new Set<string>();
    const result: Task[] = [];

    const visit = (task: Task) => {
      if (visited.has(task.id)) {
        return;
      }

      visited.add(task.id);

      if (task.dependencies) {
        for (const depId of task.dependencies) {
          const dep = taskMap.get(depId);

          if (dep) {
            visit(dep);
          }
        }
      }

      result.push(task);
    };

    for (const task of tasks) {
      visit(task);
    }

    return result;
  }

  /**
   * Grouper les tâches par niveau de dépendance
   */
  private groupByDependencyLevel(sortedTasks: Task[]): Task[][] {
    const levels: Task[][] = [];
    const taskLevels = new Map<string, number>();

    for (const task of sortedTasks) {
      let level = 0;

      if (task.dependencies) {
        for (const depId of task.dependencies) {
          const depLevel = taskLevels.get(depId) ?? -1;
          level = Math.max(level, depLevel + 1);
        }
      }

      taskLevels.set(task.id, level);

      if (!levels[level]) {
        levels[level] = [];
      }

      levels[level].push(task);
    }

    return levels;
  }

  /**
   * Émettre un événement
   */
  private emitEvent(type: AgentEvent['type'], taskId: string, data: Record<string, unknown>): void {
    if (this.config.onEvent) {
      this.config.onEvent({
        type,
        timestamp: new Date(),
        taskId,
        data,
      });
    }
  }

  /**
   * Logger
   */
  private log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void {
    switch (level) {
      case 'info':
        logger.info(message, data);
        break;
      case 'warn':
        logger.warn(message, data);
        break;
      case 'error':
        logger.error(message, data);
        break;
    }
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer une instance de TaskQueue
 */
export function createTaskQueue(registry: AgentRegistry, apiKey: string, config?: Partial<TaskQueueConfig>): TaskQueue {
  return new TaskQueue(registry, apiKey, config);
}
