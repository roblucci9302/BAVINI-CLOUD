/**
 * =============================================================================
 * BAVINI Cloud - Filesystem Adapter for Agents
 * =============================================================================
 * Adaptateur de système de fichiers pour les agents BAVINI.
 * Remplace WebContainerAdapter en utilisant MountManager (OPFS/IndexedDB).
 *
 * Caractéristiques:
 * - Interface identique à WebContainerAdapter pour migration transparente
 * - Utilise MountManager pour les opérations fichiers
 * - Support du mode strict avec flux d'approbation
 * - Logging des actions via createScopedLogger
 * - Pas de dépendance à WebContainer
 * =============================================================================
 */

import type { MountManager, DirEntry } from '~/lib/runtime/filesystem';
import { getSharedMountManager, isFSError } from '~/lib/runtime/filesystem';
import { createScopedLogger } from '~/utils/logger';
import type { AgentType, ToolExecutionResult } from '../types';
import {
  validateAction,
  createProposedAction,
  type ProposedAction,
  type ActionType,
  type FileCreateDetails,
  type FileModifyDetails,
  type FileDeleteDetails,
  type DirectoryCreateDetails,
} from '../security/action-validator';
import { addAgentLog } from '~/lib/stores/agents';

const logger = createScopedLogger('BaviniFSAdapter');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface BaviniFSConfig {
  /** Mode strict = toute action nécessite approbation */
  strictMode: boolean;

  /** Agent qui utilise l'adaptateur */
  agentName: AgentType;

  /** ID de la tâche en cours */
  taskId?: string;

  /** Callback pour demander approbation */
  onApprovalRequired?: (action: ProposedAction) => Promise<boolean>;

  /** Callback pour notifier une action */
  onActionExecuted?: (action: ProposedAction, result: ToolExecutionResult) => void;
}

export interface FileReadResult {
  content: string;
  exists: boolean;
  size?: number;
}

export interface DirectoryListResult {
  entries: DirectoryEntry[];
  path: string;
}

export interface DirectoryEntry {
  name: string;
  type: 'file' | 'directory';
  size?: number;
}

/*
 * ============================================================================
 * ADAPTER CLASS
 * ============================================================================
 */

export class BaviniFSAdapter {
  private config: BaviniFSConfig;
  private fs: MountManager;
  private basePath: string;

  constructor(config: BaviniFSConfig, fs?: MountManager, basePath: string = '/') {
    this.config = config;
    this.fs = fs ?? getSharedMountManager();
    this.basePath = basePath.endsWith('/') ? basePath : basePath + '/';
  }

  /**
   * Convert a relative or absolute path to an absolute filesystem path
   */
  private toAbsolutePath(path: string): string {
    if (path.startsWith('/')) {
      return path;
    }
    return this.basePath + path;
  }

  /*
   * --------------------------------------------------------------------------
   * FILE OPERATIONS (LECTURE - toujours autorisées)
   * --------------------------------------------------------------------------
   */

  /**
   * Lire un fichier (toujours autorisé)
   */
  async readFile(filePath: string): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const absolutePath = this.toAbsolutePath(filePath);

    try {
      const content = await this.fs.readTextFile(absolutePath);

      this.log('debug', `Read file: ${filePath}`);

      return {
        success: true,
        output: {
          content,
          exists: true,
          size: content.length,
        } as FileReadResult,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      // Si le fichier n'existe pas, ce n'est pas vraiment une erreur
      if (isFSError(error) && error.code === 'ENOENT') {
        return {
          success: true,
          output: { content: '', exists: false } as FileReadResult,
          executionTime: Date.now() - startTime,
        };
      }

      this.log('error', `Failed to read file ${filePath}: ${message}`);

      return {
        success: false,
        output: null,
        error: message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Lister un répertoire (toujours autorisé)
   */
  async listDirectory(dirPath: string): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const absolutePath = this.toAbsolutePath(dirPath);

    try {
      const entries = await this.fs.readdirWithTypes(absolutePath);

      const result: DirectoryEntry[] = entries.map((entry: DirEntry) => ({
        name: entry.name,
        type: entry.isDirectory ? 'directory' : 'file',
      }));

      this.log('debug', `Listed directory: ${dirPath} (${result.length} entries)`);

      return {
        success: true,
        output: { entries: result, path: dirPath } as DirectoryListResult,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Failed to list directory ${dirPath}: ${message}`);

      return {
        success: false,
        output: null,
        error: message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Vérifier si un fichier/dossier existe (toujours autorisé)
   */
  async exists(path: string): Promise<boolean> {
    return this.fs.exists(this.toAbsolutePath(path));
  }

  /**
   * Obtenir les stats d'un fichier (toujours autorisé)
   */
  async stat(filePath: string): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const absolutePath = this.toAbsolutePath(filePath);

    try {
      const stats = await this.fs.stat(absolutePath);

      return {
        success: true,
        output: {
          isFile: stats.isFile,
          isDirectory: stats.isDirectory,
          size: stats.size,
          mtime: stats.mtime,
          ctime: stats.ctime,
        },
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';

      if (isFSError(error) && error.code === 'ENOENT') {
        return {
          success: true,
          output: { exists: false },
          executionTime: Date.now() - startTime,
        };
      }

      return {
        success: false,
        output: null,
        error: message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /*
   * --------------------------------------------------------------------------
   * FILE OPERATIONS (ÉCRITURE - nécessitent validation)
   * --------------------------------------------------------------------------
   */

  /**
   * Créer un fichier (nécessite approbation en mode strict)
   */
  async createFile(filePath: string, content: string): Promise<ToolExecutionResult> {
    const absolutePath = this.toAbsolutePath(filePath);
    const details: FileCreateDetails = {
      type: 'file_create',
      path: filePath, // Use original path for action details (validation)
      content,
      lineCount: content.split('\n').length,
    };

    const action = createProposedAction('file_create', this.config.agentName, `Create file: ${filePath}`, details);

    return this.executeWithApproval(action, async () => {
      // Create parent folders if needed
      const folder = absolutePath.substring(0, absolutePath.lastIndexOf('/'));

      if (folder && folder !== '.' && folder !== '/') {
        await this.fs.mkdir(folder, { recursive: true });
      }

      await this.fs.writeTextFile(absolutePath, content);

      return {
        success: true,
        output: { path: filePath, size: content.length },
      };
    });
  }

  /**
   * Modifier un fichier (nécessite approbation en mode strict)
   */
  async writeFile(filePath: string, content: string): Promise<ToolExecutionResult> {
    const absolutePath = this.toAbsolutePath(filePath);

    // Read current content for diff
    const currentResult = await this.readFile(filePath);
    const currentContent = currentResult.success ? (currentResult.output as FileReadResult).content : '';

    const actionType: ActionType = currentContent ? 'file_modify' : 'file_create';

    const newLines = content.split('\n');
    const oldLines = currentContent.split('\n');

    let action: ProposedAction;

    if (actionType === 'file_create') {
      const details: FileCreateDetails = {
        type: 'file_create',
        path: filePath, // Use original path for validation
        content,
        lineCount: newLines.length,
      };
      action = createProposedAction('file_create', this.config.agentName, `Create file: ${filePath}`, details);
    } else {
      const details: FileModifyDetails = {
        type: 'file_modify',
        path: filePath, // Use original path for validation
        oldContent: currentContent,
        newContent: content,
        linesAdded: Math.max(0, newLines.length - oldLines.length),
        linesRemoved: Math.max(0, oldLines.length - newLines.length),
      };
      action = createProposedAction('file_modify', this.config.agentName, `Modify file: ${filePath}`, details);
    }

    return this.executeWithApproval(action, async () => {
      // Create parent folders if needed
      const folder = absolutePath.substring(0, absolutePath.lastIndexOf('/'));

      if (folder && folder !== '.' && folder !== '/') {
        await this.fs.mkdir(folder, { recursive: true });
      }

      await this.fs.writeTextFile(absolutePath, content);

      return {
        success: true,
        output: { path: filePath, size: content.length, modified: actionType === 'file_modify' },
      };
    });
  }

  /**
   * Supprimer un fichier (nécessite approbation)
   */
  async deleteFile(filePath: string): Promise<ToolExecutionResult> {
    const absolutePath = this.toAbsolutePath(filePath);
    const details: FileDeleteDetails = {
      type: 'file_delete',
      path: filePath, // Use original path for validation
    };

    const action = createProposedAction('file_delete', this.config.agentName, `Delete file: ${filePath}`, details);

    return this.executeWithApproval(action, async () => {
      await this.fs.unlink(absolutePath);

      return {
        success: true,
        output: { path: filePath, deleted: true },
      };
    });
  }

  /**
   * Créer un répertoire (nécessite approbation en mode strict)
   */
  async createDirectory(dirPath: string): Promise<ToolExecutionResult> {
    const absolutePath = this.toAbsolutePath(dirPath);
    const details: DirectoryCreateDetails = {
      type: 'directory_create',
      path: dirPath, // Use original path for validation
    };

    const action = createProposedAction(
      'directory_create',
      this.config.agentName,
      `Create directory: ${dirPath}`,
      details,
    );

    return this.executeWithApproval(action, async () => {
      await this.fs.mkdir(absolutePath, { recursive: true });

      return {
        success: true,
        output: { path: dirPath, created: true },
      };
    });
  }

  /**
   * Supprimer un répertoire (nécessite approbation)
   */
  async deleteDirectory(dirPath: string, recursive: boolean = false): Promise<ToolExecutionResult> {
    const absolutePath = this.toAbsolutePath(dirPath);
    const details: DirectoryCreateDetails = {
      type: 'directory_create', // Using directory_create for now, could add directory_delete type
      path: dirPath, // Use original path for validation
    };

    const action = createProposedAction(
      'directory_create',
      this.config.agentName,
      `Delete directory: ${dirPath}${recursive ? ' (recursive)' : ''}`,
      details,
    );

    return this.executeWithApproval(action, async () => {
      await this.fs.rmdir(absolutePath, { recursive });

      return {
        success: true,
        output: { path: dirPath, deleted: true },
      };
    });
  }

  /**
   * Copier un fichier (nécessite approbation pour la destination)
   */
  async copyFile(srcPath: string, destPath: string): Promise<ToolExecutionResult> {
    const absoluteSrc = this.toAbsolutePath(srcPath);
    const absoluteDest = this.toAbsolutePath(destPath);
    const details: FileCreateDetails = {
      type: 'file_create',
      path: destPath, // Use original path for validation
      content: `[Copy from ${srcPath}]`,
      lineCount: 0,
    };

    const action = createProposedAction(
      'file_create',
      this.config.agentName,
      `Copy file: ${srcPath} → ${destPath}`,
      details,
    );

    return this.executeWithApproval(action, async () => {
      await this.fs.copyFile(absoluteSrc, absoluteDest);

      return {
        success: true,
        output: { src: srcPath, dest: destPath, copied: true },
      };
    });
  }

  /**
   * Renommer/déplacer un fichier (nécessite approbation)
   */
  async rename(oldPath: string, newPath: string): Promise<ToolExecutionResult> {
    const absoluteOld = this.toAbsolutePath(oldPath);
    const absoluteNew = this.toAbsolutePath(newPath);
    const details = {
      type: 'file_move' as const,
      oldPath, // Use original path for validation
      newPath, // Use original path for validation
    };

    const action = createProposedAction(
      'file_move',
      this.config.agentName,
      `Rename: ${oldPath} → ${newPath}`,
      details,
    );

    return this.executeWithApproval(action, async () => {
      await this.fs.rename(absoluteOld, absoluteNew);

      return {
        success: true,
        output: { oldPath, newPath, renamed: true },
      };
    });
  }

  /*
   * --------------------------------------------------------------------------
   * UTILITY METHODS
   * --------------------------------------------------------------------------
   */

  /**
   * Obtenir tous les fichiers récursivement
   */
  async getAllFiles(basePath: string = '/'): Promise<string[]> {
    const absolutePath = this.toAbsolutePath(basePath);
    return this.fs.getAllFiles(absolutePath);
  }

  /**
   * Exporter le filesystem en JSON
   */
  async exportToJSON(basePath: string = '/'): Promise<Record<string, string>> {
    const absolutePath = this.toAbsolutePath(basePath);
    return this.fs.toJSON(absolutePath);
  }

  /**
   * Importer depuis JSON (nécessite approbation pour chaque fichier en mode strict)
   */
  async importFromJSON(data: Record<string, string>): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const results: Array<{ path: string; success: boolean }> = [];

    for (const [path, content] of Object.entries(data)) {
      const result = await this.createFile(path, content);
      results.push({ path, success: result.success });
    }

    const successCount = results.filter((r) => r.success).length;

    return {
      success: successCount === results.length,
      output: {
        imported: successCount,
        total: results.length,
        results,
      },
      executionTime: Date.now() - startTime,
    };
  }

  /*
   * --------------------------------------------------------------------------
   * PRIVATE METHODS
   * --------------------------------------------------------------------------
   */

  /**
   * Logger avec contexte agent
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    const prefixedMessage = `[${this.config.agentName}] ${message}`;

    switch (level) {
      case 'debug':
        logger.debug(prefixedMessage);
        break;
      case 'info':
        logger.info(prefixedMessage);
        break;
      case 'warn':
        logger.warn(prefixedMessage);
        break;
      case 'error':
        logger.error(prefixedMessage);
        break;
    }

    // Ajouter au log de l'agent
    addAgentLog(this.config.agentName, {
      level,
      message,
    });
  }

  /**
   * Exécuter une action avec validation et approbation si nécessaire
   */
  private async executeWithApproval(
    action: ProposedAction,
    executor: () => Promise<{ success: boolean; output: unknown }>,
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    // Valider l'action
    const validation = validateAction(action, this.config.strictMode);

    if (!validation.valid) {
      this.log('warn', `Action blocked: ${action.description} - ${validation.messages.join(', ')}`);

      return {
        success: false,
        output: null,
        error: validation.messages.join(', '),
        executionTime: Date.now() - startTime,
      };
    }

    // Si approbation requise, demander via callback
    if (validation.requiresApproval && this.config.onApprovalRequired) {
      this.log('info', `Requesting approval for: ${action.description}`);

      const approved = await this.config.onApprovalRequired(action);

      if (!approved) {
        this.log('info', `Action rejected by user: ${action.description}`);
        action.status = 'rejected';

        return {
          success: false,
          output: null,
          error: 'Action rejected by user',
          executionTime: Date.now() - startTime,
        };
      }

      action.status = 'approved';
      action.validatedAt = new Date();
    } else {
      action.status = 'auto_approved';
    }

    // Exécuter l'action
    try {
      const result = await executor();

      this.log('info', `Action completed: ${action.description}`);

      const toolResult: ToolExecutionResult = {
        ...result,
        executionTime: Date.now() - startTime,
      };

      // Notifier le callback si présent
      if (this.config.onActionExecuted) {
        this.config.onActionExecuted(action, toolResult);
      }

      return toolResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Action failed: ${action.description} - ${message}`);

      return {
        success: false,
        output: null,
        error: message,
        executionTime: Date.now() - startTime,
      };
    }
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Crée une instance de BaviniFSAdapter
 * @param config - Configuration de l'adapter
 * @param fs - MountManager optionnel (utilise le singleton partagé par défaut)
 * @param basePath - Chemin de base pour les opérations (défaut: '/')
 */
export function createBaviniFSAdapter(config: BaviniFSConfig, fs?: MountManager, basePath: string = '/'): BaviniFSAdapter {
  return new BaviniFSAdapter(config, fs, basePath);
}
