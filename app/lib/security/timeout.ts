/**
 * Execution Timeout Utilities
 *
 * Fournit des timeouts pour limiter l'exécution de code
 * (WebContainer, Pyodide, etc.)
 */

import { createScopedLogger } from '~/utils/logger';
import { TimeoutError } from '~/lib/errors';

const logger = createScopedLogger('Timeout');

export interface ExecutionLimitConfig {
  /** Timeout en millisecondes */
  timeoutMs: number;

  /** Message d'erreur personnalisé */
  message?: string;

  /** Callback appelé en cas de timeout */
  onTimeout?: () => void;
}

export interface TimeoutResult<T> {
  /** Résultat de l'exécution */
  result?: T;

  /** Erreur si timeout ou échec */
  error?: Error;

  /** Exécution terminée avec succès */
  success: boolean;

  /** Temps d'exécution en ms */
  executionTimeMs: number;

  /** Timeout atteint */
  timedOut: boolean;
}

// Configurations par défaut
export const EXECUTION_LIMITS = {
  /** Shell commands - 5 minutes (npm install peut être long) */
  shell: {
    timeoutMs: 300_000,
    message: "La commande a dépassé le délai d'exécution de 5 minutes.",
  },

  /** Python execution - 30 seconds */
  python: {
    timeoutMs: 30_000,
    message: "L'exécution Python a dépassé le délai de 30 secondes.",
  },

  /** File operations - 10 seconds */
  file: {
    timeoutMs: 10_000,
    message: "L'opération fichier a dépassé le délai de 10 secondes.",
  },

  /** Git operations - 60 seconds */
  git: {
    timeoutMs: 60_000,
    message: "L'opération Git a dépassé le délai de 60 secondes.",
  },

  /** API calls - 30 seconds */
  api: {
    timeoutMs: 30_000,
    message: "L'appel API a dépassé le délai de 30 secondes.",
  },

  /** Dev server startup - 60 seconds */
  devServer: {
    timeoutMs: 60_000,
    message: 'Le démarrage du serveur a dépassé le délai de 60 secondes.',
  },
} as const;

/**
 * Crée un AbortController avec timeout automatique
 */
export function createTimeoutController(
  timeoutMs: number,
  message?: string,
): { controller: AbortController; cleanup: () => void } {
  const controller = new AbortController();

  const timeoutId = setTimeout(() => {
    logger.warn(`Timeout after ${timeoutMs}ms: ${message || 'Execution timeout'}`);
    controller.abort(new TimeoutError(message || 'Exécution', timeoutMs));
  }, timeoutMs);

  const cleanup = () => {
    clearTimeout(timeoutId);
  };

  return { controller, cleanup };
}

/**
 * Exécute une fonction avec timeout
 */
export async function withTimeout<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  config: ExecutionLimitConfig,
): Promise<TimeoutResult<T>> {
  const startTime = Date.now();
  const { controller, cleanup } = createTimeoutController(config.timeoutMs, config.message);

  try {
    const result = await Promise.race([
      fn(controller.signal),
      new Promise<never>((_, reject) => {
        controller.signal.addEventListener('abort', () => {
          config.onTimeout?.();
          reject(controller.signal.reason || new TimeoutError(config.message || 'Exécution', config.timeoutMs));
        });
      }),
    ]);

    cleanup();

    return {
      result,
      success: true,
      executionTimeMs: Date.now() - startTime,
      timedOut: false,
    };
  } catch (error) {
    cleanup();

    const isTimeout = error instanceof TimeoutError || (error instanceof Error && error.name === 'AbortError');

    if (isTimeout) {
      logger.warn(`Execution timed out after ${Date.now() - startTime}ms`);
    }

    return {
      error: error instanceof Error ? error : new Error(String(error)),
      success: false,
      executionTimeMs: Date.now() - startTime,
      timedOut: isTimeout,
    };
  }
}

/**
 * Wrapper pour exécution avec limite de temps configurable
 */
export async function withExecutionLimit<T>(
  fn: (signal: AbortSignal) => Promise<T>,
  limitType: keyof typeof EXECUTION_LIMITS,
): Promise<T> {
  const config = EXECUTION_LIMITS[limitType];
  const result = await withTimeout(fn, config);

  if (!result.success) {
    throw result.error || new TimeoutError(config.message || 'Exécution', config.timeoutMs);
  }

  return result.result as T;
}

/**
 * Crée une Promise qui rejette après un timeout
 */
export function createTimeoutPromise(timeoutMs: number, message?: string): Promise<never> {
  return new Promise((_, reject) => {
    setTimeout(() => {
      reject(new TimeoutError(message || 'Exécution', timeoutMs));
    }, timeoutMs);
  });
}

/**
 * Race entre une opération et un timeout
 */
export async function raceWithTimeout<T>(operation: Promise<T>, timeoutMs: number, message?: string): Promise<T> {
  return Promise.race([operation, createTimeoutPromise(timeoutMs, message)]);
}
