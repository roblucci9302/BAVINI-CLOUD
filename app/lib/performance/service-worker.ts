/**
 * Service Worker Registration
 *
 * Registers the service worker for asset caching.
 * Only registers in production to avoid caching issues during development.
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ServiceWorker');

let registration: ServiceWorkerRegistration | null = null;

/**
 * Check if service workers are supported
 */
export function isServiceWorkerSupported(): boolean {
  return typeof window !== 'undefined' && 'serviceWorker' in navigator;
}

/**
 * Register the service worker
 * Only registers in production environment
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    logger.info('Service workers not supported');
    return null;
  }

  // Skip registration in development
  if (import.meta.env.DEV) {
    logger.debug('Skipping registration in development');
    return null;
  }

  try {
    registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
      updateViaCache: 'none',
    });

    logger.info('Registered successfully');

    // Handle updates
    registration.addEventListener('updatefound', () => {
      const newWorker = registration?.installing;

      if (newWorker) {
        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            // New service worker is ready, notify user if needed
            logger.info('New version available');
          }
        });
      }
    });

    return registration;
  } catch (error) {
    logger.error('Registration failed:', error);
    return null;
  }
}

/**
 * Unregister the service worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const registrations = await navigator.serviceWorker.getRegistrations();

    for (const reg of registrations) {
      await reg.unregister();
    }

    logger.info('Unregistered successfully');

    return true;
  } catch (error) {
    logger.error('Unregistration failed:', error);
    return false;
  }
}

/**
 * Clear all caches
 */
export async function clearServiceWorkerCache(): Promise<boolean> {
  if (!isServiceWorkerSupported()) {
    return false;
  }

  try {
    const cacheNames = await caches.keys();

    await Promise.all(cacheNames.map((cacheName) => caches.delete(cacheName)));

    logger.info('Cache cleared');

    return true;
  } catch (error) {
    logger.error('Cache clear failed:', error);
    return false;
  }
}

/**
 * Get the current service worker registration
 */
export function getRegistration(): ServiceWorkerRegistration | null {
  return registration;
}

/**
 * Check if a service worker update is available
 */
export async function checkForUpdate(): Promise<boolean> {
  if (!registration) {
    return false;
  }

  try {
    await registration.update();
    return registration.waiting !== null;
  } catch (error) {
    logger.error('Update check failed:', error);
    return false;
  }
}

/**
 * Skip waiting and activate new service worker
 */
export function skipWaiting(): void {
  if (registration?.waiting) {
    registration.waiting.postMessage('skipWaiting');
  }
}
