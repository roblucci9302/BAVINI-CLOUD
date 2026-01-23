/**
 * =============================================================================
 * BAVINI CLOUD - Preview Configuration
 * =============================================================================
 * Configuration and types for the preview system.
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PreviewConfig');

/**
 * Preview mode selection
 * - auto: Automatically choose best mode (prefers srcdoc for reliability)
 * - service-worker: Use Service Worker (enables localStorage/cookies)
 * - srcdoc: Use srcdoc attribute (most compatible)
 */
export type PreviewMode = 'auto' | 'service-worker' | 'srcdoc';

/**
 * Preview mode configuration
 */
export interface PreviewModeConfig {
  /** Current mode selection */
  mode: PreviewMode;
  /** Is Service Worker available in this browser? */
  swAvailable: boolean;
  /** In auto mode, should we prefer Service Worker? */
  autoPreferSW: boolean;
}

/**
 * Preview state management
 */
interface PreviewState {
  /** Configuration */
  config: PreviewModeConfig;
  /** Service Worker failure count */
  swFailureCount: number;
  /** Maximum SW failures before disabling */
  maxSwFailures: number;
  /** Is Service Worker registered and ready? */
  swReady: boolean;
}

/**
 * Global preview state
 */
const state: PreviewState = {
  config: {
    mode: 'auto',
    swAvailable: typeof navigator !== 'undefined' && 'serviceWorker' in navigator,
    autoPreferSW: false,
  },
  swFailureCount: 0,
  maxSwFailures: 3,
  swReady: false,
};

/**
 * Set the preview mode
 *
 * @param mode - Preview mode to set
 */
export function setPreviewMode(mode: PreviewMode): void {
  state.config.mode = mode;
  logger.info(`Preview mode set to: ${mode}`);
}

/**
 * Get current preview mode configuration
 */
export function getPreviewModeConfig(): Readonly<PreviewModeConfig> {
  return { ...state.config };
}

/**
 * Enable Service Worker preference in auto mode
 */
export function enableServiceWorkerPreference(): void {
  state.config.autoPreferSW = true;
  logger.info('Service Worker preference enabled');
}

/**
 * Disable Service Worker preference in auto mode
 */
export function disableServiceWorkerPreference(): void {
  state.config.autoPreferSW = false;
  logger.info('Service Worker preference disabled');
}

/**
 * Reset Service Worker failure count
 */
export function resetServiceWorkerFailures(): void {
  state.swFailureCount = 0;
  logger.info('Service Worker failure count reset');
}

/**
 * Mark Service Worker as ready
 */
export function setServiceWorkerReady(ready: boolean): void {
  state.swReady = ready;
  logger.debug(`Service Worker ready: ${ready}`);
}

/**
 * Check if Service Worker is ready
 */
export function isServiceWorkerReady(): boolean {
  return state.swReady;
}

/**
 * Increment Service Worker failure count
 *
 * @returns Current failure count after increment
 */
export function incrementSwFailures(): number {
  state.swFailureCount++;
  logger.warn(`Service Worker failure count: ${state.swFailureCount}/${state.maxSwFailures}`);
  return state.swFailureCount;
}

/**
 * Check if we should attempt Service Worker mode
 */
export function shouldAttemptServiceWorker(): boolean {
  const { mode, swAvailable, autoPreferSW } = state.config;

  // If explicitly disabled, never attempt
  if (mode === 'srcdoc') {
    return false;
  }

  // If explicitly enabled, always attempt
  if (mode === 'service-worker') {
    return swAvailable && state.swReady;
  }

  // Auto mode: check if SW is available and we haven't failed too many times
  if (mode === 'auto') {
    if (!swAvailable || !state.swReady) {
      return false;
    }

    if (state.swFailureCount >= state.maxSwFailures) {
      return false;
    }

    // Only attempt if preference is enabled
    return autoPreferSW;
  }

  return false;
}

/**
 * Get human-readable reason for current preview mode
 */
export function getPreviewModeReason(): string {
  const { mode, swAvailable, autoPreferSW } = state.config;

  if (!swAvailable) {
    return 'Service Worker not available';
  }

  if (!state.swReady) {
    return 'Service Worker not ready';
  }

  if (mode === 'srcdoc') {
    return 'srcdoc mode selected';
  }

  if (mode === 'service-worker') {
    return 'service-worker mode selected';
  }

  if (state.swFailureCount >= state.maxSwFailures) {
    return `too many SW failures (${state.swFailureCount}/${state.maxSwFailures})`;
  }

  if (!autoPreferSW) {
    return 'auto mode prefers srcdoc';
  }

  return 'unknown';
}
