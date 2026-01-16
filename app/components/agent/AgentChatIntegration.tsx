'use client';

/**
 * AgentChatIntegration - All agent UI components for chat integration
 *
 * This component bundles all agent-related UI elements for easy integration
 * into the chat interface:
 * - Approval modal for action review
 * - Activity log panel
 * - Status indicators
 * - Mode toggle
 */

import { memo, useState, useCallback } from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { ActionApprovalModal } from './ActionApprovalModal';
import { AgentActivityLog } from './AgentActivityLog';
import { AgentStatusBadge } from './AgentStatusBadge';
import {
  chatStore,
  pendingBatchStore,
  approvalModalOpenStore,
  approveAllActions,
  approveSelectedActions,
  rejectAllActions,
} from '~/lib/stores/chat';
import { activeAgentCountStore } from '~/lib/stores/agents';
import { interfaceSettingsStore } from '~/lib/stores/settings';
import { multiAgentEnabledStore } from '~/components/chat/MultiAgentToggle';
import { classNames } from '~/utils/classNames';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface AgentChatIntegrationProps {
  /** Show the floating status badge */
  showStatusBadge?: boolean;

  /** Show the activity log button */
  showActivityLog?: boolean;

  /** Position of the floating elements */
  position?: 'bottom-right' | 'bottom-left' | 'top-right';
}

/*
 * ============================================================================
 * MAIN COMPONENT
 * ============================================================================
 */

export const AgentChatIntegration = memo(
  ({ showStatusBadge = true, showActivityLog = true, position = 'bottom-right' }: AgentChatIntegrationProps) => {
    // State
    const [isActivityLogOpen, setActivityLogOpen] = useState(false);
    const [isProcessingApproval, setIsProcessingApproval] = useState(false);

    // Stores
    const chatState = useStore(chatStore);
    const pendingBatch = useStore(pendingBatchStore);
    const isApprovalModalOpen = useStore(approvalModalOpenStore);
    const activeCount = useStore(activeAgentCountStore);
    const multiAgentEnabled = useStore(multiAgentEnabledStore);
    const interfaceSettings = useStore(interfaceSettingsStore);

    // Show when in agent mode OR when multi-agent is enabled
    const isAgentMode = chatState.mode === 'agent' || multiAgentEnabled;

    // Check if badge should be shown based on settings
    const shouldShowBadge = showStatusBadge && interfaceSettings.showAgentStatusBadge;

    // Position classes
    const positionClasses = {
      'bottom-right': 'bottom-4 right-4',
      'bottom-left': 'bottom-4 left-4',
      'top-right': 'top-4 right-4',
    };

    // Handlers
    const handleOpenActivityLog = useCallback(() => {
      setActivityLogOpen(true);
    }, []);

    const handleCloseActivityLog = useCallback(() => {
      setActivityLogOpen(false);
    }, []);

    const handleApproveAll = useCallback(() => {
      setIsProcessingApproval(true);

      try {
        approveAllActions();
      } finally {
        setIsProcessingApproval(false);
        approvalModalOpenStore.set(false);
      }
    }, []);

    const handleApproveSelected = useCallback((actionIds: string[]) => {
      setIsProcessingApproval(true);

      try {
        approveSelectedActions(actionIds);
      } finally {
        setIsProcessingApproval(false);
        approvalModalOpenStore.set(false);
      }
    }, []);

    const handleRejectAll = useCallback(() => {
      setIsProcessingApproval(true);

      try {
        rejectAllActions();
      } finally {
        setIsProcessingApproval(false);
        approvalModalOpenStore.set(false);
      }
    }, []);

    const handleCloseApprovalModal = useCallback(() => {
      rejectAllActions();
      approvalModalOpenStore.set(false);
    }, []);

    // Don't render anything if not in agent mode
    if (!isAgentMode) {
      return null;
    }

    // Show badge when multi-agent is enabled (component is only rendered when workbench is open)
    const shouldShowFloatingBadge = shouldShowBadge && multiAgentEnabled;

    return (
      <>
        {/* Floating Status Badge - Visible when multi-agent mode is enabled */}
        <AnimatePresence>
          {shouldShowFloatingBadge && (
            <motion.div
              initial={{ opacity: 0, y: 20, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 20, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className={classNames('fixed z-30 flex flex-col items-end gap-2', positionClasses[position])}
            >
              {/* Status Badge - Click to open activity log */}
              <AgentStatusBadge onClick={handleOpenActivityLog} className="shadow-lg" />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Activity Log Panel */}
        {showActivityLog && (
          <AgentActivityLog
            isOpen={isActivityLogOpen}
            onClose={handleCloseActivityLog}
            maxLogs={200}
            autoScroll={true}
          />
        )}

        {/* Approval Modal */}
        <ActionApprovalModal
          isOpen={isApprovalModalOpen}
          batch={pendingBatch}
          onApproveAll={handleApproveAll}
          onApproveSelected={handleApproveSelected}
          onRejectAll={handleRejectAll}
          onClose={handleCloseApprovalModal}
          isProcessing={isProcessingApproval}
        />
      </>
    );
  },
);

AgentChatIntegration.displayName = 'AgentChatIntegration';

/*
 * ============================================================================
 * MODE TOGGLE COMPONENT
 * ============================================================================
 */

interface AgentModeToggleProps {
  className?: string;
}

export const AgentModeToggle = memo(({ className }: AgentModeToggleProps) => {
  const chatState = useStore(chatStore);
  const isAgentMode = chatState.mode === 'agent';

  const handleToggle = useCallback(() => {
    chatStore.setKey('mode', isAgentMode ? 'chat' : 'agent');
  }, [isAgentMode]);

  return (
    <button
      onClick={handleToggle}
      className={classNames(
        'flex items-center gap-2 px-3 py-1.5 rounded-lg transition-all',
        'border text-sm font-medium',
        isAgentMode
          ? 'bg-accent-500/20 border-accent-500/50 text-accent-400'
          : 'bg-bolt-elements-background-depth-2 border-bolt-elements-borderColor text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
        className,
      )}
      title={isAgentMode ? 'Mode Agent actif' : 'Mode Chat actif'}
    >
      <div className={classNames('text-base', isAgentMode ? 'i-ph:robot-fill' : 'i-ph:chat-circle')} />
      <span>{isAgentMode ? 'Agent' : 'Chat'}</span>
    </button>
  );
});

AgentModeToggle.displayName = 'AgentModeToggle';

/*
 * ============================================================================
 * CONTROL MODE SELECTOR
 * ============================================================================
 */

interface ControlModeSelectorProps {
  className?: string;
  compact?: boolean;
}

export const ControlModeSelector = memo(({ className, compact = false }: ControlModeSelectorProps) => {
  const chatState = useStore(chatStore);
  const controlMode = chatState.controlMode;
  const isAgentMode = chatState.mode === 'agent';

  // Only show in agent mode
  if (!isAgentMode) {
    return null;
  }

  const modes = [
    { value: 'strict', label: 'Strict', icon: 'i-ph:shield-check', description: 'Approval required for all actions' },
    { value: 'moderate', label: 'Moderate', icon: 'i-ph:shield', description: 'Approval for sensitive actions only' },
    { value: 'permissive', label: 'Permissive', icon: 'i-ph:shield-slash', description: 'Auto-approve safe actions' },
  ] as const;

  const handleChange = useCallback((mode: typeof controlMode) => {
    chatStore.setKey('controlMode', mode);
  }, []);

  if (compact) {
    return (
      <select
        value={controlMode}
        onChange={(e) => handleChange(e.target.value as typeof controlMode)}
        className={classNames(
          'text-xs bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor',
          'rounded px-2 py-1 text-bolt-elements-textPrimary',
          className,
        )}
      >
        {modes.map((mode) => (
          <option key={mode.value} value={mode.value}>
            {mode.label}
          </option>
        ))}
      </select>
    );
  }

  return (
    <div className={classNames('flex items-center gap-1', className)}>
      {modes.map((mode) => (
        <button
          key={mode.value}
          onClick={() => handleChange(mode.value)}
          className={classNames(
            'flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-colors',
            controlMode === mode.value
              ? 'bg-accent-500/20 text-accent-400'
              : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary hover:bg-bolt-elements-background-depth-3',
          )}
          title={mode.description}
        >
          <div className={mode.icon} />
          <span>{mode.label}</span>
        </button>
      ))}
    </div>
  );
});

ControlModeSelector.displayName = 'ControlModeSelector';

/*
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

export default AgentChatIntegration;
