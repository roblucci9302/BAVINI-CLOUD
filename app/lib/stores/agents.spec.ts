import { describe, expect, it, beforeEach, vi } from 'vitest';
import {
  agentStatusStore,
  activeAgentsStore,
  currentTasksStore,
  agentLogsStore,
  systemLogsStore,
  taskQueueStore,
  completedTasksStore,
  currentOrchestratorTaskStore,
  currentActionStore,
  activeAgentCountStore,
  availableAgentsStore,
  agentStatsStore,
  updateAgentStatus,
  setCurrentTask,
  addAgentLog,
  enqueueTask,
  dequeueTask,
  completeTask,
  handleAgentEvent,
  resetAgentStores,
  getSystemSummary,
  setCurrentAction,
} from './agents';
import type { Task, TaskResult, AgentEvent } from '../agents/types';

describe('agents store', () => {
  beforeEach(() => {
    resetAgentStores();
  });

  describe('initial state', () => {
    it('should have all agents idle initially', () => {
      const statuses = agentStatusStore.get();

      expect(statuses.orchestrator).toBe('idle');
      expect(statuses.explore).toBe('idle');
      expect(statuses.coder).toBe('idle');
      expect(statuses.builder).toBe('idle');
      expect(statuses.tester).toBe('idle');
      expect(statuses.deployer).toBe('idle');
      expect(statuses.reviewer).toBe('idle');
      expect(statuses.fixer).toBe('idle');
    });

    it('should have no active agents initially', () => {
      expect(activeAgentsStore.get()).toEqual([]);
    });

    it('should have no tasks initially', () => {
      expect(taskQueueStore.get()).toEqual([]);
      expect(completedTasksStore.get()).toEqual([]);
    });

    it('should have empty logs initially', () => {
      const logs = agentLogsStore.get();

      expect(logs.orchestrator).toEqual([]);
      expect(logs.explore).toEqual([]);
    });
  });

  describe('updateAgentStatus', () => {
    it('should update agent status', () => {
      updateAgentStatus('coder', 'executing');

      expect(agentStatusStore.get().coder).toBe('executing');
    });

    it('should add agent to active list when executing', () => {
      updateAgentStatus('coder', 'executing');

      expect(activeAgentsStore.get()).toContain('coder');
    });

    it('should remove agent from active list when idle', () => {
      updateAgentStatus('coder', 'executing');
      updateAgentStatus('coder', 'idle');

      expect(activeAgentsStore.get()).not.toContain('coder');
    });

    it('should keep agent in active list briefly when completed (delayed removal)', () => {
      updateAgentStatus('builder', 'executing');
      updateAgentStatus('builder', 'completed');

      // Agent stays visible briefly for UI feedback
      expect(activeAgentsStore.get()).toContain('builder');
      expect(agentStatusStore.get().builder).toBe('completed');
    });

    it('should remove agent from active list after delay when completed', async () => {
      vi.useFakeTimers();
      updateAgentStatus('builder', 'executing');
      updateAgentStatus('builder', 'completed');

      // Still visible immediately
      expect(activeAgentsStore.get()).toContain('builder');

      // Fast-forward past the delay (1.5s)
      vi.advanceTimersByTime(1600);

      // Now removed
      expect(activeAgentsStore.get()).not.toContain('builder');
      vi.useRealTimers();
    });

    it('should not duplicate agents in active list', () => {
      updateAgentStatus('tester', 'executing');
      updateAgentStatus('tester', 'waiting_for_tool');

      const activeAgents = activeAgentsStore.get();
      const testerCount = activeAgents.filter((a) => a === 'tester').length;

      expect(testerCount).toBe(1);
    });
  });

  describe('setCurrentTask', () => {
    it('should set current task for agent', () => {
      const task: Task = {
        id: 'task-1',
        type: 'coder',
        prompt: 'Test prompt',
        status: 'pending',
        createdAt: new Date(),
      };

      setCurrentTask('coder', task);

      expect(currentTasksStore.get().coder).toEqual(task);
    });

    it('should clear current task when null', () => {
      const task: Task = {
        id: 'task-1',
        type: 'coder',
        prompt: 'Test prompt',
        status: 'pending',
        createdAt: new Date(),
      };

      setCurrentTask('coder', task);
      setCurrentTask('coder', null);

      expect(currentTasksStore.get().coder).toBeNull();
    });
  });

  describe('addAgentLog', () => {
    it('should add log entry with timestamp', () => {
      addAgentLog('orchestrator', {
        level: 'info',
        message: 'Test message',
      });

      const logs = agentLogsStore.get().orchestrator;

      expect(logs).toHaveLength(1);
      expect(logs[0].message).toBe('Test message');
      expect(logs[0].level).toBe('info');
      expect(logs[0].timestamp).toBeInstanceOf(Date);
      expect(logs[0].agentName).toBe('orchestrator');
    });

    it('should add log to system logs', () => {
      addAgentLog('explore', {
        level: 'debug',
        message: 'Debug message',
      });

      const systemLogs = systemLogsStore.get();

      expect(systemLogs).toHaveLength(1);
      expect(systemLogs[0].message).toBe('Debug message');
    });

    it('should keep only last 100 logs per agent', () => {
      for (let i = 0; i < 110; i++) {
        addAgentLog('coder', { level: 'info', message: `Log ${i}` });
      }

      const logs = agentLogsStore.get().coder;

      expect(logs.length).toBeLessThanOrEqual(100);
    });

    it('should keep only last 500 system logs', () => {
      for (let i = 0; i < 510; i++) {
        addAgentLog('builder', { level: 'info', message: `Log ${i}` });
      }

      const systemLogs = systemLogsStore.get();

      expect(systemLogs.length).toBeLessThanOrEqual(500);
    });
  });

  describe('task queue operations', () => {
    const createTask = (id: string): Task => ({
      id,
      type: 'orchestrator',
      prompt: `Task ${id}`,
      status: 'pending',
      createdAt: new Date(),
    });

    it('should enqueue tasks', () => {
      enqueueTask(createTask('1'));
      enqueueTask(createTask('2'));

      expect(taskQueueStore.get()).toHaveLength(2);
    });

    it('should dequeue tasks in FIFO order', () => {
      enqueueTask(createTask('1'));
      enqueueTask(createTask('2'));

      const task = dequeueTask();

      expect(task?.id).toBe('1');
      expect(taskQueueStore.get()).toHaveLength(1);
    });

    it('should return undefined when dequeuing empty queue', () => {
      const task = dequeueTask();

      expect(task).toBeUndefined();
    });
  });

  describe('completeTask', () => {
    it('should add task to completed tasks', () => {
      const task: Task = {
        id: 'task-1',
        type: 'coder',
        prompt: 'Test',
        status: 'in_progress',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'Done',
      };

      completeTask(task, result);

      const completed = completedTasksStore.get();

      expect(completed).toHaveLength(1);
      expect(completed[0].id).toBe('task-1');
      expect(completed[0].result.success).toBe(true);
    });

    it('should keep only last 100 completed tasks', () => {
      for (let i = 0; i < 110; i++) {
        const task: Task = {
          id: `task-${i}`,
          type: 'coder',
          prompt: 'Test',
          status: 'in_progress',
          createdAt: new Date(),
        };

        completeTask(task, { success: true, output: '' });
      }

      expect(completedTasksStore.get().length).toBeLessThanOrEqual(100);
    });
  });

  describe('handleAgentEvent', () => {
    it('should update status on agent:started', () => {
      const event: AgentEvent = {
        type: 'agent:started',
        agentName: 'explore',
        timestamp: new Date(),
        data: {},
      };

      handleAgentEvent(event);

      expect(agentStatusStore.get().explore).toBe('executing');
    });

    it('should update status on agent:completed', () => {
      updateAgentStatus('coder', 'executing');

      const event: AgentEvent = {
        type: 'agent:completed',
        agentName: 'coder',
        timestamp: new Date(),
        data: {},
      };

      handleAgentEvent(event);

      expect(agentStatusStore.get().coder).toBe('completed');
    });

    it('should add error log on agent:failed', () => {
      const event: AgentEvent = {
        type: 'agent:failed',
        agentName: 'builder',
        timestamp: new Date(),
        data: { error: 'Build failed' },
      };

      handleAgentEvent(event);

      const logs = agentLogsStore.get().builder;

      expect(logs.some((l) => l.level === 'error')).toBe(true);
    });

    it('should handle tool_call event', () => {
      const event: AgentEvent = {
        type: 'agent:tool_call',
        agentName: 'coder',
        timestamp: new Date(),
        data: { toolName: 'write_file' },
      };

      handleAgentEvent(event);

      expect(agentStatusStore.get().coder).toBe('waiting_for_tool');
    });

    it('should ignore events without agentName', () => {
      const event: AgentEvent = {
        type: 'agent:started',
        timestamp: new Date(),
        data: {},
      };

      // Should not throw
      handleAgentEvent(event);
    });
  });

  describe('computed stores', () => {
    it('activeAgentCountStore should count active agents', () => {
      updateAgentStatus('coder', 'executing');
      updateAgentStatus('builder', 'executing');

      expect(activeAgentCountStore.get()).toBe(2);
    });

    it('availableAgentsStore should list idle agents', () => {
      updateAgentStatus('coder', 'executing');

      const available = availableAgentsStore.get();

      expect(available).not.toContain('coder');
      expect(available).toContain('orchestrator');
      expect(available).toContain('explore');
    });

    it('agentStatsStore should compute statistics', () => {
      updateAgentStatus('coder', 'executing');
      updateAgentStatus('builder', 'executing');

      const task: Task = {
        id: 'task-1',
        type: 'tester',
        prompt: 'Test',
        status: 'in_progress',
        createdAt: new Date(),
      };

      completeTask(task, { success: true, output: '' });
      enqueueTask({ ...task, id: 'task-2', status: 'pending' });

      const stats = agentStatsStore.get();

      expect(stats.totalAgents).toBe(9); // 9 agents including architect
      expect(stats.busyAgents).toBe(2);
      expect(stats.idleAgents).toBe(7);
      expect(stats.completedTasks).toBe(1);
      expect(stats.pendingTasks).toBe(1);
      expect(stats.successfulTasks).toBe(1);
    });
  });

  describe('setCurrentAction', () => {
    it('should set current action', () => {
      setCurrentAction({
        type: 'write_file',
        description: 'Writing file',
        filePath: '/src/index.ts',
        agentName: 'coder',
      });

      const action = currentActionStore.get();

      expect(action?.type).toBe('write_file');
      expect(action?.filePath).toBe('/src/index.ts');
    });

    it('should clear current action', () => {
      setCurrentAction({
        type: 'write_file',
        description: 'Writing',
      });
      setCurrentAction(null);

      expect(currentActionStore.get()).toBeNull();
    });
  });

  describe('resetAgentStores', () => {
    it('should reset all stores to initial state', () => {
      updateAgentStatus('coder', 'executing');
      addAgentLog('coder', { level: 'info', message: 'Test' });
      enqueueTask({
        id: '1',
        type: 'coder',
        prompt: 'Test',
        status: 'pending',
        createdAt: new Date(),
      });

      resetAgentStores();

      expect(agentStatusStore.get().coder).toBe('idle');
      expect(activeAgentsStore.get()).toEqual([]);
      expect(agentLogsStore.get().coder).toEqual([]);
      expect(taskQueueStore.get()).toEqual([]);
    });
  });

  describe('getSystemSummary', () => {
    it('should return system summary', () => {
      updateAgentStatus('coder', 'executing');

      const task: Task = {
        id: 'task-1',
        type: 'coder',
        prompt: 'Write some code for testing',
        status: 'in_progress',
        createdAt: new Date(),
      };

      setCurrentTask('coder', task);
      addAgentLog('coder', { level: 'info', message: 'Test log' });

      const summary = getSystemSummary();

      expect(summary.agents.coder.status).toBe('executing');
      expect(summary.agents.coder.currentTask).toBeTruthy();
      expect(summary.stats.busyAgents).toBe(1);
      expect(summary.recentLogs).toHaveLength(1);
    });
  });
});
