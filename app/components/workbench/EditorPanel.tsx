'use client';

import { useStore } from '@nanostores/react';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels';
import {
  CodeMirrorEditor,
  type EditorDocument,
  type EditorSettings,
  type OnChangeCallback as OnEditorChange,
  type OnSaveCallback as OnEditorSave,
  type OnScrollCallback as OnEditorScroll,
} from '~/components/editor/codemirror';
import { DiffViewer } from '~/components/editor/DiffViewer';
import { IconButton } from '~/components/ui/IconButton';
import { PanelHeader } from '~/components/ui/PanelHeader';
import { PanelHeaderButton } from '~/components/ui/PanelHeaderButton';
import { shortcutEventEmitter } from '~/lib/hooks';
import type { FileMap } from '~/lib/stores/files';
import { themeStore } from '~/lib/stores/theme';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { WORK_DIR } from '~/utils/constants';
import { renderLogger } from '~/utils/logger';
import { isMobile } from '~/utils/mobile';
import { FileBreadcrumb } from './FileBreadcrumb';
import { FileTree } from './FileTree';
import { Terminal, type TerminalRef } from './terminal/Terminal';
import { EditorAgentOverlay, TerminalAgentIndicator } from './AgentWorkbenchIndicators';

interface EditorPanelProps {
  files?: FileMap;
  unsavedFiles?: Set<string>;
  editorDocument?: EditorDocument;
  selectedFile?: string | undefined;
  isStreaming?: boolean;
  onEditorChange?: OnEditorChange;
  onEditorScroll?: OnEditorScroll;
  onFileSelect?: (value?: string) => void;
  onFileSave?: OnEditorSave;
  onFileReset?: () => void;
}

const MAX_TERMINALS = 3;
const DEFAULT_TERMINAL_SIZE = 25;
const DEFAULT_EDITOR_SIZE = 100 - DEFAULT_TERMINAL_SIZE;

const editorSettings: EditorSettings = { tabSize: 2 };

export const EditorPanel = memo(
  ({
    files,
    unsavedFiles,
    editorDocument,
    selectedFile,
    isStreaming,
    onFileSelect,
    onEditorChange,
    onEditorScroll,
    onFileSave,
    onFileReset,
  }: EditorPanelProps) => {
    renderLogger.trace('EditorPanel');

    const theme = useStore(themeStore);
    const showTerminal = useStore(workbenchStore.showTerminal);

    const terminalRefs = useRef<Array<TerminalRef | null>>([]);
    const terminalPanelRef = useRef<ImperativePanelHandle>(null);
    const terminalToggledByShortcut = useRef(false);

    const [activeTerminal, setActiveTerminal] = useState(0);
    const [terminalCount, setTerminalCount] = useState(1);

    const activeFileSegments = useMemo(() => {
      if (!editorDocument) {
        return undefined;
      }

      return editorDocument.filePath.split('/');
    }, [editorDocument]);

    const activeFileUnsaved = useMemo(() => {
      return editorDocument !== undefined && unsavedFiles?.has(editorDocument.filePath);
    }, [editorDocument, unsavedFiles]);

    // Diff view state
    const [showDiff, setShowDiff] = useState(false);

    // Get original content for diff view
    const originalContent = useMemo(() => {
      if (!editorDocument?.filePath) {
        return undefined;
      }

      return workbenchStore.getOriginalContent(editorDocument.filePath);
    }, [editorDocument?.filePath]);

    const canShowDiff = originalContent !== undefined && editorDocument !== undefined;

    // Reset diff view when file changes
    useEffect(() => {
      setShowDiff(false);
    }, [editorDocument?.filePath]);

    useEffect(() => {
      const unsubscribeFromEventEmitter = shortcutEventEmitter.on('toggleTerminal', () => {
        terminalToggledByShortcut.current = true;
      });

      const unsubscribeFromThemeStore = themeStore.subscribe(() => {
        for (const ref of Object.values(terminalRefs.current)) {
          ref?.reloadStyles();
        }
      });

      return () => {
        unsubscribeFromEventEmitter();
        unsubscribeFromThemeStore();
      };
    }, []);

    useEffect(() => {
      const { current: terminal } = terminalPanelRef;

      if (!terminal) {
        return;
      }

      const isCollapsed = terminal.isCollapsed();

      if (!showTerminal && !isCollapsed) {
        terminal.collapse();
      } else if (showTerminal && isCollapsed) {
        terminal.resize(DEFAULT_TERMINAL_SIZE);
      }

      terminalToggledByShortcut.current = false;
    }, [showTerminal]);

    const addTerminal = () => {
      if (terminalCount < MAX_TERMINALS) {
        setTerminalCount(terminalCount + 1);
        setActiveTerminal(terminalCount);
      }
    };

    // Keyboard navigation for terminal tabs (WAI-ARIA Tabs Pattern)
    const handleTabKeyDown = useCallback(
      (event: React.KeyboardEvent) => {
        const { key } = event;
        let newIndex = activeTerminal;

        if (key === 'ArrowRight' || key === 'ArrowDown') {
          event.preventDefault();
          newIndex = (activeTerminal + 1) % terminalCount;
        } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
          event.preventDefault();
          newIndex = (activeTerminal - 1 + terminalCount) % terminalCount;
        } else if (key === 'Home') {
          event.preventDefault();
          newIndex = 0;
        } else if (key === 'End') {
          event.preventDefault();
          newIndex = terminalCount - 1;
        }

        if (newIndex !== activeTerminal) {
          setActiveTerminal(newIndex);

          // Focus the new tab
          const newTab = document.getElementById(`terminal-tab-${newIndex}`);
          newTab?.focus();
        }
      },
      [activeTerminal, terminalCount],
    );

    return (
      <PanelGroup direction="vertical">
        <Panel defaultSize={showTerminal ? DEFAULT_EDITOR_SIZE : 100} minSize={20}>
          <PanelGroup direction="horizontal">
            <Panel defaultSize={20} minSize={10} collapsible>
              <div className="flex flex-col border-r border-bolt-elements-borderColor h-full bg-[var(--bolt-bg-panel,#0f0f11)]">
                <PanelHeader>
                  <div className="i-ph:folder-simple-duotone shrink-0 opacity-60" />
                  Fichiers
                </PanelHeader>
                <div className="flex-1 overflow-y-auto">
                  <FileTree
                    files={files}
                    hideRoot
                    unsavedFiles={unsavedFiles}
                    rootFolder={WORK_DIR}
                    selectedFile={selectedFile}
                    onFileSelect={onFileSelect}
                  />
                </div>
              </div>
            </Panel>
            <PanelResizeHandle />
            <Panel className="flex flex-col" defaultSize={80} minSize={20}>
              <PanelHeader className="overflow-x-auto">
                {activeFileSegments?.length && (
                  <div className="flex items-center flex-1 text-sm">
                    <FileBreadcrumb pathSegments={activeFileSegments} files={files} onFileSelect={onFileSelect} />
                    <div className="flex gap-1 ml-auto -mr-1.5">
                      {/* Diff toggle button - only show when file has modifications */}
                      {canShowDiff && (
                        <PanelHeaderButton
                          onClick={() => setShowDiff(!showDiff)}
                          className={classNames({ 'bg-bolt-elements-background-depth-3': showDiff })}
                        >
                          <div className="i-ph:git-diff" />
                          {showDiff ? 'Éditeur' : 'Diff'}
                        </PanelHeaderButton>
                      )}
                      {activeFileUnsaved && (
                        <>
                          <PanelHeaderButton onClick={onFileSave}>
                            <div className="i-ph:floppy-disk-duotone" />
                            Enregistrer
                          </PanelHeaderButton>
                          <PanelHeaderButton onClick={onFileReset}>
                            <div className="i-ph:clock-counter-clockwise-duotone" />
                            Réinitialiser
                          </PanelHeaderButton>
                        </>
                      )}
                    </div>
                  </div>
                )}
              </PanelHeader>
              <div className="h-full flex-1 overflow-hidden relative">
                {showDiff && canShowDiff && editorDocument ? (
                  <DiffViewer
                    originalContent={originalContent}
                    modifiedContent={editorDocument.value}
                    fileName={editorDocument.filePath.split('/').pop()}
                  />
                ) : (
                  <CodeMirrorEditor
                    theme={theme}
                    editable={!isStreaming && editorDocument !== undefined}
                    settings={editorSettings}
                    doc={editorDocument}
                    autoFocusOnDocumentChange={!isMobile()}
                    onScroll={onEditorScroll}
                    onChange={onEditorChange}
                    onSave={onFileSave}
                  />
                )}
                <EditorAgentOverlay filePath={editorDocument?.filePath} />
              </div>
            </Panel>
          </PanelGroup>
        </Panel>
        <PanelResizeHandle />
        <Panel
          ref={terminalPanelRef}
          defaultSize={showTerminal ? DEFAULT_TERMINAL_SIZE : 0}
          minSize={10}
          collapsible
          onResize={(size) => {
            if (!terminalToggledByShortcut.current) {
              const isCollapsed = size === 0 || size < 1;
              workbenchStore.toggleTerminal(!isCollapsed);
            }
          }}
        >
          <div className="h-full">
            <div className="bg-[var(--bolt-bg-base,#050506)] h-full flex flex-col">
              <div
                className="flex items-center bg-[var(--bolt-bg-panel,#0f0f11)] border-y border-bolt-elements-borderColor gap-2 min-h-[38px] px-3.5 py-2"
                role="tablist"
                aria-label="Onglets des terminaux"
                onKeyDown={handleTabKeyDown}
              >
                <div className="flex items-center bg-[var(--bolt-bg-base,#050506)] rounded-[8px] p-0.5 gap-0.5 border border-bolt-elements-borderColor">
                  {Array.from({ length: terminalCount }, (_, index) => {
                    const isActive = activeTerminal === index;
                    const tabId = `terminal-tab-${index}`;
                    const panelId = `terminal-panel-${index}`;

                    return (
                      <button
                        key={index}
                        id={tabId}
                        role="tab"
                        aria-selected={isActive}
                        aria-controls={panelId}
                        tabIndex={isActive ? 0 : -1}
                        className={classNames(
                          'flex items-center text-xs cursor-pointer gap-1.5 px-2.5 py-[5px] whitespace-nowrap rounded-[4px] transition-colors duration-150',
                          {
                            'bg-[var(--bolt-bg-header,#141417)] text-bolt-elements-textPrimary': isActive,
                            'text-bolt-elements-textTertiary hover:text-bolt-elements-textSecondary': !isActive,
                          },
                        )}
                        onClick={() => setActiveTerminal(index)}
                      >
                        <div className="i-ph:terminal-window text-sm" aria-hidden="true" />
                        Terminal {terminalCount > 1 && index + 1}
                      </button>
                    );
                  })}
                </div>
                {terminalCount < MAX_TERMINALS && (
                  <button
                    onClick={addTerminal}
                    className="flex items-center justify-center w-[26px] h-[26px] bg-transparent border-none rounded-[8px] text-bolt-elements-textTertiary hover:bg-[var(--bolt-bg-hover,#1a1a1e)] hover:text-bolt-elements-textSecondary transition-colors duration-150"
                    title="Ajouter un terminal"
                  >
                    <div className="i-ph:plus text-sm" />
                  </button>
                )}
                <TerminalAgentIndicator className="mx-2" />
                <IconButton
                  className="ml-auto !bg-transparent hover:!bg-[var(--bolt-bg-hover,#1a1a1e)]"
                  icon="i-ph:caret-down"
                  title="Fermer"
                  size="md"
                  onClick={() => workbenchStore.toggleTerminal(false)}
                />
              </div>
              {Array.from({ length: terminalCount }, (_, index) => {
                const isActive = activeTerminal === index;
                const tabId = `terminal-tab-${index}`;
                const panelId = `terminal-panel-${index}`;

                return (
                  <div
                    key={index}
                    id={panelId}
                    role="tabpanel"
                    aria-labelledby={tabId}
                    className={classNames('h-full overflow-hidden', {
                      hidden: !isActive,
                    })}
                  >
                    <Terminal
                      className="h-full"
                      ref={(ref) => {
                        // Use index assignment instead of push to prevent memory leak
                        // Each terminal always gets the same slot in the array
                        terminalRefs.current[index] = ref;
                      }}
                      onTerminalReady={(terminal) => workbenchStore.attachTerminal(terminal)}
                      onTerminalResize={(cols, rows) => workbenchStore.onTerminalResize(cols, rows)}
                      theme={theme}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </Panel>
      </PanelGroup>
    );
  },
);
