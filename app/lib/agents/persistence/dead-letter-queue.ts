/**
 * Dead-Letter Queue avec reprise automatique
 *
 * Module de gestion des tâches échouées avec:
 * - Reprise automatique avec backoff exponentiel
 * - Détection des "poison pills" (tâches toujours en échec)
 * - Configuration flexible des retries
 * - Intégration avec le système de persistance
 *
 * @module agents/persistence/dead-letter-queue
 */

import type { Task, TaskResult, AgentError } from '../types';
import type { StorageAdapter, PersistedDeadLetterEntry } from './storage-adapter';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DeadLetterQueue');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Configuration de la détection des poison pills
 */
export interface PoisonPillConfig {
  /** Activer la détection avancée des poison pills */
  enabled: boolean;

  /** Nombre minimum d'échecs pour déclencher la détection */
  minFailures: number;

  /** Seuil de similarité des erreurs (0-1, 1 = identiques) */
  errorSimilarityThreshold: number;

  /** Action à prendre quand un poison pill est détecté */
  action: 'quarantine' | 'alert' | 'skip';
}

/**
 * Configuration de la Dead-Letter Queue
 */
export interface DLQConfig {
  /** Nombre maximum de retries avant abandon définitif */
  maxRetries: number;

  /** Délai initial entre retries (ms) */
  retryDelayMs: number;

  /** Multiplicateur de backoff exponentiel */
  backoffMultiplier: number;

  /** Délai maximum entre retries (ms) */
  maxRetryDelayMs: number;

  /** Activer la reprise automatique */
  autoRetryEnabled: boolean;

  /** Intervalle de vérification pour retry automatique (ms) */
  autoRetryIntervalMs: number;

  /** Durée de rétention des entrées définitivement échouées (ms) */
  permanentFailureRetentionMs: number;

  /** Configuration de la détection des poison pills */
  poisonPill: PoisonPillConfig;
}

/**
 * Statut d'une entrée DLQ
 */
export type DLQEntryStatus =
  | 'pending_retry'
  | 'retrying'
  | 'permanent_failure'
  | 'recovered'
  | 'quarantined'
  | 'skipped';

/**
 * Historique d'erreur pour une entrée DLQ
 */
export interface DLQErrorHistoryEntry {
  /** Message d'erreur */
  message: string;

  /** Code d'erreur */
  code?: string;

  /** Timestamp de l'erreur */
  timestamp: Date;

  /** Numéro de tentative */
  attemptNumber: number;
}

/**
 * Entrée DLQ étendue avec informations de retry
 */
export interface DLQEntry extends PersistedDeadLetterEntry {
  /** Statut de l'entrée */
  status: DLQEntryStatus;

  /** Nombre de retries effectués */
  retryCount: number;

  /** Date de la dernière tentative */
  lastAttemptAt: Date;

  /** Prochaine tentative planifiée */
  nextRetryAt?: Date;

  /** Historique des erreurs */
  errorHistory: DLQErrorHistoryEntry[];

  /** Est-ce un poison pill détecté ? */
  isPoisonPill: boolean;

  /** Score de similarité des erreurs (0-1) */
  errorSimilarityScore?: number;

  /** Date de mise en quarantaine (si applicable) */
  quarantinedAt?: Date;

  /** Raison de la mise en quarantaine ou du skip */
  poisonPillReason?: string;
}

/**
 * Callback pour exécuter une tâche lors du retry
 */
export type TaskExecutorCallback = (task: Task) => Promise<TaskResult>;

/**
 * Événement de la DLQ
 */
export interface DLQEvent {
  type: 'retry_started' | 'retry_succeeded' | 'retry_failed' | 'permanent_failure' | 'poison_pill_detected';
  entryId: string;
  taskId: string;
  data?: Record<string, unknown>;
}

/**
 * Callback pour les événements DLQ
 */
export type DLQEventCallback = (event: DLQEvent) => void;

/**
 * Statistiques de la DLQ
 */
export interface DLQStats {
  /** Nombre total d'entrées */
  totalEntries: number;

  /** Entrées en attente de retry */
  pendingRetry: number;

  /** Entrées en cours de retry */
  retrying: number;

  /** Échecs permanents */
  permanentFailures: number;

  /** Tâches récupérées avec succès */
  recovered: number;

  /** Poison pills détectés */
  poisonPills: number;

  /** Entrées en quarantaine */
  quarantined: number;

  /** Entrées ignorées (skipped) */
  skipped: number;

  /** Taux de récupération (%) */
  recoveryRate: number;

  /** Score moyen de similarité des erreurs pour les poison pills */
  averagePoisonPillSimilarity: number;
}

/*
 * ============================================================================
 * CONFIGURATION PAR DÉFAUT
 * ============================================================================
 */

/**
 * Configuration par défaut des poison pills
 */
export const DEFAULT_POISON_PILL_CONFIG: PoisonPillConfig = {
  enabled: true,
  minFailures: 3,
  errorSimilarityThreshold: 0.8, // 80% de similarité
  action: 'quarantine',
};

/**
 * Configuration par défaut de la DLQ
 */
export const DEFAULT_DLQ_CONFIG: DLQConfig = {
  maxRetries: 3,
  retryDelayMs: 5000, // 5 secondes
  backoffMultiplier: 2,
  maxRetryDelayMs: 60000, // 1 minute max
  autoRetryEnabled: true,
  autoRetryIntervalMs: 30000, // Vérifier toutes les 30 secondes
  permanentFailureRetentionMs: 24 * 60 * 60 * 1000, // 24 heures
  poisonPill: DEFAULT_POISON_PILL_CONFIG,
};

/*
 * ============================================================================
 * DEAD-LETTER QUEUE
 * ============================================================================
 */

/**
 * Dead-Letter Queue avec reprise automatique
 *
 * @example
 * ```typescript
 * const dlq = new DeadLetterQueue(storage, {
 *   maxRetries: 5,
 *   autoRetryEnabled: true,
 * });
 *
 * // Configurer l'exécuteur de tâches
 * dlq.setTaskExecutor(async (task) => {
 *   return await someAgent.run(task, apiKey);
 * });
 *
 * // Ajouter une tâche échouée
 * await dlq.add(failedTask, error);
 *
 * // Les retries se feront automatiquement
 * ```
 */
export class DeadLetterQueue {
  private entries: Map<string, DLQEntry> = new Map();
  private storage: StorageAdapter | null = null;
  private config: DLQConfig;
  private retryTimer: ReturnType<typeof setInterval> | null = null;
  private taskExecutor: TaskExecutorCallback | null = null;
  private eventCallback: DLQEventCallback | null = null;
  private isProcessing: boolean = false;

  constructor(storage?: StorageAdapter, config: Partial<DLQConfig> = {}) {
    this.storage = storage || null;
    this.config = {
      ...DEFAULT_DLQ_CONFIG,
      ...config,
      // Fusionner la config poison pill séparément pour éviter l'écrasement
      poisonPill: {
        ...DEFAULT_POISON_PILL_CONFIG,
        ...config.poisonPill,
      },
    };

    // Démarrer le retry automatique si activé
    if (this.config.autoRetryEnabled) {
      this.startAutoRetry();
    }
  }

  /*
   * ============================================================================
   * CONFIGURATION
   * ============================================================================
   */

  /**
   * Configurer l'exécuteur de tâches pour les retries
   */
  setTaskExecutor(executor: TaskExecutorCallback): void {
    this.taskExecutor = executor;
    logger.info('Task executor configured for DLQ');
  }

  /**
   * Configurer le callback d'événements
   */
  setEventCallback(callback: DLQEventCallback): void {
    this.eventCallback = callback;
  }

  /**
   * Configurer le stockage
   */
  setStorage(storage: StorageAdapter): void {
    this.storage = storage;
  }

  /**
   * Mettre à jour la configuration
   */
  updateConfig(config: Partial<DLQConfig>): void {
    const wasAutoRetryEnabled = this.config.autoRetryEnabled;
    this.config = { ...this.config, ...config };

    // Gérer le changement de l'état autoRetry
    if (this.config.autoRetryEnabled && !wasAutoRetryEnabled) {
      this.startAutoRetry();
    } else if (!this.config.autoRetryEnabled && wasAutoRetryEnabled) {
      this.stopAutoRetry();
    }
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfig(): DLQConfig {
    return { ...this.config };
  }

  /*
   * ============================================================================
   * GESTION DES ENTRÉES
   * ============================================================================
   */

  /**
   * Ajouter une tâche échouée à la DLQ
   */
  async add(task: Task, error: AgentError): Promise<DLQEntry> {
    const entryId = `dlq-${task.id}-${Date.now()}`;
    const now = new Date();

    const entry: DLQEntry = {
      id: entryId,
      task,
      error,
      attempts: 1,
      firstFailedAt: now,
      lastFailedAt: now,
      expiresAt: new Date(now.getTime() + this.config.permanentFailureRetentionMs),
      status: 'pending_retry',
      retryCount: 0,
      lastAttemptAt: now,
      nextRetryAt: new Date(now.getTime() + this.config.retryDelayMs),
      errorHistory: [
        {
          message: error.message,
          code: error.code,
          timestamp: now,
          attemptNumber: 1,
        },
      ],
      isPoisonPill: false,
    };

    this.entries.set(entryId, entry);

    // Persister si le stockage est configuré
    if (this.storage) {
      await this.storage.addToDeadLetterQueue(entry);
    }

    logger.info('Task added to DLQ', {
      entryId,
      taskId: task.id,
      error: error.message,
      nextRetryAt: entry.nextRetryAt?.toISOString(),
    });

    return entry;
  }

  /**
   * Obtenir une entrée par ID
   */
  get(entryId: string): DLQEntry | undefined {
    return this.entries.get(entryId);
  }

  /**
   * Obtenir une entrée par ID de tâche
   */
  getByTaskId(taskId: string): DLQEntry | undefined {
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
  list(): DLQEntry[] {
    return Array.from(this.entries.values());
  }

  /**
   * Lister les entrées prêtes pour retry
   */
  getRetryableEntries(): DLQEntry[] {
    const now = Date.now();
    return Array.from(this.entries.values()).filter((entry) => {
      if (entry.status !== 'pending_retry') {
        return false;
      }
      if (entry.isPoisonPill) {
        return false;
      }
      if (entry.retryCount >= this.config.maxRetries) {
        return false;
      }
      if (entry.nextRetryAt && entry.nextRetryAt.getTime() > now) {
        return false;
      }
      return true;
    });
  }

  /**
   * Supprimer une entrée
   */
  async remove(entryId: string): Promise<boolean> {
    const deleted = this.entries.delete(entryId);

    if (deleted && this.storage) {
      await this.storage.removeFromDeadLetterQueue(entryId);
    }

    return deleted;
  }

  /**
   * Vider toutes les entrées
   */
  async clear(): Promise<void> {
    this.entries.clear();

    if (this.storage) {
      const entries = await this.storage.listDeadLetterQueue();
      for (const entry of entries) {
        await this.storage.removeFromDeadLetterQueue(entry.id);
      }
    }
  }

  /*
   * ============================================================================
   * RETRY AUTOMATIQUE
   * ============================================================================
   */

  /**
   * Démarrer le retry automatique
   */
  private startAutoRetry(): void {
    if (this.retryTimer) {
      return;
    }

    this.retryTimer = setInterval(() => {
      void this.processRetries();
    }, this.config.autoRetryIntervalMs);

    logger.info('Auto-retry started', { intervalMs: this.config.autoRetryIntervalMs });
  }

  /**
   * Arrêter le retry automatique
   */
  private stopAutoRetry(): void {
    if (this.retryTimer) {
      clearInterval(this.retryTimer);
      this.retryTimer = null;
      logger.info('Auto-retry stopped');
    }
  }

  /**
   * Traiter les retries en attente
   */
  async processRetries(): Promise<void> {
    // Éviter les exécutions concurrentes
    if (this.isProcessing) {
      return;
    }

    if (!this.taskExecutor) {
      logger.warn('Cannot process retries: no task executor configured');
      return;
    }

    this.isProcessing = true;

    try {
      const retryableEntries = this.getRetryableEntries();

      logger.debug('Processing DLQ retries', { count: retryableEntries.length });

      for (const entry of retryableEntries) {
        await this.retryEntry(entry);
      }
    } catch (error) {
      logger.error('Error processing DLQ retries', {
        error: error instanceof Error ? error.message : String(error),
      });
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Retenter une entrée spécifique
   */
  async retryEntry(entry: DLQEntry): Promise<TaskResult | null> {
    // Vérifier si le retry est possible
    if (entry.retryCount >= this.config.maxRetries) {
      this.markAsPermanentFailure(entry);
      return null;
    }

    if (!this.taskExecutor) {
      logger.error('Cannot retry: no task executor configured');
      return null;
    }

    // Marquer comme en cours de retry
    entry.status = 'retrying';
    const attemptNumber = entry.retryCount + 1;

    this.emitEvent({
      type: 'retry_started',
      entryId: entry.id,
      taskId: entry.task.id,
      data: { attemptNumber, maxRetries: this.config.maxRetries },
    });

    logger.info('Retrying DLQ task', {
      entryId: entry.id,
      taskId: entry.task.id,
      attemptNumber,
      maxRetries: this.config.maxRetries,
    });

    try {
      const result = await this.taskExecutor(entry.task);

      if (result.success) {
        // Succès: marquer comme récupéré et supprimer
        entry.status = 'recovered';

        this.emitEvent({
          type: 'retry_succeeded',
          entryId: entry.id,
          taskId: entry.task.id,
          data: { attemptNumber },
        });

        logger.info('DLQ task succeeded on retry', {
          entryId: entry.id,
          taskId: entry.task.id,
          attemptNumber,
        });

        // Supprimer de la DLQ
        await this.remove(entry.id);

        return result;
      } else {
        // Échec: mettre à jour l'entrée
        this.recordFailedAttempt(entry, result.errors?.[0] || { code: 'UNKNOWN', message: result.output || 'Unknown error', recoverable: true });
        return result;
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordFailedAttempt(entry, {
        code: 'RETRY_ERROR',
        message: errorMessage,
        recoverable: true,
      });
      return null;
    }
  }

  /**
   * Enregistrer une tentative échouée
   */
  private recordFailedAttempt(entry: DLQEntry, error: AgentError): void {
    const now = new Date();

    entry.retryCount++;
    entry.lastAttemptAt = now;
    entry.lastFailedAt = now;
    entry.error = error;

    // Ajouter à l'historique des erreurs
    entry.errorHistory.push({
      message: error.message,
      code: error.code,
      timestamp: now,
      attemptNumber: entry.retryCount + 1,
    });

    // Calculer le prochain délai de retry avec backoff
    const retryDelay = this.calculateRetryDelay(entry.retryCount);
    entry.nextRetryAt = new Date(now.getTime() + retryDelay);
    entry.status = 'pending_retry';

    // Vérifier si c'est un poison pill
    if (this.detectPoisonPill(entry)) {
      entry.isPoisonPill = true;

      this.emitEvent({
        type: 'poison_pill_detected',
        entryId: entry.id,
        taskId: entry.task.id,
        data: { errorPattern: entry.errorHistory.slice(-3).map((e) => e.message) },
      });

      logger.warn('Poison pill detected', {
        entryId: entry.id,
        taskId: entry.task.id,
        retryCount: entry.retryCount,
      });
    }

    // Vérifier si on a atteint le max de retries
    if (entry.retryCount >= this.config.maxRetries) {
      this.markAsPermanentFailure(entry);
    } else {
      this.emitEvent({
        type: 'retry_failed',
        entryId: entry.id,
        taskId: entry.task.id,
        data: {
          attemptNumber: entry.retryCount,
          nextRetryAt: entry.nextRetryAt?.toISOString(),
          error: error.message,
        },
      });
    }

    // Mettre à jour le stockage
    if (this.storage) {
      void this.storage.addToDeadLetterQueue(entry);
    }
  }

  /**
   * Marquer une entrée comme échec permanent
   */
  private markAsPermanentFailure(entry: DLQEntry): void {
    entry.status = 'permanent_failure';
    entry.nextRetryAt = undefined;

    this.emitEvent({
      type: 'permanent_failure',
      entryId: entry.id,
      taskId: entry.task.id,
      data: {
        retryCount: entry.retryCount,
        totalErrors: entry.errorHistory.length,
      },
    });

    logger.error('Task permanently failed after max retries', {
      entryId: entry.id,
      taskId: entry.task.id,
      retryCount: entry.retryCount,
    });

    // Mettre à jour le stockage
    if (this.storage) {
      void this.storage.addToDeadLetterQueue(entry);
    }
  }

  /*
   * ============================================================================
   * CALCULS ET DÉTECTION
   * ============================================================================
   */

  /**
   * Calculer le délai de retry avec backoff exponentiel
   */
  private calculateRetryDelay(retryCount: number): number {
    const delay = this.config.retryDelayMs * Math.pow(this.config.backoffMultiplier, retryCount);
    return Math.min(delay, this.config.maxRetryDelayMs);
  }

  /**
   * Détecter un poison pill basé sur la similarité des erreurs
   *
   * Utilise l'algorithme de Levenshtein pour calculer la similarité
   * entre les messages d'erreur récents.
   */
  private detectPoisonPill(entry: DLQEntry): boolean {
    const config = this.config.poisonPill;

    // Vérifier si la détection est activée
    if (!config.enabled) {
      return false;
    }

    // Nécessite au moins minFailures tentatives
    if (entry.errorHistory.length < config.minFailures) {
      return false;
    }

    // Obtenir les dernières erreurs
    const recentErrors = entry.errorHistory.slice(-config.minFailures);
    const errorMessages = recentErrors.map((e) => e.message);

    // Calculer la similarité
    const similarity = this.calculateErrorSimilarity(errorMessages);
    entry.errorSimilarityScore = similarity;

    // Vérifier si le seuil est atteint
    if (similarity >= config.errorSimilarityThreshold) {
      this.handlePoisonPill(entry, similarity);
      return true;
    }

    return false;
  }

  /**
   * Calculer la similarité moyenne entre plusieurs messages d'erreur
   *
   * @returns Score entre 0 (aucune similarité) et 1 (identiques)
   */
  private calculateErrorSimilarity(errors: string[]): number {
    if (errors.length < 2) {
      return 0;
    }

    let totalSimilarity = 0;
    let comparisons = 0;

    // Comparer chaque paire d'erreurs
    for (let i = 0; i < errors.length - 1; i++) {
      for (let j = i + 1; j < errors.length; j++) {
        totalSimilarity += this.stringSimilarity(errors[i], errors[j]);
        comparisons++;
      }
    }

    return comparisons > 0 ? totalSimilarity / comparisons : 0;
  }

  /**
   * Calculer la similarité entre deux chaînes (0-1)
   *
   * Utilise la distance de Levenshtein normalisée.
   */
  private stringSimilarity(a: string, b: string): number {
    const maxLength = Math.max(a.length, b.length);

    if (maxLength === 0) {
      return 1; // Deux chaînes vides sont identiques
    }

    const distance = this.levenshteinDistance(a, b);
    return 1 - distance / maxLength;
  }

  /**
   * Calculer la distance de Levenshtein entre deux chaînes
   *
   * Algorithme classique avec optimisation mémoire (utilise O(min(m,n)) espace).
   */
  private levenshteinDistance(a: string, b: string): number {
    // Optimisation: s'assurer que 'a' est la chaîne la plus courte
    if (a.length > b.length) {
      [a, b] = [b, a];
    }

    const m = a.length;
    const n = b.length;

    // Cas de base
    if (m === 0) {
      return n;
    }

    // Utiliser deux lignes au lieu d'une matrice complète
    let previousRow = new Array(m + 1);
    let currentRow = new Array(m + 1);

    // Initialiser la première ligne
    for (let i = 0; i <= m; i++) {
      previousRow[i] = i;
    }

    // Remplir la matrice ligne par ligne
    for (let j = 1; j <= n; j++) {
      currentRow[0] = j;

      for (let i = 1; i <= m; i++) {
        const cost = a[i - 1] === b[j - 1] ? 0 : 1;

        currentRow[i] = Math.min(
          previousRow[i] + 1, // Suppression
          currentRow[i - 1] + 1, // Insertion
          previousRow[i - 1] + cost, // Substitution
        );
      }

      // Échanger les lignes
      [previousRow, currentRow] = [currentRow, previousRow];
    }

    return previousRow[m];
  }

  /**
   * Gérer un poison pill détecté selon l'action configurée
   */
  private handlePoisonPill(entry: DLQEntry, similarity: number): void {
    const action = this.config.poisonPill.action;
    const reason = `Detected with ${(similarity * 100).toFixed(1)}% error similarity`;

    // Marquer comme poison pill
    entry.isPoisonPill = true;
    entry.poisonPillReason = reason;

    switch (action) {
      case 'quarantine':
        entry.status = 'quarantined';
        entry.quarantinedAt = new Date();
        entry.nextRetryAt = undefined; // Pas de retry en quarantaine

        logger.error('Poison pill detected and quarantined', {
          entryId: entry.id,
          taskId: entry.task.id,
          similarity: `${(similarity * 100).toFixed(1)}%`,
          retryCount: entry.retryCount,
        });
        break;

      case 'alert':
        // L'entrée reste en pending_retry mais on émet une alerte
        logger.error('Poison pill detected - ALERT', {
          entryId: entry.id,
          taskId: entry.task.id,
          similarity: `${(similarity * 100).toFixed(1)}%`,
          retryCount: entry.retryCount,
          errorPattern: entry.errorHistory.slice(-3).map((e) => e.message),
        });
        break;

      case 'skip':
        entry.status = 'skipped';
        entry.nextRetryAt = undefined; // Pas de retry pour les skipped

        logger.warn('Poison pill detected and skipped', {
          entryId: entry.id,
          taskId: entry.task.id,
          similarity: `${(similarity * 100).toFixed(1)}%`,
        });
        break;
    }

    // Mettre à jour le stockage
    if (this.storage) {
      void this.storage.addToDeadLetterQueue(entry);
    }
  }

  /**
   * Vérifier si une entrée est un poison pill
   */
  isPoisonPill(entryId: string): boolean {
    const entry = this.entries.get(entryId);
    return entry?.isPoisonPill ?? false;
  }

  /**
   * Obtenir le score de similarité d'une entrée
   */
  getErrorSimilarityScore(entryId: string): number | undefined {
    const entry = this.entries.get(entryId);
    return entry?.errorSimilarityScore;
  }

  /**
   * Lister les entrées en quarantaine
   */
  getQuarantinedEntries(): DLQEntry[] {
    return Array.from(this.entries.values()).filter((e) => e.status === 'quarantined');
  }

  /**
   * Sortir une entrée de quarantaine et la remettre en retry
   */
  async releaseFromQuarantine(entryId: string): Promise<boolean> {
    const entry = this.entries.get(entryId);

    if (!entry || entry.status !== 'quarantined') {
      return false;
    }

    entry.status = 'pending_retry';
    entry.isPoisonPill = false;
    entry.quarantinedAt = undefined;
    entry.nextRetryAt = new Date(Date.now() + this.config.retryDelayMs);

    logger.info('Entry released from quarantine', {
      entryId,
      taskId: entry.task.id,
    });

    if (this.storage) {
      await this.storage.addToDeadLetterQueue(entry);
    }

    return true;
  }

  /*
   * ============================================================================
   * STATISTIQUES ET ÉVÉNEMENTS
   * ============================================================================
   */

  /**
   * Obtenir les statistiques de la DLQ
   */
  getStats(): DLQStats {
    const entries = Array.from(this.entries.values());
    const poisonPillEntries = entries.filter((e) => e.isPoisonPill);

    const stats: DLQStats = {
      totalEntries: entries.length,
      pendingRetry: entries.filter((e) => e.status === 'pending_retry').length,
      retrying: entries.filter((e) => e.status === 'retrying').length,
      permanentFailures: entries.filter((e) => e.status === 'permanent_failure').length,
      recovered: entries.filter((e) => e.status === 'recovered').length,
      poisonPills: poisonPillEntries.length,
      quarantined: entries.filter((e) => e.status === 'quarantined').length,
      skipped: entries.filter((e) => e.status === 'skipped').length,
      recoveryRate: 0,
      averagePoisonPillSimilarity: 0,
    };

    // Calculer le taux de récupération
    const totalProcessed = stats.recovered + stats.permanentFailures;
    if (totalProcessed > 0) {
      stats.recoveryRate = (stats.recovered / totalProcessed) * 100;
    }

    // Calculer le score moyen de similarité des poison pills
    const similarityScores = poisonPillEntries
      .map((e) => e.errorSimilarityScore)
      .filter((s): s is number => s !== undefined);

    if (similarityScores.length > 0) {
      stats.averagePoisonPillSimilarity =
        similarityScores.reduce((sum, s) => sum + s, 0) / similarityScores.length;
    }

    return stats;
  }

  /**
   * Émettre un événement
   */
  private emitEvent(event: DLQEvent): void {
    if (this.eventCallback) {
      try {
        this.eventCallback(event);
      } catch (error) {
        logger.error('Error in DLQ event callback', {
          eventType: event.type,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }
  }

  /*
   * ============================================================================
   * CHARGEMENT ET NETTOYAGE
   * ============================================================================
   */

  /**
   * Charger les entrées depuis le stockage
   */
  async loadFromStorage(): Promise<void> {
    if (!this.storage) {
      return;
    }

    try {
      const persistedEntries = await this.storage.listDeadLetterQueue();

      for (const persisted of persistedEntries) {
        // Convertir en DLQEntry étendu
        const entry: DLQEntry = {
          ...persisted,
          status: 'pending_retry',
          retryCount: persisted.attempts - 1,
          lastAttemptAt: persisted.lastFailedAt,
          nextRetryAt: new Date(persisted.lastFailedAt.getTime() + this.config.retryDelayMs),
          errorHistory: [
            {
              message: persisted.error.message,
              code: persisted.error.code,
              timestamp: persisted.lastFailedAt,
              attemptNumber: persisted.attempts,
            },
          ],
          isPoisonPill: false,
        };

        this.entries.set(entry.id, entry);
      }

      logger.info('Loaded DLQ entries from storage', { count: persistedEntries.length });
    } catch (error) {
      logger.error('Failed to load DLQ from storage', {
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  /**
   * Purger les entrées expirées
   */
  async purgeExpired(): Promise<number> {
    const now = Date.now();
    let purgedCount = 0;

    for (const [entryId, entry] of this.entries) {
      if (entry.expiresAt.getTime() < now) {
        this.entries.delete(entryId);
        purgedCount++;

        if (this.storage) {
          await this.storage.removeFromDeadLetterQueue(entryId);
        }
      }
    }

    if (purgedCount > 0) {
      logger.info('Purged expired DLQ entries', { count: purgedCount });
    }

    return purgedCount;
  }

  /**
   * Arrêter la DLQ proprement
   */
  shutdown(): void {
    this.stopAutoRetry();
    logger.info('DLQ shutdown complete');
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer une instance de DeadLetterQueue
 */
export function createDeadLetterQueue(
  storage?: StorageAdapter,
  config?: Partial<DLQConfig>,
): DeadLetterQueue {
  return new DeadLetterQueue(storage, config);
}

/**
 * Instance globale de la DLQ (singleton)
 */
let globalDLQ: DeadLetterQueue | null = null;

/**
 * Obtenir l'instance globale de la DLQ
 */
export function getGlobalDeadLetterQueue(): DeadLetterQueue {
  if (!globalDLQ) {
    globalDLQ = createDeadLetterQueue();
  }
  return globalDLQ;
}

/**
 * Initialiser l'instance globale avec une configuration
 */
export function initializeGlobalDeadLetterQueue(
  storage?: StorageAdapter,
  config?: Partial<DLQConfig>,
): DeadLetterQueue {
  globalDLQ = createDeadLetterQueue(storage, config);
  return globalDLQ;
}
