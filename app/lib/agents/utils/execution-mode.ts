/**
 * Gestionnaire de mode d'exécution pour les agents BAVINI
 *
 * Implémente le Plan Mode inspiré de Claude Code:
 * - plan: Mode exploration (lecture seule, pas de modifications)
 * - execute: Mode exécution (toutes les actions autorisées selon permissions)
 * - strict: Mode strict (toutes les actions nécessitent approbation)
 *
 * @module agents/utils/execution-mode
 */

import type { ExecutionMode, ToolType } from '../types';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Configuration du mode d'exécution
 */
export interface ExecutionModeConfig {
  /** Mode actuel */
  mode: ExecutionMode;

  /** Callback pour demander l'approbation */
  approvalCallback?: (action: PendingAction) => Promise<boolean>;

  /** Actions en attente d'approbation */
  pendingActions: PendingAction[];

  /** Historique des décisions */
  decisionHistory: ActionDecision[];
}

/**
 * Action en attente d'approbation
 */
export interface PendingAction {
  /** ID unique de l'action */
  id: string;

  /** Type d'outil */
  toolType: ToolType | string;

  /** Description de l'action */
  description: string;

  /** Paramètres de l'action */
  params: Record<string, unknown>;

  /** Timestamp de création */
  createdAt: Date;

  /** Impact estimé */
  impact: 'low' | 'medium' | 'high' | 'critical';
}

/**
 * Décision sur une action
 */
export interface ActionDecision {
  /** ID de l'action */
  actionId: string;

  /** Décision */
  decision: 'approved' | 'rejected' | 'auto_approved' | 'blocked';

  /** Raison */
  reason?: string;

  /** Timestamp */
  decidedAt: Date;

  /** Mode au moment de la décision */
  mode: ExecutionMode;
}

/**
 * Résultat de vérification de permission
 */
export interface PermissionCheckResult {
  /** Action autorisée? */
  allowed: boolean;

  /** Besoin d'approbation? */
  needsApproval: boolean;

  /** Raison */
  reason?: string;

  /** Action suggérée */
  suggestedAction?: 'proceed' | 'ask_approval' | 'block';
}

/*
 * ============================================================================
 * OUTILS EN LECTURE SEULE
 * ============================================================================
 */

/**
 * Liste des outils considérés comme en lecture seule
 * Ces outils sont autorisés en mode plan
 */
export const READ_ONLY_TOOLS: Set<string> = new Set([
  // Lecture de fichiers
  'read_file',
  'glob',
  'grep',
  'list_directory',
  'file_search',

  // Exploration
  'search_code',
  'get_file_info',
  'analyze_code',

  // Navigation
  'list_files',
  'find_files',

  // Documentation
  'read_docs',
  'get_schema',

  // Interaction utilisateur (toujours autorisé)
  'ask_user_question',
  'todo_write',
]);

/**
 * Outils à haut risque nécessitant toujours une approbation en mode strict
 */
export const HIGH_RISK_TOOLS: Set<string> = new Set([
  'delete_file',
  'run_command',
  'execute_shell',
  'git_push',
  'deploy',
  'database_migrate',
  'npm_publish',
]);

/*
 * ============================================================================
 * GESTIONNAIRE DE MODE D'EXÉCUTION
 * ============================================================================
 */

/**
 * Gestionnaire de mode d'exécution
 */
export class ExecutionModeManager {
  private config: ExecutionModeConfig;
  private actionIdCounter = 0;

  constructor(initialMode: ExecutionMode = 'execute', approvalCallback?: (action: PendingAction) => Promise<boolean>) {
    this.config = {
      mode: initialMode,
      approvalCallback,
      pendingActions: [],
      decisionHistory: [],
    };
  }

  /**
   * Obtenir le mode actuel
   */
  getMode(): ExecutionMode {
    return this.config.mode;
  }

  /**
   * Changer le mode d'exécution
   */
  setMode(mode: ExecutionMode): void {
    const previousMode = this.config.mode;
    this.config.mode = mode;

    // Log le changement
    console.log(`[ExecutionMode] Mode changed: ${previousMode} -> ${mode}`);
  }

  /**
   * Définir le callback d'approbation
   */
  setApprovalCallback(callback: (action: PendingAction) => Promise<boolean>): void {
    this.config.approvalCallback = callback;
  }

  /**
   * Vérifier si une action est autorisée
   */
  checkPermission(toolType: string, params: Record<string, unknown>): PermissionCheckResult {
    const mode = this.config.mode;

    // Mode plan: seulement lecture seule
    if (mode === 'plan') {
      if (READ_ONLY_TOOLS.has(toolType)) {
        return {
          allowed: true,
          needsApproval: false,
          suggestedAction: 'proceed',
        };
      }
      return {
        allowed: false,
        needsApproval: false,
        reason: `Tool '${toolType}' not allowed in plan mode (read-only)`,
        suggestedAction: 'block',
      };
    }

    // Mode strict: tout nécessite approbation (sauf lecture)
    if (mode === 'strict') {
      if (READ_ONLY_TOOLS.has(toolType)) {
        return {
          allowed: true,
          needsApproval: false,
          suggestedAction: 'proceed',
        };
      }
      return {
        allowed: true,
        needsApproval: true,
        reason: `Approval required in strict mode for '${toolType}'`,
        suggestedAction: 'ask_approval',
      };
    }

    // Mode execute: vérifier les outils à haut risque
    if (HIGH_RISK_TOOLS.has(toolType)) {
      return {
        allowed: true,
        needsApproval: true,
        reason: `High-risk tool '${toolType}' requires approval`,
        suggestedAction: 'ask_approval',
      };
    }

    // Par défaut en mode execute: autorisé
    return {
      allowed: true,
      needsApproval: false,
      suggestedAction: 'proceed',
    };
  }

  /**
   * Demander l'approbation pour une action
   */
  async requestApproval(toolType: string, description: string, params: Record<string, unknown>): Promise<boolean> {
    const action: PendingAction = {
      id: `action-${++this.actionIdCounter}`,
      toolType,
      description,
      params,
      createdAt: new Date(),
      impact: this.estimateImpact(toolType, params),
    };

    this.config.pendingActions.push(action);

    // Si pas de callback, rejeter
    if (!this.config.approvalCallback) {
      this.recordDecision(action.id, 'rejected', 'No approval callback configured');
      return false;
    }

    try {
      const approved = await this.config.approvalCallback(action);

      this.recordDecision(action.id, approved ? 'approved' : 'rejected', approved ? 'User approved' : 'User rejected');

      return approved;
    } catch (error) {
      this.recordDecision(
        action.id,
        'rejected',
        `Approval error: ${error instanceof Error ? error.message : String(error)}`,
      );
      return false;
    } finally {
      // Retirer de la liste des actions en attente
      this.config.pendingActions = this.config.pendingActions.filter((a) => a.id !== action.id);
    }
  }

  /**
   * Vérifier et exécuter une action
   */
  async checkAndExecute(
    toolType: string,
    description: string,
    params: Record<string, unknown>,
    executor: () => Promise<unknown>,
  ): Promise<{ allowed: boolean; result?: unknown; reason?: string }> {
    const permission = this.checkPermission(toolType, params);

    if (!permission.allowed) {
      return {
        allowed: false,
        reason: permission.reason,
      };
    }

    if (permission.needsApproval) {
      const approved = await this.requestApproval(toolType, description, params);
      if (!approved) {
        return {
          allowed: false,
          reason: 'User did not approve the action',
        };
      }
    }

    // Exécuter l'action
    const result = await executor();
    return {
      allowed: true,
      result,
    };
  }

  /**
   * Estimer l'impact d'une action
   */
  private estimateImpact(toolType: string, params: Record<string, unknown>): PendingAction['impact'] {
    if (HIGH_RISK_TOOLS.has(toolType)) {
      return 'critical';
    }

    // Écriture de fichiers
    if (toolType === 'write_file' || toolType === 'create_file') {
      // Fichiers de configuration = haut risque
      const path = (params.path || params.file_path || '') as string;
      if (path.includes('config') || path.endsWith('.env') || path.includes('package.json')) {
        return 'high';
      }
      return 'medium';
    }

    // Modification de fichiers
    if (toolType === 'edit_file' || toolType === 'modify_file') {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Enregistrer une décision
   */
  private recordDecision(actionId: string, decision: ActionDecision['decision'], reason?: string): void {
    this.config.decisionHistory.push({
      actionId,
      decision,
      reason,
      decidedAt: new Date(),
      mode: this.config.mode,
    });

    // Garder seulement les 100 dernières décisions
    if (this.config.decisionHistory.length > 100) {
      this.config.decisionHistory = this.config.decisionHistory.slice(-100);
    }
  }

  /**
   * Obtenir l'historique des décisions
   */
  getDecisionHistory(): ActionDecision[] {
    return [...this.config.decisionHistory];
  }

  /**
   * Obtenir les actions en attente
   */
  getPendingActions(): PendingAction[] {
    return [...this.config.pendingActions];
  }

  /**
   * Réinitialiser le gestionnaire
   */
  reset(): void {
    this.config.pendingActions = [];
    this.config.decisionHistory = [];
    this.actionIdCounter = 0;
  }

  /**
   * Obtenir les statistiques
   */
  getStats(): {
    mode: ExecutionMode;
    totalDecisions: number;
    approved: number;
    rejected: number;
    blocked: number;
    pending: number;
  } {
    const history = this.config.decisionHistory;

    return {
      mode: this.config.mode,
      totalDecisions: history.length,
      approved: history.filter((d) => d.decision === 'approved' || d.decision === 'auto_approved').length,
      rejected: history.filter((d) => d.decision === 'rejected').length,
      blocked: history.filter((d) => d.decision === 'blocked').length,
      pending: this.config.pendingActions.length,
    };
  }

  /**
   * Vérifier si on est en mode plan
   */
  isPlanMode(): boolean {
    return this.config.mode === 'plan';
  }

  /**
   * Vérifier si on est en mode strict
   */
  isStrictMode(): boolean {
    return this.config.mode === 'strict';
  }

  /**
   * Entrer en mode plan
   */
  enterPlanMode(): void {
    this.setMode('plan');
  }

  /**
   * Sortir du mode plan (revenir en execute)
   */
  exitPlanMode(): void {
    this.setMode('execute');
  }
}

/*
 * ============================================================================
 * SINGLETON INSTANCE
 * ============================================================================
 */

let defaultManager: ExecutionModeManager | null = null;

/**
 * Obtenir le gestionnaire de mode par défaut
 */
export function getExecutionModeManager(): ExecutionModeManager {
  if (!defaultManager) {
    defaultManager = new ExecutionModeManager();
  }
  return defaultManager;
}

/**
 * Réinitialiser le gestionnaire par défaut
 */
export function resetExecutionModeManager(): void {
  defaultManager = null;
}

/**
 * Créer un nouveau gestionnaire
 */
export function createExecutionModeManager(
  initialMode?: ExecutionMode,
  approvalCallback?: (action: PendingAction) => Promise<boolean>,
): ExecutionModeManager {
  return new ExecutionModeManager(initialMode, approvalCallback);
}
