import { WebContainer } from '@webcontainer/api';
import { atom, map, type MapStore } from 'nanostores';
import * as nodePath from 'node:path';
import { syncToWebContainer } from '~/lib/git/file-sync';
import * as gitOps from '~/lib/git/operations';
import { initPyodide, installPackages, runPythonWithTimeout } from '~/lib/pyodide';
import { getAccessToken } from '~/lib/auth/tokens';
import type { BoltAction, GitAction, GitHubAction, PythonAction } from '~/types/actions';
import * as githubApi from '~/lib/github/api';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import { raceWithTimeout, EXECUTION_LIMITS } from '~/lib/security/timeout';
import { AgentExecutionError, PythonExecutionError, ExecutionError, TimeoutError, toAppError } from '~/lib/errors';
import { createOptimizedInstaller, type InstallPhase } from '~/lib/webcontainer/optimized-installer';

const logger = createScopedLogger('ActionRunner');

// Atom to track installation progress (for UI feedback)
export const installProgress = atom<{ phase: InstallPhase; progress: number; message: string } | null>(null);

// Performance: Timeout for waiting dev server to be ready (increased from 1s)
const DEV_SERVER_READY_TIMEOUT_MS = 30000; // 30 seconds max wait
const DEV_SERVER_CHECK_INTERVAL_MS = 500; // Check every 500ms

// Atom to track if a shell command is currently running (for UI feedback)
export const isShellRunning = atom(false);

// Atom to track if a dev server is running
export const isDevServerRunning = atom(false);

// Type for WebContainer process
interface WebContainerProcess {
  kill: () => void;
  exit: Promise<number>;
  output: ReadableStream<string>;
}

// Store for the current dev server process (to allow restart)
let currentDevServerProcess: WebContainerProcess | null = null;

export type ActionStatus = 'pending' | 'running' | 'complete' | 'aborted' | 'failed';

export type BaseActionState = BoltAction & {
  status: Exclude<ActionStatus, 'failed'>;
  abort: () => void;
  executed: boolean;
  abortSignal: AbortSignal;
};

export type FailedActionState = BoltAction &
  Omit<BaseActionState, 'status'> & {
    status: Extract<ActionStatus, 'failed'>;
    error: string;
  };

export type ActionState = BaseActionState | FailedActionState;

type BaseActionUpdate = Partial<Pick<BaseActionState, 'status' | 'abort' | 'executed'>>;

export type ActionStateUpdate =
  | BaseActionUpdate
  | (Omit<BaseActionUpdate, 'status'> & { status: 'failed'; error: string });

type ActionsMap = MapStore<Record<string, ActionState>>;

/**
 * Patterns de commandes potentiellement dangereuses
 * Utilisé pour détecter les tentatives d'injection de commandes
 */
const DANGEROUS_COMMAND_PATTERNS = [
  /rm\s+(-[rf]+\s+)*\/(?!project|home\/project)/i, // rm sur paths système
  />\s*\/etc\//i, // Écriture dans /etc
  />\s*\/usr\//i, // Écriture dans /usr
  /curl\s+.*\|\s*sh/i, // curl pipe to shell
  /wget\s+.*\|\s*sh/i, // wget pipe to shell
  /\|\s*sh\s*$/i, // pipe to shell
  /\|\s*bash\s*$/i, // pipe to bash
  /eval\s*\(/i, // eval()
  /;\s*rm\s+-rf/i, // command chaining with rm -rf
  /`[^`]*`/, // backticks command substitution (désactivé pour certains cas légitimes)
];

/**
 * Commandes autorisées (whitelist)
 */
const ALLOWED_COMMAND_PREFIXES = [
  'npm',
  'npx',
  'pnpm',
  'yarn',
  'bun',
  'node',
  'deno',
  'git',
  'gh',
  'cat',
  'ls',
  'cd',
  'pwd',
  'echo',
  'mkdir',
  'touch',
  'cp',
  'mv',
  'grep',
  'find',
  'head',
  'tail',
  'wc',
  'python',
  'python3',
  'pip',
  'pip3',
  'cargo',
  'rustc',
  'go',
  'make',
  'curl',
  'wget', // Autorisés mais surveillés
];

/**
 * Valide un chemin de fichier pour prévenir le path traversal
 */
function validateFilePath(filePath: string): { valid: boolean; reason?: string } {
  // Rejeter les chemins absolus
  if (nodePath.isAbsolute(filePath)) {
    return { valid: false, reason: 'Chemin absolu non autorisé' };
  }

  // Normaliser et vérifier le path traversal
  const normalized = nodePath.normalize(filePath);

  if (normalized.startsWith('..') || normalized.includes('/..') || normalized.includes('\\..')) {
    return { valid: false, reason: 'Path traversal détecté (..)' };
  }

  // Rejeter les chemins vers des dossiers système
  const systemPaths = ['/etc', '/usr', '/var', '/bin', '/sbin', '/root', '/home'];

  if (systemPaths.some((p) => normalized.startsWith(p) || normalized.includes(p))) {
    return { valid: false, reason: 'Accès à un chemin système non autorisé' };
  }

  // Rejeter les fichiers cachés système (sauf .gitignore, .env, etc.)
  const allowedDotFiles = ['.gitignore', '.env', '.env.local', '.eslintrc', '.prettierrc', '.npmrc', '.nvmrc'];
  const fileName = nodePath.basename(normalized);

  if (fileName.startsWith('.') && !allowedDotFiles.some((f) => fileName.startsWith(f))) {
    // Autoriser les dossiers comme .github, .vscode
    const allowedDotDirs = ['.github', '.vscode', '.husky', '.storybook'];

    if (!allowedDotDirs.some((d) => normalized.includes(d))) {
      return { valid: false, reason: 'Fichier caché système non autorisé' };
    }
  }

  return { valid: true };
}

/**
 * Valide une commande shell pour détecter les injections potentielles
 */
function validateShellCommand(command: string): { valid: boolean; reason?: string } {
  const trimmedCommand = command.trim();

  // Vérifier les patterns dangereux
  for (const pattern of DANGEROUS_COMMAND_PATTERNS) {
    if (pattern.test(trimmedCommand)) {
      return { valid: false, reason: `Pattern dangereux détecté: ${pattern.source}` };
    }
  }

  // Extraire la commande principale (premier mot)
  const mainCommand = trimmedCommand.split(/\s+/)[0].toLowerCase();

  // Vérifier si la commande est dans la whitelist
  const isAllowed = ALLOWED_COMMAND_PREFIXES.some(
    (prefix) => mainCommand === prefix || mainCommand.endsWith(`/${prefix}`),
  );

  if (!isAllowed) {
    logger.warn(`Commande non whitelistée: ${mainCommand}`);

    // On log mais on autorise quand même (pour flexibilité)
  }

  return { valid: true };
}

export class ActionRunner {
  #webcontainer: Promise<WebContainer>;
  #currentExecutionPromise: Promise<void> = Promise.resolve();

  actions: ActionsMap = map({});

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;
  }

  addAction(data: ActionCallbackData) {
    const { actionId } = data;

    const actions = this.actions.get();
    const action = actions[actionId];

    if (action) {
      // action already added
      return;
    }

    const abortController = new AbortController();

    this.actions.setKey(actionId, {
      ...data.action,
      status: 'pending',
      executed: false,
      abort: () => {
        abortController.abort();
        this.#updateAction(actionId, { status: 'aborted' });
      },
      abortSignal: abortController.signal,
    });

    this.#currentExecutionPromise
      .then(() => {
        this.#updateAction(actionId, { status: 'running' });
      })
      .catch((error) => {
        // Log but don't re-throw - this is just a status update
        logger.debug('Previous action in chain failed, updating status anyway:', error);
        this.#updateAction(actionId, { status: 'running' });
      });
  }

  async runAction(data: ActionCallbackData) {
    const { actionId } = data;
    const action = this.actions.get()[actionId];

    if (!action) {
      unreachable(`Action ${actionId} not found`);
    }

    if (action.executed) {
      return;
    }

    this.#updateAction(actionId, { ...action, ...data.action, executed: true });

    this.#currentExecutionPromise = this.#currentExecutionPromise
      .then(() => {
        return this.#executeAction(actionId);
      })
      .catch((error) => {
        logger.error('Action failed:', error);
      });
  }

  async #executeAction(actionId: string) {
    const action = this.actions.get()[actionId];

    if (import.meta.env.DEV) {
      console.log(
        '%c[ACTION RUNNER] Executing action:',
        'background: #E91E63; color: white; font-size: 14px; padding: 4px 8px;',
        { actionId, type: action.type },
      );
    }

    this.#updateAction(actionId, { status: 'running' });

    try {
      switch (action.type) {
        case 'shell': {
          await this.#runShellAction(action);
          break;
        }
        case 'file': {
          await this.#runFileAction(action);
          break;
        }
        case 'git': {
          await this.#runGitAction(action);
          break;
        }
        case 'python': {
          await this.#runPythonAction(action);
          break;
        }
        case 'github': {
          await this.#runGitHubAction(action);
          break;
        }
        case 'restart': {
          await this.restartDevServer();
          break;
        }
      }

      this.#updateAction(actionId, { status: action.abortSignal.aborted ? 'aborted' : 'complete' });
    } catch (error) {
      // Convertir en erreur typée avec contexte
      const appError = this.#wrapError(error, action.type, actionId);
      const errorMessage = appError.message;

      this.#updateAction(actionId, { status: 'failed', error: errorMessage });

      logger.error(`Action ${action.type} failed:`, {
        actionId,
        actionType: action.type,
        error: errorMessage,
        recoverable: appError.recoverable,
      });

      // re-throw the error to be caught in the promise chain
      throw appError;
    }
  }

  /**
   * Convertit une erreur en type approprié avec contexte
   */
  #wrapError(error: unknown, actionType: string, actionId: string) {
    // Si déjà une AppError, enrichir le contexte
    const baseError = toAppError(error, `Échec de l'action ${actionType}`);
    const errorMessage = error instanceof Error ? error.message : 'Erreur inconnue';

    // Créer une erreur spécifique selon le type d'action
    switch (actionType) {
      case 'python':
        return new PythonExecutionError(
          errorMessage,
          errorMessage, // pythonError
          { actionId, actionType },
        );

      case 'shell':
        return new ExecutionError(
          errorMessage,
          'shell', // language
          { actionId, actionType },
        );

      default:
        return new AgentExecutionError(actionType, errorMessage, {
          actionId,
          actionType,
          originalError: baseError.message,
        });
    }
  }

  // Detect if a command starts a dev server
  #isDevServerCommand(command: string): boolean {
    const devServerPatterns = [
      /npm\s+run\s+dev/i,
      /pnpm\s+run\s+dev/i,
      /yarn\s+dev/i,
      /npm\s+start/i,
      /pnpm\s+start/i,
      /yarn\s+start/i,
      /vite/i,
      /next\s+dev/i,
      /remix\s+dev/i,
      /astro\s+dev/i,
    ];
    return devServerPatterns.some((pattern) => pattern.test(command));
  }

  // Detect if a command is an install command (npm install, pnpm install, etc.)
  #isInstallCommand(command: string): boolean {
    const installPatterns = [
      /^(npm|pnpm|yarn|bun)\s+install\s*$/i, // Just "npm install" without packages
      /^(npm|pnpm|yarn|bun)\s+i\s*$/i, // Short form "npm i"
      /^(npm|pnpm|yarn|bun)\s+ci\s*$/i, // CI install
    ];
    return installPatterns.some((pattern) => pattern.test(command.trim()));
  }

  // Run optimized install using cache system
  async #runOptimizedInstall(): Promise<{ success: boolean; fromCache: boolean; durationMs: number }> {
    const webcontainer = await this.#webcontainer;
    const installer = createOptimizedInstaller(webcontainer);

    logger.info('Running optimized install with cache...');

    if (import.meta.env.DEV) {
      console.log(
        '%c[ACTION RUNNER] ⚡ Starting optimized install',
        'background: #4CAF50; color: white; font-size: 12px; padding: 2px 6px;',
      );
    }

    const result = await installer.install({
      onProgress: (phase, progress, message) => {
        installProgress.set({ phase, progress, message });

        if (import.meta.env.DEV) {
          console.log(
            '%c[INSTALL]',
            'background: #2196F3; color: white; padding: 2px 6px;',
            `${phase}: ${progress}% - ${message}`,
          );
        }
      },
    });

    installProgress.set(null);

    if (result.fromCache) {
      logger.info(`Install restored from cache in ${result.durationMs}ms`);

      if (import.meta.env.DEV) {
        console.log(
          '%c[ACTION RUNNER] ✓ Restored from cache',
          'background: #4CAF50; color: white; font-size: 12px; padding: 2px 6px;',
          `${result.durationMs}ms`,
        );
      }
    } else {
      logger.info(`Fresh install completed in ${result.durationMs}ms`);
    }

    return result;
  }

  // Kill the current dev server if running
  async killDevServer(): Promise<void> {
    if (currentDevServerProcess) {
      logger.info('Killing existing dev server...');

      if (import.meta.env.DEV) {
        console.log(
          '%c[ACTION RUNNER] 🛑 Killing existing dev server',
          'background: #f44336; color: white; font-size: 12px; padding: 2px 6px;',
        );
      }

      try {
        currentDevServerProcess.kill();
        currentDevServerProcess = null;
        isDevServerRunning.set(false);

        // Small delay to let the process terminate
        await new Promise((resolve) => setTimeout(resolve, 500));
        logger.info('Dev server killed successfully');
      } catch (error) {
        logger.warn('Error killing dev server:', error);
      }
    }
  }

  /**
   * Wait for the dev server to be ready by monitoring its output
   * Detects common "ready" patterns from various dev servers (Vite, Next.js, etc.)
   */
  async #waitForDevServerReady(process: WebContainerProcess): Promise<void> {
    const startTime = Date.now();
    let serverReady = false;

    // Patterns that indicate the server is ready
    const readyPatterns = [
      /ready in/i, // Vite: "ready in 500ms"
      /Local:\s+http/i, // Vite/Next: "Local: http://localhost:3000"
      /started server on/i, // Next.js: "started server on"
      /listening on/i, // Generic: "listening on port"
      /server running at/i, // Generic
      /compiled successfully/i, // Webpack
      /compiled client and server/i, // Next.js
      /ready on/i, // Next.js 14+
      /✓ Ready/i, // Various
      /Server is running/i, // Generic
      /Development server/i, // Create React App
      /localhost:\d+/i, // Any localhost URL
    ];

    logger.debug('Waiting for dev server to be ready...');

    return new Promise((resolve) => {
      let outputBuffer = '';
      let resolved = false;

      const checkReady = () => {
        if (resolved) {
          return;
        }

        // Check if any ready pattern matches
        for (const pattern of readyPatterns) {
          if (pattern.test(outputBuffer)) {
            serverReady = true;
            resolved = true;

            const elapsed = Date.now() - startTime;
            logger.info(`Dev server ready detected in ${elapsed}ms`);

            if (import.meta.env.DEV) {
              console.log(
                '%c[ACTION RUNNER] ✓ Dev server ready',
                'background: #4CAF50; color: white; font-size: 12px; padding: 2px 6px;',
                `(${elapsed}ms)`,
              );
            }

            resolve();

            return;
          }
        }

        // Timeout check
        if (Date.now() - startTime > DEV_SERVER_READY_TIMEOUT_MS) {
          resolved = true;
          logger.warn(`Dev server ready timeout after ${DEV_SERVER_READY_TIMEOUT_MS}ms, proceeding anyway`);
          resolve();

          return;
        }
      };

      /*
       * Create a reader from the output stream to monitor it
       * We need to tee the stream since it's already being consumed
       */
      const reader = process.output.getReader();

      const readOutput = async () => {
        try {
          while (!resolved) {
            const { done, value } = await reader.read();

            if (done) {
              break;
            }

            if (value) {
              outputBuffer += value;

              if (import.meta.env.DEV) {
                console.log('%c[DEV SERVER]', 'background: #2196F3; color: white; padding: 2px 6px;', value);
              }

              logger.debug('[Dev server output]', value);
              checkReady();
            }
          }
        } catch (error) {
          // Stream might be cancelled, that's ok
          logger.debug('Output stream ended:', error);
        }

        // If we haven't resolved yet, resolve now
        if (!resolved) {
          resolved = true;
          resolve();
        }
      };

      readOutput();

      // Also set a fallback timeout in case stream reading stalls
      setTimeout(() => {
        if (!resolved) {
          resolved = true;
          logger.warn('Dev server ready fallback timeout, proceeding');
          resolve();
        }
      }, DEV_SERVER_READY_TIMEOUT_MS + 1000);
    });
  }

  // Restart the dev server (kill and run again)
  async restartDevServer(): Promise<void> {
    await this.killDevServer();

    const webcontainer = await this.#webcontainer;

    // Use pnpm for faster installation (20% faster than npm)
    logger.info('Restarting dev server with pnpm run dev...');

    if (import.meta.env.DEV) {
      console.log(
        '%c[ACTION RUNNER] 🔄 Restarting dev server (pnpm)',
        'background: #4CAF50; color: white; font-size: 12px; padding: 2px 6px;',
      );
    }

    const process = await webcontainer.spawn('jsh', ['-c', 'pnpm run dev'], {
      env: { npm_config_yes: true },
    });

    currentDevServerProcess = process;
    isDevServerRunning.set(true);

    process.output.pipeTo(
      new WritableStream({
        write(data) {
          if (import.meta.env.DEV) {
            console.log('%c[DEV SERVER]', 'background: #2196F3; color: white; padding: 2px 6px;', data);
          }

          logger.debug('[Dev server output]', data);
        },
      }),
    );

    // Don't await exit - let it run in background
    process.exit
      .then((code) => {
        logger.info(`Dev server exited with code ${code}`);
        currentDevServerProcess = null;
        isDevServerRunning.set(false);
      })
      .catch((error) => {
        logger.error('Dev server process error:', error);
        currentDevServerProcess = null;
        isDevServerRunning.set(false);
      });
  }

  async #runShellAction(action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    // Valider la commande avant exécution (protection injection)
    const validation = validateShellCommand(action.content);

    if (!validation.valid) {
      logger.error(`Commande shell bloquée: ${validation.reason}`);
      throw new ExecutionError(`Commande non autorisée: ${validation.reason}`);
    }

    if (import.meta.env.DEV) {
      console.log(
        '%c[ACTION RUNNER] 🚀 Starting shell action:',
        'background: #FF9800; color: white; font-size: 14px; padding: 4px 8px;',
        action.content,
      );
    }

    // Check if this is an install command - use optimized installer with caching
    const isInstallCmd = this.#isInstallCommand(action.content);

    if (isInstallCmd) {
      isShellRunning.set(true);

      try {
        const result = await this.#runOptimizedInstall();

        if (!result.success) {
          throw new ExecutionError('Installation failed');
        }

        return; // Install completed successfully
      } finally {
        isShellRunning.set(false);
      }
    }

    const isDevServer = this.#isDevServerCommand(action.content);

    // If this is a dev server command, kill any existing dev server first
    if (isDevServer && currentDevServerProcess) {
      await this.killDevServer();
    }

    // Signal that shell is running (for UI feedback)
    isShellRunning.set(true);

    try {
      const webcontainer = await this.#webcontainer;

      if (import.meta.env.DEV) {
        console.log(
          '%c[ACTION RUNNER] WebContainer ready, spawning process...',
          'background: #2196F3; color: white; font-size: 12px; padding: 2px 6px;',
        );
      }

      const process = await webcontainer.spawn('jsh', ['-c', action.content], {
        env: { npm_config_yes: true },
      });

      action.abortSignal.addEventListener('abort', () => {
        process.kill();
      });

      // If this is a dev server, track it and don't wait for exit
      if (isDevServer) {
        currentDevServerProcess = process;
        isDevServerRunning.set(true);

        /*
         * Note: We don't pipeTo here because #waitForDevServerReady will consume the stream
         * to detect when the server is ready. The output is logged there.
         */

        // Don't await exit for dev server - let it run
        process.exit
          .then((exitCode) => {
            if (import.meta.env.DEV) {
              console.log(
                '%c[ACTION RUNNER] Dev server terminated with code:',
                'background: #9C27B0; color: white; font-size: 12px; padding: 2px 6px;',
                exitCode,
              );
            }

            logger.debug(`Dev server terminated with code ${exitCode}`);
            currentDevServerProcess = null;
            isDevServerRunning.set(false);
          })
          .catch((error) => {
            logger.warn('Dev server exit promise failed:', error);
            currentDevServerProcess = null;
            isDevServerRunning.set(false);
          });

        /*
         * Wait for server to be ready with smart detection
         * Instead of fixed 1s wait, we check for common "ready" patterns in output
         */
        await this.#waitForDevServerReady(process);
        logger.info('Dev server started and ready');
      } else {
        // For non-dev-server commands, wait for completion with timeout
        process.output.pipeTo(
          new WritableStream({
            write(data) {
              if (import.meta.env.DEV) {
                console.log('%c[SHELL OUTPUT]', 'background: #4CAF50; color: white; padding: 2px 6px;', data);
              }

              logger.debug('[Shell output]', data);
            },
          }),
        );

        // Timeout de 5 minutes pour les commandes shell
        const exitCode = await raceWithTimeout(
          process.exit,
          EXECUTION_LIMITS.shell.timeoutMs,
          EXECUTION_LIMITS.shell.message,
        ).catch((error) => {
          logger.warn('Shell command timed out, killing process');
          process.kill();
          throw error;
        });

        if (import.meta.env.DEV) {
          console.log(
            '%c[ACTION RUNNER] Process terminated with code:',
            'background: #9C27B0; color: white; font-size: 12px; padding: 2px 6px;',
            exitCode,
          );
        }

        logger.debug(`Process terminated with code ${exitCode}`);
      }
    } finally {
      isShellRunning.set(false);
    }
  }

  async #runFileAction(action: ActionState) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    // Valider le chemin pour prévenir le path traversal
    const pathValidation = validateFilePath(action.filePath);

    if (!pathValidation.valid) {
      logger.error(`Chemin de fichier rejeté: ${action.filePath} - ${pathValidation.reason}`);
      throw new ExecutionError(`Chemin de fichier non autorisé: ${pathValidation.reason}`);
    }

    const webcontainer = await this.#webcontainer;

    let folder = nodePath.dirname(action.filePath);

    // remove trailing slashes
    folder = folder.replace(/\/+$/g, '');

    if (folder !== '.') {
      try {
        await webcontainer.fs.mkdir(folder, { recursive: true });
        logger.debug('Created folder', folder);
      } catch (error) {
        logger.error(`Échec de la création du dossier ${folder}:`, error);
        throw new Error(`Impossible de créer le dossier: ${folder}`);
      }
    }

    try {
      await webcontainer.fs.writeFile(action.filePath, action.content);
      logger.debug(`File written ${action.filePath}`);
    } catch (error) {
      logger.error(`Échec de l'écriture du fichier ${action.filePath}:`, error);
      throw new Error(`Impossible d'écrire le fichier: ${action.filePath}`);
    }
  }

  async #runGitAction(action: ActionState) {
    if (action.type !== 'git') {
      unreachable('Expected git action');
    }

    const gitAction = action as GitAction & ActionState;
    const dir = '/home/project';

    logger.debug(`Running git ${gitAction.operation}`);

    // create onAuth callback using token from action or OAuth
    const token = gitAction.token || getAccessToken('github');
    const onAuth = token
      ? async () => ({
          username: 'oauth2',
          password: token,
        })
      : undefined;

    try {
      switch (gitAction.operation) {
        case 'init': {
          await gitOps.init(dir);
          logger.debug('Git repository initialized');
          break;
        }
        case 'clone': {
          if (!gitAction.url) {
            throw new Error('URL is required for clone operation');
          }

          const webcontainer = await this.#webcontainer;

          await gitOps.clone({
            dir,
            url: gitAction.url,
            depth: 1,
            onAuth,
          });
          logger.debug(`Cloned ${gitAction.url}`);

          // sync cloned files to WebContainer so they appear in editor
          const syncStats = await syncToWebContainer(webcontainer, dir);
          logger.debug(`Synced ${syncStats.files} files to WebContainer`);
          break;
        }
        case 'add': {
          const filepath = gitAction.filepath || '.';
          await gitOps.add(dir, filepath);
          logger.debug(`Added ${filepath} to staging`);
          break;
        }
        case 'commit': {
          const message = gitAction.message || 'Commit via BAVINI';
          await gitOps.commit({ dir, message });
          logger.debug(`Committed with message: ${message}`);
          break;
        }
        case 'push': {
          const remote = gitAction.remote || 'origin';
          const branch = gitAction.branch || 'main';
          await gitOps.push({ dir, remote, branch, onAuth });
          logger.debug(`Pushed to ${remote}/${branch}`);
          break;
        }
        case 'pull': {
          const remote = gitAction.remote || 'origin';
          const branch = gitAction.branch || 'main';

          const webcontainer = await this.#webcontainer;

          await gitOps.pull({ dir, remote, branch, onAuth });
          logger.debug(`Pulled from ${remote}/${branch}`);

          // sync pulled files to WebContainer so editor shows latest
          const syncStats = await syncToWebContainer(webcontainer, dir);
          logger.debug(`Synced ${syncStats.files} files to WebContainer`);
          break;
        }
        case 'status': {
          const statusResult = await gitOps.status(dir);
          logger.debug('Git status:', statusResult);
          break;
        }
        default: {
          logger.warn(`Unknown git operation: ${gitAction.operation}`);
        }
      }
    } catch (error) {
      logger.error(`Git ${gitAction.operation} failed:`, error);
      throw error;
    }
  }

  async #runPythonAction(action: ActionState) {
    if (action.type !== 'python') {
      unreachable('Expected python action');
    }

    const pythonAction = action as PythonAction & ActionState;
    const codePreview = pythonAction.content.substring(0, 100);

    logger.debug('Initializing Pyodide for Python execution');

    try {
      // initialize Pyodide (lazy load)
      await initPyodide();

      // install packages if specified
      if (pythonAction.packages && pythonAction.packages.length > 0) {
        logger.debug(`Installing packages: ${pythonAction.packages.join(', ')}`);

        try {
          await installPackages(pythonAction.packages);
        } catch (pkgError) {
          const originalError = pkgError instanceof Error ? pkgError.message : String(pkgError);
          throw new PythonExecutionError(
            `Échec d'installation des packages: ${pythonAction.packages.join(', ')}`,
            originalError,
            { packages: pythonAction.packages },
          );
        }
      }

      // run the Python code with timeout (30 seconds)
      logger.debug('Executing Python code');

      const result = await runPythonWithTimeout(pythonAction.content);

      if (result.stdout) {
        logger.debug('[Python stdout]', result.stdout);
      }

      if (result.stderr) {
        logger.warn('[Python stderr]', result.stderr);

        // Si stderr contient une erreur Python, on peut la signaler
        if (result.stderr.includes('Error') || result.stderr.includes('Exception')) {
          logger.warn('Python execution produced errors in stderr');
        }
      }

      if (result.result !== null && result.result !== undefined) {
        logger.debug('Python result:', result.result);
      }
    } catch (error) {
      // Enrichir l'erreur avec le contexte
      if (error instanceof PythonExecutionError) {
        throw error;
      }

      // Vérifier si c'est un timeout
      if (error instanceof TimeoutError) {
        throw new PythonExecutionError(
          `Timeout: l'exécution Python a dépassé ${EXECUTION_LIMITS.python.timeoutMs / 1000}s`,
          'TimeoutError',
          { codePreview, timeout: EXECUTION_LIMITS.python.timeoutMs },
        );
      }

      logger.error('Python execution failed:', error);

      const pythonError = error instanceof Error ? error.message : 'Erreur Python inconnue';
      throw new PythonExecutionError(pythonError, pythonError, { codePreview });
    }
  }

  async #runGitHubAction(action: ActionState) {
    if (action.type !== 'github') {
      unreachable('Expected github action');
    }

    const githubAction = action as GitHubAction & ActionState;
    const token = getAccessToken('github');

    if (!token) {
      throw new Error('Token GitHub requis. Connectez votre compte GitHub dans les paramètres.');
    }

    logger.debug(`Running GitHub ${githubAction.operation}`);

    try {
      switch (githubAction.operation) {
        case 'list-repos': {
          const result = await githubApi.listUserRepos(token);

          if (!result.success) {
            throw new Error(result.error);
          }

          logger.debug(`Listed ${result.data?.length || 0} repositories`);
          logger.trace('[GitHub] Repositories:', result.data);
          break;
        }
        case 'get-repo': {
          if (!githubAction.owner || !githubAction.repo) {
            throw new Error('Owner et repo requis pour get-repo');
          }

          const result = await githubApi.getRepo(token, githubAction.owner, githubAction.repo);

          if (!result.success) {
            throw new Error(result.error);
          }

          logger.debug(`Got repo: ${result.data?.full_name}`);
          logger.trace('[GitHub] Repository:', result.data);
          break;
        }
        case 'list-issues': {
          if (!githubAction.owner || !githubAction.repo) {
            throw new Error('Owner et repo requis pour list-issues');
          }

          const result = await githubApi.listIssues(token, githubAction.owner, githubAction.repo, {
            state: githubAction.state,
          });

          if (!result.success) {
            throw new Error(result.error);
          }

          logger.debug(`Listed ${result.data?.length || 0} issues`);
          logger.trace('[GitHub] Issues:', result.data);
          break;
        }
        case 'create-issue': {
          if (!githubAction.owner || !githubAction.repo || !githubAction.title) {
            throw new Error('Owner, repo et title requis pour create-issue');
          }

          const result = await githubApi.createIssue(token, githubAction.owner, githubAction.repo, {
            title: githubAction.title,
            body: githubAction.body,
            labels: githubAction.labels,
          });

          if (!result.success) {
            throw new Error(result.error);
          }

          logger.debug(`Created issue #${result.data?.number}: ${result.data?.title}`);
          logger.trace('[GitHub] Created issue:', result.data);
          break;
        }
        case 'list-prs': {
          if (!githubAction.owner || !githubAction.repo) {
            throw new Error('Owner et repo requis pour list-prs');
          }

          const result = await githubApi.listPullRequests(token, githubAction.owner, githubAction.repo, {
            state: githubAction.state,
          });

          if (!result.success) {
            throw new Error(result.error);
          }

          logger.debug(`Listed ${result.data?.length || 0} pull requests`);
          logger.trace('[GitHub] Pull Requests:', result.data);
          break;
        }
        case 'create-pr': {
          if (
            !githubAction.owner ||
            !githubAction.repo ||
            !githubAction.title ||
            !githubAction.head ||
            !githubAction.base
          ) {
            throw new Error('Owner, repo, title, head et base requis pour create-pr');
          }

          const result = await githubApi.createPullRequest(token, githubAction.owner, githubAction.repo, {
            title: githubAction.title,
            body: githubAction.body,
            head: githubAction.head,
            base: githubAction.base,
          });

          if (!result.success) {
            throw new Error(result.error);
          }

          logger.debug(`Created PR #${result.data?.number}: ${result.data?.title}`);
          logger.trace('[GitHub] Created PR:', result.data);
          break;
        }
        default: {
          logger.warn(`Unknown GitHub operation: ${githubAction.operation}`);
        }
      }
    } catch (error) {
      logger.error(`GitHub ${githubAction.operation} failed:`, error);
      throw error;
    }
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();

    this.actions.setKey(id, { ...actions[id], ...newState } as ActionState);
  }
}
