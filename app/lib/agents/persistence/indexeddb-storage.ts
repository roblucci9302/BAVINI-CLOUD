/**
 * IndexedDB Storage - Implémentation IndexedDB pour la persistance
 *
 * Fournit un stockage persistant haute capacité pour les tâches,
 * checkpoints et dead-letter queue utilisant IndexedDB.
 *
 * @module agents/persistence/indexeddb-storage
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
import { STORAGE_SCHEMA_VERSION, INDEXEDDB_NAME, INDEXEDDB_VERSION } from './storage-adapter';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('IndexedDBStorage');

/*
 * ============================================================================
 * CONSTANTES
 * ============================================================================
 */

/** Noms des object stores */
const STORES = {
  TASKS: 'tasks',
  CHECKPOINTS: 'checkpoints',
  DEAD_LETTER_QUEUE: 'deadLetterQueue',
} as const;

/*
 * ============================================================================
 * INDEXEDDB STORAGE
 * ============================================================================
 */

/**
 * Implémentation IndexedDB du StorageAdapter
 *
 * Utilise IndexedDB pour un stockage persistant haute capacité.
 * Support pour les index, transactions, et requêtes avancées.
 */
export class IndexedDBStorage implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private isInitialized = false;

  /*
   * ==========================================================================
   * LIFECYCLE
   * ==========================================================================
   */

  async initialize(): Promise<boolean> {
    if (this.isInitialized && this.db) {
      return true;
    }

    if (!this.isIndexedDBSupported()) {
      logger.warn('IndexedDB is not supported in this environment');
      return false;
    }

    try {
      this.db = await this.openDatabase();
      this.isInitialized = true;
      logger.info('IndexedDB storage initialized successfully');
      return true;
    } catch (error) {
      logger.error('Failed to initialize IndexedDB storage:', error);
      return false;
    }
  }

  async close(): Promise<void> {
    if (this.db) {
      this.db.close();
      this.db = null;
      this.isInitialized = false;
      logger.info('IndexedDB storage closed');
    }
  }

  isAvailable(): boolean {
    return this.isInitialized && this.db !== null;
  }

  getStorageType(): 'indexeddb' {
    return 'indexeddb';
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
      await this.put(STORES.TASKS, persistedTask, task.id);
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

    try {
      const result = await this.get<PersistedTask>(STORES.TASKS, taskId);
      return result ?? null;
    } catch (error) {
      logger.error(`Failed to load task ${taskId}:`, error);
      return null;
    }
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

    try {
      const allTasks = await this.getAll<PersistedTask>(STORES.TASKS);

      let filtered = allTasks;

      // Filtrer par statut
      if (options.status) {
        const statuses = Array.isArray(options.status) ? options.status : [options.status];
        filtered = filtered.filter((pt) => statuses.includes(pt.task.status));
      }

      // Filtrer par agent assigné
      if (options.assignedAgent) {
        filtered = filtered.filter((pt) => pt.task.assignedAgent === options.assignedAgent);
      }

      // Trier
      if (options.orderBy) {
        filtered.sort((a, b) => {
          let valueA: number | Date;
          let valueB: number | Date;

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
      const limit = options.limit ?? filtered.length;
      filtered = filtered.slice(offset, offset + limit);

      return filtered;
    } catch (error) {
      logger.error('Failed to query tasks:', error);
      return [];
    }
  }

  async updateTask(taskId: string, updates: Partial<Task>): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      const existing = await this.loadTask(taskId);

      if (!existing) {
        return { success: false, error: 'Task not found' };
      }

      const updatedTask: PersistedTask = {
        ...existing,
        task: { ...existing.task, ...updates },
        updatedAt: new Date(),
      };

      await this.put(STORES.TASKS, updatedTask, taskId);
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
      await this.delete(STORES.TASKS, taskId);
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
      const allTasks = await this.getAll<PersistedTask>(STORES.TASKS);
      const now = Date.now();
      let deletedCount = 0;

      for (const pt of allTasks) {
        const isCompleted = pt.task.status === 'completed' || pt.task.status === 'failed';
        const age = now - new Date(pt.updatedAt).getTime();

        if (isCompleted && age > maxAge) {
          await this.delete(STORES.TASKS, pt.task.id);
          deletedCount++;
        }
      }

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
      await this.put(STORES.CHECKPOINTS, checkpoint, checkpoint.id);
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

    try {
      const result = await this.get<CheckpointState>(STORES.CHECKPOINTS, checkpointId);
      return result ?? null;
    } catch (error) {
      logger.error(`Failed to load checkpoint ${checkpointId}:`, error);
      return null;
    }
  }

  async loadCheckpointByTaskId(taskId: string): Promise<CheckpointState | null> {
    if (!this.ensureInitialized()) {
      return null;
    }

    try {
      const allCheckpoints = await this.getAll<CheckpointState>(STORES.CHECKPOINTS);

      // Trouver le checkpoint le plus récent pour cette tâche
      const matching = allCheckpoints
        .filter((cp) => cp.taskId === taskId)
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());

      return matching[0] ?? null;
    } catch (error) {
      logger.error(`Failed to load checkpoint for task ${taskId}:`, error);
      return null;
    }
  }

  async listCheckpoints(): Promise<CheckpointState[]> {
    if (!this.ensureInitialized()) {
      return [];
    }

    try {
      return await this.getAll<CheckpointState>(STORES.CHECKPOINTS);
    } catch (error) {
      logger.error('Failed to list checkpoints:', error);
      return [];
    }
  }

  async deleteCheckpoint(checkpointId: string): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      await this.delete(STORES.CHECKPOINTS, checkpointId);
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
      const allCheckpoints = await this.getAll<CheckpointState>(STORES.CHECKPOINTS);
      const now = Date.now();
      let deletedCount = 0;

      for (const cp of allCheckpoints) {
        const age = now - new Date(cp.updatedAt).getTime();

        if (age > maxAge) {
          await this.delete(STORES.CHECKPOINTS, cp.id);
          deletedCount++;
        }
      }

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
      await this.put(STORES.DEAD_LETTER_QUEUE, entry, entry.id);
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

    try {
      const result = await this.get<PersistedDeadLetterEntry>(STORES.DEAD_LETTER_QUEUE, entryId);
      return result ?? null;
    } catch (error) {
      logger.error(`Failed to load DLQ entry ${entryId}:`, error);
      return null;
    }
  }

  async listDeadLetterQueue(): Promise<PersistedDeadLetterEntry[]> {
    if (!this.ensureInitialized()) {
      return [];
    }

    try {
      return await this.getAll<PersistedDeadLetterEntry>(STORES.DEAD_LETTER_QUEUE);
    } catch (error) {
      logger.error('Failed to list DLQ:', error);
      return [];
    }
  }

  async removeFromDeadLetterQueue(entryId: string): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      await this.delete(STORES.DEAD_LETTER_QUEUE, entryId);
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
      const allEntries = await this.getAll<PersistedDeadLetterEntry>(STORES.DEAD_LETTER_QUEUE);
      const now = new Date();
      let deletedCount = 0;

      for (const entry of allEntries) {
        if (new Date(entry.expiresAt) < now) {
          await this.delete(STORES.DEAD_LETTER_QUEUE, entry.id);
          deletedCount++;
        }
      }

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
      storageType: 'indexeddb',
      updatedAt: new Date(),
    };

    if (!this.ensureInitialized()) {
      return defaultStats;
    }

    try {
      const [tasks, checkpoints, dlq] = await Promise.all([
        this.getAll<PersistedTask>(STORES.TASKS),
        this.getAll<CheckpointState>(STORES.CHECKPOINTS),
        this.getAll<PersistedDeadLetterEntry>(STORES.DEAD_LETTER_QUEUE),
      ]);

      // Estimer l'espace utilisé
      const estimate = await navigator.storage?.estimate?.();

      return {
        taskCount: tasks.length,
        checkpointCount: checkpoints.length,
        dlqCount: dlq.length,
        usedSpace: estimate?.usage,
        availableSpace: estimate?.quota ? estimate.quota - (estimate.usage ?? 0) : undefined,
        storageType: 'indexeddb',
        updatedAt: new Date(),
      };
    } catch (error) {
      logger.error('Failed to get stats:', error);
      return defaultStats;
    }
  }

  async clear(): Promise<StorageOperationResult> {
    if (!this.ensureInitialized()) {
      return { success: false, error: 'Storage not initialized' };
    }

    try {
      await Promise.all([
        this.clearStore(STORES.TASKS),
        this.clearStore(STORES.CHECKPOINTS),
        this.clearStore(STORES.DEAD_LETTER_QUEUE),
      ]);

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
    const [tasks, checkpoints, deadLetterQueue] = await Promise.all([
      this.ensureInitialized() ? this.getAll<PersistedTask>(STORES.TASKS) : [],
      this.ensureInitialized() ? this.getAll<CheckpointState>(STORES.CHECKPOINTS) : [],
      this.ensureInitialized() ? this.getAll<PersistedDeadLetterEntry>(STORES.DEAD_LETTER_QUEUE) : [],
    ]);

    return {
      tasks,
      checkpoints,
      deadLetterQueue,
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
          await this.put(STORES.TASKS, pt, pt.task.id);
          importedCount++;
        }
      }

      if (data.checkpoints) {
        for (const cp of data.checkpoints) {
          await this.put(STORES.CHECKPOINTS, cp, cp.id);
          importedCount++;
        }
      }

      if (data.deadLetterQueue) {
        for (const entry of data.deadLetterQueue) {
          await this.put(STORES.DEAD_LETTER_QUEUE, entry, entry.id);
          importedCount++;
        }
      }

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

  private isIndexedDBSupported(): boolean {
    try {
      return typeof indexedDB !== 'undefined' && indexedDB !== null;
    } catch {
      return false;
    }
  }

  private ensureInitialized(): boolean {
    if (!this.isInitialized || !this.db) {
      logger.warn('Storage not initialized');
      return false;
    }
    return true;
  }

  private openDatabase(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(INDEXEDDB_NAME, INDEXEDDB_VERSION);

      request.onerror = () => {
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;

        // Créer les object stores
        if (!db.objectStoreNames.contains(STORES.TASKS)) {
          const taskStore = db.createObjectStore(STORES.TASKS, { keyPath: 'task.id' });
          taskStore.createIndex('status', 'task.status', { unique: false });
          taskStore.createIndex('createdAt', 'task.createdAt', { unique: false });
          taskStore.createIndex('assignedAgent', 'task.assignedAgent', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.CHECKPOINTS)) {
          const cpStore = db.createObjectStore(STORES.CHECKPOINTS, { keyPath: 'id' });
          cpStore.createIndex('taskId', 'taskId', { unique: false });
          cpStore.createIndex('updatedAt', 'updatedAt', { unique: false });
        }

        if (!db.objectStoreNames.contains(STORES.DEAD_LETTER_QUEUE)) {
          const dlqStore = db.createObjectStore(STORES.DEAD_LETTER_QUEUE, { keyPath: 'id' });
          dlqStore.createIndex('expiresAt', 'expiresAt', { unique: false });
          dlqStore.createIndex('taskId', 'task.id', { unique: false });
        }

        logger.info('IndexedDB schema created/upgraded');
      };
    });
  }

  private get<T>(storeName: string, key: string): Promise<T | undefined> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.get(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as T | undefined);
    });
  }

  private getAll<T>(storeName: string): Promise<T[]> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(storeName, 'readonly');
      const store = transaction.objectStore(storeName);
      const request = store.getAll();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as T[]);
    });
  }

  private put<T>(storeName: string, value: T, _key?: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.put(value);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private delete(storeName: string, key: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.delete(key);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }

  private clearStore(storeName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database not initialized'));
        return;
      }

      const transaction = this.db.transaction(storeName, 'readwrite');
      const store = transaction.objectStore(storeName);
      const request = store.clear();

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer une instance de IndexedDBStorage
 */
export function createIndexedDBStorage(): IndexedDBStorage {
  return new IndexedDBStorage();
}
