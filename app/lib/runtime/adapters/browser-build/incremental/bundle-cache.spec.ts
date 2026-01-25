/**
 * Tests for BundleCache
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BundleCache } from './bundle-cache';

describe('BundleCache', () => {
  let cache: BundleCache;

  beforeEach(() => {
    cache = new BundleCache({
      maxEntries: 10,
      maxMemory: 1024 * 1024, // 1MB
      ttl: 60000, // 1 minute
    });
  });

  describe('setBundle/getBundle', () => {
    it('should store and retrieve a bundle', () => {
      const sourcePath = '/src/App.tsx';
      const sourceContent = 'const App = () => {};';
      const code = 'var App = function() {};';

      cache.setBundle(sourcePath, sourceContent, code);
      const cached = cache.getBundle(sourcePath, sourceContent);

      expect(cached).not.toBeNull();
      expect(cached?.code).toBe(code);
      expect(cached?.sourcePath).toBe(sourcePath);
    });

    it('should return null for uncached bundle', () => {
      const cached = cache.getBundle('/src/NotCached.tsx', 'content');
      expect(cached).toBeNull();
    });

    it('should return null when content changes', () => {
      cache.setBundle('/src/App.tsx', 'content1', 'code1');
      const cached = cache.getBundle('/src/App.tsx', 'content2');
      expect(cached).toBeNull();
    });

    it('should store additional metadata', () => {
      cache.setBundle('/src/App.tsx', 'content', 'code', {
        sourceMap: 'sourcemap',
        css: '.app { color: red; }',
        imports: ['/src/Button.tsx'],
        npmDependencies: ['react'],
      });

      const cached = cache.getBundle('/src/App.tsx', 'content');
      expect(cached?.sourceMap).toBe('sourcemap');
      expect(cached?.css).toBe('.app { color: red; }');
      expect(cached?.imports).toContain('/src/Button.tsx');
      expect(cached?.npmDependencies).toContain('react');
    });
  });

  describe('hasBundle', () => {
    it('should return true for cached bundle', () => {
      cache.setBundle('/src/App.tsx', 'content', 'code');
      expect(cache.hasBundle('/src/App.tsx', 'content')).toBe(true);
    });

    it('should return false for uncached bundle', () => {
      expect(cache.hasBundle('/src/NotCached.tsx', 'content')).toBe(false);
    });

    it('should return false when content changes', () => {
      cache.setBundle('/src/App.tsx', 'content1', 'code');
      expect(cache.hasBundle('/src/App.tsx', 'content2')).toBe(false);
    });
  });

  describe('invalidateBundle', () => {
    it('should remove a bundle from cache', () => {
      cache.setBundle('/src/App.tsx', 'content', 'code');
      cache.invalidateBundle('/src/App.tsx');
      expect(cache.hasBundle('/src/App.tsx', 'content')).toBe(false);
    });

    it('should remove all versions of a file', () => {
      cache.setBundle('/src/App.tsx', 'content1', 'code1');
      cache.setBundle('/src/App.tsx', 'content2', 'code2');
      cache.invalidateBundle('/src/App.tsx');

      expect(cache.hasBundle('/src/App.tsx', 'content1')).toBe(false);
      expect(cache.hasBundle('/src/App.tsx', 'content2')).toBe(false);
    });
  });

  describe('invalidateDependents', () => {
    it('should invalidate bundles that import a file', () => {
      cache.setBundle('/src/Button.tsx', 'button', 'button-code', {
        imports: [],
      });
      cache.setBundle('/src/App.tsx', 'app', 'app-code', {
        imports: ['/src/Button.tsx'],
      });
      cache.setBundle('/src/Other.tsx', 'other', 'other-code', {
        imports: [],
      });

      const invalidated = cache.invalidateDependents('/src/Button.tsx');
      expect(invalidated).toBe(1);
      expect(cache.hasBundle('/src/App.tsx', 'app')).toBe(false);
      expect(cache.hasBundle('/src/Other.tsx', 'other')).toBe(true);
    });
  });

  describe('CSS caching', () => {
    it('should store and retrieve CSS', () => {
      cache.setCSS('/src/styles.css', 'body { margin: 0; }', '.compiled { margin: 0; }');
      const cached = cache.getCSS('/src/styles.css', 'body { margin: 0; }');

      expect(cached).not.toBeNull();
      expect(cached?.css).toBe('.compiled { margin: 0; }');
    });

    it('should clear CSS cache', () => {
      cache.setCSS('/src/styles.css', 'content', 'css');
      cache.clearCSS();
      expect(cache.getCSS('/src/styles.css', 'content')).toBeNull();
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      vi.useFakeTimers();

      cache.setBundle('/src/App.tsx', 'content', 'code');
      expect(cache.getBundle('/src/App.tsx', 'content')).not.toBeNull();

      vi.advanceTimersByTime(70000); // 70 seconds > 60 second TTL

      expect(cache.getBundle('/src/App.tsx', 'content')).toBeNull();

      vi.useRealTimers();
    });
  });

  describe('LRU eviction', () => {
    it('should evict LRU entries when at capacity', () => {
      vi.useFakeTimers();

      // Fill cache to capacity (10 entries) with time gaps
      for (let i = 0; i < 10; i++) {
        cache.setBundle(`/src/File${i}.tsx`, `content${i}`, `code${i}`);
        vi.advanceTimersByTime(10); // 10ms between each
      }

      // Access first file to make it recently used (much later)
      vi.advanceTimersByTime(100);
      cache.getBundle('/src/File0.tsx', 'content0');

      // Add one more to trigger eviction
      vi.advanceTimersByTime(10);
      cache.setBundle('/src/File10.tsx', 'content10', 'code10');

      // File0 should still exist (recently accessed)
      expect(cache.hasBundle('/src/File0.tsx', 'content0')).toBe(true);

      // File1 should be evicted (oldest LRU that wasn't accessed)
      expect(cache.hasBundle('/src/File1.tsx', 'content1')).toBe(false);

      vi.useRealTimers();
    });
  });

  describe('getStats', () => {
    it('should track hits and misses', () => {
      cache.setBundle('/src/App.tsx', 'content', 'code');

      cache.getBundle('/src/App.tsx', 'content'); // hit
      cache.getBundle('/src/App.tsx', 'content'); // hit
      cache.getBundle('/src/NotFound.tsx', 'x'); // miss

      const stats = cache.getStats();
      expect(stats.hits).toBe(2);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBeCloseTo(66.67, 1);
    });

    it('should track entries count', () => {
      cache.setBundle('/src/A.tsx', 'a', 'code-a');
      cache.setBundle('/src/B.tsx', 'b', 'code-b');

      const stats = cache.getStats();
      expect(stats.entries).toBe(2);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      cache.setBundle('/src/A.tsx', 'a', 'code-a');
      cache.setBundle('/src/B.tsx', 'b', 'code-b');
      cache.setCSS('/src/styles.css', 'css', 'compiled');

      cache.clear();

      expect(cache.getStats().entries).toBe(0);
      expect(cache.hasBundle('/src/A.tsx', 'a')).toBe(false);
      expect(cache.getCSS('/src/styles.css', 'css')).toBeNull();
    });
  });

  describe('getCachedPaths', () => {
    it('should return all cached file paths', () => {
      cache.setBundle('/src/A.tsx', 'a', 'code-a');
      cache.setBundle('/src/B.tsx', 'b', 'code-b');

      const paths = cache.getCachedPaths();
      expect(paths).toContain('/src/A.tsx');
      expect(paths).toContain('/src/B.tsx');
    });
  });
});
