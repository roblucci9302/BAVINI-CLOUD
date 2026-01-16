/**
 * RLSValidator - Validation des politiques Row Level Security
 *
 * Ce module valide les politiques RLS pour s'assurer qu'elles sont
 * sécurisées, cohérentes et suivent les bonnes pratiques.
 */

import type { RLSPolicy, RLSAction, ValidationResult, ValidationError, ValidationWarning } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RLSValidator');

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export interface RLSValidatorOptions {
  strictMode?: boolean;
  requireAuthCheck?: boolean;
  allowPublicWrite?: boolean;
  maxPoliciesPerTable?: number;
}

export interface RLSValidationResult extends ValidationResult {
  securityScore: number;
  policyAnalysis: PolicyAnalysis[];
}

export interface PolicyAnalysis {
  policy: RLSPolicy;
  securityLevel: 'high' | 'medium' | 'low' | 'critical';
  issues: string[];
  recommendations: string[];
}

export interface RLSIssue {
  policy: string;
  type: 'overly_permissive' | 'no_auth_check' | 'syntax_error' | 'missing_action' | 'security_risk';
  severity: 'low' | 'medium' | 'high' | 'critical';
  message: string;
  recommendation?: string;
}

/*
 * =============================================================================
 * Constantes
 * =============================================================================
 */

const DEFAULT_OPTIONS: Required<RLSValidatorOptions> = {
  strictMode: false,
  requireAuthCheck: true,
  allowPublicWrite: false,
  maxPoliciesPerTable: 10,
};

// Patterns de vérification d'authentification
const AUTH_CHECK_PATTERNS = [/auth\.uid\(\)/i, /auth\.jwt\(\)/i, /auth\.role\(\)/i, /current_user/i, /session_user/i];

// Mots-clés dangereux dans les expressions RLS
const DANGEROUS_PATTERNS = [
  { pattern: /;\s*DROP/i, message: 'Injection SQL potentielle: DROP détecté' },
  { pattern: /;\s*DELETE/i, message: 'Injection SQL potentielle: DELETE détecté' },
  { pattern: /;\s*UPDATE/i, message: 'Injection SQL potentielle: UPDATE détecté' },
  { pattern: /EXECUTE/i, message: 'Utilisation de EXECUTE - vérifier la sécurité' },
  { pattern: /pg_catalog/i, message: 'Accès au catalogue système détecté' },
];

// Fonctions SQL dangereuses
const DANGEROUS_FUNCTIONS = [
  'pg_sleep',
  'pg_terminate_backend',
  'pg_cancel_backend',
  'lo_import',
  'lo_export',
  'pg_read_file',
  'pg_read_binary_file',
];

/*
 * =============================================================================
 * RLSValidator Class
 * =============================================================================
 */

export class RLSValidator {
  private options: Required<RLSValidatorOptions>;

  constructor(options: RLSValidatorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Valide une liste de politiques RLS
   */
  validate(policies: RLSPolicy[]): RLSValidationResult {
    logger.info('Validating RLS policies', { count: policies.length });

    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const policyAnalysis: PolicyAnalysis[] = [];

    // Regrouper les politiques par table
    const policiesByTable = this.groupByTable(policies);

    // Valider les politiques par table
    for (const [table, tablePolicies] of policiesByTable.entries()) {
      // Vérifier le nombre de politiques par table
      if (tablePolicies.length > this.options.maxPoliciesPerTable) {
        warnings.push({
          code: 'TOO_MANY_POLICIES',
          message: `Table "${table}" a ${tablePolicies.length} politiques (max: ${this.options.maxPoliciesPerTable})`,
          suggestion: 'Considérer consolider certaines politiques',
        });
      }

      // Vérifier la couverture des actions
      const coverageResult = this.checkActionCoverage(table, tablePolicies);
      errors.push(...coverageResult.errors);
      warnings.push(...coverageResult.warnings);
    }

    // Valider chaque politique individuellement
    for (const policy of policies) {
      const analysis = this.analyzePolicy(policy);
      policyAnalysis.push(analysis);

      // Convertir les issues en erreurs/warnings
      for (const issue of analysis.issues) {
        if (analysis.securityLevel === 'critical') {
          errors.push({
            code: 'CRITICAL_SECURITY_ISSUE',
            message: issue,
            severity: 'critical',
            location: policy.name,
          });
        } else if (analysis.securityLevel === 'low') {
          errors.push({
            code: 'SECURITY_ISSUE',
            message: issue,
            severity: 'error',
            location: policy.name,
          });
        } else {
          warnings.push({
            code: 'SECURITY_WARNING',
            message: issue,
            location: policy.name,
          });
        }
      }
    }

    // Calculer le score de sécurité
    const securityScore = this.calculateSecurityScore(policyAnalysis);

    const isValid = errors.filter((e) => e.severity === 'critical').length === 0 && securityScore >= 50;

    logger.info('RLS validation complete', {
      isValid,
      securityScore,
      errorCount: errors.length,
      warningCount: warnings.length,
    });

    return {
      isValid,
      errors,
      warnings,
      suggestions: this.generateSuggestions(policyAnalysis),
      securityScore,
      policyAnalysis,
    };
  }

  /**
   * Analyse une politique individuelle
   */
  private analyzePolicy(policy: RLSPolicy): PolicyAnalysis {
    const issues: string[] = [];
    const recommendations: string[] = [];
    let securityLevel: PolicyAnalysis['securityLevel'] = 'high';

    // 1. Vérifier les expressions "true" (trop permissives)
    if (this.isOverlyPermissive(policy)) {
      issues.push(`Politique "${policy.name}" est trop permissive (utilise 'true')`);
      recommendations.push("Ajouter des conditions de vérification d'identité");
      securityLevel = this.downgradeSecurityLevel(securityLevel, 'medium');

      // En mode strict, c'est une erreur critique pour les actions d'écriture
      if (this.options.strictMode && policy.action !== 'SELECT') {
        securityLevel = 'critical';
      }
    }

    // 2. Vérifier la présence de vérification d'authentification
    if (this.options.requireAuthCheck && !this.hasAuthCheck(policy)) {
      // Seulement si ce n'est pas un accès public explicite
      if (!policy.roles.includes('anon')) {
        issues.push(`Politique "${policy.name}" ne vérifie pas l'authentification`);
        recommendations.push('Ajouter auth.uid() ou auth.jwt() dans la condition');
        securityLevel = this.downgradeSecurityLevel(securityLevel, 'low');
      }
    }

    // 3. Vérifier les patterns dangereux
    const dangerousPatterns = this.checkDangerousPatterns(policy);

    if (dangerousPatterns.length > 0) {
      issues.push(...dangerousPatterns);
      securityLevel = 'critical';
    }

    // 4. Vérifier les fonctions dangereuses
    const dangerousFunctions = this.checkDangerousFunctions(policy);

    if (dangerousFunctions.length > 0) {
      issues.push(...dangerousFunctions);
      securityLevel = 'critical';
    }

    // 5. Vérifier la syntaxe des expressions
    const syntaxIssues = this.validateSyntax(policy);
    issues.push(...syntaxIssues);

    // 6. Vérifier les politiques d'écriture publiques
    if (!this.options.allowPublicWrite && this.isPublicWrite(policy)) {
      issues.push(`Politique "${policy.name}" autorise l'écriture publique`);
      recommendations.push("Restreindre les droits d'écriture aux utilisateurs authentifiés");
      securityLevel = this.downgradeSecurityLevel(securityLevel, 'low');
    }

    // 7. Ajouter des recommandations générales
    if (issues.length === 0) {
      recommendations.push('Politique conforme aux bonnes pratiques de sécurité');
    }

    return {
      policy,
      securityLevel,
      issues,
      recommendations,
    };
  }

  /**
   * Vérifie si une politique est trop permissive
   */
  private isOverlyPermissive(policy: RLSPolicy): boolean {
    const checkTrue = (expr: string | undefined) => expr?.trim().toLowerCase() === 'true';

    return checkTrue(policy.using) || checkTrue(policy.check);
  }

  /**
   * Vérifie si une politique contient une vérification d'authentification
   */
  private hasAuthCheck(policy: RLSPolicy): boolean {
    const expressions = [policy.using, policy.check].filter(Boolean).join(' ');

    return AUTH_CHECK_PATTERNS.some((pattern) => pattern.test(expressions));
  }

  /**
   * Vérifie les patterns dangereux dans une politique
   */
  private checkDangerousPatterns(policy: RLSPolicy): string[] {
    const issues: string[] = [];
    const expressions = [policy.using, policy.check].filter(Boolean).join(' ');

    for (const { pattern, message } of DANGEROUS_PATTERNS) {
      if (pattern.test(expressions)) {
        issues.push(`${policy.name}: ${message}`);
      }
    }

    return issues;
  }

  /**
   * Vérifie les fonctions dangereuses dans une politique
   */
  private checkDangerousFunctions(policy: RLSPolicy): string[] {
    const issues: string[] = [];
    const expressions = [policy.using, policy.check].filter(Boolean).join(' ').toLowerCase();

    for (const func of DANGEROUS_FUNCTIONS) {
      if (expressions.includes(func)) {
        issues.push(`${policy.name}: Fonction dangereuse détectée: ${func}`);
      }
    }

    return issues;
  }

  /**
   * Valide la syntaxe des expressions de la politique
   */
  private validateSyntax(policy: RLSPolicy): string[] {
    const issues: string[] = [];

    for (const [name, expr] of Object.entries({ using: policy.using, check: policy.check })) {
      if (!expr) {
        continue;
      }

      // Vérifier les parenthèses équilibrées
      let depth = 0;

      for (const char of expr) {
        if (char === '(') {
          depth++;
        }

        if (char === ')') {
          depth--;
        }

        if (depth < 0) {
          break;
        }
      }

      if (depth !== 0) {
        issues.push(`${policy.name}: Parenthèses non équilibrées dans ${name}`);
      }

      // Vérifier les guillemets équilibrés
      const singleQuotes = (expr.match(/'/g) || []).length;

      if (singleQuotes % 2 !== 0) {
        issues.push(`${policy.name}: Guillemets simples non appariés dans ${name}`);
      }

      // Vérifier la longueur maximale
      if (expr.length > 1000) {
        issues.push(`${policy.name}: Expression ${name} trop longue (${expr.length} caractères)`);
      }
    }

    return issues;
  }

  /**
   * Vérifie si une politique autorise l'écriture publique
   */
  private isPublicWrite(policy: RLSPolicy): boolean {
    const isWriteAction = ['INSERT', 'UPDATE', 'DELETE', 'ALL'].includes(policy.action);
    const hasAnon = policy.roles.includes('anon');
    const isPermissive = this.isOverlyPermissive(policy);

    return isWriteAction && hasAnon && isPermissive;
  }

  /**
   * Vérifie la couverture des actions CRUD pour une table
   */
  private checkActionCoverage(
    table: string,
    policies: RLSPolicy[],
  ): { errors: ValidationError[]; warnings: ValidationWarning[] } {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    const actions = new Set(policies.map((p) => p.action));
    const requiredActions: RLSAction[] = ['SELECT', 'INSERT', 'UPDATE', 'DELETE'];

    // Si une politique ALL existe, toutes les actions sont couvertes
    if (actions.has('ALL')) {
      return { errors, warnings };
    }

    // Vérifier les actions manquantes
    const missingActions = requiredActions.filter((a) => !actions.has(a));

    if (missingActions.length > 0) {
      warnings.push({
        code: 'MISSING_ACTIONS',
        message: `Table "${table}": actions non couvertes: ${missingActions.join(', ')}`,
        suggestion: 'Ajouter des politiques pour les actions manquantes ou vérifier si intentionnel',
      });
    }

    return { errors, warnings };
  }

  /**
   * Regroupe les politiques par table
   */
  private groupByTable(policies: RLSPolicy[]): Map<string, RLSPolicy[]> {
    const map = new Map<string, RLSPolicy[]>();

    for (const policy of policies) {
      const existing = map.get(policy.table) || [];
      existing.push(policy);
      map.set(policy.table, existing);
    }

    return map;
  }

  /**
   * Calcule un score de sécurité global (0-100)
   */
  private calculateSecurityScore(analyses: PolicyAnalysis[]): number {
    if (analyses.length === 0) {
      return 0;
    }

    let totalScore = 0;

    for (const analysis of analyses) {
      switch (analysis.securityLevel) {
        case 'high':
          totalScore += 100;
          break;
        case 'medium':
          totalScore += 70;
          break;
        case 'low':
          totalScore += 40;
          break;
        case 'critical':
          totalScore += 0;
          break;
      }
    }

    return Math.round(totalScore / analyses.length);
  }

  /**
   * Réduit le niveau de sécurité
   */
  private downgradeSecurityLevel(
    current: PolicyAnalysis['securityLevel'],
    target: PolicyAnalysis['securityLevel'],
  ): PolicyAnalysis['securityLevel'] {
    const levels: PolicyAnalysis['securityLevel'][] = ['critical', 'low', 'medium', 'high'];
    const currentIndex = levels.indexOf(current);
    const targetIndex = levels.indexOf(target);

    return levels[Math.min(currentIndex, targetIndex)];
  }

  /**
   * Génère des suggestions d'amélioration
   */
  private generateSuggestions(analyses: PolicyAnalysis[]): string[] {
    const suggestions: string[] = [];
    const issues = new Set<string>();

    for (const analysis of analyses) {
      for (const rec of analysis.recommendations) {
        if (!issues.has(rec)) {
          issues.add(rec);
          suggestions.push(rec);
        }
      }
    }

    // Ajouter des suggestions générales
    const hasPermissive = analyses.some((a) => a.issues.some((i) => i.includes('permissive')));

    if (hasPermissive) {
      suggestions.push('Éviter les politiques "true" sauf pour les lectures publiques intentionnelles');
    }

    const hasNoAuth = analyses.some((a) => a.issues.some((i) => i.includes('authentification')));

    if (hasNoAuth) {
      suggestions.push('Toujours inclure auth.uid() ou auth.jwt() pour les données utilisateur');
    }

    return suggestions;
  }

  /**
   * Valide une politique unique et retourne un résultat simplifié
   */
  validatePolicy(policy: RLSPolicy): PolicyAnalysis {
    return this.analyzePolicy(policy);
  }

  /**
   * Vérifie si une expression contient des patterns d'authentification valides
   */
  hasValidAuthPattern(expression: string): boolean {
    return AUTH_CHECK_PATTERNS.some((pattern) => pattern.test(expression));
  }
}

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

export function createRLSValidator(options?: RLSValidatorOptions): RLSValidator {
  return new RLSValidator(options);
}
