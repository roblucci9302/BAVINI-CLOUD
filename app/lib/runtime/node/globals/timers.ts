/**
 * =============================================================================
 * BAVINI Container - Timers Implementation
 * =============================================================================
 * Node.js timer functions (setTimeout, setInterval, setImmediate).
 * =============================================================================
 */

import type { TimerHandle } from '../types';

/**
 * Timer ID counter
 */
let timerIdCounter = 1;

/**
 * Active timers map
 */
const activeTimers = new Map<number, { type: 'timeout' | 'interval' | 'immediate'; id: number; ref: boolean }>();

/**
 * Create a timer handle
 */
function createTimerHandle(type: 'timeout' | 'interval' | 'immediate', nativeId: number): TimerHandle {
  const id = timerIdCounter++;
  const timer = { type, id: nativeId, ref: true };
  activeTimers.set(id, timer);

  const handle: TimerHandle = {
    ref(): TimerHandle {
      timer.ref = true;
      return handle;
    },

    unref(): TimerHandle {
      timer.ref = false;
      return handle;
    },

    hasRef(): boolean {
      return timer.ref;
    },

    refresh(): TimerHandle {
      // For timeout, restart the timer
      // This is a simplified implementation
      return handle;
    },

    [Symbol.toPrimitive](): number {
      return id;
    },
  };

  return handle;
}

/**
 * Node.js setTimeout implementation
 */
export function nodeSetTimeout(callback: (...args: unknown[]) => void, ms = 0, ...args: unknown[]): TimerHandle {
  const nativeId = globalThis.setTimeout(() => {
    callback(...args);
  }, ms);

  return createTimerHandle('timeout', nativeId as unknown as number);
}

/**
 * Node.js clearTimeout implementation
 */
export function nodeClearTimeout(handle: TimerHandle | number | undefined): void {
  if (handle === undefined) return;

  const id = typeof handle === 'number' ? handle : (handle as unknown as { [Symbol.toPrimitive]: () => number })[Symbol.toPrimitive]();
  const timer = activeTimers.get(id);

  if (timer) {
    globalThis.clearTimeout(timer.id);
    activeTimers.delete(id);
  }
}

/**
 * Node.js setInterval implementation
 */
export function nodeSetInterval(callback: (...args: unknown[]) => void, ms = 0, ...args: unknown[]): TimerHandle {
  const nativeId = globalThis.setInterval(() => {
    callback(...args);
  }, ms);

  return createTimerHandle('interval', nativeId as unknown as number);
}

/**
 * Node.js clearInterval implementation
 */
export function nodeClearInterval(handle: TimerHandle | number | undefined): void {
  if (handle === undefined) return;

  const id = typeof handle === 'number' ? handle : (handle as unknown as { [Symbol.toPrimitive]: () => number })[Symbol.toPrimitive]();
  const timer = activeTimers.get(id);

  if (timer) {
    globalThis.clearInterval(timer.id);
    activeTimers.delete(id);
  }
}

/**
 * Node.js setImmediate implementation
 * Uses queueMicrotask or setTimeout(0) as fallback
 */
export function nodeSetImmediate(callback: (...args: unknown[]) => void, ...args: unknown[]): TimerHandle {
  let nativeId: number;

  if (typeof globalThis.queueMicrotask === 'function') {
    // Use queueMicrotask for immediate execution after current task
    nativeId = globalThis.setTimeout(() => {
      callback(...args);
    }, 0) as unknown as number;
  } else {
    nativeId = globalThis.setTimeout(() => {
      callback(...args);
    }, 0) as unknown as number;
  }

  return createTimerHandle('immediate', nativeId);
}

/**
 * Node.js clearImmediate implementation
 */
export function nodeClearImmediate(handle: TimerHandle | number | undefined): void {
  if (handle === undefined) return;

  const id = typeof handle === 'number' ? handle : (handle as unknown as { [Symbol.toPrimitive]: () => number })[Symbol.toPrimitive]();
  const timer = activeTimers.get(id);

  if (timer) {
    globalThis.clearTimeout(timer.id);
    activeTimers.delete(id);
  }
}

/**
 * Promise-based setTimeout
 */
export function setTimeoutPromise(ms: number, value?: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    nodeSetTimeout(() => resolve(value), ms);
  });
}

/**
 * Promise-based setImmediate
 */
export function setImmediatePromise(value?: unknown): Promise<unknown> {
  return new Promise((resolve) => {
    nodeSetImmediate(() => resolve(value));
  });
}

/**
 * Create timers/promises namespace (like Node.js timers/promises)
 */
export const timersPromises = {
  setTimeout: setTimeoutPromise,
  setImmediate: setImmediatePromise,

  /**
   * Async iterator that yields at each interval
   */
  async *setInterval(ms: number, value?: unknown): AsyncGenerator<unknown, void, unknown> {
    while (true) {
      await setTimeoutPromise(ms);
      yield value;
    }
  },
};

/**
 * Get all active timer handles (for cleanup)
 */
export function getActiveTimers(): number[] {
  return Array.from(activeTimers.keys());
}

/**
 * Clear all active timers
 */
export function clearAllTimers(): void {
  for (const [id, timer] of activeTimers) {
    if (timer.type === 'interval') {
      globalThis.clearInterval(timer.id);
    } else {
      globalThis.clearTimeout(timer.id);
    }
  }

  activeTimers.clear();
}

/**
 * Export all timer functions
 */
export const timers = {
  setTimeout: nodeSetTimeout,
  clearTimeout: nodeClearTimeout,
  setInterval: nodeSetInterval,
  clearInterval: nodeClearInterval,
  setImmediate: nodeSetImmediate,
  clearImmediate: nodeClearImmediate,
  promises: timersPromises,
};
