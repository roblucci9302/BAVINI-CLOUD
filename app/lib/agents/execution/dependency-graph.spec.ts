/**
 * Tests pour DependencyGraph
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { DependencyGraph, createDependencyGraph, createGraphFromDefinitions } from './dependency-graph';

describe('DependencyGraph', () => {
  let graph: DependencyGraph<string>;

  beforeEach(() => {
    graph = new DependencyGraph<string>();
  });

  /*
   * ============================================================================
   * TESTS DE BASE
   * ============================================================================
   */

  describe('addNode', () => {
    it('should add a node successfully', () => {
      graph.addNode('a', 'A');

      expect(graph.hasNode('a')).toBe(true);
      expect(graph.size).toBe(1);
    });

    it('should add a node with dependencies', () => {
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);

      expect(graph.getDependencies('b')).toEqual(['a']);
    });

    it('should throw if node already exists', () => {
      graph.addNode('a', 'A');

      expect(() => graph.addNode('a', 'A2')).toThrow("Node 'a' already exists");
    });
  });

  describe('removeNode', () => {
    it('should remove a node', () => {
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);

      const removed = graph.removeNode('a');

      expect(removed).toBe(true);
      expect(graph.hasNode('a')).toBe(false);
      expect(graph.getDependencies('b')).toEqual([]);
    });

    it('should return false for non-existent node', () => {
      expect(graph.removeNode('nonexistent')).toBe(false);
    });
  });

  describe('addDependency', () => {
    it('should add a dependency', () => {
      graph.addNode('a', 'A');
      graph.addNode('b', 'B');

      graph.addDependency('b', 'a');

      expect(graph.getDependencies('b')).toContain('a');
    });

    it('should throw for non-existent node', () => {
      expect(() => graph.addDependency('nonexistent', 'a')).toThrow("Node 'nonexistent' not found");
    });
  });

  describe('getDependents', () => {
    it('should return nodes that depend on given node', () => {
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);
      graph.addNode('c', 'C', ['a']);
      graph.addNode('d', 'D', ['b']);

      const dependents = graph.getDependents('a');

      expect(dependents.sort()).toEqual(['b', 'c']);
    });

    it('should return empty array if no dependents', () => {
      graph.addNode('a', 'A');

      expect(graph.getDependents('a')).toEqual([]);
    });
  });

  /*
   * ============================================================================
   * TESTS DE CYCLE
   * ============================================================================
   */

  describe('hasCycle', () => {
    it('should return false for acyclic graph', () => {
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);
      graph.addNode('c', 'C', ['b']);

      expect(graph.hasCycle()).toBe(false);
    });

    it('should detect direct cycle', () => {
      graph.addNode('a', 'A', ['b']);
      graph.addNode('b', 'B', ['a']);

      expect(graph.hasCycle()).toBe(true);
    });

    it('should detect indirect cycle', () => {
      graph.addNode('a', 'A', ['c']);
      graph.addNode('b', 'B', ['a']);
      graph.addNode('c', 'C', ['b']);

      expect(graph.hasCycle()).toBe(true);
    });

    it('should return false for empty graph', () => {
      expect(graph.hasCycle()).toBe(false);
    });

    it('should return false for single node', () => {
      graph.addNode('a', 'A');

      expect(graph.hasCycle()).toBe(false);
    });
  });

  /*
   * ============================================================================
   * TESTS DE VALIDATION
   * ============================================================================
   */

  describe('validate', () => {
    it('should validate a correct graph', () => {
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);

      const validation = graph.validate();

      expect(validation.valid).toBe(true);
      expect(validation.hasCycle).toBe(false);
      expect(validation.missingDependencies).toEqual([]);
    });

    it('should detect cycles in validation', () => {
      graph.addNode('a', 'A', ['b']);
      graph.addNode('b', 'B', ['a']);

      const validation = graph.validate();

      expect(validation.valid).toBe(false);
      expect(validation.hasCycle).toBe(true);
    });

    it('should detect missing dependencies', () => {
      graph.addNode('a', 'A', ['nonexistent']);

      const validation = graph.validate();

      expect(validation.valid).toBe(false);
      expect(validation.missingDependencies).toContain('a -> nonexistent');
    });
  });

  /*
   * ============================================================================
   * TESTS DE TRI TOPOLOGIQUE
   * ============================================================================
   */

  describe('topologicalSort', () => {
    it('should sort nodes without dependencies to level 0', () => {
      graph.addNode('a', 'A');
      graph.addNode('b', 'B');
      graph.addNode('c', 'C');

      const levels = graph.topologicalSort();

      expect(levels).toHaveLength(1);
      expect(levels[0].level).toBe(0);
      expect(levels[0].nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
    });

    it('should sort linear dependencies correctly', () => {
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);
      graph.addNode('c', 'C', ['b']);

      const levels = graph.topologicalSort();

      expect(levels).toHaveLength(3);
      expect(levels[0].nodes[0].id).toBe('a');
      expect(levels[1].nodes[0].id).toBe('b');
      expect(levels[2].nodes[0].id).toBe('c');
    });

    it('should group parallel tasks at same level', () => {
      graph.addNode('root', 'Root');
      graph.addNode('a', 'A', ['root']);
      graph.addNode('b', 'B', ['root']);
      graph.addNode('c', 'C', ['root']);
      graph.addNode('final', 'Final', ['a', 'b', 'c']);

      const levels = graph.topologicalSort();

      expect(levels).toHaveLength(3);
      expect(levels[0].nodes.map((n) => n.id)).toEqual(['root']);
      expect(levels[1].nodes.map((n) => n.id).sort()).toEqual(['a', 'b', 'c']);
      expect(levels[2].nodes.map((n) => n.id)).toEqual(['final']);
    });

    it('should throw on cycle', () => {
      graph.addNode('a', 'A', ['c']);
      graph.addNode('b', 'B', ['a']);
      graph.addNode('c', 'C', ['b']);

      expect(() => graph.topologicalSort()).toThrow('graph contains cycles');
    });

    it('should handle diamond dependency', () => {
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);
      graph.addNode('c', 'C', ['a']);
      graph.addNode('d', 'D', ['b', 'c']);

      const levels = graph.topologicalSort();

      expect(levels).toHaveLength(3);
      expect(levels[0].nodes[0].id).toBe('a');
      expect(levels[1].nodes.map((n) => n.id).sort()).toEqual(['b', 'c']);
      expect(levels[2].nodes[0].id).toBe('d');
    });

    it('should handle complex dependency graph', () => {
      /*
       * Graphe complexe:
       * a -> b -> d
       *   -> c -> d -> e
       *        -> e
       */
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);
      graph.addNode('c', 'C', ['a']);
      graph.addNode('d', 'D', ['b', 'c']);
      graph.addNode('e', 'E', ['c', 'd']);

      const levels = graph.topologicalSort();

      expect(levels).toHaveLength(4);
      expect(levels[0].nodes[0].id).toBe('a');
      expect(levels[1].nodes.map((n) => n.id).sort()).toEqual(['b', 'c']);
      expect(levels[2].nodes[0].id).toBe('d');
      expect(levels[3].nodes[0].id).toBe('e');
    });

    it('should handle empty graph', () => {
      const levels = graph.topologicalSort();

      expect(levels).toHaveLength(0);
    });

    it('should ignore missing dependencies', () => {
      // Si une dépendance n'existe pas dans le graphe, on l'ignore
      graph.addNode('a', 'A', ['nonexistent']);
      graph.addNode('b', 'B', ['a']);

      const levels = graph.topologicalSort();

      expect(levels).toHaveLength(2);
      expect(levels[0].nodes[0].id).toBe('a');
      expect(levels[1].nodes[0].id).toBe('b');
    });
  });

  describe('getExecutionOrder', () => {
    it('should return flattened execution order', () => {
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);
      graph.addNode('c', 'C', ['a']);
      graph.addNode('d', 'D', ['b', 'c']);

      const order = graph.getExecutionOrder();

      expect(order[0]).toBe('A');
      expect(order.indexOf('B')).toBeLessThan(order.indexOf('D'));
      expect(order.indexOf('C')).toBeLessThan(order.indexOf('D'));
    });
  });

  /*
   * ============================================================================
   * TESTS UTILITAIRES
   * ============================================================================
   */

  describe('clone', () => {
    it('should create independent copy', () => {
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);

      const clone = graph.clone();

      clone.addNode('c', 'C');

      expect(graph.hasNode('c')).toBe(false);
      expect(clone.hasNode('c')).toBe(true);
    });
  });

  describe('subgraph', () => {
    it('should create subgraph with filtered dependencies', () => {
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);
      graph.addNode('c', 'C', ['a']);
      graph.addNode('d', 'D', ['b', 'c']);

      const sub = graph.subgraph(['b', 'd']);

      expect(sub.size).toBe(2);
      expect(sub.hasNode('b')).toBe(true);
      expect(sub.hasNode('d')).toBe(true);
      expect(sub.getDependencies('d')).toEqual(['b']);
    });
  });

  describe('toString', () => {
    it('should return readable string representation', () => {
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);

      const str = graph.toString();

      expect(str).toContain('DependencyGraph');
      expect(str).toContain('a');
      expect(str).toContain('b');
    });
  });

  /*
   * ============================================================================
   * TESTS FACTORY FUNCTIONS
   * ============================================================================
   */

  describe('createDependencyGraph', () => {
    it('should create empty graph', () => {
      const g = createDependencyGraph<string>();

      expect(g.isEmpty()).toBe(true);
    });
  });

  describe('createGraphFromDefinitions', () => {
    it('should create graph from definitions', () => {
      const g = createGraphFromDefinitions([
        { id: 'a', data: 'A' },
        { id: 'b', data: 'B', dependencies: ['a'] },
        { id: 'c', data: 'C', dependencies: ['a', 'b'] },
      ]);

      expect(g.size).toBe(3);
      expect(g.getDependencies('c')).toEqual(['a', 'b']);
    });
  });
});
