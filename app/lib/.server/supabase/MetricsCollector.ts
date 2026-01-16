/**
 * MetricsCollector - Collecte de métriques de sécurité et performance
 *
 * Ce module collecte et agrège les métriques relatives aux
 * opérations de génération backend, permettant le monitoring
 * et l'analyse des tendances.
 */

import type { SecurityMetrics, AuditEntry, AuditFilters } from './types';
import type { AuditLogger } from './AuditLogger';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MetricsCollector');

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface MetricsCollectorOptions {
  auditLogger?: AuditLogger;
  aggregationInterval?: number; // en ms
  retentionPeriod?: number; // en ms
}

export interface MetricsPeriod {
  start: Date;
  end: Date;
}

export interface PerformanceMetrics {
  avgExecutionTime: number;
  maxExecutionTime: number;
  minExecutionTime: number;
  p50ExecutionTime: number;
  p90ExecutionTime: number;
  p99ExecutionTime: number;
  totalExecutionTime: number;
}

export interface OperationMetrics {
  operationType: string;
  count: number;
  successCount: number;
  failureCount: number;
  avgDuration: number;
  errorRate: number;
}

export interface TrendData {
  period: string;
  metrics: Partial<SecurityMetrics>;
}

export interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  score: number; // 0-100
  issues: string[];
  lastCheck: Date;
}

export interface MetricDataPoint {
  timestamp: Date;
  value: number;
  labels: Record<string, string>;
}

/*
 * =============================================================================
 * Constantes
 * =============================================================================
 */

const DEFAULT_OPTIONS: Required<Omit<MetricsCollectorOptions, 'auditLogger'>> = {
  aggregationInterval: 60 * 1000, // 1 minute
  retentionPeriod: 7 * 24 * 60 * 60 * 1000, // 7 jours
};

/*
 * =============================================================================
 * MetricsCollector Class
 * =============================================================================
 */

export class MetricsCollector {
  private options: Required<Omit<MetricsCollectorOptions, 'auditLogger'>> & { auditLogger?: AuditLogger };
  private dataPoints: Map<string, MetricDataPoint[]> = new Map();
  private cachedMetrics: SecurityMetrics | null = null;
  private lastAggregation: Date | null = null;

  constructor(options: MetricsCollectorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Collecte les métriques pour une période donnée
   */
  async collect(period: MetricsPeriod): Promise<SecurityMetrics> {
    logger.info('Collecting metrics', { start: period.start, end: period.end });

    const entries = this.getAuditEntries(period);

    const metrics: SecurityMetrics = {
      // Validations
      totalValidations: entries.length,
      passedValidations: entries.filter((e) => e.result.success).length,
      failedValidations: entries.filter((e) => !e.result.success).length,

      // Opérations
      totalOperations: entries.length,
      successfulOperations: entries.filter((e) => e.result.success).length,
      rolledBackOperations: entries.filter((e) => e.operation.type === 'rollback').length,

      // Risques
      lowRiskOperations: entries.filter((e) => e.security.riskLevel === 'low').length,
      mediumRiskOperations: entries.filter((e) => e.security.riskLevel === 'medium').length,
      highRiskOperations: entries.filter((e) => e.security.riskLevel === 'high').length,
      criticalRiskOperations: entries.filter((e) => e.security.riskLevel === 'critical').length,

      // Tendances
      avgConfidenceScore: this.calculateAvgConfidence(entries),
      avgValidationTime: this.calculateAvgDuration(entries),
      rollbackRate: this.calculateRollbackRate(entries),
    };

    this.cachedMetrics = metrics;
    this.lastAggregation = new Date();

    logger.info('Metrics collected', {
      total: metrics.totalOperations,
      successRate: ((metrics.successfulOperations / Math.max(1, metrics.totalOperations)) * 100).toFixed(1) + '%',
    });

    return metrics;
  }

  /**
   * Collecte les métriques de performance
   */
  collectPerformanceMetrics(period: MetricsPeriod): PerformanceMetrics {
    const entries = this.getAuditEntries(period);
    const durations = entries.map((e) => e.result.duration).sort((a, b) => a - b);

    if (durations.length === 0) {
      return {
        avgExecutionTime: 0,
        maxExecutionTime: 0,
        minExecutionTime: 0,
        p50ExecutionTime: 0,
        p90ExecutionTime: 0,
        p99ExecutionTime: 0,
        totalExecutionTime: 0,
      };
    }

    const sum = durations.reduce((a, b) => a + b, 0);
    const percentile = (p: number) => durations[Math.floor((durations.length * p) / 100)] || 0;

    return {
      avgExecutionTime: sum / durations.length,
      maxExecutionTime: durations[durations.length - 1],
      minExecutionTime: durations[0],
      p50ExecutionTime: percentile(50),
      p90ExecutionTime: percentile(90),
      p99ExecutionTime: percentile(99),
      totalExecutionTime: sum,
    };
  }

  /**
   * Collecte les métriques par type d'opération
   */
  collectByOperation(period: MetricsPeriod): OperationMetrics[] {
    const entries = this.getAuditEntries(period);
    const byOperation: Map<string, AuditEntry[]> = new Map();

    for (const entry of entries) {
      const key = `${entry.operation.type}_${entry.operation.target}`;
      const existing = byOperation.get(key) || [];
      existing.push(entry);
      byOperation.set(key, existing);
    }

    return Array.from(byOperation.entries()).map(([key, opEntries]) => {
      const successCount = opEntries.filter((e) => e.result.success).length;
      const totalDuration = opEntries.reduce((sum, e) => sum + e.result.duration, 0);

      return {
        operationType: key,
        count: opEntries.length,
        successCount,
        failureCount: opEntries.length - successCount,
        avgDuration: opEntries.length > 0 ? totalDuration / opEntries.length : 0,
        errorRate: opEntries.length > 0 ? (opEntries.length - successCount) / opEntries.length : 0,
      };
    });
  }

  /**
   * Calcule les tendances sur plusieurs périodes
   */
  calculateTrends(periods: MetricsPeriod[], metricKey: keyof SecurityMetrics): TrendData[] {
    return periods.map((period) => {
      const entries = this.getAuditEntries(period);
      const value = this.calculateMetricValue(entries, metricKey);

      return {
        period: `${period.start.toISOString().split('T')[0]} - ${period.end.toISOString().split('T')[0]}`,
        metrics: { [metricKey]: value },
      };
    });
  }

  /**
   * Vérifie la santé du système
   */
  checkHealth(): HealthStatus {
    const issues: string[] = [];
    let score = 100;

    const now = new Date();
    const lastHour: MetricsPeriod = {
      start: new Date(now.getTime() - 60 * 60 * 1000),
      end: now,
    };

    const metrics = this.cachedMetrics || this.collectSync(lastHour);

    // Vérifier le taux d'erreur
    const errorRate = metrics.failedValidations / Math.max(1, metrics.totalValidations);

    if (errorRate > 0.5) {
      issues.push(`Taux d'erreur élevé: ${(errorRate * 100).toFixed(1)}%`);
      score -= 40;
    } else if (errorRate > 0.2) {
      issues.push(`Taux d'erreur modéré: ${(errorRate * 100).toFixed(1)}%`);
      score -= 20;
    }

    // Vérifier les opérations critiques
    if (metrics.criticalRiskOperations > 10) {
      issues.push(`Nombre élevé d'opérations critiques: ${metrics.criticalRiskOperations}`);
      score -= 15;
    }

    // Vérifier le taux de rollback
    if (metrics.rollbackRate > 0.3) {
      issues.push(`Taux de rollback élevé: ${(metrics.rollbackRate * 100).toFixed(1)}%`);
      score -= 20;
    }

    // Vérifier le temps moyen de validation
    if (metrics.avgValidationTime > 5000) {
      issues.push(`Temps de validation élevé: ${metrics.avgValidationTime}ms`);
      score -= 10;
    }

    score = Math.max(0, Math.min(100, score));

    let status: HealthStatus['status'];

    if (score >= 80) {
      status = 'healthy';
    } else if (score >= 50) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      status,
      score,
      issues,
      lastCheck: now,
    };
  }

  /**
   * Enregistre un point de données
   */
  recordDataPoint(metricName: string, value: number, labels: Record<string, string> = {}): void {
    const points = this.dataPoints.get(metricName) || [];
    points.push({
      timestamp: new Date(),
      value,
      labels,
    });

    // Limiter le nombre de points
    const maxPoints = 10000;

    if (points.length > maxPoints) {
      points.splice(0, points.length - maxPoints);
    }

    this.dataPoints.set(metricName, points);
  }

  /**
   * Récupère les points de données pour une métrique
   */
  getDataPoints(metricName: string, period?: MetricsPeriod): MetricDataPoint[] {
    const points = this.dataPoints.get(metricName) || [];

    if (!period) {
      return points;
    }

    return points.filter((p) => p.timestamp >= period.start && p.timestamp <= period.end);
  }

  /**
   * Agrège les points de données
   */
  aggregateDataPoints(
    metricName: string,
    period: MetricsPeriod,
    aggregation: 'sum' | 'avg' | 'min' | 'max' | 'count',
  ): number {
    const points = this.getDataPoints(metricName, period);

    if (points.length === 0) {
      return 0;
    }

    const values = points.map((p) => p.value);

    switch (aggregation) {
      case 'sum':
        return values.reduce((a, b) => a + b, 0);
      case 'avg':
        return values.reduce((a, b) => a + b, 0) / values.length;
      case 'min':
        return Math.min(...values);
      case 'max':
        return Math.max(...values);
      case 'count':
        return values.length;
      default:
        return 0;
    }
  }

  /**
   * Génère un rapport de métriques
   */
  generateReport(period: MetricsPeriod): string {
    const metrics = this.collectSync(period);
    const performance = this.collectPerformanceMetrics(period);
    const byOperation = this.collectByOperation(period);
    const health = this.checkHealth();

    const lines: string[] = [
      '# Rapport de Métriques',
      '',
      `**Période:** ${period.start.toISOString()} - ${period.end.toISOString()}`,
      `**Généré le:** ${new Date().toISOString()}`,
      '',
      '## Santé du Système',
      '',
      `- **Statut:** ${health.status}`,
      `- **Score:** ${health.score}/100`,
      health.issues.length > 0 ? `- **Problèmes:** ${health.issues.join(', ')}` : '- **Problèmes:** Aucun',
      '',
      '## Métriques de Sécurité',
      '',
      '| Métrique | Valeur |',
      '|----------|--------|',
      `| Total Opérations | ${metrics.totalOperations} |`,
      `| Succès | ${metrics.successfulOperations} |`,
      `| Échecs | ${metrics.failedValidations} |`,
      `| Taux d'erreur | ${((metrics.failedValidations / Math.max(1, metrics.totalValidations)) * 100).toFixed(1)}% |`,
      `| Rollbacks | ${metrics.rolledBackOperations} |`,
      '',
      '## Répartition par Risque',
      '',
      '| Niveau | Count |',
      '|--------|-------|',
      `| Low | ${metrics.lowRiskOperations} |`,
      `| Medium | ${metrics.mediumRiskOperations} |`,
      `| High | ${metrics.highRiskOperations} |`,
      `| Critical | ${metrics.criticalRiskOperations} |`,
      '',
      '## Performance',
      '',
      '| Métrique | Valeur |',
      '|----------|--------|',
      `| Temps moyen | ${performance.avgExecutionTime.toFixed(2)}ms |`,
      `| Temps min | ${performance.minExecutionTime}ms |`,
      `| Temps max | ${performance.maxExecutionTime}ms |`,
      `| P50 | ${performance.p50ExecutionTime}ms |`,
      `| P90 | ${performance.p90ExecutionTime}ms |`,
      `| P99 | ${performance.p99ExecutionTime}ms |`,
      '',
      "## Par Type d'Opération",
      '',
      '| Opération | Count | Succès | Échecs | Durée Moy. |',
      '|-----------|-------|--------|--------|------------|',
      ...byOperation.map(
        (op) =>
          `| ${op.operationType} | ${op.count} | ${op.successCount} | ${op.failureCount} | ${op.avgDuration.toFixed(2)}ms |`,
      ),
    ];

    return lines.join('\n');
  }

  /**
   * Efface les données anciennes
   */
  purgeOldData(): number {
    const cutoff = new Date(Date.now() - this.options.retentionPeriod);
    let removedCount = 0;

    for (const [metricName, points] of this.dataPoints) {
      const filtered = points.filter((p) => p.timestamp >= cutoff);
      removedCount += points.length - filtered.length;
      this.dataPoints.set(metricName, filtered);
    }

    if (removedCount > 0) {
      logger.debug('Purged old data points', { removedCount });
    }

    return removedCount;
  }

  /**
   * Réinitialise le collecteur
   */
  reset(): void {
    this.dataPoints.clear();
    this.cachedMetrics = null;
    this.lastAggregation = null;
    logger.info('Metrics collector reset');
  }

  /**
   * Définit le logger d'audit
   */
  setAuditLogger(auditLogger: AuditLogger): void {
    this.options.auditLogger = auditLogger;
  }

  /*
   * =============================================================================
   * Private Helpers
   * =============================================================================
   */

  /**
   * Récupère les entrées d'audit pour une période
   */
  private getAuditEntries(period: MetricsPeriod): AuditEntry[] {
    if (!this.options.auditLogger) {
      return [];
    }

    return this.options.auditLogger.getHistory({
      startDate: period.start,
      endDate: period.end,
    });
  }

  /**
   * Collection synchrone des métriques
   */
  private collectSync(period: MetricsPeriod): SecurityMetrics {
    const entries = this.getAuditEntries(period);

    return {
      totalValidations: entries.length,
      passedValidations: entries.filter((e) => e.result.success).length,
      failedValidations: entries.filter((e) => !e.result.success).length,
      totalOperations: entries.length,
      successfulOperations: entries.filter((e) => e.result.success).length,
      rolledBackOperations: entries.filter((e) => e.operation.type === 'rollback').length,
      lowRiskOperations: entries.filter((e) => e.security.riskLevel === 'low').length,
      mediumRiskOperations: entries.filter((e) => e.security.riskLevel === 'medium').length,
      highRiskOperations: entries.filter((e) => e.security.riskLevel === 'high').length,
      criticalRiskOperations: entries.filter((e) => e.security.riskLevel === 'critical').length,
      avgConfidenceScore: this.calculateAvgConfidence(entries),
      avgValidationTime: this.calculateAvgDuration(entries),
      rollbackRate: this.calculateRollbackRate(entries),
    };
  }

  /**
   * Calcule la confiance moyenne
   */
  private calculateAvgConfidence(entries: AuditEntry[]): number {
    if (entries.length === 0) {
      return 0;
    }

    // La confiance est estimée en fonction des validations passées
    const validated = entries.filter((e) => e.security.validationsPassed.length > 0);

    if (validated.length === 0) {
      return 0;
    }

    const totalValidations = validated.reduce((sum, e) => sum + e.security.validationsPassed.length, 0);

    // Score basé sur le nombre de validations passées (max 5 pour 100%)
    return Math.min(100, (totalValidations / validated.length) * 20);
  }

  /**
   * Calcule la durée moyenne
   */
  private calculateAvgDuration(entries: AuditEntry[]): number {
    if (entries.length === 0) {
      return 0;
    }

    const total = entries.reduce((sum, e) => sum + e.result.duration, 0);

    return total / entries.length;
  }

  /**
   * Calcule le taux de rollback
   */
  private calculateRollbackRate(entries: AuditEntry[]): number {
    if (entries.length === 0) {
      return 0;
    }

    const rollbacks = entries.filter((e) => e.operation.type === 'rollback').length;

    return rollbacks / entries.length;
  }

  /**
   * Calcule la valeur d'une métrique spécifique
   */
  private calculateMetricValue(entries: AuditEntry[], metricKey: keyof SecurityMetrics): number {
    switch (metricKey) {
      case 'totalValidations':
      case 'totalOperations':
        return entries.length;
      case 'passedValidations':
      case 'successfulOperations':
        return entries.filter((e) => e.result.success).length;
      case 'failedValidations':
        return entries.filter((e) => !e.result.success).length;
      case 'rolledBackOperations':
        return entries.filter((e) => e.operation.type === 'rollback').length;
      case 'lowRiskOperations':
        return entries.filter((e) => e.security.riskLevel === 'low').length;
      case 'mediumRiskOperations':
        return entries.filter((e) => e.security.riskLevel === 'medium').length;
      case 'highRiskOperations':
        return entries.filter((e) => e.security.riskLevel === 'high').length;
      case 'criticalRiskOperations':
        return entries.filter((e) => e.security.riskLevel === 'critical').length;
      case 'avgConfidenceScore':
        return this.calculateAvgConfidence(entries);
      case 'avgValidationTime':
        return this.calculateAvgDuration(entries);
      case 'rollbackRate':
        return this.calculateRollbackRate(entries);
      default:
        return 0;
    }
  }
}

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

export function createMetricsCollector(options?: MetricsCollectorOptions): MetricsCollector {
  return new MetricsCollector(options);
}
