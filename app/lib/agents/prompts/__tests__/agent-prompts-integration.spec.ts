/**
 * Agent Prompts Integration - Unit Tests
 *
 * Tests for the dynamic prompt generation with design guidelines.
 *
 * @module agents/prompts/__tests__/agent-prompts-integration.spec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the skill loader
vi.mock('~/lib/skills', () => ({
  loadFrontendDesignSkill: vi.fn(() => ({
    metadata: { name: 'frontend-design', description: 'Test skill' },
    content: `## Design Thinking

Before coding, commit to a BOLD direction.

## Frontend Aesthetics Guidelines

Focus on typography and color.`,
    rawContent: '',
    loadedAt: Date.now(),
  })),
  formatSkillContent: vi.fn((skill, level) => {
    if (level === 'minimal') return null;

    return `## Frontend Design Guidelines (Level: ${level})

${skill.content}

---
CRITICAL: Apply these guidelines.`;
  }),
}));

import {
  CODER_SYSTEM_PROMPT,
  getCoderSystemPrompt,
} from '../coder-prompt';
import {
  ORCHESTRATOR_SYSTEM_PROMPT,
  getOrchestratorSystemPrompt,
} from '../orchestrator-prompt';

describe('Agent Prompts Integration', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getCoderSystemPrompt', () => {
    it('should return static prompt when no config provided', () => {
      const prompt = getCoderSystemPrompt();

      // Should return the static prompt (or with default config)
      expect(prompt).toContain('Tu es le CODER AGENT');
      expect(prompt).toContain('OUTILS DISPONIBLES');
    });

    it('should inject design guidelines when enabled', () => {
      const prompt = getCoderSystemPrompt({
        enabled: true,
        level: 'full',
      });

      expect(prompt).toContain('Tu es le CODER AGENT');
      expect(prompt).toContain('FRONTEND DESIGN GUIDELINES');
      expect(prompt).toContain('Level: full');
    });

    it('should not inject when disabled', () => {
      const prompt = getCoderSystemPrompt({
        enabled: false,
        level: 'full',
      });

      // Should return the static prompt without guidelines
      expect(prompt).toBe(CODER_SYSTEM_PROMPT);
      expect(prompt).not.toContain('FRONTEND DESIGN GUIDELINES');
    });

    it('should not inject when level is minimal', () => {
      const prompt = getCoderSystemPrompt({
        enabled: true,
        level: 'minimal',
      });

      expect(prompt).toBe(CODER_SYSTEM_PROMPT);
      expect(prompt).not.toContain('FRONTEND DESIGN GUIDELINES');
    });

    it('should insert guidelines before tools section', () => {
      const prompt = getCoderSystemPrompt({
        enabled: true,
        level: 'standard',
      });

      // Design guidelines should come before tools
      const guidelinesIndex = prompt.indexOf('FRONTEND DESIGN GUIDELINES');
      const toolsIndex = prompt.indexOf('OUTILS DISPONIBLES');

      expect(guidelinesIndex).toBeLessThan(toolsIndex);
    });
  });

  describe('getOrchestratorSystemPrompt', () => {
    it('should return static prompt when no config provided', () => {
      const prompt = getOrchestratorSystemPrompt();

      expect(prompt).toContain('Orchestrateur BAVINI');
      expect(prompt).toContain('coordonne');
    });

    it('should inject design instructions when enabled', () => {
      const prompt = getOrchestratorSystemPrompt({
        enabled: true,
        level: 'standard',
      });

      expect(prompt).toContain('Orchestrateur BAVINI');
      expect(prompt).toContain('DESIGN GUIDELINES SYSTEM');
    });

    it('should not inject when disabled', () => {
      const prompt = getOrchestratorSystemPrompt({
        enabled: false,
        level: 'full',
      });

      expect(prompt).toBe(ORCHESTRATOR_SYSTEM_PROMPT);
      expect(prompt).not.toContain('DESIGN GUIDELINES SYSTEM');
    });

    it('should insert instructions before rules section', () => {
      const prompt = getOrchestratorSystemPrompt({
        enabled: true,
        level: 'full',
      });

      // Design instructions should come before important rules
      const designIndex = prompt.indexOf('DESIGN GUIDELINES SYSTEM');
      const rulesIndex = prompt.indexOf('Règles Importantes');

      expect(designIndex).toBeLessThan(rulesIndex);
    });
  });

  describe('Prompt Consistency', () => {
    it('static and dynamic prompts should be consistent when disabled', () => {
      const staticCoder = CODER_SYSTEM_PROMPT;
      const dynamicCoder = getCoderSystemPrompt({ enabled: false, level: 'full' });

      expect(dynamicCoder).toBe(staticCoder);

      const staticOrchestrator = ORCHESTRATOR_SYSTEM_PROMPT;
      const dynamicOrchestrator = getOrchestratorSystemPrompt({ enabled: false, level: 'full' });

      expect(dynamicOrchestrator).toBe(staticOrchestrator);
    });

    it('dynamic prompts should contain base content', () => {
      const coderPrompt = getCoderSystemPrompt({ enabled: true, level: 'full' });
      const orchestratorPrompt = getOrchestratorSystemPrompt({ enabled: true, level: 'full' });

      // Coder should have core sections
      expect(coderPrompt).toContain('Tu es le CODER AGENT');
      expect(coderPrompt).toContain('BONNES PRATIQUES');

      // Orchestrator should have core sections
      expect(orchestratorPrompt).toContain('Orchestrateur BAVINI');
      expect(orchestratorPrompt).toContain('Agents Disponibles');
    });
  });
});
