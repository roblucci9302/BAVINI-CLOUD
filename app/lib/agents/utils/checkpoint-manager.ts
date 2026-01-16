/**
 * Checkpoint Manager - Sauvegarde et reprise des tâches
 * Permet de sauvegarder l'état d'une tâche et de la reprendre plus tard
 */

import type { Task, TaskResult, AgentMessage } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CheckpointManager');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * État d'un checkpoint
 */
export interface CheckpointState {
  /** ID du checkpoint */
  id: string;

  /** ID de la tâche */
  taskId: string;

  /** Tâche sauvegardée */
  task: Task;

  /** Historique des messages */
  messageHistory: AgentMessage[];

  /** Agent assigné */
  agentName: string;

  /** Résultats partiels */
  partialResults?: Partial<TaskResult>;

  /** Étape courante (pour les tâches multi-étapes) */
  currentStep?: number;

  /** Total des étapes */
  totalSteps?: number;

  /** Données supplémentaires */
  metadata?: Record<string, unknown>;

  /** Date de création */
  createdAt: Date;

  /** Date de dernière mise à jour */
  updatedAt: Date;

  /** Raison de la sauvegarde */
  reason: 'pause' | 'error' | 'timeout' | 'user_request' | 'auto';
}

/**
 * Options de sauvegarde
 */
export interface SaveOptions {
  /** Raison de la sauvegarde */
  reason?: CheckpointState['reason'];

  /** Données supplémentaires */
  metadata?: Record<string, unknown>;

  /** Étape courante */
  currentStep?: number;

  /** Total des étapes */
  totalSteps?: number;
}

/**
 * Options de reprise
 */
export interface ResumeOptions {
  /** Reprendre depuis une étape spécifique */
  fromStep?: number;

  /** Ignorer les erreurs précédentes */
  ignoreErrors?: boolean;

  /** Mettre à jour le contexte */
  updatedContext?: Record<string, unknown>;
}

/**
 * Interface de stockage pour les checkpoints
 */
export interface CheckpointStorage {
  /** Sauvegarder un checkpoint */
  save(checkpoint: CheckpointState): Promise<void>;

  /** Charger un checkpoint */
  load(checkpointId: string): Promise<CheckpointState | null>;

  /** Charger par ID de tâche */
  loadByTaskId(taskId: string): Promise<CheckpointState | null>;

  /** Supprimer un checkpoint */
  delete(checkpointId: string): Promise<void>;

  /** Lister tous les checkpoints */
  list(): Promise<CheckpointState[]>;

  /** Nettoyer les vieux checkpoints */
  cleanup(maxAge: number): Promise<number>;
}

/*
 * ============================================================================
 * CHECKPOINT MANAGER
 * ============================================================================
 */

/**
 * Gestionnaire de checkpoints pour la sauvegarde/reprise des tâches
 */
export class CheckpointManager {
  private storage: CheckpointStorage;
  private autoSaveInterval: number;
  private maxCheckpoints: number;
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();

  constructor(
    storage: CheckpointStorage,
    options?: {
      autoSaveInterval?: number;
      maxCheckpoints?: number;
    },
  ) {
    this.storage = storage;
    this.autoSaveInterval = options?.autoSaveInterval ?? 30000; // 30 secondes
    this.maxCheckpoints = options?.maxCheckpoints ?? 100;
  }

  /*
   * ==========================================================================
   * PUBLIC API
   * ==========================================================================
   */

  /**
   * Sauvegarder un checkpoint
   */
  async saveCheckpoint(
    taskId: string,
    task: Task,
    agentName: string,
    messageHistory: AgentMessage[],
    partialResults?: Partial<TaskResult>,
    options?: SaveOptions,
  ): Promise<CheckpointState> {
    const checkpointId = this.generateCheckpointId(taskId);

    const checkpoint: CheckpointState = {
      id: checkpointId,
      taskId,
      task,
      messageHistory: [...messageHistory],
      agentName,
      partialResults,
      currentStep: options?.currentStep,
      totalSteps: options?.totalSteps,
      metadata: options?.metadata,
      createdAt: new Date(),
      updatedAt: new Date(),
      reason: options?.reason ?? 'auto',
    };

    await this.storage.save(checkpoint);

    logger.info(`Checkpoint saved: ${checkpointId} for task ${taskId}`, {
      reason: checkpoint.reason,
      step: checkpoint.currentStep,
    });

    return checkpoint;
  }

  /**
   * Charger un checkpoint par ID
   */
  async loadCheckpoint(checkpointId: string): Promise<CheckpointState | null> {
    const checkpoint = await this.storage.load(checkpointId);

    if (checkpoint) {
      logger.info(`Checkpoint loaded: ${checkpointId}`);
    }

    return checkpoint;
  }

  /**
   * Charger un checkpoint par ID de tâche
   */
  async loadByTaskId(taskId: string): Promise<CheckpointState | null> {
    return this.storage.loadByTaskId(taskId);
  }

  /**
   * Reprendre une tâche depuis un checkpoint
   */
  async resumeFromCheckpoint(
    checkpointId: string,
    options?: ResumeOptions,
  ): Promise<{
    task: Task;
    messageHistory: AgentMessage[];
    agentName: string;
    partialResults?: Partial<TaskResult>;
  } | null> {
    const checkpoint = await this.loadCheckpoint(checkpointId);

    if (!checkpoint) {
      logger.warn(`Checkpoint not found: ${checkpointId}`);
      return null;
    }

    // Préparer la tâche pour la reprise
    const resumedTask: Task = {
      ...checkpoint.task,
      status: 'in_progress',
      startedAt: checkpoint.task.startedAt ?? new Date(),
    };

    // Mettre à jour le contexte si nécessaire
    if (options?.updatedContext) {
      resumedTask.context = {
        ...resumedTask.context,
        additionalInfo: {
          ...resumedTask.context?.additionalInfo,
          ...options.updatedContext,
        },
      };
    }

    // Filtrer les messages si on reprend depuis une étape spécifique
    let messageHistory = [...checkpoint.messageHistory];

    if (options?.fromStep !== undefined && checkpoint.currentStep !== undefined) {
      /*
       * Garder les messages jusqu'à l'étape spécifiée
       * (logique simplifiée, pourrait être plus sophistiquée)
       */
      const ratio = options.fromStep / (checkpoint.totalSteps ?? 1);
      const messagesToKeep = Math.floor(messageHistory.length * ratio);
      messageHistory = messageHistory.slice(0, messagesToKeep);
    }

    // Ignorer les résultats d'erreur si demandé
    let partialResults = checkpoint.partialResults;

    if (options?.ignoreErrors && partialResults?.errors) {
      partialResults = {
        ...partialResults,
        errors: undefined,
      };
    }

    logger.info(`Resuming from checkpoint: ${checkpointId}`, {
      taskId: checkpoint.taskId,
      step: options?.fromStep ?? checkpoint.currentStep,
    });

    return {
      task: resumedTask,
      messageHistory,
      agentName: checkpoint.agentName,
      partialResults,
    };
  }

  /**
   * Supprimer un checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<void> {
    // Arrêter l'auto-save si actif
    this.stopAutoSave(checkpointId);

    await this.storage.delete(checkpointId);
    logger.info(`Checkpoint deleted: ${checkpointId}`);
  }

  /**
   * Supprimer un checkpoint par ID de tâche
   */
  async deleteByTaskId(taskId: string): Promise<void> {
    const checkpoint = await this.loadByTaskId(taskId);

    if (checkpoint) {
      await this.deleteCheckpoint(checkpoint.id);
    }
  }

  /**
   * Lister tous les checkpoints
   */
  async listCheckpoints(): Promise<CheckpointState[]> {
    return this.storage.list();
  }

  /**
   * Démarrer l'auto-save pour une tâche
   */
  startAutoSave(
    taskId: string,
    getState: () => {
      task: Task;
      agentName: string;
      messageHistory: AgentMessage[];
      partialResults?: Partial<TaskResult>;
    },
  ): void {
    // Arrêter le timer existant si présent
    this.stopAutoSave(taskId);

    const timer = setInterval(async () => {
      try {
        const state = getState();
        await this.saveCheckpoint(taskId, state.task, state.agentName, state.messageHistory, state.partialResults, {
          reason: 'auto',
        });
      } catch (error) {
        logger.error(`Auto-save failed for task ${taskId}:`, error);
      }
    }, this.autoSaveInterval);

    this.activeTimers.set(taskId, timer);
    logger.info(`Auto-save started for task ${taskId}`);
  }

  /**
   * Arrêter l'auto-save pour une tâche
   */
  stopAutoSave(taskId: string): void {
    const timer = this.activeTimers.get(taskId);

    if (timer) {
      clearInterval(timer);
      this.activeTimers.delete(taskId);
      logger.info(`Auto-save stopped for task ${taskId}`);
    }
  }

  /**
   * Arrêter tous les auto-saves
   */
  stopAllAutoSaves(): void {
    for (const [taskId, timer] of this.activeTimers) {
      clearInterval(timer);
      logger.info(`Auto-save stopped for task ${taskId}`);
    }
    this.activeTimers.clear();
  }

  /**
   * Nettoyer les vieux checkpoints
   */
  async cleanup(maxAge: number = 86400000): Promise<number> {
    // maxAge en millisecondes (défaut: 24 heures)
    const deleted = await this.storage.cleanup(maxAge);
    logger.info(`Cleanup: ${deleted} old checkpoints deleted`);

    return deleted;
  }

  /**
   * Vérifier si un checkpoint existe pour une tâche
   */
  async hasCheckpoint(taskId: string): Promise<boolean> {
    const checkpoint = await this.loadByTaskId(taskId);
    return checkpoint !== null;
  }

  /*
   * ==========================================================================
   * HELPERS
   * ==========================================================================
   */

  /**
   * Générer un ID de checkpoint unique
   */
  private generateCheckpointId(taskId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);

    return `cp-${taskId}-${timestamp}-${random}`;
  }
}

/*
 * ============================================================================
 * STORAGE EN MÉMOIRE (POUR LES TESTS)
 * ============================================================================
 */

/**
 * Implémentation en mémoire du stockage de checkpoints
 */
export class InMemoryCheckpointStorage implements CheckpointStorage {
  private checkpoints: Map<string, CheckpointState> = new Map();
  private taskIndex: Map<string, string> = new Map(); // taskId -> checkpointId

  async save(checkpoint: CheckpointState): Promise<void> {
    this.checkpoints.set(checkpoint.id, { ...checkpoint });
    this.taskIndex.set(checkpoint.taskId, checkpoint.id);
  }

  async load(checkpointId: string): Promise<CheckpointState | null> {
    const checkpoint = this.checkpoints.get(checkpointId);
    return checkpoint ? { ...checkpoint } : null;
  }

  async loadByTaskId(taskId: string): Promise<CheckpointState | null> {
    const checkpointId = this.taskIndex.get(taskId);

    if (!checkpointId) {
      return null;
    }

    return this.load(checkpointId);
  }

  async delete(checkpointId: string): Promise<void> {
    const checkpoint = this.checkpoints.get(checkpointId);

    if (checkpoint) {
      this.taskIndex.delete(checkpoint.taskId);
      this.checkpoints.delete(checkpointId);
    }
  }

  async list(): Promise<CheckpointState[]> {
    return Array.from(this.checkpoints.values()).map((c) => ({ ...c }));
  }

  async cleanup(maxAge: number): Promise<number> {
    const now = Date.now();
    let deleted = 0;

    for (const [id, checkpoint] of this.checkpoints) {
      if (now - checkpoint.updatedAt.getTime() > maxAge) {
        await this.delete(id);
        deleted++;
      }
    }

    return deleted;
  }

  /**
   * Vider le storage (pour les tests)
   */
  clear(): void {
    this.checkpoints.clear();
    this.taskIndex.clear();
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer un CheckpointManager avec stockage en mémoire
 */
export function createCheckpointManager(options?: {
  autoSaveInterval?: number;
  maxCheckpoints?: number;
}): CheckpointManager {
  const storage = new InMemoryCheckpointStorage();
  return new CheckpointManager(storage, options);
}

/**
 * Créer un CheckpointManager avec un stockage personnalisé
 */
export function createCheckpointManagerWithStorage(
  storage: CheckpointStorage,
  options?: {
    autoSaveInterval?: number;
    maxCheckpoints?: number;
  },
): CheckpointManager {
  return new CheckpointManager(storage, options);
}
