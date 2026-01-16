/**
 * Tests pour le système d'agents BAVINI - Phase 4
 * Reviewer Agent, Fixer Agent, Review Tools, Swarm Coordinator
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRegistry } from '../core/agent-registry';
import { ReviewerAgent, createReviewerAgent } from '../agents/reviewer-agent';
import { FixerAgent, createFixerAgent } from '../agents/fixer-agent';
import { createReviewToolHandlers, createMockAnalyzer } from '../tools/review-tools';
import type {
  CodeAnalyzer,
  AnalysisResult,
  CodeIssue,
  ChangeReviewResult,
  ComplexityResult,
} from '../tools/review-tools';
import { SwarmCoordinator, createSwarmCoordinator, PREDEFINED_RULES } from '../utils/swarm-coordinator';
import type { HandoffRule, SwarmChain } from '../utils/swarm-coordinator';
import type { Task, TaskResult } from '../types';
import { createMockWritableFileSystem } from '../tools/write-tools';

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
 * TESTS REVIEW TOOLS
 * ============================================================================
 */

describe('ReviewTools', () => {
  let mockAnalyzer: CodeAnalyzer;
  let handlers: ReturnType<typeof createReviewToolHandlers>;

  beforeEach(() => {
    mockAnalyzer = createMockAnalyzer({
      analysisResult: {
        issues: [
          {
            severity: 'medium',
            type: 'quality',
            file: 'test.ts',
            line: 10,
            message: 'Function is too long',
            suggestion: 'Break into smaller functions',
          },
        ],
        score: {
          overall: 75,
          quality: 70,
          security: 85,
          performance: 75,
          maintainability: 70,
        },
      },
    });
    handlers = createReviewToolHandlers(mockAnalyzer);
  });

  describe('analyze_code', () => {
    it('should analyze code and return results', async () => {
      const result = (await handlers.analyze_code({
        content: 'function test() { return 42; }',
        file: 'test.ts',
      })) as AnalysisResult;

      expect(result.linesAnalyzed).toBeGreaterThan(0);
      expect(result.score.overall).toBe(75);
      expect(result.issues).toHaveLength(1);
    });

    it('should detect language from content', async () => {
      const result = (await handlers.analyze_code({
        content: 'const x: string = "hello";',
      })) as AnalysisResult;

      expect(result.language).toBe('typescript');
    });

    it('should analyze with specific analysis type', async () => {
      const result = (await handlers.analyze_code({
        content: 'function test() { return 42; }',
        analysisType: 'security',
      })) as AnalysisResult;

      expect(result).toBeDefined();
      expect(result.score).toBeDefined();
    });
  });

  describe('review_changes', () => {
    it('should review code changes', async () => {
      const result = (await handlers.review_changes({
        before: 'const x = 1;',
        after: 'const x = 2;\nconst y = 3;',
      })) as ChangeReviewResult;

      expect(result.additions).toBe(1);
      expect(result.filesChanged).toBe(1);
    });

    it('should detect deletions', async () => {
      const result = (await handlers.review_changes({
        before: 'const x = 1;\nconst y = 2;\nconst z = 3;',
        after: 'const x = 1;',
      })) as ChangeReviewResult;

      expect(result.deletions).toBe(2);
    });
  });

  describe('calculate_complexity', () => {
    it('should calculate cyclomatic complexity', async () => {
      const result = (await handlers.calculate_complexity({
        content: `
          function simple() { return 1; }
          function complex(x) {
            if (x > 0) return 1;
            else if (x < 0) return -1;
            else return 0;
          }
        `,
        file: 'test.ts',
      })) as ComplexityResult;

      expect(result.file).toBe('test.ts');
      expect(result.totalFunctions).toBeGreaterThan(0);
    });

    it('should mark complex functions based on threshold', async () => {
      const result = (await handlers.calculate_complexity({
        content: 'function test() { return 1; }',
        threshold: 2,
      })) as ComplexityResult & { functions: Array<{ isComplex: boolean }> };

      // Default complexity is 3 in mock, so should be marked as complex with threshold 2
      if (result.functions.length > 0) {
        expect(result.functions[0].isComplex).toBe(true);
      }
    });
  });

  describe('check_style', () => {
    it('should check for style issues', async () => {
      const result = await handlers.check_style({
        content: 'const x = 1;',
      });

      expect(Array.isArray(result)).toBe(true);
    });

    it('should detect long lines', async () => {
      const longLine = 'const x = ' + 'a'.repeat(200) + ';';
      const result = (await handlers.check_style({
        content: longLine,
      })) as CodeIssue[];

      expect(result.some((issue) => issue.message.includes('120 characters'))).toBe(true);
    });
  });

  describe('detect_code_smells', () => {
    it('should detect code smells', async () => {
      const result = await handlers.detect_code_smells({
        content: 'function test() { return 1; }',
      });

      expect(Array.isArray(result)).toBe(true);
    });
  });
});

/*
 * ============================================================================
 * TESTS REVIEWER AGENT
 * ============================================================================
 */

describe('ReviewerAgent', () => {
  let agent: ReviewerAgent;
  let mockAnalyzer: CodeAnalyzer;

  beforeEach(() => {
    // Reset singleton registry
    AgentRegistry.resetInstance();

    mockAnalyzer = createMockAnalyzer({
      analysisResult: {
        score: {
          overall: 80,
          quality: 75,
          security: 90,
          performance: 80,
          maintainability: 75,
        },
        issues: [],
      },
    });

    agent = createReviewerAgent(mockAnalyzer);
  });

  it('should create a reviewer agent', () => {
    expect(agent).toBeInstanceOf(ReviewerAgent);
    expect(agent.getName()).toBe('reviewer');
  });

  it('should have the correct configuration', () => {
    const tools = agent.getAvailableTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => t.name === 'analyze_code')).toBe(true);
    expect(tools.some((t) => t.name === 'review_changes')).toBe(true);
  });

  it('should track review history', () => {
    const history = agent.getReviewHistory();
    expect(Array.isArray(history)).toBe(true);
  });

  it('should clear review history', () => {
    agent.clearReviewHistory();

    const history = agent.getReviewHistory();
    expect(history).toHaveLength(0);
  });

  it('should generate aggregate report', () => {
    const analyses: AnalysisResult[] = [
      {
        file: 'file1.ts',
        language: 'typescript',
        linesAnalyzed: 100,
        issues: [{ severity: 'high', type: 'security', file: 'file1.ts', line: 10, message: 'SQL injection' }],
        metrics: { linesOfCode: 100 },
        score: { overall: 70, quality: 65, security: 60, performance: 80, maintainability: 75 },
      },
      {
        file: 'file2.ts',
        language: 'typescript',
        linesAnalyzed: 50,
        issues: [],
        metrics: { linesOfCode: 50 },
        score: { overall: 90, quality: 85, security: 95, performance: 90, maintainability: 90 },
      },
    ];

    const report = agent.generateReport(analyses);

    expect(report.metrics.filesReviewed).toBe(2);
    expect(report.metrics.linesReviewed).toBe(150);
    expect(report.metrics.issuesFound).toBe(1);
    expect(report.metrics.criticalIssues).toBe(1);
    expect(report.score.overall).toBe(80); // Average of 70 and 90
  });

  it('should handle empty analyses array', () => {
    const report = agent.generateReport([]);
    expect(report.metrics.filesReviewed).toBe(0);
    expect(report.summary).toBe('No files analyzed');
  });
});

/*
 * ============================================================================
 * TESTS FIXER AGENT
 * ============================================================================
 */

describe('FixerAgent', () => {
  let agent: FixerAgent;
  let mockFs: ReturnType<typeof createMockWritableFileSystem>;

  beforeEach(() => {
    // Reset singleton registry
    AgentRegistry.resetInstance();

    mockFs = createMockWritableFileSystem({
      '/project/test.ts': 'const x = 1;',
    });

    agent = createFixerAgent(mockFs);
  });

  it('should create a fixer agent', () => {
    expect(agent).toBeInstanceOf(FixerAgent);
    expect(agent.getName()).toBe('fixer');
  });

  it('should have the correct tools', () => {
    const tools = agent.getAvailableTools();
    expect(tools.length).toBeGreaterThan(0);
    expect(tools.some((t) => t.name === 'read_file')).toBe(true);
    expect(tools.some((t) => t.name === 'edit_file')).toBe(true);
    expect(tools.some((t) => t.name === 'write_file')).toBe(true);
  });

  it('should track applied fixes', () => {
    const fixes = agent.getAppliedFixes();
    expect(Array.isArray(fixes)).toBe(true);
  });

  it('should track fix history', () => {
    const history = agent.getFixHistory();
    expect(Array.isArray(history)).toBe(true);
  });

  it('should clear fix history', () => {
    agent.clearFixHistory();

    const history = agent.getFixHistory();
    expect(history).toHaveLength(0);
  });

  it('should record fix results', () => {
    agent.recordFixResult('test.ts', 'test_failure', true);
    agent.recordFixResult('test2.ts', 'compilation', false);

    const history = agent.getFixHistory();
    expect(history).toHaveLength(2);
    expect(history[0].success).toBe(true);
    expect(history[1].success).toBe(false);
  });

  describe('static parseError', () => {
    it('should parse error with file and line', () => {
      const error = FixerAgent.parseError('Error at src/test.ts:42:10 - something failed', 'compilation');

      expect(error.type).toBe('compilation');
      expect(error.file).toBe('src/test.ts');
      expect(error.line).toBe(42);
      expect(error.column).toBe(10);
    });

    it('should handle error without file info', () => {
      const error = FixerAgent.parseError('Generic error message', 'test_failure');

      expect(error.type).toBe('test_failure');
      expect(error.message).toBe('Generic error message');
      expect(error.file).toBeUndefined();
    });
  });

  describe('static fromReviewIssue', () => {
    it('should convert review issue to fixable error', () => {
      const issue: CodeIssue = {
        severity: 'high',
        type: 'security',
        file: 'test.ts',
        line: 10,
        message: 'SQL injection vulnerability',
      };

      const error = FixerAgent.fromReviewIssue(issue);

      expect(error.type).toBe('security');
      expect(error.file).toBe('test.ts');
      expect(error.line).toBe(10);
      expect(error.severity).toBe('high');
    });

    it('should map style issues to lint type', () => {
      const issue: CodeIssue = {
        severity: 'low',
        type: 'style',
        file: 'test.ts',
        message: 'Inconsistent indentation',
      };

      const error = FixerAgent.fromReviewIssue(issue);
      expect(error.type).toBe('lint');
    });
  });
});

/*
 * ============================================================================
 * TESTS SWARM COORDINATOR
 * ============================================================================
 */

describe('SwarmCoordinator', () => {
  let registry: AgentRegistry;
  let coordinator: SwarmCoordinator;

  beforeEach(() => {
    // Reset singleton registry
    AgentRegistry.resetInstance();
    registry = AgentRegistry.getInstance();
    coordinator = new SwarmCoordinator(registry, 'test-api-key', { verbose: false });
  });

  describe('rule management', () => {
    it('should add handoff rules', () => {
      const rule: HandoffRule = {
        from: 'tester',
        to: 'fixer',
        condition: { type: 'on_failure' },
        priority: 10,
        description: 'Test to fixer on failure',
      };

      coordinator.addRule(rule);

      const rules = coordinator.getRulesFor('tester');

      expect(rules).toHaveLength(1);
      expect(rules[0].to).toBe('fixer');
    });

    it('should sort rules by priority', () => {
      coordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 5,
      });
      coordinator.addRule({
        from: 'coder',
        to: 'tester',
        condition: { type: 'always' },
        priority: 10,
      });

      const rules = coordinator.getRulesFor('coder');

      expect(rules[0].priority).toBe(10);
      expect(rules[0].to).toBe('tester');
    });

    it('should remove handoff rules', () => {
      coordinator.addRule({
        from: 'tester',
        to: 'fixer',
        condition: { type: 'on_failure' },
        priority: 10,
      });

      const removed = coordinator.removeRule('tester', 'fixer');
      expect(removed).toBe(true);

      const rules = coordinator.getRulesFor('tester');
      expect(rules).toHaveLength(0);
    });

    it('should return false when removing non-existent rule', () => {
      const removed = coordinator.removeRule('tester', 'fixer');
      expect(removed).toBe(false);
    });

    it('should get all rules', () => {
      coordinator.addRule({
        from: 'tester',
        to: 'fixer',
        condition: { type: 'on_failure' },
        priority: 10,
      });
      coordinator.addRule({
        from: 'coder',
        to: 'reviewer',
        condition: { type: 'on_success' },
        priority: 5,
      });

      const allRules = coordinator.getAllRules();
      expect(allRules).toHaveLength(2);
    });
  });

  describe('predefined rules', () => {
    it('should create test to fixer rule', () => {
      const rule = PREDEFINED_RULES.testToFixer();

      expect(rule.from).toBe('tester');
      expect(rule.to).toBe('fixer');
      expect(rule.condition.type).toBe('on_failure');
    });

    it('should create fixer to tester rule', () => {
      const rule = PREDEFINED_RULES.fixerToTester();

      expect(rule.from).toBe('fixer');
      expect(rule.to).toBe('tester');
      expect(rule.condition.type).toBe('on_success');
    });

    it('should create coder to reviewer rule', () => {
      const rule = PREDEFINED_RULES.coderToReviewer();

      expect(rule.from).toBe('coder');
      expect(rule.to).toBe('reviewer');
    });

    it('should create reviewer to fixer rule with custom condition', () => {
      const rule = PREDEFINED_RULES.reviewerToFixer();

      expect(rule.from).toBe('reviewer');
      expect(rule.to).toBe('fixer');
      expect(rule.condition.type).toBe('custom');
    });

    it('should create builder to tester rule', () => {
      const rule = PREDEFINED_RULES.builderToTester();

      expect(rule.from).toBe('builder');
      expect(rule.to).toBe('tester');
    });
  });

  describe('active chains', () => {
    it('should track active chains', () => {
      const chains = coordinator.getActiveChains();
      expect(Array.isArray(chains)).toBe(true);
    });

    it('should return undefined for non-existent chain', () => {
      const chain = coordinator.getActiveChain('non-existent');
      expect(chain).toBeUndefined();
    });
  });

  describe('handoff', () => {
    it('should return error for non-existent agent', async () => {
      const task: Task = {
        id: 'test-task',
        type: 'test',
        prompt: 'Test task',
        status: 'pending',
        createdAt: new Date(),
      };

      const result = await coordinator.handoff('tester', 'non_existent' as any, task);

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });

  describe('factory with predefined rules', () => {
    it('should create coordinator with predefined rules', () => {
      const coord = createSwarmCoordinator(registry, 'test-api-key', {
        enablePredefinedRules: true,
      });

      const allRules = coord.getAllRules();
      expect(allRules.length).toBeGreaterThan(0);
    });
  });
});

/*
 * ============================================================================
 * TESTS MOCK ANALYZER
 * ============================================================================
 */

describe('MockAnalyzer', () => {
  it('should create analyzer with default results', () => {
    const analyzer = createMockAnalyzer();

    expect(analyzer.analyzeCode).toBeDefined();
    expect(analyzer.reviewChanges).toBeDefined();
    expect(analyzer.calculateComplexity).toBeDefined();
  });

  it('should use custom analysis results', async () => {
    const customIssue: CodeIssue = {
      severity: 'high',
      type: 'security',
      file: 'test.ts',
      message: 'Custom issue',
    };

    const analyzer = createMockAnalyzer({
      analysisResult: {
        issues: [customIssue],
        score: { overall: 50, quality: 40, security: 30, performance: 60, maintainability: 70 },
      },
    });

    const result = await analyzer.analyzeCode('const x = 1;');

    expect(result.issues).toHaveLength(1);
    expect(result.issues[0].message).toBe('Custom issue');
    expect(result.score.overall).toBe(50);
  });

  it('should detect code smells', async () => {
    const analyzer = createMockAnalyzer({
      codeSmells: [
        {
          type: 'long_function',
          file: 'test.ts',
          line: 1,
          description: 'Function too long',
          severity: 'medium',
          refactoringAdvice: 'Split into smaller functions',
        },
      ],
    });

    const smells = await analyzer.detectCodeSmells('function test() {}');

    expect(smells).toHaveLength(1);
    expect(smells[0].type).toBe('long_function');
  });
});

/*
 * ============================================================================
 * TESTS INTEGRATION PHASE 4
 * ============================================================================
 */

describe('Integration Phase 4', () => {
  beforeEach(() => {
    // Reset singleton registry
    AgentRegistry.resetInstance();
  });

  it('should register all Phase 4 agents', () => {
    const registry = AgentRegistry.getInstance();
    const mockAnalyzer = createMockAnalyzer();
    const mockFs = createMockWritableFileSystem({});

    const reviewer = createReviewerAgent(mockAnalyzer);
    const fixer = createFixerAgent(mockFs);

    registry.register(reviewer);
    registry.register(fixer);

    expect(registry.get('reviewer')).toBe(reviewer);
    expect(registry.get('fixer')).toBe(fixer);
  });

  it('should get registered agent by name', () => {
    const registry = AgentRegistry.getInstance();
    const mockFs = createMockWritableFileSystem({});

    const fixer = createFixerAgent(mockFs);
    registry.register(fixer);

    const agent = registry.get('fixer');
    expect(agent).toBeDefined();
    expect(agent?.getName()).toBe('fixer');
  });

  it('should create swarm with predefined rules', () => {
    const registry = AgentRegistry.getInstance();
    const swarm = createSwarmCoordinator(registry, 'test-key', {
      enablePredefinedRules: true,
    });

    const rules = swarm.getAllRules();

    // Should have at least the predefined rules
    expect(rules.length).toBeGreaterThanOrEqual(5);

    // Verify specific rules exist
    expect(rules.some((r) => r.from === 'tester' && r.to === 'fixer')).toBe(true);
    expect(rules.some((r) => r.from === 'coder' && r.to === 'reviewer')).toBe(true);
  });

  it('should handle condition evaluation for predefined rules', () => {
    const reviewerToFixer = PREDEFINED_RULES.reviewerToFixer();
    const condition = reviewerToFixer.condition;

    if (condition.type === 'custom') {
      const task: Task = {
        id: 'test',
        type: 'review',
        prompt: 'Review code',
        status: 'completed',
        createdAt: new Date(),
      };

      // Result with high severity issue
      const resultWithIssue: TaskResult = {
        success: true,
        output: '{"issues": [{"severity": "high", "message": "Critical issue"}]}',
      };

      expect(condition.predicate(task, resultWithIssue)).toBe(true);

      // Result without issues
      const resultWithoutIssue: TaskResult = {
        success: true,
        output: '{"issues": [], "score": 95}',
      };

      expect(condition.predicate(task, resultWithoutIssue)).toBe(false);
    }
  });
});
