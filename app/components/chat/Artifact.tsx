'use client';

import { useStore } from '@nanostores/react';
import { AnimatePresence, motion } from 'framer-motion';
import { atom, computed, type ReadableAtom } from 'nanostores';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { createHighlighter, type BundledLanguage, type BundledTheme, type HighlighterGeneric } from 'shiki';
import type { ActionState } from '~/lib/runtime/action-runner';
import { workbenchStore } from '~/lib/stores/workbench';
import { classNames } from '~/utils/classNames';
import { cubicEasingFn } from '~/utils/easings';

const highlighterOptions = {
  langs: ['shell'],
  themes: ['light-plus', 'dark-plus'],
};

// Stable empty atom to prevent hook instability
const EMPTY_ACTIONS_ATOM: ReadableAtom<ActionState[]> = atom<ActionState[]>([]);

const shellHighlighter: HighlighterGeneric<BundledLanguage, BundledTheme> =
  import.meta.hot?.data.shellHighlighter ?? (await createHighlighter(highlighterOptions));

if (import.meta.hot) {
  import.meta.hot.data.shellHighlighter = shellHighlighter;
}

interface ArtifactProps {
  messageId: string;
}

export const Artifact = memo(({ messageId }: ArtifactProps) => {
  const userToggledActions = useRef(false);
  const [showActions, setShowActions] = useState(false);

  const artifacts = useStore(workbenchStore.artifacts);
  const artifact = artifacts[messageId];

  // Create a stable computed store that handles missing artifact gracefully
  const runner = artifact?.runner;
  const actionsStore = useMemo(() => {
    if (!runner?.actions) {
      return EMPTY_ACTIONS_ATOM;
    }

    return computed(runner.actions, (actionsMap): ActionState[] => {
      return Object.values(actionsMap) as ActionState[];
    });
  }, [runner]);

  const actions = useStore(actionsStore);

  // Effect must be called BEFORE early return to maintain consistent hook order
  useEffect(() => {
    if (actions.length && !showActions && !userToggledActions.current) {
      setShowActions(true);
    }
  }, [actions, showActions]);

  // Don't render if artifact doesn't exist yet
  if (!artifact) {
    return null;
  }

  const toggleActions = () => {
    userToggledActions.current = true;
    setShowActions(!showActions);
  };

  const handleOpenWorkbench = () => {
    const showWorkbench = workbenchStore.showWorkbench.get();
    workbenchStore.showWorkbench.set(!showWorkbench);
  };

  return (
    <div className="artifact border border-bolt-elements-borderColor flex flex-col overflow-hidden rounded-[10px] w-full transition-all duration-150">
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3.5 cursor-pointer hover:bg-bolt-elements-artifacts-backgroundHover transition-colors"
        onClick={handleOpenWorkbench}
      >
        <span className="text-bolt-elements-textPrimary font-medium text-sm">{artifact?.title}</span>
        <div className="flex items-center gap-2">
          {actions.length > 0 && (
            <span className="text-xs text-bolt-elements-textTertiary">
              {actions.length} action{actions.length > 1 ? 's' : ''}
            </span>
          )}
          <AnimatePresence>
            {actions.length > 0 && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                transition={{ duration: 0.15 }}
                className="p-1 hover:bg-bolt-elements-background-depth-3 rounded transition-colors"
                onClick={(e) => {
                  e.stopPropagation();
                  toggleActions();
                }}
              >
                <div
                  className={classNames(
                    'i-ph:caret-down text-bolt-elements-textTertiary text-sm transition-transform duration-200',
                    showActions ? 'rotate-180' : '',
                  )}
                />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Timeline Actions */}
      <AnimatePresence>
        {showActions && actions.length > 0 && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: cubicEasingFn }}
            className="overflow-hidden"
          >
            <div className="border-t border-bolt-elements-borderColor" />
            <div className="px-4 py-3 bg-bolt-elements-actions-background">
              <TimelineActionList actions={actions} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

interface ShellCodeBlockProps {
  className?: string;
  code: string;
}

function ShellCodeBlock({ className, code }: ShellCodeBlockProps) {
  return (
    <div
      className={classNames(
        'text-xs mt-1.5 px-3 py-2 bg-bolt-elements-background-depth-1 rounded-md',
        className,
      )}
      /* safe: codeToHtml from Shiki escapes all HTML entities */
      dangerouslySetInnerHTML={{
        __html: shellHighlighter.codeToHtml(code, {
          lang: 'shell',
          theme: 'dark-plus',
        }),
      }}
    />
  );
}

interface TimelineActionListProps {
  actions: ActionState[];
}

const TimelineActionList = memo(({ actions }: TimelineActionListProps) => {
  return (
    <div className="relative">
      {actions.map((action, index) => {
        const { status, type, content } = action;
        const isLast = index === actions.length - 1;

        return (
          <div key={index} className="flex gap-3 relative">
            {/* Timeline line */}
            {!isLast && (
              <div
                className="absolute left-[6px] top-[18px] bottom-0 w-[1px]"
                style={{
                  background:
                    status === 'complete'
                      ? 'rgba(34, 197, 94, 0.3)'
                      : status === 'running'
                        ? 'rgba(14, 165, 233, 0.3)'
                        : 'rgba(255, 255, 255, 0.06)',
                }}
              />
            )}

            {/* Dot */}
            <div className="relative z-10 flex-shrink-0 mt-[3px]">
              <TimelineDot status={status} />
            </div>

            {/* Content */}
            <div className={classNames('flex-1 min-w-0', !isLast ? 'pb-2.5' : '')}>
              {type === 'file' ? (
                <div className="text-sm text-bolt-elements-textSecondary">
                  Créer{' '}
                  <code className="bg-bolt-elements-background-depth-1 text-bolt-elements-textPrimary px-1.5 py-0.5 rounded text-xs font-mono">
                    {action.filePath}
                  </code>
                </div>
              ) : type === 'shell' ? (
                <div>
                  <span className="text-sm text-bolt-elements-textSecondary">Exécuter la commande</span>
                  <ShellCodeBlock code={content} />
                </div>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
});

interface TimelineDotProps {
  status: ActionState['status'];
}

function TimelineDot({ status }: TimelineDotProps) {
  const baseClasses = 'w-[13px] h-[13px] rounded-full flex items-center justify-center';

  if (status === 'running') {
    return (
      <div className={classNames(baseClasses, 'bg-bolt-elements-loader-progress')}>
        <div className="i-svg-spinners:90-ring-with-bg text-white text-[9px]" />
      </div>
    );
  }

  if (status === 'pending') {
    return (
      <div
        className={classNames(baseClasses, 'bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor')}
      />
    );
  }

  if (status === 'complete') {
    return (
      <div className={classNames(baseClasses, 'bg-bolt-elements-icon-success')}>
        <svg className="w-[8px] h-[8px] text-white" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
    );
  }

  if (status === 'failed' || status === 'aborted') {
    return (
      <div className={classNames(baseClasses, 'bg-bolt-elements-icon-error')}>
        <div className="i-ph:x-bold text-white text-[8px]" />
      </div>
    );
  }

  return <div className={classNames(baseClasses, 'bg-bolt-elements-textTertiary')} />;
}
