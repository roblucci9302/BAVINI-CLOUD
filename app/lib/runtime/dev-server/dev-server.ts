/**
 * =============================================================================
 * BAVINI Dev Server - Main Server
 * =============================================================================
 * Orchestrates the virtual HTTP server, module graph, and HMR.
 * =============================================================================
 */

import type {
  DevServerConfig,
  DevServerInstance,
  DevServerPlugin,
  Middleware,
  RequestHandler,
  VirtualRequest,
  VirtualResponse,
  TransformResult,
  WatchEvent,
  HMRPayload,
  HotUpdateContext,
  PluginContext,
} from './types';
import { ModuleGraph, createModuleGraph } from './module-graph';
import { VirtualServer, createVirtualServer } from './virtual-server';
import { HMRServer, createHMRServer, createHMRError } from './hmr-server';
import { generateHMRClientCode } from './hmr-client';

/**
 * Default configuration
 */
const DEFAULT_CONFIG: DevServerConfig = {
  port: 3000,
  host: 'localhost',
  base: '/',
  hmr: true,
  cors: true,
  headers: {},
  open: false,
};

/**
 * Development Server
 */
export class DevServer implements DevServerInstance {
  config: DevServerConfig;
  moduleGraph: ModuleGraph;

  private virtualServer: VirtualServer;
  private hmrServer: HMRServer | null = null;
  private fileSystem: Map<string, string>;
  private plugins: DevServerPlugin[] = [];
  private watchCallbacks: Array<(event: WatchEvent) => void> = [];
  private started = false;

  constructor(
    fileSystem: Map<string, string>,
    config: Partial<DevServerConfig> = {},
  ) {
    this.config = { ...DEFAULT_CONFIG, ...config };
    this.fileSystem = fileSystem;
    this.moduleGraph = createModuleGraph();
    this.virtualServer = createVirtualServer(this.moduleGraph, fileSystem, this.config);

    // Set up transformer
    this.virtualServer.setTransformer(this.transformModule.bind(this));

    // Initialize HMR if enabled
    if (this.config.hmr) {
      this.hmrServer = createHMRServer(this.moduleGraph, {
        debug: true,
      });
    }
  }

  /**
   * Add a plugin
   */
  addPlugin(plugin: DevServerPlugin): this {
    this.plugins.push(plugin);
    return this;
  }

  /**
   * Add middleware
   */
  use(middleware: Middleware): void {
    this.virtualServer.use(middleware);
  }

  /**
   * Add route handler
   */
  route(path: string, handler: RequestHandler): void {
    this.virtualServer.route(path, handler);
  }

  /**
   * Start the server
   */
  async listen(): Promise<void> {
    if (this.started) {
      return;
    }

    // Initialize plugins
    for (const plugin of this.plugins) {
      if (plugin.configureServer) {
        await plugin.configureServer(this);
      }
    }

    this.started = true;
    console.log(`[DevServer] Started at http://${this.config.host}:${this.config.port}${this.config.base}`);
  }

  /**
   * Close the server
   */
  async close(): Promise<void> {
    this.started = false;
    this.hmrServer?.close();
    this.moduleGraph.clear();
    this.virtualServer.clearCache();
    console.log('[DevServer] Closed');
  }

  /**
   * Handle incoming request
   */
  async handleRequest(req: VirtualRequest): Promise<VirtualResponse> {
    return this.virtualServer.handleRequest(req);
  }

  /**
   * Transform a module
   */
  private async transformModule(url: string, code: string): Promise<TransformResult> {
    // Create plugin context
    const context: PluginContext = {
      moduleGraph: this.moduleGraph,
      getModuleById: (id) => this.moduleGraph.getModuleById(id),
      addWatchFile: (file) => this.addWatchFile(file),
      emitFile: () => {}, // TODO: implement
    };

    // Run through plugins
    let result: TransformResult = { code };

    for (const plugin of this.plugins) {
      if (plugin.transform) {
        const pluginResult = await plugin.transform(code, url, context);
        if (pluginResult) {
          result = {
            ...result,
            ...pluginResult,
          };
          code = result.code;
        }
      }
    }

    // Inject HMR preamble for JS modules
    if (this.config.hmr && this.isJsModule(url)) {
      result.code = this.injectHMRPreamble(url, result.code);
    }

    // Update module graph
    await this.updateModuleGraph(url, result);

    return result;
  }

  /**
   * Check if URL is a JS module
   */
  private isJsModule(url: string): boolean {
    const ext = url.split('.').pop()?.toLowerCase();
    return ['js', 'jsx', 'ts', 'tsx', 'mjs', 'vue', 'svelte'].includes(ext || '');
  }

  /**
   * Inject HMR preamble into module code
   */
  private injectHMRPreamble(url: string, code: string): string {
    const hmrPreamble = `
if (import.meta.hot) {
  import.meta.hot.accept();
}
`;

    // Check if module already has HMR handling
    if (code.includes('import.meta.hot')) {
      return code;
    }

    return hmrPreamble + code;
  }

  /**
   * Update module graph from transform result
   */
  private async updateModuleGraph(url: string, result: TransformResult): Promise<void> {
    const mod = await this.moduleGraph.ensureEntryFromUrl(url);

    // Parse dependencies
    const deps = result.deps || [];
    const importedModules = new Set<typeof mod>();

    for (const dep of deps) {
      const depMod = await this.moduleGraph.ensureEntryFromUrl(dep);
      importedModules.add(depMod);
    }

    // Update module info
    this.moduleGraph.updateModuleInfo(
      mod,
      importedModules,
      new Set(), // acceptedHmrDeps - would need to parse import.meta.hot.accept calls
      true, // isSelfAccepting - default to true with injected preamble
    );

    mod.transformedCode = result.code;
    mod.sourceMap = result.map;
  }

  /**
   * Add watch file
   */
  private addWatchFile(file: string): void {
    // In browser, we rely on external file watching
    // This is a hook for plugins to register interest in files
  }

  /**
   * Handle file change
   */
  async handleFileChange(event: WatchEvent): Promise<void> {
    console.log(`[DevServer] File ${event.type}: ${event.path}`);

    // Invalidate cache
    this.virtualServer.invalidateCache(event.path);

    // Notify watchers first (always, regardless of module state)
    for (const callback of this.watchCallbacks) {
      callback(event);
    }

    // Get affected modules
    const modules = this.moduleGraph.getModulesAffectedByFile(event.path);

    if (modules.size === 0 && event.type !== 'add') {
      return;
    }

    // Run plugin hooks
    const affectedModules = Array.from(modules);
    const hotContext: HotUpdateContext = {
      file: event.path,
      timestamp: event.timestamp,
      modules: affectedModules,
      moduleGraph: this.moduleGraph,
      send: (payload) => this.sendHMRUpdate(payload),
    };

    for (const plugin of this.plugins) {
      if (plugin.handleHotUpdate) {
        const result = await plugin.handleHotUpdate(hotContext);
        if (result) {
          // Plugin returned specific modules to update
          hotContext.modules = result;
        }
      }
    }

    // Send HMR update
    if (this.hmrServer) {
      this.hmrServer.handleFileChange(event);
    }
  }

  /**
   * Send HMR update
   */
  sendHMRUpdate(payload: HMRPayload): void {
    if (this.hmrServer) {
      this.hmrServer.broadcast(payload);
    }
  }

  /**
   * Send build error
   */
  sendError(error: Error): void {
    if (this.hmrServer) {
      this.hmrServer.sendError(createHMRError(error));
    }
  }

  /**
   * Restart the server
   */
  async restart(): Promise<void> {
    await this.close();
    this.moduleGraph = createModuleGraph();
    this.virtualServer = createVirtualServer(this.moduleGraph, this.fileSystem, this.config);
    this.virtualServer.setTransformer(this.transformModule.bind(this));

    if (this.config.hmr) {
      this.hmrServer = createHMRServer(this.moduleGraph, { debug: true });
    }

    await this.listen();
  }

  /**
   * Get URL for module
   */
  getModuleUrl(id: string): string {
    return this.virtualServer.getModuleUrl(id);
  }

  /**
   * Transform request (for external use)
   */
  async transformRequest(url: string): Promise<TransformResult | null> {
    const content = this.fileSystem.get(url);
    if (!content) {
      return null;
    }
    return this.transformModule(url, content);
  }

  /**
   * Add watch callback
   */
  onFileChange(callback: (event: WatchEvent) => void): () => void {
    this.watchCallbacks.push(callback);
    return () => {
      const index = this.watchCallbacks.indexOf(callback);
      if (index > -1) {
        this.watchCallbacks.splice(index, 1);
      }
    };
  }

  /**
   * Write file and trigger HMR
   */
  writeFile(path: string, content: string): void {
    const isNew = !this.fileSystem.has(path);
    this.fileSystem.set(path, content);

    this.handleFileChange({
      type: isNew ? 'add' : 'change',
      path,
      timestamp: Date.now(),
    });
  }

  /**
   * Delete file and trigger HMR
   */
  deleteFile(path: string): void {
    if (!this.fileSystem.has(path)) {
      return;
    }

    this.fileSystem.delete(path);
    this.virtualServer.invalidateCache(path);

    // Remove from module graph
    const mod = this.moduleGraph.getModuleById(path);
    if (mod) {
      this.moduleGraph.removeModule(mod);
    }

    this.handleFileChange({
      type: 'unlink',
      path,
      timestamp: Date.now(),
    });
  }

  /**
   * Get HMR client code
   */
  getHMRClientCode(): string {
    return generateHMRClientCode({
      host: this.config.host,
      port: this.config.port,
      overlay: typeof this.config.hmr === 'object' ? this.config.hmr.overlay : true,
    });
  }
}

/**
 * Create a development server
 */
export function createDevServer(
  fileSystem: Map<string, string>,
  config?: Partial<DevServerConfig>,
): DevServer {
  return new DevServer(fileSystem, config);
}

export default DevServer;
