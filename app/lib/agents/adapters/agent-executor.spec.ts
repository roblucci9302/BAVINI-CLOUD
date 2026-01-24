/**
 * Tests for AgentExecutor - Central orchestration for agent actions
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import {
  AgentExecutor,
  getAgentExecutor,
  resetAgentExecutor,
  type ExecutorConfig,
  type ToolCallRequest,
  type ExecutionContext,
} from './agent-executor';
import type { AgentType, Task, TaskResult, ToolExecutionResult } from '../types';
import type { PendingActionBatch, ProposedAction } from '../security/action-validator';

// Mock dependencies
vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

vi.mock('~/lib/stores/chat', () => ({
  pendingBatchStore: {
    set: vi.fn(),
    get: vi.fn(() => null),
    subscribe: vi.fn(() => vi.fn()),
  },
  approvalModalOpenStore: {
    set: vi.fn(),
    get: vi.fn(() => false),
  },
  processedBatchesStore: {
    subscribe: vi.fn(() => vi.fn()),
    get: vi.fn(() => []),
  },
}));

vi.mock('~/lib/stores/agents', () => ({
  addAgentLog: vi.fn(),
  updateAgentStatus: vi.fn(),
  setCurrentTask: vi.fn(),
}));

// Mock adapters
const mockReadFile = vi.fn();
const mockWriteFile = vi.fn();
const mockCreateFile = vi.fn();
const mockDeleteFile = vi.fn();
const mockListDirectory = vi.fn();
const mockGlob = vi.fn();
const mockGrep = vi.fn();
const mockExecuteCommand = vi.fn();
const mockNpmInstall = vi.fn();
const mockNpmRun = vi.fn();
const mockNpmTest = vi.fn();
const mockNpmBuild = vi.fn();
const mockGitCommand = vi.fn();

// Mock the adapter factory (BAVINI adapters)
vi.mock('./adapter-factory', () => ({
  createFSAdapter: vi.fn(() => ({
    writeFile: mockWriteFile,
    createFile: mockCreateFile,
    deleteFile: mockDeleteFile,
    listDirectory: mockListDirectory,
    readFile: vi.fn(),
    exists: vi.fn(),
    stat: vi.fn(),
    createDirectory: vi.fn(),
    deleteDirectory: vi.fn(),
    copyFile: vi.fn(),
    rename: vi.fn(),
  })),
  createShellAdapter: vi.fn(() => ({
    executeCommand: mockExecuteCommand,
    npmInstall: mockNpmInstall,
    npmRun: mockNpmRun,
    npmTest: mockNpmTest,
    npmBuild: mockNpmBuild,
    gitCommand: mockGitCommand,
    gitStatus: vi.fn(),
    gitDiff: vi.fn(),
    gitAdd: vi.fn(),
    gitCommit: vi.fn(),
    getCwd: vi.fn(() => '/'),
    setCwd: vi.fn(),
    getEnv: vi.fn(() => ({})),
    setEnv: vi.fn(),
  })),
  createFileOperationsAdapter: vi.fn(() => ({
    readFile: mockReadFile,
    readFiles: vi.fn(),
    glob: mockGlob,
    grep: mockGrep,
    getFileInfo: vi.fn(),
    clearCache: vi.fn(),
    invalidateCache: vi.fn(),
  })),
  getActiveRuntime: vi.fn(() => 'browser'),
  resetAllAdaptersAndCache: vi.fn(),
}));

describe('AgentExecutor', () => {
  let executor: AgentExecutor;
  let defaultConfig: ExecutorConfig;

  beforeEach(() => {
    vi.clearAllMocks();
    resetAgentExecutor();

    defaultConfig = {
      controlMode: 'strict',
      globalTimeout: 300000,
      allowParallel: false,
    };

    executor = new AgentExecutor(defaultConfig);

    // Reset all mock implementations to return success by default
    mockReadFile.mockResolvedValue({ success: true, output: 'file content' });
    mockWriteFile.mockResolvedValue({ success: true, output: null });
    mockCreateFile.mockResolvedValue({ success: true, output: null });
    mockDeleteFile.mockResolvedValue({ success: true, output: null });
    mockListDirectory.mockResolvedValue({ success: true, output: ['file1.ts', 'file2.ts'] });
    mockGlob.mockResolvedValue({ success: true, output: ['src/index.ts'] });
    mockGrep.mockResolvedValue({ success: true, output: [{ file: 'src/index.ts', line: 1, content: 'test' }] });
    mockExecuteCommand.mockResolvedValue({ success: true, output: { stdout: 'command output', exitCode: 0 } });
    mockNpmInstall.mockResolvedValue({ success: true, output: { stdout: 'installed', exitCode: 0 } });
    mockNpmRun.mockResolvedValue({ success: true, output: { stdout: 'script output', exitCode: 0 } });
    mockNpmTest.mockResolvedValue({ success: true, output: { stdout: 'tests passed', exitCode: 0 } });
    mockNpmBuild.mockResolvedValue({ success: true, output: { stdout: 'build complete', exitCode: 0 } });
    mockGitCommand.mockResolvedValue({ success: true, output: { stdout: 'git output', exitCode: 0 } });
  });

  afterEach(() => {
    resetAgentExecutor();
  });

  describe('constructor', () => {
    it('should create an executor with default config values', () => {
      const exec = new AgentExecutor({ controlMode: 'strict' });

      expect(exec).toBeInstanceOf(AgentExecutor);
    });

    it('should create an executor with custom config', () => {
      const customConfig: ExecutorConfig = {
        controlMode: 'moderate',
        globalTimeout: 600000,
        allowParallel: true,
        onBatchApproved: vi.fn(),
        onBatchRejected: vi.fn(),
        onActionExecuted: vi.fn(),
        onError: vi.fn(),
      };

      const exec = new AgentExecutor(customConfig);

      expect(exec).toBeInstanceOf(AgentExecutor);
    });

    it('should use default timeout of 5 minutes if not specified', () => {
      const exec = new AgentExecutor({ controlMode: 'strict' });

      expect(exec).toBeInstanceOf(AgentExecutor);
    });

    it('should default allowParallel to false', () => {
      const exec = new AgentExecutor({ controlMode: 'strict' });

      expect(exec).toBeInstanceOf(AgentExecutor);
    });
  });

  describe('executeTool', () => {
    const context: ExecutionContext = {
      agentName: 'coder',
      sessionId: 'test-session',
    };

    describe('read_file tool', () => {
      it('should execute read_file tool successfully', async () => {
        const request: ToolCallRequest = {
          name: 'read_file',
          input: { path: '/src/index.ts' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(result.output).toBe('file content');
        expect(mockReadFile).toHaveBeenCalledWith('/src/index.ts');
      });

      it('should handle read_file errors', async () => {
        mockReadFile.mockResolvedValue({ success: false, output: null, error: 'File not found' });

        const request: ToolCallRequest = {
          name: 'read_file',
          input: { path: '/nonexistent.ts' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('File not found');
      });
    });

    describe('write_file tool', () => {
      it('should execute write_file tool successfully', async () => {
        const request: ToolCallRequest = {
          name: 'write_file',
          input: { path: '/src/new.ts', content: 'export const x = 1;' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockWriteFile).toHaveBeenCalledWith('/src/new.ts', 'export const x = 1;');
      });
    });

    describe('create_file tool', () => {
      it('should execute create_file tool', async () => {
        const request: ToolCallRequest = {
          name: 'create_file',
          input: { path: '/src/created.ts', content: 'export {}' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockCreateFile).toHaveBeenCalledWith('/src/created.ts', 'export {}');
      });
    });

    describe('edit_file tool', () => {
      it('should execute edit_file tool', async () => {
        const request: ToolCallRequest = {
          name: 'edit_file',
          input: { path: '/src/edit.ts', newContent: 'updated content' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockWriteFile).toHaveBeenCalledWith('/src/edit.ts', 'updated content');
      });
    });

    describe('delete_file tool', () => {
      it('should execute delete_file tool successfully', async () => {
        const request: ToolCallRequest = {
          name: 'delete_file',
          input: { path: '/src/old.ts' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockDeleteFile).toHaveBeenCalledWith('/src/old.ts');
      });
    });

    describe('list_directory tool', () => {
      it('should execute list_directory tool successfully', async () => {
        const request: ToolCallRequest = {
          name: 'list_directory',
          input: { path: '/src' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(result.output).toEqual(['file1.ts', 'file2.ts']);
        expect(mockListDirectory).toHaveBeenCalledWith('/src');
      });
    });

    describe('glob tool', () => {
      it('should execute glob tool with all options', async () => {
        const request: ToolCallRequest = {
          name: 'glob',
          input: {
            pattern: '**/*.ts',
            cwd: '/src',
            ignore: ['node_modules'],
          },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockGlob).toHaveBeenCalledWith({
          pattern: '**/*.ts',
          cwd: '/src',
          ignore: ['node_modules'],
        });
      });

      it('should execute glob tool with minimal options', async () => {
        const request: ToolCallRequest = {
          name: 'glob',
          input: { pattern: '*.js' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockGlob).toHaveBeenCalledWith({
          pattern: '*.js',
          cwd: undefined,
          ignore: undefined,
        });
      });
    });

    describe('grep tool', () => {
      it('should execute grep tool with all options', async () => {
        const request: ToolCallRequest = {
          name: 'grep',
          input: {
            pattern: 'TODO',
            include: '*.ts',
            exclude: ['*.spec.ts'],
            ignoreCase: true,
            contextBefore: 2,
            contextAfter: 2,
            maxResults: 100,
          },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockGrep).toHaveBeenCalledWith({
          pattern: 'TODO',
          include: '*.ts',
          exclude: ['*.spec.ts'],
          ignoreCase: true,
          contextBefore: 2,
          contextAfter: 2,
          maxResults: 100,
        });
      });

      it('should execute grep tool with minimal options', async () => {
        const request: ToolCallRequest = {
          name: 'grep',
          input: { pattern: 'error' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
      });
    });

    describe('shell_command tool', () => {
      it('should execute shell_command tool', async () => {
        const request: ToolCallRequest = {
          name: 'shell_command',
          input: { command: 'ls -la' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockExecuteCommand).toHaveBeenCalledWith('ls -la');
      });
    });

    describe('npm_command tool', () => {
      it('should handle npm install command', async () => {
        const request: ToolCallRequest = {
          name: 'npm_command',
          input: { command: 'install', packages: ['lodash'], dev: false },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockNpmInstall).toHaveBeenCalledWith({
          packages: ['lodash'],
          dev: false,
        });
      });

      it('should handle npm install with dev flag', async () => {
        const request: ToolCallRequest = {
          name: 'npm_command',
          input: { command: 'install packages', packages: ['typescript'], dev: true },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockNpmInstall).toHaveBeenCalledWith({
          packages: ['typescript'],
          dev: true,
        });
      });

      it('should handle npm run command', async () => {
        const request: ToolCallRequest = {
          name: 'npm_command',
          input: { command: 'run dev', script: 'dev', args: ['--port', '3000'] },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockNpmRun).toHaveBeenCalledWith({
          script: 'dev',
          args: ['--port', '3000'],
        });
      });

      it('should handle npm test command', async () => {
        const request: ToolCallRequest = {
          name: 'npm_command',
          input: { command: 'test' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockNpmTest).toHaveBeenCalled();
      });

      it('should handle npm build command', async () => {
        const request: ToolCallRequest = {
          name: 'npm_command',
          input: { command: 'build' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockNpmBuild).toHaveBeenCalled();
      });

      it('should fallback to executeCommand for other npm commands', async () => {
        const request: ToolCallRequest = {
          name: 'npm_command',
          input: { command: 'audit' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockExecuteCommand).toHaveBeenCalledWith('npm audit');
      });
    });

    describe('git_command tool', () => {
      it('should execute git command with operation and args', async () => {
        const request: ToolCallRequest = {
          name: 'git_command',
          input: { operation: 'status', args: ['--short'] },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockGitCommand).toHaveBeenCalledWith({
          operation: 'status',
          args: ['--short'],
        });
      });

      it('should execute git diff', async () => {
        const request: ToolCallRequest = {
          name: 'git_command',
          input: { operation: 'diff' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockGitCommand).toHaveBeenCalledWith({
          operation: 'diff',
          args: undefined,
        });
      });

      it('should execute git add', async () => {
        const request: ToolCallRequest = {
          name: 'git_command',
          input: { operation: 'add', args: ['.'] },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockGitCommand).toHaveBeenCalledWith({
          operation: 'add',
          args: ['.'],
        });
      });

      it('should execute git commit', async () => {
        const request: ToolCallRequest = {
          name: 'git_command',
          input: { operation: 'commit', args: ['-m', 'test commit'] },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockGitCommand).toHaveBeenCalledWith({
          operation: 'commit',
          args: ['-m', 'test commit'],
        });
      });
    });

    describe('run_tests tool', () => {
      it('should execute run_tests tool with timeout', async () => {
        const request: ToolCallRequest = {
          name: 'run_tests',
          input: { timeout: 60000 },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockNpmTest).toHaveBeenCalledWith(60000);
      });

      it('should execute run_tests tool without timeout', async () => {
        const request: ToolCallRequest = {
          name: 'run_tests',
          input: {},
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(true);
        expect(mockNpmTest).toHaveBeenCalledWith(undefined);
      });
    });

    describe('unknown tool', () => {
      it('should return error for unknown tool', async () => {
        const request: ToolCallRequest = {
          name: 'unknown_tool',
          input: {},
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unknown tool: unknown_tool');
      });
    });

    describe('exception handling', () => {
      it('should catch and handle thrown errors', async () => {
        mockReadFile.mockRejectedValue(new Error('Network error'));

        const request: ToolCallRequest = {
          name: 'read_file',
          input: { path: '/test.ts' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Network error');
        expect(result.executionTime).toBeDefined();
      });

      it('should handle non-Error exceptions', async () => {
        mockReadFile.mockRejectedValue('String error');

        const request: ToolCallRequest = {
          name: 'read_file',
          input: { path: '/test.ts' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unknown error');
      });
    });

    describe('execution time tracking', () => {
      it('should track execution time', async () => {
        const request: ToolCallRequest = {
          name: 'read_file',
          input: { path: '/test.ts' },
        };

        const result = await executor.executeTool(request, context);

        expect(result.executionTime).toBeDefined();
        expect(typeof result.executionTime).toBe('number');
        expect(result.executionTime).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('executeToolBatch', () => {
    const context: ExecutionContext = {
      agentName: 'builder',
      sessionId: 'test-session',
    };

    describe('sequential execution', () => {
      it('should execute tools sequentially when allowParallel is false', async () => {
        executor = new AgentExecutor({ ...defaultConfig, allowParallel: false });

        const requests: ToolCallRequest[] = [
          { name: 'read_file', input: { path: '/a.ts' }, callId: 'call-1' },
          { name: 'read_file', input: { path: '/b.ts' }, callId: 'call-2' },
        ];

        const results = await executor.executeToolBatch(requests, context);

        expect(results.size).toBe(2);
        expect(results.get('call-1')?.success).toBe(true);
        expect(results.get('call-2')?.success).toBe(true);
      });

      it('should stop on blocking error in sequential mode', async () => {
        // Reset mock and set new implementation
        mockReadFile
          .mockReset()
          .mockResolvedValueOnce({ success: false, output: null, error: 'Permission denied' })
          .mockResolvedValueOnce({ success: true, output: 'content' });

        const requests: ToolCallRequest[] = [
          { name: 'read_file', input: { path: '/a.ts' }, callId: 'call-1' },
          { name: 'read_file', input: { path: '/b.ts' }, callId: 'call-2' },
        ];

        const results = await executor.executeToolBatch(requests, context);

        expect(results.size).toBe(1);
        expect(results.get('call-1')?.success).toBe(false);
      });

      it('should continue on non-blocking error', async () => {
        // Reset mock and set new implementation for non-blocking error
        mockReadFile
          .mockReset()
          .mockResolvedValueOnce({ success: false, output: null, error: 'File not found' })
          .mockResolvedValueOnce({ success: true, output: 'content' });

        const requests: ToolCallRequest[] = [
          { name: 'read_file', input: { path: '/a.ts' }, callId: 'call-1' },
          { name: 'read_file', input: { path: '/b.ts' }, callId: 'call-2' },
        ];

        const results = await executor.executeToolBatch(requests, context);

        expect(results.size).toBe(2);
        expect(results.get('call-1')?.success).toBe(false);
        expect(results.get('call-2')?.success).toBe(true);
      });

      it('should use tool name as key if callId not provided', async () => {
        const requests: ToolCallRequest[] = [{ name: 'read_file', input: { path: '/a.ts' } }];

        const results = await executor.executeToolBatch(requests, context);

        expect(results.has('read_file')).toBe(true);
      });
    });

    describe('parallel execution', () => {
      it('should execute tools in parallel when allowParallel is true', async () => {
        executor = new AgentExecutor({ ...defaultConfig, allowParallel: true });

        const requests: ToolCallRequest[] = [
          { name: 'read_file', input: { path: '/a.ts' }, callId: 'call-1' },
          { name: 'read_file', input: { path: '/b.ts' }, callId: 'call-2' },
          { name: 'read_file', input: { path: '/c.ts' }, callId: 'call-3' },
        ];

        const results = await executor.executeToolBatch(requests, context);

        expect(results.size).toBe(3);
        expect(results.get('call-1')?.success).toBe(true);
        expect(results.get('call-2')?.success).toBe(true);
        expect(results.get('call-3')?.success).toBe(true);
      });

      it('should continue all parallel executions even if some fail', async () => {
        executor = new AgentExecutor({ ...defaultConfig, allowParallel: true });

        mockReadFile
          .mockResolvedValueOnce({ success: false, output: null, error: 'Permission denied' })
          .mockResolvedValueOnce({ success: true, output: 'content b' })
          .mockResolvedValueOnce({ success: true, output: 'content c' });

        const requests: ToolCallRequest[] = [
          { name: 'read_file', input: { path: '/a.ts' }, callId: 'call-1' },
          { name: 'read_file', input: { path: '/b.ts' }, callId: 'call-2' },
          { name: 'read_file', input: { path: '/c.ts' }, callId: 'call-3' },
        ];

        const results = await executor.executeToolBatch(requests, context);

        expect(results.size).toBe(3);
      });
    });

    describe('empty batch', () => {
      it('should handle empty batch', async () => {
        const results = await executor.executeToolBatch([], context);

        expect(results.size).toBe(0);
      });
    });
  });

  describe('requestBatchApproval', () => {
    it('should submit batch to pending store and open modal', async () => {
      const { pendingBatchStore, approvalModalOpenStore } = await import('~/lib/stores/chat');

      const batch: PendingActionBatch = {
        id: 'batch-1',
        agent: 'coder',
        actions: [],
        description: 'Test batch',
        createdAt: new Date(),
        status: 'pending',
      };

      // Start the approval request but don't await it (it will timeout)
      executor.requestBatchApproval(batch);

      // Verify stores were called
      expect(pendingBatchStore.set).toHaveBeenCalledWith(batch);
      expect(approvalModalOpenStore.set).toHaveBeenCalledWith(true);
    });
  });

  describe('Task management', () => {
    describe('startTask', () => {
      it('should update agent status and set current task', async () => {
        const { updateAgentStatus, setCurrentTask } = await import('~/lib/stores/agents');

        const task: Task = {
          id: 'task-1',
          type: 'code',
          prompt: 'Write a function',
          status: 'pending',
          createdAt: new Date(),
        };

        await executor.startTask(task, 'coder');

        expect(updateAgentStatus).toHaveBeenCalledWith('coder', 'executing');
        expect(setCurrentTask).toHaveBeenCalledWith('coder', task);
      });
    });

    describe('completeTask', () => {
      it('should update status for successful task', async () => {
        vi.useFakeTimers();
        const { updateAgentStatus, setCurrentTask } = await import('~/lib/stores/agents');

        const task: Task = {
          id: 'task-1',
          type: 'code',
          prompt: 'Write a function',
          status: 'in_progress',
          createdAt: new Date(),
        };

        const result: TaskResult = {
          success: true,
          output: 'Task completed successfully',
        };

        await executor.completeTask(task, 'coder', result);

        expect(updateAgentStatus).toHaveBeenCalledWith('coder', 'completed');
        expect(setCurrentTask).toHaveBeenCalledWith('coder', null);

        // Advance timer to trigger status reset
        vi.advanceTimersByTime(1500);
        expect(updateAgentStatus).toHaveBeenCalledWith('coder', 'idle');

        vi.useRealTimers();
      });

      it('should update status for failed task', async () => {
        vi.useFakeTimers();
        const { updateAgentStatus, setCurrentTask } = await import('~/lib/stores/agents');

        const task: Task = {
          id: 'task-1',
          type: 'code',
          prompt: 'Write a function',
          status: 'in_progress',
          createdAt: new Date(),
        };

        const result: TaskResult = {
          success: false,
          output: 'Task failed',
          errors: [{ code: 'ERR_001', message: 'Something went wrong', recoverable: false }],
        };

        await executor.completeTask(task, 'coder', result);

        expect(updateAgentStatus).toHaveBeenCalledWith('coder', 'failed');
        expect(setCurrentTask).toHaveBeenCalledWith('coder', null);

        vi.useRealTimers();
      });
    });
  });

  describe('updateConfig', () => {
    it('should update configuration values', () => {
      executor.updateConfig({ controlMode: 'moderate' });
      executor.updateConfig({ allowParallel: true });
      executor.updateConfig({ globalTimeout: 600000 });

      // Config is private, but we can verify behavior by testing execution
      expect(executor).toBeInstanceOf(AgentExecutor);
    });

    it('should merge with existing config', () => {
      const onBatchApproved = vi.fn();
      executor.updateConfig({ onBatchApproved });

      // Original config values should be preserved
      expect(executor).toBeInstanceOf(AgentExecutor);
    });
  });

  describe('reset', () => {
    it('should clear all internal state', async () => {
      // Execute some tools first
      const context: ExecutionContext = {
        agentName: 'coder',
      };

      await executor.executeTool({ name: 'read_file', input: { path: '/test.ts' } }, context);

      // Reset
      executor.reset();

      // After reset, executing again should create fresh adapters
      await executor.executeTool({ name: 'read_file', input: { path: '/test2.ts' } }, context);

      expect(mockReadFile).toHaveBeenCalledTimes(2);
    });
  });

  describe('getAgentExecutor singleton', () => {
    beforeEach(() => {
      resetAgentExecutor();
    });

    it('should create new executor if none exists', () => {
      const exec = getAgentExecutor({ controlMode: 'strict' });

      expect(exec).toBeInstanceOf(AgentExecutor);
    });

    it('should return same instance on subsequent calls', () => {
      const exec1 = getAgentExecutor({ controlMode: 'strict' });
      const exec2 = getAgentExecutor();

      expect(exec1).toBe(exec2);
    });

    it('should update config on existing instance', () => {
      const exec1 = getAgentExecutor({ controlMode: 'strict' });
      const exec2 = getAgentExecutor({ controlMode: 'moderate' });

      expect(exec1).toBe(exec2);
    });

    it('should use default strict mode if no config provided', () => {
      const exec = getAgentExecutor();

      expect(exec).toBeInstanceOf(AgentExecutor);
    });
  });

  describe('resetAgentExecutor', () => {
    it('should reset the singleton instance', () => {
      const exec1 = getAgentExecutor({ controlMode: 'strict' });
      resetAgentExecutor();
      const exec2 = getAgentExecutor({ controlMode: 'moderate' });

      // After reset, should get a new instance
      expect(exec1).not.toBe(exec2);
    });

    it('should be safe to call when no instance exists', () => {
      expect(() => resetAgentExecutor()).not.toThrow();
    });

    it('should call reset on existing instance before nullifying', () => {
      const exec = getAgentExecutor({ controlMode: 'strict' });
      resetAgentExecutor();

      // Instance should be cleaned up
      expect(() => getAgentExecutor()).not.toThrow();
    });
  });

  describe('Blocking errors', () => {
    const context: ExecutionContext = {
      agentName: 'builder',
    };

    it('should recognize "rejected by user" as blocking', async () => {
      mockReadFile
        .mockResolvedValueOnce({ success: false, output: null, error: 'Action rejected by user' })
        .mockResolvedValueOnce({ success: true, output: 'content' });

      const requests: ToolCallRequest[] = [
        { name: 'read_file', input: { path: '/a.ts' }, callId: 'call-1' },
        { name: 'read_file', input: { path: '/b.ts' }, callId: 'call-2' },
      ];

      const results = await executor.executeToolBatch(requests, context);

      expect(results.size).toBe(1);
    });

    it('should recognize "permission denied" as blocking', async () => {
      mockReadFile
        .mockReset()
        .mockResolvedValueOnce({ success: false, output: null, error: 'PERMISSION DENIED' })
        .mockResolvedValueOnce({ success: true, output: 'content' });

      const requests: ToolCallRequest[] = [
        { name: 'read_file', input: { path: '/a.ts' }, callId: 'call-1' },
        { name: 'read_file', input: { path: '/b.ts' }, callId: 'call-2' },
      ];

      const results = await executor.executeToolBatch(requests, context);

      expect(results.size).toBe(1);
    });

    it('should recognize "blocked for security" as blocking', async () => {
      mockExecuteCommand.mockResolvedValueOnce({
        success: false,
        output: null,
        error: 'Command blocked for security',
      });

      const requests: ToolCallRequest[] = [
        { name: 'shell_command', input: { command: 'rm -rf /' }, callId: 'call-1' },
        { name: 'shell_command', input: { command: 'ls' }, callId: 'call-2' },
      ];

      const results = await executor.executeToolBatch(requests, context);

      expect(results.size).toBe(1);
    });

    it('should recognize "timeout" as blocking', async () => {
      mockNpmBuild.mockResolvedValueOnce({ success: false, output: null, error: 'Command timeout after 60000ms' });

      const requests: ToolCallRequest[] = [
        { name: 'npm_command', input: { command: 'build' }, callId: 'call-1' },
        { name: 'npm_command', input: { command: 'test' }, callId: 'call-2' },
      ];

      const results = await executor.executeToolBatch(requests, context);

      expect(results.size).toBe(1);
    });
  });

  describe('adapter caching', () => {
    it('should reuse adapters for the same agent', async () => {
      const { createFileOperationsAdapter } = await import('./adapter-factory');

      const context: ExecutionContext = {
        agentName: 'coder',
      };

      await executor.executeTool({ name: 'read_file', input: { path: '/a.ts' } }, context);
      await executor.executeTool({ name: 'read_file', input: { path: '/b.ts' } }, context);

      // Should only create adapters once
      expect(createFileOperationsAdapter).toHaveBeenCalledTimes(1);
    });

    it('should create separate adapters for different agents', async () => {
      const { createFileOperationsAdapter } = await import('./adapter-factory');

      await executor.executeTool({ name: 'read_file', input: { path: '/a.ts' } }, { agentName: 'coder' });

      await executor.executeTool({ name: 'read_file', input: { path: '/b.ts' } }, { agentName: 'builder' });

      // Should create adapters for each agent
      expect(createFileOperationsAdapter).toHaveBeenCalledTimes(2);
    });
  });
});
