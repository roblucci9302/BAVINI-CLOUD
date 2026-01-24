/**
 * =============================================================================
 * BAVINI CLOUD - Runtime Module
 * =============================================================================
 * Point d'entrée pour le système de runtime abstrait.
 *
 * Ce module fournit une abstraction sur les différents runtimes (WebContainer,
 * BrowserBuild) permettant de les utiliser de manière interchangeable.
 *
 * @example
 * ```typescript
 * import { initRuntime, getRuntimeAdapter } from '~/lib/runtime';
 *
 * // Initialiser le runtime
 * const adapter = await initRuntime();
 *
 * // Écrire des fichiers
 * await adapter.writeFiles(new Map([
 *   ['/src/App.tsx', 'export default () => <div>Hello</div>'],
 * ]));
 *
 * // Build
 * const result = await adapter.build({ entryPoint: '/src/main.tsx' });
 * ```
 * =============================================================================
 */

// Types
export type {
  VirtualFile,
  VirtualFolder,
  VirtualDirent,
  FileMap,
  FileRecord,
  Loader,
  BundleResult,
  BuildError,
  BuildWarning,
  ConsoleLog,
  RuntimeError,
  PreviewInfo,
  RuntimeStatus,
  BuildOptions,
  TransformOptions,
  RuntimeCallbacks,
} from './types';

// Adapter interface
export { type RuntimeAdapter, BaseRuntimeAdapter } from './adapter';

// Adapters (BAVINI Runtime only - WebContainer has been removed)
export {
  BrowserBuildAdapter,
  createBrowserBuildAdapter,
  // Preview mode configuration (Bug #3 fix)
  type PreviewMode,
  setPreviewMode,
  getPreviewModeConfig,
  enableServiceWorkerPreference,
  disableServiceWorkerPreference,
  resetServiceWorkerFailures,
} from './adapters/browser-build-adapter';

// Factory
export {
  type RuntimeType,
  runtimeTypeStore,
  createRuntimeAdapter,
  getRuntimeAdapter,
  initRuntime,
  setRuntimeType,
  destroyRuntime,
  isBrowserRuntimeAvailable,
  getRuntimeInfo,
} from './factory';

// Browser Build Service
export { browserBuildService, BrowserBuildService } from './browser-build-service';

// CSS Processing (Phase 2: PostCSS support)
export {
  PostCSSProcessor,
  createPostCSSProcessor,
  getDefaultPostCSSProcessor,
  processCSS,
  type PostCSSConfig,
  type PostCSSResult,
} from './adapters/css/postcss-processor';

export {
  CSSAggregator,
  createCSSAggregator,
  type CSSEntry,
  type CSSType,
  type CSSMetadata,
} from './adapters/css-aggregator';

// Universal Font Loader (Phase 2: Multi-framework font support)
export {
  UniversalFontLoader,
  getFontLoader,
  createFontLoader,
  loadFont,
  type FontWeight,
  type FontStyle,
  type FontOptions,
  type LoadedFont,
} from './adapters/fonts';
