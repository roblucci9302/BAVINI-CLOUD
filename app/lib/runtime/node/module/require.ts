/**
 * =============================================================================
 * BAVINI Container - Require Implementation
 * =============================================================================
 * Node.js require() function implementation.
 * =============================================================================
 */

import * as path from '../core-modules/path';
import { ModuleResolver } from './resolver';
import type { ModuleFS, NodeModule, RequireFunction, ModuleLoaderOptions } from './types';

// Import built-in modules
import * as pathModule from '../core-modules/path';
import * as eventsModule from '../core-modules/events';
import * as utilModule from '../core-modules/util';
import * as fsModule from '../core-modules/fs';
import * as streamModule from '../core-modules/stream';
import * as httpModule from '../core-modules/http';
import * as cryptoModule from '../core-modules/crypto';
import * as childProcessModule from '../core-modules/child_process';
import { Buffer } from '../globals/buffer';

/**
 * Built-in module registry
 */
const BUILTIN_MODULES: Record<string, unknown> = {
  path: pathModule,
  events: eventsModule,
  util: utilModule,
  fs: fsModule,
  stream: streamModule,
  http: httpModule,
  crypto: cryptoModule,
  child_process: childProcessModule,
  buffer: { Buffer },
};

/**
 * Module loader class
 */
export class ModuleLoader {
  private _fs: ModuleFS;
  private _resolver: ModuleResolver;
  private _cache: Map<string, NodeModule> = new Map();
  private _builtins: Record<string, unknown>;
  private _mainModule: NodeModule | undefined;
  private _cwd: string;

  constructor(fs: ModuleFS, options: ModuleLoaderOptions = {}) {
    this._fs = fs;
    this._cwd = options.cwd || '/';
    this._resolver = new ModuleResolver(fs, options.extensions);
    this._builtins = { ...BUILTIN_MODULES, ...options.builtins };
  }

  /**
   * Create a require function for a module
   */
  createRequire(parentFilename: string): RequireFunction {
    const requireFn = ((id: string) => {
      return this._require(id, parentFilename);
    }) as RequireFunction;

    // require.resolve
    requireFn.resolve = Object.assign(
      (id: string, options?: { paths?: string[] }) => {
        const resolved = this._resolver.resolve(id, parentFilename, options);
        return resolved.filename;
      },
      {
        paths: (id: string) => {
          return this._resolver._getNodeModulePaths(path.dirname(parentFilename));
        },
      },
    );

    // require.cache
    requireFn.cache = Object.fromEntries(this._cache);

    // require.main
    requireFn.main = this._mainModule;

    // require.extensions
    requireFn.extensions = {
      '.js': (module: NodeModule, filename: string) => {
        this._compileJS(module, filename);
      },
      '.json': (module: NodeModule, filename: string) => {
        this._compileJSON(module, filename);
      },
      '.node': () => {
        throw new Error('.node native modules are not supported in browser');
      },
    };

    return requireFn;
  }

  /**
   * Require a module
   */
  private _require(id: string, parentFilename: string): unknown {
    // Resolve the module
    const resolved = this._resolver.resolve(id, parentFilename);

    // Return built-in module
    if (resolved.isBuiltin) {
      const builtin = this._builtins[resolved.filename];

      if (builtin !== undefined) {
        return builtin;
      }

      throw new Error(`Built-in module '${resolved.filename}' not implemented`);
    }

    // Check cache
    const cached = this._cache.get(resolved.filename);

    if (cached) {
      return cached.exports;
    }

    // Create module object
    const module = this._createModule(resolved.filename, parentFilename);

    // Cache before loading (for circular dependencies)
    this._cache.set(resolved.filename, module);

    try {
      // Load based on format
      if (resolved.format === 'json') {
        this._compileJSON(module, resolved.filename);
      } else {
        this._compileJS(module, resolved.filename);
      }

      module.loaded = true;
      return module.exports;
    } catch (error) {
      // Remove from cache on error
      this._cache.delete(resolved.filename);
      throw error;
    }
  }

  /**
   * Create a module object
   */
  private _createModule(filename: string, parentFilename?: string): NodeModule {
    const parent = parentFilename ? this._cache.get(parentFilename) ?? null : null;

    const module: NodeModule = {
      id: filename,
      filename,
      path: path.dirname(filename),
      exports: {},
      parent,
      children: [],
      loaded: false,
      paths: this._resolver._getNodeModulePaths(path.dirname(filename)),
      require: this.createRequire(filename),
    };

    if (parent) {
      parent.children.push(module);
    }

    return module;
  }

  /**
   * Compile a JavaScript module
   */
  private _compileJS(module: NodeModule, filename: string): void {
    const content = this._fs.readFileSync(filename);

    // Create the module wrapper function
    const wrapper = this._wrap(content);

    // Create the require function for this module
    const require = this.createRequire(filename);

    // Create module-level variables
    const __filename = filename;
    const __dirname = path.dirname(filename);
    const exports = module.exports;

    try {
      // Execute the wrapped module
      // Note: In a real implementation, this would use QuickJS or similar
      // For now, we use Function constructor (has limitations)
      const fn = new Function('exports', 'require', 'module', '__filename', '__dirname', wrapper);

      fn.call(exports, exports, require, module, __filename, __dirname);
    } catch (error) {
      const err = error as Error;
      err.message = `Error loading module '${filename}': ${err.message}`;
      throw err;
    }
  }

  /**
   * Compile a JSON module
   */
  private _compileJSON(module: NodeModule, filename: string): void {
    const content = this._fs.readFileSync(filename);

    try {
      module.exports = JSON.parse(content);
    } catch (error) {
      const err = error as Error;
      err.message = `Error parsing JSON '${filename}': ${err.message}`;
      throw err;
    }
  }

  /**
   * Wrap module code
   */
  private _wrap(content: string): string {
    // Node.js module wrapper
    return content;
  }

  /**
   * Load the main module
   */
  loadMain(filename: string): unknown {
    const absolutePath = path.isAbsolute(filename) ? filename : path.resolve(this._cwd, filename);

    this._mainModule = this._createModule(absolutePath);
    this._cache.set(absolutePath, this._mainModule);

    try {
      if (absolutePath.endsWith('.json')) {
        this._compileJSON(this._mainModule, absolutePath);
      } else {
        this._compileJS(this._mainModule, absolutePath);
      }

      this._mainModule.loaded = true;
      return this._mainModule.exports;
    } catch (error) {
      this._cache.delete(absolutePath);
      throw error;
    }
  }

  /**
   * Clear the module cache
   */
  clearCache(): void {
    this._cache.clear();
    this._resolver.clearCache();
  }

  /**
   * Get cached module
   */
  getFromCache(filename: string): NodeModule | undefined {
    return this._cache.get(filename);
  }

  /**
   * Get all cached modules
   */
  getAllCached(): Map<string, NodeModule> {
    return new Map(this._cache);
  }

  /**
   * Register a built-in module
   */
  registerBuiltin(name: string, exports: unknown): void {
    this._builtins[name] = exports;
  }

  /**
   * Check if module is built-in
   */
  isBuiltin(name: string): boolean {
    return this._resolver.isBuiltin(name) || name in this._builtins;
  }

  /**
   * Get the main module
   */
  getMain(): NodeModule | undefined {
    return this._mainModule;
  }
}

/**
 * Create a module loader
 */
export function createModuleLoader(fs: ModuleFS, options?: ModuleLoaderOptions): ModuleLoader {
  return new ModuleLoader(fs, options);
}

/**
 * Create a require function for a specific path
 */
export function createRequire(fs: ModuleFS, filename: string, options?: ModuleLoaderOptions): RequireFunction {
  const loader = new ModuleLoader(fs, options);
  return loader.createRequire(filename);
}

export default ModuleLoader;
