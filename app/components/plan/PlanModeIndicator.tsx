'use client';

/**
 * PlanModeIndicator - Indicateur visuel du mode planification
 *
 * Affiche un badge discret quand le mode plan est actif,
 * permettant à l'utilisateur de voir l'état et d'ouvrir le plan.
 */

import { memo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import { planStore, togglePlanModal, exitPlanMode } from '~/lib/stores/plan';

/*
 * ============================================================================
 * CONSTANTS
 * ============================================================================
 */

const PHASE_LABELS: Record<string, string> = {
  exploring: 'Exploration',
  drafting: 'Rédaction',
  awaiting_approval: 'En attente',
  approved: 'Approuvé',
  rejected: 'Rejeté',
};

const PHASE_COLORS: Record<string, string> = {
  exploring: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  drafting: 'bg-sky-500/20 text-sky-400 border-sky-500/30',
  awaiting_approval: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  approved: 'bg-green-500/20 text-green-400 border-green-500/30',
  rejected: 'bg-red-500/20 text-red-400 border-red-500/30',
};

const PHASE_ICONS: Record<string, string> = {
  exploring: 'i-ph:magnifying-glass',
  drafting: 'i-ph:pencil-simple',
  awaiting_approval: 'i-ph:clock',
  approved: 'i-ph:check-circle',
  rejected: 'i-ph:x-circle',
};

/*
 * ============================================================================
 * MAIN COMPONENT
 * ============================================================================
 */

interface PlanModeIndicatorProps {
  /** Classe CSS additionnelle */
  className?: string;

  /** Affichage compact (juste l'icône) */
  compact?: boolean;
}

export const PlanModeIndicator = memo(({ className, compact = false }: PlanModeIndicatorProps) => {
  const state = useStore(planStore);

  const handleClick = useCallback(() => {
    if (state.currentPlan) {
      togglePlanModal(true);
    }
  }, [state.currentPlan]);

  const handleExit = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    exitPlanMode(false);
  }, []);

  if (!state.isActive) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, scale: 0.9 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.9 }}
        className={classNames(
          'inline-flex items-center gap-2 rounded-lg border transition-colors',
          PHASE_COLORS[state.phase],
          state.currentPlan ? 'cursor-pointer hover:opacity-80' : '',
          compact ? 'px-2 py-1' : 'px-3 py-1.5',
          className,
        )}
        onClick={handleClick}
        title={state.currentPlan ? 'Cliquez pour voir le plan' : PHASE_LABELS[state.phase]}
      >
        {/* Icon */}
        <div className={classNames(PHASE_ICONS[state.phase], compact ? 'text-sm' : 'text-base')} />

        {/* Label (sauf en mode compact) */}
        {!compact && (
          <>
            <span className="text-xs font-medium">Mode Plan</span>
            <span className="text-xs opacity-75">{PHASE_LABELS[state.phase]}</span>
          </>
        )}

        {/* Bouton fermer (sauf si plan en attente) */}
        {state.phase !== 'awaiting_approval' && (
          <button
            onClick={handleExit}
            className="p-0.5 rounded hover:bg-white/10 transition-colors"
            title="Quitter le mode plan"
          >
            <div className="i-ph:x text-xs" />
          </button>
        )}
      </motion.div>
    </AnimatePresence>
  );
});

PlanModeIndicator.displayName = 'PlanModeIndicator';

/*
 * ============================================================================
 * FLOATING INDICATOR (pour affichage dans le coin)
 * ============================================================================
 */

export const PlanModeFloatingIndicator = memo(() => {
  const state = useStore(planStore);

  const handleClick = useCallback(() => {
    if (state.currentPlan) {
      togglePlanModal(true);
    }
  }, [state.currentPlan]);

  if (!state.isActive) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 20 }}
        className="fixed bottom-20 right-4 z-40"
      >
        <button
          onClick={handleClick}
          className={classNames(
            'flex items-center gap-2 px-4 py-2 rounded-full shadow-lg border backdrop-blur-sm transition-all hover:scale-105',
            PHASE_COLORS[state.phase],
            'bg-bolt-elements-background-depth-1/90',
          )}
        >
          <div className={classNames(PHASE_ICONS[state.phase], 'text-lg')} />
          <span className="text-sm font-medium">Mode Plan</span>
          {state.phase === 'awaiting_approval' && (
            <span className="ml-1 w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
          )}
        </button>
      </motion.div>
    </AnimatePresence>
  );
});

PlanModeFloatingIndicator.displayName = 'PlanModeFloatingIndicator';

export default PlanModeIndicator;
