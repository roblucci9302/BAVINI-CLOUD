/**
 * =============================================================================
 * BAVINI Container - Child Process Module
 * =============================================================================
 * Node.js child_process module implementation for browser environment.
 * Provides mock/simulated process spawning using Web Workers.
 * =============================================================================
 */

import { EventEmitter } from './events';
import { Readable, Writable } from './stream';
import { Buffer } from '../globals/buffer';
import type { BufferEncoding } from '../types';

/**
 * Spawn options
 */
export interface SpawnOptions {
  cwd?: string;
  env?: Record<string, string>;
  argv0?: string;
  stdio?: StdioOption | StdioOptions;
  detached?: boolean;
  uid?: number;
  gid?: number;
  shell?: boolean | string;
  windowsVerbatimArguments?: boolean;
  windowsHide?: boolean;
  signal?: AbortSignal;
  timeout?: number;
  killSignal?: NodeJS.Signals | number;
}

export interface SpawnSyncOptions extends SpawnOptions {
  input?: string | Buffer;
  maxBuffer?: number;
  encoding?: BufferEncoding | 'buffer';
}

export interface ExecOptions extends SpawnOptions {
  maxBuffer?: number;
  encoding?: BufferEncoding | 'buffer';
}

export interface ExecFileOptions extends ExecOptions {
  shell?: boolean | string;
}

export interface ForkOptions extends SpawnOptions {
  execPath?: string;
  execArgv?: string[];
  silent?: boolean;
  serialization?: 'json' | 'advanced';
}

export type StdioOption = 'pipe' | 'ignore' | 'inherit' | 'ipc' | number | null | undefined;
export type StdioOptions = [StdioOption, StdioOption, StdioOption] | [StdioOption, StdioOption, StdioOption, StdioOption] | StdioOption;

/**
 * Spawn result
 */
export interface SpawnSyncResult {
  pid: number;
  output: (Buffer | string | null)[];
  stdout: Buffer | string;
  stderr: Buffer | string;
  status: number | null;
  signal: NodeJS.Signals | null;
  error?: Error;
}

export interface ExecResult {
  stdout: string | Buffer;
  stderr: string | Buffer;
}

/**
 * Process stream wrapper
 */
class ProcessStream extends Writable {
  private _data: Buffer[] = [];

  _write(chunk: unknown, _encoding: BufferEncoding, callback: (error?: Error | null) => void): void {
    const buf = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    this._data.push(buf);
    callback();
  }

  getData(): Buffer {
    return Buffer.concat(this._data);
  }
}

/**
 * ChildProcess class - represents a spawned process
 */
export class ChildProcess extends EventEmitter {
  pid: number;
  connected: boolean = true;
  signalCode: NodeJS.Signals | null = null;
  exitCode: number | null = null;
  killed: boolean = false;
  spawnfile: string;
  spawnargs: string[];

  stdin: Writable | null = null;
  stdout: Readable | null = null;
  stderr: Readable | null = null;
  stdio: [Writable | null, Readable | null, Readable | null, ...Array<Readable | Writable | null>];

  private _command: string;
  private _args: string[];
  private _options: SpawnOptions;
  private _abortController: AbortController;

  constructor(command: string, args: string[] = [], options: SpawnOptions = {}) {
    super();

    this._command = command;
    this._args = args;
    this._options = options;
    this._abortController = new AbortController();

    // Generate fake PID
    this.pid = Math.floor(Math.random() * 32768) + 1000;
    this.spawnfile = command;
    this.spawnargs = [command, ...args];

    // Setup stdio
    this._setupStdio();

    this.stdio = [this.stdin, this.stdout, this.stderr];

    // Handle abort signal
    if (options.signal) {
      options.signal.addEventListener('abort', () => this.kill());
    }

    // Start execution
    this._execute();
  }

  private _setupStdio(): void {
    const stdio = this._options.stdio ?? 'pipe';
    const stdioArr: StdioOptions = Array.isArray(stdio) ? stdio : [stdio, stdio, stdio];

    // stdin
    if (stdioArr[0] === 'pipe') {
      this.stdin = new ProcessStream();
    }

    // stdout
    if (stdioArr[1] === 'pipe') {
      this.stdout = new Readable();
    }

    // stderr
    if (stdioArr[2] === 'pipe') {
      this.stderr = new Readable();
    }
  }

  private async _execute(): Promise<void> {
    // Simulate async startup
    await new Promise((resolve) => setTimeout(resolve, 0));

    // Emit spawn event
    this.emit('spawn');

    try {
      // Execute based on command
      const result = await this._runCommand();

      // Emit output
      if (this.stdout && result.stdout) {
        (this.stdout as Readable).push(result.stdout);
        (this.stdout as Readable).push(null);
      }

      if (this.stderr && result.stderr) {
        (this.stderr as Readable).push(result.stderr);
        (this.stderr as Readable).push(null);
      }

      // Emit close
      this.exitCode = result.exitCode;
      this.emit('close', result.exitCode, null);
      this.emit('exit', result.exitCode, null);
    } catch (err) {
      this.emit('error', err);
      this.exitCode = 1;
      this.emit('close', 1, null);
      this.emit('exit', 1, null);
    }
  }

  private async _runCommand(): Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number }> {
    // Get command handlers
    const handler = commandHandlers[this._command];

    if (handler) {
      return handler(this._args, this._options);
    }

    // Unknown command
    return {
      stdout: Buffer.alloc(0),
      stderr: Buffer.from(`bash: ${this._command}: command not found\n`),
      exitCode: 127,
    };
  }

  /**
   * Kill the process
   */
  kill(signal?: NodeJS.Signals | number): boolean {
    if (this.killed) return false;

    this.killed = true;
    this._abortController.abort();

    const sig = typeof signal === 'number' ? signal : signal || 'SIGTERM';
    this.signalCode = typeof sig === 'string' ? sig : null;

    this.emit('close', null, this.signalCode);
    this.emit('exit', null, this.signalCode);

    return true;
  }

  /**
   * Send a message (for IPC)
   */
  send(message: unknown, callback?: (error: Error | null) => void): boolean {
    if (!this.connected) {
      const error = new Error('Channel closed');

      if (callback) callback(error);

      return false;
    }

    // Emit message to self for simulation
    queueMicrotask(() => {
      this.emit('message', message);

      if (callback) callback(null);
    });

    return true;
  }

  /**
   * Disconnect IPC channel
   */
  disconnect(): void {
    if (!this.connected) return;

    this.connected = false;
    this.emit('disconnect');
  }

  /**
   * Unref the process
   */
  unref(): void {
    // No-op in browser
  }

  /**
   * Ref the process
   */
  ref(): void {
    // No-op in browser
  }
}

/**
 * Command handlers for built-in commands
 */
type CommandHandler = (args: string[], options: SpawnOptions) => Promise<{ stdout: Buffer; stderr: Buffer; exitCode: number }>;

const commandHandlers: Record<string, CommandHandler> = {
  echo: async (args) => ({
    stdout: Buffer.from(args.join(' ') + '\n'),
    stderr: Buffer.alloc(0),
    exitCode: 0,
  }),

  pwd: async (_args, options) => ({
    stdout: Buffer.from((options.cwd || '/') + '\n'),
    stderr: Buffer.alloc(0),
    exitCode: 0,
  }),

  env: async (_args, options) => {
    const env = options.env || {};
    const output = Object.entries(env)
      .map(([k, v]) => `${k}=${v}`)
      .join('\n');
    return {
      stdout: Buffer.from(output + '\n'),
      stderr: Buffer.alloc(0),
      exitCode: 0,
    };
  },

  true: async () => ({
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    exitCode: 0,
  }),

  false: async () => ({
    stdout: Buffer.alloc(0),
    stderr: Buffer.alloc(0),
    exitCode: 1,
  }),

  sleep: async (args) => {
    const seconds = parseFloat(args[0]) || 0;
    await new Promise((resolve) => setTimeout(resolve, seconds * 1000));
    return {
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      exitCode: 0,
    };
  },

  printf: async (args) => {
    const format = args[0] || '';
    const values = args.slice(1);
    let output = format;
    let i = 0;
    output = output.replace(/%[sd]/g, () => values[i++] || '');
    output = output.replace(/\\n/g, '\n');
    return {
      stdout: Buffer.from(output),
      stderr: Buffer.alloc(0),
      exitCode: 0,
    };
  },

  cat: async (args, options) => {
    // Would need filesystem access
    return {
      stdout: Buffer.alloc(0),
      stderr: Buffer.from(`cat: ${args[0]}: No such file or directory\n`),
      exitCode: 1,
    };
  },

  node: async (args) => {
    // Simulate node execution
    return {
      stdout: Buffer.from(`Node.js simulation: ${args.join(' ')}\n`),
      stderr: Buffer.alloc(0),
      exitCode: 0,
    };
  },

  npm: async (args) => {
    const subcommand = args[0];
    return {
      stdout: Buffer.from(`npm ${subcommand}: simulated\n`),
      stderr: Buffer.alloc(0),
      exitCode: 0,
    };
  },

  npx: async (args) => {
    return {
      stdout: Buffer.from(`npx ${args.join(' ')}: simulated\n`),
      stderr: Buffer.alloc(0),
      exitCode: 0,
    };
  },
};

/**
 * Register a custom command handler
 */
export function registerCommandHandler(command: string, handler: CommandHandler): void {
  commandHandlers[command] = handler;
}

/**
 * Spawn a child process
 */
export function spawn(command: string, args?: string[] | SpawnOptions, options?: SpawnOptions): ChildProcess {
  if (!Array.isArray(args)) {
    options = args;
    args = [];
  }

  return new ChildProcess(command, args, options);
}

/**
 * Spawn a child process synchronously
 */
export function spawnSync(command: string, args?: string[] | SpawnSyncOptions, options?: SpawnSyncOptions): SpawnSyncResult {
  if (!Array.isArray(args)) {
    options = args;
    args = [];
  }

  // Simulate synchronous execution
  const handler = commandHandlers[command] as CommandHandler | undefined;

  if (handler !== undefined) {
    // We can't actually run this synchronously, so return a mock result
    return {
      pid: Math.floor(Math.random() * 32768) + 1000,
      output: [null, Buffer.alloc(0), Buffer.alloc(0)],
      stdout: Buffer.alloc(0),
      stderr: Buffer.alloc(0),
      status: 0,
      signal: null,
    };
  }

  return {
    pid: 0,
    output: [null, null, Buffer.from(`bash: ${command}: command not found\n`)],
    stdout: Buffer.alloc(0),
    stderr: Buffer.from(`bash: ${command}: command not found\n`),
    status: 127,
    signal: null,
  };
}

/**
 * Execute a command in a shell
 */
export function exec(
  command: string,
  options?: ExecOptions | ((error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void),
  callback?: (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void,
): ChildProcess {
  if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const opts = options || {};

  // Parse command for shell execution
  const parts = command.split(/\s+/);
  const cmd = parts[0];
  const args = parts.slice(1);

  const child = spawn(cmd, args, { ...opts, shell: true });

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  if (child.stdout) {
    child.stdout.on('data', (...args: unknown[]) => {
      const chunk = args[0] as Buffer;
      stdoutChunks.push(chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (...args: unknown[]) => {
      const chunk = args[0] as Buffer;
      stderrChunks.push(chunk);
    });
  }

  child.on('close', (...args: unknown[]) => {
    const code = args[0] as number | null;
    const stdout = Buffer.concat(stdoutChunks);
    const stderr = Buffer.concat(stderrChunks);
    const encoding = opts.encoding !== 'buffer' ? (opts.encoding || 'utf8') as BufferEncoding : null;

    if (callback) {
      const error = code !== 0 ? new Error(`Command failed: ${command}`) : null;

      callback(
        error,
        encoding ? stdout.toString(encoding) : stdout,
        encoding ? stderr.toString(encoding) : stderr,
      );
    }
  });

  child.on('error', (...args: unknown[]) => {
    const err = args[0] as Error;
    if (callback) {
      callback(err, '', '');
    }
  });

  return child;
}

/**
 * Execute a command synchronously in a shell
 */
export function execSync(command: string, options?: SpawnSyncOptions): Buffer | string {
  const parts = command.split(/\s+/);
  const result = spawnSync(parts[0], parts.slice(1), { ...options, shell: true });

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const error = new Error(`Command failed: ${command}`) as Error & { status: number; stderr: Buffer };
    error.status = result.status ?? 1;
    error.stderr = result.stderr as Buffer;
    throw error;
  }

  const encoding = options?.encoding;

  if (encoding === 'buffer' || !encoding) {
    return result.stdout;
  }

  return (result.stdout as Buffer).toString(encoding as BufferEncoding);
}

/**
 * Execute a file
 */
export function execFile(
  file: string,
  args?: string[] | ExecFileOptions | ((error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void),
  options?: ExecFileOptions | ((error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void),
  callback?: (error: Error | null, stdout: string | Buffer, stderr: string | Buffer) => void,
): ChildProcess {
  if (typeof args === 'function') {
    callback = args;
    args = [];
    options = {};
  } else if (typeof options === 'function') {
    callback = options;
    options = {};
  }

  const argsArr = Array.isArray(args) ? args : [];
  const opts = (typeof args === 'object' && !Array.isArray(args) ? args : options || {}) as ExecFileOptions;

  const child = spawn(file, argsArr, opts);

  const stdoutChunks: Buffer[] = [];
  const stderrChunks: Buffer[] = [];

  if (child.stdout) {
    child.stdout.on('data', (...eventArgs: unknown[]) => {
      const chunk = eventArgs[0] as Buffer;
      stdoutChunks.push(chunk);
    });
  }

  if (child.stderr) {
    child.stderr.on('data', (...eventArgs: unknown[]) => {
      const chunk = eventArgs[0] as Buffer;
      stderrChunks.push(chunk);
    });
  }

  child.on('close', (...eventArgs: unknown[]) => {
    const code = eventArgs[0] as number | null;
    const stdout = Buffer.concat(stdoutChunks);
    const stderr = Buffer.concat(stderrChunks);
    const encoding = opts.encoding !== 'buffer' ? (opts.encoding || 'utf8') as BufferEncoding : null;

    if (callback) {
      const error = code !== 0 ? new Error(`Command failed: ${file}`) : null;

      callback(
        error,
        encoding ? stdout.toString(encoding) : stdout,
        encoding ? stderr.toString(encoding) : stderr,
      );
    }
  });

  return child;
}

/**
 * Execute a file synchronously
 */
export function execFileSync(file: string, args?: string[] | SpawnSyncOptions, options?: SpawnSyncOptions): Buffer | string {
  if (!Array.isArray(args)) {
    options = args;
    args = [];
  }

  const result = spawnSync(file, args, options);

  if (result.error) {
    throw result.error;
  }

  if (result.status !== 0) {
    const error = new Error(`Command failed: ${file}`) as Error & { status: number; stderr: Buffer };
    error.status = result.status ?? 1;
    error.stderr = result.stderr as Buffer;
    throw error;
  }

  const encoding = options?.encoding;

  if (encoding === 'buffer' || !encoding) {
    return result.stdout;
  }

  return (result.stdout as Buffer).toString(encoding as BufferEncoding);
}

/**
 * Fork a Node.js process (simulated)
 */
export function fork(modulePath: string, args?: string[] | ForkOptions, options?: ForkOptions): ChildProcess {
  if (!Array.isArray(args)) {
    options = args;
    args = [];
  }

  const opts: ForkOptions = {
    ...options,
    stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
  };

  // In browser, we simulate fork with a special spawn
  return spawn('node', [modulePath, ...(args || [])], opts);
}

/**
 * Default export
 */
export default {
  ChildProcess,
  spawn,
  spawnSync,
  exec,
  execSync,
  execFile,
  execFileSync,
  fork,
  registerCommandHandler,
};
