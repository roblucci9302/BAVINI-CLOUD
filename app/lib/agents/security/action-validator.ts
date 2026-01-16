/**
 * @fileoverview Validateur d'actions pour les agents BAVINI
 *
 * Ce module centralise la validation de toutes les actions des agents
 * avant leur exécution. Il implémente le mode "strict" où chaque action
 * nécessite une approbation explicite de l'utilisateur.
 *
 * Types d'actions validées:
 * - Création/modification/suppression de fichiers
 * - Commandes shell
 * - Création de répertoires
 * - Déplacement de fichiers
 *
 * Niveaux d'autorisation:
 * - `allowed` - Action sûre, exécution automatique (en mode non-strict)
 * - `approval_required` - Nécessite approbation utilisateur
 * - `blocked` - Action interdite, refusée automatiquement
 *
 * @module agents/security/action-validator
 * @see {@link checkCommand} pour la validation des commandes shell
 *
 * @example
 * ```typescript
 * // Créer et valider une action
 * const action = createProposedAction(
 *   'file_modify',
 *   'coder',
 *   'Modifier src/app.ts',
 *   {
 *     type: 'file_modify',
 *     path: 'src/app.ts',
 *     oldContent: '...',
 *     newContent: '...',
 *     linesAdded: 10,
 *     linesRemoved: 5
 *   }
 * );
 *
 * const result = validateAction(action, true); // mode strict
 * if (result.valid && result.requiresApproval) {
 *   // Demander approbation à l'utilisateur
 * }
 * ```
 */

import { checkCommand, type CommandCheckResult, type CommandAuthorizationLevel } from './command-whitelist';
import type { AgentType } from '../types';

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Types d'actions possibles
 */
export type ActionType =
  | 'file_create'
  | 'file_modify'
  | 'file_delete'
  | 'shell_command'
  | 'directory_create'
  | 'file_move';

/**
 * Statut de validation d'une action
 */
export type ValidationStatus = 'pending' | 'approved' | 'rejected' | 'auto_approved';

/**
 * Action proposée par un agent
 */
export interface ProposedAction {
  /** ID unique de l'action */
  id: string;

  /** Type d'action */
  type: ActionType;

  /** Agent qui propose l'action */
  agent: AgentType;

  /** Description courte */
  description: string;

  /** Détails de l'action */
  details: ActionDetails;

  /** Statut de validation */
  status: ValidationStatus;

  /** Timestamp de création */
  createdAt: Date;

  /** Timestamp de validation (si applicable) */
  validatedAt?: Date;

  /** Raison du rejet (si applicable) */
  rejectionReason?: string;
}

/**
 * Détails spécifiques à chaque type d'action
 */
export type ActionDetails =
  | FileCreateDetails
  | FileModifyDetails
  | FileDeleteDetails
  | ShellCommandDetails
  | DirectoryCreateDetails
  | FileMoveDetails;

export interface FileCreateDetails {
  type: 'file_create';
  path: string;
  content: string;
  language?: string;
  lineCount: number;
}

export interface FileModifyDetails {
  type: 'file_modify';
  path: string;
  oldContent: string;
  newContent: string;
  diff?: string;
  linesAdded: number;
  linesRemoved: number;
}

export interface FileDeleteDetails {
  type: 'file_delete';
  path: string;
  fileSize?: number;
}

export interface ShellCommandDetails {
  type: 'shell_command';
  command: string;
  args?: string[];
  cwd?: string;
  commandCheck: CommandCheckResult;
}

export interface DirectoryCreateDetails {
  type: 'directory_create';
  path: string;
}

export interface FileMoveDetails {
  type: 'file_move';
  oldPath: string;
  newPath: string;
}

/**
 * Résultat de validation d'une action
 */
export interface ValidationResult {
  /** L'action est-elle valide ? */
  valid: boolean;

  /** Nécessite-t-elle une approbation ? */
  requiresApproval: boolean;

  /** Niveau d'autorisation */
  authorizationLevel: CommandAuthorizationLevel | 'requires_approval';

  /** Messages d'erreur ou d'avertissement */
  messages: string[];

  /** Suggestions pour l'utilisateur */
  suggestions?: string[];
}

/**
 * Batch d'actions en attente d'approbation
 */
export interface PendingActionBatch {
  /** ID unique du batch */
  id: string;

  /** Agent source */
  agent: AgentType;

  /** Actions dans ce batch */
  actions: ProposedAction[];

  /** Description globale */
  description: string;

  /** Timestamp de création */
  createdAt: Date;

  /** Statut global */
  status: 'pending' | 'approved' | 'partially_approved' | 'rejected';
}

/*
 * ============================================================================
 * VALIDATION
 * ============================================================================
 */

/**
 * Valide une action proposée par un agent
 *
 * Cette fonction détermine si une action est valide et si elle nécessite
 * une approbation utilisateur. En mode strict, toutes les actions valides
 * requièrent une approbation.
 *
 * @param {ProposedAction} action - L'action à valider
 * @param {boolean} [strictMode=true] - Si true, toutes les actions nécessitent approbation
 * @returns {ValidationResult} Résultat de la validation
 *
 * @example
 * ```typescript
 * const action = createProposedAction('shell_command', 'builder', 'npm install', {
 *   type: 'shell_command',
 *   command: 'npm install',
 *   commandCheck: checkCommand('npm install')
 * });
 *
 * const result = validateAction(action, true);
 *
 * if (!result.valid) {
 *   console.error('Action bloquée:', result.messages);
 * } else if (result.requiresApproval) {
 *   console.log('Approbation requise');
 * }
 * ```
 */
export function validateAction(action: ProposedAction, strictMode: boolean = true): ValidationResult {
  const messages: string[] = [];
  const suggestions: string[] = [];

  // Validation de base
  if (!action.id || !action.type || !action.agent) {
    return {
      valid: false,
      requiresApproval: false,
      authorizationLevel: 'blocked',
      messages: ['Action invalide: champs requis manquants'],
    };
  }

  // Validation spécifique par type
  switch (action.type) {
    case 'file_create':
      return validateFileCreate(action.details as FileCreateDetails, strictMode);

    case 'file_modify':
      return validateFileModify(action.details as FileModifyDetails, strictMode);

    case 'file_delete':
      return validateFileDelete(action.details as FileDeleteDetails, strictMode);

    case 'shell_command':
      return validateShellCommand(action.details as ShellCommandDetails, strictMode);

    case 'directory_create':
      return validateDirectoryCreate(action.details as DirectoryCreateDetails, strictMode);

    case 'file_move':
      return validateFileMove(action.details as FileMoveDetails, strictMode);

    default:
      return {
        valid: false,
        requiresApproval: false,
        authorizationLevel: 'blocked',
        messages: [`Type d'action inconnu: ${action.type}`],
      };
  }
}

/**
 * Valide une création de fichier
 */
function validateFileCreate(details: FileCreateDetails, strictMode: boolean): ValidationResult {
  const messages: string[] = [];
  const suggestions: string[] = [];

  // Vérifier le chemin
  if (!details.path) {
    return {
      valid: false,
      requiresApproval: false,
      authorizationLevel: 'blocked',
      messages: ['Chemin de fichier requis'],
    };
  }

  // Vérifier les chemins dangereux
  if (details.path.includes('..') || details.path.startsWith('/')) {
    return {
      valid: false,
      requiresApproval: false,
      authorizationLevel: 'blocked',
      messages: ['Chemin de fichier invalide ou dangereux'],
    };
  }

  // Vérifier les fichiers sensibles
  const sensitivePatterns = [/\.env$/i, /credentials/i, /secrets?/i, /\.pem$/i, /\.key$/i, /password/i];

  for (const pattern of sensitivePatterns) {
    if (pattern.test(details.path)) {
      messages.push(`Attention: fichier potentiellement sensible détecté`);
      break;
    }
  }

  // En mode strict, toujours demander approbation
  return {
    valid: true,
    requiresApproval: strictMode,
    authorizationLevel: 'requires_approval',
    messages,
    suggestions: messages.length > 0 ? ["Vérifiez le contenu avant d'approuver"] : undefined,
  };
}

/**
 * Valide une modification de fichier
 */
function validateFileModify(details: FileModifyDetails, strictMode: boolean): ValidationResult {
  const messages: string[] = [];

  if (!details.path) {
    return {
      valid: false,
      requiresApproval: false,
      authorizationLevel: 'blocked',
      messages: ['Chemin de fichier requis'],
    };
  }

  // Vérifier les chemins dangereux
  if (details.path.includes('..')) {
    return {
      valid: false,
      requiresApproval: false,
      authorizationLevel: 'blocked',
      messages: ['Chemin de fichier invalide'],
    };
  }

  // Avertissement pour les gros changements
  if (details.linesAdded > 100 || details.linesRemoved > 50) {
    messages.push(`Modification importante: +${details.linesAdded}/-${details.linesRemoved} lignes`);
  }

  return {
    valid: true,
    requiresApproval: strictMode,
    authorizationLevel: 'requires_approval',
    messages,
    suggestions: messages.length > 0 ? ["Vérifiez le diff avant d'approuver"] : undefined,
  };
}

/**
 * Valide une suppression de fichier
 */
function validateFileDelete(details: FileDeleteDetails, strictMode: boolean): ValidationResult {
  if (!details.path) {
    return {
      valid: false,
      requiresApproval: false,
      authorizationLevel: 'blocked',
      messages: ['Chemin de fichier requis'],
    };
  }

  // Toujours demander approbation pour les suppressions
  return {
    valid: true,
    requiresApproval: true, // Toujours, même en mode non-strict
    authorizationLevel: 'requires_approval',
    messages: ['Suppression de fichier - action irréversible'],
    suggestions: ["Assurez-vous que ce fichier n'est plus nécessaire"],
  };
}

/**
 * Valide une commande shell
 */
function validateShellCommand(details: ShellCommandDetails, strictMode: boolean): ValidationResult {
  const commandCheck = checkCommand(details.command);

  // Commande bloquée
  if (commandCheck.level === 'blocked') {
    return {
      valid: false,
      requiresApproval: false,
      authorizationLevel: 'blocked',
      messages: [commandCheck.message],
    };
  }

  // Commande autorisée automatiquement (seulement en mode non-strict)
  if (commandCheck.level === 'allowed' && !strictMode) {
    return {
      valid: true,
      requiresApproval: false,
      authorizationLevel: 'allowed',
      messages: [commandCheck.message],
    };
  }

  // Tout le reste nécessite approbation
  return {
    valid: true,
    requiresApproval: true,
    authorizationLevel: commandCheck.level === 'allowed' ? 'requires_approval' : commandCheck.level,
    messages: [commandCheck.message],
    suggestions:
      commandCheck.level === 'approval_required' ? ['Cette commande peut avoir des effets importants'] : undefined,
  };
}

/**
 * Valide une création de répertoire
 */
function validateDirectoryCreate(details: DirectoryCreateDetails, strictMode: boolean): ValidationResult {
  if (!details.path) {
    return {
      valid: false,
      requiresApproval: false,
      authorizationLevel: 'blocked',
      messages: ['Chemin de répertoire requis'],
    };
  }

  if (details.path.includes('..')) {
    return {
      valid: false,
      requiresApproval: false,
      authorizationLevel: 'blocked',
      messages: ['Chemin de répertoire invalide'],
    };
  }

  return {
    valid: true,
    requiresApproval: strictMode,
    authorizationLevel: 'requires_approval',
    messages: [],
  };
}

/**
 * Valide un déplacement de fichier
 */
function validateFileMove(details: FileMoveDetails, strictMode: boolean): ValidationResult {
  if (!details.oldPath || !details.newPath) {
    return {
      valid: false,
      requiresApproval: false,
      authorizationLevel: 'blocked',
      messages: ['Chemins source et destination requis'],
    };
  }

  if (details.oldPath.includes('..') || details.newPath.includes('..')) {
    return {
      valid: false,
      requiresApproval: false,
      authorizationLevel: 'blocked',
      messages: ['Chemins invalides'],
    };
  }

  return {
    valid: true,
    requiresApproval: strictMode,
    authorizationLevel: 'requires_approval',
    messages: [`Déplacement: ${details.oldPath} → ${details.newPath}`],
  };
}

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

/**
 * Génère un ID unique pour une action
 */
export function generateActionId(): string {
  return `action-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Génère un ID unique pour un batch
 */
export function generateBatchId(): string {
  return `batch-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}

/**
 * Crée une action proposée avec un ID unique
 *
 * @param {ActionType} type - Type d'action (file_create, shell_command, etc.)
 * @param {AgentType} agent - Agent qui propose l'action
 * @param {string} description - Description courte de l'action
 * @param {ActionDetails} details - Détails spécifiques au type d'action
 * @returns {ProposedAction} L'action créée avec statut 'pending'
 *
 * @example
 * ```typescript
 * const action = createProposedAction(
 *   'file_create',
 *   'coder',
 *   'Créer un nouveau composant',
 *   {
 *     type: 'file_create',
 *     path: 'src/components/Button.tsx',
 *     content: 'export const Button = ...',
 *     lineCount: 25
 *   }
 * );
 * ```
 */
export function createProposedAction(
  type: ActionType,
  agent: AgentType,
  description: string,
  details: ActionDetails,
): ProposedAction {
  return {
    id: generateActionId(),
    type,
    agent,
    description,
    details,
    status: 'pending',
    createdAt: new Date(),
  };
}

/**
 * Crée un batch d'actions
 */
export function createActionBatch(
  agent: AgentType,
  actions: ProposedAction[],
  description: string,
): PendingActionBatch {
  return {
    id: generateBatchId(),
    agent,
    actions,
    description,
    createdAt: new Date(),
    status: 'pending',
  };
}

/**
 * Calcule les statistiques d'un batch d'actions
 */
export function getBatchStats(batch: PendingActionBatch): {
  totalActions: number;
  fileCreations: number;
  fileModifications: number;
  fileDeletions: number;
  shellCommands: number;
  totalLinesAdded: number;
  totalLinesRemoved: number;
} {
  const stats = {
    totalActions: batch.actions.length,
    fileCreations: 0,
    fileModifications: 0,
    fileDeletions: 0,
    shellCommands: 0,
    totalLinesAdded: 0,
    totalLinesRemoved: 0,
  };

  for (const action of batch.actions) {
    switch (action.type) {
      case 'file_create':
        stats.fileCreations++;
        stats.totalLinesAdded += (action.details as FileCreateDetails).lineCount;
        break;
      case 'file_modify':
        stats.fileModifications++;
        stats.totalLinesAdded += (action.details as FileModifyDetails).linesAdded;
        stats.totalLinesRemoved += (action.details as FileModifyDetails).linesRemoved;
        break;
      case 'file_delete':
        stats.fileDeletions++;
        break;
      case 'shell_command':
        stats.shellCommands++;
        break;
    }
  }

  return stats;
}

/**
 * Formate une action pour l'affichage
 */
export function formatActionForDisplay(action: ProposedAction): string {
  switch (action.type) {
    case 'file_create':
      const createDetails = action.details as FileCreateDetails;
      return `Créer ${createDetails.path} (${createDetails.lineCount} lignes)`;
    case 'file_modify':
      const modifyDetails = action.details as FileModifyDetails;
      return `Modifier ${modifyDetails.path} (+${modifyDetails.linesAdded}/-${modifyDetails.linesRemoved})`;
    case 'file_delete':
      return `Supprimer ${(action.details as FileDeleteDetails).path}`;
    case 'shell_command':
      return `Exécuter: ${(action.details as ShellCommandDetails).command}`;
    case 'directory_create':
      return `Créer dossier ${(action.details as DirectoryCreateDetails).path}`;
    case 'file_move':
      const moveDetails = action.details as FileMoveDetails;
      return `Déplacer ${moveDetails.oldPath} → ${moveDetails.newPath}`;
    default:
      return action.description;
  }
}

/**
 * Obtient l'icône pour un type d'action
 */
export function getActionIcon(type: ActionType): string {
  switch (type) {
    case 'file_create':
      return 'i-ph:file-plus';
    case 'file_modify':
      return 'i-ph:pencil-simple';
    case 'file_delete':
      return 'i-ph:trash';
    case 'shell_command':
      return 'i-ph:terminal';
    case 'directory_create':
      return 'i-ph:folder-plus';
    case 'file_move':
      return 'i-ph:arrows-left-right';
    default:
      return 'i-ph:question';
  }
}
