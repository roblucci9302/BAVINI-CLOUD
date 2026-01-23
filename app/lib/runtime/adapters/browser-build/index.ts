/**
 * =============================================================================
 * BAVINI CLOUD - Browser Build Module
 * =============================================================================
 * Modular browser build system extracted from browser-build-adapter.ts.
 *
 * This module provides utilities and components that can be used independently
 * or together with the main BrowserBuildAdapter.
 *
 * Structure:
 * - utils/     - Shared utilities (cache, paths, event loop)
 * - preview/   - Preview system configuration
 * - plugins/   - esbuild plugins (coming soon)
 * - bootstrap/ - Framework bootstrap templates (coming soon)
 * =============================================================================
 */

// Utils
export {
  LRUCache,
  moduleCache,
  createLRUCache,
} from './utils/build-cache';

export {
  yieldToEventLoop,
  processInChunks,
} from './utils/event-loop';

export {
  normalizePath,
  generateHash,
  generateFNVHash,
  isPathSafe,
  getExtension,
  getFilename,
  getDirectory,
  joinPath,
  resolvePath,
} from './utils/path-utils';

// Preview
export {
  type PreviewMode,
  type PreviewModeConfig,
  setPreviewMode,
  getPreviewModeConfig,
  enableServiceWorkerPreference,
  disableServiceWorkerPreference,
  resetServiceWorkerFailures,
  setServiceWorkerReady,
  isServiceWorkerReady,
  incrementSwFailures,
  shouldAttemptServiceWorker,
  getPreviewModeReason,
} from './preview';

// Plugins
export {
  type PluginContext,
  type PluginFactory,
  type CSSResult,
  type CompilerResult,
  type ContentFile,
  createVirtualFsPlugin,
  createEsmShPlugin,
  getCdnStats,
} from './plugins';
