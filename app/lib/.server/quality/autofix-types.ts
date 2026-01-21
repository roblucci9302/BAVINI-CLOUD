/**
 * Types pour le système AutoFix
 *
 * Le système AutoFix corrige automatiquement les erreurs communes
 * pendant le streaming du code généré par le LLM.
 */

/*
 * =============================================================================
 * Fix Rule Interface
 * =============================================================================
 */

/**
 * Catégorie de correction
 */
export type FixCategory =
  | 'imports' // Imports manquants ou incorrects
  | 'typescript' // Erreurs TypeScript
  | 'accessibility' // Problèmes d'accessibilité
  | 'security' // Failles de sécurité
  | 'style' // Problèmes de style/formatage
  | 'react' // Patterns React incorrects
  | 'performance'; // Problèmes de performance

/**
 * Sévérité d'un problème détecté
 */
export type FixSeverity = 'critical' | 'warning' | 'suggestion';

/**
 * Règle de correction
 */
export interface FixRule {
  /** Identifiant unique de la règle */
  id: string;

  /** Nom de la règle */
  name: string;

  /** Description */
  description: string;

  /** Catégorie */
  category: FixCategory;

  /** Sévérité des problèmes détectés */
  severity: FixSeverity;

  /** Vérifie si la règle peut corriger ce code */
  canFix(code: string, context?: FixContext): boolean;

  /** Applique la correction */
  fix(code: string, context?: FixContext): Promise<FixResult>;
}

/*
 * =============================================================================
 * Fix Context
 * =============================================================================
 */

/**
 * Contexte fourni aux règles de correction
 */
export interface FixContext {
  /** Chemin du fichier (si connu) */
  filePath?: string;

  /** Langage du fichier */
  language: CodeLanguage;

  /** Fichiers déjà traités dans la session */
  processedFiles?: Map<string, string>;

  /** Imports déjà présents dans le projet */
  availableImports?: ImportInfo[];

  /** Configuration du projet */
  projectConfig?: ProjectConfig;
}

/**
 * Langages de code supportés
 */
export type CodeLanguage = 'typescript' | 'javascript' | 'tsx' | 'jsx' | 'css' | 'html' | 'json' | 'unknown';

/**
 * Information sur un import disponible
 */
export interface ImportInfo {
  /** Nom de l'export */
  name: string;

  /** Module source */
  source: string;

  /** Type d'export (named, default, namespace) */
  type: 'named' | 'default' | 'namespace';

  /** Est-ce un type uniquement ? */
  isTypeOnly?: boolean;
}

/**
 * Configuration du projet
 */
export interface ProjectConfig {
  /** Utilise TypeScript */
  useTypeScript: boolean;

  /** Utilise React */
  useReact: boolean;

  /** Framework CSS (tailwind, css-modules, etc.) */
  cssFramework?: string;

  /** Bibliothèque UI (non utilisé - BAVINI utilise HTML natif) */
  uiLibrary?: string;
}

/*
 * =============================================================================
 * Fix Result
 * =============================================================================
 */

/**
 * Résultat d'une correction
 */
export interface FixResult {
  /** La correction a été appliquée */
  applied: boolean;

  /** Code corrigé (ou original si pas de correction) */
  code: string;

  /** Corrections effectuées */
  fixes: AppliedFix[];

  /** Problèmes qui n'ont pas pu être corrigés */
  unresolved: UnresolvedIssue[];

  /** Avertissements */
  warnings: string[];
}

/**
 * Correction appliquée
 */
export interface AppliedFix {
  /** Règle qui a effectué la correction */
  ruleId: string;

  /** Description de la correction */
  description: string;

  /** Ligne affectée (si applicable) */
  line?: number;

  /** Ancien code */
  before?: string;

  /** Nouveau code */
  after?: string;
}

/**
 * Problème non résolu
 */
export interface UnresolvedIssue {
  /** Règle concernée */
  ruleId: string;

  /** Description du problème */
  message: string;

  /** Raison de l'échec */
  reason: string;

  /** Ligne concernée */
  line?: number;
}

/*
 * =============================================================================
 * AutoFix Processor Options
 * =============================================================================
 */

/**
 * Options du processeur AutoFix
 */
export interface AutoFixOptions {
  /** Règles à activer (toutes par défaut) */
  enabledRules?: string[];

  /** Règles à désactiver */
  disabledRules?: string[];

  /** Catégories à activer */
  enabledCategories?: FixCategory[];

  /** Mode strict (échoue si correction impossible) */
  strictMode?: boolean;

  /** Maximum de corrections par bloc */
  maxFixesPerBlock?: number;

  /** Timeout par correction (ms) */
  fixTimeout?: number;

  /** Callback de progression */
  onProgress?: (progress: FixProgress) => void;

  /** Callback de correction appliquée */
  onFix?: (fix: AppliedFix) => void;
}

/**
 * Progression du processus de correction
 */
export interface FixProgress {
  /** Phase actuelle */
  phase: 'parsing' | 'analyzing' | 'fixing' | 'complete';

  /** Nombre de règles vérifiées */
  rulesChecked: number;

  /** Nombre de corrections appliquées */
  fixesApplied: number;

  /** Temps écoulé (ms) */
  elapsed: number;
}

/*
 * =============================================================================
 * Code Block Types
 * =============================================================================
 */

/**
 * Bloc de code extrait du stream
 */
export interface CodeBlock {
  /** Contenu du code */
  content: string;

  /** Langage détecté */
  language: CodeLanguage;

  /** Chemin du fichier (si spécifié) */
  filePath?: string;

  /** Index de début dans le stream */
  startIndex: number;

  /** Index de fin dans le stream */
  endIndex: number;

  /** Marqueurs de début et fin */
  markers: {
    start: string;
    end: string;
  };
}

/**
 * Résultat du parsing du stream
 */
export interface ParsedStream {
  /** Blocs de code trouvés */
  codeBlocks: CodeBlock[];

  /** Parties non-code (texte entre les blocs) */
  textParts: Array<{
    content: string;
    startIndex: number;
    endIndex: number;
  }>;

  /** Contenu restant (bloc incomplet) */
  remaining: string;
}

/*
 * =============================================================================
 * Statistics
 * =============================================================================
 */

/**
 * Statistiques de correction
 */
export interface AutoFixStats {
  /** Nombre total de blocs traités */
  blocksProcessed: number;

  /** Corrections par catégorie */
  fixesByCategory: Record<FixCategory, number>;

  /** Règles les plus utilisées */
  topRules: Array<{ ruleId: string; count: number }>;

  /** Problèmes non résolus par catégorie */
  unresolvedByCategory: Record<FixCategory, number>;

  /** Temps total de traitement (ms) */
  totalProcessingTime: number;

  /** Temps moyen par bloc (ms) */
  averageTimePerBlock: number;
}

/*
 * =============================================================================
 * Constants
 * =============================================================================
 */

/**
 * Poids par catégorie pour le score de qualité
 */
export const FIX_CATEGORY_WEIGHTS: Record<FixCategory, number> = {
  security: 1.0, // Critique - toujours corriger
  typescript: 0.9, // Très important
  imports: 0.8, // Important pour le fonctionnement
  accessibility: 0.7, // Important pour l'UX
  react: 0.6, // Bonnes pratiques
  performance: 0.5, // Optimisation
  style: 0.3, // Préférence
};

/**
 * Timeouts par défaut (ms)
 */
export const DEFAULT_TIMEOUTS = {
  /** Timeout par règle */
  perRule: 1000,

  /** Timeout par bloc */
  perBlock: 5000,

  /** Timeout global */
  global: 30000,
};
