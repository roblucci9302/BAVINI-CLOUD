/**
 * Incremental checkpoint support via file diffs.
 * Stores only changes between checkpoints for space efficiency.
 */

import type { FileMap, File } from '~/lib/stores/files';
import type { Message } from '~/types/message';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CheckpointDiff');

/**
 * Type of change in a diff entry.
 */
export type DiffOperation = 'add' | 'modify' | 'delete';

/**
 * A single file diff entry.
 */
export interface FileDiffEntry {
  path: string;
  operation: DiffOperation;
  content?: string; // Present for 'add' and 'modify', absent for 'delete'
  isBinary?: boolean;
}

/**
 * Complete diff between two file states.
 */
export interface FilesDiff {
  entries: FileDiffEntry[];
  addedCount: number;
  modifiedCount: number;
  deletedCount: number;
  unchangedCount: number;
}

/**
 * Incremental checkpoint data.
 */
export interface IncrementalSnapshot {
  parentId: string;
  filesDiff: FilesDiff;
  messagesSnapshot: Message[]; // Messages are always stored fully (small)
  timestamp: string;
}

/**
 * Calculate the diff between two file maps.
 */
export function calculateFilesDiff(previous: FileMap, current: FileMap): FilesDiff {
  const entries: FileDiffEntry[] = [];
  let addedCount = 0;
  let modifiedCount = 0;
  let deletedCount = 0;
  let unchangedCount = 0;

  const previousPaths = new Set(Object.keys(previous));
  const currentPaths = new Set(Object.keys(current));

  // Find added and modified files
  for (const path of currentPaths) {
    const currentEntry = current[path];
    const previousEntry = previous[path];

    if (currentEntry?.type !== 'file') {
      continue;
    }

    if (!previousPaths.has(path) || previousEntry?.type !== 'file') {
      // New file
      entries.push({
        path,
        operation: 'add',
        content: currentEntry.content,
        isBinary: currentEntry.isBinary,
      });
      addedCount++;
    } else if (currentEntry.content !== previousEntry.content) {
      // Modified file
      entries.push({
        path,
        operation: 'modify',
        content: currentEntry.content,
        isBinary: currentEntry.isBinary,
      });
      modifiedCount++;
    } else {
      unchangedCount++;
    }
  }

  // Find deleted files
  for (const path of previousPaths) {
    const previousEntry = previous[path];

    if (previousEntry?.type !== 'file') {
      continue;
    }

    if (!currentPaths.has(path) || current[path]?.type !== 'file') {
      entries.push({
        path,
        operation: 'delete',
      });
      deletedCount++;
    }
  }

  return {
    entries,
    addedCount,
    modifiedCount,
    deletedCount,
    unchangedCount,
  };
}

/**
 * Apply a diff to a base file map to get the resulting state.
 */
export function applyFilesDiff(base: FileMap, diff: FilesDiff): FileMap {
  const result: FileMap = { ...base };

  for (const entry of diff.entries) {
    switch (entry.operation) {
      case 'add':
      case 'modify':
        result[entry.path] = {
          type: 'file',
          content: entry.content ?? '',
          isBinary: entry.isBinary ?? false,
        } as File;
        break;
      case 'delete':
        delete result[entry.path];
        break;
    }
  }

  return result;
}

/**
 * Check if a diff is worth storing (has changes).
 */
export function isDiffEmpty(diff: FilesDiff): boolean {
  return diff.entries.length === 0;
}

/**
 * Calculate the size of a diff in bytes (approximate).
 */
export function calculateDiffSize(diff: FilesDiff): number {
  let size = 0;

  for (const entry of diff.entries) {
    size += entry.path.length;

    if (entry.content) {
      size += new TextEncoder().encode(entry.content).length;
    }
  }

  return size;
}

/**
 * Calculate the size of a full snapshot in bytes.
 */
export function calculateSnapshotSize(files: FileMap): number {
  let size = 0;

  for (const [path, entry] of Object.entries(files)) {
    if (entry?.type === 'file') {
      size += path.length;
      size += new TextEncoder().encode(entry.content).length;
    }
  }

  return size;
}

/**
 * Determine if incremental storage is beneficial.
 * Returns true if diff is significantly smaller than full snapshot.
 */
export function shouldUseIncremental(
  diff: FilesDiff,
  fullSnapshot: FileMap,
  threshold: number = 0.5, // Use incremental if diff is less than 50% of full
): boolean {
  if (isDiffEmpty(diff)) {
    return false; // No changes, no need for checkpoint
  }

  const diffSize = calculateDiffSize(diff);
  const fullSize = calculateSnapshotSize(fullSnapshot);

  if (fullSize === 0) {
    return false;
  }

  const ratio = diffSize / fullSize;

  logger.debug(`Diff ratio: ${(ratio * 100).toFixed(1)}% (${diffSize} / ${fullSize} bytes)`);

  return ratio < threshold;
}

/**
 * Create a diff summary for logging/display.
 */
export function getDiffSummary(diff: FilesDiff): string {
  const parts: string[] = [];

  if (diff.addedCount > 0) {
    parts.push(`+${diff.addedCount}`);
  }

  if (diff.modifiedCount > 0) {
    parts.push(`~${diff.modifiedCount}`);
  }

  if (diff.deletedCount > 0) {
    parts.push(`-${diff.deletedCount}`);
  }

  return parts.join(' ') || 'no changes';
}

/**
 * Reconstruct full state from a chain of incremental snapshots.
 */
export async function reconstructFromChain(chain: Array<{ files?: FileMap; diff?: FilesDiff }>): Promise<FileMap> {
  if (chain.length === 0) {
    return {};
  }

  // Start with the first full snapshot
  const first = chain[0];

  if (!first.files) {
    throw new Error('Chain must start with a full snapshot');
  }

  let result = { ...first.files };

  // Apply each subsequent diff
  for (let i = 1; i < chain.length; i++) {
    const item = chain[i];

    if (item.diff) {
      result = applyFilesDiff(result, item.diff);
    } else if (item.files) {
      // This is a full snapshot, restart from here
      result = { ...item.files };
    }
  }

  return result;
}
