/**
 * Tester Agent - Agent spécialisé dans l'exécution de tests
 * Lance les tests, analyse les résultats, et suggère des corrections
 */

import { BaseAgent } from '../core/base-agent';
import type { ToolHandler } from '../core/tool-registry';
import { TEST_TOOLS, createTestToolHandlers, type TestRunner } from '../tools/test-tools';
import { TESTER_SYSTEM_PROMPT } from '../prompts/tester-prompt';
import { parseTestResults, type TestResults } from '../utils/output-parser';
import type { Task, TaskResult, ToolDefinition, Artifact, ToolExecutionResult } from '../types';
import { getModelForAgent, AGENT_HISTORY_LIMIT } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('TesterAgent');

/*
 * ============================================================================
 * TESTER AGENT
 * ============================================================================
 */

/**
 * Agent de test et validation
 */
export class TesterAgent extends BaseAgent {
  private testRunner: TestRunner | null = null;
  private testHistory: Array<{
    timestamp: Date;
    results: TestResults;
  }> = [];

  constructor() {
    super({
      name: 'tester',
      description:
        "Agent de test. Lance les tests unitaires et d'intégration, " +
        'analyse les résultats, suggère des corrections. Supporte vitest, jest, mocha.',
      model: getModelForAgent('tester'), // Sonnet 4.5 - rapide pour les tests
      tools: TEST_TOOLS,
      systemPrompt: TESTER_SYSTEM_PROMPT,
      maxTokens: 16384, // Increased from 8K to 16K for detailed test analysis
      temperature: 0.1, // Déterministe pour l'analyse
      timeout: 300000, // 5 minutes - suites de tests peuvent être longues
      maxRetries: 2, // Tests flaky peuvent nécessiter un retry
    });
  }

  /**
   * Implémentation du system prompt
   */
  getSystemPrompt(): string {
    return TESTER_SYSTEM_PROMPT;
  }

  /**
   * Exécution principale de l'agent (appelée par run())
   */
  async execute(task: Task): Promise<TaskResult> {
    // Vérifier que le TestRunner est initialisé
    if (!this.testRunner) {
      return {
        success: false,
        output: 'TestRunner not initialized. Call setTestRunner() first.',
        errors: [
          {
            code: 'RUNNER_NOT_INITIALIZED',
            message: 'TestRunner not initialized',
            recoverable: false,
          },
        ],
      };
    }

    // Construire le prompt avec contexte
    let prompt = task.prompt;

    // Ajouter l'historique récent des tests au contexte
    if (this.testHistory.length > 0) {
      const recent = this.testHistory.slice(-5);
      prompt += '\n\nHistorique récent des tests:\n';

      for (const entry of recent) {
        const r = entry.results;
        const framework = r.framework ? ` (${r.framework})` : '';
        const duration = r.duration ? ` - ${r.duration}ms` : '';
        prompt += `- ${entry.timestamp.toISOString()}: ${r.passed} passés, ${r.failed} échoués, ${r.skipped} ignorés${framework}${duration}\n`;
      }
    }

    // Détecter le framework de test
    try {
      const framework = await this.testRunner.detectFramework();
      prompt += `\n\nFramework de test détecté: ${framework}`;
    } catch (error) {
      // Ignorer si la détection échoue
    }

    // Exécuter la boucle d'agent
    const result = await this.runAgentLoop(prompt);

    // Ajouter les artefacts des résultats de test
    if (result.success && result.data?.testResults) {
      result.artifacts = result.artifacts || [];

      const testArtifact: Artifact = {
        type: 'message',
        content: JSON.stringify(result.data.testResults, null, 2),
        title: 'Test Results',
      };
      result.artifacts.push(testArtifact);
    }

    return result;
  }

  /**
   * Initialiser le runner de tests
   * Enregistre les outils de test dans le ToolRegistry
   */
  setTestRunner(runner: TestRunner): void {
    this.testRunner = runner;

    // Créer des handlers wrappés pour tracker les tests
    const handlers = createTestToolHandlers(runner);
    const wrappedHandlers = this.wrapTestHandlersWithTracking(handlers);
    this.registerTools(TEST_TOOLS, wrappedHandlers, 'test');

    this.log('info', 'TestRunner initialized for TesterAgent with ToolRegistry');
  }

  /**
   * Wrapper les handlers de test pour tracker les résultats
   */
  private wrapTestHandlersWithTracking(
    handlers: ReturnType<typeof createTestToolHandlers>,
  ): Record<string, ToolHandler> {
    const wrapped: Record<string, ToolHandler> = {};

    for (const [name, handler] of Object.entries(handlers)) {
      wrapped[name] = async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
        const result = await (handler as (input: unknown) => Promise<ToolExecutionResult>)(input);

        // Tracker les résultats de test
        if (name === 'run_tests' && result.success) {
          this.trackTestRun(result.output as string);
        }

        return result;
      };
    }

    return wrapped;
  }

  /**
   * Obtenir l'historique des tests
   */
  getTestHistory(): typeof this.testHistory {
    return [...this.testHistory];
  }

  /**
   * Vider l'historique des tests
   */
  clearTestHistory(): void {
    this.testHistory = [];
  }

  // executeToolHandler est hérité de BaseAgent et utilise le ToolRegistry

  /**
   * Tracker les résultats d'un run de tests
   * Utilise le parser robuste multi-framework
   */
  private trackTestRun(output: string): void {
    // Parser les résultats avec le parser robuste (supporte Jest, Vitest, Mocha, pytest, Go)
    const results = parseTestResults(output);

    // Ne tracker que si on a trouvé des résultats
    if (results.total > 0 || results.passed > 0 || results.failed > 0) {
      this.testHistory.push({
        timestamp: new Date(),
        results,
      });

      // Log le framework détecté pour debug
      if (results.framework) {
        logger.debug('Test framework detected', { framework: results.framework });
      }

      // Garder seulement les N derniers runs
      if (this.testHistory.length > AGENT_HISTORY_LIMIT) {
        this.testHistory = this.testHistory.slice(-AGENT_HISTORY_LIMIT);
      }
    }
  }

  /**
   * Obtenir les statistiques agrégées des tests
   */
  getTestStats(): {
    totalRuns: number;
    totalPassed: number;
    totalFailed: number;
    totalSkipped: number;
    successRate: number;
    averageDuration: number;
    frameworksUsed: string[];
  } {
    if (this.testHistory.length === 0) {
      return {
        totalRuns: 0,
        totalPassed: 0,
        totalFailed: 0,
        totalSkipped: 0,
        successRate: 0,
        averageDuration: 0,
        frameworksUsed: [],
      };
    }

    const totalPassed = this.testHistory.reduce((sum, h) => sum + h.results.passed, 0);
    const totalFailed = this.testHistory.reduce((sum, h) => sum + h.results.failed, 0);
    const totalSkipped = this.testHistory.reduce((sum, h) => sum + h.results.skipped, 0);
    const total = totalPassed + totalFailed;

    const durationsWithValue = this.testHistory
      .filter((h) => h.results.duration !== undefined)
      .map((h) => h.results.duration!);
    const averageDuration =
      durationsWithValue.length > 0 ? durationsWithValue.reduce((a, b) => a + b, 0) / durationsWithValue.length : 0;

    const frameworks = new Set(this.testHistory.filter((h) => h.results.framework).map((h) => h.results.framework!));

    return {
      totalRuns: this.testHistory.length,
      totalPassed,
      totalFailed,
      totalSkipped,
      successRate: total > 0 ? (totalPassed / total) * 100 : 0,
      averageDuration,
      frameworksUsed: Array.from(frameworks),
    };
  }

  /**
   * Obtenir la liste des outils disponibles
   */
  getAvailableTools(): ToolDefinition[] {
    return this.config.tools;
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer une instance du Tester Agent
 */
export function createTesterAgent(runner?: TestRunner): TesterAgent {
  const agent = new TesterAgent();

  if (runner) {
    agent.setTestRunner(runner);
  }

  return agent;
}
