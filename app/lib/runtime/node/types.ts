/**
 * =============================================================================
 * BAVINI Container - Node.js Runtime Types
 * =============================================================================
 * Type definitions for the Node.js runtime emulation.
 * =============================================================================
 */

/**
 * Process environment
 */
export interface ProcessEnv {
  [key: string]: string | undefined;
  NODE_ENV?: string;
  PATH?: string;
  HOME?: string;
  PWD?: string;
  USER?: string;
}

/**
 * Process object interface (partial Node.js process)
 */
export interface ProcessObject {
  /** Environment variables */
  env: ProcessEnv;
  /** Command line arguments */
  argv: string[];
  /** Node.js version */
  version: string;
  /** Version info */
  versions: Record<string, string>;
  /** Platform identifier */
  platform: string;
  /** CPU architecture */
  arch: string;
  /** Process ID (simulated) */
  pid: number;
  /** Parent process ID */
  ppid: number;
  /** Current working directory */
  cwd: () => string;
  /** Change directory */
  chdir: (directory: string) => void;
  /** Exit process */
  exit: (code?: number) => never;
  /** Next tick */
  nextTick: (callback: () => void, ...args: unknown[]) => void;
  /** High-resolution time */
  hrtime: {
    (time?: [number, number]): [number, number];
    bigint: () => bigint;
  };
  /** Memory usage */
  memoryUsage: () => MemoryUsage;
  /** Uptime in seconds */
  uptime: () => number;
  /** Standard streams */
  stdout: WritableStreamLike;
  stderr: WritableStreamLike;
  stdin: ReadableStreamLike;
  /** Event emitter methods */
  on: (event: string, listener: (...args: unknown[]) => void) => ProcessObject;
  once: (event: string, listener: (...args: unknown[]) => void) => ProcessObject;
  off: (event: string, listener: (...args: unknown[]) => void) => ProcessObject;
  emit: (event: string, ...args: unknown[]) => boolean;
  /** Title */
  title: string;
  /** Release info */
  release: {
    name: string;
    sourceUrl?: string;
    headersUrl?: string;
  };
}

/**
 * Memory usage info
 */
export interface MemoryUsage {
  rss: number;
  heapTotal: number;
  heapUsed: number;
  external: number;
  arrayBuffers: number;
}

/**
 * Writable stream like interface
 */
export interface WritableStreamLike {
  write: (chunk: string | Uint8Array, encoding?: string, callback?: () => void) => boolean;
  end: (callback?: () => void) => void;
  isTTY?: boolean;
}

/**
 * Readable stream like interface
 */
export interface ReadableStreamLike {
  read: (size?: number) => string | Uint8Array | null;
  on: (event: string, listener: (...args: unknown[]) => void) => void;
  isTTY?: boolean;
}

/**
 * Buffer class interface
 */
export interface BufferConstructor {
  /** Allocate buffer */
  alloc: (size: number, fill?: number | string, encoding?: string) => Buffer;
  /** Allocate unsafe (uninitialized) */
  allocUnsafe: (size: number) => Buffer;
  /** Create from array/string */
  from: (data: ArrayLike<number> | string | ArrayBuffer, encoding?: string) => Buffer;
  /** Concatenate buffers */
  concat: (list: Buffer[], totalLength?: number) => Buffer;
  /** Check if buffer */
  isBuffer: (obj: unknown) => obj is Buffer;
  /** Check encoding */
  isEncoding: (encoding: string) => boolean;
  /** Byte length of string */
  byteLength: (string: string, encoding?: string) => number;
  /** Compare buffers */
  compare: (buf1: Buffer, buf2: Buffer) => number;
  /** Pool size */
  poolSize: number;
}

/**
 * Buffer instance interface
 * Note: We use a separate interface instead of extending Uint8Array
 * to avoid static method compatibility issues
 */
export interface Buffer {
  /** Length of the buffer */
  readonly length: number;
  /** Byte length */
  readonly byteLength: number;
  /** Array buffer */
  readonly buffer: ArrayBuffer;
  /** Byte offset */
  readonly byteOffset: number;
  /** Index access */
  [index: number]: number;
  /** Write string to buffer */
  write: (string: string, offset?: number, length?: number, encoding?: string) => number;
  /** Convert to string */
  toString: (encoding?: string, start?: number, end?: number) => string;
  /** Convert to JSON */
  toJSON: () => { type: 'Buffer'; data: number[] };
  /** Check equality */
  equals: (otherBuffer: Buffer) => boolean;
  /** Compare */
  compare: (target: Buffer, targetStart?: number, targetEnd?: number, sourceStart?: number, sourceEnd?: number) => number;
  /** Copy to target */
  copy: (target: Buffer, targetStart?: number, sourceStart?: number, sourceEnd?: number) => number;
  /** Slice (returns new Buffer) */
  slice: (start?: number, end?: number) => Buffer;
  /** Subarray */
  subarray: (start?: number, end?: number) => Buffer;
  /** Read integers */
  readInt8: (offset: number) => number;
  readInt16LE: (offset: number) => number;
  readInt16BE: (offset: number) => number;
  readInt32LE: (offset: number) => number;
  readInt32BE: (offset: number) => number;
  readUInt8: (offset: number) => number;
  readUInt16LE: (offset: number) => number;
  readUInt16BE: (offset: number) => number;
  readUInt32LE: (offset: number) => number;
  readUInt32BE: (offset: number) => number;
  readFloatLE: (offset: number) => number;
  readFloatBE: (offset: number) => number;
  readDoubleLE: (offset: number) => number;
  readDoubleBE: (offset: number) => number;
  /** Write integers */
  writeInt8: (value: number, offset: number) => number;
  writeInt16LE: (value: number, offset: number) => number;
  writeInt16BE: (value: number, offset: number) => number;
  writeInt32LE: (value: number, offset: number) => number;
  writeInt32BE: (value: number, offset: number) => number;
  writeUInt8: (value: number, offset: number) => number;
  writeUInt16LE: (value: number, offset: number) => number;
  writeUInt16BE: (value: number, offset: number) => number;
  writeUInt32LE: (value: number, offset: number) => number;
  writeUInt32BE: (value: number, offset: number) => number;
  writeFloatLE: (value: number, offset: number) => number;
  writeFloatBE: (value: number, offset: number) => number;
  writeDoubleLE: (value: number, offset: number) => number;
  writeDoubleBE: (value: number, offset: number) => number;
  /** Fill buffer */
  fill: (value: number | string | Buffer, offset?: number, end?: number, encoding?: string) => this;
  /** Index of */
  indexOf: (value: string | number | Buffer, byteOffset?: number, encoding?: string) => number;
  /** Last index of */
  lastIndexOf: (value: string | number | Buffer, byteOffset?: number, encoding?: string) => number;
  /** Includes */
  includes: (value: string | number | Buffer, byteOffset?: number, encoding?: string) => boolean;
}

/**
 * Console interface
 */
export interface ConsoleObject {
  log: (...args: unknown[]) => void;
  info: (...args: unknown[]) => void;
  warn: (...args: unknown[]) => void;
  error: (...args: unknown[]) => void;
  debug: (...args: unknown[]) => void;
  trace: (...args: unknown[]) => void;
  dir: (obj: unknown, options?: { depth?: number; colors?: boolean }) => void;
  table: (data: unknown, columns?: string[]) => void;
  time: (label?: string) => void;
  timeEnd: (label?: string) => void;
  timeLog: (label?: string, ...args: unknown[]) => void;
  count: (label?: string) => void;
  countReset: (label?: string) => void;
  group: (...args: unknown[]) => void;
  groupCollapsed: (...args: unknown[]) => void;
  groupEnd: () => void;
  clear: () => void;
  assert: (condition?: boolean, ...args: unknown[]) => void;
}

/**
 * Timer handle
 */
export interface TimerHandle {
  ref: () => TimerHandle;
  unref: () => TimerHandle;
  hasRef: () => boolean;
  refresh: () => TimerHandle;
  [Symbol.toPrimitive]: () => number;
}

/**
 * Module cache entry
 */
export interface ModuleCacheEntry {
  id: string;
  filename: string;
  loaded: boolean;
  exports: unknown;
  parent: ModuleCacheEntry | null;
  children: ModuleCacheEntry[];
  paths: string[];
}

/**
 * Require function interface
 */
export interface RequireFunction {
  (id: string): unknown;
  resolve: (id: string, options?: { paths?: string[] }) => string;
  cache: Record<string, ModuleCacheEntry>;
  main: ModuleCacheEntry | undefined;
}

/**
 * Module interface
 */
export interface ModuleObject {
  id: string;
  path: string;
  filename: string;
  loaded: boolean;
  exports: unknown;
  parent: ModuleObject | null;
  children: ModuleObject[];
  paths: string[];
  require: RequireFunction;
}

/**
 * Node.js runtime configuration
 */
export interface NodeRuntimeConfig {
  /** Current working directory */
  cwd?: string;
  /** Environment variables */
  env?: ProcessEnv;
  /** Standard output handler */
  stdout?: (data: string) => void;
  /** Standard error handler */
  stderr?: (data: string) => void;
  /** Standard input provider */
  stdin?: () => string | null;
  /** Execution timeout (ms) */
  timeout?: number;
  /** Memory limit (bytes) */
  memoryLimit?: number;
}

/**
 * Script execution result
 */
export interface ExecutionResult {
  /** Result value */
  value: unknown;
  /** Exit code */
  exitCode: number;
  /** Standard output */
  stdout: string;
  /** Standard error */
  stderr: string;
  /** Execution time (ms) */
  duration: number;
  /** Error if any */
  error?: Error;
}

/**
 * Supported encodings
 */
export type BufferEncoding =
  | 'ascii'
  | 'utf8'
  | 'utf-8'
  | 'utf16le'
  | 'utf-16le'
  | 'ucs2'
  | 'ucs-2'
  | 'base64'
  | 'base64url'
  | 'latin1'
  | 'binary'
  | 'hex';

/**
 * File system stats (matching Node.js)
 */
export interface Stats {
  isFile: () => boolean;
  isDirectory: () => boolean;
  isBlockDevice: () => boolean;
  isCharacterDevice: () => boolean;
  isSymbolicLink: () => boolean;
  isFIFO: () => boolean;
  isSocket: () => boolean;
  dev: number;
  ino: number;
  mode: number;
  nlink: number;
  uid: number;
  gid: number;
  rdev: number;
  size: number;
  blksize: number;
  blocks: number;
  atimeMs: number;
  mtimeMs: number;
  ctimeMs: number;
  birthtimeMs: number;
  atime: Date;
  mtime: Date;
  ctime: Date;
  birthtime: Date;
}

/**
 * Dirent (directory entry)
 */
export interface Dirent {
  name: string;
  isFile: () => boolean;
  isDirectory: () => boolean;
  isBlockDevice: () => boolean;
  isCharacterDevice: () => boolean;
  isSymbolicLink: () => boolean;
  isFIFO: () => boolean;
  isSocket: () => boolean;
}

/**
 * Event listener
 */
export type EventListener = (...args: unknown[]) => void;

/**
 * Event emitter interface
 */
export interface EventEmitterInterface {
  addListener: (eventName: string, listener: EventListener) => this;
  on: (eventName: string, listener: EventListener) => this;
  once: (eventName: string, listener: EventListener) => this;
  removeListener: (eventName: string, listener: EventListener) => this;
  off: (eventName: string, listener: EventListener) => this;
  removeAllListeners: (eventName?: string) => this;
  setMaxListeners: (n: number) => this;
  getMaxListeners: () => number;
  listeners: (eventName: string) => EventListener[];
  rawListeners: (eventName: string) => EventListener[];
  emit: (eventName: string, ...args: unknown[]) => boolean;
  listenerCount: (eventName: string) => number;
  prependListener: (eventName: string, listener: EventListener) => this;
  prependOnceListener: (eventName: string, listener: EventListener) => this;
  eventNames: () => (string | symbol)[];
}

/**
 * URL interface (matching Node.js URL)
 */
export interface URLInterface {
  hash: string;
  host: string;
  hostname: string;
  href: string;
  readonly origin: string;
  password: string;
  pathname: string;
  port: string;
  protocol: string;
  search: string;
  readonly searchParams: URLSearchParams;
  username: string;
  toString: () => string;
  toJSON: () => string;
}
