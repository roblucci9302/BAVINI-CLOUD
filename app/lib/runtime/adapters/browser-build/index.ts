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
 * - preview/   - Preview system (config, HTML templates, bundle injection, creation)
 * - plugins/   - esbuild plugins (esm-sh, virtual-fs)
 * - bootstrap/ - Framework bootstrap templates (React, Vue, Svelte, etc.)
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

// Preview (Phase 3.4)
export {
  // Configuration
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
  // HTML template generation
  DEFAULT_CSS_VARIABLES,
  DARK_MODE_VARIABLES,
  generateDefaultHtml,
  generateBaseStyles,
  generateTailwindCdnScript,
  generateKeyboardForwardingScript,
  // Bundle injection
  type SSRContent,
  type BundleInjectionOptions,
  injectBundle,
  injectBundleWithSSR,
  // Preview creation
  type PreviewResult,
  type ServiceWorkerFunctions,
  verifyServiceWorkerServing,
  createPreviewWithServiceWorker,
  createPreviewWithSrcdoc,
  createPreview as createPreviewWithMode,
} from './preview';

// Plugins
export {
  type PluginContext,
  type PluginFactory,
  type CSSResult,
  type CompilerResult,
  type ContentFile,
  type ModuleCache,
  createVirtualFsPlugin,
  createEsmShPlugin,
  getCdnStats,
  resetCdnStats,
  warmupCache,
  prefetchPackages,
} from './plugins';

// Bootstrap (Phase 3.3)
export {
  type BootstrapContext,
  type BootstrapGenerator,
  type RouteDefinition,
  MOUNTING_PATTERNS,
  isMountingEntryFile,
  generateRouterCode,
  generateRouteImports,
  generateAppWithRouter,
  createBootstrapEntry,
  createVueBootstrapEntry,
  createSvelteBootstrapEntry,
  createAstroBootstrapEntry,
  createPreactBootstrapEntry,
  createNextJSBootstrapEntry,
  createReactBootstrapEntry,
} from './bootstrap';
