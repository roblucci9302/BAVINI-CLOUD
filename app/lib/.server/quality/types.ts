/**
 * Types pour le système de Quality Score
 * Évalue la qualité du code généré et décide si des améliorations sont nécessaires
 */

/**
 * Score de qualité d'un fichier ou bloc de code
 */
export interface QualityScore {
  /** Score global (0-100) */
  overall: number;

  /** Scores détaillés par catégorie */
  categories: QualityCategories;

  /** Niveau de qualité déterminé */
  level: QualityLevel;

  /** Action recommandée */
  action: QualityAction;
}

/**
 * Catégories de score de qualité (Enhanced)
 */
export interface QualityCategories {
  /** TypeScript: typage strict, pas de any (20%) */
  typescript: number;

  /** Tests: présence et qualité des tests (15%) */
  testing: number;

  /** Sécurité: pas de vulnérabilités (20%) */
  security: number;

  /** Performance: code optimisé (10%) */
  performance: number;

  /** Maintenabilité: code lisible et modulaire (10%) */
  maintainability: number;

  /** Structure: respect des conventions BAVINI (5%) */
  structure: number;

  /** Accessibilité: conformité WCAG 2.1 (10%) */
  accessibility: number;

  /** Responsive: approche mobile-first (5%) */
  responsive: number;

  /** UX Patterns: bonnes pratiques UX (5%) */
  uxPatterns: number;
}

/**
 * Niveaux de qualité
 */
export type QualityLevel =
  | 'excellent' // 90-100 : Aucune amélioration nécessaire
  | 'good' // 75-89 : Quelques suggestions optionnelles
  | 'acceptable' // 60-74 : Améliorations recommandées
  | 'poor' // 40-59 : Améliorations nécessaires
  | 'critical'; // 0-39 : Refactoring obligatoire

/**
 * Actions possibles après évaluation
 */
export type QualityAction =
  | 'approve' // Code approuvé tel quel
  | 'suggest' // Proposer des améliorations optionnelles
  | 'improve' // Améliorer automatiquement
  | 'refactor'; // Refactoring complet nécessaire

/**
 * Problème détecté dans le code
 */
export interface QualityIssue {
  /** Catégorie du problème */
  category: keyof QualityCategories;

  /** Sévérité */
  severity: 'critical' | 'major' | 'minor' | 'info';

  /** Description du problème */
  message: string;

  /** Fichier concerné */
  file?: string;

  /** Ligne concernée */
  line?: number;

  /** Suggestion de correction */
  suggestion?: string;

  /** Impact sur le score (-1 à -20 selon sévérité) */
  impact: number;
}

/**
 * Rapport complet d'évaluation de qualité
 */
export interface QualityReport {
  /** Timestamp de l'évaluation */
  timestamp: Date;

  /** Score calculé */
  score: QualityScore;

  /** Problèmes détectés */
  issues: QualityIssue[];

  /** Résumé textuel en français */
  summary: string;

  /** Suggestions d'amélioration (si action !== 'approve') */
  suggestions: string[];

  /** Métriques brutes */
  metrics: QualityMetrics;
}

/**
 * Métriques collectées sur le code
 */
export interface QualityMetrics {
  /** Nombre de fichiers analysés */
  filesAnalyzed: number;

  /** Lignes de code total */
  totalLines: number;

  /** Fichiers TypeScript (vs JavaScript) */
  typescriptFiles: number;

  /** Fichiers de test détectés */
  testFiles: number;

  /** Fichiers avec types 'any' */
  filesWithAny: number;

  /** Fichiers avec try/catch */
  filesWithErrorHandling: number;

  /** Fichiers > 100 lignes */
  largeFiles: number;

  /** Métriques d'accessibilité */
  accessibility: AccessibilityMetrics;

  /** Métriques responsive */
  responsive: ResponsiveMetrics;

  /** Métriques UX patterns */
  uxPatterns: UXPatternsMetrics;
}

/**
 * Métriques d'accessibilité WCAG 2.1
 */
export interface AccessibilityMetrics {
  /** Images sans attribut alt */
  imagesWithoutAlt: number;

  /** Boutons sans texte accessible */
  buttonsWithoutLabel: number;

  /** Formulaires sans labels */
  inputsWithoutLabels: number;

  /** Éléments interactifs sans ARIA */
  interactiveWithoutAria: number;

  /** Liens sans texte descriptif */
  linksWithoutText: number;

  /** Contraste insuffisant détecté */
  contrastIssues: number;

  /** Score total accessibilité (0-100) */
  score: number;
}

/**
 * Métriques responsive/mobile-first
 */
export interface ResponsiveMetrics {
  /** Utilise les breakpoints Tailwind */
  usesBreakpoints: boolean;

  /** Utilise les classes responsive */
  responsiveClasses: number;

  /** Composants avec layout flexible */
  flexibleLayouts: number;

  /** Navigation mobile (hamburger/drawer) */
  hasMobileNav: boolean;

  /** Images avec dimensions relatives */
  responsiveImages: number;

  /** Grilles adaptatives détectées */
  adaptiveGrids: number;

  /** Score total responsive (0-100) */
  score: number;
}

/**
 * Métriques UX patterns
 */
export interface UXPatternsMetrics {
  /** États de chargement présents */
  loadingStates: number;

  /** Gestion des erreurs UI */
  errorStates: number;

  /** États vides gérés */
  emptyStates: number;

  /** Feedback utilisateur (toasts, etc.) */
  userFeedback: number;

  /** Animations/transitions */
  animations: number;

  /** Focus management */
  focusManagement: number;

  /** Score total UX patterns (0-100) */
  score: number;
}

/**
 * Configuration des seuils de qualité
 */
export interface QualityThresholds {
  /** Seuil pour 'excellent' */
  excellent: number;

  /** Seuil pour 'good' */
  good: number;

  /** Seuil pour 'acceptable' */
  acceptable: number;

  /** Seuil pour 'poor' */
  poor: number;
}

/**
 * Seuils par défaut
 */
export const DEFAULT_THRESHOLDS: QualityThresholds = {
  excellent: 90,
  good: 75,
  acceptable: 60,
  poor: 40,
};

/**
 * Poids des catégories dans le score global (Enhanced - total = 100%)
 */
export const CATEGORY_WEIGHTS: Record<keyof QualityCategories, number> = {
  typescript: 0.2, // 20% - TypeScript prioritaire
  security: 0.2, // 20% - Sécurité critique
  testing: 0.15, // 15% - Tests importants
  accessibility: 0.1, // 10% - Conformité WCAG
  maintainability: 0.1, // 10% - Maintenabilité
  performance: 0.1, // 10% - Performance
  responsive: 0.05, // 5% - Mobile-first
  uxPatterns: 0.05, // 5% - Bonnes pratiques UX
  structure: 0.05, // 5% - Structure du projet
};

/**
 * Poids legacy pour compatibilité
 * @deprecated Utiliser CATEGORY_WEIGHTS à la place
 */
export const LEGACY_CATEGORY_WEIGHTS = {
  typescript: 0.25,
  testing: 0.2,
  security: 0.2,
  performance: 0.1,
  maintainability: 0.15,
  structure: 0.1,
};
