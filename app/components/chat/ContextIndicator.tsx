'use client';

/**
 * ContextIndicator - Affiche l'utilisation du contexte de conversation
 *
 * Montre:
 * - Barre de progression du contexte
 * - Nombre de tokens utilisés
 * - Indicateur de summarization
 */

import { memo } from 'react';
import { useStore } from '@nanostores/react';
import { motion, AnimatePresence } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import { contextStats, contextLevel, contextLevelColor, isSummarizing } from '~/lib/stores/context';

/*
 * ============================================================================
 * COMPACT INDICATOR (for header/status bar)
 * ============================================================================
 */

interface ContextIndicatorCompactProps {
  className?: string;
}

export const ContextIndicatorCompact = memo(({ className }: ContextIndicatorCompactProps) => {
  const stats = useStore(contextStats);
  const level = useStore(contextLevel);
  const levelColor = useStore(contextLevelColor);
  const summarizing = useStore(isSummarizing);

  // Don't show if no context yet
  if (stats.messageCount === 0) {
    return null;
  }

  return (
    <div
      className={classNames(
        'flex items-center gap-2 px-2 py-1 rounded-lg bg-bolt-elements-background-depth-2',
        className,
      )}
      title={`Contexte: ${stats.usagePercent.toFixed(0)}% (${formatTokens(stats.totalTokens)} tokens)`}
    >
      {/* Icon */}
      <div
        className={classNames(summarizing ? 'i-svg-spinners:90-ring-with-bg' : 'i-ph:brain', 'text-sm', levelColor)}
      />

      {/* Progress bar */}
      <div className="w-12 h-1.5 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden">
        <motion.div
          className={classNames('h-full rounded-full', {
            'bg-green-500': level === 'low',
            'bg-yellow-500': level === 'medium',
            'bg-orange-500': level === 'high',
            'bg-red-500': level === 'critical',
          })}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(stats.usagePercent, 100)}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>

      {/* Percentage */}
      <span className={classNames('text-xs font-mono', levelColor)}>{stats.usagePercent.toFixed(0)}%</span>
    </div>
  );
});

ContextIndicatorCompact.displayName = 'ContextIndicatorCompact';

/*
 * ============================================================================
 * DETAILED INDICATOR (for tooltip/panel)
 * ============================================================================
 */

interface ContextIndicatorDetailedProps {
  className?: string;
}

export const ContextIndicatorDetailed = memo(({ className }: ContextIndicatorDetailedProps) => {
  const stats = useStore(contextStats);
  const level = useStore(contextLevel);
  const levelColor = useStore(contextLevelColor);
  const summarizing = useStore(isSummarizing);

  return (
    <div
      className={classNames(
        'p-3 rounded-lg bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor',
        className,
      )}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className={classNames('i-ph:brain text-lg', levelColor)} />
          <span className="text-sm font-medium text-bolt-elements-textPrimary">Contexte</span>
        </div>
        <span className={classNames('text-sm font-mono', levelColor)}>{stats.usagePercent.toFixed(1)}%</span>
      </div>

      {/* Progress bar */}
      <div className="h-2 bg-bolt-elements-background-depth-3 rounded-full overflow-hidden mb-3">
        <motion.div
          className={classNames('h-full rounded-full', {
            'bg-green-500': level === 'low',
            'bg-yellow-500': level === 'medium',
            'bg-orange-500': level === 'high',
            'bg-red-500': level === 'critical',
          })}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(stats.usagePercent, 100)}%` }}
          transition={{ duration: 0.3, ease: 'easeOut' }}
        />
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 gap-2 text-xs">
        <div className="flex items-center gap-1.5">
          <div className="i-ph:hash text-bolt-elements-textTertiary" />
          <span className="text-bolt-elements-textSecondary">Tokens:</span>
          <span className="text-bolt-elements-textPrimary font-mono">{formatTokens(stats.totalTokens)}</span>
        </div>

        <div className="flex items-center gap-1.5">
          <div className="i-ph:chat-text text-bolt-elements-textTertiary" />
          <span className="text-bolt-elements-textSecondary">Messages:</span>
          <span className="text-bolt-elements-textPrimary font-mono">{stats.messageCount}</span>
        </div>

        {stats.summaryCount > 0 && (
          <div className="flex items-center gap-1.5 col-span-2">
            <div className="i-ph:file-text text-bolt-elements-textTertiary" />
            <span className="text-bolt-elements-textSecondary">Résumés:</span>
            <span className="text-bolt-elements-textPrimary font-mono">{stats.summaryCount}</span>
          </div>
        )}
      </div>

      {/* Summarizing indicator */}
      <AnimatePresence>
        {summarizing && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="mt-3 pt-3 border-t border-bolt-elements-borderColor"
          >
            <div className="flex items-center gap-2 text-accent-400">
              <div className="i-svg-spinners:90-ring-with-bg" />
              <span className="text-xs">Résumé en cours...</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Warning for high usage */}
      {level === 'critical' && !summarizing && (
        <div className="mt-3 pt-3 border-t border-bolt-elements-borderColor">
          <div className="flex items-center gap-2 text-red-400">
            <div className="i-ph:warning" />
            <span className="text-xs">Contexte presque plein</span>
          </div>
        </div>
      )}
    </div>
  );
});

ContextIndicatorDetailed.displayName = 'ContextIndicatorDetailed';

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

/**
 * Formater le nombre de tokens pour affichage
 */
function formatTokens(tokens: number): string {
  if (tokens < 1000) {
    return tokens.toString();
  }

  if (tokens < 1000000) {
    return `${(tokens / 1000).toFixed(1)}K`;
  }

  return `${(tokens / 1000000).toFixed(2)}M`;
}

/*
 * ============================================================================
 * EXPORTS
 * ============================================================================
 */

export default ContextIndicatorCompact;
