/**
 * =============================================================================
 * BAVINI Runtime Engine - QuickJS Module
 * =============================================================================
 * Exports for the QuickJS-based Node.js compatible runtime.
 * =============================================================================
 */

// Types
export type {
  RuntimeStatus,
  ExecutionResult,
  ModuleResolution,
  ProcessEnv,
  ProcessShim,
  FSStats,
  VirtualFS,
  QuickJSRuntimeConfig,
  RuntimeCallbacks,
  BuiltinModule,
} from './types';

// Unified File System
export {
  UnifiedFSInstance,
  createUnifiedFS,
  getSharedFS,
  resetSharedFS,
} from './unified-fs';

// Node.js Polyfills
export {
  path,
  Buffer,
  EventEmitter,
  createProcessShim,
  createConsoleShim,
  getBuiltinModules,
  URL,
  URLSearchParams,
  TextEncoder,
  TextDecoder,
  crypto,
  timers,
  os,
  util,
} from './node-polyfills';

// QuickJS Runtime
export {
  QuickJSNodeRuntime,
  createQuickJSRuntime,
  getSharedQuickJSRuntime,
  resetSharedQuickJSRuntime,
} from './quickjs-runtime';

// Runtime Orchestrator
export {
  RuntimeOrchestrator,
  createRuntimeOrchestrator,
  getSharedOrchestrator,
  resetSharedOrchestrator,
  type SSRRenderResult,
  type OrchestratorConfig,
} from './runtime-orchestrator';

// Module Resolver
export {
  ModuleResolver,
  createModuleResolver,
  type ModuleResolverConfig,
} from './module-resolver';

// SSR Engine
export {
  SSREngine,
  createSSREngine,
  getSharedSSREngine,
  resetSharedSSREngine,
  type SSROptions,
  type SSRResult,
  type SSREngineConfig,
} from './ssr-engine';

// SSR Cache
export {
  SSRCache,
  createSSRCache,
  getSharedSSRCache,
  resetSharedSSRCache,
  type CacheStats,
  type SSRCacheConfig,
} from './ssr-cache';

// Multi-Framework SSR
export {
  MultiFrameworkSSR,
  createMultiFrameworkSSR,
  getSharedMultiFrameworkSSR,
  resetSharedMultiFrameworkSSR,
  type SSRFramework,
  type MultiSSROptions,
  type MultiSSRResult,
} from './multi-framework-ssr';

// SSR Bridge (for browser-build-adapter integration)
export {
  SSRBridge,
  createSSRBridge,
  getSharedSSRBridge,
  resetSharedSSRBridge,
  type SSRMode,
  type SSRBridgeConfig,
} from './ssr-bridge';

// Streaming SSR Engine
export {
  StreamingSSREngine,
  createStreamingSSREngine,
  getSharedStreamingSSREngine,
  resetSharedStreamingSSREngine,
  type StreamingChunk,
  type StreamingChunkType,
  type StreamingSSROptions,
  type StreamingStats,
  type StreamingSSRConfig,
} from './streaming-ssr';
