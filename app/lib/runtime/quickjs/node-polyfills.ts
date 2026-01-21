/**
 * =============================================================================
 * BAVINI Runtime Engine - Node.js Polyfills
 * =============================================================================
 * Polyfills for Node.js built-in modules to run in QuickJS/browser context.
 * =============================================================================
 */

import type { ProcessShim, ProcessEnv, VirtualFS } from './types';
import pathBrowserify from 'path-browserify';
import { Buffer } from 'buffer';
import EventEmitter from 'events';

// Re-export path module
export const path = pathBrowserify;

// Re-export Buffer
export { Buffer };

// Re-export EventEmitter
export { EventEmitter };

/**
 * Create a process shim
 */
export function createProcessShim(
  fs: VirtualFS,
  options: {
    cwd?: string;
    env?: ProcessEnv;
    onExit?: (code: number) => void;
    onStdout?: (data: string) => void;
    onStderr?: (data: string) => void;
  } = {},
): ProcessShim {
  let currentCwd = options.cwd || '/';
  const env: ProcessEnv = {
    NODE_ENV: 'development',
    HOME: '/home',
    PATH: '/usr/bin:/bin',
    ...options.env,
  };

  const stdoutBuffer: string[] = [];
  const stderrBuffer: string[] = [];

  return {
    env,

    cwd: () => currentCwd,

    chdir: (dir: string) => {
      // Normalize path
      const newPath = dir.startsWith('/') ? dir : path.join(currentCwd, dir);
      if (fs.existsSync(newPath)) {
        currentCwd = newPath;
      } else {
        throw new Error(`ENOENT: no such file or directory: ${dir}`);
      }
    },

    platform: 'browser',
    arch: 'wasm32',
    version: 'v20.0.0',
    versions: {
      node: '20.0.0',
      v8: '0.0.0',
      quickjs: '2024-01-13',
    },

    argv: ['node', 'script.js'],

    exit: (code = 0) => {
      options.onExit?.(code);
    },

    nextTick: (callback: () => void) => {
      queueMicrotask(callback);
    },

    hrtime: (time?: [number, number]): [number, number] => {
      const now = performance.now();
      const seconds = Math.floor(now / 1000);
      const nanoseconds = Math.floor((now % 1000) * 1e6);

      if (time) {
        const diffSeconds = seconds - time[0];
        const diffNanos = nanoseconds - time[1];
        return diffNanos < 0 ? [diffSeconds - 1, 1e9 + diffNanos] : [diffSeconds, diffNanos];
      }

      return [seconds, nanoseconds];
    },

    stdout: {
      write: (data: string) => {
        stdoutBuffer.push(data);
        options.onStdout?.(data);
      },
      isTTY: false,
    },

    stderr: {
      write: (data: string) => {
        stderrBuffer.push(data);
        options.onStderr?.(data);
      },
      isTTY: false,
    },
  };
}

/**
 * Console implementation for QuickJS
 */
export function createConsoleShim(
  onLog?: (level: string, ...args: unknown[]) => void,
): Console {
  const formatArgs = (...args: unknown[]): string => {
    return args
      .map((arg) => {
        if (typeof arg === 'string') return arg;
        if (arg === null) return 'null';
        if (arg === undefined) return 'undefined';
        try {
          return JSON.stringify(arg, null, 2);
        } catch {
          return String(arg);
        }
      })
      .join(' ');
  };

  const createLogMethod =
    (level: string) =>
    (...args: unknown[]) => {
      const message = formatArgs(...args);
      onLog?.(level, ...args);
      // Also log to real console in development
      if (typeof globalThis.console !== 'undefined') {
        (globalThis.console as Record<string, unknown>)[level]?.('[QuickJS]', ...args);
      }
    };

  return {
    log: createLogMethod('log'),
    info: createLogMethod('info'),
    warn: createLogMethod('warn'),
    error: createLogMethod('error'),
    debug: createLogMethod('debug'),
    trace: createLogMethod('trace'),
    dir: createLogMethod('dir'),
    dirxml: createLogMethod('dirxml'),
    table: createLogMethod('table'),
    count: createLogMethod('count'),
    countReset: createLogMethod('countReset'),
    group: createLogMethod('group'),
    groupCollapsed: createLogMethod('groupCollapsed'),
    groupEnd: () => onLog?.('groupEnd'),
    time: createLogMethod('time'),
    timeEnd: createLogMethod('timeEnd'),
    timeLog: createLogMethod('timeLog'),
    timeStamp: createLogMethod('timeStamp'),
    assert: (condition: boolean, ...args: unknown[]) => {
      if (!condition) {
        createLogMethod('error')('Assertion failed:', ...args);
      }
    },
    clear: () => onLog?.('clear'),
    profile: createLogMethod('profile'),
    profileEnd: createLogMethod('profileEnd'),
  } as Console;
}

/**
 * URL and URLSearchParams (use native browser APIs)
 */
export const URL = globalThis.URL;
export const URLSearchParams = globalThis.URLSearchParams;

/**
 * TextEncoder/TextDecoder (use native browser APIs)
 */
export const TextEncoder = globalThis.TextEncoder;
export const TextDecoder = globalThis.TextDecoder;

/**
 * Crypto polyfill (use Web Crypto API)
 */
export const crypto = {
  randomBytes: (size: number): Buffer => {
    const bytes = new Uint8Array(size);
    globalThis.crypto.getRandomValues(bytes);
    return Buffer.from(bytes);
  },

  randomUUID: (): string => {
    return globalThis.crypto.randomUUID();
  },

  createHash: (algorithm: string) => {
    let data = '';
    return {
      update: (input: string) => {
        data += input;
        return this;
      },
      digest: (encoding: 'hex' | 'base64' = 'hex') => {
        // Simple hash for basic use cases
        // For real crypto, use Web Crypto API async methods
        let hash = 0;
        for (let i = 0; i < data.length; i++) {
          const char = data.charCodeAt(i);
          hash = (hash << 5) - hash + char;
          hash = hash & hash;
        }
        const hashStr = Math.abs(hash).toString(16).padStart(8, '0');
        if (encoding === 'base64') {
          return btoa(hashStr);
        }
        return hashStr;
      },
    };
  },
};

/**
 * setTimeout/setInterval/clearTimeout/clearInterval
 * (These are available in QuickJS but we expose them for consistency)
 */
export const timers = {
  setTimeout: globalThis.setTimeout.bind(globalThis),
  setInterval: globalThis.setInterval.bind(globalThis),
  clearTimeout: globalThis.clearTimeout.bind(globalThis),
  clearInterval: globalThis.clearInterval.bind(globalThis),
  setImmediate: (fn: () => void) => globalThis.setTimeout(fn, 0),
  clearImmediate: globalThis.clearTimeout.bind(globalThis),
};

/**
 * OS module polyfill
 */
export const os = {
  platform: () => 'browser',
  arch: () => 'wasm32',
  cpus: () => [{ model: 'WASM', speed: 0, times: { user: 0, nice: 0, sys: 0, idle: 0, irq: 0 } }],
  totalmem: () => (navigator as { deviceMemory?: number }).deviceMemory ?? 4 * 1024 * 1024 * 1024,
  freemem: () => 2 * 1024 * 1024 * 1024,
  homedir: () => '/home',
  tmpdir: () => '/tmp',
  hostname: () => 'localhost',
  type: () => 'Browser',
  release: () => navigator.userAgent,
  networkInterfaces: () => ({}),
  uptime: () => performance.now() / 1000,
  loadavg: () => [0, 0, 0],
  endianness: () => 'LE' as const,
  EOL: '\n',
};

/**
 * util module polyfill
 */
export const util = {
  format: (format: string, ...args: unknown[]): string => {
    let i = 0;
    return format.replace(/%[sdjifoO%]/g, (match) => {
      if (match === '%%') return '%';
      if (i >= args.length) return match;
      const arg = args[i++];
      switch (match) {
        case '%s':
          return String(arg);
        case '%d':
        case '%i':
          return parseInt(String(arg), 10).toString();
        case '%f':
          return parseFloat(String(arg)).toString();
        case '%j':
          return JSON.stringify(arg);
        case '%o':
        case '%O':
          return JSON.stringify(arg, null, 2);
        default:
          return match;
      }
    });
  },

  inspect: (obj: unknown, _options?: unknown): string => {
    try {
      return JSON.stringify(obj, null, 2);
    } catch {
      return String(obj);
    }
  },

  promisify:
    <T>(fn: (...args: unknown[]) => void) =>
    (...args: unknown[]): Promise<T> => {
      return new Promise((resolve, reject) => {
        fn(...args, (err: Error | null, result: T) => {
          if (err) reject(err);
          else resolve(result);
        });
      });
    },

  inherits: (ctor: { prototype: unknown; super_?: unknown }, superCtor: { prototype: unknown }) => {
    Object.setPrototypeOf(ctor.prototype, superCtor.prototype);
    ctor.super_ = superCtor;
  },

  deprecate: <T extends (...args: unknown[]) => unknown>(fn: T, _msg: string): T => fn,

  isArray: Array.isArray,
  isBoolean: (arg: unknown): arg is boolean => typeof arg === 'boolean',
  isNull: (arg: unknown): arg is null => arg === null,
  isNullOrUndefined: (arg: unknown): arg is null | undefined => arg == null,
  isNumber: (arg: unknown): arg is number => typeof arg === 'number',
  isString: (arg: unknown): arg is string => typeof arg === 'string',
  isSymbol: (arg: unknown): arg is symbol => typeof arg === 'symbol',
  isUndefined: (arg: unknown): arg is undefined => arg === undefined,
  isRegExp: (arg: unknown): arg is RegExp => arg instanceof RegExp,
  isObject: (arg: unknown): arg is object => typeof arg === 'object' && arg !== null,
  isDate: (arg: unknown): arg is Date => arg instanceof Date,
  isError: (arg: unknown): arg is Error => arg instanceof Error,
  isFunction: (arg: unknown): arg is (...args: unknown[]) => unknown => typeof arg === 'function',
  isPrimitive: (arg: unknown): boolean =>
    arg === null || (typeof arg !== 'object' && typeof arg !== 'function'),
  isBuffer: (arg: unknown): arg is Buffer => Buffer.isBuffer(arg),
};

/**
 * Module factory type
 */
export type ModuleFactory = (
  fs: VirtualFS,
  process: ProcessShim,
) => Record<string, unknown>;

/**
 * Get all builtin modules
 */
export function getBuiltinModules(
  fs: VirtualFS,
  process: ProcessShim,
): Map<string, Record<string, unknown>> {
  const modules = new Map<string, Record<string, unknown>>();

  // Core modules
  modules.set('path', path);
  modules.set('buffer', { Buffer });
  modules.set('events', { EventEmitter, default: EventEmitter });
  modules.set('util', util);
  modules.set('os', os);
  modules.set('crypto', crypto);

  // FS module (wraps our virtual FS)
  modules.set('fs', {
    ...fs,
    promises: {
      readFile: fs.readFile.bind(fs),
      writeFile: fs.writeFile.bind(fs),
      mkdir: fs.mkdir.bind(fs),
      rmdir: fs.rmdir.bind(fs),
      unlink: fs.unlink.bind(fs),
      readdir: fs.readdir.bind(fs),
      stat: fs.stat.bind(fs),
    },
  });

  // Process module
  modules.set('process', process);

  // Timers
  modules.set('timers', timers);

  // URL
  modules.set('url', { URL, URLSearchParams });

  // Globals
  modules.set('globals', {
    Buffer,
    process,
    console: createConsoleShim(),
    URL,
    URLSearchParams,
    TextEncoder,
    TextDecoder,
    setTimeout: timers.setTimeout,
    setInterval: timers.setInterval,
    clearTimeout: timers.clearTimeout,
    clearInterval: timers.clearInterval,
    setImmediate: timers.setImmediate,
    clearImmediate: timers.clearImmediate,
    queueMicrotask: globalThis.queueMicrotask,
  });

  return modules;
}
