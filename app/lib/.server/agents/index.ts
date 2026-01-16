/**
 * Agents BAVINI - Exports centralisés
 *
 * Ce module exporte tous les composants du système d'agents pour
 * le Chat Mode et l'Agent Mode.
 */

/*
 * =============================================================================
 * Types
 * =============================================================================
 */

export type {

  // Agent Capabilities & Mode
  AgentCapability,
  AgentMode,
  AgentMode as ChatMode, // Alias pour compatibilité avec stores/chat.ts

  // Context
  AgentContext,
  ProjectFile,
  AgentMessage,
  ProjectState,
  ProjectError,

  // Responses
  ChatModeResponse,
  ChatResponseSections,
  AgentModeResponse,

  // Execution Planning
  ExecutionPlan,
  ProposedAction,
  ActionType,
  ActionDetails,
  CreateFileDetails,
  ModifyFileDetails,
  DeleteFileDetails,
  RunCommandDetails,
  InstallPackageDetails,
  GitOperationDetails,
  DeployDetails,
  FileChange,
  ActionDependency,
  PlanEstimates,

  // Action Results
  ActionResult,
  RollbackData,
  ExecutionError,

  // Configuration
  AgentConfig,
} from './types';

export { CHAT_MODE_CONFIG, AGENT_MODE_CONFIG } from './types';

/*
 * =============================================================================
 * Base Agent
 * =============================================================================
 */

export { BaseAgent, AgentRestrictionError, AgentCapabilityError } from './BaseAgent';

export type { CodeAnalysis } from './BaseAgent';

/*
 * =============================================================================
 * Chat Mode Agent
 * =============================================================================
 */

export { ChatModeAgent, CHAT_MODE_SYSTEM_PROMPT } from './ChatModeAgent';

/*
 * =============================================================================
 * Agent Mode Agent
 * =============================================================================
 */

export { AgentModeAgent, AGENT_MODE_SYSTEM_PROMPT } from './AgentModeAgent';

export type { ExecutionStatus, AgentExecutionResponse, ExecutionSummary } from './AgentModeAgent';

/*
 * =============================================================================
 * Action Executor
 * =============================================================================
 */

export { ActionExecutor, createActionExecutor } from './ActionExecutor';

export type { ExecutionResult, ExecutionOptions } from './ActionExecutor';
