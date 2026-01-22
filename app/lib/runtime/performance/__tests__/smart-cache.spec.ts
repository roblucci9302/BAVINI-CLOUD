/**
 * =============================================================================
 * BAVINI Performance - Smart Cache Tests
 * =============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { SmartCache, createSmartCache } from '../smart-cache';

describe('SmartCache', () => {
  let cache: SmartCache<string>;

  beforeEach(() => {
    cache = new SmartCache<string>('test-cache', {
      maxEntries: 10,
      maxSizeBytes: 1000,
      ttlMs: 60000,
      persistent: false,
    });
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('basic operations', () => {
    it('should set and get a value', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing key', () => {
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should delete a key', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should return false when deleting nonexistent key', () => {
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should return all keys', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(cache.keys()).toContain('key1');
      expect(cache.keys()).toContain('key2');
    });
  });

  describe('size tracking', () => {
    it('should track entry count', () => {
      expect(cache.size).toBe(0);

      cache.set('key1', 'value1');
      expect(cache.size).toBe(1);

      cache.set('key2', 'value2');
      expect(cache.size).toBe(2);

      cache.delete('key1');
      expect(cache.size).toBe(1);
    });

    it('should track total size in bytes', () => {
      cache.set('key1', 'test', 100);
      expect(cache.sizeBytes).toBe(100);

      cache.set('key2', 'test', 200);
      expect(cache.sizeBytes).toBe(300);
    });

    it('should estimate size for strings', () => {
      cache.set('key1', 'hello'); // 5 chars * 2 = 10 bytes
      expect(cache.sizeBytes).toBe(10);
    });

    it('should update size when replacing key', () => {
      cache.set('key1', 'test', 100);
      cache.set('key1', 'new value', 200);

      expect(cache.sizeBytes).toBe(200);
      expect(cache.size).toBe(1);
    });
  });

  describe('LRU eviction', () => {
    it('should evict oldest entry when max entries reached', () => {
      const smallCache = new SmartCache<string>('small', {
        maxEntries: 3,
        maxSizeBytes: 10000,
        ttlMs: 60000,
        persistent: false,
      });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');
      smallCache.set('key4', 'value4'); // Should evict key1

      expect(smallCache.has('key1')).toBe(false);
      expect(smallCache.has('key4')).toBe(true);
      expect(smallCache.size).toBe(3);

      smallCache.destroy();
    });

    it('should evict oldest entry when max size reached', () => {
      const smallCache = new SmartCache<string>('small', {
        maxEntries: 100,
        maxSizeBytes: 300,
        ttlMs: 60000,
        persistent: false,
      });

      smallCache.set('key1', 'a', 100);
      smallCache.set('key2', 'b', 100);
      smallCache.set('key3', 'c', 150); // Should evict key1

      expect(smallCache.has('key1')).toBe(false);
      expect(smallCache.has('key3')).toBe(true);

      smallCache.destroy();
    });

    it('should update LRU order on access', () => {
      const smallCache = new SmartCache<string>('small', {
        maxEntries: 3,
        maxSizeBytes: 10000,
        ttlMs: 60000,
        persistent: false,
      });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3');

      // Access key1 to make it recently used
      smallCache.get('key1');

      smallCache.set('key4', 'value4'); // Should evict key2 (now oldest)

      expect(smallCache.has('key1')).toBe(true);
      expect(smallCache.has('key2')).toBe(false);

      smallCache.destroy();
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      vi.useFakeTimers();

      const ttlCache = new SmartCache<string>('ttl', {
        maxEntries: 100,
        maxSizeBytes: 10000,
        ttlMs: 1000,
        persistent: false,
      });

      ttlCache.set('key1', 'value1');
      expect(ttlCache.get('key1')).toBe('value1');

      vi.advanceTimersByTime(1500);

      expect(ttlCache.get('key1')).toBeUndefined();

      ttlCache.destroy();
      vi.useRealTimers();
    });

    it('should remove expired entry on has() check', () => {
      vi.useFakeTimers();

      const ttlCache = new SmartCache<string>('ttl', {
        maxEntries: 100,
        maxSizeBytes: 10000,
        ttlMs: 1000,
        persistent: false,
      });

      ttlCache.set('key1', 'value1');
      vi.advanceTimersByTime(1500);

      expect(ttlCache.has('key1')).toBe(false);

      ttlCache.destroy();
      vi.useRealTimers();
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', 'value1');

      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('nonexistent'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(0.667, 2);
    });

    it('should track evictions', () => {
      const smallCache = new SmartCache<string>('small', {
        maxEntries: 2,
        maxSizeBytes: 10000,
        ttlMs: 60000,
        persistent: false,
      });

      smallCache.set('key1', 'value1');
      smallCache.set('key2', 'value2');
      smallCache.set('key3', 'value3'); // evicts key1

      const stats = smallCache.getStats();
      expect(stats.evictions).toBe(1);

      smallCache.destroy();
    });

    it('should return 0 hit rate when no requests', () => {
      const stats = cache.getStats();
      expect(stats.hitRate).toBe(0);
    });
  });

  describe('cleanup', () => {
    it('should clean up expired entries', () => {
      vi.useFakeTimers();

      const ttlCache = new SmartCache<string>('ttl', {
        maxEntries: 100,
        maxSizeBytes: 10000,
        ttlMs: 1000,
        persistent: false,
      });

      ttlCache.set('key1', 'value1');
      ttlCache.set('key2', 'value2');

      vi.advanceTimersByTime(1500);

      const removed = ttlCache.cleanup();
      expect(removed).toBe(2);
      expect(ttlCache.size).toBe(0);

      ttlCache.destroy();
      vi.useRealTimers();
    });
  });

  describe('prune', () => {
    it('should prune cache to target size', () => {
      cache.set('key1', 'a', 100);
      cache.set('key2', 'b', 100);
      cache.set('key3', 'c', 100);

      const removed = cache.prune(200);

      expect(removed).toBe(1);
      expect(cache.sizeBytes).toBeLessThanOrEqual(200);
    });
  });

  describe('hot and large entries', () => {
    it('should return hot entries sorted by access count', () => {
      cache.set('cold', 'value');
      cache.set('hot', 'value');

      // Access 'hot' multiple times
      cache.get('hot');
      cache.get('hot');
      cache.get('hot');
      cache.get('cold');

      const hot = cache.getHotEntries(2);
      expect(hot[0].key).toBe('hot');
      expect(hot[0].accessCount).toBe(4); // 1 initial + 3 gets
    });

    it('should return largest entries sorted by size', () => {
      // Use a cache with enough space for all entries
      const largeCache = new SmartCache<string>('large-cache', {
        maxEntries: 100,
        maxSizeBytes: 10000,
        ttlMs: 60000,
        persistent: false,
      });

      largeCache.set('small', 'a', 10);
      largeCache.set('large', 'b', 1000);
      largeCache.set('medium', 'c', 100);

      const largest = largeCache.getLargestEntries(2);
      expect(largest[0].key).toBe('large');
      expect(largest[1].key).toBe('medium');

      largeCache.destroy();
    });
  });

  describe('factory function', () => {
    it('should create cache with factory', () => {
      const factoryCache = createSmartCache<number>('factory', {
        maxEntries: 50,
      });

      factoryCache.set('num', 42);
      expect(factoryCache.get('num')).toBe(42);

      factoryCache.destroy();
    });
  });

  describe('size estimation', () => {
    it('should estimate size for numbers', () => {
      const numCache = new SmartCache<number>('num', {
        maxEntries: 100,
        maxSizeBytes: 10000,
        ttlMs: 60000,
        persistent: false,
      });

      numCache.set('key', 42);
      expect(numCache.sizeBytes).toBe(8);

      numCache.destroy();
    });

    it('should estimate size for booleans', () => {
      const boolCache = new SmartCache<boolean>('bool', {
        maxEntries: 100,
        maxSizeBytes: 10000,
        ttlMs: 60000,
        persistent: false,
      });

      boolCache.set('key', true);
      expect(boolCache.sizeBytes).toBe(4);

      boolCache.destroy();
    });

    it('should estimate size for objects', () => {
      const objCache = new SmartCache<object>('obj', {
        maxEntries: 100,
        maxSizeBytes: 100000,
        ttlMs: 60000,
        persistent: false,
      });

      objCache.set('key', { name: 'test', value: 123 });
      expect(objCache.sizeBytes).toBeGreaterThan(0);

      objCache.destroy();
    });

    it('should handle null and undefined', () => {
      const anyCache = new SmartCache<unknown>('any', {
        maxEntries: 100,
        maxSizeBytes: 10000,
        ttlMs: 60000,
        persistent: false,
      });

      anyCache.set('null', null);
      anyCache.set('undef', undefined);

      expect(anyCache.sizeBytes).toBe(0);

      anyCache.destroy();
    });
  });
});
