/**
 * =============================================================================
 * BAVINI CLOUD - Workbench Store Helpers
 * =============================================================================
 * Helper functions for the workbench store.
 *
 * @module lib/stores/workbench/helpers
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';
import { browserFilesStore } from '../browser-files';

const logger = createScopedLogger('WorkbenchHelpers');

/**
 * Yield to the event loop to allow the browser to process pending events.
 * This prevents UI freeze during heavy operations like builds.
 *
 * Uses scheduler.postTask if available (Chrome 94+), otherwise falls back to
 * requestIdleCallback or setTimeout.
 */
export async function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    // Use scheduler.postTask with background priority if available (best for not blocking UI)
    if (typeof globalThis !== 'undefined' && 'scheduler' in globalThis) {
      const scheduler = (
        globalThis as { scheduler?: { postTask?: (cb: () => void, opts: { priority: string }) => void } }
      ).scheduler;

      if (scheduler?.postTask) {
        scheduler.postTask(() => resolve(), { priority: 'background' });
        return;
      }
    }

    // Fallback to requestIdleCallback if available
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => resolve(), { timeout: 50 });
      return;
    }

    // Final fallback to setTimeout
    setTimeout(resolve, 0);
  });
}

/**
 * Lazy import for BrowserActionRunner to avoid circular dependencies.
 */
export async function getBrowserActionRunner() {
  const { BrowserActionRunner } = await import('~/lib/runtime/browser-action-runner');
  return new BrowserActionRunner();
}

/**
 * Lazy import for BrowserBuildService to avoid circular dependencies.
 */
export async function getBrowserBuildService() {
  const { browserBuildService } = await import('~/lib/runtime/browser-build-service');
  return browserBuildService;
}

/**
 * Get the latest checkpoint files for a given chat.
 *
 * @param currentChatId - The chat ID to get checkpoint files for
 * @returns Map of file paths to content, or null if not found
 */
export async function getLatestCheckpointFiles(currentChatId: string): Promise<Map<string, string> | null> {
  try {
    const { getPGlite } = await import('~/lib/persistence/pglite');
    const { getCheckpointsByChat } = await import('~/lib/persistence/checkpoints-db');

    const db = await getPGlite();

    if (!db) {
      logger.warn('PGlite not available for checkpoint loading');
      return null;
    }

    const checkpoints = await getCheckpointsByChat(db, currentChatId, 1);

    if (checkpoints.length === 0) {
      logger.debug(`No checkpoints found for chat ${currentChatId}`);
      return null;
    }

    const latestCheckpoint = checkpoints[0];
    logger.info(
      `Found checkpoint: ${latestCheckpoint.id} with ${Object.keys(latestCheckpoint.filesSnapshot).length} files`,
    );

    // Convert filesSnapshot to Map format for browserFilesStore
    const filesMap = new Map<string, string>();

    for (const [path, entry] of Object.entries(latestCheckpoint.filesSnapshot)) {
      if (entry && typeof entry === 'object' && 'content' in entry && (entry as { type?: string }).type === 'file') {
        filesMap.set(path, (entry as { content: string }).content);
      }
    }

    return filesMap.size > 0 ? filesMap : null;
  } catch (error) {
    logger.warn('Failed to load checkpoint files:', error);
    return null;
  }
}

/**
 * Load files from checkpoint into browserFilesStore.
 *
 * @param currentChatId - The chat ID to load files for
 */
export async function loadFilesFromCheckpointHelper(currentChatId: string): Promise<void> {
  logger.info(`No files in browserFilesStore, checking for checkpoint for chat ${currentChatId}`);
  const checkpointFiles = await getLatestCheckpointFiles(currentChatId);

  if (checkpointFiles && checkpointFiles.size > 0) {
    logger.info(`Restoring ${checkpointFiles.size} files from checkpoint`);

    // Write files to browserFilesStore
    for (const [path, content] of checkpointFiles) {
      await browserFilesStore.writeFile(path, content);
    }
  } else {
    logger.debug(`No checkpoint files found for chat ${currentChatId}`);
  }
}
