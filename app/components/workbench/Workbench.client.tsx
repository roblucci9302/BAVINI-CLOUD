'use client';

import { useStore } from '@nanostores/react';
import { computed } from 'nanostores';
import { memo, useCallback, useEffect, useState } from 'react';
import { toast } from 'react-toastify';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror';
import { ErrorBoundary, MinimalErrorFallback } from '~/components/ui/ErrorBoundary';
import { IconButton } from '~/components/ui/IconButton';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { Slider, type SliderOptions } from '~/components/ui/Slider';
import { workbenchStore, type WorkbenchViewType } from '~/lib/stores/workbench';
import { chatId } from '~/lib/persistence/useChatHistory';

// Define the type for workbench state
interface WorkbenchStateValue {
  hasPreview: boolean;
  showWorkbench: boolean;
  selectedFile: string | undefined;
  currentDocument: import('~/components/editor/codemirror/types').EditorDocument | undefined;
  unsavedFiles: Set<string>;
  files: import('~/lib/stores/files').FileMap;
  selectedView: WorkbenchViewType;
}

// Combined computed store to reduce re-renders (single subscription instead of 7)
// Preserved across HMR to prevent hook instability
function createWorkbenchState() {
  return computed(
    [
      workbenchStore.previews,
      workbenchStore.showWorkbench,
      workbenchStore.selectedFile,
      workbenchStore.currentDocument,
      workbenchStore.unsavedFiles,
      workbenchStore.files,
      workbenchStore.currentView,
    ],
    (previews, showWorkbench, selectedFile, currentDocument, unsavedFiles, files, currentView): WorkbenchStateValue => ({
      hasPreview: previews.length > 0,
      showWorkbench,
      selectedFile,
      currentDocument,
      unsavedFiles,
      files,
      selectedView: currentView,
    }),
  );
}

type WorkbenchStateStore = ReturnType<typeof createWorkbenchState>;

const workbenchState: WorkbenchStateStore =
  (import.meta.hot?.data.workbenchState as WorkbenchStateStore | undefined) ?? createWorkbenchState();

if (import.meta.hot) {
  import.meta.hot.data.workbenchState = workbenchState;
}
import { useCheckpoints } from '~/lib/hooks/useCheckpoints';
import { useAutoCheckpoint } from '~/lib/hooks/useAutoCheckpoint';
import type { FileMap } from '~/lib/stores/files';
import type { RestoreOptions } from '~/types/checkpoint';
import { classNames } from '~/utils/classNames';
import { createScopedLogger, renderLogger } from '~/utils/logger';
import { EditorPanel } from './EditorPanel';
import { Preview } from './Preview';
import { CheckpointButton } from './CheckpointButton';
import { CheckpointTimeline, type TimelineCheckpoint } from './CheckpointTimeline';
import { RestoreModal, type RestoreModalCheckpoint } from './RestoreModal';
import { ConnectorQuickLinks } from './ConnectorQuickLinks';
import { AgentProgressBanner, WorkbenchAgentStatus } from './AgentWorkbenchIndicators';

const logger = createScopedLogger('Workbench');

interface WorkspaceProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
}

const sliderOptions: SliderOptions<WorkbenchViewType> = {
  left: {
    value: 'code',
    text: 'Code',
  },
  right: {
    value: 'preview',
    text: 'Aperçu',
  },
};

export const Workbench = memo(({ chatStarted, isStreaming }: WorkspaceProps) => {
  renderLogger.trace('Workbench');

  // Single subscription to combined workbench state (performance optimization)
  const { hasPreview, showWorkbench, selectedFile, currentDocument, unsavedFiles, files, selectedView } =
    useStore(workbenchState);

  // Separate subscription for chatId (different store)
  const currentChatId = useStore(chatId);

  useEffect(() => {
    logger.debug('Workbench state changed', { showWorkbench, chatStarted, hasPreview });
  }, [showWorkbench, chatStarted, hasPreview]);

  // Checkpoint state
  const [isRestoreModalOpen, setIsRestoreModalOpen] = useState(false);
  const [selectedCheckpoint, setSelectedCheckpoint] = useState<RestoreModalCheckpoint | null>(null);
  const [showCheckpointTimeline, setShowCheckpointTimeline] = useState(false);

  // Checkpoint callbacks
  const getFilesSnapshot = useCallback((): FileMap => {
    return workbenchStore.files.get();
  }, []);

  const getMessages = useCallback(() => {
    return [];
  }, []);

  const onRestoreFiles = useCallback(async (restoredFiles: FileMap): Promise<void> => {
    // Restore files with WebContainer synchronization
    const result = await workbenchStore.restoreFromSnapshot(restoredFiles);
    logger.info(`Restored ${result.filesWritten} files, deleted ${result.filesDeleted} files`);
  }, []);

  // Initialize checkpoints hook
  const {
    checkpoints,
    checkpointCount,
    isRestoring,
    isLoading: isCheckpointLoading,
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

  // Auto-checkpoint on significant file changes
  const handleAutoCheckpoint = useCallback(
    async (description: string) => {
      if (!currentChatId) {
        return;
      }

      try {
        await createCheckpoint(description, 'auto');
        logger.debug('Auto-checkpoint created');
      } catch (error) {
        logger.error('Failed to create auto-checkpoint:', error);
      }
    },
    [currentChatId, createCheckpoint],
  );

  // Initialize auto-checkpoint hook
  const { resetBaseline } = useAutoCheckpoint({
    onCreateCheckpoint: handleAutoCheckpoint,
    enabled: !!currentChatId && !isStreaming,
    minChangedFiles: 3,
    minChangedBytes: 1024,
    debounceMs: 10000, // 10 seconds after last change
  });

  // Reset baseline after manual checkpoint
  const handleCreateCheckpoint = useCallback(async () => {
    if (!currentChatId) {
      toast.error('Aucune conversation active');
      return;
    }

    try {
      const checkpoint = await createCheckpoint('Point de sauvegarde manuel', 'manual');

      if (checkpoint) {
        toast.success('Checkpoint créé');
        resetBaseline(); // Reset auto-checkpoint baseline
      }
    } catch {
      toast.error('Erreur lors de la création');
    }
  }, [currentChatId, createCheckpoint, resetBaseline]);

  const handleSelectCheckpoint = useCallback(
    (checkpointId: string) => {
      const checkpoint = checkpoints.find((cp) => cp.id === checkpointId);

      if (!checkpoint) {
        return;
      }

      const timeline = formatForTimeline(checkpoint);
      setSelectedCheckpoint({
        id: checkpoint.id,
        description: timeline.description,
        time: timeline.time,
        timeAgo: timeline.timeAgo,
        type: timeline.type,
        filesCount: Object.keys(checkpoint.filesSnapshot).length,
        messagesCount: checkpoint.messagesSnapshot.length,
        sizeLabel: timeline.sizeLabel,
      });
      setIsRestoreModalOpen(true);
    },
    [checkpoints, formatForTimeline],
  );

  const handleConfirmRestore = useCallback(
    async (options: RestoreOptions) => {
      if (!selectedCheckpoint) {
        return;
      }

      try {
        const result = await restoreCheckpoint(selectedCheckpoint.id, options);

        if (result.success) {
          toast.success(`Restauré: ${result.filesRestored} fichiers`);
          setIsRestoreModalOpen(false);
          setSelectedCheckpoint(null);
        } else {
          toast.error(`Échec: ${result.error}`);
        }
      } catch {
        toast.error('Erreur lors de la restauration');
      }
    },
    [selectedCheckpoint, restoreCheckpoint],
  );

  const handleDeleteCheckpoint = useCallback(
    async (checkpointId: string) => {
      try {
        const deleted = await deleteCheckpoint(checkpointId);

        if (deleted) {
          toast.success('Checkpoint supprimé');
        }
      } catch {
        toast.error('Erreur lors de la suppression');
      }
    },
    [deleteCheckpoint],
  );

  const timelineCheckpoints: TimelineCheckpoint[] = checkpoints.map((cp) => formatForTimeline(cp));

  const setSelectedView = useCallback((view: WorkbenchViewType) => {
    workbenchStore.currentView.set(view);
  }, []);

  useEffect(() => {
    if (hasPreview) {
      setSelectedView('preview');
    }
  }, [hasPreview, setSelectedView]);

  useEffect(() => {
    workbenchStore.setDocuments(files);
  }, [files]);

  const onEditorChange = useCallback<OnEditorChange>((update) => {
    workbenchStore.setCurrentDocumentContent(update.content);
  }, []);

  const onEditorScroll = useCallback<OnEditorScroll>((position) => {
    workbenchStore.setCurrentDocumentScrollPosition(position);
  }, []);

  const onFileSelect = useCallback((filePath: string | undefined) => {
    workbenchStore.setSelectedFile(filePath);
  }, []);

  const onFileSave = useCallback(() => {
    workbenchStore.saveCurrentDocument().catch(() => {
      toast.error('Échec de la mise à jour du fichier');
    });
  }, []);

  const onFileReset = useCallback(() => {
    workbenchStore.resetCurrentDocument();
  }, []);

  /*
   * Always render workbench component to avoid re-mount issues
   * The visibility is controlled by motion.div animation (open/closed variants)
   */

  // Debug: log showWorkbench value
  logger.debug('Rendering Workbench', { showWorkbench, chatStarted, hasPreview });

  return (
    <>
      <div
        className="z-workbench w-full h-full overflow-hidden flex flex-col bg-bolt-elements-background-depth-1 border-l border-bolt-elements-borderColor"
      >
            <div className="flex items-center px-4 py-2.5 bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor min-h-[52px]">
              <Slider selected={selectedView} options={sliderOptions} setSelected={setSelectedView} />
              <AgentProgressBanner compact className="ml-2" />
              <ConnectorQuickLinks />
              <WorkbenchAgentStatus className="ml-3 mr-2" />
              <div className="ml-auto" />
              {selectedView === 'code' && (
                <>
                  {currentChatId && (
                    <div className="relative">
                      <CheckpointButton
                        onCreateCheckpoint={handleCreateCheckpoint}
                        disabled={isRestoring}
                        isLoading={isCheckpointLoading}
                        checkpointCount={checkpointCount}
                        className="mr-1 text-sm"
                      />
                      {showCheckpointTimeline && checkpointCount > 0 && (
                        <div className="absolute top-full right-0 mt-2 w-80 bg-[var(--bolt-glass-background-elevated)] backdrop-blur-[var(--bolt-glass-blur-strong)] border border-[var(--bolt-glass-border)] rounded-xl shadow-[var(--bolt-glass-shadow)] z-50 overflow-hidden">
                          <div className="max-h-80 overflow-y-auto p-2.5">
                            <CheckpointTimeline
                              checkpoints={timelineCheckpoints}
                              currentCheckpointId={currentCheckpointId}
                              onSelectCheckpoint={handleSelectCheckpoint}
                              onDeleteCheckpoint={handleDeleteCheckpoint}
                              disabled={isRestoring}
                              isLoading={isCheckpointLoading}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  {checkpointCount > 0 && (
                    <PanelHeaderButton
                      className="mr-1 text-sm"
                      onClick={() => setShowCheckpointTimeline(!showCheckpointTimeline)}
                    >
                      <div className="i-ph:clock-counter-clockwise" />
                      Historique
                      <span className="text-xs opacity-60">({checkpointCount})</span>
                    </PanelHeaderButton>
                  )}
                  <PanelHeaderButton
                    className="mr-1 text-sm"
                    onClick={() => {
                      workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get());
                    }}
                  >
                    <div className="i-ph:terminal" />
                    Terminal
                  </PanelHeaderButton>
                </>
              )}
              <IconButton
                icon="i-ph:x-circle"
                className="-mr-1 !bg-transparent hover:!bg-[rgba(239,68,68,0.15)] hover:!text-[#ef4444]"
                size="xl"
                title="Fermer le code"
                onClick={() => {
                  workbenchStore.showWorkbench.set(false);
                }}
              />
            </div>
            <div className="relative flex-1 overflow-hidden">
              <View position="left" active={selectedView === 'code'}>
                <ErrorBoundary
                  fallback={<MinimalErrorFallback />}
                  onError={(error) => {
                    logger.error('Editor panel error:', error);
                  }}
                >
                  <EditorPanel
                    editorDocument={currentDocument}
                    isStreaming={isStreaming}
                    selectedFile={selectedFile}
                    files={files}
                    unsavedFiles={unsavedFiles}
                    onFileSelect={onFileSelect}
                    onEditorScroll={onEditorScroll}
                    onEditorChange={onEditorChange}
                    onFileSave={onFileSave}
                    onFileReset={onFileReset}
                  />
                </ErrorBoundary>
              </View>
              <View position="right" active={selectedView === 'preview'}>
                <ErrorBoundary
                  fallback={<MinimalErrorFallback />}
                  onError={(error) => {
                    logger.error('Preview error:', error);
                  }}
                >
                  <Preview />
                </ErrorBoundary>
              </View>
            </div>
      </div>

      {/* Restore Modal */}
      <RestoreModal
        isOpen={isRestoreModalOpen}
        checkpoint={selectedCheckpoint}
        onConfirm={handleConfirmRestore}
        onCancel={() => {
          setIsRestoreModalOpen(false);
          setSelectedCheckpoint(null);
        }}
        isLoading={isRestoring}
      />
    </>
  );
});

interface ViewProps {
  children: JSX.Element;
  position: 'left' | 'right';
  active: boolean;
}

/**
 * View - Panel container with CSS-only sliding animation
 *
 * IMPORTANT: Uses CSS transitions instead of framer-motion to prevent
 * layout measurements from propagating across the component tree.
 * Only transforms translateX which doesn't cause layout thrashing.
 */
const View = memo(({ children, position, active }: ViewProps) => {
  const translateX = active ? '0%' : position === 'left' ? '-100%' : '100%';

  return (
    <div
      className="absolute inset-0 transition-transform duration-200 ease-out"
      style={{ transform: `translateX(${translateX})` }}
    >
      {children}
    </div>
  );
});
