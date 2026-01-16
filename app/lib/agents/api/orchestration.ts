/**
 * Logique d'orchestration pour l'API Agent
 *
 * Analyse les requêtes utilisateur et décide quel agent doit traiter la demande.
 */

import { createScopedLogger } from '~/utils/logger';
import type { OrchestrationDecision } from './types';

const logger = createScopedLogger('Orchestration');

/**
 * Analyse le message utilisateur et décide de l'action à prendre
 */
export async function analyzeAndDecide(userMessage: string, fileContext: string): Promise<OrchestrationDecision> {
  const lowerMessage = userMessage.toLowerCase();

  /*
   * ============================================
   * PRIORITY 0: Error messages (highest priority)
   * ============================================
   */

  // Detect if user is reporting/pasting an error message
  const errorPatterns = [
    /Error:/i,
    /Cannot find module ['"]?([^'"]+)['"]?/i,
    /Module not found/i,
    /Failed to (?:resolve|compile|build|load)/i,
    /SyntaxError/i,
    /TypeError/i,
    /ReferenceError/i,
    /ENOENT/i,
    /npm ERR!/i,
    /Build failed/i,
    /Compilation failed/i,
    /failed to compile/i,
    /page (?:est )?blanche/i,
    /rien ne s'affiche/i,
    /ne fonctionne pas/i,
    /ne marche pas/i,
    /erreur/i,
  ];

  const hasErrorMessage = errorPatterns.some((pattern) => pattern.test(userMessage));

  // Extract specific error details for context
  const moduleMatch = userMessage.match(/Cannot find module ['"]?([^'"]+)['"]?/i);
  const errorContext = moduleMatch
    ? `Missing module: ${moduleMatch[1]}. Run npm install ${moduleMatch[1]} to fix.`
    : '';

  if (hasErrorMessage) {
    logger.info('Detected error message in user input, delegating to fixer');
    logger.debug('Error context:', errorContext || 'Generic error');

    return {
      action: 'delegate',
      targetAgent: 'fixer',
      reasoning: `Error message detected - delegating to fixer for resolution. ${errorContext}`,
    };
  }

  /*
   * ============================================
   * PRIORITY 1: Explicit action verbs (highest priority)
   * ============================================
   */

  // Fix/Repair requests - must check first
  const isFix =
    /corrige|fix|r[ée]pare|r[ée]sous|debug|erreur|probl[èe]me|marche pas|fonctionne pas|page blanche|rien ne s'affiche/i.test(
      userMessage,
    );

  if (isFix) {
    logger.info('Detected fix request, delegating to fixer');
    return {
      action: 'delegate',
      targetAgent: 'fixer',
      reasoning: 'Fix/repair task detected',
    };
  }

  /*
   * ============================================
   * PRIORITY 2: Code creation (most common)
   * ============================================
   */

  // Creation verbs (French + English)
  const hasCreationVerb =
    /cr[ée]e|g[ée]n[èe]re|d[ée]veloppe|construi|fait?s?|build|make|code|implement|ajoute|modifie|change/i.test(
      userMessage,
    );

  // Project/component types
  const hasProjectType =
    /site|page|app|application|composant|component|boutique|shop|e-commerce|ecommerce|dashboard|formulaire|form|landing|portfolio|blog|api|backend|frontend|interface|ui|ux|button|bouton|modal|menu|header|footer|sidebar|navbar|card|liste|table|grid/i.test(
      userMessage,
    );

  /*
   * If it has a project type OR a creation verb with something to create, it's code creation
   * Changed from AND to OR - much more permissive
   */
  const isCodeCreation = hasCreationVerb || hasProjectType;

  // But exclude pure exploration queries
  const isPureExploration =
    /^(o[ùu]|cherche|trouve|montre|liste|affiche|explique|qu'?est[- ]ce|comment fonctionne|c'?est quoi)/i.test(
      userMessage.trim(),
    );

  if (isCodeCreation && !isPureExploration) {
    logger.info('Detected code creation task, delegating to coder');
    return {
      action: 'delegate',
      targetAgent: 'coder',
      reasoning: 'Code creation task detected - delegating to coder agent',
    };
  }

  /*
   * ============================================
   * PRIORITY 3: Specific operations
   * ============================================
   */

  // Build/Run operations
  const isBuild = /^(install|npm|yarn|pnpm|build|run|start|d[ée]marre|lance)/i.test(userMessage.trim());

  if (isBuild) {
    logger.info('Detected build request, delegating to builder');
    return {
      action: 'delegate',
      targetAgent: 'builder',
      reasoning: 'Build/npm task detected',
    };
  }

  // Test operations
  const isTest =
    /^(test|v[ée]rifie|coverage|spec)/i.test(userMessage.trim()) ||
    /lance.*test|run.*test|ex[ée]cute.*test/i.test(userMessage);

  if (isTest) {
    logger.info('Detected test request, delegating to tester');
    return {
      action: 'delegate',
      targetAgent: 'tester',
      reasoning: 'Test task detected',
    };
  }

  // Review operations
  const isReview = /review|qualit[ée]|analyse.*code|code smell|audit/i.test(userMessage);

  if (isReview) {
    logger.info('Detected review request, delegating to reviewer');
    return {
      action: 'delegate',
      targetAgent: 'reviewer',
      reasoning: 'Review task detected',
    };
  }

  /*
   * ============================================
   * PRIORITY 4: Exploration (read-only)
   * ============================================
   */

  if (isPureExploration) {
    logger.info('Detected exploration request, delegating to explore');
    return {
      action: 'delegate',
      targetAgent: 'explore',
      reasoning: 'Exploration task detected',
    };
  }

  /*
   * ============================================
   * DEFAULT: Assume code creation for anything else
   * ============================================
   */

  // Most requests in a code assistant context are about creating/modifying code
  logger.info('No specific pattern matched, defaulting to coder');

  return {
    action: 'delegate',
    targetAgent: 'coder',
    reasoning: 'Default routing to coder for development task',
  };
}
