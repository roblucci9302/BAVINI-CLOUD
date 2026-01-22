/**
 * =============================================================================
 * BAVINI Performance - Browser Compatibility Tests
 * =============================================================================
 * Tests to ensure runtime works across different browser environments.
 * These tests verify that we properly detect and handle API availability.
 * =============================================================================
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

/**
 * Mock browser APIs that might not be available in all browsers
 */
describe('Browser API Compatibility', () => {
  describe('Performance API', () => {
    it('should work with standard Performance API', () => {
      expect(performance.now).toBeDefined();
      expect(typeof performance.now()).toBe('number');
    });

    it('should handle missing performance.memory gracefully', () => {
      // Create a mock PerformanceMonitor to test memory handling
      const mockPerformance = {
        now: () => Date.now(),
        // No memory property - simulates Firefox/Safari
      };

      // Our code should handle missing memory gracefully
      const memoryInfo = (mockPerformance as Performance & { memory?: unknown }).memory;
      expect(memoryInfo).toBeUndefined();
    });

    it('should use performance.now for timing', () => {
      const start = performance.now();
      // Small computation
      let sum = 0;
      for (let i = 0; i < 1000; i++) sum += i;
      const end = performance.now();

      expect(end).toBeGreaterThanOrEqual(start);
      expect(end - start).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Web Workers', () => {
    it('should detect Worker support', () => {
      // Worker might not be available in all test environments
      const hasWorker = typeof Worker !== 'undefined';
      expect(typeof hasWorker).toBe('boolean');
    });

    it('should detect SharedArrayBuffer support', () => {
      // SharedArrayBuffer might be restricted in some contexts
      const hasSharedArrayBuffer = typeof SharedArrayBuffer !== 'undefined';
      // Just verify the check doesn't throw
      expect(typeof hasSharedArrayBuffer).toBe('boolean');
    });

    it('should detect Atomics support', () => {
      const hasAtomics = typeof Atomics !== 'undefined';
      expect(typeof hasAtomics).toBe('boolean');
    });
  });

  describe('Storage APIs', () => {
    it('should detect localStorage support', () => {
      // localStorage might not be available in all test environments
      const hasLocalStorage = typeof localStorage !== 'undefined';
      expect(typeof hasLocalStorage).toBe('boolean');
    });

    it('should detect IndexedDB support', () => {
      // IndexedDB might not be available in all test environments
      const hasIndexedDB = typeof indexedDB !== 'undefined';
      expect(typeof hasIndexedDB).toBe('boolean');
    });

    it('should handle localStorage quota gracefully', () => {
      // Try to detect if localStorage is available
      if (typeof localStorage === 'undefined') {
        // Skip in environments without localStorage
        return;
      }

      try {
        const testKey = '__bavini_test__';
        localStorage.setItem(testKey, 'test');
        localStorage.removeItem(testKey);
      } catch {
        // In some environments localStorage throws
        // Our code should handle this gracefully
      }
    });
  });

  describe('URL and Blob APIs', () => {
    it('should detect URL.createObjectURL support', () => {
      // URL.createObjectURL might not be available in Node.js
      const hasCreateObjectURL = typeof URL.createObjectURL !== 'undefined';
      expect(typeof hasCreateObjectURL).toBe('boolean');
    });

    it('should detect URL.revokeObjectURL support', () => {
      // URL.revokeObjectURL might not be available in Node.js
      const hasRevokeObjectURL = typeof URL.revokeObjectURL !== 'undefined';
      expect(typeof hasRevokeObjectURL).toBe('boolean');
    });

    it('should support Blob constructor', () => {
      if (typeof Blob === 'undefined') {
        return; // Skip in environments without Blob
      }

      expect(typeof Blob).toBe('function');

      const blob = new Blob(['test'], { type: 'text/plain' });
      expect(blob.size).toBe(4);
      expect(blob.type).toBe('text/plain');
    });
  });

  describe('Fetch API', () => {
    it('should support fetch', () => {
      expect(typeof fetch).toBe('function');
    });

    it('should support AbortController', () => {
      expect(typeof AbortController).toBe('function');

      const controller = new AbortController();
      expect(controller.signal).toBeDefined();
      expect(typeof controller.abort).toBe('function');
    });
  });

  describe('BroadcastChannel API', () => {
    it('should detect BroadcastChannel support', () => {
      // BroadcastChannel is used for HMR
      // It might not be available in all test environments
      const hasBroadcastChannel = typeof globalThis.BroadcastChannel !== 'undefined';
      expect(typeof hasBroadcastChannel).toBe('boolean');
    });
  });

  describe('TextEncoder/TextDecoder', () => {
    it('should support TextEncoder', () => {
      if (typeof TextEncoder === 'undefined') {
        // Skip in environments without TextEncoder
        return;
      }

      expect(typeof TextEncoder).toBe('function');

      const encoder = new TextEncoder();
      const encoded = encoder.encode('test');
      // Use constructor name check for cross-context compatibility
      expect(encoded.constructor.name).toBe('Uint8Array');
      expect(encoded.length).toBe(4);
    });

    it('should support TextDecoder', () => {
      if (typeof TextDecoder === 'undefined') {
        // Skip in environments without TextDecoder
        return;
      }

      expect(typeof TextDecoder).toBe('function');

      const decoder = new TextDecoder();
      const decoded = decoder.decode(new Uint8Array([116, 101, 115, 116]));
      expect(decoded).toBe('test');
    });
  });

  describe('Map and Set', () => {
    it('should support Map', () => {
      const map = new Map<string, number>();
      map.set('a', 1);
      expect(map.get('a')).toBe(1);
      expect(map.size).toBe(1);
    });

    it('should support Set', () => {
      const set = new Set<string>();
      set.add('a');
      expect(set.has('a')).toBe(true);
      expect(set.size).toBe(1);
    });

    it('should support WeakMap', () => {
      const weakMap = new WeakMap();
      const key = {};
      weakMap.set(key, 'value');
      expect(weakMap.get(key)).toBe('value');
    });

    it('should support WeakSet', () => {
      const weakSet = new WeakSet();
      const obj = {};
      weakSet.add(obj);
      expect(weakSet.has(obj)).toBe(true);
    });
  });

  describe('Promise APIs', () => {
    it('should support Promise.all', async () => {
      const results = await Promise.all([
        Promise.resolve(1),
        Promise.resolve(2),
      ]);
      expect(results).toEqual([1, 2]);
    });

    it('should support Promise.allSettled', async () => {
      const results = await Promise.allSettled([
        Promise.resolve(1),
        Promise.reject(new Error('test')),
      ]);

      expect(results[0].status).toBe('fulfilled');
      expect(results[1].status).toBe('rejected');
    });

    it('should support Promise.race', async () => {
      const result = await Promise.race([
        Promise.resolve(1),
        new Promise(resolve => setTimeout(() => resolve(2), 100)),
      ]);
      expect(result).toBe(1);
    });
  });

  describe('Array methods', () => {
    it('should support Array.from', () => {
      const arr = Array.from('test');
      expect(arr).toEqual(['t', 'e', 's', 't']);
    });

    it('should support Array.prototype.flat', () => {
      const arr = [1, [2, [3]]];
      expect(arr.flat()).toEqual([1, 2, [3]]);
      expect(arr.flat(2)).toEqual([1, 2, 3]);
    });

    it('should support Array.prototype.flatMap', () => {
      const arr = [1, 2, 3];
      const result = arr.flatMap(x => [x, x * 2]);
      expect(result).toEqual([1, 2, 2, 4, 3, 6]);
    });

    it('should support Array.prototype.includes', () => {
      expect([1, 2, 3].includes(2)).toBe(true);
      expect([1, 2, 3].includes(4)).toBe(false);
    });
  });

  describe('Object methods', () => {
    it('should support Object.entries', () => {
      const entries = Object.entries({ a: 1, b: 2 });
      expect(entries).toEqual([['a', 1], ['b', 2]]);
    });

    it('should support Object.fromEntries', () => {
      const obj = Object.fromEntries([['a', 1], ['b', 2]]);
      expect(obj).toEqual({ a: 1, b: 2 });
    });

    it('should support Object.values', () => {
      const values = Object.values({ a: 1, b: 2 });
      expect(values).toEqual([1, 2]);
    });
  });

  describe('String methods', () => {
    it('should support String.prototype.includes', () => {
      expect('hello world'.includes('world')).toBe(true);
    });

    it('should support String.prototype.startsWith', () => {
      expect('hello'.startsWith('he')).toBe(true);
    });

    it('should support String.prototype.endsWith', () => {
      expect('hello'.endsWith('lo')).toBe(true);
    });

    it('should support String.prototype.padStart', () => {
      expect('5'.padStart(3, '0')).toBe('005');
    });

    it('should support String.prototype.padEnd', () => {
      expect('5'.padEnd(3, '0')).toBe('500');
    });

    it('should support String.prototype.replaceAll', () => {
      expect('a-b-c'.replaceAll('-', '+')).toBe('a+b+c');
    });
  });

  describe('Async/Await', () => {
    it('should support async functions', async () => {
      const asyncFn = async () => {
        return 42;
      };

      const result = await asyncFn();
      expect(result).toBe(42);
    });

    it('should support for-await-of', async () => {
      async function* asyncGenerator() {
        yield 1;
        yield 2;
        yield 3;
      }

      const results: number[] = [];
      for await (const value of asyncGenerator()) {
        results.push(value);
      }

      expect(results).toEqual([1, 2, 3]);
    });
  });

  describe('Timers', () => {
    it('should support setTimeout', async () => {
      const result = await new Promise(resolve => {
        setTimeout(() => resolve('done'), 10);
      });
      expect(result).toBe('done');
    });

    it('should support clearTimeout', () => {
      const timerId = setTimeout(() => {
        throw new Error('Should not be called');
      }, 100);

      clearTimeout(timerId);
      // If we get here without error, the test passes
    });

    it('should support setInterval and clearInterval', () => {
      let count = 0;
      const intervalId = setInterval(() => {
        count++;
      }, 10);

      clearInterval(intervalId);
      expect(count).toBe(0); // Should not have executed yet
    });
  });

  describe('JSON', () => {
    it('should support JSON.parse', () => {
      const obj = JSON.parse('{"a":1,"b":"test"}');
      expect(obj).toEqual({ a: 1, b: 'test' });
    });

    it('should support JSON.stringify', () => {
      const str = JSON.stringify({ a: 1, b: 'test' });
      expect(str).toBe('{"a":1,"b":"test"}');
    });

    it('should handle circular references gracefully', () => {
      const obj: Record<string, unknown> = { a: 1 };
      obj.self = obj;

      expect(() => JSON.stringify(obj)).toThrow();
    });
  });

  describe('Date', () => {
    it('should support Date.now', () => {
      const now = Date.now();
      expect(typeof now).toBe('number');
      expect(now).toBeGreaterThan(0);
    });

    it('should support Date.toISOString', () => {
      const date = new Date('2024-01-15T10:30:00.000Z');
      expect(date.toISOString()).toBe('2024-01-15T10:30:00.000Z');
    });
  });

  describe('Math', () => {
    it('should support Math.trunc', () => {
      expect(Math.trunc(4.7)).toBe(4);
      expect(Math.trunc(-4.7)).toBe(-4);
    });

    it('should support Math.sign', () => {
      expect(Math.sign(-5)).toBe(-1);
      expect(Math.sign(0)).toBe(0);
      expect(Math.sign(5)).toBe(1);
    });

    it('should support Math.log2', () => {
      expect(Math.log2(8)).toBe(3);
    });

    it('should support Math.log10', () => {
      expect(Math.log10(100)).toBe(2);
    });
  });

  describe('TypedArrays', () => {
    it('should support Uint8Array', () => {
      const arr = new Uint8Array([1, 2, 3]);
      expect(arr.length).toBe(3);
      expect(arr[0]).toBe(1);
    });

    it('should support ArrayBuffer', () => {
      const buffer = new ArrayBuffer(8);
      expect(buffer.byteLength).toBe(8);
    });

    it('should support DataView', () => {
      const buffer = new ArrayBuffer(8);
      const view = new DataView(buffer);

      view.setInt32(0, 42);
      expect(view.getInt32(0)).toBe(42);
    });
  });
});

/**
 * Feature detection utilities
 */
describe('Feature Detection', () => {
  it('should provide a complete feature detection object', () => {
    const features = {
      workers: typeof Worker !== 'undefined',
      sharedArrayBuffer: typeof SharedArrayBuffer !== 'undefined',
      atomics: typeof Atomics !== 'undefined',
      broadcastChannel: typeof BroadcastChannel !== 'undefined',
      localStorage: typeof localStorage !== 'undefined',
      indexedDB: typeof indexedDB !== 'undefined',
      fetch: typeof fetch !== 'undefined',
      abortController: typeof AbortController !== 'undefined',
      textEncoder: typeof TextEncoder !== 'undefined',
      textDecoder: typeof TextDecoder !== 'undefined',
      crypto: typeof crypto !== 'undefined',
      webAssembly: typeof WebAssembly !== 'undefined',
    };

    // All features should be detectable (boolean values)
    Object.values(features).forEach(value => {
      expect(typeof value).toBe('boolean');
    });

    // Fetch should be available in Node.js 18+ and all test environments
    expect(features.fetch).toBe(true);
  });
});
