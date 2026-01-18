/**
 * Deployer Agent - Agent spécialisé dans les opérations Git et le déploiement
 * Gère les commits, branches, push/pull et la synchronisation avec les remotes
 */

import { BaseAgent } from '../core/base-agent';
import type { ToolHandler } from '../core/tool-registry';
import {
  GIT_TOOLS,
  createGitToolHandlers,
  type GitInterface,
  type GitCommit,
  type GitBranch,
} from '../tools/git-tools';
import { DEPLOYER_SYSTEM_PROMPT } from '../prompts/deployer-prompt';
import type { Task, TaskResult, ToolDefinition, Artifact, ToolExecutionResult } from '../types';
import { getModelForAgent, AGENT_HISTORY_LIMIT } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DeployerAgent');

/*
 * ============================================================================
 * DEPLOYER AGENT
 * ============================================================================
 */

/**
 * Agent de déploiement et gestion Git
 */
export class DeployerAgent extends BaseAgent {
  private git: GitInterface | null = null;
  private commitHistory: Array<{
    hash: string;
    message: string;
    timestamp: Date;
  }> = [];
  private operationHistory: Array<{
    operation: string;
    success: boolean;
    timestamp: Date;
    details?: string;
  }> = [];

  constructor() {
    super({
      name: 'deployer',
      description:
        'Agent de déploiement. Gère les opérations Git (commit, push, pull, branches), ' +
        'la synchronisation avec les remotes, et prépare les déploiements.',
      model: getModelForAgent('deployer'), // Sonnet 4.5 - efficace pour Git
      tools: GIT_TOOLS,
      systemPrompt: DEPLOYER_SYSTEM_PROMPT,
      maxTokens: 16384, // Increased from 8K to 16K for complex Git operations
      temperature: 0.1, // Très déterministe pour les opérations Git
      timeout: 180000, // 3 minutes - opérations Git devraient être rapides
      maxRetries: 2, // Réessayer en cas d'erreur réseau
    });
  }

  /**
   * Implémentation du system prompt
   */
  getSystemPrompt(): string {
    return DEPLOYER_SYSTEM_PROMPT;
  }

  /**
   * Exécution principale de l'agent (appelée par run())
   */
  async execute(task: Task): Promise<TaskResult> {
    // Vérifier que Git est initialisé
    if (!this.git) {
      return {
        success: false,
        output: 'Git interface not initialized. Call setGit() first.',
        errors: [
          {
            code: 'GIT_NOT_INITIALIZED',
            message: 'Git interface not initialized',
            recoverable: false,
          },
        ],
      };
    }

    // Vérifier si on est dans un repo Git
    const isRepo = await this.git.isRepository();

    if (!isRepo) {
      return {
        success: false,
        output: 'Not a Git repository. Initialize with git_init first.',
        errors: [
          {
            code: 'NOT_A_REPOSITORY',
            message: 'Current directory is not a Git repository',
            recoverable: true,
          },
        ],
      };
    }

    // Construire le prompt avec contexte
    let prompt = task.prompt;

    // Ajouter le contexte Git actuel
    try {
      const currentBranch = await this.git.getCurrentBranch();
      const status = await this.git.status();

      prompt += '\n\nContexte Git actuel:';
      prompt += `\n- Branche: ${currentBranch}`;
      prompt += `\n- Fichiers modifiés: ${status.files.length}`;

      if (status.ahead > 0) {
        prompt += `\n- Commits en avance: ${status.ahead}`;
      }

      if (status.behind > 0) {
        prompt += `\n- Commits en retard: ${status.behind}`;
      }
    } catch (error) {
      // Ignorer si on ne peut pas obtenir le status
    }

    // Ajouter l'historique récent des opérations
    if (this.operationHistory.length > 0) {
      const recent = this.operationHistory.slice(-5);
      prompt += '\n\nOpérations récentes:';

      for (const op of recent) {
        prompt += `\n- ${op.operation}: ${op.success ? 'succès' : 'échec'}${op.details ? ` (${op.details})` : ''}`;
      }
    }

    // Exécuter la boucle d'agent
    const result = await this.runAgentLoop(prompt);

    // Ajouter les artefacts des commits créés
    if (result.success && this.commitHistory.length > 0) {
      result.artifacts = result.artifacts || [];

      const lastCommit = this.commitHistory[this.commitHistory.length - 1];
      const commitArtifact: Artifact = {
        type: 'message',
        content: `Commit: ${lastCommit.hash}\nMessage: ${lastCommit.message}`,
        title: 'Git Commit',
      };
      result.artifacts.push(commitArtifact);
    }

    // Ajouter les données des opérations
    result.data = result.data || {};
    result.data.operationHistory = this.operationHistory.slice(-10);
    result.data.commitHistory = this.commitHistory.slice(-10);

    return result;
  }

  /**
   * Initialiser l'interface Git
   * Enregistre les outils Git dans le ToolRegistry
   */
  setGit(git: GitInterface): void {
    this.git = git;

    // Créer des handlers wrappés pour tracker les opérations
    const handlers = createGitToolHandlers(git);
    const wrappedHandlers = this.wrapGitHandlersWithTracking(handlers);
    this.registerTools(GIT_TOOLS, wrappedHandlers, 'git');

    this.log('info', 'Git interface initialized for DeployerAgent with ToolRegistry');
  }

  /**
   * Wrapper les handlers Git pour tracker les opérations
   */
  private wrapGitHandlersWithTracking(handlers: ReturnType<typeof createGitToolHandlers>): Record<string, ToolHandler> {
    const wrapped: Record<string, ToolHandler> = {};

    for (const [name, handler] of Object.entries(handlers)) {
      wrapped[name] = async (input: Record<string, unknown>): Promise<ToolExecutionResult> => {
        const result = await (handler as (input: unknown) => Promise<ToolExecutionResult>)(input);

        // Tracker l'opération
        this.trackOperation(name, result.success, result.output as string);

        // Tracker les commits
        if (name === 'git_commit' && result.success) {
          this.trackCommit(result.output as string);
        }

        return result;
      };
    }

    return wrapped;
  }

  /**
   * Obtenir l'historique des commits créés par cet agent
   */
  getCommitHistory(): typeof this.commitHistory {
    return [...this.commitHistory];
  }

  /**
   * Obtenir l'historique des opérations
   */
  getOperationHistory(): typeof this.operationHistory {
    return [...this.operationHistory];
  }

  /**
   * Vider l'historique
   */
  clearHistory(): void {
    this.commitHistory = [];
    this.operationHistory = [];
  }

  // executeToolHandler est hérité de BaseAgent et utilise le ToolRegistry

  /**
   * Tracker une opération Git
   */
  private trackOperation(operation: string, success: boolean, details?: string): void {
    this.operationHistory.push({
      operation,
      success,
      timestamp: new Date(),
      details,
    });

    // Garder seulement les N dernières opérations
    if (this.operationHistory.length > AGENT_HISTORY_LIMIT) {
      this.operationHistory = this.operationHistory.slice(-AGENT_HISTORY_LIMIT);
    }
  }

  /**
   * Tracker un commit
   */
  private trackCommit(output: string): void {
    // Parser le hash et le message du commit
    const match = output.match(/\[([a-f0-9]+)\]\s+(.+)/);

    if (match) {
      this.commitHistory.push({
        hash: match[1],
        message: match[2],
        timestamp: new Date(),
      });

      // Garder seulement les N derniers commits
      if (this.commitHistory.length > AGENT_HISTORY_LIMIT) {
        this.commitHistory = this.commitHistory.slice(-AGENT_HISTORY_LIMIT);
      }
    }
  }

  /**
   * Obtenir la liste des outils disponibles
   */
  getAvailableTools(): ToolDefinition[] {
    return this.config.tools;
  }

  /**
   * Obtenir la branche courante (méthode utilitaire)
   */
  async getCurrentBranch(): Promise<string | null> {
    if (!this.git) {
      return null;
    }

    try {
      return await this.git.getCurrentBranch();
    } catch {
      return null;
    }
  }

  /**
   * Vérifier si on est dans un repo Git
   */
  async isInRepository(): Promise<boolean> {
    if (!this.git) {
      return false;
    }

    return this.git.isRepository();
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer une instance du Deployer Agent
 */
export function createDeployerAgent(git?: GitInterface): DeployerAgent {
  const agent = new DeployerAgent();

  if (git) {
    agent.setGit(git);
  }

  return agent;
}
