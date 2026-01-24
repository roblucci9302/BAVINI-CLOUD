/**
 * Système d'erreurs centralisé - BAVINI
 * Hiérarchie d'erreurs personnalisées avec support pour la récupération
 */

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Interface pour le contexte d'erreur
 */
export interface ErrorContext {
  /** Identifiant de la requête/tâche */
  requestId?: string;

  /** Identifiant de l'utilisateur */
  userId?: string;

  /** Agent concerné */
  agentType?: string;

  /** Timestamp de l'erreur */
  timestamp: string;

  /** Données supplémentaires */
  [key: string]: unknown;
}

/**
 * Interface pour la sérialisation des erreurs
 */
export interface SerializedError {
  name: string;
  code: string;
  message: string;
  statusCode: number;
  recoverable: boolean;
  context?: ErrorContext;
  stack?: string;
}

/*
 * ============================================================================
 * CLASSE DE BASE
 * ============================================================================
 */

/**
 * Erreur de base de l'application
 * Toutes les erreurs personnalisées héritent de cette classe
 */
export class AppError extends Error {
  readonly code: string;
  readonly statusCode: number;
  readonly recoverable: boolean;
  readonly context: ErrorContext;

  constructor(
    code: string,
    message: string,
    statusCode: number = 500,
    recoverable: boolean = false,
    context?: Partial<ErrorContext>,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = statusCode;
    this.recoverable = recoverable;
    this.context = {
      timestamp: new Date().toISOString(),
      ...context,
    };

    // Maintenir la stack trace correcte
    Error.captureStackTrace?.(this, this.constructor);
  }

  /**
   * Sérialiser l'erreur pour transmission
   */
  toJSON(): SerializedError {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      recoverable: this.recoverable,
      context: this.context,
      stack: process.env.NODE_ENV === 'development' ? this.stack : undefined,
    };
  }

  /**
   * Créer une copie avec contexte additionnel
   */
  withContext(additionalContext: Partial<ErrorContext>): AppError {
    return new AppError(this.code, this.message, this.statusCode, this.recoverable, {
      ...this.context,
      ...additionalContext,
    });
  }
}

/*
 * ============================================================================
 * ERREURS API
 * ============================================================================
 */

/**
 * Erreur API générique
 */
export class APIError extends AppError {
  constructor(message: string, statusCode: number = 500, context?: Partial<ErrorContext>) {
    super('API_ERROR', message, statusCode, false, context);
    this.name = 'APIError';
  }
}

/**
 * Erreur de requête invalide (400)
 */
export class BadRequestError extends AppError {
  constructor(message: string = 'Requête invalide', context?: Partial<ErrorContext>) {
    super('BAD_REQUEST', message, 400, false, context);
    this.name = 'BadRequestError';
  }
}

/**
 * Erreur ressource non trouvée (404)
 */
export class NotFoundError extends AppError {
  constructor(resource: string = 'Ressource', context?: Partial<ErrorContext>) {
    super('NOT_FOUND', `${resource} non trouvé(e)`, 404, false, context);
    this.name = 'NotFoundError';
  }
}

/**
 * Erreur de conflit (409)
 */
export class ConflictError extends AppError {
  constructor(message: string = 'Conflit détecté', context?: Partial<ErrorContext>) {
    super('CONFLICT', message, 409, false, context);
    this.name = 'ConflictError';
  }
}

/**
 * Erreur serveur interne (500)
 */
export class InternalServerError extends AppError {
  constructor(message: string = 'Erreur interne du serveur', context?: Partial<ErrorContext>) {
    super('INTERNAL_ERROR', message, 500, true, context);
    this.name = 'InternalServerError';
  }
}

/*
 * ============================================================================
 * ERREURS AUTHENTIFICATION
 * ============================================================================
 */

/**
 * Erreur d'authentification générique
 */
export class AuthError extends AppError {
  constructor(
    message: string = "Erreur d'authentification",
    recoverable: boolean = false,
    context?: Partial<ErrorContext>,
  ) {
    super('AUTH_ERROR', message, 401, recoverable, context);
    this.name = 'AuthError';
  }
}

/**
 * Token invalide
 */
export class InvalidTokenError extends AppError {
  constructor(context?: Partial<ErrorContext>) {
    super('AUTH_INVALID_TOKEN', 'Token invalide', 401, false, context);
    this.name = 'InvalidTokenError';
  }
}

/**
 * Session expirée
 */
export class SessionExpiredError extends AppError {
  constructor(context?: Partial<ErrorContext>) {
    super('AUTH_EXPIRED', 'Session expirée', 401, true, context);
    this.name = 'SessionExpiredError';
  }
}

/**
 * Erreur du fournisseur OAuth
 */
export class OAuthProviderError extends AppError {
  readonly provider: string;

  constructor(provider: string, message: string, context?: Partial<ErrorContext>) {
    super('AUTH_PROVIDER_ERROR', `Erreur OAuth (${provider}): ${message}`, 502, true, context);
    this.name = 'OAuthProviderError';
    this.provider = provider;
  }
}

/**
 * Accès refusé (403)
 */
export class ForbiddenError extends AppError {
  constructor(message: string = 'Accès refusé', context?: Partial<ErrorContext>) {
    super('FORBIDDEN', message, 403, false, context);
    this.name = 'ForbiddenError';
  }
}

/*
 * ============================================================================
 * ERREURS AGENT
 * ============================================================================
 */

/**
 * Erreur d'agent générique
 */
export class AgentError extends AppError {
  readonly agentType: string;

  constructor(agentType: string, message: string, recoverable: boolean = true, context?: Partial<ErrorContext>) {
    super('AGENT_ERROR', message, 500, recoverable, { ...context, agentType });
    this.name = 'AgentError';
    this.agentType = agentType;
  }
}

/**
 * Échec d'exécution d'agent
 */
export class AgentExecutionError extends AppError {
  readonly agentType: string;

  constructor(agentType: string, message: string, context?: Partial<ErrorContext>) {
    super('AGENT_EXECUTION_FAILED', `Échec d'exécution de l'agent ${agentType}: ${message}`, 500, true, {
      ...context,
      agentType,
    });
    this.name = 'AgentExecutionError';
    this.agentType = agentType;
  }
}

/**
 * Agent non disponible
 */
export class AgentUnavailableError extends AppError {
  readonly agentType: string;

  constructor(agentType: string, context?: Partial<ErrorContext>) {
    super('AGENT_UNAVAILABLE', `Agent ${agentType} non disponible`, 503, true, { ...context, agentType });
    this.name = 'AgentUnavailableError';
    this.agentType = agentType;
  }
}

/**
 * Restriction d'agent (action non autorisée)
 */
export class AgentRestrictionError extends AppError {
  readonly agentType: string;

  constructor(agentType: string, message: string, context?: Partial<ErrorContext>) {
    super('AGENT_RESTRICTION', message, 403, false, { ...context, agentType });
    this.name = 'AgentRestrictionError';
    this.agentType = agentType;
  }
}

/*
 * ============================================================================
 * ERREURS VALIDATION
 * ============================================================================
 */

/**
 * Erreur de validation générique
 */
export class ValidationError extends AppError {
  readonly field?: string;
  readonly value?: unknown;

  constructor(message: string, field?: string, value?: unknown, context?: Partial<ErrorContext>) {
    super('VALIDATION_ERROR', message, 400, false, { ...context, field, value });
    this.name = 'ValidationError';
    this.field = field;
    this.value = value;
  }
}

/**
 * Champ requis manquant
 */
export class RequiredFieldError extends AppError {
  readonly field: string;

  constructor(field: string, context?: Partial<ErrorContext>) {
    super('REQUIRED_FIELD', `Le champ '${field}' est requis`, 400, false, { ...context, field });
    this.name = 'RequiredFieldError';
    this.field = field;
  }
}

/**
 * Format invalide
 */
export class InvalidFormatError extends AppError {
  readonly field: string;
  readonly expectedFormat: string;

  constructor(field: string, expectedFormat: string, context?: Partial<ErrorContext>) {
    super('INVALID_FORMAT', `Format invalide pour '${field}'. Attendu: ${expectedFormat}`, 400, false, {
      ...context,
      field,
      expectedFormat,
    });
    this.name = 'InvalidFormatError';
    this.field = field;
    this.expectedFormat = expectedFormat;
  }
}

/*
 * ============================================================================
 * ERREURS TIMEOUT / RÉSEAU
 * ============================================================================
 */

/**
 * Délai d'attente dépassé
 */
export class TimeoutError extends AppError {
  readonly timeoutMs: number;

  constructor(operation: string, timeoutMs: number, context?: Partial<ErrorContext>) {
    super('TIMEOUT', `Délai d'attente dépassé pour: ${operation} (${timeoutMs}ms)`, 504, true, {
      ...context,
      timeoutMs,
    });
    this.name = 'TimeoutError';
    this.timeoutMs = timeoutMs;
  }
}

/**
 * Erreur réseau
 */
export class NetworkError extends AppError {
  constructor(message: string = 'Erreur de connexion réseau', context?: Partial<ErrorContext>) {
    super('NETWORK_ERROR', message, 503, true, context);
    this.name = 'NetworkError';
  }
}

/**
 * Limite de requêtes atteinte
 */
export class RateLimitError extends AppError {
  readonly retryAfter?: number;

  constructor(retryAfter?: number, context?: Partial<ErrorContext>) {
    const message = retryAfter
      ? `Limite de requêtes atteinte. Réessayez dans ${retryAfter} secondes`
      : 'Limite de requêtes atteinte';
    super('RATE_LIMIT', message, 429, true, { ...context, retryAfter });
    this.name = 'RateLimitError';
    this.retryAfter = retryAfter;
  }
}

/*
 * ============================================================================
 * ERREURS EXÉCUTION
 * ============================================================================
 */

/**
 * Erreur d'exécution de code
 */
export class ExecutionError extends AppError {
  readonly language?: string;

  constructor(message: string, language?: string, context?: Partial<ErrorContext>) {
    super('EXECUTION_ERROR', message, 500, false, { ...context, language });
    this.name = 'ExecutionError';
    this.language = language;
  }
}

/**
 * Erreur d'exécution Python (Pyodide)
 */
export class PythonExecutionError extends AppError {
  readonly pythonError?: string;

  constructor(message: string, pythonError?: string, context?: Partial<ErrorContext>) {
    super('PYTHON_EXECUTION_ERROR', message, 500, false, { ...context, pythonError });
    this.name = 'PythonExecutionError';
    this.pythonError = pythonError;
  }
}

/*
 * ============================================================================
 * UTILITAIRES
 * ============================================================================
 */

/**
 * Vérifier si une erreur est une AppError
 */
export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

/**
 * Convertir une erreur inconnue en AppError
 */
export function toAppError(error: unknown, defaultMessage: string = 'Erreur inattendue'): AppError {
  if (error instanceof AppError) {
    return error;
  }

  if (error instanceof Error) {
    return new AppError('UNKNOWN_ERROR', error.message || defaultMessage, 500, false, {
      originalError: error.name,
      stack: error.stack,
    });
  }

  return new AppError('UNKNOWN_ERROR', String(error) || defaultMessage, 500, false);
}

/**
 * Extraire le message d'une erreur
 */
export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  return 'Erreur inconnue';
}

/**
 * Vérifier si une erreur est récupérable
 */
export function isRecoverableError(error: unknown): boolean {
  if (error instanceof AppError) {
    return error.recoverable;
  }

  return false;
}

// Re-export user-friendly error utilities
export * from './user-messages';
