/**
 * Performance Optimization Module
 *
 * This module provides utilities for:
 * - Strategic module preloading
 * - Service Worker asset caching
 * - Performance metrics collection
 * - Bundle size optimization
 */

export {
  initPreloading,
  schedulePreload,
  preloadOnWorkbenchInteraction,
  preloadOnFirstMessage,
  preloadOnTypingStart,
  isPreloaded,
  resetPreloading,
} from './preloader';

export {
  registerServiceWorker,
  unregisterServiceWorker,
  clearServiceWorkerCache,
  isServiceWorkerSupported,
  checkForUpdate,
  skipWaiting,
} from './service-worker';
