/**
 * =============================================================================
 * BAVINI CLOUD - Preview Module
 * =============================================================================
 * Preview system for the browser build runtime.
 *
 * Structure:
 * - preview-config.ts  - Mode configuration and state
 * - html-template.ts   - HTML template generation
 * - bundle-injector.ts - Bundle injection into HTML
 * - preview-creator.ts - Preview creation (SW/srcdoc)
 * =============================================================================
 */

// Preview configuration
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
} from './preview-config';

// HTML template generation
export {
  DEFAULT_CSS_VARIABLES,
  DARK_MODE_VARIABLES,
  generateDefaultHtml,
  generateBaseStyles,
  generateTailwindCdnScript,
  generateKeyboardForwardingScript,
} from './html-template';

// Bundle injection
export {
  type SSRContent,
  type BundleInjectionOptions,
  injectBundle,
  injectBundleWithSSR,
} from './bundle-injector';

// Preview creation
export {
  type PreviewResult,
  type ServiceWorkerFunctions,
  verifyServiceWorkerServing,
  createPreviewWithServiceWorker,
  createPreviewWithSrcdoc,
  createPreview,
} from './preview-creator';
