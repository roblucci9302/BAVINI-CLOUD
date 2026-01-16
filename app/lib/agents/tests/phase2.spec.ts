/**
 * Tests pour le système d'agents BAVINI - Phase 2
 * Coder Agent, Builder Agent, Task Queue
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRegistry } from '../core/agent-registry';
import { TaskQueue, createTaskQueue } from '../core/task-queue';
import { CoderAgent, createCoderAgent } from '../agents/coder-agent';
import { BuilderAgent, createBuilderAgent } from '../agents/builder-agent';
import { createWriteToolHandlers, createMockWritableFileSystem } from '../tools/write-tools';
import { createShellToolHandlers, createMockShell } from '../tools/shell-tools';
import type { Task } from '../types';

// Mock du client Anthropic
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          content: [
            {
              type: 'text',
              text: 'Test response from Claude',
            },
          ],
          model: 'claude-sonnet-4-5-20250929',
          stop_reason: 'end_turn',
          usage: {
            input_tokens: 100,
            output_tokens: 50,
          },
        }),
      },
    })),
  };
});

/*
 * ============================================================================
 * TESTS WRITE TOOLS
 * ============================================================================
 */

describe('WriteTools', () => {
  let mockFs: ReturnType<typeof createMockWritableFileSystem>;
  let handlers: ReturnType<typeof createWriteToolHandlers>;

  beforeEach(() => {
    mockFs = createMockWritableFileSystem({
      'existing.txt': 'original content',
      'src/index.ts': 'export const hello = "world";',
    });
    handlers = createWriteToolHandlers(mockFs);
  });

  describe('write_file', () => {
    it('should create a new file', async () => {
      const result = await handlers.write_file({
        path: 'new-file.txt',
        content: 'Hello World',
      });

      expect(result.success).toBe(true);
      expect(await mockFs.readFile('new-file.txt')).toBe('Hello World');
    });

    it('should overwrite existing file', async () => {
      const result = await handlers.write_file({
        path: 'existing.txt',
        content: 'new content',
      });

      expect(result.success).toBe(true);
      expect(await mockFs.readFile('existing.txt')).toBe('new content');
    });

    it('should create directories if needed', async () => {
      const result = await handlers.write_file({
        path: 'deep/nested/folder/file.txt',
        content: 'nested file',
        createDirectories: true,
      });

      expect(result.success).toBe(true);
      expect(await mockFs.readFile('deep/nested/folder/file.txt')).toBe('nested file');
    });
  });

  describe('edit_file', () => {
    it('should edit file content', async () => {
      const result = await handlers.edit_file({
        path: 'existing.txt',
        oldContent: 'original',
        newContent: 'modified',
      });

      expect(result.success).toBe(true);
      expect(await mockFs.readFile('existing.txt')).toBe('modified content');
    });

    it('should fail if content not found', async () => {
      const result = await handlers.edit_file({
        path: 'existing.txt',
        oldContent: 'nonexistent',
        newContent: 'new',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should replace all occurrences when replaceAll is true', async () => {
      await mockFs.writeFile('repeat.txt', 'foo bar foo baz foo');

      const result = await handlers.edit_file({
        path: 'repeat.txt',
        oldContent: 'foo',
        newContent: 'replaced',
        replaceAll: true,
      });

      expect(result.success).toBe(true);
      expect(await mockFs.readFile('repeat.txt')).toBe('replaced bar replaced baz replaced');
    });
  });

  describe('delete_file', () => {
    it('should delete existing file', async () => {
      const result = await handlers.delete_file({
        path: 'existing.txt',
      });

      expect(result.success).toBe(true);
      expect(await mockFs.exists('existing.txt')).toBe(false);
    });

    it('should fail if file not found', async () => {
      const result = await handlers.delete_file({
        path: 'nonexistent.txt',
      });

      expect(result.success).toBe(false);
    });
  });

  describe('move_file', () => {
    it('should move file to new location', async () => {
      const result = await handlers.move_file({
        oldPath: 'existing.txt',
        newPath: 'moved.txt',
      });

      expect(result.success).toBe(true);
      expect(await mockFs.exists('existing.txt')).toBe(false);
      expect(await mockFs.readFile('moved.txt')).toBe('original content');
    });
  });

  describe('create_directory', () => {
    it('should create directory', async () => {
      const result = await handlers.create_directory({
        path: 'new-dir',
      });

      expect(result.success).toBe(true);
      expect(await mockFs.exists('new-dir')).toBe(true);
    });
  });
});

/*
 * ============================================================================
 * TESTS SHELL TOOLS
 * ============================================================================
 */

describe('ShellTools', () => {
  let mockShell: ReturnType<typeof createMockShell>;
  let handlers: ReturnType<typeof createShellToolHandlers>;

  beforeEach(() => {
    mockShell = createMockShell({
      execResults: {
        'pnpm install': { exitCode: 0, stdout: 'Installed packages', stderr: '' },
        'pnpm run build': { exitCode: 0, stdout: 'Build successful', stderr: '' },
        'pnpm add react': { exitCode: 0, stdout: 'Added react', stderr: '' },
      },
    });
    handlers = createShellToolHandlers(mockShell);
  });

  describe('npm_command', () => {
    it('should run npm command', async () => {
      const result = await handlers.npm_command({
        command: 'install',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Installed');
    });

    it('should run npm build', async () => {
      const result = await handlers.npm_command({
        command: 'run build',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('install_dependencies', () => {
    it('should install packages', async () => {
      const result = await handlers.install_dependencies({
        packages: ['react'],
      });

      expect(result.success).toBe(true);
    });

    it('should fail without packages', async () => {
      const result = await handlers.install_dependencies({
        packages: [],
      });

      expect(result.success).toBe(false);
    });
  });

  describe('start_dev_server', () => {
    it('should start dev server', async () => {
      const result = await handlers.start_dev_server({});

      expect(result.success).toBe(true);

      const output = JSON.parse(result.output as string);
      expect(output.processId).toBeDefined();
      expect(output.port).toBeDefined();
    });
  });

  describe('stop_server', () => {
    it('should stop running server', async () => {
      // First start a server
      await handlers.start_dev_server({});

      // Then stop it
      const processes = mockShell.getRunningProcesses();
      const result = await handlers.stop_server({
        processId: processes[0]?.id,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('get_process_status', () => {
    it('should return running processes', async () => {
      await handlers.start_dev_server({});

      const result = await handlers.get_process_status({});

      expect(result.success).toBe(true);
      expect(result.output).not.toBe('No running processes');
    });
  });

  describe('shell_command safety', () => {
    it('should reject dangerous commands', async () => {
      const result = await handlers.shell_command({
        command: 'rm -rf /',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('rejected');
    });
  });
});

/*
 * ============================================================================
 * TESTS CODER AGENT
 * ============================================================================
 */

describe('CoderAgent', () => {
  let agent: CoderAgent;
  let mockFs: ReturnType<typeof createMockWritableFileSystem>;

  beforeEach(() => {
    agent = createCoderAgent();
    mockFs = createMockWritableFileSystem({
      'src/index.ts': 'export const hello = "world";',
    });
    agent.setFileSystem(mockFs);
  });

  it('should have correct configuration', () => {
    expect(agent.getName()).toBe('coder');
    expect(agent.getStatus()).toBe('idle');
    expect(agent.isAvailable()).toBe(true);
  });

  it('should return error without FileSystem', async () => {
    const agentNoFs = createCoderAgent();

    const task: Task = {
      id: 'test-1',
      type: 'coder',
      prompt: 'Create a file',
      status: 'pending',
      createdAt: new Date(),
    };

    const result = await agentNoFs.run(task, 'fake-api-key');

    expect(result.success).toBe(false);
    expect(result.output).toContain('FileSystem not initialized');
  });

  it('should have description for orchestrator', () => {
    const description = agent.getDescription();
    expect(description.toLowerCase()).toContain('développement');
    expect(description.toLowerCase()).toContain('code');
  });

  it('should track modified files', () => {
    const modifiedFiles = agent.getModifiedFiles();
    expect(modifiedFiles.size).toBe(0);
  });

  it('should have all tools available', () => {
    const tools = agent.getAvailableTools();
    const toolNames = tools.map((t) => t.name);

    // Read tools
    expect(toolNames).toContain('read_file');
    expect(toolNames).toContain('grep');
    expect(toolNames).toContain('glob');

    // Write tools
    expect(toolNames).toContain('write_file');
    expect(toolNames).toContain('edit_file');
    expect(toolNames).toContain('delete_file');
  });
});

/*
 * ============================================================================
 * TESTS BUILDER AGENT
 * ============================================================================
 */

describe('BuilderAgent', () => {
  let agent: BuilderAgent;
  let mockShell: ReturnType<typeof createMockShell>;

  beforeEach(() => {
    agent = createBuilderAgent();
    mockShell = createMockShell();
    agent.setShell(mockShell);
  });

  it('should have correct configuration', () => {
    expect(agent.getName()).toBe('builder');
    expect(agent.getStatus()).toBe('idle');
    expect(agent.isAvailable()).toBe(true);
  });

  it('should return error without Shell', async () => {
    const agentNoShell = createBuilderAgent();

    const task: Task = {
      id: 'test-1',
      type: 'builder',
      prompt: 'Run npm install',
      status: 'pending',
      createdAt: new Date(),
    };

    const result = await agentNoShell.run(task, 'fake-api-key');

    expect(result.success).toBe(false);
    expect(result.output).toContain('Shell not initialized');
  });

  it('should have description for orchestrator', () => {
    const description = agent.getDescription();
    expect(description.toLowerCase()).toContain('build');
  });

  it('should track running processes', () => {
    const processes = agent.getRunningProcesses();
    expect(Array.isArray(processes)).toBe(true);
  });

  it('should have shell tools available', () => {
    const tools = agent.getAvailableTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain('npm_command');
    expect(toolNames).toContain('shell_command');
    expect(toolNames).toContain('start_dev_server');
    expect(toolNames).toContain('install_dependencies');
  });
});

/*
 * ============================================================================
 * TESTS TASK QUEUE
 * ============================================================================
 */

describe('TaskQueue', () => {
  let registry: AgentRegistry;
  let queue: TaskQueue;

  beforeEach(() => {
    AgentRegistry.resetInstance();
    registry = AgentRegistry.getInstance();

    // Register a mock agent
    const mockFs = createMockWritableFileSystem({});
    const coderAgent = createCoderAgent(mockFs);
    registry.register(coderAgent);

    queue = createTaskQueue(registry, 'fake-api-key', {
      maxParallel: 2,
      retryDelay: 100,
      maxRetries: 1,
    });
  });

  it('should have correct initial stats', () => {
    const stats = queue.getStats();

    expect(stats.pending).toBe(0);
    expect(stats.running).toBe(0);
    expect(stats.completed).toBe(0);
    expect(stats.failed).toBe(0);
  });

  it('should get pending tasks', () => {
    const pending = queue.getPendingTasks();
    expect(Array.isArray(pending)).toBe(true);
    expect(pending.length).toBe(0);
  });

  it('should get running tasks', () => {
    const running = queue.getRunningTasks();
    expect(Array.isArray(running)).toBe(true);
    expect(running.length).toBe(0);
  });

  it('should pause and resume', () => {
    queue.pause();
    queue.resume();

    // Should not throw
  });

  it('should clear queue', () => {
    queue.clear();
    expect(queue.getStats().pending).toBe(0);
  });
});

/*
 * ============================================================================
 * TESTS MOCK WRITABLE FILESYSTEM
 * ============================================================================
 */

describe('MockWritableFileSystem', () => {
  let mockFs: ReturnType<typeof createMockWritableFileSystem>;

  beforeEach(() => {
    mockFs = createMockWritableFileSystem({
      'file1.txt': 'content1',
      'folder/file2.txt': 'content2',
    });
  });

  it('should read files', async () => {
    const content = await mockFs.readFile('file1.txt');
    expect(content).toBe('content1');
  });

  it('should write new files', async () => {
    await mockFs.writeFile('new.txt', 'new content');
    expect(await mockFs.readFile('new.txt')).toBe('new content');
  });

  it('should delete files', async () => {
    await mockFs.deleteFile('file1.txt');
    expect(await mockFs.exists('file1.txt')).toBe(false);
  });

  it('should create directories', async () => {
    await mockFs.mkdir('new-dir', { recursive: true });
    expect(await mockFs.exists('new-dir')).toBe(true);
  });

  it('should rename files', async () => {
    await mockFs.rename('file1.txt', 'renamed.txt');
    expect(await mockFs.exists('file1.txt')).toBe(false);
    expect(await mockFs.readFile('renamed.txt')).toBe('content1');
  });

  it('should get all files', () => {
    const files = mockFs.getFiles();
    expect(files['file1.txt']).toBe('content1');
    expect(files['folder/file2.txt']).toBe('content2');
  });

  it('should list directory contents', async () => {
    const entries = await mockFs.readdir('');
    const names = entries.map((e) => e.name);

    expect(names).toContain('file1.txt');
    expect(names).toContain('folder');
  });
});

/*
 * ============================================================================
 * TESTS MOCK SHELL
 * ============================================================================
 */

describe('MockShell', () => {
  it('should execute commands', async () => {
    const shell = createMockShell();
    const result = await shell.exec('echo', ['hello']);

    expect(result.exitCode).toBe(0);
    expect(result.stdout).toContain('echo hello');
  });

  it('should spawn processes', async () => {
    const shell = createMockShell();
    const result = await shell.spawn('npm', ['run', 'dev']);

    expect(result.processId).toBeDefined();
    expect(result.port).toBeDefined();
  });

  it('should kill processes', async () => {
    const shell = createMockShell();
    const { processId } = await shell.spawn('npm', ['run', 'dev']);

    const killed = await shell.kill(processId);
    expect(killed).toBe(true);
  });

  it('should track running processes', async () => {
    const shell = createMockShell();
    await shell.spawn('npm', ['run', 'dev']);

    const processes = shell.getRunningProcesses();
    expect(processes.length).toBe(1);
  });

  it('should use custom exec results', async () => {
    const shell = createMockShell({
      execResults: {
        'custom command': { exitCode: 0, stdout: 'custom output', stderr: '' },
      },
    });

    const result = await shell.exec('custom', ['command']);
    expect(result.stdout).toBe('custom output');
  });
});

/*
 * ============================================================================
 * TESTS INTEGRATION
 * ============================================================================
 */

describe('Integration Phase 2', () => {
  it('should register all Phase 2 agents', () => {
    AgentRegistry.resetInstance();

    const registry = AgentRegistry.getInstance();

    const mockFs = createMockWritableFileSystem({});
    const mockShell = createMockShell();

    const coder = createCoderAgent(mockFs);
    const builder = createBuilderAgent(mockShell);

    registry.register(coder);
    registry.register(builder);

    expect(registry.getAll().size).toBe(2);
    expect(registry.getNames()).toContain('coder');
    expect(registry.getNames()).toContain('builder');
  });

  it('should find agents by capability', () => {
    AgentRegistry.resetInstance();

    const registry = AgentRegistry.getInstance();

    const mockFs = createMockWritableFileSystem({});
    const coder = createCoderAgent(mockFs);
    registry.register(coder);

    const agents = registry.findByCapability('write_file');
    expect(agents).toBeDefined();
    expect(agents.length).toBeGreaterThan(0);
    expect(agents[0].getName()).toBe('coder');
  });
});
