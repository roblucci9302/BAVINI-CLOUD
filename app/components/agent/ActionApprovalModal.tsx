'use client';

/**
 * Modal d'approbation des actions des agents
 *
 * En mode strict, ce modal s'affiche avant chaque action des agents
 * pour permettre à l'utilisateur de valider ou refuser.
 */

import { memo, useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { classNames } from '~/utils/classNames';
import {
  type ProposedAction,
  type PendingActionBatch,
  type FileCreateDetails,
  type FileModifyDetails,
  type ShellCommandDetails,
  formatActionForDisplay,
  getActionIcon,
  getBatchStats,
} from '~/lib/agents/security/action-validator';
import type { AgentType } from '~/lib/agents/types';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

interface ActionApprovalModalProps {
  /** Le modal est-il ouvert ? */
  isOpen: boolean;

  /** Batch d'actions en attente */
  batch: PendingActionBatch | null;

  /** Callback quand l'utilisateur approuve tout */
  onApproveAll: () => void;

  /** Callback quand l'utilisateur refuse tout */
  onRejectAll: () => void;

  /** Callback quand l'utilisateur approuve certaines actions */
  onApproveSelected: (actionIds: string[]) => void;

  /** Callback pour fermer le modal */
  onClose: () => void;

  /** Est en cours de traitement ? */
  isProcessing?: boolean;
}

interface ActionItemProps {
  action: ProposedAction;
  isSelected: boolean;
  isExpanded: boolean;
  onToggleSelect: () => void;
  onToggleExpand: () => void;
}

/*
 * ============================================================================
 * CONSTANTS
 * ============================================================================
 */

/** Icon classes for each agent type */
const AGENT_ICONS: Record<AgentType, string> = {
  orchestrator: 'i-ph:brain',
  explore: 'i-ph:magnifying-glass',
  coder: 'i-ph:code',
  builder: 'i-ph:hammer',
  tester: 'i-ph:test-tube',
  deployer: 'i-ph:rocket-launch',
  reviewer: 'i-ph:eye',
  fixer: 'i-ph:wrench',
  architect: 'i-ph:blueprint',
};

/** Color classes for each action type */
const ACTION_TYPE_COLORS: Record<ProposedAction['type'], string> = {
  file_create: 'bg-green-500/20 text-green-400 border-green-500/30',
  file_modify: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
  file_delete: 'bg-red-500/20 text-red-400 border-red-500/30',
  shell_command: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
  directory_create: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  file_move: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
};

/** Display labels for each action type */
const ACTION_TYPE_LABELS: Record<ProposedAction['type'], string> = {
  file_create: 'Créer',
  file_modify: 'Modifier',
  file_delete: 'Supprimer',
  shell_command: 'Commande',
  directory_create: 'Dossier',
  file_move: 'Déplacer',
};

/*
 * ============================================================================
 * HELPER COMPONENTS
 * ============================================================================
 */

/**
 * Icône de l'agent
 */
const AgentIcon = memo(({ agent }: { agent: AgentType }) => {
  return <div className={classNames(AGENT_ICONS[agent] || 'i-ph:robot', 'text-lg')} />;
});

/**
 * Badge de type d'action
 */
const ActionTypeBadge = memo(({ type }: { type: ProposedAction['type'] }) => {
  return (
    <span className={classNames('px-2 py-0.5 text-xs rounded border', ACTION_TYPE_COLORS[type])}>
      {ACTION_TYPE_LABELS[type]}
    </span>
  );
});

/**
 * Prévisualisation du code
 */
const CodePreview = memo(
  ({ content, language, maxLines = 20 }: { content: string; language?: string; maxLines?: number }) => {
    const lines = content.split('\n');
    const truncated = lines.length > maxLines;
    const displayLines = truncated ? lines.slice(0, maxLines) : lines;

    return (
      <div className="mt-2 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor overflow-hidden">
        <div className="flex items-center justify-between px-3 py-1.5 bg-bolt-elements-background-depth-4 border-b border-bolt-elements-borderColor">
          <span className="text-xs text-bolt-elements-textSecondary">
            {language || 'Aperçu'} - {lines.length} lignes
          </span>
          {truncated && <span className="text-xs text-bolt-elements-textTertiary">(tronqué)</span>}
        </div>
        <pre className="p-3 text-xs overflow-x-auto max-h-64 overflow-y-auto">
          <code className="text-bolt-elements-textPrimary">
            {displayLines.map((line, i) => (
              <div key={i} className="flex">
                <span className="select-none text-bolt-elements-textTertiary w-8 text-right pr-3">{i + 1}</span>
                <span>{line}</span>
              </div>
            ))}
            {truncated && (
              <div className="text-bolt-elements-textTertiary mt-2">
                ... {lines.length - maxLines} lignes supplémentaires
              </div>
            )}
          </code>
        </pre>
      </div>
    );
  },
);

/**
 * Prévisualisation du diff
 */
const DiffPreview = memo(({ oldContent, newContent }: { oldContent: string; newContent: string }) => {
  // Simple diff display
  const oldLines = oldContent.split('\n');
  const newLines = newContent.split('\n');

  return (
    <div className="mt-2 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor overflow-hidden">
      <div className="px-3 py-1.5 bg-bolt-elements-background-depth-4 border-b border-bolt-elements-borderColor">
        <span className="text-xs text-bolt-elements-textSecondary">Modifications</span>
      </div>
      <div className="p-3 text-xs max-h-64 overflow-auto">
        <div className="mb-2">
          <span className="text-red-400">- Ancien ({oldLines.length} lignes)</span>
        </div>
        <pre className="bg-red-500/10 p-2 rounded mb-3 overflow-x-auto">
          <code className="text-red-300">
            {oldContent.slice(0, 500)}
            {oldContent.length > 500 ? '...' : ''}
          </code>
        </pre>
        <div className="mb-2">
          <span className="text-green-400">+ Nouveau ({newLines.length} lignes)</span>
        </div>
        <pre className="bg-green-500/10 p-2 rounded overflow-x-auto">
          <code className="text-green-300">
            {newContent.slice(0, 500)}
            {newContent.length > 500 ? '...' : ''}
          </code>
        </pre>
      </div>
    </div>
  );
});

/**
 * Item d'action individuel
 */
const ActionItem = memo(({ action, isSelected, isExpanded, onToggleSelect, onToggleExpand }: ActionItemProps) => {
  const icon = getActionIcon(action.type);
  const displayText = formatActionForDisplay(action);

  const renderDetails = () => {
    if (!isExpanded) {
      return null;
    }

    switch (action.type) {
      case 'file_create': {
        const createDetails = action.details as FileCreateDetails;
        return <CodePreview content={createDetails.content} language={createDetails.language} />;
      }

      case 'file_modify': {
        const modifyDetails = action.details as FileModifyDetails;
        return <DiffPreview oldContent={modifyDetails.oldContent} newContent={modifyDetails.newContent} />;
      }

      case 'shell_command': {
        const shellDetails = action.details as ShellCommandDetails;
        return (
          <div className="mt-2 p-3 rounded-lg bg-bolt-elements-background-depth-3 border border-bolt-elements-borderColor">
            <div className="flex items-center gap-2 mb-2">
              <div className="i-ph:terminal text-purple-400" />
              <span className="text-xs text-bolt-elements-textSecondary">Commande</span>
            </div>
            <code className="text-sm text-bolt-elements-textPrimary font-mono">$ {shellDetails.command}</code>
            <div className="mt-2 text-xs text-bolt-elements-textTertiary">{shellDetails.commandCheck.message}</div>
          </div>
        );
      }

      case 'file_delete': {
        return (
          <div className="mt-2 p-3 rounded-lg bg-red-500/10 border border-red-500/30">
            <div className="flex items-center gap-2">
              <div className="i-ph:warning text-red-400" />
              <span className="text-xs text-red-300">Cette action est irréversible</span>
            </div>
          </div>
        );
      }

      default:
        return null;
    }
  };

  return (
    <div
      className={classNames(
        'border rounded-lg transition-colors',
        isSelected
          ? 'border-accent-500 bg-accent-500/5'
          : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2',
      )}
    >
      <div className="flex items-center gap-3 p-3">
        {/* Checkbox */}
        <button
          onClick={onToggleSelect}
          className={classNames(
            'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
            isSelected ? 'bg-accent-500 border-accent-500' : 'border-bolt-elements-borderColor hover:border-accent-400',
          )}
        >
          {isSelected && <div className="i-ph:check text-white text-sm" />}
        </button>

        {/* Icon */}
        <div className={classNames(icon, 'text-lg text-bolt-elements-textSecondary')} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-nowrap min-w-0">
            <ActionTypeBadge type={action.type} />
            <span className="text-sm text-bolt-elements-textPrimary truncate flex-1 min-w-0">{displayText}</span>
          </div>
        </div>

        {/* Expand button */}
        <button
          onClick={onToggleExpand}
          className="p-1.5 rounded hover:bg-bolt-elements-background-depth-3 transition-colors"
          title={isExpanded ? 'Réduire' : 'Voir les détails'}
        >
          <div
            className={classNames(
              'i-ph:caret-down text-bolt-elements-textSecondary transition-transform',
              isExpanded ? 'rotate-180' : '',
            )}
          />
        </button>
      </div>

      {/* Expanded details */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            className="overflow-hidden"
          >
            <div className="px-3 pb-3">{renderDetails()}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
});

/*
 * ============================================================================
 * MAIN COMPONENT
 * ============================================================================
 */

export const ActionApprovalModal = memo(
  ({
    isOpen,
    batch,
    onApproveAll,
    onRejectAll,
    onApproveSelected,
    onClose,
    isProcessing = false,
  }: ActionApprovalModalProps) => {
    const [selectedActions, setSelectedActions] = useState<Set<string>>(new Set());
    const [expandedActions, setExpandedActions] = useState<Set<string>>(new Set());

    // Initialize all actions as selected when batch changes
    useMemo(() => {
      if (batch) {
        setSelectedActions(new Set(batch.actions.map((a) => a.id)));
        setExpandedActions(new Set());
      }
    }, [batch?.id]);

    const toggleSelect = useCallback((actionId: string) => {
      setSelectedActions((prev) => {
        const next = new Set(prev);

        if (next.has(actionId)) {
          next.delete(actionId);
        } else {
          next.add(actionId);
        }

        return next;
      });
    }, []);

    const toggleExpand = useCallback((actionId: string) => {
      setExpandedActions((prev) => {
        const next = new Set(prev);

        if (next.has(actionId)) {
          next.delete(actionId);
        } else {
          next.add(actionId);
        }

        return next;
      });
    }, []);

    const selectAll = useCallback(() => {
      if (batch) {
        setSelectedActions(new Set(batch.actions.map((a) => a.id)));
      }
    }, [batch]);

    const selectNone = useCallback(() => {
      setSelectedActions(new Set());
    }, []);

    const handleApproveSelected = useCallback(() => {
      onApproveSelected(Array.from(selectedActions));
    }, [selectedActions, onApproveSelected]);

    const stats = useMemo(() => (batch ? getBatchStats(batch) : null), [batch]);

    if (!isOpen || !batch) {
      return null;
    }

    const allSelected = selectedActions.size === batch.actions.length;
    const noneSelected = selectedActions.size === 0;
    const someSelected = selectedActions.size > 0 && selectedActions.size < batch.actions.length;

    return (
      <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={onClose}
        >
          <motion.div
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            className="w-full max-w-2xl max-h-[85vh] bg-bolt-elements-background-depth-1 rounded-xl shadow-2xl border border-bolt-elements-borderColor overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
              <div className="p-2 rounded-lg bg-accent-500/20">
                <AgentIcon agent={batch.agent} />
              </div>
              <div className="flex-1">
                <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">Approbation requise</h2>
                <p className="text-sm text-bolt-elements-textSecondary">
                  {batch.agent.charAt(0).toUpperCase() + batch.agent.slice(1)}Agent demande l'autorisation
                </p>
              </div>
              <button
                onClick={onClose}
                className="p-2 rounded-lg hover:bg-bolt-elements-background-depth-3 transition-colors"
                disabled={isProcessing}
              >
                <div className="i-ph:x text-bolt-elements-textSecondary" />
              </button>
            </div>

            {/* Stats */}
            {stats && (
              <div className="flex items-center gap-4 px-5 py-3 bg-bolt-elements-background-depth-3 border-b border-bolt-elements-borderColor text-xs">
                <span className="text-bolt-elements-textSecondary">
                  {stats.totalActions} action{stats.totalActions > 1 ? 's' : ''}
                </span>
                {stats.fileCreations > 0 && (
                  <span className="text-green-400">
                    +{stats.fileCreations} fichier{stats.fileCreations > 1 ? 's' : ''}
                  </span>
                )}
                {stats.fileModifications > 0 && (
                  <span className="text-blue-400">
                    ~{stats.fileModifications} modif{stats.fileModifications > 1 ? 's' : ''}
                  </span>
                )}
                {stats.fileDeletions > 0 && (
                  <span className="text-red-400">
                    -{stats.fileDeletions} suppression{stats.fileDeletions > 1 ? 's' : ''}
                  </span>
                )}
                {stats.shellCommands > 0 && (
                  <span className="text-purple-400">
                    {stats.shellCommands} commande{stats.shellCommands > 1 ? 's' : ''}
                  </span>
                )}
              </div>
            )}

            {/* Selection controls */}
            <div className="flex items-center gap-2 px-5 py-2 border-b border-bolt-elements-borderColor">
              <button
                onClick={selectAll}
                className={classNames(
                  'text-xs px-2 py-1 rounded transition-colors',
                  allSelected
                    ? 'bg-accent-500/20 text-accent-400'
                    : 'hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary',
                )}
              >
                Tout sélectionner
              </button>
              <button
                onClick={selectNone}
                className={classNames(
                  'text-xs px-2 py-1 rounded transition-colors',
                  noneSelected
                    ? 'bg-accent-500/20 text-accent-400'
                    : 'hover:bg-bolt-elements-background-depth-3 text-bolt-elements-textSecondary',
                )}
              >
                Tout désélectionner
              </button>
              <span className="flex-1" />
              <span className="text-xs text-bolt-elements-textTertiary">
                {selectedActions.size}/{batch.actions.length} sélectionné{selectedActions.size > 1 ? 's' : ''}
              </span>
            </div>

            {/* Actions list */}
            <div className="flex-1 overflow-y-auto p-4 space-y-2">
              {batch.actions.map((action) => (
                <ActionItem
                  key={action.id}
                  action={action}
                  isSelected={selectedActions.has(action.id)}
                  isExpanded={expandedActions.has(action.id)}
                  onToggleSelect={() => toggleSelect(action.id)}
                  onToggleExpand={() => toggleExpand(action.id)}
                />
              ))}
            </div>

            {/* Footer */}
            <div className="flex items-center gap-3 px-5 py-4 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
              <button
                onClick={onRejectAll}
                disabled={isProcessing}
                className="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
              >
                <div className="flex items-center gap-2">
                  <div className="i-ph:x" />
                  Tout refuser
                </div>
              </button>

              <span className="flex-1" />

              {someSelected && (
                <button
                  onClick={handleApproveSelected}
                  disabled={isProcessing || noneSelected}
                  className="px-4 py-2 rounded-lg bg-blue-500/20 text-blue-400 border border-blue-500/50 hover:bg-blue-500/30 transition-colors disabled:opacity-50"
                >
                  <div className="flex items-center gap-2">
                    <div className="i-ph:check" />
                    Approuver sélection ({selectedActions.size})
                  </div>
                </button>
              )}

              <button
                onClick={onApproveAll}
                disabled={isProcessing}
                className="px-4 py-2 rounded-lg bg-accent-500 text-white hover:bg-accent-600 transition-colors disabled:opacity-50 flex items-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <div className="i-svg-spinners:90-ring-with-bg" />
                    Traitement...
                  </>
                ) : (
                  <>
                    <div className="i-ph:check-circle" />
                    Tout approuver
                  </>
                )}
              </button>
            </div>
          </motion.div>
        </motion.div>
      </AnimatePresence>
    );
  },
);

ActionApprovalModal.displayName = 'ActionApprovalModal';
