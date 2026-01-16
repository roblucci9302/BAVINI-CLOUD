/**
 * QualityEvaluator - Service d'évaluation de la qualité du code
 * Analyse le code généré et calcule un score de qualité
 */

import {
  type QualityScore,
  type QualityReport,
  type QualityIssue,
  type QualityMetrics,
  type QualityLevel,
  type QualityAction,
  type QualityThresholds,
  type QualityCategories,
  DEFAULT_THRESHOLDS,
  CATEGORY_WEIGHTS,
} from './types';
import { AccessibilityEvaluator, ResponsiveEvaluator, UXPatternsEvaluator } from './evaluators';

/**
 * Représentation d'un fichier extrait du code généré
 */
interface ExtractedFile {
  path: string;
  content: string;
  language: string;
}

/**
 * Classe principale d'évaluation de qualité (Enhanced)
 */
export class QualityEvaluator {
  private thresholds: QualityThresholds;
  private accessibilityEvaluator: AccessibilityEvaluator;
  private responsiveEvaluator: ResponsiveEvaluator;
  private uxPatternsEvaluator: UXPatternsEvaluator;

  constructor(thresholds: QualityThresholds = DEFAULT_THRESHOLDS) {
    this.thresholds = thresholds;
    this.accessibilityEvaluator = new AccessibilityEvaluator();
    this.responsiveEvaluator = new ResponsiveEvaluator();
    this.uxPatternsEvaluator = new UXPatternsEvaluator();
  }

  /**
   * Évaluer la qualité du code généré à partir de la réponse LLM
   */
  evaluate(generatedContent: string): QualityReport {
    const files = this.extractFiles(generatedContent);
    const metrics = this.collectMetrics(files);
    const issues = this.detectIssues(files, metrics);
    const score = this.calculateScore(metrics, issues);

    return {
      timestamp: new Date(),
      score,
      issues,
      summary: this.generateSummary(score, issues),
      suggestions: this.generateSuggestions(score, issues),
      metrics,
    };
  }

  /**
   * Extraire les fichiers du contenu généré (blocs boltAction)
   */
  private extractFiles(content: string): ExtractedFile[] {
    const files: ExtractedFile[] = [];

    // Pattern pour extraire les fichiers des boltAction
    const filePattern = /<boltAction[^>]*type="file"[^>]*filePath="([^"]+)"[^>]*>([\s\S]*?)<\/boltAction>/g;

    let match;

    while ((match = filePattern.exec(content)) !== null) {
      const path = match[1];
      const fileContent = match[2].trim();
      const language = this.detectLanguage(path);

      files.push({ path, content: fileContent, language });
    }

    // Pattern alternatif pour les blocs de code markdown
    const codeBlockPattern = /```(\w+)?\s*\n([\s\S]*?)```/g;

    while ((match = codeBlockPattern.exec(content)) !== null) {
      const language = match[1] || 'unknown';
      const fileContent = match[2].trim();

      // Éviter les doublons si déjà extrait via boltAction
      if (!files.some((f) => f.content === fileContent)) {
        files.push({
          path: `extracted.${this.getExtension(language)}`,
          content: fileContent,
          language,
        });
      }
    }

    return files;
  }

  /**
   * Collecter les métriques sur les fichiers (Enhanced)
   */
  private collectMetrics(files: ExtractedFile[]): QualityMetrics {
    let totalLines = 0;
    let typescriptFiles = 0;
    let testFiles = 0;
    let filesWithAny = 0;
    let filesWithErrorHandling = 0;
    let largeFiles = 0;

    for (const file of files) {
      const lines = file.content.split('\n').length;
      totalLines += lines;

      // TypeScript vs JavaScript
      if (file.language === 'typescript' || file.language === 'tsx') {
        typescriptFiles++;
      }

      // Fichiers de test
      if (file.path.includes('.spec.') || file.path.includes('.test.') || file.path.includes('__tests__')) {
        testFiles++;
      }

      // Utilisation de 'any'
      if (file.content.includes(': any') || file.content.includes('<any>') || file.content.includes('as any')) {
        filesWithAny++;
      }

      // Gestion d'erreurs
      if (file.content.includes('try {') || file.content.includes('catch (') || file.content.includes('.catch(')) {
        filesWithErrorHandling++;
      }

      // Fichiers volumineux
      if (lines > 100) {
        largeFiles++;
      }
    }

    // Évaluer les nouvelles catégories avec les évaluateurs spécialisés
    const accessibilityResult = this.accessibilityEvaluator.evaluate(files);
    const responsiveResult = this.responsiveEvaluator.evaluate(files);
    const uxPatternsResult = this.uxPatternsEvaluator.evaluate(files);

    return {
      filesAnalyzed: files.length,
      totalLines,
      typescriptFiles,
      testFiles,
      filesWithAny,
      filesWithErrorHandling,
      largeFiles,
      accessibility: accessibilityResult.metrics,
      responsive: responsiveResult.metrics,
      uxPatterns: uxPatternsResult.metrics,
    };
  }

  /**
   * Détecter les problèmes de qualité (Enhanced)
   */
  private detectIssues(files: ExtractedFile[], metrics: QualityMetrics): QualityIssue[] {
    const issues: QualityIssue[] = [];

    // Ajouter les issues des évaluateurs spécialisés
    const accessibilityResult = this.accessibilityEvaluator.evaluate(files);
    const responsiveResult = this.responsiveEvaluator.evaluate(files);
    const uxPatternsResult = this.uxPatternsEvaluator.evaluate(files);

    issues.push(...accessibilityResult.issues);
    issues.push(...responsiveResult.issues);
    issues.push(...uxPatternsResult.issues);

    // Vérification TypeScript
    const jsFiles = files.filter(
      (f) => (f.language === 'javascript' || f.language === 'jsx') && !f.path.includes('.config.'),
    );

    if (jsFiles.length > 0) {
      issues.push({
        category: 'typescript',
        severity: 'major',
        message: `${jsFiles.length} fichier(s) JavaScript au lieu de TypeScript`,
        suggestion: 'Convertir en TypeScript (.ts/.tsx) avec typage strict',
        impact: -10 * jsFiles.length,
      });
    }

    // Vérification des 'any'
    if (metrics.filesWithAny > 0) {
      issues.push({
        category: 'typescript',
        severity: 'major',
        message: `${metrics.filesWithAny} fichier(s) utilisent le type 'any'`,
        suggestion: 'Remplacer par des types spécifiques ou génériques',
        impact: -5 * metrics.filesWithAny,
      });
    }

    // Vérification des tests
    const codeFiles = files.filter(
      (f) =>
        !f.path.includes('.spec.') &&
        !f.path.includes('.test.') &&
        !f.path.includes('config') &&
        (f.language === 'typescript' || f.language === 'tsx'),
    );

    if (codeFiles.length > 0 && metrics.testFiles === 0) {
      issues.push({
        category: 'testing',
        severity: 'critical',
        message: 'Aucun fichier de test détecté',
        suggestion: 'Ajouter des tests avec Vitest pour chaque module',
        impact: -25,
      });
    } else if (metrics.testFiles < codeFiles.length * 0.5) {
      issues.push({
        category: 'testing',
        severity: 'major',
        message: `Couverture de tests insuffisante (${metrics.testFiles}/${codeFiles.length} fichiers)`,
        suggestion: 'Ajouter des tests pour les modules manquants',
        impact: -15,
      });
    }

    // Vérification gestion d'erreurs
    const asyncFiles = files.filter((f) => f.content.includes('async ') || f.content.includes('Promise'));
    const asyncWithoutCatch = asyncFiles.filter((f) => !f.content.includes('try {') && !f.content.includes('.catch('));

    if (asyncWithoutCatch.length > 0) {
      issues.push({
        category: 'security',
        severity: 'major',
        message: `${asyncWithoutCatch.length} fichier(s) async sans gestion d'erreurs`,
        suggestion: 'Ajouter try/catch pour toutes les opérations async',
        impact: -8 * asyncWithoutCatch.length,
      });
    }

    // Vérification fichiers volumineux
    if (metrics.largeFiles > 0) {
      issues.push({
        category: 'maintainability',
        severity: 'minor',
        message: `${metrics.largeFiles} fichier(s) dépassent 100 lignes`,
        suggestion: 'Découper en modules plus petits (max 100 lignes)',
        impact: -3 * metrics.largeFiles,
      });
    }

    // Vérification sécurité basique
    for (const file of files) {
      // Secrets en dur
      if (file.content.match(/(['"])(sk_|api_key_|password|secret)[^'"]*\1/i) && !file.path.includes('.env')) {
        issues.push({
          category: 'security',
          severity: 'critical',
          message: `Secret potentiel détecté dans ${file.path}`,
          file: file.path,
          suggestion: "Utiliser des variables d'environnement",
          impact: -20,
        });
      }

      // eval() ou innerHTML
      if (file.content.includes('eval(') || file.content.includes('innerHTML =')) {
        issues.push({
          category: 'security',
          severity: 'critical',
          message: `Risque XSS/injection dans ${file.path}`,
          file: file.path,
          suggestion: 'Éviter eval() et innerHTML, utiliser des méthodes sécurisées',
          impact: -15,
        });
      }
    }

    // Vérification structure projet
    const hasPackageJson = files.some((f) => f.path === 'package.json');
    const hasTsConfig = files.some((f) => f.path === 'tsconfig.json');
    const hasVitestConfig = files.some((f) => f.path.includes('vitest.config'));

    if (!hasPackageJson && files.length > 1) {
      issues.push({
        category: 'structure',
        severity: 'major',
        message: 'Fichier package.json manquant',
        suggestion: 'Ajouter package.json avec les scripts npm requis',
        impact: -10,
      });
    }

    if (!hasTsConfig && metrics.typescriptFiles > 0) {
      issues.push({
        category: 'structure',
        severity: 'major',
        message: 'Fichier tsconfig.json manquant',
        suggestion: 'Ajouter tsconfig.json avec mode strict',
        impact: -10,
      });
    }

    if (!hasVitestConfig && metrics.testFiles > 0) {
      issues.push({
        category: 'structure',
        severity: 'minor',
        message: 'Configuration Vitest manquante',
        suggestion: 'Ajouter vitest.config.ts',
        impact: -5,
      });
    }

    return issues;
  }

  /**
   * Calculer le score de qualité (Enhanced)
   */
  private calculateScore(metrics: QualityMetrics, issues: QualityIssue[]): QualityScore {
    // Score de base par catégorie (100 points)
    const categoryScores: QualityCategories = {
      typescript: 100,
      testing: 100,
      security: 100,
      performance: 100,
      maintainability: 100,
      structure: 100,

      // Nouvelles catégories - initialisées à partir des métriques
      accessibility: metrics.accessibility.score,
      responsive: metrics.responsive.score,
      uxPatterns: metrics.uxPatterns.score,
    };

    // Appliquer les impacts des issues (catégories legacy)
    for (const issue of issues) {
      // Ne pas réappliquer les impacts pour les nouvelles catégories (déjà dans le score)
      if (!['accessibility', 'responsive', 'uxPatterns'].includes(issue.category)) {
        categoryScores[issue.category] = Math.max(0, categoryScores[issue.category] + issue.impact);
      }
    }

    // Bonus TypeScript si tout est en TS
    if (metrics.filesAnalyzed > 0 && metrics.typescriptFiles === metrics.filesAnalyzed) {
      categoryScores.typescript = Math.min(100, categoryScores.typescript + 10);
    }

    // Bonus tests si ratio correct
    if (metrics.testFiles > 0 && metrics.testFiles >= metrics.filesAnalyzed * 0.3) {
      categoryScores.testing = Math.min(100, categoryScores.testing + 10);
    }

    // Calculer le score global pondéré
    let overall = 0;

    for (const [category, weight] of Object.entries(CATEGORY_WEIGHTS)) {
      overall += categoryScores[category as keyof QualityCategories] * weight;
    }
    overall = Math.round(Math.max(0, Math.min(100, overall)));

    // Déterminer le niveau
    const level = this.determineLevel(overall);

    // Déterminer l'action
    const action = this.determineAction(level, issues);

    return {
      overall,
      categories: categoryScores,
      level,
      action,
    };
  }

  /**
   * Déterminer le niveau de qualité
   */
  private determineLevel(score: number): QualityLevel {
    if (score >= this.thresholds.excellent) {
      return 'excellent';
    }

    if (score >= this.thresholds.good) {
      return 'good';
    }

    if (score >= this.thresholds.acceptable) {
      return 'acceptable';
    }

    if (score >= this.thresholds.poor) {
      return 'poor';
    }

    return 'critical';
  }

  /**
   * Déterminer l'action à prendre
   */
  private determineAction(level: QualityLevel, issues: QualityIssue[]): QualityAction {
    const hasCritical = issues.some((i) => i.severity === 'critical');

    if (hasCritical) {
      return 'refactor';
    }

    if (level === 'critical' || level === 'poor') {
      return 'improve';
    }

    if (level === 'acceptable') {
      return 'suggest';
    }

    return 'approve';
  }

  /**
   * Générer un résumé en français
   */
  private generateSummary(score: QualityScore, issues: QualityIssue[]): string {
    const levelText: Record<QualityLevel, string> = {
      excellent: 'Excellent ! Le code respecte les standards de qualité BAVINI.',
      good: 'Bon niveau de qualité avec quelques améliorations possibles.',
      acceptable: 'Qualité acceptable mais des améliorations sont recommandées.',
      poor: 'Qualité insuffisante. Des corrections sont nécessaires.',
      critical: 'Qualité critique. Refactoring obligatoire avant mise en production.',
    };

    const criticalCount = issues.filter((i) => i.severity === 'critical').length;
    const majorCount = issues.filter((i) => i.severity === 'major').length;

    let summary = `Score: ${score.overall}/100 - ${levelText[score.level]}`;

    if (criticalCount > 0) {
      summary += ` ⚠️ ${criticalCount} problème(s) critique(s) détecté(s).`;
    }

    if (majorCount > 0) {
      summary += ` ${majorCount} problème(s) majeur(s).`;
    }

    return summary;
  }

  /**
   * Générer des suggestions d'amélioration
   */
  private generateSuggestions(score: QualityScore, issues: QualityIssue[]): string[] {
    if (score.action === 'approve') {
      return [];
    }

    const suggestions: string[] = [];

    // Regrouper par catégorie et prioriser
    const byCategory = new Map<string, QualityIssue[]>();

    for (const issue of issues) {
      const list = byCategory.get(issue.category) || [];
      list.push(issue);
      byCategory.set(issue.category, list);
    }

    // Ajouter les suggestions par ordre de priorité (Enhanced)
    const priorityOrder: Array<keyof QualityCategories> = [
      'security',
      'typescript',
      'testing',
      'accessibility',
      'maintainability',
      'performance',
      'responsive',
      'uxPatterns',
      'structure',
    ];

    for (const category of priorityOrder) {
      const categoryIssues = byCategory.get(category);

      if (categoryIssues && categoryIssues.length > 0) {
        // Prendre les suggestions des issues critiques et majeures d'abord
        const sorted = categoryIssues.sort((a, b) => {
          const severityOrder = { critical: 0, major: 1, minor: 2, info: 3 };
          return severityOrder[a.severity] - severityOrder[b.severity];
        });

        for (const issue of sorted.slice(0, 2)) {
          if (issue.suggestion) {
            suggestions.push(`[${category.toUpperCase()}] ${issue.suggestion}`);
          }
        }
      }
    }

    return suggestions.slice(0, 5); // Max 5 suggestions
  }

  /**
   * Détecter le langage à partir de l'extension
   */
  private detectLanguage(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase();
    const langMap: Record<string, string> = {
      ts: 'typescript',
      tsx: 'tsx',
      js: 'javascript',
      jsx: 'jsx',
      json: 'json',
      css: 'css',
      scss: 'scss',
      html: 'html',
      md: 'markdown',
    };

    return langMap[ext || ''] || 'unknown';
  }

  /**
   * Obtenir l'extension pour un langage
   */
  private getExtension(language: string): string {
    const extMap: Record<string, string> = {
      typescript: 'ts',
      tsx: 'tsx',
      javascript: 'js',
      jsx: 'jsx',
      json: 'json',
      css: 'css',
    };
    return extMap[language] || 'txt';
  }

  /**
   * Vérifier si une amélioration doit être proposée
   */
  shouldSuggestImprovement(report: QualityReport): boolean {
    return report.score.action !== 'approve';
  }

  /**
   * Générer le prompt d'amélioration pour le LLM
   */
  generateImprovementPrompt(report: QualityReport): string {
    if (!this.shouldSuggestImprovement(report)) {
      return '';
    }

    const lines = [
      '\n\n---\n',
      `📊 **Évaluation Qualité BAVINI** : ${report.score.overall}/100 (${report.score.level})`,
      '',
    ];

    if (report.suggestions.length > 0) {
      lines.push('💡 **Améliorations recommandées** :');

      for (const suggestion of report.suggestions) {
        lines.push(`- ${suggestion}`);
      }
    }

    if (report.score.action === 'improve' || report.score.action === 'refactor') {
      lines.push('');
      lines.push('⚠️ *Je vais appliquer ces améliorations automatiquement...*');
    }

    return lines.join('\n');
  }
}

/**
 * Instance singleton du QualityEvaluator
 */
let evaluatorInstance: QualityEvaluator | null = null;

/**
 * Obtenir l'instance du QualityEvaluator
 */
export function getQualityEvaluator(): QualityEvaluator {
  if (!evaluatorInstance) {
    evaluatorInstance = new QualityEvaluator();
  }

  return evaluatorInstance;
}

/**
 * Évaluer rapidement du code généré
 */
export function evaluateQuality(content: string): QualityReport {
  return getQualityEvaluator().evaluate(content);
}
