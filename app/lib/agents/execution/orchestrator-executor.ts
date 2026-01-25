/**
 * =============================================================================
 * BAVINI CLOUD - Orchestrator Executor
 * =============================================================================
 * Handles delegation and decomposition execution for the orchestrator.
 *
 * @module agents/execution/orchestrator-executor
 * @see {@link Orchestrator} for the main orchestrator implementation
 * =============================================================================
 */

import type {
  Task,
  TaskResult,
  AgentType,
  OrchestrationDecision,
  Artifact,
} from '../types';
import { MAX_DECOMPOSITION_DEPTH } from '../types';
import { AgentRegistry } from '../core/agent-registry';
import {
  ParallelExecutor,
  createParallelExecutor,
  type SubtaskDefinition,
  type SubtaskResult,
} from './parallel-executor';
import { getGlobalCircuitBreaker, type CircuitBreaker } from '../utils/circuit-breaker';
import type { CheckpointScheduler } from '../persistence/checkpoint-scheduler';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('OrchestratorExecutor');

/**
 * Logger interface for executor
 */
export interface ExecutorLogger {
  info: (message: string, data?: Record<string, unknown>) => void;
  warn: (message: string, data?: Record<string, unknown>) => void;
  debug: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * Event emitter interface for executor
 */
export interface ExecutorEventEmitter {
  emitEvent: (event: string, data: Record<string, unknown>) => void;
}

/**
 * Context required for delegation execution
 */
export interface DelegationContext {
  registry: AgentRegistry;
  apiKey: string;
  checkpointScheduler: CheckpointScheduler;
  log: ExecutorLogger;
}

/**
 * Context required for decomposition execution
 */
export interface DecompositionContext extends DelegationContext {
  eventEmitter: ExecutorEventEmitter;
}

/**
 * Execute delegation to a single agent
 *
 * @param decision - The orchestration decision with target agent
 * @param originalTask - The original task being processed
 * @param context - Execution context with registry, api key, etc.
 * @returns Task result from the delegated agent
 */
export async function executeDelegation(
  decision: OrchestrationDecision,
  originalTask: Task,
  context: DelegationContext,
): Promise<TaskResult> {
  const { registry, apiKey, checkpointScheduler, log } = context;

  if (!decision.targetAgent) {
    throw new Error('No target agent specified for delegation');
  }

  const circuitBreaker = getGlobalCircuitBreaker();

  // Check circuit breaker before delegating
  if (!circuitBreaker.isAllowed(decision.targetAgent)) {
    const stats = circuitBreaker.getStats(decision.targetAgent);
    log.warn(`Circuit breaker OPEN for agent ${decision.targetAgent}`, {
      state: stats.state,
      failureCount: stats.failureCount,
    });

    return {
      success: false,
      output: `Agent '${decision.targetAgent}' temporairement indisponible (circuit ouvert après ${stats.failureCount} échecs)`,
      errors: [
        {
          code: 'CIRCUIT_OPEN',
          message: `Agent ${decision.targetAgent} circuit breaker is OPEN`,
          recoverable: true,
          suggestion: 'Réessayer plus tard ou utiliser un autre agent',
          context: {
            state: stats.state,
            failureCount: stats.failureCount,
            lastFailure: stats.lastFailure?.toISOString(),
          },
        },
      ],
    };
  }

  const agent = registry.get(decision.targetAgent);

  if (!agent) {
    return {
      success: false,
      output: `Agent '${decision.targetAgent}' non disponible`,
      errors: [
        {
          code: 'AGENT_NOT_FOUND',
          message: `Agent ${decision.targetAgent} not found in registry`,
          recoverable: false,
        },
      ],
    };
  }

  if (!agent.isAvailable()) {
    return {
      success: false,
      output: `Agent '${decision.targetAgent}' est occupé`,
      errors: [
        {
          code: 'AGENT_BUSY',
          message: `Agent ${decision.targetAgent} is busy`,
          recoverable: true,
          suggestion: "Attendre que l'agent soit disponible",
        },
      ],
    };
  }

  // Create the subtask
  const subTask: Task = {
    id: `${originalTask.id}-${decision.targetAgent}-${Date.now()}`,
    type: decision.targetAgent,
    prompt: decision.reasoning,
    context: originalTask.context,
    status: 'pending',
    metadata: {
      parentTaskId: originalTask.id,
      source: 'orchestrator',
    },
    createdAt: new Date(),
  };

  log.info(`Delegating to ${decision.targetAgent}`, {
    subTaskId: subTask.id,
  });

  // Create checkpoint BEFORE delegation
  await checkpointScheduler.createDelegationCheckpoint(originalTask.id, decision.targetAgent, 'before');

  // Execute agent with circuit breaker tracking
  try {
    const result = await agent.run(subTask, apiKey);

    // Create checkpoint AFTER delegation (success or failure)
    await checkpointScheduler.createDelegationCheckpoint(originalTask.id, decision.targetAgent, 'after');

    // Record success or failure in circuit breaker
    if (result.success) {
      circuitBreaker.recordSuccess(decision.targetAgent);
    } else {
      circuitBreaker.recordFailure(decision.targetAgent, result.output);
    }

    // Enrich result
    return {
      ...result,
      output: `[${decision.targetAgent}] ${result.output}`,
      data: {
        ...result.data,
        delegatedTo: decision.targetAgent,
        subTaskId: subTask.id,
        circuitState: circuitBreaker.getState(decision.targetAgent),
      },
    };
  } catch (error) {
    // Create error checkpoint before propagating
    await checkpointScheduler.createErrorCheckpoint(
      originalTask.id,
      error instanceof Error ? error : new Error(String(error)),
    );

    // Record failure in circuit breaker
    const errorMessage = error instanceof Error ? error.message : String(error);
    circuitBreaker.recordFailure(decision.targetAgent, errorMessage);

    throw error;
  }
}

/**
 * Execute decomposition into subtasks with parallel execution
 *
 * @param decision - The orchestration decision with subtasks
 * @param originalTask - The original task being processed
 * @param context - Execution context with registry, api key, etc.
 * @returns Combined task result from all subtasks
 */
export async function executeDecomposition(
  decision: OrchestrationDecision,
  originalTask: Task,
  context: DecompositionContext,
): Promise<TaskResult> {
  const { registry, apiKey, checkpointScheduler, log, eventEmitter } = context;

  // Check decomposition depth to prevent infinite recursion
  const currentDepth = originalTask.metadata?.decompositionDepth ?? 0;

  if (currentDepth >= MAX_DECOMPOSITION_DEPTH) {
    log.warn(`Max decomposition depth (${MAX_DECOMPOSITION_DEPTH}) reached, refusing to decompose further`);

    return {
      success: false,
      output: `Profondeur maximum de décomposition atteinte (${MAX_DECOMPOSITION_DEPTH}). La tâche est trop complexe pour être décomposée davantage.`,
      errors: [
        {
          code: 'MAX_DEPTH_EXCEEDED',
          message: `Maximum decomposition depth (${MAX_DECOMPOSITION_DEPTH}) exceeded`,
          recoverable: false,
        },
      ],
    };
  }

  if (!decision.subTasks || decision.subTasks.length === 0) {
    return {
      success: false,
      output: 'Aucune sous-tâche définie',
      errors: [
        {
          code: 'NO_SUBTASKS',
          message: 'Decomposition produced no subtasks',
          recoverable: false,
        },
      ],
    };
  }

  log.info(`Decomposing into ${decision.subTasks.length} subtasks`, {
    subtasks: decision.subTasks.map((t) => t.type),
  });

  // Convert subtasks to parallel executor format
  // Increment decomposition depth for subtasks to track recursion
  const subtaskDefinitions: SubtaskDefinition[] = decision.subTasks.map((subTaskDef, i) => ({
    id: `${originalTask.id}-step-${i}`,
    agent: (subTaskDef.type || 'explore') as AgentType,
    task: {
      id: `${originalTask.id}-step-${i}`,
      type: subTaskDef.type || 'explore',
      prompt: subTaskDef.prompt,
      context: {
        ...originalTask.context,
      },
      status: 'pending' as const,
      metadata: {
        parentTaskId: originalTask.id,
        source: 'orchestrator' as const,
        decompositionDepth: currentDepth + 1,
      },
      createdAt: new Date(),
    },

    // Convert indices to dependency IDs
    dependencies: subTaskDef.dependencies?.map((idx) => `${originalTask.id}-step-${idx}`),
  }));

  // Create parallel executor
  const executor = createParallelExecutor({
    maxConcurrency: 3, // Limit to 3 parallel agents
    continueOnError: true, // Continue even if a task fails
    taskTimeout: 120000, // 2 minutes per task
    onProgress: (completed, total, current) => {
      log.debug(`Progress: ${completed}/${total}`, {
        subtaskId: current.id,
        success: current.success,
      });
      eventEmitter.emitEvent('task:progress', {
        completed,
        total,
        current: current.id,
      });
    },
    onLevelStart: (level, taskCount) => {
      log.info(`Starting level ${level} with ${taskCount} task(s)`);
    },
    onLevelComplete: (level, results) => {
      const successful = results.filter((r) => r.success).length;
      log.info(`Level ${level} complete: ${successful}/${results.length} successful`);
    },
  });

  // Execute with callback that uses agent registry and circuit breaker
  const circuitBreaker = getGlobalCircuitBreaker();

  const results = await executor.execute(subtaskDefinitions, async (task, agentType) => {
    // Check circuit breaker
    if (!circuitBreaker.isAllowed(agentType)) {
      const stats = circuitBreaker.getStats(agentType);
      return {
        success: false,
        output: `Agent ${agentType} temporairement indisponible (circuit ouvert)`,
        errors: [
          {
            code: 'CIRCUIT_OPEN',
            message: `Agent ${agentType} circuit breaker is OPEN`,
            recoverable: true,
            context: { state: stats.state, failureCount: stats.failureCount },
          },
        ],
      };
    }

    const agent = registry.get(agentType);

    if (!agent) {
      return {
        success: false,
        output: `Agent ${agentType} non disponible`,
        errors: [
          {
            code: 'AGENT_NOT_FOUND',
            message: `Agent ${agentType} not found in registry`,
            recoverable: false,
          },
        ],
      };
    }

    try {
      const result = await agent.run(task, apiKey);

      // Record success/failure in circuit breaker
      if (result.success) {
        circuitBreaker.recordSuccess(agentType);
      } else {
        circuitBreaker.recordFailure(agentType, result.output);
      }

      // Create checkpoint after each completed subtask
      await checkpointScheduler.createSubtaskCheckpoint(originalTask.id, task.id, result);

      return result;
    } catch (error) {
      // Create error checkpoint for the subtask
      await checkpointScheduler.createErrorCheckpoint(
        originalTask.id,
        error instanceof Error ? error : new Error(String(error)),
      );

      const errorMessage = error instanceof Error ? error.message : String(error);
      circuitBreaker.recordFailure(agentType, errorMessage);
      throw error;
    }
  });

  // Aggregate artifacts
  const artifacts: Artifact[] = [];

  for (const r of results) {
    if (r.result.artifacts) {
      artifacts.push(...r.result.artifacts);
    }
  }

  // Calculate statistics
  const stats = ParallelExecutor.calculateStats(results);

  // Group by level for better display
  const byLevel = new Map<number, SubtaskResult[]>();

  for (const r of results) {
    const level = byLevel.get(r.level) || [];
    level.push(r);
    byLevel.set(r.level, level);
  }

  const combinedOutput = Array.from(byLevel.entries())
    .sort(([a], [b]) => a - b)
    .map(([level, levelResults]) => {
      const levelOutput = levelResults.map((r) => `#### ${r.id}\n${r.result.output}`).join('\n\n');
      return `### Niveau ${level} (${levelResults.length} tâche(s), parallèle)\n${levelOutput}`;
    })
    .join('\n\n---\n\n');

  return {
    success: stats.failed === 0,
    output:
      `## Résultat de l'exécution parallèle (${stats.successful}/${stats.total} réussies)\n\n` +
      `**Niveaux d'exécution:** ${stats.levels}\n` +
      `**Efficacité parallèle:** ${stats.parallelEfficiency}x\n` +
      `**Temps total:** ${stats.totalTime}ms\n\n` +
      combinedOutput,
    artifacts,
    data: {
      subtaskResults: results,
      reasoning: decision.reasoning,
      executionStats: stats,
    },
  };
}

/**
 * Handler result for delegate_to_agent tool
 */
export interface DelegateToAgentResult {
  delegated: boolean;
  agent: string;
  task: string;
}

/**
 * Handler: Delegate to agent
 *
 * This handler is used by the LLM to signal its decision.
 * The actual execution is done in executeDelegation.
 */
export function handleDelegateToAgent(input: {
  agent: AgentType;
  task: string;
  context?: Record<string, unknown>;
}): DelegateToAgentResult {
  return {
    delegated: true,
    agent: input.agent,
    task: input.task,
  };
}

/**
 * Handler result for create_subtasks tool
 */
export interface CreateSubtasksResult {
  created: boolean;
  count: number;
  reasoning: string;
}

/**
 * Handler: Create subtasks
 */
export function handleCreateSubtasks(input: {
  tasks: Array<{
    agent: AgentType;
    description: string;
    dependsOn?: number[];
  }>;
  reasoning: string;
}): CreateSubtasksResult {
  return {
    created: true,
    count: input.tasks.length,
    reasoning: input.reasoning,
  };
}

/**
 * Handler result for get_agent_status tool
 */
export type GetAgentStatusResult =
  | { error: string }
  | {
      name: string;
      status: string;
      description: string;
      available: boolean;
    }
  | Array<{
      name: string;
      status: string;
      description: string;
    }>;

/**
 * Handler: Get agent status
 */
export function handleGetAgentStatus(
  input: { agent?: AgentType },
  registry: AgentRegistry,
): GetAgentStatusResult {
  if (input.agent) {
    const agent = registry.get(input.agent);

    if (!agent) {
      return { error: `Agent ${input.agent} not found` };
    }

    return {
      name: input.agent,
      status: agent.getStatus(),
      description: agent.getDescription(),
      available: agent.isAvailable(),
    };
  }

  return registry.getAgentsInfo();
}
