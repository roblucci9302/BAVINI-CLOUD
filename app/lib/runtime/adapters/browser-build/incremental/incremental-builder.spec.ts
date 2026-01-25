/**
 * Tests for IncrementalBuilder
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { IncrementalBuilder, resetIncrementalBuilder, getIncrementalBuilder } from './incremental-builder';
import { DependencyGraph } from './dependency-graph';
import { BundleCache, resetBundleCache } from './bundle-cache';

describe('IncrementalBuilder', () => {
  let builder: IncrementalBuilder;

  beforeEach(() => {
    // Reset singletons for clean tests
    resetIncrementalBuilder();
    resetBundleCache();
    builder = new IncrementalBuilder();
  });

  describe('analyzeChanges', () => {
    it('should detect first build as full rebuild', () => {
      const files = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
        ['/src/index.tsx', 'import App from "./App";'],
      ]);

      const analysis = builder.analyzeChanges(files);

      expect(analysis.requiresFullRebuild).toBe(true);
      expect(analysis.fullRebuildReason).toContain('First build');
      expect(analysis.added.length).toBe(2);
    });

    it('should detect added files', () => {
      // First build
      const files1 = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
      ]);
      builder.analyzeChanges(files1);

      // Second build with new file
      const files2 = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
        ['/src/Button.tsx', 'const Button = () => {};'],
      ]);
      const analysis = builder.analyzeChanges(files2);

      expect(analysis.requiresFullRebuild).toBe(false);
      expect(analysis.added).toContain('/src/Button.tsx');
      expect(analysis.modified.length).toBe(0);
    });

    it('should detect modified files', () => {
      const files1 = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
      ]);
      builder.analyzeChanges(files1);

      const files2 = new Map([
        ['/src/App.tsx', 'const App = () => { return <div>Updated</div>; };'],
      ]);
      const analysis = builder.analyzeChanges(files2);

      expect(analysis.requiresFullRebuild).toBe(false);
      expect(analysis.modified).toContain('/src/App.tsx');
    });

    it('should detect deleted files', () => {
      const files1 = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
        ['/src/Button.tsx', 'const Button = () => {};'],
      ]);
      builder.analyzeChanges(files1);

      const files2 = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
      ]);
      const analysis = builder.analyzeChanges(files2);

      expect(analysis.deleted).toContain('/src/Button.tsx');
    });

    it('should require full rebuild when package.json changes', () => {
      const files1 = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
        ['/package.json', '{"dependencies": {"react": "18.0.0"}}'],
      ]);
      builder.analyzeChanges(files1);

      const files2 = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
        ['/package.json', '{"dependencies": {"react": "19.0.0"}}'],
      ]);
      const analysis = builder.analyzeChanges(files2);

      expect(analysis.requiresFullRebuild).toBe(true);
      expect(analysis.fullRebuildReason).toContain('NPM dependencies changed');
    });

    it('should require full rebuild when config file changes', () => {
      const files1 = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
        ['/tsconfig.json', '{"compilerOptions": {}}'],
      ]);
      builder.analyzeChanges(files1);

      const files2 = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
        ['/tsconfig.json', '{"compilerOptions": {"strict": true}}'],
      ]);
      const analysis = builder.analyzeChanges(files2);

      expect(analysis.requiresFullRebuild).toBe(true);
      expect(analysis.fullRebuildReason).toContain('Config file modified');
    });
  });

  describe('getBuildDecisions', () => {
    it('should mark all files for rebuild on full rebuild', () => {
      const files = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
        ['/src/Button.tsx', 'const Button = () => {};'],
      ]);

      const analysis = builder.analyzeChanges(files);
      const decisions = builder.getBuildDecisions(files, analysis);

      expect(decisions.get('/src/App.tsx')?.rebuild).toBe(true);
      expect(decisions.get('/src/Button.tsx')?.rebuild).toBe(true);
    });

    it('should use cached bundles for unchanged files', () => {
      // Setup: First build
      const files1 = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
        ['/src/Button.tsx', 'const Button = () => {};'],
      ]);
      builder.analyzeChanges(files1);

      // Cache the bundles
      builder.cacheBundle('/src/App.tsx', 'const App = () => {};', 'var App = function(){};');
      builder.cacheBundle('/src/Button.tsx', 'const Button = () => {};', 'var Button = function(){};');

      // Second build with only Button changed
      const files2 = new Map([
        ['/src/App.tsx', 'const App = () => {};'], // unchanged
        ['/src/Button.tsx', 'const Button = () => { return <button />; };'], // changed
      ]);
      const analysis = builder.analyzeChanges(files2);
      const decisions = builder.getBuildDecisions(files2, analysis);

      // App should use cache
      expect(decisions.get('/src/App.tsx')?.rebuild).toBe(false);
      expect(decisions.get('/src/App.tsx')?.reason).toBe('cached');
      expect(decisions.get('/src/App.tsx')?.cachedCode).toBe('var App = function(){};');

      // Button needs rebuild
      expect(decisions.get('/src/Button.tsx')?.rebuild).toBe(true);
    });

    it('should mark deleted files appropriately', () => {
      const files1 = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
        ['/src/OldFile.tsx', 'const OldFile = () => {};'],
      ]);
      builder.analyzeChanges(files1);

      const files2 = new Map([
        ['/src/App.tsx', 'const App = () => {};'],
      ]);
      const analysis = builder.analyzeChanges(files2);
      const decisions = builder.getBuildDecisions(files2, analysis);

      expect(decisions.get('/src/OldFile.tsx')?.rebuild).toBe(false);
      expect(decisions.get('/src/OldFile.tsx')?.reason).toBe('deleted');
    });
  });

  describe('updateDependencyGraph', () => {
    it('should track file dependencies', () => {
      builder.updateDependencyGraph(
        '/src/App.tsx',
        'import Button from "./Button";',
        ['/src/Button.tsx'],
        ['react']
      );

      const graph = builder.dependencyGraph;
      expect(graph.hasFile('/src/App.tsx')).toBe(true);
      expect(graph.getImports('/src/App.tsx')).toContain('/src/Button.tsx');
      expect(graph.getNpmDependencies('/src/App.tsx')).toContain('react');
    });
  });

  describe('cacheBundle', () => {
    it('should store and retrieve cached bundles', () => {
      const source = 'const App = () => {};';
      const code = 'var App = function(){};';

      builder.cacheBundle('/src/App.tsx', source, code, { css: '.app {}' });

      const cached = builder.bundleCache.getBundle('/src/App.tsx', source);
      expect(cached).not.toBeNull();
      expect(cached?.code).toBe(code);
      expect(cached?.css).toBe('.app {}');
    });
  });

  describe('invalidateFile', () => {
    it('should invalidate file and its dependents', () => {
      // Cache some bundles
      builder.cacheBundle('/src/Button.tsx', 'button', 'button-code');
      builder.cacheBundle('/src/App.tsx', 'app', 'app-code', { imports: ['/src/Button.tsx'] });

      // Invalidate Button
      builder.invalidateFile('/src/Button.tsx');

      // Both should be invalidated
      expect(builder.bundleCache.hasBundle('/src/Button.tsx', 'button')).toBe(false);
      expect(builder.bundleCache.hasBundle('/src/App.tsx', 'app')).toBe(false);
    });
  });

  describe('completeBuild', () => {
    it('should update metrics correctly', () => {
      builder.completeBuild(5, 10, false);

      const metrics = builder.getMetrics();
      expect(metrics.totalFiles).toBe(15);
      expect(metrics.rebuiltFiles).toBe(5);
      expect(metrics.cachedFiles).toBe(10);
      expect(metrics.cacheHitRate).toBeCloseTo(66.67, 1);
      expect(metrics.wasFullRebuild).toBe(false);
    });

    it('should mark full rebuild in metrics', () => {
      builder.completeBuild(20, 0, true);

      const metrics = builder.getMetrics();
      expect(metrics.wasFullRebuild).toBe(true);
      expect(metrics.cacheHitRate).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return combined statistics', () => {
      builder.cacheBundle('/src/App.tsx', 'app', 'code');
      builder.updateDependencyGraph('/src/App.tsx', 'app', [], ['react']);
      builder.completeBuild(1, 0, true);

      const stats = builder.getStats();

      expect(stats.metrics).toBeDefined();
      expect(stats.cache).toBeDefined();
      expect(stats.graph).toBeDefined();
      expect(stats.graph.totalNpmDeps).toBe(1);
    });
  });

  describe('reset', () => {
    it('should clear all state', () => {
      builder.cacheBundle('/src/App.tsx', 'app', 'code');
      builder.updateDependencyGraph('/src/App.tsx', 'app', [], ['react']);
      builder.analyzeChanges(new Map([['/src/App.tsx', 'app']]));

      builder.reset();

      expect(builder.bundleCache.getStats().entries).toBe(0);
      expect(builder.dependencyGraph.size).toBe(0);
      expect(builder.getMetrics().totalFiles).toBe(0);
    });
  });

  describe('singleton', () => {
    it('should return same instance from getIncrementalBuilder', () => {
      resetIncrementalBuilder();

      const instance1 = getIncrementalBuilder();
      const instance2 = getIncrementalBuilder();

      expect(instance1).toBe(instance2);
    });

    it('should reset singleton correctly', () => {
      const instance1 = getIncrementalBuilder();
      instance1.cacheBundle('/test', 'test', 'code');

      resetIncrementalBuilder();

      const instance2 = getIncrementalBuilder();
      expect(instance2.bundleCache.getStats().entries).toBe(0);
    });
  });
});
