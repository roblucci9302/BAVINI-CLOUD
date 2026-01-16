/**
 * Priority Task Queue - File d'attente des tâches avec priorités
 *
 * Étend le système de queue de tâches avec support des priorités,
 * permettant un traitement intelligent basé sur l'importance des tâches.
 *
 * @module agents/queue/priority-task-queue
 */

import type { Task, TaskResult, AgentType, AgentEvent } from '../types';
import { AgentRegistry } from '../core/agent-registry';
import { PriorityQueue, TaskPriority, type PriorityItem, type PriorityQueueStats } from './priority-queue';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PriorityTaskQueue');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Configuration de la queue avec priorités
 */
export interface PriorityTaskQueueConfig {
  /** Nombre maximum de tâches parallèles */
  maxParallel: number;

  /** Délai avant retry (ms) */
  retryDelay: number;

  /** Nombre maximum de retries */
  maxRetries: number;

  /** Activer l'aging (promotion automatique) */
  enableAging: boolean;

  /** Temps avant promotion d'un niveau (ms) */
  agingThresholdMs: number;

  /** Réserver des slots pour les tâches critiques */
  reservedCriticalSlots: number;

  /** Callback pour les événements */
  onEvent?: (event: AgentEvent) => void;
}

/**
 * Élément de la queue
 */
interface QueueItem {
  task: Task;
  resolve: (result: TaskResult) => void;
  reject: (error: Error) => void;
  retryCount: number;
  priority: TaskPriority;
}

/**
 * Statistiques étendues de la queue
 */
export interface PriorityTaskQueueStats {
  /** Tâches en attente */
  pending: number;

  /** Tâches en cours */
  running: number;

  /** Tâches terminées */
  completed: number;

  /** Tâches échouées */
  failed: number;

  /** Total traité */
  totalProcessed: number;

  /** Stats par priorité */
  priorityStats: PriorityQueueStats;

  /** Slots réservés utilisés */
  reservedSlotsUsed: number;
}

/*
 * ============================================================================
 * PRIORITY TASK QUEUE
 * ============================================================================
 */

/**
 * File d'attente des tâches avec support des priorités
 *
 * Les tâches CRITICAL sont traitées en priorité, avec des slots réservés.
 * L'aging permet de promouvoir les tâches qui attendent trop longtemps.
 */
export class PriorityTaskQueue {
  private config: PriorityTaskQueueConfig;
  private registry: AgentRegistry;
  private apiKey: string;

  private priorityQueue: PriorityQueue<QueueItem>;
  private running: Map<string, QueueItem> = new Map();
  private completed: Map<string, TaskResult> = new Map();
  private failed: Map<string, { task: Task; error: string }> = new Map();

  private isProcessing = false;
  private isPaused = false;
  private criticalSlotsUsed = 0;

  constructor(registry: AgentRegistry, apiKey: string, config?: Partial<PriorityTaskQueueConfig>) {
    this.registry = registry;
    this.apiKey = apiKey;
    this.config = {
      maxParallel: config?.maxParallel ?? 3,
      retryDelay: config?.retryDelay ?? 1000,
      maxRetries: config?.maxRetries ?? 2,
      enableAging: config?.enableAging ?? true,
      agingThresholdMs: config?.agingThresholdMs ?? 60000,
      reservedCriticalSlots: config?.reservedCriticalSlots ?? 1,
      onEvent: config?.onEvent,
    };

    this.priorityQueue = new PriorityQueue<QueueItem>({
      enableAging: this.config.enableAging,
      agingThresholdMs: this.config.agingThresholdMs,
    });
  }

  /*
   * ==========================================================================
   * PUBLIC API
   * ==========================================================================
   */

  /**
   * Ajouter une tâche à la queue avec priorité
   */
  async enqueue(task: Task, priority: TaskPriority = TaskPriority.NORMAL): Promise<TaskResult> {
    return new Promise((resolve, reject) => {
      const item: QueueItem = {
        task: { ...task, status: 'queued', priority },
        resolve,
        reject,
        retryCount: 0,
        priority,
      };

      this.priorityQueue.enqueue(task.id, item, priority);
      this.emitEvent('task:created', task.id, { task, priority: TaskPriority[priority] });
      logger.info(`Task enqueued: ${task.id}`, { taskType: task.type, priority: TaskPriority[priority] });

      // Démarrer le traitement
      this.processQueue();
    });
  }

  /**
   * Ajouter une tâche critique (priorité maximale)
   */
  async enqueueCritical(task: Task): Promise<TaskResult> {
    return this.enqueue(task, TaskPriority.CRITICAL);
  }

  /**
   * Ajouter une tâche haute priorité
   */
  async enqueueHigh(task: Task): Promise<TaskResult> {
    return this.enqueue(task, TaskPriority.HIGH);
  }

  /**
   * Ajouter une tâche en arrière-plan
   */
  async enqueueBackground(task: Task): Promise<TaskResult> {
    return this.enqueue(task, TaskPriority.BACKGROUND);
  }

  /**
   * Ajouter plusieurs tâches avec gestion des dépendances
   */
  async enqueueBatch(tasks: Array<{ task: Task; priority?: TaskPriority }>): Promise<Map<string, TaskResult>> {
    const results = new Map<string, TaskResult>();

    // Trier par dépendances
    const sortedTasks = this.topologicalSort(tasks.map((t) => t.task));

    // Regrouper par niveau de dépendance
    const levels = this.groupByDependencyLevel(sortedTasks);

    for (const level of levels) {
      const levelPromises = level.map(async (task) => {
        // Attendre les dépendances
        if (task.dependencies) {
          for (const depId of task.dependencies) {
            if (!this.completed.has(depId)) {
              await this.waitForTask(depId);
            }
          }
        }

        // Trouver la priorité configurée
        const config = tasks.find((t) => t.task.id === task.id);
        const priority = config?.priority ?? TaskPriority.NORMAL;

        const result = await this.enqueue(task, priority);
        results.set(task.id, result);
        return result;
      });

      await Promise.all(levelPromises);
    }

    return results;
  }

  /**
   * Mettre à jour la priorité d'une tâche en attente
   */
  updatePriority(taskId: string, newPriority: TaskPriority): boolean {
    const item = this.priorityQueue.get(taskId);

    if (!item) {
      return false;
    }

    item.value.priority = newPriority;
    item.value.task.priority = newPriority;

    return this.priorityQueue.updatePriority(taskId, newPriority);
  }

  /**
   * Promouvoir une tâche d'un niveau de priorité
   */
  promotePriority(taskId: string): boolean {
    const item = this.priorityQueue.get(taskId);

    if (!item) {
      return false;
    }

    if (this.priorityQueue.promote(taskId)) {
      const newPriority = item.value.priority - 1;
      item.value.priority = newPriority;
      item.value.task.priority = newPriority;
      return true;
    }

    return false;
  }

  /**
   * Pause le traitement
   */
  pause(): void {
    this.isPaused = true;
    logger.info('Queue paused');
  }

  /**
   * Reprendre le traitement
   */
  resume(): void {
    this.isPaused = false;
    logger.info('Queue resumed');
    this.processQueue();
  }

  /**
   * Annuler une tâche en attente
   */
  cancel(taskId: string): boolean {
    const item = this.priorityQueue.remove(taskId);

    if (item) {
      item.value.task.status = 'cancelled';
      item.value.reject(new Error('Task cancelled'));
      logger.info(`Task cancelled: ${taskId}`);
      return true;
    }

    return false;
  }

  /**
   * Vider la queue
   */
  clear(): void {
    const items = this.priorityQueue.getAll();

    for (const item of items) {
      item.value.task.status = 'cancelled';
      item.value.reject(new Error('Queue cleared'));
    }

    this.priorityQueue.clear();
    logger.info('Queue cleared');
  }

  /**
   * Obtenir les statistiques
   */
  getStats(): PriorityTaskQueueStats {
    return {
      pending: this.priorityQueue.size(),
      running: this.running.size,
      completed: this.completed.size,
      failed: this.failed.size,
      totalProcessed: this.completed.size + this.failed.size,
      priorityStats: this.priorityQueue.getStats(),
      reservedSlotsUsed: this.criticalSlotsUsed,
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
    return this.priorityQueue.getAll().map((item) => item.value.task);
  }

  /**
   * Obtenir les tâches en attente par priorité
   */
  getPendingTasksByPriority(priority: TaskPriority): Task[] {
    return this.priorityQueue.getByPriority(priority).map((item) => item.value.task);
  }

  /**
   * Obtenir les tâches en cours d'exécution
   */
  getRunningTasks(): Task[] {
    return Array.from(this.running.values()).map((item) => item.task);
  }

  /**
   * Détruire la queue proprement
   */
  destroy(): void {
    this.clear();
    this.priorityQueue.destroy();
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

    try {
      while (!this.priorityQueue.isEmpty() && !this.isPaused) {
        // Calculer les slots disponibles
        const availableSlots = this.getAvailableSlots();

        if (availableSlots <= 0) {
          break;
        }

        // Regarder la prochaine tâche sans l'extraire
        const nextItem = this.priorityQueue.peek();

        if (!nextItem) {
          break;
        }

        // Vérifier si on peut exécuter cette priorité
        if (!this.canExecutePriority(nextItem.value.priority)) {
          break;
        }

        // Extraire et exécuter
        const item = this.priorityQueue.dequeue();

        if (!item) {
          break;
        }

        // Vérifier les dépendances
        if (item.value.task.dependencies) {
          const unmetDeps = item.value.task.dependencies.filter((depId) => !this.completed.has(depId));

          if (unmetDeps.length > 0) {
            // Remettre dans la queue
            this.priorityQueue.enqueue(item.id, item.value, item.priority);
            continue;
          }
        }

        // Démarrer l'exécution
        this.running.set(item.value.task.id, item.value);

        if (item.value.priority === TaskPriority.CRITICAL) {
          this.criticalSlotsUsed++;
        }

        this.executeTask(item.value);
      }
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Calculer les slots disponibles
   */
  private getAvailableSlots(): number {
    const totalRunning = this.running.size;
    const maxSlots = this.config.maxParallel;

    // Réserver des slots pour les tâches critiques
    const nonCriticalRunning = totalRunning - this.criticalSlotsUsed;
    const slotsForNonCritical = maxSlots - this.config.reservedCriticalSlots;

    const nextItem = this.priorityQueue.peek();

    if (nextItem?.value.priority === TaskPriority.CRITICAL) {
      // Les tâches critiques peuvent utiliser n'importe quel slot
      return maxSlots - totalRunning;
    }

    // Les autres tâches ne peuvent pas utiliser les slots réservés
    return slotsForNonCritical - nonCriticalRunning;
  }

  /**
   * Vérifier si on peut exécuter une tâche de cette priorité
   */
  private canExecutePriority(priority: TaskPriority): boolean {
    const availableSlots = this.getAvailableSlots();

    if (availableSlots <= 0) {
      return false;
    }

    // Les tâches critiques peuvent toujours s'exécuter s'il y a un slot
    if (priority === TaskPriority.CRITICAL) {
      return true;
    }

    // Vérifier s'il y a des tâches critiques en attente
    const criticalPending = this.priorityQueue.getByPriority(TaskPriority.CRITICAL);

    if (criticalPending.length > 0 && this.criticalSlotsUsed >= this.config.reservedCriticalSlots) {
      // Il y a des tâches critiques en attente, attendre
      return false;
    }

    return true;
  }

  /**
   * Exécuter une tâche
   */
  private async executeTask(item: QueueItem): Promise<void> {
    const { task } = item;
    task.status = 'in_progress';
    task.startedAt = new Date();

    this.emitEvent('task:started', task.id, { task, priority: TaskPriority[item.priority] });
    logger.info(`Task started: ${task.id}`, {
      agent: task.assignedAgent,
      priority: TaskPriority[item.priority],
    });

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
      this.cleanupRunning(task.id, item.priority);

      this.emitEvent('task:completed', task.id, { task, result, priority: TaskPriority[item.priority] });
      logger.info(`Task completed: ${task.id}`, { success: result.success });

      item.resolve(result);
    } catch (error) {
      // Gestion des erreurs avec retry
      const errorMessage = error instanceof Error ? error.message : String(error);

      if (item.retryCount < this.config.maxRetries) {
        // Retry
        item.retryCount++;
        this.cleanupRunning(task.id, item.priority);
        logger.warn(`Task retry ${item.retryCount}/${this.config.maxRetries}: ${task.id}`, {
          error: errorMessage,
        });

        // Attendre avant de réessayer
        await new Promise((resolve) => setTimeout(resolve, this.config.retryDelay));

        // Remettre dans la queue avec la même priorité
        this.priorityQueue.enqueue(task.id, item, item.priority);
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
        this.cleanupRunning(task.id, item.priority);

        this.emitEvent('task:failed', task.id, { task, error: errorMessage });
        logger.error(`Task failed: ${task.id}`, { error: errorMessage });

        item.resolve(result);
      }
    }

    // Continuer le traitement
    this.processQueue();
  }

  /**
   * Nettoyer une tâche de running
   */
  private cleanupRunning(taskId: string, priority: TaskPriority): void {
    this.running.delete(taskId);

    if (priority === TaskPriority.CRITICAL) {
      this.criticalSlotsUsed = Math.max(0, this.criticalSlotsUsed - 1);
    }
  }

  /**
   * Trouver l'agent approprié pour une tâche
   */
  private findAgentForTask(task: Task): ReturnType<AgentRegistry['get']> | undefined {
    if (task.assignedAgent) {
      return this.registry.get(task.assignedAgent);
    }

    const agentType = task.type as AgentType;
    const agent = this.registry.get(agentType);

    if (agent && agent.isAvailable()) {
      return agent;
    }

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

  private async waitForTask(taskId: string, timeout = 300000): Promise<TaskResult> {
    const startTime = Date.now();

    while (Date.now() - startTime < timeout) {
      if (this.completed.has(taskId)) {
        return this.completed.get(taskId)!;
      }

      if (this.failed.has(taskId)) {
        throw new Error(`Dependency task failed: ${taskId}`);
      }

      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    throw new Error(`Timeout waiting for task: ${taskId}`);
  }

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
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer une PriorityTaskQueue
 */
export function createPriorityTaskQueue(
  registry: AgentRegistry,
  apiKey: string,
  config?: Partial<PriorityTaskQueueConfig>,
): PriorityTaskQueue {
  return new PriorityTaskQueue(registry, apiKey, config);
}
