/**
 * Checkpoint Service for Time Travel feature.
 * Provides high-level API for checkpoint management with compression and WebContainer sync.
 */

import type { Message } from '~/types/message';
import type { WebContainer } from '@webcontainer/api';
import type { FileMap } from '~/lib/stores/files';
import type { ActionState } from '~/lib/runtime/action-runner';
import type {
  Checkpoint,
  CheckpointInput,
  RestoreOptions,
  RestoreResult,
  CheckpointConfig,
  CheckpointStats,
  CheckpointEvent,
} from '~/types/checkpoint';
import { DEFAULT_CHECKPOINT_CONFIG } from '~/types/checkpoint';
import {
  createCheckpoint as dbCreateCheckpoint,
  getCheckpointsByChat as dbGetCheckpointsByChat,
  getCheckpointById as dbGetCheckpointById,
  deleteCheckpoint as dbDeleteCheckpoint,
  deleteOldCheckpoints as dbDeleteOldCheckpoints,
  updateCheckpointDescription as dbUpdateDescription,
  getCheckpointsByTimeRange as dbGetCheckpointsByTimeRange,
} from '~/lib/persistence/checkpoints-db';
import { getPGlite } from '~/lib/persistence/pglite';
import {
  addCheckpoint,
  addCheckpoints,
  removeCheckpoint,
  clearCheckpointsForChat,
  setCurrentCheckpoint,
  setRestoring,
  setLoading,
  setError,
  setCurrentChatId,
  currentChatCheckpoints,
  checkpointStats as storeStats,
  checkpointConfig,
  canCreateAutoCheckpoint,
  recordAutoCheckpoint,
  filterExcludedFiles,
  subscribeToEvents,
  updateConfig,
} from '~/lib/stores/checkpoints';
import { compressJson, decompressJson, calculateStringSize, shouldCompress } from './compression';
import { syncToSnapshot, previewSync, type SyncResult, type SyncOptions } from './webcontainer-sync';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CheckpointService');

// Re-export types and utilities
export * from './compression';
export * from './webcontainer-sync';
export type { Checkpoint, CheckpointInput, RestoreOptions, RestoreResult, CheckpointConfig, CheckpointStats };

/**
 * Options for creating a checkpoint.
 */
export interface CreateCheckpointOptions {
  /** User-provided description */
  description?: string;

  /** What triggered this checkpoint */
  triggerType?: 'manual' | 'auto' | 'before_action';

  /** Associated message ID */
  messageId?: string;

  /** Force creation even if throttled */
  force?: boolean;
}

/**
 * Options for restoring a checkpoint.
 */
export interface RestoreCheckpointOptions extends Partial<RestoreOptions> {
  /** WebContainer instance for file sync */
  webcontainer?: WebContainer;

  /** Sync options */
  syncOptions?: SyncOptions;
}

/**
 * Checkpoint Service - Central API for checkpoint operations.
 */
export class CheckpointService {
  #chatId: string;
  #config: CheckpointConfig;
  #getFilesSnapshot: () => FileMap;
  #getMessages: () => Message[];
  #getActionsSnapshot?: () => Record<string, ActionState>;
  #onFilesRestored?: (files: FileMap) => void;
  #onMessagesRestored?: (messages: Message[]) => void;

  constructor(options: {
    chatId: string;
    getFilesSnapshot: () => FileMap;
    getMessages: () => Message[];
    getActionsSnapshot?: () => Record<string, ActionState>;
    onFilesRestored?: (files: FileMap) => void;
    onMessagesRestored?: (messages: Message[]) => void;
    config?: Partial<CheckpointConfig>;
  }) {
    this.#chatId = options.chatId;
    this.#getFilesSnapshot = options.getFilesSnapshot;
    this.#getMessages = options.getMessages;
    this.#getActionsSnapshot = options.getActionsSnapshot;
    this.#onFilesRestored = options.onFilesRestored;
    this.#onMessagesRestored = options.onMessagesRestored;
    this.#config = { ...DEFAULT_CHECKPOINT_CONFIG, ...options.config };

    // Update store config
    updateConfig(this.#config);

    // Set current chat
    setCurrentChatId(this.#chatId);

    logger.info(`CheckpointService initialized for chat: ${this.#chatId}`);
  }

  /**
   * Get current chat ID.
   */
  get chatId(): string {
    return this.#chatId;
  }

  /**
   * Get current configuration.
   */
  get config(): CheckpointConfig {
    return this.#config;
  }

  /**
   * Get all checkpoints for current chat.
   */
  get checkpoints(): Checkpoint[] {
    return currentChatCheckpoints.get();
  }

  /**
   * Get checkpoint statistics.
   */
  get stats(): CheckpointStats {
    return storeStats.get();
  }

  /**
   * Update configuration.
   */
  updateConfig(updates: Partial<CheckpointConfig>): void {
    this.#config = { ...this.#config, ...updates };
    updateConfig(updates);
    logger.debug('Config updated:', updates);
  }

  /**
   * Load checkpoints from database.
   */
  async loadCheckpoints(): Promise<Checkpoint[]> {
    setLoading(true);
    setError(null);

    try {
      const db = await getPGlite();
      const checkpoints = await dbGetCheckpointsByChat(db, this.#chatId);

      // Clear and reload store
      clearCheckpointsForChat(this.#chatId);
      addCheckpoints(checkpoints);

      logger.info(`Loaded ${checkpoints.length} checkpoints`);

      return checkpoints;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to load checkpoints');
      setError(err);
      logger.error('Failed to load checkpoints:', error);
      throw err;
    } finally {
      setLoading(false);
    }
  }

  /**
   * Create a new checkpoint.
   */
  async createCheckpoint(options: CreateCheckpointOptions = {}): Promise<Checkpoint | null> {
    const { description, triggerType = 'manual', messageId, force = false } = options;

    // Check throttling for auto checkpoints
    if (triggerType === 'auto' && !force && !canCreateAutoCheckpoint()) {
      logger.debug('Auto checkpoint throttled');
      return null;
    }

    setError(null);

    try {
      // Get current state
      const filesSnapshot = filterExcludedFiles(this.#getFilesSnapshot());
      const messagesSnapshot = this.#getMessages();
      const actionsSnapshot = this.#getActionsSnapshot?.();

      // Calculate size
      const snapshotJson = JSON.stringify({ filesSnapshot, messagesSnapshot, actionsSnapshot });
      const sizeBytes = calculateStringSize(snapshotJson);

      // Determine if we should compress
      const shouldCompressData =
        this.#config.enableCompression && shouldCompress(snapshotJson, this.#config.compressionThreshold);

      // Create checkpoint input
      const input: CheckpointInput = {
        chatId: this.#chatId,
        filesSnapshot,
        messagesSnapshot,
        actionsSnapshot,
        description,
        triggerType,
        messageId,
        compressed: shouldCompressData,
      };

      // Create in database
      const db = await getPGlite();
      const checkpoint = await dbCreateCheckpoint(db, input);

      // Add to store
      addCheckpoint(checkpoint);

      // Record auto checkpoint time
      if (triggerType === 'auto') {
        recordAutoCheckpoint();
      }

      // Cleanup old checkpoints if needed
      await this.#cleanupIfNeeded();

      logger.info(`Checkpoint created: ${checkpoint.id} (${sizeBytes} bytes)`);

      return checkpoint;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to create checkpoint');
      setError(err);
      logger.error('Failed to create checkpoint:', error);

      return null;
    }
  }

  /**
   * Restore a checkpoint.
   */
  async restoreCheckpoint(checkpointId: string, options: RestoreCheckpointOptions = {}): Promise<RestoreResult> {
    const {
      restoreFiles = true,
      restoreConversation = false,
      createRestorePoint = true,
      webcontainer,
      syncOptions,
    } = options;

    setRestoring(true);
    setError(null);

    const result: RestoreResult = {
      success: false,
      restoredCheckpointId: checkpointId,
      filesRestored: 0,
      messagesRestored: 0,
    };

    try {
      const db = await getPGlite();

      // Get checkpoint to restore
      const checkpoint = await dbGetCheckpointById(db, checkpointId);

      if (!checkpoint) {
        throw new Error(`Checkpoint not found: ${checkpointId}`);
      }

      // Create restore point before restoring
      if (createRestorePoint) {
        const restorePoint = await this.createCheckpoint({
          description: `Before restore: ${checkpoint.description || checkpointId}`,
          triggerType: 'before_action',
        });

        if (restorePoint) {
          result.restorePointId = restorePoint.id;
        }
      }

      // Restore files
      if (restoreFiles) {
        if (webcontainer) {
          // Sync with WebContainer
          const currentFiles = this.#getFilesSnapshot();
          const syncResult = await syncToSnapshot(webcontainer, checkpoint.filesSnapshot, currentFiles, syncOptions);

          result.filesRestored = syncResult.filesWritten;

          if (!syncResult.success) {
            logger.warn('Some files failed to sync:', syncResult.errors);
          }
        }

        // Notify callback
        this.#onFilesRestored?.(checkpoint.filesSnapshot);
        result.filesRestored = Object.keys(checkpoint.filesSnapshot).filter(
          (k) => checkpoint.filesSnapshot[k]?.type === 'file',
        ).length;
      }

      // Restore messages
      if (restoreConversation) {
        this.#onMessagesRestored?.(checkpoint.messagesSnapshot);
        result.messagesRestored = checkpoint.messagesSnapshot.length;
      }

      // Update current checkpoint
      setCurrentCheckpoint(checkpointId);

      result.success = true;

      logger.info(
        `Checkpoint ${checkpointId} restored: ${result.filesRestored} files, ${result.messagesRestored} messages`,
      );
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to restore checkpoint');
      setError(err);
      result.error = err.message;
      logger.error('Failed to restore checkpoint:', error);
    } finally {
      setRestoring(false);
    }

    return result;
  }

  /**
   * Preview what would be restored without actually restoring.
   */
  previewRestore(
    checkpoint: Checkpoint,
    excludePaths?: string[],
  ): { toWrite: string[]; toDelete: string[]; unchanged: number } {
    const currentFiles = this.#getFilesSnapshot();
    return previewSync(checkpoint.filesSnapshot, currentFiles, excludePaths);
  }

  /**
   * Delete a checkpoint.
   */
  async deleteCheckpoint(checkpointId: string): Promise<boolean> {
    setError(null);

    try {
      const db = await getPGlite();
      const deleted = await dbDeleteCheckpoint(db, checkpointId);

      if (deleted) {
        removeCheckpoint(checkpointId);
        logger.info(`Checkpoint deleted: ${checkpointId}`);
      }

      return deleted;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to delete checkpoint');
      setError(err);
      logger.error('Failed to delete checkpoint:', error);

      return false;
    }
  }

  /**
   * Update checkpoint description.
   */
  async updateDescription(checkpointId: string, description: string): Promise<boolean> {
    setError(null);

    try {
      const db = await getPGlite();
      const updated = await dbUpdateDescription(db, checkpointId, description);

      if (updated) {
        // Update in store
        const checkpoint = currentChatCheckpoints.get().find((c) => c.id === checkpointId);

        if (checkpoint) {
          addCheckpoint({ ...checkpoint, description });
        }

        logger.debug(`Checkpoint ${checkpointId} description updated`);
      }

      return updated;
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to update description');
      setError(err);
      logger.error('Failed to update description:', error);

      return false;
    }
  }

  /**
   * Get checkpoints within a time range.
   */
  async getCheckpointsByTimeRange(startTime: Date, endTime: Date): Promise<Checkpoint[]> {
    try {
      const db = await getPGlite();
      return dbGetCheckpointsByTimeRange(db, this.#chatId, startTime, endTime);
    } catch (error) {
      logger.error('Failed to get checkpoints by time range:', error);
      return [];
    }
  }

  /**
   * Clear all checkpoints for current chat.
   */
  async clearAllCheckpoints(): Promise<void> {
    setError(null);

    try {
      const db = await getPGlite();
      await db.query('DELETE FROM checkpoints WHERE chat_id = $1', [this.#chatId]);
      clearCheckpointsForChat(this.#chatId);

      logger.info(`All checkpoints cleared for chat: ${this.#chatId}`);
    } catch (error) {
      const err = error instanceof Error ? error : new Error('Failed to clear checkpoints');
      setError(err);
      logger.error('Failed to clear checkpoints:', error);
    }
  }

  /**
   * Subscribe to checkpoint events.
   */
  subscribeToEvents(listener: (event: CheckpointEvent) => void): () => void {
    return subscribeToEvents(listener);
  }

  /**
   * Cleanup old checkpoints if exceeding limit.
   */
  async #cleanupIfNeeded(): Promise<void> {
    const checkpoints = currentChatCheckpoints.get();

    if (checkpoints.length <= this.#config.maxCheckpointsPerChat) {
      return;
    }

    try {
      const db = await getPGlite();
      const deleted = await dbDeleteOldCheckpoints(db, this.#chatId, this.#config.maxCheckpointsPerChat, {
        preserveManual: this.#config.preserveManualOnCleanup,
      });

      if (deleted > 0) {
        // Reload to sync store
        await this.loadCheckpoints();
        logger.info(`Cleaned up ${deleted} old checkpoints`);
      }
    } catch (error) {
      logger.error('Failed to cleanup checkpoints:', error);
    }
  }

  /**
   * Dispose the service.
   */
  dispose(): void {
    setCurrentChatId(null);
    logger.debug('CheckpointService disposed');
  }
}

/**
 * Create a checkpoint service instance.
 */
export function createCheckpointService(
  options: ConstructorParameters<typeof CheckpointService>[0],
): CheckpointService {
  return new CheckpointService(options);
}
