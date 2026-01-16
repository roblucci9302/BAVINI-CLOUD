/**
 * Storage Adapter - Interface d'abstraction pour la persistance
 *
 * Fournit une interface unifiée pour stocker les tâches et checkpoints
 * avec support pour IndexedDB et localStorage en fallback.
 *
 * @module agents/persistence/storage-adapter
 */

import type { Task, AgentError } from '../types';
import type { CheckpointState } from '../utils/checkpoint-manager';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Entrée de tâche persistée
 */
export interface PersistedTask {
  /** Tâche complète */
  task: Task;

  /** Date de persistance */
  persistedAt: Date;

  /** Date de dernière mise à jour */
  updatedAt: Date;

  /** Version du schéma (pour migrations) */
  schemaVersion: number;
}

/**
 * Entrée de Dead-Letter Queue persistée
 */
export interface PersistedDeadLetterEntry {
  /** ID unique */
  id: string;

  /** Tâche échouée */
  task: Task;

  /** Erreur ayant causé l'échec */
  error: AgentError;

  /** Nombre de tentatives */
  attempts: number;

  /** Date du premier échec */
  firstFailedAt: Date;

  /** Date du dernier échec */
  lastFailedAt: Date;

  /** Date d'expiration (pour purge automatique) */
  expiresAt: Date;
}

/**
 * Options de requête pour les tâches
 */
export interface TaskQueryOptions {
  /** Filtrer par statut */
  status?: Task['status'] | Task['status'][];

  /** Filtrer par agent assigné */
  assignedAgent?: string;

  /** Limiter le nombre de résultats */
  limit?: number;

  /** Décalage pour pagination */
  offset?: number;

  /** Tri */
  orderBy?: 'createdAt' | 'updatedAt' | 'priority';

  /** Ordre (asc ou desc) */
  order?: 'asc' | 'desc';
}

/**
 * Statistiques de stockage
 */
export interface StorageStats {
  /** Nombre de tâches stockées */
  taskCount: number;

  /** Nombre de checkpoints stockés */
  checkpointCount: number;

  /** Nombre d'entrées DLQ */
  dlqCount: number;

  /** Espace utilisé (octets, si disponible) */
  usedSpace?: number;

  /** Espace disponible (octets, si disponible) */
  availableSpace?: number;

  /** Type de stockage actif */
  storageType: 'indexeddb' | 'localstorage' | 'memory';

  /** Dernière mise à jour des stats */
  updatedAt: Date;
}

/**
 * Résultat d'une opération de stockage
 */
export interface StorageOperationResult {
  success: boolean;
  error?: string;
  affectedCount?: number;
}

/*
 * ============================================================================
 * INTERFACE PRINCIPALE
 * ============================================================================
 */

/**
 * Interface d'abstraction pour le stockage persistant
 *
 * Unifie l'accès aux tâches, checkpoints et DLQ avec support
 * pour différents backends (IndexedDB, localStorage, mémoire).
 */
export interface StorageAdapter {
  /*
   * ==========================================================================
   * LIFECYCLE
   * ==========================================================================
   */

  /**
   * Initialiser le stockage
   * @returns Promise résolvant à true si l'initialisation réussit
   */
  initialize(): Promise<boolean>;

  /**
   * Fermer le stockage proprement
   */
  close(): Promise<void>;

  /**
   * Vérifier si le stockage est disponible et opérationnel
   */
  isAvailable(): boolean;

  /**
   * Obtenir le type de stockage
   */
  getStorageType(): 'indexeddb' | 'localstorage' | 'memory';

  /*
   * ==========================================================================
   * TÂCHES
   * ==========================================================================
   */

  /**
   * Sauvegarder une tâche
   */
  saveTask(task: Task): Promise<StorageOperationResult>;

  /**
   * Charger une tâche par ID
   */
  loadTask(taskId: string): Promise<PersistedTask | null>;

  /**
   * Charger toutes les tâches en attente (pending, queued, in_progress)
   */
  loadPendingTasks(): Promise<PersistedTask[]>;

  /**
   * Requête avancée sur les tâches
   */
  queryTasks(options: TaskQueryOptions): Promise<PersistedTask[]>;

  /**
   * Mettre à jour une tâche existante
   */
  updateTask(taskId: string, updates: Partial<Task>): Promise<StorageOperationResult>;

  /**
   * Supprimer une tâche
   */
  deleteTask(taskId: string): Promise<StorageOperationResult>;

  /**
   * Supprimer les tâches terminées plus anciennes que maxAge
   */
  cleanupTasks(maxAge: number): Promise<StorageOperationResult>;

  /*
   * ==========================================================================
   * CHECKPOINTS
   * ==========================================================================
   */

  /**
   * Sauvegarder un checkpoint
   */
  saveCheckpoint(checkpoint: CheckpointState): Promise<StorageOperationResult>;

  /**
   * Charger un checkpoint par ID
   */
  loadCheckpoint(checkpointId: string): Promise<CheckpointState | null>;

  /**
   * Charger un checkpoint par ID de tâche
   */
  loadCheckpointByTaskId(taskId: string): Promise<CheckpointState | null>;

  /**
   * Lister tous les checkpoints
   */
  listCheckpoints(): Promise<CheckpointState[]>;

  /**
   * Supprimer un checkpoint
   */
  deleteCheckpoint(checkpointId: string): Promise<StorageOperationResult>;

  /**
   * Nettoyer les vieux checkpoints
   */
  cleanupCheckpoints(maxAge: number): Promise<StorageOperationResult>;

  /*
   * ==========================================================================
   * DEAD-LETTER QUEUE
   * ==========================================================================
   */

  /**
   * Ajouter une entrée à la DLQ
   */
  addToDeadLetterQueue(entry: PersistedDeadLetterEntry): Promise<StorageOperationResult>;

  /**
   * Charger une entrée DLQ par ID
   */
  loadDeadLetterEntry(entryId: string): Promise<PersistedDeadLetterEntry | null>;

  /**
   * Lister toutes les entrées DLQ
   */
  listDeadLetterQueue(): Promise<PersistedDeadLetterEntry[]>;

  /**
   * Supprimer une entrée DLQ
   */
  removeFromDeadLetterQueue(entryId: string): Promise<StorageOperationResult>;

  /**
   * Purger les entrées DLQ expirées
   */
  purgeDeadLetterQueue(): Promise<StorageOperationResult>;

  /*
   * ==========================================================================
   * UTILITAIRES
   * ==========================================================================
   */

  /**
   * Obtenir les statistiques de stockage
   */
  getStats(): Promise<StorageStats>;

  /**
   * Vider tout le stockage (attention: destructif!)
   */
  clear(): Promise<StorageOperationResult>;

  /**
   * Exporter toutes les données (pour backup)
   */
  exportData(): Promise<{
    tasks: PersistedTask[];
    checkpoints: CheckpointState[];
    deadLetterQueue: PersistedDeadLetterEntry[];
    exportedAt: Date;
  }>;

  /**
   * Importer des données (pour restore)
   */
  importData(data: {
    tasks?: PersistedTask[];
    checkpoints?: CheckpointState[];
    deadLetterQueue?: PersistedDeadLetterEntry[];
  }): Promise<StorageOperationResult>;
}

/*
 * ============================================================================
 * CONSTANTES
 * ============================================================================
 */

/** Version actuelle du schéma de stockage */
export const STORAGE_SCHEMA_VERSION = 1;

/** Durée de rétention par défaut pour les tâches terminées (7 jours) */
export const DEFAULT_TASK_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

/** Durée de rétention par défaut pour les checkpoints (24 heures) */
export const DEFAULT_CHECKPOINT_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Durée de rétention par défaut pour la DLQ (24 heures) */
export const DEFAULT_DLQ_RETENTION_MS = 24 * 60 * 60 * 1000;

/** Nom de la base IndexedDB */
export const INDEXEDDB_NAME = 'bavini-agents-persistence';

/** Version de la base IndexedDB */
export const INDEXEDDB_VERSION = 1;

/** Préfixe pour les clés localStorage */
export const LOCALSTORAGE_PREFIX = 'bavini-agents:';
