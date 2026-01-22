/**
 * =============================================================================
 * BAVINI Container - Process Object
 * =============================================================================
 * Node.js process global implementation.
 * =============================================================================
 */

import type { ProcessObject, ProcessEnv, MemoryUsage, WritableStreamLike, ReadableStreamLike } from '../types';
import { EventEmitter } from '../core-modules/events';

/**
 * Process configuration
 */
export interface ProcessConfig {
  cwd?: string;
  env?: ProcessEnv;
  argv?: string[];
  stdout?: (data: string) => void;
  stderr?: (data: string) => void;
}

/**
 * Create a Node.js process object
 */
export function createProcess(config: ProcessConfig = {}): ProcessObject {
  let currentCwd = config.cwd ?? '/home/project';
  const startTime = Date.now();
  const emitter = new EventEmitter();

  // Standard output stream
  const stdout: WritableStreamLike = {
    write(chunk: string | Uint8Array, _encoding?: string, callback?: () => void): boolean {
      const data = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      config.stdout?.(data);
      callback?.();
      return true;
    },
    end(callback?: () => void): void {
      callback?.();
    },
    isTTY: true,
  };

  // Standard error stream
  const stderr: WritableStreamLike = {
    write(chunk: string | Uint8Array, _encoding?: string, callback?: () => void): boolean {
      const data = typeof chunk === 'string' ? chunk : new TextDecoder().decode(chunk);
      config.stderr?.(data);
      callback?.();
      return true;
    },
    end(callback?: () => void): void {
      callback?.();
    },
    isTTY: true,
  };

  // Standard input stream (minimal)
  const stdin: ReadableStreamLike = {
    read(): string | null {
      return null;
    },
    on(event: string, listener: (...args: unknown[]) => void): void {
      emitter.on(`stdin:${event}`, listener);
    },
    isTTY: true,
  };

  // Next tick queue
  const nextTickQueue: Array<{ callback: () => void; args: unknown[] }> = [];
  let nextTickScheduled = false;

  function processNextTick(): void {
    nextTickScheduled = false;

    while (nextTickQueue.length > 0) {
      const item = nextTickQueue.shift()!;

      try {
        item.callback.apply(null, item.args as []);
      } catch (error) {
        emitter.emit('uncaughtException', error);
      }
    }
  }

  const process: ProcessObject = {
    // Environment
    env: {
      NODE_ENV: 'development',
      PATH: '/usr/local/bin:/usr/bin:/bin',
      HOME: '/home',
      PWD: currentCwd,
      USER: 'user',
      ...config.env,
    },

    // Arguments
    argv: config.argv ?? ['node', 'script.js'],

    // Version info
    version: 'v20.0.0',
    versions: {
      node: '20.0.0',
      v8: '11.3.244.8',
      uv: '1.44.2',
      zlib: '1.2.13',
      brotli: '1.0.9',
      ares: '1.19.0',
      modules: '115',
      nghttp2: '1.52.0',
      napi: '9',
      llhttp: '8.1.0',
      uvwasi: '0.0.16',
      openssl: '3.0.8',
      cldr: '42.0',
      icu: '72.1',
      tz: '2022g',
      unicode: '15.0',
    },

    // Platform info
    platform: 'linux',
    arch: 'x64',
    pid: 1,
    ppid: 0,

    // Working directory
    cwd(): string {
      return currentCwd;
    },

    chdir(directory: string): void {
      currentCwd = directory;
      process.env.PWD = directory;
    },

    // Exit
    exit(code = 0): never {
      emitter.emit('exit', code);
      throw new ExitError(code);
    },

    // Next tick
    nextTick(callback: () => void, ...args: unknown[]): void {
      nextTickQueue.push({ callback, args });

      if (!nextTickScheduled) {
        nextTickScheduled = true;
        queueMicrotask(processNextTick);
      }
    },

    // High-resolution time
    hrtime: Object.assign(
      function hrtime(time?: [number, number]): [number, number] {
        const now = performance.now();
        const seconds = Math.floor(now / 1000);
        const nanoseconds = Math.floor((now % 1000) * 1e6);

        if (time) {
          let diffSeconds = seconds - time[0];
          let diffNanos = nanoseconds - time[1];

          if (diffNanos < 0) {
            diffSeconds -= 1;
            diffNanos += 1e9;
          }

          return [diffSeconds, diffNanos];
        }

        return [seconds, nanoseconds];
      },
      {
        bigint(): bigint {
          return BigInt(Math.floor(performance.now() * 1e6));
        },
      },
    ),

    // Memory usage
    memoryUsage(): MemoryUsage {
      // Estimate based on performance.memory if available
      const memory = (performance as unknown as { memory?: { usedJSHeapSize: number; totalJSHeapSize: number } })
        .memory;

      if (memory) {
        return {
          rss: memory.totalJSHeapSize,
          heapTotal: memory.totalJSHeapSize,
          heapUsed: memory.usedJSHeapSize,
          external: 0,
          arrayBuffers: 0,
        };
      }

      // Fallback estimates
      return {
        rss: 50 * 1024 * 1024,
        heapTotal: 30 * 1024 * 1024,
        heapUsed: 20 * 1024 * 1024,
        external: 0,
        arrayBuffers: 0,
      };
    },

    // Uptime
    uptime(): number {
      return (Date.now() - startTime) / 1000;
    },

    // Standard streams
    stdout,
    stderr,
    stdin,

    // Event emitter methods
    on(event: string, listener: (...args: unknown[]) => void): ProcessObject {
      emitter.on(event, listener);
      return process;
    },

    once(event: string, listener: (...args: unknown[]) => void): ProcessObject {
      emitter.once(event, listener);
      return process;
    },

    off(event: string, listener: (...args: unknown[]) => void): ProcessObject {
      emitter.off(event, listener);
      return process;
    },

    emit(event: string, ...args: unknown[]): boolean {
      return emitter.emit(event, ...args);
    },

    // Title
    title: 'bavini-node',

    // Release info
    release: {
      name: 'node',
      sourceUrl: 'https://nodejs.org/download/release/v20.0.0/node-v20.0.0.tar.gz',
      headersUrl: 'https://nodejs.org/download/release/v20.0.0/node-v20.0.0-headers.tar.gz',
    },
  };

  return process;
}

/**
 * Exit error (thrown by process.exit)
 */
export class ExitError extends Error {
  code: number;

  constructor(code: number) {
    super(`Process exited with code ${code}`);
    this.name = 'ExitError';
    this.code = code;
  }
}
