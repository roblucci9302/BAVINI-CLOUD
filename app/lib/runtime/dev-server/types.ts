/**
 * =============================================================================
 * BAVINI Dev Server - Type Definitions
 * =============================================================================
 * Types for the development server with HMR support.
 * =============================================================================
 */

/**
 * Module type
 */
export type ModuleType = 'js' | 'css' | 'json' | 'asset';

/**
 * Module information in the module graph
 */
export interface ModuleNode {
  /** Unique module ID (usually the file path) */
  id: string;
  /** Absolute file path */
  file: string;
  /** Module URL for browser */
  url: string;
  /** Module type */
  type: ModuleType;
  /** Modules that this module imports */
  importedModules: Set<ModuleNode>;
  /** Modules that import this module */
  importers: Set<ModuleNode>;
  /** Whether this module accepts HMR updates */
  acceptedHmrDeps: Set<ModuleNode>;
  /** Whether this module accepts self updates */
  isSelfAccepting: boolean;
  /** Last modified timestamp */
  lastModified: number;
  /** Transformed code */
  transformedCode?: string;
  /** Source map */
  sourceMap?: string;
  /** CSS content (for CSS modules) */
  cssContent?: string;
  /** Metadata */
  meta: Record<string, unknown>;
}

/**
 * HMR update payload
 */
export interface HMRPayload {
  type: 'connected' | 'update' | 'full-reload' | 'prune' | 'error' | 'custom';
  /** Updated modules */
  updates?: HMRUpdate[];
  /** Error information */
  error?: HMRError;
  /** Custom event name */
  event?: string;
  /** Custom data */
  data?: unknown;
}

/**
 * Single module update
 */
export interface HMRUpdate {
  /** Module type */
  type: 'js-update' | 'css-update';
  /** Module path */
  path: string;
  /** Accepted path (for boundary) */
  acceptedPath: string;
  /** New timestamp */
  timestamp: number;
  /** Explicit full reload */
  isWithinCircularImport?: boolean;
}

/**
 * HMR error
 */
export interface HMRError {
  message: string;
  stack?: string;
  id?: string;
  frame?: string;
  plugin?: string;
  loc?: {
    file: string;
    line: number;
    column: number;
  };
}

/**
 * Virtual HTTP request
 */
export interface VirtualRequest {
  /** Request method */
  method: string;
  /** Request URL */
  url: string;
  /** Request headers */
  headers: Headers;
  /** Request body */
  body?: ArrayBuffer | string;
  /** Query parameters */
  query: URLSearchParams;
  /** URL pathname */
  pathname: string;
}

/**
 * Virtual HTTP response
 */
export interface VirtualResponse {
  /** Status code */
  status: number;
  /** Status text */
  statusText: string;
  /** Response headers */
  headers: Headers;
  /** Response body */
  body?: ArrayBuffer | string | ReadableStream;
}

/**
 * Request handler function
 */
export type RequestHandler = (
  req: VirtualRequest,
) => Promise<VirtualResponse | null>;

/**
 * Middleware function
 */
export type Middleware = (
  req: VirtualRequest,
  next: () => Promise<VirtualResponse | null>,
) => Promise<VirtualResponse | null>;

/**
 * Dev server configuration
 */
export interface DevServerConfig {
  /** Port to listen on */
  port: number;
  /** Host to bind to */
  host: string;
  /** Base URL path */
  base: string;
  /** Enable HMR */
  hmr: boolean | HMRConfig;
  /** Enable CORS */
  cors: boolean;
  /** Custom headers */
  headers: Record<string, string>;
  /** Proxy configuration */
  proxy?: Record<string, ProxyConfig>;
  /** Static file directories */
  publicDir?: string;
  /** Open browser on start */
  open: boolean;
}

/**
 * HMR configuration
 */
export interface HMRConfig {
  /** WebSocket protocol */
  protocol?: 'ws' | 'wss';
  /** WebSocket host */
  host?: string;
  /** WebSocket port */
  port?: number;
  /** WebSocket path */
  path?: string;
  /** Timeout for connection */
  timeout?: number;
  /** Enable overlay */
  overlay?: boolean;
}

/**
 * Proxy configuration
 */
export interface ProxyConfig {
  /** Target URL */
  target: string;
  /** Change origin */
  changeOrigin?: boolean;
  /** Rewrite path */
  rewrite?: (path: string) => string;
  /** Custom headers */
  headers?: Record<string, string>;
}

/**
 * File watcher event
 */
export interface WatchEvent {
  /** Event type */
  type: 'add' | 'change' | 'unlink';
  /** File path */
  path: string;
  /** Timestamp */
  timestamp: number;
}

/**
 * File watcher callback
 */
export type WatchCallback = (event: WatchEvent) => void;

/**
 * Transform result
 */
export interface TransformResult {
  /** Transformed code */
  code: string;
  /** Source map */
  map?: string;
  /** Dependencies */
  deps?: string[];
  /** Dynamic imports */
  dynamicDeps?: string[];
  /** CSS content */
  css?: string;
  /** Metadata */
  meta?: Record<string, unknown>;
}

/**
 * Plugin hook context
 */
export interface PluginContext {
  /** Module graph */
  moduleGraph: ModuleGraph;
  /** Get module by ID */
  getModuleById(id: string): ModuleNode | undefined;
  /** Add watch file */
  addWatchFile(file: string): void;
  /** Emit file */
  emitFile(file: { name: string; source: string }): void;
}

/**
 * Dev server plugin
 */
export interface DevServerPlugin {
  /** Plugin name */
  name: string;
  /** Called on server start */
  configureServer?(server: DevServerInstance): void | Promise<void>;
  /** Transform module */
  transform?(
    code: string,
    id: string,
    context: PluginContext,
  ): Promise<TransformResult | null> | TransformResult | null;
  /** Handle HMR update */
  handleHotUpdate?(context: HotUpdateContext): void | ModuleNode[] | Promise<void | ModuleNode[]>;
}

/**
 * Hot update context
 */
export interface HotUpdateContext {
  /** Changed file */
  file: string;
  /** Timestamp */
  timestamp: number;
  /** Affected modules */
  modules: ModuleNode[];
  /** Module graph */
  moduleGraph: ModuleGraph;
  /** Send HMR update */
  send(payload: HMRPayload): void;
}

/**
 * Module graph interface
 */
export interface ModuleGraph {
  /** Get module by URL */
  getModuleByUrl(url: string): ModuleNode | undefined;
  /** Get module by file path */
  getModuleById(id: string): ModuleNode | undefined;
  /** Create or get module */
  ensureEntryFromUrl(url: string): Promise<ModuleNode>;
  /** Update module info */
  updateModuleInfo(
    mod: ModuleNode,
    importedModules: Set<ModuleNode>,
    acceptedHmrDeps: Set<ModuleNode>,
    isSelfAccepting: boolean,
  ): void;
  /** Invalidate module */
  invalidateModule(mod: ModuleNode): void;
  /** Get modules affected by file change */
  getModulesAffectedByFile(file: string): Set<ModuleNode>;
  /** Clear module graph */
  clear(): void;
}

/**
 * Dev server instance
 */
export interface DevServerInstance {
  /** Server configuration */
  config: DevServerConfig;
  /** Module graph */
  moduleGraph: ModuleGraph;
  /** Add middleware */
  use(middleware: Middleware): void;
  /** Add route handler */
  route(path: string, handler: RequestHandler): void;
  /** Start server */
  listen(): Promise<void>;
  /** Close server */
  close(): Promise<void>;
  /** Handle request */
  handleRequest(req: VirtualRequest): Promise<VirtualResponse>;
  /** Send HMR update */
  sendHMRUpdate(payload: HMRPayload): void;
  /** Restart server */
  restart(): Promise<void>;
  /** Get URL for module */
  getModuleUrl(id: string): string;
  /** Transform and serve module */
  transformRequest(url: string): Promise<TransformResult | null>;
}

/**
 * Error overlay configuration
 */
export interface ErrorOverlayConfig {
  /** Enable overlay */
  enabled: boolean;
  /** Show warnings */
  warnings: boolean;
  /** Custom styles */
  styles?: string;
}

/**
 * Build error for overlay
 */
export interface BuildError {
  /** Error message */
  message: string;
  /** Stack trace */
  stack?: string;
  /** Source file */
  file?: string;
  /** Line number */
  line?: number;
  /** Column number */
  column?: number;
  /** Code frame */
  frame?: string;
  /** Plugin that caused error */
  plugin?: string;
}
