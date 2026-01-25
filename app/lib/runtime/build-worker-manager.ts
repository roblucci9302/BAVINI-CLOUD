/**
 * =============================================================================
 * BAVINI CLOUD - Build Worker Manager
 * =============================================================================
 * Manages communication with the Build Worker for off-thread compilation.
 * Provides a Promise-based API for builds and handles worker lifecycle.
 *
 * Phase 1.1 Implementation
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';
import type { BuildOptions, BundleResult, BuildError, BuildWarning } from './types';

const logger = createScopedLogger('BuildWorkerManager');

// =============================================================================
// Types
// =============================================================================

interface BuildPayload {
  files: Record<string, string>;
  bootstrapEntry: string;
  entryDir: string;
  options: {
    minify: boolean;
    sourcemap: boolean;
    mode: 'development' | 'production';
    define?: Record<string, string>;
  };
  jsxConfig: {
    jsx: 'transform' | 'automatic';
    jsxImportSource?: string;
  };
}

interface WorkerRequest {
  id: string;
  type: 'init' | 'build' | 'dispose';
  payload?: BuildPayload;
}

interface WorkerResponse {
  id: string;
  type: 'init_done' | 'build_result' | 'build_error' | 'error' | 'ready';
  result?: {
    code: string;
    css: string;
    errors: BuildError[];
    warnings: BuildWarning[];
    buildTime: number;
  };
  error?: string;
}

interface PendingRequest {
  resolve: (result: BundleResult) => void;
  reject: (error: Error) => void;
  timeout: ReturnType<typeof setTimeout>;
}

// =============================================================================
// Constants
// =============================================================================

const BUILD_TIMEOUT_MS = 60000; // 60 seconds
const INIT_TIMEOUT_MS = 30000; // 30 seconds

// =============================================================================
// BuildWorkerManager
// =============================================================================

export class BuildWorkerManager {
  private worker: Worker | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;
  private pendingRequests: Map<string, PendingRequest> = new Map();
  private workerReady = false;

  /**
   * Check if Web Workers are supported
   */
  static isSupported(): boolean {
    return typeof Worker !== 'undefined';
  }

  /**
   * Initialize the build worker
   */
  async init(): Promise<void> {
    if (this.initialized) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = this._init();
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    if (!BuildWorkerManager.isSupported()) {
      throw new Error('Web Workers are not supported in this environment');
    }

    logger.info('Initializing Build Worker...');

    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error('Worker initialization timed out'));
      }, INIT_TIMEOUT_MS);

      try {
        // Create worker using Vite's worker import syntax
        this.worker = new Worker(new URL('../../../workers/build.worker.ts', import.meta.url), {
          type: 'module',
          name: 'build-worker',
        });

        this.worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
          this.handleMessage(event.data);

          // Handle initial ready message
          if (event.data.type === 'ready') {
            this.workerReady = true;
            logger.debug('Worker signaled ready');
          }
        };

        this.worker.onerror = (error) => {
          logger.error('Worker error:', error);
          this.handleWorkerError(error);
        };

        // Send init message
        const initId = crypto.randomUUID();

        const initHandler = (event: MessageEvent<WorkerResponse>) => {
          if (event.data.id === initId && event.data.type === 'init_done') {
            clearTimeout(timeoutId);
            this.initialized = true;
            logger.info('Build Worker initialized successfully');
            resolve();
          }
        };

        this.worker.addEventListener('message', initHandler, { once: true });

        // Wait a tick for worker to be ready before sending init
        setTimeout(() => {
          this.worker?.postMessage({ id: initId, type: 'init' } as WorkerRequest);
        }, 100);
      } catch (error) {
        clearTimeout(timeoutId);
        reject(error);
      }
    });
  }

  /**
   * Handle incoming messages from the worker
   */
  private handleMessage(data: WorkerResponse): void {
    if (!data.id) return;

    const pending = this.pendingRequests.get(data.id);
    if (!pending) return;

    clearTimeout(pending.timeout);
    this.pendingRequests.delete(data.id);

    switch (data.type) {
      case 'build_result':
        if (data.result) {
          pending.resolve({
            code: data.result.code,
            css: data.result.css,
            errors: data.result.errors,
            warnings: data.result.warnings,
            buildTime: data.result.buildTime,
            hash: this.generateHash(data.result.code),
          });
        } else {
          pending.reject(new Error('Build result is empty'));
        }
        break;

      case 'build_error':
      case 'error':
        pending.reject(new Error(data.error || 'Unknown build error'));
        break;

      default:
        logger.warn(`Unknown response type: ${data.type}`);
    }
  }

  /**
   * Handle worker errors
   */
  private handleWorkerError(error: ErrorEvent): void {
    // Reject all pending requests
    for (const [id, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout);
      pending.reject(new Error(`Worker error: ${error.message}`));
      this.pendingRequests.delete(id);
    }
  }

  /**
   * Build project using the worker
   */
  async build(
    files: Map<string, string>,
    bootstrapEntry: string,
    entryDir: string,
    options: BuildOptions,
    jsxConfig: { jsx: 'transform' | 'automatic'; jsxImportSource?: string }
  ): Promise<BundleResult> {
    if (!this.initialized) {
      await this.init();
    }

    if (!this.worker) {
      throw new Error('Worker not available');
    }

    const id = crypto.randomUUID();
    const startTime = performance.now();

    // Convert Map to Record for serialization
    const filesRecord: Record<string, string> = {};
    for (const [path, content] of files) {
      filesRecord[path] = content;
    }

    const payload: BuildPayload = {
      files: filesRecord,
      bootstrapEntry,
      entryDir,
      options: {
        minify: options.minify ?? options.mode === 'production',
        sourcemap: options.sourcemap ?? false,
        mode: options.mode,
        define: options.define,
      },
      jsxConfig,
    };

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Build timed out after ${BUILD_TIMEOUT_MS / 1000}s`));
      }, BUILD_TIMEOUT_MS);

      this.pendingRequests.set(id, { resolve, reject, timeout });

      this.worker!.postMessage({ id, type: 'build', payload } as WorkerRequest);

      logger.debug(`Build request sent: ${id}`);
    });
  }

  /**
   * Generate a simple hash for the bundle
   */
  private generateHash(code: string): string {
    let hash = 0;
    for (let i = 0; i < code.length; i++) {
      const char = code.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }

  /**
   * Check if the worker is ready
   */
  isReady(): boolean {
    return this.initialized && this.workerReady;
  }

  /**
   * Dispose the worker and clean up resources
   */
  async dispose(): Promise<void> {
    if (this.worker) {
      // Send dispose message
      const id = crypto.randomUUID();
      this.worker.postMessage({ id, type: 'dispose' } as WorkerRequest);

      // Cancel all pending requests
      for (const [requestId, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout);
        pending.reject(new Error('Worker disposed'));
        this.pendingRequests.delete(requestId);
      }

      // Terminate worker
      this.worker.terminate();
      this.worker = null;
    }

    this.initialized = false;
    this.initPromise = null;
    this.workerReady = false;

    logger.info('Build Worker disposed');
  }
}

// Singleton instance
let buildWorkerManager: BuildWorkerManager | null = null;

/**
 * Get the singleton BuildWorkerManager instance
 */
export function getBuildWorkerManager(): BuildWorkerManager {
  if (!buildWorkerManager) {
    buildWorkerManager = new BuildWorkerManager();
  }
  return buildWorkerManager;
}

/**
 * Dispose the singleton instance
 */
export async function disposeBuildWorkerManager(): Promise<void> {
  if (buildWorkerManager) {
    await buildWorkerManager.dispose();
    buildWorkerManager = null;
  }
}
