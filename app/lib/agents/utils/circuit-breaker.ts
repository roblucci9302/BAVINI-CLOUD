/**
 * @fileoverview Circuit Breaker pour les agents BAVINI
 *
 * Implémente le pattern Circuit Breaker pour protéger contre les agents défaillants:
 * - CLOSED: L'agent fonctionne normalement
 * - OPEN: L'agent est bloqué après trop d'échecs
 * - HALF_OPEN: L'agent est testé pour voir s'il a récupéré
 *
 * @module agents/utils/circuit-breaker
 */

import { createScopedLogger } from '~/utils/logger';
import type { AgentType } from '../types';

const logger = createScopedLogger('CircuitBreaker');

/**
 * États possibles du circuit breaker
 */
export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

/**
 * Configuration du fallback
 */
export interface FallbackConfig {
  /** Activer le système de fallback */
  enabled: boolean;

  /** Fonction de fallback personnalisée */
  fallbackFn?: (agent: AgentType, error: Error) => Promise<unknown>;

  /** Mapping agent -> agent de fallback */
  fallbackAgents?: Partial<Record<AgentType, AgentType>>;
}

/**
 * Configuration du mode dégradé
 */
export interface DegradedModeConfig {
  /** Activer le mode dégradé quand le circuit est OPEN */
  enabled: boolean;

  /** Nombre max de requêtes concurrentes en mode dégradé (défaut: 1) */
  maxConcurrentRequests: number;

  /** Timeout réduit en mode dégradé en ms (défaut: 15000) */
  timeout: number;

  /** Nombre max de retries en mode dégradé (défaut: 0) */
  maxRetries: number;
}

/**
 * Configuration du circuit breaker
 */
export interface CircuitBreakerConfig {
  /** Nombre d'échecs avant d'ouvrir le circuit (défaut: 5) */
  failureThreshold: number;

  /** Nombre de succès en HALF_OPEN pour fermer le circuit (défaut: 2) */
  successThreshold: number;

  /** Temps avant de passer de OPEN à HALF_OPEN en ms (défaut: 30000) */
  resetTimeout: number;

  /** Fenêtre de temps pour compter les échecs en ms (défaut: 60000) */
  failureWindow: number;

  /** Configuration du fallback (optionnel) */
  fallback?: FallbackConfig;

  /** Configuration du mode dégradé (optionnel) */
  degradedMode?: DegradedModeConfig;
}

/**
 * État interne d'un circuit pour un agent
 */
interface CircuitInfo {
  state: CircuitState;
  failures: number[];
  consecutiveSuccesses: number;
  lastFailure: number | null;
  lastStateChange: number;
  openedAt: number | null;

  /** Compteur de requêtes bloquées */
  blockedRequestCount: number;

  /** Compteur d'utilisations du fallback */
  fallbackUsageCount: number;

  /** Compteur d'utilisations du mode dégradé */
  degradedModeUsageCount: number;

  /** Nombre de requêtes actuellement en mode dégradé */
  currentDegradedRequests: number;
}

/**
 * Statistiques du circuit breaker
 */
export interface CircuitBreakerStats {
  agent: AgentType;
  state: CircuitState;
  failureCount: number;
  consecutiveSuccesses: number;
  lastFailure: Date | null;
  lastStateChange: Date;
  isAllowed: boolean;

  /** Nombre de requêtes bloquées depuis le début */
  blockedRequestCount: number;

  /** Nombre d'utilisations du fallback */
  fallbackUsageCount: number;

  /** Nombre d'utilisations du mode dégradé */
  degradedModeUsageCount: number;

  /** Temps estimé avant récupération en ms (null si circuit fermé) */
  estimatedRecoveryTime: number | null;

  /** Agent de fallback suggéré (si configuré) */
  suggestedFallbackAgent: AgentType | null;
}

/**
 * Résultat d'un appel à travers le circuit breaker
 */
export interface CircuitBreakerResult<T> {
  success: boolean;
  result?: T;
  error?: string;
  circuitState: CircuitState;
  wasBlocked: boolean;

  /** Indique si le fallback a été utilisé */
  usedFallback?: boolean;

  /** Agent de fallback utilisé (si applicable) */
  fallbackAgent?: AgentType;

  /** Indique si le mode dégradé a été utilisé */
  usedDegradedMode?: boolean;

  /** Temps estimé avant récupération en ms */
  estimatedRecoveryTime?: number;

  /** Recommandation pour l'utilisateur */
  recommendation?: string;
}

/**
 * Circuit Breaker pour protéger contre les agents défaillants
 *
 * Le Circuit Breaker suit le pattern classique avec 3 états:
 * - CLOSED: L'agent fonctionne, les requêtes passent normalement
 * - OPEN: L'agent a trop échoué, les requêtes sont bloquées
 * - HALF_OPEN: Période de test, quelques requêtes passent pour tester la récupération
 *
 * @example
 * ```typescript
 * const breaker = new CircuitBreaker();
 *
 * // Vérifier si l'agent est disponible
 * if (breaker.isAllowed('coder')) {
 *   try {
 *     const result = await agent.run(task, apiKey);
 *     breaker.recordSuccess('coder');
 *     return result;
 *   } catch (error) {
 *     breaker.recordFailure('coder');
 *     throw error;
 *   }
 * } else {
 *   return { success: false, output: 'Agent temporarily unavailable' };
 * }
 * ```
 */
export class CircuitBreaker {
  private circuits: Map<AgentType, CircuitInfo> = new Map();
  private config: CircuitBreakerConfig;

  constructor(config: Partial<CircuitBreakerConfig> = {}) {
    this.config = {
      failureThreshold: 5,
      successThreshold: 2,
      resetTimeout: 30000, // 30 seconds
      failureWindow: 60000, // 1 minute
      ...config,
    };
  }

  /**
   * Vérifie si un appel à l'agent est autorisé
   */
  isAllowed(agent: AgentType): boolean {
    const circuit = this.getOrCreateCircuit(agent);

    // Nettoyer les anciennes échecs hors de la fenêtre
    this.cleanOldFailures(agent);

    switch (circuit.state) {
      case 'CLOSED':
        return true;

      case 'OPEN':
        // Vérifier si le timeout est passé pour passer en HALF_OPEN
        if (circuit.openedAt && Date.now() - circuit.openedAt >= this.config.resetTimeout) {
          this.transitionState(agent, 'HALF_OPEN');
          return true;
        }
        return false;

      case 'HALF_OPEN':
        // En HALF_OPEN, on permet une requête de test
        return true;

      default:
        return true;
    }
  }

  /**
   * Enregistre un succès pour un agent
   */
  recordSuccess(agent: AgentType): void {
    const circuit = this.getOrCreateCircuit(agent);

    switch (circuit.state) {
      case 'CLOSED':
        // Rien à faire, tout va bien
        break;

      case 'HALF_OPEN':
        circuit.consecutiveSuccesses++;
        logger.debug(
          `Agent ${agent} success in HALF_OPEN (${circuit.consecutiveSuccesses}/${this.config.successThreshold})`,
        );

        // Si assez de succès, fermer le circuit
        if (circuit.consecutiveSuccesses >= this.config.successThreshold) {
          this.transitionState(agent, 'CLOSED');
          logger.info(`Circuit CLOSED for agent ${agent} after recovery`);
        }
        break;

      case 'OPEN':
        // Ne devrait pas arriver si isAllowed() est utilisé correctement
        break;
    }
  }

  /**
   * Enregistre un échec pour un agent
   */
  recordFailure(agent: AgentType, error?: string): void {
    const circuit = this.getOrCreateCircuit(agent);
    const now = Date.now();

    circuit.failures.push(now);
    circuit.lastFailure = now;

    logger.warn(`Agent ${agent} failure recorded`, {
      state: circuit.state,
      failureCount: circuit.failures.length,
      error,
    });

    switch (circuit.state) {
      case 'CLOSED':
        // Nettoyer les anciennes échecs
        this.cleanOldFailures(agent);

        // Vérifier si on dépasse le seuil
        if (circuit.failures.length >= this.config.failureThreshold) {
          this.transitionState(agent, 'OPEN');
          circuit.openedAt = now;
          logger.warn(`Circuit OPEN for agent ${agent} after ${circuit.failures.length} failures`);
        }
        break;

      case 'HALF_OPEN':
        // Un échec en HALF_OPEN rouvre immédiatement le circuit
        this.transitionState(agent, 'OPEN');
        circuit.openedAt = now;
        logger.warn(`Circuit re-OPENED for agent ${agent} after failure in HALF_OPEN`);
        break;

      case 'OPEN':
        // Déjà ouvert, mettre à jour le timestamp
        circuit.openedAt = now;
        break;
    }
  }

  /**
   * Obtient l'état actuel du circuit pour un agent
   */
  getState(agent: AgentType): CircuitState {
    const circuit = this.circuits.get(agent);
    return circuit?.state || 'CLOSED';
  }

  /**
   * Obtient les statistiques du circuit pour un agent
   */
  getStats(agent: AgentType): CircuitBreakerStats {
    const circuit = this.getOrCreateCircuit(agent);
    this.cleanOldFailures(agent);

    return {
      agent,
      state: circuit.state,
      failureCount: circuit.failures.length,
      consecutiveSuccesses: circuit.consecutiveSuccesses,
      lastFailure: circuit.lastFailure ? new Date(circuit.lastFailure) : null,
      lastStateChange: new Date(circuit.lastStateChange),
      isAllowed: this.isAllowed(agent),
      blockedRequestCount: circuit.blockedRequestCount,
      fallbackUsageCount: circuit.fallbackUsageCount,
      degradedModeUsageCount: circuit.degradedModeUsageCount,
      estimatedRecoveryTime: this.estimateRecoveryTime(agent),
      suggestedFallbackAgent: this.suggestFallback(agent),
    };
  }

  /**
   * Obtient les statistiques de tous les circuits
   */
  getAllStats(): CircuitBreakerStats[] {
    return Array.from(this.circuits.keys()).map((agent) => this.getStats(agent));
  }

  /**
   * Réinitialise le circuit pour un agent
   */
  reset(agent: AgentType): void {
    this.circuits.delete(agent);
    logger.info(`Circuit reset for agent ${agent}`);
  }

  /**
   * Réinitialise tous les circuits
   */
  resetAll(): void {
    this.circuits.clear();
    logger.info('All circuits reset');
  }

  /**
   * Force l'ouverture du circuit pour un agent (utile pour maintenance)
   */
  forceOpen(agent: AgentType): void {
    this.transitionState(agent, 'OPEN');
    const circuit = this.getOrCreateCircuit(agent);
    circuit.openedAt = Date.now();
    logger.warn(`Circuit force-OPENED for agent ${agent}`);
  }

  /**
   * Force la fermeture du circuit pour un agent
   */
  forceClose(agent: AgentType): void {
    this.transitionState(agent, 'CLOSED');
    const circuit = this.getOrCreateCircuit(agent);
    circuit.failures = [];
    circuit.consecutiveSuccesses = 0;
    logger.info(`Circuit force-CLOSED for agent ${agent}`);
  }

  /**
   * Exécute une fonction avec la protection du circuit breaker
   */
  async execute<T>(agent: AgentType, fn: () => Promise<T>): Promise<CircuitBreakerResult<T>> {
    if (!this.isAllowed(agent)) {
      const circuit = this.getOrCreateCircuit(agent);
      circuit.blockedRequestCount++;

      return {
        success: false,
        error: `Agent ${agent} is temporarily unavailable (circuit OPEN)`,
        circuitState: this.getState(agent),
        wasBlocked: true,
        estimatedRecoveryTime: this.estimateRecoveryTime(agent) ?? undefined,
        recommendation: this.generateRecommendation(agent),
      };
    }

    try {
      const result = await fn();
      this.recordSuccess(agent);
      return {
        success: true,
        result,
        circuitState: this.getState(agent),
        wasBlocked: false,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      this.recordFailure(agent, errorMessage);
      return {
        success: false,
        error: errorMessage,
        circuitState: this.getState(agent),
        wasBlocked: false,
        estimatedRecoveryTime: this.estimateRecoveryTime(agent) ?? undefined,
      };
    }
  }

  /**
   * Obtient ou crée le circuit pour un agent
   */
  private getOrCreateCircuit(agent: AgentType): CircuitInfo {
    let circuit = this.circuits.get(agent);

    if (!circuit) {
      circuit = {
        state: 'CLOSED',
        failures: [],
        consecutiveSuccesses: 0,
        lastFailure: null,
        lastStateChange: Date.now(),
        openedAt: null,
        blockedRequestCount: 0,
        fallbackUsageCount: 0,
        degradedModeUsageCount: 0,
        currentDegradedRequests: 0,
      };
      this.circuits.set(agent, circuit);
    }

    return circuit;
  }

  /**
   * Change l'état du circuit
   */
  private transitionState(agent: AgentType, newState: CircuitState): void {
    const circuit = this.getOrCreateCircuit(agent);
    const oldState = circuit.state;

    circuit.state = newState;
    circuit.lastStateChange = Date.now();

    // Reset des compteurs selon le nouvel état
    if (newState === 'CLOSED') {
      circuit.failures = [];
      circuit.consecutiveSuccesses = 0;
      circuit.openedAt = null;
    } else if (newState === 'HALF_OPEN') {
      circuit.consecutiveSuccesses = 0;
    }

    logger.info(`Circuit state transition for ${agent}: ${oldState} -> ${newState}`);
  }

  /**
   * Nettoie les échecs hors de la fenêtre de temps
   */
  private cleanOldFailures(agent: AgentType): void {
    const circuit = this.circuits.get(agent);

    if (!circuit) {
      return;
    }

    const cutoff = Date.now() - this.config.failureWindow;
    circuit.failures = circuit.failures.filter((timestamp) => timestamp > cutoff);
  }

  /**
   * Estime le temps restant avant la récupération du circuit
   * @returns temps en ms, ou null si le circuit est fermé
   */
  estimateRecoveryTime(agent: AgentType): number | null {
    const circuit = this.circuits.get(agent);

    if (!circuit || circuit.state === 'CLOSED') {
      return null;
    }

    if (circuit.state === 'HALF_OPEN') {
      // En HALF_OPEN, on est proche de la récupération
      return 0;
    }

    // En OPEN, calculer le temps restant avant HALF_OPEN
    if (circuit.openedAt) {
      const elapsed = Date.now() - circuit.openedAt;
      const remaining = this.config.resetTimeout - elapsed;
      return Math.max(0, remaining);
    }

    return this.config.resetTimeout;
  }

  /**
   * Suggère un agent de fallback pour l'agent spécifié
   */
  suggestFallback(agent: AgentType): AgentType | null {
    if (!this.config.fallback?.enabled || !this.config.fallback?.fallbackAgents) {
      return null;
    }

    return this.config.fallback.fallbackAgents[agent] || null;
  }

  /**
   * Exécute une fonction avec fallback automatique si le circuit est ouvert
   *
   * @param agent - L'agent principal à utiliser
   * @param primaryFn - La fonction principale à exécuter
   * @param fallbackFn - Fonction de fallback optionnelle (surcharge la config)
   * @returns Le résultat avec informations sur le fallback utilisé
   *
   * @example
   * ```typescript
   * const result = await breaker.executeWithFallback(
   *   'coder',
   *   async () => await coderAgent.run(task, apiKey),
   *   async () => await exploreAgent.run(task, apiKey) // fallback optionnel
   * );
   *
   * if (result.usedFallback) {
   *   console.log(`Used fallback agent: ${result.fallbackAgent}`);
   * }
   * ```
   */
  async executeWithFallback<T>(
    agent: AgentType,
    primaryFn: () => Promise<T>,
    fallbackFn?: () => Promise<T>,
  ): Promise<CircuitBreakerResult<T>> {
    const circuit = this.getOrCreateCircuit(agent);

    // Si le circuit est fermé ou en half-open, exécuter normalement
    if (this.isAllowed(agent)) {
      try {
        const result = await primaryFn();
        this.recordSuccess(agent);
        return {
          success: true,
          result,
          circuitState: this.getState(agent),
          wasBlocked: false,
          usedFallback: false,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        this.recordFailure(agent, errorMessage);

        // Si l'exécution a échoué et qu'un fallback est disponible, l'utiliser
        if (fallbackFn || this.config.fallback?.fallbackFn) {
          return this.attemptFallback(agent, error as Error, fallbackFn);
        }

        return {
          success: false,
          error: errorMessage,
          circuitState: this.getState(agent),
          wasBlocked: false,
          usedFallback: false,
          estimatedRecoveryTime: this.estimateRecoveryTime(agent) ?? undefined,
        };
      }
    }

    // Circuit ouvert - incrémenter le compteur de blocages
    circuit.blockedRequestCount++;
    logger.debug(`Request blocked for agent ${agent}`, {
      blockedCount: circuit.blockedRequestCount,
    });

    // Essayer le fallback
    if (fallbackFn || this.config.fallback?.enabled) {
      return this.attemptFallback(agent, new Error('Circuit is open'), fallbackFn);
    }

    // Essayer le mode dégradé
    if (this.config.degradedMode?.enabled) {
      return this.executeInDegradedMode(agent, primaryFn);
    }

    // Aucune option disponible
    return {
      success: false,
      error: `Agent ${agent} is temporarily unavailable (circuit OPEN)`,
      circuitState: this.getState(agent),
      wasBlocked: true,
      usedFallback: false,
      usedDegradedMode: false,
      estimatedRecoveryTime: this.estimateRecoveryTime(agent) ?? undefined,
      recommendation: this.generateRecommendation(agent),
    };
  }

  /**
   * Tente d'exécuter le fallback
   */
  private async attemptFallback<T>(
    agent: AgentType,
    originalError: Error,
    customFallbackFn?: () => Promise<T>,
  ): Promise<CircuitBreakerResult<T>> {
    const circuit = this.getOrCreateCircuit(agent);
    const fallbackAgent = this.suggestFallback(agent);

    try {
      let result: T;

      if (customFallbackFn) {
        // Utiliser la fonction de fallback personnalisée
        result = await customFallbackFn();
      } else if (this.config.fallback?.fallbackFn) {
        // Utiliser la fonction de fallback configurée
        result = (await this.config.fallback.fallbackFn(agent, originalError)) as T;
      } else {
        // Pas de fallback disponible
        throw new Error('No fallback function available');
      }

      circuit.fallbackUsageCount++;
      logger.info(`Fallback executed successfully for agent ${agent}`, {
        fallbackAgent,
        fallbackUsageCount: circuit.fallbackUsageCount,
      });

      return {
        success: true,
        result,
        circuitState: this.getState(agent),
        wasBlocked: true,
        usedFallback: true,
        fallbackAgent: fallbackAgent ?? undefined,
        estimatedRecoveryTime: this.estimateRecoveryTime(agent) ?? undefined,
      };
    } catch (fallbackError) {
      const errorMessage = fallbackError instanceof Error ? fallbackError.message : String(fallbackError);
      logger.warn(`Fallback also failed for agent ${agent}`, { error: errorMessage });

      // Essayer le mode dégradé comme dernier recours
      if (this.config.degradedMode?.enabled) {
        // Note: On ne peut pas exécuter primaryFn ici car le circuit est ouvert
        // Le mode dégradé est pour les cas où on veut quand même essayer
        return {
          success: false,
          error: `Both primary and fallback failed: ${originalError.message}; Fallback: ${errorMessage}`,
          circuitState: this.getState(agent),
          wasBlocked: true,
          usedFallback: true,
          estimatedRecoveryTime: this.estimateRecoveryTime(agent) ?? undefined,
          recommendation: this.generateRecommendation(agent),
        };
      }

      return {
        success: false,
        error: `Fallback failed: ${errorMessage}`,
        circuitState: this.getState(agent),
        wasBlocked: true,
        usedFallback: true,
        estimatedRecoveryTime: this.estimateRecoveryTime(agent) ?? undefined,
        recommendation: this.generateRecommendation(agent),
      };
    }
  }

  /**
   * Exécute en mode dégradé avec limitations
   */
  private async executeInDegradedMode<T>(
    agent: AgentType,
    fn: () => Promise<T>,
  ): Promise<CircuitBreakerResult<T>> {
    const circuit = this.getOrCreateCircuit(agent);
    const degradedConfig = this.config.degradedMode!;

    // Vérifier la capacité du mode dégradé
    if (circuit.currentDegradedRequests >= degradedConfig.maxConcurrentRequests) {
      logger.warn(`Degraded mode at capacity for agent ${agent}`, {
        current: circuit.currentDegradedRequests,
        max: degradedConfig.maxConcurrentRequests,
      });

      return {
        success: false,
        error: `Agent ${agent} degraded mode at capacity (${circuit.currentDegradedRequests}/${degradedConfig.maxConcurrentRequests})`,
        circuitState: this.getState(agent),
        wasBlocked: true,
        usedDegradedMode: false,
        estimatedRecoveryTime: this.estimateRecoveryTime(agent) ?? undefined,
        recommendation: `Please wait ${Math.ceil((this.estimateRecoveryTime(agent) ?? 30000) / 1000)}s for recovery`,
      };
    }

    circuit.currentDegradedRequests++;
    circuit.degradedModeUsageCount++;

    logger.info(`Executing in degraded mode for agent ${agent}`, {
      currentRequests: circuit.currentDegradedRequests,
      maxRequests: degradedConfig.maxConcurrentRequests,
      timeout: degradedConfig.timeout,
    });

    try {
      // Exécuter avec timeout réduit
      const result = await this.withTimeout(fn(), degradedConfig.timeout, agent);

      // Succès en mode dégradé - enregistrer comme succès pour aider à fermer le circuit
      this.recordSuccess(agent);

      return {
        success: true,
        result,
        circuitState: this.getState(agent),
        wasBlocked: false,
        usedDegradedMode: true,
        recommendation: 'Executed in degraded mode - response may be limited',
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);

      // Échec en mode dégradé - enregistrer l'échec
      this.recordFailure(agent, `Degraded mode failed: ${errorMessage}`);

      return {
        success: false,
        error: `Degraded mode execution failed: ${errorMessage}`,
        circuitState: this.getState(agent),
        wasBlocked: false,
        usedDegradedMode: true,
        estimatedRecoveryTime: this.estimateRecoveryTime(agent) ?? undefined,
        recommendation: this.generateRecommendation(agent),
      };
    } finally {
      circuit.currentDegradedRequests--;
    }
  }

  /**
   * Exécute une promesse avec timeout
   */
  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number, agent: AgentType): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Degraded mode timeout after ${timeoutMs}ms for agent ${agent}`));
        }, timeoutMs);
      }),
    ]);
  }

  /**
   * Génère une recommandation pour l'utilisateur
   */
  private generateRecommendation(agent: AgentType): string {
    const recoveryTime = this.estimateRecoveryTime(agent);
    const fallbackAgent = this.suggestFallback(agent);

    if (fallbackAgent) {
      return `Consider using agent '${fallbackAgent}' as an alternative`;
    }

    if (recoveryTime !== null && recoveryTime > 0) {
      const seconds = Math.ceil(recoveryTime / 1000);
      return `Agent should recover in approximately ${seconds} seconds`;
    }

    return 'Please retry later or check agent health';
  }
}

/**
 * Factory pour créer un CircuitBreaker avec configuration personnalisée
 */
export function createCircuitBreaker(config?: Partial<CircuitBreakerConfig>): CircuitBreaker {
  return new CircuitBreaker(config);
}

/**
 * Instance globale du circuit breaker (singleton)
 */
let globalCircuitBreaker: CircuitBreaker | null = null;

/**
 * Obtient l'instance globale du circuit breaker
 */
export function getGlobalCircuitBreaker(): CircuitBreaker {
  if (!globalCircuitBreaker) {
    globalCircuitBreaker = new CircuitBreaker();
  }
  return globalCircuitBreaker;
}

/**
 * Réinitialise l'instance globale du circuit breaker (utile pour les tests)
 */
export function resetGlobalCircuitBreaker(): void {
  globalCircuitBreaker = null;
}
