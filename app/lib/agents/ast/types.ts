/**
 * AST Analysis Types
 * Types pour l'analyse de code avec TypeScript Compiler API
 */

/*
 * ============================================================================
 * ENUMS & BASIC TYPES
 * ============================================================================
 */

/**
 * Catégories de règles d'analyse
 */
export type RuleCategory = 'security' | 'performance' | 'maintainability' | 'style' | 'error';

/**
 * Niveaux de sévérité
 */
export type Severity = 'error' | 'warning' | 'info' | 'hint';

/*
 * ============================================================================
 * POSITION & LOCATION
 * ============================================================================
 */

/**
 * Position dans le code source
 */
export interface ASTPosition {
  /** Numéro de ligne (1-indexed) */
  line: number;

  /** Numéro de colonne (1-indexed) */
  column: number;

  /** Offset en caractères depuis le début du fichier */
  offset: number;
}

/**
 * Localisation d'un élément dans le code
 */
export interface ASTLocation {
  /** Chemin du fichier */
  file: string;

  /** Position de début */
  start: ASTPosition;

  /** Position de fin */
  end: ASTPosition;
}

/*
 * ============================================================================
 * ISSUES & FIXES
 * ============================================================================
 */

/**
 * Correction automatique proposée
 */
export interface ASTFix {
  /** Range à remplacer [start, end] */
  range: [number, number];

  /** Texte de remplacement */
  replacement: string;
}

/**
 * Problème détecté dans le code
 */
export interface ASTIssue {
  /** ID unique du problème */
  id: string;

  /** ID de la règle ayant détecté le problème */
  rule: string;

  /** Message descriptif */
  message: string;

  /** Niveau de sévérité */
  severity: Severity;

  /** Catégorie de la règle */
  category: RuleCategory;

  /** Localisation dans le code */
  location: ASTLocation;

  /** Extrait de code source (optionnel) */
  code?: string;

  /** Suggestion de correction (optionnelle) */
  suggestion?: string;

  /** Indique si une correction automatique est disponible */
  fixable: boolean;

  /** Correction automatique (si fixable) */
  fix?: ASTFix;
}

/*
 * ============================================================================
 * METRICS
 * ============================================================================
 */

/**
 * Bloc de code dupliqué
 */
export interface DuplicateBlock {
  /** Fichier source */
  sourceFile: string;

  /** Ligne de début dans le fichier source */
  sourceLine: number;

  /** Fichier cible (peut être le même) */
  targetFile: string;

  /** Ligne de début dans le fichier cible */
  targetLine: number;

  /** Nombre de lignes dupliquées */
  lineCount: number;

  /** Pourcentage de similarité */
  similarity: number;
}

/**
 * Métriques de qualité du code
 */
export interface CodeMetrics {
  /** Nombre de lignes de code (sans commentaires/blancs) */
  linesOfCode: number;

  /** Complexité cyclomatique */
  cyclomaticComplexity: number;

  /** Complexité cognitive */
  cognitiveComplexity: number;

  /** Index de maintenabilité (0-100) */
  maintainabilityIndex: number;

  /** Nombre de types 'any' */
  anyCount: number;

  /** Imports non utilisés */
  unusedImports: string[];

  /** Blocs de code dupliqués */
  duplicateCode: DuplicateBlock[];
}

/**
 * Erreur de parsing
 */
export interface ParseError {
  /** Message d'erreur */
  message: string;

  /** Localisation (optionnelle) */
  location?: ASTLocation;
}

/*
 * ============================================================================
 * ANALYSIS RESULTS
 * ============================================================================
 */

/**
 * Résultat d'analyse d'un fichier
 */
export interface AnalysisResult {
  /** Chemin du fichier analysé */
  file: string;

  /** Problèmes détectés */
  issues: ASTIssue[];

  /** Métriques calculées */
  metrics: CodeMetrics;

  /** Erreurs de parsing */
  parseErrors: ParseError[];
}

/**
 * Résumé d'analyse global
 */
export interface AnalysisSummary {
  /** Nombre total de fichiers analysés */
  totalFiles: number;

  /** Nombre de fichiers avec erreurs */
  filesWithErrors: number;

  /** Nombre de fichiers avec warnings */
  filesWithWarnings: number;

  /** Nombre total d'issues par sévérité */
  issuesBySeverity: Record<Severity, number>;

  /** Nombre total d'issues par catégorie */
  issuesByCategory: Record<RuleCategory, number>;

  /** Métriques agrégées */
  aggregatedMetrics: {
    totalLinesOfCode: number;
    averageComplexity: number;
    averageMaintainability: number;
    totalAnyCount: number;
  };

  /** Durée de l'analyse en ms */
  analysisTime: number;
}

/*
 * ============================================================================
 * CONFIGURATION
 * ============================================================================
 */

/**
 * Configuration d'une règle
 */
export interface RuleConfig {
  /** Activer/désactiver la règle */
  enabled: boolean;

  /** Surcharger la sévérité */
  severity?: Severity;

  /** Options spécifiques à la règle */
  options?: Record<string, unknown>;
}

/**
 * Configuration de l'analyseur
 */
export interface AnalyzerConfig {
  /** Configuration des règles par ID */
  rules: Record<string, RuleConfig>;

  /** Patterns de fichiers à inclure */
  include: string[];

  /** Patterns de fichiers à exclure */
  exclude: string[];

  /** Taille max d'un fichier en bytes */
  maxFileSize: number;

  /** Activer l'analyse parallèle */
  parallel: boolean;

  /** Nombre max de workers parallèles */
  maxWorkers?: number;

  /** Répertoire racine pour la résolution des imports */
  rootDir?: string;

  /** Chemin vers tsconfig.json */
  tsConfigPath?: string;
}

/**
 * Configuration par défaut
 */
export const DEFAULT_ANALYZER_CONFIG: AnalyzerConfig = {
  rules: {},
  include: ['**/*.ts', '**/*.tsx'],
  exclude: ['**/node_modules/**', '**/*.spec.ts', '**/*.test.ts', '**/dist/**', '**/build/**'],
  maxFileSize: 500000, // 500KB
  parallel: true,
  maxWorkers: 4,
};

/*
 * ============================================================================
 * TRAVERSAL CONTEXT
 * ============================================================================
 */

/**
 * Contexte de traversée de l'AST
 */
export interface TraversalContext {
  /** Profondeur dans l'arbre */
  depth: number;

  /** Nœud parent */
  parent: import('typescript').Node | null;

  /** Ancêtres (optionnel, pour analyse contextuelle) */
  ancestors?: import('typescript').Node[];
}

/*
 * ============================================================================
 * REPORTER TYPES
 * ============================================================================
 */

/**
 * Options du reporter
 */
export interface ReporterOptions {
  /** Inclure les métriques */
  includeMetrics: boolean;

  /** Inclure le code source */
  includeCode: boolean;

  /** Grouper par fichier */
  groupByFile: boolean;

  /** Grouper par règle */
  groupByRule: boolean;

  /** Trier par sévérité */
  sortBySeverity: boolean;
}

/**
 * Interface pour les reporters
 */
export interface Reporter {
  /** Nom du reporter */
  name: string;

  /** Formater un résultat unique */
  formatResult(result: AnalysisResult, options?: Partial<ReporterOptions>): string;

  /** Formater plusieurs résultats */
  formatResults(results: AnalysisResult[], options?: Partial<ReporterOptions>): string;

  /** Formater le résumé */
  formatSummary(summary: AnalysisSummary): string;
}
