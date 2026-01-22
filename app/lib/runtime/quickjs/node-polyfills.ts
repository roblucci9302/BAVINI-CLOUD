/**
 * =============================================================================
 * BAVINI Runtime Engine - Node.js Polyfills
 * =============================================================================
 * Polyfills for Node.js built-in modules to run in QuickJS/browser context.
 * Uses the BAVINI Node runtime modules for consistent behavior.
 * =============================================================================
 */

import type { ProcessShim, ProcessEnv, VirtualFS } from './types';

// Import from our Node runtime modules
import * as pathModule from '../node/core-modules/path';
import { EventEmitter } from '../node/core-modules/events';
import { Buffer } from '../node/globals/buffer';
import * as utilModule from '../node/core-modules/util';
import * as streamModule from '../node/core-modules/stream';
import * as cryptoModule from '../node/core-modules/crypto';
import {
  nodeSetTimeout,
  nodeClearTimeout,
  nodeSetInterval,
  nodeClearInterval,
  nodeSetImmediate,
  nodeClearImmediate,
  timers as timersModule,
} from '../node/globals/timers';

// Re-export path module
export const path = pathModule;

// Re-export Buffer
export { Buffer };

// Re-export EventEmitter
export { EventEmitter };

/**
 * FIX 3.5: Maximum buffer size to prevent memory leaks
 */
const MAX_BUFFER_SIZE = 10000;

/**
 * FIX 3.5: Maximum pending nextTick callbacks to prevent unbounded growth
 */
const MAX_NEXT_TICK_QUEUE = 1000;

/**
 * Create a process shim
 * FIX 3.5: Added buffer limits and nextTick queue management
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

  // FIX 3.5: Buffers with size limits to prevent memory leaks
  const stdoutBuffer: string[] = [];
  const stderrBuffer: string[] = [];

  // FIX 3.5: Track pending nextTick callbacks
  let pendingNextTicks = 0;

  return {
    env,

    cwd: () => currentCwd,

    chdir: (dir: string) => {
      // Normalize path
      const newPath = dir.startsWith('/') ? dir : pathModule.join(currentCwd, dir);
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

    /**
     * FIX 3.5: Improved nextTick with queue limits and error handling
     */
    nextTick: (callback: () => void, ...args: unknown[]) => {
      // Prevent unbounded queue growth
      if (pendingNextTicks >= MAX_NEXT_TICK_QUEUE) {
        console.warn(`[process.nextTick] Queue limit reached (${MAX_NEXT_TICK_QUEUE}), callback dropped`);
        return;
      }

      pendingNextTicks++;

      queueMicrotask(() => {
        pendingNextTicks--;
        try {
          if (args.length > 0) {
            (callback as (...args: unknown[]) => void)(...args);
          } else {
            callback();
          }
        } catch (error) {
          // Log error but don't crash - match Node.js behavior
          console.error('[process.nextTick] Callback error:', error);
        }
      });
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
        // FIX 3.5: Limit buffer size to prevent memory leaks
        if (stdoutBuffer.length >= MAX_BUFFER_SIZE) {
          // Remove oldest entries (keep last 80%)
          stdoutBuffer.splice(0, Math.floor(MAX_BUFFER_SIZE * 0.2));
        }
        stdoutBuffer.push(data);
        options.onStdout?.(data);
        return true;
      },
      isTTY: false,
    },

    stderr: {
      write: (data: string) => {
        // FIX 3.5: Limit buffer size to prevent memory leaks
        if (stderrBuffer.length >= MAX_BUFFER_SIZE) {
          // Remove oldest entries (keep last 80%)
          stderrBuffer.splice(0, Math.floor(MAX_BUFFER_SIZE * 0.2));
        }
        stderrBuffer.push(data);
        options.onStderr?.(data);
        return true;
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
        const consoleMethod = (globalThis.console as unknown as Record<string, (...args: unknown[]) => void>)[level];
        if (consoleMethod) {
          consoleMethod('[QuickJS]', ...args);
        }
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
 * Crypto module - use our Node runtime implementation
 */
export const crypto = cryptoModule;

/**
 * setTimeout/setInterval/clearTimeout/clearInterval
 * Use our Node runtime implementation
 */
export const timers = {
  setTimeout: nodeSetTimeout,
  setInterval: nodeSetInterval,
  clearTimeout: nodeClearTimeout,
  clearInterval: nodeClearInterval,
  setImmediate: nodeSetImmediate,
  clearImmediate: nodeClearImmediate,
  promises: timersModule.promises,
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
 * util module - use our Node runtime implementation
 */
export const util = utilModule;

/**
 * stream module - use our Node runtime implementation
 */
export const stream = streamModule;

/**
 * Module factory type
 */
export type ModuleFactory = (
  fs: VirtualFS,
  process: ProcessShim,
) => Record<string, unknown>;

/**
 * FIX 2.5: Create a lazy FS wrapper that throws explicit errors if fs is not initialized
 * This prevents silent failures when fs methods are called before initialization
 */
function createLazyFsWrapper(fs: VirtualFS | null | undefined): Record<string, unknown> {
  const assertFs = (method: string): VirtualFS => {
    if (!fs) {
      throw new Error(
        `FileSystem not initialized: Cannot call fs.${method}(). ` +
        `Ensure the virtual filesystem is properly initialized before using fs operations.`
      );
    }
    return fs;
  };

  // Create lazy wrappers for each method
  const createLazyMethod = <T extends keyof VirtualFS>(method: T) => {
    return (...args: unknown[]) => {
      const vfs = assertFs(method);
      const fn = vfs[method];
      if (typeof fn !== 'function') {
        throw new Error(`fs.${method} is not a function`);
      }
      return (fn as (...args: unknown[]) => unknown).apply(vfs, args);
    };
  };

  // Sync methods
  const readFileSync = createLazyMethod('readFileSync');
  const writeFileSync = createLazyMethod('writeFileSync');
  const existsSync = createLazyMethod('existsSync');
  const mkdirSync = createLazyMethod('mkdirSync');
  const readdirSync = createLazyMethod('readdirSync');
  const statSync = createLazyMethod('statSync');
  const unlinkSync = createLazyMethod('unlinkSync');
  const rmdirSync = createLazyMethod('rmdirSync');

  // Async methods (promises)
  const readFile = createLazyMethod('readFile');
  const writeFile = createLazyMethod('writeFile');
  const mkdir = createLazyMethod('mkdir');
  const rmdir = createLazyMethod('rmdir');
  const unlink = createLazyMethod('unlink');
  const readdir = createLazyMethod('readdir');
  const stat = createLazyMethod('stat');

  return {
    // Sync methods
    readFileSync,
    writeFileSync,
    existsSync,
    mkdirSync,
    readdirSync,
    statSync,
    unlinkSync,
    rmdirSync,
    // Async methods at top level (Node style)
    readFile,
    writeFile,
    mkdir,
    rmdir,
    unlink,
    readdir,
    stat,
    // Promises namespace
    promises: {
      readFile,
      writeFile,
      mkdir,
      rmdir,
      unlink,
      readdir,
      stat,
    },
  };
}

/**
 * Get all builtin modules
 * FIX 2.5: Uses lazy fs wrapper for explicit error messages
 */
export function getBuiltinModules(
  fs: VirtualFS,
  process: ProcessShim,
): Map<string, Record<string, unknown>> {
  const modules = new Map<string, Record<string, unknown>>();

  // Core modules from our Node runtime
  modules.set('path', pathModule);
  modules.set('buffer', { Buffer, default: { Buffer } });
  modules.set('events', { EventEmitter, default: EventEmitter });
  modules.set('util', utilModule);
  modules.set('os', os);
  modules.set('crypto', cryptoModule);
  modules.set('stream', streamModule);

  // FIX 2.5: FS module uses lazy wrapper for explicit error messages
  modules.set('fs', createLazyFsWrapper(fs));

  // Process module
  modules.set('process', process as unknown as Record<string, unknown>);

  // Timers
  modules.set('timers', timers);
  modules.set('timers/promises', timers.promises as unknown as Record<string, unknown>);

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
