/**
 * Composants UI pour le système d'agents BAVINI
 */

export { ActionApprovalModal } from './ActionApprovalModal';
export { AgentActivityLog } from './AgentActivityLog';
export { AgentStatusBadge, AgentStopButton, AgentLoadingIndicator } from './AgentStatusBadge';
export { UserQuestionModal } from './UserQuestionModal';

// Lazy-loaded AgentChatIntegration for better initial bundle size
export { AgentChatIntegration } from './AgentChatIntegration.lazy';
export type { AgentChatIntegrationProps } from './AgentChatIntegration';

// These smaller components are loaded directly (not lazy)
export { AgentModeToggle, ControlModeSelector } from './AgentChatIntegration';
