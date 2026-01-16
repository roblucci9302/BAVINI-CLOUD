/**
 * ActionExecutor - Exécuteur d'actions pour l'AgentModeAgent
 *
 * Gère l'exécution des différents types d'actions:
 * - Création de fichiers
 * - Modification de fichiers
 * - Suppression de fichiers
 * - Exécution de commandes shell
 * - Installation de packages
 * - Opérations Git
 */

import type {
  ProposedAction,
  ActionResult,
  ActionType,
  CreateFileDetails,
  ModifyFileDetails,
  DeleteFileDetails,
  RunCommandDetails,
  InstallPackageDetails,
  GitOperationDetails,
  RollbackData,
  RollbackType,
  RollbackFileData,
  RollbackPackageData,
  ExecutionError,
  FileChange,
} from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ActionExecutor');

/**
 * Résultat d'exécution d'une action
 */
export interface ExecutionResult {
  success: boolean;
  actionId: string;
  actionType: ActionType;
  message: string;
  output?: string;
  error?: ExecutionError;
  rollbackData?: RollbackData;
  duration: number;
}

/**
 * Options d'exécution
 */
export interface ExecutionOptions {
  /** Arrêter à la première erreur */
  stopOnError?: boolean;

  /** Exécuter en mode dry-run (simulation) */
  dryRun?: boolean;

  /** Timeout par action en ms */
  timeout?: number;

  /** Callback de progression */
  onProgress?: (actionId: string, status: 'started' | 'completed' | 'failed') => void;
}

/**
 * Exécuteur d'actions
 */
export class ActionExecutor {
  private executedActions: ExecutionResult[] = [];
  private options: ExecutionOptions;

  constructor(options: ExecutionOptions = {}) {
    this.options = {
      stopOnError: true,
      dryRun: false,
      timeout: 30000,
      ...options,
    };
    logger.debug('ActionExecutor initialized', { options: this.options });
  }

  /**
   * Exécute une liste d'actions dans l'ordre
   */
  async executeAll(actions: ProposedAction[]): Promise<ExecutionResult[]> {
    logger.info(`Executing ${actions.length} actions`);
    this.executedActions = [];

    for (const action of actions) {
      const result = await this.execute(action);
      this.executedActions.push(result);

      if (!result.success && this.options.stopOnError) {
        logger.warn('Stopping execution due to error', { actionId: action.id });
        break;
      }
    }

    return this.executedActions;
  }

  /**
   * Exécute une action unique
   */
  async execute(action: ProposedAction): Promise<ExecutionResult> {
    const startTime = Date.now();
    logger.debug('Executing action', { id: action.id, type: action.type });

    this.options.onProgress?.(action.id, 'started');

    try {
      let result: ExecutionResult;

      switch (action.type) {
        case 'create_file':
          result = await this.executeCreateFile(action);
          break;
        case 'modify_file':
          result = await this.executeModifyFile(action);
          break;
        case 'delete_file':
          result = await this.executeDeleteFile(action);
          break;
        case 'run_command':
          result = await this.executeRunCommand(action);
          break;
        case 'install_package':
          result = await this.executeInstallPackage(action);
          break;
        case 'git_operation':
          result = await this.executeGitOperation(action);
          break;
        default:
          result = this.createErrorResult(action, startTime, `Type d'action non supporté: ${action.type}`);
      }

      this.options.onProgress?.(action.id, result.success ? 'completed' : 'failed');

      return result;
    } catch (error) {
      this.options.onProgress?.(action.id, 'failed');
      return this.createErrorResult(action, startTime, error instanceof Error ? error.message : 'Erreur inconnue');
    }
  }

  /**
   * Annule les actions exécutées (rollback)
   */
  async rollback(): Promise<ExecutionResult[]> {
    logger.info('Rolling back executed actions');

    const rollbackResults: ExecutionResult[] = [];

    // Rollback dans l'ordre inverse
    for (let i = this.executedActions.length - 1; i >= 0; i--) {
      const executed = this.executedActions[i];

      if (!executed.success || !executed.rollbackData) {
        continue;
      }

      const rollbackResult = await this.executeRollback(executed);
      rollbackResults.push(rollbackResult);
    }

    return rollbackResults;
  }

  /**
   * Retourne les actions exécutées
   */
  getExecutedActions(): ExecutionResult[] {
    return [...this.executedActions];
  }

  /*
   * ===========================================================================
   * Action Handlers
   * ===========================================================================
   */

  /**
   * Crée un fichier
   */
  private async executeCreateFile(action: ProposedAction): Promise<ExecutionResult> {
    const startTime = Date.now();
    const details = action.details as CreateFileDetails;

    if (this.options.dryRun) {
      return this.createSuccessResult(action, startTime, `[DRY-RUN] Créerait: ${details.path}`);
    }

    // Vérifier si le fichier existe déjà
    const exists = await this.fileExists(details.path);

    if (exists) {
      return this.createErrorResult(action, startTime, `Le fichier existe déjà: ${details.path}`);
    }

    // Créer le fichier (simulation - en production, utiliser WebContainer)
    const success = await this.writeFile(details.path, details.content);

    if (success) {
      const rollbackData: RollbackData = {
        actionId: action.id,
        type: 'delete' as RollbackType,
        data: { path: details.path } as RollbackFileData,
      };
      return {
        success: true,
        actionId: action.id,
        actionType: action.type,
        message: `Fichier créé: ${details.path}`,
        duration: Date.now() - startTime,
        rollbackData,
      };
    }

    return this.createErrorResult(action, startTime, `Échec de création: ${details.path}`);
  }

  /**
   * Modifie un fichier
   */
  private async executeModifyFile(action: ProposedAction): Promise<ExecutionResult> {
    const startTime = Date.now();
    const details = action.details as ModifyFileDetails;

    if (this.options.dryRun) {
      return this.createSuccessResult(action, startTime, `[DRY-RUN] Modifierait: ${details.path}`);
    }

    // Lire le contenu actuel pour le rollback
    const originalContent = await this.readFile(details.path);

    if (originalContent === null) {
      return this.createErrorResult(action, startTime, `Fichier non trouvé: ${details.path}`);
    }

    // Appliquer les modifications
    let newContent = originalContent;

    for (const change of details.changes) {
      newContent = this.applyChange(newContent, change);
    }

    // Écrire le nouveau contenu
    const success = await this.writeFile(details.path, newContent);

    if (success) {
      const rollbackData: RollbackData = {
        actionId: action.id,
        type: 'restore' as RollbackType,
        data: { path: details.path, content: originalContent } as RollbackFileData,
      };
      return {
        success: true,
        actionId: action.id,
        actionType: action.type,
        message: `Fichier modifié: ${details.path} (${details.changes.length} changement(s))`,
        duration: Date.now() - startTime,
        rollbackData,
      };
    }

    return this.createErrorResult(action, startTime, `Échec de modification: ${details.path}`);
  }

  /**
   * Supprime un fichier
   */
  private async executeDeleteFile(action: ProposedAction): Promise<ExecutionResult> {
    const startTime = Date.now();
    const details = action.details as DeleteFileDetails;

    if (this.options.dryRun) {
      return this.createSuccessResult(action, startTime, `[DRY-RUN] Supprimerait: ${details.path}`);
    }

    // Lire le contenu pour le rollback
    const originalContent = await this.readFile(details.path);

    if (originalContent === null) {
      return this.createErrorResult(action, startTime, `Fichier non trouvé: ${details.path}`);
    }

    // Supprimer le fichier
    const success = await this.deleteFile(details.path);

    if (success) {
      const rollbackData: RollbackData = {
        actionId: action.id,
        type: 'create' as RollbackType,
        data: { path: details.path, content: originalContent } as RollbackFileData,
      };
      return {
        success: true,
        actionId: action.id,
        actionType: action.type,
        message: `Fichier supprimé: ${details.path}`,
        duration: Date.now() - startTime,
        rollbackData,
      };
    }

    return this.createErrorResult(action, startTime, `Échec de suppression: ${details.path}`);
  }

  /**
   * Exécute une commande shell
   */
  private async executeRunCommand(action: ProposedAction): Promise<ExecutionResult> {
    const startTime = Date.now();
    const details = action.details as RunCommandDetails;

    if (this.options.dryRun) {
      return this.createSuccessResult(action, startTime, `[DRY-RUN] Exécuterait: ${details.command}`);
    }

    // Exécuter la commande (simulation)
    const cwd = details.cwd || details.workingDirectory;
    const output = await this.runCommand(details.command, cwd);

    return {
      success: true,
      actionId: action.id,
      actionType: action.type,
      message: `Commande exécutée: ${details.command}`,
      output,
      duration: Date.now() - startTime,

      // Les commandes ne sont généralement pas réversibles
    };
  }

  /**
   * Installe un package
   */
  private async executeInstallPackage(action: ProposedAction): Promise<ExecutionResult> {
    const startTime = Date.now();
    const details = action.details as InstallPackageDetails;
    const pkgName = details.name || details.packageName;

    if (this.options.dryRun) {
      const pkgStr = details.version ? `${pkgName}@${details.version}` : pkgName;
      return this.createSuccessResult(action, startTime, `[DRY-RUN] Installerait: ${pkgStr}`);
    }

    // Construire la commande d'installation
    const packageManager = details.packageManager || 'npm';
    const pkgSpec = details.version ? `${pkgName}@${details.version}` : pkgName;
    const devFlag = details.isDev ? '-D' : '';

    let command: string;

    switch (packageManager) {
      case 'pnpm':
        command = `pnpm add ${devFlag} ${pkgSpec}`;
        break;
      case 'yarn':
        command = `yarn add ${devFlag} ${pkgSpec}`;
        break;
      case 'npm':
      default:
        command = `npm install ${devFlag ? '--save-dev' : ''} ${pkgSpec}`;
    }

    const output = await this.runCommand(command);

    const rollbackData: RollbackData = {
      actionId: action.id,
      type: 'uninstall' as RollbackType,
      data: { name: pkgName, packageManager } as RollbackPackageData,
    };

    return {
      success: true,
      actionId: action.id,
      actionType: action.type,
      message: `Package installé: ${pkgSpec}`,
      output,
      duration: Date.now() - startTime,
      rollbackData,
    };
  }

  /**
   * Exécute une opération Git
   */
  private async executeGitOperation(action: ProposedAction): Promise<ExecutionResult> {
    const startTime = Date.now();
    const details = action.details as GitOperationDetails;

    if (this.options.dryRun) {
      return this.createSuccessResult(
        action,
        startTime,
        `[DRY-RUN] Git ${details.operation}: ${details.message || ''}`,
      );
    }

    let command: string;

    switch (details.operation) {
      case 'commit':
        command = `git add -A && git commit -m "${details.message || 'Auto-commit'}"`;
        break;
      case 'branch':
        command = `git checkout -b ${details.branch}`;
        break;
      case 'checkout':
        command = `git checkout ${details.branch}`;
        break;
      case 'push':
        command = `git push origin ${details.branch || 'HEAD'}`;
        break;
      case 'pull':
        command = `git pull origin ${details.branch || 'main'}`;
        break;
      default:
        return this.createErrorResult(action, startTime, `Opération Git non supportée: ${details.operation}`);
    }

    const output = await this.runCommand(command);

    return {
      success: true,
      actionId: action.id,
      actionType: action.type,
      message: `Git ${details.operation} effectué`,
      output,
      duration: Date.now() - startTime,
    };
  }

  /*
   * ===========================================================================
   * Rollback Handler
   * ===========================================================================
   */

  /**
   * Exécute le rollback d'une action
   */
  private async executeRollback(executed: ExecutionResult): Promise<ExecutionResult> {
    const startTime = Date.now();
    const rollback = executed.rollbackData!;

    logger.debug('Rolling back action', { actionId: rollback.actionId, type: rollback.type });

    try {
      switch (rollback.type) {
        case 'delete': {
          const fileData = rollback.data as RollbackFileData;
          await this.deleteFile(fileData.path);
          break;
        }
        case 'restore':
        case 'create': {
          const fileData = rollback.data as RollbackFileData;
          await this.writeFile(fileData.path, fileData.content || '');
          break;
        }
        case 'uninstall': {
          const pkgData = rollback.data as RollbackPackageData;
          const pm = pkgData.packageManager || 'npm';
          const cmd = pm === 'pnpm' ? 'pnpm remove' : pm === 'yarn' ? 'yarn remove' : 'npm uninstall';
          await this.runCommand(`${cmd} ${pkgData.name}`);
          break;
        }
      }

      return {
        success: true,
        actionId: rollback.actionId,
        actionType: 'create_file', // Placeholder - rollback doesn't have its own type
        message: `Rollback réussi pour ${rollback.actionId}`,
        duration: Date.now() - startTime,
      };
    } catch (error) {
      const execError: ExecutionError = {
        code: 'ROLLBACK_FAILED',
        message: error instanceof Error ? error.message : 'Erreur inconnue',
      };
      return {
        success: false,
        actionId: rollback.actionId,
        actionType: 'create_file', // Placeholder
        message: `Échec du rollback pour ${rollback.actionId}`,
        error: execError,
        duration: Date.now() - startTime,
      };
    }
  }

  /*
   * ===========================================================================
   * File System Operations (Abstractions)
   * ===========================================================================
   */

  /**
   * Vérifie si un fichier existe
   * Note: En production, utiliser WebContainer
   */
  private async fileExists(path: string): Promise<boolean> {
    // Simulation - en production, vérifier via WebContainer
    logger.debug('Checking file exists', { path });
    return false; // Par défaut, considérer que le fichier n'existe pas
  }

  /**
   * Lit le contenu d'un fichier
   */
  private async readFile(path: string): Promise<string | null> {
    logger.debug('Reading file', { path });

    // Simulation - en production, lire via WebContainer
    return null;
  }

  /**
   * Écrit dans un fichier
   */
  private async writeFile(path: string, content: string): Promise<boolean> {
    logger.debug('Writing file', { path, contentLength: content.length });

    // Simulation - en production, écrire via WebContainer
    return true;
  }

  /**
   * Supprime un fichier
   */
  private async deleteFile(path: string): Promise<boolean> {
    logger.debug('Deleting file', { path });

    // Simulation - en production, supprimer via WebContainer
    return true;
  }

  /**
   * Exécute une commande shell
   */
  private async runCommand(command: string, cwd?: string): Promise<string> {
    logger.debug('Running command', { command, cwd });

    // Simulation - en production, exécuter via WebContainer
    return `Command executed: ${command}`;
  }

  /*
   * ===========================================================================
   * Helpers
   * ===========================================================================
   */

  /**
   * Applique un changement au contenu
   */
  private applyChange(content: string, change: FileChange): string {
    switch (change.type) {
      case 'insert':
        if (change.position !== undefined) {
          return content.slice(0, change.position) + change.content + content.slice(change.position);
        }

        return content + change.content;

      case 'replace':
        if (change.search) {
          return content.replace(change.search, change.content);
        }

        if (change.startLine !== undefined && change.endLine !== undefined) {
          const lines = content.split('\n');
          lines.splice(change.startLine - 1, change.endLine - change.startLine + 1, change.content);

          return lines.join('\n');
        }

        return change.content;

      case 'delete':
        if (change.search) {
          return content.replace(change.search, '');
        }

        if (change.startLine !== undefined && change.endLine !== undefined) {
          const lines = content.split('\n');
          lines.splice(change.startLine - 1, change.endLine - change.startLine + 1);

          return lines.join('\n');
        }

        return content;

      default:
        return content;
    }
  }

  /**
   * Crée un résultat de succès
   */
  private createSuccessResult(action: ProposedAction, startTime: number, message: string): ExecutionResult {
    return {
      success: true,
      actionId: action.id,
      actionType: action.type,
      message,
      duration: Date.now() - startTime,
    };
  }

  /**
   * Crée un résultat d'erreur
   */
  private createErrorResult(action: ProposedAction, startTime: number, message: string): ExecutionResult {
    const error: ExecutionError = {
      code: 'EXECUTION_ERROR',
      message,
    };
    return {
      success: false,
      actionId: action.id,
      actionType: action.type,
      message,
      error,
      duration: Date.now() - startTime,
    };
  }
}

/**
 * Crée un exécuteur avec les options par défaut
 */
export function createActionExecutor(options?: ExecutionOptions): ActionExecutor {
  return new ActionExecutor(options);
}
