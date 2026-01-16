/**
 * Tests pour ParallelExecutor
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParallelExecutor, createParallelExecutor, type SubtaskDefinition } from './parallel-executor';
import type { TaskResult, AgentType } from '../types';

describe('ParallelExecutor', () => {
  let executor: ParallelExecutor;

  const createMockSubtask = (id: string, dependencies: string[] = []): SubtaskDefinition => ({
    id,
    agent: 'coder' as AgentType,
    task: {
      id,
      type: 'coder',
      prompt: `Task ${id}`,
      status: 'pending',
      createdAt: new Date(),
    },
    dependencies,
  });

  const createMockExecutor = (delay = 10, results?: Record<string, TaskResult>) => {
    return vi.fn().mockImplementation(async (task) => {
      await new Promise((r) => setTimeout(r, delay));
      return (
        results?.[task.id] ?? {
          success: true,
          output: `Result for ${task.id}`,
        }
      );
    });
  };

  beforeEach(() => {
    executor = new ParallelExecutor({ maxConcurrency: 3 });
  });

  /*
   * ============================================================================
   * TESTS DE BASE
   * ============================================================================
   */

  describe('execute', () => {
    it('should execute empty task list', async () => {
      const results = await executor.execute([], createMockExecutor());

      expect(results).toHaveLength(0);
    });

    it('should execute single task', async () => {
      const subtasks = [createMockSubtask('task-1')];
      const mockExecutor = createMockExecutor(10);

      const results = await executor.execute(subtasks, mockExecutor);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(true);
      expect(results[0].id).toBe('task-1');
    });

    it('should execute tasks without dependencies in parallel', async () => {
      const subtasks = [createMockSubtask('task-1'), createMockSubtask('task-2'), createMockSubtask('task-3')];

      const mockExecutor = createMockExecutor(50);
      const startTime = Date.now();

      const results = await executor.execute(subtasks, mockExecutor);

      const duration = Date.now() - startTime;

      // Toutes les tâches devraient s'exécuter en parallèle (~50ms, pas 150ms)
      expect(duration).toBeLessThan(120); // Marge pour le overhead
      expect(results).toHaveLength(3);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should respect dependencies', async () => {
      const executionOrder: string[] = [];

      const subtasks = [
        createMockSubtask('task-1'),
        createMockSubtask('task-2', ['task-1']),
        createMockSubtask('task-3', ['task-2']),
      ];

      const mockExecutor = vi.fn().mockImplementation(async (task) => {
        executionOrder.push(task.id);
        await new Promise((r) => setTimeout(r, 10));

        return { success: true, output: `Done ${task.id}` };
      });

      await executor.execute(subtasks, mockExecutor);

      // task-1 doit s'exécuter avant task-2, task-2 avant task-3
      expect(executionOrder.indexOf('task-1')).toBeLessThan(executionOrder.indexOf('task-2'));
      expect(executionOrder.indexOf('task-2')).toBeLessThan(executionOrder.indexOf('task-3'));
    });

    it('should execute tasks at same level in parallel', async () => {
      // task-2 et task-3 dépendent de task-1, donc niveau 1
      const subtasks = [
        createMockSubtask('task-1'),
        createMockSubtask('task-2', ['task-1']),
        createMockSubtask('task-3', ['task-1']),
      ];

      const mockExecutor = createMockExecutor(50);
      const startTime = Date.now();

      const results = await executor.execute(subtasks, mockExecutor);

      const duration = Date.now() - startTime;

      // ~50ms pour task-1, puis ~50ms pour task-2 et task-3 en parallèle = ~100ms
      expect(duration).toBeLessThan(180);
      expect(duration).toBeGreaterThan(80);
      expect(results).toHaveLength(3);
    });
  });

  /*
   * ============================================================================
   * TESTS DE GESTION D'ERREUR
   * ============================================================================
   */

  describe('error handling', () => {
    it('should stop on error when continueOnError is false', async () => {
      executor = new ParallelExecutor({
        maxConcurrency: 3,
        continueOnError: false,
      });

      const subtasks = [createMockSubtask('task-1'), createMockSubtask('task-2', ['task-1'])];

      const mockExecutor = createMockExecutor(10, {
        'task-1': { success: false, output: 'Failed' },
      });

      const results = await executor.execute(subtasks, mockExecutor);

      // Ne devrait pas exécuter task-2
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
    });

    it('should continue on error when continueOnError is true', async () => {
      executor = new ParallelExecutor({
        maxConcurrency: 3,
        continueOnError: true,
      });

      const subtasks = [createMockSubtask('task-1'), createMockSubtask('task-2')];

      const mockExecutor = createMockExecutor(10, {
        'task-1': { success: false, output: 'Failed' },
        'task-2': { success: true, output: 'OK' },
      });

      const results = await executor.execute(subtasks, mockExecutor);

      expect(results).toHaveLength(2);
      expect(results.find((r) => r.id === 'task-1')?.success).toBe(false);
      expect(results.find((r) => r.id === 'task-2')?.success).toBe(true);
    });

    it('should handle executor exceptions', async () => {
      const subtasks = [createMockSubtask('task-1')];

      const mockExecutor = vi.fn().mockRejectedValue(new Error('Executor crashed'));

      const results = await executor.execute(subtasks, mockExecutor);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].result.output).toContain('Executor crashed');
    });

    it('should handle timeout', async () => {
      executor = new ParallelExecutor({
        taskTimeout: 50,
        continueOnError: true,
      });

      const subtasks = [createMockSubtask('task-1')];

      // Cette tâche prend trop de temps
      const mockExecutor = vi.fn().mockImplementation(async () => {
        await new Promise((r) => setTimeout(r, 200));
        return { success: true, output: 'OK' };
      });

      const results = await executor.execute(subtasks, mockExecutor);

      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
      expect(results[0].result.output).toContain('timeout');
    });

    it('should detect cycles in dependencies', async () => {
      const subtasks = [
        createMockSubtask('task-1', ['task-3']),
        createMockSubtask('task-2', ['task-1']),
        createMockSubtask('task-3', ['task-2']),
      ];

      await expect(executor.execute(subtasks, createMockExecutor())).rejects.toThrow('cycles');
    });
  });

  /*
   * ============================================================================
   * TESTS DE CALLBACKS
   * ============================================================================
   */

  describe('callbacks', () => {
    it('should report progress', async () => {
      const progressCalls: Array<{ completed: number; total: number }> = [];

      executor = new ParallelExecutor({
        maxConcurrency: 1, // Séquentiel pour prédire l'ordre
        onProgress: (completed, total) => {
          progressCalls.push({ completed, total });
        },
      });

      const subtasks = [createMockSubtask('task-1'), createMockSubtask('task-2')];

      await executor.execute(subtasks, createMockExecutor(10));

      expect(progressCalls).toHaveLength(2);
      expect(progressCalls[0]).toEqual({ completed: 1, total: 2 });
      expect(progressCalls[1]).toEqual({ completed: 2, total: 2 });
    });

    it('should call onTaskStart for each task', async () => {
      const startedTasks: string[] = [];

      executor = new ParallelExecutor({
        onTaskStart: (subtask) => {
          startedTasks.push(subtask.id);
        },
      });

      const subtasks = [createMockSubtask('task-1'), createMockSubtask('task-2')];

      await executor.execute(subtasks, createMockExecutor(10));

      expect(startedTasks).toContain('task-1');
      expect(startedTasks).toContain('task-2');
    });

    it('should call onLevelStart and onLevelComplete', async () => {
      const levelStarts: number[] = [];
      const levelCompletes: number[] = [];

      executor = new ParallelExecutor({
        onLevelStart: (level) => levelStarts.push(level),
        onLevelComplete: (level) => levelCompletes.push(level),
      });

      const subtasks = [createMockSubtask('task-1'), createMockSubtask('task-2', ['task-1'])];

      await executor.execute(subtasks, createMockExecutor(10));

      expect(levelStarts).toEqual([0, 1]);
      expect(levelCompletes).toEqual([0, 1]);
    });
  });

  /*
   * ============================================================================
   * TESTS DE CONCURRENCE
   * ============================================================================
   */

  describe('concurrency', () => {
    it('should respect maxConcurrency', async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      executor = new ParallelExecutor({ maxConcurrency: 2 });

      const subtasks = [
        createMockSubtask('task-1'),
        createMockSubtask('task-2'),
        createMockSubtask('task-3'),
        createMockSubtask('task-4'),
      ];

      const mockExecutor = vi.fn().mockImplementation(async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise((r) => setTimeout(r, 50));
        currentConcurrent--;

        return { success: true, output: 'OK' };
      });

      await executor.execute(subtasks, mockExecutor);

      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });
  });

  /*
   * ============================================================================
   * TESTS DE STATISTIQUES
   * ============================================================================
   */

  describe('calculateStats', () => {
    it('should calculate correct stats', () => {
      const results = [
        { id: 't1', success: true, result: { success: true, output: '' }, executionTime: 100, level: 0 },
        { id: 't2', success: true, result: { success: true, output: '' }, executionTime: 150, level: 0 },
        { id: 't3', success: false, result: { success: false, output: '' }, executionTime: 50, level: 1 },
      ];

      const stats = ParallelExecutor.calculateStats(results);

      expect(stats.total).toBe(3);
      expect(stats.successful).toBe(2);
      expect(stats.failed).toBe(1);
      expect(stats.levels).toBe(2);
    });

    it('should handle empty results', () => {
      const stats = ParallelExecutor.calculateStats([]);

      expect(stats.total).toBe(0);
      expect(stats.parallelEfficiency).toBe(0);
    });

    it('should calculate parallel efficiency', () => {
      // 2 tâches de 100ms au niveau 0 (parallèle = 100ms, séquentiel = 200ms)
      const results = [
        { id: 't1', success: true, result: { success: true, output: '' }, executionTime: 100, level: 0 },
        { id: 't2', success: true, result: { success: true, output: '' }, executionTime: 100, level: 0 },
      ];

      const stats = ParallelExecutor.calculateStats(results);

      // Efficacité = 200 / 100 = 2
      expect(stats.parallelEfficiency).toBe(2);
    });
  });

  /*
   * ============================================================================
   * TESTS DE GRAPHE COMPLEXE
   * ============================================================================
   */

  describe('complex dependency graph', () => {
    it('should handle diamond dependency', async () => {
      const executionOrder: string[] = [];

      const subtasks = [
        createMockSubtask('root'),
        createMockSubtask('left', ['root']),
        createMockSubtask('right', ['root']),
        createMockSubtask('final', ['left', 'right']),
      ];

      const mockExecutor = vi.fn().mockImplementation(async (task) => {
        executionOrder.push(task.id);
        await new Promise((r) => setTimeout(r, 10));

        return { success: true, output: `Done ${task.id}` };
      });

      const results = await executor.execute(subtasks, mockExecutor);

      expect(results).toHaveLength(4);

      // root doit être premier
      expect(executionOrder[0]).toBe('root');

      // left et right après root
      expect(executionOrder.indexOf('left')).toBeGreaterThan(executionOrder.indexOf('root'));
      expect(executionOrder.indexOf('right')).toBeGreaterThan(executionOrder.indexOf('root'));

      // final doit être dernier
      expect(executionOrder.indexOf('final')).toBeGreaterThan(executionOrder.indexOf('left'));
      expect(executionOrder.indexOf('final')).toBeGreaterThan(executionOrder.indexOf('right'));
    });

    it('should handle wide dependency graph', async () => {
      // 1 racine, 10 branches, 1 agrégateur final
      const subtasks = [
        createMockSubtask('root'),
        ...Array.from({ length: 10 }, (_, i) => createMockSubtask(`branch-${i}`, ['root'])),
        createMockSubtask(
          'aggregator',
          Array.from({ length: 10 }, (_, i) => `branch-${i}`),
        ),
      ];

      const results = await executor.execute(subtasks, createMockExecutor(10));

      expect(results).toHaveLength(12);
      expect(results.every((r) => r.success)).toBe(true);

      // Vérifier les niveaux
      const aggregatorResult = results.find((r) => r.id === 'aggregator');
      expect(aggregatorResult?.level).toBe(2);
    });
  });

  /*
   * ============================================================================
   * TESTS FACTORY
   * ============================================================================
   */

  describe('createParallelExecutor', () => {
    it('should create executor with default options', () => {
      const exec = createParallelExecutor();

      expect(exec).toBeInstanceOf(ParallelExecutor);
    });

    it('should create executor with custom options', async () => {
      const progressCalls: number[] = [];

      const exec = createParallelExecutor({
        maxConcurrency: 1,
        onProgress: (completed) => progressCalls.push(completed),
      });

      await exec.execute([createMockSubtask('t1')], createMockExecutor(10));

      expect(progressCalls).toContain(1);
    });
  });
});
