/**
 * Tests for AgentLogger
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AgentLogger, createAgentLogger, systemLogger } from './agent-logger';

// Mock dependencies
vi.mock('~/utils/logger', () => ({
  createScopedLogger: () => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  }),
}));

vi.mock('../../stores/agents', () => ({
  addAgentLog: vi.fn(),
}));

import { addAgentLog } from '../../stores/agents';

describe('AgentLogger', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create logger with default options', () => {
      const logger = new AgentLogger('coder');

      expect(logger).toBeInstanceOf(AgentLogger);
    });

    it('should create logger with custom options', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('fixer', {
        minLevel: 'warn',
        console: false,
        persist: false,
        onLog,
      });

      expect(logger).toBeInstanceOf(AgentLogger);
    });
  });

  describe('log levels', () => {
    it('should log debug messages when minLevel is debug', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'debug',
        console: false,
        persist: false,
        onLog,
      });

      logger.debug('Debug message');

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
          message: 'Debug message',
          agentName: 'coder',
        }),
      );
    });

    it('should not log debug messages when minLevel is info', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'info',
        console: false,
        persist: false,
        onLog,
      });

      logger.debug('Debug message');

      expect(onLog).not.toHaveBeenCalled();
    });

    it('should log info messages', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'info',
        console: false,
        persist: false,
        onLog,
      });

      logger.info('Info message', { key: 'value' });

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'Info message',
          data: { key: 'value' },
        }),
      );
    });

    it('should log warn messages', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'info',
        console: false,
        persist: false,
        onLog,
      });

      logger.warn('Warning message');

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          message: 'Warning message',
        }),
      );
    });

    it('should log error messages', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'info',
        console: false,
        persist: false,
        onLog,
      });

      logger.error('Error message');

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: 'Error message',
        }),
      );
    });

    it('should only log error when minLevel is error', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'error',
        console: false,
        persist: false,
        onLog,
      });

      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');

      expect(onLog).toHaveBeenCalledTimes(1);
      expect(onLog).toHaveBeenCalledWith(expect.objectContaining({ level: 'error' }));
    });
  });

  describe('console output', () => {
    it('should output to console when enabled', () => {
      const logger = new AgentLogger('coder', {
        minLevel: 'debug',
        console: true,
        persist: false,
      });

      // Should not throw
      logger.debug('Debug');
      logger.info('Info');
      logger.warn('Warn');
      logger.error('Error');
    });

    it('should not output to console when disabled', () => {
      const logger = new AgentLogger('coder', {
        minLevel: 'debug',
        console: false,
        persist: false,
      });

      // Should not throw
      logger.info('Info');
    });
  });

  describe('persistence', () => {
    it('should persist logs when enabled', () => {
      const logger = new AgentLogger('builder', {
        minLevel: 'info',
        console: false,
        persist: true,
      });

      logger.info('Test message', { data: 'value' }, 'task-123');

      expect(addAgentLog).toHaveBeenCalledWith('builder', {
        level: 'info',
        message: 'Test message',
        data: { data: 'value' },
        taskId: 'task-123',
      });
    });

    it('should not persist logs when disabled', () => {
      const logger = new AgentLogger('builder', {
        minLevel: 'info',
        console: false,
        persist: false,
      });

      logger.info('Test message');

      expect(addAgentLog).not.toHaveBeenCalled();
    });
  });

  describe('taskStart', () => {
    it('should log task start with truncated prompt', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'info',
        console: false,
        persist: false,
        onLog,
      });

      logger.taskStart('task-123', 'Create a simple component');

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'Starting task: task-123',
          taskId: 'task-123',
        }),
      );
    });

    it('should truncate long prompts', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'info',
        console: false,
        persist: false,
        onLog,
      });

      const longPrompt = 'A'.repeat(150);
      logger.taskStart('task-123', longPrompt);

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            prompt: 'A'.repeat(100) + '...',
          }),
        }),
      );
    });
  });

  describe('taskEnd', () => {
    it('should log successful task completion', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'info',
        console: false,
        persist: false,
        onLog,
      });

      logger.taskEnd('task-123', true, 1500);

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'Task completed: task-123',
          data: { success: true, durationMs: 1500 },
          taskId: 'task-123',
        }),
      );
    });

    it('should log failed task with error level', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'info',
        console: false,
        persist: false,
        onLog,
      });

      logger.taskEnd('task-123', false, 500);

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'error',
          message: 'Task failed: task-123',
          data: { success: false, durationMs: 500 },
        }),
      );
    });
  });

  describe('toolCall', () => {
    it('should log tool call at debug level', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'debug',
        console: false,
        persist: false,
        onLog,
      });

      logger.toolCall('readFile', { path: '/test.ts' }, 'task-123');

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
          message: 'Calling tool: readFile',
          data: { tool: 'readFile', input: { path: '/test.ts' } },
          taskId: 'task-123',
        }),
      );
    });
  });

  describe('toolResult', () => {
    it('should log successful tool result at debug level', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'debug',
        console: false,
        persist: false,
        onLog,
      });

      logger.toolResult('readFile', true, 50, 'task-123');

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
          message: 'Tool readFile succeeded',
          data: { tool: 'readFile', success: true, durationMs: 50 },
        }),
      );
    });

    it('should log failed tool result at warn level', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'debug',
        console: false,
        persist: false,
        onLog,
      });

      logger.toolResult('readFile', false, 100, 'task-123');

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'warn',
          message: 'Tool readFile failed',
        }),
      );
    });
  });

  describe('llmCall', () => {
    it('should log LLM call with token counts', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'debug',
        console: false,
        persist: false,
        onLog,
      });

      logger.llmCall(1000, 500, 'task-123');

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'debug',
          message: 'LLM call completed',
          data: { inputTokens: 1000, outputTokens: 500, totalTokens: 1500 },
          taskId: 'task-123',
        }),
      );
    });
  });

  describe('delegation', () => {
    it('should log delegation with truncated task', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('orchestrator', {
        minLevel: 'info',
        console: false,
        persist: false,
        onLog,
      });

      logger.delegation('fixer', 'Fix the authentication bug', 'task-123');

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          level: 'info',
          message: 'Delegating to fixer',
          data: { targetAgent: 'fixer', task: 'Fix the authentication bug' },
          taskId: 'task-123',
        }),
      );
    });

    it('should truncate long delegation tasks', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('orchestrator', {
        minLevel: 'info',
        console: false,
        persist: false,
        onLog,
      });

      const longTask = 'B'.repeat(150);
      logger.delegation('coder', longTask);

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            task: 'B'.repeat(100),
          }),
        }),
      );
    });
  });

  describe('timestamp', () => {
    it('should include timestamp in log entries', () => {
      const onLog = vi.fn();
      const logger = new AgentLogger('coder', {
        minLevel: 'info',
        console: false,
        persist: false,
        onLog,
      });

      const beforeLog = new Date();
      logger.info('Test message');
      const afterLog = new Date();

      expect(onLog).toHaveBeenCalledWith(
        expect.objectContaining({
          timestamp: expect.any(Date),
        }),
      );

      const loggedTimestamp = onLog.mock.calls[0][0].timestamp;
      expect(loggedTimestamp.getTime()).toBeGreaterThanOrEqual(beforeLog.getTime());
      expect(loggedTimestamp.getTime()).toBeLessThanOrEqual(afterLog.getTime());
    });
  });
});

describe('createAgentLogger', () => {
  it('should create an AgentLogger instance', () => {
    const logger = createAgentLogger('builder');

    expect(logger).toBeInstanceOf(AgentLogger);
  });

  it('should pass options to AgentLogger', () => {
    const onLog = vi.fn();
    const logger = createAgentLogger('builder', {
      minLevel: 'warn',
      onLog,
    });

    logger.info('Should not log');
    expect(onLog).not.toHaveBeenCalled();

    logger.warn('Should log');
    expect(onLog).toHaveBeenCalled();
  });
});

describe('systemLogger', () => {
  it('should be an AgentLogger instance', () => {
    expect(systemLogger).toBeInstanceOf(AgentLogger);
  });

  it('should log messages', () => {
    // Just verify it doesn't throw
    systemLogger.info('System log message');
    systemLogger.warn('System warning');
    systemLogger.error('System error');
  });
});
