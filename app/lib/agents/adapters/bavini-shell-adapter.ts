/**
 * =============================================================================
 * BAVINI Cloud - Shell Adapter for Agents
 * =============================================================================
 * Adaptateur Shell pour les agents BAVINI.
 * Remplace ShellAdapter en utilisant CommandExecutor et MountManager.
 *
 * Caractéristiques:
 * - Interface identique à ShellAdapter pour migration transparente
 * - Utilise CommandExecutor pour les commandes shell
 * - Support du mode strict avec flux d'approbation
 * - Pas de dépendance à WebContainer
 * =============================================================================
 */

import type { MountManager } from '~/lib/runtime/filesystem';
import { getSharedMountManager } from '~/lib/runtime/filesystem';
import { CommandExecutor } from '~/lib/runtime/terminal/command-executor';
import type {
  CommandContext,
  CommandResult,
  ParsedCommand,
  ShellState,
} from '~/lib/runtime/terminal/types';
import { createScopedLogger } from '~/utils/logger';
import type { AgentType, ToolExecutionResult } from '../types';
import {
  checkCommand,
  isBlocked,
  type CommandCheckResult,
} from '../security/command-whitelist';
import {
  createProposedAction,
  type ProposedAction,
  type ShellCommandDetails,
} from '../security/action-validator';
import { addAgentLog } from '~/lib/stores/agents';

const logger = createScopedLogger('BaviniShellAdapter');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface BaviniShellConfig {
  /** Agent propriétaire */
  agentName: AgentType;

  /** ID de tâche */
  taskId?: string;

  /** Mode strict (approbation requise) */
  strictMode: boolean;

  /** Timeout par défaut en ms */
  defaultTimeout?: number;

  /** Working directory initial */
  cwd?: string;

  /** Variables d'environnement */
  env?: Record<string, string>;

  /** Callback d'approbation */
  onApprovalRequired?: (action: ProposedAction) => Promise<boolean>;

  /** Callback pour notifier une action */
  onActionExecuted?: (action: ProposedAction, result: ToolExecutionResult) => void;
}

export interface ShellResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  command: string;
}

export interface NpmRunOptions {
  /** Script à exécuter */
  script: string;

  /** Arguments additionnels */
  args?: string[];

  /** Timeout en ms */
  timeout?: number;

  /** Working directory */
  cwd?: string;
}

export interface NpmInstallOptions {
  /** Packages à installer */
  packages?: string[];

  /** Dev dependencies */
  dev?: boolean;

  /** Timeout en ms */
  timeout?: number;
}

export interface GitCommandOptions {
  /** Opération git */
  operation: 'status' | 'add' | 'commit' | 'push' | 'pull' | 'diff' | 'log' | 'branch';

  /** Arguments */
  args?: string[];

  /** Timeout */
  timeout?: number;
}

/*
 * ============================================================================
 * SHELL ADAPTER CLASS
 * ============================================================================
 */

export class BaviniShellAdapter {
  private config: BaviniShellConfig;
  private fs: MountManager;
  private executor: CommandExecutor;
  private shellState: ShellState;

  constructor(config: BaviniShellConfig, fs?: MountManager) {
    this.config = {
      defaultTimeout: 60000,
      cwd: '/home',
      ...config,
    };
    this.fs = fs ?? getSharedMountManager();
    this.executor = new CommandExecutor();
    this.shellState = {
      cwd: this.config.cwd ?? '/home',
      env: {
        HOME: '/home',
        PATH: '/usr/bin:/bin',
        PWD: this.config.cwd ?? '/home',
        USER: 'bavini',
        SHELL: '/bin/sh',
        ...this.config.env,
      },
      history: [],
      lastExitCode: 0,
    };
  }

  /*
   * --------------------------------------------------------------------------
   * COMMANDES NPM
   * --------------------------------------------------------------------------
   */

  /**
   * npm install
   */
  async npmInstall(options: NpmInstallOptions = {}): Promise<ToolExecutionResult> {
    const { packages = [], dev = false, timeout = 120000 } = options;

    let command = 'npm install';

    if (dev) {
      command += ' --save-dev';
    }

    if (packages.length > 0) {
      command += ` ${packages.join(' ')}`;
    }

    return this.executeCommand(command, timeout);
  }

  /**
   * npm run <script>
   */
  async npmRun(options: NpmRunOptions): Promise<ToolExecutionResult> {
    const { script, args = [], timeout = this.config.defaultTimeout } = options;

    let command = `npm run ${script}`;

    if (args.length > 0) {
      command += ` -- ${args.join(' ')}`;
    }

    return this.executeCommand(command, timeout);
  }

  /**
   * npm test
   */
  async npmTest(timeout?: number): Promise<ToolExecutionResult> {
    return this.executeCommand('npm run test', timeout || 120000);
  }

  /**
   * npm run build
   */
  async npmBuild(timeout?: number): Promise<ToolExecutionResult> {
    return this.executeCommand('npm run build', timeout || 180000);
  }

  /*
   * --------------------------------------------------------------------------
   * COMMANDES GIT
   * --------------------------------------------------------------------------
   */

  /**
   * Exécuter une commande git
   */
  async gitCommand(options: GitCommandOptions): Promise<ToolExecutionResult> {
    const { operation, args = [], timeout = 30000 } = options;

    let command = `git ${operation}`;

    if (args.length > 0) {
      command += ` ${args.join(' ')}`;
    }

    // git push nécessite toujours une approbation
    if (operation === 'push') {
      return this.executeCommand(command, timeout, true);
    }

    return this.executeCommand(command, timeout);
  }

  /**
   * git status
   */
  async gitStatus(): Promise<ToolExecutionResult> {
    return this.gitCommand({ operation: 'status' });
  }

  /**
   * git diff
   */
  async gitDiff(args: string[] = []): Promise<ToolExecutionResult> {
    return this.gitCommand({ operation: 'diff', args });
  }

  /**
   * git add
   */
  async gitAdd(files: string[] = ['.']): Promise<ToolExecutionResult> {
    return this.gitCommand({ operation: 'add', args: files });
  }

  /**
   * git commit
   */
  async gitCommit(message: string): Promise<ToolExecutionResult> {
    return this.gitCommand({ operation: 'commit', args: ['-m', `"${message}"`] });
  }

  /*
   * --------------------------------------------------------------------------
   * COMMANDES GÉNÉRIQUES
   * --------------------------------------------------------------------------
   */

  /**
   * Exécuter une commande shell arbitraire
   */
  async executeCommand(command: string, timeout?: number, forceApproval = false): Promise<ToolExecutionResult> {
    const startTime = Date.now();
    const effectiveTimeout = timeout || this.config.defaultTimeout || 60000;

    // Vérification de sécurité
    if (isBlocked(command)) {
      this.log('warn', `Blocked command: ${command}`);
      return {
        success: false,
        output: null,
        error: `Command blocked for security: ${command}`,
      };
    }

    const check = checkCommand(command);

    // Déterminer si approbation nécessaire
    const needsApproval = forceApproval || this.config.strictMode || check.level === 'approval_required';

    if (needsApproval) {
      const approved = await this.requestApproval(command, check);

      if (!approved) {
        return {
          success: false,
          output: null,
          error: 'Command rejected by user',
        };
      }
    }

    // Parser la commande
    const parsed = this.parseCommand(command);

    // Créer le contexte d'exécution
    let stdout = '';
    let stderr = '';

    const context: CommandContext = {
      fs: this.fs,
      state: this.shellState,
      stdout: (data: string) => {
        stdout += data;
      },
      stderr: (data: string) => {
        stderr += data;
      },
      dimensions: { cols: 120, rows: 40 },
    };

    // Exécuter avec timeout
    try {
      const resultPromise = this.executor.execute(parsed, context);

      const timeoutPromise = new Promise<CommandResult>((_, reject) => {
        setTimeout(() => {
          reject(new Error(`Command timed out after ${effectiveTimeout}ms`));
        }, effectiveTimeout);
      });

      const result = await Promise.race([resultPromise, timeoutPromise]);

      // Mettre à jour l'état du shell si nécessaire
      if (result.stateUpdates) {
        this.shellState = { ...this.shellState, ...result.stateUpdates };
      }
      this.shellState.lastExitCode = result.exitCode;

      const executionTime = Date.now() - startTime;

      this.log(
        result.exitCode === 0 ? 'debug' : 'warn',
        `Command completed: ${command} (exit: ${result.exitCode}, ${executionTime}ms)`,
      );

      const shellResult: ShellResult = {
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        exitCode: result.exitCode,
        command,
      };

      const toolResult: ToolExecutionResult = {
        success: result.exitCode === 0,
        output: shellResult,
        error: result.exitCode !== 0 ? `Command exited with code ${result.exitCode}` : undefined,
        executionTime,
      };

      // Notifier le callback si présent
      if (this.config.onActionExecuted && needsApproval) {
        const action = createProposedAction(
          'shell_command',
          this.config.agentName,
          `Execute: ${command.substring(0, 50)}`,
          { type: 'shell_command', command, commandCheck: check },
        );
        action.status = 'approved';
        this.config.onActionExecuted(action, toolResult);
      }

      return toolResult;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Command failed: ${command} - ${message}`);

      return {
        success: false,
        output: null,
        error: message,
        executionTime: Date.now() - startTime,
      };
    }
  }

  /**
   * Parse une commande en structure ParsedCommand
   */
  private parseCommand(command: string): ParsedCommand {
    const trimmed = command.trim();
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0] || '';
    const args = parts.slice(1);

    return {
      command: cmd,
      args,
      raw: trimmed,
    };
  }

  /**
   * Request approval for a command
   */
  private async requestApproval(command: string, check: CommandCheckResult): Promise<boolean> {
    if (!this.config.onApprovalRequired) {
      this.log('warn', 'No approval handler configured');
      return false;
    }

    const details: ShellCommandDetails = {
      type: 'shell_command',
      command,
      commandCheck: check,
    };

    const action = createProposedAction(
      'shell_command',
      this.config.agentName,
      `Execute: ${command.substring(0, 50)}${command.length > 50 ? '...' : ''}`,
      details,
    );

    this.log('info', `Requesting approval for: ${command}`);

    return this.config.onApprovalRequired(action);
  }

  /*
   * --------------------------------------------------------------------------
   * UTILITAIRES
   * --------------------------------------------------------------------------
   */

  /**
   * Obtenir le répertoire de travail actuel
   */
  getCwd(): string {
    return this.shellState.cwd;
  }

  /**
   * Changer le répertoire de travail
   */
  async setCwd(path: string): Promise<boolean> {
    const absolutePath = path.startsWith('/') ? path : `${this.shellState.cwd}/${path}`;

    const exists = await this.fs.exists(absolutePath);
    if (!exists) {
      this.log('warn', `Directory not found: ${absolutePath}`);
      return false;
    }

    const stat = await this.fs.stat(absolutePath);
    if (!stat.isDirectory) {
      this.log('warn', `Not a directory: ${absolutePath}`);
      return false;
    }

    this.shellState.cwd = absolutePath;
    this.shellState.env.PWD = absolutePath;
    return true;
  }

  /**
   * Obtenir les variables d'environnement
   */
  getEnv(): Record<string, string | undefined> {
    return { ...this.shellState.env };
  }

  /**
   * Définir une variable d'environnement
   */
  setEnv(key: string, value: string): void {
    this.shellState.env[key] = value;
  }

  /**
   * Vérifier si une commande est safe (lecture seule)
   */
  isSafeCommand(command: string): boolean {
    const safePatterns = [
      /^ls\b/,
      /^pwd\b/,
      /^cat\b/,
      /^head\b/,
      /^tail\b/,
      /^grep\b/,
      /^find\b/,
      /^echo\b/,
      /^which\b/,
      /^node\s+-v/,
      /^npm\s+(list|ls|view|info|search)/,
      /^git\s+(status|log|diff|branch|show)/,
    ];

    return safePatterns.some((pattern) => pattern.test(command.trim()));
  }

  /**
   * Vérifier si une commande existe
   */
  hasCommand(name: string): boolean {
    return this.executor.hasCommand(name);
  }

  /**
   * Lister les commandes disponibles
   */
  listCommands(): string[] {
    return this.executor.listCommands();
  }

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

    addAgentLog(this.config.agentName, {
      level,
      message,
      taskId: this.config.taskId,
    });
  }

  /**
   * Mettre à jour la configuration
   */
  updateConfig(config: Partial<BaviniShellConfig>): void {
    this.config = { ...this.config, ...config };
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer un adaptateur shell pour un agent
 */
export function createBaviniShellAdapter(config: BaviniShellConfig, fs?: MountManager): BaviniShellAdapter {
  return new BaviniShellAdapter(config, fs);
}
