/**
 * =============================================================================
 * BAVINI Container - Terminal Module
 * =============================================================================
 * Public exports for the terminal module.
 * =============================================================================
 */

// Types
export type {
  ShellEnv,
  ShellState,
  ParsedCommand,
  CommandContext,
  CommandResult,
  BuiltinCommand,
  CommandRegistry,
  PTYDimensions,
  PTYOutputEvent,
  PTYCallbacks,
  VirtualPTY,
} from './types';

export { ANSI, TermFormat, KeyCodes } from './types';

// Shell state utilities
export {
  createShellState,
  updateCwd,
  setEnvVar,
  unsetEnvVar,
  addToHistory,
  updateExitCode,
  applyStateUpdates,
  expandEnvVars,
  getPromptString,
  serializeState,
  deserializeState,
} from './shell-state';

// Virtual PTY
export { VirtualPTYImpl, createVirtualPTY, type VirtualPTYConfig } from './virtual-pty';

// Command executor
export { CommandExecutor } from './command-executor';

// FIX 3.2: Pipe parser and executor
export {
  parsePipeline,
  hasPipeOperators,
  formatPipeline,
  type ParsedPipeline,
  type PipelineCommand,
  type Redirection,
  type PipeOperator,
} from './pipe-parser';
export { PipeExecutor, createPipeExecutor, type PipelineResult } from './pipe-executor';

// Builtin commands registry
export { getCommandRegistry } from './builtins';

// Browser terminal store
export { BrowserTerminalStore, type BrowserTerminalStoreConfig } from './browser-terminal-store';
