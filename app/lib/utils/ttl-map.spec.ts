import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { TTLMap, TTLMapPresets } from './ttl-map';

describe('TTLMap', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      map.set('key1', 42);
      expect(map.get('key1')).toBe(42);
      map.dispose();
    });

    it('should return undefined for non-existent keys', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      expect(map.get('nonexistent')).toBeUndefined();
      map.dispose();
    });

    it('should check key existence with has()', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      map.set('key1', 42);
      expect(map.has('key1')).toBe(true);
      expect(map.has('key2')).toBe(false);
      map.dispose();
    });

    it('should delete entries', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      map.set('key1', 42);
      expect(map.delete('key1')).toBe(true);
      expect(map.has('key1')).toBe(false);
      expect(map.delete('key1')).toBe(false);
      map.dispose();
    });

    it('should clear all entries', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      map.set('key1', 1);
      map.set('key2', 2);
      map.clear();
      expect(map.size).toBe(0);
      map.dispose();
    });

    it('should report correct size', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      expect(map.size).toBe(0);
      map.set('key1', 1);
      expect(map.size).toBe(1);
      map.set('key2', 2);
      expect(map.size).toBe(2);
      map.dispose();
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        cleanupIntervalMs: 10000, // Disable auto cleanup
        name: 'test',
      });

      map.set('key1', 42);
      expect(map.get('key1')).toBe(42);

      vi.advanceTimersByTime(1001);

      expect(map.get('key1')).toBeUndefined();
      map.dispose();
    });

    it('should not expire entries before TTL', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('key1', 42);
      vi.advanceTimersByTime(999);
      expect(map.get('key1')).toBe(42);
      map.dispose();
    });

    it('should use custom TTL per entry', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('short', 1, 500);
      map.set('long', 2, 2000);

      vi.advanceTimersByTime(600);
      expect(map.get('short')).toBeUndefined();
      expect(map.get('long')).toBe(2);

      vi.advanceTimersByTime(1500);
      expect(map.get('long')).toBeUndefined();
      map.dispose();
    });

    it('should call onExpire callback when entry expires', () => {
      const onExpire = vi.fn();
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        cleanupIntervalMs: 10000,
        name: 'test',
        onExpire,
      });

      map.set('key1', 42);
      vi.advanceTimersByTime(1001);
      map.get('key1'); // Trigger expiration check

      expect(onExpire).toHaveBeenCalledWith('key1', 42);
      map.dispose();
    });
  });

  describe('touchOnGet', () => {
    it('should extend TTL when touchOnGet is true', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        touchOnGet: true,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('key1', 42);
      vi.advanceTimersByTime(800);
      expect(map.get('key1')).toBe(42); // This should extend TTL

      vi.advanceTimersByTime(800);
      expect(map.get('key1')).toBe(42); // Still valid

      vi.advanceTimersByTime(1001);
      expect(map.get('key1')).toBeUndefined();
      map.dispose();
    });

    it('should not extend TTL when touchOnGet is false', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        touchOnGet: false,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('key1', 42);
      vi.advanceTimersByTime(800);
      map.get('key1');

      vi.advanceTimersByTime(300);
      expect(map.get('key1')).toBeUndefined();
      map.dispose();
    });
  });

  describe('touch method', () => {
    it('should manually extend TTL', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('key1', 42);
      vi.advanceTimersByTime(800);
      expect(map.touch('key1')).toBe(true);

      vi.advanceTimersByTime(800);
      expect(map.get('key1')).toBe(42);
      map.dispose();
    });

    it('should return false for non-existent keys', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      expect(map.touch('nonexistent')).toBe(false);
      map.dispose();
    });

    it('should return false for expired keys', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('key1', 42);
      vi.advanceTimersByTime(1001);
      expect(map.touch('key1')).toBe(false);
      map.dispose();
    });
  });

  describe('getTTL', () => {
    it('should return remaining TTL', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('key1', 42);
      vi.advanceTimersByTime(400);

      const remaining = map.getTTL('key1');
      expect(remaining).toBeLessThanOrEqual(600);
      expect(remaining).toBeGreaterThan(0);
      map.dispose();
    });

    it('should return null for expired keys', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('key1', 42);
      vi.advanceTimersByTime(1001);

      expect(map.getTTL('key1')).toBeNull();
      map.dispose();
    });

    it('should return null for non-existent keys', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      expect(map.getTTL('nonexistent')).toBeNull();
      map.dispose();
    });
  });

  describe('maxSize and LRU eviction', () => {
    it('should evict oldest entry when at max size', () => {
      const map = new TTLMap<string, number>({
        maxSize: 2,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('key1', 1);
      vi.advanceTimersByTime(10);
      map.set('key2', 2);
      vi.advanceTimersByTime(10);
      map.set('key3', 3);

      expect(map.size).toBe(2);
      expect(map.get('key1')).toBeUndefined();
      expect(map.get('key2')).toBe(2);
      expect(map.get('key3')).toBe(3);
      map.dispose();
    });

    it('should not evict when updating existing key', () => {
      const map = new TTLMap<string, number>({
        maxSize: 2,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('key1', 1);
      map.set('key2', 2);
      map.set('key1', 10); // Update existing

      expect(map.size).toBe(2);
      expect(map.get('key1')).toBe(10);
      expect(map.get('key2')).toBe(2);
      map.dispose();
    });
  });

  describe('iterators', () => {
    it('should iterate over entries', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      map.set('a', 1);
      map.set('b', 2);

      const entries = Array.from(map.entries());
      expect(entries).toHaveLength(2);
      expect(entries).toContainEqual(['a', 1]);
      expect(entries).toContainEqual(['b', 2]);
      map.dispose();
    });

    it('should iterate over keys', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      map.set('a', 1);
      map.set('b', 2);

      const keys = Array.from(map.keys());
      expect(keys).toHaveLength(2);
      expect(keys).toContain('a');
      expect(keys).toContain('b');
      map.dispose();
    });

    it('should iterate over values', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      map.set('a', 1);
      map.set('b', 2);

      const values = Array.from(map.values());
      expect(values).toHaveLength(2);
      expect(values).toContain(1);
      expect(values).toContain(2);
      map.dispose();
    });

    it('should support for...of iteration', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      map.set('a', 1);
      map.set('b', 2);

      const entries: [string, number][] = [];
      for (const entry of map) {
        entries.push(entry);
      }

      expect(entries).toHaveLength(2);
      map.dispose();
    });

    it('should skip expired entries during iteration', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('a', 1, 500);
      map.set('b', 2, 2000);

      vi.advanceTimersByTime(600);

      const entries = Array.from(map.entries());
      expect(entries).toHaveLength(1);
      expect(entries[0]).toEqual(['b', 2]);
      map.dispose();
    });
  });

  describe('cleanup', () => {
    it('should run automatic cleanup', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        cleanupIntervalMs: 500,
        name: 'test',
      });

      map.set('key1', 42);
      vi.advanceTimersByTime(1001);
      vi.advanceTimersByTime(500); // Trigger cleanup interval

      // Entry should be cleaned up
      expect(map.size).toBe(0);
      map.dispose();
    });

    it('should return count of cleaned entries', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('a', 1);
      map.set('b', 2);
      map.set('c', 3);

      vi.advanceTimersByTime(1001);

      const cleanedCount = map.cleanup();
      expect(cleanedCount).toBe(3);
      map.dispose();
    });
  });

  describe('statistics', () => {
    it('should track hits and misses', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      map.set('key1', 42);

      map.get('key1'); // hit
      map.get('key1'); // hit
      map.get('key2'); // miss
      map.get('key3'); // miss

      const stats = map.getStats();
      expect(stats.hitCount).toBe(2);
      expect(stats.missCount).toBe(2);
      map.dispose();
    });

    it('should track expired and evicted counts', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        maxSize: 2,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('a', 1);
      vi.advanceTimersByTime(10);
      map.set('b', 2);
      vi.advanceTimersByTime(10);
      map.set('c', 3); // Evicts 'a'

      vi.advanceTimersByTime(1001);
      map.get('b'); // Expired

      const stats = map.getStats();
      expect(stats.evictedCount).toBe(1);
      expect(stats.expiredCount).toBe(1);
      map.dispose();
    });

    it('should reset statistics', () => {
      const map = new TTLMap<string, number>({ name: 'test' });
      map.set('key1', 42);
      map.get('key1');
      map.get('missing');

      map.resetStats();
      const stats = map.getStats();
      expect(stats.hitCount).toBe(0);
      expect(stats.missCount).toBe(0);
      map.dispose();
    });
  });

  describe('metadata', () => {
    it('should return entry metadata', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 5000,
        name: 'test',
      });

      map.set('key1', 42);
      vi.advanceTimersByTime(100);
      map.get('key1');

      const metadata = map.getMetadata('key1');
      expect(metadata).toBeDefined();
      expect(metadata?.accessCount).toBe(1);
      map.dispose();
    });

    it('should return undefined for expired entries', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        cleanupIntervalMs: 10000,
        name: 'test',
      });

      map.set('key1', 42);
      vi.advanceTimersByTime(1001);

      expect(map.getMetadata('key1')).toBeUndefined();
      map.dispose();
    });
  });

  describe('dispose', () => {
    it('should stop cleanup timer and clear entries', () => {
      const map = new TTLMap<string, number>({
        ttlMs: 1000,
        cleanupIntervalMs: 100,
        name: 'test',
      });

      map.set('key1', 42);
      map.dispose();

      expect(map.size).toBe(0);
    });
  });

  describe('presets', () => {
    it('should create shortCache preset', () => {
      const map = TTLMapPresets.shortCache<string, number>('test');
      const stats = map.getStats();
      expect(stats.ttlMs).toBe(5 * 60 * 1000);
      expect(stats.maxSize).toBe(100);
      map.dispose();
    });

    it('should create sessionStore preset', () => {
      const map = TTLMapPresets.sessionStore<string, number>('test');
      const stats = map.getStats();
      expect(stats.ttlMs).toBe(30 * 60 * 1000);
      expect(stats.maxSize).toBe(1000);
      map.dispose();
    });

    it('should create longStore preset', () => {
      const map = TTLMapPresets.longStore<string, number>('test');
      const stats = map.getStats();
      expect(stats.ttlMs).toBe(24 * 60 * 60 * 1000);
      map.dispose();
    });

    it('should create taskResults preset', () => {
      const map = TTLMapPresets.taskResults<string, number>('test');
      const stats = map.getStats();
      expect(stats.ttlMs).toBe(60 * 60 * 1000);
      expect(stats.maxSize).toBe(10000);
      map.dispose();
    });
  });
});
