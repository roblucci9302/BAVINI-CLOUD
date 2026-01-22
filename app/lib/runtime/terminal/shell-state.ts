/**
 * =============================================================================
 * BAVINI Container - Shell State
 * =============================================================================
 * Manages shell state including current directory, environment, and history.
 * =============================================================================
 */

import type { ShellState, ShellEnv } from './types';

/**
 * Default environment variables
 */
const DEFAULT_ENV: ShellEnv = {
  HOME: '/home',
  PATH: '/usr/bin:/bin',
  PWD: '/',
  USER: 'user',
  SHELL: '/bin/bash',
  TERM: 'xterm-256color',
  LANG: 'en_US.UTF-8',
  EDITOR: 'vim',
};

/**
 * Maximum history size
 */
const MAX_HISTORY_SIZE = 1000;

/**
 * Create initial shell state
 */
export function createShellState(overrides?: Partial<ShellState>): ShellState {
  const env = { ...DEFAULT_ENV, ...overrides?.env };
  const cwd = overrides?.cwd ?? env.HOME ?? '/';

  return {
    cwd,
    env: {
      ...env,
      PWD: cwd,
    },
    history: overrides?.history ?? [],
    lastExitCode: overrides?.lastExitCode ?? 0,
  };
}

/**
 * Update current working directory
 */
export function updateCwd(state: ShellState, newCwd: string): ShellState {
  return {
    ...state,
    cwd: newCwd,
    env: {
      ...state.env,
      PWD: newCwd,
      OLDPWD: state.cwd,
    },
  };
}

/**
 * Set environment variable
 */
export function setEnvVar(state: ShellState, key: string, value: string): ShellState {
  return {
    ...state,
    env: {
      ...state.env,
      [key]: value,
    },
  };
}

/**
 * Unset environment variable
 */
export function unsetEnvVar(state: ShellState, key: string): ShellState {
  const newEnv = { ...state.env };
  delete newEnv[key];

  return {
    ...state,
    env: newEnv,
  };
}

/**
 * Add command to history
 */
export function addToHistory(state: ShellState, command: string): ShellState {
  // Don't add empty commands or duplicates of last command
  if (!command.trim()) {
    return state;
  }

  const history = [...state.history];

  // Don't add if same as last command
  if (history.length > 0 && history[history.length - 1] === command) {
    return state;
  }

  history.push(command);

  // Trim to max size
  if (history.length > MAX_HISTORY_SIZE) {
    history.splice(0, history.length - MAX_HISTORY_SIZE);
  }

  return {
    ...state,
    history,
  };
}

/**
 * Update last exit code
 */
export function updateExitCode(state: ShellState, exitCode: number): ShellState {
  return {
    ...state,
    lastExitCode: exitCode,
  };
}

/**
 * Apply state updates
 */
export function applyStateUpdates(state: ShellState, updates: Partial<ShellState>): ShellState {
  let newState = { ...state };

  if (updates.cwd !== undefined) {
    newState = updateCwd(newState, updates.cwd);
  }

  if (updates.env !== undefined) {
    newState = {
      ...newState,
      env: { ...newState.env, ...updates.env },
    };
  }

  if (updates.lastExitCode !== undefined) {
    newState = updateExitCode(newState, updates.lastExitCode);
  }

  if (updates.history !== undefined) {
    newState = {
      ...newState,
      history: updates.history,
    };
  }

  return newState;
}

/**
 * Expand environment variables in a string
 * Supports $VAR and ${VAR} syntax
 */
export function expandEnvVars(input: string, env: ShellEnv): string {
  // Handle ${VAR} syntax first
  let result = input.replace(/\$\{([a-zA-Z_][a-zA-Z0-9_]*)\}/g, (_match, varName) => {
    return env[varName] ?? '';
  });

  // Handle $VAR syntax (but not $$, which is process ID)
  result = result.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (_match, varName) => {
    return env[varName] ?? '';
  });

  // Handle $? for last exit code (special case, handled by caller)
  // Handle ~/ for home directory
  if (result.startsWith('~/')) {
    result = (env.HOME ?? '/home') + result.substring(1);
  } else if (result === '~') {
    result = env.HOME ?? '/home';
  }

  return result;
}

/**
 * Get prompt string
 * Default format: user@bavini:cwd$
 */
export function getPromptString(state: ShellState): string {
  const user = state.env.USER ?? 'user';
  const host = 'bavini';
  let cwd = state.cwd;

  // Replace home with ~
  const home = state.env.HOME ?? '/home';
  if (cwd === home) {
    cwd = '~';
  } else if (cwd.startsWith(home + '/')) {
    cwd = '~' + cwd.substring(home.length);
  }

  return `${user}@${host}:${cwd}$ `;
}

/**
 * Serialize state for persistence
 */
export function serializeState(state: ShellState): string {
  return JSON.stringify({
    cwd: state.cwd,
    env: state.env,
    history: state.history.slice(-100), // Only keep last 100 for storage
  });
}

/**
 * Deserialize state from persistence
 */
export function deserializeState(data: string): Partial<ShellState> | null {
  try {
    const parsed = JSON.parse(data);
    return {
      cwd: parsed.cwd,
      env: parsed.env,
      history: parsed.history,
    };
  } catch {
    return null;
  }
}
