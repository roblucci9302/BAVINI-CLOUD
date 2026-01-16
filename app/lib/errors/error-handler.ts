/**
 * Gestionnaire d'erreurs centralisé - BAVINI
 * Utilitaires pour la gestion standardisée des erreurs dans les routes et services
 */

import { AppError, toAppError, isAppError, type SerializedError, type ErrorContext } from './index';
import type { createScopedLogger } from '~/utils/logger';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Format de réponse d'erreur standardisé
 */
export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    statusCode: number;
    recoverable: boolean;
    context?: Partial<ErrorContext>;
    timestamp: string;
  };
}

/**
 * Options pour le gestionnaire d'erreurs
 */
export interface ErrorHandlerOptions {
  /** Inclure le contexte dans la réponse */
  includeContext?: boolean;

  /** Inclure la stack trace (dev only) */
  includeStack?: boolean;

  /** Message par défaut si l'erreur n'en a pas */
  defaultMessage?: string;

  /** Code HTTP par défaut */
  defaultStatusCode?: number;
}

/**
 * Type pour le logger scopé
 */
type ScopedLogger = ReturnType<typeof createScopedLogger>;

/*
 * ============================================================================
 * CRÉATION DE RÉPONSES
 * ============================================================================
 */

/**
 * Créer une réponse d'erreur standardisée
 */
export function createErrorResponse(error: unknown, options: ErrorHandlerOptions = {}): [Response, ErrorResponse] {
  const {
    includeContext = process.env.NODE_ENV === 'development',
    defaultMessage = 'Erreur inattendue',
    defaultStatusCode = 500,
  } = options;

  const appError = toAppError(error, defaultMessage);

  const errorResponse: ErrorResponse = {
    error: {
      code: appError.code,
      message: appError.message,
      statusCode: appError.statusCode || defaultStatusCode,
      recoverable: appError.recoverable,
      timestamp: appError.context.timestamp,
      ...(includeContext && { context: appError.context }),
    },
  };

  const response = new Response(JSON.stringify(errorResponse), {
    status: appError.statusCode || defaultStatusCode,
    headers: {
      'Content-Type': 'application/json',
    },
  });

  return [response, errorResponse];
}

/**
 * Créer une réponse d'erreur pour le streaming
 */
export function createStreamErrorChunk(error: unknown): string {
  const appError = toAppError(error);

  return JSON.stringify({
    type: 'error',
    error: {
      code: appError.code,
      message: appError.message,
      recoverable: appError.recoverable,
    },
  });
}

/*
 * ============================================================================
 * GESTIONNAIRE POUR ROUTES
 * ============================================================================
 */

/**
 * Gestionnaire d'erreurs pour les routes API
 * Utilisation: const [response] = handleRouteError(error, 'MonHandler', logger);
 */
export function handleRouteError(
  error: unknown,
  handlerName: string,
  logger?: ScopedLogger,
  options: ErrorHandlerOptions = {},
): [Response, ErrorResponse] {
  const appError = toAppError(error);

  // Logging structuré
  const logData = {
    handler: handlerName,
    code: appError.code,
    statusCode: appError.statusCode,
    recoverable: appError.recoverable,
    context: appError.context,
  };

  if (appError.statusCode >= 500) {
    logger?.error(`Erreur ${handlerName}:`, appError.message, logData);
  } else if (appError.statusCode >= 400) {
    logger?.warn(`Avertissement ${handlerName}:`, appError.message, logData);
  } else {
    logger?.info(`Info ${handlerName}:`, appError.message, logData);
  }

  return createErrorResponse(appError, {
    ...options,
    includeContext: options.includeContext ?? process.env.NODE_ENV === 'development',
  });
}

/**
 * Wrapper try-catch pour les actions de route
 */
export async function withErrorHandling<T>(
  fn: () => Promise<T>,
  handlerName: string,
  logger?: ScopedLogger,
  options: ErrorHandlerOptions = {},
): Promise<T | Response> {
  try {
    return await fn();
  } catch (error) {
    const [response] = handleRouteError(error, handlerName, logger, options);
    return response;
  }
}

/*
 * ============================================================================
 * GESTIONNAIRE POUR STREAMING
 * ============================================================================
 */

/**
 * Gestionnaire d'erreurs pour les réponses streaming
 */
export function handleStreamError(
  error: unknown,
  handlerName: string,
  logger?: ScopedLogger,
): { chunk: string; shouldClose: boolean } {
  const appError = toAppError(error);

  logger?.error(`Erreur streaming ${handlerName}:`, appError.message, {
    code: appError.code,
    recoverable: appError.recoverable,
  });

  return {
    chunk: createStreamErrorChunk(appError),
    shouldClose: !appError.recoverable,
  };
}

/*
 * ============================================================================
 * UTILITAIRES DE VALIDATION
 * ============================================================================
 */

/**
 * Valider les champs requis et lancer une erreur si manquants
 */
export function validateRequiredFields<T extends Record<string, unknown>>(data: T, requiredFields: (keyof T)[]): void {
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      throw new AppError('REQUIRED_FIELD', `Le champ '${String(field)}' est requis`, 400, false, {
        field: String(field),
      });
    }
  }
}

/**
 * Valider le format d'un champ
 */
export function validateFieldFormat(value: string, field: string, pattern: RegExp, expectedFormat: string): void {
  if (!pattern.test(value)) {
    throw new AppError('INVALID_FORMAT', `Format invalide pour '${field}'. Attendu: ${expectedFormat}`, 400, false, {
      field,
      expectedFormat,
    });
  }
}

/*
 * ============================================================================
 * RÉCUPÉRATION D'ERREURS
 * ============================================================================
 */

/**
 * Exécuter avec retry automatique
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxRetries?: number;
    baseDelay?: number;
    maxDelay?: number;
    backoffMultiplier?: number;
    shouldRetry?: (error: unknown, attempt: number) => boolean;
  } = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelay = 1000,
    maxDelay = 30000,
    backoffMultiplier = 2,
    shouldRetry = (error) => isAppError(error) && error.recoverable,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt >= maxRetries || !shouldRetry(error, attempt)) {
        throw error;
      }

      // Calculer le délai avec backoff exponentiel
      const delay = Math.min(baseDelay * Math.pow(backoffMultiplier, attempt), maxDelay);

      await new Promise((resolve) => setTimeout(resolve, delay));
    }
  }

  throw lastError;
}

/**
 * Exécuter avec timeout
 */
export async function withTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number,
  operation: string = 'Opération',
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(
        new AppError('TIMEOUT', `Délai d'attente dépassé pour: ${operation} (${timeoutMs}ms)`, 504, true, {
          timeoutMs,
          operation,
        }),
      );
    }, timeoutMs);
  });

  return Promise.race([fn(), timeoutPromise]);
}

/*
 * ============================================================================
 * PARSING SÉCURISÉ
 * ============================================================================
 */

/**
 * Parser JSON avec gestion d'erreur
 */
export function safeParseJSON<T>(json: string, fallback?: T): T | undefined {
  try {
    return JSON.parse(json) as T;
  } catch {
    return fallback;
  }
}

/**
 * Parser le body d'une requête avec validation
 */
export async function parseRequestBody<T>(request: Request, requiredFields?: (keyof T)[]): Promise<T> {
  let body: T;

  try {
    body = (await request.json()) as T;
  } catch {
    throw new AppError('INVALID_JSON', 'Corps de la requête JSON invalide', 400, false);
  }

  if (requiredFields && requiredFields.length > 0) {
    validateRequiredFields(body as Record<string, unknown>, requiredFields as string[]);
  }

  return body;
}

/*
 * ============================================================================
 * AGRÉGATION D'ERREURS
 * ============================================================================
 */

/**
 * Agréger plusieurs erreurs en une seule
 */
export function aggregateErrors(errors: unknown[], message: string = 'Erreurs multiples'): AppError {
  const appErrors = errors.map((e) => toAppError(e));

  // Déterminer le code de statut le plus élevé
  const maxStatusCode = Math.max(...appErrors.map((e) => e.statusCode));

  // Vérifier si au moins une erreur est récupérable
  const anyRecoverable = appErrors.some((e) => e.recoverable);

  return new AppError('MULTIPLE_ERRORS', message, maxStatusCode, anyRecoverable, {
    errors: appErrors.map((e) => e.toJSON()),
    count: errors.length,
  });
}

/*
 * ============================================================================
 * EXPORT PAR DÉFAUT
 * ============================================================================
 */

export default {
  createErrorResponse,
  createStreamErrorChunk,
  handleRouteError,
  handleStreamError,
  withErrorHandling,
  withRetry,
  withTimeout,
  validateRequiredFields,
  validateFieldFormat,
  safeParseJSON,
  parseRequestBody,
  aggregateErrors,
};
