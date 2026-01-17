/**
 * =============================================================================
 * BAVINI CLOUD - Browser Action Runner
 * =============================================================================
 * Action runner for browser mode. Handles file actions without WebContainer.
 * Shell actions are not supported in browser mode.
 * =============================================================================
 */

import { atom, map, type MapStore } from 'nanostores';
import * as nodePath from 'node:path';
import type { BoltAction } from '~/types/actions';
import { createScopedLogger } from '~/utils/logger';
import { unreachable } from '~/utils/unreachable';
import type { ActionCallbackData } from './message-parser';
import { browserFilesStore } from '~/lib/stores/browser-files';

const logger = createScopedLogger('BrowserActionRunner');

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

// Atom to track if an action is currently running
export const isBrowserActionRunning = atom(false);

/**
 * Browser-based action runner.
 * Supports file actions only. Shell actions will show a warning.
 */
export class BrowserActionRunner {
  #currentExecutionPromise: Promise<void> = Promise.resolve();
  #buildTrigger?: () => Promise<void>;

  actions: ActionsMap = map({});

  constructor() {
    logger.info('BrowserActionRunner initialized');
  }

  /**
   * Set the build trigger function (called after file writes)
   */
  setBuildTrigger(trigger: () => Promise<void>): void {
    this.#buildTrigger = trigger;
  }

  addAction(data: ActionCallbackData) {
    const { actionId } = data;

    const actions = this.actions.get();
    const action = actions[actionId];

    if (action) {
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
        logger.debug('Previous action failed:', error);
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

    logger.info(`Executing action: ${action.type}`, { actionId });

    this.#updateAction(actionId, { status: 'running' });
    isBrowserActionRunning.set(true);

    try {
      switch (action.type) {
        case 'file': {
          await this.#runFileAction(action);
          break;
        }
        case 'shell': {
          await this.#runShellAction(action);
          break;
        }
        default: {
          logger.warn(`Action type "${action.type}" not supported in browser mode`);
        }
      }

      this.#updateAction(actionId, { status: action.abortSignal.aborted ? 'aborted' : 'complete' });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      this.#updateAction(actionId, { status: 'failed', error: errorMessage });
      logger.error(`Action ${action.type} failed:`, error);
      throw error;
    } finally {
      isBrowserActionRunning.set(false);
    }
  }

  async #runFileAction(action: ActionState) {
    if (action.type !== 'file') {
      unreachable('Expected file action');
    }

    logger.info(`Writing file: ${action.filePath}`);

    // Write to browser files store
    // Build is NOT triggered here - it will be triggered when:
    // 1. Artifact closes (all files written)
    // 2. User manually edits a file (debounced)
    await browserFilesStore.writeFile(action.filePath, action.content);
  }

  async #runShellAction(action: ActionState) {
    if (action.type !== 'shell') {
      unreachable('Expected shell action');
    }

    const command = action.content;
    logger.info(`Shell command (browser mode): ${command}`);

    // In browser mode, we can simulate some common commands
    if (this.#isInstallCommand(command)) {
      // Skip install commands in browser mode - dependencies are loaded from CDN
      logger.info('Skipping install command in browser mode (using CDN for dependencies)');
      return;
    }

    if (this.#isDevServerCommand(command)) {
      // Skip dev server commands - browser mode uses esbuild preview
      logger.info('Skipping dev server command in browser mode (using esbuild preview)');

      // Trigger a build instead
      if (this.#buildTrigger) {
        await this.#buildTrigger();
      }

      return;
    }

    // For other shell commands, log a warning
    logger.warn(`Shell command not supported in browser mode: ${command}`);
  }

  #isInstallCommand(command: string): boolean {
    const patterns = [
      /^(npm|pnpm|yarn|bun)\s+(install|i|ci)/i,
      /^(npm|pnpm|yarn|bun)\s+add/i,
    ];
    return patterns.some((p) => p.test(command.trim()));
  }

  #isDevServerCommand(command: string): boolean {
    const patterns = [
      /npm\s+run\s+dev/i,
      /pnpm\s+(run\s+)?dev/i,
      /yarn\s+dev/i,
      /npm\s+start/i,
      /pnpm\s+start/i,
      /yarn\s+start/i,
      /vite/i,
      /next\s+dev/i,
    ];
    return patterns.some((p) => p.test(command.trim()));
  }

  #updateAction(id: string, newState: ActionStateUpdate) {
    const actions = this.actions.get();
    this.actions.setKey(id, { ...actions[id], ...newState } as ActionState);
  }
}

// Factory function
export function createBrowserActionRunner(): BrowserActionRunner {
  return new BrowserActionRunner();
}
