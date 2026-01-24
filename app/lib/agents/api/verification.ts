/**
 * =============================================================================
 * BAVINI CLOUD - Post-Fix Verification Loop
 * =============================================================================
 * Phase 0 Task 2.4: Implement verification loop after auto-fix
 *
 * Features:
 * - Verify fixes by checking for remaining errors
 * - Retry mechanism with configurable max attempts
 * - Snapshot/restore for rollback on failure
 * - Metrics tracking (retries, success rate)
 * =============================================================================
 */

import type { ChatMessage, DetectedError } from './types';
import { detectErrorsInOutput, buildFixerPrompt } from './error-detection';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('VerifyLoop');

/**
 * Configuration for the verification loop
 */
export interface VerificationConfig {
  /** Maximum number of fix attempts (default: 3) */
  maxRetries: number;
  /** Whether to rollback on all retries failed (default: true) */
  rollbackOnFailure: boolean;
  /** Minimum severity to trigger retry (default: 'high') */
  minSeverityForRetry: 'high' | 'medium' | 'low';
  /** Enable detailed logging (default: false) */
  verbose: boolean;
}

/**
 * Default verification configuration
 */
export const DEFAULT_VERIFICATION_CONFIG: VerificationConfig = {
  maxRetries: 3,
  rollbackOnFailure: true,
  minSeverityForRetry: 'high',
  verbose: false,
};

/**
 * Snapshot of the code state before fixing
 */
export interface CodeSnapshot {
  /** Original output before fix attempt */
  originalOutput: string;
  /** Agent messages at snapshot time */
  messages: ChatMessage[];
  /** Timestamp of snapshot */
  timestamp: number;
}

/**
 * Result of a single fix attempt
 */
export interface FixAttemptResult {
  /** Whether the fix was successful (no high-severity errors) */
  success: boolean;
  /** The output from this fix attempt */
  output: string;
  /** Remaining errors after fix */
  remainingErrors: DetectedError[];
  /** Attempt number (1-based) */
  attempt: number;
  /** Duration of this attempt in ms */
  durationMs: number;
}

/**
 * Final result of the verification loop
 */
export interface VerificationResult {
  /** Whether any fix attempt succeeded */
  success: boolean;
  /** Final output (fixed or rolled back) */
  finalOutput: string;
  /** Total number of attempts made */
  totalAttempts: number;
  /** Whether rollback was performed */
  rolledBack: boolean;
  /** All attempt results */
  attempts: FixAttemptResult[];
  /** Total duration of all attempts */
  totalDurationMs: number;
  /** Final remaining errors (if any) */
  finalErrors: DetectedError[];
}

/**
 * Metrics for the verification system
 */
export interface VerificationMetrics {
  /** Total fix operations attempted */
  totalFixOperations: number;
  /** Successful fixes on first attempt */
  firstAttemptSuccesses: number;
  /** Successful fixes after retry */
  retrySuccesses: number;
  /** Complete failures (all retries exhausted) */
  failures: number;
  /** Total rollbacks performed */
  rollbacks: number;
  /** Average attempts per fix */
  averageAttempts: number;
  /** Success rate (0-1) */
  successRate: number;
}

/**
 * Module-level metrics storage
 */
let metrics: VerificationMetrics = {
  totalFixOperations: 0,
  firstAttemptSuccesses: 0,
  retrySuccesses: 0,
  failures: 0,
  rollbacks: 0,
  averageAttempts: 0,
  successRate: 0,
};

/** Total attempts counter for average calculation */
let totalAttemptsSum = 0;

/**
 * Create a snapshot of the current code state
 */
export function createSnapshot(output: string, messages: ChatMessage[]): CodeSnapshot {
  return {
    originalOutput: output,
    // Deep clone messages to prevent mutation
    messages: messages.map((m) => ({ ...m })),
    timestamp: Date.now(),
  };
}

/**
 * Check if errors warrant a retry attempt
 */
export function shouldRetry(
  errors: DetectedError[],
  config: VerificationConfig,
): boolean {
  const severityOrder = { high: 3, medium: 2, low: 1 };
  const minSeverity = severityOrder[config.minSeverityForRetry];

  return errors.some((error) => {
    const errorSeverity = severityOrder[error.severity] || 1;
    return errorSeverity >= minSeverity;
  });
}

/**
 * Verify if the fix was successful by checking for remaining errors
 */
export function verifyFix(
  output: string,
  config: VerificationConfig,
): { success: boolean; errors: DetectedError[] } {
  const errors = detectErrorsInOutput(output);

  if (errors.length === 0) {
    return { success: true, errors: [] };
  }

  // Check if any errors warrant retry
  const hasBlockingErrors = shouldRetry(errors, config);

  return {
    success: !hasBlockingErrors,
    errors,
  };
}

/**
 * Build an enhanced fixer prompt for retry attempts
 * Includes information about previous failed attempts
 */
export function buildRetryFixerPrompt(
  errors: DetectedError[],
  sourceAgent: string,
  attemptNumber: number,
  previousOutput: string,
): string {
  const basePrompt = buildFixerPrompt(errors, sourceAgent);

  return `${basePrompt}

## ⚠️ TENTATIVE DE CORRECTION #${attemptNumber}

La correction précédente n'a pas résolu tous les problèmes.

### Sortie précédente (qui contenait encore des erreurs):
\`\`\`
${previousOutput.slice(0, 2000)}${previousOutput.length > 2000 ? '...' : ''}
\`\`\`

### Instructions supplémentaires:
1. Analyse POURQUOI la correction précédente n'a pas fonctionné
2. Adopte une approche DIFFÉRENTE si nécessaire
3. Vérifie que TOUTES les dépendances sont correctement installées
4. Assure-toi que la syntaxe est 100% correcte

**C'est la tentative #${attemptNumber}. Sois plus rigoureux dans ta correction.**`;
}

/**
 * Run the auto-fix with verification loop
 *
 * This function:
 * 1. Creates a snapshot of the original state
 * 2. Runs the fixer
 * 3. Verifies if the fix worked
 * 4. If not, retries up to maxRetries times
 * 5. Optionally rolls back if all attempts fail
 *
 * @param runFixer - Async function that executes the fixer and returns output
 * @param originalOutput - The original output that needs fixing
 * @param sourceAgent - The agent that produced the original output
 * @param messages - Chat messages for context
 * @param config - Verification configuration
 * @returns Verification result with final output and metrics
 */
export async function runAutoFixWithVerification(
  runFixer: (prompt: string, messages: ChatMessage[]) => Promise<string>,
  originalOutput: string,
  sourceAgent: string,
  messages: ChatMessage[],
  config: Partial<VerificationConfig> = {},
): Promise<VerificationResult> {
  const fullConfig = { ...DEFAULT_VERIFICATION_CONFIG, ...config };
  const startTime = Date.now();

  // Create snapshot for potential rollback
  const snapshot = createSnapshot(originalOutput, messages);

  // Initialize result tracking
  const attempts: FixAttemptResult[] = [];
  let currentOutput = originalOutput;
  let currentErrors = detectErrorsInOutput(originalOutput);
  let success = false;

  metrics.totalFixOperations++;

  logger.info('Starting verification loop', {
    maxRetries: fullConfig.maxRetries,
    initialErrors: currentErrors.length,
  });

  // Attempt fix up to maxRetries times
  for (let attempt = 1; attempt <= fullConfig.maxRetries; attempt++) {
    const attemptStart = Date.now();

    if (fullConfig.verbose) {
      logger.debug(`Fix attempt #${attempt}`, {
        currentErrors: currentErrors.length,
      });
    }

    // Build appropriate prompt
    const prompt = attempt === 1
      ? buildFixerPrompt(currentErrors, sourceAgent)
      : buildRetryFixerPrompt(currentErrors, sourceAgent, attempt, currentOutput);

    try {
      // Run the fixer
      const fixerOutput = await runFixer(prompt, [
        ...messages,
        { role: 'assistant' as const, content: currentOutput },
        { role: 'user' as const, content: prompt },
      ]);

      // Verify the fix
      const verification = verifyFix(fixerOutput, fullConfig);

      const attemptResult: FixAttemptResult = {
        success: verification.success,
        output: fixerOutput,
        remainingErrors: verification.errors,
        attempt,
        durationMs: Date.now() - attemptStart,
      };

      attempts.push(attemptResult);

      if (verification.success) {
        success = true;
        currentOutput = fixerOutput;
        currentErrors = verification.errors;

        // Update metrics
        if (attempt === 1) {
          metrics.firstAttemptSuccesses++;
        } else {
          metrics.retrySuccesses++;
        }

        logger.info(`Fix successful on attempt #${attempt}`, {
          remainingErrors: verification.errors.length,
        });

        break;
      }

      // Update for next iteration
      currentOutput = fixerOutput;
      currentErrors = verification.errors;

      logger.warn(`Fix attempt #${attempt} failed`, {
        remainingErrors: verification.errors.length,
        errorsFound: verification.errors.map(e => e.message).slice(0, 3),
      });

    } catch (error) {
      logger.error(`Fix attempt #${attempt} threw error`, error);

      attempts.push({
        success: false,
        output: currentOutput,
        remainingErrors: currentErrors,
        attempt,
        durationMs: Date.now() - attemptStart,
      });
    }
  }

  // Handle failure case
  let rolledBack = false;

  if (!success) {
    metrics.failures++;

    if (fullConfig.rollbackOnFailure) {
      logger.warn('All fix attempts failed, rolling back to original');
      currentOutput = snapshot.originalOutput;
      currentErrors = detectErrorsInOutput(snapshot.originalOutput);
      rolledBack = true;
      metrics.rollbacks++;
    }
  }

  // Update average attempts metric
  totalAttemptsSum += attempts.length;
  metrics.averageAttempts = totalAttemptsSum / metrics.totalFixOperations;

  // Update success rate
  const successfulOps = metrics.firstAttemptSuccesses + metrics.retrySuccesses;
  metrics.successRate = successfulOps / metrics.totalFixOperations;

  const result: VerificationResult = {
    success,
    finalOutput: currentOutput,
    totalAttempts: attempts.length,
    rolledBack,
    attempts,
    totalDurationMs: Date.now() - startTime,
    finalErrors: currentErrors,
  };

  logger.info('Verification loop completed', {
    success,
    totalAttempts: attempts.length,
    rolledBack,
    durationMs: result.totalDurationMs,
  });

  return result;
}

/**
 * Get current verification metrics
 */
export function getVerificationMetrics(): VerificationMetrics {
  return { ...metrics };
}

/**
 * Reset verification metrics (for testing)
 */
export function resetVerificationMetrics(): void {
  metrics = {
    totalFixOperations: 0,
    firstAttemptSuccesses: 0,
    retrySuccesses: 0,
    failures: 0,
    rollbacks: 0,
    averageAttempts: 0,
    successRate: 0,
  };
  totalAttemptsSum = 0;
}

/**
 * Format metrics for display
 */
export function formatMetricsReport(): string {
  const m = metrics;
  return `
## Verification Metrics Report

| Metric | Value |
|--------|-------|
| Total Fix Operations | ${m.totalFixOperations} |
| First Attempt Successes | ${m.firstAttemptSuccesses} |
| Retry Successes | ${m.retrySuccesses} |
| Failures | ${m.failures} |
| Rollbacks | ${m.rollbacks} |
| Average Attempts | ${m.averageAttempts.toFixed(2)} |
| Success Rate | ${(m.successRate * 100).toFixed(1)}% |
`.trim();
}
