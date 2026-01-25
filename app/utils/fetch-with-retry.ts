/**
 * =============================================================================
 * BAVINI CLOUD - Fetch with Retry
 * =============================================================================
 * Provides fetch with automatic retry and exponential backoff.
 * Handles server errors (5xx) and rate limiting (429).
 *
 * @module utils/fetch-with-retry
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('FetchRetry');

/**
 * Retry configuration for fetch requests
 */
export interface RetryConfig {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  retryOn5xx?: boolean;
  retryOn429?: boolean;
}

export const DEFAULT_RETRY_CONFIG: Required<RetryConfig> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 10000,
  retryOn5xx: true,
  retryOn429: true,
};

/**
 * Fetch with automatic retry and exponential backoff.
 * Handles server errors (5xx) and rate limiting (429).
 *
 * @param url - URL to fetch
 * @param options - Fetch options
 * @param retryConfig - Retry configuration
 * @returns Response from the fetch
 * @throws Error if all retries are exhausted
 */
export async function fetchWithRetry(
  url: string,
  options: RequestInit = {},
  retryConfig: RetryConfig = {},
): Promise<Response> {
  const config = { ...DEFAULT_RETRY_CONFIG, ...retryConfig };
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < config.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);

      // Handle 5xx server errors with retry
      if (config.retryOn5xx && response.status >= 500 && attempt < config.maxRetries - 1) {
        const delay = Math.min(config.initialDelayMs * Math.pow(2, attempt), config.maxDelayMs);
        logger.warn(`Server error ${response.status}, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Handle 429 rate limiting with Retry-After header
      if (config.retryOn429 && response.status === 429 && attempt < config.maxRetries - 1) {
        const retryAfter = response.headers.get('Retry-After');
        const delay = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, config.maxDelayMs)
          : Math.min(config.initialDelayMs * Math.pow(2, attempt), config.maxDelayMs);

        logger.warn(`Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }

      // Success or non-retryable error
      return response;
    } catch (error) {
      // Network errors - retry with backoff
      lastError = error instanceof Error ? error : new Error(String(error));

      if (attempt < config.maxRetries - 1) {
        const delay = Math.min(config.initialDelayMs * Math.pow(2, attempt), config.maxDelayMs);
        logger.warn(`Fetch error: ${lastError.message}, retrying in ${delay}ms (attempt ${attempt + 1}/${config.maxRetries})`);
        await new Promise((r) => setTimeout(r, delay));
      }
    }
  }

  throw lastError || new Error('Fetch failed after retries');
}
