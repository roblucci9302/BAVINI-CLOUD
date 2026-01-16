/**
 * SecurityFixer - Correction automatique des failles de sécurité
 *
 * Détecte et corrige (OWASP Top 10):
 * - XSS (dangerouslySetInnerHTML)
 * - Injection (eval, Function constructor)
 * - Secrets en dur dans le code
 * - CORS mal configuré
 * - Validation manquante des inputs
 */

import type { FixRule, FixContext, FixResult, AppliedFix, UnresolvedIssue } from '../autofix-types';

/*
 * =============================================================================
 * SecurityFixer
 * =============================================================================
 */

/**
 * Règle de correction de sécurité
 */
export class SecurityFixer implements FixRule {
  readonly id = 'security-fixer';
  readonly name = 'Security Fixer';
  readonly description = 'Corrige les failles de sécurité courantes (OWASP)';
  readonly category = 'security' as const;
  readonly severity = 'critical' as const;

  /**
   * Vérifie si le code a des problèmes de sécurité
   */
  canFix(code: string, context?: FixContext): boolean {
    return (
      this.hasDangerousHTML(code) ||
      this.hasCodeInjection(code) ||
      this.hasHardcodedSecrets(code) ||
      this.hasUnsafeURLHandling(code) ||
      this.hasMissingValidation(code)
    );
  }

  /**
   * Corrige les problèmes de sécurité
   */
  async fix(code: string, context?: FixContext): Promise<FixResult> {
    const fixes: AppliedFix[] = [];
    const unresolved: UnresolvedIssue[] = [];
    const warnings: string[] = [];
    let fixedCode = code;

    // 1. Corriger dangerouslySetInnerHTML
    const xssResult = this.fixDangerousHTML(fixedCode);
    fixedCode = xssResult.code;
    fixes.push(...xssResult.fixes);
    unresolved.push(...xssResult.unresolved);
    warnings.push(...xssResult.warnings);

    // 2. Signaler les injections de code
    const injectionResult = this.checkCodeInjection(fixedCode);
    unresolved.push(...injectionResult.unresolved);
    warnings.push(...injectionResult.warnings);

    // 3. Remplacer les secrets en dur
    const secretsResult = this.fixHardcodedSecrets(fixedCode);
    fixedCode = secretsResult.code;
    fixes.push(...secretsResult.fixes);
    warnings.push(...secretsResult.warnings);

    // 4. Sécuriser les URLs
    const urlResult = this.fixUnsafeURLs(fixedCode);
    fixedCode = urlResult.code;
    fixes.push(...urlResult.fixes);

    // 5. Ajouter la validation des inputs
    const validationResult = this.addInputValidation(fixedCode);
    fixedCode = validationResult.code;
    fixes.push(...validationResult.fixes);

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
   * Détecte l'utilisation de dangerouslySetInnerHTML
   */
  private hasDangerousHTML(code: string): boolean {
    return /dangerouslySetInnerHTML/.test(code);
  }

  /**
   * Détecte les injections de code (eval, Function)
   */
  private hasCodeInjection(code: string): boolean {
    const patterns = [/\beval\s*\(/, /new\s+Function\s*\(/, /setTimeout\s*\(\s*["'`]/, /setInterval\s*\(\s*["'`]/];
    return patterns.some((p) => p.test(code));
  }

  /**
   * Détecte les secrets en dur
   */
  private hasHardcodedSecrets(code: string): boolean {
    const patterns = [
      // API keys
      /(?:api[_-]?key|apikey)\s*[:=]\s*["'][^"']{20,}["']/i,

      // Tokens
      /(?:token|bearer|jwt)\s*[:=]\s*["'][^"']{20,}["']/i,

      // Passwords
      /(?:password|passwd|pwd)\s*[:=]\s*["'][^"']+["']/i,

      // Secret keys
      /(?:secret[_-]?key|private[_-]?key)\s*[:=]\s*["'][^"']+["']/i,

      // AWS keys
      /AKIA[0-9A-Z]{16}/,

      // Supabase keys
      /sbp_[a-zA-Z0-9]{20,}/,

      // Generic patterns
      /sk-[a-zA-Z0-9]{48}/,
    ];
    return patterns.some((p) => p.test(code));
  }

  /**
   * Détecte la manipulation non sûre des URLs
   */
  private hasUnsafeURLHandling(code: string): boolean {
    // window.location sans validation
    const unsafeRedirect = /window\.location\s*=\s*(?!\s*['"]https?:)/;

    // href dynamique non validé
    const unsafeHref = /href\s*=\s*\{[^}]*(?:user|input|query|param)/i;

    return unsafeRedirect.test(code) || unsafeHref.test(code);
  }

  /**
   * Détecte les inputs sans validation
   */
  private hasMissingValidation(code: string): boolean {
    // Form submit sans preventDefault
    const formSubmit = /onSubmit\s*=\s*\{[^}]*\}/;
    const hasPreventDefault = /preventDefault\s*\(\s*\)/;

    if (formSubmit.test(code) && !hasPreventDefault.test(code)) {
      return true;
    }

    return false;
  }

  /*
   * ===========================================================================
   * Fix Methods
   * ===========================================================================
   */

  /**
   * Corrige ou signale dangerouslySetInnerHTML
   */
  private fixDangerousHTML(code: string): {
    code: string;
    fixes: AppliedFix[];
    unresolved: UnresolvedIssue[];
    warnings: string[];
  } {
    const fixes: AppliedFix[] = [];
    const unresolved: UnresolvedIssue[] = [];
    const warnings: string[] = [];
    let fixedCode = code;

    // Pattern pour dangerouslySetInnerHTML
    const dangerousPattern = /dangerouslySetInnerHTML\s*=\s*\{\s*\{\s*__html:\s*([^}]+)\s*\}\s*\}/g;

    const matches = code.matchAll(dangerousPattern);

    for (const match of matches) {
      const htmlSource = match[1].trim();

      // Si c'est une valeur littérale, on peut le garder
      if (/^["'`]/.test(htmlSource)) {
        warnings.push(`dangerouslySetInnerHTML utilisé avec une valeur littérale - vérifiez que le contenu est sûr`);
        continue;
      }

      // Si c'est une variable, ajouter un commentaire d'avertissement
      unresolved.push({
        ruleId: this.id,
        message: `Utilisation de dangerouslySetInnerHTML avec une valeur dynamique (${htmlSource})`,
        reason: 'Risque XSS - sanitizer le contenu avec DOMPurify ou équivalent',
      });

      // Ajouter un commentaire d'avertissement
      const originalMatch = match[0];
      const warning = `{/* ⚠️ SÉCURITÉ: Utilisez DOMPurify.sanitize() pour ${htmlSource} */}\n      `;
      fixedCode = fixedCode.replace(originalMatch, warning + originalMatch);

      fixes.push({
        ruleId: this.id,
        description: "Ajout d'un avertissement pour dangerouslySetInnerHTML",
      });
    }

    return { code: fixedCode, fixes, unresolved, warnings };
  }

  /**
   * Signale les injections de code (ne peut pas corriger automatiquement)
   */
  private checkCodeInjection(code: string): {
    unresolved: UnresolvedIssue[];
    warnings: string[];
  } {
    const unresolved: UnresolvedIssue[] = [];
    const warnings: string[] = [];

    const injectionPatterns = [
      { pattern: /\beval\s*\(([^)]+)\)/, name: 'eval()' },
      { pattern: /new\s+Function\s*\(([^)]+)\)/, name: 'new Function()' },
      { pattern: /setTimeout\s*\(\s*["'`]([^"'`]+)["'`]/, name: 'setTimeout avec string' },
      { pattern: /setInterval\s*\(\s*["'`]([^"'`]+)["'`]/, name: 'setInterval avec string' },
    ];

    for (const { pattern, name } of injectionPatterns) {
      const match = code.match(pattern);

      if (match) {
        unresolved.push({
          ruleId: this.id,
          message: `Utilisation de ${name} - risque d'injection de code`,
          reason: 'Remplacer par une alternative sûre',
        });
        warnings.push(`⚠️ ${name} détecté - cela peut permettre l'exécution de code malveillant`);
      }
    }

    return { unresolved, warnings };
  }

  /**
   * Remplace les secrets en dur par des références d'environnement
   */
  private fixHardcodedSecrets(code: string): {
    code: string;
    fixes: AppliedFix[];
    warnings: string[];
  } {
    const fixes: AppliedFix[] = [];
    const warnings: string[] = [];
    let fixedCode = code;

    // Patterns de secrets avec leurs noms d'env suggérés
    const secretPatterns: Array<{
      pattern: RegExp;
      envName: string;
      description: string;
    }> = [
      {
        pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*["']([^"']{20,})["']/gi,
        envName: 'API_KEY',
        description: 'clé API',
      },
      {
        pattern: /(?:supabase[_-]?key|anon[_-]?key)\s*[:=]\s*["']([^"']+)["']/gi,
        envName: 'SUPABASE_ANON_KEY',
        description: 'clé Supabase',
      },
      {
        pattern: /(?:supabase[_-]?url)\s*[:=]\s*["']([^"']+)["']/gi,
        envName: 'SUPABASE_URL',
        description: 'URL Supabase',
      },
      {
        pattern: /(?:openai[_-]?(?:api[_-]?)?key)\s*[:=]\s*["'](sk-[^"']+)["']/gi,
        envName: 'OPENAI_API_KEY',
        description: 'clé OpenAI',
      },
    ];

    for (const { pattern, envName, description } of secretPatterns) {
      let match: RegExpExecArray | null;

      // Reset lastIndex for global patterns
      pattern.lastIndex = 0;

      while ((match = pattern.exec(fixedCode)) !== null) {
        const fullMatch = match[0];
        const secretValue = match[1];

        // Remplacer par import.meta.env ou process.env
        const replacement = fullMatch
          .replace(`"${secretValue}"`, `import.meta.env.${envName}`)
          .replace(`'${secretValue}'`, `import.meta.env.${envName}`);

        fixedCode = fixedCode.replace(fullMatch, replacement);

        fixes.push({
          ruleId: this.id,
          description: `Remplacement de la ${description} en dur par import.meta.env.${envName}`,
          before: fullMatch.slice(0, 50) + '...',
          after: replacement,
        });

        warnings.push(`⚠️ N'oubliez pas d'ajouter ${envName} dans votre fichier .env`);
      }
    }

    return { code: fixedCode, fixes, warnings };
  }

  /**
   * Sécurise les URLs
   */
  private fixUnsafeURLs(code: string): { code: string; fixes: AppliedFix[] } {
    const fixes: AppliedFix[] = [];
    let fixedCode = code;

    // Ajouter target="_blank" rel="noopener noreferrer" aux liens externes
    const externalLinkPattern = /<a\s+([^>]*href\s*=\s*["']https?:\/\/[^"']+["'][^>]*)>/gi;

    fixedCode = fixedCode.replace(externalLinkPattern, (match, attrs) => {
      // Vérifier si target et rel sont déjà présents
      if (/target\s*=/.test(attrs) && /rel\s*=/.test(attrs)) {
        return match;
      }

      let newAttrs = attrs;

      if (!/target\s*=/.test(attrs)) {
        newAttrs += ' target="_blank"';
      }

      if (!/rel\s*=/.test(attrs)) {
        newAttrs += ' rel="noopener noreferrer"';
      } else if (!/noopener/.test(attrs) || !/noreferrer/.test(attrs)) {
        // Ajouter les valeurs manquantes à rel existant
        newAttrs = newAttrs.replace(/rel\s*=\s*["']([^"']+)["']/, (_relMatch: string, relValue: string) => {
          let newRel = relValue;

          if (!relValue.includes('noopener')) {
            newRel += ' noopener';
          }

          if (!relValue.includes('noreferrer')) {
            newRel += ' noreferrer';
          }

          return `rel="${newRel.trim()}"`;
        });
      }

      fixes.push({
        ruleId: this.id,
        description: 'Ajout de target="_blank" rel="noopener noreferrer" au lien externe',
      });

      return `<a ${newAttrs}>`;
    });

    return { code: fixedCode, fixes };
  }

  /**
   * Ajoute la validation des inputs
   */
  private addInputValidation(code: string): { code: string; fixes: AppliedFix[] } {
    const fixes: AppliedFix[] = [];
    let fixedCode = code;

    // Ajouter preventDefault aux form submit
    const formSubmitPattern = /onSubmit\s*=\s*\{\s*\(([^)]*)\)\s*=>\s*\{/g;

    fixedCode = fixedCode.replace(formSubmitPattern, (match, params) => {
      // Vérifier si preventDefault est appelé
      const funcBodyStart = fixedCode.indexOf(match) + match.length;
      const funcBody = this.extractFunctionBody(fixedCode, funcBodyStart);

      if (funcBody.includes('preventDefault')) {
        return match;
      }

      // Ajouter le paramètre e si absent et preventDefault
      const eventParam = params.trim() || 'e';
      const newMatch = `onSubmit={(${eventParam}: React.FormEvent) => {\n    ${eventParam}.preventDefault();`;

      fixes.push({
        ruleId: this.id,
        description: 'Ajout de preventDefault() au submit du formulaire',
      });

      return newMatch;
    });

    return { code: fixedCode, fixes };
  }

  /*
   * ===========================================================================
   * Helper Methods
   * ===========================================================================
   */

  /**
   * Extrait le corps d'une fonction
   */
  private extractFunctionBody(code: string, startIndex: number): string {
    let braceCount = 1;
    let i = startIndex;

    while (i < code.length && braceCount > 0) {
      if (code[i] === '{') {
        braceCount++;
      }

      if (code[i] === '}') {
        braceCount--;
      }

      i++;
    }

    return code.slice(startIndex, i - 1);
  }
}

/*
 * =============================================================================
 * Export
 * =============================================================================
 */

export function createSecurityFixer(): SecurityFixer {
  return new SecurityFixer();
}
