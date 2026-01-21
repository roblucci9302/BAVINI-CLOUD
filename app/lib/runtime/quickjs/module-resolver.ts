/**
 * =============================================================================
 * BAVINI Runtime Engine - Module Resolver
 * =============================================================================
 * Implements CommonJS require() and ES Module resolution for QuickJS runtime.
 * Supports virtual filesystem, built-in modules, and npm package resolution.
 * =============================================================================
 */

import type { VirtualFS, ModuleResolution, BuiltinModule } from './types';
import { path, getBuiltinModules } from './node-polyfills';
import type { ProcessShim } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ModuleResolver');

/**
 * Module cache entry
 */
interface CachedModule {
  exports: Record<string, unknown>;
  loaded: boolean;
}

/**
 * Module resolver configuration
 */
export interface ModuleResolverConfig {
  /** Base directory for resolution */
  baseDir?: string;
  /** Additional module paths to search */
  modulePaths?: string[];
  /** Extensions to try when resolving */
  extensions?: string[];
  /** CDN URL for npm packages */
  cdnUrl?: string;
}

const DEFAULT_CONFIG: Required<ModuleResolverConfig> = {
  baseDir: '/',
  modulePaths: ['/node_modules'],
  extensions: ['.js', '.mjs', '.cjs', '.ts', '.tsx', '.jsx', '.json'],
  cdnUrl: 'https://esm.sh',
};

/**
 * Module Resolver for QuickJS
 */
export class ModuleResolver {
  private _config: Required<ModuleResolverConfig>;
  private _fs: VirtualFS;
  private _process: ProcessShim;
  private _builtins: Map<string, Record<string, unknown>>;
  private _cache: Map<string, CachedModule> = new Map();
  private _pendingFetches: Map<string, Promise<string>> = new Map();

  constructor(
    fs: VirtualFS,
    process: ProcessShim,
    config: ModuleResolverConfig = {},
  ) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._fs = fs;
    this._process = process;
    this._builtins = getBuiltinModules(fs, process);

    logger.debug('ModuleResolver initialized');
  }

  /**
   * Resolve a module specifier to a file path or built-in
   */
  resolve(specifier: string, fromFile: string = '/'): ModuleResolution {
    logger.debug(`Resolving "${specifier}" from "${fromFile}"`);

    // 1. Check if it's a built-in module
    if (this._builtins.has(specifier)) {
      return {
        found: true,
        path: specifier,
        isBuiltin: true,
      };
    }

    // 2. Relative or absolute path
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      const resolved = this._resolveFile(specifier, fromFile);
      if (resolved) {
        return {
          found: true,
          path: resolved,
          isBuiltin: false,
        };
      }
    }

    // 3. Node modules / npm package
    const nodeModulePath = this._resolveNodeModule(specifier, fromFile);
    if (nodeModulePath) {
      return {
        found: true,
        path: nodeModulePath,
        isBuiltin: false,
      };
    }

    // 4. External npm package (to be fetched from CDN)
    if (this._isNpmPackage(specifier)) {
      return {
        found: true,
        path: `${this._config.cdnUrl}/${specifier}`,
        isBuiltin: false,
        isExternal: true,
      };
    }

    logger.warn(`Module not found: "${specifier}" from "${fromFile}"`);
    return {
      found: false,
      path: '',
      isBuiltin: false,
    };
  }

  /**
   * Resolve a file path with extension fallbacks
   */
  private _resolveFile(specifier: string, fromFile: string): string | null {
    const dir = path.dirname(fromFile);
    const absolutePath = specifier.startsWith('/')
      ? specifier
      : path.resolve(dir, specifier);

    // Try exact path first
    if (this._fs.existsSync(absolutePath)) {
      const stats = this._fs.statSync(absolutePath);
      if (stats.isFile()) {
        return absolutePath;
      }
      // It's a directory, look for index file
      if (stats.isDirectory()) {
        return this._resolveIndex(absolutePath);
      }
    }

    // Try with extensions
    for (const ext of this._config.extensions) {
      const withExt = absolutePath + ext;
      if (this._fs.existsSync(withExt)) {
        return withExt;
      }
    }

    // Try as directory with index
    const indexPath = this._resolveIndex(absolutePath);
    if (indexPath) {
      return indexPath;
    }

    return null;
  }

  /**
   * Resolve index file in a directory
   */
  private _resolveIndex(dirPath: string): string | null {
    for (const ext of this._config.extensions) {
      const indexPath = path.join(dirPath, `index${ext}`);
      if (this._fs.existsSync(indexPath)) {
        return indexPath;
      }
    }
    return null;
  }

  /**
   * Resolve from node_modules
   */
  private _resolveNodeModule(specifier: string, fromFile: string): string | null {
    const parts = specifier.split('/');
    const packageName = parts[0].startsWith('@')
      ? `${parts[0]}/${parts[1]}`
      : parts[0];
    const subPath = parts[0].startsWith('@')
      ? parts.slice(2).join('/')
      : parts.slice(1).join('/');

    // Walk up directory tree looking for node_modules
    let dir = path.dirname(fromFile);

    // Include root in search
    const dirsToCheck = [dir];
    while (dir !== '/') {
      dir = path.dirname(dir);
      dirsToCheck.push(dir);
    }

    for (const checkDir of dirsToCheck) {
      for (const modulePath of this._config.modulePaths) {
        // Handle both relative and absolute module paths
        const nodeModulesDir = modulePath.startsWith('/')
          ? modulePath
          : path.join(checkDir, modulePath);
        const packageDir = path.join(nodeModulesDir, packageName);

        if (this._fs.existsSync(packageDir)) {
          // Found the package, resolve the entry point
          if (subPath) {
            const resolved = this._resolveFile(subPath, packageDir + '/');
            if (resolved) return resolved;
          }

          // Look for package.json main field
          const pkgJsonPath = path.join(packageDir, 'package.json');
          if (this._fs.existsSync(pkgJsonPath)) {
            try {
              const pkgJson = JSON.parse(
                this._fs.readFileSync(pkgJsonPath, 'utf-8') as string,
              );
              const main = pkgJson.module || pkgJson.main || 'index.js';
              const mainPath = path.join(packageDir, main);
              if (this._fs.existsSync(mainPath)) {
                return mainPath;
              }
              // Try with extensions
              const resolved = this._resolveFile(main, packageDir + '/');
              if (resolved) return resolved;
            } catch {
              // Invalid package.json, continue
            }
          }

          // Fallback to index
          const indexPath = this._resolveIndex(packageDir);
          if (indexPath) return indexPath;
        }
      }
    }

    return null;
  }

  /**
   * Check if specifier looks like an npm package
   */
  private _isNpmPackage(specifier: string): boolean {
    if (specifier.startsWith('.') || specifier.startsWith('/')) {
      return false;
    }
    // Package names start with @scope/ or alphanumeric
    return /^(@[a-z0-9-~][a-z0-9-._~]*\/)?[a-z0-9-~][a-z0-9-._~]*/.test(specifier);
  }

  /**
   * Get a built-in module
   */
  getBuiltin(name: string): Record<string, unknown> | null {
    return this._builtins.get(name) || null;
  }

  /**
   * Check if module is cached
   */
  isCached(absolutePath: string): boolean {
    return this._cache.has(absolutePath);
  }

  /**
   * Get cached module
   */
  getCached(absolutePath: string): CachedModule | null {
    return this._cache.get(absolutePath) || null;
  }

  /**
   * Set cached module
   */
  setCached(absolutePath: string, module: CachedModule): void {
    this._cache.set(absolutePath, module);
  }

  /**
   * Clear module cache
   */
  clearCache(): void {
    this._cache.clear();
    logger.debug('Module cache cleared');
  }

  /**
   * Fetch external module from CDN
   */
  async fetchExternal(url: string): Promise<string> {
    // Check pending fetches to avoid duplicate requests
    if (this._pendingFetches.has(url)) {
      return this._pendingFetches.get(url)!;
    }

    const fetchPromise = this._doFetch(url);
    this._pendingFetches.set(url, fetchPromise);

    try {
      const result = await fetchPromise;
      return result;
    } finally {
      this._pendingFetches.delete(url);
    }
  }

  private async _doFetch(url: string): Promise<string> {
    logger.debug(`Fetching external module: ${url}`);

    try {
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      return await response.text();
    } catch (error) {
      logger.error(`Failed to fetch ${url}:`, error);
      throw error;
    }
  }

  /**
   * Create a require function bound to a specific file context
   */
  createRequire(fromFile: string): (specifier: string) => unknown {
    return (specifier: string) => {
      return this.requireSync(specifier, fromFile);
    };
  }

  /**
   * Synchronous require (for built-ins and cached modules only)
   */
  requireSync(specifier: string, fromFile: string = '/'): unknown {
    const resolution = this.resolve(specifier, fromFile);

    if (!resolution.found) {
      throw new Error(`Cannot find module '${specifier}'`);
    }

    // Built-in modules
    if (resolution.isBuiltin) {
      return this._builtins.get(specifier);
    }

    // External modules can't be required synchronously
    if (resolution.isExternal) {
      throw new Error(
        `Cannot synchronously require external module '${specifier}'. Use async import instead.`,
      );
    }

    // Check cache
    const cached = this._cache.get(resolution.path);
    if (cached?.loaded) {
      return cached.exports;
    }

    // Module needs to be loaded
    throw new Error(
      `Module '${specifier}' at '${resolution.path}' is not yet loaded. ` +
      `Load it first using the async loader.`,
    );
  }

  /**
   * Get list of all builtin module names
   */
  getBuiltinNames(): string[] {
    return Array.from(this._builtins.keys());
  }
}

/**
 * Factory function
 */
export function createModuleResolver(
  fs: VirtualFS,
  process: ProcessShim,
  config?: ModuleResolverConfig,
): ModuleResolver {
  return new ModuleResolver(fs, process, config);
}
