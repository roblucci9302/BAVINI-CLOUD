/**
 * =============================================================================
 * BAVINI Container - Browser Terminal Store
 * =============================================================================
 * Store for managing the browser-based terminal.
 * Similar to TerminalStore but works with VirtualPTY instead of WebContainer.
 * =============================================================================
 */

import { atom, type WritableAtom } from 'nanostores';
import type { ITerminal } from '~/types/terminal';
import type { MountManager } from '../filesystem';
import type { VirtualPTY, ShellState } from './types';
import { createVirtualPTY } from './virtual-pty';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('BrowserTerminalStore');

// Terminal color escape codes
const redText = (text: string) => `\x1b[1;31m${text}\x1b[0m`;

/**
 * Configuration for BrowserTerminalStore
 */
export interface BrowserTerminalStoreConfig {
  /** Filesystem mount manager */
  fs: MountManager;
  /** Initial environment variables */
  env?: Record<string, string>;
  /** Initial working directory */
  cwd?: string;
}

/**
 * Browser Terminal Store
 * Manages terminal instances using VirtualPTY
 */
export class BrowserTerminalStore {
  showTerminal: WritableAtom<boolean> = import.meta.hot?.data.showTerminal ?? atom(false);

  #fs: MountManager;
  #initialEnv: Record<string, string>;
  #initialCwd: string;
  #terminals: Array<{ terminal: ITerminal; pty: VirtualPTY }> = [];
  #shellState: ShellState | null = null;

  constructor(config: BrowserTerminalStoreConfig) {
    this.#fs = config.fs;
    this.#initialEnv = config.env ?? {};
    this.#initialCwd = config.cwd ?? '/home';

    if (import.meta.hot) {
      import.meta.hot.data.showTerminal = this.showTerminal;
    }

    logger.info('BrowserTerminalStore created');
  }

  /**
   * Toggle terminal visibility
   */
  toggleTerminal(value?: boolean): void {
    this.showTerminal.set(value !== undefined ? value : !this.showTerminal.get());
  }

  /**
   * Attach a terminal instance
   */
  async attachTerminal(terminal: ITerminal): Promise<void> {
    try {
      // Create virtual PTY
      const pty = createVirtualPTY({
        fs: this.#fs,
        initialState: {
          cwd: this.#initialCwd,
          env: this.#initialEnv,
          history: this.#shellState?.history ?? [],
        },
        dimensions: {
          cols: terminal.cols ?? 80,
          rows: terminal.rows ?? 24,
        },
      });

      // Initialize PTY with terminal callbacks
      await pty.init({
        onOutput: (event) => {
          terminal.write(event.data);
        },
        onStateChange: (state) => {
          this.#shellState = state;
        },
      });

      // Connect terminal input to PTY
      terminal.onData((data) => {
        pty.write(data);
      });

      // Store terminal and PTY
      this.#terminals.push({ terminal, pty });

      logger.info('Terminal attached');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      terminal.write(redText('Failed to initialize terminal\n\n') + errorMessage);
      logger.error('Failed to attach terminal:', error);
    }
  }

  /**
   * Handle terminal resize
   */
  onTerminalResize(cols: number, rows: number): void {
    for (const { pty } of this.#terminals) {
      pty.resize({ cols, rows });
    }
  }

  /**
   * Get current shell state
   */
  getShellState(): ShellState | null {
    return this.#shellState;
  }

  /**
   * Get the filesystem mount manager
   */
  getFileSystem(): MountManager {
    return this.#fs;
  }

  /**
   * Destroy all terminals
   */
  destroy(): void {
    for (const { pty } of this.#terminals) {
      pty.destroy();
    }
    this.#terminals = [];
    logger.info('BrowserTerminalStore destroyed');
  }
}
