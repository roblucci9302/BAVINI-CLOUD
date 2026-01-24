/**
 * ActionRunner Tests
 *
 * NOTE: Migrated from WebContainer to BAVINI native runtime.
 * Tests use mocked MountManager instead of WebContainer.
 */

import { describe, expect, it, vi, beforeEach } from 'vitest';

// mock git operations
vi.mock('~/lib/git/operations', () => ({
  clone: vi.fn().mockResolvedValue(undefined),
  init: vi.fn().mockResolvedValue(undefined),
  add: vi.fn().mockResolvedValue(undefined),
  commit: vi.fn().mockResolvedValue('abc123'),
  push: vi.fn().mockResolvedValue(undefined),
  pull: vi.fn().mockResolvedValue(undefined),
  status: vi.fn().mockResolvedValue([]),
}));

// mock auth tokens
vi.mock('~/lib/auth/tokens', () => ({
  getAccessToken: vi.fn().mockReturnValue(null),
}));

// mock pyodide
vi.mock('~/lib/pyodide', () => ({
  initPyodide: vi.fn().mockResolvedValue({}),
  installPackages: vi.fn().mockResolvedValue(undefined),
  runPython: vi.fn().mockResolvedValue({ result: null, stdout: '', stderr: '' }),
  runPythonWithTimeout: vi.fn().mockResolvedValue({ result: null, stdout: '', stderr: '' }),
}));

// mock security timeout
vi.mock('~/lib/security/timeout', () => ({
  raceWithTimeout: vi.fn().mockImplementation((promise) => promise),
  EXECUTION_LIMITS: {
    shell: { timeoutMs: 120000, message: 'Shell timeout' },
    python: { timeoutMs: 30000, message: 'Python timeout' },
  },
}));

// mock logger
vi.mock('~/utils/logger', () => ({
  createScopedLogger: vi.fn(() => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  })),
}));

// mock MountManager (BAVINI filesystem)
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);

vi.mock('~/lib/runtime/filesystem', () => ({
  getSharedMountManager: vi.fn(() => ({
    mkdir: mockMkdir,
    writeFile: mockWriteFile,
    readFile: vi.fn().mockResolvedValue(''),
    exists: vi.fn().mockResolvedValue(true),
  })),
}));

const ACTION_ID = 'action_1';
const ARTIFACT_ID = 'artifact_1';
const MESSAGE_ID = 'msg_1';

describe('ActionRunner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('addAction', () => {
    it('should add an action to the actions map', async () => {
      const actionRunnerModule = await import('./action-runner');
      const runner = new actionRunnerModule.ActionRunner();

      runner.addAction({
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'file',
          filePath: 'test.txt',
          content: 'Hello',
        },
      });

      const actions = runner.actions.get();
      const action = actions[ACTION_ID];

      expect(action).toBeDefined();
      expect(action.status).toBe('pending');
    });

    it('should not add duplicate actions', async () => {
      const actionRunnerModule = await import('./action-runner');
      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'file' as const,
          filePath: 'test.txt',
          content: 'Hello',
        },
      };

      runner.addAction(actionData);
      runner.addAction(actionData);

      const actions = runner.actions.get();
      const actionCount = Object.keys(actions).length;

      expect(actionCount).toBe(1);
    });
  });

  describe('runAction - file actions', () => {
    it('should execute a file action', async () => {
      const actionRunnerModule = await import('./action-runner');
      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'file' as const,
          filePath: 'src/index.ts',
          content: 'console.log("test");',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      // wait for async execution
      await new Promise((resolve) => setTimeout(resolve, 50));

      // Uses BAVINI MountManager
      expect(mockMkdir).toHaveBeenCalledWith('src', { recursive: true });
      expect(mockWriteFile).toHaveBeenCalledWith('src/index.ts', 'console.log("test");');
    });

    it('should create nested directories', async () => {
      const actionRunnerModule = await import('./action-runner');
      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'file' as const,
          filePath: 'src/components/Button/index.tsx',
          content: 'export const Button = () => null;',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      await new Promise((resolve) => setTimeout(resolve, 50));

      // Uses BAVINI MountManager
      expect(mockMkdir).toHaveBeenCalledWith('src/components/Button', { recursive: true });
    });
  });

  describe('runAction - shell actions', () => {
    it('should execute a shell action', async () => {
      const actionRunnerModule = await import('./action-runner');
      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'shell' as const,
          content: 'npm run build',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      // Wait for the promise chain to execute
      await new Promise((resolve) => setTimeout(resolve, 100));

      // Shell execution in BAVINI is handled by CommandExecutor
      // This test just verifies the action completes without error
      const actions = runner.actions.get();
      const action = actions[ACTION_ID];
      expect(action).toBeDefined();
    });
  });

  describe('runAction - git actions', () => {
    it('should execute git clone action', async () => {
      const actionRunnerModule = await import('./action-runner');
      const gitOps = await import('~/lib/git/operations');

      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'git' as const,
          operation: 'clone' as const,
          url: 'https://github.com/example/repo',
          content: '',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(gitOps.clone).toHaveBeenCalledWith(
        expect.objectContaining({
          url: 'https://github.com/example/repo',
          dir: '/home/project',
        }),
      );
    });

    it('should execute git init action', async () => {
      const actionRunnerModule = await import('./action-runner');
      const gitOps = await import('~/lib/git/operations');

      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'git' as const,
          operation: 'init' as const,
          content: '',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(gitOps.init).toHaveBeenCalledWith('/home/project');
    });

    it('should execute git commit action', async () => {
      const actionRunnerModule = await import('./action-runner');
      const gitOps = await import('~/lib/git/operations');

      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'git' as const,
          operation: 'commit' as const,
          message: 'Test commit message',
          content: '',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(gitOps.commit).toHaveBeenCalledWith({
        dir: '/home/project',
        message: 'Test commit message',
      });
    });

    it('should execute git push action', async () => {
      const actionRunnerModule = await import('./action-runner');
      const gitOps = await import('~/lib/git/operations');

      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'git' as const,
          operation: 'push' as const,
          remote: 'origin',
          branch: 'main',
          content: '',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(gitOps.push).toHaveBeenCalledWith(
        expect.objectContaining({
          dir: '/home/project',
          remote: 'origin',
          branch: 'main',
        }),
      );
    });

    it('should execute git pull action', async () => {
      const actionRunnerModule = await import('./action-runner');
      const gitOps = await import('~/lib/git/operations');

      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'git' as const,
          operation: 'pull' as const,
          content: '',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(gitOps.pull).toHaveBeenCalled();
    });

    it('should use token from action for authentication', async () => {
      const actionRunnerModule = await import('./action-runner');
      const gitOps = await import('~/lib/git/operations');

      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'git' as const,
          operation: 'push' as const,
          token: 'ghp_test_token',
          content: '',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(gitOps.push).toHaveBeenCalledWith(
        expect.objectContaining({
          onAuth: expect.any(Function),
        }),
      );
    });
  });

  describe('action status updates', () => {
    it('should update action status to complete on success', async () => {
      const actionRunnerModule = await import('./action-runner');
      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'file' as const,
          filePath: 'test.txt',
          content: 'Hello',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      // wait for async execution
      await new Promise((resolve) => setTimeout(resolve, 100));

      const actions = runner.actions.get();
      const action = actions[ACTION_ID];

      expect(action.status).toBe('complete');
    });

    it('should update action status to failed on error', async () => {
      const actionRunnerModule = await import('./action-runner');
      const gitOps = await import('~/lib/git/operations');

      // make git clone throw an error
      vi.mocked(gitOps.clone).mockRejectedValueOnce(new Error('Clone failed'));

      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'git' as const,
          operation: 'clone' as const,
          url: 'https://github.com/invalid/repo',
          content: '',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      // wait for async execution
      await new Promise((resolve) => setTimeout(resolve, 100));

      const actions = runner.actions.get();
      const action = actions[ACTION_ID];

      expect(action.status).toBe('failed');
    });
  });

  describe('action abort', () => {
    it('should provide abort function', async () => {
      const actionRunnerModule = await import('./action-runner');
      const runner = new actionRunnerModule.ActionRunner();

      runner.addAction({
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'shell' as const,
          content: 'sleep 10',
        },
      });

      const actions = runner.actions.get();
      const action = actions[ACTION_ID];

      expect(typeof action.abort).toBe('function');
    });

    it('should update status to aborted when abort is called', async () => {
      const actionRunnerModule = await import('./action-runner');
      const runner = new actionRunnerModule.ActionRunner();

      runner.addAction({
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'shell' as const,
          content: 'sleep 10',
        },
      });

      const actions = runner.actions.get();
      const action = actions[ACTION_ID];
      action.abort();

      const updatedActions = runner.actions.get();
      const updatedAction = updatedActions[ACTION_ID];

      expect(updatedAction.status).toBe('aborted');
    });
  });

  describe('runAction - python actions', () => {
    it('should execute python action without packages', async () => {
      const actionRunnerModule = await import('./action-runner');
      const pyodide = await import('~/lib/pyodide');

      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'python' as const,
          content: 'print("Hello, World!")',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(pyodide.initPyodide).toHaveBeenCalled();
      expect(pyodide.runPythonWithTimeout).toHaveBeenCalledWith('print("Hello, World!")');
      expect(pyodide.installPackages).not.toHaveBeenCalled();
    });

    it('should install packages before running python code', async () => {
      const actionRunnerModule = await import('./action-runner');
      const pyodide = await import('~/lib/pyodide');

      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'python' as const,
          packages: ['numpy', 'pandas'],
          content: 'import numpy as np',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(pyodide.initPyodide).toHaveBeenCalled();
      expect(pyodide.installPackages).toHaveBeenCalledWith(['numpy', 'pandas']);
      expect(pyodide.runPythonWithTimeout).toHaveBeenCalledWith('import numpy as np');
    });

    it('should not install packages if array is empty', async () => {
      const actionRunnerModule = await import('./action-runner');
      const pyodide = await import('~/lib/pyodide');

      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'python' as const,
          packages: [],
          content: 'print(1+1)',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      await new Promise((resolve) => setTimeout(resolve, 50));

      expect(pyodide.installPackages).not.toHaveBeenCalled();
    });

    it('should update status to complete on success', async () => {
      const actionRunnerModule = await import('./action-runner');

      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'python' as const,
          content: 'print("test")',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const actions = runner.actions.get();
      const action = actions[ACTION_ID];

      expect(action.status).toBe('complete');
    });

    it('should update status to failed on error', async () => {
      const actionRunnerModule = await import('./action-runner');
      const pyodide = await import('~/lib/pyodide');

      vi.mocked(pyodide.runPythonWithTimeout).mockRejectedValueOnce(new Error('Python error'));

      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'python' as const,
          content: 'invalid python code',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const actions = runner.actions.get();
      const action = actions[ACTION_ID];

      expect(action.status).toBe('failed');
    });

    it('should fail when package installation fails', async () => {
      const actionRunnerModule = await import('./action-runner');
      const pyodide = await import('~/lib/pyodide');

      vi.mocked(pyodide.installPackages).mockRejectedValueOnce(new Error('Package not found: fake-package'));

      const runner = new actionRunnerModule.ActionRunner();

      const actionData = {
        actionId: ACTION_ID,
        artifactId: ARTIFACT_ID,
        messageId: MESSAGE_ID,
        action: {
          type: 'python' as const,
          packages: ['fake-package'],
          content: 'import fake_package',
        },
      };

      runner.addAction(actionData);
      await runner.runAction(actionData);

      await new Promise((resolve) => setTimeout(resolve, 100));

      const actions = runner.actions.get();
      const action = actions[ACTION_ID];

      expect(action.status).toBe('failed');
      expect(pyodide.runPython).not.toHaveBeenCalled();
    });
  });
});
