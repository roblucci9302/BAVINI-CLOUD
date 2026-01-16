/**
 * AuditLogger - Journalisation d'audit pour les opérations backend
 *
 * Ce module fournit une trace complète de toutes les opérations
 * effectuées sur le backend Supabase, permettant l'audit et le debugging.
 */

import type { AuditEntry, AuditFilters, ValidationResult } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('AuditLogger');

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface AuditLoggerOptions {
  maxEntries?: number;
  persistFn?: (entry: AuditEntry) => Promise<void>;
  sessionId?: string;
}

export interface AuditOperation {
  type: AuditEntry['operation']['type'];
  target: AuditEntry['operation']['target'];
  name: string;
}

export interface AuditInput {
  description?: string;
  sql?: string;
  validation?: ValidationResult;
}

export interface AuditResult {
  success: boolean;
  error?: string;
  duration: number;
  affectedRows?: number;
}

export interface AuditSecurity {
  riskLevel: 'low' | 'medium' | 'high' | 'critical';
  validationsPassed: string[];
  warnings: string[];
  checkpointId?: string;
}

export interface AuditExportOptions {
  format: 'json' | 'csv' | 'markdown';
  includeDetails?: boolean;
}

/*
 * =============================================================================
 * Constantes
 * =============================================================================
 */

const DEFAULT_OPTIONS: Required<Omit<AuditLoggerOptions, 'persistFn'>> & {
  persistFn?: (entry: AuditEntry) => Promise<void>;
} = {
  maxEntries: 10000,
  sessionId: 'default',
  persistFn: undefined,
};

/*
 * =============================================================================
 * AuditLogger Class
 * =============================================================================
 */

export class AuditLogger {
  private options: Required<Omit<AuditLoggerOptions, 'persistFn'>> & {
    persistFn?: (entry: AuditEntry) => Promise<void>;
  };
  private entries: AuditEntry[] = [];
  private sessionId: string;

  constructor(options: AuditLoggerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.sessionId = options.sessionId || this.generateSessionId();
  }

  /**
   * Enregistre une entrée d'audit
   */
  async log(params: {
    operation: AuditOperation;
    input: AuditInput;
    result: AuditResult;
    security: AuditSecurity;
    userId?: string;
  }): Promise<AuditEntry> {
    const entry: AuditEntry = {
      id: this.generateEntryId(),
      timestamp: new Date(),
      sessionId: this.sessionId,
      userId: params.userId,
      operation: params.operation,
      input: params.input,
      result: params.result,
      security: {
        riskLevel: params.security.riskLevel,
        validationsPassed: params.security.validationsPassed,
        warnings: params.security.warnings,
        checkpointId: params.security.checkpointId,
      },
    };

    this.entries.push(entry);

    // Respecter la limite d'entrées
    this.pruneEntries();

    // Persister si une fonction est fournie
    if (this.options.persistFn) {
      try {
        await this.options.persistFn(entry);
      } catch (error) {
        logger.error('Failed to persist audit entry', { entryId: entry.id, error });
      }
    }

    // Logger selon le niveau de risque
    this.logByRiskLevel(entry);

    return entry;
  }

  /**
   * Enregistre le début d'une opération
   */
  startOperation(params: {
    operation: AuditOperation;
    input: AuditInput;
    security: Omit<AuditSecurity, 'validationsPassed'>;
    userId?: string;
  }): { entryId: string; startTime: number } {
    const entryId = this.generateEntryId();
    const startTime = Date.now();

    logger.debug('Operation started', {
      entryId,
      operation: params.operation,
      riskLevel: params.security.riskLevel,
    });

    return { entryId, startTime };
  }

  /**
   * Enregistre la fin d'une opération
   */
  async endOperation(params: {
    entryId: string;
    startTime: number;
    operation: AuditOperation;
    input: AuditInput;
    success: boolean;
    error?: string;
    affectedRows?: number;
    security: AuditSecurity;
    userId?: string;
  }): Promise<AuditEntry> {
    const duration = Date.now() - params.startTime;

    return this.log({
      operation: params.operation,
      input: params.input,
      result: {
        success: params.success,
        error: params.error,
        duration,
        affectedRows: params.affectedRows,
      },
      security: params.security,
      userId: params.userId,
    });
  }

  /**
   * Récupère l'historique des audits avec filtres
   */
  getHistory(filters?: AuditFilters): AuditEntry[] {
    let result = [...this.entries];

    if (filters?.startDate) {
      result = result.filter((e) => e.timestamp >= filters.startDate!);
    }

    if (filters?.endDate) {
      result = result.filter((e) => e.timestamp <= filters.endDate!);
    }

    if (filters?.operationType) {
      result = result.filter((e) => e.operation.type === filters.operationType);
    }

    if (filters?.targetType) {
      result = result.filter((e) => e.operation.target === filters.targetType);
    }

    if (filters?.success !== undefined) {
      result = result.filter((e) => e.result.success === filters.success);
    }

    if (filters?.riskLevel) {
      result = result.filter((e) => e.security.riskLevel === filters.riskLevel);
    }

    return result;
  }

  /**
   * Récupère une entrée par ID
   */
  getEntry(entryId: string): AuditEntry | undefined {
    return this.entries.find((e) => e.id === entryId);
  }

  /**
   * Récupère les entrées pour une session
   */
  getSessionEntries(sessionId?: string): AuditEntry[] {
    const sid = sessionId || this.sessionId;
    return this.entries.filter((e) => e.sessionId === sid);
  }

  /**
   * Exporte la trace d'audit
   */
  exportAuditTrail(startDate: Date, endDate: Date, options: AuditExportOptions = { format: 'json' }): string {
    const entries = this.getHistory({ startDate, endDate });

    switch (options.format) {
      case 'json':
        return this.exportAsJSON(entries, options.includeDetails);
      case 'csv':
        return this.exportAsCSV(entries);
      case 'markdown':
        return this.exportAsMarkdown(entries, options.includeDetails);
      default:
        return this.exportAsJSON(entries, options.includeDetails);
    }
  }

  /**
   * Exporte en JSON
   */
  private exportAsJSON(entries: AuditEntry[], includeDetails = true): string {
    if (includeDetails) {
      return JSON.stringify(entries, null, 2);
    }

    const simplified = entries.map((e) => ({
      id: e.id,
      timestamp: e.timestamp,
      operation: `${e.operation.type} ${e.operation.target}: ${e.operation.name}`,
      success: e.result.success,
      duration: e.result.duration,
      riskLevel: e.security.riskLevel,
    }));

    return JSON.stringify(simplified, null, 2);
  }

  /**
   * Exporte en CSV
   */
  private exportAsCSV(entries: AuditEntry[]): string {
    const headers = [
      'ID',
      'Timestamp',
      'Session',
      'Type',
      'Target',
      'Name',
      'Success',
      'Duration (ms)',
      'Risk Level',
      'Warnings',
    ];
    const rows = entries.map((e) => [
      e.id,
      e.timestamp.toISOString(),
      e.sessionId,
      e.operation.type,
      e.operation.target,
      e.operation.name,
      e.result.success ? 'true' : 'false',
      e.result.duration.toString(),
      e.security.riskLevel,
      e.security.warnings.join('; '),
    ]);

    return [headers.join(','), ...rows.map((r) => r.map((v) => `"${v}"`).join(','))].join('\n');
  }

  /**
   * Exporte en Markdown
   */
  private exportAsMarkdown(entries: AuditEntry[], includeDetails = true): string {
    const lines: string[] = [
      '# Audit Trail Report',
      '',
      `Generated: ${new Date().toISOString()}`,
      `Entries: ${entries.length}`,
      '',
      '## Summary',
      '',
      `| Total | Success | Failed | Critical |`,
      `|-------|---------|--------|----------|`,
      `| ${entries.length} | ${entries.filter((e) => e.result.success).length} | ${entries.filter((e) => !e.result.success).length} | ${entries.filter((e) => e.security.riskLevel === 'critical').length} |`,
      '',
      '## Entries',
      '',
    ];

    for (const entry of entries) {
      lines.push(`### ${entry.operation.type} ${entry.operation.target}: ${entry.operation.name}`);
      lines.push('');
      lines.push(`- **ID:** ${entry.id}`);
      lines.push(`- **Timestamp:** ${entry.timestamp.toISOString()}`);
      lines.push(`- **Success:** ${entry.result.success ? 'Yes' : 'No'}`);
      lines.push(`- **Duration:** ${entry.result.duration}ms`);
      lines.push(`- **Risk Level:** ${entry.security.riskLevel}`);

      if (includeDetails) {
        if (entry.input.description) {
          lines.push(`- **Description:** ${entry.input.description}`);
        }

        if (entry.result.error) {
          lines.push(`- **Error:** ${entry.result.error}`);
        }

        if (entry.security.warnings.length > 0) {
          lines.push(`- **Warnings:** ${entry.security.warnings.join(', ')}`);
        }
      }

      lines.push('');
    }

    return lines.join('\n');
  }

  /**
   * Calcule des statistiques sur les audits
   */
  getStatistics(filters?: AuditFilters): {
    total: number;
    successful: number;
    failed: number;
    byOperation: Record<string, number>;
    byRiskLevel: Record<string, number>;
    avgDuration: number;
    errorRate: number;
  } {
    const entries = this.getHistory(filters);

    const byOperation: Record<string, number> = {};
    const byRiskLevel: Record<string, number> = {};
    let totalDuration = 0;

    for (const entry of entries) {
      const opKey = `${entry.operation.type}_${entry.operation.target}`;
      byOperation[opKey] = (byOperation[opKey] || 0) + 1;
      byRiskLevel[entry.security.riskLevel] = (byRiskLevel[entry.security.riskLevel] || 0) + 1;
      totalDuration += entry.result.duration;
    }

    const successful = entries.filter((e) => e.result.success).length;
    const failed = entries.length - successful;

    return {
      total: entries.length,
      successful,
      failed,
      byOperation,
      byRiskLevel,
      avgDuration: entries.length > 0 ? totalDuration / entries.length : 0,
      errorRate: entries.length > 0 ? failed / entries.length : 0,
    };
  }

  /**
   * Recherche dans les audits
   */
  search(query: string): AuditEntry[] {
    const lowerQuery = query.toLowerCase();

    return this.entries.filter((entry) => {
      return (
        entry.id.toLowerCase().includes(lowerQuery) ||
        entry.operation.name.toLowerCase().includes(lowerQuery) ||
        entry.operation.type.toLowerCase().includes(lowerQuery) ||
        entry.operation.target.toLowerCase().includes(lowerQuery) ||
        entry.input.description?.toLowerCase().includes(lowerQuery) ||
        entry.input.sql?.toLowerCase().includes(lowerQuery) ||
        entry.result.error?.toLowerCase().includes(lowerQuery)
      );
    });
  }

  /**
   * Récupère les entrées récentes
   */
  getRecent(count: number = 10): AuditEntry[] {
    return this.entries.slice(-count).reverse();
  }

  /**
   * Récupère les erreurs récentes
   */
  getRecentErrors(count: number = 10): AuditEntry[] {
    return this.entries
      .filter((e) => !e.result.success)
      .slice(-count)
      .reverse();
  }

  /**
   * Récupère les opérations critiques
   */
  getCriticalOperations(): AuditEntry[] {
    return this.entries.filter((e) => e.security.riskLevel === 'critical');
  }

  /**
   * Efface les anciennes entrées
   */
  purge(olderThan: Date): number {
    const initialCount = this.entries.length;
    this.entries = this.entries.filter((e) => e.timestamp >= olderThan);

    const removedCount = initialCount - this.entries.length;

    if (removedCount > 0) {
      logger.info('Purged old audit entries', { removedCount });
    }

    return removedCount;
  }

  /**
   * Efface toutes les entrées
   */
  clear(): void {
    const count = this.entries.length;
    this.entries = [];
    logger.info('Cleared all audit entries', { count });
  }

  /**
   * Définit l'ID de session
   */
  setSessionId(sessionId: string): void {
    this.sessionId = sessionId;
  }

  /**
   * Récupère l'ID de session courant
   */
  getSessionId(): string {
    return this.sessionId;
  }

  /**
   * Compte les entrées
   */
  count(filters?: AuditFilters): number {
    return this.getHistory(filters).length;
  }

  /*
   * =============================================================================
   * Private Helpers
   * =============================================================================
   */

  /**
   * Supprime les entrées excédentaires
   */
  private pruneEntries(): void {
    if (this.entries.length > this.options.maxEntries) {
      const excess = this.entries.length - this.options.maxEntries;
      this.entries = this.entries.slice(excess);
      logger.debug('Pruned excess audit entries', { removed: excess });
    }
  }

  /**
   * Journalise selon le niveau de risque
   */
  private logByRiskLevel(entry: AuditEntry): void {
    const message = `Audit: ${entry.operation.type} ${entry.operation.target} "${entry.operation.name}"`;
    const data = {
      entryId: entry.id,
      success: entry.result.success,
      duration: entry.result.duration,
    };

    switch (entry.security.riskLevel) {
      case 'critical':
        logger.warn(message, { ...data, riskLevel: 'critical' });
        break;
      case 'high':
        logger.info(message, { ...data, riskLevel: 'high' });
        break;
      default:
        logger.debug(message, data);
    }
  }

  /**
   * Génère un ID d'entrée unique
   */
  private generateEntryId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 10);

    return `audit_${timestamp}_${random}`;
  }

  /**
   * Génère un ID de session unique
   */
  private generateSessionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 8);

    return `session_${timestamp}_${random}`;
  }
}

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

export function createAuditLogger(options?: AuditLoggerOptions): AuditLogger {
  return new AuditLogger(options);
}
