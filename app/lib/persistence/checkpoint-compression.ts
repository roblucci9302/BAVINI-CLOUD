/**
 * Compression integration for checkpoint persistence.
 * Handles compressing/decompressing checkpoint data for storage.
 */

import type { FileMap } from '~/lib/stores/files';
import type { Message } from '~/types/message';
import type { ActionState } from '~/lib/runtime/action-runner';
import { compressString, decompressString, calculateStringSize } from '~/lib/services/checkpoints/compression';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CheckpointCompression');

/** Timeout for compression operations (30 seconds) */
const COMPRESSION_TIMEOUT_MS = 30_000;

/**
 * Execute a promise with a timeout.
 */
async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, operationName: string): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout>;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`${operationName} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    clearTimeout(timeoutId!);
  }
}

/**
 * Compression marker prefix to identify compressed data.
 */
const COMPRESSION_MARKER = 'GZIP:';

/**
 * Snapshot data structure for compression.
 */
export interface SnapshotData {
  filesSnapshot: FileMap;
  messagesSnapshot: Message[];
  actionsSnapshot?: Record<string, ActionState>;
}

/**
 * Compressed snapshot for storage.
 */
export interface CompressedSnapshot {
  files: string;
  messages: string;
  actions: string | null;
  compressed: boolean;
  originalSize: number;
  compressedSize: number;
}

/**
 * Check if a string is compressed (has our marker prefix).
 */
export function isCompressed(data: string): boolean {
  return data.startsWith(COMPRESSION_MARKER);
}

/**
 * Compress a JSON-serializable object.
 */
async function compressJson<T>(data: T): Promise<string> {
  const json = JSON.stringify(data);
  const compressed = await compressString(json);

  // Add marker to identify compressed data
  return COMPRESSION_MARKER + compressed;
}

/**
 * Decompress a compressed string back to JSON.
 */
async function decompressJson<T>(data: string): Promise<T> {
  if (!isCompressed(data)) {
    // Not compressed, parse directly
    return JSON.parse(data);
  }

  // Remove marker and decompress
  const compressed = data.slice(COMPRESSION_MARKER.length);
  const json = await decompressString(compressed);

  return JSON.parse(json);
}

/**
 * Compress snapshot data for storage.
 */
export async function compressSnapshot(
  data: SnapshotData,
  threshold: number = 100 * 1024, // 100KB
): Promise<CompressedSnapshot> {
  const filesJson = JSON.stringify(data.filesSnapshot);
  const messagesJson = JSON.stringify(data.messagesSnapshot);
  const actionsJson = data.actionsSnapshot ? JSON.stringify(data.actionsSnapshot) : null;

  const originalSize =
    calculateStringSize(filesJson) +
    calculateStringSize(messagesJson) +
    (actionsJson ? calculateStringSize(actionsJson) : 0);

  // Only compress if above threshold
  const shouldCompress = originalSize >= threshold;

  if (!shouldCompress) {
    return {
      files: filesJson,
      messages: messagesJson,
      actions: actionsJson,
      compressed: false,
      originalSize,
      compressedSize: originalSize,
    };
  }

  try {
    // Compress each field separately for better error handling (with timeout)
    const compressionPromise = Promise.all([
      compressJson(data.filesSnapshot),
      compressJson(data.messagesSnapshot),
      actionsJson ? compressJson(data.actionsSnapshot) : Promise.resolve(null),
    ]);

    const [compressedFiles, compressedMessages, compressedActions] = await withTimeout(
      compressionPromise,
      COMPRESSION_TIMEOUT_MS,
      'Checkpoint compression',
    );

    const compressedSize =
      calculateStringSize(compressedFiles) +
      calculateStringSize(compressedMessages) +
      (compressedActions ? calculateStringSize(compressedActions) : 0);

    const savings = ((1 - compressedSize / originalSize) * 100).toFixed(1);
    logger.info(`Compressed snapshot: ${originalSize} -> ${compressedSize} bytes (${savings}% reduction)`);

    return {
      files: compressedFiles,
      messages: compressedMessages,
      actions: compressedActions,
      compressed: true,
      originalSize,
      compressedSize,
    };
  } catch (error) {
    logger.error('Compression failed, storing uncompressed:', error);

    return {
      files: filesJson,
      messages: messagesJson,
      actions: actionsJson,
      compressed: false,
      originalSize,
      compressedSize: originalSize,
    };
  }
}

/**
 * Decompress snapshot data from storage.
 */
export async function decompressSnapshot(
  files: string,
  messages: string,
  actions: string | null,
): Promise<SnapshotData> {
  try {
    const [filesSnapshot, messagesSnapshot, actionsSnapshot] = await Promise.all([
      decompressJson<FileMap>(files),
      decompressJson<Message[]>(messages),
      actions ? decompressJson<Record<string, ActionState>>(actions) : Promise.resolve(undefined),
    ]);

    return {
      filesSnapshot,
      messagesSnapshot,
      actionsSnapshot,
    };
  } catch (error) {
    logger.error('Decompression failed:', error);
    throw new Error('Failed to decompress snapshot data');
  }
}

/**
 * Calculate size savings from compression.
 */
export function calculateCompressionRatio(originalSize: number, compressedSize: number): number {
  if (originalSize === 0) {
    return 0;
  }

  return (1 - compressedSize / originalSize) * 100;
}
