/**
 * Type definitions for the Checkpoints/Time Travel feature.
 * Enables saving and restoring project states.
 */

import type { Message } from '~/types/message';
import type { FileMap } from '~/lib/stores/files';
import type { ActionState } from '~/lib/runtime/action-runner';

/**
 * Trigger type for checkpoint creation.
 */
export type CheckpointTriggerType = 'auto' | 'manual' | 'before_action';

/**
 * Checkpoint data structure representing a saved project state.
 */
export interface Checkpoint {
  /** Unique checkpoint identifier (format: ckpt_<timestamp>_<random>) */
  id: string;

  /** Associated chat/conversation ID */
  chatId: string;

  /** Complete snapshot of all project files */
  filesSnapshot: FileMap;

  /** Conversation messages at the time of checkpoint */
  messagesSnapshot: Message[];

  /** Optional snapshot of action states */
  actionsSnapshot?: Record<string, ActionState>;

  /** User-provided or auto-generated description */
  description?: string;

  /** What triggered this checkpoint */
  triggerType: CheckpointTriggerType;

  /** Associated message ID (for before_action checkpoints) */
  messageId?: string;

  /** Whether this is a full snapshot or incremental */
  isFullSnapshot: boolean;

  /** Parent checkpoint ID for incremental snapshots */
  parentCheckpointId?: string;

  /** Whether the snapshot data is compressed */
  compressed: boolean;

  /** Size of the checkpoint in bytes */
  sizeBytes?: number;

  /** ISO timestamp of creation */
  createdAt: string;
}

/**
 * Input for creating a new checkpoint.
 */
export interface CheckpointInput {
  chatId: string;
  filesSnapshot: FileMap;
  messagesSnapshot: Message[];
  actionsSnapshot?: Record<string, ActionState>;
  description?: string;
  triggerType: CheckpointTriggerType;
  messageId?: string;
  parentCheckpointId?: string;
  compressed?: boolean;
}

/**
 * Options for restoring a checkpoint.
 */
export interface RestoreOptions {
  /** Whether to restore project files */
  restoreFiles: boolean;

  /** Whether to restore conversation history */
  restoreConversation: boolean;

  /** Whether to create a restore point before restoring */
  createRestorePoint: boolean;
}

/**
 * Result of a restore operation.
 */
export interface RestoreResult {
  success: boolean;
  restoredCheckpointId: string;
  restorePointId?: string;
  filesRestored: number;
  messagesRestored: number;
  error?: string;
}

/**
 * Checkpoint event types for subscriptions.
 */
export type CheckpointEvent =
  | { type: 'created'; checkpoint: Checkpoint }
  | { type: 'restored'; checkpointId: string; restorePointId?: string }
  | { type: 'deleted'; checkpointId: string }
  | { type: 'updated'; checkpointId: string; field: 'description' };

/**
 * Configuration for checkpoint behavior.
 */
export interface CheckpointConfig {
  /** Maximum checkpoints to keep per chat */
  maxCheckpointsPerChat: number;

  /** Minimum time between auto-checkpoints (ms) */
  autoCheckpointThrottleMs: number;

  /** Files to exclude from snapshots */
  excludedFiles: string[];

  /** Whether to preserve manual checkpoints during cleanup */
  preserveManualOnCleanup: boolean;

  /** Enable compression for large snapshots */
  enableCompression: boolean;

  /** Size threshold for compression (bytes) */
  compressionThreshold: number;
}

/**
 * Default checkpoint configuration.
 */
export const DEFAULT_CHECKPOINT_CONFIG: CheckpointConfig = {
  maxCheckpointsPerChat: 50,
  autoCheckpointThrottleMs: 60000, // 1 minute
  excludedFiles: ['.env', '.env.local', '.env.production', 'credentials.json', '.git'],
  preserveManualOnCleanup: true,
  enableCompression: true, // Enabled by default for better performance
  compressionThreshold: 100 * 1024, // 100KB - compress larger snapshots
};

/**
 * Statistics about checkpoints for a chat.
 */
export interface CheckpointStats {
  totalCount: number;
  autoCount: number;
  manualCount: number;
  beforeActionCount: number;
  totalSizeBytes: number;
  oldestCheckpoint?: string;
  newestCheckpoint?: string;
}
