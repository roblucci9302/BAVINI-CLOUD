/**
 * =============================================================================
 * BAVINI Dev Server - Public API
 * =============================================================================
 * Exports all dev server components for external use.
 * =============================================================================
 */

// Main server
export { DevServer, createDevServer } from './dev-server';

// Module graph
export { ModuleGraph, createModuleGraph } from './module-graph';

// Virtual server
export { VirtualServer, createVirtualServer } from './virtual-server';

// HMR
export { HMRServer, createHMRServer, createHMRUpdate, createHMRError } from './hmr-server';
export { generateHMRClientCode } from './hmr-client';

// Error Overlay
export { generateErrorOverlayCode, createErrorOverlay } from './error-overlay';
export type { ErrorOverlayConfig } from './error-overlay';

// Plugins
export { reactRefreshPlugin, vueHMRPlugin, cssHMRPlugin } from './plugins';

// Preview Bridge
export { DevServerBridge, createPreviewBridge, injectHMRSupport } from './preview-bridge';
export type { PreviewBridgeConfig } from './preview-bridge';

// Types
export type {
  // Module types
  ModuleNode,
  ModuleGraph as IModuleGraph,
  ModuleType,

  // HMR types
  HMRPayload,
  HMRUpdate,
  HMRError,
  HotUpdateContext,

  // Server types
  DevServerConfig,
  DevServerInstance,
  DevServerPlugin,
  PluginContext,

  // Request/Response
  VirtualRequest,
  VirtualResponse,
  RequestHandler,
  Middleware,

  // Transform types
  TransformResult,

  // Watch types
  WatchEvent,
} from './types';
