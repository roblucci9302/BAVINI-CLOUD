/**
 * =============================================================================
 * BAVINI Container - Terminal Types
 * =============================================================================
 * Type definitions for the browser-based terminal system.
 * =============================================================================
 */

import type { MountManager } from '../filesystem';

/**
 * Shell environment variables
 */
export interface ShellEnv {
  [key: string]: string | undefined;
  HOME?: string;
  PATH?: string;
  PWD?: string;
  USER?: string;
  SHELL?: string;
  TERM?: string;
}

/**
 * Shell state
 */
export interface ShellState {
  /** Current working directory */
  cwd: string;
  /** Environment variables */
  env: ShellEnv;
  /** Command history */
  history: string[];
  /** Exit code of last command */
  lastExitCode: number;
}

/**
 * Parsed command structure
 */
export interface ParsedCommand {
  /** Command name (first argument) */
  command: string;
  /** Command arguments */
  args: string[];
  /** Raw input string */
  raw: string;
  /** Environment variable overrides for this command */
  envOverrides?: Record<string, string>;
  /** Piped commands (future) */
  pipe?: ParsedCommand;
  /** Redirect stdout to file */
  redirectStdout?: string;
  /** Redirect stderr to file */
  redirectStderr?: string;
  /** Append stdout instead of overwrite */
  appendStdout?: boolean;
  /** Run in background */
  background?: boolean;
}

/**
 * Command execution context
 * FIX 3.2: Added stdin for pipe support
 */
export interface CommandContext {
  /** Filesystem access */
  fs: MountManager;
  /** Current shell state */
  state: ShellState;
  /** Write to stdout */
  stdout: (data: string) => void;
  /** Write to stderr */
  stderr: (data: string) => void;
  /** Terminal dimensions */
  dimensions: { cols: number; rows: number };
  /** Signal abort controller */
  signal?: AbortSignal;
  /** Standard input (for pipes) - FIX 3.2 */
  stdin?: string;
}

/**
 * Command execution result
 */
export interface CommandResult {
  /** Exit code (0 = success) */
  exitCode: number;
  /** Optional updated state */
  stateUpdates?: Partial<ShellState>;
}

/**
 * Builtin command definition
 */
export interface BuiltinCommand {
  /** Command name */
  name: string;
  /** Short description */
  description: string;
  /** Usage pattern */
  usage: string;
  /** Execute the command */
  execute: (args: string[], context: CommandContext) => Promise<CommandResult>;
}

/**
 * Command registry
 */
export interface CommandRegistry {
  /** Get a builtin command by name */
  get(name: string): BuiltinCommand | undefined;
  /** Check if command exists */
  has(name: string): boolean;
  /** Get all command names */
  list(): string[];
  /** Register a command */
  register(command: BuiltinCommand): void;
}

/**
 * PTY dimensions
 */
export interface PTYDimensions {
  cols: number;
  rows: number;
}

/**
 * PTY output event
 */
export interface PTYOutputEvent {
  type: 'stdout' | 'stderr' | 'prompt';
  data: string;
}

/**
 * PTY callbacks
 */
export interface PTYCallbacks {
  /** Called when there's output to display */
  onOutput: (event: PTYOutputEvent) => void;
  /** Called when the shell state changes */
  onStateChange?: (state: ShellState) => void;
}

/**
 * Virtual PTY interface
 */
export interface VirtualPTY {
  /** Initialize the PTY */
  init(callbacks: PTYCallbacks): Promise<void>;
  /** Destroy the PTY */
  destroy(): void;
  /** Write input data (from terminal) */
  write(data: string): void;
  /** Resize the PTY */
  resize(dimensions: PTYDimensions): void;
  /** Get current dimensions */
  getDimensions(): PTYDimensions;
  /** Get current shell state */
  getState(): ShellState;
}

/**
 * ANSI escape codes for terminal formatting
 */
export const ANSI = {
  // Reset
  RESET: '\x1b[0m',

  // Text styles
  BOLD: '\x1b[1m',
  DIM: '\x1b[2m',
  ITALIC: '\x1b[3m',
  UNDERLINE: '\x1b[4m',

  // Foreground colors
  BLACK: '\x1b[30m',
  RED: '\x1b[31m',
  GREEN: '\x1b[32m',
  YELLOW: '\x1b[33m',
  BLUE: '\x1b[34m',
  MAGENTA: '\x1b[35m',
  CYAN: '\x1b[36m',
  WHITE: '\x1b[37m',

  // Bright foreground colors
  BRIGHT_BLACK: '\x1b[90m',
  BRIGHT_RED: '\x1b[91m',
  BRIGHT_GREEN: '\x1b[92m',
  BRIGHT_YELLOW: '\x1b[93m',
  BRIGHT_BLUE: '\x1b[94m',
  BRIGHT_MAGENTA: '\x1b[95m',
  BRIGHT_CYAN: '\x1b[96m',
  BRIGHT_WHITE: '\x1b[97m',

  // Background colors
  BG_BLACK: '\x1b[40m',
  BG_RED: '\x1b[41m',
  BG_GREEN: '\x1b[42m',
  BG_YELLOW: '\x1b[43m',
  BG_BLUE: '\x1b[44m',
  BG_MAGENTA: '\x1b[45m',
  BG_CYAN: '\x1b[46m',
  BG_WHITE: '\x1b[47m',

  // Cursor control
  CURSOR_UP: (n: number) => `\x1b[${n}A`,
  CURSOR_DOWN: (n: number) => `\x1b[${n}B`,
  CURSOR_FORWARD: (n: number) => `\x1b[${n}C`,
  CURSOR_BACK: (n: number) => `\x1b[${n}D`,
  CURSOR_POSITION: (row: number, col: number) => `\x1b[${row};${col}H`,
  CURSOR_SAVE: '\x1b[s',
  CURSOR_RESTORE: '\x1b[u',
  CURSOR_HIDE: '\x1b[?25l',
  CURSOR_SHOW: '\x1b[?25h',

  // Erase
  ERASE_LINE: '\x1b[2K',
  ERASE_LINE_FROM_CURSOR: '\x1b[K',
  ERASE_SCREEN: '\x1b[2J',
  ERASE_SCREEN_FROM_CURSOR: '\x1b[J',

  // Scroll
  SCROLL_UP: (n: number) => `\x1b[${n}S`,
  SCROLL_DOWN: (n: number) => `\x1b[${n}T`,
} as const;

/**
 * Helper functions for terminal formatting
 */
export const TermFormat = {
  red: (text: string) => `${ANSI.RED}${text}${ANSI.RESET}`,
  green: (text: string) => `${ANSI.GREEN}${text}${ANSI.RESET}`,
  yellow: (text: string) => `${ANSI.YELLOW}${text}${ANSI.RESET}`,
  blue: (text: string) => `${ANSI.BLUE}${text}${ANSI.RESET}`,
  cyan: (text: string) => `${ANSI.CYAN}${text}${ANSI.RESET}`,
  magenta: (text: string) => `${ANSI.MAGENTA}${text}${ANSI.RESET}`,
  white: (text: string) => `${ANSI.WHITE}${text}${ANSI.RESET}`,
  gray: (text: string) => `${ANSI.BRIGHT_BLACK}${text}${ANSI.RESET}`,
  bold: (text: string) => `${ANSI.BOLD}${text}${ANSI.RESET}`,
  dim: (text: string) => `${ANSI.DIM}${text}${ANSI.RESET}`,
  underline: (text: string) => `${ANSI.UNDERLINE}${text}${ANSI.RESET}`,
  error: (text: string) => `${ANSI.BOLD}${ANSI.RED}${text}${ANSI.RESET}`,
  success: (text: string) => `${ANSI.BOLD}${ANSI.GREEN}${text}${ANSI.RESET}`,
  warning: (text: string) => `${ANSI.BOLD}${ANSI.YELLOW}${text}${ANSI.RESET}`,
};

/**
 * Key codes for special keys
 */
export const KeyCodes = {
  ENTER: '\r',
  TAB: '\t',
  BACKSPACE: '\x7f',
  DELETE: '\x1b[3~',
  ESCAPE: '\x1b',
  CTRL_C: '\x03',
  CTRL_D: '\x04',
  CTRL_L: '\x0c',
  CTRL_U: '\x15',
  CTRL_W: '\x17',
  CTRL_A: '\x01',
  CTRL_E: '\x05',
  CTRL_K: '\x0b',
  ARROW_UP: '\x1b[A',
  ARROW_DOWN: '\x1b[B',
  ARROW_RIGHT: '\x1b[C',
  ARROW_LEFT: '\x1b[D',
  HOME: '\x1b[H',
  END: '\x1b[F',
  PAGE_UP: '\x1b[5~',
  PAGE_DOWN: '\x1b[6~',
} as const;
