/**
 * Adaptateur Shell pour les agents BAVINI
 *
 * Fournit des opérations shell de haut niveau:
 * - Commandes NPM (install, run, test, build)
 * - Commandes Git
 * - Processus long-running (serveurs)
 * - Gestion des timeouts
 */

import type { WebContainer, WebContainerProcess } from '@webcontainer/api';
import { webcontainer } from '~/lib/webcontainer';
import { createScopedLogger } from '~/utils/logger';
import type { AgentType, ToolExecutionResult } from '../types';
import { checkCommand, isBlocked, requiresApproval, type CommandCheckResult } from '../security/command-whitelist';
import { createProposedAction, type ProposedAction, type ShellCommandDetails } from '../security/action-validator';
import { addAgentLog } from '~/lib/stores/agents';

const logger = createScopedLogger('ShellAdapter');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

export interface ShellConfig {
  /** Agent propriétaire */
  agentName: AgentType;

  /** ID de tâche */
  taskId?: string;

  /** Mode strict (approbation requise) */
  strictMode: boolean;

  /** Timeout par défaut en ms */
  defaultTimeout?: number;

  /** Callback d'approbation */
  onApprovalRequired?: (action: ProposedAction) => Promise<boolean>;
}

export interface ProcessHandle {
  /** ID unique du processus */
  id: string;

  /** Commande exécutée */
  command: string;

  /** Processus WebContainer */
  process: WebContainerProcess;

  /** Output accumulé */
  output: string;

  /** Est-il terminé ? */
  completed: boolean;

  /** Code de sortie */
  exitCode?: number;

  /** Callback de kill */
  kill: () => void;
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

export class ShellAdapter {
  private config: ShellConfig;
  private container: Promise<WebContainer>;
  private runningProcesses: Map<string, ProcessHandle> = new Map();
  private processCounter = 0;

  constructor(config: ShellConfig) {
    this.config = {
      defaultTimeout: 60000, // 1 minute par défaut
      ...config,
    };
    this.container = webcontainer;
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
    return this.executeCommand('npm test', timeout || 120000);
  }

  /**
   * npm run build
   */
  async npmBuild(timeout?: number): Promise<ToolExecutionResult> {
    return this.executeCommand('npm run build', timeout || 180000);
  }

  /**
   * Démarrer un serveur de développement (processus long-running)
   */
  async startDevServer(command = 'npm run dev'): Promise<ProcessHandle | null> {
    /*
     * Les serveurs de dev ne passent pas par l'approbation normale
     * car ils sont gérés différemment
     */
    const check = checkCommand(command);

    if (check.level === 'blocked') {
      this.log('error', `Blocked command: ${command}`);
      return null;
    }

    try {
      const wc = await this.container;
      const id = `process-${++this.processCounter}`;

      let output = '';
      const process = await wc.spawn('jsh', ['-c', command], {
        env: { npm_config_yes: 'true' },
      });

      const handle: ProcessHandle = {
        id,
        command,
        process,
        output: '',
        completed: false,
        kill: () => process.kill(),
      };

      // Collecter l'output en streaming
      const reader = process.output.getReader();
      const readOutput = async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            output += value;
            handle.output = output;
          }
        } catch {
          // Process killed
        }
      };

      readOutput();

      // Surveiller la terminaison
      process.exit.then((code) => {
        handle.completed = true;
        handle.exitCode = code;
        this.runningProcesses.delete(id);
      });

      this.runningProcesses.set(id, handle);
      this.log('info', `Started long-running process: ${command} (${id})`);

      return handle;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      this.log('error', `Failed to start process: ${message}`);

      return null;
    }
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

    // Construire la commande
    let command = `git ${operation}`;

    if (args.length > 0) {
      command += ` ${args.join(' ')}`;
    }

    // git push nécessite toujours une approbation
    if (operation === 'push') {
      return this.executeCommand(command, timeout, true);
    }

    // Les autres commandes suivent les règles normales
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

    // Exécuter la commande
    try {
      const wc = await this.container;
      let output = '';

      const process = await wc.spawn('jsh', ['-c', command], {
        env: { npm_config_yes: 'true' },
      });

      // Collecter l'output
      const reader = process.output.getReader();
      const readOutput = async () => {
        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          output += value;
        }
      };

      // Race entre timeout et exécution
      const timeoutPromise = new Promise<number>((_, reject) => {
        setTimeout(() => {
          process.kill();
          reject(new Error(`Command timed out after ${effectiveTimeout}ms`));
        }, effectiveTimeout);
      });

      await readOutput();

      const exitCode = await Promise.race([process.exit, timeoutPromise]);

      const executionTime = Date.now() - startTime;

      this.log(
        exitCode === 0 ? 'debug' : 'warn',
        `Command completed: ${command} (exit: ${exitCode}, ${executionTime}ms)`,
      );

      return {
        success: exitCode === 0,
        output: {
          stdout: output.trim(),
          exitCode,
          command,
        },
        error: exitCode !== 0 ? `Command exited with code ${exitCode}` : undefined,
        executionTime,
      };
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
   * GESTION DES PROCESSUS
   * --------------------------------------------------------------------------
   */

  /**
   * Obtenir un processus en cours
   */
  getProcess(id: string): ProcessHandle | undefined {
    return this.runningProcesses.get(id);
  }

  /**
   * Lister les processus en cours
   */
  listProcesses(): ProcessHandle[] {
    return Array.from(this.runningProcesses.values());
  }

  /**
   * Tuer un processus
   */
  killProcess(id: string): boolean {
    const handle = this.runningProcesses.get(id);

    if (handle) {
      handle.kill();
      this.runningProcesses.delete(id);
      this.log('info', `Killed process: ${id}`);

      return true;
    }

    return false;
  }

  /**
   * Tuer tous les processus
   */
  killAllProcesses(): void {
    for (const handle of this.runningProcesses.values()) {
      handle.kill();
    }
    this.runningProcesses.clear();
    this.log('info', 'Killed all processes');
  }

  /*
   * --------------------------------------------------------------------------
   * UTILITAIRES
   * --------------------------------------------------------------------------
   */

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
  updateConfig(config: Partial<ShellConfig>): void {
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
export function createShellAdapter(config: ShellConfig): ShellAdapter {
  return new ShellAdapter(config);
}

/**
 * Map des adaptateurs par agent
 */
const shellAdapterMap = new Map<AgentType, ShellAdapter>();

/**
 * Obtenir ou créer un adaptateur shell pour un agent
 */
export function getShellAdapterForAgent(
  agentName: AgentType,
  config?: Partial<Omit<ShellConfig, 'agentName'>>,
): ShellAdapter {
  let adapter = shellAdapterMap.get(agentName);

  if (!adapter) {
    adapter = new ShellAdapter({
      agentName,
      strictMode: true,
      ...config,
    });
    shellAdapterMap.set(agentName, adapter);
  } else if (config) {
    adapter.updateConfig(config);
  }

  return adapter;
}

/**
 * Réinitialiser tous les adaptateurs shell
 */
export function resetAllShellAdapters(): void {
  // Tuer tous les processus d'abord
  for (const adapter of shellAdapterMap.values()) {
    adapter.killAllProcesses();
  }
  shellAdapterMap.clear();
}
