/**
 * LocalStorage - Implémentation localStorage pour la persistance (fallback)
 *
 * Fournit un stockage persistant basé sur localStorage comme fallback
 * quand IndexedDB n'est pas disponible. Limité à ~5MB.
 *
 * @module agents/persistence/local-storage
 */

import type { Task } from '../types';
import type { CheckpointState } from '../utils/checkpoint-manager';
import type {
  StorageAdapter,
  PersistedTask,
  PersistedDeadLetterEntry,
  TaskQueryOptions,
  StorageStats,
  StorageOperationResult,
} from './storage-adapter';
import { STORAGE_SCHEMA_VERSION, LOCALSTORAGE_PREFIX } from './storage-adapter';
import { safeJSONParse, formatJSONParseError, type JSONParseError } from '../utils/output-parser';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('LocalStorage');

/*
 * ============================================================================
 * CONSTANTES
 * ============================================================================
 */

/** Clés de stockage */
const KEYS = {
  TASKS: `${LOCALSTORAGE_PREFIX}tasks`,
  CHECKPOINTS: `${LOCALSTORAGE_PREFIX}checkpoints`,
  DEAD_LETTER_QUEUE: `${LOCALSTORAGE_PREFIX}dlq`,
  METADATA: `${LOCALSTORAGE_PREFIX}metadata`,
} as const;

/** Limite approximative de localStorage (5MB en pratique) */
const MAX_STORAGE_SIZE = 5 * 1024 * 1024;

/*
 * ============================================================================
 * LOCALSTORAGE IMPLEMENTATION
 * ============================================================================
 */

/**
 * Implémentation localStorage du StorageAdapter
 *
 * Utilise localStorage comme fallback quand IndexedDB n'est pas disponible.
 * Attention: limité à ~5MB de données totales.
 */
export class LocalStorageAdapter implements StorageAdapter {
  private isInitialized = false;
  private tasksCache: Map<string, PersistedTask> = new Map();
  private checkpointsCache: Map<string, CheckpointState> = new Map();
  private dlqCache: Map<string, PersistedDeadLetterEntry> = new Map();

  /*
   * ==========================================================================
   * LIFECYCLE
   * ==========================================================================
   */

  async initialize(): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    if (!this.isLocalStorageSupported()) {
      logger.warn('localStorage is not supported in this environment');
      return false;
    }

    try {
      // Charger les données existantes en cache
      this.loadFromStorage();
      this.isInitialized = true;
      logger.info('LocalStorage adapter initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize localStorage adapter:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    // Sauvegarder avant de fermer
    this.saveToStorage();
    this.tasksCache.clear();
    this.checkpointsCache.clear();
    this.dlqCache.clear();
    this.isInitialized = false;
    logger.info('LocalStorage adapter closed');
  }

  isAvailable(): boolean {
    return this.isInitialized;
  }

  getStorageType(): 'localstorage' {
    return 'localstorage';
  }

  /*
   * ==========================================================================
   * TÂCHES
   * ==========================================================================
   */

  async saveTask(task: Task): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    const persistedTask: PersistedTask = {
      task,
      persistedAt: new Date(),
      updatedAt: new Date(),
      schemaVersion: STORAGE_SCHEMA_VERSION,
    };

    try {
      this.tasksCache.set(task.id, persistedTask);
      this.saveToStorage();
      logger.debug(`Task saved: ${task.id}`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to save task ${task.id}:`, error);
      return { success: false, error: errorMsg };
    }
  }

  async loadTask(taskId: string): Promise<PersistedTask | null> {
    if (!this.ensureInitialized()) {
      return null;
    }

    return this.tasksCache.get(taskId) ?? null;
  }

  async loadPendingTasks(): Promise<PersistedTask[]> {
    return this.queryTasks({
      status: ['pending', 'queued', 'in_progress'],
    });
  }

  async queryTasks(options: TaskQueryOptions): Promise<PersistedTask[]> {
    if (!this.ensureInitialized()) {
      return [];
    }

    let results = Array.from(this.tasksCache.values());

    // Filtrer par statut
    if (options.status) {
      const statuses = Array.isArray(options.status) ? options.status : [options.status];
      results = results.filter((pt) => statuses.includes(pt.task.status));
    }

    // Filtrer par agent assigné
    if (options.assignedAgent) {
      results = results.filter((pt) => pt.task.assignedAgent === options.assignedAgent);
    }

    // Trier
    if (options.orderBy) {
      results.sort((a, b) => {
        let valueA: number;
        let valueB: number;

        switch (options.orderBy) {
          case 'createdAt':
            valueA = new Date(a.task.createdAt).getTime();
            valueB = new Date(b.task.createdAt).getTime();
            break;
          case 'updatedAt':
            valueA = new Date(a.updatedAt).getTime();
            valueB = new Date(b.updatedAt).getTime();
            break;
          case 'priority':
            valueA = a.task.priority ?? 0;
            valueB = b.task.priority ?? 0;
            break;
          default:
            return 0;
        }

        const diff = valueA < valueB ? -1 : valueA > valueB ? 1 : 0;
        return options.order === 'desc' ? -diff : diff;
      });
    }

    // Pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? results.length;
    results = results.slice(offset, offset + limit);

    return results;
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    const existing = this.tasksCache.get(taskId);

    if (!existing) {
      return { success: false, error: 'Task not found' };
    }

    try {
      const updatedTask: PersistedTask = {
        ...existing,
        task: { ...existing.task, ...updates },
        updatedAt: new Date(),
      };

      this.tasksCache.set(taskId, updatedTask);
      this.saveToStorage();
      logger.debug(`Task updated: ${taskId}`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to update task ${taskId}:`, error);
      return { success: false, error: errorMsg };
    }
  }

  async deleteTask(taskId: string): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      this.tasksCache.delete(taskId);
      this.saveToStorage();
      logger.debug(`Task deleted: ${taskId}`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to delete task ${taskId}:`, error);
      return { success: false, error: errorMsg };
    }
  }

  async cleanupTasks(maxAge: number): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      const now = Date.now();
      let deletedCount = 0;

      for (const [id, pt] of this.tasksCache) {
        const isCompleted = pt.task.status === 'completed' || pt.task.status === 'failed';
        const age = now - new Date(pt.updatedAt).getTime();

        if (isCompleted && age > maxAge) {
          this.tasksCache.delete(id);
          deletedCount++;
        }
      }

      this.saveToStorage();
      logger.info(`Cleaned up ${deletedCount} old tasks`);
      return { success: true, affectedCount: deletedCount };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to cleanup tasks:', error);
      return { success: false, error: errorMsg };
    }
  }

  /*
   * ==========================================================================
   * CHECKPOINTS
   * ==========================================================================
   */

  async saveCheckpoint(checkpoint: CheckpointState): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      this.checkpointsCache.set(checkpoint.id, checkpoint);
      this.saveToStorage();
      logger.debug(`Checkpoint saved: ${checkpoint.id}`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to save checkpoint ${checkpoint.id}:`, error);
      return { success: false, error: errorMsg };
    }
  }

  async loadCheckpoint(checkpointId: string): Promise<CheckpointState | null> {
    if (!this.ensureInitialized()) {
      return null;
    }

    return this.checkpointsCache.get(checkpointId) ?? null;
  }

  async loadCheckpointByTaskId(taskId: string): Promise<CheckpointState | null> {
    if (!this.ensureInitialized()) {
      return null;
    }

    // Trouver le checkpoint le plus récent pour cette tâche
    const matching = Array.from(this.checkpointsCache.values())
      .filter((cp) => cp.taskId === taskId)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

    return matching[0] ?? null;
  }

  async listCheckpoints(): Promise<CheckpointState[]> {
    if (!this.ensureInitialized()) {
      return [];
    }

    return Array.from(this.checkpointsCache.values());
  }

  async deleteCheckpoint(checkpointId: string): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      this.checkpointsCache.delete(checkpointId);
      this.saveToStorage();
      logger.debug(`Checkpoint deleted: ${checkpointId}`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to delete checkpoint ${checkpointId}:`, error);
      return { success: false, error: errorMsg };
    }
  }

  async cleanupCheckpoints(maxAge: number): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      const now = Date.now();
      let deletedCount = 0;

      for (const [id, cp] of this.checkpointsCache) {
        const age = now - new Date(cp.updatedAt).getTime();

        if (age > maxAge) {
          this.checkpointsCache.delete(id);
          deletedCount++;
        }
      }

      this.saveToStorage();
      logger.info(`Cleaned up ${deletedCount} old checkpoints`);
      return { success: true, affectedCount: deletedCount };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to cleanup checkpoints:', error);
      return { success: false, error: errorMsg };
    }
  }

  /*
   * ==========================================================================
   * DEAD-LETTER QUEUE
   * ==========================================================================
   */

  async addToDeadLetterQueue(entry: PersistedDeadLetterEntry): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      this.dlqCache.set(entry.id, entry);
      this.saveToStorage();
      logger.debug(`DLQ entry added: ${entry.id}`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to add DLQ entry ${entry.id}:`, error);
      return { success: false, error: errorMsg };
    }
  }

  async loadDeadLetterEntry(entryId: string): Promise<PersistedDeadLetterEntry | null> {
    if (!this.ensureInitialized()) {
      return null;
    }

    return this.dlqCache.get(entryId) ?? null;
  }

  async listDeadLetterQueue(): Promise<PersistedDeadLetterEntry[]> {
    if (!this.ensureInitialized()) {
      return [];
    }

    return Array.from(this.dlqCache.values());
  }

  async removeFromDeadLetterQueue(entryId: string): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      this.dlqCache.delete(entryId);
      this.saveToStorage();
      logger.debug(`DLQ entry removed: ${entryId}`);
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error(`Failed to remove DLQ entry ${entryId}:`, error);
      return { success: false, error: errorMsg };
    }
  }

  async purgeDeadLetterQueue(): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      const now = new Date();
      let deletedCount = 0;

      for (const [id, entry] of this.dlqCache) {
        if (new Date(entry.expiresAt) < now) {
          this.dlqCache.delete(id);
          deletedCount++;
        }
      }

      this.saveToStorage();
      logger.info(`Purged ${deletedCount} expired DLQ entries`);
      return { success: true, affectedCount: deletedCount };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to purge DLQ:', error);
      return { success: false, error: errorMsg };
    }
  }

  /*
   * ==========================================================================
   * UTILITAIRES
   * ==========================================================================
   */

  async getStats(): Promise<StorageStats> {
    const defaultStats: StorageStats = {
      taskCount: 0,
      checkpointCount: 0,
      dlqCount: 0,
      storageType: 'localstorage',
      updatedAt: new Date(),
    };

    if (!this.ensureInitialized()) {
      return defaultStats;
    }

    // Calculer l'espace utilisé
    let usedSpace = 0;

    try {
      for (const key of Object.values(KEYS)) {
        const value = localStorage.getItem(key);

        if (value) {
          usedSpace += key.length + value.length;
        }
      }
    } catch {
      // Ignorer les erreurs de calcul
    }

    return {
      taskCount: this.tasksCache.size,
      checkpointCount: this.checkpointsCache.size,
      dlqCount: this.dlqCache.size,
      usedSpace: usedSpace * 2, // UTF-16 = 2 bytes per char
      availableSpace: MAX_STORAGE_SIZE - usedSpace * 2,
      storageType: 'localstorage',
      updatedAt: new Date(),
    };
  }

  async clear(): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      this.tasksCache.clear();
      this.checkpointsCache.clear();
      this.dlqCache.clear();

      for (const key of Object.values(KEYS)) {
        localStorage.removeItem(key);
      }

      logger.info('All storage cleared');
      return { success: true };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to clear storage:', error);
      return { success: false, error: errorMsg };
    }
  }

  async exportData(): Promise<{
    tasks: PersistedTask[];
    checkpoints: CheckpointState[];
    deadLetterQueue: PersistedDeadLetterEntry[];
    exportedAt: Date;
  }> {
    return {
      tasks: Array.from(this.tasksCache.values()),
      checkpoints: Array.from(this.checkpointsCache.values()),
      deadLetterQueue: Array.from(this.dlqCache.values()),
      exportedAt: new Date(),
    };
  }

  async importData(data: {
    tasks?: PersistedTask[];
    checkpoints?: CheckpointState[];
    deadLetterQueue?: PersistedDeadLetterEntry[];
  }): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      let importedCount = 0;

      if (data.tasks) {
        for (const pt of data.tasks) {
          this.tasksCache.set(pt.task.id, pt);
          importedCount++;
        }
      }

      if (data.checkpoints) {
        for (const cp of data.checkpoints) {
          this.checkpointsCache.set(cp.id, cp);
          importedCount++;
        }
      }

      if (data.deadLetterQueue) {
        for (const entry of data.deadLetterQueue) {
          this.dlqCache.set(entry.id, entry);
          importedCount++;
        }
      }

      this.saveToStorage();
      logger.info(`Imported ${importedCount} records`);
      return { success: true, affectedCount: importedCount };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Failed to import data:', error);
      return { success: false, error: errorMsg };
    }
  }

  /*
   * ==========================================================================
   * HELPERS PRIVÉS
   * ==========================================================================
   */

  private isLocalStorageSupported(): boolean {
    try {
      const testKey = '__localStorage_test__';
      localStorage.setItem(testKey, testKey);
      localStorage.removeItem(testKey);
      return true;
    } catch {
      return false;
    }
  }

  private ensureInitialized(): boolean {
    if (!this.isInitialized) {
      logger.warn('Storage not initialized');
      return false;
    }
    return true;
  }

  private loadFromStorage(): void {
    const parseErrors: { key: string; error: JSONParseError }[] = [];

    try {
      // Charger les tâches avec gestion d'erreur améliorée
      const tasksJson = localStorage.getItem(KEYS.TASKS);

      if (tasksJson) {
        const parseResult = safeJSONParse<PersistedTask[]>(tasksJson, { logErrors: false });

        if (parseResult.success && parseResult.data) {
          for (const pt of parseResult.data) {
            // Reconvertir les dates
            pt.task.createdAt = new Date(pt.task.createdAt);

            if (pt.task.startedAt) {
              pt.task.startedAt = new Date(pt.task.startedAt);
            }

            if (pt.task.completedAt) {
              pt.task.completedAt = new Date(pt.task.completedAt);
            }

            pt.persistedAt = new Date(pt.persistedAt);
            pt.updatedAt = new Date(pt.updatedAt);
            this.tasksCache.set(pt.task.id, pt);
          }
        } else if (parseResult.error) {
          parseErrors.push({ key: KEYS.TASKS, error: parseResult.error });
        }
      }

      // Charger les checkpoints avec gestion d'erreur améliorée
      const checkpointsJson = localStorage.getItem(KEYS.CHECKPOINTS);

      if (checkpointsJson) {
        const parseResult = safeJSONParse<CheckpointState[]>(checkpointsJson, { logErrors: false });

        if (parseResult.success && parseResult.data) {
          for (const cp of parseResult.data) {
            cp.createdAt = new Date(cp.createdAt);
            cp.updatedAt = new Date(cp.updatedAt);
            this.checkpointsCache.set(cp.id, cp);
          }
        } else if (parseResult.error) {
          parseErrors.push({ key: KEYS.CHECKPOINTS, error: parseResult.error });
        }
      }

      // Charger la DLQ avec gestion d'erreur améliorée
      const dlqJson = localStorage.getItem(KEYS.DEAD_LETTER_QUEUE);

      if (dlqJson) {
        const parseResult = safeJSONParse<PersistedDeadLetterEntry[]>(dlqJson, { logErrors: false });

        if (parseResult.success && parseResult.data) {
          for (const entry of parseResult.data) {
            entry.firstFailedAt = new Date(entry.firstFailedAt);
            entry.lastFailedAt = new Date(entry.lastFailedAt);
            entry.expiresAt = new Date(entry.expiresAt);
            this.dlqCache.set(entry.id, entry);
          }
        } else if (parseResult.error) {
          parseErrors.push({ key: KEYS.DEAD_LETTER_QUEUE, error: parseResult.error });
        }
      }

      // Logger les erreurs de parsing avec contexte détaillé
      if (parseErrors.length > 0) {
        for (const { key, error } of parseErrors) {
          logger.error(`JSON parse error loading ${key}`, {
            message: error.message,
            line: error.line,
            column: error.column,
            context: error.context,
          });
          // Log le rapport formaté pour un debugging plus facile
          logger.debug(`Detailed error report:\n${formatJSONParseError(error)}`);
        }
      }

      logger.debug('Data loaded from localStorage', {
        tasks: this.tasksCache.size,
        checkpoints: this.checkpointsCache.size,
        dlq: this.dlqCache.size,
        parseErrors: parseErrors.length,
      });
    } catch (error) {
      logger.error('Failed to load data from localStorage:', error);

      // Réinitialiser les caches en cas d'erreur
      this.tasksCache.clear();
      this.checkpointsCache.clear();
      this.dlqCache.clear();
    }
  }

  private saveToStorage(): void {
    try {
      localStorage.setItem(KEYS.TASKS, JSON.stringify(Array.from(this.tasksCache.values())));
      localStorage.setItem(KEYS.CHECKPOINTS, JSON.stringify(Array.from(this.checkpointsCache.values())));
      localStorage.setItem(KEYS.DEAD_LETTER_QUEUE, JSON.stringify(Array.from(this.dlqCache.values())));
    } catch (error) {
      // Probablement QuotaExceededError
      if (error instanceof Error && error.name === 'QuotaExceededError') {
        logger.error('localStorage quota exceeded, trying to cleanup old data');
        this.emergencyCleanup();
      } else {
        logger.error('Failed to save data to localStorage:', error);
      }
    }
  }

  /**
   * Nettoyage d'urgence quand le quota est dépassé
   */
  private emergencyCleanup(): void {
    const now = Date.now();
    const ONE_HOUR = 60 * 60 * 1000;

    // Supprimer les tâches terminées de plus d'une heure
    for (const [id, pt] of this.tasksCache) {
      const isCompleted = pt.task.status === 'completed' || pt.task.status === 'failed';
      const age = now - new Date(pt.updatedAt).getTime();

      if (isCompleted && age > ONE_HOUR) {
        this.tasksCache.delete(id);
      }
    }

    // Supprimer les checkpoints de plus d'une heure
    for (const [id, cp] of this.checkpointsCache) {
      const age = now - new Date(cp.updatedAt).getTime();

      if (age > ONE_HOUR) {
        this.checkpointsCache.delete(id);
      }
    }

    // Supprimer la DLQ expirée
    for (const [id, entry] of this.dlqCache) {
      if (new Date(entry.expiresAt) < new Date()) {
        this.dlqCache.delete(id);
      }
    }

    // Réessayer de sauvegarder
    try {
      localStorage.setItem(KEYS.TASKS, JSON.stringify(Array.from(this.tasksCache.values())));
      localStorage.setItem(KEYS.CHECKPOINTS, JSON.stringify(Array.from(this.checkpointsCache.values())));
      localStorage.setItem(KEYS.DEAD_LETTER_QUEUE, JSON.stringify(Array.from(this.dlqCache.values())));
      logger.info('Emergency cleanup successful');
    } catch {
      logger.error('Emergency cleanup failed, data may be lost');
    }
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer une instance de LocalStorageAdapter
 */
export function createLocalStorageAdapter(): LocalStorageAdapter {
  return new LocalStorageAdapter();
}
