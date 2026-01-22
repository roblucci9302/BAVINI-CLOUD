/**
 * =============================================================================
 * BAVINI Container - ESM Loader
 * =============================================================================
 * ES Modules loader implementation for browser environment.
 * =============================================================================
 */

import * as path from '../core-modules/path';
import { ModuleResolver } from './resolver';
import type { ModuleFS, ModuleNamespace, ImportMeta, ModuleLoaderOptions } from './types';

/**
 * ESM module record
 */
interface ESMModule {
  url: string;
  status: 'unlinked' | 'linking' | 'linked' | 'evaluating' | 'evaluated' | 'error';
  namespace: ModuleNamespace | null;
  error: Error | null;
  dependencies: Map<string, ESMModule>;
  evaluate: () => Promise<ModuleNamespace>;
}

/**
 * ESM loader class
 */
export class ESMLoader {
  private _fs: ModuleFS;
  private _resolver: ModuleResolver;
  private _moduleCache: Map<string, ESMModule> = new Map();
  private _builtins: Map<string, ModuleNamespace> = new Map();
  private _cwd: string;

  constructor(fs: ModuleFS, options: ModuleLoaderOptions = {}) {
    this._fs = fs;
    this._cwd = options.cwd || '/';
    this._resolver = new ModuleResolver(fs, options.extensions);

    // Register built-in modules
    this._registerBuiltins(options.builtins || {});
  }

  /**
   * Register built-in modules
   */
  private _registerBuiltins(additional: Record<string, unknown>): void {
    // These will be imported dynamically to avoid circular dependencies
    const builtinNames = [
      'path',
      'events',
      'util',
      'fs',
      'stream',
      'http',
      'crypto',
      'child_process',
      'buffer',
    ];

    for (const name of builtinNames) {
      this._builtins.set(name, { default: null, __esModule: true });
    }

    for (const [name, exports] of Object.entries(additional)) {
      this._builtins.set(name, { default: exports, ...exports as object, __esModule: true });
    }
  }

  /**
   * Import a module
   */
  async import(specifier: string, parentUrl?: string): Promise<ModuleNamespace> {
    const resolvedUrl = this._resolve(specifier, parentUrl);

    // Check for built-in
    if (this._builtins.has(specifier) || this._builtins.has(specifier.replace('node:', ''))) {
      const name = specifier.replace('node:', '');
      return this._getBuiltin(name);
    }

    // Check cache
    const cached = this._moduleCache.get(resolvedUrl);

    if (cached && cached.status === 'evaluated') {
      return cached.namespace!;
    }

    // Load and evaluate module
    const module = await this._loadModule(resolvedUrl);
    return module.evaluate();
  }

  /**
   * Get built-in module
   */
  private async _getBuiltin(name: string): Promise<ModuleNamespace> {
    // Lazy load built-ins
    switch (name) {
      case 'path': {
        const mod = await import('../core-modules/path');
        return { ...mod, default: mod.default };
      }
      case 'events': {
        const mod = await import('../core-modules/events');
        return { ...mod, default: mod.default };
      }
      case 'util': {
        const mod = await import('../core-modules/util');
        return { ...mod, default: mod.default };
      }
      case 'fs': {
        const mod = await import('../core-modules/fs');
        return { ...mod, default: mod.default };
      }
      case 'stream': {
        const mod = await import('../core-modules/stream');
        return { ...mod, default: mod.default };
      }
      case 'http': {
        const mod = await import('../core-modules/http');
        return { ...mod, default: mod.default };
      }
      case 'crypto': {
        const mod = await import('../core-modules/crypto');
        return { ...mod, default: mod.default };
      }
      case 'child_process': {
        const mod = await import('../core-modules/child_process');
        return { ...mod, default: mod.default };
      }
      case 'buffer': {
        const { Buffer } = await import('../globals/buffer');
        return { Buffer, default: { Buffer } };
      }
      default:
        throw new Error(`Built-in module '${name}' not implemented`);
    }
  }

  /**
   * Resolve a specifier to a URL
   */
  private _resolve(specifier: string, parentUrl?: string): string {
    // Handle node: prefix
    if (specifier.startsWith('node:')) {
      return specifier;
    }

    // Handle built-in modules
    if (this._resolver.isBuiltin(specifier)) {
      return `node:${specifier}`;
    }

    // Handle absolute URLs
    if (specifier.startsWith('file://') || specifier.startsWith('http://') || specifier.startsWith('https://')) {
      return specifier;
    }

    // Handle relative and package specifiers
    const parentPath = parentUrl ? this._urlToPath(parentUrl) : this._cwd + '/index.js';
    const resolved = this._resolver.resolve(specifier, parentPath);

    return this._pathToUrl(resolved.filename);
  }

  /**
   * Load a module
   */
  private async _loadModule(url: string): Promise<ESMModule> {
    // Check cache
    const cached = this._moduleCache.get(url);

    if (cached) {
      if (cached.status === 'error') {
        throw cached.error;
      }

      return cached;
    }

    // Create module record
    const module: ESMModule = {
      url,
      status: 'unlinked',
      namespace: null,
      error: null,
      dependencies: new Map(),
      evaluate: async () => this._evaluateModule(module),
    };

    this._moduleCache.set(url, module);

    try {
      // Load source
      const source = await this._fetchSource(url);

      // Parse and collect dependencies
      const dependencies = this._parseDependencies(source);

      // Load dependencies
      module.status = 'linking';

      for (const dep of dependencies) {
        const resolvedDep = this._resolve(dep, url);
        const depModule = await this._loadModule(resolvedDep);
        module.dependencies.set(dep, depModule);
      }

      module.status = 'linked';

      return module;
    } catch (error) {
      module.status = 'error';
      module.error = error as Error;
      throw error;
    }
  }

  /**
   * Fetch module source
   */
  private async _fetchSource(url: string): Promise<string> {
    // Handle file:// URLs
    if (url.startsWith('file://')) {
      const filePath = this._urlToPath(url);
      return this._fs.readFile(filePath);
    }

    // Handle http/https URLs
    if (url.startsWith('http://') || url.startsWith('https://')) {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Failed to fetch module: ${url}`);
      }

      return response.text();
    }

    // Assume file path
    return this._fs.readFile(url);
  }

  /**
   * Parse import statements to find dependencies
   */
  private _parseDependencies(source: string): string[] {
    const dependencies: string[] = [];

    // Match static imports
    const importRegex = /import\s+(?:(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)\s+from\s+)?['"]([^'"]+)['"]/g;
    let match;

    while ((match = importRegex.exec(source)) !== null) {
      dependencies.push(match[1]);
    }

    // Match dynamic imports
    const dynamicImportRegex = /import\s*\(\s*['"]([^'"]+)['"]\s*\)/g;

    while ((match = dynamicImportRegex.exec(source)) !== null) {
      dependencies.push(match[1]);
    }

    // Match export from
    const exportFromRegex = /export\s+(?:\{[^}]*\}|\*)\s+from\s+['"]([^'"]+)['"]/g;

    while ((match = exportFromRegex.exec(source)) !== null) {
      dependencies.push(match[1]);
    }

    return [...new Set(dependencies)];
  }

  /**
   * Evaluate a module
   */
  private async _evaluateModule(module: ESMModule): Promise<ModuleNamespace> {
    if (module.status === 'evaluated') {
      return module.namespace!;
    }

    if (module.status === 'error') {
      throw module.error;
    }

    if (module.status === 'evaluating') {
      // Circular dependency - return partial namespace
      return module.namespace || {};
    }

    module.status = 'evaluating';

    try {
      // Evaluate dependencies first
      for (const [, depModule] of module.dependencies) {
        await depModule.evaluate();
      }

      // Load and transform source
      const source = await this._fetchSource(module.url);
      const namespace = await this._executeModule(source, module);

      module.namespace = namespace;
      module.status = 'evaluated';

      return namespace;
    } catch (error) {
      module.status = 'error';
      module.error = error as Error;
      throw error;
    }
  }

  /**
   * Execute a module
   */
  private async _executeModule(source: string, module: ESMModule): Promise<ModuleNamespace> {
    // Create import.meta
    const importMeta: ImportMeta = {
      url: module.url,
      resolve: (specifier: string) => this._resolve(specifier, module.url),
    };

    // Transform ESM to executable code
    // This is a simplified transformation - a real implementation would use a proper parser
    let transformed = source;

    // Replace imports with variable declarations
    const imports: Array<{ specifier: string; bindings: string[] }> = [];

    // Match and replace import statements
    transformed = transformed.replace(
      /import\s+(\{[^}]+\}|\*\s+as\s+\w+|\w+(?:\s*,\s*\{[^}]+\})?)\s+from\s+['"]([^'"]+)['"]\s*;?/g,
      (match, bindings, specifier) => {
        imports.push({ specifier, bindings: [bindings] });
        return `// ${match}`;
      },
    );

    // Replace bare imports
    transformed = transformed.replace(/import\s+['"]([^'"]+)['"]\s*;?/g, (match, specifier) => {
      imports.push({ specifier, bindings: [] });
      return `// ${match}`;
    });

    // Build namespace
    const namespace: ModuleNamespace = {};

    // Import dependencies
    const resolvedImports: Record<string, ModuleNamespace> = {};

    for (const { specifier } of imports) {
      const depModule = module.dependencies.get(specifier);

      if (depModule) {
        resolvedImports[specifier] = await depModule.evaluate();
      } else if (specifier.startsWith('node:') || this._resolver.isBuiltin(specifier)) {
        resolvedImports[specifier] = await this._getBuiltin(specifier.replace('node:', ''));
      }
    }

    // For now, we can't fully execute ESM in browser without a proper transpiler
    // Return the resolved imports as a namespace
    for (const [specifier, mod] of Object.entries(resolvedImports)) {
      Object.assign(namespace, mod);
    }

    // Extract exports from source (simplified)
    const exportDefaultMatch = source.match(/export\s+default\s+(\w+|{[\s\S]*?}|\[[\s\S]*?\]|function[\s\S]*?}|class[\s\S]*?})/);

    if (exportDefaultMatch) {
      namespace.default = exportDefaultMatch[1];
    }

    return namespace;
  }

  /**
   * Convert file path to URL
   */
  private _pathToUrl(filePath: string): string {
    if (filePath.startsWith('file://')) {
      return filePath;
    }

    return `file://${filePath}`;
  }

  /**
   * Convert URL to file path
   */
  private _urlToPath(url: string): string {
    if (url.startsWith('file://')) {
      return url.slice(7);
    }

    return url;
  }

  /**
   * Clear the module cache
   */
  clearCache(): void {
    this._moduleCache.clear();
    this._resolver.clearCache();
  }

  /**
   * Register a built-in module
   */
  registerBuiltin(name: string, namespace: ModuleNamespace): void {
    this._builtins.set(name, namespace);
  }
}

/**
 * Create an ESM loader
 */
export function createESMLoader(fs: ModuleFS, options?: ModuleLoaderOptions): ESMLoader {
  return new ESMLoader(fs, options);
}

export default ESMLoader;
