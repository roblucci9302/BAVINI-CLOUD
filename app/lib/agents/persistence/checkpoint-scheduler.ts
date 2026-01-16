/**
 * Checkpoint Scheduler - Planification des checkpoints pour tâches longues
 *
 * Permet de planifier des checkpoints automatiques basés sur:
 * - Intervalle de temps (toutes les N secondes)
 * - Progression de la tâche (tous les N%)
 * - Utilisation de tokens (tous les N tokens)
 * - Événements spécifiques (délégation, completion de sous-tâche)
 *
 * @module agents/persistence/checkpoint-scheduler
 */

import type { Task, TaskResult, AgentMessage, TaskMetrics } from '../types';
import type { CheckpointState, CheckpointStorage, SaveOptions } from '../utils/checkpoint-manager';
import { CheckpointManager, createCheckpointManager } from '../utils/checkpoint-manager';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CheckpointScheduler');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Type de déclencheur de checkpoint
 */
export type CheckpointTrigger =
  | 'interval' // Basé sur le temps
  | 'progress' // Basé sur le pourcentage de progression
  | 'tokens' // Basé sur l'utilisation de tokens
  | 'subtask' // Après chaque sous-tâche
  | 'delegation' // Avant/après délégation
  | 'manual' // Déclenché manuellement
  | 'error'; // Suite à une erreur

/**
 * Configuration d'un schedule de checkpoint
 */
export interface CheckpointSchedule {
  /** ID unique du schedule */
  id: string;

  /** ID de la tâche */
  taskId: string;

  /** Type de déclencheur */
  trigger: CheckpointTrigger;

  /** Configuration spécifique au déclencheur */
  config: {
    /** Pour 'interval': intervalle en ms (défaut: 30000) */
    intervalMs?: number;

    /** Pour 'progress': seuil de progression (0-1, défaut: 0.1 = 10%) */
    progressThreshold?: number;

    /** Pour 'tokens': seuil de tokens (défaut: 10000) */
    tokenThreshold?: number;
  };

  /** Actif ou non */
  active: boolean;

  /** Timestamp du dernier checkpoint */
  lastCheckpointAt?: Date;

  /** Progression au dernier checkpoint */
  lastProgressCheckpoint?: number;

  /** Tokens au dernier checkpoint */
  lastTokenCheckpoint?: number;
}

/**
 * État d'une tâche pour le scheduling
 */
export interface TaskCheckpointState {
  /** Tâche */
  task: Task;

  /** Agent assigné */
  agentName: string;

  /** Historique des messages */
  messageHistory: AgentMessage[];

  /** Résultats partiels */
  partialResults?: Partial<TaskResult>;

  /** Métriques actuelles */
  metrics?: TaskMetrics;

  /** Progression actuelle (0-1) */
  progress?: number;

  /** Étape courante */
  currentStep?: number;

  /** Total des étapes */
  totalSteps?: number;
}

/**
 * Callback pour obtenir l'état actuel d'une tâche
 */
export type GetTaskStateCallback = (taskId: string) => TaskCheckpointState | null;

/**
 * Configuration du scheduler
 */
export interface CheckpointSchedulerConfig {
  /** Intervalle par défaut (ms) */
  defaultIntervalMs: number;

  /** Seuil de progression par défaut */
  defaultProgressThreshold: number;

  /** Seuil de tokens par défaut */
  defaultTokenThreshold: number;

  /** Activer le nettoyage automatique des vieux checkpoints */
  enableAutoCleanup: boolean;

  /** Âge max des checkpoints (ms) */
  checkpointMaxAgeMs: number;

  /** Storage personnalisé (optionnel) */
  storage?: CheckpointStorage;
}

/**
 * Statistiques du scheduler
 */
export interface SchedulerStats {
  /** Nombre de schedules actifs */
  activeSchedules: number;

  /** Total de checkpoints créés */
  totalCheckpoints: number;

  /** Checkpoints par type de déclencheur */
  byTrigger: Record<CheckpointTrigger, number>;

  /** Dernier checkpoint */
  lastCheckpointAt?: Date;
}

/*
 * ============================================================================
 * CHECKPOINT SCHEDULER
 * ============================================================================
 */

/**
 * Scheduler pour la création automatique de checkpoints
 *
 * Gère plusieurs schedules par tâche, permettant différentes stratégies
 * de checkpoint selon le type de tâche.
 */
export class CheckpointScheduler {
  private config: CheckpointSchedulerConfig;
  private checkpointManager: CheckpointManager;
  private schedules: Map<string, CheckpointSchedule> = new Map();
  private timers: Map<string, NodeJS.Timeout> = new Map();
  private getTaskState: GetTaskStateCallback | null = null;
  private stats = {
    totalCheckpoints: 0,
    byTrigger: {} as Record<CheckpointTrigger, number>,
    lastCheckpointAt: undefined as Date | undefined,
  };

  constructor(config?: Partial<CheckpointSchedulerConfig>) {
    this.config = {
      defaultIntervalMs: config?.defaultIntervalMs ?? 30000, // 30 secondes
      defaultProgressThreshold: config?.defaultProgressThreshold ?? 0.1, // 10%
      defaultTokenThreshold: config?.defaultTokenThreshold ?? 10000,
      enableAutoCleanup: config?.enableAutoCleanup ?? true,
      checkpointMaxAgeMs: config?.checkpointMaxAgeMs ?? 24 * 60 * 60 * 1000, // 24h
      storage: config?.storage,
    };

    // Créer le checkpoint manager
    this.checkpointManager = config?.storage
      ? new CheckpointManager(config.storage, { autoSaveInterval: this.config.defaultIntervalMs })
      : createCheckpointManager({ autoSaveInterval: this.config.defaultIntervalMs });

    // Initialiser les compteurs par trigger
    const triggers: CheckpointTrigger[] = [
      'interval',
      'progress',
      'tokens',
      'subtask',
      'delegation',
      'manual',
      'error',
    ];
    for (const trigger of triggers) {
      this.stats.byTrigger[trigger] = 0;
    }
  }

  /*
   * ==========================================================================
   * PUBLIC API
   * ==========================================================================
   */

  /**
   * Définir le callback pour obtenir l'état des tâches
   */
  setTaskStateCallback(callback: GetTaskStateCallback): void {
    this.getTaskState = callback;
  }

  /**
   * Planifier des checkpoints par intervalle de temps
   */
  scheduleByInterval(taskId: string, intervalMs?: number): string {
    const scheduleId = this.generateScheduleId(taskId, 'interval');

    const schedule: CheckpointSchedule = {
      id: scheduleId,
      taskId,
      trigger: 'interval',
      config: {
        intervalMs: intervalMs ?? this.config.defaultIntervalMs,
      },
      active: true,
    };

    this.schedules.set(scheduleId, schedule);
    this.startIntervalTimer(schedule);

    logger.info(`Scheduled interval checkpoint for task ${taskId}`, {
      intervalMs: schedule.config.intervalMs,
    });

    return scheduleId;
  }

  /**
   * Planifier des checkpoints par progression
   */
  scheduleByProgress(taskId: string, progressThreshold?: number): string {
    const scheduleId = this.generateScheduleId(taskId, 'progress');

    const schedule: CheckpointSchedule = {
      id: scheduleId,
      taskId,
      trigger: 'progress',
      config: {
        progressThreshold: progressThreshold ?? this.config.defaultProgressThreshold,
      },
      active: true,
      lastProgressCheckpoint: 0,
    };

    this.schedules.set(scheduleId, schedule);

    logger.info(`Scheduled progress checkpoint for task ${taskId}`, {
      threshold: schedule.config.progressThreshold,
    });

    return scheduleId;
  }

  /**
   * Planifier des checkpoints par utilisation de tokens
   */
  scheduleByTokenUsage(taskId: string, tokenThreshold?: number): string {
    const scheduleId = this.generateScheduleId(taskId, 'tokens');

    const schedule: CheckpointSchedule = {
      id: scheduleId,
      taskId,
      trigger: 'tokens',
      config: {
        tokenThreshold: tokenThreshold ?? this.config.defaultTokenThreshold,
      },
      active: true,
      lastTokenCheckpoint: 0,
    };

    this.schedules.set(scheduleId, schedule);

    logger.info(`Scheduled token checkpoint for task ${taskId}`, {
      threshold: schedule.config.tokenThreshold,
    });

    return scheduleId;
  }

  /**
   * Créer un checkpoint manuel
   */
  async createManualCheckpoint(taskId: string, reason?: string): Promise<CheckpointState | null> {
    return this.createCheckpoint(taskId, 'manual', { reason });
  }

  /**
   * Créer un checkpoint suite à une erreur
   */
  async createErrorCheckpoint(taskId: string, error: Error): Promise<CheckpointState | null> {
    return this.createCheckpoint(taskId, 'error', {
      error: error.message,
      stack: error.stack,
    });
  }

  /**
   * Créer un checkpoint avant/après délégation
   */
  async createDelegationCheckpoint(
    taskId: string,
    delegatedTo: string,
    phase: 'before' | 'after',
  ): Promise<CheckpointState | null> {
    return this.createCheckpoint(taskId, 'delegation', {
      delegatedTo,
      phase,
    });
  }

  /**
   * Créer un checkpoint après une sous-tâche
   */
  async createSubtaskCheckpoint(
    taskId: string,
    subtaskId: string,
    subtaskResult: TaskResult,
  ): Promise<CheckpointState | null> {
    return this.createCheckpoint(taskId, 'subtask', {
      subtaskId,
      subtaskSuccess: subtaskResult.success,
    });
  }

  /**
   * Vérifier et créer des checkpoints basés sur la progression
   */
  async checkProgressCheckpoint(taskId: string, currentProgress: number): Promise<CheckpointState | null> {
    const schedule = this.findSchedule(taskId, 'progress');

    if (!schedule || !schedule.active) {
      return null;
    }

    const threshold = schedule.config.progressThreshold ?? this.config.defaultProgressThreshold;
    const lastProgress = schedule.lastProgressCheckpoint ?? 0;

    if (currentProgress - lastProgress >= threshold) {
      schedule.lastProgressCheckpoint = currentProgress;
      return this.createCheckpoint(taskId, 'progress', {
        progress: currentProgress,
        threshold,
      });
    }

    return null;
  }

  /**
   * Vérifier et créer des checkpoints basés sur les tokens
   */
  async checkTokenCheckpoint(taskId: string, totalTokens: number): Promise<CheckpointState | null> {
    const schedule = this.findSchedule(taskId, 'tokens');

    if (!schedule || !schedule.active) {
      return null;
    }

    const threshold = schedule.config.tokenThreshold ?? this.config.defaultTokenThreshold;
    const lastTokens = schedule.lastTokenCheckpoint ?? 0;

    if (totalTokens - lastTokens >= threshold) {
      schedule.lastTokenCheckpoint = totalTokens;
      return this.createCheckpoint(taskId, 'tokens', {
        totalTokens,
        threshold,
      });
    }

    return null;
  }

  /**
   * Annuler un schedule
   */
  cancel(scheduleId: string): boolean {
    const schedule = this.schedules.get(scheduleId);

    if (!schedule) {
      return false;
    }

    // Arrêter le timer si présent
    this.stopTimer(scheduleId);

    schedule.active = false;
    this.schedules.delete(scheduleId);

    logger.debug(`Schedule cancelled: ${scheduleId}`);
    return true;
  }

  /**
   * Annuler tous les schedules d'une tâche
   */
  cancelAllForTask(taskId: string): number {
    let cancelled = 0;

    for (const [id, schedule] of this.schedules) {
      if (schedule.taskId === taskId) {
        this.cancel(id);
        cancelled++;
      }
    }

    logger.info(`Cancelled ${cancelled} schedules for task ${taskId}`);
    return cancelled;
  }

  /**
   * Lister les schedules actifs
   */
  listSchedules(): CheckpointSchedule[] {
    return Array.from(this.schedules.values());
  }

  /**
   * Lister les schedules pour une tâche
   */
  getSchedulesForTask(taskId: string): CheckpointSchedule[] {
    return this.listSchedules().filter((s) => s.taskId === taskId);
  }

  /**
   * Obtenir le checkpoint manager sous-jacent
   */
  getCheckpointManager(): CheckpointManager {
    return this.checkpointManager;
  }

  /**
   * Obtenir les statistiques
   */
  getStats(): SchedulerStats {
    return {
      activeSchedules: this.schedules.size,
      totalCheckpoints: this.stats.totalCheckpoints,
      byTrigger: { ...this.stats.byTrigger },
      lastCheckpointAt: this.stats.lastCheckpointAt,
    };
  }

  /**
   * Nettoyer les vieux checkpoints
   */
  async cleanup(): Promise<number> {
    if (!this.config.enableAutoCleanup) {
      return 0;
    }

    return this.checkpointManager.cleanup(this.config.checkpointMaxAgeMs);
  }

  /**
   * Détruire le scheduler
   */
  destroy(): void {
    // Arrêter tous les timers
    for (const scheduleId of this.timers.keys()) {
      this.stopTimer(scheduleId);
    }

    this.schedules.clear();
    this.checkpointManager.stopAllAutoSaves();

    logger.info('Checkpoint scheduler destroyed');
  }

  /*
   * ==========================================================================
   * PRIVATE METHODS
   * ==========================================================================
   */

  /**
   * Créer un checkpoint
   */
  private async createCheckpoint(
    taskId: string,
    trigger: CheckpointTrigger,
    metadata?: Record<string, unknown>,
  ): Promise<CheckpointState | null> {
    if (!this.getTaskState) {
      logger.warn('No task state callback set, cannot create checkpoint');
      return null;
    }

    const state = this.getTaskState(taskId);

    if (!state) {
      logger.warn(`Task state not found for ${taskId}`);
      return null;
    }

    const options: SaveOptions = {
      reason: trigger === 'error' ? 'error' : 'auto',
      currentStep: state.currentStep,
      totalSteps: state.totalSteps,
      metadata: {
        ...metadata,
        trigger,
        progress: state.progress,
      },
    };

    try {
      const checkpoint = await this.checkpointManager.saveCheckpoint(
        taskId,
        state.task,
        state.agentName,
        state.messageHistory,
        state.partialResults,
        options,
      );

      // Mettre à jour les stats
      this.stats.totalCheckpoints++;
      this.stats.byTrigger[trigger] = (this.stats.byTrigger[trigger] ?? 0) + 1;
      this.stats.lastCheckpointAt = new Date();

      logger.debug(`Checkpoint created for ${taskId}`, { trigger, checkpointId: checkpoint.id });

      return checkpoint;
    } catch (error) {
      logger.error(`Failed to create checkpoint for ${taskId}:`, error);
      return null;
    }
  }

  /**
   * Démarrer le timer d'intervalle
   */
  private startIntervalTimer(schedule: CheckpointSchedule): void {
    const intervalMs = schedule.config.intervalMs ?? this.config.defaultIntervalMs;

    const timer = setInterval(async () => {
      if (!schedule.active) {
        this.stopTimer(schedule.id);
        return;
      }

      await this.createCheckpoint(schedule.taskId, 'interval');
      schedule.lastCheckpointAt = new Date();
    }, intervalMs);

    this.timers.set(schedule.id, timer);
  }

  /**
   * Arrêter un timer
   */
  private stopTimer(scheduleId: string): void {
    const timer = this.timers.get(scheduleId);

    if (timer) {
      clearInterval(timer);
      this.timers.delete(scheduleId);
    }
  }

  /**
   * Trouver un schedule pour une tâche et un type
   */
  private findSchedule(taskId: string, trigger: CheckpointTrigger): CheckpointSchedule | undefined {
    for (const schedule of this.schedules.values()) {
      if (schedule.taskId === taskId && schedule.trigger === trigger && schedule.active) {
        return schedule;
      }
    }
    return undefined;
  }

  /**
   * Générer un ID de schedule
   */
  private generateScheduleId(taskId: string, trigger: CheckpointTrigger): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 6);
    return `sched-${taskId}-${trigger}-${timestamp}-${random}`;
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer un CheckpointScheduler
 */
export function createCheckpointScheduler(config?: Partial<CheckpointSchedulerConfig>): CheckpointScheduler {
  return new CheckpointScheduler(config);
}

/**
 * Créer un scheduler avec configuration par défaut pour les agents
 */
export function createAgentCheckpointScheduler(): CheckpointScheduler {
  return new CheckpointScheduler({
    defaultIntervalMs: 30000, // 30 secondes
    defaultProgressThreshold: 0.1, // 10%
    defaultTokenThreshold: 10000,
    enableAutoCleanup: true,
    checkpointMaxAgeMs: 24 * 60 * 60 * 1000, // 24h
  });
}
