/**
 * Preview Service Worker Manager
 *
 * Manages the Service Worker that serves preview content.
 * This allows previews to have a normal origin instead of blob: URLs,
 * fixing issues with localStorage, form inputs, and browser APIs.
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PreviewSW');

// Preview URL base path
export const PREVIEW_BASE_PATH = '/preview';
export const PREVIEW_URL = `${PREVIEW_BASE_PATH}/index.html`;

// Service Worker state
let swRegistration: ServiceWorkerRegistration | null = null;
let isReady = false;
let readyPromise: Promise<void> | null = null;
let readyResolve: (() => void) | null = null;
let messageListenerAdded = false;

// Pending ping resolver (for one-time ping responses)
let pendingPingResolve: ((value: boolean) => void) | null = null;

/**
 * Initialize the preview Service Worker
 */
export async function initPreviewServiceWorker(): Promise<boolean> {
  // Check if Service Workers are supported
  if (!('serviceWorker' in navigator)) {
    logger.warn('Service Workers not supported in this browser');
    return false;
  }

  // If already ready, just verify it's still working
  if (isReady && swRegistration?.active) {
    logger.debug('Service Worker already initialized, verifying...');
    const stillWorking = await pingServiceWorker();
    if (stillWorking) {
      logger.debug('Service Worker still working');
      return true;
    }
    // SW stopped responding, reset state and reinitialize
    logger.warn('Service Worker stopped responding, reinitializing...');
    isReady = false;
  }

  try {
    // Create ready promise
    readyPromise = new Promise((resolve) => {
      readyResolve = resolve;
    });

    // Register the Service Worker
    logger.info('Registering preview Service Worker...');
    swRegistration = await navigator.serviceWorker.register('/preview-sw.js', {
      scope: PREVIEW_BASE_PATH + '/',
    });

    // Wait for activation
    if (swRegistration.installing) {
      logger.debug('Service Worker installing...');
      await waitForState(swRegistration.installing, 'activated');
    } else if (swRegistration.waiting) {
      logger.debug('Service Worker waiting...');
      await waitForState(swRegistration.waiting, 'activated');
    } else if (swRegistration.active) {
      logger.debug('Service Worker already active, will verify with ping');
    }

    // Set up message listener ONCE (idempotent)
    if (!messageListenerAdded) {
      navigator.serviceWorker.addEventListener('message', handleGlobalMessage);
      messageListenerAdded = true;
      logger.debug('Global message listener added');
    }

    // ALWAYS ping to verify the SW is actually responding
    // This catches cases where SW is "active" but not functional
    const pongReceived = await pingServiceWorker();
    if (!pongReceived) {
      logger.warn('Service Worker did not respond to ping');
      return false;
    }

    isReady = true;
    readyResolve?.();

    logger.info('Preview Service Worker ready');
    return true;
  } catch (error) {
    logger.error('Failed to register Service Worker:', error);
    return false;
  }
}

/**
 * Wait for Service Worker to reach a specific state
 */
function waitForState(worker: ServiceWorker, targetState: string): Promise<void> {
  return new Promise((resolve) => {
    if (worker.state === targetState) {
      resolve();
      return;
    }

    worker.addEventListener('statechange', function handler() {
      if (worker.state === targetState) {
        worker.removeEventListener('statechange', handler);
        resolve();
      }
    });
  });
}

/**
 * Single global message handler for all SW messages
 * This avoids the double-listener problem
 */
function handleGlobalMessage(event: MessageEvent) {
  const { type, payload } = event.data || {};

  switch (type) {
    case 'PONG':
      // Handle ping response
      logger.debug('Received PONG from Service Worker');
      if (pendingPingResolve) {
        pendingPingResolve(true);
        pendingPingResolve = null;
      }
      break;

    case 'LOG':
      logger.debug('[SW]', payload);
      break;

    default:
      // Ignore unknown messages (they might be for MessageChannel ports)
      if (type) {
        logger.debug('Unhandled SW message type:', type);
      }
  }
}

/**
 * Ping the Service Worker to check if it's alive
 * Uses the global message handler instead of adding a new listener
 */
async function pingServiceWorker(): Promise<boolean> {
  if (!swRegistration?.active) {
    logger.warn('Cannot ping: no active Service Worker');
    return false;
  }

  return new Promise((resolve) => {
    const timeout = setTimeout(() => {
      logger.warn('Ping timeout - Service Worker not responding');
      pendingPingResolve = null;
      resolve(false);
    }, 3000);

    // Set up the resolver for this ping
    pendingPingResolve = (result: boolean) => {
      clearTimeout(timeout);
      resolve(result);
    };

    // Send ping - swRegistration.active is guaranteed to exist after the check above
    try {
      swRegistration!.active!.postMessage({ type: 'PING' });
    } catch (error) {
      logger.error('Failed to send PING:', error);
      clearTimeout(timeout);
      pendingPingResolve = null;
      resolve(false);
    }
  });
}

/**
 * Wait for Service Worker to be ready
 */
export async function waitForReady(): Promise<void> {
  if (isReady) return;
  if (readyPromise) await readyPromise;
}

/**
 * Check if Service Worker is ready
 */
export function isServiceWorkerReady(): boolean {
  return isReady;
}

/**
 * Send files to the Service Worker for preview
 * Uses MessageChannel for reliable response delivery
 *
 * CRITICAL: The port listener MUST be configured BEFORE sending the message
 * to avoid race conditions where the SW responds before we're listening.
 */
export async function setPreviewFiles(files: Record<string, string>, buildId?: string): Promise<boolean> {
  await waitForReady();

  if (!isReady) {
    logger.warn('Service Worker not ready, cannot set files');
    return false;
  }

  // Verify SW is still active before proceeding
  if (!swRegistration?.active) {
    logger.warn('Service Worker registration lost, cannot set files');
    isReady = false;
    return false;
  }

  const actualBuildId = buildId || Date.now().toString();
  logger.info(`Sending ${Object.keys(files).length} files to Service Worker (build: ${actualBuildId})`);

  return new Promise<boolean>((resolve) => {
    const channel = new MessageChannel();
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        channel.port1.close();
      }
    };

    // Timeout after 5 seconds
    const timeout = setTimeout(() => {
      logger.warn('Timeout waiting for FILES_READY confirmation');
      cleanup();
      resolve(false);
    }, 5000);

    // CRITICAL: Configure listener FIRST, before ANY possibility of message being sent
    channel.port1.onmessage = (event: MessageEvent) => {
      clearTimeout(timeout);
      cleanup();

      if (event.data?.type === 'FILES_READY') {
        logger.info('Files confirmed ready in Service Worker');
        resolve(true);
      } else {
        logger.warn('Unexpected response from SW:', event.data);
        resolve(false);
      }
    };

    // Explicitly start the port to ensure it's ready to receive messages
    // This is important for MessageChannel reliability
    channel.port1.start();

    // NOW send the message - listener is guaranteed to be ready
    // swRegistration.active is guaranteed to exist after the checks at the start of this function
    try {
      swRegistration!.active!.postMessage(
        {
          type: 'SET_FILES',
          payload: {
            files,
            buildId: actualBuildId,
          },
        },
        [channel.port2],
      );
      logger.debug('SET_FILES message sent to Service Worker');
    } catch (error) {
      logger.error('Failed to send message to Service Worker:', error);
      clearTimeout(timeout);
      cleanup();
      resolve(false);
    }
  });
}

/**
 * Update a single file in the Service Worker (for HMR)
 */
export function updatePreviewFile(path: string, content: string): void {
  if (!isReady || !swRegistration?.active) {
    logger.warn('Service Worker not ready, cannot update file');
    return;
  }

  try {
    swRegistration.active.postMessage({
      type: 'UPDATE_FILE',
      payload: { path, content },
    });
  } catch (error) {
    logger.error('Failed to update file in SW:', error);
  }
}

/**
 * Delete a file from the Service Worker
 */
export function deletePreviewFile(path: string): void {
  if (!isReady || !swRegistration?.active) {
    logger.warn('Service Worker not ready, cannot delete file');
    return;
  }

  try {
    swRegistration.active.postMessage({
      type: 'DELETE_FILE',
      payload: { path },
    });
  } catch (error) {
    logger.error('Failed to delete file in SW:', error);
  }
}

/**
 * Clear all files from the Service Worker
 */
export function clearPreviewFiles(): void {
  if (!isReady || !swRegistration?.active) {
    logger.warn('Service Worker not ready, cannot clear files');
    return;
  }

  try {
    swRegistration.active.postMessage({ type: 'CLEAR_FILES' });
  } catch (error) {
    logger.error('Failed to clear files in SW:', error);
  }
}

/**
 * Get the preview URL
 */
export function getPreviewUrl(): string {
  return PREVIEW_URL;
}

/**
 * Unregister the Service Worker (for cleanup)
 */
export async function unregisterPreviewServiceWorker(): Promise<void> {
  if (swRegistration) {
    await swRegistration.unregister();
    swRegistration = null;
    isReady = false;
    logger.info('Preview Service Worker unregistered');
  }
}
