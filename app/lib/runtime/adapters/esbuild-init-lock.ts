/**
 * =============================================================================
 * BAVINI CLOUD - esbuild Initialization Lock
 * =============================================================================
 * Singleton class for thread-safe esbuild-wasm initialization.
 * Prevents race conditions when multiple adapters call init() concurrently.
 *
 * FIX: Issue 1.1 - Race condition in global esbuild state
 * =============================================================================
 */

import * as esbuild from 'esbuild-wasm';
import { createScopedLogger } from '~/utils/logger';
import { withTimeout, TIMEOUTS } from '../utils/timeout';

const logger = createScopedLogger('EsbuildInitLock');

/**
 * URL du WASM esbuild
 */
const ESBUILD_WASM_URL = 'https://unpkg.com/esbuild-wasm@0.27.2/esbuild.wasm';

/**
 * Initialization states
 */
type InitState = 'idle' | 'initializing' | 'ready' | 'error';

/**
 * Singleton class for thread-safe esbuild initialization.
 *
 * Uses a state machine pattern to guarantee atomicity:
 * - idle: Not initialized, can start
 * - initializing: Init in progress, new callers wait for same Promise
 * - ready: Successfully initialized
 * - error: Failed, stores error for rethrow
 *
 * @example
 * ```typescript
 * const lock = EsbuildInitLock.getInstance();
 * await lock.initialize(); // Thread-safe, concurrent calls share same Promise
 * ```
 */
export class EsbuildInitLock {
  private static _instance: EsbuildInitLock | null = null;

  private _state: InitState = 'idle';
  private _promise: Promise<void> | null = null;
  private _error: Error | null = null;
  private _initCount = 0;

  private constructor() {
    // Check if esbuild was already initialized (HMR recovery)
    if ((globalThis as any).__esbuildInitialized === true) {
      this._state = 'ready';
      logger.debug('Recovered esbuild initialized state from globalThis');
    }
  }

  /**
   * Get singleton instance
   */
  static getInstance(): EsbuildInitLock {
    if (!EsbuildInitLock._instance) {
      EsbuildInitLock._instance = new EsbuildInitLock();
    }
    return EsbuildInitLock._instance;
  }

  /**
   * Current initialization state
   */
  get state(): InitState {
    return this._state;
  }

  /**
   * Check if esbuild is ready to use
   */
  get isReady(): boolean {
    return this._state === 'ready';
  }

  /**
   * Number of times init has been called
   */
  get initCount(): number {
    return this._initCount;
  }

  /**
   * Initialize esbuild-wasm in a thread-safe manner.
   *
   * State machine transitions:
   * - idle -> initializing -> ready/error
   * - initializing: Wait for existing Promise
   * - ready: Return immediately
   * - error: Throw stored error
   *
   * @param wasmUrl - Optional custom WASM URL
   * @throws Error if initialization fails
   */
  async initialize(wasmUrl: string = ESBUILD_WASM_URL): Promise<void> {
    this._initCount++;

    // State: ready -> return immediately
    if (this._state === 'ready') {
      logger.debug('esbuild already initialized (state: ready)');
      return;
    }

    // State: error -> throw stored error
    if (this._state === 'error' && this._error) {
      logger.debug('esbuild init failed previously, rethrowing error');
      throw this._error;
    }

    // State: initializing -> wait for existing Promise
    if (this._state === 'initializing' && this._promise) {
      logger.debug('esbuild init in progress, waiting for existing Promise...');
      return this._promise;
    }

    // State: idle -> start initialization
    logger.info('Starting esbuild WASM initialization...');
    this._state = 'initializing';

    // Create and store Promise BEFORE starting async work (prevents race)
    this._promise = this._doInitialize(wasmUrl);

    try {
      await this._promise;

      // Success: transition to ready
      this._state = 'ready';
      (globalThis as any).__esbuildInitialized = true;

      logger.info('esbuild WASM initialized successfully');
    } catch (error) {
      // Failure: transition to error, store error
      this._state = 'error';
      this._error = error instanceof Error ? error : new Error(String(error));
      this._promise = null;

      logger.error('esbuild initialization failed:', this._error.message);
      throw this._error;
    }
  }

  /**
   * Perform the actual initialization with timeout
   * FIX 2.1: Added timeout to prevent infinite hangs
   */
  private async _doInitialize(wasmUrl: string): Promise<void> {
    await withTimeout(
      esbuild.initialize({
        wasmURL: wasmUrl,
      }),
      TIMEOUTS.ESBUILD_INIT,
      'esbuild WASM initialization'
    );
  }

  /**
   * Reset error state to allow retry.
   * Only works when in error state.
   */
  reset(): void {
    if (this._state === 'error') {
      logger.info('Resetting EsbuildInitLock from error state');
      this._state = 'idle';
      this._error = null;
      this._promise = null;
    }
  }

  /**
   * Force reset for testing purposes only.
   * WARNING: This can cause "esbuild already initialized" errors!
   */
  _forceReset(): void {
    logger.warn('Force resetting EsbuildInitLock - use only in tests!');
    this._state = 'idle';
    this._error = null;
    this._promise = null;
    (globalThis as any).__esbuildInitialized = false;
  }
}

/**
 * Singleton instance helper
 */
export const esbuildInitLock = EsbuildInitLock.getInstance();
