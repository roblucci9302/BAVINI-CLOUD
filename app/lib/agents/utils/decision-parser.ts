/**
 * =============================================================================
 * BAVINI CLOUD - Orchestration Decision Parser
 * =============================================================================
 * Parses and validates orchestration decisions from LLM responses.
 *
 * @module agents/utils/decision-parser
 * @see {@link Orchestrator} for the main orchestrator implementation
 * =============================================================================
 */

import type { AgentType, OrchestrationDecision, ToolCall } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DecisionParser');

/**
 * Valid agent types for delegation
 */
export const VALID_AGENTS: AgentType[] = [
  'explore',
  'coder',
  'builder',
  'tester',
  'deployer',
  'reviewer',
  'fixer',
  'architect',
];

/**
 * Logger interface for decision parsing
 */
export interface DecisionParserLogger {
  warn: (message: string, data?: Record<string, unknown>) => void;
  error: (message: string, data?: Record<string, unknown>) => void;
}

/**
 * Validate that an agent name is valid
 *
 * @param agent - The agent name to validate
 * @param context - Context for error messages
 * @returns The validated agent type
 * @throws Error if the agent is invalid
 */
export function validateAgent(agent: unknown, context: string): AgentType {
  if (!agent || typeof agent !== 'string') {
    throw new Error(`${context}: Agent name is required and must be a string`);
  }

  const normalizedAgent = agent.toLowerCase().trim() as AgentType;

  if (!VALID_AGENTS.includes(normalizedAgent)) {
    throw new Error(
      `${context}: Invalid agent "${agent}". ` + `Valid agents are: ${VALID_AGENTS.join(', ')}`,
    );
  }

  return normalizedAgent;
}

/**
 * Validate a task description
 *
 * @param description - The task description to validate
 * @param context - Context for error messages
 * @param log - Optional logger for warnings
 * @returns The validated and trimmed description
 * @throws Error if the description is invalid
 */
export function validateTaskDescription(
  description: unknown,
  context: string,
  log?: DecisionParserLogger,
): string {
  if (!description || typeof description !== 'string') {
    throw new Error(`${context}: Task description is required and must be a string`);
  }

  const trimmed = description.trim();

  if (trimmed.length === 0) {
    throw new Error(`${context}: Task description cannot be empty`);
  }

  if (trimmed.length < 5 && log) {
    log.warn(`${context}: Very short task description`, { length: trimmed.length });
  }

  return trimmed;
}

/**
 * Parse delegate_to_agent tool call
 */
function parseDelegateToAgent(
  input: Record<string, unknown>,
  log?: DecisionParserLogger,
): OrchestrationDecision {
  // Strict agent validation
  const agent = validateAgent(input.agent, 'delegate_to_agent');

  // Strict task validation
  const task = validateTaskDescription(input.task, 'delegate_to_agent', log);

  // Optional context validation
  if (input.context !== undefined && typeof input.context !== 'object') {
    log?.warn('delegate_to_agent: context should be an object, ignoring', {
      type: typeof input.context,
    });
  }

  return {
    action: 'delegate',
    targetAgent: agent,
    reasoning: `Délégation à ${agent}: ${task}`,
  };
}

/**
 * Validated subtask definition
 */
interface ValidatedSubtask {
  agent: AgentType | undefined;
  description: string;
  dependsOn: number[] | undefined;
}

/**
 * Parse create_subtasks tool call
 */
function parseCreateSubtasks(
  input: Record<string, unknown>,
  log?: DecisionParserLogger,
): OrchestrationDecision {
  const tasks = input.tasks as unknown;

  // Strict validation: tasks must be a non-empty array
  if (!Array.isArray(tasks)) {
    throw new Error('create_subtasks: "tasks" must be an array');
  }

  if (tasks.length === 0) {
    throw new Error('create_subtasks: At least one subtask is required');
  }

  // Limit subtasks to prevent abuse
  if (tasks.length > 20) {
    throw new Error(`create_subtasks: Too many subtasks (${tasks.length}). Maximum is 20.`);
  }

  // Validate each subtask
  const validatedTasks: ValidatedSubtask[] = tasks.map((t, idx) => {
    if (!t || typeof t !== 'object') {
      throw new Error(`create_subtasks: Subtask at index ${idx} must be an object`);
    }

    const subtask = t as Record<string, unknown>;

    // Description is required
    const description = validateTaskDescription(
      subtask.description,
      `create_subtasks[${idx}].description`,
      log,
    );

    // Agent is optional but must be valid if present
    let agent: AgentType | undefined;

    if (subtask.agent !== undefined && subtask.agent !== null && subtask.agent !== '') {
      agent = validateAgent(subtask.agent, `create_subtasks[${idx}].agent`);
    }

    // Validate dependencies
    let dependsOn: number[] | undefined;

    if (subtask.dependsOn !== undefined) {
      if (!Array.isArray(subtask.dependsOn)) {
        throw new Error(`create_subtasks[${idx}].dependsOn must be an array of indices`);
      }

      dependsOn = (subtask.dependsOn as unknown[]).map((dep, depIdx) => {
        if (typeof dep !== 'number' || !Number.isInteger(dep) || dep < 0) {
          throw new Error(
            `create_subtasks[${idx}].dependsOn[${depIdx}] must be a non-negative integer`,
          );
        }

        if (dep >= tasks.length) {
          throw new Error(
            `create_subtasks[${idx}].dependsOn[${depIdx}] references invalid task index ${dep}`,
          );
        }

        if (dep >= idx) {
          log?.warn(`create_subtasks: Circular or forward dependency detected`, {
            taskIndex: idx,
            dependsOn: dep,
          });
        }

        return dep;
      });
    }

    return {
      agent,
      description,
      dependsOn,
    };
  });

  // Validate reasoning
  const reasoning = input.reasoning as string | undefined;

  if (reasoning !== undefined && typeof reasoning !== 'string') {
    log?.warn('create_subtasks: reasoning should be a string');
  }

  return {
    action: 'decompose',
    subTasks: validatedTasks.map((t, idx) => ({
      type: t.agent || 'explore',
      prompt: t.description,
      dependencies: t.dependsOn?.map((i) => `subtask-${i}`) || [],
      priority: validatedTasks.length - idx,
    })),
    reasoning: (reasoning && typeof reasoning === 'string' ? reasoning : '') || 'Task decomposition',
  };
}

/**
 * Parse complete_task tool call
 */
function parseCompleteTask(
  input: Record<string, unknown>,
  log?: DecisionParserLogger,
): OrchestrationDecision {
  const result = input.result as unknown;
  const summary = input.summary as string | undefined;

  // Strict result validation
  if (!result || typeof result !== 'string') {
    throw new Error('complete_task: "result" is required and must be a string');
  }

  const trimmedResult = result.trim();

  if (trimmedResult.length === 0) {
    throw new Error('complete_task: "result" cannot be empty');
  }

  // Optional summary validation
  if (summary !== undefined && typeof summary !== 'string') {
    log?.warn('complete_task: summary should be a string');
  }

  // Optional artifacts validation
  const artifacts = input.artifacts as unknown;

  if (artifacts !== undefined) {
    if (!Array.isArray(artifacts)) {
      log?.warn('complete_task: artifacts should be an array');
    } else {
      // Validate each artifact is a string
      for (const [idx, artifact] of artifacts.entries()) {
        if (typeof artifact !== 'string') {
          log?.warn(`complete_task: artifacts[${idx}] should be a string`);
        }
      }
    }
  }

  return {
    action: 'complete',
    response: trimmedResult,
    reasoning: (summary && typeof summary === 'string' ? summary : '') || 'Tâche terminée avec succès',
  };
}

/**
 * Parse orchestration decision from LLM response with strict validation
 *
 * Accepts the format returned by callLLM: { text, toolCalls }
 *
 * @param response - The LLM response containing text and optional tool calls
 * @param log - Optional logger for warnings and errors
 * @returns The parsed orchestration decision
 */
export function parseDecision(
  response: { text: string; toolCalls: ToolCall[] | undefined },
  log?: DecisionParserLogger,
): OrchestrationDecision {
  // Check for tool calls
  if (response.toolCalls && response.toolCalls.length > 0) {
    for (const toolCall of response.toolCalls) {
      const input = toolCall.input;

      try {
        if (toolCall.name === 'delegate_to_agent') {
          return parseDelegateToAgent(input, log);
        }

        if (toolCall.name === 'create_subtasks') {
          return parseCreateSubtasks(input, log);
        }

        if (toolCall.name === 'complete_task') {
          return parseCompleteTask(input, log);
        }
      } catch (error) {
        // Log validation error and propagate
        const errorMessage = error instanceof Error ? error.message : String(error);
        log?.error(`Validation error in parseDecision for tool ${toolCall.name}`, {
          error: errorMessage,
          toolName: toolCall.name,
          input: JSON.stringify(input).substring(0, 500),
        });
        throw error;
      }
    }
  }

  // If no tool called, it's a direct response
  const textContent = response.text || '';

  // Validation: direct response should not be empty
  if (!textContent.trim()) {
    log?.warn('parseDecision: Empty response without tool use');
  }

  return {
    action: 'execute_directly',
    response: textContent,
    reasoning: 'Réponse directe sans délégation',
  };
}
