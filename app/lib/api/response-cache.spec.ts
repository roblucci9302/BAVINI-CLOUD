import { describe, expect, it, beforeEach, vi, afterEach } from 'vitest';
import {
  ResponseCache,
  getCached,
  setCache,
  hasCache,
  deleteCache,
  clearCache,
  getOrCompute,
  getCacheStats,
  createCache,
} from './response-cache';

describe('ResponseCache', () => {
  let cache: ResponseCache<string>;

  beforeEach(() => {
    cache = new ResponseCache<string>({
      maxSize: 5,
      defaultTTL: 1000,
      autoCleanup: false,
    });
  });

  afterEach(() => {
    cache.stopAutoCleanup();
    clearCache();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return null for missing keys', () => {
      expect(cache.get('nonexistent')).toBeNull();
    });

    it('should check if key exists', () => {
      cache.set('key1', 'value1');
      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should delete keys', () => {
      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeNull();
    });

    it('should clear all entries', () => {
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();
      expect(cache.get('key1')).toBeNull();
      expect(cache.get('key2')).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      cache.set('key1', 'value1', 500);

      expect(cache.get('key1')).toBe('value1');

      vi.advanceTimersByTime(600);

      expect(cache.get('key1')).toBeNull();
    });

    it('should not expire entries before TTL', () => {
      cache.set('key1', 'value1', 1000);

      vi.advanceTimersByTime(500);

      expect(cache.get('key1')).toBe('value1');
    });
  });

  describe('LRU eviction', () => {
    it('should evict an entry when full', () => {
      // Fill cache to max size
      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');
      cache.set('key5', 'value5');

      // Add new entry, should evict one entry
      cache.set('key6', 'value6');

      // New entry should be there
      expect(cache.get('key6')).toBe('value6');

      // Stats should show eviction
      const stats = cache.getStats();
      expect(stats.evictions).toBe(1);
      expect(stats.size).toBe(5);
    });
  });

  describe('getOrCompute', () => {
    it('should return cached value if exists', async () => {
      cache.set('key1', 'cached');

      const compute = vi.fn().mockResolvedValue('computed');
      const result = await cache.getOrCompute('key1', compute);

      expect(result).toBe('cached');
      expect(compute).not.toHaveBeenCalled();
    });

    it('should compute and cache if not exists', async () => {
      const compute = vi.fn().mockResolvedValue('computed');
      const result = await cache.getOrCompute('key1', compute);

      expect(result).toBe('computed');
      expect(compute).toHaveBeenCalled();
      expect(cache.get('key1')).toBe('computed');
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
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });
  });

  describe('pattern invalidation', () => {
    it('should invalidate entries matching pattern', () => {
      cache.set('user:1', 'data1');
      cache.set('user:2', 'data2');
      cache.set('post:1', 'post1');

      const count = cache.invalidatePattern(/^user:/);

      expect(count).toBe(2);
      expect(cache.get('user:1')).toBeNull();
      expect(cache.get('user:2')).toBeNull();
      expect(cache.get('post:1')).toBe('post1');
    });
  });
});

describe('Global cache helpers', () => {
  beforeEach(() => {
    clearCache();
  });

  it('should work with global cache', () => {
    setCache('test', 'value');
    expect(getCached('test')).toBe('value');
    expect(hasCache('test')).toBe(true);
    expect(deleteCache('test')).toBe(true);
    expect(hasCache('test')).toBe(false);
  });

  it('should support getOrCompute', async () => {
    const result = await getOrCompute('computed', async () => 'computed-value');
    expect(result).toBe('computed-value');
    expect(getCached('computed')).toBe('computed-value');
  });

  it('should provide stats', () => {
    setCache('test', 'value');
    getCached('test'); // hit
    getCached('miss'); // miss

    const stats = getCacheStats();
    expect(stats.hits).toBeGreaterThan(0);
    expect(stats.size).toBe(1);
  });
});

describe('createCache factory', () => {
  it('should create independent cache instances', () => {
    const cache1 = createCache<number>({ maxSize: 10 });
    const cache2 = createCache<number>({ maxSize: 10 });

    cache1.set('key', 1);
    cache2.set('key', 2);

    expect(cache1.get('key')).toBe(1);
    expect(cache2.get('key')).toBe(2);
  });
});
