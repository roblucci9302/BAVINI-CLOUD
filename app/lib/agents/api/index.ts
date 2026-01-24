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

// Verification loop (Phase 0 Task 2.4)
export {
  type VerificationConfig,
  type CodeSnapshot,
  type FixAttemptResult,
  type VerificationResult,
  type VerificationMetrics,
  DEFAULT_VERIFICATION_CONFIG,
  createSnapshot,
  shouldRetry,
  verifyFix,
  buildRetryFixerPrompt,
  runAutoFixWithVerification,
  getVerificationMetrics,
  resetVerificationMetrics,
  formatMetricsReport,
} from './verification';

// Orchestration
export { analyzeAndDecide } from './orchestration';

// Note: Prompts are server-only, import from '~/lib/agents/api.server/prompts'
