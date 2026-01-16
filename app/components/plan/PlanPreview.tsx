'use client';

/**
 * PlanPreview - Composant d'affichage et d'approbation du plan
 *
 * Affiche le plan généré par BAVINI en mode planification et permet
 * à l'utilisateur de l'approuver, le modifier ou le rejeter.
 */

import { memo, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStore } from '@nanostores/react';
import { classNames } from '~/utils/classNames';
import type { Plan, PlanStep, PlanPermission } from '~/lib/.server/agents/types';
import {
  planStore,
  planModalOpenStore,
  approvePlan,
  rejectPlan,
  grantPermission,
  revokePermission,
  grantAllPermissions,
  togglePlanModal,
  canApprovePlan,
  pendingPermissionsCount,
} from '~/lib/stores/plan';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

interface PlanPreviewProps {
  /** Callback après approbation */
  onApproved?: (plan: Plan) => void;

  /** Callback après rejet */
  onRejected?: () => void;
}

/*
 * ============================================================================
 * CONSTANTS
 * ============================================================================
 */

const RISK_COLORS = {
  low: 'text-green-400 bg-green-500/10 border-green-500/30',
  medium: 'text-yellow-400 bg-yellow-500/10 border-yellow-500/30',
  high: 'text-red-400 bg-red-500/10 border-red-500/30',
};

const RISK_ICONS = {
  low: 'i-ph:shield-check',
  medium: 'i-ph:warning',
  high: 'i-ph:warning-octagon',
};

const ACTION_TYPE_ICONS: Record<PlanStep['actionType'], string> = {
  create: 'i-ph:file-plus',
  modify: 'i-ph:pencil-simple',
  delete: 'i-ph:trash',
  command: 'i-ph:terminal',
  test: 'i-ph:test-tube',
  review: 'i-ph:eye',
};

const PERMISSION_ICONS: Record<PlanPermission['type'], string> = {
  bash: 'i-ph:terminal',
  file_write: 'i-ph:file-plus',
  file_delete: 'i-ph:trash',
  install: 'i-ph:package',
  git: 'i-ph:git-branch',
};

/*
 * ============================================================================
 * HELPER COMPONENTS
 * ============================================================================
 */

/**
 * Badge de risque
 */
const RiskBadge = memo(({ risk }: { risk: 'low' | 'medium' | 'high' }) => {
  const labels = { low: 'Faible', medium: 'Moyen', high: 'Élevé' };

  return (
    <span
      className={classNames('inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded border', RISK_COLORS[risk])}
    >
      <div className={RISK_ICONS[risk]} />
      {labels[risk]}
    </span>
  );
});

/**
 * Étape du plan
 */
const PlanStepItem = memo(({ step, isLast }: { step: PlanStep; isLast: boolean }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  return (
    <div className="relative">
      {/* Timeline connector */}
      {!isLast && <div className="absolute left-4 top-10 bottom-0 w-0.5 bg-bolt-elements-borderColor" />}

      <div className="flex gap-3">
        {/* Step number */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-accent-500/20 text-accent-400 flex items-center justify-center text-sm font-medium">
          {step.order}
        </div>

        {/* Step content */}
        <div className="flex-1 pb-4">
          <div className="flex items-start gap-2 cursor-pointer" onClick={() => setIsExpanded(!isExpanded)}>
            <div
              className={classNames(ACTION_TYPE_ICONS[step.actionType], 'text-bolt-elements-textSecondary mt-0.5')}
            />
            <div className="flex-1">
              <p className="text-sm text-bolt-elements-textPrimary">{step.description}</p>
              <div className="flex items-center gap-2 mt-1">
                <RiskBadge risk={step.risk} />
                <span className="text-xs text-bolt-elements-textTertiary capitalize">{step.actionType}</span>
              </div>
            </div>
            <div
              className={classNames(
                'i-ph:caret-down text-bolt-elements-textSecondary transition-transform',
                isExpanded ? 'rotate-180' : '',
              )}
            />
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
                <div className="mt-3 pl-6 space-y-2">
                  {step.files && step.files.length > 0 && (
                    <div>
                      <span className="text-xs text-bolt-elements-textSecondary">Fichiers:</span>
                      <div className="mt-1 space-y-1">
                        {step.files.map((file, i) => (
                          <code
                            key={i}
                            className="block text-xs px-2 py-1 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary"
                          >
                            {file}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}

                  {step.commands && step.commands.length > 0 && (
                    <div>
                      <span className="text-xs text-bolt-elements-textSecondary">Commandes:</span>
                      <div className="mt-1 space-y-1">
                        {step.commands.map((cmd, i) => (
                          <code
                            key={i}
                            className="block text-xs px-2 py-1 rounded bg-sky-500/10 text-sky-300 font-mono"
                          >
                            $ {cmd}
                          </code>
                        ))}
                      </div>
                    </div>
                  )}

                  {step.dependsOn && step.dependsOn.length > 0 && (
                    <div className="text-xs text-bolt-elements-textTertiary">
                      Dépend des étapes: {step.dependsOn.join(', ')}
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
});

/**
 * Item de permission
 */
const PermissionItem = memo(
  ({
    permission,
    index,
    isGranted,
    onToggle,
  }: {
    permission: PlanPermission;
    index: number;
    isGranted: boolean;
    onToggle: () => void;
  }) => {
    return (
      <div
        className={classNames(
          'flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors',
          isGranted
            ? 'border-accent-500/50 bg-accent-500/10'
            : 'border-bolt-elements-borderColor bg-bolt-elements-background-depth-2 hover:border-accent-500/30',
        )}
        onClick={onToggle}
      >
        {/* Checkbox */}
        <div
          className={classNames(
            'w-5 h-5 rounded border-2 flex items-center justify-center transition-colors',
            isGranted ? 'bg-accent-500 border-accent-500' : 'border-bolt-elements-borderColor',
          )}
        >
          {isGranted && <div className="i-ph:check text-white text-sm" />}
        </div>

        {/* Icon */}
        <div className={classNames(PERMISSION_ICONS[permission.type], 'text-lg text-bolt-elements-textSecondary')} />

        {/* Content */}
        <div className="flex-1">
          <p className="text-sm text-bolt-elements-textPrimary">{permission.description}</p>
          {permission.scope && <code className="text-xs text-bolt-elements-textTertiary">{permission.scope}</code>}
        </div>
      </div>
    );
  },
);

/*
 * ============================================================================
 * MAIN COMPONENT
 * ============================================================================
 */

export const PlanPreview = memo(({ onApproved, onRejected }: PlanPreviewProps) => {
  const state = useStore(planStore);
  const isOpen = useStore(planModalOpenStore);
  const canApprove = useStore(canApprovePlan);
  const pendingCount = useStore(pendingPermissionsCount);

  const [activeTab, setActiveTab] = useState<'steps' | 'permissions'>('steps');

  const plan = state.currentPlan;

  const handleApprove = useCallback(() => {
    if (approvePlan() && plan) {
      onApproved?.(plan);
    }
  }, [plan, onApproved]);

  const handleReject = useCallback(() => {
    rejectPlan();
    onRejected?.();
  }, [onRejected]);

  const handleClose = useCallback(() => {
    togglePlanModal(false);
  }, []);

  const handleTogglePermission = useCallback(
    (index: number) => {
      if (state.grantedPermissions.has(index)) {
        revokePermission(index);
      } else {
        grantPermission(index);
      }
    },
    [state.grantedPermissions],
  );

  const handleGrantAll = useCallback(() => {
    grantAllPermissions();
  }, []);

  // Basculer sur l'onglet permissions si nécessaire
  useEffect(() => {
    if (pendingCount > 0 && activeTab === 'steps') {
      // Ne pas forcer, juste indiquer visuellement
    }
  }, [pendingCount, activeTab]);

  if (!isOpen || !plan) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={handleClose}
      >
        <motion.div
          initial={{ scale: 0.95, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          exit={{ scale: 0.95, opacity: 0 }}
          className="w-full max-w-3xl max-h-[85vh] bg-bolt-elements-background-depth-1 rounded-xl shadow-2xl border border-bolt-elements-borderColor overflow-hidden flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 px-5 py-4 border-b border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
            <div className="p-2 rounded-lg bg-accent-500/20">
              <div className="i-ph:clipboard-text text-accent-400 text-lg" />
            </div>
            <div className="flex-1">
              <h2 className="text-lg font-semibold text-bolt-elements-textPrimary">{plan.title}</h2>
              <p className="text-sm text-bolt-elements-textSecondary">{plan.summary}</p>
            </div>
            <button
              onClick={handleClose}
              className="p-2 rounded-lg hover:bg-bolt-elements-background-depth-3 transition-colors"
            >
              <div className="i-ph:x text-bolt-elements-textSecondary" />
            </button>
          </div>

          {/* Estimations */}
          <div className="flex items-center gap-4 px-5 py-3 bg-bolt-elements-background-depth-3 border-b border-bolt-elements-borderColor text-xs">
            <span className="text-bolt-elements-textSecondary">
              {plan.steps.length} étape{plan.steps.length > 1 ? 's' : ''}
            </span>
            <span className="text-bolt-elements-textSecondary">
              {plan.estimates.filesAffected} fichier{plan.estimates.filesAffected > 1 ? 's' : ''}
            </span>
            <span className="text-bolt-elements-textTertiary">{plan.estimates.duration}</span>
            <span className="flex-1" />
            <RiskBadge risk={plan.estimates.risk} />
          </div>

          {/* Tabs */}
          <div className="flex border-b border-bolt-elements-borderColor">
            <button
              className={classNames(
                'flex-1 px-4 py-3 text-sm font-medium transition-colors',
                activeTab === 'steps'
                  ? 'text-accent-400 border-b-2 border-accent-500 bg-accent-500/5'
                  : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
              )}
              onClick={() => setActiveTab('steps')}
            >
              <div className="flex items-center justify-center gap-2">
                <div className="i-ph:list-numbers" />
                Étapes ({plan.steps.length})
              </div>
            </button>
            <button
              className={classNames(
                'flex-1 px-4 py-3 text-sm font-medium transition-colors relative',
                activeTab === 'permissions'
                  ? 'text-accent-400 border-b-2 border-accent-500 bg-accent-500/5'
                  : 'text-bolt-elements-textSecondary hover:text-bolt-elements-textPrimary',
              )}
              onClick={() => setActiveTab('permissions')}
            >
              <div className="flex items-center justify-center gap-2">
                <div className="i-ph:key" />
                Permissions ({plan.permissions.length})
                {pendingCount > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-yellow-500/20 text-yellow-400">
                    {pendingCount}
                  </span>
                )}
              </div>
            </button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-5">
            {activeTab === 'steps' ? (
              <div className="space-y-1">
                {plan.steps.map((step, index) => (
                  <PlanStepItem key={step.order} step={step} isLast={index === plan.steps.length - 1} />
                ))}

                {plan.criticalFiles.length > 0 && (
                  <div className="mt-6 p-4 rounded-lg bg-bolt-elements-background-depth-2 border border-bolt-elements-borderColor">
                    <h4 className="text-sm font-medium text-bolt-elements-textPrimary mb-2 flex items-center gap-2">
                      <div className="i-ph:warning-circle text-yellow-400" />
                      Fichiers critiques
                    </h4>
                    <div className="space-y-1">
                      {plan.criticalFiles.map((file, i) => (
                        <code
                          key={i}
                          className="block text-xs px-2 py-1 rounded bg-bolt-elements-background-depth-3 text-bolt-elements-textPrimary"
                        >
                          {file}
                        </code>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                {plan.permissions.length === 0 ? (
                  <div className="text-center py-8 text-bolt-elements-textSecondary">
                    <div className="i-ph:check-circle text-4xl text-green-400 mx-auto mb-2" />
                    <p>Aucune permission spéciale requise</p>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center justify-between mb-4">
                      <p className="text-sm text-bolt-elements-textSecondary">
                        Accordez les permissions nécessaires pour exécuter ce plan
                      </p>
                      <button
                        onClick={handleGrantAll}
                        className="text-xs px-2 py-1 rounded text-accent-400 hover:bg-accent-500/10 transition-colors"
                      >
                        Tout accorder
                      </button>
                    </div>
                    {plan.permissions.map((permission, index) => (
                      <PermissionItem
                        key={index}
                        permission={permission}
                        index={index}
                        isGranted={state.grantedPermissions.has(index)}
                        onToggle={() => handleTogglePermission(index)}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-3 px-5 py-4 border-t border-bolt-elements-borderColor bg-bolt-elements-background-depth-2">
            <button
              onClick={handleReject}
              className="px-4 py-2 rounded-lg border border-red-500/50 text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <div className="flex items-center gap-2">
                <div className="i-ph:x" />
                Rejeter
              </div>
            </button>

            <span className="flex-1" />

            {!canApprove && pendingCount > 0 && (
              <span className="text-xs text-yellow-400">
                {pendingCount} permission{pendingCount > 1 ? 's' : ''} en attente
              </span>
            )}

            <button
              onClick={handleApprove}
              disabled={!canApprove}
              className={classNames(
                'px-4 py-2 rounded-lg transition-colors flex items-center gap-2',
                canApprove
                  ? 'bg-accent-500 text-white hover:bg-accent-600'
                  : 'bg-bolt-elements-background-depth-3 text-bolt-elements-textTertiary cursor-not-allowed',
              )}
            >
              <div className="i-ph:check-circle" />
              Approuver et exécuter
            </button>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
});

PlanPreview.displayName = 'PlanPreview';

export default PlanPreview;
