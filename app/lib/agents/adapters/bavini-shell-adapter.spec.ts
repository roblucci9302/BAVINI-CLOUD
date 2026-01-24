/**
 * =============================================================================
 * Tests for BaviniShellAdapter
 * =============================================================================
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BaviniShellAdapter, createBaviniShellAdapter, type BaviniShellConfig } from './bavini-shell-adapter';
import { MemoryBackend, MountManager } from '~/lib/runtime/filesystem';

// Mock the agent stores
vi.mock('~/lib/stores/agents', () => ({
  addAgentLog: vi.fn(),
}));

describe('BaviniShellAdapter', () => {
  let adapter: BaviniShellAdapter;
  let mountManager: MountManager;
  let config: BaviniShellConfig;

  beforeEach(async () => {
    // Create fresh mount manager with memory backend for testing
    mountManager = new MountManager();
    const memoryBackend = new MemoryBackend();
    await mountManager.init({
      mounts: [{ path: '/', backend: memoryBackend }],
    });

    // Create default directories
    await mountManager.mkdir('/home', { recursive: true });
    await mountManager.mkdir('/src', { recursive: true });

    // Default config
    config = {
      strictMode: false,
      agentName: 'coder',
      cwd: '/home',
    };

    adapter = new BaviniShellAdapter(config, mountManager);
  });

  afterEach(async () => {
    await mountManager.destroy();
    vi.clearAllMocks();
  });

  describe('constructor', () => {
    it('should create adapter with provided config', () => {
      expect(adapter).toBeInstanceOf(BaviniShellAdapter);
    });

    it('should use factory function', () => {
      const factoryAdapter = createBaviniShellAdapter(config, mountManager);
      expect(factoryAdapter).toBeInstanceOf(BaviniShellAdapter);
    });

    it('should set default cwd to /home', () => {
      expect(adapter.getCwd()).toBe('/home');
    });
  });

  describe('executeCommand', () => {
    it('should execute simple command', async () => {
      const result = await adapter.executeCommand('pwd');

      expect(result.success).toBe(true);
      expect(result.output).toMatchObject({
        command: 'pwd',
        exitCode: 0,
      });
    });

    it('should execute ls command', async () => {
      await mountManager.writeTextFile('/home/test.txt', 'hello');

      const result = await adapter.executeCommand('ls');

      expect(result.success).toBe(true);
      expect((result.output as { stdout: string }).stdout).toContain('test.txt');
    });

    it('should execute echo command', async () => {
      const result = await adapter.executeCommand('echo hello world');

      expect(result.success).toBe(true);
      expect((result.output as { stdout: string }).stdout).toContain('hello world');
    });

    it('should block dangerous commands', async () => {
      const result = await adapter.executeCommand('rm -rf /');

      expect(result.success).toBe(false);
      expect(result.error).toContain('blocked');
    });

    it('should include execution time', async () => {
      const result = await adapter.executeCommand('pwd');

      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should require approval in strict mode', async () => {
      const onApprovalRequired = vi.fn().mockResolvedValue(true);
      const strictAdapter = new BaviniShellAdapter(
        {
          ...config,
          strictMode: true,
          onApprovalRequired,
        },
        mountManager,
      );

      // Even safe commands need approval in strict mode
      await strictAdapter.executeCommand('pwd');

      expect(onApprovalRequired).toHaveBeenCalled();
    });

    it('should reject if approval denied', async () => {
      const onApprovalRequired = vi.fn().mockResolvedValue(false);
      const strictAdapter = new BaviniShellAdapter(
        {
          ...config,
          strictMode: true,
          onApprovalRequired,
        },
        mountManager,
      );

      const result = await strictAdapter.executeCommand('pwd');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Command rejected by user');
    });

    it('should block unknown commands', async () => {
      // Unknown commands are blocked by the security layer for safety
      const result = await adapter.executeCommand('unknowncommand');

      expect(result.success).toBe(false);
      expect(result.error).toContain('blocked');
      expect(result.output).toBeNull();
    });
  });

  describe('npm commands', () => {
    beforeEach(async () => {
      // Create a package.json for npm tests
      const packageJson = JSON.stringify({
        name: 'test-project',
        version: '1.0.0',
        scripts: {
          test: 'echo test',
          build: 'echo build',
        },
      });
      await mountManager.writeTextFile('/home/package.json', packageJson);
    });

    it('should execute npm run', async () => {
      const result = await adapter.npmRun({ script: 'test' });

      // npm run should at least not throw
      expect(result).toBeDefined();
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should execute npm install', async () => {
      const result = await adapter.npmInstall();

      expect(result).toBeDefined();
      expect(result.executionTime).toBeGreaterThanOrEqual(0);
    });

    it('should execute npm test', async () => {
      const result = await adapter.npmTest();

      expect(result).toBeDefined();
    });

    it('should execute npm build', async () => {
      const result = await adapter.npmBuild();

      expect(result).toBeDefined();
    });
  });

  describe('git commands', () => {
    it('should execute git status', async () => {
      const result = await adapter.gitStatus();

      // Git command may fail since there's no git repo, but should not throw
      expect(result).toBeDefined();
    });

    it('should execute git diff', async () => {
      const result = await adapter.gitDiff();

      expect(result).toBeDefined();
    });

    it('should execute git add', async () => {
      const result = await adapter.gitAdd(['.']);

      expect(result).toBeDefined();
    });

    it('should require approval for git push', async () => {
      const onApprovalRequired = vi.fn().mockResolvedValue(true);
      const strictAdapter = new BaviniShellAdapter(
        {
          ...config,
          strictMode: false, // Even non-strict mode
          onApprovalRequired,
        },
        mountManager,
      );

      await strictAdapter.gitCommand({ operation: 'push' });

      // git push should always require approval
      expect(onApprovalRequired).toHaveBeenCalled();
    });
  });

  describe('cwd management', () => {
    it('should get current working directory', () => {
      expect(adapter.getCwd()).toBe('/home');
    });

    it('should change directory', async () => {
      const success = await adapter.setCwd('/src');

      expect(success).toBe(true);
      expect(adapter.getCwd()).toBe('/src');
    });

    it('should fail to change to non-existent directory', async () => {
      const success = await adapter.setCwd('/nonexistent');

      expect(success).toBe(false);
      expect(adapter.getCwd()).toBe('/home'); // Unchanged
    });

    it('should fail to change to a file', async () => {
      await mountManager.writeTextFile('/home/file.txt', 'content');

      const success = await adapter.setCwd('/home/file.txt');

      expect(success).toBe(false);
    });
  });

  describe('environment variables', () => {
    it('should get environment variables', () => {
      const env = adapter.getEnv();

      expect(env.HOME).toBe('/home');
      expect(env.PWD).toBe('/home');
    });

    it('should set environment variable', () => {
      adapter.setEnv('MY_VAR', 'my_value');

      const env = adapter.getEnv();
      expect(env.MY_VAR).toBe('my_value');
    });

    it('should use custom env from config', () => {
      const customAdapter = new BaviniShellAdapter(
        {
          ...config,
          env: { CUSTOM: 'value' },
        },
        mountManager,
      );

      const env = customAdapter.getEnv();
      expect(env.CUSTOM).toBe('value');
    });
  });

  describe('utility methods', () => {
    it('should identify safe commands', () => {
      expect(adapter.isSafeCommand('ls -la')).toBe(true);
      expect(adapter.isSafeCommand('pwd')).toBe(true);
      expect(adapter.isSafeCommand('cat file.txt')).toBe(true);
      expect(adapter.isSafeCommand('git status')).toBe(true);
      expect(adapter.isSafeCommand('npm list')).toBe(true);
    });

    it('should identify non-safe commands', () => {
      expect(adapter.isSafeCommand('npm install')).toBe(false);
      expect(adapter.isSafeCommand('git push')).toBe(false);
    });

    it('should check if command exists', () => {
      expect(adapter.hasCommand('ls')).toBe(true);
      expect(adapter.hasCommand('pwd')).toBe(true);
      expect(adapter.hasCommand('npm')).toBe(true);
      expect(adapter.hasCommand('unknowncommand')).toBe(false);
    });

    it('should list available commands', () => {
      const commands = adapter.listCommands();

      expect(commands).toContain('ls');
      expect(commands).toContain('cd');
      expect(commands).toContain('npm');
      expect(commands).toContain('cat');
    });
  });

  describe('config updates', () => {
    it('should update config', () => {
      adapter.updateConfig({ strictMode: true });

      // We can't directly check the config, but we can verify behavior
      const onApprovalRequired = vi.fn().mockResolvedValue(false);
      adapter.updateConfig({ onApprovalRequired });

      // After update, commands should use new approval handler
      // (This is a smoke test - detailed testing is above)
    });
  });

  describe('approval callbacks', () => {
    it('should call onActionExecuted after successful command with approval', async () => {
      const onActionExecuted = vi.fn();
      const onApprovalRequired = vi.fn().mockResolvedValue(true);

      const callbackAdapter = new BaviniShellAdapter(
        {
          ...config,
          strictMode: true,
          onActionExecuted,
          onApprovalRequired,
        },
        mountManager,
      );

      await callbackAdapter.executeCommand('pwd');

      expect(onActionExecuted).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'shell_command',
          agent: 'coder',
        }),
        expect.objectContaining({
          success: true,
        }),
      );
    });
  });
});
