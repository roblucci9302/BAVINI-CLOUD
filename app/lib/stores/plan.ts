/**
 * Store pour le Mode Plan
 *
 * Gère l'état du mode planification:
 * - Activation/désactivation du mode plan
 * - Phase actuelle (exploration, rédaction, approbation)
 * - Plan en cours
 * - Permissions demandées
 */

import { map, atom, computed } from 'nanostores';
import type { Plan, PlanStep, PlanPermission, PlanPhase, PlanModeState } from '~/lib/.server/agents/types';

/*
 * ============================================================================
 * TYPES LOCAUX
 * ============================================================================
 */

/**
 * État complet du mode plan côté client
 */
export interface PlanStoreState {
  /** Mode plan actif */
  isActive: boolean;

  /** Phase actuelle */
  phase: PlanPhase;

  /** Plan en cours */
  currentPlan: Plan | null;

  /** Contenu markdown du plan (pour l'édition) */
  planMarkdown: string;

  /** Plan modifié par l'utilisateur */
  isEdited: boolean;

  /** Permissions accordées */
  grantedPermissions: Set<number>;

  /** Erreur éventuelle */
  error: string | null;
}

/*
 * ============================================================================
 * STORES
 * ============================================================================
 */

/**
 * Store principal du mode plan
 */
export const planStore = map<PlanStoreState>({
  isActive: false,
  phase: 'exploring',
  currentPlan: null,
  planMarkdown: '',
  isEdited: false,
  grantedPermissions: new Set(),
  error: null,
});

/**
 * Modal du plan ouvert ?
 */
export const planModalOpenStore = atom<boolean>(false);

/**
 * Panel de permissions ouvert ?
 */
export const permissionsModalOpenStore = atom<boolean>(false);

/*
 * ============================================================================
 * COMPUTED VALUES
 * ============================================================================
 */

/**
 * Le plan est-il prêt à être approuvé ?
 * (toutes les permissions accordées)
 */
export const canApprovePlan = computed(planStore, (state) => {
  if (!state.currentPlan) {
    return false;
  }

  const totalPermissions = state.currentPlan.permissions.length;

  return state.grantedPermissions.size === totalPermissions;
});

/**
 * Nombre de permissions en attente
 */
export const pendingPermissionsCount = computed(planStore, (state) => {
  if (!state.currentPlan) {
    return 0;
  }

  return state.currentPlan.permissions.length - state.grantedPermissions.size;
});

/**
 * Le mode plan est-il en attente d'approbation ?
 */
export const isAwaitingApproval = computed(planStore, (state) => {
  return state.isActive && state.phase === 'awaiting_approval';
});

/*
 * ============================================================================
 * ACTIONS
 * ============================================================================
 */

/**
 * Entre en mode plan
 */
export function enterPlanMode(): void {
  planStore.set({
    isActive: true,
    phase: 'exploring',
    currentPlan: null,
    planMarkdown: '',
    isEdited: false,
    grantedPermissions: new Set(),
    error: null,
  });
}

/**
 * Sort du mode plan
 */
export function exitPlanMode(approved: boolean = false): void {
  const current = planStore.get();
  planStore.set({
    ...current,
    isActive: false,
    phase: approved ? 'approved' : 'rejected',
  });
  planModalOpenStore.set(false);
  permissionsModalOpenStore.set(false);
}

/**
 * Change la phase du mode plan
 */
export function setPlanPhase(phase: PlanPhase): void {
  planStore.setKey('phase', phase);
}

/**
 * Définit le plan actuel
 */
export function setCurrentPlan(plan: Plan): void {
  planStore.setKey('currentPlan', plan);
  planStore.setKey('planMarkdown', planToMarkdown(plan));
  planStore.setKey('phase', 'awaiting_approval');
  planStore.setKey('grantedPermissions', new Set());
  planModalOpenStore.set(true);
}

/**
 * Met à jour le markdown du plan (édition utilisateur)
 */
export function updatePlanMarkdown(markdown: string): void {
  planStore.setKey('planMarkdown', markdown);
  planStore.setKey('isEdited', true);
}

/**
 * Accorde une permission
 */
export function grantPermission(index: number): void {
  const current = planStore.get();
  const newGranted = new Set(current.grantedPermissions);
  newGranted.add(index);
  planStore.setKey('grantedPermissions', newGranted);
}

/**
 * Révoque une permission
 */
export function revokePermission(index: number): void {
  const current = planStore.get();
  const newGranted = new Set(current.grantedPermissions);
  newGranted.delete(index);
  planStore.setKey('grantedPermissions', newGranted);
}

/**
 * Accorde toutes les permissions
 */
export function grantAllPermissions(): void {
  const current = planStore.get();

  if (!current.currentPlan) {
    return;
  }

  const allIndices = new Set(current.currentPlan.permissions.map((_, i) => i));
  planStore.setKey('grantedPermissions', allIndices);
}

/**
 * Approuve le plan
 */
export function approvePlan(): boolean {
  const current = planStore.get();

  if (!current.currentPlan) {
    planStore.setKey('error', 'Aucun plan à approuver');
    return false;
  }

  // Vérifier que toutes les permissions sont accordées
  if (current.grantedPermissions.size < current.currentPlan.permissions.length) {
    planStore.setKey('error', 'Toutes les permissions doivent être accordées');
    permissionsModalOpenStore.set(true);

    return false;
  }

  planStore.setKey('phase', 'approved');
  planModalOpenStore.set(false);

  return true;
}

/**
 * Rejette le plan
 */
export function rejectPlan(): void {
  planStore.setKey('phase', 'rejected');
  planModalOpenStore.set(false);
}

/**
 * Réinitialise l'erreur
 */
export function clearPlanError(): void {
  planStore.setKey('error', null);
}

/**
 * Ouvre/ferme le modal du plan
 */
export function togglePlanModal(open?: boolean): void {
  const current = planModalOpenStore.get();
  planModalOpenStore.set(open !== undefined ? open : !current);
}

/**
 * Ouvre/ferme le modal des permissions
 */
export function togglePermissionsModal(open?: boolean): void {
  const current = permissionsModalOpenStore.get();
  permissionsModalOpenStore.set(open !== undefined ? open : !current);
}

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

/**
 * Convertit un plan en markdown
 */
export function planToMarkdown(plan: Plan): string {
  const lines: string[] = [`# ${plan.title}`, '', '## Résumé', plan.summary, '', '## Étapes', ''];

  for (const step of plan.steps) {
    const riskIcon = step.risk === 'high' ? '🔴' : step.risk === 'medium' ? '🟡' : '🟢';
    lines.push(`### ${step.order}. ${step.description} ${riskIcon}`);
    lines.push('');
    lines.push(`**Type:** ${step.actionType}`);
    lines.push(`**Risque:** ${step.risk}`);

    if (step.files && step.files.length > 0) {
      lines.push('');
      lines.push('**Fichiers:**');
      step.files.forEach((f) => lines.push(`- \`${f}\``));
    }

    if (step.commands && step.commands.length > 0) {
      lines.push('');
      lines.push('**Commandes:**');
      step.commands.forEach((c) => lines.push(`\`\`\`bash\n${c}\n\`\`\``));
    }

    lines.push('');
  }

  if (plan.criticalFiles.length > 0) {
    lines.push('## Fichiers critiques');
    lines.push('');
    plan.criticalFiles.forEach((f) => lines.push(`- \`${f}\``));
    lines.push('');
  }

  lines.push('## Estimations');
  lines.push('');
  lines.push(`- **Durée estimée:** ${plan.estimates.duration}`);
  lines.push(`- **Fichiers affectés:** ${plan.estimates.filesAffected}`);
  lines.push(`- **Risque global:** ${plan.estimates.risk}`);

  return lines.join('\n');
}

/**
 * Vérifie si le mode plan est actif
 */
export function isPlanModeActive(): boolean {
  return planStore.get().isActive;
}

/**
 * Retourne le plan actuel
 */
export function getCurrentPlan(): Plan | null {
  return planStore.get().currentPlan;
}

/**
 * Retourne la phase actuelle
 */
export function getCurrentPhase(): PlanPhase {
  return planStore.get().phase;
}
