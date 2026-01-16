/**
 * ReviewManager - Gestion de la revue et approbation des opérations
 *
 * Ce module gère le processus de revue et d'approbation
 * des opérations de génération backend, avec différents
 * niveaux de risque et de confiance.
 */

import type { ReviewRequest, OperationDetails, Schema, Migration, RLSPolicy, ValidationResult } from './types';
import { CONFIDENCE_THRESHOLDS } from './types';
import { createScopedLogger } from '~/utils/logger';
import { TTLMap } from '~/lib/utils/ttl-map';

const logger = createScopedLogger('ReviewManager');

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface ReviewManagerOptions {
  autoApproveThreshold?: number;
  requireConfirmationThreshold?: number;
  enableAutoApprove?: boolean;
  /** TTL for pending reviews in milliseconds (default: 24 hours) */
  reviewTTLMs?: number;
  /** Cleanup interval for expired reviews (default: 5 minutes) */
  cleanupIntervalMs?: number;
  /** Maximum review history entries to keep (default: 1000) */
  maxHistorySize?: number;
}

export interface ReviewDecision {
  approved: boolean;
  reviewId: string;
  decision: 'approve' | 'modify' | 'reject';
  reason?: string;
  modifications?: Record<string, unknown>;
  reviewedAt: Date;
  reviewedBy?: string;
}

export interface OperationPreview {
  before: string;
  after: string;
  diff: string;
  summary: string;
}

export interface PendingReview {
  request: ReviewRequest;
  createdAt: Date;
  expiresAt?: Date;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'modified';
}

export type OperationType = 'create' | 'modify' | 'delete' | 'migrate';
export type TargetType = 'table' | 'column' | 'policy' | 'function' | 'index';
export type RiskLevel = 'low' | 'medium' | 'high' | 'critical';

/*
 * =============================================================================
 * Constantes
 * =============================================================================
 */

const DEFAULT_OPTIONS: Required<ReviewManagerOptions> = {
  autoApproveThreshold: CONFIDENCE_THRESHOLDS.AUTO_ACCEPT,
  requireConfirmationThreshold: CONFIDENCE_THRESHOLDS.REQUIRE_CONFIRMATION,
  enableAutoApprove: true,
  reviewTTLMs: 24 * 60 * 60 * 1000, // 24 hours
  cleanupIntervalMs: 5 * 60 * 1000, // 5 minutes
  maxHistorySize: 1000,
};

// Niveaux de revue par type d'opération
const REVIEW_LEVELS: Record<string, { level: 'auto' | 'suggested' | 'required'; minConfidence: number }> = {
  create_table: { level: 'auto', minConfidence: 85 },
  modify_column: { level: 'suggested', minConfidence: 70 },
  delete_table: { level: 'required', minConfidence: 100 },
  create_policy: { level: 'suggested', minConfidence: 80 },
  delete_policy: { level: 'required', minConfidence: 100 },
  migrate_destructive: { level: 'required', minConfidence: 100 },
  migrate_additive: { level: 'auto', minConfidence: 85 },
  create_function: { level: 'suggested', minConfidence: 75 },
  create_index: { level: 'auto', minConfidence: 85 },
};

/*
 * =============================================================================
 * ReviewManager Class
 * =============================================================================
 */

export class ReviewManager {
  private options: Required<ReviewManagerOptions>;
  private pendingReviews: TTLMap<string, PendingReview>;
  private reviewHistory: ReviewDecision[] = [];

  constructor(options: ReviewManagerOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };

    // Initialize TTLMap for pending reviews with automatic cleanup
    this.pendingReviews = new TTLMap<string, PendingReview>({
      ttlMs: this.options.reviewTTLMs,
      cleanupIntervalMs: this.options.cleanupIntervalMs,
      maxSize: 10000, // Prevent unbounded growth
      touchOnGet: false, // Don't extend TTL on access - reviews should expire
      name: 'ReviewManager.pendingReviews',
      onExpire: (reviewId, value) => {
        const review = value as PendingReview;
        review.status = 'expired';
        logger.info('Review expired automatically', { reviewId });
      },
    });
  }

  /**
   * Crée une demande de revue pour une opération
   */
  async requestReview(
    operation: OperationDetails,
    context?: {
      schema?: Schema;
      migration?: Migration;
      policies?: RLSPolicy[];
      validation?: ValidationResult;
    },
  ): Promise<ReviewRequest> {
    logger.info('Creating review request', { type: operation.type, target: operation.target });

    const riskLevel = this.assessRisk(operation);
    const confidence = await this.calculateConfidence(operation, context?.validation);

    const autoApproved = this.shouldAutoApprove(riskLevel, confidence);

    const preview = await this.generatePreview(operation, context);

    const request: ReviewRequest = {
      id: this.generateReviewId(),
      type: this.mapOperationType(operation),
      operation,
      riskLevel,
      confidence,
      autoApproved,
      preview,
      suggestedAction: this.suggestAction(riskLevel, confidence),
      warnings: this.collectWarnings(operation, context),
      recommendations: this.generateRecommendations(operation, riskLevel),
    };

    // Stocker la revue si non auto-approuvée
    if (!autoApproved) {
      this.pendingReviews.set(request.id, {
        request,
        createdAt: new Date(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24h
        status: 'pending',
      });
    }

    logger.info('Review request created', {
      id: request.id,
      riskLevel,
      confidence,
      autoApproved,
    });

    return request;
  }

  /**
   * Soumet une décision de revue
   */
  async submitDecision(
    reviewId: string,
    decision: 'approve' | 'modify' | 'reject',
    options?: {
      reason?: string;
      modifications?: Record<string, unknown>;
      reviewedBy?: string;
    },
  ): Promise<ReviewDecision> {
    const pending = this.pendingReviews.get(reviewId);

    if (!pending) {
      throw new Error(`Review ${reviewId} not found or already processed`);
    }

    if (pending.status !== 'pending') {
      throw new Error(`Review ${reviewId} is already ${pending.status}`);
    }

    const reviewDecision: ReviewDecision = {
      approved: decision === 'approve',
      reviewId,
      decision,
      reason: options?.reason,
      modifications: options?.modifications,
      reviewedAt: new Date(),
      reviewedBy: options?.reviewedBy,
    };

    // Mettre à jour le statut
    pending.status = decision === 'approve' ? 'approved' : decision === 'reject' ? 'rejected' : 'modified';

    // Ajouter à l'historique
    this.reviewHistory.push(reviewDecision);

    logger.info('Review decision submitted', {
      reviewId,
      decision,
      reviewedBy: options?.reviewedBy,
    });

    return reviewDecision;
  }

  /**
   * Évalue le niveau de risque d'une opération
   */
  assessRisk(operation: OperationDetails): RiskLevel {
    // Opérations destructives = risque critique
    if (operation.isDestructive) {
      return 'critical';
    }

    // Modification de structure = risque élevé
    if (operation.modifiesStructure && operation.type === 'delete') {
      return 'high';
    }

    if (operation.modifiesStructure) {
      return 'medium';
    }

    // Ajout simple = risque faible
    if (operation.isAdditive) {
      return 'low';
    }

    return 'medium';
  }

  /**
   * Calcule le score de confiance pour une opération
   */
  async calculateConfidence(operation: OperationDetails, validation?: ValidationResult): Promise<number> {
    let confidence = 100;

    // Réduire la confiance en fonction des erreurs de validation
    if (validation) {
      confidence -= validation.errors.length * 10;
      confidence -= validation.warnings.length * 5;
    }

    // Réduire la confiance pour les opérations complexes
    if (operation.affectedElements.length > 5) {
      confidence -= 10;
    }

    // Réduire la confiance pour les opérations destructives
    if (operation.isDestructive) {
      confidence -= 20;
    }

    // Réduire la confiance pour les modifications de structure
    if (operation.modifiesStructure) {
      confidence -= 10;
    }

    // Minimum 0, maximum 100
    return Math.max(0, Math.min(100, confidence));
  }

  /**
   * Détermine si une opération doit être auto-approuvée
   */
  private shouldAutoApprove(riskLevel: RiskLevel, confidence: number): boolean {
    if (!this.options.enableAutoApprove) {
      return false;
    }

    // Jamais auto-approuver les opérations critiques ou à haut risque
    if (riskLevel === 'critical' || riskLevel === 'high') {
      return false;
    }

    return confidence >= this.options.autoApproveThreshold;
  }

  /**
   * Suggère une action basée sur le risque et la confiance
   */
  private suggestAction(riskLevel: RiskLevel, confidence: number): 'approve' | 'modify' | 'reject' {
    if (riskLevel === 'critical') {
      return confidence >= 90 ? 'approve' : 'reject';
    }

    if (riskLevel === 'high') {
      return confidence >= 80 ? 'approve' : 'modify';
    }

    if (confidence >= CONFIDENCE_THRESHOLDS.AUTO_ACCEPT) {
      return 'approve';
    }

    if (confidence >= CONFIDENCE_THRESHOLDS.SUGGEST_REVIEW) {
      return 'modify';
    }

    return 'reject';
  }

  /**
   * Génère un aperçu de l'opération
   */
  async generatePreview(
    operation: OperationDetails,
    context?: {
      schema?: Schema;
      migration?: Migration;
      policies?: RLSPolicy[];
    },
  ): Promise<OperationPreview> {
    const before = this.generateBeforeState(operation, context);
    const after = this.generateAfterState(operation, context);
    const diff = this.generateDiff(before, after);
    const summary = this.generateSummary(operation);

    return { before, after, diff, summary };
  }

  /**
   * Génère l'état avant l'opération
   */
  private generateBeforeState(
    operation: OperationDetails,
    context?: { schema?: Schema; migration?: Migration; policies?: RLSPolicy[] },
  ): string {
    if (operation.type === 'create') {
      return '(nouveau)';
    }

    if (context?.migration) {
      return `-- État actuel\n-- Tables affectées: ${operation.affectedElements.join(', ')}`;
    }

    if (context?.schema) {
      const tables = context.schema.tables
        .filter((t) => operation.affectedElements.includes(t.name))
        .map((t) => `Table: ${t.name} (${t.columns.length} colonnes)`);
      return tables.join('\n') || '(aucun état précédent)';
    }

    return '(état précédent non disponible)';
  }

  /**
   * Génère l'état après l'opération
   */
  private generateAfterState(
    operation: OperationDetails,
    context?: { schema?: Schema; migration?: Migration; policies?: RLSPolicy[] },
  ): string {
    if (operation.type === 'delete') {
      return '(supprimé)';
    }

    if (context?.migration) {
      return context.migration.up.slice(0, 500) + (context.migration.up.length > 500 ? '\n...' : '');
    }

    if (context?.policies) {
      return context.policies.map((p) => `Policy: ${p.name} on ${p.table} (${p.action})`).join('\n');
    }

    return `${operation.type} ${operation.target}: ${operation.name}`;
  }

  /**
   * Génère un diff visuel
   */
  private generateDiff(before: string, after: string): string {
    const lines: string[] = [];

    if (before !== '(nouveau)') {
      lines.push(`- ${before.split('\n')[0]}`);
    }

    if (after !== '(supprimé)') {
      lines.push(`+ ${after.split('\n')[0]}`);
    }

    return lines.join('\n') || '(pas de changements)';
  }

  /**
   * Génère un résumé de l'opération
   */
  private generateSummary(operation: OperationDetails): string {
    const actionVerbs: Record<OperationType, string> = {
      create: 'Création',
      modify: 'Modification',
      delete: 'Suppression',
      migrate: 'Migration',
    };

    const targetNames: Record<TargetType, string> = {
      table: 'table',
      column: 'colonne',
      policy: 'politique RLS',
      function: 'fonction',
      index: 'index',
    };

    const action = actionVerbs[operation.type] || operation.type;
    const target = targetNames[operation.target] || operation.target;

    let summary = `${action} de ${target}: ${operation.name}`;

    if (operation.affectedElements.length > 1) {
      summary += ` (${operation.affectedElements.length} éléments affectés)`;
    }

    if (operation.isDestructive) {
      summary += ' [DESTRUCTIF]';
    }

    return summary;
  }

  /**
   * Collecte les avertissements pour une opération
   */
  private collectWarnings(operation: OperationDetails, context?: { validation?: ValidationResult }): string[] {
    const warnings: string[] = [];

    if (operation.isDestructive) {
      warnings.push('Cette opération est destructive et ne peut pas être annulée facilement');
    }

    if (operation.modifiesStructure) {
      warnings.push('Cette opération modifie la structure de la base de données');
    }

    if (operation.affectedElements.length > 10) {
      warnings.push(`Cette opération affecte ${operation.affectedElements.length} éléments`);
    }

    if (context?.validation?.warnings) {
      warnings.push(...context.validation.warnings.map((w) => w.message));
    }

    return warnings;
  }

  /**
   * Génère des recommandations pour une opération
   */
  private generateRecommendations(operation: OperationDetails, riskLevel: RiskLevel): string[] {
    const recommendations: string[] = [];

    if (riskLevel === 'critical' || riskLevel === 'high') {
      recommendations.push('Créez une sauvegarde avant de procéder');
      recommendations.push("Testez d'abord en environnement de développement");
    }

    if (operation.isDestructive) {
      recommendations.push("Vérifiez qu'aucune donnée importante ne sera perdue");
      recommendations.push("Assurez-vous d'avoir un plan de rollback");
    }

    if (operation.type === 'migrate') {
      recommendations.push('Exécutez les tests de régression après la migration');
    }

    if (operation.target === 'policy') {
      recommendations.push('Vérifiez que les politiques RLS ne bloquent pas les accès légitimes');
    }

    return recommendations;
  }

  /**
   * Mappe le type d'opération vers le type de revue
   */
  private mapOperationType(operation: OperationDetails): ReviewRequest['type'] {
    if (operation.type === 'migrate') {
      return 'migration';
    }

    if (operation.target === 'policy') {
      return 'rls';
    }

    if (operation.target === 'function') {
      return 'api';
    }

    return 'schema';
  }

  /**
   * Génère un ID unique pour la revue
   */
  private generateReviewId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).slice(2, 10);

    return `rev_${timestamp}_${random}`;
  }

  /**
   * Récupère les revues en attente
   */
  getPendingReviews(): PendingReview[] {
    return Array.from(this.pendingReviews.values()).filter((r) => r.status === 'pending');
  }

  /**
   * Récupère une revue par ID
   */
  getReview(reviewId: string): PendingReview | undefined {
    return this.pendingReviews.get(reviewId);
  }

  /**
   * Récupère l'historique des décisions
   */
  getReviewHistory(filters?: {
    decision?: ReviewDecision['decision'];
    startDate?: Date;
    endDate?: Date;
  }): ReviewDecision[] {
    let history = [...this.reviewHistory];

    if (filters?.decision) {
      history = history.filter((r) => r.decision === filters.decision);
    }

    if (filters?.startDate) {
      history = history.filter((r) => r.reviewedAt >= filters.startDate!);
    }

    if (filters?.endDate) {
      history = history.filter((r) => r.reviewedAt <= filters.endDate!);
    }

    return history;
  }

  /**
   * Expire les revues en attente dépassées
   */
  expirePendingReviews(): number {
    const now = new Date();
    let expiredCount = 0;

    for (const [id, review] of this.pendingReviews.entries()) {
      if (review.status === 'pending' && review.expiresAt && review.expiresAt < now) {
        review.status = 'expired';
        expiredCount++;
        logger.info('Review expired', { reviewId: id });
      }
    }

    return expiredCount;
  }

  /**
   * Nettoie les anciennes revues et limite la taille de l'historique
   */
  cleanup(maxAge: number = 7 * 24 * 60 * 60 * 1000): number {
    const cutoff = new Date(Date.now() - maxAge);
    let removedCount = 0;

    // TTLMap handles automatic cleanup, but we can trigger manual cleanup for non-pending reviews
    for (const [id, review] of this.pendingReviews.entries()) {
      if (review.createdAt < cutoff && review.status !== 'pending') {
        this.pendingReviews.delete(id);
        removedCount++;
      }
    }

    // Nettoyer l'historique par âge
    const oldHistoryLength = this.reviewHistory.length;
    this.reviewHistory = this.reviewHistory.filter((r) => r.reviewedAt >= cutoff);
    removedCount += oldHistoryLength - this.reviewHistory.length;

    // Limiter la taille de l'historique (garder les plus récents)
    if (this.reviewHistory.length > this.options.maxHistorySize) {
      const excess = this.reviewHistory.length - this.options.maxHistorySize;
      this.reviewHistory = this.reviewHistory.slice(excess);
      removedCount += excess;
    }

    logger.debug('Cleanup completed', { removedCount });

    return removedCount;
  }

  /**
   * Dispose resources and stop cleanup timers
   */
  dispose(): void {
    logger.info('Disposing ReviewManager');
    this.pendingReviews.dispose();
    this.reviewHistory = [];
  }

  /**
   * Get TTLMap statistics
   */
  getMapStats() {
    return this.pendingReviews.getStats();
  }

  /**
   * Obtient les statistiques de revue
   */
  getStatistics(): {
    pending: number;
    approved: number;
    rejected: number;
    modified: number;
    expired: number;
    avgDecisionTime: number;
  } {
    const reviews = Array.from(this.pendingReviews.values());

    const stats = {
      pending: reviews.filter((r) => r.status === 'pending').length,
      approved: reviews.filter((r) => r.status === 'approved').length,
      rejected: reviews.filter((r) => r.status === 'rejected').length,
      modified: reviews.filter((r) => r.status === 'modified').length,
      expired: reviews.filter((r) => r.status === 'expired').length,
      avgDecisionTime: 0,
    };

    // Calculer le temps moyen de décision
    const decidedReviews = this.reviewHistory;

    if (decidedReviews.length > 0) {
      const totalTime = decidedReviews.reduce((sum, decision) => {
        const review = this.pendingReviews.get(decision.reviewId);

        if (review) {
          return sum + (decision.reviewedAt.getTime() - review.createdAt.getTime());
        }

        return sum;
      }, 0);
      stats.avgDecisionTime = totalTime / decidedReviews.length;
    }

    return stats;
  }
}

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

export function createReviewManager(options?: ReviewManagerOptions): ReviewManager {
  return new ReviewManager(options);
}

/*
 * =============================================================================
 * Message Templates
 * =============================================================================
 */

export const REVIEW_MESSAGE_TEMPLATES = {
  schemaCreation: (tables: string[], sql: string) => `
## Création de schéma

Je vais créer les tables suivantes:
${tables.map((t) => `- \`${t}\``).join('\n')}

### Détails
\`\`\`sql
${sql}
\`\`\`

**Voulez-vous procéder ?**
- Approuver et créer
- Modifier avant création
- Annuler
`,

  destructiveChange: (operation: string, affected: string[]) => `
## Opération Destructive

**Action:** ${operation}

**Éléments affectés:**
${affected.map((a) => `- \`${a}\``).join('\n')}

**Cette action est irréversible.** Un backup sera créé avant exécution.

**Confirmez-vous cette opération ?**
`,

  migrationReview: (migration: { name: string; up: string }, testSuccess: boolean, warnings: string[]) => `
## Revue de Migration

### Migration: ${migration.name}

### Changements
\`\`\`sql
${migration.up}
\`\`\`

### Tests Sandbox
${testSuccess ? 'Tous les tests passent' : 'Erreurs détectées'}

${warnings.length > 0 ? warnings.map((w) => `- ${w}`).join('\n') : ''}

**Appliquer cette migration ?**
`,

  rlsReview: (policies: Array<{ name: string; table: string; action: string }>) => `
## Revue des Politiques RLS

### Politiques à créer:
${policies.map((p) => `- \`${p.name}\` sur \`${p.table}\` (${p.action})`).join('\n')}

**Appliquer ces politiques ?**
`,
};
