/**
 * =============================================================================
 * BAVINI CLOUD - Browser Build Service
 * =============================================================================
 * Service that connects the BrowserBuildAdapter to the Workbench stores.
 * Manages the build lifecycle and updates preview state.
 * =============================================================================
 */

import { BrowserBuildAdapter } from './adapters/browser-build-adapter';
import type { PreviewInfo, BuildOptions, BundleResult, FileMap } from './types';
import { createScopedLogger } from '~/utils/logger';
import { warmupCache, moduleCache } from './adapters/browser-build';

const logger = createScopedLogger('BrowserBuildService');

// Lazy import to avoid circular dependency
let workbenchStorePromise: Promise<typeof import('~/lib/stores/workbench')> | null = null;

async function getWorkbenchStore() {
  if (!workbenchStorePromise) {
    workbenchStorePromise = import('~/lib/stores/workbench');
  }
  return (await workbenchStorePromise).workbenchStore;
}

/**
 * Singleton service for managing browser-based builds
 */
class BrowserBuildService {
  private adapter: BrowserBuildAdapter | null = null;
  private initialized = false;
  private initPromise: Promise<void> | null = null;

  /**
   * Initialize the browser build service
   */
  async init(): Promise<void> {
    if (this.initialized) {
      return;
    }

    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._init();
    return this.initPromise;
  }

  private async _init(): Promise<void> {
    logger.info('Initializing BrowserBuildService...');

    this.adapter = new BrowserBuildAdapter();

    // Wire up callbacks to update workbench store
    this.adapter.setCallbacks({
      onPreviewReady: async (info: PreviewInfo) => {
        logger.info('Preview ready, updating workbench store', info.url);

        try {
          const store = await getWorkbenchStore();
          store.setBrowserPreview({
            url: info.url,
            ready: info.ready,
            updatedAt: info.updatedAt,
            srcdoc: info.srcdoc, // Pass srcdoc for iframe content
          });
          logger.info('Workbench store updated with preview');
        } catch (error) {
          logger.error('Failed to update workbench store:', error);
        }
      },
      onStatusChange: (status) => {
        logger.debug(`Build status changed: ${status}`);
      },
      onBuildProgress: (phase, progress) => {
        logger.debug(`Build progress: ${phase} ${progress}%`);
      },
      onError: (error) => {
        logger.error('Build error:', error);
      },
      onConsole: (log) => {
        logger.debug(`Console [${log.type}]:`, log.args);
      },
    });

    // Initialize the adapter (loads esbuild-wasm)
    logger.info('Initializing BrowserBuildAdapter...');
    await this.adapter.init();

    // Warm up CDN cache with common packages in background
    // This runs in parallel and doesn't block initialization
    logger.info('Starting CDN cache warmup (background)...');
    warmupCache(moduleCache, logger).then(() => {
      logger.info('CDN cache warmup complete');
    }).catch((error) => {
      logger.warn('CDN cache warmup failed (non-blocking):', error);
    });

    // Set preview mode to browser via lazy import
    try {
      const store = await getWorkbenchStore();
      store.setPreviewMode('browser');
    } catch (error) {
      logger.warn('Could not set preview mode:', error);
    }

    this.initialized = true;
    logger.info('BrowserBuildService initialized');
  }

  /**
   * Check if the service is ready
   */
  isReady(): boolean {
    return this.initialized && this.adapter?.status === 'ready';
  }

  /**
   * Sync files to the adapter and trigger a build
   */
  async syncAndBuild(files: FileMap, entryPoint: string = '/src/main.tsx'): Promise<BundleResult | null> {
    if (!this.adapter) {
      logger.warn('Adapter not initialized, initializing now...');
      await this.init();
    }

    if (!this.adapter) {
      logger.error('Failed to initialize adapter');
      return null;
    }

    logger.info(`Triggering build with entry point: ${entryPoint}`);

    // Sync files to adapter
    logger.debug(`Synced ${files.size} files to adapter`);
    await this.adapter.writeFiles(files);

    // Build
    const buildOptions: BuildOptions = {
      entryPoint,
      mode: 'development',
      sourcemap: true,
    };

    const result = await this.adapter.build(buildOptions);

    if (result.errors.length > 0) {
      logger.error('Build failed with errors:', result.errors);
    } else {
      logger.info(`Build successful in ${Math.round(result.buildTime)}ms`);
    }

    return result;
  }

  /**
   * Write a single file to the adapter
   */
  async writeFile(path: string, content: string): Promise<void> {
    if (!this.adapter) {
      await this.init();
    }

    await this.adapter?.writeFile(path, content);
  }

  /**
   * Get current preview info
   */
  getPreview(): PreviewInfo | null {
    return this.adapter?.getPreview() ?? null;
  }

  /**
   * Refresh the preview
   */
  async refreshPreview(): Promise<void> {
    await this.adapter?.refreshPreview();
  }

  /**
   * Destroy the service and clean up resources
   */
  async destroy(): Promise<void> {
    if (this.adapter) {
      await this.adapter.destroy();
      this.adapter = null;
    }

    this.initialized = false;
    this.initPromise = null;

    try {
      const store = await getWorkbenchStore();
      store.clearBrowserPreview();
    } catch {
      // Ignore if store not available
    }

    logger.info('BrowserBuildService destroyed');
  }
}

// Singleton instance
export const browserBuildService = new BrowserBuildService();

// Export class for testing
export { BrowserBuildService };
