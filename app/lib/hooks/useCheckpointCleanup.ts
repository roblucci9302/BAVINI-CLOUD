/**
 * Hook for automatic checkpoint cleanup.
 * Manages cleanup of old checkpoints based on configured limits.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import { checkpointConfig, checkpointsMap } from '~/lib/stores/checkpoints';
import { deleteOldCheckpoints, getCheckpointCount, getCheckpointsTotalSize } from '~/lib/persistence/checkpoints-db';
import { getPGlite } from '~/lib/persistence/pglite';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useCheckpointCleanup');

export interface CheckpointCleanupOptions {
  /** Chat ID to manage cleanup for */
  chatId: string;

  /** Maximum number of checkpoints to keep */
  maxCheckpoints?: number;

  /** Maximum total size in bytes (optional) */
  maxTotalSize?: number;

  /** Whether to preserve manual checkpoints during cleanup */
  preserveManual?: boolean;

  /** Interval for periodic cleanup in ms (0 to disable) */
  cleanupInterval?: number;

  /** Whether cleanup is enabled */
  enabled?: boolean;
}

export interface CheckpointCleanupReturn {
  /** Trigger manual cleanup */
  runCleanup: () => Promise<number>;

  /** Get current checkpoint statistics */
  getStats: () => Promise<{ count: number; totalSize: number }>;

  /** Whether cleanup is currently running */
  isCleaningUp: boolean;
}

/**
 * Hook for managing automatic checkpoint cleanup.
 */
export function useCheckpointCleanup(options: CheckpointCleanupOptions): CheckpointCleanupReturn {
  const { chatId, maxCheckpoints, maxTotalSize, preserveManual = true, cleanupInterval = 0, enabled = true } = options;

  const config = useStore(checkpointConfig);
  const isCleaningUpRef = useRef(false);
  const cleanupTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const effectiveMaxCheckpoints = maxCheckpoints ?? config.maxCheckpointsPerChat;

  /**
   * Run cleanup to remove old checkpoints.
   */
  const runCleanup = useCallback(async (): Promise<number> => {
    if (!chatId || !enabled || isCleaningUpRef.current) {
      return 0;
    }

    isCleaningUpRef.current = true;

    try {
      const db = await getPGlite();

      // Check if cleanup is needed
      const currentCount = await getCheckpointCount(db, chatId);

      if (currentCount <= effectiveMaxCheckpoints) {
        logger.debug(`No cleanup needed: ${currentCount} <= ${effectiveMaxCheckpoints}`);
        return 0;
      }

      // Run cleanup
      const deleted = await deleteOldCheckpoints(db, chatId, effectiveMaxCheckpoints, {
        preserveManual,
      });

      logger.info(`Cleaned up ${deleted} old checkpoints for chat ${chatId}`);

      // Size-based cleanup if configured
      if (maxTotalSize && deleted === 0) {
        const totalSize = await getCheckpointsTotalSize(db, chatId);

        if (totalSize > maxTotalSize) {
          /*
           * Delete oldest checkpoints until under size limit
           * This is a simple approach - could be made more sophisticated
           */
          const additionalDeleted = await deleteOldCheckpoints(
            db,
            chatId,
            Math.floor(effectiveMaxCheckpoints * 0.8), // Keep 80%
            { preserveManual },
          );

          logger.info(`Size-based cleanup: deleted ${additionalDeleted} more checkpoints`);

          return deleted + additionalDeleted;
        }
      }

      return deleted;
    } catch (error) {
      logger.error('Cleanup failed:', error);
      return 0;
    } finally {
      isCleaningUpRef.current = false;
    }
  }, [chatId, enabled, effectiveMaxCheckpoints, maxTotalSize, preserveManual]);

  /**
   * Get current checkpoint statistics.
   */
  const getStats = useCallback(async (): Promise<{ count: number; totalSize: number }> => {
    if (!chatId) {
      return { count: 0, totalSize: 0 };
    }

    try {
      const db = await getPGlite();
      const count = await getCheckpointCount(db, chatId);
      const totalSize = await getCheckpointsTotalSize(db, chatId);

      return { count, totalSize };
    } catch (error) {
      logger.error('Failed to get stats:', error);
      return { count: 0, totalSize: 0 };
    }
  }, [chatId]);

  // Set up periodic cleanup
  useEffect(() => {
    if (!enabled || cleanupInterval <= 0) {
      return;
    }

    cleanupTimerRef.current = setInterval(() => {
      runCleanup();
    }, cleanupInterval);

    return () => {
      if (cleanupTimerRef.current) {
        clearInterval(cleanupTimerRef.current);
        cleanupTimerRef.current = null;
      }
    };
  }, [enabled, cleanupInterval, runCleanup]);

  // Run cleanup when checkpoints change (via subscription to store)
  useEffect(() => {
    if (!enabled || !chatId) {
      return;
    }

    const unsubscribe = checkpointsMap.subscribe(() => {
      const checkpoints = Object.values(checkpointsMap.get()).filter((cp) => cp.chatId === chatId);

      if (checkpoints.length > effectiveMaxCheckpoints) {
        runCleanup();
      }
    });

    return unsubscribe;
  }, [enabled, chatId, effectiveMaxCheckpoints, runCleanup]);

  return {
    runCleanup,
    getStats,
    isCleaningUp: isCleaningUpRef.current,
  };
}

/**
 * Cleanup old checkpoints for a specific chat.
 * Standalone function for use outside React components.
 */
export async function cleanupOldCheckpoints(
  chatId: string,
  options: {
    maxCheckpoints?: number;
    preserveManual?: boolean;
  } = {},
): Promise<number> {
  const { maxCheckpoints = 50, preserveManual = true } = options;

  try {
    const db = await getPGlite();
    const currentCount = await getCheckpointCount(db, chatId);

    if (currentCount <= maxCheckpoints) {
      return 0;
    }

    return await deleteOldCheckpoints(db, chatId, maxCheckpoints, { preserveManual });
  } catch (error) {
    logger.error('Cleanup failed:', error);
    return 0;
  }
}

/**
 * Format bytes to human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) {
    return '0 B';
  }

  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}
