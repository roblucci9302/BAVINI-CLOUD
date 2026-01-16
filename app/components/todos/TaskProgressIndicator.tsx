'use client';

/**
 * TaskProgressIndicator - Indicateur compact de progression
 *
 * Affiche un badge compact qui montre:
 * - La tâche en cours (si présente)
 * - Le nombre de tâches complétées/total
 * - Une barre de progression circulaire
 *
 * Cliquer dessus ouvre/ferme le panel TaskProgress complet.
 */

import { memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import {
  todosStore,
  todosPanelOpenStore,
  currentTodo,
  completedCount,
  totalCount,
  progressPercent,
  allCompleted,
  toggleTodosPanel,
} from '~/lib/stores/todos';

/*
 * ============================================================================
 * COMPONENTS
 * ============================================================================
 */

/**
 * Cercle de progression SVG
 */
const ProgressCircle = memo(({ percent, size = 24 }: { percent: number; size?: number }) => {
  const strokeWidth = 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = radius * 2 * Math.PI;
  const offset = circumference - (percent / 100) * circumference;

  return (
    <svg width={size} height={size} className="transform -rotate-90">
      {/* Background circle */}
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        className="text-bolt-elements-background-depth-3"
      />
      {/* Progress circle */}
      <motion.circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        className="text-accent-500"
        initial={{ strokeDashoffset: circumference }}
        animate={{ strokeDashoffset: offset }}
        transition={{ duration: 0.5, ease: 'easeOut' }}
        style={{
          strokeDasharray: circumference,
        }}
      />
    </svg>
  );
});

ProgressCircle.displayName = 'ProgressCircle';

/*
 * ============================================================================
 * MAIN COMPONENTS
 * ============================================================================
 */

interface TaskProgressIndicatorProps {
  /** Classe CSS additionnelle */
  className?: string;

  /** Position (pour le floating indicator) */
  position?: 'bottom-left' | 'bottom-right' | 'inline';

  /** Affichage compact (juste l'icône + pourcentage) */
  compact?: boolean;
}

/**
 * Indicateur inline (pour intégration dans la barre de chat)
 */
export const TaskProgressIndicatorInline = memo(({ className }: { className?: string }) => {
  const state = useStore(todosStore);
  const isOpen = useStore(todosPanelOpenStore);
  const current = useStore(currentTodo);
  const completed = useStore(completedCount);
  const total = useStore(totalCount);
  const percent = useStore(progressPercent);
  const isDone = useStore(allCompleted);

  const handleClick = useCallback(() => {
    toggleTodosPanel();
  }, []);

  if (state.todos.length === 0) {
    return null;
  }

  return (
    <motion.button
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      onClick={handleClick}
      className={classNames(
        'inline-flex items-center gap-2 px-2 py-1 rounded-lg transition-colors',
        isOpen
          ? 'bg-accent-500/20 text-accent-400'
          : 'hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary',
        className,
      )}
      title={current ? current.activeForm : `${completed}/${total} tâches`}
    >
      {/* Progress circle or checkmark */}
      {isDone ? (
        <div className="i-ph:check-circle-fill text-green-500" />
      ) : (
        <ProgressCircle percent={percent} size={18} />
      )}

      {/* Current task (truncated) or count */}
      <span className="text-xs max-w-24 truncate">{current ? current.activeForm : `${completed}/${total}`}</span>
    </motion.button>
  );
});

TaskProgressIndicatorInline.displayName = 'TaskProgressIndicatorInline';

/**
 * Indicateur flottant (pour affichage dans un coin)
 */
export const TaskProgressIndicatorFloating = memo(({ position = 'bottom-left' }: TaskProgressIndicatorProps) => {
  const state = useStore(todosStore);
  const isOpen = useStore(todosPanelOpenStore);
  const current = useStore(currentTodo);
  const completed = useStore(completedCount);
  const total = useStore(totalCount);
  const percent = useStore(progressPercent);
  const isDone = useStore(allCompleted);

  const handleClick = useCallback(() => {
    toggleTodosPanel();
  }, []);

  if (state.todos.length === 0) {
    return null;
  }

  const positionClasses = position === 'bottom-left' ? 'left-4' : 'right-4';

  return (
    <AnimatePresence>
      {!isOpen && (
        <motion.button
          initial={{ opacity: 0, y: 20, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.9 }}
          onClick={handleClick}
          className={classNames(
            'fixed bottom-20 z-40 flex items-center gap-3 px-4 py-2.5 rounded-full',
            'bg-bolt-elements-background-depth-1/95 backdrop-blur-sm',
            'border border-bolt-elements-borderColor shadow-lg',
            'hover:border-accent-500/50 transition-all hover:scale-105',
            positionClasses,
          )}
        >
          {/* Progress indicator */}
          {isDone ? (
            <div className="i-ph:check-circle-fill text-green-500 text-xl" />
          ) : current ? (
            <div className="relative">
              <ProgressCircle percent={percent} size={28} />
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-[8px] font-bold text-accent-400">{percent}%</span>
              </div>
            </div>
          ) : (
            <ProgressCircle percent={percent} size={28} />
          )}

          {/* Content */}
          <div className="flex flex-col items-start">
            {current ? (
              <>
                <span className="text-xs text-bolt-elements-textSecondary">
                  {completed}/{total} tâches
                </span>
                <span className="text-sm text-bolt-elements-textPrimary max-w-40 truncate">{current.activeForm}</span>
              </>
            ) : isDone ? (
              <span className="text-sm text-green-400">Terminé</span>
            ) : (
              <span className="text-sm text-bolt-elements-textPrimary">
                {completed}/{total} tâches
              </span>
            )}
          </div>

          {/* Expand icon */}
          <div className="i-ph:caret-up text-bolt-elements-textTertiary" />
        </motion.button>
      )}
    </AnimatePresence>
  );
});

TaskProgressIndicatorFloating.displayName = 'TaskProgressIndicatorFloating';

/**
 * Export par défaut - floating indicator
 */
export const TaskProgressIndicator = TaskProgressIndicatorFloating;

export default TaskProgressIndicator;
