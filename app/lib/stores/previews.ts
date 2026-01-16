import type { WebContainer } from '@webcontainer/api';
import { atom } from 'nanostores';
import { DEFAULT_DEVICE_ID, type Orientation } from '~/utils/devices';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PreviewsStore');

export interface PreviewInfo {
  port: number;
  ready: boolean;
  baseUrl: string;
}

/** Store global pour les erreurs de preview */
export const previewErrorStore = atom<string | null>(null);

export class PreviewsStore {
  #availablePreviews = new Map<number, PreviewInfo>();
  #webcontainer: Promise<WebContainer>;
  #initialized = false;

  previews = atom<PreviewInfo[]>([]);

  constructor(webcontainerPromise: Promise<WebContainer>) {
    this.#webcontainer = webcontainerPromise;

    // NOTE: #init() is NOT called here to enable lazy boot.
    // Call init() explicitly when the workbench is shown.
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
    this.#init();
  }

  async #init() {
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
