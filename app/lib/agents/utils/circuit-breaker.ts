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
      return {
        success: false,
        error: `Agent ${agent} is temporarily unavailable (circuit OPEN)`,
        circuitState: this.getState(agent),
        wasBlocked: true,
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
