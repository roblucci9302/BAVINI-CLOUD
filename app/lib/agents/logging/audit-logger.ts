/**
 * Audit Logger pour les agents BAVINI
 *
 * Système de logging centralisé pour tracer toutes les opérations importantes:
 * - Opérations sur les fichiers (lecture, écriture, suppression)
 * - Commandes shell
 * - Opérations Git
 * - Appels API
 * - Événements de sécurité
 *
 * @module agents/logging/audit-logger
 */

import { createScopedLogger } from '~/utils/logger';
import type { AgentType } from '../types';

const logger = createScopedLogger('AuditLogger');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Types d'opérations auditées
 */
export type AuditEntryType =
  | 'file_operation'
  | 'shell_command'
  | 'git_operation'
  | 'api_call'
  | 'security_event'
  | 'agent_lifecycle'
  | 'tool_execution'
  | 'task_operation';

/**
 * Résultat d'une opération auditée
 */
export type AuditOutcome = 'success' | 'failure' | 'blocked' | 'skipped';

/**
 * Entrée d'audit complète
 */
export interface AuditEntry {
  /** Identifiant unique de l'entrée */
  id: string;

  /** Timestamp de l'entrée */
  timestamp: Date;

  /** Type d'opération */
  type: AuditEntryType;

  /** Action spécifique (ex: "write_file", "git_commit") */
  action: string;

  /** Agent qui a effectué l'opération */
  agent: AgentType | string;

  /** ID de la tâche associée */
  taskId: string;

  /** Détails supplémentaires de l'opération */
  details: Record<string, unknown>;

  /** Résultat de l'opération */
  outcome: AuditOutcome;

  /** Durée de l'opération en ms */
  duration?: number;

  /** Message d'erreur si échec */
  errorMessage?: string;

  /** Niveau de sévérité */
  severity?: 'low' | 'medium' | 'high' | 'critical';

  /** Adresse IP source (si applicable) */
  sourceIp?: string;

  /** ID de session */
  sessionId?: string;
}

/**
 * Entrée d'audit sans les champs auto-générés
 */
export type AuditEntryInput = Omit<AuditEntry, 'id' | 'timestamp'>;

/**
 * Filtres pour la recherche d'entrées
 */
export interface AuditQueryFilter {
  type?: AuditEntryType | AuditEntryType[];
  action?: string | string[];
  agent?: AgentType | string | (AgentType | string)[];
  taskId?: string;
  outcome?: AuditOutcome | AuditOutcome[];
  severity?: AuditEntry['severity'] | AuditEntry['severity'][];
  fromDate?: Date;
  toDate?: Date;
  sessionId?: string;
}

/**
 * Options de pagination pour les requêtes
 */
export interface AuditQueryOptions {
  limit?: number;
  offset?: number;
  sortBy?: keyof AuditEntry;
  sortOrder?: 'asc' | 'desc';
}

/**
 * Statistiques d'audit
 */
export interface AuditStats {
  totalEntries: number;
  byType: Record<AuditEntryType, number>;
  byOutcome: Record<AuditOutcome, number>;
  byAgent: Record<string, number>;
  bySeverity: Record<string, number>;
  averageDuration: number;
  failureRate: number;
  timeRange: {
    earliest: Date | null;
    latest: Date | null;
  };
}

/**
 * Interface pour le stockage des entrées d'audit
 */
export interface AuditStorage {
  /** Sauvegarder une entrée */
  save(entry: AuditEntry): Promise<void>;

  /** Récupérer des entrées avec filtres */
  query(filter: AuditQueryFilter, options?: AuditQueryOptions): Promise<AuditEntry[]>;

  /** Supprimer les entrées plus anciennes que la date */
  purgeOlderThan(date: Date): Promise<number>;

  /** Compter les entrées */
  count(filter?: AuditQueryFilter): Promise<number>;

  /** Vider le stockage */
  clear(): Promise<void>;
}

/**
 * Configuration de l'Audit Logger
 */
export interface AuditLoggerConfig {
  /** Activer le logging */
  enabled: boolean;

  /** Niveau minimum de sévérité pour logger (défaut: 'low') */
  minSeverity: AuditEntry['severity'];

  /** Types d'opérations à logger (vide = tous) */
  includedTypes: AuditEntryType[];

  /** Types d'opérations à exclure */
  excludedTypes: AuditEntryType[];

  /** Durée de rétention en ms (défaut: 7 jours) */
  retentionMs: number;

  /** Activer le logging console */
  consoleOutput: boolean;

  /** Stocker en mémoire (limite) */
  maxMemoryEntries: number;
}

/*
 * ============================================================================
 * CONFIGURATION PAR DÉFAUT
 * ============================================================================
 */

export const DEFAULT_AUDIT_CONFIG: AuditLoggerConfig = {
  enabled: true,
  minSeverity: 'low',
  includedTypes: [],
  excludedTypes: [],
  retentionMs: 7 * 24 * 60 * 60 * 1000, // 7 jours
  consoleOutput: false, // Désactivé par défaut pour réduire le bruit dans les logs
  maxMemoryEntries: 10000,
};

/*
 * ============================================================================
 * STOCKAGE EN MÉMOIRE
 * ============================================================================
 */

/**
 * Implémentation de stockage en mémoire
 */
export class MemoryAuditStorage implements AuditStorage {
  private entries: AuditEntry[] = [];
  private maxEntries: number;

  constructor(maxEntries: number = 10000) {
    this.maxEntries = maxEntries;
  }

  async save(entry: AuditEntry): Promise<void> {
    this.entries.push(entry);

    // Limiter la taille
    if (this.entries.length > this.maxEntries) {
      this.entries = this.entries.slice(-this.maxEntries);
    }
  }

  async query(filter: AuditQueryFilter, options: AuditQueryOptions = {}): Promise<AuditEntry[]> {
    let results = this.filterEntries(filter);

    // Trier
    if (options.sortBy) {
      const sortKey = options.sortBy;
      const sortOrder = options.sortOrder === 'asc' ? 1 : -1;

      results.sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];

        if (aVal === bVal) return 0;
        if (aVal === undefined) return 1;
        if (bVal === undefined) return -1;

        if (aVal instanceof Date && bVal instanceof Date) {
          return (aVal.getTime() - bVal.getTime()) * sortOrder;
        }

        return (aVal < bVal ? -1 : 1) * sortOrder;
      });
    }

    // Pagination
    const offset = options.offset ?? 0;
    const limit = options.limit ?? results.length;

    return results.slice(offset, offset + limit);
  }

  async purgeOlderThan(date: Date): Promise<number> {
    const originalLength = this.entries.length;
    this.entries = this.entries.filter((e) => e.timestamp >= date);
    return originalLength - this.entries.length;
  }

  async count(filter?: AuditQueryFilter): Promise<number> {
    if (!filter) {
      return this.entries.length;
    }
    return this.filterEntries(filter).length;
  }

  async clear(): Promise<void> {
    this.entries = [];
  }

  private filterEntries(filter: AuditQueryFilter): AuditEntry[] {
    return this.entries.filter((entry) => {
      // Filtrer par type
      if (filter.type) {
        const types = Array.isArray(filter.type) ? filter.type : [filter.type];
        if (!types.includes(entry.type)) return false;
      }

      // Filtrer par action
      if (filter.action) {
        const actions = Array.isArray(filter.action) ? filter.action : [filter.action];
        if (!actions.includes(entry.action)) return false;
      }

      // Filtrer par agent
      if (filter.agent) {
        const agents = Array.isArray(filter.agent) ? filter.agent : [filter.agent];
        if (!agents.includes(entry.agent)) return false;
      }

      // Filtrer par taskId
      if (filter.taskId && entry.taskId !== filter.taskId) {
        return false;
      }

      // Filtrer par outcome
      if (filter.outcome) {
        const outcomes = Array.isArray(filter.outcome) ? filter.outcome : [filter.outcome];
        if (!outcomes.includes(entry.outcome)) return false;
      }

      // Filtrer par sévérité
      if (filter.severity) {
        const severities = Array.isArray(filter.severity) ? filter.severity : [filter.severity];
        if (!entry.severity || !severities.includes(entry.severity)) return false;
      }

      // Filtrer par date
      if (filter.fromDate && entry.timestamp < filter.fromDate) {
        return false;
      }
      if (filter.toDate && entry.timestamp > filter.toDate) {
        return false;
      }

      // Filtrer par sessionId
      if (filter.sessionId && entry.sessionId !== filter.sessionId) {
        return false;
      }

      return true;
    });
  }
}

/*
 * ============================================================================
 * AUDIT LOGGER
 * ============================================================================
 */

/**
 * Logger d'audit centralisé pour les agents BAVINI
 *
 * @example
 * ```typescript
 * const auditLogger = new AuditLogger();
 *
 * // Logger une opération
 * await auditLogger.log({
 *   type: 'file_operation',
 *   action: 'write_file',
 *   agent: 'coder',
 *   taskId: 'task-123',
 *   details: { path: '/src/app.ts', size: 1234 },
 *   outcome: 'success',
 *   duration: 150,
 * });
 *
 * // Rechercher des entrées
 * const failures = await auditLogger.query({
 *   outcome: 'failure',
 *   fromDate: new Date(Date.now() - 3600000), // Dernière heure
 * });
 *
 * // Exporter
 * const csv = auditLogger.export('csv');
 * ```
 */
export class AuditLogger {
  private storage: AuditStorage;
  private config: AuditLoggerConfig;
  private inMemoryEntries: AuditEntry[] = [];
  private purgeTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config: Partial<AuditLoggerConfig> = {}, storage?: AuditStorage) {
    this.config = { ...DEFAULT_AUDIT_CONFIG, ...config };
    this.storage = storage || new MemoryAuditStorage(this.config.maxMemoryEntries);

    // Démarrer le nettoyage périodique
    this.startPurgeTimer();
  }

  /*
   * ============================================================================
   * LOGGING
   * ============================================================================
   */

  /**
   * Logger une entrée d'audit
   */
  async log(entry: AuditEntryInput): Promise<AuditEntry | null> {
    // Vérifier si le logging est activé
    if (!this.config.enabled) {
      return null;
    }

    // Vérifier les filtres de type
    if (!this.shouldLog(entry)) {
      return null;
    }

    // Créer l'entrée complète
    const fullEntry: AuditEntry = {
      id: this.generateId(),
      timestamp: new Date(),
      ...entry,
    };

    // Sauvegarder en mémoire
    this.inMemoryEntries.push(fullEntry);
    if (this.inMemoryEntries.length > this.config.maxMemoryEntries) {
      this.inMemoryEntries = this.inMemoryEntries.slice(-this.config.maxMemoryEntries);
    }

    // Persister dans le stockage
    try {
      await this.storage.save(fullEntry);
    } catch (error) {
      logger.error('Failed to persist audit entry', {
        error: error instanceof Error ? error.message : String(error),
      });
    }

    // Logger dans la console si activé
    if (this.config.consoleOutput) {
      this.logToConsole(fullEntry);
    }

    return fullEntry;
  }

  /**
   * Logger une opération sur fichier
   */
  async logFileOperation(
    action: string,
    agent: AgentType | string,
    taskId: string,
    details: { path: string; [key: string]: unknown },
    outcome: AuditOutcome,
    duration?: number,
    errorMessage?: string,
  ): Promise<AuditEntry | null> {
    return this.log({
      type: 'file_operation',
      action,
      agent,
      taskId,
      details,
      outcome,
      duration,
      errorMessage,
      severity: outcome === 'failure' ? 'medium' : 'low',
    });
  }

  /**
   * Logger une commande shell
   */
  async logShellCommand(
    command: string,
    agent: AgentType | string,
    taskId: string,
    outcome: AuditOutcome,
    details: Record<string, unknown> = {},
    duration?: number,
    errorMessage?: string,
  ): Promise<AuditEntry | null> {
    // Déterminer la sévérité selon la commande
    const severity = this.getShellCommandSeverity(command, outcome);

    return this.log({
      type: 'shell_command',
      action: 'execute',
      agent,
      taskId,
      details: { command, ...details },
      outcome,
      duration,
      errorMessage,
      severity,
    });
  }

  /**
   * Logger une opération Git
   */
  async logGitOperation(
    action: string,
    agent: AgentType | string,
    taskId: string,
    details: Record<string, unknown>,
    outcome: AuditOutcome,
    duration?: number,
    errorMessage?: string,
  ): Promise<AuditEntry | null> {
    return this.log({
      type: 'git_operation',
      action,
      agent,
      taskId,
      details,
      outcome,
      duration,
      errorMessage,
      severity: outcome === 'failure' ? 'medium' : 'low',
    });
  }

  /**
   * Logger un événement de sécurité
   */
  async logSecurityEvent(
    action: string,
    agent: AgentType | string,
    taskId: string,
    details: Record<string, unknown>,
    outcome: AuditOutcome,
    severity: AuditEntry['severity'] = 'high',
  ): Promise<AuditEntry | null> {
    return this.log({
      type: 'security_event',
      action,
      agent,
      taskId,
      details,
      outcome,
      severity,
    });
  }

  /**
   * Logger un appel API
   */
  async logApiCall(
    endpoint: string,
    method: string,
    agent: AgentType | string,
    taskId: string,
    outcome: AuditOutcome,
    details: Record<string, unknown> = {},
    duration?: number,
    errorMessage?: string,
  ): Promise<AuditEntry | null> {
    return this.log({
      type: 'api_call',
      action: `${method} ${endpoint}`,
      agent,
      taskId,
      details: { endpoint, method, ...details },
      outcome,
      duration,
      errorMessage,
      severity: 'low',
    });
  }

  /*
   * ============================================================================
   * REQUÊTES
   * ============================================================================
   */

  /**
   * Rechercher des entrées d'audit
   */
  async query(filter: AuditQueryFilter = {}, options: AuditQueryOptions = {}): Promise<AuditEntry[]> {
    return this.storage.query(filter, options);
  }

  /**
   * Obtenir les entrées récentes
   */
  async getRecent(limit: number = 100): Promise<AuditEntry[]> {
    return this.storage.query({}, { limit, sortBy: 'timestamp', sortOrder: 'desc' });
  }

  /**
   * Obtenir les échecs récents
   */
  async getRecentFailures(limit: number = 50): Promise<AuditEntry[]> {
    return this.storage.query({ outcome: ['failure', 'blocked'] }, { limit, sortBy: 'timestamp', sortOrder: 'desc' });
  }

  /**
   * Obtenir les entrées pour une tâche
   */
  async getByTaskId(taskId: string): Promise<AuditEntry[]> {
    return this.storage.query({ taskId }, { sortBy: 'timestamp', sortOrder: 'asc' });
  }

  /**
   * Obtenir les entrées pour un agent
   */
  async getByAgent(agent: AgentType | string, limit: number = 100): Promise<AuditEntry[]> {
    return this.storage.query({ agent }, { limit, sortBy: 'timestamp', sortOrder: 'desc' });
  }

  /**
   * Compter les entrées
   */
  async count(filter?: AuditQueryFilter): Promise<number> {
    return this.storage.count(filter);
  }

  /*
   * ============================================================================
   * STATISTIQUES
   * ============================================================================
   */

  /**
   * Obtenir les statistiques d'audit
   */
  async getStats(): Promise<AuditStats> {
    const entries = await this.storage.query({});

    const stats: AuditStats = {
      totalEntries: entries.length,
      byType: {} as Record<AuditEntryType, number>,
      byOutcome: {} as Record<AuditOutcome, number>,
      byAgent: {},
      bySeverity: {},
      averageDuration: 0,
      failureRate: 0,
      timeRange: {
        earliest: null,
        latest: null,
      },
    };

    // Initialiser les compteurs
    const types: AuditEntryType[] = [
      'file_operation',
      'shell_command',
      'git_operation',
      'api_call',
      'security_event',
      'agent_lifecycle',
      'tool_execution',
      'task_operation',
    ];
    types.forEach((t) => (stats.byType[t] = 0));

    const outcomes: AuditOutcome[] = ['success', 'failure', 'blocked', 'skipped'];
    outcomes.forEach((o) => (stats.byOutcome[o] = 0));

    let totalDuration = 0;
    let durationCount = 0;

    for (const entry of entries) {
      // Par type
      stats.byType[entry.type] = (stats.byType[entry.type] || 0) + 1;

      // Par outcome
      stats.byOutcome[entry.outcome] = (stats.byOutcome[entry.outcome] || 0) + 1;

      // Par agent
      stats.byAgent[entry.agent] = (stats.byAgent[entry.agent] || 0) + 1;

      // Par sévérité
      if (entry.severity) {
        stats.bySeverity[entry.severity] = (stats.bySeverity[entry.severity] || 0) + 1;
      }

      // Durée
      if (entry.duration !== undefined) {
        totalDuration += entry.duration;
        durationCount++;
      }

      // Time range
      if (!stats.timeRange.earliest || entry.timestamp < stats.timeRange.earliest) {
        stats.timeRange.earliest = entry.timestamp;
      }
      if (!stats.timeRange.latest || entry.timestamp > stats.timeRange.latest) {
        stats.timeRange.latest = entry.timestamp;
      }
    }

    // Calculer les moyennes
    if (durationCount > 0) {
      stats.averageDuration = totalDuration / durationCount;
    }

    if (entries.length > 0) {
      stats.failureRate = ((stats.byOutcome.failure + stats.byOutcome.blocked) / entries.length) * 100;
    }

    return stats;
  }

  /*
   * ============================================================================
   * EXPORT
   * ============================================================================
   */

  /**
   * Exporter les entrées dans différents formats
   */
  async export(format: 'json' | 'csv', filter?: AuditQueryFilter): Promise<string> {
    const entries = await this.storage.query(filter || {});

    switch (format) {
      case 'json':
        return this.exportToJson(entries);
      case 'csv':
        return this.exportToCsv(entries);
      default:
        throw new Error(`Unsupported export format: ${format}`);
    }
  }

  private exportToJson(entries: AuditEntry[]): string {
    return JSON.stringify(entries, null, 2);
  }

  private exportToCsv(entries: AuditEntry[]): string {
    if (entries.length === 0) {
      return '';
    }

    // En-têtes
    const headers = [
      'id',
      'timestamp',
      'type',
      'action',
      'agent',
      'taskId',
      'outcome',
      'duration',
      'severity',
      'errorMessage',
      'details',
    ];

    const rows = [headers.join(',')];

    // Lignes
    for (const entry of entries) {
      const row = [
        this.escapeCsv(entry.id),
        this.escapeCsv(entry.timestamp.toISOString()),
        this.escapeCsv(entry.type),
        this.escapeCsv(entry.action),
        this.escapeCsv(entry.agent),
        this.escapeCsv(entry.taskId),
        this.escapeCsv(entry.outcome),
        entry.duration?.toString() || '',
        this.escapeCsv(entry.severity || ''),
        this.escapeCsv(entry.errorMessage || ''),
        this.escapeCsv(JSON.stringify(entry.details)),
      ];
      rows.push(row.join(','));
    }

    return rows.join('\n');
  }

  private escapeCsv(value: string): string {
    if (value.includes(',') || value.includes('"') || value.includes('\n')) {
      return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
  }

  /*
   * ============================================================================
   * GESTION
   * ============================================================================
   */

  /**
   * Purger les entrées anciennes
   */
  async purgeOldEntries(): Promise<number> {
    const cutoffDate = new Date(Date.now() - this.config.retentionMs);
    const purged = await this.storage.purgeOlderThan(cutoffDate);

    // Purger aussi la mémoire
    this.inMemoryEntries = this.inMemoryEntries.filter((e) => e.timestamp >= cutoffDate);

    if (purged > 0) {
      logger.info(`Purged ${purged} old audit entries`);
    }

    return purged;
  }

  /**
   * Vider toutes les entrées
   */
  async clear(): Promise<void> {
    await this.storage.clear();
    this.inMemoryEntries = [];
    logger.info('Audit log cleared');
  }

  /**
   * Mettre à jour la configuration
   */
  updateConfig(config: Partial<AuditLoggerConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfig(): AuditLoggerConfig {
    return { ...this.config };
  }

  /**
   * Arrêter l'audit logger
   */
  shutdown(): void {
    this.stopPurgeTimer();
    logger.info('Audit logger shutdown');
  }

  /*
   * ============================================================================
   * MÉTHODES PRIVÉES
   * ============================================================================
   */

  private generateId(): string {
    return `audit-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
  }

  private shouldLog(entry: AuditEntryInput): boolean {
    // Vérifier les types inclus
    if (this.config.includedTypes.length > 0 && !this.config.includedTypes.includes(entry.type)) {
      return false;
    }

    // Vérifier les types exclus
    if (this.config.excludedTypes.includes(entry.type)) {
      return false;
    }

    // Vérifier la sévérité minimum
    if (entry.severity) {
      const severityOrder = ['low', 'medium', 'high', 'critical'];
      const minIndex = severityOrder.indexOf(this.config.minSeverity || 'low');
      const entryIndex = severityOrder.indexOf(entry.severity);

      if (entryIndex < minIndex) {
        return false;
      }
    }

    return true;
  }

  private logToConsole(entry: AuditEntry): void {
    const level = entry.outcome === 'failure' ? 'error' : entry.outcome === 'blocked' ? 'warn' : 'info';

    const message = `AUDIT: ${entry.action}`;
    const data = {
      type: entry.type,
      agent: entry.agent,
      taskId: entry.taskId,
      outcome: entry.outcome,
      duration: entry.duration,
      ...entry.details,
    };

    logger[level](message, data);
  }

  private getShellCommandSeverity(command: string, outcome: AuditOutcome): AuditEntry['severity'] {
    // Commandes dangereuses
    const dangerousPatterns = [/rm\s+-rf/, /sudo/, /chmod\s+777/, />\s*\/dev/, /mkfs/, /dd\s+if=/];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(command)) {
        return 'critical';
      }
    }

    // Commandes à risque modéré
    const moderatePatterns = [/rm\s/, /mv\s/, /cp\s+-r/, /chmod/, /chown/];

    for (const pattern of moderatePatterns) {
      if (pattern.test(command)) {
        return outcome === 'failure' ? 'high' : 'medium';
      }
    }

    return outcome === 'failure' ? 'medium' : 'low';
  }

  private startPurgeTimer(): void {
    // Purger toutes les heures
    this.purgeTimer = setInterval(
      () => {
        void this.purgeOldEntries();
      },
      60 * 60 * 1000,
    );
  }

  private stopPurgeTimer(): void {
    if (this.purgeTimer) {
      clearInterval(this.purgeTimer);
      this.purgeTimer = null;
    }
  }
}

/*
 * ============================================================================
 * FACTORY ET SINGLETON
 * ============================================================================
 */

/**
 * Créer une instance d'AuditLogger
 */
export function createAuditLogger(config?: Partial<AuditLoggerConfig>, storage?: AuditStorage): AuditLogger {
  return new AuditLogger(config, storage);
}

/**
 * Instance globale de l'audit logger (singleton)
 */
let globalAuditLogger: AuditLogger | null = null;

/**
 * Obtenir l'instance globale de l'audit logger
 */
export function getGlobalAuditLogger(): AuditLogger {
  if (!globalAuditLogger) {
    globalAuditLogger = createAuditLogger();
  }
  return globalAuditLogger;
}

/**
 * Initialiser l'instance globale avec une configuration
 */
export function initializeGlobalAuditLogger(config?: Partial<AuditLoggerConfig>, storage?: AuditStorage): AuditLogger {
  if (globalAuditLogger) {
    globalAuditLogger.shutdown();
  }
  globalAuditLogger = createAuditLogger(config, storage);
  return globalAuditLogger;
}

/**
 * Réinitialiser l'instance globale (utile pour les tests)
 */
export function resetGlobalAuditLogger(): void {
  if (globalAuditLogger) {
    globalAuditLogger.shutdown();
    globalAuditLogger = null;
  }
}

/**
 * Alias pour l'instance globale (pour une utilisation plus simple)
 */
export const auditLogger = {
  get instance(): AuditLogger {
    return getGlobalAuditLogger();
  },

  log: (entry: AuditEntryInput) => getGlobalAuditLogger().log(entry),
  logFileOperation: (...args: Parameters<AuditLogger['logFileOperation']>) =>
    getGlobalAuditLogger().logFileOperation(...args),
  logShellCommand: (...args: Parameters<AuditLogger['logShellCommand']>) =>
    getGlobalAuditLogger().logShellCommand(...args),
  logGitOperation: (...args: Parameters<AuditLogger['logGitOperation']>) =>
    getGlobalAuditLogger().logGitOperation(...args),
  logSecurityEvent: (...args: Parameters<AuditLogger['logSecurityEvent']>) =>
    getGlobalAuditLogger().logSecurityEvent(...args),
  logApiCall: (...args: Parameters<AuditLogger['logApiCall']>) => getGlobalAuditLogger().logApiCall(...args),
  query: (...args: Parameters<AuditLogger['query']>) => getGlobalAuditLogger().query(...args),
  getStats: () => getGlobalAuditLogger().getStats(),
  export: (...args: Parameters<AuditLogger['export']>) => getGlobalAuditLogger().export(...args),
};
