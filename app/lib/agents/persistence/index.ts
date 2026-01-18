/**
 * Persistence Module - Exports
 *
 * Module de persistance pour le système d'agents BAVINI.
 * Fournit des adaptateurs de stockage (IndexedDB, localStorage)
 * et un gestionnaire haut niveau pour les tâches et checkpoints.
 *
 * @module agents/persistence
 */

// Storage Adapter Interface & Types
export type {
  StorageAdapter,
  PersistedTask,
  PersistedDeadLetterEntry,
  TaskQueryOptions,
  StorageStats,
  StorageOperationResult,
} from './storage-adapter';

export {
  STORAGE_SCHEMA_VERSION,
  DEFAULT_TASK_RETENTION_MS,
  DEFAULT_CHECKPOINT_RETENTION_MS,
  DEFAULT_DLQ_RETENTION_MS,
  INDEXEDDB_NAME,
  INDEXEDDB_VERSION,
  LOCALSTORAGE_PREFIX,
} from './storage-adapter';

// IndexedDB Storage
export { IndexedDBStorage, createIndexedDBStorage } from './indexeddb-storage';

// LocalStorage Adapter
export { LocalStorageAdapter, createLocalStorageAdapter } from './local-storage';

// Task Persistence Manager
export type { TaskPersistenceConfig, PersistenceManagerState } from './task-persistence-manager';

export {
  TaskPersistenceManager,
  getGlobalPersistenceManager,
  initializeGlobalPersistenceManager,
  createTaskPersistenceManager,
} from './task-persistence-manager';

// Checkpoint Scheduler
export type {
  CheckpointTrigger,
  CheckpointSchedule,
  TaskCheckpointState,
  GetTaskStateCallback,
  CheckpointSchedulerConfig,
  SchedulerStats,
} from './checkpoint-scheduler';

export { CheckpointScheduler, createCheckpointScheduler, createAgentCheckpointScheduler } from './checkpoint-scheduler';

// Dead-Letter Queue with auto-retry
export type {
  DLQConfig,
  DLQEntryStatus,
  DLQErrorHistoryEntry,
  DLQEntry,
  TaskExecutorCallback,
  DLQEvent,
  DLQEventCallback,
  DLQStats,
} from './dead-letter-queue';

export {
  DEFAULT_DLQ_CONFIG,
  DeadLetterQueue,
  createDeadLetterQueue,
  getGlobalDeadLetterQueue,
  initializeGlobalDeadLetterQueue,
} from './dead-letter-queue';
