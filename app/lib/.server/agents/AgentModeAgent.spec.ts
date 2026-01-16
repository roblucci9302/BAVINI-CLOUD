/**
 * Tests pour AgentModeAgent et ActionExecutor
 *
 * Vérifie le fonctionnement de l'agent en mode exécution
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AgentModeAgent, AGENT_MODE_SYSTEM_PROMPT } from './AgentModeAgent';
import { ActionExecutor, createActionExecutor } from './ActionExecutor';
import type { AgentContext, ProposedAction, ExecutionPlan } from './types';
import { AGENT_MODE_CONFIG } from './types';

describe('AgentModeAgent', () => {
  let agent: AgentModeAgent;

  beforeEach(() => {
    agent = new AgentModeAgent({ dryRun: true });
  });

  /*
   * ===========================================================================
   * Initialization
   * ===========================================================================
   */

  describe('Initialization', () => {
    it('should initialize with AGENT_MODE_CONFIG', () => {
      expect(agent.hasCapability('create_files')).toBe(true);
      expect(agent.hasCapability('modify_files')).toBe(true);
      expect(agent.hasCapability('execute_shell')).toBe(true);
    });

    it('should have no restrictions', () => {
      expect(agent.isRestricted('create_files')).toBe(false);
      expect(agent.isRestricted('modify_files')).toBe(false);
    });

    it('should return valid system prompt', () => {
      const prompt = agent.getSystemPrompt();
      expect(prompt).toBe(AGENT_MODE_SYSTEM_PROMPT);
      expect(prompt).toContain('MODE AGENT');
      expect(prompt).toContain('exécutes');
    });

    it('should start with pending status', () => {
      expect(agent.getExecutionStatus()).toBe('pending');
    });
  });

  /*
   * ===========================================================================
   * Message Processing
   * ===========================================================================
   */

  describe('Message Processing', () => {
    it('should process action messages and return ready status', async () => {
      const response = await agent.process('Ajoute un composant Button.tsx');

      expect(response).toBeDefined();
      expect(response.type).toBe('response');
      expect(response.status).toBe('ready');
    });

    it('should always return ready status in agent mode', async () => {
      const response = await agent.process('Explique-moi ce code');

      expect(response.type).toBe('response');
      expect(response.status).toBe('ready');
    });

    it('should return message indicating agent mode is active', async () => {
      const response = await agent.process('Crée un fichier utils.ts');

      expect(response.message).toBeDefined();
      expect(response.message).toContain('Mode Agent');
    });

    it('should include suggestions array', async () => {
      const response = await agent.process('Modifie App.tsx');

      expect(Array.isArray(response.suggestions)).toBe(true);
    });
  });

  /*
   * ===========================================================================
   * Response Structure (process doesn't generate plans, just returns ready state)
   * ===========================================================================
   */

  describe('Response Structure', () => {
    it('should return consistent response for file creation requests', async () => {
      const response = await agent.process('Crée Header.tsx et Footer.tsx');

      expect(response.type).toBe('response');
      expect(response.status).toBe('ready');
      expect(response.message).toBeDefined();
    });

    it('should return ready status for any message', async () => {
      const response = await agent.process('Crée Button.tsx');

      expect(response.type).toBe('response');
      expect(response.status).toBe('ready');
      expect(response.suggestions).toBeDefined();
    });

    it('should return agent mode active message', async () => {
      const response = await agent.process('Ajoute un composant');

      expect(response.message).toBeDefined();
      expect(response.message).toContain('Mode Agent');
    });
  });

  /*
   * ===========================================================================
   * Plan Execution
   * ===========================================================================
   */

  describe('Plan Execution', () => {
    it('should execute empty plan', async () => {
      const result = await agent.executePlan([]);

      expect(result.status).toBe('completed');
      expect(result.results).toHaveLength(0);
    });

    it('should execute plan with actions (dry-run)', async () => {
      const actions: ProposedAction[] = [
        {
          id: 'test-1',
          type: 'create_file',
          description: 'Créer test.ts',
          details: {
            type: 'create_file',
            path: 'test.ts',
            content: 'export const test = true;',
            language: 'typescript',
          },
          risk: 'low',
          reversible: true,
        },
      ];

      const result = await agent.executePlan(actions);

      expect(result.status).toBe('completed');
      expect(result.results).toHaveLength(1);
      expect(result.results[0].success).toBe(true);
    });

    it('should update status during execution', async () => {
      expect(agent.getExecutionStatus()).toBe('pending');

      const actions: ProposedAction[] = [
        {
          id: 'test-1',
          type: 'run_command',
          description: 'Test command',
          details: {
            type: 'run_command',
            command: 'echo test',
          },
          risk: 'low',
          reversible: false,
        },
      ];

      await agent.executePlan(actions);

      expect(agent.getExecutionStatus()).toBe('completed');
    });

    it('should create execution summary', async () => {
      const actions: ProposedAction[] = [
        {
          id: 'test-1',
          type: 'create_file',
          description: 'Créer test.ts',
          details: {
            type: 'create_file',
            path: 'src/test.ts',
            content: '',
            language: 'typescript',
          },
          risk: 'low',
          reversible: true,
        },
      ];

      const result = await agent.executePlan(actions);

      expect(result.summary).toBeDefined();
      expect(result.summary.totalActions).toBe(1);
      expect(result.summary.successCount).toBe(1);
      expect(result.summary.failureCount).toBe(0);
    });
  });

  /*
   * ===========================================================================
   * System Prompt
   * ===========================================================================
   */

  describe('System Prompt', () => {
    it('should be in French', () => {
      expect(AGENT_MODE_SYSTEM_PROMPT).toContain('Tu es');
      expect(AGENT_MODE_SYSTEM_PROMPT).toContain('exécutes');
    });

    it('should define capabilities', () => {
      expect(AGENT_MODE_SYSTEM_PROMPT).toContain('PEUX faire');
      expect(AGENT_MODE_SYSTEM_PROMPT).toContain('Créer');
      expect(AGENT_MODE_SYSTEM_PROMPT).toContain('Modifier');
    });

    it('should define workflow', () => {
      expect(AGENT_MODE_SYSTEM_PROMPT).toContain('Validation');
      expect(AGENT_MODE_SYSTEM_PROMPT).toContain('Exécution');
    });
  });
});

/*
 * =============================================================================
 * ActionExecutor Tests
 * =============================================================================
 */

describe('ActionExecutor', () => {
  let executor: ActionExecutor;

  beforeEach(() => {
    executor = new ActionExecutor({ dryRun: true });
  });

  /*
   * ===========================================================================
   * Initialization
   * ===========================================================================
   */

  describe('Initialization', () => {
    it('should initialize with default options', () => {
      const exec = new ActionExecutor();
      expect(exec).toBeDefined();
    });

    it('should accept custom options', () => {
      const exec = new ActionExecutor({
        stopOnError: false,
        timeout: 60000,
      });
      expect(exec).toBeDefined();
    });

    it('should create executor with factory', () => {
      const exec = createActionExecutor({ dryRun: true });
      expect(exec).toBeInstanceOf(ActionExecutor);
    });
  });

  /*
   * ===========================================================================
   * Action Execution
   * ===========================================================================
   */

  describe('Action Execution', () => {
    it('should execute create_file action', async () => {
      const action: ProposedAction = {
        id: 'create-1',
        type: 'create_file',
        description: 'Créer test.ts',
        details: {
          type: 'create_file',
          path: 'test.ts',
          content: 'export const x = 1;',
          language: 'typescript',
        },
        risk: 'low',
        reversible: true,
      };

      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.message).toContain('DRY-RUN');
    });

    it('should execute modify_file action', async () => {
      const action: ProposedAction = {
        id: 'modify-1',
        type: 'modify_file',
        description: 'Modifier test.ts',
        details: {
          type: 'modify_file',
          path: 'test.ts',
          changes: [],
        },
        risk: 'medium',
        reversible: true,
      };

      const result = await executor.execute(action);

      expect(result.success).toBe(true);
    });

    it('should execute run_command action', async () => {
      const action: ProposedAction = {
        id: 'cmd-1',
        type: 'run_command',
        description: 'Exécuter test',
        details: {
          type: 'run_command',
          command: 'echo "test"',
        },
        risk: 'low',
        reversible: false,
      };

      const result = await executor.execute(action);

      expect(result.success).toBe(true);
    });

    it('should execute install_package action', async () => {
      const action: ProposedAction = {
        id: 'install-1',
        type: 'install_package',
        description: 'Installer react',
        details: {
          type: 'install_package',
          packageName: 'react',
          version: '^18.0.0',
          isDev: false,
        },
        risk: 'low',
        reversible: true,
      };

      const result = await executor.execute(action);

      expect(result.success).toBe(true);
      expect(result.message).toContain('react');
    });

    it('should execute git_operation action', async () => {
      const action: ProposedAction = {
        id: 'git-1',
        type: 'git_operation',
        description: 'Commit changes',
        details: {
          type: 'git_operation',
          operation: 'commit',
          params: {},
          message: 'Test commit',
        },
        risk: 'medium',
        reversible: false,
      };

      const result = await executor.execute(action);

      expect(result.success).toBe(true);
    });
  });

  /*
   * ===========================================================================
   * Batch Execution
   * ===========================================================================
   */

  describe('Batch Execution', () => {
    it('should execute multiple actions', async () => {
      const actions: ProposedAction[] = [
        {
          id: 'action-1',
          type: 'create_file',
          description: 'Create file 1',
          details: { type: 'create_file', path: 'a.ts', content: '', language: 'typescript' },
          risk: 'low',
          reversible: true,
        },
        {
          id: 'action-2',
          type: 'create_file',
          description: 'Create file 2',
          details: { type: 'create_file', path: 'b.ts', content: '', language: 'typescript' },
          risk: 'low',
          reversible: true,
        },
      ];

      const results = await executor.executeAll(actions);

      expect(results).toHaveLength(2);
      expect(results.every((r) => r.success)).toBe(true);
    });

    it('should track executed actions', async () => {
      const actions: ProposedAction[] = [
        {
          id: 'tracked-1',
          type: 'run_command',
          description: 'Test',
          details: { type: 'run_command', command: 'test' },
          risk: 'low',
          reversible: false,
        },
      ];

      await executor.executeAll(actions);

      const executed = executor.getExecutedActions();
      expect(executed).toHaveLength(1);
    });
  });

  /*
   * ===========================================================================
   * Progress Callback
   * ===========================================================================
   */

  describe('Progress Callback', () => {
    it('should call onProgress for each action', async () => {
      const progressCalls: Array<{ id: string; status: string }> = [];

      const exec = new ActionExecutor({
        dryRun: true,
        onProgress: (id, status) => progressCalls.push({ id, status }),
      });

      await exec.execute({
        id: 'progress-test',
        type: 'run_command',
        description: 'Test',
        details: { type: 'run_command', command: 'test' },
        risk: 'low',
        reversible: false,
      });

      expect(progressCalls.length).toBeGreaterThanOrEqual(2);
      expect(progressCalls.some((p) => p.status === 'started')).toBe(true);
      expect(progressCalls.some((p) => p.status === 'completed')).toBe(true);
    });
  });
});

/*
 * =============================================================================
 * Helpers
 * =============================================================================
 */

function createTestContext(): AgentContext {
  return {
    files: [{ path: 'src/App.tsx', content: 'export default function App() {}', language: 'tsx' }],
    messageHistory: [],
    projectState: {
      isBuilding: false,
      hasErrors: false,
      fileCount: 1,
      techStack: ['React', 'TypeScript'],
    },
    recentErrors: [],
    recentLogs: [],
  };
}
