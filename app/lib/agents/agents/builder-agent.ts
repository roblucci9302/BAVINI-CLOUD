/**
 * Builder Agent - Agent spécialisé dans le build, l'exécution et les dépendances
 * Gère npm, les serveurs de dev, et les commandes shell
 */

import { BaseAgent } from '../core/base-agent';
import { SHELL_TOOLS, createShellToolHandlers, type ShellInterface, type RunningProcess } from '../tools/shell-tools';
import { BUILDER_SYSTEM_PROMPT } from '../prompts/builder-prompt';
import { wrapHandlersWithCallback } from '../utils/handler-wrapper';
import type { Task, TaskResult, ToolDefinition, Artifact } from '../types';
import { getModelForAgent } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('BuilderAgent');

/*
 * ============================================================================
 * BUILDER AGENT
 * ============================================================================
 */

/**
 * Agent de build et exécution
 */
export class BuilderAgent extends BaseAgent {
  private shell: ShellInterface | null = null;
  private executedCommands: Array<{
    command: string;
    success: boolean;
    output: string;
    timestamp: Date;
  }> = [];

  constructor() {
    super({
      name: 'builder',
      description:
        'Agent de build et exécution. Lance les commandes npm, les scripts shell, ' +
        'démarre les serveurs de développement. Gère les dépendances.',
      model: getModelForAgent('builder'), // Sonnet 4.5 - efficace pour les commandes
      tools: SHELL_TOOLS,
      systemPrompt: BUILDER_SYSTEM_PROMPT,
      maxTokens: 16384, // Increased from 4K to 16K for complex builds
      temperature: 0.1,
      timeout: 300000, // 5 minutes - builds peuvent être longs (npm install, compilation)
      maxRetries: 2, // Réessayer en cas d'instabilité réseau npm
    });
  }

  /**
   * Implémentation du system prompt
   */
  getSystemPrompt(): string {
    return BUILDER_SYSTEM_PROMPT;
  }

  /**
   * Exécution principale de l'agent (appelée par run())
   */
  async execute(task: Task): Promise<TaskResult> {
    // Vérifier que le shell est initialisé
    if (!this.shell) {
      return {
        success: false,
        output: 'Shell not initialized. Call setShell() first.',
        errors: [
          {
            code: 'SHELL_NOT_INITIALIZED',
            message: 'Shell interface not initialized',
            recoverable: false,
          },
        ],
      };
    }

    // Réinitialiser l'historique des commandes
    this.executedCommands = [];

    // Construire le prompt avec contexte
    let prompt = task.prompt;

    // Ajouter les processus en cours au contexte
    const runningProcesses = this.shell.getRunningProcesses();

    if (runningProcesses.length > 0) {
      prompt += '\n\nProcessus actuellement en cours:\n';

      for (const proc of runningProcesses) {
        prompt += `- ${proc.command} (ID: ${proc.id}, Port: ${proc.port || 'N/A'})\n`;
      }
    }

    // Exécuter la boucle d'agent
    const result = await this.runAgentLoop(prompt);

    // Ajouter les artefacts des commandes exécutées
    if (result.success && this.executedCommands.length > 0) {
      result.artifacts = result.artifacts || [];

      for (const cmd of this.executedCommands) {
        const artifact: Artifact = {
          type: 'command',
          content: cmd.output,
          title: cmd.command,
        };
        result.artifacts.push(artifact);
      }
    }

    // Ajouter les données des processus en cours
    result.data = result.data || {};
    result.data.runningProcesses = this.shell.getRunningProcesses();
    result.data.commandHistory = this.executedCommands;

    return result;
  }

  /**
   * Initialiser l'interface shell
   * Enregistre les outils shell dans le ToolRegistry
   */
  setShell(shell: ShellInterface): void {
    this.shell = shell;

    // Créer des handlers wrappés pour tracker les commandes
    const handlers = createShellToolHandlers(shell);
    const wrappedHandlers = wrapHandlersWithCallback(handlers, (toolName, input, result) =>
      this.trackCommand(toolName, input, result),
    );
    this.registerTools(SHELL_TOOLS, wrappedHandlers, 'shell');

    this.log('info', 'Shell interface initialized for BuilderAgent with ToolRegistry');
  }

  /**
   * Obtenir les processus en cours
   */
  getRunningProcesses(): RunningProcess[] {
    if (!this.shell) {
      return [];
    }

    return this.shell.getRunningProcesses();
  }

  /**
   * Obtenir l'historique des commandes exécutées
   */
  getCommandHistory(): typeof this.executedCommands {
    return [...this.executedCommands];
  }

  // executeToolHandler est hérité de BaseAgent et utilise le ToolRegistry

  /**
   * Tracker les commandes exécutées
   */
  private trackCommand(
    toolName: string,
    input: Record<string, unknown>,
    result: { success: boolean; output: unknown; error?: string },
  ): void {
    let command = toolName;

    switch (toolName) {
      case 'npm_command':
        command = `pnpm ${input.command}${input.args ? ' ' + (input.args as string[]).join(' ') : ''}`;
        break;

      case 'shell_command':
        command = input.command as string;
        break;

      case 'start_dev_server':
        command = `pnpm run ${input.script || 'dev'}`;
        break;

      case 'install_dependencies':
        command = `pnpm add ${(input.packages as string[]).join(' ')}${input.dev ? ' -D' : ''}`;
        break;
    }

    this.executedCommands.push({
      command,
      success: result.success,
      output: String(result.output || result.error || ''),
      timestamp: new Date(),
    });
  }

  /**
   * Arrêter tous les processus en cours
   */
  async stopAllProcesses(): Promise<void> {
    if (!this.shell) {
      return;
    }

    const processes = this.shell.getRunningProcesses();

    for (const proc of processes) {
      await this.shell.kill(proc.id);
      this.log('info', `Stopped process: ${proc.command}`);
    }
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
 * Créer une instance du Builder Agent
 */
export function createBuilderAgent(shell?: ShellInterface): BuilderAgent {
  const agent = new BuilderAgent();

  if (shell) {
    agent.setShell(shell);
  }

  return agent;
}
