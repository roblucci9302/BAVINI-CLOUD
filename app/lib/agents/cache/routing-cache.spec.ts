/**
 * Tests for routing-cache with context-aware caching
 * @module agents/cache/routing-cache.spec
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  routingCache,
  getCachedRouting,
  cacheRouting,
  getRoutingCacheStats,
  clearRoutingCache,
  analyzePromptPatterns,
  type RoutingCacheContext,
} from './routing-cache';
import type { OrchestrationDecision } from '../types';

describe('RoutingCache - Basic Operations', () => {
  beforeEach(() => {
    clearRoutingCache();
  });

  afterEach(() => {
    clearRoutingCache();
  });

  describe('caching and retrieval', () => {
    it('should cache and retrieve a decision', () => {
      const prompt = 'Create a new React component';
      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'coder',
        reasoning: 'Code creation task',
      };

      cacheRouting(prompt, decision);
      const cached = getCachedRouting(prompt);

      expect(cached).not.toBeNull();
      expect(cached?.action).toBe('delegate');
      expect(cached?.targetAgent).toBe('coder');
    });

    it('should return null for uncached prompts', () => {
      const cached = getCachedRouting('Some uncached prompt ' + Date.now());

      expect(cached).toBeNull();
    });

    it('should only cache delegate and decompose actions', () => {
      const prompt1 = 'Question prompt';
      const prompt2 = 'Direct response prompt';

      cacheRouting(prompt1, { action: 'ask_user', reasoning: 'Need clarification' });
      cacheRouting(prompt2, { action: 'execute_directly', response: 'Done', reasoning: 'Simple' });

      expect(getCachedRouting(prompt1)).toBeNull();
      expect(getCachedRouting(prompt2)).toBeNull();
    });
  });

  describe('fuzzy matching', () => {
    it('should match similar prompts', () => {
      // Use prompts with very high Jaccard similarity (>0.85)
      // These differ by only one word: "hooks" vs "hook"
      // With 15+ shared words, similarity = 14/16 ≈ 0.875
      const originalPrompt =
        'Generate a new component file for the application with proper TypeScript types and React hooks support';
      const similarPrompt =
        'Generate a new component file for the application with proper TypeScript types and React hook support';

      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'coder',
        reasoning: 'Component creation',
      };

      cacheRouting(originalPrompt, decision);
      const cached = getCachedRouting(similarPrompt);

      // Should match due to high similarity (>0.85)
      expect(cached).not.toBeNull();
    });

    it('should not match very different prompts', () => {
      const originalPrompt = 'Create a new React component';
      const differentPrompt = 'Run the test suite and check coverage';

      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'coder',
        reasoning: 'Component creation',
      };

      cacheRouting(originalPrompt, decision);
      const cached = getCachedRouting(differentPrompt);

      expect(cached).toBeNull();
    });
  });

  describe('cache statistics', () => {
    it('should track hits and misses', () => {
      const prompt = 'Generic task prompt';
      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'coder',
        reasoning: 'Task',
      };

      clearRoutingCache();

      // Miss
      getCachedRouting('Unknown prompt');

      // Cache
      cacheRouting(prompt, decision);

      // Hit
      getCachedRouting(prompt);

      // Hit
      getCachedRouting(prompt);

      const stats = getRoutingCacheStats();

      expect(stats.hits).toBeGreaterThanOrEqual(2);
      expect(stats.misses).toBeGreaterThanOrEqual(1);
    });

    it('should calculate hit rate', () => {
      clearRoutingCache();

      const prompt = 'Test prompt';
      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'coder',
        reasoning: 'Test',
      };

      cacheRouting(prompt, decision);

      // 1 miss + 2 hits = 66.67% hit rate
      getCachedRouting('miss ' + Date.now());
      getCachedRouting(prompt);
      getCachedRouting(prompt);

      const stats = getRoutingCacheStats();

      expect(stats.hitRate).toBeGreaterThan(0);
    });
  });
});

describe('RoutingCache - Pattern Detection', () => {
  beforeEach(() => {
    clearRoutingCache();
  });

  describe('analyzePromptPatterns', () => {
    it('should detect absolute file paths', () => {
      const prompt = 'Fix the error in /Users/john/project/src/index.ts';
      const analysis = analyzePromptPatterns(prompt);

      expect(analysis.patterns.hasAbsolutePaths).toBe(true);
      expect(analysis.cacheable).toBe(false);
      expect(analysis.reason).toContain('absolute');
    });

    it('should detect relative file paths', () => {
      const prompt = 'Update the file at ./src/components/Button.tsx';
      const analysis = analyzePromptPatterns(prompt);

      expect(analysis.patterns.hasRelativePaths).toBe(true);
    });

    it('should detect code blocks', () => {
      const prompt = `Fix this code:
\`\`\`typescript
const x = 1;
\`\`\``;
      const analysis = analyzePromptPatterns(prompt);

      expect(analysis.patterns.hasCodeBlocks).toBe(true);
      expect(analysis.cacheable).toBe(false);
    });

    it('should detect error messages', () => {
      const prompt = 'Fix: TypeError: Cannot read property of undefined';
      const analysis = analyzePromptPatterns(prompt);

      expect(analysis.patterns.hasErrorMessages).toBe(true);
      expect(analysis.cacheable).toBe(false);
    });

    it('should detect line references', () => {
      const promptsWithLines = ['Fix the error on line 42', 'Check ligne 15 of the file', 'Error at :123:45'];

      for (const prompt of promptsWithLines) {
        const analysis = analyzePromptPatterns(prompt);
        expect(analysis.patterns.hasLineReferences, `Failed for: ${prompt}`).toBe(true);
      }
    });

    it('should identify generic requests', () => {
      // These prompts match GENERIC_REQUEST_PATTERNS exactly:
      // - /^(?:crée?|create|ajoute?|add)\s+(?:un|une|a|an)\s+(?:nouveau?|new)\s+/i
      // - /^(?:génère?|generate)\s+(?:un|une|a|an)\s+/i
      // - /^(?:lance|run|exécute?|execute)\s+(?:les?\s+)?(?:tests?|build|lint)/i
      // - /^(?:installe?|install)\s+(?:les?\s+)?(?:dépendances?|dependencies)/i
      // - /^(?:démarre?|start)\s+(?:le\s+)?(?:serveur|server)/i
      // - /^(?:formate?|format)\s+(?:le\s+)?code/i
      const genericPrompts = [
        'Create a new component', // matches create + a + new
        'Generate a test file', // matches generate + a
        'Run tests', // matches run + tests (no "the")
        'Install dependencies', // matches install + dependencies
        'Start server', // matches start + server
        'Format code', // matches format + code
      ];

      for (const prompt of genericPrompts) {
        const analysis = analyzePromptPatterns(prompt);
        expect(analysis.patterns.isGenericRequest, `Failed for: ${prompt}`).toBe(true);
        expect(analysis.cacheable).toBe(true);
      }
    });
  });

  describe('caching based on patterns', () => {
    it('should NOT cache prompts with absolute paths', () => {
      const prompt = 'Edit /home/user/project/file.ts';
      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'coder',
        reasoning: 'Edit file',
      };

      cacheRouting(prompt, decision);
      const cached = getCachedRouting(prompt);

      // Should not be cached due to absolute path
      expect(cached).toBeNull();

      const stats = getRoutingCacheStats();
      expect(stats.skippedDueToPatterns).toBeGreaterThan(0);
    });

    it('should NOT cache prompts with code blocks', () => {
      const prompt = `Fix this: \`\`\`js\nconst x = 1;\n\`\`\``;
      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'fixer',
        reasoning: 'Fix code',
      };

      cacheRouting(prompt, decision);
      const cached = getCachedRouting(prompt);

      expect(cached).toBeNull();
    });

    it('should NOT cache prompts with error messages', () => {
      const prompt = 'Fix: ReferenceError: x is not defined at line 5';
      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'fixer',
        reasoning: 'Fix error',
      };

      cacheRouting(prompt, decision);
      const cached = getCachedRouting(prompt);

      expect(cached).toBeNull();
    });

    it('SHOULD cache generic requests', () => {
      const prompt = 'Create a new React component';
      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'coder',
        reasoning: 'Create component',
      };

      cacheRouting(prompt, decision);
      const cached = getCachedRouting(prompt);

      expect(cached).not.toBeNull();
      expect(cached?.targetAgent).toBe('coder');
    });
  });
});

describe('RoutingCache - Context Validation', () => {
  beforeEach(() => {
    clearRoutingCache();
  });

  describe('context-aware caching', () => {
    it('should store context with cached entry', () => {
      const prompt = 'Build the project';
      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'builder',
        reasoning: 'Build task',
      };

      // Include hasFilePaths and hasErrors to match enriched context
      const context: RoutingCacheContext = {
        workingDirectory: '/project',
        taskType: 'build',
        hasFilePaths: false,
        hasErrors: false,
      };

      cacheRouting(prompt, decision, context);
      const cached = getCachedRouting(prompt, context);

      expect(cached).not.toBeNull();
    });

    it('should reject cache hit when context has mismatched task type', () => {
      const prompt = 'Process the data';
      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'coder',
        reasoning: 'Process data',
      };

      // Cache with one context
      const originalContext: RoutingCacheContext = {
        taskType: 'transformation',
        hasErrors: false,
      };
      cacheRouting(prompt, decision, originalContext);

      // Try to retrieve with different context
      const differentContext: RoutingCacheContext = {
        taskType: 'validation',
        hasErrors: true,
      };
      const cached = getCachedRouting(prompt, differentContext);

      // Should be rejected due to context mismatch
      expect(cached).toBeNull();

      const stats = getRoutingCacheStats();
      expect(stats.skippedDueToContext).toBeGreaterThan(0);
    });

    it('should accept cache hit when contexts are compatible', () => {
      const prompt = 'Run the build process';
      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'builder',
        reasoning: 'Build',
      };

      // Include hasFilePaths to match enriched context
      const context: RoutingCacheContext = {
        taskType: 'build',
        hasErrors: false,
        hasFilePaths: false,
      };

      cacheRouting(prompt, decision, context);

      // Same context should work
      const cached = getCachedRouting(prompt, context);

      expect(cached).not.toBeNull();
    });

    it('should handle missing context gracefully', () => {
      const prompt = 'Simple task without context';
      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'explore',
        reasoning: 'Explore',
      };

      // Cache without context
      cacheRouting(prompt, decision);

      // Retrieve without context
      const cached = getCachedRouting(prompt);

      expect(cached).not.toBeNull();
    });
  });

  describe('context hash generation', () => {
    it('should include files in context hash', () => {
      const prompt = 'Analyze the codebase';
      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'explore',
        reasoning: 'Analyze',
      };

      // Include hasFilePaths and hasErrors to match enriched context
      const contextWithFiles: RoutingCacheContext = {
        files: ['src/index.ts', 'src/utils.ts'],
        hasFilePaths: false,
        hasErrors: false,
      };

      cacheRouting(prompt, decision, contextWithFiles);

      // Same files should match
      const cached = getCachedRouting(prompt, contextWithFiles);
      expect(cached).not.toBeNull();
    });
  });
});

describe('RoutingCache - Edge Cases', () => {
  beforeEach(() => {
    clearRoutingCache();
  });

  describe('prompt normalization', () => {
    it('should normalize whitespace', () => {
      const prompt1 = 'Create   a    new   component';
      const prompt2 = 'Create a new component';

      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'coder',
        reasoning: 'Create',
      };

      cacheRouting(prompt1, decision);
      const cached = getCachedRouting(prompt2);

      expect(cached).not.toBeNull();
    });

    it('should be case insensitive', () => {
      const prompt1 = 'CREATE A NEW COMPONENT';
      const prompt2 = 'create a new component';

      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'coder',
        reasoning: 'Create',
      };

      cacheRouting(prompt1, decision);
      const cached = getCachedRouting(prompt2);

      expect(cached).not.toBeNull();
    });

    it('should remove punctuation for matching', () => {
      const prompt1 = 'Create a new component!';
      const prompt2 = 'Create a new component';

      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'coder',
        reasoning: 'Create',
      };

      cacheRouting(prompt1, decision);
      const cached = getCachedRouting(prompt2);

      expect(cached).not.toBeNull();
    });
  });

  describe('cache cleanup', () => {
    it('should clear all entries', () => {
      const decision: OrchestrationDecision = {
        action: 'delegate',
        targetAgent: 'coder',
        reasoning: 'Test',
      };

      cacheRouting('Prompt 1', decision);
      cacheRouting('Prompt 2', decision);
      cacheRouting('Prompt 3', decision);

      let stats = getRoutingCacheStats();
      expect(stats.size).toBe(3);

      clearRoutingCache();

      stats = getRoutingCacheStats();
      expect(stats.size).toBe(0);
      expect(stats.hits).toBe(0);
      expect(stats.misses).toBe(0);
    });
  });

  describe('decompose action caching', () => {
    it('should cache decompose decisions', () => {
      const prompt = 'Build a complete application with tests';
      const decision: OrchestrationDecision = {
        action: 'decompose',
        subTasks: [
          { type: 'coder', prompt: 'Write code', dependencies: [], priority: 1 },
          { type: 'tester', prompt: 'Write tests', dependencies: [], priority: 2 },
        ],
        reasoning: 'Complex task requiring multiple agents',
      };

      cacheRouting(prompt, decision);
      const cached = getCachedRouting(prompt);

      expect(cached).not.toBeNull();
      expect(cached?.action).toBe('decompose');
      expect(cached?.subTasks).toHaveLength(2);
    });
  });
});

describe('RoutingCache - Statistics', () => {
  beforeEach(() => {
    clearRoutingCache();
  });

  it('should track skippedDueToPatterns', () => {
    // skippedDueToPatterns is incremented in get(), not in set()
    // So we need to call getCachedRouting on uncacheable prompts

    // These prompts have patterns that should be skipped
    const uncacheablePrompts = [
      'Fix /absolute/path/file.ts', // has absolute path
      'Error: undefined is not a function', // has error message
      'Fix line 42 of the file', // has line reference
    ];

    // Call getCachedRouting on each - they should be skipped
    for (const prompt of uncacheablePrompts) {
      getCachedRouting(prompt);
    }

    const stats = getRoutingCacheStats();

    // All should have been skipped due to patterns
    expect(stats.size).toBe(0);
    expect(stats.skippedDueToPatterns).toBeGreaterThan(0);
  });

  it('should track skippedDueToContext', () => {
    const prompt = 'Process task';
    const decision: OrchestrationDecision = {
      action: 'delegate',
      targetAgent: 'coder',
      reasoning: 'Process',
    };

    const context1: RoutingCacheContext = { taskType: 'type1', hasErrors: false };
    const context2: RoutingCacheContext = { taskType: 'type2', hasErrors: true };

    cacheRouting(prompt, decision, context1);

    // This should be skipped due to context mismatch
    getCachedRouting(prompt, context2);

    const stats = getRoutingCacheStats();
    expect(stats.skippedDueToContext).toBeGreaterThanOrEqual(1);
  });
});
