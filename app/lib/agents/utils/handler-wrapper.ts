/**
 * Utilitaire pour wrapper des handlers avec du tracking/post-processing
 *
 * Ce module fournit une fonction générique pour envelopper des handlers d'outils
 * avec des callbacks de post-traitement, éliminant la duplication de code
 * dans les différents agents.
 *
 * @module agents/utils/handler-wrapper
 */

import type { ToolExecutionResult } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('HandlerWrapper');

/**
 * Type générique pour un handler d'outil (input flexible)
 */
export type ToolHandler = (input: unknown) => Promise<ToolExecutionResult>;

/**
 * Type pour un record de handlers
 */
export type HandlerRecord = Record<string, ToolHandler>;

/**
 * Callback appelé après l'exécution d'un handler
 * @param toolName - Nom de l'outil exécuté
 * @param input - Input passé au handler
 * @param result - Résultat de l'exécution
 */
export type PostExecutionCallback = (
  toolName: string,
  input: Record<string, unknown>,
  result: ToolExecutionResult,
) => void | Promise<void>;

/**
 * Options pour le wrapper de handlers
 */
export interface WrapHandlersOptions {
  /** Callback appelé après chaque exécution (succès ou échec) */
  onAfterExecute?: PostExecutionCallback;

  /** Callback appelé uniquement en cas de succès */
  onSuccess?: PostExecutionCallback;

  /** Callback appelé uniquement en cas d'échec */
  onError?: PostExecutionCallback;

  /** Callback appelé avant l'exécution */
  onBeforeExecute?: (toolName: string, input: Record<string, unknown>) => void | Promise<void>;
}

/**
 * Wrapper générique pour ajouter du tracking/post-processing aux handlers
 *
 * @example
 * ```typescript
 * // Dans CoderAgent
 * const wrappedHandlers = wrapHandlersWithTracking(writeHandlers, {
 *   onSuccess: (toolName, input) => this.trackFileModification(toolName, input),
 * });
 *
 * // Dans BuilderAgent
 * const wrappedHandlers = wrapHandlersWithTracking(shellHandlers, {
 *   onAfterExecute: (toolName, input, result) => this.trackCommand(toolName, input, result),
 * });
 * ```
 *
 * @param handlers - Record de handlers à wrapper
 * @param options - Options de configuration du wrapper
 * @returns Record de handlers wrappés
 */

export function wrapHandlersWithTracking<T extends Record<string, (input: any) => Promise<ToolExecutionResult>>>(
  handlers: T,
  options: WrapHandlersOptions,
): HandlerRecord {
  const wrapped: HandlerRecord = {};

  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name] = async (input: unknown): Promise<ToolExecutionResult> => {
      const inputRecord = input as Record<string, unknown>;

      // Callback avant exécution
      if (options.onBeforeExecute) {
        await options.onBeforeExecute(name, inputRecord);
      }

      // Exécuter le handler original
      const result = await handler(input);

      // Callback après exécution (toujours)
      if (options.onAfterExecute) {
        await options.onAfterExecute(name, inputRecord, result);
      }

      // Callbacks conditionnels
      if (result.success && options.onSuccess) {
        await options.onSuccess(name, inputRecord, result);
      } else if (!result.success && options.onError) {
        await options.onError(name, inputRecord, result);
      }

      return result;
    };
  }

  return wrapped;
}

/**
 * Version simplifiée pour tracker uniquement les succès
 *
 * @param handlers - Record de handlers à wrapper
 * @param onSuccess - Callback appelé en cas de succès
 * @returns Record de handlers wrappés
 */

export function wrapHandlersOnSuccess<T extends Record<string, (input: any) => Promise<ToolExecutionResult>>>(
  handlers: T,
  onSuccess: (toolName: string, input: Record<string, unknown>) => void,
): HandlerRecord {
  return wrapHandlersWithTracking(handlers, { onSuccess });
}

/**
 * Version pour tracker toutes les exécutions
 *
 * @param handlers - Record de handlers à wrapper
 * @param onExecute - Callback appelé après chaque exécution
 * @returns Record de handlers wrappés
 */

export function wrapHandlersWithCallback<T extends Record<string, (input: any) => Promise<ToolExecutionResult>>>(
  handlers: T,
  onExecute: PostExecutionCallback,
): HandlerRecord {
  return wrapHandlersWithTracking(handlers, { onAfterExecute: onExecute });
}

/*
 * ============================================================================
 * TIMEOUT UTILITIES
 * ============================================================================
 */

/**
 * Timeouts par défaut pour les handlers d'outils (en millisecondes)
 */
export const TOOL_TIMEOUTS: Record<string, number> = {
  // Read tools
  read_file: 5000, // 5s
  grep: 10000, // 10s
  glob: 10000, // 10s
  list_directory: 5000, // 5s

  // Write tools
  write_file: 10000, // 10s
  edit_file: 10000, // 10s
  create_file: 10000, // 10s
  delete_file: 5000, // 5s

  // Shell tools
  npm_command: 120000, // 2 min
  shell_command: 30000, // 30s
  install_dependencies: 180000, // 3 min

  // Git tools
  git_status: 10000, // 10s
  git_diff: 15000, // 15s
  git_commit: 30000, // 30s
  git_push: 60000, // 1 min
  git_pull: 60000, // 1 min
  git_clone: 120000, // 2 min
  git_branch: 10000, // 10s
  git_checkout: 15000, // 15s
  git_merge: 30000, // 30s
  git_log: 15000, // 15s
  git_init: 10000, // 10s

  // Web tools
  web_fetch: 30000, // 30s
  web_search: 30000, // 30s

  // Test tools
  run_tests: 300000, // 5 min
  detect_framework: 10000, // 10s
  get_coverage: 60000, // 1 min

  // Review tools
  analyze_code: 30000, // 30s
  calculate_complexity: 15000, // 15s

  // Design tools
  create_wireframe: 30000, // 30s
  generate_mockup: 60000, // 1 min

  // Inspect tools
  inspect_element: 10000, // 10s
  capture_screenshot: 15000, // 15s

  // Integration tools
  api_call: 30000, // 30s
  db_query: 30000, // 30s
};

/**
 * Timeout par défaut pour les outils non listés
 */
export const DEFAULT_TOOL_TIMEOUT = 30000; // 30s

/**
 * Erreur de timeout pour un handler
 */
export class ToolTimeoutError extends Error {
  readonly toolName: string;
  readonly timeoutMs: number;

  constructor(toolName: string, timeoutMs: number) {
    super(`Tool '${toolName}' timed out after ${timeoutMs}ms`);
    this.name = 'ToolTimeoutError';
    this.toolName = toolName;
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Exécute une promesse avec un timeout
 *
 * @param promise - La promesse à exécuter
 * @param timeoutMs - Timeout en millisecondes
 * @param operationName - Nom de l'opération pour le message d'erreur
 * @returns La valeur de la promesse si elle se résout avant le timeout
 * @throws ToolTimeoutError si le timeout est atteint
 *
 * @example
 * ```typescript
 * const result = await withTimeout(
 *   fetch('https://api.example.com/data'),
 *   5000,
 *   'api_fetch'
 * );
 * ```
 */
export function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new ToolTimeoutError(operationName, timeoutMs));
    }, timeoutMs);

    promise
      .then((result) => {
        clearTimeout(timeoutId);
        resolve(result);
      })
      .catch((error) => {
        clearTimeout(timeoutId);
        reject(error);
      });
  });
}

/**
 * Obtient le timeout pour un outil donné
 *
 * @param toolName - Nom de l'outil
 * @param customTimeouts - Map de timeouts personnalisés (optionnel)
 * @returns Timeout en millisecondes
 */
export function getToolTimeout(toolName: string, customTimeouts?: Record<string, number>): number {
  // Vérifier d'abord les timeouts personnalisés
  if (customTimeouts && toolName in customTimeouts) {
    return customTimeouts[toolName];
  }

  // Sinon utiliser les timeouts par défaut
  return TOOL_TIMEOUTS[toolName] || DEFAULT_TOOL_TIMEOUT;
}

/**
 * Options pour le wrapper avec timeout
 */
export interface WrapHandlersWithTimeoutOptions {
  /** Timeouts personnalisés par outil */
  customTimeouts?: Record<string, number>;

  /** Callback appelé en cas de timeout */
  onTimeout?: (toolName: string, timeoutMs: number) => void;

  /** Logger les timeouts */
  logTimeouts?: boolean;
}

/**
 * Wrapper les handlers avec des timeouts
 *
 * @example
 * ```typescript
 * const readHandlers = createReadToolHandlers(fs);
 * const wrappedHandlers = wrapHandlersWithTimeout(readHandlers, {
 *   customTimeouts: { read_file: 3000 },
 *   logTimeouts: true,
 * });
 * ```
 *
 * @param handlers - Record de handlers à wrapper
 * @param options - Options de configuration
 * @returns Record de handlers wrappés avec timeout
 */
export function wrapHandlersWithTimeout<T extends Record<string, (input: any) => Promise<ToolExecutionResult>>>(
  handlers: T,
  options: WrapHandlersWithTimeoutOptions = {},
): HandlerRecord {
  const { customTimeouts, onTimeout, logTimeouts = true } = options;
  const wrapped: HandlerRecord = {};

  for (const [name, handler] of Object.entries(handlers)) {
    wrapped[name] = async (input: unknown): Promise<ToolExecutionResult> => {
      const timeoutMs = getToolTimeout(name, customTimeouts);

      try {
        return await withTimeout(handler(input), timeoutMs, name);
      } catch (error) {
        if (error instanceof ToolTimeoutError) {
          if (logTimeouts) {
            logger.warn(`Tool timeout: ${name}`, { timeoutMs, input: JSON.stringify(input).substring(0, 200) });
          }

          if (onTimeout) {
            onTimeout(name, timeoutMs);
          }

          return {
            success: false,
            output: null,
            error: error.message,
          };
        }

        // Propager les autres erreurs
        throw error;
      }
    };
  }

  return wrapped;
}

/**
 * Combine les wrappers de timeout et de tracking
 *
 * @example
 * ```typescript
 * const handlers = createShellToolHandlers(shell);
 * const wrappedHandlers = wrapHandlersWithTimeoutAndTracking(
 *   handlers,
 *   { logTimeouts: true },
 *   { onSuccess: (name, input) => trackCommand(name, input) }
 * );
 * ```
 *
 * @param handlers - Record de handlers à wrapper
 * @param timeoutOptions - Options de timeout
 * @param trackingOptions - Options de tracking
 * @returns Record de handlers wrappés
 */
export function wrapHandlersWithTimeoutAndTracking<
  T extends Record<string, (input: any) => Promise<ToolExecutionResult>>,
>(
  handlers: T,
  timeoutOptions: WrapHandlersWithTimeoutOptions = {},
  trackingOptions: WrapHandlersOptions = {},
): HandlerRecord {
  // Appliquer d'abord le timeout, puis le tracking
  const withTimeouts = wrapHandlersWithTimeout(handlers, timeoutOptions);
  return wrapHandlersWithTracking(withTimeouts as T, trackingOptions);
}
