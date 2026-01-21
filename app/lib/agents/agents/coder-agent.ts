/**
 * Coder Agent - Agent spécialisé dans l'écriture et la modification de code
 * Combine les outils de lecture et d'écriture pour des modifications précises
 */

import { BaseAgent } from '../core/base-agent';
import type { ToolHandler } from '../core/tool-registry';
import { READ_TOOLS } from '../tools/read-tools';
import { WRITE_TOOLS, createWriteToolHandlers, type WritableFileSystem } from '../tools/write-tools';
import { getSharedReadHandlers } from '../utils/shared-handler-pool';
import { wrapHandlersOnSuccess } from '../utils/handler-wrapper';
import { DESIGN_TOOLS, createDesignToolHandlersV2 } from '../tools/design-tools';
import { INSPECT_TOOLS, createInspectToolHandlers, type ScreenshotServiceInterface } from '../tools/inspect-tools';
import {
  INTEGRATION_TOOLS,
  createIntegrationToolHandlers,
  type ConnectorsStateInterface,
  type SupabaseClientInterface,
} from '../tools/integration-tools';
import {
  CODER_SYSTEM_PROMPT,
  getCoderSystemPrompt,
  type DesignGuidelinesConfig,
} from '../prompts/coder-prompt';
import type { Task, TaskResult, ToolDefinition, Artifact } from '../types';
import { getModelForAgent } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('CoderAgent');

/*
 * ============================================================================
 * TYPE FILESYSTEM POUR CODER
 * ============================================================================
 */

/**
 * Type pour le système de fichiers complet (lecture + écriture)
 * WritableFileSystem inclut déjà toutes les méthodes nécessaires
 */
export type CoderFileSystem = WritableFileSystem;

/*
 * ============================================================================
 * CODER AGENT
 * ============================================================================
 */

/**
 * Agent de développement pour l'écriture de code
 */
/**
 * Configuration du rollback pour CoderAgent
 */
export interface CoderRollbackConfig {
  /** Activer le mécanisme de snapshots/rollback */
  enabled: boolean;

  /** Rollback automatique en cas d'erreur dans execute() */
  rollbackOnError: boolean;
}

/**
 * Agent de développement pour l'écriture de code
 */
export class CoderAgent extends BaseAgent {
  private fileSystem: CoderFileSystem | null = null;
  private modifiedFiles: Map<string, { action: string; content?: string }> = new Map();
  private screenshotService: ScreenshotServiceInterface | null = null;
  private connectorsState: ConnectorsStateInterface | null = null;

  /** Snapshots des fichiers pour le rollback */
  private fileSnapshots: Map<string, string | null> = new Map();

  /** Configuration du rollback */
  private rollbackConfig: CoderRollbackConfig = {
    enabled: true,
    rollbackOnError: true,
  };

  /** Configuration des design guidelines */
  private designGuidelinesConfig: DesignGuidelinesConfig | undefined;

  constructor(designGuidelinesConfig?: DesignGuidelinesConfig) {
    // Generate system prompt with design guidelines if config is provided
    const systemPrompt = designGuidelinesConfig
      ? getCoderSystemPrompt(designGuidelinesConfig)
      : CODER_SYSTEM_PROMPT;

    super({
      name: 'coder',
      description:
        'Agent de développement. Peut créer, modifier, et supprimer des fichiers de code. ' +
        "Spécialisé dans l'écriture de code propre et fonctionnel.",
      model: getModelForAgent('coder'), // Opus 4.5 pour code de haute qualité
      tools: [...READ_TOOLS, ...WRITE_TOOLS, ...DESIGN_TOOLS, ...INSPECT_TOOLS, ...INTEGRATION_TOOLS],
      systemPrompt,
      maxTokens: 32768, // Increased from 8K to 32K for complex code generation
      temperature: 0.1, // Plus déterministe pour le code
      timeout: 180000, // 3 minutes - génération de code peut être intensive
      maxRetries: 2, // Réessayer en cas d'erreur transitoire
    });

    this.designGuidelinesConfig = designGuidelinesConfig;

    // Enregistrer les outils de design immédiatement (pas de dépendance externe)
    // Utilise V2 qui inclut TOUS les handlers: generate_design_inspiration, get_modern_components, get_palette_2025, get_design_template
    const designHandlers = createDesignToolHandlersV2();
    this.registerTools(DESIGN_TOOLS, designHandlers, 'design');

    // Enregistrer les outils d'inspection (mode mock par défaut)
    const inspectHandlers = createInspectToolHandlers();
    this.registerTools(INSPECT_TOOLS, inspectHandlers, 'inspect');

    // Enregistrer les outils d'intégration (mode mock par défaut)
    const integrationHandlers = createIntegrationToolHandlers();
    this.registerTools(INTEGRATION_TOOLS, integrationHandlers, 'integrations');
  }

  /**
   * Configurer le service de screenshots (optionnel)
   * Si configuré, les captures seront réelles au lieu de mock
   */
  setScreenshotService(service: ScreenshotServiceInterface): void {
    this.screenshotService = service;

    // Ré-enregistrer les outils d'inspection avec le vrai service
    const inspectHandlers = createInspectToolHandlers(service);
    this.registerTools(INSPECT_TOOLS, inspectHandlers, 'inspect');

    this.log('info', 'Screenshot service configured for CoderAgent');
  }

  /**
   * Configurer l'état des connecteurs (pour vérifier les intégrations)
   */
  setConnectorsState(
    state: ConnectorsStateInterface,
    supabaseFactory?: (credentials: Record<string, string>) => SupabaseClientInterface,
  ): void {
    this.connectorsState = state;

    // Ré-enregistrer les outils d'intégration avec l'état réel
    const integrationHandlers = createIntegrationToolHandlers(state, supabaseFactory);
    this.registerTools(INTEGRATION_TOOLS, integrationHandlers, 'integrations');

    this.log('info', 'Connectors state configured for CoderAgent');
  }

  /**
   * Implémentation du system prompt
   */
  getSystemPrompt(): string {
    return this.designGuidelinesConfig
      ? getCoderSystemPrompt(this.designGuidelinesConfig)
      : CODER_SYSTEM_PROMPT;
  }

  /**
   * Exécution principale de l'agent (appelée par run())
   */
  async execute(task: Task): Promise<TaskResult> {
    // Vérifier que le FileSystem est initialisé
    if (!this.fileSystem) {
      return {
        success: false,
        output: 'FileSystem not initialized. Call setFileSystem() first.',
        errors: [
          {
            code: 'FS_NOT_INITIALIZED',
            message: 'FileSystem not initialized',
            recoverable: false,
          },
        ],
      };
    }

    // Réinitialiser les fichiers modifiés et les snapshots
    this.modifiedFiles.clear();
    this.fileSnapshots.clear();

    // Créer des snapshots des fichiers existants si le rollback est activé
    if (this.rollbackConfig.enabled && task.context?.files && task.context.files.length > 0) {
      await this.createFileSnapshots(task.context.files);
    }

    // Construire le prompt avec contexte
    let prompt = task.prompt;

    if (task.context?.files && task.context.files.length > 0) {
      prompt += '\n\nFichiers pertinents:\n';

      for (const file of task.context.files) {
        prompt += `- ${file}\n`;
      }
    }

    if (task.context?.codeSnippets && task.context.codeSnippets.length > 0) {
      prompt += '\n\nExtraits de code fournis:\n';

      for (const snippet of task.context.codeSnippets) {
        prompt += `\n### ${snippet.filePath} (lignes ${snippet.startLine}-${snippet.endLine})\n`;
        prompt += '```' + (snippet.language || '') + '\n';
        prompt += snippet.content;
        prompt += '\n```\n';
      }
    }

    try {
      // Exécuter la boucle d'agent
      const result = await this.runAgentLoop(prompt);

      // Ajouter les artefacts des fichiers modifiés
      if (result.success && this.modifiedFiles.size > 0) {
        result.artifacts = result.artifacts || [];

        for (const [path, info] of this.modifiedFiles) {
          const artifact: Artifact = {
            type: 'file',
            path,
            action: info.action as 'created' | 'modified' | 'deleted',
            content: info.content || '',
            title: `${info.action}: ${path}`,
          };
          result.artifacts.push(artifact);
        }
      }

      // Succès: nettoyer les snapshots
      this.fileSnapshots.clear();
      return result;
    } catch (error) {
      // Échec: rollback si activé
      if (this.rollbackConfig.enabled && this.rollbackConfig.rollbackOnError && this.fileSnapshots.size > 0) {
        this.log('warn', 'Rolling back changes due to error', {
          error: error instanceof Error ? error.message : String(error),
          filesAffected: this.fileSnapshots.size,
        });
        await this.rollbackChanges();
      }

      throw error;
    }
  }

  /**
   * Initialiser le système de fichiers
   * Enregistre les outils de lecture et d'écriture dans le ToolRegistry
   */
  setFileSystem(fs: CoderFileSystem): void {
    this.fileSystem = fs;

    // Utiliser les handlers partagés pour la lecture (cached via WeakMap)
    const readHandlers = getSharedReadHandlers(fs);
    this.registerTools(READ_TOOLS, readHandlers as unknown as Record<string, ToolHandler>, 'filesystem');

    // Créer des handlers d'écriture wrappés pour tracker les modifications
    const writeHandlers = createWriteToolHandlers(fs);
    const wrappedWriteHandlers = wrapHandlersOnSuccess(writeHandlers, (toolName, input) =>
      this.trackFileModification(toolName, input),
    );
    this.registerTools(WRITE_TOOLS, wrappedWriteHandlers as Record<string, ToolHandler>, 'filesystem');

    this.log('info', 'FileSystem initialized for CoderAgent with ToolRegistry');
  }

  /**
   * Obtenir les fichiers modifiés lors de la dernière exécution
   */
  getModifiedFiles(): Map<string, { action: string; content?: string }> {
    return new Map(this.modifiedFiles);
  }

  // executeToolHandler est hérité de BaseAgent et utilise le ToolRegistry

  /**
   * Tracker les modifications de fichiers
   */
  private trackFileModification(toolName: string, input: Record<string, unknown>): void {
    switch (toolName) {
      case 'write_file':
        this.modifiedFiles.set(input.path as string, {
          action: 'created',
          content: input.content as string,
        });
        break;

      case 'edit_file':
        this.modifiedFiles.set(input.path as string, {
          action: 'modified',
        });
        break;

      case 'delete_file':
        this.modifiedFiles.set(input.path as string, {
          action: 'deleted',
        });
        break;

      case 'move_file':
        this.modifiedFiles.set(input.oldPath as string, {
          action: 'deleted',
        });
        this.modifiedFiles.set(input.newPath as string, {
          action: 'created',
        });
        break;
    }
  }

  /**
   * Obtenir la liste des outils disponibles
   */
  getAvailableTools(): ToolDefinition[] {
    return this.config.tools;
  }

  /*
   * ============================================================================
   * ROLLBACK/CLEANUP FUNCTIONALITY
   * ============================================================================
   */

  /**
   * Configurer le rollback
   */
  configureRollback(config: Partial<CoderRollbackConfig>): void {
    this.rollbackConfig = { ...this.rollbackConfig, ...config };
    logger.info('Rollback configuration updated', { config: this.rollbackConfig });
  }

  /**
   * Obtenir la configuration de rollback actuelle
   */
  getRollbackConfig(): CoderRollbackConfig {
    return { ...this.rollbackConfig };
  }

  /**
   * Créer des snapshots des fichiers existants pour permettre le rollback
   *
   * @param paths - Chemins des fichiers à sauvegarder
   */
  private async createFileSnapshots(paths: string[]): Promise<void> {
    if (!this.fileSystem) {
      return;
    }

    for (const filePath of paths) {
      try {
        const content = await this.fileSystem.readFile(filePath);
        this.fileSnapshots.set(filePath, content);
        this.log('debug', 'Created snapshot', { file: filePath });
      } catch {
        // Le fichier n'existe pas encore, stocker null pour pouvoir le supprimer en cas de rollback
        this.fileSnapshots.set(filePath, null);
        this.log('debug', 'File does not exist, will delete on rollback', { file: filePath });
      }
    }

    this.log('info', `Created ${this.fileSnapshots.size} file snapshots for potential rollback`);
  }

  /**
   * Restaurer les fichiers depuis les snapshots (rollback)
   */
  private async rollbackChanges(): Promise<void> {
    if (!this.fileSystem) {
      return;
    }

    let restored = 0;
    let deleted = 0;
    let errors = 0;

    for (const [filePath, content] of this.fileSnapshots) {
      try {
        if (content === null) {
          // Le fichier n'existait pas avant, le supprimer s'il a été créé
          try {
            await this.fileSystem.deleteFile(filePath);
            deleted++;
            this.log('info', 'Rollback: deleted new file', { file: filePath });
          } catch {
            // Le fichier n'a peut-être pas été créé, ignorer
          }
        } else {
          // Restaurer le contenu original
          await this.fileSystem.writeFile(filePath, content);
          restored++;
          this.log('info', 'Rollback: restored file', { file: filePath });
        }
      } catch (error) {
        errors++;
        logger.error('Failed to rollback file', {
          file: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.fileSnapshots.clear();
    this.modifiedFiles.clear();

    this.log('info', 'Rollback completed', { restored, deleted, errors });
  }

  /**
   * Effectuer un rollback manuel (disponible publiquement)
   *
   * @returns Nombre de fichiers restaurés
   */
  async performRollback(): Promise<{ restored: number; deleted: number; errors: number }> {
    if (this.fileSnapshots.size === 0) {
      this.log('warn', 'No snapshots available for rollback');
      return { restored: 0, deleted: 0, errors: 0 };
    }

    const result = { restored: 0, deleted: 0, errors: 0 };

    if (!this.fileSystem) {
      return result;
    }

    for (const [filePath, content] of this.fileSnapshots) {
      try {
        if (content === null) {
          try {
            await this.fileSystem.deleteFile(filePath);
            result.deleted++;
          } catch {
            // Fichier n'existe pas, ignorer
          }
        } else {
          await this.fileSystem.writeFile(filePath, content);
          result.restored++;
        }
      } catch (error) {
        result.errors++;
        logger.error('Failed to rollback file', {
          file: filePath,
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    this.fileSnapshots.clear();
    this.modifiedFiles.clear();

    return result;
  }

  /**
   * Vider les snapshots sans restaurer (commit les changements)
   */
  clearSnapshots(): void {
    this.fileSnapshots.clear();
    this.log('debug', 'File snapshots cleared');
  }

  /**
   * Vérifier si des snapshots sont disponibles
   */
  hasSnapshots(): boolean {
    return this.fileSnapshots.size > 0;
  }

  /**
   * Obtenir la liste des fichiers avec snapshots
   */
  getSnapshotFiles(): string[] {
    return Array.from(this.fileSnapshots.keys());
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer une instance du Coder Agent
 */
export function createCoderAgent(fs?: CoderFileSystem): CoderAgent {
  const agent = new CoderAgent();

  if (fs) {
    agent.setFileSystem(fs);
  }

  return agent;
}
