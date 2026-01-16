/**
 * Strategic Module Preloader
 *
 * Preloads heavy modules during idle time to improve perceived performance.
 * Uses requestIdleCallback to avoid blocking the main thread.
 *
 * Phase 2 Optimization: Also initializes dependency pre-warming for faster
 * npm/pnpm installs in WebContainer.
 */

import { initDependencyPrewarming } from '~/lib/webcontainer/dependency-prewarmer';
import { dependencyCache } from '~/lib/webcontainer/dependency-cache';

type PreloadFn = () => Promise<unknown>;

interface PreloadConfig {
  /** Modules to preload after initial render and idle */
  afterIdle: PreloadFn[];

  /** Modules to preload when user hovers over workbench area */
  onWorkbenchHover: PreloadFn[];

  /** Modules to preload when first message is sent */
  onFirstMessage: PreloadFn[];

  /** Modules to preload when user starts typing */
  onTypingStart: PreloadFn[];
}

/**
 * Module preload configurations
 * Each array contains functions that dynamically import heavy modules
 */
export const preloadModules: PreloadConfig = {
  /*
   * Preload after the page is idle (typically 2-3 seconds after load)
   * Three.js is loaded here since ColorBends is deferred by 500ms
   */
  afterIdle: [
    // Three.js for background animation (deferred, so preload early)
    () => import('three'),

    // Shiki for syntax highlighting
    () => import('shiki'),

    // React Markdown for message rendering
    () => import('react-markdown'),
  ],

  // Preload when user hovers over workbench toggle or code area
  onWorkbenchHover: [
    // CodeMirror core
    () => import('@codemirror/state'),
    () => import('@codemirror/view'),

    // Terminal
    () => import('@xterm/xterm'),
  ],

  // Preload when first message is sent (user is engaged)
  onFirstMessage: [
    // Git operations
    () => import('isomorphic-git'),

    // CodeMirror languages
    () => import('@codemirror/lang-javascript'),
    () => import('@codemirror/lang-html'),
    () => import('@codemirror/lang-css'),
  ],

  // Preload when user starts typing (likely to send a message soon)
  onTypingStart: [
    // Reserved for future modules
  ],
};

// Track which preload groups have been triggered
const preloadedGroups = new Set<keyof PreloadConfig>();

/**
 * Preload modules for a specific timing/event
 * Uses requestIdleCallback to avoid blocking main thread
 */
export function schedulePreload(timing: keyof PreloadConfig): void {
  // Don't preload on server
  if (typeof window === 'undefined') {
    return;
  }

  // Don't preload the same group twice
  if (preloadedGroups.has(timing)) {
    return;
  }

  preloadedGroups.add(timing);

  const modules = preloadModules[timing];

  if (!modules || modules.length === 0) {
    return;
  }

  // Use requestIdleCallback if available, otherwise setTimeout
  const scheduleCallback =
    'requestIdleCallback' in window
      ? (fn: () => void) =>
          (window as Window & { requestIdleCallback: (fn: () => void) => void }).requestIdleCallback(fn)
      : (fn: () => void) => setTimeout(fn, 100);

  scheduleCallback(() => {
    // Preload modules in sequence to avoid overwhelming the network
    let index = 0;
    const preloadNext = () => {
      if (index < modules.length) {
        modules[index]()
          .then(() => {
            index++;

            // Small delay between preloads
            setTimeout(preloadNext, 50);
          })
          .catch(() => {
            // Silently fail - preloading is best-effort
            index++;
            setTimeout(preloadNext, 50);
          });
      }
    };
    preloadNext();
  });
}

/**
 * Initialize preloading after app hydration
 * Should be called once in entry.client.tsx
 */
export function initPreloading(): void {
  if (typeof window === 'undefined') {
    return;
  }

  // Schedule idle preloading after initial render
  schedulePreload('afterIdle');

  /*
   * Initialize dependency cache and pre-warming (Phase 2 optimization)
   * This preps the cache for faster npm/pnpm installs
   */
  initDependencyCacheAndPrewarming();
}

/**
 * Initialize dependency caching system
 * This runs in the background during idle time
 */
async function initDependencyCacheAndPrewarming(): Promise<void> {
  // Defer to next idle period - don't run immediately
  const scheduleCallback =
    'requestIdleCallback' in window
      ? (fn: () => void) =>
          (window as Window & { requestIdleCallback: (fn: () => void) => void }).requestIdleCallback(fn)
      : (fn: () => void) => setTimeout(fn, 1000);

  scheduleCallback(async () => {
    try {
      // Initialize the IndexedDB cache
      await dependencyCache.init();

      // Get cache stats for logging
      const stats = await dependencyCache.getStats();

      if (import.meta.env.DEV) {
        console.log(
          '%c[PRELOADER] Dependency cache initialized',
          'background: #9c27b0; color: white; padding: 2px 6px;',
          `${stats.totalEntries} entries, ${(stats.totalSizeBytes / 1024 / 1024).toFixed(2)}MB`,
        );
      }

      // Start pre-warming common dependencies during idle time
      initDependencyPrewarming();
    } catch (error) {
      // Silently fail - caching is optional
      if (import.meta.env.DEV) {
        console.warn('[PRELOADER] Failed to initialize dependency cache:', error);
      }
    }
  });
}

/**
 * Preload on workbench interaction
 * Call this when user hovers over or interacts with workbench area
 */
export function preloadOnWorkbenchInteraction(): void {
  schedulePreload('onWorkbenchHover');
}

/**
 * Preload on first message
 * Call this when user sends their first message
 */
export function preloadOnFirstMessage(): void {
  schedulePreload('onFirstMessage');
}

/**
 * Preload on typing start
 * Call this when user starts typing in the input
 */
export function preloadOnTypingStart(): void {
  schedulePreload('onTypingStart');
}

/**
 * Check if a preload group has been triggered
 */
export function isPreloaded(timing: keyof PreloadConfig): boolean {
  return preloadedGroups.has(timing);
}

/**
 * Reset preload tracking (useful for testing)
 */
export function resetPreloading(): void {
  preloadedGroups.clear();
}
