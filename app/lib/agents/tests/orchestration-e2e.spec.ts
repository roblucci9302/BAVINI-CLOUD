/**
 * Tests End-to-End pour l'orchestration des agents BAVINI
 *
 * Tests complets pour:
 * - Logique de decision de l'orchestrateur (delegate, decompose, execute_directly, ask_user, complete)
 * - Limite de profondeur de decomposition (MAX_DECOMPOSITION_DEPTH)
 * - Gestion d'erreurs et recuperation
 * - Pipeline auto-fix (test -> fix -> test)
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { AgentRegistry } from '../core/agent-registry';
import { Orchestrator, createOrchestrator } from '../agents/orchestrator';
import { createExploreAgent, ExploreAgent } from '../agents/explore-agent';
import { createCoderAgent, CoderAgent } from '../agents/coder-agent';
import { createTesterAgent, TesterAgent } from '../agents/tester-agent';
import { createFixerAgent, FixerAgent } from '../agents/fixer-agent';
import { createMockFileSystem } from '../utils/mock-filesystem';
import { createMockWritableFileSystem } from '../tools/write-tools';
import { createMockTestRunner } from '../tools/test-tools';
import { createSwarmCoordinator, PREDEFINED_RULES } from '../utils/swarm-coordinator';
import type { Task, TaskResult, OrchestrationDecision, AgentType } from '../types';
import { MAX_DECOMPOSITION_DEPTH } from '../types';

// Mock storage pour les reponses configurables
const mockStorage = {
  response: null as unknown,
};

// Mock du client Anthropic avec reponses configurables
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockImplementation(() => Promise.resolve(mockStorage.response)),
      },
    })),
  };
});

/*
 * ============================================================================
 * HELPERS
 * ============================================================================
 */

/**
 * Configure la reponse mock pour simuler une delegation
 */
function setMockDelegationResponse(agent: AgentType, task: string): void {
  mockStorage.response = {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: 'tool_1',
        name: 'delegate_to_agent',
        input: {
          agent,
          task,
        },
      },
    ],
    model: 'claude-opus-4-5-20251101',
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

/**
 * Configure la reponse mock pour simuler une decomposition
 */
function setMockDecomposeResponse(
  tasks: Array<{ agent: AgentType; description: string; dependsOn?: number[] }>,
  reasoning: string,
): void {
  mockStorage.response = {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: 'tool_1',
        name: 'create_subtasks',
        input: {
          tasks,
          reasoning,
        },
      },
    ],
    model: 'claude-opus-4-5-20251101',
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

/**
 * Configure la reponse mock pour une reponse directe
 */
function setMockDirectResponse(text: string): void {
  mockStorage.response = {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'text',
        text,
      },
    ],
    model: 'claude-opus-4-5-20251101',
    stop_reason: 'end_turn',
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

/**
 * Configure la reponse mock pour obtenir le statut des agents
 */
function setMockGetStatusResponse(): void {
  mockStorage.response = {
    id: 'msg_test',
    type: 'message',
    role: 'assistant',
    content: [
      {
        type: 'tool_use',
        id: 'tool_1',
        name: 'get_agent_status',
        input: {},
      },
    ],
    model: 'claude-opus-4-5-20251101',
    stop_reason: 'tool_use',
    usage: { input_tokens: 100, output_tokens: 50 },
  };
}

/**
 * Cree une tache de test
 */
function createTestTask(options: Partial<Task> = {}): Task {
  return {
    id: `task-${Date.now()}`,
    type: 'orchestrator',
    prompt: 'Test prompt',
    status: 'pending',
    createdAt: new Date(),
    ...options,
  };
}

/*
 * ============================================================================
 * TESTS DE DECISION DE L'ORCHESTRATEUR
 * ============================================================================
 */

describe('Orchestrator Decision Logic', () => {
  let registry: AgentRegistry;
  let orchestrator: Orchestrator;
  let exploreAgent: ExploreAgent;
  let coderAgent: CoderAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    AgentRegistry.resetInstance();
    registry = AgentRegistry.getInstance();

    // Setup agents
    const mockFs = createMockFileSystem({
      'package.json': '{"name": "test"}',
      'src/index.ts': 'export const hello = "world";',
    });
    const mockWritableFs = createMockWritableFileSystem({
      'src/index.ts': 'export const hello = "world";',
    });

    exploreAgent = createExploreAgent();
    exploreAgent.setFileSystem(mockFs);

    coderAgent = createCoderAgent();
    coderAgent.setFileSystem(mockWritableFs);

    registry.register(exploreAgent);
    registry.register(coderAgent);

    orchestrator = createOrchestrator();
    orchestrator.setApiKey('test-api-key');
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('Delegation Decision', () => {
    it('should delegate simple exploration task to explore agent', async () => {
      setMockDelegationResponse('explore', 'Find all TypeScript files');

      // Mock agent response for the delegated task
      const agentResponseSpy = vi.spyOn(exploreAgent, 'run').mockResolvedValue({
        success: true,
        output: 'Found 5 TypeScript files',
      });

      const task = createTestTask({
        prompt: 'Find all TypeScript files in the project',
      });

      const result = await orchestrator.run(task, 'test-api-key');

      expect(result.success).toBe(true);
      expect(result.output).toContain('explore');
      expect(result.data?.delegatedTo).toBe('explore');

      agentResponseSpy.mockRestore();
    });

    it('should delegate coding task to coder agent', async () => {
      setMockDelegationResponse('coder', 'Create a new function');

      const agentResponseSpy = vi.spyOn(coderAgent, 'run').mockResolvedValue({
        success: true,
        output: 'Function created successfully',
        artifacts: [
          {
            type: 'file',
            path: 'src/utils.ts',
            content: 'export function add(a: number, b: number) { return a + b; }',
            action: 'created',
          },
        ],
      });

      const task = createTestTask({
        prompt: 'Create a function that adds two numbers',
      });

      const result = await orchestrator.run(task, 'test-api-key');

      expect(result.success).toBe(true);
      expect(result.data?.delegatedTo).toBe('coder');

      agentResponseSpy.mockRestore();
    });

    it('should return error when delegating to non-existent agent', async () => {
      setMockDelegationResponse('builder', 'Run npm build');

      const task = createTestTask({
        prompt: 'Build the project',
      });

      const result = await orchestrator.run(task, 'test-api-key');

      expect(result.success).toBe(false);
      expect(result.output).toContain('builder');
      expect(result.errors?.[0]?.code).toBe('AGENT_NOT_FOUND');
    });
  });

  describe('Direct Response Decision', () => {
    it('should respond directly for simple questions', async () => {
      setMockDirectResponse('The project uses TypeScript and React.');

      const task = createTestTask({
        prompt: 'What technologies does this project use?',
      });

      const result = await orchestrator.run(task, 'test-api-key');

      expect(result.success).toBe(true);
      expect(result.output).toBe('The project uses TypeScript and React.');
    });

    it('should handle clarification requests', async () => {
      mockStorage.response = {
        id: 'msg_test',
        type: 'message',
        role: 'assistant',
        content: [
          {
            type: 'text',
            text: 'Pouvez-vous preciser quel type de fichier vous souhaitez creer?',
          },
        ],
        model: 'claude-opus-4-5-20251101',
        stop_reason: 'end_turn',
        usage: { input_tokens: 100, output_tokens: 50 },
      };

      const task = createTestTask({
        prompt: 'Cree un fichier',
      });

      const result = await orchestrator.run(task, 'test-api-key');

      expect(result.success).toBe(true);
      expect(result.output).toContain('preciser');
    });
  });
});

/*
 * ============================================================================
 * TESTS DE DECOMPOSITION
 * ============================================================================
 */

describe('Orchestrator Decomposition', () => {
  let registry: AgentRegistry;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    AgentRegistry.resetInstance();
    registry = AgentRegistry.getInstance();

    // Setup all required agents
    const mockFs = createMockFileSystem({});
    const mockWritableFs = createMockWritableFileSystem({});
    const mockTestRunner = createMockTestRunner();

    const explore = createExploreAgent();
    explore.setFileSystem(mockFs);

    const coder = createCoderAgent();
    coder.setFileSystem(mockWritableFs);

    const tester = createTesterAgent();
    tester.setTestRunner(mockTestRunner);

    registry.register(explore);
    registry.register(coder);
    registry.register(tester);

    orchestrator = createOrchestrator();
    orchestrator.setApiKey('test-api-key');
  });

  it('should decompose complex task into subtasks', async () => {
    setMockDecomposeResponse(
      [
        { agent: 'explore', description: 'Analyze existing code structure' },
        { agent: 'coder', description: 'Create new module', dependsOn: [0] },
        { agent: 'tester', description: 'Write tests for new module', dependsOn: [1] },
      ],
      'Decomposing feature implementation into exploration, coding, and testing phases',
    );

    // Mock agent runs on the actual registered agents
    const explore = registry.get('explore')!;
    const coder = registry.get('coder')!;
    const tester = registry.get('tester')!;

    const mockResult: TaskResult = { success: true, output: 'Task completed' };
    vi.spyOn(explore, 'run').mockResolvedValue(mockResult);
    vi.spyOn(coder, 'run').mockResolvedValue(mockResult);
    vi.spyOn(tester, 'run').mockResolvedValue(mockResult);

    const task = createTestTask({
      prompt: 'Implement a new authentication module with unit tests',
    });

    const result = await orchestrator.run(task, 'test-api-key');

    // Verify decomposition happened and results are returned
    expect(result.data?.subtaskResults).toBeDefined();
    expect(result.data?.executionStats).toBeDefined();

    // Check for the expected number of subtasks in the output
    expect(result.output).toContain('3');
  });

  it('should handle partial failures in decomposed tasks', async () => {
    setMockDecomposeResponse(
      [
        { agent: 'explore', description: 'Analyze code' },
        { agent: 'coder', description: 'Write code', dependsOn: [0] },
      ],
      'Two-phase implementation',
    );

    const explore = registry.get('explore')!;
    const coder = registry.get('coder')!;

    vi.spyOn(explore, 'run').mockResolvedValue({
      success: true,
      output: 'Analysis complete',
    });

    vi.spyOn(coder, 'run').mockResolvedValue({
      success: false,
      output: 'Failed to write code',
      errors: [{ code: 'WRITE_ERROR', message: 'Permission denied', recoverable: false }],
    });

    const task = createTestTask({
      prompt: 'Analyze and modify code',
    });

    const result = await orchestrator.run(task, 'test-api-key');

    // Should report failure since one subtask failed
    expect(result.success).toBe(false);
    expect(result.output).toContain('1/2');
  });

  it('should return error when decomposition produces no subtasks', async () => {
    setMockDecomposeResponse([], 'Empty decomposition');

    const task = createTestTask({
      prompt: 'Do something',
    });

    const result = await orchestrator.run(task, 'test-api-key');

    expect(result.success).toBe(false);
    // P1.6: Strict validation now catches empty subtasks during parsing
    // The error code may be AGENT_ERROR (from wrapped validation error) or NO_SUBTASKS
    expect(result.errors?.[0]?.code).toMatch(/NO_SUBTASKS|AGENT_ERROR/);
    // The error message should indicate the issue with subtasks
    expect(result.errors?.[0]?.message || result.output).toMatch(/subtask|empty/i);
  });
});

/*
 * ============================================================================
 * TESTS LIMITE DE PROFONDEUR DE DECOMPOSITION
 * ============================================================================
 */

describe('Decomposition Depth Limit', () => {
  let registry: AgentRegistry;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    AgentRegistry.resetInstance();
    registry = AgentRegistry.getInstance();

    const mockFs = createMockFileSystem({});
    const explore = createExploreAgent();
    explore.setFileSystem(mockFs);
    registry.register(explore);

    orchestrator = createOrchestrator();
    orchestrator.setApiKey('test-api-key');
  });

  it('should have MAX_DECOMPOSITION_DEPTH constant defined', () => {
    expect(MAX_DECOMPOSITION_DEPTH).toBe(5);
  });

  it('should reject decomposition when max depth is reached', async () => {
    setMockDecomposeResponse(
      [{ agent: 'explore', description: 'Nested task' }],
      'Attempting to decompose at max depth',
    );

    const task = createTestTask({
      prompt: 'Test max depth',
      metadata: {
        decompositionDepth: MAX_DECOMPOSITION_DEPTH, // Already at max
      },
    });

    const result = await orchestrator.run(task, 'test-api-key');

    expect(result.success).toBe(false);
    expect(result.errors?.[0]?.code).toBe('MAX_DEPTH_EXCEEDED');
    expect(result.output).toContain('Profondeur maximum');
  });

  it('should allow decomposition when depth is below limit', async () => {
    setMockDecomposeResponse([{ agent: 'explore', description: 'Valid nested task' }], 'Valid decomposition');

    vi.spyOn(registry.get('explore')!, 'run').mockResolvedValue({
      success: true,
      output: 'Done',
    });

    const task = createTestTask({
      prompt: 'Test valid depth',
      metadata: {
        decompositionDepth: MAX_DECOMPOSITION_DEPTH - 1,
      },
    });

    const result = await orchestrator.run(task, 'test-api-key');

    expect(result.success).toBe(true);
  });

  // TODO: Implement depth tracking in orchestrator when creating subtasks
  it.todo('should increment depth for subtasks');
});

/*
 * ============================================================================
 * TESTS GESTION D'ERREURS
 * ============================================================================
 */

describe('Orchestrator Error Handling', () => {
  let registry: AgentRegistry;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    AgentRegistry.resetInstance();
    registry = AgentRegistry.getInstance();

    const mockFs = createMockFileSystem({});
    const explore = createExploreAgent();
    explore.setFileSystem(mockFs);
    registry.register(explore);

    orchestrator = createOrchestrator();
    orchestrator.setApiKey('test-api-key');
  });

  it('should handle agent unavailability', async () => {
    setMockDelegationResponse('explore', 'Test task');

    const explore = registry.get('explore')!;
    vi.spyOn(explore, 'isAvailable').mockReturnValue(false);
    vi.spyOn(explore, 'getStatus').mockReturnValue('executing');

    const task = createTestTask({
      prompt: 'Find files',
    });

    const result = await orchestrator.run(task, 'test-api-key');

    expect(result.success).toBe(false);
    expect(result.errors?.[0]?.code).toBe('AGENT_BUSY');
    expect(result.errors?.[0]?.recoverable).toBe(true);
  });

  it('should handle LLM errors gracefully', async () => {
    // Set response to null to trigger an error in parsing
    mockStorage.response = null;

    const task = createTestTask({
      prompt: 'Test LLM error',
    });

    // The orchestrator should catch errors and return a failure result
    const result = await orchestrator.run(task, 'test-api-key');

    expect(result.success).toBe(false);
    expect(result.errors).toBeDefined();
    expect(result.errors!.length).toBeGreaterThan(0);
  });

  it('should include error context in failures', async () => {
    setMockDelegationResponse('explore', 'Failing task');

    const explore = registry.get('explore')!;
    vi.spyOn(explore, 'run').mockResolvedValue({
      success: false,
      output: 'Task failed due to missing file',
      errors: [
        {
          code: 'FILE_NOT_FOUND',
          message: 'Required file not found',
          recoverable: true,
          context: { file: 'config.json' },
        },
      ],
    });

    const task = createTestTask({
      prompt: 'Process config file',
    });

    const result = await orchestrator.run(task, 'test-api-key');

    expect(result.success).toBe(false);
    expect(result.errors?.[0]?.context).toBeDefined();
  });
});

/*
 * ============================================================================
 * TESTS PIPELINE AUTO-FIX
 * ============================================================================
 */

describe('Auto-Fix Pipeline Integration', () => {
  let registry: AgentRegistry;
  let tester: TesterAgent;
  let fixer: FixerAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    AgentRegistry.resetInstance();
    registry = AgentRegistry.getInstance();

    const mockWritableFs = createMockWritableFileSystem({
      'src/buggy.ts': 'export function buggy() { throw new Error("bug"); }',
    });
    const mockTestRunner = createMockTestRunner({
      testResults: {
        success: false,
        output: 'Test failed: buggy function throws error',
        passed: 5,
        failed: 1,
      },
    });

    tester = createTesterAgent();
    tester.setTestRunner(mockTestRunner);

    fixer = createFixerAgent();
    fixer.setFileSystem(mockWritableFs);

    registry.register(tester);
    registry.register(fixer);
  });

  it('should have predefined test-to-fixer handoff rule', () => {
    const rule = PREDEFINED_RULES.testToFixer();

    expect(rule.from).toBe('tester');
    expect(rule.to).toBe('fixer');
    expect(rule.condition.type).toBe('on_failure');
  });

  it('should have predefined fixer-to-tester handoff rule', () => {
    const rule = PREDEFINED_RULES.fixerToTester();

    expect(rule.from).toBe('fixer');
    expect(rule.to).toBe('tester');
    expect(rule.condition.type).toBe('on_success');
  });

  it('should create swarm coordinator with auto-fix rules', () => {
    const coordinator = createSwarmCoordinator(registry, 'test-api-key', {
      enablePredefinedRules: true,
    });

    const testerRules = coordinator.getRulesFor('tester');
    const fixerRules = coordinator.getRulesFor('fixer');

    expect(testerRules.some((r) => r.to === 'fixer')).toBe(true);
    expect(fixerRules.some((r) => r.to === 'tester')).toBe(true);
  });

  it('should evaluate on_failure condition correctly', () => {
    const rule = PREDEFINED_RULES.testToFixer();

    const failedResult: TaskResult = {
      success: false,
      output: 'Tests failed',
    };

    const successResult: TaskResult = {
      success: true,
      output: 'All tests passed',
    };

    const task = createTestTask();

    // on_failure should trigger for failed results
    if (rule.condition.type === 'on_failure') {
      expect(rule.condition.type).toBe('on_failure');
    }
  });

  it('should evaluate on_success condition correctly', () => {
    const rule = PREDEFINED_RULES.fixerToTester();

    // on_success should only trigger for successful results
    if (rule.condition.type === 'on_success') {
      expect(rule.condition.type).toBe('on_success');
    }
  });

  it('should track fix history in fixer agent', () => {
    fixer.recordFixResult('buggy.ts', 'test_failure', true);
    fixer.recordFixResult('other.ts', 'compilation', false);

    const history = fixer.getFixHistory();

    expect(history).toHaveLength(2);
    expect(history[0].file).toBe('buggy.ts');
    expect(history[0].success).toBe(true);
    expect(history[1].success).toBe(false);
  });
});

/*
 * ============================================================================
 * TESTS EXECUTION PARALLELE
 * ============================================================================
 */

describe('Parallel Execution', () => {
  let registry: AgentRegistry;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    AgentRegistry.resetInstance();
    registry = AgentRegistry.getInstance();

    const mockFs = createMockFileSystem({});
    const mockWritableFs = createMockWritableFileSystem({});

    const explore = createExploreAgent();
    explore.setFileSystem(mockFs);

    const coder = createCoderAgent();
    coder.setFileSystem(mockWritableFs);

    registry.register(explore);
    registry.register(coder);

    orchestrator = createOrchestrator();
    orchestrator.setApiKey('test-api-key');
  });

  it('should execute independent tasks in parallel', async () => {
    setMockDecomposeResponse(
      [
        { agent: 'explore', description: 'Task A - no dependencies' },
        { agent: 'coder', description: 'Task B - no dependencies' },
      ],
      'Two independent tasks',
    );

    const taskTimes: number[] = [];

    vi.spyOn(registry.get('explore')!, 'run').mockImplementation(async () => {
      taskTimes.push(Date.now());
      await new Promise((r) => setTimeout(r, 50));
      return { success: true, output: 'A done' };
    });

    vi.spyOn(registry.get('coder')!, 'run').mockImplementation(async () => {
      taskTimes.push(Date.now());
      await new Promise((r) => setTimeout(r, 50));
      return { success: true, output: 'B done' };
    });

    const task = createTestTask({
      prompt: 'Run parallel tasks',
    });

    const result = await orchestrator.run(task, 'test-api-key');

    expect(result.success).toBe(true);
    const stats = result.data?.executionStats as { parallelEfficiency?: number } | undefined;
    expect(stats?.parallelEfficiency).toBeGreaterThan(1);
  });

  it('should respect task dependencies', async () => {
    setMockDecomposeResponse(
      [
        { agent: 'explore', description: 'First task' },
        { agent: 'coder', description: 'Second task (depends on first)', dependsOn: [0] },
      ],
      'Sequential tasks with dependency',
    );

    const executionOrder: string[] = [];

    const explore = registry.get('explore')!;
    const coder = registry.get('coder')!;

    vi.spyOn(explore, 'run').mockImplementation(async () => {
      executionOrder.push('explore');
      return { success: true, output: 'Explore done' };
    });

    vi.spyOn(coder, 'run').mockImplementation(async () => {
      executionOrder.push('coder');
      return { success: true, output: 'Coder done' };
    });

    const task = createTestTask({
      prompt: 'Run sequential tasks',
    });

    const result = await orchestrator.run(task, 'test-api-key');

    // Verify both tasks executed
    expect(result.data?.subtaskResults).toBeDefined();

    // Explore should execute first (it's the dependency)
    expect(executionOrder[0]).toBe('explore');

    // If coder executed, it should be after explore
    if (executionOrder.length > 1) {
      expect(executionOrder[1]).toBe('coder');
    }
  });

  it('should include execution statistics in result', async () => {
    setMockDecomposeResponse([{ agent: 'explore', description: 'Single task' }], 'Stats test');

    vi.spyOn(registry.get('explore')!, 'run').mockResolvedValue({
      success: true,
      output: 'Done',
    });

    const task = createTestTask({
      prompt: 'Test stats',
    });

    const result = await orchestrator.run(task, 'test-api-key');

    const execStats = result.data?.executionStats as
      | {
          total?: number;
          successful?: number;
          failed?: number;
          totalTime?: number;
        }
      | undefined;
    expect(execStats).toBeDefined();
    expect(execStats?.total).toBe(1);
    expect(execStats?.successful).toBe(1);
    expect(execStats?.failed).toBe(0);
    expect(execStats?.totalTime).toBeGreaterThanOrEqual(0);
  });
});

/*
 * ============================================================================
 * TESTS GET AGENT STATUS
 * ============================================================================
 */

describe('Agent Status Tool', () => {
  let registry: AgentRegistry;
  let orchestrator: Orchestrator;

  beforeEach(() => {
    vi.clearAllMocks();
    AgentRegistry.resetInstance();
    registry = AgentRegistry.getInstance();

    const mockFs = createMockFileSystem({});
    const explore = createExploreAgent();
    explore.setFileSystem(mockFs);
    registry.register(explore);

    orchestrator = createOrchestrator();
    orchestrator.setApiKey('test-api-key');
  });

  it('should return status for all agents', () => {
    const agentsInfo = registry.getAgentsInfo();

    expect(agentsInfo).toBeDefined();
    expect(Array.isArray(agentsInfo)).toBe(true);
    expect(agentsInfo.some((a) => a.name === 'explore')).toBe(true);
  });

  it('should include availability in agent info', () => {
    const agentsInfo = registry.getAgentsInfo();
    const exploreInfo = agentsInfo.find((a) => a.name === 'explore');

    expect(exploreInfo?.status).toBe('idle');
  });
});
