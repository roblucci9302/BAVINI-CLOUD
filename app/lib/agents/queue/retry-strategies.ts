/**
 * Retry Strategies - Stratégies de retry intelligentes
 *
 * Fournit différentes stratégies de retry pour gérer les erreurs
 * de manière adaptative selon le type d'erreur et le contexte.
 *
 * @module agents/queue/retry-strategies
 */

import type { AgentError } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RetryStrategy');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Contexte d'une tentative de retry
 */
export interface RetryContext {
  /** Numéro de la tentative actuelle (commence à 0) */
  attempt: number;

  /** Erreur ayant causé le retry */
  error: AgentError;

  /** Timestamp de la première erreur */
  firstErrorAt: Date;

  /** Timestamp de la dernière erreur */
  lastErrorAt: Date;

  /** ID de la tâche concernée */
  taskId: string;

  /** Type d'agent */
  agentType?: string;

  /** Données supplémentaires */
  metadata?: Record<string, unknown>;
}

/**
 * Résultat d'une décision de retry
 */
export interface RetryDecision {
  /** Faut-il réessayer ? */
  shouldRetry: boolean;

  /** Délai avant le prochain essai (ms) */
  delayMs: number;

  /** Raison de la décision */
  reason: string;

  /** Suggestions pour corriger l'erreur */
  suggestions?: string[];
}

/**
 * Interface pour une stratégie de retry
 */
export interface RetryStrategy {
  /** Nom de la stratégie */
  readonly name: string;

  /**
   * Évaluer si on doit réessayer
   */
  evaluate(context: RetryContext): RetryDecision;

  /**
   * Obtenir le nombre maximum de tentatives
   */
  getMaxAttempts(): number;

  /**
   * Réinitialiser l'état interne (si applicable)
   */
  reset?(): void;
}

/**
 * Configuration de base pour les stratégies
 */
export interface BaseRetryConfig {
  /** Nombre maximum de tentatives */
  maxAttempts: number;

  /** Délai de base (ms) */
  baseDelayMs: number;

  /** Délai maximum (ms) */
  maxDelayMs: number;
}

/*
 * ============================================================================
 * EXPONENTIAL BACKOFF STRATEGY
 * ============================================================================
 */

/**
 * Configuration pour ExponentialBackoffStrategy
 */
export interface ExponentialBackoffConfig extends BaseRetryConfig {
  /** Multiplicateur exponentiel (défaut: 2) */
  multiplier?: number;

  /** Jitter (0-1, défaut: 0.3) */
  jitter?: number;
}

/**
 * Stratégie de retry avec backoff exponentiel
 *
 * Le délai augmente exponentiellement à chaque tentative,
 * avec un jitter aléatoire pour éviter les thundering herds.
 */
export class ExponentialBackoffStrategy implements RetryStrategy {
  readonly name = 'exponential-backoff';
  private config: Required<ExponentialBackoffConfig>;

  constructor(config?: Partial<ExponentialBackoffConfig>) {
    this.config = {
      maxAttempts: config?.maxAttempts ?? 5,
      baseDelayMs: config?.baseDelayMs ?? 1000,
      maxDelayMs: config?.maxDelayMs ?? 60000,
      multiplier: config?.multiplier ?? 2,
      jitter: config?.jitter ?? 0.3,
    };
  }

  evaluate(context: RetryContext): RetryDecision {
    const { attempt, error } = context;

    // Vérifier si on a dépassé le max
    if (attempt >= this.config.maxAttempts) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: `Max attempts (${this.config.maxAttempts}) reached`,
      };
    }

    // Vérifier si l'erreur est récupérable
    if (!error.recoverable) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: 'Error is not recoverable',
        suggestions: error.suggestion ? [error.suggestion] : undefined,
      };
    }

    // Calculer le délai avec backoff exponentiel
    const exponentialDelay = this.config.baseDelayMs * Math.pow(this.config.multiplier, attempt);

    // Ajouter le jitter
    const jitterAmount = exponentialDelay * this.config.jitter * Math.random();
    const delay = Math.min(exponentialDelay + jitterAmount, this.config.maxDelayMs);

    return {
      shouldRetry: true,
      delayMs: Math.round(delay),
      reason: `Retry ${attempt + 1}/${this.config.maxAttempts} with exponential backoff`,
    };
  }

  getMaxAttempts(): number {
    return this.config.maxAttempts;
  }
}

/*
 * ============================================================================
 * LINEAR BACKOFF STRATEGY
 * ============================================================================
 */

/**
 * Configuration pour LinearBackoffStrategy
 */
export interface LinearBackoffConfig extends BaseRetryConfig {
  /** Incrément linéaire (ms) */
  incrementMs?: number;
}

/**
 * Stratégie de retry avec backoff linéaire
 *
 * Le délai augmente linéairement à chaque tentative.
 */
export class LinearBackoffStrategy implements RetryStrategy {
  readonly name = 'linear-backoff';
  private config: Required<LinearBackoffConfig>;

  constructor(config?: Partial<LinearBackoffConfig>) {
    this.config = {
      maxAttempts: config?.maxAttempts ?? 5,
      baseDelayMs: config?.baseDelayMs ?? 1000,
      maxDelayMs: config?.maxDelayMs ?? 30000,
      incrementMs: config?.incrementMs ?? 1000,
    };
  }

  evaluate(context: RetryContext): RetryDecision {
    const { attempt, error } = context;

    if (attempt >= this.config.maxAttempts) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: `Max attempts (${this.config.maxAttempts}) reached`,
      };
    }

    if (!error.recoverable) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: 'Error is not recoverable',
      };
    }

    const delay = Math.min(this.config.baseDelayMs + attempt * this.config.incrementMs, this.config.maxDelayMs);

    return {
      shouldRetry: true,
      delayMs: delay,
      reason: `Retry ${attempt + 1}/${this.config.maxAttempts} with linear backoff`,
    };
  }

  getMaxAttempts(): number {
    return this.config.maxAttempts;
  }
}

/*
 * ============================================================================
 * FIXED DELAY STRATEGY
 * ============================================================================
 */

/**
 * Configuration pour FixedDelayStrategy
 */
export interface FixedDelayConfig {
  /** Nombre maximum de tentatives */
  maxAttempts: number;

  /** Délai fixe entre les tentatives (ms) */
  delayMs: number;
}

/**
 * Stratégie de retry avec délai fixe
 *
 * Toutes les tentatives utilisent le même délai.
 */
export class FixedDelayStrategy implements RetryStrategy {
  readonly name = 'fixed-delay';
  private config: FixedDelayConfig;

  constructor(config?: Partial<FixedDelayConfig>) {
    this.config = {
      maxAttempts: config?.maxAttempts ?? 3,
      delayMs: config?.delayMs ?? 1000,
    };
  }

  evaluate(context: RetryContext): RetryDecision {
    const { attempt, error } = context;

    if (attempt >= this.config.maxAttempts) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: `Max attempts (${this.config.maxAttempts}) reached`,
      };
    }

    if (!error.recoverable) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: 'Error is not recoverable',
      };
    }

    return {
      shouldRetry: true,
      delayMs: this.config.delayMs,
      reason: `Retry ${attempt + 1}/${this.config.maxAttempts} with fixed delay`,
    };
  }

  getMaxAttempts(): number {
    return this.config.maxAttempts;
  }
}

/*
 * ============================================================================
 * IMMEDIATE RETRY STRATEGY
 * ============================================================================
 */

/**
 * Stratégie de retry immédiat (sans délai)
 *
 * Utile pour les erreurs transitoires comme les timeouts réseau.
 */
export class ImmediateRetryStrategy implements RetryStrategy {
  readonly name = 'immediate';
  private maxAttempts: number;

  constructor(maxAttempts = 2) {
    this.maxAttempts = maxAttempts;
  }

  evaluate(context: RetryContext): RetryDecision {
    const { attempt, error } = context;

    if (attempt >= this.maxAttempts) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: `Max attempts (${this.maxAttempts}) reached`,
      };
    }

    if (!error.recoverable) {
      return {
        shouldRetry: false,
        delayMs: 0,
        reason: 'Error is not recoverable',
      };
    }

    return {
      shouldRetry: true,
      delayMs: 0,
      reason: `Immediate retry ${attempt + 1}/${this.maxAttempts}`,
    };
  }

  getMaxAttempts(): number {
    return this.maxAttempts;
  }
}

/*
 * ============================================================================
 * ERROR-AWARE STRATEGY
 * ============================================================================
 */

/**
 * Configuration par type d'erreur
 */
export interface ErrorTypeConfig {
  /** Codes d'erreur concernés */
  errorCodes: string[];

  /** Stratégie à utiliser */
  strategy: RetryStrategy;
}

/**
 * Stratégie de retry basée sur le type d'erreur
 *
 * Utilise différentes stratégies selon le code d'erreur.
 */
export class ErrorAwareStrategy implements RetryStrategy {
  readonly name = 'error-aware';
  private errorConfigs: ErrorTypeConfig[];
  private defaultStrategy: RetryStrategy;

  constructor(errorConfigs: ErrorTypeConfig[], defaultStrategy?: RetryStrategy) {
    this.errorConfigs = errorConfigs;
    this.defaultStrategy = defaultStrategy ?? new ExponentialBackoffStrategy();
  }

  evaluate(context: RetryContext): RetryDecision {
    const { error } = context;

    // Trouver la stratégie correspondant au code d'erreur
    for (const config of this.errorConfigs) {
      if (config.errorCodes.includes(error.code)) {
        logger.debug(`Using strategy for error code: ${error.code}`, {
          strategy: config.strategy.name,
        });
        return config.strategy.evaluate(context);
      }
    }

    // Utiliser la stratégie par défaut
    return this.defaultStrategy.evaluate(context);
  }

  getMaxAttempts(): number {
    // Retourner le max de toutes les stratégies
    const maxes = [this.defaultStrategy.getMaxAttempts(), ...this.errorConfigs.map((c) => c.strategy.getMaxAttempts())];
    return Math.max(...maxes);
  }
}

/*
 * ============================================================================
 * COMPOSITE STRATEGY
 * ============================================================================
 */

/**
 * Stratégie composite qui combine plusieurs stratégies
 *
 * Évalue chaque stratégie dans l'ordre et retourne la première
 * décision de ne pas réessayer, ou la dernière décision si toutes
 * approuvent le retry.
 */
export class CompositeRetryStrategy implements RetryStrategy {
  readonly name = 'composite';
  private strategies: RetryStrategy[];

  constructor(strategies: RetryStrategy[]) {
    if (strategies.length === 0) {
      throw new Error('CompositeRetryStrategy requires at least one strategy');
    }
    this.strategies = strategies;
  }

  evaluate(context: RetryContext): RetryDecision {
    let lastDecision: RetryDecision | null = null;

    for (const strategy of this.strategies) {
      const decision = strategy.evaluate(context);

      if (!decision.shouldRetry) {
        // Si une stratégie dit non, on arrête
        return decision;
      }

      lastDecision = decision;
    }

    // Toutes les stratégies ont dit oui, utiliser la dernière décision
    // avec le délai maximum pour être conservateur
    const maxDelay = Math.max(...this.strategies.map((s) => s.evaluate(context).delayMs).filter((d) => d > 0));

    return {
      ...lastDecision!,
      delayMs: maxDelay,
      reason: `Composite: all ${this.strategies.length} strategies approved`,
    };
  }

  getMaxAttempts(): number {
    return Math.min(...this.strategies.map((s) => s.getMaxAttempts()));
  }
}

/*
 * ============================================================================
 * FACTORY & HELPERS
 * ============================================================================
 */

/**
 * Créer une stratégie de retry par défaut
 * (Exponential backoff avec configuration sensible)
 */
export function createDefaultRetryStrategy(): RetryStrategy {
  return new ExponentialBackoffStrategy({
    maxAttempts: 5,
    baseDelayMs: 1000,
    maxDelayMs: 60000,
    multiplier: 2,
    jitter: 0.3,
  });
}

/**
 * Créer une stratégie pour les rate limits
 */
export function createRateLimitRetryStrategy(): RetryStrategy {
  return new ExponentialBackoffStrategy({
    maxAttempts: 5,
    baseDelayMs: 5000,
    maxDelayMs: 120000,
    multiplier: 2,
    jitter: 0.2,
  });
}

/**
 * Créer une stratégie pour les erreurs réseau transitoires
 */
export function createNetworkRetryStrategy(): RetryStrategy {
  return new LinearBackoffStrategy({
    maxAttempts: 3,
    baseDelayMs: 500,
    maxDelayMs: 5000,
    incrementMs: 1000,
  });
}

/**
 * Créer une stratégie optimisée pour les agents BAVINI
 */
export function createAgentRetryStrategy(): RetryStrategy {
  return new ErrorAwareStrategy(
    [
      // Rate limits - backoff long
      {
        errorCodes: ['RATE_LIMIT', 'RATE_LIMITED', 'TOO_MANY_REQUESTS'],
        strategy: createRateLimitRetryStrategy(),
      },

      // Erreurs réseau - retry rapide
      {
        errorCodes: ['NETWORK_ERROR', 'TIMEOUT', 'CONNECTION_RESET', 'ECONNREFUSED'],
        strategy: createNetworkRetryStrategy(),
      },

      // Erreurs API temporaires - backoff modéré
      {
        errorCodes: ['OVERLOADED', 'SERVICE_UNAVAILABLE', 'INTERNAL_ERROR'],
        strategy: new ExponentialBackoffStrategy({
          maxAttempts: 3,
          baseDelayMs: 2000,
          maxDelayMs: 30000,
        }),
      },
    ],

    // Défaut pour les autres erreurs
    new ExponentialBackoffStrategy({
      maxAttempts: 3,
      baseDelayMs: 1000,
      maxDelayMs: 30000,
    }),
  );
}

/**
 * Exécuter une fonction avec retry
 */
export async function executeWithRetry<T>(
  fn: () => Promise<T>,
  strategy: RetryStrategy,
  taskId: string,
  createError: (error: unknown) => AgentError,
): Promise<T> {
  let attempt = 0;
  const firstErrorAt = new Date();
  let lastError: AgentError | null = null;

  while (attempt < strategy.getMaxAttempts()) {
    try {
      return await fn();
    } catch (error) {
      lastError = createError(error);

      const context: RetryContext = {
        attempt,
        error: lastError,
        firstErrorAt,
        lastErrorAt: new Date(),
        taskId,
      };

      const decision = strategy.evaluate(context);

      logger.debug(`Retry decision for ${taskId}`, {
        attempt,
        shouldRetry: decision.shouldRetry,
        delayMs: decision.delayMs,
        reason: decision.reason,
      });

      if (!decision.shouldRetry) {
        throw lastError;
      }

      if (decision.delayMs > 0) {
        await new Promise((resolve) => setTimeout(resolve, decision.delayMs));
      }

      attempt++;
    }
  }

  throw lastError ?? new Error('Max retries exceeded');
}
