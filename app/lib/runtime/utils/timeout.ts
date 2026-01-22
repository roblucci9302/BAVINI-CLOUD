/**
 * =============================================================================
 * BAVINI Runtime - Timeout Utilities
 * =============================================================================
 * FIX 2.1: Provides timeout utilities for all async operations.
 * Prevents hanging operations and improves error handling.
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('Timeout');

/**
 * Timeout constants for all operations
 */
export const TIMEOUTS = {
  /** esbuild WASM initialization */
  ESBUILD_INIT: 30_000,
  /** Single module fetch from CDN */
  MODULE_FETCH: 15_000,
  /** Total build operation */
  BUILD_TOTAL: 120_000,
  /** Tarball download from npm */
  TARBALL_DOWNLOAD: 60_000,
  /** Service Worker ping/health check */
  SERVICE_WORKER_PING: 3_000,
  /** Package metadata fetch */
  REGISTRY_METADATA: 10_000,
  /** File system operation */
  FS_OPERATION: 5_000,
  /** Compiler transform operation */
  TRANSFORM: 30_000,
} as const;

/**
 * Timeout error with operation details
 */
export class TimeoutError extends Error {
  constructor(
    message: string,
    public readonly operation: string,
    public readonly timeoutMs: number
  ) {
    super(message);
    this.name = 'TimeoutError';
  }
}

/**
 * Executes a Promise with timeout.
 * Throws TimeoutError if the operation exceeds the specified duration.
 *
 * @example
 * await withTimeout(
 *   fetch(url),
 *   TIMEOUTS.MODULE_FETCH,
 *   'module fetch'
 * );
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  operation: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      logger.warn(`Operation timed out: ${operation} (${timeoutMs}ms)`);
      reject(
        new TimeoutError(
          `${operation} timed out after ${timeoutMs}ms`,
          operation,
          timeoutMs
        )
      );
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    return result;
  } catch (error) {
    if (timeoutId !== undefined) {
      clearTimeout(timeoutId);
    }
    throw error;
  }
}

/**
 * Creates an AbortController with automatic timeout.
 * Useful for fetch operations that support AbortSignal.
 *
 * @example
 * const { controller, cleanup } = createTimeoutController(TIMEOUTS.MODULE_FETCH);
 * try {
 *   const response = await fetch(url, { signal: controller.signal });
 *   cleanup();
 *   return response;
 * } catch (error) {
 *   cleanup();
 *   throw error;
 * }
 */
export function createTimeoutController(timeoutMs: number): {
  controller: AbortController;
  cleanup: () => void;
} {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    logger.debug(`AbortController timeout triggered (${timeoutMs}ms)`);
    controller.abort();
  }, timeoutMs);

  return {
    controller,
    cleanup: () => clearTimeout(timeoutId),
  };
}

/**
 * Wraps a fetch call with timeout using AbortController.
 * More efficient than withTimeout for fetch operations.
 *
 * @example
 * const response = await fetchWithTimeout(
 *   'https://registry.npmjs.org/react',
 *   { method: 'GET' },
 *   TIMEOUTS.REGISTRY_METADATA
 * );
 */
export async function fetchWithTimeout(
  url: string,
  options: RequestInit = {},
  timeoutMs: number
): Promise<Response> {
  const { controller, cleanup } = createTimeoutController(timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    cleanup();
    return response;
  } catch (error) {
    cleanup();

    // Convert AbortError to TimeoutError for consistency
    if (error instanceof Error && error.name === 'AbortError') {
      throw new TimeoutError(
        `Fetch to ${url} timed out after ${timeoutMs}ms`,
        `fetch:${url}`,
        timeoutMs
      );
    }

    throw error;
  }
}

/**
 * Retry an operation with exponential backoff and timeout per attempt.
 *
 * @example
 * const result = await withRetry(
 *   () => fetchPackageMetadata(name),
 *   {
 *     maxAttempts: 3,
 *     timeoutMs: TIMEOUTS.REGISTRY_METADATA,
 *     backoffMs: 1000,
 *     operation: 'package metadata fetch'
 *   }
 * );
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: {
    maxAttempts?: number;
    timeoutMs?: number;
    backoffMs?: number;
    operation?: string;
  } = {}
): Promise<T> {
  const {
    maxAttempts = 3,
    timeoutMs = 10_000,
    backoffMs = 1000,
    operation = 'operation',
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await withTimeout(fn(), timeoutMs, `${operation} (attempt ${attempt})`);
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      logger.debug(`${operation} attempt ${attempt}/${maxAttempts} failed:`, lastError.message);

      if (attempt < maxAttempts) {
        const delay = backoffMs * Math.pow(2, attempt - 1);
        logger.debug(`Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError ?? new Error(`${operation} failed after ${maxAttempts} attempts`);
}
