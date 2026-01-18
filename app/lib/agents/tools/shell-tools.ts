/**
 * Outils shell et npm pour les agents BAVINI
 * Ces outils permettent d'exécuter des commandes dans WebContainer
 */

import type { ToolDefinition, ToolExecutionResult } from '../types';

/*
 * ============================================================================
 * DÉFINITIONS DES OUTILS
 * ============================================================================
 */

/**
 * Outil pour exécuter une commande npm
 */
export const NpmCommandTool: ToolDefinition = {
  name: 'npm_command',
  description: 'Exécuter une commande npm/pnpm. ' + 'Exemples: install, run dev, run build, run test.',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Commande npm à exécuter (ex: "install", "run dev", "run build")',
      },
      args: {
        type: 'array',
        description: 'Arguments additionnels',
        items: { type: 'string' },
      },
      cwd: {
        type: 'string',
        description: 'Dossier de travail (défaut: racine du projet)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout en millisecondes (défaut: 120000)',
      },
    },
    required: ['command'],
  },
};

/**
 * Outil pour exécuter une commande shell
 */
export const ShellCommandTool: ToolDefinition = {
  name: 'shell_command',
  description: 'Exécuter une commande shell. ' + 'ATTENTION: Commandes dangereuses interdites (rm -rf, etc.).',
  inputSchema: {
    type: 'object',
    properties: {
      command: {
        type: 'string',
        description: 'Commande shell à exécuter',
      },
      cwd: {
        type: 'string',
        description: 'Dossier de travail (défaut: racine du projet)',
      },
      timeout: {
        type: 'number',
        description: 'Timeout en millisecondes (défaut: 30000)',
      },
    },
    required: ['command'],
  },
};

/**
 * Outil pour démarrer un serveur de développement
 */
export const StartDevServerTool: ToolDefinition = {
  name: 'start_dev_server',
  description: 'Démarrer le serveur de développement (npm run dev). ' + 'Le serveur reste actif en arrière-plan.',
  inputSchema: {
    type: 'object',
    properties: {
      port: {
        type: 'number',
        description: 'Port à utiliser (défaut: 5173 ou 3000)',
      },
      script: {
        type: 'string',
        description: 'Script npm à lancer (défaut: "dev")',
      },
    },
    required: [],
  },
};

/**
 * Outil pour arrêter un serveur
 */
export const StopServerTool: ToolDefinition = {
  name: 'stop_server',
  description: "Arrêter un serveur en cours d'exécution.",
  inputSchema: {
    type: 'object',
    properties: {
      processId: {
        type: 'string',
        description: 'ID du processus à arrêter',
      },
    },
    required: [],
  },
};

/**
 * Outil pour installer des dépendances
 */
export const InstallDependenciesTool: ToolDefinition = {
  name: 'install_dependencies',
  description: 'Installer une ou plusieurs dépendances npm. ' + 'Peut installer en dev avec --save-dev.',
  inputSchema: {
    type: 'object',
    properties: {
      packages: {
        type: 'array',
        description: 'Liste des packages à installer',
        items: { type: 'string' },
      },
      dev: {
        type: 'boolean',
        description: 'Installer en devDependencies (défaut: false)',
      },
    },
    required: ['packages'],
  },
};

/**
 * Outil pour obtenir le statut des processus
 */
export const GetProcessStatusTool: ToolDefinition = {
  name: 'get_process_status',
  description: "Obtenir le statut des processus en cours d'exécution.",
  inputSchema: {
    type: 'object',
    properties: {},
    required: [],
  },
};

/*
 * ============================================================================
 * LISTE DES OUTILS SHELL
 * ============================================================================
 */

export const SHELL_TOOLS: ToolDefinition[] = [
  NpmCommandTool,
  ShellCommandTool,
  StartDevServerTool,
  StopServerTool,
  InstallDependenciesTool,
  GetProcessStatusTool,
];

/*
 * ============================================================================
 * INTERFACE SHELL
 * ============================================================================
 */

/**
 * Résultat d'une commande shell
 */
export interface ShellResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Processus en cours
 */
export interface RunningProcess {
  id: string;
  command: string;
  startedAt: Date;
  port?: number;
}

/**
 * Interface pour le shell (abstraction de WebContainer)
 */
export interface ShellInterface {
  /** Exécuter une commande et attendre le résultat */
  exec(
    command: string,
    args?: string[],
    options?: {
      cwd?: string;
      timeout?: number;
      env?: Record<string, string>;
    },
  ): Promise<ShellResult>;

  /** Démarrer un processus en arrière-plan */
  spawn(
    command: string,
    args?: string[],
    options?: {
      cwd?: string;
      env?: Record<string, string>;
    },
  ): Promise<{
    processId: string;
    port?: number;
  }>;

  /** Arrêter un processus */
  kill(processId: string): Promise<boolean>;

  /** Obtenir les processus en cours */
  getRunningProcesses(): RunningProcess[];
}

/*
 * ============================================================================
 * SÉCURITÉ DES COMMANDES - WHITELIST ET VALIDATION
 * ============================================================================
 */

/**
 * Configuration de sécurité des commandes shell
 */
export interface ShellSecurityConfig {
  /** Mode de sécurité: 'strict' (whitelist only) ou 'permissive' (blacklist + validation) */
  mode: 'strict' | 'permissive';

  /** Programmes additionnels autorisés (en plus de la whitelist par défaut) */
  additionalAllowedPrograms?: string[];

  /** Patterns de commandes additionnels interdits */
  additionalForbiddenPatterns?: string[];

  /** Autoriser les pipes (|) - défaut: false en mode strict */
  allowPipes?: boolean;

  /** Autoriser les redirections (>, >>, <) - défaut: false en mode strict */
  allowRedirections?: boolean;

  /** Autoriser l'exécution de commandes chainées (&&, ||, ;) - défaut: false en mode strict */
  allowChaining?: boolean;
}

/**
 * Configuration par défaut: mode strict
 */
const DEFAULT_SECURITY_CONFIG: ShellSecurityConfig = {
  mode: 'strict',
  allowPipes: false,
  allowRedirections: false,
  allowChaining: false,
};

/**
 * Liste blanche des programmes autorisés (SÉCURITÉ CRITIQUE)
 * Ces programmes sont considérés sûrs pour l'exécution dans un environnement de développement
 */
const WHITELISTED_PROGRAMS: Set<string> = new Set([
  // Package managers
  'npm',
  'pnpm',
  'yarn',
  'npx',
  'bun',

  // Node.js
  'node',
  'tsx',
  'ts-node',

  // Build tools
  'vite',
  'next',
  'webpack',
  'rollup',
  'esbuild',
  'turbo',
  'tsc',

  // Linters & formatters
  'eslint',
  'prettier',
  'biome',

  // Test frameworks
  'vitest',
  'jest',
  'playwright',
  'cypress',

  // Git
  'git',

  // File operations (safe subset)
  'ls',
  'cat',
  'head',
  'tail',
  'find',
  'grep',
  'wc',
  'diff',
  'pwd',
  'echo',
  'mkdir',
  'cp',
  'mv',
  'touch',

  // Info commands
  'which',
  'whoami',
  'env',
  'printenv',
  'uname',

  // Process
  'ps',
  'kill',
  'pkill',

  // Network (safe)
  'ping',
  'curl',
  'wget',
]);

/**
 * Liste des programmes explicitement interdits (DANGEREUX)
 */
const BLACKLISTED_PROGRAMS: Set<string> = new Set([
  'rm', // Peut supprimer des fichiers critiques - utiliser des outils dédiés
  'rmdir',
  'chmod',
  'chown',
  'chgrp',
  'su',
  'sudo',
  'passwd',
  'useradd',
  'userdel',
  'dd',
  'mkfs',
  'fdisk',
  'mount',
  'umount',
  'shutdown',
  'reboot',
  'init',
  'systemctl',
  'service',
  'eval',
  'exec',
  'source',
  '.', // Source command
]);

/**
 * Patterns dangereux dans les commandes (regex)
 */
const DANGEROUS_PATTERNS: RegExp[] = [
  /rm\s+(-[rf]+\s+)*[\/~]/, // rm sur des répertoires sensibles
  />\s*\/dev\//, // Écriture vers devices
  /:\s*\(\s*\)\s*\{.*\}/, // Fork bomb pattern
  /\$\(.*\)/, // Command substitution (peut cacher des commandes)
  /`.*`/, // Backtick command substitution
  /;\s*rm\s/, // rm caché après un ;
  /\|\s*sh/, // Pipe vers sh
  /\|\s*bash/, // Pipe vers bash
  /\|\s*zsh/, // Pipe vers zsh
  /&&\s*rm\s/, // rm après &&
  /\|\|\s*rm\s/, // rm après ||
  />\s*\/etc\//, // Écriture dans /etc
  />\s*\/usr\//, // Écriture dans /usr
  />\s*\/var\//, // Écriture dans /var
  />\s*\/bin\//, // Écriture dans /bin
  />\s*\/sbin\//, // Écriture dans /sbin
];

/**
 * Taille maximale de l'output shell (512KB)
 * Prévient les crashes mémoire (npm install peut générer 10MB+)
 */
const MAX_OUTPUT_SIZE = 512 * 1024;

/**
 * Tronquer l'output si nécessaire
 */
function truncateOutput(output: string | null): string | null {
  if (!output) {
    return output;
  }
  if (output.length <= MAX_OUTPUT_SIZE) {
    return output;
  }
  return output.substring(0, MAX_OUTPUT_SIZE) + '\n\n[...output truncated at 512KB]';
}

/**
 * Extraire le programme principal d'une commande
 */
function extractProgram(command: string): string {
  const trimmed = command.trim();

  // Gestion des variables d'environnement préfixées (ex: NODE_ENV=prod node)
  const parts = trimmed.split(/\s+/);
  for (const part of parts) {
    if (!part.includes('=')) {
      return part.toLowerCase();
    }
  }
  return parts[0]?.toLowerCase() || '';
}

/**
 * Vérifier si une commande contient des opérateurs dangereux
 */
function containsDangerousOperators(command: string, config: ShellSecurityConfig): { safe: boolean; reason?: string } {
  // Vérifier les pipes
  if (!config.allowPipes && command.includes('|')) {
    return { safe: false, reason: 'Pipes (|) are not allowed in strict mode' };
  }

  // Vérifier les redirections
  if (!config.allowRedirections && /[<>]/.test(command)) {
    return { safe: false, reason: 'Redirections (<, >, >>) are not allowed in strict mode' };
  }

  // Vérifier le chaînage de commandes
  if (!config.allowChaining && /[;&]|\|\|/.test(command)) {
    return { safe: false, reason: 'Command chaining (;, &&, ||) is not allowed in strict mode' };
  }

  return { safe: true };
}

/**
 * Résultat de validation de commande
 */
export interface CommandValidationResult {
  safe: boolean;
  reason?: string;
  program?: string;
  suggestion?: string;
}

/**
 * Validateur de commandes shell (POINT D'ENTRÉE PRINCIPAL)
 */
export function validateCommand(
  command: string,
  config: ShellSecurityConfig = DEFAULT_SECURITY_CONFIG,
): CommandValidationResult {
  // 1. Extraire le programme
  const program = extractProgram(command);

  if (!program) {
    return { safe: false, reason: 'Empty command', program };
  }

  // 2. Vérifier la blacklist (toujours appliquée)
  if (BLACKLISTED_PROGRAMS.has(program)) {
    return {
      safe: false,
      reason: `Program '${program}' is explicitly forbidden for security reasons`,
      program,
      suggestion: program === 'rm' ? 'Use the delete_file tool instead for safe file deletion' : undefined,
    };
  }

  // 3. Vérifier les patterns dangereux (toujours appliqués)
  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(command)) {
      return {
        safe: false,
        reason: `Command contains dangerous pattern: ${pattern.toString()}`,
        program,
      };
    }
  }

  // 4. Vérifier les opérateurs dangereux selon la config
  const operatorCheck = containsDangerousOperators(command, config);
  if (!operatorCheck.safe) {
    return { ...operatorCheck, program };
  }

  // 5. En mode strict, vérifier la whitelist
  if (config.mode === 'strict') {
    const allowedPrograms = new Set([...WHITELISTED_PROGRAMS, ...(config.additionalAllowedPrograms || [])]);

    if (!allowedPrograms.has(program)) {
      return {
        safe: false,
        reason: `Program '${program}' is not in the whitelist. Allowed programs: ${Array.from(WHITELISTED_PROGRAMS).slice(0, 10).join(', ')}...`,
        program,
        suggestion: `Add '${program}' to additionalAllowedPrograms if this is a safe program`,
      };
    }
  }

  // 6. Vérifier les patterns interdits additionnels
  if (config.additionalForbiddenPatterns) {
    for (const pattern of config.additionalForbiddenPatterns) {
      const regex = new RegExp(pattern, 'i');
      if (regex.test(command)) {
        return {
          safe: false,
          reason: `Command matches forbidden pattern: ${pattern}`,
          program,
        };
      }
    }
  }

  return { safe: true, program };
}

/**
 * Configuration de sécurité par défaut (fallback)
 * IMPORTANT: Cette config globale est DEPRECATED, utiliser les configs par agent
 */
let globalSecurityConfig: ShellSecurityConfig = { ...DEFAULT_SECURITY_CONFIG };

/**
 * Configurations de sécurité isolées par agent
 * Chaque agent a sa propre configuration pour éviter les fuites de sécurité
 */
const agentSecurityConfigs: Map<string, ShellSecurityConfig> = new Map();

/**
 * Définir la configuration de sécurité globale
 * @deprecated Utiliser setSecurityConfigForAgent() à la place
 */
export function setShellSecurityConfig(config: Partial<ShellSecurityConfig>): void {
  console.warn('[SECURITY] setShellSecurityConfig() is deprecated. Use setSecurityConfigForAgent() for proper isolation.');
  globalSecurityConfig = { ...DEFAULT_SECURITY_CONFIG, ...config };
}

/**
 * Obtenir la configuration de sécurité globale
 * @deprecated Utiliser getSecurityConfigForAgent() à la place
 */
export function getShellSecurityConfig(): ShellSecurityConfig {
  return { ...globalSecurityConfig };
}

/**
 * Définir la configuration de sécurité pour un agent spécifique
 * Assure l'isolation de la configuration entre les agents
 *
 * @param agentId - Identifiant unique de l'agent
 * @param config - Configuration de sécurité partielle à appliquer
 */
export function setSecurityConfigForAgent(agentId: string, config: Partial<ShellSecurityConfig>): void {
  const currentConfig = agentSecurityConfigs.get(agentId) || { ...DEFAULT_SECURITY_CONFIG };
  const newConfig = { ...currentConfig, ...config };
  agentSecurityConfigs.set(agentId, newConfig);
}

/**
 * Obtenir la configuration de sécurité pour un agent spécifique
 * Retourne la config par défaut si l'agent n'a pas de config dédiée
 *
 * @param agentId - Identifiant unique de l'agent
 * @returns Configuration de sécurité (copie défensive)
 */
export function getSecurityConfigForAgent(agentId: string): ShellSecurityConfig {
  const config = agentSecurityConfigs.get(agentId);
  if (config) {
    return { ...config };
  }
  // Fallback vers la config par défaut (pas la globale pour éviter les fuites)
  return { ...DEFAULT_SECURITY_CONFIG };
}

/**
 * Supprimer la configuration d'un agent (nettoyage)
 * Appelé lors de la destruction de l'agent
 *
 * @param agentId - Identifiant unique de l'agent
 */
export function clearSecurityConfigForAgent(agentId: string): boolean {
  return agentSecurityConfigs.delete(agentId);
}

/**
 * Obtenir la liste des agents ayant une configuration personnalisée
 */
export function getAgentsWithCustomConfig(): string[] {
  return Array.from(agentSecurityConfigs.keys());
}

/**
 * Ajouter un programme à la whitelist globale
 */
export function addToWhitelist(program: string): void {
  WHITELISTED_PROGRAMS.add(program.toLowerCase());
}

/**
 * Retirer un programme de la whitelist globale
 */
export function removeFromWhitelist(program: string): boolean {
  return WHITELISTED_PROGRAMS.delete(program.toLowerCase());
}

/**
 * Vérifier si un programme est dans la whitelist
 */
export function isWhitelisted(program: string): boolean {
  return WHITELISTED_PROGRAMS.has(program.toLowerCase());
}

/**
 * Obtenir la liste des programmes autorisés
 */
export function getWhitelistedPrograms(): string[] {
  return Array.from(WHITELISTED_PROGRAMS).sort();
}

/**
 * Fonction de compatibilité ascendante (pour le code existant)
 * @deprecated Utiliser validateCommand() à la place
 */
function isCommandSafe(command: string): { safe: boolean; reason?: string } {
  return validateCommand(command, globalSecurityConfig);
}

/*
 * ============================================================================
 * HANDLERS D'EXÉCUTION
 * ============================================================================
 */

/**
 * Options pour créer les handlers shell
 */
export interface ShellToolHandlersOptions {
  /** L'interface shell à utiliser */
  shell: ShellInterface;

  /** ID de l'agent pour la configuration de sécurité isolée */
  agentId?: string;

  /** Configuration de sécurité override (optionnelle, sinon utilise la config de l'agent) */
  securityConfig?: ShellSecurityConfig;
}

/**
 * Créer les handlers pour les outils shell
 *
 * @param shellOrOptions - Interface shell ou options complètes
 * @returns Handlers pour les outils shell
 */
export function createShellToolHandlers(
  shellOrOptions: ShellInterface | ShellToolHandlersOptions,
): Record<string, (input: Record<string, unknown>) => Promise<ToolExecutionResult>> {
  // Support de l'ancienne signature (ShellInterface seul) pour la rétrocompatibilité
  let shell: ShellInterface;
  let agentId: string | undefined;
  let overrideConfig: ShellSecurityConfig | undefined;

  if ('exec' in shellOrOptions && typeof shellOrOptions.exec === 'function') {
    // Ancienne signature: ShellInterface directement
    shell = shellOrOptions;
  } else {
    // Nouvelle signature: ShellToolHandlersOptions
    const options = shellOrOptions as ShellToolHandlersOptions;
    shell = options.shell;
    agentId = options.agentId;
    overrideConfig = options.securityConfig;
  }

  /**
   * Obtenir la configuration de sécurité à utiliser
   * Priorité: override > config agent > config par défaut
   */
  const getEffectiveSecurityConfig = (): ShellSecurityConfig => {
    if (overrideConfig) {
      return overrideConfig;
    }
    if (agentId) {
      return getSecurityConfigForAgent(agentId);
    }
    // Fallback vers la config globale (deprecated mais nécessaire pour la rétrocompatibilité)
    return globalSecurityConfig;
  };

  return {
    /**
     * Exécuter une commande npm
     */
    npm_command: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const command = input.command as string;
      const args = (input.args as string[]) || [];
      const cwd = input.cwd as string | undefined;
      const timeout = (input.timeout as number) || 120000;

      try {
        // Déterminer le gestionnaire de packages
        const packageManager = 'pnpm'; // On utilise pnpm par défaut dans BAVINI

        const result = await shell.exec(packageManager, [command, ...args], {
          cwd,
          timeout,
        });

        if (result.exitCode !== 0) {
          return {
            success: false,
            output: truncateOutput(result.stdout),
            error: truncateOutput(result.stderr) || `Command failed with exit code ${result.exitCode}`,
          };
        }

        return {
          success: true,
          output: truncateOutput(result.stdout) || 'Command completed successfully',
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `npm command failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Exécuter une commande shell
     */
    shell_command: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const command = input.command as string;
      const cwd = input.cwd as string | undefined;
      const timeout = (input.timeout as number) || 30000;

      // Vérifier la sécurité de la commande avec la configuration isolée de l'agent
      const securityConfig = getEffectiveSecurityConfig();
      const validation = validateCommand(command, securityConfig);

      if (!validation.safe) {
        let errorMessage = `Command rejected for safety: ${validation.reason}`;
        if (validation.suggestion) {
          errorMessage += `\n\nSuggestion: ${validation.suggestion}`;
        }
        if (validation.program) {
          errorMessage += `\n\nProgram detected: '${validation.program}'`;
        }

        return {
          success: false,
          output: null,
          error: errorMessage,
        };
      }

      try {
        // Parser la commande en programme + arguments
        const parts = command.split(/\s+/);
        const program = parts[0];
        const args = parts.slice(1);

        const result = await shell.exec(program, args, { cwd, timeout });

        if (result.exitCode !== 0) {
          return {
            success: false,
            output: truncateOutput(result.stdout),
            error: truncateOutput(result.stderr) || `Command failed with exit code ${result.exitCode}`,
          };
        }

        return {
          success: true,
          output: truncateOutput(result.stdout) || 'Command completed successfully',
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Shell command failed: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Démarrer un serveur de développement
     */
    start_dev_server: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const script = (input.script as string) || 'dev';
      const port = input.port as number | undefined;

      try {
        const env: Record<string, string> = {};

        if (port) {
          env.PORT = String(port);
        }

        const result = await shell.spawn('pnpm', ['run', script], { env });

        return {
          success: true,
          output: JSON.stringify({
            message: `Dev server started`,
            processId: result.processId,
            port: result.port || port || 5173,
          }),
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to start dev server: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Arrêter un serveur
     */
    stop_server: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const processId = input.processId as string | undefined;

      try {
        if (processId) {
          const killed = await shell.kill(processId);

          if (!killed) {
            return {
              success: false,
              output: null,
              error: `Process ${processId} not found or already stopped`,
            };
          }

          return {
            success: true,
            output: `Process ${processId} stopped`,
          };
        }

        // Arrêter tous les processus
        const processes = shell.getRunningProcesses();

        for (const proc of processes) {
          await shell.kill(proc.id);
        }

        return {
          success: true,
          output: `Stopped ${processes.length} process(es)`,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to stop server: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Installer des dépendances
     */
    install_dependencies: async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      const packages = input.packages as string[];
      const dev = input.dev === true;

      if (!packages || packages.length === 0) {
        return {
          success: false,
          output: null,
          error: 'No packages specified',
        };
      }

      try {
        const args = ['add', ...packages];

        if (dev) {
          args.push('-D');
        }

        const result = await shell.exec('pnpm', args, { timeout: 180000 });

        if (result.exitCode !== 0) {
          return {
            success: false,
            output: result.stdout,
            error: result.stderr || 'Installation failed',
          };
        }

        return {
          success: true,
          output: `Installed ${packages.length} package(s): ${packages.join(', ')}`,
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to install dependencies: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },

    /**
     * Obtenir le statut des processus
     */
    get_process_status: async (_input: Record<string, unknown>): Promise<ToolExecutionResult> => {
      try {
        const processes = shell.getRunningProcesses();

        if (processes.length === 0) {
          return {
            success: true,
            output: 'No running processes',
          };
        }

        const status = processes.map((p) => ({
          id: p.id,
          command: p.command,
          port: p.port,
          uptime: Math.floor((Date.now() - p.startedAt.getTime()) / 1000) + 's',
        }));

        return {
          success: true,
          output: JSON.stringify(status, null, 2),
        };
      } catch (error) {
        return {
          success: false,
          output: null,
          error: `Failed to get process status: ${error instanceof Error ? error.message : String(error)}`,
        };
      }
    },
  };
}

/*
 * ============================================================================
 * MOCK SHELL (POUR LES TESTS)
 * ============================================================================
 */

/**
 * Créer un mock Shell pour les tests
 */
export function createMockShell(
  options: {
    execResults?: Record<string, ShellResult>;
    defaultExitCode?: number;
  } = {},
): ShellInterface {
  const processes = new Map<string, RunningProcess>();
  let processCounter = 0;

  return {
    async exec(command: string, args?: string[], _options?: { cwd?: string; timeout?: number }): Promise<ShellResult> {
      const fullCommand = [command, ...(args || [])].join(' ');

      // Vérifier si on a un résultat prédéfini
      if (options.execResults && fullCommand in options.execResults) {
        return options.execResults[fullCommand];
      }

      // Résultat par défaut
      return {
        exitCode: options.defaultExitCode ?? 0,
        stdout: `Mock output for: ${fullCommand}`,
        stderr: '',
      };
    },

    async spawn(
      command: string,
      args?: string[],
      _options?: { cwd?: string; env?: Record<string, string> },
    ): Promise<{ processId: string; port?: number }> {
      processCounter++;

      const processId = `mock-process-${processCounter}`;
      const port = 5173;

      processes.set(processId, {
        id: processId,
        command: [command, ...(args || [])].join(' '),
        startedAt: new Date(),
        port,
      });

      return { processId, port };
    },

    async kill(processId: string): Promise<boolean> {
      if (processes.has(processId)) {
        processes.delete(processId);
        return true;
      }

      return false;
    },

    getRunningProcesses(): RunningProcess[] {
      return Array.from(processes.values());
    },
  };
}
