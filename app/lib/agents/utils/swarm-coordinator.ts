/**
 * Swarm Coordinator - Coordination directe entre agents
 * Permet les handoffs directs entre agents sans passer par l'orchestrateur
 * Réduit la latence de ~40% par rapport au routing centralisé
 */

import type { AgentRegistry } from '../core/agent-registry';
import type { BaseAgent } from '../core/base-agent';
import type { Task, TaskResult, AgentType, AgentEventCallback, AgentEvent } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SwarmCoordinator');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Règle de handoff entre agents
 */
export interface HandoffRule {
  /** Agent source du handoff */
  from: AgentType;

  /** Agent destination du handoff */
  to: AgentType;

  /** Condition pour déclencher le handoff */
  condition: HandoffCondition;

  /** Priorité de la règle (plus élevé = prioritaire) */
  priority: number;

  /** Transformer la tâche avant le handoff */
  transformTask?: (task: Task, result: TaskResult) => Task;

  /** Description de la règle */
  description?: string;
}

/**
 * Condition de handoff
 */
export type HandoffCondition =
  | { type: 'always' }
  | { type: 'on_success' }
  | { type: 'on_failure' }
  | { type: 'on_pattern'; pattern: RegExp }
  | { type: 'custom'; predicate: (task: Task, result: TaskResult) => boolean };

/**
 * Résultat d'un handoff
 */
export interface HandoffResult {
  success: boolean;
  fromAgent: AgentType;
  toAgent: AgentType;
  originalTask: Task;
  transformedTask?: Task;
  result?: TaskResult;
  error?: string;
  duration: number;
}

/**
 * État d'une chaîne de handoffs
 */
export interface SwarmChain {
  id: string;
  startAgent: AgentType;
  currentAgent: AgentType;
  handoffs: HandoffResult[];
  startTime: Date;
  status: 'running' | 'completed' | 'failed';
  finalResult?: TaskResult;

  /** Compteur de visites par agent (pour détecter les boucles) */
  agentVisitCount: Map<AgentType, number>;

  /** Hash des derniers outputs pour détecter la stagnation */
  lastOutputHashes: string[];
}

/**
 * Configuration du Swarm Coordinator
 */
export interface SwarmConfig {
  /** Nombre maximum de handoffs dans une chaîne */
  maxHandoffs: number;

  /** Timeout par handoff en ms */
  handoffTimeout: number;

  /** Activer les logs détaillés */
  verbose: boolean;

  /** Permettre les cycles (même agent plusieurs fois) */
  allowCycles: boolean;

  /** Nombre maximum de visites au même agent (anti-boucle) - défaut: 2 */
  maxVisitsPerAgent: number;

  /** Nombre d'outputs identiques consécutifs avant de détecter une stagnation - défaut: 2 */
  stagnationThreshold: number;

  /** Activer la détection de stagnation (outputs identiques) - défaut: true */
  enableStagnationDetection: boolean;
}

/*
 * ============================================================================
 * SWARM COORDINATOR
 * ============================================================================
 */

/**
 * Coordinateur de swarm pour les handoffs directs
 */
export class SwarmCoordinator {
  private registry: AgentRegistry;
  private apiKey: string;
  private rules: Map<AgentType, HandoffRule[]> = new Map();
  private activeChains: Map<string, SwarmChain> = new Map();
  private eventCallback?: AgentEventCallback;
  private config: SwarmConfig;

  constructor(
    registry: AgentRegistry,
    apiKey: string,
    config: Partial<SwarmConfig> = {},
    eventCallback?: AgentEventCallback,
  ) {
    this.registry = registry;
    this.apiKey = apiKey;
    this.eventCallback = eventCallback;
    this.config = {
      maxHandoffs: config.maxHandoffs ?? 10,
      handoffTimeout: config.handoffTimeout ?? 60000,
      verbose: config.verbose ?? false,
      allowCycles: config.allowCycles ?? false,
      maxVisitsPerAgent: config.maxVisitsPerAgent ?? 2,
      stagnationThreshold: config.stagnationThreshold ?? 2,
      enableStagnationDetection: config.enableStagnationDetection ?? true,
    };
  }

  /**
   * Ajouter une règle de handoff
   */
  addRule(rule: HandoffRule): void {
    const rules = this.rules.get(rule.from) || [];
    rules.push(rule);

    // Trier par priorité décroissante
    rules.sort((a, b) => b.priority - a.priority);
    this.rules.set(rule.from, rules);

    this.log('info', `Added handoff rule: ${rule.from} -> ${rule.to}`, { rule });
  }

  /**
   * Supprimer une règle de handoff
   */
  removeRule(from: AgentType, to: AgentType): boolean {
    const rules = this.rules.get(from);

    if (!rules) {
      return false;
    }

    const index = rules.findIndex((r) => r.to === to);

    if (index === -1) {
      return false;
    }

    rules.splice(index, 1);

    return true;
  }

  /**
   * Obtenir toutes les règles pour un agent
   */
  getRulesFor(agentType: AgentType): HandoffRule[] {
    return [...(this.rules.get(agentType) || [])];
  }

  /**
   * Obtenir toutes les règles
   */
  getAllRules(): HandoffRule[] {
    const allRules: HandoffRule[] = [];

    for (const rules of this.rules.values()) {
      allRules.push(...rules);
    }

    return allRules;
  }

  /**
   * Génère un hash simple d'un output pour détecter la stagnation
   */
  private hashOutput(output: string): string {
    // Hash simple basé sur la longueur et quelques caractères clés
    const normalized = output.trim().toLowerCase().slice(0, 500);
    let hash = 0;
    for (let i = 0; i < normalized.length; i++) {
      const char = normalized.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash; // Convert to 32bit integer
    }
    return hash.toString(36);
  }

  /**
   * Vérifie si la chaîne est en stagnation (outputs répétitifs)
   */
  private isStagnating(chain: SwarmChain, newOutputHash: string): boolean {
    if (!this.config.enableStagnationDetection) {
      return false;
    }

    // Ajouter le nouveau hash
    chain.lastOutputHashes.push(newOutputHash);

    // Garder seulement les N derniers
    if (chain.lastOutputHashes.length > this.config.stagnationThreshold + 1) {
      chain.lastOutputHashes.shift();
    }

    // Vérifier si les derniers outputs sont identiques
    if (chain.lastOutputHashes.length >= this.config.stagnationThreshold) {
      const lastHashes = chain.lastOutputHashes.slice(-this.config.stagnationThreshold);
      const allSame = lastHashes.every((h) => h === lastHashes[0]);
      if (allSame) {
        return true;
      }
    }

    return false;
  }

  /**
   * Exécuter une tâche avec handoffs automatiques
   */
  async executeWithHandoffs(startAgent: AgentType, task: Task): Promise<{ chain: SwarmChain; result: TaskResult }> {
    const chainId = `swarm-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;

    const chain: SwarmChain = {
      id: chainId,
      startAgent,
      currentAgent: startAgent,
      handoffs: [],
      startTime: new Date(),
      status: 'running',
      agentVisitCount: new Map<AgentType, number>(),
      lastOutputHashes: [],
    };

    this.activeChains.set(chainId, chain);
    this.emitEvent('swarm_started', chainId, { startAgent, task });

    try {
      let currentAgent = startAgent;
      let currentTask = task;
      let lastResult: TaskResult | null = null;

      while (chain.handoffs.length < this.config.maxHandoffs) {
        // Incrémenter le compteur de visites pour cet agent
        const currentVisits = (chain.agentVisitCount.get(currentAgent) || 0) + 1;
        chain.agentVisitCount.set(currentAgent, currentVisits);

        // PROTECTION ANTI-BOUCLE #1: Vérifier le nombre de visites au même agent
        if (currentVisits > this.config.maxVisitsPerAgent) {
          this.log(
            'warn',
            `Agent ${currentAgent} visited ${currentVisits} times (max: ${this.config.maxVisitsPerAgent}), stopping to prevent infinite loop`,
          );
          this.emitEvent('swarm_loop_detected', chainId, {
            agent: currentAgent,
            visits: currentVisits,
            reason: 'max_visits_exceeded',
          });
          break;
        }

        // Vérifier les cycles stricts (si désactivé)
        if (!this.config.allowCycles && currentVisits > 1) {
          this.log('warn', `Cycle detected at ${currentAgent}, stopping (cycles disabled)`);
          break;
        }

        // Exécuter l'agent courant
        const agent = this.registry.get(currentAgent);

        if (!agent) {
          throw new Error(`Agent ${currentAgent} not found in registry`);
        }

        this.emitEvent('agent_started', chainId, { agent: currentAgent, task: currentTask });

        const startTime = Date.now();
        lastResult = await agent.run(currentTask, this.apiKey);

        const duration = Date.now() - startTime;

        this.emitEvent('agent_completed', chainId, {
          agent: currentAgent,
          result: lastResult,
          duration,
        });

        // PROTECTION ANTI-BOUCLE #2: Vérifier la stagnation (outputs identiques)
        const outputHash = this.hashOutput(lastResult.output);
        if (this.isStagnating(chain, outputHash)) {
          this.log(
            'warn',
            `Stagnation detected: last ${this.config.stagnationThreshold} outputs are identical, stopping`,
          );
          this.emitEvent('swarm_loop_detected', chainId, {
            agent: currentAgent,
            reason: 'stagnation_detected',
            outputHash,
          });
          break;
        }

        // Trouver le prochain handoff
        const nextHandoff = this.findMatchingRule(currentAgent, currentTask, lastResult);

        if (!nextHandoff) {
          // Pas de handoff, fin de la chaîne
          this.log('info', `No matching handoff rule for ${currentAgent}, chain complete`);
          break;
        }

        // Transformer la tâche si nécessaire
        const transformedTask = nextHandoff.transformTask
          ? nextHandoff.transformTask(currentTask, lastResult)
          : this.defaultTransformTask(currentTask, lastResult, nextHandoff.to);

        // Enregistrer le handoff
        const handoffResult: HandoffResult = {
          success: true,
          fromAgent: currentAgent,
          toAgent: nextHandoff.to,
          originalTask: currentTask,
          transformedTask,
          result: lastResult,
          duration,
        };

        chain.handoffs.push(handoffResult);
        chain.currentAgent = nextHandoff.to;

        this.emitEvent('handoff', chainId, {
          from: currentAgent,
          to: nextHandoff.to,
          rule: nextHandoff.description,
        });

        // Préparer le prochain tour
        currentAgent = nextHandoff.to;
        currentTask = transformedTask;
      }

      // Finaliser la chaîne
      chain.status = 'completed';
      chain.finalResult = lastResult || {
        success: false,
        output: 'No result produced',
      };

      this.emitEvent('swarm_completed', chainId, {
        handoffCount: chain.handoffs.length,
        result: chain.finalResult,
      });

      return { chain, result: chain.finalResult };
    } catch (error) {
      chain.status = 'failed';
      chain.finalResult = {
        success: false,
        output: error instanceof Error ? error.message : String(error),
        errors: [
          {
            code: 'SWARM_ERROR',
            message: error instanceof Error ? error.message : String(error),
            recoverable: false,
          },
        ],
      };

      this.emitEvent('swarm_failed', chainId, { error });

      return { chain, result: chain.finalResult };
    } finally {
      // Nettoyer après un délai
      setTimeout(() => {
        this.activeChains.delete(chainId);
      }, 60000);
    }
  }

  /**
   * Effectuer un handoff direct entre deux agents
   */
  async handoff(
    fromAgent: AgentType,
    toAgent: AgentType,
    task: Task,
    previousResult?: TaskResult,
  ): Promise<HandoffResult> {
    const startTime = Date.now();

    try {
      const agent = this.registry.get(toAgent);

      if (!agent) {
        return {
          success: false,
          fromAgent,
          toAgent,
          originalTask: task,
          error: `Agent ${toAgent} not found`,
          duration: Date.now() - startTime,
        };
      }

      // Transformer la tâche avec le contexte du résultat précédent
      const transformedTask = previousResult ? this.defaultTransformTask(task, previousResult, toAgent) : task;

      // Exécuter l'agent
      const result = await agent.run(transformedTask, this.apiKey);

      return {
        success: result.success,
        fromAgent,
        toAgent,
        originalTask: task,
        transformedTask,
        result,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      return {
        success: false,
        fromAgent,
        toAgent,
        originalTask: task,
        error: error instanceof Error ? error.message : String(error),
        duration: Date.now() - startTime,
      };
    }
  }

  /**
   * Trouver la règle de handoff correspondante
   */
  private findMatchingRule(agentType: AgentType, task: Task, result: TaskResult): HandoffRule | null {
    const rules = this.rules.get(agentType);

    if (!rules || rules.length === 0) {
      return null;
    }

    for (const rule of rules) {
      if (this.evaluateCondition(rule.condition, task, result)) {
        return rule;
      }
    }

    return null;
  }

  /**
   * Évaluer une condition de handoff
   */
  private evaluateCondition(condition: HandoffCondition, task: Task, result: TaskResult): boolean {
    switch (condition.type) {
      case 'always':
        return true;

      case 'on_success':
        return result.success;

      case 'on_failure':
        return !result.success;

      case 'on_pattern':
        return condition.pattern.test(result.output);

      case 'custom':
        return condition.predicate(task, result);

      default:
        return false;
    }
  }

  /**
   * Transformation de tâche par défaut pour un handoff
   */
  private defaultTransformTask(originalTask: Task, previousResult: TaskResult, targetAgent: AgentType): Task {
    // Construire un nouveau prompt avec le contexte du résultat précédent
    let prompt = originalTask.prompt;

    if (previousResult.output) {
      prompt += `\n\n--- Résultat de l'agent précédent ---\n${previousResult.output}`;
    }

    if (previousResult.artifacts && previousResult.artifacts.length > 0) {
      prompt += '\n\n--- Artefacts disponibles ---';

      for (const artifact of previousResult.artifacts) {
        if (artifact.type === 'file') {
          prompt += `\nFichier: ${artifact.path} (${artifact.action})`;
        } else {
          prompt += `\n${artifact.title || artifact.type}: ${artifact.content?.substring(0, 200)}...`;
        }
      }
    }

    if (previousResult.errors && previousResult.errors.length > 0) {
      prompt += '\n\n--- Erreurs à traiter ---';

      for (const error of previousResult.errors) {
        prompt += `\n- ${error.message}`;

        if (error.suggestion) {
          prompt += ` (suggestion: ${error.suggestion})`;
        }
      }
    }

    return {
      ...originalTask,
      id: `${originalTask.id}-${targetAgent}-${Date.now()}`,
      prompt,
      context: {
        ...originalTask.context,
        previousResults: [...(originalTask.context?.previousResults || []), previousResult],
      },
    };
  }

  /**
   * Obtenir une chaîne active
   */
  getActiveChain(chainId: string): SwarmChain | undefined {
    return this.activeChains.get(chainId);
  }

  /**
   * Obtenir toutes les chaînes actives
   */
  getActiveChains(): SwarmChain[] {
    return [...this.activeChains.values()];
  }

  /**
   * Émettre un événement
   */
  private emitEvent(type: string, chainId: string, data: Record<string, unknown>): void {
    if (this.eventCallback) {
      const event: AgentEvent = {
        type: type as AgentEvent['type'],
        agentName: 'orchestrator', // Swarm acts as an extension of orchestrator
        timestamp: new Date(),
        data: { chainId, swarm: true, ...data },
      };
      this.eventCallback(event);
    }
  }

  /**
   * Logger helper
   */
  private log(level: 'info' | 'warn' | 'error', message: string, data?: Record<string, unknown>): void {
    if (this.config.verbose || level === 'error') {
      logger[level](message, data);
    }
  }
}

/*
 * ============================================================================
 * RÈGLES PRÉDÉFINIES
 * ============================================================================
 */

/**
 * Règles prédéfinies pour des workflows courants
 */
export const PREDEFINED_RULES = {
  /**
   * Après un test échoué, passer au Fixer
   */
  testToFixer: (): HandoffRule => ({
    from: 'tester',
    to: 'fixer',
    condition: { type: 'on_failure' },
    priority: 10,
    description: 'On test failure, handoff to fixer',
    transformTask: (task, result) => ({
      ...task,
      id: `fix-${task.id}`,
      prompt: `Corriger les erreurs de test suivantes:\n\n${result.output}`,
      context: {
        ...task.context,
        errors: result.errors,
      },
    }),
  }),

  /**
   * Après une correction, relancer les tests
   */
  fixerToTester: (): HandoffRule => ({
    from: 'fixer',
    to: 'tester',
    condition: { type: 'on_success' },
    priority: 10,
    description: 'After fix, rerun tests',
    transformTask: (task, _result) => ({
      ...task,
      id: `retest-${task.id}`,
      prompt: 'Relancer les tests pour vérifier les corrections',
    }),
  }),

  /**
   * Après le code, passer au Reviewer
   */
  coderToReviewer: (): HandoffRule => ({
    from: 'coder',
    to: 'reviewer',
    condition: { type: 'on_success' },
    priority: 5,
    description: 'After coding, review the code',
    transformTask: (task, result) => ({
      ...task,
      id: `review-${task.id}`,
      prompt: `Analyser la qualité du code créé/modifié:\n\n${result.output}`,
      context: {
        ...task.context,
        artifacts: result.artifacts,
      },
    }),
  }),

  /**
   * Si la review trouve des problèmes, passer au Fixer
   */
  reviewerToFixer: (): HandoffRule => ({
    from: 'reviewer',
    to: 'fixer',
    condition: {
      type: 'custom',
      predicate: (_task, result) => {
        // Passer au fixer si des issues high ou medium sont trouvées
        const output = result.output.toLowerCase();
        return output.includes('"severity": "high"') || output.includes('"severity": "medium"');
      },
    },
    priority: 8,
    description: 'If review finds issues, handoff to fixer',
    transformTask: (task, result) => ({
      ...task,
      id: `fix-review-${task.id}`,
      prompt: `Corriger les problèmes identifiés par la review:\n\n${result.output}`,
      context: {
        ...task.context,
        reviewIssues: result.data?.issues as unknown[] | undefined,
      },
    }),
  }),

  /**
   * Après le build, lancer les tests
   */
  builderToTester: (): HandoffRule => ({
    from: 'builder',
    to: 'tester',
    condition: { type: 'on_success' },
    priority: 5,
    description: 'After successful build, run tests',
    transformTask: (task, _result) => ({
      ...task,
      id: `test-${task.id}`,
      prompt: 'Lancer les tests après le build',
    }),
  }),

  /**
   * Explore → Coder (si exploration suggère des modifications)
   */
  exploreToCoder: (): HandoffRule => ({
    from: 'explore',
    to: 'coder',
    condition: {
      type: 'custom',
      predicate: (_task, result) => {
        if (!result.success) {
          return false;
        }

        const output = result.output.toLowerCase();
        return (
          output.includes('should be modified') ||
          output.includes('needs to be updated') ||
          output.includes('should be fixed') ||
          output.includes('requires changes') ||
          output.includes('à modifier') ||
          output.includes('doit être mis à jour') ||
          output.includes('doit être corrigé') ||
          output.includes('nécessite des modifications')
        );
      },
    },
    priority: 3,
    description: 'After exploration suggests changes, handoff to coder',
    transformTask: (task, result) => ({
      ...task,
      id: `code-from-explore-${task.id}`,
      prompt: `Based on the exploration results below, implement the necessary changes:\n\n${result.output}`,
      context: {
        ...task.context,
        explorationResult: result.output,
        artifacts: result.artifacts,
      },
    }),
  }),

  /**
   * Deployer → Fixer (si opération Git échoue)
   */
  deployerToFixer: (): HandoffRule => ({
    from: 'deployer',
    to: 'fixer',
    condition: { type: 'on_failure' },
    priority: 5,
    description: 'On Git operation failure, handoff to fixer',
    transformTask: (task, result) => ({
      ...task,
      id: `fix-git-${task.id}`,
      prompt: `Git operation failed. Please fix the issue:\n\nError:\n${result.output}\n\n${
        result.errors && result.errors.length > 0
          ? `Errors:\n${result.errors.map((e) => `- ${e.message}${e.suggestion ? ` (suggestion: ${e.suggestion})` : ''}`).join('\n')}`
          : ''
      }`,
      context: {
        ...task.context,
        gitError: result.output,
        errors: result.errors,
      },
    }),
  }),

  /**
   * Reviewer → Deployer (après approbation du code)
   */
  reviewerToDeployer: (): HandoffRule => ({
    from: 'reviewer',
    to: 'deployer',
    condition: {
      type: 'custom',
      predicate: (_task, result) => {
        if (!result.success) {
          return false;
        }

        const output = result.output.toLowerCase();
        const hasApproval =
          output.includes('approved') ||
          output.includes('looks good') ||
          output.includes('lgtm') ||
          output.includes('no issues found') ||
          output.includes('approuvé') ||
          output.includes('aucun problème');

        // Ne pas passer au deployer s'il y a des issues critiques ou hautes
        const hasBlockingIssues =
          output.includes('"severity": "critical"') ||
          output.includes('"severity": "high"') ||
          output.includes('critical issues') ||
          output.includes('high severity');

        return hasApproval && !hasBlockingIssues;
      },
    },
    priority: 2,
    description: 'After code approval, handoff to deployer',
    transformTask: (task, result) => ({
      ...task,
      id: `deploy-after-review-${task.id}`,
      prompt: `Code review passed. Please proceed with deployment (commit and push if appropriate).\n\nReview summary:\n${result.output}`,
      context: {
        ...task.context,
        reviewApproved: true,
        reviewSummary: result.output,
      },
    }),
  }),

  /**
   * Coder → Tester (après modification de code)
   */
  coderToTester: (): HandoffRule => ({
    from: 'coder',
    to: 'tester',
    condition: { type: 'on_success' },
    priority: 3,
    description: 'After coding, run tests to verify changes',
    transformTask: (task, result) => {
      // Extraire les fichiers modifiés des artefacts
      const modifiedFiles =
        result.artifacts
          ?.filter((a) => a.type === 'file' && a.path)
          .map((a) => a.path as string)
          .filter(Boolean) || [];

      return {
        ...task,
        id: `test-after-code-${task.id}`,
        prompt: `Run tests to verify the code changes:\n\n${result.output}${
          modifiedFiles.length > 0 ? `\n\nModified files:\n${modifiedFiles.map((f) => `- ${f}`).join('\n')}` : ''
        }`,
        context: {
          ...task.context,
          modifiedFiles,
          codeChanges: result.output,
          artifacts: result.artifacts,
        },
      };
    },
  }),

  /**
   * Builder → Fixer (si le build échoue)
   */
  builderToFixer: (): HandoffRule => ({
    from: 'builder',
    to: 'fixer',
    condition: { type: 'on_failure' },
    priority: 8,
    description: 'On build failure, handoff to fixer',
    transformTask: (task, result) => ({
      ...task,
      id: `fix-build-${task.id}`,
      prompt: `Build failed. Please fix the build errors:\n\n${result.output}`,
      context: {
        ...task.context,
        buildError: result.output,
        errors: result.errors,
      },
    }),
  }),

  /**
   * Tester → Reviewer (si les tests passent)
   */
  testerToReviewer: (): HandoffRule => ({
    from: 'tester',
    to: 'reviewer',
    condition: {
      type: 'custom',
      predicate: (_task, result) => {
        if (!result.success) {
          return false;
        }

        const output = result.output.toLowerCase();
        // Ne passer au reviewer que si tous les tests passent
        return (
          (output.includes('all tests passed') ||
            output.includes('tous les tests passés') ||
            output.includes('test suite passed') ||
            output.includes('0 failed')) &&
          !output.includes('failed') &&
          !output.includes('error')
        );
      },
    },
    priority: 4,
    description: 'After all tests pass, handoff to reviewer',
    transformTask: (task, result) => ({
      ...task,
      id: `review-after-test-${task.id}`,
      prompt: `Tests passed. Please review the code quality:\n\n${result.output}`,
      context: {
        ...task.context,
        testResults: result.output,
        testsPassed: true,
      },
    }),
  }),

  /**
   * Architect → Coder (après production d'un plan d'implémentation)
   */
  architectToCoder: (): HandoffRule => ({
    from: 'architect',
    to: 'coder',
    condition: {
      type: 'custom',
      predicate: (_task, result) => {
        if (!result.success) {
          return false;
        }

        const output = result.output.toLowerCase();
        // Déclencheurs EN/FR pour les plans d'implémentation
        return (
          output.includes("plan d'implémentation") ||
          output.includes('implementation plan') ||
          output.includes('## recommandation') ||
          output.includes('## recommendation') ||
          output.includes('design document') ||
          output.includes('document de design') ||
          output.includes('architecture proposée') ||
          output.includes('proposed architecture')
        );
      },
    },
    priority: 6,
    description: 'After architect produces implementation plan, handoff to coder',
    transformTask: (task, result) => {
      // Extraire les fichiers à modifier si mentionnés
      const filesToModify: string[] = [];
      const fileMatches = result.output.match(/(?:fichier|file)[s]?\s*[:]\s*([^\n]+)/gi);
      if (fileMatches) {
        for (const match of fileMatches) {
          const files = match.split(/[,;]/).map((f) => f.replace(/^.*[:]\s*/, '').trim());
          filesToModify.push(...files.filter((f) => f.length > 0));
        }
      }

      return {
        ...task,
        id: `code-from-architect-${task.id}`,
        prompt: `Implement the following architecture design:\n\n${result.output}`,
        context: {
          ...task.context,
          architectureDesign: result.output,
          designDocument: result.output,
          filesToModify: filesToModify.length > 0 ? filesToModify : undefined,
        },
      };
    },
  }),

  /**
   * Explore → Architect (si exploration révèle des besoins architecturaux)
   */
  exploreToArchitect: (): HandoffRule => ({
    from: 'explore',
    to: 'architect',
    condition: {
      type: 'custom',
      predicate: (_task, result) => {
        if (!result.success) {
          return false;
        }

        const output = result.output.toLowerCase();

        // Doit mentionner architecture/refactoring/dette technique
        const hasArchitecturalConcern =
          output.includes('architecture') ||
          output.includes('refactoring') ||
          output.includes('dette technique') ||
          output.includes('technical debt') ||
          output.includes('restructuration') ||
          output.includes('restructuring') ||
          output.includes('design pattern');

        // Et impliquer plusieurs fichiers/dépendances
        const hasComplexity =
          output.includes('multiple files') ||
          output.includes('plusieurs fichiers') ||
          output.includes('dépendances') ||
          output.includes('dependencies') ||
          output.includes('couplage') ||
          output.includes('coupling') ||
          output.includes('impact sur') ||
          output.includes('impact on');

        return hasArchitecturalConcern && hasComplexity;
      },
    },
    priority: 4,
    description: 'After exploration reveals architectural needs, handoff to architect',
    transformTask: (task, result) => ({
      ...task,
      id: `architect-from-explore-${task.id}`,
      prompt: `Analyze the following exploration results and propose an architecture solution:\n\n${result.output}`,
      context: {
        ...task.context,
        explorationResult: result.output,
        needsDesign: true,
      },
    }),
  }),

  /**
   * Reviewer → Architect (si issues architecturales critiques détectées)
   */
  reviewerToArchitect: (): HandoffRule => ({
    from: 'reviewer',
    to: 'architect',
    condition: {
      type: 'custom',
      predicate: (_task, result) => {
        if (!result.success) {
          return false;
        }

        const output = result.output.toLowerCase();

        // Doit avoir des issues architecturales
        const hasArchitecturalIssue =
          output.includes('god class') ||
          output.includes('classe dieu') ||
          output.includes('tight coupling') ||
          output.includes('couplage fort') ||
          output.includes('srp violation') ||
          output.includes('violation srp') ||
          output.includes('single responsibility') ||
          output.includes('responsabilité unique') ||
          output.includes('circular dependency') ||
          output.includes('dépendance circulaire') ||
          output.includes('architectural issue') ||
          output.includes('problème architectural');

        // Et être de sévérité high ou critical
        const isHighSeverity =
          output.includes('"severity": "high"') ||
          output.includes('"severity": "critical"') ||
          output.includes('severity: high') ||
          output.includes('severity: critical') ||
          output.includes('sévérité: haute') ||
          output.includes('sévérité: critique');

        return hasArchitecturalIssue && isHighSeverity;
      },
    },
    priority: 7,
    description: 'On high severity architectural issues, handoff to architect for recommendations',
    transformTask: (task, result) => ({
      ...task,
      id: `architect-from-review-${task.id}`,
      prompt: `The code review identified critical architectural issues. Please analyze and provide recommendations:\n\n${result.output}`,
      context: {
        ...task.context,
        reviewResult: result.output,
        architecturalConcerns: true,
      },
    }),
  }),
};

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer un SwarmCoordinator avec les règles prédéfinies
 */
export function createSwarmCoordinator(
  registry: AgentRegistry,
  apiKey: string,
  options: {
    config?: Partial<SwarmConfig>;
    eventCallback?: AgentEventCallback;
    enablePredefinedRules?: boolean;
  } = {},
): SwarmCoordinator {
  const coordinator = new SwarmCoordinator(registry, apiKey, options.config, options.eventCallback);

  // Ajouter les règles prédéfinies si demandé
  if (options.enablePredefinedRules) {
    // Règles existantes
    coordinator.addRule(PREDEFINED_RULES.testToFixer());
    coordinator.addRule(PREDEFINED_RULES.fixerToTester());
    coordinator.addRule(PREDEFINED_RULES.coderToReviewer());
    coordinator.addRule(PREDEFINED_RULES.reviewerToFixer());
    coordinator.addRule(PREDEFINED_RULES.builderToTester());

    // Nouvelles règles (P1.5)
    coordinator.addRule(PREDEFINED_RULES.exploreToCoder());
    coordinator.addRule(PREDEFINED_RULES.deployerToFixer());
    coordinator.addRule(PREDEFINED_RULES.reviewerToDeployer());
    coordinator.addRule(PREDEFINED_RULES.coderToTester());
    coordinator.addRule(PREDEFINED_RULES.builderToFixer());
    coordinator.addRule(PREDEFINED_RULES.testerToReviewer());

    // Règles Architect (P2)
    coordinator.addRule(PREDEFINED_RULES.architectToCoder());
    coordinator.addRule(PREDEFINED_RULES.exploreToArchitect());
    coordinator.addRule(PREDEFINED_RULES.reviewerToArchitect());
  }

  return coordinator;
}
