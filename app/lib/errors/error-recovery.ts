/**
 * Error Recovery - Récupération intelligente des erreurs
 * Analyse les erreurs et propose des stratégies de récupération
 */

import type { Task, TaskResult, AgentError, AgentType } from '../agents/types';
import { AgentRegistry } from '../agents/core/agent-registry';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ErrorRecovery');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Type d'erreur détecté
 */
export type ErrorType =
  | 'network'
  | 'timeout'
  | 'rate_limit'
  | 'validation'
  | 'permission'
  | 'resource_not_found'
  | 'conflict'
  | 'internal'
  | 'unknown';

/**
 * Sévérité de l'erreur
 */
export type ErrorSeverity = 'low' | 'medium' | 'high' | 'critical';

/**
 * Action de récupération
 */
export interface RecoveryAction {
  /** Type d'action */
  type: 'retry' | 'fallback' | 'skip' | 'abort' | 'manual';

  /** Description de l'action */
  description: string;

  /** Agent de fallback (si type === 'fallback') */
  fallbackAgent?: AgentType;

  /** Délai avant retry (si type === 'retry') */
  retryDelay?: number;

  /** Modifications à apporter à la tâche */
  taskModifications?: Partial<Task>;

  /** Probabilité de succès estimée */
  successProbability?: number;
}

/**
 * Résultat de l'analyse d'erreur
 */
export interface ErrorAnalysis {
  /** Type d'erreur détecté */
  errorType: ErrorType;

  /** Sévérité */
  severity: ErrorSeverity;

  /** Message d'erreur original */
  originalMessage: string;

  /** Message simplifié */
  simplifiedMessage: string;

  /** L'erreur est-elle récupérable ? */
  recoverable: boolean;

  /** Actions de récupération possibles */
  recoveryOptions: RecoveryAction[];

  /** Action recommandée */
  recommendedAction: RecoveryAction;

  /** Contexte supplémentaire */
  context?: Record<string, unknown>;
}

/**
 * Configuration du système de récupération
 */
export interface RecoveryConfig {
  /** Nombre maximum de retries */
  maxRetries: number;

  /** Délai de base entre retries (ms) */
  baseRetryDelay: number;

  /** Multiplicateur pour backoff exponentiel */
  backoffMultiplier: number;

  /** Délai maximum entre retries (ms) */
  maxRetryDelay: number;

  /** Activer le fallback automatique */
  enableAutoFallback: boolean;

  /** Agents de fallback par défaut */
  defaultFallbacks: Partial<Record<AgentType, AgentType>>;
}

/*
 * ============================================================================
 * ERROR RECOVERY
 * ============================================================================
 */

/**
 * Système de récupération d'erreurs
 */
export class ErrorRecovery {
  private config: RecoveryConfig;
  private registry: AgentRegistry;
  private retryCount: Map<string, number> = new Map();

  constructor(registry: AgentRegistry, config?: Partial<RecoveryConfig>) {
    this.registry = registry;
    this.config = {
      maxRetries: config?.maxRetries ?? 3,
      baseRetryDelay: config?.baseRetryDelay ?? 1000,
      backoffMultiplier: config?.backoffMultiplier ?? 2,
      maxRetryDelay: config?.maxRetryDelay ?? 30000,
      enableAutoFallback: config?.enableAutoFallback ?? true,
      defaultFallbacks: config?.defaultFallbacks ?? {
        coder: 'explore',
        builder: 'coder',
        tester: 'builder',
        deployer: 'coder',
      },
    };
  }

  /*
   * ==========================================================================
   * PUBLIC API
   * ==========================================================================
   */

  /**
   * Analyser une erreur et proposer des actions de récupération
   */
  analyzeError(error: Error | AgentError | string, task: Task): ErrorAnalysis {
    const errorMessage = this.extractErrorMessage(error);
    const errorType = this.classifyError(errorMessage);
    const severity = this.assessSeverity(errorType, task);
    const recoverable = this.isRecoverable(errorType, severity);
    const recoveryOptions = this.generateRecoveryOptions(errorType, task, severity);
    const recommendedAction = this.selectBestAction(recoveryOptions, task);

    const analysis: ErrorAnalysis = {
      errorType,
      severity,
      originalMessage: errorMessage,
      simplifiedMessage: this.simplifyMessage(errorMessage, errorType),
      recoverable,
      recoveryOptions,
      recommendedAction,
      context: {
        taskId: task.id,
        taskType: task.type,
        retryCount: this.retryCount.get(task.id) ?? 0,
      },
    };

    logger.info(`Error analyzed: ${errorType} (${severity})`, {
      taskId: task.id,
      recoverable,
      recommendedAction: recommendedAction.type,
    });

    return analysis;
  }

  /**
   * Tenter de récupérer d'une erreur
   */
  async handleError(error: Error | AgentError | string, task: Task, apiKey: string): Promise<TaskResult> {
    const analysis = this.analyzeError(error, task);

    if (!analysis.recoverable) {
      return this.createFailureResult(analysis);
    }

    switch (analysis.recommendedAction.type) {
      case 'retry':
        return this.executeRetry(task, apiKey, analysis);

      case 'fallback':
        return this.executeFallback(task, apiKey, analysis);

      case 'skip':
        return this.createSkipResult(analysis);

      case 'abort':
        return this.createFailureResult(analysis);

      case 'manual':
        return this.createManualInterventionResult(analysis);

      default:
        return this.createFailureResult(analysis);
    }
  }

  /**
   * Retry une tâche avec backoff exponentiel
   */
  async retry(task: Task, apiKey: string, maxRetries?: number): Promise<TaskResult> {
    const max = maxRetries ?? this.config.maxRetries;
    const currentRetry = this.retryCount.get(task.id) ?? 0;

    if (currentRetry >= max) {
      logger.warn(`Max retries reached for task ${task.id}`);
      return {
        success: false,
        output: `Task failed after ${max} retries`,
        errors: [
          {
            code: 'MAX_RETRIES_EXCEEDED',
            message: `Maximum retry attempts (${max}) exceeded`,
            recoverable: false,
          },
        ],
      };
    }

    // Incrémenter le compteur
    this.retryCount.set(task.id, currentRetry + 1);

    // Calculer le délai avec backoff
    const delay = this.calculateBackoff(currentRetry);
    logger.info(`Retry ${currentRetry + 1}/${max} for task ${task.id} in ${delay}ms`);

    // Attendre
    await this.sleep(delay);

    // Réexécuter la tâche
    const agent = this.registry.get(task.type as AgentType);

    if (!agent) {
      return {
        success: false,
        output: `Agent ${task.type} not found for retry`,
        errors: [
          {
            code: 'AGENT_NOT_FOUND',
            message: `Cannot retry: agent ${task.type} not available`,
            recoverable: false,
          },
        ],
      };
    }

    try {
      const result = await agent.run(task, apiKey);

      if (result.success) {
        // Réinitialiser le compteur en cas de succès
        this.retryCount.delete(task.id);
      }

      return result;
    } catch (error) {
      // Récursion pour le prochain retry
      return this.retry(task, apiKey, max);
    }
  }

  /**
   * Exécuter un fallback vers un autre agent
   */
  async fallback(task: Task, apiKey: string, fallbackAgentName: AgentType): Promise<TaskResult> {
    logger.info(`Falling back to ${fallbackAgentName} for task ${task.id}`);

    const fallbackAgent = this.registry.get(fallbackAgentName);

    if (!fallbackAgent) {
      return {
        success: false,
        output: `Fallback agent ${fallbackAgentName} not available`,
        errors: [
          {
            code: 'FALLBACK_AGENT_NOT_FOUND',
            message: `Fallback agent ${fallbackAgentName} not found`,
            recoverable: false,
          },
        ],
      };
    }

    if (!fallbackAgent.isAvailable()) {
      return {
        success: false,
        output: `Fallback agent ${fallbackAgentName} is busy`,
        errors: [
          {
            code: 'FALLBACK_AGENT_BUSY',
            message: `Fallback agent ${fallbackAgentName} is not available`,
            recoverable: true,
          },
        ],
      };
    }

    // Modifier la tâche pour le fallback
    const fallbackTask: Task = {
      ...task,
      type: fallbackAgentName,
      assignedAgent: fallbackAgentName,
      context: {
        ...task.context,
        additionalInfo: {
          ...task.context?.additionalInfo,
          fallbackFrom: task.type,
          originalTaskId: task.id,
        },
      },
    };

    return fallbackAgent.run(fallbackTask, apiKey);
  }

  /**
   * Réinitialiser le compteur de retry pour une tâche
   */
  resetRetryCount(taskId: string): void {
    this.retryCount.delete(taskId);
  }

  /**
   * Réinitialiser tous les compteurs
   */
  resetAllRetryCounts(): void {
    this.retryCount.clear();
  }

  /**
   * Obtenir le nombre de retries pour une tâche
   */
  getRetryCount(taskId: string): number {
    return this.retryCount.get(taskId) ?? 0;
  }

  /*
   * ==========================================================================
   * CLASSIFICATION DES ERREURS
   * ==========================================================================
   */

  /**
   * Classifier le type d'erreur
   */
  private classifyError(message: string): ErrorType {
    const lowerMessage = message.toLowerCase();

    // Erreurs réseau
    if (
      lowerMessage.includes('network') ||
      lowerMessage.includes('econnrefused') ||
      lowerMessage.includes('enotfound') ||
      lowerMessage.includes('socket')
    ) {
      return 'network';
    }

    // Timeouts
    if (lowerMessage.includes('timeout') || lowerMessage.includes('timed out') || lowerMessage.includes('etimedout')) {
      return 'timeout';
    }

    // Rate limiting
    if (
      lowerMessage.includes('rate limit') ||
      lowerMessage.includes('429') ||
      lowerMessage.includes('too many requests')
    ) {
      return 'rate_limit';
    }

    // Validation
    if (lowerMessage.includes('validation') || lowerMessage.includes('invalid') || lowerMessage.includes('malformed')) {
      return 'validation';
    }

    // Permissions
    if (
      lowerMessage.includes('permission') ||
      lowerMessage.includes('unauthorized') ||
      lowerMessage.includes('forbidden') ||
      lowerMessage.includes('403')
    ) {
      return 'permission';
    }

    // Ressource non trouvée
    if (lowerMessage.includes('not found') || lowerMessage.includes('404') || lowerMessage.includes('does not exist')) {
      return 'resource_not_found';
    }

    // Conflits
    if (lowerMessage.includes('conflict') || lowerMessage.includes('already exists') || lowerMessage.includes('409')) {
      return 'conflict';
    }

    // Erreurs internes
    if (lowerMessage.includes('internal') || lowerMessage.includes('500') || lowerMessage.includes('server error')) {
      return 'internal';
    }

    return 'unknown';
  }

  /**
   * Évaluer la sévérité de l'erreur
   */
  private assessSeverity(errorType: ErrorType, task: Task): ErrorSeverity {
    // Sévérité basée sur le type d'erreur
    const severityByType: Record<ErrorType, ErrorSeverity> = {
      network: 'medium',
      timeout: 'medium',
      rate_limit: 'low',
      validation: 'low',
      permission: 'high',
      resource_not_found: 'medium',
      conflict: 'medium',
      internal: 'high',
      unknown: 'medium',
    };

    let severity = severityByType[errorType];

    // Augmenter la sévérité selon le contexte
    if (task.type === 'deployer') {
      // Les erreurs de déploiement sont plus critiques
      if (severity === 'medium') {
        severity = 'high';
      }

      if (severity === 'high') {
        severity = 'critical';
      }
    }

    return severity;
  }

  /**
   * Déterminer si l'erreur est récupérable
   */
  private isRecoverable(errorType: ErrorType, severity: ErrorSeverity): boolean {
    // Les erreurs critiques ne sont généralement pas récupérables
    if (severity === 'critical') {
      return false;
    }

    // Erreurs généralement récupérables
    const recoverableTypes: ErrorType[] = ['network', 'timeout', 'rate_limit', 'internal'];

    return recoverableTypes.includes(errorType);
  }

  /*
   * ==========================================================================
   * GÉNÉRATION DES OPTIONS DE RÉCUPÉRATION
   * ==========================================================================
   */

  /**
   * Générer les options de récupération possibles
   */
  private generateRecoveryOptions(errorType: ErrorType, task: Task, severity: ErrorSeverity): RecoveryAction[] {
    const options: RecoveryAction[] = [];
    const currentRetries = this.retryCount.get(task.id) ?? 0;
    const canRetry = currentRetries < this.config.maxRetries;

    // Option: Retry
    if (canRetry && ['network', 'timeout', 'rate_limit', 'internal'].includes(errorType)) {
      const delay = this.calculateBackoff(currentRetries);
      options.push({
        type: 'retry',
        description: `Réessayer après ${delay}ms (tentative ${currentRetries + 1}/${this.config.maxRetries})`,
        retryDelay: delay,
        successProbability: this.estimateRetrySuccess(errorType, currentRetries),
      });
    }

    // Option: Fallback
    if (this.config.enableAutoFallback) {
      const fallbackAgent = this.config.defaultFallbacks[task.type as AgentType];

      if (fallbackAgent && this.registry.get(fallbackAgent)?.isAvailable()) {
        options.push({
          type: 'fallback',
          description: `Déléguer à l'agent ${fallbackAgent}`,
          fallbackAgent,
          successProbability: 0.6,
        });
      }
    }

    // Option: Skip
    if (severity !== 'critical' && severity !== 'high') {
      options.push({
        type: 'skip',
        description: 'Ignorer cette tâche et continuer',
        successProbability: 1.0,
      });
    }

    // Option: Manual
    options.push({
      type: 'manual',
      description: 'Intervention manuelle requise',
      successProbability: 0.9,
    });

    // Option: Abort (toujours disponible)
    options.push({
      type: 'abort',
      description: 'Abandonner la tâche',
      successProbability: 0,
    });

    return options;
  }

  /**
   * Sélectionner la meilleure action de récupération
   */
  private selectBestAction(options: RecoveryAction[], task: Task): RecoveryAction {
    // Trier par probabilité de succès
    const sorted = [...options].sort((a, b) => (b.successProbability ?? 0) - (a.successProbability ?? 0));

    // Préférer retry si disponible et probabilité > 50%
    const retryOption = sorted.find((o) => o.type === 'retry');

    if (retryOption && (retryOption.successProbability ?? 0) > 0.5) {
      return retryOption;
    }

    // Sinon, prendre l'option avec la meilleure probabilité (excluant abort)
    const bestOption = sorted.find((o) => o.type !== 'abort');

    return bestOption ?? sorted[sorted.length - 1];
  }

  /*
   * ==========================================================================
   * EXÉCUTION DES ACTIONS
   * ==========================================================================
   */

  /**
   * Exécuter un retry
   */
  private async executeRetry(task: Task, apiKey: string, analysis: ErrorAnalysis): Promise<TaskResult> {
    const delay = analysis.recommendedAction.retryDelay ?? this.config.baseRetryDelay;
    await this.sleep(delay);

    return this.retry(task, apiKey);
  }

  /**
   * Exécuter un fallback
   */
  private async executeFallback(task: Task, apiKey: string, analysis: ErrorAnalysis): Promise<TaskResult> {
    const fallbackAgent = analysis.recommendedAction.fallbackAgent;

    if (!fallbackAgent) {
      return this.createFailureResult(analysis);
    }

    return this.fallback(task, apiKey, fallbackAgent);
  }

  /*
   * ==========================================================================
   * CRÉATION DES RÉSULTATS
   * ==========================================================================
   */

  /**
   * Créer un résultat d'échec
   */
  private createFailureResult(analysis: ErrorAnalysis): TaskResult {
    return {
      success: false,
      output: analysis.simplifiedMessage,
      errors: [
        {
          code: `ERROR_${analysis.errorType.toUpperCase()}`,
          message: analysis.originalMessage,
          recoverable: false,
        },
      ],
    };
  }

  /**
   * Créer un résultat de skip
   */
  private createSkipResult(analysis: ErrorAnalysis): TaskResult {
    return {
      success: true,
      output: `Task skipped due to error: ${analysis.simplifiedMessage}`,
      errors: [
        {
          code: 'TASK_SKIPPED',
          message: `Skipped: ${analysis.originalMessage}`,
          recoverable: true,
        },
      ],
    };
  }

  /**
   * Créer un résultat demandant une intervention manuelle
   */
  private createManualInterventionResult(analysis: ErrorAnalysis): TaskResult {
    return {
      success: false,
      output: `Manual intervention required: ${analysis.simplifiedMessage}`,
      errors: [
        {
          code: 'MANUAL_INTERVENTION_REQUIRED',
          message: analysis.originalMessage,
          recoverable: true,
          suggestion: 'Please review the error and take appropriate action',
        },
      ],
    };
  }

  /*
   * ==========================================================================
   * HELPERS
   * ==========================================================================
   */

  /**
   * Extraire le message d'erreur
   */
  private extractErrorMessage(error: Error | AgentError | string): string {
    if (typeof error === 'string') {
      return error;
    }

    if (error instanceof Error) {
      return error.message;
    }

    return error.message;
  }

  /**
   * Simplifier le message d'erreur
   */
  private simplifyMessage(message: string, errorType: ErrorType): string {
    const simplifications: Record<ErrorType, string> = {
      network: 'Erreur de connexion réseau',
      timeout: "Délai d'attente dépassé",
      rate_limit: 'Limite de requêtes atteinte',
      validation: 'Erreur de validation des données',
      permission: 'Permission refusée',
      resource_not_found: 'Ressource non trouvée',
      conflict: 'Conflit détecté',
      internal: 'Erreur interne du serveur',
      unknown: 'Erreur inattendue',
    };

    return simplifications[errorType] || message;
  }

  /**
   * Calculer le délai de backoff
   */
  private calculateBackoff(retryCount: number): number {
    const delay = this.config.baseRetryDelay * Math.pow(this.config.backoffMultiplier, retryCount);
    return Math.min(delay, this.config.maxRetryDelay);
  }

  /**
   * Estimer la probabilité de succès d'un retry
   */
  private estimateRetrySuccess(errorType: ErrorType, retryCount: number): number {
    // Base probability par type
    const baseProbability: Record<ErrorType, number> = {
      network: 0.8,
      timeout: 0.7,
      rate_limit: 0.9,
      internal: 0.6,
      validation: 0.1,
      permission: 0.1,
      resource_not_found: 0.2,
      conflict: 0.3,
      unknown: 0.4,
    };

    // Réduire la probabilité avec chaque retry
    const base = baseProbability[errorType] ?? 0.5;
    const reduction = retryCount * 0.15;

    return Math.max(0.1, base - reduction);
  }

  /**
   * Attendre un délai
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer une instance d'ErrorRecovery
 */
export function createErrorRecovery(registry: AgentRegistry, config?: Partial<RecoveryConfig>): ErrorRecovery {
  return new ErrorRecovery(registry, config);
}
