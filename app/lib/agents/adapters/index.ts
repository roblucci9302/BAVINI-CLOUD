/**
 * Exports des adaptateurs pour le système d'agents BAVINI
 */

// WebContainer Adapter
export {
  WebContainerAdapter,
  createWebContainerAdapter,
  getAdapterForAgent,
  resetAllAdapters,
  type AdapterConfig,
  type FileReadResult,
  type DirectoryListResult,
  type DirectoryEntry,
  type ShellResult,
} from './webcontainer-adapter';

// File Operations Adapter
export {
  FileOperationsAdapter,
  createFileOperationsAdapter,
  type GlobOptions,
  type GrepOptions,
  type GrepMatch,
  type EditOperation,
  type FileInfo,
} from './file-operations-adapter';

// Shell Adapter
export {
  ShellAdapter,
  createShellAdapter,
  getShellAdapterForAgent,
  resetAllShellAdapters,
  type ShellConfig,
  type ProcessHandle,
  type NpmRunOptions,
  type NpmInstallOptions,
  type GitCommandOptions,
} from './shell-adapter';

// Agent Executor
export {
  AgentExecutor,
  getAgentExecutor,
  resetAgentExecutor,
  type ExecutorConfig,
  type ToolCallRequest,
  type ExecutionContext,
} from './agent-executor';
