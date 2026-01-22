/**
 * =============================================================================
 * BAVINI Container - Events Module
 * =============================================================================
 * Node.js EventEmitter implementation.
 * =============================================================================
 */

import type { EventListener, EventEmitterInterface } from '../types';

/**
 * Default max listeners
 */
let defaultMaxListeners = 10;

/**
 * Listener wrapper with once flag
 */
interface ListenerWrapper {
  listener: EventListener;
  once: boolean;
}

/**
 * EventEmitter class
 */
export class EventEmitter implements EventEmitterInterface {
  private _events: Map<string | symbol, ListenerWrapper[]> = new Map();
  private _maxListeners: number = defaultMaxListeners;

  /**
   * Get/set default max listeners
   */
  static get defaultMaxListeners(): number {
    return defaultMaxListeners;
  }

  static set defaultMaxListeners(n: number) {
    if (typeof n !== 'number' || n < 0 || Number.isNaN(n)) {
      throw new RangeError('The value of "defaultMaxListeners" is out of range');
    }

    defaultMaxListeners = n;
  }

  /**
   * Get listener count for an event (static)
   */
  static listenerCount(emitter: EventEmitter, eventName: string): number {
    return emitter.listenerCount(eventName);
  }

  /**
   * Get event names that have listeners (static)
   */
  static getEventListeners(emitter: EventEmitter, eventName: string): EventListener[] {
    return emitter.listeners(eventName);
  }

  /**
   * Create a promise that resolves on event
   */
  static once(emitter: EventEmitter, eventName: string): Promise<unknown[]> {
    return new Promise((resolve, reject) => {
      const errorListener = (err: unknown) => {
        emitter.off(eventName, resolver);
        reject(err);
      };

      const resolver = (...args: unknown[]) => {
        emitter.off('error', errorListener);
        resolve(args);
      };

      emitter.once(eventName, resolver);

      if (eventName !== 'error') {
        emitter.once('error', errorListener);
      }
    });
  }

  /**
   * Create an async iterator for events
   */
  static on(emitter: EventEmitter, eventName: string): AsyncIterableIterator<unknown[]> {
    const events: unknown[][] = [];
    let resolve: ((value: IteratorResult<unknown[]>) => void) | null = null;
    let done = false;

    const listener = (...args: unknown[]) => {
      if (resolve) {
        resolve({ value: args, done: false });
        resolve = null;
      } else {
        events.push(args);
      }
    };

    emitter.on(eventName, listener);

    return {
      [Symbol.asyncIterator]() {
        return this;
      },

      async next(): Promise<IteratorResult<unknown[]>> {
        if (done) {
          return { value: undefined, done: true };
        }

        if (events.length > 0) {
          return { value: events.shift()!, done: false };
        }

        return new Promise((r) => {
          resolve = r;
        });
      },

      async return(): Promise<IteratorResult<unknown[]>> {
        done = true;
        emitter.off(eventName, listener);
        return { value: undefined, done: true };
      },

      async throw(err: unknown): Promise<IteratorResult<unknown[]>> {
        done = true;
        emitter.off(eventName, listener);
        throw err;
      },
    };
  }

  /**
   * Add listener (alias for on)
   */
  addListener(eventName: string, listener: EventListener): this {
    return this.on(eventName, listener);
  }

  /**
   * Add listener
   */
  on(eventName: string | symbol, listener: EventListener): this {
    return this._addListener(eventName, listener, false, false);
  }

  /**
   * Add one-time listener
   */
  once(eventName: string | symbol, listener: EventListener): this {
    return this._addListener(eventName, listener, true, false);
  }

  /**
   * Remove listener (alias for off)
   */
  removeListener(eventName: string, listener: EventListener): this {
    return this.off(eventName, listener);
  }

  /**
   * Remove listener
   */
  off(eventName: string | symbol, listener: EventListener): this {
    const listeners = this._events.get(eventName);

    if (!listeners) return this;

    const index = listeners.findIndex((w) => w.listener === listener);

    if (index !== -1) {
      listeners.splice(index, 1);

      if (listeners.length === 0) {
        this._events.delete(eventName);
      }

      this.emit('removeListener', eventName, listener);
    }

    return this;
  }

  /**
   * Remove all listeners for an event (or all events)
   */
  removeAllListeners(eventName?: string | symbol): this {
    if (eventName !== undefined) {
      const listeners = this._events.get(eventName);

      if (listeners) {
        for (const wrapper of [...listeners]) {
          this.emit('removeListener', eventName, wrapper.listener);
        }

        this._events.delete(eventName);
      }
    } else {
      for (const [name] of this._events) {
        if (name !== 'removeListener') {
          this.removeAllListeners(name);
        }
      }

      this._events.delete('removeListener');
    }

    return this;
  }

  /**
   * Set max listeners
   */
  setMaxListeners(n: number): this {
    if (typeof n !== 'number' || n < 0 || Number.isNaN(n)) {
      throw new RangeError('The value of "n" is out of range');
    }

    this._maxListeners = n;
    return this;
  }

  /**
   * Get max listeners
   */
  getMaxListeners(): number {
    return this._maxListeners;
  }

  /**
   * Get listeners for an event
   */
  listeners(eventName: string | symbol): EventListener[] {
    const wrappers = this._events.get(eventName);
    return wrappers ? wrappers.map((w) => w.listener) : [];
  }

  /**
   * Get raw listeners (including wrappers)
   */
  rawListeners(eventName: string | symbol): EventListener[] {
    return this.listeners(eventName);
  }

  /**
   * Emit an event
   */
  emit(eventName: string | symbol, ...args: unknown[]): boolean {
    // Handle error events specially
    if (eventName === 'error') {
      const listeners = this._events.get('error');

      if (!listeners || listeners.length === 0) {
        const err = args[0];

        if (err instanceof Error) {
          throw err;
        }

        throw new Error(`Unhandled error: ${err}`);
      }
    }

    const listeners = this._events.get(eventName);

    if (!listeners || listeners.length === 0) {
      return false;
    }

    // Copy array to handle listener removal during emit
    const toCall = [...listeners];

    for (const wrapper of toCall) {
      if (wrapper.once) {
        this.off(eventName, wrapper.listener);
      }

      try {
        wrapper.listener.apply(this, args);
      } catch (err) {
        // If error listener throws, we need to handle it
        if (eventName !== 'error') {
          this.emit('error', err);
        } else {
          throw err;
        }
      }
    }

    return true;
  }

  /**
   * Get listener count for an event
   */
  listenerCount(eventName: string | symbol): number {
    const listeners = this._events.get(eventName);
    return listeners ? listeners.length : 0;
  }

  /**
   * Prepend listener
   */
  prependListener(eventName: string | symbol, listener: EventListener): this {
    return this._addListener(eventName, listener, false, true);
  }

  /**
   * Prepend one-time listener
   */
  prependOnceListener(eventName: string | symbol, listener: EventListener): this {
    return this._addListener(eventName, listener, true, true);
  }

  /**
   * Get all event names
   */
  eventNames(): (string | symbol)[] {
    return Array.from(this._events.keys());
  }

  /**
   * Internal add listener method
   */
  private _addListener(eventName: string | symbol, listener: EventListener, once: boolean, prepend: boolean): this {
    if (typeof listener !== 'function') {
      throw new TypeError('The "listener" argument must be of type Function');
    }

    let listeners = this._events.get(eventName);

    if (!listeners) {
      listeners = [];
      this._events.set(eventName, listeners);
    }

    // Check max listeners
    if (this._maxListeners > 0 && listeners.length >= this._maxListeners) {
      console.warn(
        `MaxListenersExceededWarning: Possible EventEmitter memory leak detected. ` +
          `${listeners.length + 1} ${String(eventName)} listeners added.`,
      );
    }

    const wrapper: ListenerWrapper = { listener, once };

    if (prepend) {
      listeners.unshift(wrapper);
    } else {
      listeners.push(wrapper);
    }

    this.emit('newListener', eventName, listener);

    return this;
  }
}

/**
 * Export for CommonJS compatibility
 */
export default EventEmitter;

/**
 * Utility function to wrap callback with once behavior
 */
export function once(emitter: EventEmitter, eventName: string): Promise<unknown[]> {
  return EventEmitter.once(emitter, eventName);
}

/**
 * Utility function to create async iterator
 */
export function on(emitter: EventEmitter, eventName: string): AsyncIterableIterator<unknown[]> {
  return EventEmitter.on(emitter, eventName);
}

/**
 * Get listener count
 */
export function listenerCount(emitter: EventEmitter, eventName: string): number {
  return emitter.listenerCount(eventName);
}
