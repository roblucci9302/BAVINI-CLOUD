import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';
import { DEFAULT_DEVICE_ID, type Orientation } from '~/utils/devices';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PreviewsStore');

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
  /** HTML content for srcdoc mode (browser preview) */
  srcdoc?: string;
}

/**
 * Preview info from browser build adapter (uses URL instead of port)
 */
export interface BrowserPreviewInfo {
  url: string;
  ready: boolean;
  updatedAt: number;
  /** HTML content for srcdoc mode (avoids blob URL origin issues) */
  srcdoc?: string;
}

/** Store global pour les erreurs de preview */
export const previewErrorStore = atom<string | null>(null);

/**
 * Clear the preview error store.
 * Call this when a build succeeds to remove stale error messages.
 */
export function clearPreviewError(): void {
  previewErrorStore.set(null);
}

/**
 * Set a preview error message.
 */
export function setPreviewError(message: string): void {
  previewErrorStore.set(message);
}

/** Mode de preview: webcontainer (port-based) ou browser (URL-based) */
export type PreviewMode = 'webcontainer' | 'browser';

export class PreviewsStore {
  #availablePreviews = new Map<number, PreviewInfo>();
  #webcontainer: Promise<WebContainer> | null;
  #initialized = false;
  #mode: PreviewMode = 'webcontainer';
  #browserPreviewUrl: string | null = null;

  previews = atom<PreviewInfo[]>([]);

  constructor(webcontainerPromise: Promise<WebContainer> | null = null) {
    this.#webcontainer = webcontainerPromise;

    // NOTE: #init() is NOT called here to enable lazy boot.
    // Call init() explicitly when the workbench is shown.
  }

  /**
   * Set the preview mode (webcontainer or browser)
   */
  setMode(mode: PreviewMode): void {
    this.#mode = mode;
    logger.info(`Preview mode set to: ${mode}`);
  }

  /**
   * Get current preview mode
   */
  getMode(): PreviewMode {
    return this.#mode;
  }

  /**
   * Initialize the port event listener. This triggers WebContainer boot.
   * Should be called when the workbench is shown, not on page load.
   */
  init(): void {
    if (this.#initialized) {
      return;
    }

    this.#initialized = true;

    // In browser mode, we don't need WebContainer initialization
    if (this.#mode === 'browser' || !this.#webcontainer) {
      logger.info('PreviewsStore initialized in browser mode');
      return;
    }

    this.#initWebContainer();
  }

  /**
   * Add or update a browser-mode preview (URL-based or srcdoc-based)
   * Called from BrowserBuildAdapter when preview is ready
   */
  setBrowserPreview(info: BrowserPreviewInfo): void {
    logger.info(`Browser preview ready: ${info.url}${info.srcdoc ? ' (srcdoc mode)' : ''}`);

    this.#browserPreviewUrl = info.url;

    // Convert to PreviewInfo format for compatibility
    // Use port 0 as a special marker for browser-mode previews
    const previewInfo: PreviewInfo = {
      port: 0,
      ready: info.ready,
      baseUrl: info.url,
      srcdoc: info.srcdoc,
    };

    // Update or add the browser preview
    const currentPreviews = this.previews.get();
    const existingIndex = currentPreviews.findIndex((p) => p.port === 0);

    let newPreviews: PreviewInfo[];

    if (existingIndex >= 0) {
      // Update existing browser preview
      newPreviews = currentPreviews.map((p, i) => (i === existingIndex ? previewInfo : p));
    } else {
      // Add new browser preview
      newPreviews = [...currentPreviews, previewInfo];
    }

    logger.info(`Previews updated: ${newPreviews.length} preview(s), browser preview ready: ${info.ready}`);
    this.previews.set(newPreviews);
  }

  /**
   * Clear browser-mode preview
   */
  clearBrowserPreview(): void {
    if (this.#browserPreviewUrl) {
      logger.info('Clearing browser preview');
      this.#browserPreviewUrl = null;

      const currentPreviews = this.previews.get();
      const newPreviews = currentPreviews.filter((p) => p.port !== 0);
      this.previews.set(newPreviews);
    }
  }

  /**
   * Get current browser preview URL
   */
  getBrowserPreviewUrl(): string | null {
    return this.#browserPreviewUrl;
  }

  async #initWebContainer() {
    if (!this.#webcontainer) {
      logger.warn('No WebContainer promise provided, skipping initialization');
      return;
    }

    try {
      const webcontainer = await this.#webcontainer;
      logger.info('WebContainer ready, listening for port events');

      webcontainer.on('port', (port, type, url) => {
        logger.debug(`Port event: ${type} on port ${port}`);

        const currentPreviews = this.previews.get();
        let previewInfo = this.#availablePreviews.get(port);

        // Handle close event
        if (type === 'close') {
          if (previewInfo) {
            logger.info(`Closing preview on port ${port}`);
            this.#availablePreviews.delete(port);
            this.previews.set(currentPreviews.filter((preview) => preview.port !== port));
          }
          return;
        }

        const isReady = type === 'open';
        const isNewPreview = !previewInfo;

        // Check if anything actually changed before updating
        if (previewInfo && previewInfo.ready === isReady && previewInfo.baseUrl === url) {
          // No change, skip update to avoid unnecessary re-renders
          logger.debug(`Port ${port}: No change, skipping update`);
          return;
        }

        // Create or update preview info
        if (isNewPreview) {
          previewInfo = { port, ready: isReady, baseUrl: url };
          this.#availablePreviews.set(port, previewInfo);
          logger.info(`New preview added: port ${port}, ready: ${isReady}`);
        } else {
          // Update existing preview info in place
          previewInfo!.ready = isReady;
          previewInfo!.baseUrl = url;
        }

        // Build new array only updating the changed preview (structural sharing)
        let newPreviews: PreviewInfo[];
        if (isNewPreview) {
          // Add new preview
          newPreviews = [...currentPreviews, { ...previewInfo! }];
        } else {
          // Update existing preview - only create new object for the changed one
          newPreviews = currentPreviews.map((p) =>
            p.port === port ? { ...previewInfo! } : p  // Keep same reference for unchanged
          );
        }

        logger.info(`Previews updated: ${newPreviews.length} preview(s), port ${port} ready: ${isReady}`);
        this.previews.set(newPreviews);
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Failed to initialize WebContainer for previews:', error);
      previewErrorStore.set(`Échec de l'initialisation: ${errorMessage}`);
    }
  }
}

// device preview state
export const selectedDeviceId = atom<string>(DEFAULT_DEVICE_ID);
export const deviceOrientation = atom<Orientation>('portrait');
