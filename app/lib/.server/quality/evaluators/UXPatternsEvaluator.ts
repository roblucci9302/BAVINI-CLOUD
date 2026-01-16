/**
 * UXPatternsEvaluator - Évaluation des bonnes pratiques UX
 *
 * Vérifie:
 * - États de chargement (loading states)
 * - Gestion des erreurs UI
 * - États vides (empty states)
 * - Feedback utilisateur (toasts, notifications)
 * - Animations et transitions
 * - Gestion du focus
 */

import type { UXPatternsMetrics, QualityIssue } from '../types';

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

interface ExtractedFile {
  path: string;
  content: string;
  language: string;
}

interface EvaluationResult {
  metrics: UXPatternsMetrics;
  issues: QualityIssue[];
  score: number;
}

/*
 * =============================================================================
 * UXPatternsEvaluator
 * =============================================================================
 */

/**
 * Évaluateur des patterns UX
 */
export class UXPatternsEvaluator {
  /**
   * Évalue les patterns UX des fichiers
   */
  evaluate(files: ExtractedFile[]): EvaluationResult {
    const issues: QualityIssue[] = [];

    // Filtrer les fichiers UI
    const uiFiles = files.filter((f) => f.language === 'tsx' || f.language === 'jsx');

    // Analyser tous les fichiers ensemble
    const allContent = uiFiles.map((f) => f.content).join('\n');

    // 1. Analyser les états de chargement
    const loadingAnalysis = this.analyzeLoadingStates(allContent, uiFiles);
    issues.push(...loadingAnalysis.issues);

    // 2. Analyser la gestion des erreurs UI
    const errorAnalysis = this.analyzeErrorStates(allContent, uiFiles);
    issues.push(...errorAnalysis.issues);

    // 3. Analyser les états vides
    const emptyAnalysis = this.analyzeEmptyStates(allContent, uiFiles);
    issues.push(...emptyAnalysis.issues);

    // 4. Analyser le feedback utilisateur
    const feedbackAnalysis = this.analyzeUserFeedback(allContent, uiFiles);
    issues.push(...feedbackAnalysis.issues);

    // 5. Analyser les animations
    const animationAnalysis = this.analyzeAnimations(allContent);

    // 6. Analyser la gestion du focus
    const focusAnalysis = this.analyzeFocusManagement(allContent, uiFiles);
    issues.push(...focusAnalysis.issues);

    // Calculer le score
    const score = this.calculateScore({
      loadingStates: loadingAnalysis.count,
      errorStates: errorAnalysis.count,
      emptyStates: emptyAnalysis.count,
      userFeedback: feedbackAnalysis.count,
      animations: animationAnalysis.count,
      focusManagement: focusAnalysis.count,
      totalFiles: uiFiles.length,
      hasAsyncOperations: loadingAnalysis.hasAsyncOperations,
    });

    const metrics: UXPatternsMetrics = {
      loadingStates: loadingAnalysis.count,
      errorStates: errorAnalysis.count,
      emptyStates: emptyAnalysis.count,
      userFeedback: feedbackAnalysis.count,
      animations: animationAnalysis.count,
      focusManagement: focusAnalysis.count,
      score,
    };

    return { metrics, issues, score };
  }

  /*
   * ===========================================================================
   * Analysis Methods
   * ===========================================================================
   */

  /**
   * Analyse les états de chargement
   */
  private analyzeLoadingStates(
    content: string,
    files: ExtractedFile[],
  ): { count: number; issues: QualityIssue[]; hasAsyncOperations: boolean } {
    const issues: QualityIssue[] = [];

    // Détecter les opérations async
    const hasAsyncOperations = /useQuery|useMutation|fetch\(|axios|async\s+function|await\s+/.test(content);

    // Patterns de loading states
    const loadingPatterns = [
      /isLoading|loading|isPending/gi,
      /Loader|Spinner|Loading/g,
      /Skeleton/g,
      /<.*loading.*>/gi,
    ];

    let count = 0;

    for (const pattern of loadingPatterns) {
      const matches = content.match(pattern);

      if (matches) {
        count += matches.length;
      }
    }

    // Vérification: opérations async sans loading state
    if (hasAsyncOperations && count === 0) {
      issues.push({
        category: 'uxPatterns',
        severity: 'major',
        message: 'Opérations async détectées sans indicateur de chargement',
        suggestion: 'Ajouter des états loading (Spinner, Skeleton) pendant les requêtes',
        impact: -15,
      });
    }

    return { count, issues, hasAsyncOperations };
  }

  /**
   * Analyse la gestion des erreurs UI
   */
  private analyzeErrorStates(content: string, files: ExtractedFile[]): { count: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];

    // Patterns de gestion d'erreurs UI
    const errorPatterns = [
      /isError|error\s*&&|error\s*\?|hasError/gi,
      /ErrorBoundary|ErrorMessage|ErrorState/g,
      /Alert.*error|error.*Alert/gi,
      /catch\s*\([^)]*\)\s*\{[^}]*set.*Error/gi,
    ];

    let count = 0;

    for (const pattern of errorPatterns) {
      const matches = content.match(pattern);

      if (matches) {
        count += matches.length;
      }
    }

    // Vérifier les try/catch sans feedback UI
    const tryCatchWithoutUI = /catch\s*\([^)]*\)\s*\{[^}]*console\.(log|error)/g;
    const consoleCatches = content.match(tryCatchWithoutUI);

    if (consoleCatches && consoleCatches.length > 2 && count < 2) {
      issues.push({
        category: 'uxPatterns',
        severity: 'minor',
        message: "Erreurs capturées mais pas affichées à l'utilisateur",
        suggestion: "Afficher les erreurs dans l'UI (toast, alert, message)",
        impact: -10,
      });
    }

    // Vérifier les fetch/axios sans gestion d'erreur
    const hasAsyncCalls = /fetch\(|axios\.|useQuery|useMutation/.test(content);

    if (hasAsyncCalls && count === 0) {
      issues.push({
        category: 'uxPatterns',
        severity: 'major',
        message: "Appels API sans gestion d'erreur visible",
        suggestion: "Ajouter des états d'erreur pour les échecs de requête",
        impact: -10,
      });
    }

    return { count, issues };
  }

  /**
   * Analyse les états vides
   */
  private analyzeEmptyStates(content: string, files: ExtractedFile[]): { count: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];

    // Patterns d'empty states
    const emptyPatterns = [
      /isEmpty|\.length\s*===?\s*0|empty/gi,
      /EmptyState|NoData|NoResults/g,
      /Aucun|Rien|Vide|No\s+\w+\s+found/gi,
    ];

    let count = 0;

    for (const pattern of emptyPatterns) {
      const matches = content.match(pattern);

      if (matches) {
        count += matches.length;
      }
    }

    // Vérifier les listes/tableaux sans empty state
    const hasLists = /\.map\(|<Table|<List|<ul|<ol/gi.test(content);
    const hasDataFetching = /useQuery|fetch\(|axios/i.test(content);

    if (hasLists && hasDataFetching && count === 0) {
      issues.push({
        category: 'uxPatterns',
        severity: 'minor',
        message: "Listes de données sans gestion de l'état vide",
        suggestion: 'Afficher un message approprié quand la liste est vide',
        impact: -8,
      });
    }

    return { count, issues };
  }

  /**
   * Analyse le feedback utilisateur
   */
  private analyzeUserFeedback(content: string, files: ExtractedFile[]): { count: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];

    // Patterns de feedback utilisateur
    const feedbackPatterns = [
      /toast|Toast|useToast/g,
      /notification|Notification/gi,
      /snackbar|Snackbar/gi,
      /alert|Alert(?!Circle|Triangle)/g,
      /success|Success.*message/gi,
      /confirm|Confirm(?:ation)?/gi,
    ];

    let count = 0;

    for (const pattern of feedbackPatterns) {
      const matches = content.match(pattern);

      if (matches) {
        count += matches.length;
      }
    }

    // Vérifier les formulaires sans feedback
    const hasForms = /onSubmit|handleSubmit|<form|<Form/gi.test(content);
    const hasMutations = /useMutation|POST|PUT|DELETE|PATCH/i.test(content);

    if ((hasForms || hasMutations) && count === 0) {
      issues.push({
        category: 'uxPatterns',
        severity: 'minor',
        message: 'Formulaires/mutations sans feedback de succès/erreur',
        suggestion: 'Ajouter des toasts ou messages après les actions',
        impact: -8,
      });
    }

    return { count, issues };
  }

  /**
   * Analyse les animations et transitions
   */
  private analyzeAnimations(content: string): { count: number } {
    // Patterns d'animations
    const animationPatterns = [
      /transition|Transition/g,
      /animate-|animation-/g,
      /motion\.|AnimatePresence|motion/g,
      /framer-motion/g,
      /duration-\d+/g,
      /ease-in|ease-out|ease-in-out/g,
    ];

    let count = 0;

    for (const pattern of animationPatterns) {
      const matches = content.match(pattern);

      if (matches) {
        count += matches.length;
      }
    }

    return { count };
  }

  /**
   * Analyse la gestion du focus
   */
  private analyzeFocusManagement(content: string, files: ExtractedFile[]): { count: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];

    // Patterns de gestion du focus
    const focusPatterns = [
      /useRef.*focus|\.focus\(\)|autoFocus/gi,
      /FocusTrap|FocusScope/g,
      /tabIndex/g,
      /onFocus|onBlur/g,
      /focus:ring|focus-visible/g,
    ];

    let count = 0;

    for (const pattern of focusPatterns) {
      const matches = content.match(pattern);

      if (matches) {
        count += matches.length;
      }
    }

    // Vérifier les modales/dialogs sans focus trap
    const hasModals = /Dialog|Modal|Sheet|Drawer/gi.test(content);
    const hasFocusTrap = /FocusTrap|FocusScope|trapFocus/i.test(content);

    if (hasModals && !hasFocusTrap) {
      issues.push({
        category: 'uxPatterns',
        severity: 'minor',
        message: 'Modales sans gestion explicite du focus',
        suggestion: "Utiliser FocusTrap ou s'assurer que le focus reste dans la modale",
        impact: -5,
      });
    }

    // Vérifier les focus outlines
    const hasFocusOutline = /focus:ring|focus-visible|outline-/i.test(content);

    if (!hasFocusOutline && count > 0) {
      issues.push({
        category: 'uxPatterns',
        severity: 'info',
        message: 'Focus outline potentiellement absent',
        suggestion: 'Utiliser focus:ring-* pour indiquer le focus aux utilisateurs clavier',
        impact: -3,
      });
    }

    return { count, issues };
  }

  /*
   * ===========================================================================
   * Score Calculation
   * ===========================================================================
   */

  /**
   * Calcule le score UX patterns
   */
  private calculateScore(data: {
    loadingStates: number;
    errorStates: number;
    emptyStates: number;
    userFeedback: number;
    animations: number;
    focusManagement: number;
    totalFiles: number;
    hasAsyncOperations: boolean;
  }): number {
    if (data.totalFiles === 0) {
      return 100; // Pas de fichiers UI = pas de pénalité
    }

    // Score de base
    let score = 50;

    // Points pour les loading states (20 points max)
    if (data.hasAsyncOperations) {
      if (data.loadingStates > 5) {
        score += 20;
      } else if (data.loadingStates > 2) {
        score += 15;
      } else if (data.loadingStates > 0) {
        score += 10;
      }
    } else {
      score += 15; // Pas d'async = pas besoin de loading states
    }

    // Points pour la gestion d'erreurs (15 points max)
    if (data.errorStates > 3) {
      score += 15;
    } else if (data.errorStates > 0) {
      score += 10;
    }

    // Points pour les empty states (10 points max)
    if (data.emptyStates > 2) {
      score += 10;
    } else if (data.emptyStates > 0) {
      score += 5;
    }

    // Points pour le feedback utilisateur (10 points max)
    if (data.userFeedback > 3) {
      score += 10;
    } else if (data.userFeedback > 0) {
      score += 5;
    }

    // Points pour les animations (5 points max)
    if (data.animations > 5) {
      score += 5;
    } else if (data.animations > 0) {
      score += 3;
    }

    // Points pour le focus management (5 points max)
    if (data.focusManagement > 5) {
      score += 5;
    } else if (data.focusManagement > 0) {
      score += 3;
    }

    return Math.max(0, Math.min(100, score));
  }
}

/*
 * =============================================================================
 * Factory
 * =============================================================================
 */

/**
 * Crée une instance de l'évaluateur UX patterns
 */
export function createUXPatternsEvaluator(): UXPatternsEvaluator {
  return new UXPatternsEvaluator();
}
