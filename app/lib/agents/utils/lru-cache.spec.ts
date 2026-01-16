/**
 * Tests for LRU Cache
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { LRUCache, createFileCache } from './lru-cache';

describe('LRUCache', () => {
  describe('basic operations', () => {
    it('should set and get values', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });

      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');
    });

    it('should return undefined for missing keys', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });
      expect(cache.get('nonexistent')).toBeUndefined();
    });

    it('should update existing keys', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });

      cache.set('key1', 'value1');
      cache.set('key1', 'value2');

      expect(cache.get('key1')).toBe('value2');
      expect(cache.size).toBe(1);
    });

    it('should delete keys', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });

      cache.set('key1', 'value1');
      expect(cache.delete('key1')).toBe(true);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should return false when deleting nonexistent key', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });
      expect(cache.delete('nonexistent')).toBe(false);
    });

    it('should clear all entries', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.clear();

      expect(cache.size).toBe(0);
      expect(cache.get('key1')).toBeUndefined();
    });

    it('should check if key exists with has()', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });

      cache.set('key1', 'value1');

      expect(cache.has('key1')).toBe(true);
      expect(cache.has('nonexistent')).toBe(false);
    });

    it('should return all keys', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      expect(cache.keys()).toContain('key1');
      expect(cache.keys()).toContain('key2');
    });
  });

  describe('LRU eviction', () => {
    it('should evict LRU entry when maxSize is reached', () => {
      const cache = new LRUCache<string>({ maxSize: 3 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4'); // Should evict key1

      expect(cache.size).toBe(3);
      expect(cache.get('key1')).toBeUndefined(); // Evicted
      expect(cache.get('key2')).toBe('value2');
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should update access order on get()', () => {
      const cache = new LRUCache<string>({ maxSize: 3 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');

      // Access key1, making it most recently used
      cache.get('key1');

      // Add key4, should evict key2 (now LRU)
      cache.set('key4', 'value4');

      expect(cache.get('key1')).toBe('value1'); // Still present
      expect(cache.get('key2')).toBeUndefined(); // Evicted
      expect(cache.get('key3')).toBe('value3');
      expect(cache.get('key4')).toBe('value4');
    });

    it('should call onEvict callback', () => {
      const onEvict = vi.fn();
      const cache = new LRUCache<string>({ maxSize: 2, onEvict });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3'); // Triggers eviction

      expect(onEvict).toHaveBeenCalledWith('key1', 'value1');
    });

    it('should track eviction count in stats', () => {
      const cache = new LRUCache<string>({ maxSize: 2 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');
      cache.set('key3', 'value3');
      cache.set('key4', 'value4');

      expect(cache.getStats().evictions).toBe(2);
    });
  });

  describe('TTL (Time To Live)', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should expire entries after TTL', () => {
      const cache = new LRUCache<string>({ maxSize: 10, ttl: 1000 });

      cache.set('key1', 'value1');
      expect(cache.get('key1')).toBe('value1');

      // Advance time past TTL
      vi.advanceTimersByTime(1500);

      expect(cache.get('key1')).toBeUndefined();
    });

    it('should not expire entries before TTL', () => {
      const cache = new LRUCache<string>({ maxSize: 10, ttl: 1000 });

      cache.set('key1', 'value1');

      vi.advanceTimersByTime(500);

      expect(cache.get('key1')).toBe('value1');
    });

    it('should handle has() with TTL', () => {
      const cache = new LRUCache<string>({ maxSize: 10, ttl: 1000 });

      cache.set('key1', 'value1');

      expect(cache.has('key1')).toBe(true);

      vi.advanceTimersByTime(1500);

      expect(cache.has('key1')).toBe(false);
    });

    it('should cleanup expired entries', () => {
      const cache = new LRUCache<string>({ maxSize: 10, ttl: 1000 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      vi.advanceTimersByTime(500);
      cache.set('key3', 'value3');

      vi.advanceTimersByTime(700); // key1 and key2 expired

      const cleaned = cache.cleanup();

      expect(cleaned).toBe(2);
      expect(cache.size).toBe(1);
      expect(cache.get('key3')).toBe('value3');
    });

    it('should return 0 from cleanup when no TTL', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });

      cache.set('key1', 'value1');

      expect(cache.cleanup()).toBe(0);
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });

      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('key2'); // miss
      cache.get('key3'); // miss

      const stats = cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(2);
    });

    it('should calculate hit rate', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });

      cache.set('key1', 'value1');
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('key1'); // hit
      cache.get('key2'); // miss

      expect(cache.getHitRate()).toBe(75);
    });

    it('should return 0 hit rate when no requests', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });
      expect(cache.getHitRate()).toBe(0);
    });

    it('should reset statistics', () => {
      const cache = new LRUCache<string>({ maxSize: 10 });

      cache.set('key1', 'value1');
      cache.get('key1');
      cache.get('key2');

      cache.resetStats();
      const stats = cache.getStats();

      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
      expect(stats.evictions).toBe(0);
    });

    it('should report size and maxSize', () => {
      const cache = new LRUCache<string>({ maxSize: 5 });

      cache.set('key1', 'value1');
      cache.set('key2', 'value2');

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(5);
    });
  });
});

describe('createFileCache', () => {
  it('should create cache with default settings', () => {
    const cache = createFileCache();

    cache.set('file.ts', 'content');
    expect(cache.get('file.ts')).toBe('content');
  });

  it('should create cache with custom maxSize', () => {
    const cache = createFileCache(50);

    expect(cache.getStats().maxSize).toBe(50);
  });

  it('should create cache with custom TTL', () => {
    vi.useFakeTimers();

    const cache = createFileCache(100, 5000);

    cache.set('file.ts', 'content');

    vi.advanceTimersByTime(6000);

    expect(cache.get('file.ts')).toBeUndefined();

    vi.useRealTimers();
  });
});
