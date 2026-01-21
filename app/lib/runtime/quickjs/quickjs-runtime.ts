/**
 * =============================================================================
 * BAVINI Runtime Engine - QuickJS Runtime
 * =============================================================================
 * Node.js-compatible JavaScript runtime based on QuickJS compiled to WASM.
 * Provides sandboxed execution with virtual filesystem and Node.js APIs.
 * =============================================================================
 */

import {
  getQuickJS,
  newQuickJSWASMModuleFromVariant,
  type QuickJSContext,
  type QuickJSRuntime as QJSRuntime,
  type QuickJSWASMModule,
  type QuickJSHandle,
} from 'quickjs-emscripten';
import type {
  RuntimeStatus,
  ExecutionResult,
  QuickJSRuntimeConfig,
  RuntimeCallbacks,
  ProcessShim,
} from './types';
import { UnifiedFSInstance, createUnifiedFS } from './unified-fs';
import {
  createProcessShim,
  createConsoleShim,
  getBuiltinModules,
  path,
  Buffer,
} from './node-polyfills';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('QuickJSRuntime');

/**
 * Default configuration
 */
const DEFAULT_CONFIG: Required<QuickJSRuntimeConfig> = {
  memoryLimitBytes: 128 * 1024 * 1024, // 128 MB
  maxStackSizeBytes: 1024 * 1024, // 1 MB
  interruptAfterMs: 30000, // 30 seconds
  moduleResolver: () => ({ found: false, path: '', isBuiltin: false }),
};

/**
 * QuickJS-based Node.js compatible runtime
 */
export class QuickJSNodeRuntime {
  private _config: Required<QuickJSRuntimeConfig>;
  private _callbacks: RuntimeCallbacks = {};
  private _status: RuntimeStatus = 'idle';
  private _quickjs: QuickJSWASMModule | null = null;
  private _runtime: QJSRuntime | null = null;
  private _context: QuickJSContext | null = null;
  private _fs: UnifiedFSInstance;
  private _process: ProcessShim;
  private _stdoutBuffer: string[] = [];
  private _stderrBuffer: string[] = [];
  private _initPromise: Promise<void> | null = null;
  private _executionStartTime: number | null = null;

  constructor(config: QuickJSRuntimeConfig = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._fs = createUnifiedFS();
    this._process = createProcessShim(this._fs, {
      onStdout: (data) => {
        this._stdoutBuffer.push(data);
        this._callbacks.onStdout?.(data);
      },
      onStderr: (data) => {
        this._stderrBuffer.push(data);
        this._callbacks.onStderr?.(data);
      },
      onExit: (code) => {
        logger.info(`Process exited with code ${code}`);
      },
    });

    logger.info('QuickJSNodeRuntime created');
  }

  /**
   * Get current status
   */
  get status(): RuntimeStatus {
    return this._status;
  }

  /**
   * Get the virtual filesystem
   */
  get fs(): UnifiedFSInstance {
    return this._fs;
  }

  /**
   * Get the process shim
   */
  get process(): ProcessShim {
    return this._process;
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: RuntimeCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  /**
   * Initialize the runtime
   */
  async init(): Promise<void> {
    // Prevent multiple initializations
    if (this._initPromise) {
      return this._initPromise;
    }

    if (this._status === 'ready') {
      return;
    }

    this._initPromise = this._doInit();
    return this._initPromise;
  }

  private async _doInit(): Promise<void> {
    this._setStatus('initializing');
    const startTime = performance.now();

    try {
      logger.info('Initializing QuickJS WASM module...');

      // Load QuickJS
      this._quickjs = await getQuickJS();

      // Create runtime with memory limits
      this._runtime = this._quickjs.newRuntime();
      this._runtime.setMemoryLimit(this._config.memoryLimitBytes);
      this._runtime.setMaxStackSize(this._config.maxStackSizeBytes);

      // Set up interrupt handler for timeout enforcement
      this._runtime.setInterruptHandler(() => {
        // Return true to interrupt execution, false to continue
        if (this._executionStartTime === null) {
          return false; // No execution in progress
        }

        const elapsed = Date.now() - this._executionStartTime;

        if (elapsed > this._config.interruptAfterMs) {
          logger.warn(`Execution timeout: ${elapsed}ms > ${this._config.interruptAfterMs}ms limit`);
          return true; // Interrupt execution
        }

        return false; // Continue execution
      });

      // Create context
      this._context = this._runtime.newContext();

      // Inject globals
      this._injectGlobals();

      const loadTime = (performance.now() - startTime).toFixed(0);
      logger.info(`QuickJS initialized in ${loadTime}ms`);

      this._setStatus('ready');
    } catch (error) {
      logger.error('Failed to initialize QuickJS:', error);
      this._setStatus('error');
      throw error;
    }
  }

  /**
   * Inject global variables and functions into the context
   */
  private _injectGlobals(): void {
    if (!this._context) return;

    const ctx = this._context;

    // Console
    const consoleObj = ctx.newObject();
    const consoleShim = createConsoleShim((level, ...args) => {
      const message = args.map((a) => (typeof a === 'string' ? a : JSON.stringify(a))).join(' ');
      if (level === 'error' || level === 'warn') {
        this._stderrBuffer.push(message + '\n');
        this._callbacks.onStderr?.(message + '\n');
      } else {
        this._stdoutBuffer.push(message + '\n');
        this._callbacks.onStdout?.(message + '\n');
      }
    });

    // Add console methods
    for (const method of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      const fn = ctx.newFunction(method, (...args) => {
        const jsArgs = args.map((arg) => ctx.dump(arg));
        (consoleShim[method] as (...args: unknown[]) => void)(...jsArgs);
      });
      ctx.setProp(consoleObj, method, fn);
      fn.dispose();
    }
    ctx.setProp(ctx.global, 'console', consoleObj);
    consoleObj.dispose();

    // setTimeout
    const setTimeoutFn = ctx.newFunction('setTimeout', (callbackHandle, delayHandle) => {
      const delay = ctx.getNumber(delayHandle);
      const callbackCopy = callbackHandle.dup();

      setTimeout(() => {
        if (this._context) {
          try {
            this._context.callFunction(callbackCopy, this._context.undefined);
          } catch (e) {
            logger.error('setTimeout callback error:', e);
          } finally {
            callbackCopy.dispose();
          }
        }
      }, delay);

      return ctx.newNumber(0); // Return timer ID (simplified)
    });
    ctx.setProp(ctx.global, 'setTimeout', setTimeoutFn);
    setTimeoutFn.dispose();

    // Global object reference
    ctx.setProp(ctx.global, 'global', ctx.global);
    ctx.setProp(ctx.global, 'globalThis', ctx.global);

    // Buffer (basic implementation)
    const bufferObj = ctx.newObject();
    const bufferFrom = ctx.newFunction('from', (dataHandle) => {
      const data = ctx.dump(dataHandle);
      // Return a simple representation
      return ctx.newString(`[Buffer: ${JSON.stringify(data)}]`);
    });
    ctx.setProp(bufferObj, 'from', bufferFrom);
    bufferFrom.dispose();
    ctx.setProp(ctx.global, 'Buffer', bufferObj);
    bufferObj.dispose();

    // __dirname and __filename (default values)
    ctx.setProp(ctx.global, '__dirname', ctx.newString('/'));
    ctx.setProp(ctx.global, '__filename', ctx.newString('/script.js'));

    // process object
    const processObj = ctx.newObject();
    ctx.setProp(processObj, 'platform', ctx.newString('browser'));
    ctx.setProp(processObj, 'arch', ctx.newString('wasm32'));
    ctx.setProp(processObj, 'version', ctx.newString('v20.0.0'));

    const envObj = ctx.newObject();
    ctx.setProp(envObj, 'NODE_ENV', ctx.newString('development'));
    ctx.setProp(processObj, 'env', envObj);
    envObj.dispose();

    const cwdFn = ctx.newFunction('cwd', () => {
      return ctx.newString(this._process.cwd());
    });
    ctx.setProp(processObj, 'cwd', cwdFn);
    cwdFn.dispose();

    ctx.setProp(ctx.global, 'process', processObj);
    processObj.dispose();

    logger.debug('Globals injected into QuickJS context');
  }

  /**
   * Execute JavaScript code
   */
  async eval(code: string, filename = 'script.js'): Promise<ExecutionResult> {
    await this.init();

    if (!this._context) {
      return {
        success: false,
        error: 'Runtime not initialized',
        stdout: '',
        stderr: '',
        executionTime: 0,
      };
    }

    this._setStatus('executing');
    this._stdoutBuffer = [];
    this._stderrBuffer = [];
    this._executionStartTime = Date.now(); // Start timeout tracking

    const startTime = performance.now();

    try {
      // Update __filename and __dirname
      const dirname = path.dirname(filename);
      this._context.setProp(this._context.global, '__filename', this._context.newString(filename));
      this._context.setProp(this._context.global, '__dirname', this._context.newString(dirname));

      // Execute code
      const result = this._context.evalCode(code, filename);

      if (result.error) {
        const errorValue = this._context.dump(result.error);
        result.error.dispose();

        this._executionStartTime = null; // Reset timeout tracking
        this._setStatus('ready');
        return {
          success: false,
          error: String(errorValue),
          stdout: this._stdoutBuffer.join(''),
          stderr: this._stderrBuffer.join(''),
          executionTime: performance.now() - startTime,
        };
      }

      const value = this._context.dump(result.value);
      result.value.dispose();

      this._executionStartTime = null; // Reset timeout tracking
      this._setStatus('ready');
      return {
        success: true,
        value,
        stdout: this._stdoutBuffer.join(''),
        stderr: this._stderrBuffer.join(''),
        executionTime: performance.now() - startTime,
      };
    } catch (error) {
      this._executionStartTime = null; // Reset timeout tracking
      this._setStatus('error');
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
        stdout: this._stdoutBuffer.join(''),
        stderr: this._stderrBuffer.join(''),
        executionTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Execute a module (with require/import support)
   */
  async evalModule(code: string, filename = 'module.js'): Promise<ExecutionResult> {
    // Wrap code with module system emulation
    const wrappedCode = this._wrapAsModule(code, filename);
    return this.eval(wrappedCode, filename);
  }

  /**
   * Wrap code as a CommonJS-style module
   */
  private _wrapAsModule(code: string, filename: string): string {
    const dirname = path.dirname(filename);

    return `
(function(exports, require, module, __filename, __dirname) {
  ${code}
}).call(
  {},
  {},
  function require(id) {
    throw new Error('require() not implemented: ' + id);
  },
  { exports: {} },
  "${filename}",
  "${dirname}"
);
`;
  }

  /**
   * Write a file to the virtual filesystem and make it available
   */
  writeFile(filePath: string, content: string): void {
    this._fs.writeFileSync(filePath, content);
  }

  /**
   * Write multiple files
   */
  writeFiles(files: Map<string, string> | Record<string, string>): void {
    const entries = files instanceof Map ? files.entries() : Object.entries(files);
    for (const [filePath, content] of entries) {
      this._fs.writeFileSync(filePath, content);
    }
  }

  /**
   * Read a file from the virtual filesystem
   */
  readFile(filePath: string): string | null {
    try {
      return this._fs.readFileSync(filePath, 'utf-8') as string;
    } catch {
      return null;
    }
  }

  /**
   * Execute pending jobs (for async operations)
   */
  executePendingJobs(): number {
    if (!this._runtime) return 0;

    let jobsExecuted = 0;
    while (true) {
      const result = this._runtime.executePendingJobs();
      if (result.error) {
        const error = this._context?.dump(result.error);
        result.error.dispose();
        logger.error('Error in pending job:', error);
        break;
      }
      if (result.value === 0) break;
      jobsExecuted += result.value;
    }
    return jobsExecuted;
  }

  /**
   * Destroy the runtime
   */
  destroy(): void {
    if (this._context) {
      this._context.dispose();
      this._context = null;
    }
    if (this._runtime) {
      this._runtime.dispose();
      this._runtime = null;
    }
    this._quickjs = null;
    this._initPromise = null;
    this._setStatus('idle');
    logger.info('QuickJSNodeRuntime destroyed');
  }

  /**
   * Set status and notify
   */
  private _setStatus(status: RuntimeStatus): void {
    this._status = status;
    this._callbacks.onStatusChange?.(status);
  }
}

/**
 * Factory function
 */
export function createQuickJSRuntime(config?: QuickJSRuntimeConfig): QuickJSNodeRuntime {
  return new QuickJSNodeRuntime(config);
}

/**
 * Singleton instance
 */
let _sharedRuntime: QuickJSNodeRuntime | null = null;

export function getSharedQuickJSRuntime(): QuickJSNodeRuntime {
  if (!_sharedRuntime) {
    _sharedRuntime = createQuickJSRuntime();
  }
  return _sharedRuntime;
}

export function resetSharedQuickJSRuntime(): void {
  if (_sharedRuntime) {
    _sharedRuntime.destroy();
    _sharedRuntime = null;
  }
}
