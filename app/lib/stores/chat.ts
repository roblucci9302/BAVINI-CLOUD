import { map, atom } from 'nanostores';
import type { ProposedAction, PendingActionBatch, ValidationStatus } from '~/lib/agents/security/action-validator';
import type { AgentType } from '~/lib/agents/types';
import { CircularBuffer } from '~/lib/utils/circular-buffer';

// Buffer circulaire pour l'historique des batches (O(1) insertion vs O(n) avec slice)
// LAZY INITIALIZATION: Le buffer n'est créé que lors du premier accès
const PROCESSED_BATCHES_CAPACITY = 50;
let _processedBatchesBuffer: CircularBuffer<PendingActionBatch & { processedAt: Date }> | null = null;

function getProcessedBatchesBuffer(): CircularBuffer<PendingActionBatch & { processedAt: Date }> {
  if (!_processedBatchesBuffer) {
    _processedBatchesBuffer = new CircularBuffer<PendingActionBatch & { processedAt: Date }>(PROCESSED_BATCHES_CAPACITY);
  }
  return _processedBatchesBuffer;
}

/**
 * Mode d'opération du chat
 * - 'chat': Mode analyse uniquement (lecture seule, pas de modifications)
 * - 'agent': Mode action (BAVINI peut créer/modifier du code) - DÉFAUT
 * - 'plan': Mode planification (exploration + plan avant exécution)
 */
export type ChatMode = 'chat' | 'agent' | 'plan';

/**
 * Mode de contrôle des agents
 * - 'strict': Chaque action nécessite une approbation
 * - 'moderate': Seules les actions dangereuses nécessitent une approbation
 * - 'permissive': Seules les suppressions et commandes shell nécessitent une approbation
 */
export type AgentControlMode = 'strict' | 'moderate' | 'permissive';

export interface ChatState {
  /** Le chat a-t-il démarré */
  started: boolean;

  /** Le chat a-t-il été interrompu */
  aborted: boolean;

  /** Afficher le panneau de chat */
  showChat: boolean;

  /** Mode d'opération actuel */
  mode: ChatMode;

  /** Mode de contrôle des agents */
  controlMode: AgentControlMode;

  /** Le mode Agent est-il en attente de validation */
  awaitingAgentApproval: boolean;
}

export const chatStore = map<ChatState>({
  started: false,
  aborted: false,
  showChat: true,
  mode: 'agent',
  controlMode: 'strict', // Mode strict par défaut
  awaitingAgentApproval: false,
});

/*
 * ============================================================================
 * STORES POUR L'APPROBATION DES ACTIONS
 * ============================================================================
 */

/**
 * Batch d'actions actuellement en attente d'approbation
 */
export const pendingBatchStore = atom<PendingActionBatch | null>(null);

/**
 * Historique des batches traités (approuvés ou rejetés)
 */
export const processedBatchesStore = atom<Array<PendingActionBatch & { processedAt: Date }>>([]);

/**
 * Modal d'approbation ouvert ?
 */
export const approvalModalOpenStore = atom<boolean>(false);

/**
 * Panneau d'activité des agents ouvert ?
 */
export const activityPanelOpenStore = atom<boolean>(false);

/*
 * ============================================================================
 * ACTIONS DU CHAT STORE
 * ============================================================================
 */

/**
 * Change le mode du chat entre 'chat' (analyse seule) et 'agent' (avec actions).
 *
 * @param mode - Le nouveau mode à appliquer
 * @returns void
 *
 * @example
 * ```ts
 * setChatMode('agent'); // Active le mode agent
 * setChatMode('chat');  // Passe en mode lecture seule
 * ```
 */
export function setChatMode(mode: ChatMode): void {
  chatStore.setKey('mode', mode);
}

/**
 * Retourne le mode actuel du chat.
 *
 * @returns Le mode actuel ('chat' ou 'agent')
 *
 * @example
 * ```ts
 * const mode = getChatMode();
 * if (mode === 'agent') {
 *   // Actions autorisées
 * }
 * ```
 */
export function getChatMode(): ChatMode {
  return chatStore.get().mode;
}

/**
 * Change le mode de contrôle des agents.
 *
 * - 'strict': Chaque action nécessite approbation
 * - 'moderate': Seules les actions dangereuses nécessitent approbation
 * - 'permissive': Seules les suppressions/shell nécessitent approbation
 *
 * @param mode - Le niveau de contrôle à appliquer
 * @returns void
 *
 * @example
 * ```ts
 * setAgentControlMode('strict');     // Approbation pour tout
 * setAgentControlMode('permissive'); // Approbation minimale
 * ```
 */
export function setAgentControlMode(mode: AgentControlMode): void {
  chatStore.setKey('controlMode', mode);
}

/**
 * Retourne le mode de contrôle actuel des agents.
 *
 * @returns Le mode de contrôle ('strict', 'moderate', ou 'permissive')
 */
export function getAgentControlMode(): AgentControlMode {
  return chatStore.get().controlMode;
}

/*
 * ============================================================================
 * ACTIONS D'APPROBATION
 * ============================================================================
 */

/**
 * Soumet un batch d'actions pour approbation utilisateur.
 * Ouvre automatiquement le modal d'approbation.
 *
 * @param batch - Le batch d'actions à soumettre (contient id, agent, actions, description)
 * @returns void
 *
 * @example
 * ```ts
 * submitBatchForApproval({
 *   id: 'batch-123',
 *   agent: 'coder',
 *   actions: [{ id: 'action-1', type: 'file:create', ... }],
 *   description: 'Créer le composant Button',
 *   createdAt: new Date(),
 *   status: 'pending',
 * });
 * ```
 */
export function submitBatchForApproval(batch: PendingActionBatch): void {
  pendingBatchStore.set(batch);
  approvalModalOpenStore.set(true);
  chatStore.setKey('awaitingAgentApproval', true);
}

/**
 * Approuve toutes les actions du batch en cours.
 * Ferme le modal d'approbation et ajoute le batch à l'historique.
 *
 * @returns Liste des actions approuvées avec leur nouveau statut
 *
 * @example
 * ```ts
 * const approved = approveAllActions();
 * console.log(`${approved.length} actions approuvées`);
 * ```
 */
export function approveAllActions(): ProposedAction[] {
  const batch = pendingBatchStore.get();

  if (!batch) {
    return [];
  }

  // Marquer toutes les actions comme approuvées
  const approvedActions = batch.actions.map((action) => ({
    ...action,
    status: 'approved' as ValidationStatus,
    validatedAt: new Date(),
  }));

  // Ajouter à l'historique
  const processedBatch: PendingActionBatch & { processedAt: Date } = {
    ...batch,
    actions: approvedActions,
    status: 'approved',
    processedAt: new Date(),
  };

  // Utiliser le buffer circulaire O(1) au lieu de slice O(n)
  getProcessedBatchesBuffer().push(processedBatch);
  processedBatchesStore.set(getProcessedBatchesBuffer().toArray());

  // Réinitialiser
  pendingBatchStore.set(null);
  approvalModalOpenStore.set(false);
  chatStore.setKey('awaitingAgentApproval', false);

  return approvedActions;
}

/**
 * Approuve seulement certaines actions du batch en cours.
 * Les actions non sélectionnées sont marquées comme rejetées.
 *
 * @param actionIds - Liste des IDs des actions à approuver
 * @returns Liste des actions approuvées (exclut les rejetées)
 *
 * @example
 * ```ts
 * // Approuver seulement les 2 premières actions
 * const approved = approveSelectedActions(['action-1', 'action-2']);
 * ```
 */
export function approveSelectedActions(actionIds: string[]): ProposedAction[] {
  const batch = pendingBatchStore.get();

  if (!batch) {
    return [];
  }

  const selectedSet = new Set(actionIds);

  // Marquer les actions sélectionnées comme approuvées, les autres comme rejetées
  const processedActions = batch.actions.map((action) => ({
    ...action,
    status: selectedSet.has(action.id) ? ('approved' as ValidationStatus) : ('rejected' as ValidationStatus),
    validatedAt: new Date(),
    rejectionReason: selectedSet.has(action.id) ? undefined : "Non sélectionné par l'utilisateur",
  }));

  const approvedActions = processedActions.filter((a) => a.status === 'approved');

  // Ajouter à l'historique
  const processedBatch: PendingActionBatch & { processedAt: Date } = {
    ...batch,
    actions: processedActions,
    status: approvedActions.length > 0 ? 'partially_approved' : 'rejected',
    processedAt: new Date(),
  };

  // Utiliser le buffer circulaire O(1) au lieu de slice O(n)
  getProcessedBatchesBuffer().push(processedBatch);
  processedBatchesStore.set(getProcessedBatchesBuffer().toArray());

  // Réinitialiser
  pendingBatchStore.set(null);
  approvalModalOpenStore.set(false);
  chatStore.setKey('awaitingAgentApproval', false);

  return approvedActions;
}

/**
 * Rejette toutes les actions du batch en cours.
 * Ferme le modal et ajoute le batch rejeté à l'historique.
 *
 * @returns void
 */
export function rejectAllActions(): void {
  const batch = pendingBatchStore.get();

  if (!batch) {
    return;
  }

  // Marquer toutes les actions comme rejetées
  const rejectedActions = batch.actions.map((action) => ({
    ...action,
    status: 'rejected' as ValidationStatus,
    validatedAt: new Date(),
    rejectionReason: "Rejeté par l'utilisateur",
  }));

  // Ajouter à l'historique
  const processedBatch: PendingActionBatch & { processedAt: Date } = {
    ...batch,
    actions: rejectedActions,
    status: 'rejected',
    processedAt: new Date(),
  };

  // Utiliser le buffer circulaire O(1) au lieu de slice O(n)
  getProcessedBatchesBuffer().push(processedBatch);
  processedBatchesStore.set(getProcessedBatchesBuffer().toArray());

  // Réinitialiser
  pendingBatchStore.set(null);
  approvalModalOpenStore.set(false);
  chatStore.setKey('awaitingAgentApproval', false);
}

/**
 * Ferme le modal d'approbation sans décision
 * (le batch reste en attente)
 */
export function closeApprovalModal(): void {
  approvalModalOpenStore.set(false);
}

/**
 * Rouvre le modal d'approbation s'il y a un batch en attente
 */
export function reopenApprovalModal(): void {
  if (pendingBatchStore.get()) {
    approvalModalOpenStore.set(true);
  }
}

/*
 * ============================================================================
 * PANNEAU D'ACTIVITÉ
 * ============================================================================
 */

/**
 * Ouvre, ferme ou bascule le panneau d'activité des agents.
 *
 * @param open - Si défini, force l'état. Sinon, bascule l'état actuel.
 * @returns void
 *
 * @example
 * ```ts
 * toggleActivityPanel();      // Bascule l'état
 * toggleActivityPanel(true);  // Force l'ouverture
 * toggleActivityPanel(false); // Force la fermeture
 * ```
 */
export function toggleActivityPanel(open?: boolean): void {
  const current = activityPanelOpenStore.get();
  activityPanelOpenStore.set(open !== undefined ? open : !current);
}

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

/**
 * Vérifie si une approbation est en attente.
 *
 * @returns true si un batch attend l'approbation utilisateur
 */
export function hasApprovalPending(): boolean {
  return pendingBatchStore.get() !== null;
}

/**
 * Obtient le nombre d'actions en attente d'approbation.
 *
 * @returns Nombre d'actions dans le batch en attente, ou 0 si aucun batch
 */
export function getPendingActionsCount(): number {
  const batch = pendingBatchStore.get();
  return batch ? batch.actions.length : 0;
}

/**
 * Vérifie si le mode strict est actif.
 * En mode strict, toutes les actions nécessitent approbation.
 *
 * @returns true si controlMode === 'strict'
 */
export function isStrictMode(): boolean {
  return chatStore.get().controlMode === 'strict';
}

/*
 * ============================================================================
 * LEGACY COMPATIBILITY (pour les anciens composants)
 * ============================================================================
 */

/**
 * @deprecated Utiliser submitBatchForApproval à la place
 */
export function setPendingActions(actions: ProposedAction[]): void {
  if (actions.length === 0) {
    pendingBatchStore.set(null);
    chatStore.setKey('awaitingAgentApproval', false);

    return;
  }

  const batch: PendingActionBatch = {
    id: `batch-${Date.now()}`,
    agent: actions[0]?.agent || 'orchestrator',
    actions,
    description: `${actions.length} action(s) en attente`,
    createdAt: new Date(),
    status: 'pending',
  };

  submitBatchForApproval(batch);
}

/**
 * @deprecated Utiliser rejectAllActions à la place
 */
export function clearPendingActions(): void {
  rejectAllActions();
}

/**
 * @deprecated Utiliser approveAllActions à la place
 */
export function approveAgentMode(): ProposedAction[] {
  return approveAllActions();
}

/**
 * @deprecated Utiliser rejectAllActions à la place
 */
export function rejectAgentMode(): void {
  rejectAllActions();
}
