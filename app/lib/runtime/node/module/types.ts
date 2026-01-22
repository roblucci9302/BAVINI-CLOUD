/**
 * =============================================================================
 * BAVINI Container - Module System Types
 * =============================================================================
 * Type definitions for the Node.js module system implementation.
 * =============================================================================
 */

/**
 * Module object interface (CommonJS)
 */
export interface NodeModule {
  id: string;
  filename: string;
  path: string;
  exports: unknown;
  parent: NodeModule | null;
  children: NodeModule[];
  loaded: boolean;
  paths: string[];
  require: RequireFunction;
}

/**
 * Require function interface
 */
export interface RequireFunction {
  (id: string): unknown;
  resolve: RequireResolve;
  cache: Record<string, NodeModule>;
  main: NodeModule | undefined;
  extensions: Record<string, (module: NodeModule, filename: string) => void>;
}

/**
 * Require.resolve function interface
 */
export interface RequireResolve {
  (id: string, options?: ResolveOptions): string;
  paths: (id: string) => string[] | null;
}

/**
 * Resolve options
 */
export interface ResolveOptions {
  paths?: string[];
}

/**
 * Module resolution result
 */
export interface ResolvedModule {
  filename: string;
  format: 'commonjs' | 'module' | 'json' | 'builtin' | 'native';
  isBuiltin: boolean;
}

/**
 * Package.json structure
 */
export interface PackageJson {
  name?: string;
  version?: string;
  main?: string;
  module?: string;
  exports?: string | Record<string, string | Record<string, string>>;
  type?: 'commonjs' | 'module';
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

/**
 * Module cache entry
 */
export interface ModuleCacheEntry {
  module: NodeModule;
  timestamp: number;
}

/**
 * Module loader options
 */
export interface ModuleLoaderOptions {
  cwd?: string;
  nodeModulesPath?: string;
  builtins?: Record<string, unknown>;
  extensions?: string[];
}

/**
 * Filesystem interface for module loading
 */
export interface ModuleFS {
  readFile(path: string): Promise<string>;
  readFileSync(path: string): string;
  existsSync(path: string): boolean;
  statSync(path: string): { isFile(): boolean; isDirectory(): boolean };
  readdirSync(path: string): string[];
}

/**
 * ESM import meta
 */
export interface ImportMeta {
  url: string;
  resolve: (specifier: string) => string;
}

/**
 * ESM module namespace
 */
export interface ModuleNamespace {
  default?: unknown;
  [key: string]: unknown;
}
