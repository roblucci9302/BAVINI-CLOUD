/**
 * ResponsiveEvaluator - Évaluation de l'approche mobile-first
 *
 * Vérifie:
 * - Utilisation des breakpoints Tailwind
 * - Classes responsive (sm:, md:, lg:, xl:)
 * - Layouts flexibles (flex, grid)
 * - Navigation mobile
 * - Images responsive
 * - Grilles adaptatives
 */

import type { ResponsiveMetrics, QualityIssue } from '../types';

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
  metrics: ResponsiveMetrics;
  issues: QualityIssue[];
  score: number;
}

/*
 * =============================================================================
 * ResponsiveEvaluator
 * =============================================================================
 */

/**
 * Évaluateur de design responsive / mobile-first
 */
export class ResponsiveEvaluator {
  /**
   * Évalue l'approche responsive des fichiers
   */
  evaluate(files: ExtractedFile[]): EvaluationResult {
    const issues: QualityIssue[] = [];

    // Filtrer les fichiers UI
    const uiFiles = files.filter((f) => f.language === 'tsx' || f.language === 'jsx' || f.language === 'css');

    // Analyser tous les fichiers ensemble
    const allContent = uiFiles.map((f) => f.content).join('\n');

    // 1. Vérifier les breakpoints Tailwind
    const breakpointAnalysis = this.analyzeBreakpoints(allContent, uiFiles);
    issues.push(...breakpointAnalysis.issues);

    // 2. Compter les classes responsive
    const responsiveClasses = this.countResponsiveClasses(allContent);

    // 3. Analyser les layouts flexibles
    const flexAnalysis = this.analyzeFlexibleLayouts(allContent, uiFiles);
    issues.push(...flexAnalysis.issues);

    // 4. Détecter la navigation mobile
    const hasMobileNav = this.detectMobileNavigation(allContent);

    if (!hasMobileNav && uiFiles.length > 3) {
      issues.push({
        category: 'responsive',
        severity: 'minor',
        message: 'Navigation mobile non détectée',
        suggestion: 'Ajouter un menu hamburger ou drawer pour mobile',
        impact: -10,
      });
    }

    // 5. Vérifier les images responsive
    const imageAnalysis = this.analyzeResponsiveImages(allContent, uiFiles);
    issues.push(...imageAnalysis.issues);

    // 6. Détecter les grilles adaptatives
    const gridAnalysis = this.analyzeAdaptiveGrids(allContent);

    // Calculer le score
    const score = this.calculateScore({
      usesBreakpoints: breakpointAnalysis.usesBreakpoints,
      responsiveClasses,
      flexibleLayouts: flexAnalysis.count,
      hasMobileNav,
      responsiveImages: imageAnalysis.count,
      adaptiveGrids: gridAnalysis.count,
      totalFiles: uiFiles.length,
    });

    const metrics: ResponsiveMetrics = {
      usesBreakpoints: breakpointAnalysis.usesBreakpoints,
      responsiveClasses,
      flexibleLayouts: flexAnalysis.count,
      hasMobileNav,
      responsiveImages: imageAnalysis.count,
      adaptiveGrids: gridAnalysis.count,
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
   * Analyse l'utilisation des breakpoints Tailwind
   */
  private analyzeBreakpoints(
    content: string,
    files: ExtractedFile[],
  ): { usesBreakpoints: boolean; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];

    // Patterns de breakpoints Tailwind
    const breakpointPatterns = {
      sm: /\bsm:/g,
      md: /\bmd:/g,
      lg: /\blg:/g,
      xl: /\bxl:/g,
      '2xl': /\b2xl:/g,
    };

    const counts: Record<string, number> = {};
    let totalBreakpoints = 0;

    for (const [name, pattern] of Object.entries(breakpointPatterns)) {
      const matches = content.match(pattern);
      counts[name] = matches ? matches.length : 0;
      totalBreakpoints += counts[name];
    }

    const usesBreakpoints = totalBreakpoints > 0;

    // Vérifications
    if (!usesBreakpoints && files.length > 2) {
      issues.push({
        category: 'responsive',
        severity: 'major',
        message: 'Aucun breakpoint Tailwind détecté',
        suggestion: 'Utiliser sm:, md:, lg: pour adapter le layout aux différents écrans',
        impact: -20,
      });
    } else if (totalBreakpoints < 10 && files.length > 5) {
      issues.push({
        category: 'responsive',
        severity: 'minor',
        message: `Peu de breakpoints utilisés (${totalBreakpoints})`,
        suggestion: "Augmenter l'utilisation des breakpoints pour une meilleure adaptation",
        impact: -10,
      });
    }

    // Vérifier l'équilibre des breakpoints
    if (usesBreakpoints) {
      if (counts.md > 0 && counts.sm === 0) {
        issues.push({
          category: 'responsive',
          severity: 'minor',
          message: 'Breakpoint sm: non utilisé (mobile-first)',
          suggestion: 'Commencer par le mobile (base) puis utiliser sm:, md:, lg:',
          impact: -5,
        });
      }
    }

    return { usesBreakpoints, issues };
  }

  /**
   * Compte les classes responsive Tailwind
   */
  private countResponsiveClasses(content: string): number {
    const responsivePattern = /\b(?:sm|md|lg|xl|2xl):[a-zA-Z0-9-]+/g;
    const matches = content.match(responsivePattern);

    return matches ? matches.length : 0;
  }

  /**
   * Analyse les layouts flexibles (flex, grid)
   */
  private analyzeFlexibleLayouts(content: string, files: ExtractedFile[]): { count: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];

    // Compter flex et grid
    const flexCount = (content.match(/\bflex\b/g) || []).length;
    const gridCount = (content.match(/\bgrid\b/g) || []).length;
    const flexibleLayouts = flexCount + gridCount;

    // Détecter les widths fixes problématiques
    const fixedWidths = content.match(/w-\[\d+px\]/g);

    if (fixedWidths && fixedWidths.length > 5) {
      issues.push({
        category: 'responsive',
        severity: 'minor',
        message: `${fixedWidths.length} largeurs fixes en pixels détectées`,
        suggestion: 'Préférer les classes relatives (w-full, w-1/2, etc.)',
        impact: -5,
      });
    }

    // Vérifier l'utilisation de layouts fixes
    if (flexibleLayouts === 0 && files.length > 3) {
      issues.push({
        category: 'responsive',
        severity: 'major',
        message: 'Aucun layout flexible (flex/grid) détecté',
        suggestion: 'Utiliser flexbox ou grid pour des layouts adaptatifs',
        impact: -15,
      });
    }

    return { count: flexibleLayouts, issues };
  }

  /**
   * Détecte la présence d'une navigation mobile
   */
  private detectMobileNavigation(content: string): boolean {
    // Patterns de navigation mobile
    const mobileNavPatterns = [
      /Menu|hamburger|burger/i,
      /Sheet|Drawer|Sidebar.*mobile/i,
      /isOpen.*menu|menu.*isOpen/i,
      /mobile.*nav|nav.*mobile/i,
      /lg:hidden.*menu|menu.*lg:hidden/i,
      /md:hidden.*nav|nav.*md:hidden/i,
    ];

    return mobileNavPatterns.some((pattern) => pattern.test(content));
  }

  /**
   * Analyse les images responsive
   */
  private analyzeResponsiveImages(content: string, files: ExtractedFile[]): { count: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];

    // Images avec dimensions relatives
    const responsiveImages = (content.match(/<img[^>]*(?:w-full|max-w|object-)/g) || []).length;

    // Images avec dimensions fixes
    const fixedImages = (content.match(/<img[^>]*(?:width="\d+"|height="\d+")/g) || []).length;

    if (fixedImages > 3 && responsiveImages < fixedImages) {
      issues.push({
        category: 'responsive',
        severity: 'minor',
        message: `${fixedImages} image(s) avec dimensions fixes`,
        suggestion: 'Utiliser w-full, max-w-*, ou object-cover pour images responsive',
        impact: -5,
      });
    }

    // Vérifier lazy loading
    const imagesWithoutLazy = content.match(/<img(?![^>]*loading=)[^>]*>/g);

    if (imagesWithoutLazy && imagesWithoutLazy.length > 5) {
      issues.push({
        category: 'responsive',
        severity: 'info',
        message: `${imagesWithoutLazy.length} image(s) sans lazy loading`,
        suggestion: 'Ajouter loading="lazy" pour améliorer les performances mobile',
        impact: -2,
      });
    }

    return { count: responsiveImages, issues };
  }

  /**
   * Analyse les grilles adaptatives
   */
  private analyzeAdaptiveGrids(content: string): { count: number } {
    // Grilles avec breakpoints
    const adaptiveGridPatterns = [
      /grid-cols-1\s+(?:sm|md|lg):grid-cols-/g,
      /(?:sm|md|lg):grid-cols-/g,
      /grid.*gap.*(?:sm|md|lg):/g,
    ];

    let count = 0;

    for (const pattern of adaptiveGridPatterns) {
      const matches = content.match(pattern);

      if (matches) {
        count += matches.length;
      }
    }

    return { count };
  }

  /*
   * ===========================================================================
   * Score Calculation
   * ===========================================================================
   */

  /**
   * Calcule le score responsive
   */
  private calculateScore(data: {
    usesBreakpoints: boolean;
    responsiveClasses: number;
    flexibleLayouts: number;
    hasMobileNav: boolean;
    responsiveImages: number;
    adaptiveGrids: number;
    totalFiles: number;
  }): number {
    // Score de base
    let score = 50; // Commence à 50 si pas d'info

    if (data.totalFiles === 0) {
      return 100; // Pas de fichiers UI = pas de pénalité
    }

    // Points pour les breakpoints
    if (data.usesBreakpoints) {
      score += 20;
    }

    // Points pour les classes responsive
    if (data.responsiveClasses > 20) {
      score += 15;
    } else if (data.responsiveClasses > 10) {
      score += 10;
    } else if (data.responsiveClasses > 0) {
      score += 5;
    }

    // Points pour les layouts flexibles
    if (data.flexibleLayouts > 10) {
      score += 15;
    } else if (data.flexibleLayouts > 5) {
      score += 10;
    } else if (data.flexibleLayouts > 0) {
      score += 5;
    }

    // Points pour la navigation mobile
    if (data.hasMobileNav) {
      score += 10;
    }

    // Points pour les images responsive
    if (data.responsiveImages > 0) {
      score += 5;
    }

    // Points pour les grilles adaptatives
    if (data.adaptiveGrids > 0) {
      score += 5;
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
 * Crée une instance de l'évaluateur responsive
 */
export function createResponsiveEvaluator(): ResponsiveEvaluator {
  return new ResponsiveEvaluator();
}
