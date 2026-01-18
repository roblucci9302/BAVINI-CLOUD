/**
 * Tests pour les règles de handoff de l'agent Architect
 * Vérifie l'intégration de l'Architect dans le système de Swarm Coordinator
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AgentRegistry } from '../core/agent-registry';
import {
  SwarmCoordinator,
  createSwarmCoordinator,
  PREDEFINED_RULES,
  type HandoffRule,
} from '../utils/swarm-coordinator';
import type { Task, TaskResult } from '../types';

// Mock du client Anthropic
vi.mock('@anthropic-ai/sdk', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      messages: {
        create: vi.fn().mockResolvedValue({
          id: 'msg_test',
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: 'Test response' }],
          model: 'claude-sonnet-4-5-20250929',
          stop_reason: 'end_turn',
          usage: { input_tokens: 100, output_tokens: 50 },
        }),
      },
    })),
  };
});

describe('Architect Handoff Rules', () => {
  let registry: AgentRegistry;

  beforeEach(() => {
    AgentRegistry.resetInstance();
    registry = AgentRegistry.getInstance();
  });

  /*
   * ============================================================================
   * architectToCoder Rule Tests
   * ============================================================================
   */
  describe('architectToCoder', () => {
    let rule: HandoffRule;

    beforeEach(() => {
      rule = PREDEFINED_RULES.architectToCoder();
    });

    it('should have correct source and target agents', () => {
      expect(rule.from).toBe('architect');
      expect(rule.to).toBe('coder');
    });

    it('should have priority 6', () => {
      expect(rule.priority).toBe(6);
    });

    it('should trigger on French implementation plan', () => {
      const task: Task = {
        id: 'test-task',
        type: 'architect',
        prompt: 'Design a new feature',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: "Voici le plan d'implémentation pour la nouvelle fonctionnalité...",
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(true);
      }
    });

    it('should trigger on English implementation plan', () => {
      const task: Task = {
        id: 'test-task',
        type: 'architect',
        prompt: 'Design a new feature',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'Here is the implementation plan for the new feature...',
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(true);
      }
    });

    it('should trigger on ## Recommandation header', () => {
      const task: Task = {
        id: 'test-task',
        type: 'architect',
        prompt: 'Analyze options',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: '## Recommandation\n\nUtiliser le pattern Strategy...',
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(true);
      }
    });

    it('should trigger on design document', () => {
      const task: Task = {
        id: 'test-task',
        type: 'architect',
        prompt: 'Create design',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'Design Document: Authentication System Redesign...',
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(true);
      }
    });

    it('should NOT trigger on failed result', () => {
      const task: Task = {
        id: 'test-task',
        type: 'architect',
        prompt: 'Design',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: false,
        output: "Plan d'implémentation échoué",
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(false);
      }
    });

    it('should NOT trigger on generic output without plan keywords', () => {
      const task: Task = {
        id: 'test-task',
        type: 'architect',
        prompt: 'Analyze',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: "J'ai analysé le code et trouvé quelques patterns intéressants.",
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(false);
      }
    });

    it('should transform task with correct context', () => {
      const task: Task = {
        id: 'arch-123',
        type: 'architect',
        prompt: 'Design feature',
        status: 'completed',
        createdAt: new Date(),
        context: { existing: 'value' },
      };

      const result: TaskResult = {
        success: true,
        output: "Plan d'implémentation:\nFichiers: src/auth.ts, src/user.ts",
      };

      if (rule.transformTask) {
        const transformed = rule.transformTask(task, result);

        expect(transformed.id).toContain('code-from-architect');
        expect(transformed.context?.architectureDesign).toBe(result.output);
        expect(transformed.context?.designDocument).toBe(result.output);
        expect(transformed.context?.existing).toBe('value');
        expect(transformed.prompt).toContain('Implement the following architecture design');
      }
    });
  });

  /*
   * ============================================================================
   * exploreToArchitect Rule Tests
   * ============================================================================
   */
  describe('exploreToArchitect', () => {
    let rule: HandoffRule;

    beforeEach(() => {
      rule = PREDEFINED_RULES.exploreToArchitect();
    });

    it('should have correct source and target agents', () => {
      expect(rule.from).toBe('explore');
      expect(rule.to).toBe('architect');
    });

    it('should have priority 4', () => {
      expect(rule.priority).toBe(4);
    });

    it('should trigger on technical debt with multiple files', () => {
      const task: Task = {
        id: 'test-task',
        type: 'explore',
        prompt: 'Explore codebase',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'Found significant technical debt across multiple files that need restructuring.',
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(true);
      }
    });

    it('should trigger on French dette technique with dependencies', () => {
      const task: Task = {
        id: 'test-task',
        type: 'explore',
        prompt: 'Explorer le code',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: "Cette dette technique affecte plusieurs dépendances du système.",
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(true);
      }
    });

    it('should trigger on refactoring with coupling issues', () => {
      const task: Task = {
        id: 'test-task',
        type: 'explore',
        prompt: 'Analyze code quality',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'The refactoring needed here involves tight coupling between modules.',
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(true);
      }
    });

    it('should trigger on architecture with impact analysis', () => {
      const task: Task = {
        id: 'test-task',
        type: 'explore',
        prompt: 'Check architecture',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: "Changes to the architecture will have impact on the entire authentication flow.",
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(true);
      }
    });

    it('should NOT trigger without architectural concern', () => {
      const task: Task = {
        id: 'test-task',
        type: 'explore',
        prompt: 'Find file',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'Found the file at src/utils.ts with multiple files referencing it.',
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(false);
      }
    });

    it('should NOT trigger without complexity indicator', () => {
      const task: Task = {
        id: 'test-task',
        type: 'explore',
        prompt: 'Check architecture',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: "The architecture looks clean and simple.",
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(false);
      }
    });

    it('should have higher priority than exploreToCoder', () => {
      const exploreToCoderRule = PREDEFINED_RULES.exploreToCoder();
      expect(rule.priority).toBeGreaterThanOrEqual(exploreToCoderRule.priority);
    });

    it('should transform task with needsDesign flag', () => {
      const task: Task = {
        id: 'explore-456',
        type: 'explore',
        prompt: 'Analyze system',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'Architecture issues found with multiple dependencies.',
      };

      if (rule.transformTask) {
        const transformed = rule.transformTask(task, result);

        expect(transformed.id).toContain('architect-from-explore');
        expect(transformed.context?.explorationResult).toBe(result.output);
        expect(transformed.context?.needsDesign).toBe(true);
      }
    });
  });

  /*
   * ============================================================================
   * reviewerToArchitect Rule Tests
   * ============================================================================
   */
  describe('reviewerToArchitect', () => {
    let rule: HandoffRule;

    beforeEach(() => {
      rule = PREDEFINED_RULES.reviewerToArchitect();
    });

    it('should have correct source and target agents', () => {
      expect(rule.from).toBe('reviewer');
      expect(rule.to).toBe('architect');
    });

    it('should have priority 7', () => {
      expect(rule.priority).toBe(7);
    });

    it('should trigger on god class with high severity', () => {
      const task: Task = {
        id: 'test-task',
        type: 'reviewer',
        prompt: 'Review code',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'Found a god class issue with "severity": "high" that needs refactoring.',
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(true);
      }
    });

    it('should trigger on SRP violation with critical severity', () => {
      const task: Task = {
        id: 'test-task',
        type: 'reviewer',
        prompt: 'Review code',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'SRP violation detected: "severity": "critical"',
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(true);
      }
    });

    it('should trigger on tight coupling with high severity', () => {
      const task: Task = {
        id: 'test-task',
        type: 'reviewer',
        prompt: 'Review code',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'Tight coupling detected between modules. severity: high',
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(true);
      }
    });

    it('should trigger on circular dependency with critical severity', () => {
      const task: Task = {
        id: 'test-task',
        type: 'reviewer',
        prompt: 'Review',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'Circular dependency found "severity": "critical"',
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(true);
      }
    });

    it('should NOT trigger on low severity issues', () => {
      const task: Task = {
        id: 'test-task',
        type: 'reviewer',
        prompt: 'Review',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'Found god class pattern, but "severity": "low"',
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(false);
      }
    });

    it('should NOT trigger on non-architectural issues with high severity', () => {
      const task: Task = {
        id: 'test-task',
        type: 'reviewer',
        prompt: 'Review',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'Typo found in variable name "severity": "high"',
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(false);
      }
    });

    it('should NOT trigger on medium severity', () => {
      const task: Task = {
        id: 'test-task',
        type: 'reviewer',
        prompt: 'Review',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'God class detected "severity": "medium"',
      };

      const condition = rule.condition;
      if (condition.type === 'custom') {
        expect(condition.predicate(task, result)).toBe(false);
      }
    });

    it('should transform task with architecturalConcerns flag', () => {
      const task: Task = {
        id: 'review-789',
        type: 'reviewer',
        prompt: 'Review code',
        status: 'completed',
        createdAt: new Date(),
      };

      const result: TaskResult = {
        success: true,
        output: 'Critical issues found.',
      };

      if (rule.transformTask) {
        const transformed = rule.transformTask(task, result);

        expect(transformed.id).toContain('architect-from-review');
        expect(transformed.context?.reviewResult).toBe(result.output);
        expect(transformed.context?.architecturalConcerns).toBe(true);
      }
    });
  });

  /*
   * ============================================================================
   * SwarmCoordinator Integration Tests
   * ============================================================================
   */
  describe('SwarmCoordinator Registration', () => {
    it('should register all architect rules when enablePredefinedRules is true', () => {
      const coordinator = createSwarmCoordinator(registry, 'test-api-key', {
        enablePredefinedRules: true,
      });

      const architectRules = coordinator.getRulesFor('architect');
      const exploreRules = coordinator.getRulesFor('explore');
      const reviewerRules = coordinator.getRulesFor('reviewer');

      // architect → coder
      expect(architectRules.some((r) => r.to === 'coder')).toBe(true);

      // explore → architect
      expect(exploreRules.some((r) => r.to === 'architect')).toBe(true);

      // reviewer → architect
      expect(reviewerRules.some((r) => r.to === 'architect')).toBe(true);
    });

    it('should have correct total number of architect-related rules', () => {
      const coordinator = createSwarmCoordinator(registry, 'test-api-key', {
        enablePredefinedRules: true,
      });

      const allRules = coordinator.getAllRules();

      // Count rules involving architect
      const architectInvolved = allRules.filter((r) => r.from === 'architect' || r.to === 'architect');

      expect(architectInvolved.length).toBe(3);
    });

    it('should sort rules by priority within each agent', () => {
      const coordinator = createSwarmCoordinator(registry, 'test-api-key', {
        enablePredefinedRules: true,
      });

      // explore has multiple rules: exploreToArchitect (4) and exploreToCoder (3)
      const exploreRules = coordinator.getRulesFor('explore');

      // Should be sorted by priority descending
      for (let i = 0; i < exploreRules.length - 1; i++) {
        expect(exploreRules[i].priority).toBeGreaterThanOrEqual(exploreRules[i + 1].priority);
      }

      // reviewer has multiple rules: reviewerToArchitect (7), reviewerToFixer (8), reviewerToDeployer (2)
      const reviewerRules = coordinator.getRulesFor('reviewer');

      for (let i = 0; i < reviewerRules.length - 1; i++) {
        expect(reviewerRules[i].priority).toBeGreaterThanOrEqual(reviewerRules[i + 1].priority);
      }
    });
  });

  /*
   * ============================================================================
   * Priority Order Tests
   * ============================================================================
   */
  describe('Priority Order', () => {
    it('should have reviewerToArchitect at priority 7', () => {
      const rule = PREDEFINED_RULES.reviewerToArchitect();
      expect(rule.priority).toBe(7);
    });

    it('should have architectToCoder at priority 6', () => {
      const rule = PREDEFINED_RULES.architectToCoder();
      expect(rule.priority).toBe(6);
    });

    it('should have exploreToArchitect at priority 4', () => {
      const rule = PREDEFINED_RULES.exploreToArchitect();
      expect(rule.priority).toBe(4);
    });

    it('should maintain correct priority hierarchy', () => {
      // Test priority order as specified in plan:
      // 10: testToFixer, fixerToTester (critiques)
      // 8: reviewerToFixer, builderToFixer
      // 7: reviewerToArchitect ← NEW
      // 6: architectToCoder ← NEW
      // 5: coderToReviewer, builderToTester, deployerToFixer
      // 4: exploreToArchitect ← NEW, testerToReviewer
      // 3: exploreToCoder, coderToTester
      // 2: reviewerToDeployer

      const testToFixer = PREDEFINED_RULES.testToFixer();
      const fixerToTester = PREDEFINED_RULES.fixerToTester();
      const reviewerToFixer = PREDEFINED_RULES.reviewerToFixer();
      const builderToFixer = PREDEFINED_RULES.builderToFixer();
      const reviewerToArchitect = PREDEFINED_RULES.reviewerToArchitect();
      const architectToCoder = PREDEFINED_RULES.architectToCoder();
      const coderToReviewer = PREDEFINED_RULES.coderToReviewer();
      const builderToTester = PREDEFINED_RULES.builderToTester();
      const deployerToFixer = PREDEFINED_RULES.deployerToFixer();
      const exploreToArchitect = PREDEFINED_RULES.exploreToArchitect();
      const testerToReviewer = PREDEFINED_RULES.testerToReviewer();
      const exploreToCoder = PREDEFINED_RULES.exploreToCoder();
      const coderToTester = PREDEFINED_RULES.coderToTester();
      const reviewerToDeployer = PREDEFINED_RULES.reviewerToDeployer();

      // Priority 10 (critical)
      expect(testToFixer.priority).toBe(10);
      expect(fixerToTester.priority).toBe(10);

      // Priority 8
      expect(reviewerToFixer.priority).toBe(8);
      expect(builderToFixer.priority).toBe(8);

      // Priority 7 (new architect rule)
      expect(reviewerToArchitect.priority).toBe(7);

      // Priority 6 (new architect rule)
      expect(architectToCoder.priority).toBe(6);

      // Priority 5
      expect(coderToReviewer.priority).toBe(5);
      expect(builderToTester.priority).toBe(5);
      expect(deployerToFixer.priority).toBe(5);

      // Priority 4 (new architect rule)
      expect(exploreToArchitect.priority).toBe(4);
      expect(testerToReviewer.priority).toBe(4);

      // Priority 3
      expect(exploreToCoder.priority).toBe(3);
      expect(coderToTester.priority).toBe(3);

      // Priority 2
      expect(reviewerToDeployer.priority).toBe(2);
    });
  });
});
