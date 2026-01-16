'use client';

/**
 * AgentActivityWrapper - Wraps AgentActivityLog with agent system hooks
 *
 * This component connects the AgentActivityLog to the agent stores.
 */

import React, { useState, useCallback } from 'react';
import { AgentActivityLog } from '~/components/agent/AgentActivityLog';
import { AgentStatusBadge, AgentStopButton } from '~/components/agent/AgentStatusBadge';
import { useAgentStatus, useIsAgentMode } from './AgentSystemProvider';
import { resetAgentStores } from '~/lib/stores/agents';

export interface AgentActivityWrapperProps {
  /** Callback when stop button is clicked */
  onStopAll?: () => void;
}

export function AgentActivityWrapper({ onStopAll }: AgentActivityWrapperProps) {
  const [isLogOpen, setIsLogOpen] = useState(false);
  const { activeCount } = useAgentStatus();
  const isAgentMode = useIsAgentMode();

  const handleOpenLog = useCallback(() => {
    setIsLogOpen(true);
  }, []);

  const handleCloseLog = useCallback(() => {
    setIsLogOpen(false);
  }, []);

  const handleStopAll = useCallback(() => {
    // Reset all agent stores to stop execution
    resetAgentStores();
    onStopAll?.();
  }, [onStopAll]);

  // Only render in agent mode
  if (!isAgentMode) {
    return null;
  }

  return (
    <>
      {/* Status Badge - always visible in agent mode */}
      <div className="fixed bottom-4 right-4 z-30 flex items-center gap-2">
        <AgentStopButton onStop={handleStopAll} disabled={activeCount === 0} />
        <AgentStatusBadge onClick={handleOpenLog} />
      </div>

      {/* Activity Log Panel */}
      <AgentActivityLog isOpen={isLogOpen} onClose={handleCloseLog} maxLogs={200} autoScroll={true} />
    </>
  );
}

/**
 * Minimal status indicator for header/toolbar
 */
export function AgentStatusIndicator({ onClick, compact = true }: { onClick?: () => void; compact?: boolean }) {
  const isAgentMode = useIsAgentMode();

  if (!isAgentMode) {
    return null;
  }

  return <AgentStatusBadge onClick={onClick} compact={compact} />;
}
