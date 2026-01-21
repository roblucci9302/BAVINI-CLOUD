/**
 * =============================================================================
 * BAVINI Runtime Engine - Types
 * =============================================================================
 * Type definitions for the QuickJS-based Node.js compatible runtime.
 * =============================================================================
 */

/**
 * Runtime status
 */
export type RuntimeStatus = 'idle' | 'initializing' | 'ready' | 'executing' | 'error';

/**
 * Execution result from QuickJS
 */
export interface ExecutionResult {
  success: boolean;
  value?: unknown;
  error?: string;
  stdout: string;
  stderr: string;
  executionTime: number;
}

/**
 * Module resolution result
 */
export interface ModuleResolution {
  found: boolean;
  path: string;
  content?: string;
  isBuiltin: boolean;
  /** Whether the module is external (fetched from CDN) */
  isExternal?: boolean;
}

/**
 * Process environment shim
 */
export interface ProcessEnv {
  [key: string]: string | undefined;
  NODE_ENV?: string;
  HOME?: string;
  PATH?: string;
}

/**
 * Minimal process shim interface
 */
export interface ProcessShim {
  env: ProcessEnv;
  cwd: () => string;
  chdir: (dir: string) => void;
  platform: string;
  arch: string;
  version: string;
  versions: { node: string; v8: string; quickjs: string };
  argv: string[];
  exit: (code?: number) => void;
  nextTick: (callback: () => void) => void;
  hrtime: (time?: [number, number]) => [number, number];
  stdout: {
    write: (data: string) => void;
    isTTY: boolean;
  };
  stderr: {
    write: (data: string) => void;
    isTTY: boolean;
  };
}

/**
 * File system stats
 */
export interface FSStats {
  isFile: () => boolean;
  isDirectory: () => boolean;
  isSymbolicLink: () => boolean;
  size: number;
  mtime: Date;
  atime: Date;
  ctime: Date;
  birthtime: Date;
  mode: number;
}

/**
 * Virtual file system interface (Node.js fs compatible subset)
 */
export interface VirtualFS {
  // Sync operations
  readFileSync(path: string, encoding?: BufferEncoding): string | Buffer;
  writeFileSync(path: string, data: string | Buffer): void;
  existsSync(path: string): boolean;
  mkdirSync(path: string, options?: { recursive?: boolean }): void;
  rmdirSync(path: string, options?: { recursive?: boolean }): void;
  unlinkSync(path: string): void;
  readdirSync(path: string): string[];
  statSync(path: string): FSStats;
  lstatSync(path: string): FSStats;
  renameSync(oldPath: string, newPath: string): void;
  copyFileSync(src: string, dest: string): void;

  // Async operations
  readFile(path: string, encoding?: BufferEncoding): Promise<string | Buffer>;
  writeFile(path: string, data: string | Buffer): Promise<void>;
  mkdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  rmdir(path: string, options?: { recursive?: boolean }): Promise<void>;
  unlink(path: string): Promise<void>;
  readdir(path: string): Promise<string[]>;
  stat(path: string): Promise<FSStats>;

  // BAVINI-specific
  toJSON(): Record<string, string>;
  fromJSON(data: Record<string, string>): void;
  clear(): void;
}

/**
 * QuickJS Runtime configuration
 */
export interface QuickJSRuntimeConfig {
  memoryLimitBytes?: number;
  maxStackSizeBytes?: number;
  interruptAfterMs?: number;
  moduleResolver?: (specifier: string, referrer: string) => ModuleResolution;
}

/**
 * Runtime callbacks
 */
export interface RuntimeCallbacks {
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
  onStatusChange?: (status: RuntimeStatus) => void;
  onModuleLoad?: (specifier: string) => void;
  onError?: (error: Error) => void;
}

/**
 * Builtin module definition
 */
export interface BuiltinModule {
  name: string;
  exports: Record<string, unknown>;
}
