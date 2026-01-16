import { WebContainer } from '@webcontainer/api';
import { atom, computed, type ReadableAtom, type WritableAtom } from 'nanostores';
import { WORK_DIR_NAME } from '~/utils/constants';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('WebContainer');

/** Timeout pour le boot du WebContainer (60 secondes) */
const BOOT_TIMEOUT_MS = 60_000;

/*
 * ============================================================================
 * WEBCONTAINER STATE TYPES
 * ============================================================================
 */

export type WebContainerStatus = 'idle' | 'booting' | 'ready' | 'error';

interface WebContainerContext {
  loaded: boolean;
}

/*
 * ============================================================================
 * REACTIVE STORES
 * ============================================================================
 */

/**
 * État réactif du WebContainer.
 * Les composants peuvent s'abonner pour réagir aux changements d'état.
 */
export const webcontainerStatusStore: WritableAtom<WebContainerStatus> =
  import.meta.hot?.data.webcontainerStatusStore ?? atom<WebContainerStatus>('idle');

/**
 * Message d'erreur en cas d'échec du boot.
 */
export const webcontainerErrorStore: WritableAtom<string | null> =
  import.meta.hot?.data.webcontainerErrorStore ?? atom<string | null>(null);

/**
 * Computed store pour vérifier si le WebContainer est prêt.
 */
export const isWebContainerReady: ReadableAtom<boolean> = computed(
  webcontainerStatusStore,
  (status) => status === 'ready',
);

/**
 * Computed store pour vérifier si le WebContainer est en cours de boot.
 */
export const isWebContainerBooting: ReadableAtom<boolean> = computed(
  webcontainerStatusStore,
  (status) => status === 'booting',
);

// Preserve stores on HMR
if (import.meta.hot) {
  import.meta.hot.data.webcontainerStatusStore = webcontainerStatusStore;
  import.meta.hot.data.webcontainerErrorStore = webcontainerErrorStore;
}

/*
 * ============================================================================
 * LEGACY CONTEXT (for backwards compatibility)
 * ============================================================================
 */

export const webcontainerContext: WebContainerContext = import.meta.hot?.data.webcontainerContext ?? {
  loaded: false,
};

if (import.meta.hot) {
  import.meta.hot.data.webcontainerContext = webcontainerContext;
}

/*
 * ============================================================================
 * LAZY WEBCONTAINER BOOT
 * ============================================================================
 * The WebContainer is NOT booted at module load time to avoid blocking
 * the main thread during page load. Instead, it boots on-demand when
 * getWebContainer() is first called (typically when workbench opens).
 */

let webcontainerPromise: Promise<WebContainer> | null = null;
let webcontainerInstance: WebContainer | null = null;

/**
 * Defer a callback to allow the browser to paint first.
 * Uses requestAnimationFrame + setTimeout(0) to ensure the browser
 * has a chance to render before we do the heavy boot operation.
 */
function deferToNextFrame(callback: () => void): void {
  if (typeof requestAnimationFrame !== 'undefined') {
    requestAnimationFrame(() => {
      setTimeout(callback, 0);
    });
  } else {
    setTimeout(callback, 0);
  }
}

/**
 * Get the WebContainer instance, booting it if necessary.
 * This is the main entry point for accessing the WebContainer.
 *
 * LAZY BOOT: The WebContainer only boots when this function is called,
 * not at module load time. This prevents page freeze on initial load.
 *
 * DEFERRED BOOT: Uses requestAnimationFrame + setTimeout to allow the
 * browser to paint a loading state before the blocking WASM boot.
 */
export function getWebContainer(): Promise<WebContainer> {
  // SSR guard
  if (import.meta.env.SSR) {
    return new Promise(() => {
      // Never resolves on SSR
    });
  }

  // Return cached instance if already booted
  if (webcontainerInstance) {
    return Promise.resolve(webcontainerInstance);
  }

  // Return existing boot promise if already booting
  if (webcontainerPromise) {
    return webcontainerPromise;
  }

  // Check HMR cache
  if (import.meta.hot?.data.webcontainerInstance) {
    webcontainerInstance = import.meta.hot.data.webcontainerInstance as WebContainer;
    webcontainerContext.loaded = true;
    webcontainerStatusStore.set('ready');
    return Promise.resolve(webcontainerInstance);
  }

  // Set status to booting immediately so UI can show loading state
  webcontainerStatusStore.set('booting');
  logger.info('Starting WebContainer boot (deferred)...');

  // Create the promise that will be returned
  webcontainerPromise = new Promise<WebContainer>((resolve, reject) => {
    // Defer the actual boot to allow the browser to paint the loading state
    deferToNextFrame(async () => {
      try {
        logger.info('WebContainer boot starting now...');

        const bootPromise = WebContainer.boot({ workdirName: WORK_DIR_NAME });

        const timeoutPromise = new Promise<never>((_, timeoutReject) => {
          setTimeout(() => {
            timeoutReject(
              new Error(`WebContainer boot timeout after ${BOOT_TIMEOUT_MS / 1000}s. Vérifiez votre connexion.`),
            );
          }, BOOT_TIMEOUT_MS);
        });

        const container = await Promise.race([bootPromise, timeoutPromise]);

        webcontainerInstance = container;
        webcontainerContext.loaded = true;
        webcontainerStatusStore.set('ready');
        webcontainerErrorStore.set(null);
        logger.info('WebContainer boot completed successfully');

        // Cache for HMR
        if (import.meta.hot) {
          import.meta.hot.data.webcontainerInstance = container;
        }

        resolve(container);
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        webcontainerStatusStore.set('error');
        webcontainerErrorStore.set(errorMessage);
        logger.error('WebContainer boot failed:', errorMessage);

        // Reset promise so boot can be retried
        webcontainerPromise = null;
        reject(error);
      }
    });
  });

  return webcontainerPromise;
}

/**
 * Legacy export for backwards compatibility.
 * Returns a promise that resolves to the WebContainer.
 *
 * @deprecated Use getWebContainer() instead for lazy boot behavior.
 * This export boots immediately for backwards compatibility with existing code.
 */
export let webcontainer: Promise<WebContainer> = new Promise(() => {
  // noop for ssr - will be replaced below
});

// For backwards compatibility: create a lazy proxy that boots on first await
if (!import.meta.env.SSR) {
  // Check if already booted (HMR)
  if (import.meta.hot?.data.webcontainerInstance) {
    webcontainerInstance = import.meta.hot.data.webcontainerInstance as WebContainer;
    webcontainerContext.loaded = true;
    webcontainerStatusStore.set('ready');
    webcontainer = Promise.resolve(webcontainerInstance);
  } else {
    // Create a lazy promise that only boots when awaited
    // This maintains backwards compatibility while enabling lazy boot
    webcontainer = {
      then: (onFulfilled, onRejected) => getWebContainer().then(onFulfilled, onRejected),
      catch: (onRejected) => getWebContainer().catch(onRejected),
      finally: (onFinally) => getWebContainer().finally(onFinally),
      [Symbol.toStringTag]: 'Promise',
    } as Promise<WebContainer>;
  }

  if (import.meta.hot) {
    import.meta.hot.data.webcontainer = webcontainer;
  }
}

/*
 * ============================================================================
 * PREBOOT - Start WebContainer during idle time
 * ============================================================================
 * This allows the WebContainer to boot in the background before the user
 * actually needs it, reducing perceived latency when they first use it.
 */

let prebootScheduled = false;

/**
 * Schedule WebContainer boot during idle time.
 * This starts the boot process in the background so it's ready when needed.
 * Safe to call multiple times - only schedules once.
 */
export function prebootWebContainer(): void {
  if (import.meta.env.SSR) {
    return;
  }

  // Don't schedule if already booted or booting
  if (webcontainerInstance || webcontainerPromise || prebootScheduled) {
    return;
  }

  prebootScheduled = true;

  // Use requestIdleCallback to boot during idle time
  const scheduleCallback =
    typeof requestIdleCallback !== 'undefined'
      ? (fn: () => void) => requestIdleCallback(fn, { timeout: 5000 })
      : (fn: () => void) => setTimeout(fn, 2000);

  scheduleCallback(() => {
    // Only boot if not already started by user action
    if (!webcontainerPromise && !webcontainerInstance) {
      logger.info('Pre-booting WebContainer during idle time...');
      getWebContainer().catch((error) => {
        logger.warn('WebContainer preboot failed (will retry on demand):', error);
      });
    }
  });
}

/*
 * ============================================================================
 * PHASE 2 OPTIMIZATIONS - DEPENDENCY CACHING
 * ============================================================================
 */

// Export dependency cache and installer utilities
export { dependencyCache, generateDependencyHash, type PackageJson, type CacheStats } from './dependency-cache';
export {
  createOptimizedInstaller,
  OptimizedInstaller,
  type InstallOptions,
  type InstallResult,
  type InstallPhase,
} from './optimized-installer';
export { dependencyPrewarmer, initDependencyPrewarming, type PrewarmStatus } from './dependency-prewarmer';
