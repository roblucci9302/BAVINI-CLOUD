/**
 * Tests pour le système d'événements de TaskQueue (P2.2)
 * Vérifie que waitForTask() utilise EventEmitter au lieu du polling
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskQueue } from '../core/task-queue';
import { AgentRegistry } from '../core/agent-registry';
import { BaseAgent } from '../core/base-agent';
import type { Task, TaskResult, AgentConfig } from '../types';

/*
 * ============================================================================
 * MOCK AGENT - Version qui n'appelle pas l'API
 * ============================================================================
 */

class MockAgent extends BaseAgent {
  private executeResult: TaskResult;
  private executeDelay: number;
  private shouldThrow: boolean;

  constructor(name: string, result: TaskResult, delay = 0, shouldThrow = false) {
    const config: AgentConfig = {
      name,
      description: `Mock agent: ${name}`,
      model: 'claude-sonnet-4-5-20250929',
      tools: [],
    };
    super(config);
    this.executeResult = result;
    this.executeDelay = delay;
    this.shouldThrow = shouldThrow;
  }

  // Override run() pour éviter d'appeler l'API
  async run(task: Task, _apiKey: string): Promise<TaskResult> {
    if (this.executeDelay > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.executeDelay));
    }

    if (this.shouldThrow) {
      throw new Error('Mock agent failure');
    }

    return this.executeResult;
  }

  async execute(_task: Task): Promise<TaskResult> {
    return this.executeResult;
  }

  getSystemPrompt(): string {
    return 'Mock system prompt';
  }

  setResult(result: TaskResult): void {
    this.executeResult = result;
  }

  setDelay(delay: number): void {
    this.executeDelay = delay;
  }
}

/*
 * ============================================================================
 * TESTS
 * ============================================================================
 */

describe('TaskQueue Event System (P2.2)', () => {
  let registry: AgentRegistry;
  let queue: TaskQueue;
  let mockAgent: MockAgent;

  beforeEach(() => {
    registry = AgentRegistry.getInstance();
    registry.clear();

    mockAgent = new MockAgent('test-agent', {
      success: true,
      output: 'Test completed',
    });
    registry.register(mockAgent);

    queue = new TaskQueue(registry, 'test-api-key', {
      maxParallel: 2,
      retryDelay: 10,
      maxRetries: 0,
    });
  });

  afterEach(() => {
    queue.dispose();
    registry.clear();
  });

  describe('onTaskEvent', () => {
    it('should emit task:completed event when task succeeds', async () => {
      const completedEvents: Array<{ taskId: string; result: TaskResult }> = [];

      queue.onTaskEvent('task:completed', (data) => {
        if ('taskId' in data) {
          completedEvents.push(data as { taskId: string; result: TaskResult });
        }
      });

      const task: Task = {
        id: 'test-task-1',
        type: 'test-agent',
        prompt: 'Test prompt',
        status: 'pending',
        createdAt: new Date(),
      };

      await queue.enqueue(task);

      expect(completedEvents).toHaveLength(1);
      expect(completedEvents[0].taskId).toBe('test-task-1');
      expect(completedEvents[0].result.success).toBe(true);
    });

    it('should emit task:failed event when task throws', async () => {
      // Créer un agent qui lance une exception
      const failingAgent = new MockAgent(
        'failing-agent',
        { success: false, output: 'Will throw' },
        0,
        true, // shouldThrow = true
      );
      registry.register(failingAgent);

      const failedEvents: Array<{ taskId: string; result: TaskResult }> = [];

      queue.onTaskEvent('task:failed', (data) => {
        if ('taskId' in data) {
          failedEvents.push(data as { taskId: string; result: TaskResult });
        }
      });

      const task: Task = {
        id: 'test-task-fail',
        type: 'failing-agent',
        prompt: 'This will fail',
        status: 'pending',
        createdAt: new Date(),
      };

      await queue.enqueue(task);

      expect(failedEvents).toHaveLength(1);
      expect(failedEvents[0].taskId).toBe('test-task-fail');
    });

    it('should emit task-specific events', async () => {
      const specificEvents: TaskResult[] = [];

      queue.onTaskEvent('task:specific-id:completed', (data) => {
        specificEvents.push(data as TaskResult);
      });

      const task: Task = {
        id: 'specific-id',
        type: 'test-agent',
        prompt: 'Test prompt',
        status: 'pending',
        createdAt: new Date(),
      };

      await queue.enqueue(task);

      expect(specificEvents).toHaveLength(1);
      expect(specificEvents[0].success).toBe(true);
    });

    it('should allow unsubscribing from events', async () => {
      const events: Array<{ taskId: string; result: TaskResult }> = [];

      const unsubscribe = queue.onTaskEvent('task:completed', (data) => {
        if ('taskId' in data) {
          events.push(data as { taskId: string; result: TaskResult });
        }
      });

      // Exécuter une première tâche
      await queue.enqueue({
        id: 'task-1',
        type: 'test-agent',
        prompt: 'Test 1',
        status: 'pending',
        createdAt: new Date(),
      });

      expect(events).toHaveLength(1);

      // Se désabonner
      unsubscribe();

      // Exécuter une deuxième tâche
      await queue.enqueue({
        id: 'task-2',
        type: 'test-agent',
        prompt: 'Test 2',
        status: 'pending',
        createdAt: new Date(),
      });

      // Devrait toujours avoir qu'un seul événement
      expect(events).toHaveLength(1);
    });
  });

  describe('onceTaskEvent', () => {
    it('should only trigger once', async () => {
      const events: Array<{ taskId: string; result: TaskResult }> = [];

      queue.onceTaskEvent('task:completed', (data) => {
        if ('taskId' in data) {
          events.push(data as { taskId: string; result: TaskResult });
        }
      });

      // Exécuter deux tâches
      await queue.enqueue({
        id: 'task-once-1',
        type: 'test-agent',
        prompt: 'Test 1',
        status: 'pending',
        createdAt: new Date(),
      });

      await queue.enqueue({
        id: 'task-once-2',
        type: 'test-agent',
        prompt: 'Test 2',
        status: 'pending',
        createdAt: new Date(),
      });

      // Devrait n'avoir qu'un seul événement
      expect(events).toHaveLength(1);
      expect(events[0].taskId).toBe('task-once-1');
    });
  });

  describe('waitForTask via enqueueBatch', () => {
    it('should handle dependent tasks correctly', async () => {
      // Créer un agent avec un délai pour simuler une exécution longue
      const slowAgent = new MockAgent(
        'slow-agent',
        {
          success: true,
          output: 'Slow task completed',
        },
        50,
      ); // 50ms delay
      registry.register(slowAgent);

      const results = await queue.enqueueBatch([
        {
          id: 'parent-task',
          type: 'slow-agent',
          prompt: 'Parent task',
          status: 'pending',
          createdAt: new Date(),
        },
        {
          id: 'child-task',
          type: 'test-agent',
          prompt: 'Child task',
          status: 'pending',
          createdAt: new Date(),
          dependencies: ['parent-task'],
        },
      ]);

      expect(results.size).toBe(2);
      expect(results.get('parent-task')?.success).toBe(true);
      expect(results.get('child-task')?.success).toBe(true);
    });

    it('should handle failed dependencies', async () => {
      // Agent qui échoue
      const failingAgent = new MockAgent('throwing-agent', { success: false, output: 'Failed' }, 0, true);
      registry.register(failingAgent);

      // La méthode enqueueBatch lance une exception quand waitForTask
      // détecte une dépendance échouée (comportement attendu)
      await expect(
        queue.enqueueBatch([
          {
            id: 'failing-parent',
            type: 'throwing-agent',
            prompt: 'This will fail',
            status: 'pending',
            createdAt: new Date(),
          },
          {
            id: 'dependent-child',
            type: 'test-agent',
            prompt: 'This depends on failing parent',
            status: 'pending',
            createdAt: new Date(),
            dependencies: ['failing-parent'],
          },
        ]),
      ).rejects.toThrow('Dependency task failed: failing-parent');
    });
  });

  describe('dispose', () => {
    it('should remove all event listeners on dispose', async () => {
      const events: TaskResult[] = [];

      queue.onTaskEvent('task:completed', (data) => {
        events.push(data as TaskResult);
      });

      // Dispose la queue
      queue.dispose();

      // Créer une nouvelle queue
      const newQueue = new TaskQueue(registry, 'test-api-key', {
        maxParallel: 2,
      });

      try {
        // Exécuter une tâche
        await newQueue.enqueue({
          id: 'post-dispose-task',
          type: 'test-agent',
          prompt: 'Test',
          status: 'pending',
          createdAt: new Date(),
        });

        // Les anciens listeners ne devraient pas être appelés
        expect(events).toHaveLength(0);
      } finally {
        newQueue.dispose();
      }
    });
  });

  describe('performance', () => {
    it('should handle multiple concurrent task completions', async () => {
      // Enregistrer plusieurs agents
      for (let i = 0; i < 5; i++) {
        registry.register(
          new MockAgent(`agent-${i}`, {
            success: true,
            output: `Agent ${i} completed`,
          }),
        );
      }

      const events: Array<{ taskId: string }> = [];
      queue.onTaskEvent('task:completed', (data) => {
        if ('taskId' in data) {
          events.push({ taskId: (data as { taskId: string }).taskId });
        }
      });

      const tasks: Task[] = [];
      for (let i = 0; i < 5; i++) {
        tasks.push({
          id: `concurrent-task-${i}`,
          type: `agent-${i}`,
          prompt: `Test ${i}`,
          status: 'pending',
          createdAt: new Date(),
        });
      }

      // Exécuter toutes les tâches en parallèle
      await Promise.all(tasks.map((task) => queue.enqueue(task)));

      // Tous les événements devraient avoir été émis
      expect(events).toHaveLength(5);
    });

    it('should execute fast without polling delays', async () => {
      const startTime = Date.now();

      // Exécuter plusieurs tâches rapidement
      for (let i = 0; i < 3; i++) {
        await queue.enqueue({
          id: `fast-task-${i}`,
          type: 'test-agent',
          prompt: `Test ${i}`,
          status: 'pending',
          createdAt: new Date(),
        });
      }

      const elapsed = Date.now() - startTime;

      // Sans polling (100ms), ça devrait être beaucoup plus rapide
      // Avec le polling original, 3 tâches + attentes = ~300ms minimum
      expect(elapsed).toBeLessThan(200);
    });
  });

  describe('waitForTask edge cases', () => {
    it('should immediately resolve for already completed task', async () => {
      // D'abord exécuter une tâche
      await queue.enqueue({
        id: 'completed-task',
        type: 'test-agent',
        prompt: 'Test',
        status: 'pending',
        createdAt: new Date(),
      });

      // Créer une tâche qui dépend de la tâche déjà complétée
      const startTime = Date.now();
      await queue.enqueueBatch([
        {
          id: 'dependent-on-completed',
          type: 'test-agent',
          prompt: 'Depends on completed',
          status: 'pending',
          createdAt: new Date(),
          dependencies: ['completed-task'],
        },
      ]);
      const elapsed = Date.now() - startTime;

      // Devrait être quasi-instantané car la dépendance est déjà complétée
      expect(elapsed).toBeLessThan(100);
    });
  });
});
