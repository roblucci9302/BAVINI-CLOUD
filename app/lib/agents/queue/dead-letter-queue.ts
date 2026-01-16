/**
 * Dead-Letter Queue - Queue pour les tâches définitivement échouées
 *
 * Stocke les tâches qui ont échoué après tous les retries pour
 * analyse, retry manuel, ou purge automatique.
 *
 * @module agents/queue/dead-letter-queue
 */

import type { Task, AgentError, AgentEvent } from '../types';
import type { TaskPersistenceManager } from '../persistence/task-persistence-manager';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DeadLetterQueue');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Entrée dans la Dead-Letter Queue
 */
export interface DeadLetterEntry {
  /** ID unique de l'entrée */
  id: string;

  /** Tâche originale */
  task: Task;

  /** Erreur ayant causé l'échec final */
  error: AgentError;

  /** Nombre total de tentatives */
  attempts: number;

  /** Timestamp du premier échec */
  firstFailedAt: Date;

  /** Timestamp du dernier échec */
  lastFailedAt: Date;

  /** Date d'expiration (pour purge auto) */
  expiresAt: Date;

  /** Historique des erreurs */
  errorHistory: Array<{
    error: AgentError;
    timestamp: Date;
    attempt: number;
  }>;

  /** Métadonnées */
  metadata?: Record<string, unknown>;
}

/**
 * Configuration de la Dead-Letter Queue
 */
export interface DeadLetterQueueConfig {
  /** Durée de rétention avant purge auto (ms) - défaut: 24h */
  retentionMs: number;

  /** Taille maximale de la queue */
  maxSize: number;

  /** Intervalle de purge automatique (ms) - 0 = désactivé */
  purgeIntervalMs: number;

  /** Callback pour les événements */
  onEvent?: (event: AgentEvent) => void;

  /** Gestionnaire de persistance (optionnel) */
  persistenceManager?: TaskPersistenceManager;
}

/**
 * Statistiques de la DLQ
 */
export interface DeadLetterQueueStats {
  /** Nombre total d'entrées */
  total: number;

  /** Entrées par code d'erreur */
  byErrorCode: Record<string, number>;

  /** Entrées par type de tâche */
  byTaskType: Record<string, number>;

  /** Nombre d'entrées expirées (à purger) */
  expiredCount: number;

  /** Nombre de retries effectués depuis la DLQ */
  retriedCount: number;

  /** Nombre d'entrées purgées */
  purgedCount: number;

  /** Âge moyen des entrées (ms) */
  averageAge: number;
}

/**
 * Options pour ajouter une entrée
 */
export interface AddToDLQOptions {
  /** Historique des erreurs précédentes */
  errorHistory?: DeadLetterEntry['errorHistory'];

  /** Métadonnées supplémentaires */
  metadata?: Record<string, unknown>;

  /** Durée de rétention personnalisée (ms) */
  customRetentionMs?: number;
}

/*
 * ============================================================================
 * DEAD-LETTER QUEUE
 * ============================================================================
 */

/**
 * Dead-Letter Queue pour les tâches définitivement échouées
 *
 * Permet de:
 * - Stocker les tâches échouées pour analyse
 * - Retry manuel des tâches
 * - Purge automatique après expiration
 * - Persistance optionnelle
 */
export class DeadLetterQueue {
  private entries: Map<string, DeadLetterEntry> = new Map();
  private config: DeadLetterQueueConfig;
  private purgeTimer: NodeJS.Timeout | null = null;
  private stats = {
    retriedCount: 0,
    purgedCount: 0,
  };

  constructor(config?: Partial<DeadLetterQueueConfig>) {
    this.config = {
      retentionMs: config?.retentionMs ?? 24 * 60 * 60 * 1000, // 24 heures
      maxSize: config?.maxSize ?? 1000,
      purgeIntervalMs: config?.purgeIntervalMs ?? 60 * 60 * 1000, // 1 heure
      onEvent: config?.onEvent,
      persistenceManager: config?.persistenceManager,
    };

    if (this.config.purgeIntervalMs > 0) {
      this.startPurgeTimer();
    }
  }

  /*
   * ==========================================================================
   * PUBLIC API
   * ==========================================================================
   */

  /**
   * Ajouter une tâche échouée à la DLQ
   */
  async add(task: Task, error: AgentError, attempts: number, options?: AddToDLQOptions): Promise<DeadLetterEntry> {
    // Vérifier la taille maximale
    if (this.entries.size >= this.config.maxSize) {
      // Purger les entrées expirées d'abord
      await this.purgeExpired();

      // Si toujours plein, supprimer la plus ancienne
      if (this.entries.size >= this.config.maxSize) {
        const oldest = this.getOldestEntry();

        if (oldest) {
          await this.remove(oldest.id);
          logger.warn('DLQ full, removed oldest entry', { removedId: oldest.id });
        }
      }
    }

    const now = new Date();
    const retentionMs = options?.customRetentionMs ?? this.config.retentionMs;

    const entry: DeadLetterEntry = {
      id: this.generateEntryId(task.id),
      task,
      error,
      attempts,
      firstFailedAt: now,
      lastFailedAt: now,
      expiresAt: new Date(now.getTime() + retentionMs),
      errorHistory: options?.errorHistory ?? [
        {
          error,
          timestamp: now,
          attempt: attempts,
        },
      ],
      metadata: options?.metadata,
    };

    this.entries.set(entry.id, entry);

    // Persister si configuré
    if (this.config.persistenceManager) {
      await this.config.persistenceManager.addToDeadLetterQueue(task, error, attempts);
    }

    this.emitEvent('task:failed', task.id, {
      entry,
      reason: 'Added to dead-letter queue',
    });

    logger.info(`Task added to DLQ: ${task.id}`, {
      entryId: entry.id,
      errorCode: error.code,
      attempts,
    });

    return entry;
  }

  /**
   * Obtenir une entrée par ID
   */
  get(entryId: string): DeadLetterEntry | undefined {
    return this.entries.get(entryId);
  }

  /**
   * Obtenir une entrée par ID de tâche
   */
  getByTaskId(taskId: string): DeadLetterEntry | undefined {
    for (const entry of this.entries.values()) {
      if (entry.task.id === taskId) {
        return entry;
      }
    }
    return undefined;
  }

  /**
   * Lister toutes les entrées
   */
  list(): DeadLetterEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Lister les entrées par code d'erreur
   */
  listByErrorCode(errorCode: string): DeadLetterEntry[] {
    return this.list().filter((entry) => entry.error.code === errorCode);
  }

  /**
   * Lister les entrées par type de tâche
   */
  listByTaskType(taskType: string): DeadLetterEntry[] {
    return this.list().filter((entry) => entry.task.type === taskType);
  }

  /**
   * Lister les entrées expirées
   */
  listExpired(): DeadLetterEntry[] {
    const now = new Date();
    return this.list().filter((entry) => entry.expiresAt < now);
  }

  /**
   * Supprimer une entrée
   */
  async remove(entryId: string): Promise<boolean> {
    const entry = this.entries.get(entryId);

    if (!entry) {
      return false;
    }

    this.entries.delete(entryId);

    // Supprimer de la persistance si configuré
    if (this.config.persistenceManager) {
      await this.config.persistenceManager.removeFromDeadLetterQueue(entryId);
    }

    logger.debug(`Entry removed from DLQ: ${entryId}`);
    return true;
  }

  /**
   * Préparer une tâche pour retry (supprime de la DLQ)
   */
  async prepareForRetry(entryId: string): Promise<Task | null> {
    const entry = this.entries.get(entryId);

    if (!entry) {
      return null;
    }

    // Créer une copie de la tâche avec statut réinitialisé
    const taskForRetry: Task = {
      ...entry.task,
      status: 'pending',
      result: undefined,
      startedAt: undefined,
      completedAt: undefined,
      metadata: {
        ...entry.task.metadata,
        retryCount: (entry.task.metadata?.retryCount ?? 0) + 1,
        retriedFromDLQ: true,
        originalDLQEntryId: entryId,
      },
    };

    // Supprimer de la DLQ
    await this.remove(entryId);
    this.stats.retriedCount++;

    logger.info(`Task prepared for retry from DLQ: ${entry.task.id}`, {
      entryId,
      newRetryCount: taskForRetry.metadata?.retryCount,
    });

    return taskForRetry;
  }

  /**
   * Purger les entrées expirées
   */
  async purgeExpired(): Promise<number> {
    const expired = this.listExpired();
    let purgedCount = 0;

    for (const entry of expired) {
      const removed = await this.remove(entry.id);

      if (removed) {
        purgedCount++;
      }
    }

    this.stats.purgedCount += purgedCount;

    if (purgedCount > 0) {
      logger.info(`Purged ${purgedCount} expired entries from DLQ`);
    }

    return purgedCount;
  }

  /**
   * Vider complètement la DLQ
   */
  async clear(): Promise<number> {
    const count = this.entries.size;
    this.entries.clear();

    logger.info(`DLQ cleared: ${count} entries removed`);
    return count;
  }

  /**
   * Obtenir les statistiques
   */
  getStats(): DeadLetterQueueStats {
    const entries = this.list();
    const now = Date.now();

    const byErrorCode: Record<string, number> = {};
    const byTaskType: Record<string, number> = {};
    let totalAge = 0;
    let expiredCount = 0;

    for (const entry of entries) {
      // Par code d'erreur
      byErrorCode[entry.error.code] = (byErrorCode[entry.error.code] ?? 0) + 1;

      // Par type de tâche
      byTaskType[entry.task.type] = (byTaskType[entry.task.type] ?? 0) + 1;

      // Âge
      totalAge += now - entry.firstFailedAt.getTime();

      // Expirées
      if (entry.expiresAt.getTime() < now) {
        expiredCount++;
      }
    }

    return {
      total: entries.length,
      byErrorCode,
      byTaskType,
      expiredCount,
      retriedCount: this.stats.retriedCount,
      purgedCount: this.stats.purgedCount,
      averageAge: entries.length > 0 ? totalAge / entries.length : 0,
    };
  }

  /**
   * Obtenir le nombre d'entrées
   */
  size(): number {
    return this.entries.size;
  }

  /**
   * Vérifier si la DLQ est vide
   */
  isEmpty(): boolean {
    return this.entries.size === 0;
  }

  /**
   * Détruire la DLQ proprement
   */
  destroy(): void {
    this.stopPurgeTimer();
    this.entries.clear();
    logger.info('DLQ destroyed');
  }

  /*
   * ==========================================================================
   * HELPERS
   * ==========================================================================
   */

  /**
   * Générer un ID d'entrée unique
   */
  private generateEntryId(taskId: string): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8);
    return `dlq-${taskId}-${timestamp}-${random}`;
  }

  /**
   * Obtenir l'entrée la plus ancienne
   */
  private getOldestEntry(): DeadLetterEntry | undefined {
    let oldest: DeadLetterEntry | undefined;

    for (const entry of this.entries.values()) {
      if (!oldest || entry.firstFailedAt < oldest.firstFailedAt) {
        oldest = entry;
      }
    }

    return oldest;
  }

  /**
   * Démarrer le timer de purge automatique
   */
  private startPurgeTimer(): void {
    this.purgeTimer = setInterval(() => {
      this.purgeExpired().catch((error) => {
        logger.error('Auto-purge failed:', error);
      });
    }, this.config.purgeIntervalMs);
  }

  /**
   * Arrêter le timer de purge
   */
  private stopPurgeTimer(): void {
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
      this.purgeTimer = null;
    }
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
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer une Dead-Letter Queue
 */
export function createDeadLetterQueue(config?: Partial<DeadLetterQueueConfig>): DeadLetterQueue {
  return new DeadLetterQueue(config);
}

/**
 * Créer une DLQ avec persistance
 */
export function createPersistentDeadLetterQueue(
  persistenceManager: TaskPersistenceManager,
  config?: Partial<Omit<DeadLetterQueueConfig, 'persistenceManager'>>,
): DeadLetterQueue {
  return new DeadLetterQueue({
    ...config,
    persistenceManager,
  });
}
