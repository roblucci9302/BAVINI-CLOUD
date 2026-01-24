/**
 * =============================================================================
 * Exports des adaptateurs pour le système d'agents BAVINI
 * =============================================================================
 *
 * Tous les adaptateurs utilisent maintenant le runtime BAVINI natif.
 * WebContainer a été complètement supprimé.
 * =============================================================================
 */

// BAVINI Filesystem Adapter
export {
  BaviniFSAdapter,
  createBaviniFSAdapter,
  type BaviniFSConfig,
  type FileReadResult,
  type DirectoryListResult,
  type DirectoryEntry,
} from './bavini-fs-adapter';

// BAVINI Shell Adapter
export {
  BaviniShellAdapter,
  createBaviniShellAdapter,
  type BaviniShellConfig,
  type ShellResult,
  type NpmRunOptions,
  type NpmInstallOptions,
  type GitCommandOptions,
} from './bavini-shell-adapter';

// BAVINI File Operations Adapter
export {
  BaviniFileOperationsAdapter,
  createBaviniFileOperationsAdapter,
  type GlobOptions,
  type GrepOptions,
  type GrepMatch,
  type EditOperation,
  type FileInfo,
} from './bavini-file-operations-adapter';

// Agent Executor
export {
  AgentExecutor,
  getAgentExecutor,
  resetAgentExecutor,
  type ExecutorConfig,
  type ToolCallRequest,
  type ExecutionContext,
} from './agent-executor';

// Adapter Factory (point d'entrée principal)
export {
  createFSAdapter,
  createShellAdapter,
  createFileOperationsAdapter,
  getFSAdapterForAgent,
  getShellAdapterForAgent,
  getFileOperationsAdapterForAgent,
  getActiveRuntime,
  setRuntimeOverride,
  resetRuntimeCache,
  resetFSAdapters,
  resetShellAdapters,
  resetFileOperationsAdapters,
  resetAllAdaptersAndCache,
  type RuntimeType,
  type CommonAdapterConfig,
  type FSAdapterFactoryConfig,
  type ShellAdapterFactoryConfig,
  type IFSAdapter,
  type IShellAdapter,
  type IFileOperationsAdapter,
} from './adapter-factory';
