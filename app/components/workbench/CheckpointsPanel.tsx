'use client';

/**
 * CheckpointsPanel component that integrates checkpoint functionality.
 * Provides a complete UI for creating, viewing, and restoring checkpoints.
 */

import { memo, useCallback, useState } from 'react';
import { useStore } from '@nanostores/react';
import { toast } from 'react-toastify';
import { AnimatePresence, motion } from 'framer-motion';
import { chatId } from '~/lib/persistence/useChatHistory';
import { workbenchStore } from '~/lib/stores/workbench';
import { useCheckpoints } from '~/lib/hooks/useCheckpoints';
import type { FileMap } from '~/lib/stores/files';
import type { RestoreOptions, Checkpoint } from '~/types/checkpoint';
import { classNames } from '~/utils/classNames';
import { createScopedLogger } from '~/utils/logger';
import { PanelHeader } from '~/components/ui/PanelHeader';
import { IconButton } from '~/components/ui/IconButton';
import { CheckpointButton } from './CheckpointButton';
import { CheckpointTimeline, type TimelineCheckpoint } from './CheckpointTimeline';
import { RestoreModal, type RestoreModalCheckpoint } from './RestoreModal';

const logger = createScopedLogger('CheckpointsPanel');

export interface CheckpointsPanelProps {
  /** Custom class name */
  className?: string;

  /** Whether to show as compact sidebar */
  compact?: boolean;

  /** Whether checkpoint operations are disabled */
  disabled?: boolean;
}

/**
 * Panel component providing checkpoint functionality.
 */
export const CheckpointsPanel = memo(({ className, compact = false, disabled = false }: CheckpointsPanelProps) => {
  const currentChatId = useStore(chatId);
  const files = useStore(workbenchStore.files);

  // State for restore modal
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<RestoreModalCheckpoint | null>(null);
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);

  // State for panel visibility
  const [isPanelExpanded, setIsPanelExpanded] = useState(false);

  // Get files snapshot callback
  const getFilesSnapshot = useCallback((): FileMap => {
    return workbenchStore.files.get();
  }, []);

  // Get messages callback - returns empty array for now (could be integrated with chat)
  const getMessages = useCallback(() => {
    return [];
  }, []);

  // Restore files callback
  const onRestoreFiles = useCallback(async (restoredFiles: FileMap): Promise<void> => {
    /*
     * Update the files store directly
     * The workbenchStore.files is a reference to the filesStore.files
     */
    workbenchStore.files.set(restoredFiles);
  }, []);

  // Initialize the checkpoint hook
  const {
    checkpoints,
    checkpointCount,
    isRestoring,
    isLoading,
    error,
    currentCheckpointId,
    createCheckpoint,
    restoreCheckpoint,
    deleteCheckpoint,
    formatForTimeline,
  } = useCheckpoints({
    chatId: currentChatId ?? '',
    getFilesSnapshot,
    getMessages,
    onRestoreFiles,
    autoLoad: true,
  });

  // Handle create checkpoint
  const handleCreateCheckpoint = useCallback(async () => {
    if (!currentChatId) {
      toast.error('Impossible de créer un checkpoint: aucune conversation active');
      return;
    }

    try {
      const checkpoint = await createCheckpoint('Point de sauvegarde manuel', 'manual');

      if (checkpoint) {
        toast.success('Checkpoint créé avec succès');
      } else {
        toast.error('Échec de la création du checkpoint');
      }
    } catch (err) {
      logger.error('Failed to create checkpoint:', err);
      toast.error('Erreur lors de la création du checkpoint');
    }
  }, [currentChatId, createCheckpoint]);

  // Handle select checkpoint for restore
  const handleSelectCheckpoint = useCallback(
    (checkpointId: string) => {
      const checkpoint = checkpoints.find((cp) => cp.id === checkpointId);

      if (!checkpoint) {
        return;
      }

      const timeline = formatForTimeline(checkpoint);
      const modalCheckpoint: RestoreModalCheckpoint = {
        id: checkpoint.id,
        description: timeline.description,
        time: timeline.time,
        timeAgo: timeline.timeAgo,
        type: timeline.type,
        filesCount: Object.keys(checkpoint.filesSnapshot).length,
        messagesCount: checkpoint.messagesSnapshot.length,
        sizeLabel: timeline.sizeLabel,
      };

      setSelectedCheckpoint(modalCheckpoint);
      setIsRestoreModalOpen(true);
    },
    [checkpoints, formatForTimeline],
  );

  // Handle confirm restore
  const handleConfirmRestore = useCallback(
    async (options: RestoreOptions) => {
      if (!selectedCheckpoint) {
        return;
      }

      try {
        const result = await restoreCheckpoint(selectedCheckpoint.id, options);

        if (result.success) {
          toast.success(
            `Checkpoint restauré (${result.filesRestored} fichiers${
              options.restoreConversation ? `, ${result.messagesRestored} messages` : ''
            })`,
          );
          setIsRestoreModalOpen(false);
          setSelectedCheckpoint(null);
        } else {
          toast.error(`Échec de la restauration: ${result.error}`);
        }
      } catch (err) {
        logger.error('Failed to restore checkpoint:', err);
        toast.error('Erreur lors de la restauration');
      }
    },
    [selectedCheckpoint, restoreCheckpoint],
  );

  // Handle cancel restore
  const handleCancelRestore = useCallback(() => {
    setIsRestoreModalOpen(false);
    setSelectedCheckpoint(null);
  }, []);

  // Handle delete checkpoint
  const handleDeleteCheckpoint = useCallback(
    async (checkpointId: string) => {
      try {
        const deleted = await deleteCheckpoint(checkpointId);

        if (deleted) {
          toast.success('Checkpoint supprimé');
        } else {
          toast.error('Échec de la suppression');
        }
      } catch (err) {
        logger.error('Failed to delete checkpoint:', err);
        toast.error('Erreur lors de la suppression');
      }
    },
    [deleteCheckpoint],
  );

  // Format checkpoints for timeline display
  const timelineCheckpoints: TimelineCheckpoint[] = checkpoints.map((cp) => formatForTimeline(cp));

  // Don't render if no chat is active
  if (!currentChatId) {
    return null;
  }

  return (
    <>
      <div className={classNames('flex flex-col h-full', className)}>
        {/* Header */}
        <PanelHeader className="justify-between">
          <div className="flex items-center gap-1.5">
            <div className="i-ph:bookmark-simple-duotone shrink-0" />
            <span>Checkpoints</span>
            {checkpointCount > 0 && (
              <span className="text-xs text-bolt-elements-textTertiary">({checkpointCount})</span>
            )}
          </div>
          <div className="flex items-center gap-1">
            <CheckpointButton
              onCreateCheckpoint={handleCreateCheckpoint}
              disabled={disabled || isRestoring}
              isLoading={isLoading}
              checkpointCount={checkpointCount}
            />
            {!compact && (
              <IconButton
                icon={isPanelExpanded ? 'i-ph:caret-up' : 'i-ph:caret-down'}
                size="sm"
                onClick={() => setIsPanelExpanded(!isPanelExpanded)}
                title={isPanelExpanded ? 'Réduire' : 'Développer'}
              />
            )}
          </div>
        </PanelHeader>

        {/* Timeline (expandable in non-compact mode) */}
        <AnimatePresence>
          {(compact || isPanelExpanded) && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.15, ease: 'easeOut' }}
              className="overflow-hidden will-change-[height,opacity]"
            >
              <div className="p-2 max-h-[300px] overflow-y-auto">
                <CheckpointTimeline
                  checkpoints={timelineCheckpoints}
                  currentCheckpointId={currentCheckpointId}
                  onSelectCheckpoint={handleSelectCheckpoint}
                  onDeleteCheckpoint={handleDeleteCheckpoint}
                  disabled={disabled || isRestoring}
                  isLoading={isLoading}
                  compact={compact}
                />
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error display */}
        {error && <div className="px-2 py-1 text-xs text-red-500 bg-red-500/10">{error.message}</div>}
      </div>

      {/* Restore Modal */}
      <RestoreModal
        isOpen={isRestoreModalOpen}
        checkpoint={selectedCheckpoint}
        onConfirm={handleConfirmRestore}
        onCancel={handleCancelRestore}
        isLoading={isRestoring}
      />
    </>
  );
});

CheckpointsPanel.displayName = 'CheckpointsPanel';
