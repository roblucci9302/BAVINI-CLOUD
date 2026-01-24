/**
 * =============================================================================
 * BAVINI Cloud - Adapter Factory
 * =============================================================================
 * Factory pour créer les adaptateurs BAVINI pour les agents.
 *
 * Tous les adaptateurs utilisent maintenant le runtime BAVINI natif
 * (MountManager, CommandExecutor) sans dépendance à WebContainer.
 *
 * Usage:
 *   const fsAdapter = createFSAdapter(config);
 *   const shellAdapter = createShellAdapter(config);
 *   const fileOpsAdapter = createFileOperationsAdapter(agentName);
 * =============================================================================
 */

import type { MountManager } from '~/lib/runtime/filesystem';
import { getSharedMountManager } from '~/lib/runtime/filesystem';
import { createScopedLogger } from '~/utils/logger';
import type { AgentType, ToolExecutionResult } from '../types';

// BAVINI Adapters
import {
  BaviniFSAdapter,
  type BaviniFSConfig,
} from './bavini-fs-adapter';
import {
  BaviniShellAdapter,
  type BaviniShellConfig,
} from './bavini-shell-adapter';
import {
  BaviniFileOperationsAdapter,
  type GlobOptions,
  type GrepOptions,
} from './bavini-file-operations-adapter';

import type { ProposedAction } from '../security/action-validator';

const logger = createScopedLogger('AdapterFactory');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/** Type de runtime (BAVINI uniquement maintenant) */
export type RuntimeType = 'browser';

/** Configuration commune pour tous les adaptateurs */
export interface CommonAdapterConfig {
  /** Agent propriétaire */
  agentName: AgentType;

  /** ID de tâche */
  taskId?: string;

  /** Mode strict (approbation requise) */
  strictMode: boolean;

  /** Callback d'approbation */
  onApprovalRequired?: (action: ProposedAction) => Promise<boolean>;

  /** Callback pour notifier une action */
  onActionExecuted?: (action: ProposedAction, result: ToolExecutionResult) => void;
}

/** Configuration spécifique au FS adapter */
export interface FSAdapterFactoryConfig extends CommonAdapterConfig {
  /** Chemin de base pour les opérations */
  basePath?: string;
}

/** Configuration spécifique au Shell adapter */
export interface ShellAdapterFactoryConfig extends CommonAdapterConfig {
  /** Working directory initial */
  cwd?: string;

  /** Variables d'environnement */
  env?: Record<string, string>;

  /** Timeout par défaut en ms */
  defaultTimeout?: number;
}

/** Interface unifiée pour les FS adapters */
export interface IFSAdapter {
  readFile(path: string): Promise<ToolExecutionResult>;
  listDirectory(path: string): Promise<ToolExecutionResult>;
  exists(path: string): Promise<boolean>;
  stat(path: string): Promise<ToolExecutionResult>;
  createFile(path: string, content: string): Promise<ToolExecutionResult>;
  writeFile(path: string, content: string): Promise<ToolExecutionResult>;
  deleteFile(path: string): Promise<ToolExecutionResult>;
  createDirectory(path: string): Promise<ToolExecutionResult>;
  deleteDirectory(path: string, recursive?: boolean): Promise<ToolExecutionResult>;
  copyFile(src: string, dest: string): Promise<ToolExecutionResult>;
  rename(oldPath: string, newPath: string): Promise<ToolExecutionResult>;
}

/** Interface unifiée pour les Shell adapters */
export interface IShellAdapter {
  executeCommand(command: string, timeout?: number): Promise<ToolExecutionResult>;
  npmInstall(options?: { packages?: string[]; dev?: boolean }): Promise<ToolExecutionResult>;
  npmRun(options: { script: string; args?: string[] }): Promise<ToolExecutionResult>;
  npmTest(timeout?: number): Promise<ToolExecutionResult>;
  npmBuild(timeout?: number): Promise<ToolExecutionResult>;
  gitCommand(options: {
    operation: 'status' | 'add' | 'commit' | 'push' | 'pull' | 'diff' | 'log' | 'branch';
    args?: string[];
    timeout?: number;
  }): Promise<ToolExecutionResult>;
  gitStatus(): Promise<ToolExecutionResult>;
  gitDiff(args?: string[]): Promise<ToolExecutionResult>;
  gitAdd(files?: string[]): Promise<ToolExecutionResult>;
  gitCommit(message: string): Promise<ToolExecutionResult>;
  getCwd(): string;
  setCwd(path: string): Promise<boolean>;
  getEnv(): Record<string, string | undefined>;
  setEnv(key: string, value: string): void;
}

/** Interface unifiée pour les File Operations adapters */
export interface IFileOperationsAdapter {
  readFile(path: string, useCache?: boolean): Promise<ToolExecutionResult>;
  readFiles(paths: string[]): Promise<Map<string, ToolExecutionResult>>;
  glob(options: GlobOptions): Promise<ToolExecutionResult>;
  grep(options: GrepOptions): Promise<ToolExecutionResult>;
  getFileInfo(path: string): Promise<{
    path: string;
    name: string;
    extension: string;
    size: number;
    isDirectory: boolean;
  } | null>;
  clearCache(): void;
  invalidateCache(paths: string | string[]): void;
}

// Re-export types for convenience
export type { GlobOptions, GrepOptions };

/*
 * ============================================================================
 * RUNTIME (BAVINI uniquement)
 * ============================================================================
 */

/**
 * Obtenir le type de runtime actif (toujours 'browser' maintenant)
 */
export function getActiveRuntime(): RuntimeType {
  return 'browser';
}

/**
 * Forcer un type de runtime (no-op, conservé pour compatibilité API)
 */
export function setRuntimeOverride(_runtime: RuntimeType | null): void {
  // No-op - BAVINI est le seul runtime maintenant
  logger.debug('Runtime override ignored - BAVINI is the only runtime');
}

/**
 * Réinitialiser le cache du runtime (no-op, conservé pour compatibilité API)
 */
export function resetRuntimeCache(): void {
  // No-op
}

/*
 * ============================================================================
 * FS ADAPTER FACTORY
 * ============================================================================
 */

/**
 * Cache des adaptateurs FS par agent
 */
const fsAdapterCache = new Map<string, IFSAdapter>();

/**
 * Créer un adaptateur FS BAVINI
 */
export function createFSAdapter(
  config: FSAdapterFactoryConfig,
  mountManager?: MountManager,
): IFSAdapter {
  const cacheKey = `${config.agentName}-${config.taskId ?? 'default'}`;

  // Vérifier le cache
  const cached = fsAdapterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Utiliser BAVINI FS Adapter
  const baviniConfig: BaviniFSConfig = {
    agentName: config.agentName,
    taskId: config.taskId,
    strictMode: config.strictMode,
    onApprovalRequired: config.onApprovalRequired,
    onActionExecuted: config.onActionExecuted,
  };

  const fs = mountManager ?? getSharedMountManager();
  const adapter = new BaviniFSAdapter(baviniConfig, fs, config.basePath ?? '/');

  logger.info(`Created BaviniFSAdapter for agent: ${config.agentName}`);

  // Mettre en cache
  fsAdapterCache.set(cacheKey, adapter);

  return adapter;
}

/**
 * Obtenir l'adaptateur FS pour un agent (depuis le cache ou création)
 */
export function getFSAdapterForAgent(
  agentName: AgentType,
  config?: Partial<FSAdapterFactoryConfig>,
): IFSAdapter {
  const fullConfig: FSAdapterFactoryConfig = {
    agentName,
    strictMode: false,
    ...config,
  };

  return createFSAdapter(fullConfig);
}

/**
 * Réinitialiser tous les adaptateurs FS en cache
 */
export function resetFSAdapters(): void {
  fsAdapterCache.clear();
  logger.debug('FS adapter cache cleared');
}

/*
 * ============================================================================
 * SHELL ADAPTER FACTORY
 * ============================================================================
 */

/**
 * Cache des adaptateurs Shell par agent
 */
const shellAdapterCache = new Map<string, IShellAdapter>();

/**
 * Créer un adaptateur Shell BAVINI
 */
export function createShellAdapter(
  config: ShellAdapterFactoryConfig,
  mountManager?: MountManager,
): IShellAdapter {
  const cacheKey = `${config.agentName}-${config.taskId ?? 'default'}`;

  // Vérifier le cache
  const cached = shellAdapterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Utiliser BAVINI Shell Adapter
  const baviniConfig: BaviniShellConfig = {
    agentName: config.agentName,
    taskId: config.taskId,
    strictMode: config.strictMode,
    cwd: config.cwd,
    env: config.env,
    defaultTimeout: config.defaultTimeout,
    onApprovalRequired: config.onApprovalRequired,
    onActionExecuted: config.onActionExecuted,
  };

  const fs = mountManager ?? getSharedMountManager();
  const adapter = new BaviniShellAdapter(baviniConfig, fs);

  logger.info(`Created BaviniShellAdapter for agent: ${config.agentName}`);

  // Mettre en cache
  shellAdapterCache.set(cacheKey, adapter);

  return adapter;
}

/**
 * Obtenir l'adaptateur Shell pour un agent (depuis le cache ou création)
 */
export function getShellAdapterForAgent(
  agentName: AgentType,
  config?: Partial<ShellAdapterFactoryConfig>,
): IShellAdapter {
  const fullConfig: ShellAdapterFactoryConfig = {
    agentName,
    strictMode: false,
    ...config,
  };

  return createShellAdapter(fullConfig);
}

/**
 * Réinitialiser tous les adaptateurs Shell en cache
 */
export function resetShellAdapters(): void {
  shellAdapterCache.clear();
  logger.debug('Shell adapter cache cleared');
}

/*
 * ============================================================================
 * FILE OPERATIONS ADAPTER FACTORY
 * ============================================================================
 */

/**
 * Cache des adaptateurs FileOperations par agent
 */
const fileOpsAdapterCache = new Map<string, IFileOperationsAdapter>();

/**
 * Créer un adaptateur FileOperations BAVINI
 */
export function createFileOperationsAdapter(
  agentName: AgentType,
  taskId?: string,
  mountManager?: MountManager,
): IFileOperationsAdapter {
  const cacheKey = `${agentName}-${taskId ?? 'default'}`;

  // Vérifier le cache
  const cached = fileOpsAdapterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Utiliser BAVINI File Operations Adapter
  const fs = mountManager ?? getSharedMountManager();
  const adapter = new BaviniFileOperationsAdapter(agentName, taskId, fs);

  logger.info(`Created BaviniFileOperationsAdapter for agent: ${agentName}`);

  // Mettre en cache
  fileOpsAdapterCache.set(cacheKey, adapter);

  return adapter;
}

/**
 * Obtenir l'adaptateur FileOperations pour un agent
 */
export function getFileOperationsAdapterForAgent(
  agentName: AgentType,
  taskId?: string,
): IFileOperationsAdapter {
  return createFileOperationsAdapter(agentName, taskId);
}

/**
 * Réinitialiser tous les adaptateurs FileOperations en cache
 */
export function resetFileOperationsAdapters(): void {
  fileOpsAdapterCache.clear();
  logger.debug('FileOperations adapter cache cleared');
}

/*
 * ============================================================================
 * UNIFIED RESET
 * ============================================================================
 */

/**
 * Réinitialiser tous les adaptateurs et caches
 */
export function resetAllAdaptersAndCache(): void {
  resetFSAdapters();
  resetShellAdapters();
  resetFileOperationsAdapters();
  logger.info('All adapters and caches reset');
}
