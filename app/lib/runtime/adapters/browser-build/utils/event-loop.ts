/**
 * =============================================================================
 * BAVINI CLOUD - Event Loop Utilities
 * =============================================================================
 * Utilities for managing the browser event loop during heavy operations.
 * =============================================================================
 */

/**
 * Yield control to the event loop.
 *
 * This function allows the browser to process pending events (like user input)
 * during long-running synchronous operations like builds.
 *
 * Uses the best available API:
 * 1. scheduler.postTask (Chrome 94+) - Most efficient
 * 2. requestIdleCallback - Good fallback
 * 3. setTimeout(0) - Universal fallback
 *
 * @example
 * ```typescript
 * async function longOperation() {
 *   for (const item of items) {
 *     await processItem(item);
 *     await yieldToEventLoop(); // Let UI update
 *   }
 * }
 * ```
 */
export async function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    // Try scheduler.postTask (Chrome 94+, most efficient)
    if (typeof globalThis !== 'undefined' && 'scheduler' in globalThis) {
      const scheduler = (globalThis as Record<string, unknown>).scheduler as
        | { postTask?: (cb: () => void, options?: { priority?: string }) => void }
        | undefined;

      if (scheduler?.postTask) {
        scheduler.postTask(() => resolve(), { priority: 'background' });
        return;
      }
    }

    // Try requestIdleCallback (good for non-critical work)
    if (typeof requestIdleCallback !== 'undefined') {
      requestIdleCallback(() => resolve(), { timeout: 50 });
      return;
    }

    // Fallback to setTimeout
    setTimeout(resolve, 0);
  });
}

/**
 * Run a function in chunks, yielding to the event loop between chunks.
 *
 * @param items - Array of items to process
 * @param processFn - Function to process each item
 * @param chunkSize - Number of items to process before yielding (default: 10)
 *
 * @example
 * ```typescript
 * await processInChunks(files, async (file) => {
 *   await compileFile(file);
 * }, 5);
 * ```
 */
export async function processInChunks<T, R>(
  items: T[],
  processFn: (item: T, index: number) => Promise<R>,
  chunkSize: number = 10
): Promise<R[]> {
  const results: R[] = [];

  for (let i = 0; i < items.length; i++) {
    results.push(await processFn(items[i], i));

    // Yield after each chunk
    if ((i + 1) % chunkSize === 0 && i < items.length - 1) {
      await yieldToEventLoop();
    }
  }

  return results;
}
