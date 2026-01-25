/**
 * =============================================================================
 * BAVINI CLOUD - Agent Tools
 * =============================================================================
 * Exports tool definitions for agents.
 * =============================================================================
 */

// Interaction tools (AskUserQuestion, TodoWrite)
export {
  INTERACTION_TOOLS,
  createInteractionToolHandlers,
  formatTodosForPrompt,
  type AskUserCallback,
  type UpdateTodosCallback,
  type UserQuestion,
  type UserAnswer,
  type TodoItem,
} from './interaction-tools';

// Web tools (WebSearch, WebFetch)
export {
  WEB_TOOLS,
  createWebToolHandlers,
  createWebSearchService,
  createWebSearchServiceFromEnv,
  type WebSearchServiceInterface,
  type WebSearchServiceConfig,
  type WebSearchResult,
} from './web-tools';

// Orchestrator tools (Phase 1.2 Refactoring)
export {
  DelegateToAgentTool,
  CreateSubtasksTool,
  GetAgentStatusTool,
  CompleteTaskTool,
  ORCHESTRATOR_TOOLS,
} from './orchestrator-tools';
