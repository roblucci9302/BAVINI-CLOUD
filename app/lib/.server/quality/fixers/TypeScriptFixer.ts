/**
 * TypeScriptFixer - Correction automatique des erreurs TypeScript communes
 *
 * Détecte et corrige:
 * - Utilisation de 'any' explicite
 * - Types manquants sur les paramètres de fonction
 * - Assertions de type non sûres
 * - Variables non typées
 */

import type { FixRule, FixContext, FixResult, AppliedFix } from '../autofix-types';

/*
 * =============================================================================
 * TypeScriptFixer
 * =============================================================================
 */

/**
 * Règle de correction TypeScript
 */
export class TypeScriptFixer implements FixRule {
  readonly id = 'typescript-fixer';
  readonly name = 'TypeScript Fixer';
  readonly description = 'Corrige les erreurs TypeScript communes et améliore le typage';
  readonly category = 'typescript' as const;
  readonly severity = 'warning' as const;

  /**
   * Vérifie si le code contient des problèmes TypeScript
   */
  canFix(code: string, context?: FixContext): boolean {
    // Ne traiter que les fichiers TypeScript
    const tsLanguages = ['typescript', 'tsx'];

    if (context?.language && !tsLanguages.includes(context.language)) {
      return false;
    }

    return (
      this.hasExplicitAny(code) ||
      this.hasUntypedParameters(code) ||
      this.hasUnsafeAssertion(code) ||
      this.hasMissingReturnType(code)
    );
  }

  /**
   * Corrige les problèmes TypeScript
   */
  async fix(code: string, context?: FixContext): Promise<FixResult> {
    const fixes: AppliedFix[] = [];
    const warnings: string[] = [];
    let fixedCode = code;

    // 1. Remplacer les 'any' par 'unknown' quand c'est sûr
    const anyResult = this.fixExplicitAny(fixedCode);

    if (anyResult.applied) {
      fixedCode = anyResult.code;
      fixes.push(...anyResult.fixes);
    }

    // 2. Ajouter des types aux event handlers
    const eventResult = this.fixEventHandlerTypes(fixedCode);

    if (eventResult.applied) {
      fixedCode = eventResult.code;
      fixes.push(...eventResult.fixes);
    }

    // 3. Corriger les assertions non sûres
    const assertionResult = this.fixUnsafeAssertions(fixedCode);

    if (assertionResult.applied) {
      fixedCode = assertionResult.code;
      fixes.push(...assertionResult.fixes);
    }

    // 4. Ajouter des types de retour aux fonctions
    const returnResult = this.fixMissingReturnTypes(fixedCode);

    if (returnResult.applied) {
      fixedCode = returnResult.code;
      fixes.push(...returnResult.fixes);
    }

    return {
      applied: fixes.length > 0,
      code: fixedCode,
      fixes,
      unresolved: [],
      warnings,
    };
  }

  /*
   * ===========================================================================
   * Detection Methods
   * ===========================================================================
   */

  /**
   * Détecte les 'any' explicites
   */
  private hasExplicitAny(code: string): boolean {
    // Ignorer les commentaires
    const codeWithoutComments = this.removeComments(code);
    return /:\s*any\b/.test(codeWithoutComments);
  }

  /**
   * Détecte les paramètres non typés
   */
  private hasUntypedParameters(code: string): boolean {
    // Fonctions avec paramètres non typés (hors arrow functions simples)
    const funcPattern = /function\s+\w+\s*\([^)]*\b\w+\s*(?:,|\))/;
    const arrowPattern = /\(\s*\w+\s*(?:,\s*\w+)*\s*\)\s*=>/;

    // Vérifier si les paramètres ont des types
    const matches = code.match(funcPattern) || code.match(arrowPattern);

    if (!matches) {
      return false;
    }

    // Vérifier s'il y a des ':' pour les types
    return matches.some((match) => !match.includes(':'));
  }

  /**
   * Détecte les assertions non sûres
   */
  private hasUnsafeAssertion(code: string): boolean {
    // as any ou as unknown sans vérification
    return /\bas\s+any\b/.test(code);
  }

  /**
   * Détecte les fonctions sans type de retour explicite
   */
  private hasMissingReturnType(code: string): boolean {
    // Fonctions exportées sans type de retour
    const exportedFunc = /export\s+(?:default\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\)\s*(?!:)/;
    return exportedFunc.test(code);
  }

  /*
   * ===========================================================================
   * Fix Methods
   * ===========================================================================
   */

  /**
   * Remplace 'any' par des types plus appropriés
   */
  private fixExplicitAny(code: string): { applied: boolean; code: string; fixes: AppliedFix[] } {
    const fixes: AppliedFix[] = [];
    let fixedCode = code;

    // Patterns de remplacement pour 'any'
    const replacements: Array<{ pattern: RegExp; replacement: string; description: string }> = [
      {
        pattern: /:\s*any\[\]/g,
        replacement: ': unknown[]',
        description: "Remplacement de 'any[]' par 'unknown[]'",
      },
      {
        pattern: /Record<string,\s*any>/g,
        replacement: 'Record<string, unknown>',
        description: "Remplacement de 'Record<string, any>' par 'Record<string, unknown>'",
      },
      {
        pattern: /:\s*any\b(?!\s*\[)/g,
        replacement: ': unknown',
        description: "Remplacement de 'any' par 'unknown'",
      },
    ];

    for (const { pattern, replacement, description } of replacements) {
      if (pattern.test(fixedCode)) {
        fixedCode = fixedCode.replace(pattern, replacement);
        fixes.push({
          ruleId: this.id,
          description,
        });
      }
    }

    return {
      applied: fixes.length > 0,
      code: fixedCode,
      fixes,
    };
  }

  /**
   * Ajoute les types aux event handlers React
   */
  private fixEventHandlerTypes(code: string): {
    applied: boolean;
    code: string;
    fixes: AppliedFix[];
  } {
    const fixes: AppliedFix[] = [];
    let fixedCode = code;

    // onClick, onChange, onSubmit sans type
    const eventPatterns: Array<{
      pattern: RegExp;
      type: string;
      eventName: string;
    }> = [
      {
        pattern: /onClick\s*=\s*\{\s*\(\s*e\s*\)\s*=>/g,
        type: 'React.MouseEvent<HTMLButtonElement>',
        eventName: 'onClick',
      },
      {
        pattern: /onChange\s*=\s*\{\s*\(\s*e\s*\)\s*=>/g,
        type: 'React.ChangeEvent<HTMLInputElement>',
        eventName: 'onChange',
      },
      {
        pattern: /onSubmit\s*=\s*\{\s*\(\s*e\s*\)\s*=>/g,
        type: 'React.FormEvent<HTMLFormElement>',
        eventName: 'onSubmit',
      },
      {
        pattern: /onKeyDown\s*=\s*\{\s*\(\s*e\s*\)\s*=>/g,
        type: 'React.KeyboardEvent',
        eventName: 'onKeyDown',
      },
      {
        pattern: /onFocus\s*=\s*\{\s*\(\s*e\s*\)\s*=>/g,
        type: 'React.FocusEvent',
        eventName: 'onFocus',
      },
      {
        pattern: /onBlur\s*=\s*\{\s*\(\s*e\s*\)\s*=>/g,
        type: 'React.FocusEvent',
        eventName: 'onBlur',
      },
    ];

    for (const { pattern, type, eventName } of eventPatterns) {
      if (pattern.test(fixedCode)) {
        const replacement = `${eventName}={(e: ${type}) =>`;
        fixedCode = fixedCode.replace(pattern, replacement);
        fixes.push({
          ruleId: this.id,
          description: `Ajout du type ${type} au handler ${eventName}`,
        });
      }
    }

    return {
      applied: fixes.length > 0,
      code: fixedCode,
      fixes,
    };
  }

  /**
   * Corrige les assertions 'as any'
   */
  private fixUnsafeAssertions(code: string): {
    applied: boolean;
    code: string;
    fixes: AppliedFix[];
  } {
    const fixes: AppliedFix[] = [];
    let fixedCode = code;

    // Remplacer 'as any' par 'as unknown'
    if (/\bas\s+any\b/.test(fixedCode)) {
      fixedCode = fixedCode.replace(/\bas\s+any\b/g, 'as unknown');
      fixes.push({
        ruleId: this.id,
        description: "Remplacement de 'as any' par 'as unknown' (plus sûr)",
      });
    }

    return {
      applied: fixes.length > 0,
      code: fixedCode,
      fixes,
    };
  }

  /**
   * Ajoute les types de retour aux fonctions exportées
   */
  private fixMissingReturnTypes(code: string): {
    applied: boolean;
    code: string;
    fixes: AppliedFix[];
  } {
    const fixes: AppliedFix[] = [];
    let fixedCode = code;

    // Ajouter : void aux fonctions sans retour
    const voidFuncPattern = /(export\s+(?:default\s+)?(?:async\s+)?function\s+\w+\s*\([^)]*\))\s*\{/g;

    if (voidFuncPattern.test(fixedCode)) {
      // Vérifier si la fonction retourne quelque chose
      const matches = fixedCode.matchAll(voidFuncPattern);

      for (const match of matches) {
        const funcDecl = match[1];
        const fullMatch = match[0];

        // Vérifier s'il y a déjà un type de retour
        if (!funcDecl.includes('): ')) {
          // Déterminer le type de retour approprié
          const funcBody = this.extractFunctionBody(fixedCode, match.index! + fullMatch.length);
          const returnType = this.inferReturnType(funcBody, funcDecl.includes('async'));

          const newDecl = funcDecl.replace(/\)\s*$/, `): ${returnType}`);
          fixedCode = fixedCode.replace(funcDecl, newDecl);

          fixes.push({
            ruleId: this.id,
            description: `Ajout du type de retour ${returnType}`,
            before: funcDecl,
            after: newDecl,
          });
        }
      }
    }

    return {
      applied: fixes.length > 0,
      code: fixedCode,
      fixes,
    };
  }

  /*
   * ===========================================================================
   * Helper Methods
   * ===========================================================================
   */

  /**
   * Supprime les commentaires du code
   */
  private removeComments(code: string): string {
    // Supprimer les commentaires multilignes
    let result = code.replace(/\/\*[\s\S]*?\*\//g, '');

    // Supprimer les commentaires sur une ligne
    result = result.replace(/\/\/.*$/gm, '');

    return result;
  }

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

  /**
   * Infère le type de retour d'une fonction
   */
  private inferReturnType(body: string, isAsync: boolean): string {
    // Vérifier s'il y a un return avec valeur
    const hasReturn = /\breturn\s+(?!;)/.test(body);

    if (!hasReturn) {
      return isAsync ? 'Promise<void>' : 'void';
    }

    // Vérifier le type de retour
    if (/return\s+true|return\s+false/.test(body)) {
      return isAsync ? 'Promise<boolean>' : 'boolean';
    }

    if (/return\s+["'`]/.test(body)) {
      return isAsync ? 'Promise<string>' : 'string';
    }

    if (/return\s+\d/.test(body)) {
      return isAsync ? 'Promise<number>' : 'number';
    }

    if (/return\s+\[/.test(body)) {
      return isAsync ? 'Promise<unknown[]>' : 'unknown[]';
    }

    if (/return\s+\{/.test(body)) {
      return isAsync ? 'Promise<Record<string, unknown>>' : 'Record<string, unknown>';
    }

    // JSX
    if (/return\s*\(?\s*</.test(body)) {
      return isAsync ? 'Promise<JSX.Element>' : 'JSX.Element';
    }

    return isAsync ? 'Promise<unknown>' : 'unknown';
  }
}

/*
 * =============================================================================
 * Export
 * =============================================================================
 */

export function createTypeScriptFixer(): TypeScriptFixer {
  return new TypeScriptFixer();
}
