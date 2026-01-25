/**
 * Tests for DependencyGraph
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph, hashContent } from './dependency-graph';

describe('DependencyGraph', () => {
  let graph: DependencyGraph;

  beforeEach(() => {
    graph = new DependencyGraph();
  });

  describe('hashContent', () => {
    it('should return consistent hashes for same content', () => {
      const content = 'const x = 1;';
      expect(hashContent(content)).toBe(hashContent(content));
    });

    it('should return different hashes for different content', () => {
      expect(hashContent('const x = 1;')).not.toBe(hashContent('const x = 2;'));
    });

    it('should handle empty strings', () => {
      expect(hashContent('')).toBeDefined();
    });
  });

  describe('addFile', () => {
    it('should add a file to the graph', () => {
      graph.addFile('/src/App.tsx', 'const App = () => {};', ['/src/Button.tsx']);
      expect(graph.hasFile('/src/App.tsx')).toBe(true);
      expect(graph.size).toBe(2); // App.tsx + Button.tsx placeholder
    });

    it('should track imports', () => {
      graph.addFile('/src/App.tsx', 'content', ['/src/Button.tsx', '/src/Header.tsx']);
      expect(graph.getImports('/src/App.tsx')).toContain('/src/Button.tsx');
      expect(graph.getImports('/src/App.tsx')).toContain('/src/Header.tsx');
    });

    it('should track reverse dependencies', () => {
      graph.addFile('/src/App.tsx', 'content', ['/src/Button.tsx']);
      expect(graph.getDependents('/src/Button.tsx')).toContain('/src/App.tsx');
    });

    it('should track npm dependencies', () => {
      graph.addFile('/src/App.tsx', 'content', [], ['react', 'react-dom']);
      expect(graph.getNpmDependencies('/src/App.tsx')).toContain('react');
      expect(graph.getNpmDependencies('/src/App.tsx')).toContain('react-dom');
    });

    it('should update imports when file is re-added', () => {
      graph.addFile('/src/App.tsx', 'content1', ['/src/Button.tsx']);
      graph.addFile('/src/App.tsx', 'content2', ['/src/Header.tsx']);

      expect(graph.getImports('/src/App.tsx')).toContain('/src/Header.tsx');
      expect(graph.getImports('/src/App.tsx')).not.toContain('/src/Button.tsx');
      expect(graph.getDependents('/src/Button.tsx')).not.toContain('/src/App.tsx');
    });
  });

  describe('removeFile', () => {
    it('should remove a file from the graph', () => {
      graph.addFile('/src/App.tsx', 'content', []);
      graph.removeFile('/src/App.tsx');
      expect(graph.hasFile('/src/App.tsx')).toBe(false);
    });

    it('should clean up import relationships', () => {
      graph.addFile('/src/App.tsx', 'content', ['/src/Button.tsx']);
      graph.addFile('/src/Button.tsx', 'button content', []);
      graph.removeFile('/src/App.tsx');

      expect(graph.getDependents('/src/Button.tsx')).not.toContain('/src/App.tsx');
    });
  });

  describe('hasFileChanged', () => {
    it('should return true for new files', () => {
      expect(graph.hasFileChanged('/src/App.tsx', 'content')).toBe(true);
    });

    it('should return false for unchanged content', () => {
      graph.addFile('/src/App.tsx', 'content', []);
      expect(graph.hasFileChanged('/src/App.tsx', 'content')).toBe(false);
    });

    it('should return true for changed content', () => {
      graph.addFile('/src/App.tsx', 'content', []);
      expect(graph.hasFileChanged('/src/App.tsx', 'new content')).toBe(true);
    });
  });

  describe('getAffectedFiles', () => {
    it('should return the changed file itself', () => {
      graph.addFile('/src/App.tsx', 'content', []);
      const affected = graph.getAffectedFiles('/src/App.tsx');
      expect(affected.has('/src/App.tsx')).toBe(true);
    });

    it('should return direct dependents', () => {
      graph.addFile('/src/Button.tsx', 'button', []);
      graph.addFile('/src/App.tsx', 'app', ['/src/Button.tsx']);

      const affected = graph.getAffectedFiles('/src/Button.tsx');
      expect(affected.has('/src/Button.tsx')).toBe(true);
      expect(affected.has('/src/App.tsx')).toBe(true);
    });

    it('should return transitive dependents', () => {
      graph.addFile('/src/utils.ts', 'utils', []);
      graph.addFile('/src/Button.tsx', 'button', ['/src/utils.ts']);
      graph.addFile('/src/App.tsx', 'app', ['/src/Button.tsx']);

      const affected = graph.getAffectedFiles('/src/utils.ts');
      expect(affected.has('/src/utils.ts')).toBe(true);
      expect(affected.has('/src/Button.tsx')).toBe(true);
      expect(affected.has('/src/App.tsx')).toBe(true);
    });

    it('should handle circular dependencies', () => {
      graph.addFile('/src/A.tsx', 'a', ['/src/B.tsx']);
      graph.addFile('/src/B.tsx', 'b', ['/src/A.tsx']);

      const affected = graph.getAffectedFiles('/src/A.tsx');
      expect(affected.size).toBe(2);
    });
  });

  describe('getAffectedFilesForChanges', () => {
    it('should combine affected files from multiple changes', () => {
      graph.addFile('/src/utils.ts', 'utils', []);
      graph.addFile('/src/helpers.ts', 'helpers', []);
      graph.addFile('/src/Button.tsx', 'button', ['/src/utils.ts']);
      graph.addFile('/src/Card.tsx', 'card', ['/src/helpers.ts']);

      const affected = graph.getAffectedFilesForChanges(['/src/utils.ts', '/src/helpers.ts']);
      expect(affected.has('/src/utils.ts')).toBe(true);
      expect(affected.has('/src/Button.tsx')).toBe(true);
      expect(affected.has('/src/helpers.ts')).toBe(true);
      expect(affected.has('/src/Card.tsx')).toBe(true);
    });
  });

  describe('getAllNpmDependencies', () => {
    it('should return all unique npm dependencies', () => {
      graph.addFile('/src/App.tsx', 'app', [], ['react', 'react-dom']);
      graph.addFile('/src/Button.tsx', 'button', [], ['react', 'classnames']);

      const deps = graph.getAllNpmDependencies();
      expect(deps.has('react')).toBe(true);
      expect(deps.has('react-dom')).toBe(true);
      expect(deps.has('classnames')).toBe(true);
      expect(deps.size).toBe(3);
    });
  });

  describe('hasNpmDependenciesChanged', () => {
    it('should return true when dependencies are added', () => {
      graph.addFile('/src/App.tsx', 'app', [], ['react']);
      expect(graph.hasNpmDependenciesChanged(new Set(['react', 'lodash']))).toBe(true);
    });

    it('should return true when dependencies are removed', () => {
      graph.addFile('/src/App.tsx', 'app', [], ['react', 'lodash']);
      expect(graph.hasNpmDependenciesChanged(new Set(['react']))).toBe(true);
    });

    it('should return false when dependencies are unchanged', () => {
      graph.addFile('/src/App.tsx', 'app', [], ['react']);
      expect(graph.hasNpmDependenciesChanged(new Set(['react']))).toBe(false);
    });
  });

  describe('getEntryPoints', () => {
    it('should return files with no dependents', () => {
      graph.addFile('/src/Button.tsx', 'button', []);
      graph.addFile('/src/App.tsx', 'app', ['/src/Button.tsx']);

      const entries = graph.getEntryPoints();
      expect(entries).toContain('/src/App.tsx');
      expect(entries).not.toContain('/src/Button.tsx');
    });
  });

  describe('serialize/deserialize', () => {
    it('should serialize and deserialize the graph', () => {
      graph.addFile('/src/Button.tsx', 'button', [], ['react']);
      graph.addFile('/src/App.tsx', 'app', ['/src/Button.tsx'], ['react', 'react-dom']);
      graph.markBuildComplete();

      const serialized = graph.serialize();
      const restored = DependencyGraph.deserialize(serialized);

      expect(restored.size).toBe(graph.size);
      expect(restored.getImports('/src/App.tsx')).toContain('/src/Button.tsx');
      expect(restored.getDependents('/src/Button.tsx')).toContain('/src/App.tsx');
      expect(restored.getNpmDependencies('/src/App.tsx')).toContain('react');
    });
  });

  describe('getStats', () => {
    it('should return accurate statistics', () => {
      graph.addFile('/src/utils.ts', 'utils', []);
      graph.addFile('/src/Button.tsx', 'button', ['/src/utils.ts'], ['react']);
      graph.addFile('/src/App.tsx', 'app', ['/src/Button.tsx', '/src/utils.ts'], ['react']);

      const stats = graph.getStats();
      expect(stats.totalFiles).toBe(3);
      expect(stats.totalNpmDeps).toBe(1); // react (deduplicated)
      expect(stats.maxDependents.path).toBe('/src/utils.ts');
      expect(stats.maxDependents.count).toBe(2);
    });
  });
});
