/**
 * Tests pour le système d'agents BAVINI - Phase 3
 * Tester Agent, Deployer Agent, Checkpoint Manager, Error Recovery
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRegistry } from '../core/agent-registry';
import { TesterAgent, createTesterAgent } from '../agents/tester-agent';
import { DeployerAgent, createDeployerAgent } from '../agents/deployer-agent';
import { createTestToolHandlers, createMockTestRunner } from '../tools/test-tools';
import { createGitToolHandlers, createMockGit } from '../tools/git-tools';
import { CheckpointManager, InMemoryCheckpointStorage, createCheckpointManager } from '../utils/checkpoint-manager';
import { ErrorRecovery, createErrorRecovery } from '~/lib/errors/error-recovery';
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
 * TESTS TEST TOOLS
 * ============================================================================
 */

describe('TestTools', () => {
  let mockRunner: ReturnType<typeof createMockTestRunner>;
  let handlers: ReturnType<typeof createTestToolHandlers>;

  beforeEach(() => {
    mockRunner = createMockTestRunner({
      testResults: {
        success: true,
        output: 'All tests passed',
        passed: 10,
        failed: 0,
      },
    });
    handlers = createTestToolHandlers(mockRunner);
  });

  describe('run_tests', () => {
    it('should run all tests', async () => {
      const result = await handlers.run_tests({});

      expect(result.success).toBe(true);
      expect(result.output).toContain('passed');
    });

    it('should run tests with pattern', async () => {
      const result = await handlers.run_tests({
        pattern: '*.spec.ts',
      });

      expect(result.success).toBe(true);
    });

    it('should run tests with coverage', async () => {
      const result = await handlers.run_tests({
        coverage: true,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('run_single_test', () => {
    it('should run a single test file', async () => {
      const result = await handlers.run_single_test({
        file: 'tests/example.spec.ts',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('example.spec.ts');
    });
  });

  describe('list_tests', () => {
    it('should list available tests', async () => {
      const result = await handlers.list_tests({});

      expect(result.success).toBe(true);
      expect(result.output).toContain('test files');
    });
  });

  describe('coverage_report', () => {
    it('should return coverage summary', async () => {
      const result = await handlers.coverage_report({
        format: 'summary',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Coverage');
    });

    it('should return detailed coverage', async () => {
      const result = await handlers.coverage_report({
        format: 'detailed',
        threshold: 80,
      });

      expect(result.success).toBe(true);
    });
  });

  describe('analyze_test_results', () => {
    it('should analyze test output', async () => {
      const result = await handlers.analyze_test_results({
        testOutput: '10 passed, 2 failed, 1 skipped\nError: Test failed',
      });

      expect(result.success).toBe(true);
    });
  });
});

/*
 * ============================================================================
 * TESTS GIT TOOLS
 * ============================================================================
 */

describe('GitTools', () => {
  let mockGit: ReturnType<typeof createMockGit>;
  let handlers: ReturnType<typeof createGitToolHandlers>;

  beforeEach(() => {
    mockGit = createMockGit({
      isRepo: true,
      currentBranch: 'main',
      branches: [
        { name: 'main', current: true },
        { name: 'develop', current: false },
      ],
    });
    handlers = createGitToolHandlers(mockGit);
  });

  describe('git_init', () => {
    it('should initialize a repository', async () => {
      const result = await handlers.git_init({});

      expect(result.success).toBe(true);
      expect(result.output).toContain('Initialized');
    });
  });

  describe('git_status', () => {
    it('should return status', async () => {
      const result = await handlers.git_status({});

      expect(result.success).toBe(true);
      expect(result.output).toContain('main');
    });

    it('should return short status', async () => {
      const result = await handlers.git_status({ short: true });

      expect(result.success).toBe(true);
    });
  });

  describe('git_add', () => {
    it('should add files', async () => {
      const result = await handlers.git_add({
        files: ['file.txt'],
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Added');
    });

    it('should add all files', async () => {
      const result = await handlers.git_add({
        files: ['.'],
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('all files');
    });
  });

  describe('git_commit', () => {
    it('should create a commit', async () => {
      const result = await handlers.git_commit({
        message: 'Test commit',
      });

      expect(result.success).toBe(true);
    });
  });

  describe('git_branch', () => {
    it('should list branches', async () => {
      const result = await handlers.git_branch({
        action: 'list',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('main');
    });

    it('should create a branch', async () => {
      const result = await handlers.git_branch({
        action: 'create',
        name: 'feature/new',
      });

      expect(result.success).toBe(true);
      expect(result.output).toContain('Created');
    });

    it('should require name for create', async () => {
      const result = await handlers.git_branch({
        action: 'create',
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('required');
    });
  });

  describe('git_log', () => {
    it('should show log', async () => {
      const result = await handlers.git_log({});

      expect(result.success).toBe(true);
    });
  });

  describe('git_push', () => {
    it('should push changes', async () => {
      const result = await handlers.git_push({});

      expect(result.success).toBe(true);
      expect(result.output).toContain('Pushed');
    });

    it('should reject force push', async () => {
      const result = await handlers.git_push({
        force: true,
      });

      expect(result.success).toBe(false);
      expect(result.error).toContain('INTERDIT');
    });
  });

  describe('git_pull', () => {
    it('should pull changes', async () => {
      const result = await handlers.git_pull({});

      expect(result.success).toBe(true);
      expect(result.output).toContain('Pulled');
    });
  });
});

/*
 * ============================================================================
 * TESTS TESTER AGENT
 * ============================================================================
 */

describe('TesterAgent', () => {
  let agent: TesterAgent;
  let mockRunner: ReturnType<typeof createMockTestRunner>;

  beforeEach(() => {
    agent = createTesterAgent();
    mockRunner = createMockTestRunner();
    agent.setTestRunner(mockRunner);
  });

  it('should have correct configuration', () => {
    expect(agent.getName()).toBe('tester');
    expect(agent.getStatus()).toBe('idle');
    expect(agent.isAvailable()).toBe(true);
  });

  it('should return error without TestRunner', async () => {
    const agentNoRunner = createTesterAgent();

    const task: Task = {
      id: 'test-1',
      type: 'tester',
      prompt: 'Run tests',
      status: 'pending',
      createdAt: new Date(),
    };

    const result = await agentNoRunner.run(task, 'fake-api-key');

    expect(result.success).toBe(false);
    expect(result.output).toContain('TestRunner not initialized');
  });

  it('should have description for orchestrator', () => {
    const description = agent.getDescription();
    expect(description.toLowerCase()).toContain('test');
  });

  it('should track test history', () => {
    const history = agent.getTestHistory();
    expect(Array.isArray(history)).toBe(true);
  });

  it('should have test tools available', () => {
    const tools = agent.getAvailableTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain('run_tests');
    expect(toolNames).toContain('analyze_test_results');
    expect(toolNames).toContain('coverage_report');
  });
});

/*
 * ============================================================================
 * TESTS DEPLOYER AGENT
 * ============================================================================
 */

describe('DeployerAgent', () => {
  let agent: DeployerAgent;
  let mockGit: ReturnType<typeof createMockGit>;

  beforeEach(() => {
    agent = createDeployerAgent();
    mockGit = createMockGit();
    agent.setGit(mockGit);
  });

  it('should have correct configuration', () => {
    expect(agent.getName()).toBe('deployer');
    expect(agent.getStatus()).toBe('idle');
    expect(agent.isAvailable()).toBe(true);
  });

  it('should return error without Git', async () => {
    const agentNoGit = createDeployerAgent();

    const task: Task = {
      id: 'test-1',
      type: 'deployer',
      prompt: 'Commit changes',
      status: 'pending',
      createdAt: new Date(),
    };

    const result = await agentNoGit.run(task, 'fake-api-key');

    expect(result.success).toBe(false);
    expect(result.output).toContain('Git interface not initialized');
  });

  it('should have description for orchestrator', () => {
    const description = agent.getDescription();
    expect(description.toLowerCase()).toContain('déploiement');
  });

  it('should track commit history', () => {
    const history = agent.getCommitHistory();
    expect(Array.isArray(history)).toBe(true);
  });

  it('should track operation history', () => {
    const history = agent.getOperationHistory();
    expect(Array.isArray(history)).toBe(true);
  });

  it('should have git tools available', () => {
    const tools = agent.getAvailableTools();
    const toolNames = tools.map((t) => t.name);

    expect(toolNames).toContain('git_status');
    expect(toolNames).toContain('git_commit');
    expect(toolNames).toContain('git_push');
    expect(toolNames).toContain('git_branch');
  });

  it('should check if in repository', async () => {
    const isInRepo = await agent.isInRepository();
    expect(typeof isInRepo).toBe('boolean');
  });

  it('should get current branch', async () => {
    const branch = await agent.getCurrentBranch();
    expect(branch).toBe('main');
  });
});

/*
 * ============================================================================
 * TESTS CHECKPOINT MANAGER
 * ============================================================================
 */

describe('CheckpointManager', () => {
  let manager: CheckpointManager;
  let storage: InMemoryCheckpointStorage;

  beforeEach(() => {
    storage = new InMemoryCheckpointStorage();
    manager = new CheckpointManager(storage);
  });

  it('should save a checkpoint', async () => {
    const task: Task = {
      id: 'task-1',
      type: 'coder',
      prompt: 'Write code',
      status: 'in_progress',
      createdAt: new Date(),
    };

    const checkpoint = await manager.saveCheckpoint(
      task.id,
      task,
      'coder',
      [{ role: 'user', content: 'test' }],
      undefined,
      { reason: 'pause' },
    );

    expect(checkpoint.id).toBeDefined();
    expect(checkpoint.taskId).toBe('task-1');
    expect(checkpoint.agentName).toBe('coder');
  });

  it('should load a checkpoint', async () => {
    const task: Task = {
      id: 'task-2',
      type: 'explore',
      prompt: 'Find files',
      status: 'in_progress',
      createdAt: new Date(),
    };

    const saved = await manager.saveCheckpoint(task.id, task, 'explore', []);

    const loaded = await manager.loadCheckpoint(saved.id);

    expect(loaded).not.toBeNull();
    expect(loaded?.taskId).toBe('task-2');
  });

  it('should load by task ID', async () => {
    const task: Task = {
      id: 'task-3',
      type: 'builder',
      prompt: 'Build project',
      status: 'in_progress',
      createdAt: new Date(),
    };

    await manager.saveCheckpoint(task.id, task, 'builder', []);

    const loaded = await manager.loadByTaskId('task-3');

    expect(loaded).not.toBeNull();
    expect(loaded?.agentName).toBe('builder');
  });

  it('should resume from checkpoint', async () => {
    const task: Task = {
      id: 'task-4',
      type: 'tester',
      prompt: 'Run tests',
      status: 'in_progress',
      createdAt: new Date(),
    };

    const saved = await manager.saveCheckpoint(task.id, task, 'tester', [{ role: 'user', content: 'run tests' }]);

    const resumed = await manager.resumeFromCheckpoint(saved.id);

    expect(resumed).not.toBeNull();
    expect(resumed?.task.id).toBe('task-4');
    expect(resumed?.agentName).toBe('tester');
  });

  it('should delete a checkpoint', async () => {
    const task: Task = {
      id: 'task-5',
      type: 'deployer',
      prompt: 'Deploy',
      status: 'in_progress',
      createdAt: new Date(),
    };

    const saved = await manager.saveCheckpoint(task.id, task, 'deployer', []);

    await manager.deleteCheckpoint(saved.id);

    const loaded = await manager.loadCheckpoint(saved.id);
    expect(loaded).toBeNull();
  });

  it('should list all checkpoints', async () => {
    const task1: Task = {
      id: 'task-6',
      type: 'coder',
      prompt: 'Code',
      status: 'in_progress',
      createdAt: new Date(),
    };
    const task2: Task = {
      id: 'task-7',
      type: 'builder',
      prompt: 'Build',
      status: 'in_progress',
      createdAt: new Date(),
    };

    await manager.saveCheckpoint(task1.id, task1, 'coder', []);
    await manager.saveCheckpoint(task2.id, task2, 'builder', []);

    const all = await manager.listCheckpoints();

    expect(all.length).toBe(2);
  });

  it('should check if checkpoint exists', async () => {
    const task: Task = {
      id: 'task-8',
      type: 'explore',
      prompt: 'Explore',
      status: 'in_progress',
      createdAt: new Date(),
    };

    await manager.saveCheckpoint(task.id, task, 'explore', []);

    const exists = await manager.hasCheckpoint('task-8');
    const notExists = await manager.hasCheckpoint('nonexistent');

    expect(exists).toBe(true);
    expect(notExists).toBe(false);
  });
});

/*
 * ============================================================================
 * TESTS ERROR RECOVERY
 * ============================================================================
 */

describe('ErrorRecovery', () => {
  let registry: AgentRegistry;
  let recovery: ErrorRecovery;

  beforeEach(() => {
    AgentRegistry.resetInstance();
    registry = AgentRegistry.getInstance();
    recovery = createErrorRecovery(registry);
  });

  describe('analyzeError', () => {
    it('should classify network errors', () => {
      const task: Task = {
        id: 'task-1',
        type: 'coder',
        prompt: 'Test',
        status: 'in_progress',
        createdAt: new Date(),
      };

      const analysis = recovery.analyzeError('ECONNREFUSED: Connection refused', task);

      expect(analysis.errorType).toBe('network');
      expect(analysis.recoverable).toBe(true);
    });

    it('should classify timeout errors', () => {
      const task: Task = {
        id: 'task-2',
        type: 'builder',
        prompt: 'Build',
        status: 'in_progress',
        createdAt: new Date(),
      };

      const analysis = recovery.analyzeError('Request timed out after 30000ms', task);

      expect(analysis.errorType).toBe('timeout');
      expect(analysis.recoverable).toBe(true);
    });

    it('should classify rate limit errors', () => {
      const task: Task = {
        id: 'task-3',
        type: 'explore',
        prompt: 'Search',
        status: 'in_progress',
        createdAt: new Date(),
      };

      const analysis = recovery.analyzeError('429 Too Many Requests', task);

      expect(analysis.errorType).toBe('rate_limit');
      expect(analysis.recoverable).toBe(true);
    });

    it('should classify permission errors', () => {
      const task: Task = {
        id: 'task-4',
        type: 'deployer',
        prompt: 'Push',
        status: 'in_progress',
        createdAt: new Date(),
      };

      const analysis = recovery.analyzeError('403 Forbidden: Permission denied', task);

      expect(analysis.errorType).toBe('permission');
      expect(analysis.recoverable).toBe(false);
    });

    it('should provide recovery options', () => {
      const task: Task = {
        id: 'task-5',
        type: 'tester',
        prompt: 'Test',
        status: 'in_progress',
        createdAt: new Date(),
      };

      const analysis = recovery.analyzeError('Network error occurred', task);

      expect(analysis.recoveryOptions.length).toBeGreaterThan(0);
      expect(analysis.recommendedAction).toBeDefined();
    });

    it('should simplify error messages', () => {
      const task: Task = {
        id: 'task-6',
        type: 'coder',
        prompt: 'Code',
        status: 'in_progress',
        createdAt: new Date(),
      };

      const analysis = recovery.analyzeError('ETIMEDOUT: Connection timed out', task);

      expect(analysis.simplifiedMessage).toBe("Délai d'attente dépassé");
    });
  });

  describe('retry management', () => {
    it('should track retry count', () => {
      expect(recovery.getRetryCount('task-1')).toBe(0);
    });

    it('should reset retry count', () => {
      recovery.resetRetryCount('task-1');
      expect(recovery.getRetryCount('task-1')).toBe(0);
    });

    it('should reset all retry counts', () => {
      recovery.resetAllRetryCounts();

      // Should not throw
    });
  });
});

/*
 * ============================================================================
 * TESTS MOCK TEST RUNNER
 * ============================================================================
 */

describe('MockTestRunner', () => {
  it('should run tests with default results', async () => {
    const runner = createMockTestRunner();
    const result = await runner.runTests();

    expect(result.success).toBe(true);
    expect(result.totalPassed).toBeGreaterThanOrEqual(0);
  });

  it('should run tests with custom results', async () => {
    const runner = createMockTestRunner({
      testResults: {
        success: false,
        output: '5 passed, 3 failed',
        passed: 5,
        failed: 3,
      },
    });

    const result = await runner.runTests();

    expect(result.success).toBe(false);
    expect(result.totalPassed).toBe(5);
    expect(result.totalFailed).toBe(3);
  });

  it('should list test files', async () => {
    const runner = createMockTestRunner({
      testFiles: [
        { file: 'test1.spec.ts', tests: ['test A', 'test B'] },
        { file: 'test2.spec.ts', tests: ['test C'] },
      ],
    });

    const files = await runner.listTests();

    expect(files.length).toBe(2);
    expect(files[0].tests.length).toBe(2);
  });

  it('should return coverage report', async () => {
    const runner = createMockTestRunner();
    const coverage = await runner.getCoverageReport();

    expect(coverage).not.toBeNull();
    expect(coverage?.summary.lines.percentage).toBeDefined();
  });

  it('should detect framework', async () => {
    const runner = createMockTestRunner({ framework: 'jest' });
    const framework = await runner.detectFramework();

    expect(framework).toBe('jest');
  });
});

/*
 * ============================================================================
 * TESTS MOCK GIT
 * ============================================================================
 */

describe('MockGit', () => {
  it('should check if repository', async () => {
    const git = createMockGit({ isRepo: true });
    expect(await git.isRepository()).toBe(true);

    const notGit = createMockGit({ isRepo: false });
    expect(await notGit.isRepository()).toBe(false);
  });

  it('should get current branch', async () => {
    const git = createMockGit({ currentBranch: 'feature/test' });
    expect(await git.getCurrentBranch()).toBe('feature/test');
  });

  it('should return status', async () => {
    const git = createMockGit({
      currentBranch: 'main',
      files: [{ path: 'test.ts', status: 'modified', staged: false }],
    });

    const status = await git.status();

    expect(status.branch).toBe('main');
    expect(status.files.length).toBe(1);
  });

  it('should create commits', async () => {
    const git = createMockGit();

    const commit = await git.commit('Test commit');

    expect(commit.message).toBe('Test commit');
    expect(commit.hash).toBeDefined();
  });

  it('should manage branches', async () => {
    const git = createMockGit({
      branches: [{ name: 'main', current: true }],
    });

    await git.branch('create', 'new-branch');

    const branches = (await git.branch('list')) as Array<{ name: string }>;

    expect(branches.some((b) => b.name === 'new-branch')).toBe(true);
  });
});

/*
 * ============================================================================
 * TESTS INTEGRATION
 * ============================================================================
 */

describe('Integration Phase 3', () => {
  it('should register all Phase 3 agents', () => {
    AgentRegistry.resetInstance();

    const registry = AgentRegistry.getInstance();

    const mockRunner = createMockTestRunner();
    const mockGit = createMockGit();

    const tester = createTesterAgent(mockRunner);
    const deployer = createDeployerAgent(mockGit);

    registry.register(tester);
    registry.register(deployer);

    expect(registry.getAll().size).toBe(2);
    expect(registry.getNames()).toContain('tester');
    expect(registry.getNames()).toContain('deployer');
  });

  it('should find agents by capability', () => {
    AgentRegistry.resetInstance();

    const registry = AgentRegistry.getInstance();

    const mockRunner = createMockTestRunner();
    const tester = createTesterAgent(mockRunner);
    registry.register(tester);

    const agents = registry.findByCapability('run_tests');
    expect(agents).toBeDefined();
    expect(agents.length).toBeGreaterThan(0);
    expect(agents[0].getName()).toBe('tester');
  });

  it('should create checkpoint manager with factory', () => {
    const manager = createCheckpointManager();
    expect(manager).toBeInstanceOf(CheckpointManager);
  });

  it('should create error recovery with factory', () => {
    AgentRegistry.resetInstance();

    const registry = AgentRegistry.getInstance();
    const recovery = createErrorRecovery(registry);

    expect(recovery).toBeInstanceOf(ErrorRecovery);
  });
});
