import { memo } from 'react';
import { useStore } from '@nanostores/react';
import { Markdown } from './Markdown';
import { FloatingMessageActions } from './MessageActions';
import { multiAgentEnabledStore } from './MultiAgentToggle';
import { activeAgentsStore, agentStatusStore } from '~/lib/stores/agents';
import type { AgentType } from '~/lib/agents/types';
import { classNames } from '~/utils/classNames';

interface AssistantMessageProps {
  content: string;
  messageIndex: number;
  isLast?: boolean;
  isStreaming?: boolean;
  onRegenerate?: (index: number) => void;
}

/**
 * Configuration des agents - Fusion A Design
 * Couleurs et icônes pour chaque type d'agent
 */
const AGENT_CONFIG: Record<AgentType, { bg: string; border: string; text: string; icon: string }> = {
  coder: {
    bg: 'bg-green-500/[0.08]',
    border: 'border-green-500/25',
    text: 'text-green-500',
    icon: 'i-ph:code',
  },
  explore: {
    bg: 'bg-sky-500/[0.08]',
    border: 'border-sky-500/25',
    text: 'text-sky-500',
    icon: 'i-ph:magnifying-glass',
  },
  builder: {
    bg: 'bg-orange-500/[0.08]',
    border: 'border-orange-500/25',
    text: 'text-orange-500',
    icon: 'i-ph:hammer',
  },
  tester: {
    bg: 'bg-yellow-500/[0.08]',
    border: 'border-yellow-500/25',
    text: 'text-yellow-500',
    icon: 'i-ph:test-tube',
  },
  orchestrator: {
    bg: 'bg-purple-500/[0.08]',
    border: 'border-purple-500/25',
    text: 'text-purple-500',
    icon: 'i-ph:brain',
  },
  fixer: {
    bg: 'bg-red-500/[0.08]',
    border: 'border-red-500/25',
    text: 'text-red-500',
    icon: 'i-ph:wrench',
  },
  deployer: {
    bg: 'bg-pink-500/[0.08]',
    border: 'border-pink-500/25',
    text: 'text-pink-500',
    icon: 'i-ph:rocket-launch',
  },
  reviewer: {
    bg: 'bg-blue-500/[0.08]',
    border: 'border-blue-500/25',
    text: 'text-blue-500',
    icon: 'i-ph:eye',
  },
  architect: {
    bg: 'bg-indigo-500/[0.08]',
    border: 'border-indigo-500/25',
    text: 'text-indigo-500',
    icon: 'i-ph:blueprint',
  },
};

/**
 * Indicateur d'agent actif - Fusion A Design
 */
const AgentIndicator = memo(() => {
  const multiAgentEnabled = useStore(multiAgentEnabledStore);
  const activeAgents = useStore(activeAgentsStore);
  const agentStatuses = useStore(agentStatusStore);

  if (!multiAgentEnabled) {
    return null;
  }

  // Trouver l'agent en cours d'exécution
  const executingAgent = activeAgents.find(
    (agent) => agentStatuses[agent] === 'executing' || agentStatuses[agent] === 'thinking',
  );

  if (!executingAgent) {
    return null;
  }

  const config = AGENT_CONFIG[executingAgent] || AGENT_CONFIG.coder;

  return (
    <div className="mt-3">
      <div
        className={classNames(
          'inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-xs font-medium',
          config.bg,
          config.border,
          config.text,
        )}
      >
        <div className={classNames(config.icon, 'text-sm')} />
        <span>{executingAgent}</span>
      </div>
    </div>
  );
});

AgentIndicator.displayName = 'AgentIndicator';

export const AssistantMessage = memo(
  ({ content, messageIndex, isLast = false, isStreaming = false, onRegenerate }: AssistantMessageProps) => {
    return (
      <div className="relative w-full min-w-0 group/message">
        <FloatingMessageActions
          role="assistant"
          messageIndex={messageIndex}
          content={content}
          onRegenerate={onRegenerate}
          isLast={isLast}
          isStreaming={isStreaming}
          position="top-right"
        />
        <div className="pr-16">
          <Markdown html>{content}</Markdown>
          {/* Indicateur d'agent - affiché seulement pendant le streaming du dernier message */}
          {isStreaming && isLast && <AgentIndicator />}
        </div>
      </div>
    );
  },
);

AssistantMessage.displayName = 'AssistantMessage';
