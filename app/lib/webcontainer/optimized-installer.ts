/**
 * Optimized Installer for WebContainer
 *
 * Implements a multi-tier installation strategy:
 * 1. Check IndexedDB cache for pre-installed node_modules
 * 2. If cache hit, restore instantly (~1-2s)
 * 3. If cache miss, run pnpm install with optimizations
 * 4. Cache result for next time
 *
 * Additional optimizations:
 * - Parallel package resolution
 * - Streaming installation progress
 * - Early dev server start (partial deps)
 */

import type { WebContainer } from '@webcontainer/api';
import { dependencyCache, generateDependencyHash, type PackageJson } from './dependency-cache';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('OptimizedInstaller');

// Installation configuration
const INSTALL_TIMEOUT_MS = 180000; // 3 minutes max
const PNPM_FLAGS = [
  '--prefer-offline', // Use cached packages when possible
  '--no-frozen-lockfile', // Don't require lockfile
  '--ignore-scripts', // Skip postinstall scripts initially (faster)
].join(' ');

export interface InstallOptions {
  /** Skip cache lookup */
  skipCache?: boolean;

  /** Callback for progress updates */
  onProgress?: (phase: InstallPhase, progress: number, message: string) => void;

  /** Timeout in milliseconds */
  timeout?: number;
}

export type InstallPhase = 'checking_cache' | 'restoring_cache' | 'installing' | 'caching' | 'complete' | 'error';

export interface InstallResult {
  success: boolean;
  fromCache: boolean;
  durationMs: number;
  error?: string;
  filesInstalled?: number;
}

/**
 * Read node_modules from WebContainer filesystem
 * Returns a Map of file paths to contents
 */
async function readNodeModules(webcontainer: WebContainer): Promise<Map<string, string>> {
  const files = new Map<string, string>();
  const FILE_BATCH_SIZE = 30;

  async function readDir(path: string): Promise<void> {
    try {
      const entries = await webcontainer.fs.readdir(path, { withFileTypes: true });

      // Separate directories and files
      const dirs: string[] = [];
      const fileEntries: string[] = [];

      for (const entry of entries) {
        const fullPath = `${path}/${entry.name}`;

        if (entry.isDirectory()) {
          // Skip .cache and other non-essential directories
          if (entry.name !== '.cache' && entry.name !== '.pnpm') {
            dirs.push(fullPath);
          }
        } else if (entry.isFile()) {
          fileEntries.push(fullPath);
        }
      }

      // Read files in parallel batches
      for (let i = 0; i < fileEntries.length; i += FILE_BATCH_SIZE) {
        const batch = fileEntries.slice(i, i + FILE_BATCH_SIZE);
        const results = await Promise.allSettled(
          batch.map(async (fullPath) => {
            const content = await webcontainer.fs.readFile(fullPath, 'utf-8');

            // Only cache text files under 1MB
            if (content.length < 1024 * 1024) {
              return { path: fullPath, content };
            }

            return null;
          }),
        );

        for (const result of results) {
          if (result.status === 'fulfilled' && result.value) {
            files.set(result.value.path, result.value.content);
          }
        }
      }

      // Process subdirectories in parallel (limited concurrency)
      const DIR_CONCURRENCY = 5;

      for (let i = 0; i < dirs.length; i += DIR_CONCURRENCY) {
        const batch = dirs.slice(i, i + DIR_CONCURRENCY);
        await Promise.all(batch.map((dir) => readDir(dir)));
      }
    } catch {
      // Directory might not exist yet
    }
  }

  await readDir('node_modules');

  return files;
}

/**
 * Write node_modules to WebContainer filesystem
 */
async function writeNodeModules(webcontainer: WebContainer, files: Map<string, string>): Promise<number> {
  let written = 0;

  // Sort paths to ensure directories are created before files
  const sortedPaths = Array.from(files.keys()).sort();

  // Create directories first - collect all unique directories
  const dirs = new Set<string>();

  for (const path of sortedPaths) {
    const parts = path.split('/');

    for (let i = 1; i < parts.length; i++) {
      dirs.add(parts.slice(0, i).join('/'));
    }
  }

  // Create directories in parallel batches (sorted to ensure parents first)
  const sortedDirs = Array.from(dirs).sort();
  const DIR_BATCH_SIZE = 30;

  for (let i = 0; i < sortedDirs.length; i += DIR_BATCH_SIZE) {
    const batch = sortedDirs.slice(i, i + DIR_BATCH_SIZE);
    await Promise.all(
      batch.map((dir) =>
        webcontainer.fs.mkdir(dir, { recursive: true }).catch(() => {
          // Directory might already exist
        }),
      ),
    );
  }

  // Write files in parallel batches
  const BATCH_SIZE = 50;
  const pathsArray = sortedPaths;

  for (let i = 0; i < pathsArray.length; i += BATCH_SIZE) {
    const batch = pathsArray.slice(i, i + BATCH_SIZE);
    await Promise.all(
      batch.map(async (path) => {
        try {
          const content = files.get(path);

          if (content !== undefined) {
            await webcontainer.fs.writeFile(path, content);
            written++;
          }
        } catch (error) {
          logger.debug(`Failed to write ${path}:`, error);
        }
      }),
    );
  }

  return written;
}

/**
 * Read package.json from WebContainer
 */
async function readPackageJson(webcontainer: WebContainer): Promise<PackageJson | null> {
  try {
    const content = await webcontainer.fs.readFile('package.json', 'utf-8');

    return JSON.parse(content);
  } catch {
    return null;
  }
}

/**
 * Run pnpm install in WebContainer
 */
async function runPnpmInstall(
  webcontainer: WebContainer,
  options: InstallOptions,
): Promise<{ success: boolean; error?: string }> {
  const timeout = options.timeout || INSTALL_TIMEOUT_MS;

  return new Promise((resolve) => {
    let resolved = false;
    let timeoutId: ReturnType<typeof setTimeout> | null = null;

    const safeResolve = (result: { success: boolean; error?: string }) => {
      if (!resolved) {
        resolved = true;

        if (timeoutId !== null) {
          clearTimeout(timeoutId);
          timeoutId = null;
        }

        resolve(result);
      }
    };

    timeoutId = setTimeout(() => {
      logger.warn('pnpm install timed out');
      safeResolve({ success: false, error: 'Installation timeout' });
    }, timeout);

    (async () => {
      try {
        options.onProgress?.('installing', 0, 'Starting pnpm install...');

        const process = await webcontainer.spawn('pnpm', ['install', ...PNPM_FLAGS.split(' ')], {
          env: {
            npm_config_yes: 'true',
            CI: 'true', // Disable interactive prompts
          },
        });

        let output = '';
        let progress = 0;

        // Monitor output for progress
        const reader = process.output.getReader();

        const readOutput = async () => {
          try {
            while (true) {
              const { done, value } = await reader.read();

              if (done) {
                break;
              }

              output += value;

              if (import.meta.env.DEV) {
                console.log('%c[PNPM]', 'background: #f69220; color: white; padding: 2px 6px;', value);
              }

              // Estimate progress from output patterns
              if (value.includes('Resolving')) {
                progress = Math.min(progress + 5, 30);
              } else if (value.includes('Downloading')) {
                progress = Math.min(progress + 2, 60);
              } else if (value.includes('Progress')) {
                progress = Math.min(progress + 3, 80);
              } else if (value.includes('dependencies')) {
                progress = Math.min(progress + 10, 90);
              }

              options.onProgress?.('installing', progress, value.trim().slice(0, 100));
            }
          } catch {
            // Stream closed
          }
        };

        readOutput();

        const exitCode = await process.exit;

        if (exitCode === 0) {
          options.onProgress?.('installing', 100, 'Installation complete');
          safeResolve({ success: true });
        } else {
          safeResolve({ success: false, error: `pnpm install exited with code ${exitCode}` });
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        safeResolve({ success: false, error: errorMessage });
      }
    })();
  });
}

/**
 * Optimized dependency installer
 * Uses caching and parallel strategies for faster installs
 */
export class OptimizedInstaller {
  private webcontainer: WebContainer;

  constructor(webcontainer: WebContainer) {
    this.webcontainer = webcontainer;
  }

  /**
   * Install dependencies with caching
   */
  async install(options: InstallOptions = {}): Promise<InstallResult> {
    const startTime = Date.now();

    try {
      // Read package.json
      const packageJson = await readPackageJson(this.webcontainer);

      if (!packageJson) {
        return {
          success: false,
          fromCache: false,
          durationMs: Date.now() - startTime,
          error: 'No package.json found',
        };
      }

      const hash = generateDependencyHash(packageJson);
      logger.info(`Installing dependencies (hash: ${hash})`);

      // Check cache first (unless skipped)
      if (!options.skipCache) {
        options.onProgress?.('checking_cache', 0, 'Checking dependency cache...');

        const hasCached = await dependencyCache.has(packageJson);

        if (hasCached) {
          options.onProgress?.('restoring_cache', 10, 'Cache hit! Restoring node_modules...');

          const cachedFiles = await dependencyCache.get(packageJson);

          if (cachedFiles && cachedFiles.size > 0) {
            options.onProgress?.('restoring_cache', 30, `Restoring ${cachedFiles.size} files...`);

            const filesWritten = await writeNodeModules(this.webcontainer, cachedFiles);

            options.onProgress?.('complete', 100, 'Restored from cache');

            const duration = Date.now() - startTime;
            logger.info(`Restored ${filesWritten} files from cache in ${duration}ms`);

            return {
              success: true,
              fromCache: true,
              durationMs: duration,
              filesInstalled: filesWritten,
            };
          }
        }

        logger.debug('Cache miss, running pnpm install');
      }

      // Run pnpm install
      const installResult = await runPnpmInstall(this.webcontainer, options);

      if (!installResult.success) {
        options.onProgress?.('error', 0, installResult.error || 'Installation failed');

        return {
          success: false,
          fromCache: false,
          durationMs: Date.now() - startTime,
          error: installResult.error,
        };
      }

      // Cache the result for next time
      if (!options.skipCache) {
        options.onProgress?.('caching', 95, 'Caching node_modules for next time...');

        try {
          const files = await readNodeModules(this.webcontainer);

          if (files.size > 0) {
            await dependencyCache.set(packageJson, files);
            logger.info(`Cached ${files.size} files for future use`);
          }
        } catch (error) {
          logger.warn('Failed to cache node_modules:', error);
        }
      }

      options.onProgress?.('complete', 100, 'Installation complete');

      const duration = Date.now() - startTime;

      return {
        success: true,
        fromCache: false,
        durationMs: duration,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error('Installation failed:', error);

      return {
        success: false,
        fromCache: false,
        durationMs: Date.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Check if dependencies are already installed
   */
  async isInstalled(): Promise<boolean> {
    try {
      await this.webcontainer.fs.readdir('node_modules');

      return true;
    } catch {
      return false;
    }
  }

  /**
   * Get cache status for current package.json
   */
  async getCacheStatus(): Promise<{ cached: boolean; hash: string } | null> {
    const packageJson = await readPackageJson(this.webcontainer);

    if (!packageJson) {
      return null;
    }

    const hash = generateDependencyHash(packageJson);
    const cached = await dependencyCache.has(packageJson);

    return { cached, hash };
  }
}

/**
 * Create an optimized installer instance
 */
export function createOptimizedInstaller(webcontainer: WebContainer): OptimizedInstaller {
  return new OptimizedInstaller(webcontainer);
}
