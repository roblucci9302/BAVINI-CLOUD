/**
 * Design Guidelines Prompt - Unit Tests
 *
 * Tests for the design guidelines injection in multi-agent prompts.
 *
 * @module agents/prompts/__tests__/design-guidelines-prompt.spec
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

    return `## Frontend Design Guidelines

${skill.content}

---
CRITICAL: Apply these guidelines.`;
  }),
}));

import {
  getDesignGuidelinesSection,
  getCoderDesignContext,
  getOrchestratorDesignInstructions,
  isUIRelatedTask,
  DEFAULT_DESIGN_CONFIG,
} from '../design-guidelines-prompt';
import { loadFrontendDesignSkill, formatSkillContent } from '~/lib/skills';

describe('Design Guidelines Prompt', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('getDesignGuidelinesSection', () => {
    it('should return design guidelines section when enabled', () => {
      const section = getDesignGuidelinesSection({
        enabled: true,
        level: 'standard',
      });

      expect(section).toContain('FRONTEND DESIGN GUIDELINES');
      expect(section).toContain('Plugin Anthropic Officiel');
      expect(loadFrontendDesignSkill).toHaveBeenCalled();
      expect(formatSkillContent).toHaveBeenCalledWith(
        expect.anything(),
        'standard',
      );
    });

    it('should return empty string when disabled', () => {
      const section = getDesignGuidelinesSection({
        enabled: false,
        level: 'full',
      });

      expect(section).toBe('');
      expect(loadFrontendDesignSkill).not.toHaveBeenCalled();
    });

    it('should return empty string when level is minimal', () => {
      const section = getDesignGuidelinesSection({
        enabled: true,
        level: 'minimal',
      });

      expect(section).toBe('');
      expect(loadFrontendDesignSkill).not.toHaveBeenCalled();
    });

    it('should use default config when not provided', () => {
      const section = getDesignGuidelinesSection();

      expect(section).toContain('FRONTEND DESIGN GUIDELINES');
      expect(formatSkillContent).toHaveBeenCalledWith(
        expect.anything(),
        DEFAULT_DESIGN_CONFIG.level,
      );
    });
  });

  describe('getCoderDesignContext', () => {
    it('should return design context when enabled', () => {
      const context = getCoderDesignContext({
        enabled: true,
        level: 'full',
      });

      expect(context).toContain('[DESIGN CONTEXT]');
      expect(context).toContain('niveau: full');
      expect(context).toContain('Design Thinking');
    });

    it('should return empty string when disabled', () => {
      const context = getCoderDesignContext({
        enabled: false,
        level: 'full',
      });

      expect(context).toBe('');
    });

    it('should return empty string when level is minimal', () => {
      const context = getCoderDesignContext({
        enabled: true,
        level: 'minimal',
      });

      expect(context).toBe('');
    });
  });

  describe('getOrchestratorDesignInstructions', () => {
    it('should return orchestrator instructions when enabled', () => {
      const instructions = getOrchestratorDesignInstructions({
        enabled: true,
        level: 'standard',
      });

      expect(instructions).toContain('DESIGN GUIDELINES SYSTEM');
      expect(instructions).toContain('niveau: standard');
      expect(instructions).toContain('tâches UI');
      expect(instructions).toContain('coder');
    });

    it('should return empty string when disabled', () => {
      const instructions = getOrchestratorDesignInstructions({
        enabled: false,
        level: 'full',
      });

      expect(instructions).toBe('');
    });
  });

  describe('isUIRelatedTask', () => {
    it('should detect UI-related tasks in English', () => {
      expect(isUIRelatedTask('Create a React component')).toBe(true);
      expect(isUIRelatedTask('Build a landing page')).toBe(true);
      expect(isUIRelatedTask('Design a dashboard')).toBe(true);
      expect(isUIRelatedTask('Create an e-commerce site')).toBe(true);
      expect(isUIRelatedTask('Add a button to the form')).toBe(true);
      expect(isUIRelatedTask('Style with Tailwind CSS')).toBe(true);
    });

    it('should detect UI-related tasks in French', () => {
      expect(isUIRelatedTask('Créer un composant React')).toBe(true);
      expect(isUIRelatedTask('Ajouter un formulaire')).toBe(true);
      expect(isUIRelatedTask('Créer une boutique en ligne')).toBe(true);
      expect(isUIRelatedTask('Page tableau de bord')).toBe(true);
    });

    it('should not detect non-UI tasks', () => {
      expect(isUIRelatedTask('Implement sorting algorithm')).toBe(false);
      expect(isUIRelatedTask('Write database query')).toBe(false);
      expect(isUIRelatedTask('Create API endpoint')).toBe(false);
      expect(isUIRelatedTask('Fix memory leak')).toBe(false);
    });

    it('should be case insensitive', () => {
      expect(isUIRelatedTask('CREATE A DASHBOARD')).toBe(true);
      expect(isUIRelatedTask('build a LANDING PAGE')).toBe(true);
    });
  });

  describe('DEFAULT_DESIGN_CONFIG', () => {
    it('should have correct default values', () => {
      expect(DEFAULT_DESIGN_CONFIG.enabled).toBe(true);
      expect(DEFAULT_DESIGN_CONFIG.level).toBe('standard');
    });
  });
});
