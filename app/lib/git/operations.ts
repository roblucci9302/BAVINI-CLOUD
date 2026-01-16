/**
 * Git operations using isomorphic-git.
 * All operations run entirely in the browser using LightningFS.
 *
 * Note: LightningFS is lazy-initialized to avoid SSR issues.
 * It requires IndexedDB which is only available in browsers.
 */

import git from 'isomorphic-git';
import http from 'isomorphic-git/http/web';
import { getCorsProxyUrl } from './cors-proxy';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Git');

// Import du type LightningFS
import type FS from '@isomorphic-git/lightning-fs';

/**
 * Type pour le système de fichiers LightningFS
 */
type LightningFSInstance = FS;

// Lazy-initialized filesystem (browser-only)
let _fs: LightningFSInstance | null = null;

/**
 * Get the LightningFS instance, initializing it if needed.
 * This is lazy-loaded to avoid SSR issues with IndexedDB.
 */
async function getFileSystem() {
  if (_fs) {
    return _fs;
  }

  // Dynamic import to avoid SSR issues
  const LightningFS = (await import('@isomorphic-git/lightning-fs')).default;
  _fs = new LightningFS('bavini-git');

  return _fs;
}

// Synchronous getter for already-initialized fs (used by getFs export)
function getFileSystemSync() {
  if (!_fs) {
    throw new Error('Git filesystem not initialized. Call a git operation first.');
  }

  return _fs;
}

// default author for commits
const DEFAULT_AUTHOR = {
  name: 'BAVINI User',
  email: 'user@bavini.app',
};

export interface CloneOptions {
  url: string;
  dir: string;
  branch?: string;
  depth?: number;
  onProgress?: (progress: GitProgress) => void;
  onAuth?: () => Promise<GitAuth | null>;
}

export interface GitProgress {
  phase: string;
  loaded: number;
  total: number;
  percent: number;
}

export interface GitAuth {
  username: string;
  password: string; // can be a personal access token
}

export interface CommitOptions {
  dir: string;
  message: string;
  author?: {
    name: string;
    email: string;
  };
}

export interface PushOptions {
  dir: string;
  remote?: string;
  branch?: string;
  onAuth?: () => Promise<GitAuth | null>;
  onProgress?: (progress: GitProgress) => void;
}

export interface PullOptions {
  dir: string;
  remote?: string;
  branch?: string;
  onAuth?: () => Promise<GitAuth | null>;
  onProgress?: (progress: GitProgress) => void;
}

export interface FileStatus {
  path: string;
  status: 'modified' | 'added' | 'deleted' | 'untracked' | 'unchanged';
}

export interface LogEntry {
  oid: string;
  message: string;
  author: {
    name: string;
    email: string;
    timestamp: number;
  };
}

/**
 * Get the LightningFS instance.
 * Must be called after any git operation has been performed (which initializes the fs).
 * For async initialization, use the git operations directly.
 */
export function getFs() {
  return getFileSystemSync();
}

/**
 * Clone a repository.
 */
export async function clone(options: CloneOptions): Promise<void> {
  const { url, dir, branch, depth = 1, onProgress, onAuth } = options;
  const fs = await getFileSystem();

  logger.info(`Cloning ${url} to ${dir}`);

  try {
    await git.clone({
      fs,
      http,
      dir,
      url,
      ref: branch,
      singleBranch: true,
      depth,
      corsProxy: getCorsProxyUrl(),
      onProgress: onProgress
        ? (event) => {
            onProgress({
              phase: event.phase,
              loaded: event.loaded,
              total: event.total || 0,
              percent: event.total ? Math.round((event.loaded / event.total) * 100) : 0,
            });
          }
        : undefined,
      onAuth: onAuth
        ? async () => {
            const auth = await onAuth();

            if (auth) {
              return { username: auth.username, password: auth.password };
            }

            return { cancel: true };
          }
        : undefined,
    });

    logger.info(`Successfully cloned ${url}`);
  } catch (error) {
    logger.error('Clone failed:', error);
    throw error;
  }
}

/**
 * Initialize a new repository.
 */
export async function init(dir: string): Promise<void> {
  const fs = await getFileSystem();
  logger.info(`Initializing repository in ${dir}`);

  await git.init({ fs, dir, defaultBranch: 'main' });

  logger.info('Repository initialized');
}

/**
 * Get the current branch name.
 */
export async function currentBranch(dir: string): Promise<string | undefined> {
  const fs = await getFileSystem();

  try {
    const branch = await git.currentBranch({ fs, dir });
    return branch || undefined;
  } catch {
    return undefined;
  }
}

/**
 * List all branches.
 */
export async function listBranches(dir: string): Promise<string[]> {
  const fs = await getFileSystem();

  try {
    return await git.listBranches({ fs, dir });
  } catch {
    return [];
  }
}

/**
 * Get the status of all files in the repository.
 */
export async function status(dir: string): Promise<FileStatus[]> {
  const fs = await getFileSystem();

  try {
    const matrix = await git.statusMatrix({ fs, dir });
    const files: FileStatus[] = [];

    for (const [filepath, headStatus, workdirStatus, stageStatus] of matrix) {
      /**
       * Status matrix interpretation:
       * [HEAD, WORKDIR, STAGE]
       * [0, 0, 0] - not in any.
       * [0, 2, 0] - new, untracked.
       * [0, 2, 2] - new, staged.
       * [1, 1, 1] - unchanged.
       * [1, 2, 1] - modified, unstaged.
       * [1, 2, 2] - modified, staged.
       * [1, 0, 0] - deleted, unstaged.
       * [1, 0, 1] - deleted, staged.
       */

      if (headStatus === 0 && workdirStatus === 2 && stageStatus === 0) {
        files.push({ path: filepath, status: 'untracked' });
      } else if (headStatus === 0 && workdirStatus === 2 && stageStatus === 2) {
        files.push({ path: filepath, status: 'added' });
      } else if (headStatus === 1 && workdirStatus === 2) {
        files.push({ path: filepath, status: 'modified' });
      } else if (headStatus === 1 && workdirStatus === 0) {
        files.push({ path: filepath, status: 'deleted' });
      } else if (headStatus === 1 && workdirStatus === 1 && stageStatus === 1) {
        files.push({ path: filepath, status: 'unchanged' });
      }
    }

    return files;
  } catch {
    return [];
  }
}

/**
 * Add files to the staging area.
 */
export async function add(dir: string, filepath: string): Promise<void> {
  const fs = await getFileSystem();
  await git.add({ fs, dir, filepath });
  logger.debug(`Added ${filepath}`);
}

/**
 * Add all files to the staging area.
 */
export async function addAll(dir: string): Promise<void> {
  const fs = await getFileSystem();
  const statusMatrix = await git.statusMatrix({ fs, dir });

  for (const [filepath, headStatus, workdirStatus] of statusMatrix) {
    if (headStatus !== workdirStatus) {
      if (workdirStatus === 0) {
        await git.remove({ fs, dir, filepath });
      } else {
        await git.add({ fs, dir, filepath });
      }
    }
  }

  logger.debug('Added all files');
}

/**
 * Create a commit.
 */
export async function commit(options: CommitOptions): Promise<string> {
  const { dir, message, author = DEFAULT_AUTHOR } = options;
  const fs = await getFileSystem();

  const sha = await git.commit({
    fs,
    dir,
    message,
    author: {
      name: author.name,
      email: author.email,
    },
  });

  logger.info(`Created commit ${sha.slice(0, 7)}`);

  return sha;
}

/**
 * Push to remote.
 */
export async function push(options: PushOptions): Promise<void> {
  const { dir, remote = 'origin', branch, onAuth, onProgress } = options;
  const fs = await getFileSystem();

  const currentRef = branch || (await currentBranch(dir)) || 'main';

  logger.info(`Pushing to ${remote}/${currentRef}`);

  await git.push({
    fs,
    http,
    dir,
    remote,
    ref: currentRef,
    corsProxy: getCorsProxyUrl(),
    onProgress: onProgress
      ? (event) => {
          onProgress({
            phase: event.phase,
            loaded: event.loaded,
            total: event.total || 0,
            percent: event.total ? Math.round((event.loaded / event.total) * 100) : 0,
          });
        }
      : undefined,
    onAuth: onAuth
      ? async () => {
          const auth = await onAuth();

          if (auth) {
            return { username: auth.username, password: auth.password };
          }

          return { cancel: true };
        }
      : undefined,
  });

  logger.info('Push successful');
}

/**
 * Pull from remote.
 */
export async function pull(options: PullOptions): Promise<void> {
  const { dir, remote = 'origin', branch, onAuth, onProgress } = options;
  const fs = await getFileSystem();

  const currentRef = branch || (await currentBranch(dir)) || 'main';

  logger.info(`Pulling from ${remote}/${currentRef}`);

  await git.pull({
    fs,
    http,
    dir,
    remote,
    ref: currentRef,
    singleBranch: true,
    corsProxy: getCorsProxyUrl(),
    author: DEFAULT_AUTHOR,
    onProgress: onProgress
      ? (event) => {
          onProgress({
            phase: event.phase,
            loaded: event.loaded,
            total: event.total || 0,
            percent: event.total ? Math.round((event.loaded / event.total) * 100) : 0,
          });
        }
      : undefined,
    onAuth: onAuth
      ? async () => {
          const auth = await onAuth();

          if (auth) {
            return { username: auth.username, password: auth.password };
          }

          return { cancel: true };
        }
      : undefined,
  });

  logger.info('Pull successful');
}

/**
 * Fetch from remote.
 */
export async function fetch(
  dir: string,
  remote: string = 'origin',
  onAuth?: () => Promise<GitAuth | null>,
): Promise<void> {
  const fs = await getFileSystem();
  logger.info(`Fetching from ${remote}`);

  await git.fetch({
    fs,
    http,
    dir,
    remote,
    corsProxy: getCorsProxyUrl(),
    onAuth: onAuth
      ? async () => {
          const auth = await onAuth();

          if (auth) {
            return { username: auth.username, password: auth.password };
          }

          return { cancel: true };
        }
      : undefined,
  });

  logger.info('Fetch successful');
}

/**
 * Get commit log.
 */
export async function log(dir: string, depth: number = 10): Promise<LogEntry[]> {
  const fs = await getFileSystem();

  try {
    const commits = await git.log({ fs, dir, depth });

    return commits.map((commit) => ({
      oid: commit.oid,
      message: commit.commit.message,
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
        timestamp: commit.commit.author.timestamp,
      },
    }));
  } catch {
    return [];
  }
}

/**
 * Checkout a branch.
 */
export async function checkout(dir: string, ref: string): Promise<void> {
  const fs = await getFileSystem();
  logger.info(`Checking out ${ref}`);

  await git.checkout({ fs, dir, ref });

  logger.info(`Checked out ${ref}`);
}

/**
 * Create a new branch.
 */
export async function createBranch(dir: string, name: string, checkout: boolean = true): Promise<void> {
  const fs = await getFileSystem();
  logger.info(`Creating branch ${name}`);

  await git.branch({ fs, dir, ref: name, checkout });

  logger.info(`Created branch ${name}`);
}

/**
 * Get remotes.
 */
export async function listRemotes(dir: string): Promise<Array<{ remote: string; url: string }>> {
  const fs = await getFileSystem();

  try {
    return await git.listRemotes({ fs, dir });
  } catch {
    return [];
  }
}

/**
 * Add a remote.
 */
export async function addRemote(dir: string, remote: string, url: string): Promise<void> {
  const fs = await getFileSystem();
  await git.addRemote({ fs, dir, remote, url });
  logger.info(`Added remote ${remote}: ${url}`);
}

/**
 * Check if a directory is a git repository.
 */
export async function isGitRepo(dir: string): Promise<boolean> {
  const fs = await getFileSystem();

  try {
    await git.findRoot({ fs, filepath: dir });
    return true;
  } catch {
    return false;
  }
}

/**
 * Read a file from the repository.
 */
export async function readFile(dir: string, filepath: string): Promise<string> {
  const fs = await getFileSystem();
  const content = await fs.promises.readFile(`${dir}/${filepath}`, { encoding: 'utf8' });

  return content as string;
}

/**
 * Write a file to the repository.
 */
export async function writeFile(dir: string, filepath: string, content: string): Promise<void> {
  const fs = await getFileSystem();

  // ensure directory exists
  const parts = filepath.split('/');

  if (parts.length > 1) {
    let currentPath = dir;

    for (let i = 0; i < parts.length - 1; i++) {
      currentPath = `${currentPath}/${parts[i]}`;

      try {
        await fs.promises.mkdir(currentPath);
      } catch {
        // directory might already exist
      }
    }
  }

  await fs.promises.writeFile(`${dir}/${filepath}`, content, { encoding: 'utf8', mode: 0o644 });
}

/**
 * List files in a directory.
 */
export async function listFiles(dir: string, subdir: string = ''): Promise<string[]> {
  const fs = await getFileSystem();
  const fullPath = subdir ? `${dir}/${subdir}` : dir;

  try {
    const entries = await fs.promises.readdir(fullPath);
    return entries as string[];
  } catch {
    return [];
  }
}

/**
 * Delete a repository from the filesystem.
 */
export async function deleteRepo(dir: string): Promise<void> {
  const fs = await getFileSystem();
  logger.info(`Deleting repository ${dir}`);

  // recursively delete all files
  const deleteRecursive = async (path: string) => {
    try {
      const stat = await fs.promises.stat(path);

      if (stat.isDirectory()) {
        const entries = (await fs.promises.readdir(path)) as string[];

        for (const entry of entries) {
          await deleteRecursive(`${path}/${entry}`);
        }

        await fs.promises.rmdir(path);
      } else {
        await fs.promises.unlink(path);
      }
    } catch {
      // file might not exist
    }
  };

  await deleteRecursive(dir);

  logger.info('Repository deleted');
}
