/**
 * =============================================================================
 * BAVINI Runtime Engine - SSR Cache Tests
 * =============================================================================
 */

import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import {
  SSRCache,
  createSSRCache,
  getSharedSSRCache,
  resetSharedSSRCache,
} from './ssr-cache';

describe('SSRCache', () => {
  let cache: SSRCache;

  beforeEach(() => {
    cache = createSSRCache({ maxSize: 10, ttlMs: 1000 });
  });

  afterEach(() => {
    resetSharedSSRCache();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve cached content', () => {
      const key = cache.generateKey('/page.astro', { title: 'Test' });
      const content = { html: '<div>Test</div>', css: '.test{}', head: '<title>Test</title>' };

      cache.set(key, content);
      const result = cache.get(key);

      expect(result).toEqual(content);
    });

    it('should return null for missing keys', () => {
      const result = cache.get('nonexistent');
      expect(result).toBeNull();
    });

    it('should check if key exists', () => {
      const key = 'test-key';
      expect(cache.has(key)).toBe(false);

      cache.set(key, { html: 'test', css: '', head: '' });
      expect(cache.has(key)).toBe(true);
    });

    it('should invalidate specific entry', () => {
      const key = 'test-key';
      cache.set(key, { html: 'test', css: '', head: '' });

      const deleted = cache.invalidate(key);

      expect(deleted).toBe(true);
      expect(cache.has(key)).toBe(false);
    });

    it('should clear all entries', () => {
      cache.set('key1', { html: 'test1', css: '', head: '' });
      cache.set('key2', { html: 'test2', css: '', head: '' });

      cache.clear();

      expect(cache.size).toBe(0);
    });
  });

  describe('Key Generation', () => {
    it('should generate consistent keys for same input', () => {
      const key1 = cache.generateKey('/page.astro', { a: 1, b: 2 });
      const key2 = cache.generateKey('/page.astro', { a: 1, b: 2 });

      expect(key1).toBe(key2);
    });

    it('should generate different keys for different props', () => {
      const key1 = cache.generateKey('/page.astro', { a: 1 });
      const key2 = cache.generateKey('/page.astro', { a: 2 });

      expect(key1).not.toBe(key2);
    });

    it('should include code hash when provided', () => {
      const key1 = cache.generateKey('/page.astro', {}, 'code1');
      const key2 = cache.generateKey('/page.astro', {}, 'code2');

      expect(key1).not.toBe(key2);
    });
  });

  describe('TTL Expiration', () => {
    it('should expire entries after TTL', async () => {
      const shortCache = createSSRCache({ ttlMs: 50 });
      const key = 'test-key';

      shortCache.set(key, { html: 'test', css: '', head: '' });
      expect(shortCache.get(key)).not.toBeNull();

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shortCache.get(key)).toBeNull();
    });

    it('should not return expired entries with has()', async () => {
      const shortCache = createSSRCache({ ttlMs: 50 });
      const key = 'test-key';

      shortCache.set(key, { html: 'test', css: '', head: '' });

      await new Promise((resolve) => setTimeout(resolve, 100));

      expect(shortCache.has(key)).toBe(false);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict oldest entries when full', () => {
      const smallCache = createSSRCache({ maxSize: 3 });

      smallCache.set('key1', { html: '1', css: '', head: '' });
      smallCache.set('key2', { html: '2', css: '', head: '' });
      smallCache.set('key3', { html: '3', css: '', head: '' });
      smallCache.set('key4', { html: '4', css: '', head: '' });

      expect(smallCache.size).toBe(3);
      expect(smallCache.get('key1')).toBeNull(); // Evicted
      expect(smallCache.get('key4')).not.toBeNull(); // Still there
    });

    it('should update access time on get', () => {
      const smallCache = createSSRCache({ maxSize: 3 });

      smallCache.set('key1', { html: '1', css: '', head: '' });
      smallCache.set('key2', { html: '2', css: '', head: '' });
      smallCache.set('key3', { html: '3', css: '', head: '' });

      // Access key1 to make it "recently used"
      smallCache.get('key1');

      // Add new entry, should evict key2 (oldest non-accessed)
      smallCache.set('key4', { html: '4', css: '', head: '' });

      expect(smallCache.get('key1')).not.toBeNull(); // Still there
      expect(smallCache.get('key2')).toBeNull(); // Evicted
    });
  });

  describe('Pattern Invalidation', () => {
    it('should invalidate entries matching pattern', () => {
      cache.set('/pages/home:hash1', { html: 'home', css: '', head: '' });
      cache.set('/pages/about:hash2', { html: 'about', css: '', head: '' });
      cache.set('/api/data:hash3', { html: 'data', css: '', head: '' });

      const count = cache.invalidatePattern(/^\/pages\//);

      expect(count).toBe(2);
      expect(cache.has('/api/data:hash3')).toBe(true);
    });

    it('should invalidate entries for component', () => {
      cache.set('/page.astro:hash1:props1', { html: '1', css: '', head: '' });
      cache.set('/page.astro:hash1:props2', { html: '2', css: '', head: '' });
      cache.set('/other.astro:hash2:props1', { html: '3', css: '', head: '' });

      const count = cache.invalidateComponent('/page.astro');

      expect(count).toBe(2);
      expect(cache.has('/other.astro:hash2:props1')).toBe(true);
    });
  });

  describe('Statistics', () => {
    it('should track hits and misses', () => {
      cache.set('key1', { html: 'test', css: '', head: '' });

      cache.get('key1'); // Hit
      cache.get('key1'); // Hit
      cache.get('key2'); // Miss

      const stats = cache.getStats();

      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(2 / 3);
    });

    it('should report size and maxSize', () => {
      cache.set('key1', { html: '1', css: '', head: '' });
      cache.set('key2', { html: '2', css: '', head: '' });

      const stats = cache.getStats();

      expect(stats.size).toBe(2);
      expect(stats.maxSize).toBe(10);
    });
  });

  describe('Pruning', () => {
    it('should prune expired entries', async () => {
      const shortCache = createSSRCache({ ttlMs: 50 });

      shortCache.set('key1', { html: '1', css: '', head: '' });

      await new Promise((resolve) => setTimeout(resolve, 100));

      shortCache.set('key2', { html: '2', css: '', head: '' });

      const pruned = shortCache.prune();

      expect(pruned).toBe(1);
      expect(shortCache.size).toBe(1);
    });
  });
});

describe('Shared SSRCache', () => {
  afterEach(() => {
    resetSharedSSRCache();
  });

  it('should return same instance', () => {
    const cache1 = getSharedSSRCache();
    const cache2 = getSharedSSRCache();

    expect(cache1).toBe(cache2);
  });

  it('should reset shared instance', () => {
    const cache1 = getSharedSSRCache();
    cache1.set('test', { html: 'test', css: '', head: '' });

    resetSharedSSRCache();

    const cache2 = getSharedSSRCache();
    expect(cache2.get('test')).toBeNull();
  });
});
