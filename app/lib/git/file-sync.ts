/**
 * GitFileSync - Bidirectional sync between LightningFS (isomorphic-git) and WebContainer.
 *
 * LightningFS stores git data in IndexedDB, while WebContainer has its own filesystem.
 * This service bridges the gap by copying files between them after git operations.
 */

import type { WebContainer } from '@webcontainer/api';
import { getFs } from './operations';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('GitFileSync');

// patterns to exclude from sync
const EXCLUDE_PATTERNS = ['.git', 'node_modules'];

interface SyncStats {
  files: number;
  folders: number;
  errors: string[];
}

/**
 * Check if a path should be excluded from sync.
 */
function shouldExclude(path: string): boolean {
  const parts = path.split('/');

  return parts.some((part) => EXCLUDE_PATTERNS.includes(part));
}

/**
 * Recursively list all files in a LightningFS directory.
 */
async function listFilesRecursive(dir: string, basePath: string = ''): Promise<string[]> {
  const fs = getFs();
  const files: string[] = [];

  try {
    const entries = (await fs.promises.readdir(dir)) as string[];

    for (const entry of entries) {
      const fullPath = `${dir}/${entry}`;
      const relativePath = basePath ? `${basePath}/${entry}` : entry;

      if (shouldExclude(relativePath)) {
        continue;
      }

      try {
        const stat = await fs.promises.stat(fullPath);

        if (stat.isDirectory()) {
          const subFiles = await listFilesRecursive(fullPath, relativePath);
          files.push(...subFiles);
        } else {
          files.push(relativePath);
        }
      } catch {
        // skip files that can't be stat'd
      }
    }
  } catch {
    // directory might not exist
  }

  return files;
}

/**
 * Recursively list all directories in a LightningFS directory.
 */
async function listDirsRecursive(dir: string, basePath: string = ''): Promise<string[]> {
  const fs = getFs();
  const dirs: string[] = [];

  try {
    const entries = (await fs.promises.readdir(dir)) as string[];

    for (const entry of entries) {
      const fullPath = `${dir}/${entry}`;
      const relativePath = basePath ? `${basePath}/${entry}` : entry;

      if (shouldExclude(relativePath)) {
        continue;
      }

      try {
        const stat = await fs.promises.stat(fullPath);

        if (stat.isDirectory()) {
          dirs.push(relativePath);

          const subDirs = await listDirsRecursive(fullPath, relativePath);
          dirs.push(...subDirs);
        }
      } catch {
        // skip dirs that can't be stat'd
      }
    }
  } catch {
    // directory might not exist
  }

  return dirs;
}

// Batch size for parallel operations (avoid overwhelming the system)
const BATCH_SIZE = 10;

/**
 * Process items in parallel batches.
 */
async function processBatch<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  batchSize: number = BATCH_SIZE,
): Promise<{ results: R[]; errors: string[] }> {
  const results: R[] = [];
  const errors: string[] = [];

  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize);
    const batchResults = await Promise.allSettled(batch.map(processor));

    for (const result of batchResults) {
      if (result.status === 'fulfilled') {
        results.push(result.value);
      } else {
        errors.push(String(result.reason));
      }
    }
  }

  return { results, errors };
}

/**
 * Sync files from LightningFS to WebContainer.
 * Call this after clone, pull, or checkout operations.
 * Optimized with parallel batch processing for better performance.
 */
export async function syncToWebContainer(webcontainer: WebContainer, gitDir: string): Promise<SyncStats> {
  const fs = getFs();
  const stats: SyncStats = { files: 0, folders: 0, errors: [] };

  logger.info(`Syncing from LightningFS to WebContainer: ${gitDir}`);

  try {
    // first, create all directories in parallel batches
    const dirs = await listDirsRecursive(gitDir);

    const dirResults = await processBatch(dirs, async (dir) => {
      await webcontainer.fs.mkdir(dir, { recursive: true });
      return dir;
    });

    stats.folders = dirResults.results.length;
    stats.errors.push(...dirResults.errors.map((e) => `Dir error: ${e}`));

    // then, copy all files in parallel batches
    const files = await listFilesRecursive(gitDir);

    const fileResults = await processBatch(files, async (file) => {
      const content = await fs.promises.readFile(`${gitDir}/${file}`);

      // content can be string or Uint8Array
      if (typeof content === 'string') {
        await webcontainer.fs.writeFile(file, content);
      } else {
        await webcontainer.fs.writeFile(file, content as Uint8Array);
      }

      return file;
    });

    stats.files = fileResults.results.length;
    stats.errors.push(...fileResults.errors.map((e) => `File error: ${e}`));

    logger.info(`Sync complete: ${stats.files} files, ${stats.folders} folders`);
  } catch (error) {
    logger.error('Sync failed:', error);
    throw error;
  }

  return stats;
}

/**
 * Sync a specific file from WebContainer to LightningFS.
 * Call this before git add/commit to ensure git sees the latest changes.
 */
export async function syncFileToLightningFS(
  webcontainer: WebContainer,
  gitDir: string,
  filePath: string,
): Promise<void> {
  const fs = getFs();

  if (shouldExclude(filePath)) {
    return;
  }

  try {
    // read from WebContainer
    const content = await webcontainer.fs.readFile(filePath);

    // ensure directory exists in LightningFS
    const dir = filePath.split('/').slice(0, -1).join('/');

    if (dir) {
      await ensureLightningFSDir(gitDir, dir);
    }

    // write to LightningFS
    await fs.promises.writeFile(`${gitDir}/${filePath}`, content);

    logger.debug(`Synced file to LightningFS: ${filePath}`);
  } catch (error) {
    logger.error(`Failed to sync file to LightningFS: ${filePath}`, error);
    throw error;
  }
}

/**
 * Sync all modified files from WebContainer to LightningFS.
 * Call this before git add/commit operations.
 * Optimized with parallel batch processing.
 */
export async function syncAllToLightningFS(
  webcontainer: WebContainer,
  gitDir: string,
  files: string[],
): Promise<SyncStats> {
  const stats: SyncStats = { files: 0, folders: 0, errors: [] };

  // Filter out excluded files first
  const filesToSync = files.filter((file) => !shouldExclude(file));

  logger.info(`Syncing ${filesToSync.length} files to LightningFS`);

  const results = await processBatch(filesToSync, async (file) => {
    await syncFileToLightningFS(webcontainer, gitDir, file);
    return file;
  });

  stats.files = results.results.length;
  stats.errors.push(...results.errors);

  logger.info(`Sync to LightningFS complete: ${stats.files} files`);

  return stats;
}

/**
 * Ensure a directory exists in LightningFS.
 */
async function ensureLightningFSDir(gitDir: string, relativePath: string): Promise<void> {
  const fs = getFs();
  const parts = relativePath.split('/');
  let currentPath = gitDir;

  for (const part of parts) {
    currentPath = `${currentPath}/${part}`;

    try {
      await fs.promises.mkdir(currentPath);
    } catch {
      // directory might already exist
    }
  }
}

/**
 * Clear all files from WebContainer working directory.
 * Useful before a fresh clone to avoid conflicts.
 */
export async function clearWebContainerWorkdir(webcontainer: WebContainer): Promise<void> {
  logger.info('Clearing WebContainer working directory');

  try {
    const entries = await webcontainer.fs.readdir('/', { withFileTypes: true });

    for (const entry of entries) {
      const name = typeof entry === 'string' ? entry : entry.name;

      if (shouldExclude(name)) {
        continue;
      }

      try {
        await webcontainer.fs.rm(name, { recursive: true });
      } catch {
        // file/dir might not exist or be locked
      }
    }

    logger.info('WebContainer working directory cleared');
  } catch (error) {
    logger.error('Failed to clear WebContainer working directory:', error);
  }
}
