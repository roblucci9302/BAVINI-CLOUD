/**
 * Explore Agent - Agent d'exploration en lecture seule
 * Spécialisé dans la recherche et l'analyse de code
 */

import { BaseAgent } from '../core/base-agent';
import type { ToolHandler } from '../core/tool-registry';
import { EXPLORE_SYSTEM_PROMPT } from '../prompts/explore-prompt';
import { READ_TOOLS, type FileSystem } from '../tools/read-tools';
import { getSharedReadHandlers } from '../utils/shared-handler-pool';
import { extractFilePaths, extractJSON, extractCodeBlocks, extractLineReferences } from '../utils/output-parser';
import type { Task, TaskResult, Artifact } from '../types';
import { getModelForAgent } from '../types';

/**
 * Agent d'exploration du codebase
 * Capacités : read_file, grep, glob, list_directory
 * Mode : Lecture seule
 */
export class ExploreAgent extends BaseAgent {
  private fileSystem: FileSystem | null = null;

  constructor() {
    super({
      name: 'explore',
      description:
        "Agent d'exploration en LECTURE SEULE. Spécialisé dans la recherche de fichiers, " +
        "l'analyse de code, la navigation dans le codebase. " +
        'Utilise grep, glob, read_file, list_directory.',
      model: getModelForAgent('explore'), // Sonnet 4.5 - rapide pour l'exploration
      tools: READ_TOOLS,
      systemPrompt: EXPLORE_SYSTEM_PROMPT,
      maxTokens: 16384, // Increased from 8K to 16K for larger analyses
      temperature: 0.1, // Très déterministe pour l'exploration
      timeout: 120000, // 2 minutes max
      maxRetries: 2,
    });
  }

  /**
   * Initialiser le système de fichiers (WebContainer)
   * Enregistre les outils de lecture dans le ToolRegistry
   */
  setFileSystem(fs: FileSystem): void {
    this.fileSystem = fs;

    // Utiliser les handlers partagés (cached via WeakMap)
    const handlers = getSharedReadHandlers(fs);
    this.registerTools(READ_TOOLS, handlers as unknown as Record<string, ToolHandler>, 'filesystem');

    this.log('info', 'FileSystem initialized for ExploreAgent with ToolRegistry');
  }

  /**
   * Implémentation du system prompt
   */
  getSystemPrompt(): string {
    return EXPLORE_SYSTEM_PROMPT;
  }

  /**
   * Exécution principale de l'agent
   */
  async execute(task: Task): Promise<TaskResult> {
    if (!this.fileSystem) {
      return {
        success: false,
        output: 'FileSystem not initialized. Call setFileSystem() first.',
        errors: [
          {
            code: 'NO_FILESYSTEM',
            message: 'FileSystem not initialized',
            recoverable: false,
          },
        ],
      };
    }

    this.log('info', 'Starting exploration task', {
      prompt: task.prompt.substring(0, 100) + '...',
    });

    try {
      // Construire le prompt avec le contexte
      const prompt = this.buildPrompt(task);

      // Exécuter la boucle d'agent
      const result = await this.runAgentLoop(prompt);

      // Enrichir le résultat avec les artifacts
      return this.enrichResult(result);
    } catch (error) {
      this.log('error', 'Exploration failed', { error });
      throw error;
    }
  }

  // executeToolHandler est hérité de BaseAgent et utilise le ToolRegistry

  /**
   * Construire le prompt complet pour la tâche
   */
  private buildPrompt(task: Task): string {
    let prompt = task.prompt;

    // Ajouter le contexte si disponible
    if (task.context) {
      if (task.context.files && task.context.files.length > 0) {
        prompt += `\n\nFichiers de contexte à considérer:\n${task.context.files.map((f) => `- ${f}`).join('\n')}`;
      }

      if (task.context.workingDirectory) {
        prompt += `\n\nDossier de travail: ${task.context.workingDirectory}`;
      }

      if (task.context.additionalInfo) {
        prompt += `\n\nInformations supplémentaires:\n${JSON.stringify(task.context.additionalInfo, null, 2)}`;
      }
    }

    return prompt;
  }

  /**
   * Enrichir le résultat avec des artifacts structurés
   * Utilise le parser robuste pour extraire les informations
   */
  private enrichResult(result: TaskResult): TaskResult {
    // Extraire les fichiers mentionnés dans la sortie (parser robuste)
    const filePaths = extractFilePaths(result.output);

    if (filePaths.length > 0) {
      const artifacts: Artifact[] = filePaths.map((path) => ({
        type: 'analysis' as const,
        path,
        content: `File referenced in exploration: ${path}`,
        action: 'read' as const,
      }));

      result.artifacts = [...(result.artifacts || []), ...artifacts];
    }

    // Extraire les références de lignes (file:line)
    const lineRefs = extractLineReferences(result.output);
    if (lineRefs.length > 0) {
      result.data = result.data || {};
      result.data.lineReferences = lineRefs;
    }

    // Extraire les blocs de code
    const codeBlocks = extractCodeBlocks(result.output);
    if (codeBlocks.length > 0) {
      result.data = result.data || {};
      result.data.codeBlocks = codeBlocks.map((block) => ({
        language: block.language,
        content: block.content,
      }));
    }

    // Ajouter des données structurées si possible (parser JSON robuste)
    const jsonData = extractJSON(result.output);
    if (jsonData) {
      result.data = result.data || {};
      result.data.extracted = jsonData;
    }

    return result;
  }
}

/**
 * Factory pour créer un ExploreAgent avec FileSystem
 */
export function createExploreAgent(fs?: FileSystem): ExploreAgent {
  const agent = new ExploreAgent();

  if (fs) {
    agent.setFileSystem(fs);
  }

  return agent;
}
