/**
 * AccessibilityEvaluator - Évaluation de la conformité WCAG 2.1
 *
 * Vérifie:
 * - Images avec alt
 * - Boutons avec labels
 * - Formulaires avec labels
 * - Éléments ARIA
 * - Navigation au clavier
 * - Contraste (signalement)
 */

import type { AccessibilityMetrics, QualityIssue } from '../types';

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
  metrics: AccessibilityMetrics;
  issues: QualityIssue[];
  score: number;
}

/*
 * =============================================================================
 * AccessibilityEvaluator
 * =============================================================================
 */

/**
 * Évaluateur d'accessibilité WCAG 2.1
 */
export class AccessibilityEvaluator {
  /**
   * Évalue l'accessibilité des fichiers
   */
  evaluate(files: ExtractedFile[]): EvaluationResult {
    const issues: QualityIssue[] = [];
    let imagesWithoutAlt = 0;
    let buttonsWithoutLabel = 0;
    let inputsWithoutLabels = 0;
    let interactiveWithoutAria = 0;
    let linksWithoutText = 0;
    let contrastIssues = 0;

    // Filtrer les fichiers JSX/TSX
    const uiFiles = files.filter((f) => f.language === 'tsx' || f.language === 'jsx' || f.language === 'html');

    for (const file of uiFiles) {
      // 1. Vérifier les images sans alt
      const imgIssues = this.checkImagesAlt(file);
      imagesWithoutAlt += imgIssues.count;
      issues.push(...imgIssues.issues);

      // 2. Vérifier les boutons sans label
      const buttonIssues = this.checkButtonLabels(file);
      buttonsWithoutLabel += buttonIssues.count;
      issues.push(...buttonIssues.issues);

      // 3. Vérifier les inputs sans labels
      const inputIssues = this.checkInputLabels(file);
      inputsWithoutLabels += inputIssues.count;
      issues.push(...inputIssues.issues);

      // 4. Vérifier les éléments interactifs sans ARIA
      const ariaIssues = this.checkInteractiveAria(file);
      interactiveWithoutAria += ariaIssues.count;
      issues.push(...ariaIssues.issues);

      // 5. Vérifier les liens sans texte
      const linkIssues = this.checkLinks(file);
      linksWithoutText += linkIssues.count;
      issues.push(...linkIssues.issues);

      // 6. Vérifier les problèmes de contraste potentiels
      const contrastProblems = this.checkContrast(file);
      contrastIssues += contrastProblems.count;
      issues.push(...contrastProblems.issues);
    }

    // Calculer le score
    const score = this.calculateScore({
      imagesWithoutAlt,
      buttonsWithoutLabel,
      inputsWithoutLabels,
      interactiveWithoutAria,
      linksWithoutText,
      contrastIssues,
      totalFiles: uiFiles.length,
    });

    const metrics: AccessibilityMetrics = {
      imagesWithoutAlt,
      buttonsWithoutLabel,
      inputsWithoutLabels,
      interactiveWithoutAria,
      linksWithoutText,
      contrastIssues,
      score,
    };

    return { metrics, issues, score };
  }

  /*
   * ===========================================================================
   * Checks
   * ===========================================================================
   */

  /**
   * Vérifie les images sans attribut alt
   */
  private checkImagesAlt(file: ExtractedFile): { count: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    let count = 0;

    // Pattern pour <img> sans alt
    const imgWithoutAlt = /<img\s+(?![^>]*\balt\s*=)[^>]*>/gi;
    const matches = file.content.match(imgWithoutAlt);

    if (matches) {
      count = matches.length;
      issues.push({
        category: 'accessibility',
        severity: 'major',
        message: `${count} image(s) sans attribut alt dans ${file.path}`,
        file: file.path,
        suggestion: 'Ajouter un attribut alt descriptif à chaque image',
        impact: -5 * count,
      });
    }

    // Images avec alt vide sans aria-hidden
    const emptyAlt = /<img\s+[^>]*alt\s*=\s*["']\s*["'](?![^>]*aria-hidden)[^>]*>/gi;
    const emptyMatches = file.content.match(emptyAlt);

    if (emptyMatches) {
      issues.push({
        category: 'accessibility',
        severity: 'minor',
        message: `${emptyMatches.length} image(s) avec alt vide sans aria-hidden`,
        file: file.path,
        suggestion: 'Ajouter aria-hidden="true" pour les images décoratives',
        impact: -2 * emptyMatches.length,
      });
    }

    return { count, issues };
  }

  /**
   * Vérifie les boutons sans label accessible
   */
  private checkButtonLabels(file: ExtractedFile): { count: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    let count = 0;

    // Boutons avec icône seule sans aria-label
    const iconButtonPattern = /<button[^>]*>\s*<(?:svg|[A-Z]\w*Icon)[^>]*\/?>\s*<\/button>/gi;
    const buttonMatches = file.content.match(iconButtonPattern);

    if (buttonMatches) {
      // Vérifier lesquels n'ont pas d'aria-label
      const withoutLabel = buttonMatches.filter(
        (btn) => !btn.includes('aria-label') && !btn.includes('aria-labelledby'),
      );
      count = withoutLabel.length;

      if (count > 0) {
        issues.push({
          category: 'accessibility',
          severity: 'major',
          message: `${count} bouton(s) icône sans label accessible dans ${file.path}`,
          file: file.path,
          suggestion: 'Ajouter aria-label ou aria-labelledby aux boutons icône',
          impact: -5 * count,
        });
      }
    }

    return { count, issues };
  }

  /**
   * Vérifie les inputs sans labels associés
   */
  private checkInputLabels(file: ExtractedFile): { count: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    let count = 0;

    // Inputs sans aria-label, aria-labelledby, ou id avec label correspondant
    const inputPattern =
      /<input(?![^>]*(?:aria-label|aria-labelledby|type\s*=\s*["'](?:hidden|submit|button)["']))[^>]*>/gi;
    const inputMatches = file.content.match(inputPattern);

    if (inputMatches) {
      // Vérifier les inputs qui ont un id mais pas de label correspondant
      for (const input of inputMatches) {
        const idMatch = input.match(/id\s*=\s*["']([^"']+)["']/);

        if (idMatch) {
          const labelPattern = new RegExp(`htmlFor\\s*=\\s*["']${idMatch[1]}["']`, 'i');

          if (!labelPattern.test(file.content)) {
            count++;
          }
        } else {
          // Pas d'id, pas de aria-label
          if (!input.includes('aria-label')) {
            count++;
          }
        }
      }

      if (count > 0) {
        issues.push({
          category: 'accessibility',
          severity: 'major',
          message: `${count} input(s) sans label accessible dans ${file.path}`,
          file: file.path,
          suggestion: 'Associer un <label> avec htmlFor ou ajouter aria-label',
          impact: -5 * count,
        });
      }
    }

    return { count, issues };
  }

  /**
   * Vérifie les éléments interactifs sans ARIA approprié
   */
  private checkInteractiveAria(file: ExtractedFile): { count: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    let count = 0;

    // div/span avec onClick sans role="button"
    const clickableWithoutRole = /<(?:div|span)[^>]*onClick[^>]*(?!role\s*=\s*["']button["'])[^>]*>/gi;
    const matches = file.content.match(clickableWithoutRole);

    // Filtrer ceux qui ont déjà un role
    if (matches) {
      const withoutRole = matches.filter((el) => !el.includes('role='));
      count = withoutRole.length;

      if (count > 0) {
        issues.push({
          category: 'accessibility',
          severity: 'major',
          message: `${count} élément(s) cliquable(s) sans role="button" dans ${file.path}`,
          file: file.path,
          suggestion: 'Ajouter role="button" et tabIndex={0} aux éléments cliquables',
          impact: -5 * count,
        });
      }
    }

    // Vérifier les tabIndex négatifs
    const negativeTabIndex = /<[^>]*tabIndex\s*=\s*\{?\s*-1\s*\}?[^>]*>/gi;
    const tabIndexMatches = file.content.match(negativeTabIndex);

    if (tabIndexMatches && tabIndexMatches.length > 3) {
      issues.push({
        category: 'accessibility',
        severity: 'minor',
        message: `Utilisation excessive de tabIndex={-1} (${tabIndexMatches.length} occurrences)`,
        file: file.path,
        suggestion: "Limiter l'usage de tabIndex={-1} qui retire les éléments de la navigation clavier",
        impact: -3,
      });
    }

    return { count, issues };
  }

  /**
   * Vérifie les liens sans texte descriptif
   */
  private checkLinks(file: ExtractedFile): { count: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    let count = 0;

    // Liens vides ou avec seulement une icône
    const emptyLinkPattern = /<a\s+[^>]*>\s*<\/a>/gi;
    const iconLinkPattern = /<a\s+[^>]*>\s*<(?:svg|[A-Z]\w*Icon)[^>]*\/?>\s*<\/a>/gi;

    const emptyLinks = file.content.match(emptyLinkPattern) || [];
    const iconLinks = (file.content.match(iconLinkPattern) || []).filter((link) => !link.includes('aria-label'));

    count = emptyLinks.length + iconLinks.length;

    if (count > 0) {
      issues.push({
        category: 'accessibility',
        severity: 'major',
        message: `${count} lien(s) sans texte descriptif dans ${file.path}`,
        file: file.path,
        suggestion: 'Ajouter du texte ou aria-label aux liens',
        impact: -5 * count,
      });
    }

    // Liens "cliquez ici" ou "en savoir plus" sans contexte
    const vagueLinkText = />\s*(cliquez ici|en savoir plus|click here|read more)\s*</gi;
    const vagueLinks = file.content.match(vagueLinkText);

    if (vagueLinks) {
      issues.push({
        category: 'accessibility',
        severity: 'minor',
        message: `${vagueLinks.length} lien(s) avec texte vague ("cliquez ici", etc.)`,
        file: file.path,
        suggestion: 'Utiliser un texte de lien descriptif du contenu cible',
        impact: -2 * vagueLinks.length,
      });
    }

    return { count, issues };
  }

  /**
   * Vérifie les problèmes de contraste potentiels
   */
  private checkContrast(file: ExtractedFile): { count: number; issues: QualityIssue[] } {
    const issues: QualityIssue[] = [];
    let count = 0;

    // Couleurs de texte très claires (signalement)
    const lightTextColors = /text-(?:gray|slate|zinc)-(?:300|200|100)/g;
    const lightMatches = file.content.match(lightTextColors);

    if (lightMatches && lightMatches.length > 5) {
      count = 1;
      issues.push({
        category: 'accessibility',
        severity: 'minor',
        message: `Utilisation fréquente de couleurs de texte claires (${lightMatches.length} occurrences)`,
        file: file.path,
        suggestion: 'Vérifier le contraste selon WCAG 2.1 (ratio minimum 4.5:1)',
        impact: -3,
      });
    }

    // Placeholder comme seul moyen d'identification
    const placeholderOnly = /<input[^>]*placeholder[^>]*(?!(?:aria-label|id[^>]*htmlFor))[^>]*>/gi;
    const placeholderMatches = file.content.match(placeholderOnly);

    if (placeholderMatches && placeholderMatches.length > 2) {
      count++;
      issues.push({
        category: 'accessibility',
        severity: 'minor',
        message: "Placeholder utilisé comme seul moyen d'identification des inputs",
        file: file.path,
        suggestion: 'Utiliser des labels visibles en plus des placeholders',
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
   * Calcule le score d'accessibilité
   */
  private calculateScore(data: {
    imagesWithoutAlt: number;
    buttonsWithoutLabel: number;
    inputsWithoutLabels: number;
    interactiveWithoutAria: number;
    linksWithoutText: number;
    contrastIssues: number;
    totalFiles: number;
  }): number {
    // Score de base
    let score = 100;

    // Pénalités
    score -= data.imagesWithoutAlt * 5;
    score -= data.buttonsWithoutLabel * 5;
    score -= data.inputsWithoutLabels * 5;
    score -= data.interactiveWithoutAria * 5;
    score -= data.linksWithoutText * 5;
    score -= data.contrastIssues * 3;

    // Bonus si aucun problème et fichiers présents
    if (
      data.totalFiles > 0 &&
      data.imagesWithoutAlt === 0 &&
      data.buttonsWithoutLabel === 0 &&
      data.inputsWithoutLabels === 0 &&
      data.interactiveWithoutAria === 0 &&
      data.linksWithoutText === 0
    ) {
      score = Math.min(100, score + 10);
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
 * Crée une instance de l'évaluateur d'accessibilité
 */
export function createAccessibilityEvaluator(): AccessibilityEvaluator {
  return new AccessibilityEvaluator();
}
