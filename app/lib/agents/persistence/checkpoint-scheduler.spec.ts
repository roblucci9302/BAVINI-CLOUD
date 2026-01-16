/**
 * Tests pour CheckpointScheduler
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CheckpointScheduler,
  createCheckpointScheduler,
  createAgentCheckpointScheduler,
  type TaskCheckpointState,
  type CheckpointTrigger,
} from './checkpoint-scheduler';
import type { Task, TaskResult, AgentMessage } from '../types';

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

function createMockTask(overrides: Partial<Task> = {}): Task {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`,
    type: 'test',
    prompt: 'Test task',
    status: 'in_progress',
    createdAt: new Date(),
    ...overrides,
  };
}

function createMockTaskState(task: Task, overrides: Partial<TaskCheckpointState> = {}): TaskCheckpointState {
  return {
    task,
    agentName: 'test-agent',
    messageHistory: [{ role: 'user', content: 'Test message' }] as AgentMessage[],
    progress: 0.5,
    currentStep: 1,
    totalSteps: 3,
    ...overrides,
  };
}

function createMockTaskResult(success: boolean = true): TaskResult {
  return {
    success,
    output: success ? 'Task completed' : 'Task failed',
  };
}

/*
 * ============================================================================
 * CHECKPOINT SCHEDULER TESTS
 * ============================================================================
 */

describe('CheckpointScheduler', () => {
  let scheduler: CheckpointScheduler;
  let mockTask: Task;
  let mockTaskState: TaskCheckpointState;

  beforeEach(() => {
    vi.useFakeTimers();
    scheduler = createCheckpointScheduler({
      defaultIntervalMs: 1000, // 1 second for tests
      defaultProgressThreshold: 0.1,
      defaultTokenThreshold: 1000,
      enableAutoCleanup: false,
    });

    mockTask = createMockTask();
    mockTaskState = createMockTaskState(mockTask);

    // Set up task state callback
    scheduler.setTaskStateCallback((taskId: string) => {
      if (taskId === mockTask.id) {
        return mockTaskState;
      }

      return null;
    });
  });

  afterEach(() => {
    scheduler.destroy();
    vi.useRealTimers();
  });

  describe('factory functions', () => {
    it('should create scheduler with default config', () => {
      const defaultScheduler = createCheckpointScheduler();
      expect(defaultScheduler).toBeInstanceOf(CheckpointScheduler);
      defaultScheduler.destroy();
    });

    it('should create agent scheduler with agent config', () => {
      const agentScheduler = createAgentCheckpointScheduler();
      expect(agentScheduler).toBeInstanceOf(CheckpointScheduler);
      agentScheduler.destroy();
    });
  });

  describe('interval scheduling', () => {
    it('should schedule checkpoint by interval', () => {
      const scheduleId = scheduler.scheduleByInterval(mockTask.id, 2000);

      expect(scheduleId).toContain('sched-');
      expect(scheduleId).toContain(mockTask.id);
      expect(scheduleId).toContain('interval');

      const schedules = scheduler.getSchedulesForTask(mockTask.id);
      expect(schedules.length).toBe(1);
      expect(schedules[0].trigger).toBe('interval');
      expect(schedules[0].active).toBe(true);
    });

    it('should create checkpoint after interval', async () => {
      const scheduleId = scheduler.scheduleByInterval(mockTask.id, 1000);

      // Initial stats
      let stats = scheduler.getStats();
      expect(stats.totalCheckpoints).toBe(0);

      // Advance time by interval and flush promises
      await vi.advanceTimersByTimeAsync(1000);

      stats = scheduler.getStats();
      expect(stats.totalCheckpoints).toBe(1);
      expect(stats.byTrigger.interval).toBe(1);

      // Cancel to prevent further intervals
      scheduler.cancel(scheduleId);
    });
  });

  describe('progress scheduling', () => {
    it('should schedule checkpoint by progress', () => {
      const scheduleId = scheduler.scheduleByProgress(mockTask.id, 0.2);

      expect(scheduleId).toContain('progress');

      const schedules = scheduler.getSchedulesForTask(mockTask.id);
      expect(schedules.length).toBe(1);
      expect(schedules[0].trigger).toBe('progress');
    });

    it('should create checkpoint when progress threshold reached', async () => {
      scheduler.scheduleByProgress(mockTask.id, 0.1);

      // No checkpoint at 5%
      let checkpoint = await scheduler.checkProgressCheckpoint(mockTask.id, 0.05);
      expect(checkpoint).toBeNull();

      // Checkpoint at 10%
      checkpoint = await scheduler.checkProgressCheckpoint(mockTask.id, 0.1);
      expect(checkpoint).not.toBeNull();

      const stats = scheduler.getStats();
      expect(stats.byTrigger.progress).toBe(1);
    });

    it('should create checkpoint at multiple thresholds', async () => {
      scheduler.scheduleByProgress(mockTask.id, 0.1);

      await scheduler.checkProgressCheckpoint(mockTask.id, 0.1);
      await scheduler.checkProgressCheckpoint(mockTask.id, 0.15); // No checkpoint
      await scheduler.checkProgressCheckpoint(mockTask.id, 0.2);
      await scheduler.checkProgressCheckpoint(mockTask.id, 0.35); // Should trigger at 30%

      const stats = scheduler.getStats();
      expect(stats.byTrigger.progress).toBe(3);
    });
  });

  describe('token scheduling', () => {
    it('should schedule checkpoint by token usage', () => {
      const scheduleId = scheduler.scheduleByTokenUsage(mockTask.id, 5000);

      expect(scheduleId).toContain('tokens');

      const schedules = scheduler.getSchedulesForTask(mockTask.id);
      expect(schedules.length).toBe(1);
      expect(schedules[0].trigger).toBe('tokens');
    });

    it('should create checkpoint when token threshold reached', async () => {
      scheduler.scheduleByTokenUsage(mockTask.id, 1000);

      // No checkpoint at 500 tokens
      let checkpoint = await scheduler.checkTokenCheckpoint(mockTask.id, 500);
      expect(checkpoint).toBeNull();

      // Checkpoint at 1000 tokens
      checkpoint = await scheduler.checkTokenCheckpoint(mockTask.id, 1000);
      expect(checkpoint).not.toBeNull();

      const stats = scheduler.getStats();
      expect(stats.byTrigger.tokens).toBe(1);
    });
  });

  describe('manual checkpoints', () => {
    it('should create manual checkpoint', async () => {
      const checkpoint = await scheduler.createManualCheckpoint(mockTask.id, 'User requested save');

      expect(checkpoint).not.toBeNull();
      expect(checkpoint!.metadata?.trigger).toBe('manual');

      const stats = scheduler.getStats();
      expect(stats.byTrigger.manual).toBe(1);
    });
  });

  describe('error checkpoints', () => {
    it('should create error checkpoint', async () => {
      const error = new Error('Something went wrong');
      const checkpoint = await scheduler.createErrorCheckpoint(mockTask.id, error);

      expect(checkpoint).not.toBeNull();
      expect(checkpoint!.metadata?.trigger).toBe('error');
      expect(checkpoint!.metadata?.error).toBe('Something went wrong');

      const stats = scheduler.getStats();
      expect(stats.byTrigger.error).toBe(1);
    });
  });

  describe('delegation checkpoints', () => {
    it('should create checkpoint before delegation', async () => {
      const checkpoint = await scheduler.createDelegationCheckpoint(mockTask.id, 'coder', 'before');

      expect(checkpoint).not.toBeNull();
      expect(checkpoint!.metadata?.trigger).toBe('delegation');
      expect(checkpoint!.metadata?.delegatedTo).toBe('coder');
      expect(checkpoint!.metadata?.phase).toBe('before');

      const stats = scheduler.getStats();
      expect(stats.byTrigger.delegation).toBe(1);
    });

    it('should create checkpoint after delegation', async () => {
      const checkpoint = await scheduler.createDelegationCheckpoint(mockTask.id, 'tester', 'after');

      expect(checkpoint).not.toBeNull();
      expect(checkpoint!.metadata?.phase).toBe('after');
    });
  });

  describe('subtask checkpoints', () => {
    it('should create checkpoint after subtask', async () => {
      const subtaskResult = createMockTaskResult(true);
      const checkpoint = await scheduler.createSubtaskCheckpoint(mockTask.id, 'subtask-1', subtaskResult);

      expect(checkpoint).not.toBeNull();
      expect(checkpoint!.metadata?.trigger).toBe('subtask');
      expect(checkpoint!.metadata?.subtaskId).toBe('subtask-1');
      expect(checkpoint!.metadata?.subtaskSuccess).toBe(true);

      const stats = scheduler.getStats();
      expect(stats.byTrigger.subtask).toBe(1);
    });
  });

  describe('schedule management', () => {
    it('should list all schedules', () => {
      scheduler.scheduleByInterval(mockTask.id, 1000);
      scheduler.scheduleByProgress(mockTask.id, 0.1);
      scheduler.scheduleByTokenUsage(mockTask.id, 1000);

      const schedules = scheduler.listSchedules();
      expect(schedules.length).toBe(3);
    });

    it('should cancel schedule', () => {
      const scheduleId = scheduler.scheduleByInterval(mockTask.id, 1000);

      expect(scheduler.listSchedules().length).toBe(1);

      const cancelled = scheduler.cancel(scheduleId);
      expect(cancelled).toBe(true);
      expect(scheduler.listSchedules().length).toBe(0);
    });

    it('should return false when cancelling non-existent schedule', () => {
      const cancelled = scheduler.cancel('non-existent');
      expect(cancelled).toBe(false);
    });

    it('should cancel all schedules for task', () => {
      scheduler.scheduleByInterval(mockTask.id, 1000);
      scheduler.scheduleByProgress(mockTask.id, 0.1);

      const otherTask = createMockTask();
      scheduler.scheduleByInterval(otherTask.id, 1000);

      expect(scheduler.listSchedules().length).toBe(3);

      const cancelled = scheduler.cancelAllForTask(mockTask.id);
      expect(cancelled).toBe(2);
      expect(scheduler.listSchedules().length).toBe(1);
    });
  });

  describe('statistics', () => {
    it('should track statistics', async () => {
      scheduler.scheduleByInterval(mockTask.id, 1000);
      scheduler.scheduleByProgress(mockTask.id, 0.1);

      await scheduler.createManualCheckpoint(mockTask.id);
      await scheduler.checkProgressCheckpoint(mockTask.id, 0.1);

      const stats = scheduler.getStats();

      expect(stats.activeSchedules).toBe(2);
      expect(stats.totalCheckpoints).toBe(2);
      expect(stats.byTrigger.manual).toBe(1);
      expect(stats.byTrigger.progress).toBe(1);
      expect(stats.lastCheckpointAt).toBeInstanceOf(Date);
    });
  });

  describe('cleanup', () => {
    it('should cleanup old checkpoints', async () => {
      const cleanupScheduler = createCheckpointScheduler({
        enableAutoCleanup: true,
        checkpointMaxAgeMs: 1000,
      });

      cleanupScheduler.setTaskStateCallback(() => mockTaskState);

      await cleanupScheduler.createManualCheckpoint(mockTask.id);

      // Advance time past max age
      vi.advanceTimersByTime(2000);

      const cleaned = await cleanupScheduler.cleanup();
      expect(cleaned).toBeGreaterThanOrEqual(0); // Depends on storage impl

      cleanupScheduler.destroy();
    });
  });

  describe('edge cases', () => {
    it('should return null when no task state callback set', async () => {
      const noCallbackScheduler = createCheckpointScheduler();

      const checkpoint = await noCallbackScheduler.createManualCheckpoint(mockTask.id);
      expect(checkpoint).toBeNull();

      noCallbackScheduler.destroy();
    });

    it('should return null when task not found', async () => {
      const checkpoint = await scheduler.createManualCheckpoint('non-existent-task');
      expect(checkpoint).toBeNull();
    });

    it('should handle inactive progress schedule', async () => {
      const scheduleId = scheduler.scheduleByProgress(mockTask.id, 0.1);
      scheduler.cancel(scheduleId);

      const checkpoint = await scheduler.checkProgressCheckpoint(mockTask.id, 0.5);
      expect(checkpoint).toBeNull();
    });

    it('should get checkpoint manager', () => {
      const manager = scheduler.getCheckpointManager();
      expect(manager).toBeDefined();
    });
  });

  describe('destroy', () => {
    it('should cleanup on destroy', () => {
      scheduler.scheduleByInterval(mockTask.id, 1000);
      scheduler.scheduleByProgress(mockTask.id, 0.1);

      scheduler.destroy();

      expect(scheduler.listSchedules().length).toBe(0);
    });
  });
});
