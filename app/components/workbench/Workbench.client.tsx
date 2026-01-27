'use client';

import { useStore } from '@nanostores/react';
import { atom, computed } from 'nanostores';
import { memo, useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import { toast } from 'react-toastify';
import {
  type OnChangeCallback as OnEditorChange,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror';
import { ErrorBoundary, MinimalErrorFallback } from '~/components/ui/ErrorBoundary';
import { IconButton } from '~/components/ui/IconButton';
import { workbenchStore, type WorkbenchViewType } from '~/lib/stores/workbench';
import { chatId } from '~/lib/persistence/useChatHistory';

// Atom for triggering preview reload from header (Preview.tsx subscribes to this)
// FIX: import.meta.hot.data is read-only, but we can set properties on it
export const previewReloadTrigger = import.meta.hot?.data?.previewReloadTrigger ?? atom(0);
if (import.meta.hot?.data) {
  import.meta.hot.data.previewReloadTrigger = previewReloadTrigger;
}

// Atom for triggering open in new tab from header (Preview.tsx subscribes to this)
export const previewOpenNewTabTrigger = import.meta.hot?.data?.previewOpenNewTabTrigger ?? atom(0);
if (import.meta.hot?.data) {
  import.meta.hot.data.previewOpenNewTabTrigger = previewOpenNewTabTrigger;
}

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

// BUGFIX: Improved HMR handling to prevent data loss and ensure re-sync
// The computed store is preserved across hot reloads via import.meta.hot.data
let workbenchState: WorkbenchStateStore;

if (import.meta.hot?.data.workbenchState) {
  // Reuse existing store from previous hot reload
  workbenchState = import.meta.hot.data.workbenchState as WorkbenchStateStore;
} else {
  // First load or cold start - create new store
  workbenchState = createWorkbenchState();
}

if (import.meta.hot) {
  // Store reference for next hot reload
  import.meta.hot.data.workbenchState = workbenchState;

  // Accept updates to this module without full page reload
  // This ensures the component re-renders with the preserved store
  import.meta.hot.accept();
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
import { FileBreadcrumb } from './FileBreadcrumb';
import { AgentProgressBanner } from './AgentWorkbenchIndicators';
import { DeviceSelector } from './DeviceSelector';
import { PortDropdown } from './PortDropdown';
import { ExpandableConnectors } from './ExpandableConnectors';

const logger = createScopedLogger('Workbench');

// Preview controls state - batched via useReducer for better performance
interface PreviewControlsState {
  activeIndex: number;
  url: string;
  isDropdownOpen: boolean;
  hasSelected: boolean;
}

type PreviewControlsAction =
  | { type: 'SET_ACTIVE_INDEX'; index: number }
  | { type: 'SET_URL'; url: string }
  | { type: 'SET_DROPDOWN_OPEN'; open: boolean }
  | { type: 'SET_HAS_SELECTED'; selected: boolean }
  | { type: 'BATCH_UPDATE'; partial: Partial<PreviewControlsState> };

const initialPreviewState: PreviewControlsState = {
  activeIndex: 0,
  url: '',
  isDropdownOpen: false,
  hasSelected: false,
};

function previewControlsReducer(state: PreviewControlsState, action: PreviewControlsAction): PreviewControlsState {
  switch (action.type) {
    case 'SET_ACTIVE_INDEX':
      return { ...state, activeIndex: action.index };
    case 'SET_URL':
      return { ...state, url: action.url };
    case 'SET_DROPDOWN_OPEN':
      return { ...state, isDropdownOpen: action.open };
    case 'SET_HAS_SELECTED':
      return { ...state, hasSelected: action.selected };
    case 'BATCH_UPDATE':
      return { ...state, ...action.partial };
    default:
      return state;
  }
}

interface WorkspaceProps {
  chatStarted?: boolean;
  isStreaming?: boolean;
}

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
  const checkpointDropdownRef = useRef<HTMLDivElement>(null);

  // Close checkpoint dropdown when clicking outside
  useEffect(() => {
    if (!showCheckpointTimeline) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (checkpointDropdownRef.current && !checkpointDropdownRef.current.contains(event.target as Node)) {
        setShowCheckpointTimeline(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showCheckpointTimeline]);

  // Preview controls state (for unified header) - batched via useReducer
  const previews = useStore(workbenchStore.previews);
  const [previewState, dispatchPreview] = useReducer(previewControlsReducer, initialPreviewState);
  const { activeIndex: activePreviewIndex, url: previewUrl, isDropdownOpen: isPortDropdownOpen, hasSelected: hasSelectedPreview } = previewState;
  const portDropdownRef = useRef<HTMLDivElement>(null);

  // Stable setters that use the reducer
  const setActivePreviewIndex = useCallback((index: number) => dispatchPreview({ type: 'SET_ACTIVE_INDEX', index }), []);
  const setPreviewUrl = useCallback((url: string) => dispatchPreview({ type: 'SET_URL', url }), []);
  const setIsPortDropdownOpen = useCallback((open: boolean) => dispatchPreview({ type: 'SET_DROPDOWN_OPEN', open }), []);
  const setHasSelectedPreview = useCallback((selected: boolean) => dispatchPreview({ type: 'SET_HAS_SELECTED', selected }), []);

  // Active preview derived state
  const activePreview = previews[activePreviewIndex];

  // Update preview URL when active preview changes
  useEffect(() => {
    if (activePreview?.baseUrl) {
      dispatchPreview({ type: 'SET_URL', url: activePreview.baseUrl });
    }
  }, [activePreview?.baseUrl]);

  // Auto-select lowest port when previews change
  useEffect(() => {
    if (previews.length > 1 && !hasSelectedPreview) {
      const minPortIndex = previews.reduce(
        (minIdx: number, preview: { port: number }, idx: number, arr: Array<{ port: number }>) =>
          preview.port < arr[minIdx].port ? idx : minIdx,
        0
      );
      dispatchPreview({ type: 'SET_ACTIVE_INDEX', index: minPortIndex });
    }
  }, [previews, hasSelectedPreview]);

  // Handle reload preview
  const handleReloadPreview = useCallback(() => {
    previewReloadTrigger.set(previewReloadTrigger.get() + 1);
  }, []);

  // Handle open in new tab (triggers Preview.tsx to handle it properly)
  const handleOpenInNewTab = useCallback(() => {
    previewOpenNewTabTrigger.set(previewOpenNewTabTrigger.get() + 1);
  }, []);

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

  // Compute active file segments for breadcrumb (moved from EditorPanel)
  const activeFileSegments = useMemo(() => {
    if (!currentDocument) {
      return undefined;
    }
    return currentDocument.filePath.split('/');
  }, [currentDocument]);

  // Check if current file has unsaved changes
  const activeFileUnsaved = useMemo(() => {
    return currentDocument !== undefined && unsavedFiles?.has(currentDocument.filePath);
  }, [currentDocument, unsavedFiles]);

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
            {/* Unified Header - Single Line (48px) */}
            <div className="flex items-center px-3 bg-bolt-elements-background-depth-2 border-b border-bolt-elements-borderColor h-[48px] gap-2">
              {/* Left: View Toggle (Code + Eye icons in same container) */}
              <div className="flex items-center shrink-0 bg-[var(--bolt-bg-base,#050506)] rounded-lg p-[3px] border border-bolt-elements-borderColor gap-0.5">
                {/* Code icon */}
                <button
                  onClick={() => setSelectedView('code')}
                  className={classNames(
                    'flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150',
                    selectedView === 'code'
                      ? 'bg-[var(--bolt-bg-header,#141417)] shadow-[0_1px_2px_rgba(0,0,0,0.3)] text-[#38bdf8]'
                      : 'bg-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                  )}
                  title="Code"
                >
                  <div className="i-ph:code text-sm" />
                </button>
                {/* Eye icon (Preview) */}
                <button
                  onClick={() => setSelectedView('preview')}
                  className={classNames(
                    'flex items-center justify-center w-7 h-7 rounded-md transition-all duration-150',
                    selectedView === 'preview'
                      ? 'bg-[var(--bolt-bg-header,#141417)] shadow-[0_1px_2px_rgba(0,0,0,0.3)] text-[#38bdf8]'
                      : 'bg-transparent text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                  )}
                  title="Aperçu"
                >
                  <div className="i-ph:eye text-sm" />
                </button>
              </div>

              {/* Expandable Connectors */}
              <ExpandableConnectors />

              {/* Agent Progress - compact indicator */}
              <AgentProgressBanner compact />

              {/* Divider */}
              <div className="w-px h-5 bg-bolt-elements-borderColor flex-shrink-0" />

              {/* Center: Context-dependent controls */}
              {selectedView === 'code' ? (
                /* Code mode: File Breadcrumb + Save */
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  {activeFileSegments?.length ? (
                    <>
                      <div className="flex-1 min-w-0 overflow-hidden">
                        <FileBreadcrumb
                          pathSegments={activeFileSegments}
                          files={files}
                          onFileSelect={onFileSelect}
                        />
                      </div>
                      {activeFileUnsaved && (
                        <IconButton
                          icon="i-ph:floppy-disk"
                          className="!bg-[rgba(14,165,233,0.1)] hover:!bg-[rgba(14,165,233,0.2)] !text-[#38bdf8]"
                          size="md"
                          title="Enregistrer (⌘S)"
                          onClick={onFileSave}
                        />
                      )}
                    </>
                  ) : (
                    <div className="flex-1" />
                  )}
                </div>
              ) : (
                /* Preview mode: Reload, NewTab, URL, Port, Device */
                <div className="flex-1 min-w-0 flex items-center gap-2">
                  <IconButton
                    icon="i-ph:arrow-clockwise"
                    title="Recharger"
                    onClick={handleReloadPreview}
                    size="md"
                    className="!bg-transparent hover:!bg-bolt-elements-background-depth-3"
                  />
                  <IconButton
                    icon="i-ph:arrow-square-out"
                    title="Nouvel onglet"
                    onClick={handleOpenInNewTab}
                    disabled={!activePreview?.ready}
                    size="md"
                    className="!bg-transparent hover:!bg-bolt-elements-background-depth-3"
                  />
                  {/* URL Bar */}
                  <div className="flex-1 min-w-0 flex items-center gap-1.5 bg-bolt-elements-background-depth-1 border border-bolt-elements-borderColor rounded-lg px-2.5 h-[28px] text-[11px] font-mono">
                    <div className="i-ph:globe-simple text-bolt-elements-textMuted text-xs flex-shrink-0" />
                    <span className="truncate text-bolt-elements-textSecondary">
                      {previewUrl || 'Aucun aperçu'}
                    </span>
                  </div>
                  {/* Port Dropdown */}
                  {previews.length > 1 && (
                    <div ref={portDropdownRef}>
                      <PortDropdown
                        activePreviewIndex={activePreviewIndex}
                        setActivePreviewIndex={setActivePreviewIndex}
                        isDropdownOpen={isPortDropdownOpen}
                        setHasSelectedPreview={setHasSelectedPreview}
                        setIsDropdownOpen={setIsPortDropdownOpen}
                        previews={previews}
                      />
                    </div>
                  )}
                  {/* Device Selector */}
                  <DeviceSelector />
                </div>
              )}

              {/* Divider */}
              <div className="w-px h-5 bg-bolt-elements-borderColor flex-shrink-0" />

              {/* Right: Actions */}
              {currentChatId && (
                <div ref={checkpointDropdownRef} className="relative">
                  <button
                    onClick={() => setShowCheckpointTimeline(!showCheckpointTimeline)}
                    disabled={isRestoring}
                    className={classNames(
                      'flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      'bg-bolt-elements-background-depth-3 hover:bg-bolt-elements-background-depth-4',
                      'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
                      { 'opacity-50 cursor-not-allowed': isRestoring }
                    )}
                  >
                    <div className="i-ph:clock-counter-clockwise" />
                    {checkpointCount > 0 && (
                      <span className="bg-[rgba(14,165,233,0.2)] text-[#38bdf8] text-[10px] px-1.5 py-0.5 rounded font-semibold">
                        {checkpointCount}
                      </span>
                    )}
                  </button>
                  {/* Checkpoint Timeline Dropdown */}
                  {showCheckpointTimeline && (
                    <div className="absolute top-full right-0 mt-2 w-80 bg-[var(--bolt-glass-background-elevated)] backdrop-blur-[var(--bolt-glass-blur-strong)] border border-[var(--bolt-glass-border)] rounded-xl shadow-[var(--bolt-glass-shadow)] z-50 overflow-hidden">
                      <div className="p-2 border-b border-bolt-elements-borderColor">
                        <button
                          onClick={handleCreateCheckpoint}
                          disabled={isRestoring || isCheckpointLoading}
                          className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-xs font-medium bg-[rgba(14,165,233,0.1)] hover:bg-[rgba(14,165,233,0.2)] text-[#38bdf8] transition-colors"
                        >
                          <div className="i-ph:plus-circle" />
                          Créer un checkpoint
                        </button>
                      </div>
                      <div className="max-h-72 overflow-y-auto p-2">
                        {checkpointCount > 0 ? (
                          <CheckpointTimeline
                            checkpoints={timelineCheckpoints}
                            currentCheckpointId={currentCheckpointId}
                            onSelectCheckpoint={handleSelectCheckpoint}
                            onDeleteCheckpoint={handleDeleteCheckpoint}
                            disabled={isRestoring}
                            isLoading={isCheckpointLoading}
                          />
                        ) : (
                          <div className="text-center py-4 text-xs text-bolt-elements-textTertiary">
                            Aucun checkpoint
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Terminal - icon only (Code mode) */}
              {selectedView === 'code' && (
                <IconButton
                  icon="i-ph:terminal"
                  className="!bg-transparent hover:!bg-bolt-elements-background-depth-3"
                  size="md"
                  title="Terminal"
                  onClick={() => workbenchStore.toggleTerminal(!workbenchStore.showTerminal.get())}
                />
              )}

              {/* Close button */}
              <IconButton
                icon="i-ph:x"
                className="!bg-transparent hover:!bg-[rgba(239,68,68,0.15)] hover:!text-[#ef4444]"
                size="md"
                title="Fermer"
                onClick={() => workbenchStore.showWorkbench.set(false)}
              />
            </div>
            <div className="relative flex-1 overflow-hidden" style={{ isolation: 'isolate' }}>
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
 * Uses visibility:hidden for inactive views to prevent rendering.
 */
const View = memo(({ children, position, active }: ViewProps) => {
  return (
    <div
      className="absolute inset-0"
      style={{
        visibility: active ? 'visible' : 'hidden',
        pointerEvents: active ? 'auto' : 'none',
        zIndex: active ? 1 : 0,
      }}
    >
      {children}
    </div>
  );
});
