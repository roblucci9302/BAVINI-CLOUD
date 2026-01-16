/**
 * Store pour la gestion du contexte de conversation
 *
 * Permet de suivre l'utilisation du contexte et d'afficher
 * des indicateurs à l'utilisateur.
 *
 * @module stores/context
 */

import { atom, computed } from 'nanostores';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Statistiques de contexte
 */
export interface ContextStats {
  /** Nombre total de tokens estimé */
  totalTokens: number;

  /** Pourcentage d'utilisation (0-100) */
  usagePercent: number;

  /** Nombre de messages */
  messageCount: number;

  /** Nombre de résumés appliqués */
  summaryCount: number;

  /** Proche de la limite ? */
  isNearLimit: boolean;

  /** Dernière mise à jour */
  lastUpdated: Date;
}

/**
 * État du store de contexte
 */
export interface ContextState {
  /** Statistiques actuelles */
  stats: ContextStats;

  /** Summarization en cours ? */
  isSummarizing: boolean;

  /** Historique des summarizations */
  summarizationHistory: Array<{
    timestamp: Date;
    messagesCount: number;
    tokensSaved: number;
  }>;
}

/*
 * ============================================================================
 * CONSTANTS
 * ============================================================================
 */

const DEFAULT_STATS: ContextStats = {
  totalTokens: 0,
  usagePercent: 0,
  messageCount: 0,
  summaryCount: 0,
  isNearLimit: false,
  lastUpdated: new Date(),
};

/*
 * ============================================================================
 * STORES
 * ============================================================================
 */

/**
 * Store principal du contexte
 */
export const contextStore = atom<ContextState>({
  stats: DEFAULT_STATS,
  isSummarizing: false,
  summarizationHistory: [],
});

/*
 * ============================================================================
 * COMPUTED
 * ============================================================================
 */

/**
 * Statistiques de contexte actuelles
 */
export const contextStats = computed(contextStore, (state) => state.stats);

/**
 * Summarization en cours
 */
export const isSummarizing = computed(contextStore, (state) => state.isSummarizing);

/**
 * Niveau de remplissage du contexte (pour affichage)
 */
export const contextLevel = computed(contextStore, (state) => {
  const usage = state.stats.usagePercent;

  if (usage < 50) {
    return 'low';
  }

  if (usage < 70) {
    return 'medium';
  }

  if (usage < 85) {
    return 'high';
  }

  return 'critical';
});

/**
 * Couleur CSS selon le niveau
 */
export const contextLevelColor = computed(contextLevel, (level) => {
  switch (level) {
    case 'low':
      return 'text-green-500';
    case 'medium':
      return 'text-yellow-500';
    case 'high':
      return 'text-orange-500';
    case 'critical':
      return 'text-red-500';
    default:
      return 'text-bolt-elements-textSecondary';
  }
});

/*
 * ============================================================================
 * ACTIONS
 * ============================================================================
 */

/**
 * Mettre à jour les statistiques de contexte
 */
export function updateContextStats(stats: Partial<ContextStats>): void {
  const current = contextStore.get();
  contextStore.set({
    ...current,
    stats: {
      ...current.stats,
      ...stats,
      lastUpdated: new Date(),
    },
  });
}

/**
 * Marquer le début d'une summarization
 */
export function startSummarization(): void {
  contextStore.set({
    ...contextStore.get(),
    isSummarizing: true,
  });
}

/**
 * Marquer la fin d'une summarization
 */
export function endSummarization(messagesCount: number, tokensSaved: number): void {
  const current = contextStore.get();
  contextStore.set({
    ...current,
    isSummarizing: false,
    summarizationHistory: [
      ...current.summarizationHistory,
      {
        timestamp: new Date(),
        messagesCount,
        tokensSaved,
      },
    ],
  });
}

/**
 * Réinitialiser le store (nouvelle conversation)
 */
export function resetContextStore(): void {
  contextStore.set({
    stats: DEFAULT_STATS,
    isSummarizing: false,
    summarizationHistory: [],
  });
}

/**
 * Obtenir le nombre total de messages résumés
 */
export function getTotalSummarizedMessages(): number {
  return contextStore.get().summarizationHistory.reduce((total, entry) => total + entry.messagesCount, 0);
}

/**
 * Obtenir le nombre total de tokens économisés
 */
export function getTotalTokensSaved(): number {
  return contextStore.get().summarizationHistory.reduce((total, entry) => total + entry.tokensSaved, 0);
}
