/**
 * AccessibilityFixer - Correction automatique des problèmes d'accessibilité
 *
 * Détecte et corrige selon WCAG 2.1:
 * - Images sans alt
 * - Boutons sans texte accessible
 * - Liens sans texte
 * - Éléments interactifs sans role/aria
 * - Contraste insuffisant (signalement)
 */

import type { FixRule, FixContext, FixResult, AppliedFix, UnresolvedIssue } from '../autofix-types';

/*
 * =============================================================================
 * AccessibilityFixer
 * =============================================================================
 */

/**
 * Règle de correction d'accessibilité
 */
export class AccessibilityFixer implements FixRule {
  readonly id = 'accessibility-fixer';
  readonly name = 'Accessibility Fixer';
  readonly description = "Corrige les problèmes d'accessibilité WCAG courants";
  readonly category = 'accessibility' as const;
  readonly severity = 'warning' as const;

  /**
   * Vérifie si le code a des problèmes d'accessibilité
   */
  canFix(code: string, context?: FixContext): boolean {
    // Ne traiter que les fichiers React/HTML
    const validLanguages = ['tsx', 'jsx', 'html'];

    if (context?.language && !validLanguages.includes(context.language)) {
      return false;
    }

    return (
      this.hasImageWithoutAlt(code) ||
      this.hasButtonWithoutLabel(code) ||
      this.hasLinkWithoutText(code) ||
      this.hasClickableWithoutRole(code) ||
      this.hasInputWithoutLabel(code)
    );
  }

  /**
   * Corrige les problèmes d'accessibilité
   */
  async fix(code: string, context?: FixContext): Promise<FixResult> {
    const fixes: AppliedFix[] = [];
    const unresolved: UnresolvedIssue[] = [];
    const warnings: string[] = [];
    let fixedCode = code;

    // 1. Ajouter alt aux images
    const imgResult = this.fixImagesWithoutAlt(fixedCode);
    fixedCode = imgResult.code;
    fixes.push(...imgResult.fixes);
    unresolved.push(...imgResult.unresolved);

    // 2. Ajouter aria-label aux boutons icône
    const buttonResult = this.fixButtonsWithoutLabel(fixedCode);
    fixedCode = buttonResult.code;
    fixes.push(...buttonResult.fixes);

    // 3. Corriger les liens vides
    const linkResult = this.fixEmptyLinks(fixedCode);
    fixedCode = linkResult.code;
    fixes.push(...linkResult.fixes);
    unresolved.push(...linkResult.unresolved);

    // 4. Ajouter role aux éléments cliquables
    const clickableResult = this.fixClickableElements(fixedCode);
    fixedCode = clickableResult.code;
    fixes.push(...clickableResult.fixes);

    // 5. Associer les labels aux inputs
    const inputResult = this.fixInputsWithoutLabels(fixedCode);
    fixedCode = inputResult.code;
    fixes.push(...inputResult.fixes);

    // 6. Ajouter tabIndex aux éléments focusables
    const focusResult = this.fixFocusableElements(fixedCode);
    fixedCode = focusResult.code;
    fixes.push(...focusResult.fixes);

    return {
      applied: fixes.length > 0,
      code: fixedCode,
      fixes,
      unresolved,
      warnings,
    };
  }

  /*
   * ===========================================================================
   * Detection Methods
   * ===========================================================================
   */

  /**
   * Détecte les images sans attribut alt
   */
  private hasImageWithoutAlt(code: string): boolean {
    // <img sans alt ou avec alt=""
    const imgWithoutAlt = /<img\s+(?![^>]*\balt\s*=)[^>]*>/i;
    const imgWithEmptyAlt = /<img\s+[^>]*\balt\s*=\s*["']\s*["'][^>]*>/i;

    return imgWithoutAlt.test(code) || imgWithEmptyAlt.test(code);
  }

  /**
   * Détecte les boutons sans texte accessible
   */
  private hasButtonWithoutLabel(code: string): boolean {
    // Bouton avec seulement une icône (pas de texte)
    const iconButtonPattern = /<button[^>]*>\s*<(?:svg|img|Icon|[A-Z]\w*Icon)[^>]*\/?>\s*<\/button>/i;
    const buttonWithoutAriaLabel = /<button(?![^>]*(?:aria-label|aria-labelledby))[^>]*>/i;

    return iconButtonPattern.test(code) && buttonWithoutAriaLabel.test(code);
  }

  /**
   * Détecte les liens sans texte
   */
  private hasLinkWithoutText(code: string): boolean {
    // <a> avec seulement une icône ou vide
    const emptyLink = /<a\s+[^>]*>\s*<\/a>/i;
    const iconOnlyLink = /<a\s+[^>]*>\s*<(?:svg|img|Icon)[^>]*\/?>\s*<\/a>/i;

    return emptyLink.test(code) || iconOnlyLink.test(code);
  }

  /**
   * Détecte les div/span cliquables sans role
   */
  private hasClickableWithoutRole(code: string): boolean {
    // div ou span avec onClick mais sans role="button"
    const clickableDiv = /<(?:div|span)\s+[^>]*onClick[^>]*>/i;
    const hasRole = /<(?:div|span)\s+[^>]*role\s*=/i;

    return clickableDiv.test(code) && !hasRole.test(code);
  }

  /**
   * Détecte les inputs sans label associé
   */
  private hasInputWithoutLabel(code: string): boolean {
    // input sans aria-label, aria-labelledby ou id avec label correspondant
    const inputWithoutLabel = /<input(?![^>]*(?:aria-label|aria-labelledby|id\s*=\s*["'][^"']+["']))[^>]*>/i;
    return inputWithoutLabel.test(code);
  }

  /*
   * ===========================================================================
   * Fix Methods
   * ===========================================================================
   */

  /**
   * Ajoute des attributs alt aux images
   */
  private fixImagesWithoutAlt(code: string): {
    code: string;
    fixes: AppliedFix[];
    unresolved: UnresolvedIssue[];
  } {
    const fixes: AppliedFix[] = [];
    const unresolved: UnresolvedIssue[] = [];
    let fixedCode = code;

    // Pattern pour les images sans alt
    const imgPattern = /<img\s+(?![^>]*\balt\s*=)([^>]*)>/gi;

    fixedCode = fixedCode.replace(imgPattern, (match, attrs) => {
      // Essayer de déduire l'alt du src
      const srcMatch = attrs.match(/src\s*=\s*["']([^"']+)["']/);
      let altText = '';

      if (srcMatch) {
        // Extraire le nom du fichier sans extension
        const fileName =
          srcMatch[1]
            .split('/')
            .pop()
            ?.replace(/\.[^.]+$/, '') || '';
        altText = this.humanizeFileName(fileName);
      }

      if (altText) {
        fixes.push({
          ruleId: this.id,
          description: `Ajout de l'attribut alt="${altText}" à l'image`,
        });
        return `<img ${attrs} alt="${altText}">`;
      } else {
        // Ajouter alt="" pour les images décoratives (avec aria-hidden)
        fixes.push({
          ruleId: this.id,
          description: 'Ajout de alt="" et aria-hidden="true" pour image décorative',
        });
        return `<img ${attrs} alt="" aria-hidden="true">`;
      }
    });

    // Images avec alt=""
    const emptyAltPattern = /<img\s+([^>]*)\balt\s*=\s*["']\s*["']([^>]*)>/gi;
    fixedCode = fixedCode.replace(emptyAltPattern, (match, before, after) => {
      // Vérifier si aria-hidden est déjà présent
      if (!match.includes('aria-hidden')) {
        fixes.push({
          ruleId: this.id,
          description: 'Ajout de aria-hidden="true" pour image avec alt vide',
        });
        return `<img ${before}alt="" aria-hidden="true"${after}>`;
      }

      return match;
    });

    return { code: fixedCode, fixes, unresolved };
  }

  /**
   * Ajoute aria-label aux boutons icône
   */
  private fixButtonsWithoutLabel(code: string): { code: string; fixes: AppliedFix[] } {
    const fixes: AppliedFix[] = [];
    let fixedCode = code;

    // Pattern pour les boutons avec icône sans label
    const iconButtonPattern = /<button([^>]*)>\s*<(svg|img|[A-Z]\w*(?:Icon)?)\s*([^>]*)\/?>\s*<\/button>/gi;

    fixedCode = fixedCode.replace(iconButtonPattern, (match, buttonAttrs, iconTag, iconAttrs) => {
      // Vérifier si aria-label existe déjà
      if (/aria-label/.test(buttonAttrs)) {
        return match;
      }

      // Essayer de déduire le label de l'icône
      const label = this.inferIconLabel(iconTag, iconAttrs);

      if (label) {
        fixes.push({
          ruleId: this.id,
          description: `Ajout de aria-label="${label}" au bouton`,
        });
        return `<button${buttonAttrs} aria-label="${label}"><${iconTag} ${iconAttrs}/></button>`;
      }

      // Label générique si impossible à déduire
      fixes.push({
        ruleId: this.id,
        description: 'Ajout de aria-label générique au bouton',
      });

      return `<button${buttonAttrs} aria-label="Bouton"><${iconTag} ${iconAttrs}/></button>`;
    });

    return { code: fixedCode, fixes };
  }

  /**
   * Corrige les liens vides ou avec seulement une icône
   */
  private fixEmptyLinks(code: string): {
    code: string;
    fixes: AppliedFix[];
    unresolved: UnresolvedIssue[];
  } {
    const fixes: AppliedFix[] = [];
    const unresolved: UnresolvedIssue[] = [];
    let fixedCode = code;

    // Liens avec icône sans texte
    const iconLinkPattern = /<a\s+([^>]*)>\s*<(svg|img|[A-Z]\w*(?:Icon)?)\s*([^>]*)\/?>\s*<\/a>/gi;

    fixedCode = fixedCode.replace(iconLinkPattern, (match, linkAttrs, iconTag, iconAttrs) => {
      // Vérifier si aria-label existe
      if (/aria-label/.test(linkAttrs)) {
        return match;
      }

      // Essayer de déduire le label du href
      const hrefMatch = linkAttrs.match(/href\s*=\s*["']([^"']+)["']/);
      let label = '';

      if (hrefMatch) {
        label = this.inferLinkLabel(hrefMatch[1]);
      }

      if (!label) {
        label = this.inferIconLabel(iconTag, iconAttrs) || 'Lien';
      }

      fixes.push({
        ruleId: this.id,
        description: `Ajout de aria-label="${label}" au lien`,
      });

      return `<a ${linkAttrs} aria-label="${label}"><${iconTag} ${iconAttrs}/></a>`;
    });

    return { code: fixedCode, fixes, unresolved };
  }

  /**
   * Ajoute role="button" aux éléments div/span cliquables
   */
  private fixClickableElements(code: string): { code: string; fixes: AppliedFix[] } {
    const fixes: AppliedFix[] = [];
    let fixedCode = code;

    // div/span avec onClick sans role
    const clickablePattern = /<(div|span)(\s+[^>]*onClick[^>]*)>/gi;

    fixedCode = fixedCode.replace(clickablePattern, (match, tag, attrs) => {
      if (/role\s*=/.test(attrs)) {
        return match;
      }

      // Ajouter role="button" et tabIndex si absent
      let newAttrs = attrs;

      if (!/tabIndex/.test(attrs)) {
        newAttrs += ' tabIndex={0}';
      }

      fixes.push({
        ruleId: this.id,
        description: `Ajout de role="button" à l'élément ${tag} cliquable`,
      });

      return `<${tag}${newAttrs} role="button">`;
    });

    return { code: fixedCode, fixes };
  }

  /**
   * Ajoute des labels aux inputs
   */
  private fixInputsWithoutLabels(code: string): { code: string; fixes: AppliedFix[] } {
    const fixes: AppliedFix[] = [];
    let fixedCode = code;

    // Inputs sans aria-label ni aria-labelledby
    const inputPattern =
      /<input\s+(?![^>]*(?:aria-label|aria-labelledby))([^>]*)(?:type\s*=\s*["'](\w+)["'])?([^>]*)>/gi;

    fixedCode = fixedCode.replace(inputPattern, (match, before, type, after) => {
      const inputType = type || 'text';

      // Générer un label approprié
      const label = this.getInputLabel(inputType, before + (after || ''));

      fixes.push({
        ruleId: this.id,
        description: `Ajout de aria-label="${label}" à l'input`,
      });

      return `<input ${before}type="${inputType}"${after || ''} aria-label="${label}">`;
    });

    return { code: fixedCode, fixes };
  }

  /**
   * Ajoute tabIndex aux éléments qui devraient être focusables
   */
  private fixFocusableElements(code: string): { code: string; fixes: AppliedFix[] } {
    const fixes: AppliedFix[] = [];
    let fixedCode = code;

    // Éléments avec role="button" sans tabIndex
    const roleButtonPattern = /<(\w+)\s+([^>]*role\s*=\s*["']button["'][^>]*)>/gi;

    fixedCode = fixedCode.replace(roleButtonPattern, (match, tag, attrs) => {
      if (/tabIndex/.test(attrs) || ['button', 'a', 'input'].includes(tag.toLowerCase())) {
        return match;
      }

      fixes.push({
        ruleId: this.id,
        description: `Ajout de tabIndex={0} à l'élément avec role="button"`,
      });

      return `<${tag} ${attrs} tabIndex={0}>`;
    });

    return { code: fixedCode, fixes };
  }

  /*
   * ===========================================================================
   * Helper Methods
   * ===========================================================================
   */

  /**
   * Convertit un nom de fichier en texte lisible
   */
  private humanizeFileName(fileName: string): string {
    return (
      fileName
        // Remplacer les tirets et underscores par des espaces
        .replace(/[-_]/g, ' ')
        // Ajouter des espaces avant les majuscules (camelCase)
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        // Première lettre en majuscule
        .replace(/^./, (c) => c.toUpperCase())
        .trim()
    );
  }

  /**
   * Infère le label d'une icône à partir de son nom
   */
  private inferIconLabel(iconTag: string, iconAttrs: string): string {
    // Extraire le nom de l'icône
    const iconNames: Record<string, string> = {
      Plus: 'Ajouter',
      Minus: 'Supprimer',
      X: 'Fermer',
      Check: 'Valider',
      Edit: 'Modifier',
      Trash: 'Supprimer',
      Search: 'Rechercher',
      Menu: 'Menu',
      Settings: 'Paramètres',
      User: 'Profil',
      Home: 'Accueil',
      ArrowLeft: 'Précédent',
      ArrowRight: 'Suivant',
      ChevronDown: 'Dérouler',
      ChevronUp: 'Replier',
      Eye: 'Afficher',
      EyeOff: 'Masquer',
      Copy: 'Copier',
      Download: 'Télécharger',
      Upload: 'Importer',
      Share: 'Partager',
      Send: 'Envoyer',
      Save: 'Enregistrer',
      Mail: 'Email',
      Phone: 'Téléphone',
      Calendar: 'Calendrier',
      Clock: 'Horloge',
      Star: 'Favoris',
      Heart: 'Aimer',
      ExternalLink: 'Ouvrir dans un nouvel onglet',
    };

    // Vérifier si le tag correspond à une icône connue
    for (const [name, label] of Object.entries(iconNames)) {
      if (iconTag.includes(name)) {
        return label;
      }
    }

    // Vérifier dans les attributs (name="Plus" par exemple)
    const nameMatch = iconAttrs.match(/name\s*=\s*["']([^"']+)["']/);

    if (nameMatch && iconNames[nameMatch[1]]) {
      return iconNames[nameMatch[1]];
    }

    return '';
  }

  /**
   * Infère le label d'un lien à partir du href
   */
  private inferLinkLabel(href: string): string {
    // Liens communs
    if (href.includes('github')) {
      return 'GitHub';
    }

    if (href.includes('twitter') || href.includes('x.com')) {
      return 'Twitter';
    }

    if (href.includes('linkedin')) {
      return 'LinkedIn';
    }

    if (href.includes('facebook')) {
      return 'Facebook';
    }

    if (href.includes('instagram')) {
      return 'Instagram';
    }

    if (href.startsWith('mailto:')) {
      return 'Envoyer un email';
    }

    if (href.startsWith('tel:')) {
      return 'Appeler';
    }

    return '';
  }

  /**
   * Génère un label pour un input selon son type
   */
  private getInputLabel(type: string, attrs: string): string {
    // Essayer d'extraire du placeholder
    const placeholderMatch = attrs.match(/placeholder\s*=\s*["']([^"']+)["']/);

    if (placeholderMatch) {
      return placeholderMatch[1];
    }

    // Labels par défaut selon le type
    const typeLabels: Record<string, string> = {
      text: 'Champ de texte',
      email: 'Adresse email',
      password: 'Mot de passe',
      number: 'Nombre',
      tel: 'Numéro de téléphone',
      url: 'URL',
      search: 'Recherche',
      date: 'Date',
      time: 'Heure',
      file: 'Fichier',
      checkbox: 'Case à cocher',
      radio: 'Option',
    };

    return typeLabels[type] || 'Champ de saisie';
  }
}

/*
 * =============================================================================
 * Export
 * =============================================================================
 */

export function createAccessibilityFixer(): AccessibilityFixer {
  return new AccessibilityFixer();
}
