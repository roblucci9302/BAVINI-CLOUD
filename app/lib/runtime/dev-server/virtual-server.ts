/**
 * =============================================================================
 * BAVINI Dev Server - Virtual HTTP Server
 * =============================================================================
 * Virtual HTTP server that runs entirely in the browser.
 * Handles requests via Service Worker interception.
 * =============================================================================
 */

import type {
  VirtualRequest,
  VirtualResponse,
  RequestHandler,
  Middleware,
  DevServerConfig,
  TransformResult,
} from './types';
import type { ModuleGraph } from './module-graph';
import { generateHMRClientCode } from './hmr-client';

/**
 * MIME types for common file extensions
 */
const MIME_TYPES: Record<string, string> = {
  // JavaScript
  '.js': 'application/javascript',
  '.mjs': 'application/javascript',
  '.jsx': 'application/javascript',
  '.ts': 'application/javascript',
  '.tsx': 'application/javascript',
  // CSS
  '.css': 'text/css',
  '.scss': 'text/css',
  '.sass': 'text/css',
  '.less': 'text/css',
  // HTML
  '.html': 'text/html',
  '.htm': 'text/html',
  // JSON
  '.json': 'application/json',
  // Images
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  // Fonts
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.eot': 'application/vnd.ms-fontobject',
  // Other
  '.xml': 'application/xml',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.wasm': 'application/wasm',
};

/**
 * Get MIME type for a file
 */
function getMimeType(path: string): string {
  const ext = '.' + path.split('.').pop()?.toLowerCase();
  return MIME_TYPES[ext] || 'application/octet-stream';
}

/**
 * Create a virtual response
 */
function createResponse(
  body: string | ArrayBuffer | null,
  options: {
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
  } = {},
): VirtualResponse {
  return {
    status: options.status || 200,
    statusText: options.statusText || 'OK',
    headers: new Headers(options.headers),
    body: body ?? undefined,
  };
}

/**
 * Virtual HTTP Server
 */
export class VirtualServer {
  private config: DevServerConfig;
  private moduleGraph: ModuleGraph;
  private middlewares: Middleware[] = [];
  private routes = new Map<string, RequestHandler>();
  private transformCache = new Map<string, TransformResult>();
  private fileSystem: Map<string, string>;
  private transformer: ((url: string, code: string) => Promise<TransformResult>) | null = null;

  constructor(
    moduleGraph: ModuleGraph,
    fileSystem: Map<string, string>,
    config: Partial<DevServerConfig> = {},
  ) {
    this.moduleGraph = moduleGraph;
    this.fileSystem = fileSystem;
    this.config = {
      port: config.port || 3000,
      host: config.host || 'localhost',
      base: config.base || '/',
      hmr: config.hmr !== false,
      cors: config.cors !== false,
      headers: config.headers || {},
      proxy: config.proxy,
      publicDir: config.publicDir,
      open: config.open || false,
    };

    // Register built-in routes
    this.registerBuiltinRoutes();
  }

  /**
   * Register built-in routes
   */
  private registerBuiltinRoutes(): void {
    // HMR endpoint
    this.route('/__hmr', async () => {
      return createResponse(generateHMRClientCode({
        host: this.config.host,
        port: this.config.port,
        overlay: typeof this.config.hmr === 'object' ? this.config.hmr.overlay : true,
      }), {
        headers: { 'Content-Type': 'application/javascript' },
      });
    });

    // Health check
    this.route('/__ping', async () => {
      return createResponse('pong', {
        headers: { 'Content-Type': 'text/plain' },
      });
    });

    // Module info (for debugging)
    this.route('/__modules', async () => {
      const modules = this.moduleGraph.getAllModules().map(m => ({
        id: m.id,
        url: m.url,
        type: m.type,
        importers: Array.from(m.importers).map(i => i.id),
        imports: Array.from(m.importedModules).map(i => i.id),
      }));
      return createResponse(JSON.stringify(modules, null, 2), {
        headers: { 'Content-Type': 'application/json' },
      });
    });
  }

  /**
   * Set the transform function
   */
  setTransformer(fn: (url: string, code: string) => Promise<TransformResult>): void {
    this.transformer = fn;
  }

  /**
   * Add middleware
   */
  use(middleware: Middleware): this {
    this.middlewares.push(middleware);
    return this;
  }

  /**
   * Add route handler
   */
  route(path: string, handler: RequestHandler): this {
    this.routes.set(path, handler);
    return this;
  }

  /**
   * Handle incoming request
   */
  async handleRequest(req: VirtualRequest): Promise<VirtualResponse> {
    // Apply CORS headers if enabled
    const corsHeaders: Record<string, string> = {};
    if (this.config.cors) {
      corsHeaders['Access-Control-Allow-Origin'] = '*';
      corsHeaders['Access-Control-Allow-Methods'] = 'GET, POST, PUT, DELETE, OPTIONS';
      corsHeaders['Access-Control-Allow-Headers'] = 'Content-Type';
    }

    // Handle OPTIONS (preflight)
    if (req.method === 'OPTIONS') {
      return createResponse(null, {
        status: 204,
        headers: corsHeaders,
      });
    }

    // Run through middleware chain
    const runMiddleware = async (index: number): Promise<VirtualResponse | null> => {
      if (index >= this.middlewares.length) {
        return this.handleRequestCore(req);
      }

      const middleware = this.middlewares[index];
      return middleware(req, () => runMiddleware(index + 1));
    };

    try {
      const response = await runMiddleware(0);

      if (response) {
        // Add CORS and custom headers
        for (const [key, value] of Object.entries({ ...corsHeaders, ...this.config.headers })) {
          response.headers.set(key, value);
        }
        return response;
      }

      // No response - 404
      return createResponse('Not Found', {
        status: 404,
        statusText: 'Not Found',
        headers: { 'Content-Type': 'text/plain', ...corsHeaders },
      });
    } catch (error) {
      console.error('[VirtualServer] Error handling request:', error);
      return createResponse(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'Internal Server Error',
        }),
        {
          status: 500,
          statusText: 'Internal Server Error',
          headers: { 'Content-Type': 'application/json', ...corsHeaders },
        },
      );
    }
  }

  /**
   * Core request handling
   */
  private async handleRequestCore(req: VirtualRequest): Promise<VirtualResponse | null> {
    const { pathname } = req;

    // Check custom routes first
    const routeHandler = this.routes.get(pathname);
    if (routeHandler) {
      return routeHandler(req);
    }

    // Handle special paths
    if (pathname.startsWith('/@modules/')) {
      return this.handleModuleRequest(pathname, req);
    }

    if (pathname.startsWith('/@fs/')) {
      return this.handleFsRequest(pathname.slice(4), req);
    }

    // Try to serve from virtual filesystem
    return this.serveFile(pathname, req);
  }

  /**
   * Handle module request (node_modules)
   */
  private async handleModuleRequest(
    pathname: string,
    _req: VirtualRequest,
  ): Promise<VirtualResponse | null> {
    // Convert /@modules/react to /node_modules/react
    const modulePath = pathname.replace('/@modules/', '/node_modules/');
    return this.serveFile(modulePath, _req);
  }

  /**
   * Handle filesystem request
   */
  private async handleFsRequest(
    pathname: string,
    req: VirtualRequest,
  ): Promise<VirtualResponse | null> {
    return this.serveFile(pathname, req);
  }

  /**
   * Serve a file from virtual filesystem
   */
  private async serveFile(
    pathname: string,
    _req: VirtualRequest,
  ): Promise<VirtualResponse | null> {
    // Normalize path
    let filePath = pathname;
    if (!filePath.startsWith('/')) {
      filePath = '/' + filePath;
    }

    // Try exact path first
    let content = this.fileSystem.get(filePath);

    // Try with extensions
    if (!content) {
      const extensions = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.json'];
      for (const ext of extensions) {
        content = this.fileSystem.get(filePath + ext);
        if (content) {
          filePath = filePath + ext;
          break;
        }
      }
    }

    // Try index files
    if (!content) {
      const indexFiles = ['index.tsx', 'index.ts', 'index.jsx', 'index.js', 'index.html'];
      for (const indexFile of indexFiles) {
        const indexPath = filePath.endsWith('/') ? filePath + indexFile : filePath + '/' + indexFile;
        content = this.fileSystem.get(indexPath);
        if (content) {
          filePath = indexPath;
          break;
        }
      }
    }

    if (!content) {
      return null;
    }

    // Transform if needed
    const mimeType = getMimeType(filePath);
    let responseBody: string = content;

    if (this.shouldTransform(filePath)) {
      const result = await this.transformModule(filePath, content);
      if (result) {
        responseBody = result.code;
      }
    }

    return createResponse(responseBody, {
      headers: {
        'Content-Type': mimeType,
        'Cache-Control': 'no-cache, no-store, must-revalidate',
      },
    });
  }

  /**
   * Check if file should be transformed
   */
  private shouldTransform(path: string): boolean {
    const ext = path.split('.').pop()?.toLowerCase();
    return ['ts', 'tsx', 'js', 'jsx', 'mjs', 'vue', 'svelte'].includes(ext || '');
  }

  /**
   * Transform a module
   */
  async transformModule(url: string, code: string): Promise<TransformResult | null> {
    // Check cache
    const cached = this.transformCache.get(url);
    if (cached) {
      return cached;
    }

    // Use custom transformer if set
    if (this.transformer) {
      const result = await this.transformer(url, code);
      this.transformCache.set(url, result);
      return result;
    }

    // Default: return as-is
    return { code };
  }

  /**
   * Invalidate transform cache for a file
   */
  invalidateCache(path: string): void {
    this.transformCache.delete(path);
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.transformCache.clear();
  }

  /**
   * Get server URL
   */
  getUrl(): string {
    return `http://${this.config.host}:${this.config.port}${this.config.base}`;
  }

  /**
   * Get module URL for a file path
   */
  getModuleUrl(id: string): string {
    // Convert file path to URL
    if (id.startsWith('/node_modules/')) {
      return id.replace('/node_modules/', '/@modules/');
    }
    return id;
  }
}

/**
 * Create a virtual server instance
 */
export function createVirtualServer(
  moduleGraph: ModuleGraph,
  fileSystem: Map<string, string>,
  config?: Partial<DevServerConfig>,
): VirtualServer {
  return new VirtualServer(moduleGraph, fileSystem, config);
}

export default VirtualServer;
