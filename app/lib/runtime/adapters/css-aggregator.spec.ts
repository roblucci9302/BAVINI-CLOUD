/**
 * =============================================================================
 * BAVINI CLOUD - CSS Aggregator Tests
 * =============================================================================
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CSSAggregator, createCSSAggregator, type CSSEntry, type CSSType } from './css-aggregator';

describe('CSSAggregator', () => {
  let aggregator: CSSAggregator;

  beforeEach(() => {
    aggregator = new CSSAggregator();
  });

  describe('addCSS', () => {
    it('should add a CSS entry', () => {
      aggregator.addCSS({
        source: '/App.vue',
        css: '.app { color: red; }',
        type: 'component',
      });

      expect(aggregator.size).toBe(1);
      expect(aggregator.hasCSS('/App.vue')).toBe(true);
    });

    it('should normalize source paths with leading slash', () => {
      aggregator.addCSS({
        source: 'App.vue',
        css: '.app { color: red; }',
        type: 'component',
      });

      expect(aggregator.hasCSS('/app.vue')).toBe(true);
      expect(aggregator.hasCSS('app.vue')).toBe(true);
    });

    it('should skip empty CSS', () => {
      aggregator.addCSS({
        source: '/empty.vue',
        css: '',
        type: 'component',
      });

      aggregator.addCSS({
        source: '/whitespace.vue',
        css: '   \n  \t  ',
        type: 'component',
      });

      expect(aggregator.size).toBe(0);
    });

    it('should replace existing entry with same source (deduplication)', () => {
      aggregator.addCSS({
        source: '/App.vue',
        css: '.old { color: red; }',
        type: 'component',
      });

      aggregator.addCSS({
        source: '/App.vue',
        css: '.new { color: blue; }',
        type: 'component',
      });

      expect(aggregator.size).toBe(1);

      const entry = aggregator.getCSS('/App.vue');
      expect(entry?.css).toBe('.new { color: blue; }');
    });

    it('should preserve order when updating existing entry', () => {
      aggregator.addCSS({ source: '/first.vue', css: '.first {}', type: 'component' });
      aggregator.addCSS({ source: '/second.vue', css: '.second {}', type: 'component' });
      aggregator.addCSS({ source: '/first.vue', css: '.first-updated {}', type: 'component' });

      const entries = [
        aggregator.getCSS('/first.vue'),
        aggregator.getCSS('/second.vue'),
      ];

      expect(entries[0]?.order).toBeLessThan(entries[1]?.order ?? Infinity);
    });

    it('should store scopeId for scoped styles', () => {
      aggregator.addCSS({
        source: '/Scoped.vue',
        css: '.scoped { color: red; }',
        type: 'component',
        scopeId: 'data-v-abc123',
      });

      const entry = aggregator.getCSS('/Scoped.vue');
      expect(entry?.scopeId).toBe('data-v-abc123');
    });
  });

  describe('removeCSS', () => {
    it('should remove an existing entry', () => {
      aggregator.addCSS({
        source: '/App.vue',
        css: '.app { color: red; }',
        type: 'component',
      });

      const removed = aggregator.removeCSS('/App.vue');

      expect(removed).toBe(true);
      expect(aggregator.size).toBe(0);
      expect(aggregator.hasCSS('/App.vue')).toBe(false);
    });

    it('should return false for non-existent entry', () => {
      const removed = aggregator.removeCSS('/NonExistent.vue');
      expect(removed).toBe(false);
    });
  });

  describe('clear', () => {
    it('should remove all entries', () => {
      aggregator.addCSS({ source: '/a.vue', css: '.a {}', type: 'component' });
      aggregator.addCSS({ source: '/b.vue', css: '.b {}', type: 'component' });
      aggregator.addCSS({ source: '/c.vue', css: '.c {}', type: 'component' });

      aggregator.clear();

      expect(aggregator.size).toBe(0);
    });

    it('should reset order counter', () => {
      aggregator.addCSS({ source: '/a.vue', css: '.a {}', type: 'component' });
      aggregator.clear();
      aggregator.addCSS({ source: '/b.vue', css: '.b {}', type: 'component' });

      const entry = aggregator.getCSS('/b.vue');
      expect(entry?.order).toBe(0);
    });
  });

  describe('aggregate', () => {
    it('should return empty string for no entries', () => {
      expect(aggregator.aggregate()).toBe('');
    });

    it('should aggregate single entry', () => {
      aggregator.addCSS({
        source: '/App.vue',
        css: '.app { color: red; }',
        type: 'component',
      });

      const result = aggregator.aggregate();

      expect(result).toContain('.app { color: red; }');
      expect(result).toContain('/* Source: /app.vue */');
    });

    it('should order by type priority: base → tailwind → component', () => {
      // Add in reverse order to test sorting
      aggregator.addCSS({ source: '/component.vue', css: '.component {}', type: 'component' });
      aggregator.addCSS({ source: '/tailwind.css', css: '.tw-class {}', type: 'tailwind' });
      aggregator.addCSS({ source: '/base.css', css: ':root {}', type: 'base' });

      const result = aggregator.aggregate();

      const baseIndex = result.indexOf(':root {}');
      const tailwindIndex = result.indexOf('.tw-class {}');
      const componentIndex = result.indexOf('.component {}');

      expect(baseIndex).toBeLessThan(tailwindIndex);
      expect(tailwindIndex).toBeLessThan(componentIndex);
    });

    it('should maintain import order within same type', () => {
      aggregator.addCSS({ source: '/first.vue', css: '.first {}', type: 'component' });
      aggregator.addCSS({ source: '/second.vue', css: '.second {}', type: 'component' });
      aggregator.addCSS({ source: '/third.vue', css: '.third {}', type: 'component' });

      const result = aggregator.aggregate();

      const firstIndex = result.indexOf('.first {}');
      const secondIndex = result.indexOf('.second {}');
      const thirdIndex = result.indexOf('.third {}');

      expect(firstIndex).toBeLessThan(secondIndex);
      expect(secondIndex).toBeLessThan(thirdIndex);
    });

    it('should include scopeId in source comment', () => {
      aggregator.addCSS({
        source: '/Scoped.vue',
        css: '.scoped {}',
        type: 'component',
        scopeId: 'data-v-abc123',
      });

      const result = aggregator.aggregate();

      expect(result).toContain('[data-v-abc123]');
    });
  });

  describe('aggregateGrouped', () => {
    it('should group CSS by type', () => {
      aggregator.addCSS({ source: '/base.css', css: ':root { --bg: white; }', type: 'base' });
      aggregator.addCSS({ source: '/globals.css', css: '.btn { padding: 8px; }', type: 'tailwind' });
      aggregator.addCSS({ source: '/App.vue', css: '.app { display: flex; }', type: 'component' });
      aggregator.addCSS({ source: '/Header.vue', css: '.header { height: 60px; }', type: 'component' });

      const grouped = aggregator.aggregateGrouped();

      expect(grouped.base).toContain(':root { --bg: white; }');
      expect(grouped.tailwind).toContain('.btn { padding: 8px; }');
      expect(grouped.components).toContain('.app { display: flex; }');
      expect(grouped.components).toContain('.header { height: 60px; }');
    });

    it('should return empty strings for missing types', () => {
      aggregator.addCSS({ source: '/App.vue', css: '.app {}', type: 'component' });

      const grouped = aggregator.aggregateGrouped();

      expect(grouped.base).toBe('');
      expect(grouped.tailwind).toBe('');
      expect(grouped.components).toContain('.app {}');
    });
  });

  describe('sources', () => {
    it('should return all source paths', () => {
      aggregator.addCSS({ source: '/a.vue', css: '.a {}', type: 'component' });
      aggregator.addCSS({ source: '/b.vue', css: '.b {}', type: 'component' });

      const sources = aggregator.sources;

      expect(sources).toHaveLength(2);
      expect(sources).toContain('/a.vue');
      expect(sources).toContain('/b.vue');
    });
  });

  describe('createCSSAggregator', () => {
    it('should create a new instance', () => {
      const agg1 = createCSSAggregator();
      const agg2 = createCSSAggregator();

      expect(agg1).toBeInstanceOf(CSSAggregator);
      expect(agg2).toBeInstanceOf(CSSAggregator);
      expect(agg1).not.toBe(agg2);
    });
  });

  describe('real-world scenarios', () => {
    it('should handle Vue + Tailwind project correctly', () => {
      // Simulate a Vue project with Tailwind
      aggregator.addCSS({
        source: '/src/index.css',
        css: `
          @tailwind base;
          @tailwind components;
          @tailwind utilities;
          .custom-utility { @apply px-4 py-2; }
        `,
        type: 'tailwind',
      });

      aggregator.addCSS({
        source: '/src/App.vue',
        css: `.app[data-v-app] { min-height: 100vh; }`,
        type: 'component',
        scopeId: 'data-v-app',
      });

      aggregator.addCSS({
        source: '/src/components/Header.vue',
        css: `.header[data-v-header] { position: sticky; top: 0; }`,
        type: 'component',
        scopeId: 'data-v-header',
      });

      const result = aggregator.aggregate();

      // Tailwind should come before components
      expect(result.indexOf('@tailwind')).toBeLessThan(result.indexOf('.app[data-v-app]'));
      expect(result.indexOf('.app[data-v-app]')).toBeLessThan(result.indexOf('.header[data-v-header]'));
    });

    it('should handle HMR scenario (file update)', () => {
      // Initial state
      aggregator.addCSS({
        source: '/App.vue',
        css: '.app { color: red; }',
        type: 'component',
      });

      // Simulate HMR update
      aggregator.addCSS({
        source: '/App.vue',
        css: '.app { color: blue; }',
        type: 'component',
      });

      expect(aggregator.size).toBe(1);
      expect(aggregator.aggregate()).toContain('color: blue');
      expect(aggregator.aggregate()).not.toContain('color: red');
    });

    it('should handle file deletion', () => {
      aggregator.addCSS({ source: '/a.vue', css: '.a {}', type: 'component' });
      aggregator.addCSS({ source: '/b.vue', css: '.b {}', type: 'component' });
      aggregator.addCSS({ source: '/c.vue', css: '.c {}', type: 'component' });

      // Simulate deleting b.vue
      aggregator.removeCSS('/b.vue');

      const result = aggregator.aggregate();

      expect(result).toContain('.a {}');
      expect(result).not.toContain('.b {}');
      expect(result).toContain('.c {}');
    });
  });
});
