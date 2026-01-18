/**
 * Tests pour vérifier que les agents s'arrêtent correctement
 * avec le nouvel outil complete_task
 */

import { describe, it, expect } from 'vitest';
import { createOrchestrator } from '../agents/orchestrator';
import type { OrchestrationDecision } from '../types';
import { ORCHESTRATOR_SYSTEM_PROMPT } from '../prompts/orchestrator-prompt';

// Mock helper pour simuler les réponses au format { text, toolCalls }
// Ce format est utilisé par parseDecision après le refactoring SRP
const mockParsedResponse = (toolName: string, toolInput: Record<string, unknown>) => ({
  text: '',
  toolCalls: [
    {
      id: 'tool_1',
      name: toolName,
      input: toolInput,
    },
  ],
});

const mockTextResponse = (text: string) => ({
  text,
  toolCalls: undefined,
});

describe('Stop Conditions - Phase 1', () => {
  describe('complete_task tool parsing', () => {
    it('should parse complete_task as action "complete"', () => {
      const orchestrator = createOrchestrator();

      // Accéder à la méthode privée via any (pour le test uniquement)
      const parseDecision = (orchestrator as any).parseDecision.bind(orchestrator);

      // Simuler une réponse avec complete_task (nouveau format { text, toolCalls })
      const mockResponse = mockParsedResponse('complete_task', {
        result: 'Le composant Button a été créé avec succès dans src/components/Button.tsx',
        summary: 'Création du composant terminée',
      });

      const decision: OrchestrationDecision = parseDecision(mockResponse);

      expect(decision.action).toBe('complete');
      expect(decision.response).toContain('Button');
      expect(decision.reasoning).toBeDefined();
    });

    it('should still handle delegate_to_agent correctly', () => {
      const orchestrator = createOrchestrator();
      const parseDecision = (orchestrator as any).parseDecision.bind(orchestrator);

      const mockResponse = mockParsedResponse('delegate_to_agent', {
        agent: 'coder',
        task: 'Créer un composant Button',
      });

      const decision: OrchestrationDecision = parseDecision(mockResponse);

      expect(decision.action).toBe('delegate');
      expect(decision.targetAgent).toBe('coder');
    });

    it('should still handle create_subtasks correctly', () => {
      const orchestrator = createOrchestrator();
      const parseDecision = (orchestrator as any).parseDecision.bind(orchestrator);

      const mockResponse = mockParsedResponse('create_subtasks', {
        tasks: [
          { agent: 'explore', description: 'Trouver le fichier' },
          { agent: 'coder', description: 'Modifier le code', dependsOn: [0] },
        ],
        reasoning: 'Tâche complexe nécessitant exploration puis modification',
      });

      const decision: OrchestrationDecision = parseDecision(mockResponse);

      expect(decision.action).toBe('decompose');
      expect(decision.subTasks).toHaveLength(2);
    });

    it('should handle text-only response as execute_directly', () => {
      const orchestrator = createOrchestrator();
      const parseDecision = (orchestrator as any).parseDecision.bind(orchestrator);

      // Nouveau format: réponse texte sans toolCalls
      const mockResponse = mockTextResponse('Voici la réponse directe');

      const decision: OrchestrationDecision = parseDecision(mockResponse);

      expect(decision.action).toBe('execute_directly');
      expect(decision.response).toContain('réponse directe');
    });
  });

  describe('Orchestrator prompt', () => {
    it("should contain QUAND S'ARRÊTER section", () => {
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain("QUAND S'ARRÊTER");
    });

    it('should mention complete_task tool', () => {
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('complete_task');
    });

    it('should warn about infinite loops', () => {
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('Cycle INTERDIT');
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain('BOUCLE INFINIE');
    });

    it("should have RÈGLE D'OR", () => {
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain("RÈGLE D'OR");
    });

    it('should instruct to use complete_task when satisfied', () => {
      expect(ORCHESTRATOR_SYSTEM_PROMPT).toContain("demande de l'utilisateur est SATISFAITE");
    });
  });

  describe('maxIterations safety', () => {
    it('should have MAX_AGENT_ITERATIONS set to 15', async () => {
      const fs = await import('fs/promises');
      const path = await import('path');

      // Utiliser un chemin absolu basé sur __dirname
      const basePath = path.resolve(process.cwd(), 'app/lib/agents/core/base-agent.ts');
      const content = await fs.readFile(basePath, 'utf-8');

      // Chercher la constante MAX_AGENT_ITERATIONS (refactorée en P2.1)
      const match = content.match(/const MAX_AGENT_ITERATIONS = (\d+)/);
      expect(match).not.toBeNull();
      // Increased from 8 to 15 for complex tasks requiring more iterations
      expect(match![1]).toBe('15');
    });
  });
});
