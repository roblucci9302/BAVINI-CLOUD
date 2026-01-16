/**
 * Tests pour ChatModeAgent
 *
 * Vérifie le fonctionnement de l'agent en mode Chat (analyse sans modification)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { ChatModeAgent, CHAT_MODE_SYSTEM_PROMPT } from './ChatModeAgent';
import type { AgentContext, ChatModeResponse } from './types';
import { CHAT_MODE_CONFIG } from './types';

describe('ChatModeAgent', () => {
  let agent: ChatModeAgent;

  beforeEach(() => {
    agent = new ChatModeAgent();
  });

  /*
   * ===========================================================================
   * Initialization
   * ===========================================================================
   */

  describe('Initialization', () => {
    it('should initialize with CHAT_MODE_CONFIG', () => {
      expect(agent.hasCapability('read_files')).toBe(true);
      expect(agent.hasCapability('analyze_code')).toBe(true);
      expect(agent.hasCapability('explain_errors')).toBe(true);
    });

    it('should have restrictions on modifications', () => {
      expect(agent.isRestricted('create_files')).toBe(true);
      expect(agent.isRestricted('modify_files')).toBe(true);
      expect(agent.isRestricted('execute_shell')).toBe(true);
    });

    it('should return valid system prompt', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt).toBe(CHAT_MODE_SYSTEM_PROMPT);
      expect(prompt).toContain('MODE CHAT');
      expect(prompt).toContain('SANS modifier');
    });
  });

  /*
   * ===========================================================================
   * Message Processing
   * ===========================================================================
   */

  describe('Message Processing', () => {
    it('should process debug messages', async () => {
      const context = createTestContext();
      agent.setContext(context);

      const response = await agent.process('Pourquoi cette erreur apparaît-elle ?');

      expect(response).toBeDefined();
      expect(response.type).toBe('analysis');
      expect(response.content).toBeTruthy();
      expect(response.sections).toBeDefined();
    });

    it('should process explain messages', async () => {
      const context = createTestContext();
      agent.setContext(context);

      const response = await agent.process('Explique-moi ce code');

      expect(response.type).toBe('analysis');
      expect(response.sections).toBeDefined();
    });

    it('should process plan messages', async () => {
      const context = createTestContext();
      agent.setContext(context);

      const response = await agent.process('Comment ajouter une nouvelle fonctionnalité');

      expect(response.type).toBe('analysis');
      expect(response.sections.analysis).toBeTruthy();
    });

    it('should process review messages', async () => {
      const context = createTestContext();
      agent.setContext(context);

      const response = await agent.process('Review mon code');

      expect(response.type).toBe('analysis');
    });

    it('should handle empty context gracefully', async () => {
      // Sans contexte défini
      const response = await agent.process('Analyse ce code');

      expect(response).toBeDefined();
      expect(response.type).toBe('analysis');
    });
  });

  /*
   * ===========================================================================
   * Response Structure
   * ===========================================================================
   */

  describe('Response Structure', () => {
    it('should return properly structured response', async () => {
      const context = createTestContext();
      agent.setContext(context);

      const response = await agent.process('Explique le fichier App.tsx');

      expect(response).toHaveProperty('type');
      expect(response).toHaveProperty('content');
      expect(response).toHaveProperty('sections');
      expect(response).toHaveProperty('suggestions');
      expect(response).toHaveProperty('canProceedToAgentMode');
      expect(response).toHaveProperty('proposedActions');
    });

    it('should include suggestions', async () => {
      const context = createTestContext();
      agent.setContext(context);

      const response = await agent.process('Debug mon erreur');

      expect(Array.isArray(response.suggestions)).toBe(true);
    });

    it('should format content correctly', async () => {
      const context = createTestContext();
      agent.setContext(context);

      const response = await agent.process('Analyse ce code');

      // Le contenu doit être formaté en markdown
      expect(typeof response.content).toBe('string');
    });
  });

  /*
   * ===========================================================================
   * Agent Mode Transition
   * ===========================================================================
   */

  describe('Agent Mode Transition', () => {
    it('should allow transition for action intents', async () => {
      const context = createTestContext();
      agent.setContext(context);

      const response = await agent.process('Ajoute un bouton dans App.tsx');

      expect(response.canProceedToAgentMode).toBe(true);
    });

    it('should not require transition for pure analysis', async () => {
      const context = createTestContext();
      agent.setContext(context);

      const response = await agent.process('Pourquoi ce bug ?');

      // Pour une question de debug, on peut suggérer le mode agent mais pas l'exiger
      expect(typeof response.canProceedToAgentMode).toBe('boolean');
    });

    it('should generate proposed actions for modifications', async () => {
      const context = createTestContext();
      agent.setContext(context);

      const response = await agent.process('Modifie le fichier Header.tsx');

      expect(Array.isArray(response.proposedActions)).toBe(true);
    });
  });

  /*
   * ===========================================================================
   * Context Handling
   * ===========================================================================
   */

  describe('Context Handling', () => {
    it('should use context files in analysis', async () => {
      const context = createTestContext([
        {
          path: 'src/components/Button.tsx',
          content: 'export const Button = () => <button>Click</button>',
          language: 'tsx',
        },
      ]);
      agent.setContext(context);

      const response = await agent.process('Explique le fichier Button.tsx');

      expect(response).toBeDefined();
      expect(response.type).toBe('analysis');
    });

    it('should detect tech stack from package.json', async () => {
      const context = createTestContext([
        {
          path: 'package.json',
          content: JSON.stringify({
            dependencies: {
              react: '^18.0.0',
              typescript: '^5.0.0',
            },
          }),
          language: 'json',
        },
      ]);
      agent.setContext(context);

      const response = await agent.process('Quelle est la stack technique ?');

      expect(response).toBeDefined();
    });
  });

  /*
   * ===========================================================================
   * Error Handling
   * ===========================================================================
   */

  describe('Error Handling', () => {
    it('should handle empty messages', async () => {
      const response = await agent.process('');

      expect(response).toBeDefined();
      expect(response.type).toBe('analysis');
    });

    it('should handle unknown intents gracefully', async () => {
      const response = await agent.process('xyz123abc');

      expect(response).toBeDefined();
      expect(response.type).toBe('analysis');
    });
  });

  /*
   * ===========================================================================
   * System Prompt
   * ===========================================================================
   */

  describe('System Prompt', () => {
    it('should be in French', () => {
      expect(CHAT_MODE_SYSTEM_PROMPT).toContain('Tu es');
      expect(CHAT_MODE_SYSTEM_PROMPT).toContain('Analyse');
      expect(CHAT_MODE_SYSTEM_PROMPT).toContain('Diagnostic');
    });

    it('should define capabilities', () => {
      expect(CHAT_MODE_SYSTEM_PROMPT).toContain('PEUX faire');
      expect(CHAT_MODE_SYSTEM_PROMPT).toContain('Lire et analyser');
    });

    it('should define restrictions', () => {
      expect(CHAT_MODE_SYSTEM_PROMPT).toContain('ne PEUX PAS');
      expect(CHAT_MODE_SYSTEM_PROMPT).toContain('Créer ou modifier');
    });

    it('should mention Agent mode transition', () => {
      // Le prompt mentionne la désactivation du mode Chat pour coder
      expect(CHAT_MODE_SYSTEM_PROMPT).toContain('désactiver le mode Chat');
    });
  });
});

/*
 * =============================================================================
 * Helpers
 * =============================================================================
 */

function createTestContext(files: Array<{ path: string; content: string; language: string }> = []): AgentContext {
  return {
    files:
      files.length > 0
        ? files
        : [{ path: 'src/App.tsx', content: 'export default function App() {}', language: 'tsx' }],
    messageHistory: [],
    projectState: {
      isBuilding: false,
      hasErrors: false,
      fileCount: files.length || 1,
      techStack: ['React', 'TypeScript'],
    },
    recentErrors: [],
    recentLogs: [],
  };
}
