/**
 * Utilitaire pour wrapper des handlers avec du tracking/post-processing
 *
 * Ce module fournit une fonction générique pour envelopper des handlers d'outils
 * avec des callbacks de post-traitement, éliminant la duplication de code
 * dans les différents agents.
 */

import type { ToolExecutionResult } from '../types';

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
