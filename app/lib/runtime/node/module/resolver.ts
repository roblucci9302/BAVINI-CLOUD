/**
 * =============================================================================
 * BAVINI Container - Module Resolver
 * =============================================================================
 * Node.js module resolution algorithm implementation.
 * =============================================================================
 */

import * as path from '../core-modules/path';
import type { ModuleFS, PackageJson, ResolvedModule, ResolveOptions } from './types';

/**
 * Default extensions to try
 */
const DEFAULT_EXTENSIONS = ['.js', '.mjs', '.cjs', '.json', '.node'];

/**
 * Built-in modules
 */
const BUILTIN_MODULES = new Set([
  'assert',
  'buffer',
  'child_process',
  'cluster',
  'console',
  'constants',
  'crypto',
  'dgram',
  'dns',
  'domain',
  'events',
  'fs',
  'http',
  'https',
  'module',
  'net',
  'os',
  'path',
  'process',
  'punycode',
  'querystring',
  'readline',
  'repl',
  'stream',
  'string_decoder',
  'sys',
  'timers',
  'tls',
  'tty',
  'url',
  'util',
  'v8',
  'vm',
  'worker_threads',
  'zlib',
]);

/**
 * Module resolver class
 */
export class ModuleResolver {
  private _fs: ModuleFS;
  private _extensions: string[];
  private _packageCache: Map<string, PackageJson | null> = new Map();

  constructor(fs: ModuleFS, extensions: string[] = DEFAULT_EXTENSIONS) {
    this._fs = fs;
    this._extensions = extensions;
  }

  /**
   * Resolve a module specifier to a filename
   */
  resolve(specifier: string, parentPath: string, options?: ResolveOptions): ResolvedModule {
    // Check for built-in modules
    if (this.isBuiltin(specifier)) {
      return {
        filename: specifier,
        format: 'builtin',
        isBuiltin: true,
      };
    }

    // Handle node: prefix
    if (specifier.startsWith('node:')) {
      const name = specifier.slice(5);

      if (this.isBuiltin(name)) {
        return {
          filename: name,
          format: 'builtin',
          isBuiltin: true,
        };
      }

      throw new Error(`Cannot find module '${specifier}'`);
    }

    // Determine if relative, absolute, or package
    const isRelative = specifier.startsWith('./') || specifier.startsWith('../');
    const isAbsolute = path.isAbsolute(specifier);

    if (isRelative || isAbsolute) {
      // Resolve as file or directory
      const basePath = isAbsolute ? specifier : path.resolve(path.dirname(parentPath), specifier);

      const resolved = this._resolveFile(basePath) || this._resolveDirectory(basePath);

      if (resolved) {
        return {
          filename: resolved,
          format: this._getFormat(resolved),
          isBuiltin: false,
        };
      }

      throw new Error(`Cannot find module '${specifier}'`);
    }

    // Resolve as node_modules package
    const searchPaths = options?.paths || this._getNodeModulePaths(path.dirname(parentPath));

    for (const searchPath of searchPaths) {
      const packagePath = path.join(searchPath, specifier);
      const resolved = this._resolveFile(packagePath) || this._resolveDirectory(packagePath);

      if (resolved) {
        return {
          filename: resolved,
          format: this._getFormat(resolved),
          isBuiltin: false,
        };
      }

      // Try subpath exports
      const parts = specifier.split('/');
      const packageName = parts[0].startsWith('@') ? `${parts[0]}/${parts[1]}` : parts[0];
      const subpath = parts.slice(packageName.split('/').length).join('/');

      if (subpath) {
        const pkgPath = path.join(searchPath, packageName);
        const pkgJson = this._loadPackageJson(pkgPath);

        if (pkgJson?.exports) {
          const exportResolved = this._resolveExports(pkgPath, pkgJson.exports, `./${subpath}`);

          if (exportResolved) {
            return {
              filename: exportResolved,
              format: this._getFormat(exportResolved),
              isBuiltin: false,
            };
          }
        }

        // Fallback to direct file
        const directPath = path.join(pkgPath, subpath);
        const directResolved = this._resolveFile(directPath) || this._resolveDirectory(directPath);

        if (directResolved) {
          return {
            filename: directResolved,
            format: this._getFormat(directResolved),
            isBuiltin: false,
          };
        }
      }
    }

    throw new Error(`Cannot find module '${specifier}'`);
  }

  /**
   * Check if a module is a built-in
   */
  isBuiltin(name: string): boolean {
    return BUILTIN_MODULES.has(name);
  }

  /**
   * Get node_modules search paths
   */
  _getNodeModulePaths(startDir: string): string[] {
    const paths: string[] = [];
    let dir = startDir;

    while (true) {
      const nodeModulesPath = path.join(dir, 'node_modules');
      paths.push(nodeModulesPath);

      const parentDir = path.dirname(dir);

      if (parentDir === dir) {
        break;
      }

      dir = parentDir;
    }

    return paths;
  }

  /**
   * Resolve as a file
   */
  private _resolveFile(filePath: string): string | null {
    // Try exact path
    if (this._isFile(filePath)) {
      return filePath;
    }

    // Try with extensions
    for (const ext of this._extensions) {
      const withExt = filePath + ext;

      if (this._isFile(withExt)) {
        return withExt;
      }
    }

    return null;
  }

  /**
   * Resolve as a directory
   */
  private _resolveDirectory(dirPath: string): string | null {
    if (!this._isDirectory(dirPath)) {
      return null;
    }

    // Check package.json
    const pkgJson = this._loadPackageJson(dirPath);

    if (pkgJson) {
      // Check exports field
      if (pkgJson.exports) {
        const exportResolved = this._resolveExports(dirPath, pkgJson.exports, '.');

        if (exportResolved) {
          return exportResolved;
        }
      }

      // Check main field
      if (pkgJson.main) {
        const mainPath = path.join(dirPath, pkgJson.main);
        const resolved = this._resolveFile(mainPath) || this._resolveDirectory(mainPath);

        if (resolved) {
          return resolved;
        }
      }
    }

    // Fallback to index
    return this._resolveFile(path.join(dirPath, 'index'));
  }

  /**
   * Resolve exports field
   */
  private _resolveExports(pkgPath: string, exports: string | Record<string, unknown>, subpath: string): string | null {
    // String export
    if (typeof exports === 'string') {
      if (subpath === '.') {
        const resolved = path.join(pkgPath, exports);
        return this._resolveFile(resolved);
      }

      return null;
    }

    // Object exports
    if (typeof exports === 'object' && exports !== null) {
      // Check for subpath match
      const match = (exports as Record<string, unknown>)[subpath];

      if (match) {
        return this._resolveExportValue(pkgPath, match);
      }

      // Check for pattern matches
      for (const [pattern, value] of Object.entries(exports)) {
        if (pattern.includes('*')) {
          const regex = new RegExp('^' + pattern.replace('*', '(.+)') + '$');
          const match = subpath.match(regex);

          if (match) {
            const replacement = match[1];
            const resolvedValue = typeof value === 'string' ? value.replace('*', replacement) : value;

            return this._resolveExportValue(pkgPath, resolvedValue);
          }
        }
      }
    }

    return null;
  }

  /**
   * Resolve an export value
   */
  private _resolveExportValue(pkgPath: string, value: unknown): string | null {
    if (typeof value === 'string') {
      const resolved = path.join(pkgPath, value);
      return this._resolveFile(resolved);
    }

    if (typeof value === 'object' && value !== null) {
      const conditions = value as Record<string, unknown>;

      // Try conditions in order of preference
      const conditionOrder = ['import', 'require', 'node', 'default'];

      for (const condition of conditionOrder) {
        if (condition in conditions) {
          return this._resolveExportValue(pkgPath, conditions[condition]);
        }
      }
    }

    return null;
  }

  /**
   * Load and cache package.json
   */
  private _loadPackageJson(dirPath: string): PackageJson | null {
    const pkgPath = path.join(dirPath, 'package.json');

    if (this._packageCache.has(pkgPath)) {
      return this._packageCache.get(pkgPath)!;
    }

    try {
      const content = this._fs.readFileSync(pkgPath);
      const pkg = JSON.parse(content) as PackageJson;
      this._packageCache.set(pkgPath, pkg);
      return pkg;
    } catch {
      this._packageCache.set(pkgPath, null);
      return null;
    }
  }

  /**
   * Get module format from filename
   */
  private _getFormat(filename: string): 'commonjs' | 'module' | 'json' {
    if (filename.endsWith('.json')) {
      return 'json';
    }

    if (filename.endsWith('.mjs')) {
      return 'module';
    }

    if (filename.endsWith('.cjs')) {
      return 'commonjs';
    }

    // Check package.json type field
    const pkgPath = this._findPackageJson(path.dirname(filename));

    if (pkgPath) {
      const pkg = this._loadPackageJson(path.dirname(pkgPath));

      if (pkg?.type === 'module') {
        return 'module';
      }
    }

    return 'commonjs';
  }

  /**
   * Find nearest package.json
   */
  private _findPackageJson(startDir: string): string | null {
    let dir = startDir;

    while (true) {
      const pkgPath = path.join(dir, 'package.json');

      if (this._isFile(pkgPath)) {
        return pkgPath;
      }

      const parentDir = path.dirname(dir);

      if (parentDir === dir) {
        return null;
      }

      dir = parentDir;
    }
  }

  /**
   * Check if path is a file
   */
  private _isFile(filePath: string): boolean {
    try {
      return this._fs.statSync(filePath).isFile();
    } catch {
      return false;
    }
  }

  /**
   * Check if path is a directory
   */
  private _isDirectory(dirPath: string): boolean {
    try {
      return this._fs.statSync(dirPath).isDirectory();
    } catch {
      return false;
    }
  }

  /**
   * Clear cache
   */
  clearCache(): void {
    this._packageCache.clear();
  }
}

/**
 * Create a resolver instance
 */
export function createResolver(fs: ModuleFS, extensions?: string[]): ModuleResolver {
  return new ModuleResolver(fs, extensions);
}

export default ModuleResolver;
