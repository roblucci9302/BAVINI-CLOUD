/**
 * Fixers pour le système AutoFix
 *
 * Ce module exporte tous les fixers disponibles pour la correction
 * automatique du code généré par le LLM.
 */

/*
 * =============================================================================
 * Fixers
 * =============================================================================
 */

export { ImportFixer, createImportFixer } from './ImportFixer';
export { TypeScriptFixer, createTypeScriptFixer } from './TypeScriptFixer';
export { AccessibilityFixer, createAccessibilityFixer } from './AccessibilityFixer';
export { SecurityFixer, createSecurityFixer } from './SecurityFixer';

/*
 * =============================================================================
 * Factory Function
 * =============================================================================
 */

import { ImportFixer } from './ImportFixer';
import { TypeScriptFixer } from './TypeScriptFixer';
import { AccessibilityFixer } from './AccessibilityFixer';
import { SecurityFixer } from './SecurityFixer';
import type { FixRule } from '../autofix-types';

/**
 * Crée tous les fixers par défaut
 */
export function createDefaultFixers(): FixRule[] {
  return [new ImportFixer(), new TypeScriptFixer(), new AccessibilityFixer(), new SecurityFixer()];
}

/**
 * Crée un ensemble de fixers selon la configuration
 */
export function createFixers(
  options: {
    imports?: boolean;
    typescript?: boolean;
    accessibility?: boolean;
    security?: boolean;
  } = {},
): FixRule[] {
  const { imports = true, typescript = true, accessibility = true, security = true } = options;

  const fixers: FixRule[] = [];

  if (imports) {
    fixers.push(new ImportFixer());
  }

  if (typescript) {
    fixers.push(new TypeScriptFixer());
  }

  if (accessibility) {
    fixers.push(new AccessibilityFixer());
  }

  if (security) {
    fixers.push(new SecurityFixer());
  }

  return fixers;
}
