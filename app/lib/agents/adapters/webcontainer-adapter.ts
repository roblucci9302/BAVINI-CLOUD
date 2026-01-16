/**
 * WebContainer Adapter pour le système d'agents BAVINI
 *
 * Interface principale entre les agents et le WebContainer.
 * Toutes les opérations passent par cet adaptateur pour:
 * - Validation de sécurité
 * - Flux d'approbation en mode strict
 * - Logging des actions
 */

import type { WebContainer } from '@webcontainer/api';
import { webcontainer } from '~/lib/webcontainer';
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
  type ShellCommandDetails,
} from '../security/action-validator';
import { checkCommand, isBlocked } from '../security/command-whitelist';
import { addAgentLog } from '~/lib/stores/agents';

const logger = createScopedLogger('WebContainerAdapter');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface AdapterConfig {
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

export interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/*
 * ============================================================================
 * ADAPTER CLASS
 * ============================================================================
 */

export class WebContainerAdapter {
  private config: AdapterConfig;
  private container: Promise<WebContainer>;

  constructor(config: AdapterConfig) {
    this.config = config;
    this.container = webcontainer;
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

    try {
      const wc = await this.container;
      const content = await wc.fs.readFile(filePath, 'utf-8');

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
      if (message.includes('ENOENT')) {
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

    try {
      const wc = await this.container;
      const entries = await wc.fs.readdir(dirPath, { withFileTypes: true });

      const result: DirectoryEntry[] = entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'directory' : 'file',
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
    try {
      const wc = await this.container;
      await wc.fs.readdir(path);

      return true;
    } catch {
      try {
        const wc = await this.container;
        await wc.fs.readFile(path);

        return true;
      } catch {
        return false;
      }
    }
  }

  /*
   * --------------------------------------------------------------------------
   * FILE OPERATIONS (ÉCRITURE - nécessitent validation)
   * --------------------------------------------------------------------------
   */

  /**
   * Creer un fichier (necessite approbation en mode strict)
   */
  async createFile(filePath: string, content: string): Promise<ToolExecutionResult> {
    const details: FileCreateDetails = {
      type: 'file_create',
      path: filePath,
      content,
      lineCount: content.split('\n').length,
    };

    const action = createProposedAction('file_create', this.config.agentName, `Create file: ${filePath}`, details);

    return this.executeWithApproval(action, async () => {
      const wc = await this.container;

      // Create parent folders if needed
      const folder = filePath.substring(0, filePath.lastIndexOf('/'));

      if (folder && folder !== '.') {
        await wc.fs.mkdir(folder, { recursive: true });
      }

      await wc.fs.writeFile(filePath, content);

      return {
        success: true,
        output: { path: filePath, size: content.length },
      };
    });
  }

  /**
   * Modify a file (requires approval in strict mode)
   */
  async writeFile(filePath: string, content: string): Promise<ToolExecutionResult> {
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
        path: filePath,
        content,
        lineCount: newLines.length,
      };
      action = createProposedAction('file_create', this.config.agentName, `Create file: ${filePath}`, details);
    } else {
      const details: FileModifyDetails = {
        type: 'file_modify',
        path: filePath,
        oldContent: currentContent,
        newContent: content,
        linesAdded: Math.max(0, newLines.length - oldLines.length),
        linesRemoved: Math.max(0, oldLines.length - newLines.length),
      };
      action = createProposedAction('file_modify', this.config.agentName, `Modify file: ${filePath}`, details);
    }

    return this.executeWithApproval(action, async () => {
      const wc = await this.container;

      // Create parent folders if needed
      const folder = filePath.substring(0, filePath.lastIndexOf('/'));

      if (folder && folder !== '.') {
        await wc.fs.mkdir(folder, { recursive: true });
      }

      await wc.fs.writeFile(filePath, content);

      return {
        success: true,
        output: { path: filePath, size: content.length, modified: actionType === 'file_modify' },
      };
    });
  }

  /**
   * Delete a file (requires approval)
   */
  async deleteFile(filePath: string): Promise<ToolExecutionResult> {
    const details: FileDeleteDetails = {
      type: 'file_delete',
      path: filePath,
    };

    const action = createProposedAction('file_delete', this.config.agentName, `Delete file: ${filePath}`, details);

    return this.executeWithApproval(action, async () => {
      const wc = await this.container;
      await wc.fs.rm(filePath);

      return {
        success: true,
        output: { path: filePath, deleted: true },
      };
    });
  }

  /**
   * Create a directory (requires approval in strict mode)
   */
  async createDirectory(dirPath: string): Promise<ToolExecutionResult> {
    const details: DirectoryCreateDetails = {
      type: 'directory_create',
      path: dirPath,
    };

    const action = createProposedAction(
      'directory_create',
      this.config.agentName,
      `Create directory: ${dirPath}`,
      details,
    );

    return this.executeWithApproval(action, async () => {
      const wc = await this.container;
      await wc.fs.mkdir(dirPath, { recursive: true });

      return {
        success: true,
        output: { path: dirPath, created: true },
      };
    });
  }

  /*
   * --------------------------------------------------------------------------
   * SHELL OPERATIONS
   * --------------------------------------------------------------------------
   */

  /**
   * Exécuter une commande shell (nécessite validation)
   */
  async executeShell(command: string): Promise<ToolExecutionResult> {
    // Vérifier si la commande est bloquée
    if (isBlocked(command)) {
      this.log('warn', `Blocked command attempted: ${command}`);
      return {
        success: false,
        output: null,
        error: `Command blocked for security reasons: ${command}`,
      };
    }

    const commandCheck = checkCommand(command);

    const details: ShellCommandDetails = {
      type: 'shell_command',
      command,
      commandCheck,
    };

    const action = createProposedAction(
      'shell_command',
      this.config.agentName,
      `Execute: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`,
      details,
    );

    /*
     * En mode strict, même les commandes "allowed" nécessitent approbation
     * Sauf lecture seule (ls, cat, etc.)
     */
    const readOnlyCommands = ['ls', 'cat', 'head', 'tail', 'grep', 'find', 'pwd', 'echo', 'which'];
    const isReadOnly = readOnlyCommands.some((cmd) => command.trim().startsWith(cmd + ' ') || command.trim() === cmd);

    if (isReadOnly && !this.config.strictMode) {
      // Exécuter directement sans approbation
      return this.executeShellCommand(command);
    }

    return this.executeWithApproval(action, () => this.executeShellCommand(command));
  }

  /**
   * Exécution effective de la commande shell
   */
  private async executeShellCommand(command: string): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    try {
      const wc = await this.container;

      let stdout = '';
      const stderr = '';

      const process = await wc.spawn('jsh', ['-c', command], {
        env: { npm_config_yes: 'true' },
      });

      // Collecter stdout
      const stdoutReader = process.output.getReader();
      const readStdout = async () => {
        while (true) {
          const { done, value } = await stdoutReader.read();

          if (done) {
            break;
          }

          stdout += value;
        }
      };

      await readStdout();

      const exitCode = await process.exit;

      this.log('debug', `Shell command completed: ${command} (exit: ${exitCode})`);

      const result: ShellResult = {
        exitCode,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
      };

      return {
        success: exitCode === 0,
        output: result,
        error: exitCode !== 0 ? `Command exited with code ${exitCode}` : undefined,
        executionTime: Date.now() - startTime,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Shell command failed: ${command} - ${message}`);

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
   * HELPERS
   * --------------------------------------------------------------------------
   */

  /**
   * Execute an action with the approval flow
   */
  private async executeWithApproval(
    action: ProposedAction,
    executor: () => Promise<ToolExecutionResult>,
  ): Promise<ToolExecutionResult> {
    const startTime = Date.now();

    // Validate the action
    const validation = validateAction(action, this.config.strictMode);

    if (!validation.valid) {
      const errorMsg = validation.messages.join(', ') || 'Validation failed';
      this.log('warn', `Action validation failed: ${errorMsg}`);

      return {
        success: false,
        output: null,
        error: errorMsg,
      };
    }

    // If approval required
    if (validation.requiresApproval) {
      if (!this.config.onApprovalRequired) {
        this.log('warn', `Approval required but no callback provided for: ${action.description}`);
        return {
          success: false,
          output: null,
          error: 'Approval required but no approval handler configured',
        };
      }

      this.log('info', `Waiting for approval: ${action.description}`);

      const approved = await this.config.onApprovalRequired(action);

      if (!approved) {
        this.log('info', `Action rejected by user: ${action.description}`);
        return {
          success: false,
          output: null,
          error: 'Action rejected by user',
        };
      }

      this.log('info', `Action approved: ${action.description}`);
    }

    // Execute the action
    try {
      const result = await executor();
      result.executionTime = Date.now() - startTime;

      // Notify execution
      if (this.config.onActionExecuted) {
        this.config.onActionExecuted(action, result);
      }

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Action execution failed: ${message}`);

      return {
        success: false,
        output: null,
        error: message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Logger avec contexte agent
   */
  private log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void {
    logger[level](message);

    addAgentLog(this.config.agentName, {
      level,
      message,
      taskId: this.config.taskId,
    });
  }

  /**
   * Mettre à jour la configuration
   */
  updateConfig(config: Partial<AdapterConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /**
   * Obtenir la configuration actuelle
   */
  getConfig(): AdapterConfig {
    return { ...this.config };
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer un adaptateur pour un agent
 */
export function createWebContainerAdapter(config: AdapterConfig): WebContainerAdapter {
  return new WebContainerAdapter(config);
}

/**
 * Map des adaptateurs par agent (singleton par agent)
 */
const adapterMap = new Map<AgentType, WebContainerAdapter>();

/**
 * Obtenir ou créer un adaptateur pour un agent
 */
export function getAdapterForAgent(
  agentName: AgentType,
  config?: Partial<Omit<AdapterConfig, 'agentName'>>,
): WebContainerAdapter {
  let adapter = adapterMap.get(agentName);

  if (!adapter) {
    adapter = new WebContainerAdapter({
      agentName,
      strictMode: true, // Mode strict par défaut
      ...config,
    });
    adapterMap.set(agentName, adapter);
  } else if (config) {
    adapter.updateConfig(config);
  }

  return adapter;
}

/**
 * Réinitialiser tous les adaptateurs
 */
export function resetAllAdapters(): void {
  adapterMap.clear();
}
