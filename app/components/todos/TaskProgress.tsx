'use client';

/**
 * TaskProgress - Affichage de la progression des tâches
 *
 * Montre la liste des tâches en temps réel avec:
 * - Indicateur visuel de progression
 * - Tâche actuelle mise en évidence
 * - Statut de chaque tâche (pending, in_progress, completed, failed)
 */

import { memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import type { Todo, TodoStatus } from '~/lib/stores/todos';
import {
  todosStore,
  todosPanelOpenStore,
  currentTodo,
  completedCount,
  totalCount,
  progressPercent,
  toggleTodosPanel,
  formatDuration,
} from '~/lib/stores/todos';

/*
 * ============================================================================
 * CONSTANTS
 * ============================================================================
 */

const STATUS_ICONS: Record<TodoStatus, string> = {
  pending: 'i-ph:circle-dashed',
  in_progress: 'i-svg-spinners:90-ring-with-bg',
  completed: 'i-ph:check-circle-fill',
  failed: 'i-ph:x-circle-fill',
  skipped: 'i-ph:minus-circle',
};

const STATUS_COLORS: Record<TodoStatus, string> = {
  pending: 'text-bolt-elements-textTertiary',
  in_progress: 'text-accent-500',
  completed: 'text-green-500',
  failed: 'text-red-500',
  skipped: 'text-bolt-elements-textTertiary',
};

const STATUS_BG: Record<TodoStatus, string> = {
  pending: 'bg-bolt-elements-background-depth-2',
  in_progress: 'bg-accent-500/10 border-accent-500/30',
  completed: 'bg-green-500/10',
  failed: 'bg-red-500/10',
  skipped: 'bg-bolt-elements-background-depth-2 opacity-60',
};

/*
 * ============================================================================
 * COMPONENTS
 * ============================================================================
 */

/**
 * Item de tâche individuel
 */
const TodoItem = memo(({ todo, index }: { todo: Todo; index: number }) => {
  const isActive = todo.status === 'in_progress';

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 10 }}
      transition={{ delay: index * 0.05 }}
      className={classNames(
        'flex items-center gap-3 px-3 py-2 rounded-lg border transition-all',
        STATUS_BG[todo.status],
        isActive ? 'border-accent-500/30' : 'border-transparent',
      )}
    >
      {/* Status icon */}
      <div className={classNames(STATUS_ICONS[todo.status], 'text-lg flex-shrink-0', STATUS_COLORS[todo.status])} />

      {/* Content */}
      <div className="flex-1 min-w-0">
        <p
          className={classNames(
            'text-sm truncate',
            isActive ? 'text-bolt-elements-textPrimary font-medium' : 'text-bolt-elements-textSecondary',
            { 'line-through opacity-70': todo.status === 'completed' },
            { 'line-through opacity-50': todo.status === 'skipped' },
          )}
        >
          {isActive ? todo.activeForm : todo.content}
        </p>

        {/* Agent badge */}
        {todo.agent && <span className="text-xs text-bolt-elements-textTertiary">{todo.agent}</span>}
      </div>

      {/* Duration (for completed tasks) */}
      {todo.duration !== undefined && todo.status === 'completed' && (
        <span className="text-xs text-bolt-elements-textTertiary flex-shrink-0">{formatDuration(todo.duration)}</span>
      )}

      {/* Error indicator */}
      {todo.status === 'failed' && todo.error && (
        <div className="i-ph:warning text-red-400 text-lg flex-shrink-0" title={todo.error} />
      )}
    </motion.div>
  );
});

TodoItem.displayName = 'TodoItem';

/**
 * Barre de progression
 */
const ProgressBar = memo(({ percent }: { percent: number }) => {
  return (
    <div className="h-1 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden">
      <motion.div
        className="h-full bg-accent-500"
        initial={{ width: 0 }}
        animate={{ width: `${percent}%` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
    </div>
  );
});

ProgressBar.displayName = 'ProgressBar';

/**
 * Header avec statistiques
 */
const ProgressHeader = memo(
  ({
    completed,
    total,
    percent,
    current,
    onClose,
  }: {
    completed: number;
    total: number;
    percent: number;
    current: Todo | null;
    onClose: () => void;
  }) => {
    return (
      <div className="px-4 py-3 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="i-ph:list-checks text-accent-400" />
            <span className="text-sm font-medium text-bolt-elements-textPrimary">Progression</span>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-bolt-elements-textSecondary">
              {completed}/{total} ({percent}%)
            </span>
            <button
              onClick={onClose}
              className="p-1 rounded hover:bg-bolt-elements-background-depth-3 transition-colors"
            >
              <div className="i-ph:x text-bolt-elements-textSecondary text-sm" />
            </button>
          </div>
        </div>

        <ProgressBar percent={percent} />

        {current && (
          <div className="mt-2 flex items-center gap-2 text-xs text-accent-400">
            <div className="i-svg-spinners:90-ring-with-bg" />
            <span className="truncate">{current.activeForm}</span>
          </div>
        )}
      </div>
    );
  },
);

ProgressHeader.displayName = 'ProgressHeader';

/*
 * ============================================================================
 * MAIN COMPONENT
 * ============================================================================
 */

interface TaskProgressProps {
  /** Position du panel */
  position?: 'bottom-left' | 'bottom-right';

  /** Largeur maximale */
  maxWidth?: number;
}

export const TaskProgress = memo(({ position = 'bottom-left', maxWidth = 320 }: TaskProgressProps) => {
  const state = useStore(todosStore);
  const isOpen = useStore(todosPanelOpenStore);
  const current = useStore(currentTodo);
  const completed = useStore(completedCount);
  const total = useStore(totalCount);
  const percent = useStore(progressPercent);

  const handleClose = useCallback(() => {
    toggleTodosPanel(false);
  }, []);

  // Ne rien afficher s'il n'y a pas de tâches
  if (state.todos.length === 0) {
    return null;
  }

  // Position classes
  const positionClasses = position === 'bottom-left' ? 'left-4' : 'right-4';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, y: 20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.95 }}
          className={classNames('fixed bottom-20 z-40', positionClasses)}
          style={{ maxWidth }}
        >
          <div className="bg-bolt-elements-background-depth-1 rounded-xl shadow-2xl border border-bolt-elements-borderColor overflow-hidden">
            <ProgressHeader
              completed={completed}
              total={total}
              percent={percent}
              current={current}
              onClose={handleClose}
            />

            {/* Tasks list */}
            <div className="max-h-64 overflow-y-auto p-2 space-y-1">
              <AnimatePresence mode="popLayout">
                {state.todos.map((todo, index) => (
                  <TodoItem key={todo.id} todo={todo} index={index} />
                ))}
              </AnimatePresence>
            </div>

            {/* Footer when all done */}
            {percent === 100 && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="px-4 py-2 border-t border-bolt-elements-borderColor bg-green-500/10"
              >
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <div className="i-ph:check-circle-fill" />
                  <span>Toutes les tâches sont terminées</span>
                </div>
              </motion.div>
            )}
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
});

TaskProgress.displayName = 'TaskProgress';

export default TaskProgress;
