'use client';

/**
 * AgentWorkbenchIndicators - Agent status indicators for Workbench
 *
 * UI components that show agent activity within the workbench:
 * - Progress banner for ongoing operations
 * - File modification indicators
 * - Action type badges
 *
 * Follows existing bolt UI patterns with PanelHeaderButton styling
 */

import { memo, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { agentStatusStore, activeAgentsStore, currentActionStore, activeAgentCountStore } from '~/lib/stores/agents';
import { chatStore } from '~/lib/stores/chat';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

import type { AgentStatus } from '~/lib/agents/types';

interface ActionInfo {
  type: string;
  description: string;
  filePath?: string;
}

/*
 * ============================================================================
 * AGENT PROGRESS BANNER
 * ============================================================================
 */

interface AgentProgressBannerProps {
  className?: string;
  compact?: boolean;
}

/**
 * Banner showing current agent operation progress
 * Appears in workbench header during agent operations
 */
export const AgentProgressBanner = memo(({ className, compact = false }: AgentProgressBannerProps) => {
  const chatState = useStore(chatStore);
  const activeAgents = useStore(activeAgentsStore);
  const agentStatuses = useStore(agentStatusStore);
  const currentAction = useStore(currentActionStore);
  const activeCount = useStore(activeAgentCountStore);

  const isAgentMode = chatState.mode === 'agent';

  // Find currently executing agent
  const executingAgent = activeAgents.find(
    (agent) => agentStatuses[agent] === 'executing' || agentStatuses[agent] === 'thinking',
  );

  const currentStatus = executingAgent ? agentStatuses[executingAgent] : null;

  // Don't show if not in agent mode or no activity
  if (!isAgentMode || !executingAgent) {
    return null;
  }

  const statusConfig = getStatusConfig(currentStatus);

  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={classNames(
          'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
          'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
          className,
        )}
      >
        <div className={classNames('text-sm', statusConfig.icon, statusConfig.iconAnimation)} />
        <span className="text-bolt-elements-textSecondary truncate max-w-24">
          {currentAction?.description || statusConfig.label}
        </span>
      </motion.div>
    );
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className={classNames(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg',
          'bg-accent-500/10 border border-accent-500/30',
          className,
        )}
      >
        <div className={classNames('text-lg', statusConfig.icon, statusConfig.iconAnimation, 'text-accent-400')} />
        <div className="flex flex-col min-w-0">
          <span className="text-xs font-medium text-accent-400 truncate">{executingAgent}</span>
          {currentAction && (
            <span className="text-xs text-bolt-elements-textSecondary truncate">{currentAction.description}</span>
          )}
        </div>
        {activeCount > 1 && <span className="text-xs text-bolt-elements-textTertiary ml-auto">+{activeCount - 1}</span>}
      </motion.div>
    </AnimatePresence>
  );
});

AgentProgressBanner.displayName = 'AgentProgressBanner';

/*
 * ============================================================================
 * FILE AGENT BADGE
 * ============================================================================
 */

interface FileAgentBadgeProps {
  filePath: string;
  className?: string;
}

/**
 * Small badge shown next to files being modified by agent
 * Uses dot indicator matching existing unsaved file pattern
 */
export const FileAgentBadge = memo(({ filePath, className }: FileAgentBadgeProps) => {
  const currentAction = useStore(currentActionStore);

  // Check if this file is being modified by the agent
  const isBeingModified = currentAction?.filePath === filePath;

  if (!isBeingModified) {
    return null;
  }

  return (
    <motion.span
      initial={{ scale: 0 }}
      animate={{ scale: 1 }}
      exit={{ scale: 0 }}
      className={classNames(
        'inline-flex items-center justify-center',
        'w-2 h-2 rounded-full bg-accent-500',
        'animate-pulse',
        className,
      )}
      title="Agent modifying this file"
    />
  );
});

FileAgentBadge.displayName = 'FileAgentBadge';

/*
 * ============================================================================
 * ACTION TYPE INDICATOR
 * ============================================================================
 */

interface ActionTypeIndicatorProps {
  actionType: string;
  className?: string;
  showLabel?: boolean;
}

/**
 * Shows the type of action being performed (file create, modify, shell, etc.)
 */
export const ActionTypeIndicator = memo(({ actionType, className, showLabel = false }: ActionTypeIndicatorProps) => {
  const config = getActionTypeConfig(actionType);

  return (
    <div
      className={classNames('flex items-center gap-1 text-xs', 'text-bolt-elements-textSecondary', className)}
      title={config.label}
    >
      <div className={classNames('text-sm', config.icon, config.color)} />
      {showLabel && <span>{config.label}</span>}
    </div>
  );
});

ActionTypeIndicator.displayName = 'ActionTypeIndicator';

/*
 * ============================================================================
 * WORKBENCH AGENT STATUS
 * ============================================================================
 */

interface WorkbenchAgentStatusProps {
  className?: string;
}

/**
 * Compact status indicator for workbench header
 * Shows agent mode status and current activity
 */
export const WorkbenchAgentStatus = memo(({ className }: WorkbenchAgentStatusProps) => {
  const chatState = useStore(chatStore);
  const activeCount = useStore(activeAgentCountStore);
  const agentStatuses = useStore(agentStatusStore);
  const activeAgents = useStore(activeAgentsStore);

  const isAgentMode = chatState.mode === 'agent';

  if (!isAgentMode) {
    return null;
  }

  // Find current status
  const executingAgent = activeAgents.find(
    (agent) => agentStatuses[agent] === 'executing' || agentStatuses[agent] === 'thinking',
  );
  const currentStatus = executingAgent ? agentStatuses[executingAgent] : 'idle';
  const statusConfig = getStatusConfig(currentStatus);

  return (
    <div
      className={classNames(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
        'text-bolt-elements-textSecondary',
        'bg-bolt-elements-background-depth-3',
        className,
      )}
      title={`Agent Mode: ${statusConfig.label}`}
    >
      <div
        className={classNames(
          'w-1.5 h-1.5 rounded-full',
          activeCount > 0 ? 'bg-accent-500 animate-pulse' : 'bg-bolt-elements-textTertiary',
        )}
      />
      <span className="text-bolt-elements-textSecondary">Agent</span>
      {activeCount > 0 && <span className="text-accent-400 font-medium">{activeCount}</span>}
    </div>
  );
});

WorkbenchAgentStatus.displayName = 'WorkbenchAgentStatus';

/*
 * ============================================================================
 * EDITOR AGENT OVERLAY
 * ============================================================================
 */

interface EditorAgentOverlayProps {
  filePath?: string;
  className?: string;
}

/**
 * Subtle overlay shown on editor when agent is modifying the current file
 */
export const EditorAgentOverlay = memo(({ filePath, className }: EditorAgentOverlayProps) => {
  const currentAction = useStore(currentActionStore);
  const agentStatuses = useStore(agentStatusStore);
  const activeAgents = useStore(activeAgentsStore);

  // Check if agent is modifying this specific file
  const isModifyingThisFile = filePath && currentAction?.filePath === filePath;

  // Find executing agent
  const executingAgent = activeAgents.find((agent) => agentStatuses[agent] === 'executing');

  if (!isModifyingThisFile || !executingAgent) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className={classNames(
          'absolute top-2 right-2 z-10',
          'flex items-center gap-2 px-2.5 py-1.5 rounded-md',
          'bg-bolt-elements-background-depth-2/90 backdrop-blur-sm',
          'border border-accent-500/30',
          'shadow-sm',
          className,
        )}
      >
        <div className="i-svg-spinners:ring-resize text-accent-400" />
        <span className="text-xs text-bolt-elements-textSecondary">{executingAgent} editing...</span>
      </motion.div>
    </AnimatePresence>
  );
});

EditorAgentOverlay.displayName = 'EditorAgentOverlay';

/*
 * ============================================================================
 * TERMINAL AGENT INDICATOR
 * ============================================================================
 */

interface TerminalAgentIndicatorProps {
  className?: string;
}

/**
 * Shows when agent is executing shell commands
 */
export const TerminalAgentIndicator = memo(({ className }: TerminalAgentIndicatorProps) => {
  const currentAction = useStore(currentActionStore);

  // Check if current action is a shell command
  const isShellAction =
    currentAction?.type === 'shell' || currentAction?.type === 'npm_install' || currentAction?.type === 'npm_run';

  if (!isShellAction) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -10 }}
      className={classNames(
        'flex items-center gap-1.5 px-2 py-1 rounded-md text-xs',
        'bg-amber-500/10 border border-amber-500/30',
        'text-amber-400',
        className,
      )}
    >
      <div className="i-svg-spinners:pulse-3 text-sm" />
      <span>Agent executing command</span>
    </motion.div>
  );
});

TerminalAgentIndicator.displayName = 'TerminalAgentIndicator';

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

function getStatusConfig(status: AgentStatus | null): {
  icon: string;
  label: string;
  color: string;
  iconAnimation?: string;
} {
  switch (status) {
    case 'thinking':
      return {
        icon: 'i-ph:brain',
        label: 'Thinking',
        color: 'text-blue-400',
        iconAnimation: 'animate-pulse',
      };
    case 'executing':
      return {
        icon: 'i-svg-spinners:ring-resize',
        label: 'Executing',
        color: 'text-accent-400',
      };
    case 'waiting_for_tool':
      return {
        icon: 'i-ph:pause-circle',
        label: 'Waiting for tool',
        color: 'text-amber-400',
      };
    case 'completed':
      return {
        icon: 'i-ph:check-circle',
        label: 'Completed',
        color: 'text-green-400',
      };
    case 'failed':
      return {
        icon: 'i-ph:x-circle',
        label: 'Failed',
        color: 'text-red-400',
      };
    case 'aborted':
      return {
        icon: 'i-ph:stop-circle',
        label: 'Aborted',
        color: 'text-bolt-elements-textTertiary',
      };
    case 'idle':
    default:
      return {
        icon: 'i-ph:robot',
        label: 'Idle',
        color: 'text-bolt-elements-textTertiary',
      };
  }
}

function getActionTypeConfig(actionType: string): {
  icon: string;
  label: string;
  color: string;
} {
  switch (actionType) {
    case 'file_create':
      return {
        icon: 'i-ph:file-plus',
        label: 'Creating file',
        color: 'text-green-400',
      };
    case 'file_modify':
      return {
        icon: 'i-ph:pencil-simple',
        label: 'Modifying file',
        color: 'text-blue-400',
      };
    case 'file_delete':
      return {
        icon: 'i-ph:trash',
        label: 'Deleting file',
        color: 'text-red-400',
      };
    case 'shell':
      return {
        icon: 'i-ph:terminal',
        label: 'Shell command',
        color: 'text-amber-400',
      };
    case 'npm_install':
      return {
        icon: 'i-ph:package',
        label: 'Installing packages',
        color: 'text-purple-400',
      };
    case 'npm_run':
      return {
        icon: 'i-ph:play',
        label: 'Running script',
        color: 'text-cyan-400',
      };
    case 'git':
      return {
        icon: 'i-ph:git-branch',
        label: 'Git operation',
        color: 'text-orange-400',
      };
    default:
      return {
        icon: 'i-ph:gear',
        label: 'Action',
        color: 'text-bolt-elements-textSecondary',
      };
  }
}

/*
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

export { getStatusConfig, getActionTypeConfig, type ActionInfo };
