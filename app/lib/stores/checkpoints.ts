/**
 * Nanostores store for Checkpoints/Time Travel feature.
 * Manages checkpoint state in the client with persistence via PGLite.
 */

import { atom, map, computed } from 'nanostores';
import type { Message } from '~/types/message';
import type { Checkpoint, CheckpointConfig, CheckpointStats, CheckpointEvent } from '~/types/checkpoint';
import { DEFAULT_CHECKPOINT_CONFIG } from '~/types/checkpoint';
import type { FileMap } from '~/lib/stores/files';
import type { ActionState } from '~/lib/runtime/action-runner';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CheckpointsStore');

/*
 * ============================================================================
 * Configuration
 * ============================================================================
 */

/**
 * Store configuration (can be updated at runtime).
 */
export const checkpointConfig = atom<CheckpointConfig>(
  import.meta.hot?.data?.checkpointConfig ?? { ...DEFAULT_CHECKPOINT_CONFIG },
);

// HMR preservation
if (import.meta.hot?.data) {
  import.meta.hot.data.checkpointConfig = checkpointConfig;
}

/*
 * ============================================================================
 * State Atoms
 * ============================================================================
 */

/**
 * Map of all loaded checkpoints, keyed by checkpoint ID.
 */
export const checkpointsMap = map<Record<string, Checkpoint>>(import.meta.hot?.data?.checkpointsMap ?? {});

/**
 * Current active checkpoint ID (if viewing a restored state).
 */
export const currentCheckpointId = atom<string | null>(import.meta.hot?.data?.currentCheckpointId ?? null);

/**
 * Whether a restore operation is in progress.
 */
export const isRestoring = atom<boolean>(import.meta.hot?.data?.isRestoring ?? false);

/**
 * Whether checkpoints are being loaded from the database.
 */
export const isLoading = atom<boolean>(import.meta.hot?.data?.isLoading ?? false);

/**
 * Last error that occurred during checkpoint operations.
 */
export const checkpointError = atom<Error | null>(import.meta.hot?.data?.checkpointError ?? null);

/**
 * Timestamp of the last auto-checkpoint (for throttling).
 */
export const lastAutoCheckpointTime = atom<number>(import.meta.hot?.data?.lastAutoCheckpointTime ?? 0);

/**
 * Current chat ID for filtering checkpoints.
 */
export const currentChatId = atom<string | null>(import.meta.hot?.data?.currentChatId ?? null);

/**
 * Event listeners for checkpoint events.
 */
const eventListeners = new Set<(event: CheckpointEvent) => void>();

// HMR preservation
if (import.meta.hot?.data) {
  import.meta.hot.data.checkpointsMap = checkpointsMap;
  import.meta.hot.data.currentCheckpointId = currentCheckpointId;
  import.meta.hot.data.isRestoring = isRestoring;
  import.meta.hot.data.isLoading = isLoading;
  import.meta.hot.data.checkpointError = checkpointError;
  import.meta.hot.data.lastAutoCheckpointTime = lastAutoCheckpointTime;
  import.meta.hot.data.currentChatId = currentChatId;
}

/*
 * ============================================================================
 * Computed Values
 * ============================================================================
 */

/**
 * All checkpoints as an array, sorted by creation date (newest first).
 */
export const checkpointsList = computed(checkpointsMap, (map) => {
  return Object.values(map).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
});

/**
 * Checkpoints for the current chat only.
 */
export const currentChatCheckpoints = computed([checkpointsList, currentChatId], (list, chatId) => {
  if (!chatId) {
    return [];
  }

  return list.filter((cp) => cp.chatId === chatId);
});

/**
 * The latest checkpoint for the current chat.
 */
export const latestCheckpoint = computed(currentChatCheckpoints, (list) => {
  return list[0] ?? null;
});

/**
 * Number of checkpoints for the current chat.
 */
export const checkpointCount = computed(currentChatCheckpoints, (list) => list.length);

/**
 * Whether there are any checkpoints for the current chat.
 */
export const hasCheckpoints = computed(checkpointCount, (count) => count > 0);

/**
 * Statistics for the current chat's checkpoints.
 */
export const checkpointStats = computed(currentChatCheckpoints, (list): CheckpointStats => {
  const autoCount = list.filter((cp) => cp.triggerType === 'auto').length;
  const manualCount = list.filter((cp) => cp.triggerType === 'manual').length;
  const beforeActionCount = list.filter((cp) => cp.triggerType === 'before_action').length;
  const totalSizeBytes = list.reduce((sum, cp) => sum + (cp.sizeBytes ?? 0), 0);

  return {
    totalCount: list.length,
    autoCount,
    manualCount,
    beforeActionCount,
    totalSizeBytes,
    oldestCheckpoint: list.length > 0 ? list[list.length - 1].createdAt : undefined,
    newestCheckpoint: list.length > 0 ? list[0].createdAt : undefined,
  };
});

/*
 * ============================================================================
 * Actions
 * ============================================================================
 */

/**
 * Set the current chat ID for checkpoint filtering.
 */
export function setCurrentChatId(chatId: string | null): void {
  currentChatId.set(chatId);
  logger.debug(`Current chat ID set to: ${chatId}`);
}

/**
 * Add a checkpoint to the store.
 */
export function addCheckpoint(checkpoint: Checkpoint): void {
  checkpointsMap.setKey(checkpoint.id, checkpoint);
  logger.debug(`Checkpoint added: ${checkpoint.id}`);

  emitEvent({ type: 'created', checkpoint });
}

/**
 * Add multiple checkpoints to the store.
 */
export function addCheckpoints(checkpoints: Checkpoint[]): void {
  const current = checkpointsMap.get();
  const updated = { ...current };

  for (const checkpoint of checkpoints) {
    updated[checkpoint.id] = checkpoint;
  }

  checkpointsMap.set(updated);
  logger.debug(`Added ${checkpoints.length} checkpoints`);
}

/**
 * Remove a checkpoint from the store.
 */
export function removeCheckpoint(id: string): boolean {
  const current = checkpointsMap.get();

  if (!current[id]) {
    return false;
  }

  const { [id]: removed, ...rest } = current;
  checkpointsMap.set(rest);

  logger.debug(`Checkpoint removed: ${id}`);
  emitEvent({ type: 'deleted', checkpointId: id });

  return true;
}

/**
 * Clear all checkpoints from the store.
 */
export function clearCheckpoints(): void {
  checkpointsMap.set({});
  currentCheckpointId.set(null);
  logger.debug('All checkpoints cleared');
}

/**
 * Clear checkpoints for a specific chat.
 */
export function clearCheckpointsForChat(chatId: string): void {
  const current = checkpointsMap.get();
  const filtered: Record<string, Checkpoint> = {};

  for (const [id, checkpoint] of Object.entries(current)) {
    if (checkpoint.chatId !== chatId) {
      filtered[id] = checkpoint;
    }
  }

  checkpointsMap.set(filtered);
  logger.debug(`Cleared checkpoints for chat: ${chatId}`);
}

/**
 * Get a checkpoint by ID.
 */
export function getCheckpoint(id: string): Checkpoint | undefined {
  return checkpointsMap.get()[id];
}

/**
 * Update a checkpoint's description.
 */
export function updateCheckpointDescription(id: string, description: string): boolean {
  const checkpoint = checkpointsMap.get()[id];

  if (!checkpoint) {
    return false;
  }

  checkpointsMap.setKey(id, { ...checkpoint, description });
  logger.debug(`Checkpoint ${id} description updated`);

  emitEvent({ type: 'updated', checkpointId: id, field: 'description' });

  return true;
}

/**
 * Set the current checkpoint (when viewing a restored state).
 */
export function setCurrentCheckpoint(id: string | null): void {
  currentCheckpointId.set(id);
  logger.debug(`Current checkpoint set to: ${id}`);
}

/**
 * Set the restoring state.
 */
export function setRestoring(value: boolean): void {
  isRestoring.set(value);
}

/**
 * Set the loading state.
 */
export function setLoading(value: boolean): void {
  isLoading.set(value);
}

/**
 * Set an error.
 */
export function setError(error: Error | null): void {
  checkpointError.set(error);

  if (error) {
    logger.error('Checkpoint error:', error);
  }
}

/**
 * Check if an auto-checkpoint can be created (respects throttling).
 */
export function canCreateAutoCheckpoint(): boolean {
  const config = checkpointConfig.get();
  const lastTime = lastAutoCheckpointTime.get();
  const now = Date.now();

  return now - lastTime >= config.autoCheckpointThrottleMs;
}

/**
 * Record that an auto-checkpoint was created.
 */
export function recordAutoCheckpoint(): void {
  lastAutoCheckpointTime.set(Date.now());
}

/**
 * Update the checkpoint configuration.
 */
export function updateConfig(updates: Partial<CheckpointConfig>): void {
  const current = checkpointConfig.get();
  checkpointConfig.set({ ...current, ...updates });
  logger.debug('Checkpoint config updated:', updates);
}

/*
 * ============================================================================
 * Event System
 * ============================================================================
 */

/**
 * Subscribe to checkpoint events.
 */
export function subscribeToEvents(listener: (event: CheckpointEvent) => void): () => void {
  eventListeners.add(listener);

  return () => {
    eventListeners.delete(listener);
  };
}

/**
 * Emit a checkpoint event to all listeners.
 */
function emitEvent(event: CheckpointEvent): void {
  for (const listener of eventListeners) {
    try {
      listener(event);
    } catch (error) {
      logger.error('Event listener error:', error);
    }
  }
}

/*
 * ============================================================================
 * Utility Functions
 * ============================================================================
 */

/**
 * Filter checkpoints that should be excluded from a snapshot.
 */
export function filterExcludedFiles(files: FileMap): FileMap {
  const config = checkpointConfig.get();
  const filtered: FileMap = {};

  for (const [path, file] of Object.entries(files)) {
    const shouldExclude = config.excludedFiles.some((excluded) => {
      // Check exact match or path segment match
      const fileName = path.split('/').pop() ?? '';
      return fileName === excluded || path.includes(`/${excluded}/`) || path.endsWith(`/${excluded}`);
    });

    if (!shouldExclude) {
      filtered[path] = file;
    }
  }

  return filtered;
}

/**
 * Check if a checkpoint should be cleaned up based on config.
 */
export function shouldCleanupCheckpoints(chatId: string): boolean {
  const config = checkpointConfig.get();
  const chatCheckpoints = Object.values(checkpointsMap.get()).filter((cp) => cp.chatId === chatId);

  return chatCheckpoints.length > config.maxCheckpointsPerChat;
}

/**
 * Get checkpoints that should be deleted during cleanup.
 */
export function getCheckpointsToCleanup(chatId: string): string[] {
  const config = checkpointConfig.get();
  const chatCheckpoints = Object.values(checkpointsMap.get())
    .filter((cp) => cp.chatId === chatId)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  if (chatCheckpoints.length <= config.maxCheckpointsPerChat) {
    return [];
  }

  const toDelete: string[] = [];
  let kept = 0;

  for (const checkpoint of chatCheckpoints) {
    if (kept < config.maxCheckpointsPerChat) {
      kept++;
      continue;
    }

    // Preserve manual checkpoints if configured
    if (config.preserveManualOnCleanup && checkpoint.triggerType === 'manual') {
      continue;
    }

    toDelete.push(checkpoint.id);
  }

  return toDelete;
}

/**
 * Format a checkpoint for display in the timeline.
 */
export function formatCheckpointForTimeline(checkpoint: Checkpoint): {
  id: string;
  time: string;
  timeAgo: string;
  description: string;
  type: 'auto' | 'manual' | 'before_action';
  sizeLabel: string;
} {
  const date = new Date(checkpoint.createdAt);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  let timeAgo: string;

  if (diffMinutes < 1) {
    timeAgo = "À l'instant";
  } else if (diffMinutes < 60) {
    timeAgo = `Il y a ${diffMinutes} min`;
  } else if (diffHours < 24) {
    timeAgo = `Il y a ${diffHours}h`;
  } else {
    timeAgo = `Il y a ${diffDays}j`;
  }

  const sizeBytes = checkpoint.sizeBytes ?? 0;
  let sizeLabel: string;

  if (sizeBytes < 1024) {
    sizeLabel = `${sizeBytes} B`;
  } else if (sizeBytes < 1024 * 1024) {
    sizeLabel = `${(sizeBytes / 1024).toFixed(1)} KB`;
  } else {
    sizeLabel = `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  return {
    id: checkpoint.id,
    time: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    timeAgo,
    description: checkpoint.description ?? getDefaultDescription(checkpoint),
    type: checkpoint.triggerType,
    sizeLabel,
  };
}

/**
 * Generate a default description for a checkpoint.
 */
function getDefaultDescription(checkpoint: Checkpoint): string {
  switch (checkpoint.triggerType) {
    case 'manual':
      return 'Point de sauvegarde manuel';
    case 'before_action':
      return 'Avant modification';
    case 'auto':
    default:
      return 'Checkpoint automatique';
  }
}
