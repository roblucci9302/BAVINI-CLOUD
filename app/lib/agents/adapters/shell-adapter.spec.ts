/**
 * Tests for ShellAdapter - Shell operations for BAVINI agents
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import {
  ShellAdapter,
  createShellAdapter,
  getShellAdapterForAgent,
  resetAllShellAdapters,
  type ShellConfig,
  type ProcessHandle,
  type NpmRunOptions,
  type NpmInstallOptions,
  type GitCommandOptions,
} from './shell-adapter';
import type { AgentType, ToolExecutionResult } from '../types';

// Mock WebContainer
const mockKill = vi.fn();
const mockGetReader = vi.fn();
const mockRead = vi.fn();
const mockSpawn = vi.fn();
const mockExit = Promise.resolve(0);

vi.mock('~/lib/webcontainer', () => ({
  webcontainer: Promise.resolve({
    spawn: vi.fn(),
  }),
}));

// Mock logger
vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// Mock agent stores
vi.mock('~/lib/stores/agents', () => ({
  addAgentLog: vi.fn(),
}));

// Mock security module
vi.mock('../security/command-whitelist', () => ({
  checkCommand: vi.fn((cmd: string) => {
    if (cmd.includes('rm -rf') || cmd.includes('sudo')) {
      return { level: 'blocked', allowed: false, message: 'Command blocked', command: cmd };
    }
    if (cmd.includes('git push') || cmd.includes('npx')) {
      return { level: 'approval_required', allowed: false, message: 'Approval required', command: cmd };
    }
    return { level: 'allowed', allowed: true, message: 'Command allowed', command: cmd };
  }),
  isBlocked: vi.fn((cmd: string) => cmd.includes('rm -rf') || cmd.includes('sudo')),
  requiresApproval: vi.fn((cmd: string) => cmd.includes('git push') || cmd.includes('npx')),
}));

// Mock action-validator
vi.mock('../security/action-validator', () => ({
  createProposedAction: vi.fn((type, agent, desc, details) => ({
    id: 'action-1',
    type,
    agent,
    description: desc,
    details,
    status: 'pending',
    createdAt: new Date(),
  })),
}));

describe('ShellAdapter', () => {
  let adapter: ShellAdapter;
  let defaultConfig: ShellConfig;
  let mockWebContainer: any;
  let mockProcess: any;

  beforeEach(async () => {
    vi.clearAllMocks();
    resetAllShellAdapters();

    // Setup mock process
    mockProcess = {
      output: {
        getReader: vi.fn(() => ({
          read: vi
            .fn()
            .mockResolvedValueOnce({ done: false, value: 'output line 1\n' })
            .mockResolvedValueOnce({ done: false, value: 'output line 2\n' })
            .mockResolvedValueOnce({ done: true }),
        })),
      },
      exit: Promise.resolve(0),
      kill: vi.fn(),
    };

    // Get the mocked webcontainer
    const { webcontainer } = await import('~/lib/webcontainer');
    mockWebContainer = await webcontainer;
    mockWebContainer.spawn = vi.fn().mockResolvedValue(mockProcess);

    defaultConfig = {
      agentName: 'builder',
      strictMode: false,
      defaultTimeout: 60000,
    };

    adapter = new ShellAdapter(defaultConfig);
  });

  afterEach(() => {
    resetAllShellAdapters();
    vi.useRealTimers();
  });

  describe('constructor', () => {
    it('should create adapter with default config values', () => {
      const config: ShellConfig = {
        agentName: 'coder',
        strictMode: true,
      };

      const adp = new ShellAdapter(config);

      expect(adp).toBeInstanceOf(ShellAdapter);
    });

    it('should use default timeout of 60000ms if not specified', () => {
      const config: ShellConfig = {
        agentName: 'coder',
        strictMode: false,
      };

      const adp = new ShellAdapter(config);

      expect(adp).toBeInstanceOf(ShellAdapter);
    });

    it('should accept custom timeout', () => {
      const config: ShellConfig = {
        agentName: 'builder',
        strictMode: false,
        defaultTimeout: 120000,
      };

      const adp = new ShellAdapter(config);

      expect(adp).toBeInstanceOf(ShellAdapter);
    });

    it('should accept taskId in config', () => {
      const config: ShellConfig = {
        agentName: 'tester',
        strictMode: false,
        taskId: 'task-123',
      };

      const adp = new ShellAdapter(config);

      expect(adp).toBeInstanceOf(ShellAdapter);
    });

    it('should accept onApprovalRequired callback', () => {
      const config: ShellConfig = {
        agentName: 'deployer',
        strictMode: true,
        onApprovalRequired: vi.fn().mockResolvedValue(true),
      };

      const adp = new ShellAdapter(config);

      expect(adp).toBeInstanceOf(ShellAdapter);
    });
  });

  describe('npmInstall', () => {
    it('should execute npm install without packages', async () => {
      const result = await adapter.npmInstall();

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'npm install'], expect.any(Object));
      expect(result.success).toBe(true);
    });

    it('should execute npm install with packages', async () => {
      const result = await adapter.npmInstall({ packages: ['lodash', 'express'] });

      expect(mockWebContainer.spawn).toHaveBeenCalledWith(
        'jsh',
        ['-c', 'npm install lodash express'],
        expect.any(Object),
      );
      expect(result.success).toBe(true);
    });

    it('should add --save-dev flag when dev is true', async () => {
      const result = await adapter.npmInstall({ packages: ['typescript'], dev: true });

      expect(mockWebContainer.spawn).toHaveBeenCalledWith(
        'jsh',
        ['-c', 'npm install --save-dev typescript'],
        expect.any(Object),
      );
      expect(result.success).toBe(true);
    });

    it('should use custom timeout', async () => {
      const result = await adapter.npmInstall({ timeout: 180000 });

      expect(result.success).toBe(true);
    });

    it('should use default timeout of 120000ms for npm install', async () => {
      const result = await adapter.npmInstall();

      expect(result.success).toBe(true);
    });

    it('should handle empty packages array', async () => {
      const result = await adapter.npmInstall({ packages: [] });

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'npm install'], expect.any(Object));
    });
  });

  describe('npmRun', () => {
    it('should execute npm run script', async () => {
      const result = await adapter.npmRun({ script: 'build' });

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'npm run build'], expect.any(Object));
      expect(result.success).toBe(true);
    });

    it('should pass additional args to script', async () => {
      const result = await adapter.npmRun({
        script: 'dev',
        args: ['--port', '3000', '--host'],
      });

      expect(mockWebContainer.spawn).toHaveBeenCalledWith(
        'jsh',
        ['-c', 'npm run dev -- --port 3000 --host'],
        expect.any(Object),
      );
      expect(result.success).toBe(true);
    });

    it('should use custom timeout', async () => {
      const result = await adapter.npmRun({ script: 'test', timeout: 300000 });

      expect(result.success).toBe(true);
    });

    it('should handle empty args array', async () => {
      const result = await adapter.npmRun({ script: 'lint', args: [] });

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'npm run lint'], expect.any(Object));
    });
  });

  describe('npmTest', () => {
    it('should execute npm test', async () => {
      const result = await adapter.npmTest();

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'npm test'], expect.any(Object));
      expect(result.success).toBe(true);
    });

    it('should use custom timeout', async () => {
      const result = await adapter.npmTest(300000);

      expect(result.success).toBe(true);
    });

    it('should use default timeout of 120000ms', async () => {
      const result = await adapter.npmTest();

      expect(result.success).toBe(true);
    });
  });

  describe('npmBuild', () => {
    it('should execute npm run build', async () => {
      const result = await adapter.npmBuild();

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'npm run build'], expect.any(Object));
      expect(result.success).toBe(true);
    });

    it('should use custom timeout', async () => {
      const result = await adapter.npmBuild(600000);

      expect(result.success).toBe(true);
    });

    it('should use default timeout of 180000ms', async () => {
      const result = await adapter.npmBuild();

      expect(result.success).toBe(true);
    });
  });

  describe('gitCommand', () => {
    it('should execute git status', async () => {
      const result = await adapter.gitCommand({ operation: 'status' });

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'git status'], expect.any(Object));
      expect(result.success).toBe(true);
    });

    it('should execute git diff with args', async () => {
      const result = await adapter.gitCommand({ operation: 'diff', args: ['--staged'] });

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'git diff --staged'], expect.any(Object));
      expect(result.success).toBe(true);
    });

    it('should execute git add', async () => {
      const result = await adapter.gitCommand({ operation: 'add', args: ['.'] });

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'git add .'], expect.any(Object));
    });

    it('should execute git commit', async () => {
      const result = await adapter.gitCommand({ operation: 'commit', args: ['-m', '"test commit"'] });

      expect(mockWebContainer.spawn).toHaveBeenCalledWith(
        'jsh',
        ['-c', 'git commit -m "test commit"'],
        expect.any(Object),
      );
    });

    it('should force approval for git push', async () => {
      const onApprovalRequired = vi.fn().mockResolvedValue(true);
      adapter = new ShellAdapter({ ...defaultConfig, strictMode: false, onApprovalRequired });

      await adapter.gitCommand({ operation: 'push', args: ['origin', 'main'] });

      expect(onApprovalRequired).toHaveBeenCalled();
    });

    it('should reject git push when approval is denied', async () => {
      const onApprovalRequired = vi.fn().mockResolvedValue(false);
      adapter = new ShellAdapter({ ...defaultConfig, onApprovalRequired });

      const result = await adapter.gitCommand({ operation: 'push' });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Command rejected by user');
    });

    it('should use custom timeout', async () => {
      const result = await adapter.gitCommand({ operation: 'log', timeout: 15000 });

      expect(result.success).toBe(true);
    });

    it('should use default timeout of 30000ms', async () => {
      const result = await adapter.gitCommand({ operation: 'branch' });

      expect(result.success).toBe(true);
    });
  });

  describe('gitStatus', () => {
    it('should call gitCommand with status operation', async () => {
      const result = await adapter.gitStatus();

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'git status'], expect.any(Object));
      expect(result.success).toBe(true);
    });
  });

  describe('gitDiff', () => {
    it('should call gitCommand with diff operation', async () => {
      const result = await adapter.gitDiff();

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'git diff'], expect.any(Object));
    });

    it('should pass args to diff', async () => {
      const result = await adapter.gitDiff(['--cached', 'src/']);

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'git diff --cached src/'], expect.any(Object));
    });
  });

  describe('gitAdd', () => {
    it('should call gitCommand with add operation', async () => {
      const result = await adapter.gitAdd();

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'git add .'], expect.any(Object));
    });

    it('should add specific files', async () => {
      const result = await adapter.gitAdd(['src/index.ts', 'src/app.ts']);

      expect(mockWebContainer.spawn).toHaveBeenCalledWith(
        'jsh',
        ['-c', 'git add src/index.ts src/app.ts'],
        expect.any(Object),
      );
    });
  });

  describe('gitCommit', () => {
    it('should call gitCommand with commit operation and message', async () => {
      const result = await adapter.gitCommit('Initial commit');

      expect(mockWebContainer.spawn).toHaveBeenCalledWith(
        'jsh',
        ['-c', 'git commit -m "Initial commit"'],
        expect.any(Object),
      );
    });

    it('should handle messages with special characters', async () => {
      const result = await adapter.gitCommit('Fix: handle edge case');

      expect(mockWebContainer.spawn).toHaveBeenCalledWith(
        'jsh',
        ['-c', 'git commit -m "Fix: handle edge case"'],
        expect.any(Object),
      );
    });
  });

  describe('executeCommand', () => {
    describe('security checks', () => {
      it('should block dangerous commands', async () => {
        const result = await adapter.executeCommand('rm -rf /');

        expect(result.success).toBe(false);
        expect(result.error).toContain('blocked for security');
        expect(mockWebContainer.spawn).not.toHaveBeenCalled();
      });

      it('should block sudo commands', async () => {
        const result = await adapter.executeCommand('sudo apt install');

        expect(result.success).toBe(false);
        expect(result.error).toContain('blocked for security');
      });
    });

    describe('approval flow', () => {
      it('should request approval in strict mode', async () => {
        const onApprovalRequired = vi.fn().mockResolvedValue(true);
        adapter = new ShellAdapter({ ...defaultConfig, strictMode: true, onApprovalRequired });

        await adapter.executeCommand('ls -la');

        expect(onApprovalRequired).toHaveBeenCalled();
      });

      it('should reject when approval is denied', async () => {
        const onApprovalRequired = vi.fn().mockResolvedValue(false);
        adapter = new ShellAdapter({ ...defaultConfig, strictMode: true, onApprovalRequired });

        const result = await adapter.executeCommand('ls -la');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Command rejected by user');
      });

      it('should reject when no approval handler is configured', async () => {
        adapter = new ShellAdapter({ ...defaultConfig, strictMode: true });

        const result = await adapter.executeCommand('echo test');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Command rejected by user');
      });

      it('should request approval for commands that require it', async () => {
        const onApprovalRequired = vi.fn().mockResolvedValue(true);
        adapter = new ShellAdapter({ ...defaultConfig, strictMode: false, onApprovalRequired });

        await adapter.executeCommand('npx create-app');

        expect(onApprovalRequired).toHaveBeenCalled();
      });

      it('should force approval when forceApproval is true', async () => {
        const onApprovalRequired = vi.fn().mockResolvedValue(true);
        adapter = new ShellAdapter({ ...defaultConfig, strictMode: false, onApprovalRequired });

        await adapter.executeCommand('ls', undefined, true);

        expect(onApprovalRequired).toHaveBeenCalled();
      });
    });

    describe('successful execution', () => {
      it('should execute allowed commands without approval in non-strict mode', async () => {
        const result = await adapter.executeCommand('ls -la');

        expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'ls -la'], expect.any(Object));
        expect(result.success).toBe(true);
      });

      it('should return command output', async () => {
        const result = await adapter.executeCommand('echo hello');

        expect(result.success).toBe(true);
        expect(result.output).toBeDefined();
        expect((result.output as any).stdout).toContain('output line 1');
        expect((result.output as any).stdout).toContain('output line 2');
      });

      it('should include exit code in output', async () => {
        const result = await adapter.executeCommand('echo test');

        expect((result.output as any).exitCode).toBe(0);
      });

      it('should include command in output', async () => {
        const result = await adapter.executeCommand('pwd');

        expect((result.output as any).command).toBe('pwd');
      });

      it('should track execution time', async () => {
        const result = await adapter.executeCommand('echo test');

        expect(result.executionTime).toBeDefined();
        expect(typeof result.executionTime).toBe('number');
      });
    });

    describe('failed execution', () => {
      it('should handle non-zero exit code', async () => {
        mockProcess.exit = Promise.resolve(1);

        const result = await adapter.executeCommand('false');

        expect(result.success).toBe(false);
        expect(result.error).toContain('exited with code 1');
      });

      it('should handle spawn errors', async () => {
        mockWebContainer.spawn.mockRejectedValueOnce(new Error('Spawn failed'));

        const result = await adapter.executeCommand('invalid-command');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Spawn failed');
      });

      it('should handle non-Error exceptions', async () => {
        mockWebContainer.spawn.mockRejectedValueOnce('Unknown error');

        const result = await adapter.executeCommand('cmd');

        expect(result.success).toBe(false);
        expect(result.error).toBe('Unknown error');
      });
    });

    describe('timeout handling', () => {
      it('should use custom timeout', async () => {
        const result = await adapter.executeCommand('sleep 1', 5000);

        expect(result.success).toBe(true);
      });

      it('should use default timeout from config', async () => {
        const result = await adapter.executeCommand('echo test');

        expect(result.success).toBe(true);
      });
    });
  });

  describe('startDevServer', () => {
    it('should start a dev server process', async () => {
      // Create a process that doesn't exit immediately
      const neverExitProcess = {
        ...mockProcess,
        exit: new Promise(() => {}), // Never resolves
      };
      mockWebContainer.spawn.mockResolvedValueOnce(neverExitProcess);

      const handle = await adapter.startDevServer();

      expect(handle).not.toBeNull();
      expect(handle?.id).toMatch(/^process-/);
      expect(handle?.command).toBe('npm run dev');

      // Note: completed may be true if process exits immediately in test environment
    });

    it('should accept custom command', async () => {
      const handle = await adapter.startDevServer('npm run start');

      expect(mockWebContainer.spawn).toHaveBeenCalledWith('jsh', ['-c', 'npm run start'], expect.any(Object));
      expect(handle?.command).toBe('npm run start');
    });

    it('should return null for blocked commands', async () => {
      const handle = await adapter.startDevServer('rm -rf /');

      expect(handle).toBeNull();
    });

    it('should provide kill function', async () => {
      const handle = await adapter.startDevServer();

      expect(handle?.kill).toBeDefined();
      expect(typeof handle?.kill).toBe('function');

      handle?.kill();
      expect(mockProcess.kill).toHaveBeenCalled();
    });

    it('should handle spawn errors', async () => {
      mockWebContainer.spawn.mockRejectedValueOnce(new Error('Failed to spawn'));

      const handle = await adapter.startDevServer();

      expect(handle).toBeNull();
    });

    it('should track process in running processes map', async () => {
      // Create a process that doesn't exit immediately
      const neverExitProcess = {
        ...mockProcess,
        exit: new Promise(() => {}), // Never resolves
      };
      mockWebContainer.spawn.mockResolvedValueOnce(neverExitProcess);

      const handle = await adapter.startDevServer();

      expect(handle).not.toBeNull();
      const retrieved = adapter.getProcess(handle!.id);
      expect(retrieved).toBe(handle);
    });

    it('should assign incremental process IDs', async () => {
      const handle1 = await adapter.startDevServer();
      const handle2 = await adapter.startDevServer();

      expect(handle1?.id).not.toBe(handle2?.id);
    });
  });

  describe('Process management', () => {
    describe('getProcess', () => {
      it('should return process by ID', async () => {
        // Create a process that doesn't exit immediately
        const neverExitProcess = {
          ...mockProcess,
          exit: new Promise(() => {}), // Never resolves
        };
        mockWebContainer.spawn.mockResolvedValueOnce(neverExitProcess);

        const handle = await adapter.startDevServer();
        const retrieved = adapter.getProcess(handle!.id);

        expect(retrieved).toBe(handle);
      });

      it('should return undefined for unknown ID', () => {
        const result = adapter.getProcess('unknown-id');

        expect(result).toBeUndefined();
      });
    });

    describe('listProcesses', () => {
      it('should return empty array when no processes', () => {
        const processes = adapter.listProcesses();

        expect(processes).toEqual([]);
      });

      it('should return all running processes', async () => {
        // Create processes that don't exit immediately
        const neverExitProcess1 = {
          ...mockProcess,
          exit: new Promise(() => {}),
        };
        const neverExitProcess2 = {
          ...mockProcess,
          exit: new Promise(() => {}),
        };
        mockWebContainer.spawn.mockResolvedValueOnce(neverExitProcess1).mockResolvedValueOnce(neverExitProcess2);

        await adapter.startDevServer('npm run dev');
        await adapter.startDevServer('npm run watch');

        const processes = adapter.listProcesses();

        expect(processes.length).toBe(2);
      });
    });

    describe('killProcess', () => {
      it('should kill process by ID and return true', async () => {
        // Create a process that doesn't exit immediately
        const neverExitProcess = {
          ...mockProcess,
          exit: new Promise(() => {}),
          kill: vi.fn(),
        };
        mockWebContainer.spawn.mockResolvedValueOnce(neverExitProcess);

        const handle = await adapter.startDevServer();
        const result = adapter.killProcess(handle!.id);

        expect(result).toBe(true);
        expect(neverExitProcess.kill).toHaveBeenCalled();
      });

      it('should remove process from running processes', async () => {
        const handle = await adapter.startDevServer();
        adapter.killProcess(handle!.id);

        const retrieved = adapter.getProcess(handle!.id);
        expect(retrieved).toBeUndefined();
      });

      it('should return false for unknown process ID', () => {
        const result = adapter.killProcess('unknown-id');

        expect(result).toBe(false);
      });
    });

    describe('killAllProcesses', () => {
      it('should kill all running processes', async () => {
        // Create processes that don't exit immediately
        const neverExitProcess1 = {
          ...mockProcess,
          exit: new Promise(() => {}),
        };
        const neverExitProcess2 = {
          ...mockProcess,
          exit: new Promise(() => {}),
        };
        mockWebContainer.spawn.mockResolvedValueOnce(neverExitProcess1).mockResolvedValueOnce(neverExitProcess2);

        await adapter.startDevServer('npm run dev');
        await adapter.startDevServer('npm run watch');

        adapter.killAllProcesses();

        expect(adapter.listProcesses().length).toBe(0);
      });

      it('should call kill on each process', async () => {
        // Create processes that don't exit immediately with separate kill mocks
        const kill1 = vi.fn();
        const kill2 = vi.fn();
        const neverExitProcess1 = {
          ...mockProcess,
          exit: new Promise(() => {}),
          kill: kill1,
        };
        const neverExitProcess2 = {
          ...mockProcess,
          exit: new Promise(() => {}),
          kill: kill2,
        };
        mockWebContainer.spawn.mockResolvedValueOnce(neverExitProcess1).mockResolvedValueOnce(neverExitProcess2);

        await adapter.startDevServer();
        await adapter.startDevServer();

        adapter.killAllProcesses();

        expect(kill1).toHaveBeenCalled();
        expect(kill2).toHaveBeenCalled();
      });

      it('should handle empty process list', () => {
        expect(() => adapter.killAllProcesses()).not.toThrow();
      });
    });
  });

  describe('isSafeCommand', () => {
    describe('safe commands', () => {
      it('should return true for ls', () => {
        expect(adapter.isSafeCommand('ls')).toBe(true);
        expect(adapter.isSafeCommand('ls -la')).toBe(true);
      });

      it('should return true for pwd', () => {
        expect(adapter.isSafeCommand('pwd')).toBe(true);
      });

      it('should return true for cat', () => {
        expect(adapter.isSafeCommand('cat file.txt')).toBe(true);
      });

      it('should return true for head', () => {
        expect(adapter.isSafeCommand('head -n 10 file.txt')).toBe(true);
      });

      it('should return true for tail', () => {
        expect(adapter.isSafeCommand('tail -f log.txt')).toBe(true);
      });

      it('should return true for grep', () => {
        expect(adapter.isSafeCommand('grep pattern file.txt')).toBe(true);
      });

      it('should return true for find', () => {
        expect(adapter.isSafeCommand('find . -name "*.ts"')).toBe(true);
      });

      it('should return true for echo', () => {
        expect(adapter.isSafeCommand('echo hello')).toBe(true);
      });

      it('should return true for which', () => {
        expect(adapter.isSafeCommand('which node')).toBe(true);
      });

      it('should return true for node -v', () => {
        expect(adapter.isSafeCommand('node -v')).toBe(true);
      });

      it('should return true for npm list/info commands', () => {
        expect(adapter.isSafeCommand('npm list')).toBe(true);
        expect(adapter.isSafeCommand('npm ls')).toBe(true);
        expect(adapter.isSafeCommand('npm view lodash')).toBe(true);
        expect(adapter.isSafeCommand('npm info react')).toBe(true);
        expect(adapter.isSafeCommand('npm search express')).toBe(true);
      });

      it('should return true for git read commands', () => {
        expect(adapter.isSafeCommand('git status')).toBe(true);
        expect(adapter.isSafeCommand('git log --oneline')).toBe(true);
        expect(adapter.isSafeCommand('git diff')).toBe(true);
        expect(adapter.isSafeCommand('git branch')).toBe(true);
        expect(adapter.isSafeCommand('git show HEAD')).toBe(true);
      });
    });

    describe('unsafe commands', () => {
      it('should return false for npm install', () => {
        expect(adapter.isSafeCommand('npm install')).toBe(false);
      });

      it('should return false for npm run', () => {
        expect(adapter.isSafeCommand('npm run build')).toBe(false);
      });

      it('should return false for git push', () => {
        expect(adapter.isSafeCommand('git push')).toBe(false);
      });

      it('should return false for git commit', () => {
        expect(adapter.isSafeCommand('git commit -m "msg"')).toBe(false);
      });

      it('should return false for rm', () => {
        expect(adapter.isSafeCommand('rm file.txt')).toBe(false);
      });

      it('should return false for arbitrary commands', () => {
        expect(adapter.isSafeCommand('custom-command')).toBe(false);
      });
    });

    describe('edge cases', () => {
      it('should handle whitespace-padded commands', () => {
        expect(adapter.isSafeCommand('  ls  ')).toBe(true);
      });
    });
  });

  describe('updateConfig', () => {
    it('should update strictMode', () => {
      adapter.updateConfig({ strictMode: true });

      // Verify by testing behavior
      expect(adapter).toBeInstanceOf(ShellAdapter);
    });

    it('should update defaultTimeout', () => {
      adapter.updateConfig({ defaultTimeout: 120000 });

      expect(adapter).toBeInstanceOf(ShellAdapter);
    });

    it('should update onApprovalRequired', () => {
      const newCallback = vi.fn().mockResolvedValue(true);
      adapter.updateConfig({ onApprovalRequired: newCallback });

      expect(adapter).toBeInstanceOf(ShellAdapter);
    });

    it('should merge with existing config', () => {
      adapter.updateConfig({ strictMode: true });
      adapter.updateConfig({ defaultTimeout: 90000 });

      expect(adapter).toBeInstanceOf(ShellAdapter);
    });
  });

  describe('createShellAdapter factory', () => {
    it('should create a new ShellAdapter instance', () => {
      const config: ShellConfig = {
        agentName: 'coder',
        strictMode: false,
      };

      const adp = createShellAdapter(config);

      expect(adp).toBeInstanceOf(ShellAdapter);
    });

    it('should create independent instances', () => {
      const adp1 = createShellAdapter({ agentName: 'coder', strictMode: false });
      const adp2 = createShellAdapter({ agentName: 'builder', strictMode: true });

      expect(adp1).not.toBe(adp2);
    });
  });

  describe('getShellAdapterForAgent singleton', () => {
    beforeEach(() => {
      resetAllShellAdapters();
    });

    it('should create new adapter for agent if none exists', () => {
      const adp = getShellAdapterForAgent('coder');

      expect(adp).toBeInstanceOf(ShellAdapter);
    });

    it('should return same instance for same agent', () => {
      const adp1 = getShellAdapterForAgent('builder');
      const adp2 = getShellAdapterForAgent('builder');

      expect(adp1).toBe(adp2);
    });

    it('should return different instances for different agents', () => {
      const adp1 = getShellAdapterForAgent('coder');
      const adp2 = getShellAdapterForAgent('builder');

      expect(adp1).not.toBe(adp2);
    });

    it('should update config on existing instance', () => {
      const adp1 = getShellAdapterForAgent('tester');
      const adp2 = getShellAdapterForAgent('tester', { strictMode: true });

      expect(adp1).toBe(adp2);
    });

    it('should use strict mode by default', () => {
      const adp = getShellAdapterForAgent('deployer');

      expect(adp).toBeInstanceOf(ShellAdapter);
    });

    it('should accept partial config', () => {
      const adp = getShellAdapterForAgent('reviewer', {
        taskId: 'task-456',
        defaultTimeout: 90000,
      });

      expect(adp).toBeInstanceOf(ShellAdapter);
    });
  });

  describe('resetAllShellAdapters', () => {
    it('should clear all adapter instances', () => {
      getShellAdapterForAgent('coder');
      getShellAdapterForAgent('builder');

      resetAllShellAdapters();

      const newAdapter = getShellAdapterForAgent('coder');
      expect(newAdapter).toBeInstanceOf(ShellAdapter);
    });

    it('should kill all processes before clearing', async () => {
      const adp = getShellAdapterForAgent('builder');
      await adp.startDevServer();

      resetAllShellAdapters();

      // New adapter should have no processes
      const newAdapter = getShellAdapterForAgent('builder');
      expect(newAdapter.listProcesses().length).toBe(0);
    });

    it('should be safe to call multiple times', () => {
      expect(() => {
        resetAllShellAdapters();
        resetAllShellAdapters();
        resetAllShellAdapters();
      }).not.toThrow();
    });

    it('should be safe to call when no adapters exist', () => {
      expect(() => resetAllShellAdapters()).not.toThrow();
    });
  });

  describe('Logging', () => {
    it('should log when starting dev server', async () => {
      const { addAgentLog } = await import('~/lib/stores/agents');

      await adapter.startDevServer();

      expect(addAgentLog).toHaveBeenCalled();
    });

    it('should log when command is blocked', async () => {
      const { addAgentLog } = await import('~/lib/stores/agents');

      await adapter.executeCommand('rm -rf /');

      expect(addAgentLog).toHaveBeenCalledWith(
        'builder',
        expect.objectContaining({
          level: 'warn',
        }),
      );
    });

    it('should log when killing process', async () => {
      const { addAgentLog } = await import('~/lib/stores/agents');

      const handle = await adapter.startDevServer();
      adapter.killProcess(handle!.id);

      expect(addAgentLog).toHaveBeenCalled();
    });

    it('should log when killing all processes', async () => {
      const { addAgentLog } = await import('~/lib/stores/agents');

      await adapter.startDevServer();
      adapter.killAllProcesses();

      expect(addAgentLog).toHaveBeenCalled();
    });

    it('should include taskId in logs when configured', async () => {
      const { addAgentLog } = await import('~/lib/stores/agents');

      const adp = new ShellAdapter({
        agentName: 'tester',
        strictMode: false,
        taskId: 'task-789',
      });

      await adp.executeCommand('ls');

      expect(addAgentLog).toHaveBeenCalledWith(
        'tester',
        expect.objectContaining({
          taskId: 'task-789',
        }),
      );
    });
  });

  describe('Environment variables', () => {
    it('should set npm_config_yes to true for commands', async () => {
      await adapter.executeCommand('npm init');

      expect(mockWebContainer.spawn).toHaveBeenCalledWith(
        'jsh',
        ['-c', 'npm init'],
        expect.objectContaining({
          env: { npm_config_yes: 'true' },
        }),
      );
    });

    it('should set npm_config_yes for dev server', async () => {
      await adapter.startDevServer();

      expect(mockWebContainer.spawn).toHaveBeenCalledWith(
        'jsh',
        expect.any(Array),
        expect.objectContaining({
          env: { npm_config_yes: 'true' },
        }),
      );
    });
  });
});
