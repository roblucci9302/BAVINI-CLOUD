/**
 * Task Persistence Manager - Gestionnaire principal de persistance
 *
 * Fournit une interface haut niveau pour la persistance des tâches,
 * avec fallback automatique entre IndexedDB et localStorage.
 *
 * @module agents/persistence/task-persistence-manager
 */

import type { Task, AgentError } from '../types';
import type { CheckpointState } from '../utils/checkpoint-manager';
import type {
  StorageAdapter,
  PersistedTask,
  PersistedDeadLetterEntry,
  StorageStats,
  TaskQueryOptions,
} from './storage-adapter';
import {
  DEFAULT_TASK_RETENTION_MS,
  DEFAULT_CHECKPOINT_RETENTION_MS,
  DEFAULT_DLQ_RETENTION_MS,
} from './storage-adapter';
import { IndexedDBStorage } from './indexeddb-storage';
import { LocalStorageAdapter } from './local-storage';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TaskPersistenceManager');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Configuration du TaskPersistenceManager
 */
export interface TaskPersistenceConfig {
  /** Durée de rétention des tâches terminées (ms) */
  taskRetentionMs?: number;

  /** Durée de rétention des checkpoints (ms) */
  checkpointRetentionMs?: number;

  /** Durée de rétention de la DLQ (ms) */
  dlqRetentionMs?: number;

  /** Intervalle de nettoyage automatique (ms, 0 = désactivé) */
  cleanupIntervalMs?: number;

  /** Forcer l'utilisation de localStorage (pour tests) */
  forceLocalStorage?: boolean;
}

/**
 * État du gestionnaire de persistance
 */
export interface PersistenceManagerState {
  /** Est initialisé */
  initialized: boolean;

  /** Type de stockage actif */
  storageType: 'indexeddb' | 'localstorage' | 'memory' | 'none';

  /** Dernière erreur */
  lastError?: string;

  /** Statistiques */
  stats?: StorageStats;
}

/*
 * ============================================================================
 * TASK PERSISTENCE MANAGER
 * ============================================================================
 */

/**
 * Gestionnaire principal de persistance des tâches
 *
 * Gère automatiquement le fallback entre IndexedDB et localStorage,
 * et fournit une API simple pour la persistance des tâches.
 */
export class TaskPersistenceManager {
  private storage: StorageAdapter | null = null;
  private config: Required<TaskPersistenceConfig>;
  private cleanupTimer: NodeJS.Timeout | null = null;
  private state: PersistenceManagerState = {
    initialized: false,
    storageType: 'none',
  };

  constructor(config?: TaskPersistenceConfig) {
    this.config = {
      taskRetentionMs: config?.taskRetentionMs ?? DEFAULT_TASK_RETENTION_MS,
      checkpointRetentionMs: config?.checkpointRetentionMs ?? DEFAULT_CHECKPOINT_RETENTION_MS,
      dlqRetentionMs: config?.dlqRetentionMs ?? DEFAULT_DLQ_RETENTION_MS,
      cleanupIntervalMs: config?.cleanupIntervalMs ?? 3600000, // 1 heure par défaut
      forceLocalStorage: config?.forceLocalStorage ?? false,
    };
  }

  /*
   * ==========================================================================
   * LIFECYCLE
   * ==========================================================================
   */

  /**
   * Initialiser le gestionnaire de persistance
   *
   * Essaie d'abord IndexedDB, puis localStorage en fallback.
   */
  async initialize(): Promise<boolean> {
    if (this.state.initialized) {
      return true;
    }

    logger.info('Initializing persistence manager...');

    // Essayer IndexedDB en premier (sauf si forceLocalStorage)
    if (!this.config.forceLocalStorage) {
      const indexedDB = new IndexedDBStorage();
      const indexedDBSuccess = await indexedDB.initialize();

      if (indexedDBSuccess) {
        this.storage = indexedDB;
        this.state.storageType = 'indexeddb';
        this.state.initialized = true;
        logger.info('Using IndexedDB for persistence');
        this.startCleanupTimer();
        return true;
      }

      logger.warn('IndexedDB not available, falling back to localStorage');
    }

    // Fallback vers localStorage
    const localStorage = new LocalStorageAdapter();
    const localStorageSuccess = await localStorage.initialize();

    if (localStorageSuccess) {
      this.storage = localStorage;
      this.state.storageType = 'localstorage';
      this.state.initialized = true;
      logger.info('Using localStorage for persistence');
      this.startCleanupTimer();
      return true;
    }

    logger.error('No persistence storage available');
    this.state.lastError = 'No storage available';
    return false;
  }

  /**
   * Fermer le gestionnaire proprement
   */
  async close(): Promise<void> {
    this.stopCleanupTimer();

    if (this.storage) {
      await this.storage.close();
      this.storage = null;
    }

    this.state.initialized = false;
    this.state.storageType = 'none';
    logger.info('Persistence manager closed');
  }

  /**
   * Obtenir l'état du gestionnaire
   */
  getState(): PersistenceManagerState {
    return { ...this.state };
  }

  /**
   * Vérifier si le gestionnaire est prêt
   */
  isReady(): boolean {
    return this.state.initialized && this.storage !== null;
  }

  /*
   * ==========================================================================
   * GESTION DES TÂCHES
   * ==========================================================================
   */

  /**
   * Persister une tâche
   */
  async persistTask(task: Task): Promise<boolean> {
    if (!this.ensureReady()) {
      return false;
    }

    const result = await this.storage!.saveTask(task);

    if (!result.success) {
      logger.error(`Failed to persist task ${task.id}: ${result.error}`);
      this.state.lastError = result.error;
    }

    return result.success;
  }

  /**
   * Charger une tâche par ID
   */
  async loadTask(taskId: string): Promise<Task | null> {
    if (!this.ensureReady()) {
      return null;
    }

    const persisted = await this.storage!.loadTask(taskId);
    return persisted?.task ?? null;
  }

  /**
   * Charger toutes les tâches en attente (pour reprise après crash)
   */
  async loadPendingTasks(): Promise<Task[]> {
    if (!this.ensureReady()) {
      return [];
    }

    const persisted = await this.storage!.loadPendingTasks();
    return persisted.map((p) => p.task);
  }

  /**
   * Requête avancée sur les tâches
   */
  async queryTasks(options: TaskQueryOptions): Promise<Task[]> {
    if (!this.ensureReady()) {
      return [];
    }

    const persisted = await this.storage!.queryTasks(options);
    return persisted.map((p) => p.task);
  }

  /**
   * Mettre à jour une tâche
   */
  async updateTask(taskId: string, updates: Partial<Task>): Promise<boolean> {
    if (!this.ensureReady()) {
      return false;
    }

    const result = await this.storage!.updateTask(taskId, updates);

    if (!result.success) {
      logger.error(`Failed to update task ${taskId}: ${result.error}`);
      this.state.lastError = result.error;
    }

    return result.success;
  }

  /**
   * Supprimer une tâche
   */
  async deleteTask(taskId: string): Promise<boolean> {
    if (!this.ensureReady()) {
      return false;
    }

    const result = await this.storage!.deleteTask(taskId);
    return result.success;
  }

  /**
   * Marquer une tâche comme terminée et la nettoyer si configuré
   */
  async completeTask(taskId: string, result: Task['result']): Promise<boolean> {
    return this.updateTask(taskId, {
      status: 'completed',
      result,
      completedAt: new Date(),
    });
  }

  /**
   * Marquer une tâche comme échouée
   */
  async failTask(taskId: string, error: AgentError): Promise<boolean> {
    return this.updateTask(taskId, {
      status: 'failed',
      result: {
        success: false,
        output: error.message,
        errors: [error],
      },
      completedAt: new Date(),
    });
  }

  /*
   * ==========================================================================
   * GESTION DES CHECKPOINTS
   * ==========================================================================
   */

  /**
   * Sauvegarder un checkpoint
   */
  async saveCheckpoint(checkpoint: CheckpointState): Promise<boolean> {
    if (!this.ensureReady()) {
      return false;
    }

    const result = await this.storage!.saveCheckpoint(checkpoint);

    if (!result.success) {
      logger.error(`Failed to save checkpoint ${checkpoint.id}: ${result.error}`);
      this.state.lastError = result.error;
    }

    return result.success;
  }

  /**
   * Charger un checkpoint par ID
   */
  async loadCheckpoint(checkpointId: string): Promise<CheckpointState | null> {
    if (!this.ensureReady()) {
      return null;
    }

    return this.storage!.loadCheckpoint(checkpointId);
  }

  /**
   * Charger le dernier checkpoint pour une tâche
   */
  async loadCheckpointByTaskId(taskId: string): Promise<CheckpointState | null> {
    if (!this.ensureReady()) {
      return null;
    }

    return this.storage!.loadCheckpointByTaskId(taskId);
  }

  /**
   * Vérifier si un checkpoint existe pour une tâche
   */
  async hasCheckpoint(taskId: string): Promise<boolean> {
    const checkpoint = await this.loadCheckpointByTaskId(taskId);
    return checkpoint !== null;
  }

  /**
   * Supprimer un checkpoint
   */
  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    if (!this.ensureReady()) {
      return false;
    }

    const result = await this.storage!.deleteCheckpoint(checkpointId);
    return result.success;
  }

  /**
   * Supprimer le checkpoint d'une tâche
   */
  async deleteCheckpointByTaskId(taskId: string): Promise<boolean> {
    const checkpoint = await this.loadCheckpointByTaskId(taskId);

    if (checkpoint) {
      return this.deleteCheckpoint(checkpoint.id);
    }

    return true;
  }

  /*
   * ==========================================================================
   * DEAD-LETTER QUEUE
   * ==========================================================================
   */

  /**
   * Ajouter une tâche échouée à la DLQ
   */
  async addToDeadLetterQueue(task: Task, error: AgentError, attempts: number): Promise<boolean> {
    if (!this.ensureReady()) {
      return false;
    }

    const entry: PersistedDeadLetterEntry = {
      id: `dlq-${task.id}-${Date.now()}`,
      task,
      error,
      attempts,
      firstFailedAt: new Date(),
      lastFailedAt: new Date(),
      expiresAt: new Date(Date.now() + this.config.dlqRetentionMs),
    };

    const result = await this.storage!.addToDeadLetterQueue(entry);

    if (!result.success) {
      logger.error(`Failed to add task ${task.id} to DLQ: ${result.error}`);
      this.state.lastError = result.error;
    }

    return result.success;
  }

  /**
   * Lister les entrées de la DLQ
   */
  async listDeadLetterQueue(): Promise<PersistedDeadLetterEntry[]> {
    if (!this.ensureReady()) {
      return [];
    }

    return this.storage!.listDeadLetterQueue();
  }

  /**
   * Retirer une entrée de la DLQ (pour retry ou suppression manuelle)
   */
  async removeFromDeadLetterQueue(entryId: string): Promise<boolean> {
    if (!this.ensureReady()) {
      return false;
    }

    const result = await this.storage!.removeFromDeadLetterQueue(entryId);
    return result.success;
  }

  /**
   * Récupérer une tâche de la DLQ pour retry
   */
  async retryFromDeadLetterQueue(entryId: string): Promise<Task | null> {
    if (!this.ensureReady()) {
      return null;
    }

    const entry = await this.storage!.loadDeadLetterEntry(entryId);

    if (!entry) {
      return null;
    }

    // Supprimer de la DLQ
    await this.removeFromDeadLetterQueue(entryId);

    // Retourner la tâche pour retry (avec statut réinitialisé)
    return {
      ...entry.task,
      status: 'pending',
      result: undefined,
      completedAt: undefined,
      metadata: {
        ...entry.task.metadata,
        retryCount: (entry.task.metadata?.retryCount ?? 0) + 1,
      },
    };
  }

  /*
   * ==========================================================================
   * UTILITAIRES
   * ==========================================================================
   */

  /**
   * Obtenir les statistiques de stockage
   */
  async getStats(): Promise<StorageStats | null> {
    if (!this.ensureReady()) {
      return null;
    }

    const stats = await this.storage!.getStats();
    this.state.stats = stats;
    return stats;
  }

  /**
   * Nettoyer les anciennes données
   */
  async cleanup(): Promise<{ tasks: number; checkpoints: number; dlq: number }> {
    if (!this.ensureReady()) {
      return { tasks: 0, checkpoints: 0, dlq: 0 };
    }

    const [taskResult, checkpointResult, dlqResult] = await Promise.all([
      this.storage!.cleanupTasks(this.config.taskRetentionMs),
      this.storage!.cleanupCheckpoints(this.config.checkpointRetentionMs),
      this.storage!.purgeDeadLetterQueue(),
    ]);

    const result = {
      tasks: taskResult.affectedCount ?? 0,
      checkpoints: checkpointResult.affectedCount ?? 0,
      dlq: dlqResult.affectedCount ?? 0,
    };

    logger.info('Cleanup completed', result);
    return result;
  }

  /**
   * Vider tout le stockage (attention: destructif!)
   */
  async clearAll(): Promise<boolean> {
    if (!this.ensureReady()) {
      return false;
    }

    const result = await this.storage!.clear();

    if (!result.success) {
      logger.error(`Failed to clear storage: ${result.error}`);
      this.state.lastError = result.error;
    }

    return result.success;
  }

  /**
   * Exporter toutes les données (backup)
   */
  async exportData(): Promise<string | null> {
    if (!this.ensureReady()) {
      return null;
    }

    const data = await this.storage!.exportData();
    return JSON.stringify(data, null, 2);
  }

  /**
   * Importer des données (restore)
   */
  async importData(jsonData: string): Promise<boolean> {
    if (!this.ensureReady()) {
      return false;
    }

    try {
      const data = JSON.parse(jsonData);
      const result = await this.storage!.importData(data);

      if (!result.success) {
        logger.error(`Failed to import data: ${result.error}`);
        this.state.lastError = result.error;
      }

      return result.success;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Invalid JSON';
      logger.error(`Failed to parse import data: ${errorMsg}`);
      this.state.lastError = errorMsg;
      return false;
    }
  }

  /*
   * ==========================================================================
   * HELPERS PRIVÉS
   * ==========================================================================
   */

  private ensureReady(): boolean {
    if (!this.state.initialized || !this.storage) {
      logger.warn('Persistence manager not initialized');
      return false;
    }
    return true;
  }

  private startCleanupTimer(): void {
    if (this.config.cleanupIntervalMs <= 0) {
      return;
    }

    this.cleanupTimer = setInterval(() => {
      this.cleanup().catch((error) => {
        logger.error('Automatic cleanup failed:', error);
      });
    }, this.config.cleanupIntervalMs);

    logger.debug(`Cleanup timer started (interval: ${this.config.cleanupIntervalMs}ms)`);
  }

  private stopCleanupTimer(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
      logger.debug('Cleanup timer stopped');
    }
  }
}

/*
 * ============================================================================
 * SINGLETON & FACTORY
 * ============================================================================
 */

let globalPersistenceManager: TaskPersistenceManager | null = null;

/**
 * Obtenir l'instance globale du gestionnaire de persistance
 */
export function getGlobalPersistenceManager(): TaskPersistenceManager {
  if (!globalPersistenceManager) {
    globalPersistenceManager = new TaskPersistenceManager();
  }
  return globalPersistenceManager;
}

/**
 * Initialiser l'instance globale avec une configuration personnalisée
 */
export async function initializeGlobalPersistenceManager(config?: TaskPersistenceConfig): Promise<boolean> {
  globalPersistenceManager = new TaskPersistenceManager(config);
  return globalPersistenceManager.initialize();
}

/**
 * Créer une nouvelle instance de TaskPersistenceManager
 */
export function createTaskPersistenceManager(config?: TaskPersistenceConfig): TaskPersistenceManager {
  return new TaskPersistenceManager(config);
}
