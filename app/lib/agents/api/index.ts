/**
 * API Agent Modules - Re-exports
 *
 * Ce module centralise les exports pour l'API Agent,
 * permettant une meilleure organisation du code.
 */

// Types
export type {
  ChatMessage,
  FileContext,
  AgentRequestBody,
  StreamChunk,
  APIAgentType,
  OrchestrationDecision,
  DetectedError,
} from './types';

// Stream utilities
export { createStreamChunk, enqueueChunk, sendAgentStatus, sendText, sendError, sendDone } from './stream';

// Error detection
export { detectErrorsInOutput, buildFixerPrompt } from './error-detection';

// Orchestration
export { analyzeAndDecide } from './orchestration';

// Note: Prompts are server-only, import from '~/lib/agents/api.server/prompts'
