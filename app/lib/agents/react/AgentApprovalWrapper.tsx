'use client';

/**
 * AgentApprovalWrapper - Wraps ActionApprovalModal with agent system hooks
 *
 * This component connects the ActionApprovalModal to the agent approval flow.
 */

import React, { useState, useCallback } from 'react';
import { ActionApprovalModal } from '~/components/agent/ActionApprovalModal';
import { useAgentApproval } from './AgentSystemProvider';

export interface AgentApprovalWrapperProps {
  /** Callback after batch is processed */
  onBatchProcessed?: (approved: boolean) => void;
}

export function AgentApprovalWrapper({ onBatchProcessed }: AgentApprovalWrapperProps) {
  const { pendingBatch, isModalOpen, approveAll, approveSelected, rejectAll, closeModal } = useAgentApproval();

  const [isProcessing, setIsProcessing] = useState(false);

  const handleApproveAll = useCallback(() => {
    setIsProcessing(true);
    approveAll();
    setIsProcessing(false);
    closeModal();
    onBatchProcessed?.(true);
  }, [approveAll, closeModal, onBatchProcessed]);

  const handleApproveSelected = useCallback(
    (actionIds: string[]) => {
      setIsProcessing(true);
      approveSelected(actionIds);
      setIsProcessing(false);
      closeModal();
      onBatchProcessed?.(actionIds.length > 0);
    },
    [approveSelected, closeModal, onBatchProcessed],
  );

  const handleRejectAll = useCallback(() => {
    setIsProcessing(true);
    rejectAll();
    setIsProcessing(false);
    closeModal();
    onBatchProcessed?.(false);
  }, [rejectAll, closeModal, onBatchProcessed]);

  const handleClose = useCallback(() => {
    // Closing without action is treated as rejection
    rejectAll();
    closeModal();
    onBatchProcessed?.(false);
  }, [rejectAll, closeModal, onBatchProcessed]);

  return (
    <ActionApprovalModal
      isOpen={isModalOpen}
      batch={pendingBatch}
      onApproveAll={handleApproveAll}
      onApproveSelected={handleApproveSelected}
      onRejectAll={handleRejectAll}
      onClose={handleClose}
      isProcessing={isProcessing}
    />
  );
}
