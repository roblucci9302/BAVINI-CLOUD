/**
 * Architect Agent - Agent de planification et design système
 * Spécialisé dans l'analyse architecturale et les décisions techniques
 */

import { BaseAgent } from '../core/base-agent';
import type { ToolHandler } from '../core/tool-registry';
import { ARCHITECT_SYSTEM_PROMPT } from '../prompts/architect-prompt';
import { READ_TOOLS, type FileSystem } from '../tools/read-tools';
import { getSharedReadHandlers } from '../utils/shared-handler-pool';
import { extractFilePaths, extractCodeBlocks } from '../utils/output-parser';
import type { Task, TaskResult, Artifact } from '../types';
import { getModelForAgent } from '../types';

/**
 * Agent d'architecture et planification
 * Capacités : read_file, grep, glob, list_directory (lecture seule)
 * Mode : Lecture + Conseil (pas de modifications)
 */
export class ArchitectAgent extends BaseAgent {
  private fileSystem: FileSystem | null = null;

  constructor() {
    super({
      name: 'architect',
      description:
        'Agent de planification et design système. Analyse les besoins, propose des architectures, ' +
        'documente les trade-offs et guide les décisions techniques avant implémentation.',
      model: getModelForAgent('architect'), // Opus 4.5 pour le raisonnement avancé
      tools: READ_TOOLS,
      systemPrompt: ARCHITECT_SYSTEM_PROMPT,
      maxTokens: 32768, // Plus de tokens pour les documents de design détaillés
      temperature: 0.3, // Un peu de créativité pour les propositions
      timeout: 180000, // 3 minutes max
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

    this.log('info', 'FileSystem initialized for ArchitectAgent with ToolRegistry');
  }

  /**
   * Implémentation du system prompt
   */
  getSystemPrompt(): string {
    return ARCHITECT_SYSTEM_PROMPT;
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

    this.log('info', 'Starting architecture task', {
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
      this.log('error', 'Architecture task failed', { error });
      throw error;
    }
  }

  /**
   * Construire le prompt complet pour la tâche
   */
  private buildPrompt(task: Task): string {
    let prompt = task.prompt;

    // Ajouter des instructions spécifiques pour l'architecture
    prompt = `## Tâche d'Architecture

${task.prompt}

## Instructions
1. Analyse d'abord le code existant pour comprendre le contexte
2. Identifie les composants concernés et les dépendances
3. Propose 2-3 approches avec trade-offs documentés
4. Fais une recommandation claire avec justification
5. Liste les fichiers qui devront être modifiés`;

    // Ajouter le contexte si disponible
    if (task.context) {
      if (task.context.files && task.context.files.length > 0) {
        prompt += `\n\n### Fichiers de contexte à considérer:\n${task.context.files.map((f) => `- ${f}`).join('\n')}`;
      }

      if (task.context.workingDirectory) {
        prompt += `\n\n### Dossier de travail: ${task.context.workingDirectory}`;
      }

      if (task.context.additionalInfo) {
        prompt += `\n\n### Informations supplémentaires:\n${JSON.stringify(task.context.additionalInfo, null, 2)}`;
      }
    }

    return prompt;
  }

  /**
   * Enrichir le résultat avec des artifacts structurés
   */
  private enrichResult(result: TaskResult): TaskResult {
    // Extraire les fichiers mentionnés dans la sortie
    const filePaths = extractFilePaths(result.output);

    if (filePaths.length > 0) {
      const artifacts: Artifact[] = filePaths.map((path) => ({
        type: 'analysis' as const,
        path,
        content: `File identified for architecture: ${path}`,
        action: 'read' as const,
      }));

      result.artifacts = [...(result.artifacts || []), ...artifacts];
    }

    // Extraire les blocs de code (diagrammes, exemples)
    const codeBlocks = extractCodeBlocks(result.output);
    if (codeBlocks.length > 0) {
      result.data = result.data || {};
      result.data.codeBlocks = codeBlocks.map((block) => ({
        language: block.language,
        content: block.content,
      }));
    }

    // Marquer comme design document
    result.data = result.data || {};
    result.data.type = 'architecture-design';

    return result;
  }
}

/**
 * Factory pour créer un ArchitectAgent avec FileSystem
 */
export function createArchitectAgent(fs?: FileSystem): ArchitectAgent {
  const agent = new ArchitectAgent();

  if (fs) {
    agent.setFileSystem(fs);
  }

  return agent;
}
