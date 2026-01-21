/**
 * Stream Text - Design Guidelines Integration Tests
 *
 * Tests for the design guidelines injection functionality.
 *
 * @module llm/__tests__/stream-text-guidelines.spec
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the AI SDK
vi.mock('ai', () => ({
  streamText: vi.fn(() => ({
    textStream: (async function* () {
      yield 'Hello';
      yield ' World';
    })(),
  })),
  stepCountIs: vi.fn((n) => n),
}));

// Mock the API key module
vi.mock('~/lib/.server/llm/api-key', () => ({
  getAPIKey: vi.fn(() => 'test-api-key'),
}));

// Mock the model module
vi.mock('~/lib/.server/llm/model', () => ({
  getAnthropicModel: vi.fn(() => 'claude-3-5-sonnet-20241022'),
}));

// Mock the web-search module
vi.mock('~/lib/.server/llm/web-search', () => ({
  createWebSearchTools: vi.fn(() => ({})),
  getWebSearchStatus: vi.fn(() => ''),
  isWebSearchAvailable: vi.fn(() => false),
}));

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

import { streamText as _aiStreamText } from 'ai';
import { loadFrontendDesignSkill, formatSkillContent } from '~/lib/skills';
import type { Messages } from '~/lib/.server/llm/stream-text';

describe('Stream Text - Design Guidelines', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('UI Request Detection', () => {
    it('should detect UI requests and inject guidelines', async () => {
      // Import after mocks are set up
      const { streamText } = await import('~/lib/.server/llm/stream-text');

      const messages: Messages = [
        { role: 'user', content: 'Create a React dashboard with Tailwind CSS' },
      ];

      const mockEnv = { ANTHROPIC_API_KEY: 'test-key' } as unknown as Env;

      await streamText(messages, mockEnv, {
        designGuidelines: { enabled: true, level: 'standard' },
      });

      // Verify skill was loaded
      expect(loadFrontendDesignSkill).toHaveBeenCalled();

      // Verify formatSkillContent was called with standard level
      expect(formatSkillContent).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: expect.any(Object) }),
        'standard',
      );

      // Verify streamText was called with system prompt containing guidelines
      expect(_aiStreamText).toHaveBeenCalled();
      const callArgs = vi.mocked(_aiStreamText).mock.calls[0][0];
      expect(callArgs.system).toContain('Frontend Design Guidelines');
    });

    it('should not inject guidelines for non-UI requests', async () => {
      const { streamText } = await import('~/lib/.server/llm/stream-text');

      const messages: Messages = [
        { role: 'user', content: 'Explain how async/await works in JavaScript' },
      ];

      const mockEnv = { ANTHROPIC_API_KEY: 'test-key' } as unknown as Env;

      await streamText(messages, mockEnv, {
        designGuidelines: { enabled: true, level: 'standard' },
      });

      // formatSkillContent should not be called for non-UI requests
      expect(formatSkillContent).not.toHaveBeenCalled();
    });

    it('should detect various UI patterns', async () => {
      const { streamText } = await import('~/lib/.server/llm/stream-text');
      const mockEnv = { ANTHROPIC_API_KEY: 'test-key' } as unknown as Env;

      const uiMessages = [
        'Create a landing page',
        'Build an e-commerce site',
        'Make a portfolio website',
        'Design a form component',
        'Implement a navbar with Tailwind',
        'Crée une page de contact',
        'Build a React app with shadcn',
      ];

      for (const content of uiMessages) {
        vi.clearAllMocks();
        const messages: Messages = [{ role: 'user', content }];

        await streamText(messages, mockEnv, {
          designGuidelines: { enabled: true, level: 'full' },
        });

        expect(loadFrontendDesignSkill).toHaveBeenCalled();
      }
    });
  });

  describe('Guidelines Levels', () => {
    it('should skip injection when level is minimal', async () => {
      const { streamText } = await import('~/lib/.server/llm/stream-text');

      const messages: Messages = [
        { role: 'user', content: 'Create a React component' },
      ];

      const mockEnv = { ANTHROPIC_API_KEY: 'test-key' } as unknown as Env;

      await streamText(messages, mockEnv, {
        designGuidelines: { enabled: true, level: 'minimal' },
      });

      // Should not load skill when level is minimal
      expect(loadFrontendDesignSkill).not.toHaveBeenCalled();
    });

    it('should skip injection when disabled', async () => {
      const { streamText } = await import('~/lib/.server/llm/stream-text');

      const messages: Messages = [
        { role: 'user', content: 'Create a React dashboard' },
      ];

      const mockEnv = { ANTHROPIC_API_KEY: 'test-key' } as unknown as Env;

      await streamText(messages, mockEnv, {
        designGuidelines: { enabled: false, level: 'full' },
      });

      // Should not load skill when disabled
      expect(loadFrontendDesignSkill).not.toHaveBeenCalled();
    });

    it('should use standard level by default', async () => {
      const { streamText } = await import('~/lib/.server/llm/stream-text');

      const messages: Messages = [
        { role: 'user', content: 'Build a landing page' },
      ];

      const mockEnv = { ANTHROPIC_API_KEY: 'test-key' } as unknown as Env;

      await streamText(messages, mockEnv, {
        designGuidelines: { enabled: true },
      });

      expect(formatSkillContent).toHaveBeenCalledWith(
        expect.anything(),
        'standard',
      );
    });
  });

  describe('Helper Functions', () => {
    it('streamTextWithDesign should use full level', async () => {
      const { streamTextWithDesign } = await import('~/lib/.server/llm/stream-text');

      const messages: Messages = [
        { role: 'user', content: 'Create a dashboard' },
      ];

      const mockEnv = { ANTHROPIC_API_KEY: 'test-key' } as unknown as Env;

      await streamTextWithDesign(messages, mockEnv);

      expect(formatSkillContent).toHaveBeenCalledWith(
        expect.anything(),
        'full',
      );
    });

    it('streamTextNoDesign should not inject guidelines', async () => {
      const { streamTextNoDesign } = await import('~/lib/.server/llm/stream-text');

      const messages: Messages = [
        { role: 'user', content: 'Create a landing page' },
      ];

      const mockEnv = { ANTHROPIC_API_KEY: 'test-key' } as unknown as Env;

      await streamTextNoDesign(messages, mockEnv);

      // Should not load skill when design is disabled
      expect(loadFrontendDesignSkill).not.toHaveBeenCalled();
    });
  });
});
