/**
 * Auto-checkpoint hook for automatic checkpoint creation.
 * Monitors file changes and creates checkpoints on significant changes.
 */

import { useCallback, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import type { FileMap } from '~/lib/stores/files';
import { workbenchStore } from '~/lib/stores/workbench';
import { checkpointConfig, canCreateAutoCheckpoint, recordAutoCheckpoint } from '~/lib/stores/checkpoints';
import { calculateFilesDiff, getDiffSummary } from '~/lib/persistence/checkpoint-diff';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('useAutoCheckpoint');

export interface AutoCheckpointOptions {
  /** Callback to create a checkpoint */
  onCreateCheckpoint: (description: string) => Promise<void>;

  /** Minimum number of changed files to trigger auto-checkpoint */
  minChangedFiles?: number;

  /** Minimum total bytes changed to trigger auto-checkpoint */
  minChangedBytes?: number;

  /** Whether auto-checkpoints are enabled */
  enabled?: boolean;

  /** Debounce time in ms after last change before creating checkpoint */
  debounceMs?: number;
}

export interface AutoCheckpointReturn {
  /** Manually trigger a check for auto-checkpoint */
  checkForChanges: () => void;

  /** Reset the baseline (after manual checkpoint) */
  resetBaseline: () => void;

  /** Whether auto-checkpoint is currently enabled */
  isEnabled: boolean;
}

/**
 * Hook for automatic checkpoint creation on significant file changes.
 */
export function useAutoCheckpoint(options: AutoCheckpointOptions): AutoCheckpointReturn {
  const {
    onCreateCheckpoint,
    minChangedFiles = 3,
    minChangedBytes = 1024, // 1KB
    enabled = true,
    debounceMs = 5000, // 5 seconds after last change
  } = options;

  const config = useStore(checkpointConfig);
  const files = useStore(workbenchStore.files);

  // Track baseline state for comparison
  const baselineRef = useRef<FileMap>({});
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastChangeTimeRef = useRef<number>(0);

  // Reset baseline to current files
  const resetBaseline = useCallback(() => {
    baselineRef.current = { ...files };
    logger.debug('Baseline reset');
  }, [files]);

  // Check if changes are significant enough for auto-checkpoint
  const isSignificantChange = useCallback(
    (diff: ReturnType<typeof calculateFilesDiff>): boolean => {
      const totalChanges = diff.addedCount + diff.modifiedCount + diff.deletedCount;

      if (totalChanges < minChangedFiles) {
        return false;
      }

      // Calculate total bytes changed
      let bytesChanged = 0;

      for (const entry of diff.entries) {
        if (entry.content) {
          bytesChanged += new TextEncoder().encode(entry.content).length;
        }
      }

      return bytesChanged >= minChangedBytes;
    },
    [minChangedFiles, minChangedBytes],
  );

  // Check for changes and create checkpoint if significant
  const checkForChanges = useCallback(async () => {
    if (!enabled) {
      return;
    }

    // Check throttling
    if (!canCreateAutoCheckpoint()) {
      logger.debug('Auto-checkpoint throttled');
      return;
    }

    const currentFiles = workbenchStore.files.get();
    const diff = calculateFilesDiff(baselineRef.current, currentFiles);

    if (!isSignificantChange(diff)) {
      logger.debug('Changes not significant enough for auto-checkpoint');
      return;
    }

    const summary = getDiffSummary(diff);
    logger.info(`Significant changes detected (${summary}), creating auto-checkpoint`);

    try {
      await onCreateCheckpoint(`Auto: ${summary}`);
      recordAutoCheckpoint();
      resetBaseline();
    } catch (error) {
      logger.error('Failed to create auto-checkpoint:', error);
    }
  }, [enabled, isSignificantChange, onCreateCheckpoint, resetBaseline]);

  // Debounced change handler
  const handleFilesChange = useCallback(() => {
    if (!enabled) {
      return;
    }

    lastChangeTimeRef.current = Date.now();

    // Clear existing timer
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }

    // Set new timer
    debounceTimerRef.current = setTimeout(() => {
      checkForChanges();
    }, debounceMs);
  }, [enabled, checkForChanges, debounceMs]);

  // Initialize baseline on mount
  useEffect(() => {
    if (Object.keys(baselineRef.current).length === 0) {
      resetBaseline();
    }
  }, [resetBaseline]);

  // Subscribe to file changes
  useEffect(() => {
    if (!enabled) {
      return;
    }

    // Watch for file changes
    const unsubscribe = workbenchStore.files.subscribe(() => {
      handleFilesChange();
    });

    return () => {
      unsubscribe();

      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
    };
  }, [enabled, handleFilesChange]);

  return {
    checkForChanges,
    resetBaseline,
    isEnabled: enabled,
  };
}

/**
 * Determine if a set of changes is significant enough for auto-checkpoint.
 */
export function isSignificantChangeSet(
  previousFiles: FileMap,
  currentFiles: FileMap,
  options: { minFiles?: number; minBytes?: number } = {},
): boolean {
  const { minFiles = 3, minBytes = 1024 } = options;

  const diff = calculateFilesDiff(previousFiles, currentFiles);
  const totalChanges = diff.addedCount + diff.modifiedCount + diff.deletedCount;

  if (totalChanges < minFiles) {
    return false;
  }

  let bytesChanged = 0;

  for (const entry of diff.entries) {
    if (entry.content) {
      bytesChanged += new TextEncoder().encode(entry.content).length;
    }
  }

  return bytesChanged >= minBytes;
}
