'use client';

/**
 * RestoreModal component for confirming checkpoint restoration.
 * Displays checkpoint details and restoration options before restoring.
 */

import { memo, useState, useCallback } from 'react';
import { AnimatePresence } from 'framer-motion';
import * as RadixDialog from '@radix-ui/react-dialog';
import { Dialog, DialogTitle, DialogDescription, DialogButton } from '~/components/ui/Dialog';
import { classNames } from '~/utils/classNames';
import type { RestoreOptions } from '~/types/checkpoint';

export interface RestoreModalCheckpoint {
  id: string;
  description: string;
  time: string;
  timeAgo: string;
  type: 'auto' | 'manual' | 'before_action';
  filesCount: number;
  messagesCount: number;
  sizeLabel: string;
}

export interface RestoreModalProps {
  /** Whether the modal is open */
  isOpen: boolean;

  /** Checkpoint to be restored */
  checkpoint?: RestoreModalCheckpoint | null;

  /** Callback when restore is confirmed */
  onConfirm?: (options: RestoreOptions) => void;

  /** Callback when modal is cancelled/closed */
  onCancel?: () => void;

  /** Whether restore operation is in progress */
  isLoading?: boolean;
}

/**
 * Get type label in French.
 */
function getTypeLabel(type: 'auto' | 'manual' | 'before_action'): string {
  switch (type) {
    case 'auto':
      return 'Automatique';
    case 'manual':
      return 'Manuel';
    case 'before_action':
      return 'Point de restauration';
    default:
      return type;
  }
}

/**
 * Modal component for confirming checkpoint restoration.
 */
export const RestoreModal = memo(
  ({ isOpen, checkpoint, onConfirm, onCancel, isLoading = false }: RestoreModalProps) => {
    // Restore options state
    const [restoreFiles, setRestoreFiles] = useState(true);
    const [restoreConversation, setRestoreConversation] = useState(false);
    const [createRestorePoint, setCreateRestorePoint] = useState(true);

    const handleConfirm = useCallback(() => {
      if (!checkpoint || isLoading) {
        return;
      }

      onConfirm?.({
        restoreFiles,
        restoreConversation,
        createRestorePoint,
      });
    }, [checkpoint, isLoading, onConfirm, restoreFiles, restoreConversation, createRestorePoint]);

    const handleOpenChange = useCallback(
      (open: boolean) => {
        if (!open && !isLoading) {
          onCancel?.();
        }
      },
      [isLoading, onCancel],
    );

    return (
      <RadixDialog.Root open={isOpen} onOpenChange={handleOpenChange}>
        <AnimatePresence>
          {isOpen && checkpoint && (
            <Dialog onBackdrop={isLoading ? undefined : onCancel} onClose={isLoading ? undefined : onCancel}>
              <DialogTitle>
                <span className="flex items-center gap-2">
                  <span className="i-ph:arrow-counter-clockwise text-bolt-elements-textSecondary" />
                  Restaurer le checkpoint
                </span>
              </DialogTitle>

              <DialogDescription asChild>
                <div className="space-y-4">
                  {/* Checkpoint info */}
                  <div className="p-3 bg-bolt-elements-background-depth-1 rounded-md border border-bolt-elements-borderColor">
                    <div className="font-medium text-bolt-elements-textPrimary mb-2">{checkpoint.description}</div>
                    <div className="flex flex-wrap gap-3 text-xs text-bolt-elements-textTertiary">
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <span className="i-ph:clock" />
                        {checkpoint.timeAgo}
                      </span>
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <span className="i-ph:tag" />
                        {getTypeLabel(checkpoint.type)}
                      </span>
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <span className="i-ph:file" />
                        {checkpoint.filesCount} fichiers
                      </span>
                      <span className="flex items-center gap-1 flex-shrink-0">
                        <span className="i-ph:chat-circle" />
                        {checkpoint.messagesCount} messages
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="i-ph:database" />
                        {checkpoint.sizeLabel}
                      </span>
                    </div>
                  </div>

                  {/* Restore options */}
                  <div className="space-y-3">
                    <p className="text-sm font-medium text-bolt-elements-textPrimary">Options de restauration</p>

                    {/* Restore files option */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={restoreFiles}
                        onChange={(e) => setRestoreFiles(e.target.checked)}
                        disabled={isLoading}
                        className="mt-0.5 accent-bolt-elements-item-contentAccent"
                      />
                      <div>
                        <span className="text-sm text-bolt-elements-textPrimary group-hover:text-bolt-elements-textPrimary">
                          Restaurer les fichiers
                        </span>
                        <p className="text-xs text-bolt-elements-textTertiary">
                          Remplace tous les fichiers du projet par ceux du checkpoint
                        </p>
                      </div>
                    </label>

                    {/* Restore conversation option */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={restoreConversation}
                        onChange={(e) => setRestoreConversation(e.target.checked)}
                        disabled={isLoading}
                        className="mt-0.5 accent-bolt-elements-item-contentAccent"
                      />
                      <div>
                        <span className="text-sm text-bolt-elements-textPrimary group-hover:text-bolt-elements-textPrimary">
                          Restaurer la conversation
                        </span>
                        <p className="text-xs text-bolt-elements-textTertiary">
                          Restaure l'historique de conversation à ce point
                        </p>
                      </div>
                    </label>

                    {/* Create restore point option */}
                    <label className="flex items-start gap-3 cursor-pointer group">
                      <input
                        type="checkbox"
                        checked={createRestorePoint}
                        onChange={(e) => setCreateRestorePoint(e.target.checked)}
                        disabled={isLoading}
                        className="mt-0.5 accent-bolt-elements-item-contentAccent"
                      />
                      <div>
                        <span className="text-sm text-bolt-elements-textPrimary group-hover:text-bolt-elements-textPrimary">
                          Créer un point de restauration
                        </span>
                        <p className="text-xs text-bolt-elements-textTertiary">
                          Sauvegarde l'état actuel avant la restauration
                        </p>
                      </div>
                    </label>
                  </div>

                  {/* Warning message */}
                  <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-md">
                    <span className="i-ph:warning text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-xs text-amber-600 dark:text-amber-400">
                      {createRestorePoint
                        ? 'Un point de restauration sera créé avant la restauration pour pouvoir annuler cette action.'
                        : 'Attention: sans point de restauration, cette action ne pourra pas être annulée.'}
                    </p>
                  </div>
                </div>
              </DialogDescription>

              {/* Footer with actions */}
              <div className="px-5 py-4 flex items-center justify-end gap-2 border-t border-bolt-elements-borderColor">
                <DialogButton type="secondary" onClick={onCancel}>
                  Annuler
                </DialogButton>
                <DialogButton type="primary" onClick={handleConfirm}>
                  {isLoading ? (
                    <span className="flex items-center gap-2">
                      <span className="i-ph:spinner-gap animate-spin" />
                      Restauration...
                    </span>
                  ) : (
                    'Restaurer'
                  )}
                </DialogButton>
              </div>
            </Dialog>
          )}
        </AnimatePresence>
      </RadixDialog.Root>
    );
  },
);

RestoreModal.displayName = 'RestoreModal';
