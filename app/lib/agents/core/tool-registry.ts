/**
 * @fileoverview Registre centralisé des handlers d'outils pour les agents BAVINI
 *
 * Ce module fournit le ToolRegistry, une classe qui permet aux agents
 * d'enregistrer et d'exécuter des outils de manière unifiée. Il gère:
 * - Enregistrement d'outils avec leurs handlers
 * - Exécution synchrone, parallèle et séquentielle
 * - Catégorisation et statistiques
 * - Factory functions pour créer des registres pré-configurés
 *
 * @module agents/core/tool-registry
 * @see {@link BaseAgent} pour l'utilisation des outils dans les agents
 *
 * @example
 * ```typescript
 * // Créer un registre et enregistrer des outils
 * const registry = new ToolRegistry();
 *
 * registry.register(
 *   { name: 'read_file', description: '...', inputSchema: {...} },
 *   async (input) => ({ success: true, output: fileContent })
 * );
 *
 * // Exécuter un outil
 * const result = await registry.execute('read_file', { path: '/src/app.ts' });
 * ```
 */

import type { ToolDefinition, ToolExecutionResult } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ToolRegistry');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Type d'un handler d'outil
 */
export type ToolHandler = (input: Record<string, unknown>) => Promise<ToolExecutionResult>;

/**
 * Configuration d'un outil enregistré
 */
export interface RegisteredTool {
  /** Définition de l'outil (pour le LLM) */
  definition: ToolDefinition;

  /** Handler d'exécution */
  handler: ToolHandler;

  /** Catégorie de l'outil (filesystem, shell, git, etc.) */
  category?: string;

  /** Priorité (pour résolution de conflits) */
  priority?: number;

  /** Timestamp d'enregistrement */
  registeredAt: Date;
}

/**
 * Options d'enregistrement
 */
export interface RegisterOptions {
  category?: string;
  priority?: number;

  /** Remplacer si existe déjà */
  override?: boolean;
}

/**
 * Statistiques du registre
 */
export interface RegistryStats {
  totalTools: number;
  byCategory: Record<string, number>;
  executionCount: number;
  successCount: number;
  failureCount: number;
}

/*
 * ============================================================================
 * TOOL REGISTRY
 * ============================================================================
 */

/**
 * Registre centralisé des outils pour les agents BAVINI
 *
 * Cette classe gère l'enregistrement et l'exécution des outils utilisés
 * par les agents. Chaque outil est composé d'une définition (pour le LLM)
 * et d'un handler (fonction d'exécution).
 *
 * @class ToolRegistry
 *
 * @example
 * ```typescript
 * const registry = new ToolRegistry();
 *
 * // Enregistrer un outil de lecture de fichier
 * registry.register(
 *   {
 *     name: 'read_file',
 *     description: 'Lit le contenu d\'un fichier',
 *     inputSchema: {
 *       type: 'object',
 *       properties: { path: { type: 'string' } },
 *       required: ['path']
 *     }
 *   },
 *   async (input) => {
 *     const content = await fs.readFile(input.path as string, 'utf-8');
 *     return { success: true, output: content };
 *   },
 *   { category: 'filesystem' }
 * );
 *
 * // Exécuter l'outil
 * const result = await registry.execute('read_file', { path: '/app.ts' });
 * console.log(result.output);
 * ```
 */
export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();
  private stats = {
    executionCount: 0,
    successCount: 0,
    failureCount: 0,
  };

  /**
   * Cache des définitions d'outils pour éviter les allocations/tris répétés
   * Invalidé automatiquement lors des modifications du registre
   */
  private cachedDefinitions: ToolDefinition[] | null = null;
  private cacheInvalidated: boolean = true;

  /*
   * ============================================================================
   * ENREGISTREMENT
   * ============================================================================
   */

  /**
   * Enregistrer un outil avec son handler
   */
  register(definition: ToolDefinition, handler: ToolHandler, options: RegisterOptions = {}): void {
    const { category, priority = 0, override = false } = options;

    if (this.tools.has(definition.name) && !override) {
      throw new Error(`Tool '${definition.name}' is already registered. Use override: true to replace it.`);
    }

    this.tools.set(definition.name, {
      definition,
      handler,
      category,
      priority,
      registeredAt: new Date(),
    });

    // Invalider le cache des définitions
    this.cacheInvalidated = true;

    logger.debug(`Registered tool: ${definition.name}`, { category, priority });
  }

  /**
   * Enregistrer plusieurs outils d'un coup
   * @param definitions Liste des définitions d'outils
   * @param handlers Map nom -> handler
   * @param category Catégorie commune
   */
  registerBatch(definitions: ToolDefinition[], handlers: Record<string, ToolHandler>, category?: string): void {
    let registered = 0;
    let skipped = 0;

    for (const def of definitions) {
      const handler = handlers[def.name];

      if (handler) {
        try {
          this.register(def, handler, { category });
          registered++;
        } catch (error) {
          logger.warn(`Failed to register tool ${def.name}:`, error);
          skipped++;
        }
      } else {
        logger.warn(`No handler found for tool: ${def.name}`);
        skipped++;
      }
    }

    // Invalider le cache si au moins un outil a été enregistré
    if (registered > 0) {
      this.cacheInvalidated = true;
    }

    logger.debug(`Batch registered ${registered} tools, skipped ${skipped}`, { category });
  }

  /**
   * Désinscrire un outil
   */
  unregister(name: string): boolean {
    const existed = this.tools.delete(name);

    if (existed) {
      // Invalider le cache des définitions
      this.cacheInvalidated = true;
      logger.debug(`Unregistered tool: ${name}`);
    }

    return existed;
  }

  /**
   * Désinscrire tous les outils d'une catégorie
   */
  unregisterCategory(category: string): number {
    let count = 0;

    for (const [name, tool] of this.tools) {
      if (tool.category === category) {
        this.tools.delete(name);
        count++;
      }
    }

    // Invalider le cache si au moins un outil a été supprimé
    if (count > 0) {
      this.cacheInvalidated = true;
    }

    logger.debug(`Unregistered ${count} tools from category: ${category}`);

    return count;
  }

  /*
   * ============================================================================
   * REQUÊTES
   * ============================================================================
   */

  /**
   * Vérifier si un outil existe
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Obtenir un outil enregistré
   */
  get(name: string): RegisteredTool | undefined {
    return this.tools.get(name);
  }

  /**
   * Obtenir le handler d'un outil
   */
  getHandler(name: string): ToolHandler | undefined {
    return this.tools.get(name)?.handler;
  }

  /**
   * Obtenir la définition d'un outil
   */
  getDefinition(name: string): ToolDefinition | undefined {
    return this.tools.get(name)?.definition;
  }

  /**
   * Obtenir toutes les définitions d'outils (pour le LLM)
   *
   * Utilise un cache interne pour éviter les allocations et le tri
   * à chaque appel. Le cache est invalidé automatiquement lors de
   * modifications du registre (register, unregister, clear, etc.)
   *
   * @returns {ToolDefinition[]} Définitions triées par priorité (décroissante)
   */
  getDefinitions(): ToolDefinition[] {
    if (this.cacheInvalidated || !this.cachedDefinitions) {
      this.cachedDefinitions = Array.from(this.tools.values())
        .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))
        .map((t) => t.definition);
      this.cacheInvalidated = false;
      logger.debug(`Definitions cache rebuilt with ${this.cachedDefinitions.length} tools`);
    }

    return this.cachedDefinitions;
  }

  /**
   * Obtenir les noms de tous les outils
   */
  getToolNames(): string[] {
    return Array.from(this.tools.keys());
  }

  /**
   * Obtenir les outils par catégorie
   */
  getByCategory(category: string): RegisteredTool[] {
    return Array.from(this.tools.values()).filter((t) => t.category === category);
  }

  /**
   * Obtenir toutes les catégories
   */
  getCategories(): string[] {
    const categories = new Set<string>();

    for (const tool of this.tools.values()) {
      if (tool.category) {
        categories.add(tool.category);
      }
    }

    return Array.from(categories);
  }

  /*
   * ============================================================================
   * EXÉCUTION
   * ============================================================================
   */

  /**
   * Exécuter un outil enregistré
   *
   * Cette méthode trouve l'outil dans le registre, exécute son handler
   * avec les paramètres fournis, et retourne le résultat.
   *
   * @param {string} name - Nom de l'outil à exécuter
   * @param {Record<string, unknown>} input - Paramètres d'entrée de l'outil
   * @returns {Promise<ToolExecutionResult>} Le résultat de l'exécution
   *
   * @example
   * ```typescript
   * const result = await registry.execute('read_file', {
   *   path: '/src/index.ts'
   * });
   *
   * if (result.success) {
   *   console.log('Contenu:', result.output);
   * } else {
   *   console.error('Erreur:', result.error);
   * }
   * ```
   */
  async execute(name: string, input: Record<string, unknown>): Promise<ToolExecutionResult> {
    this.stats.executionCount++;

    const tool = this.tools.get(name);

    if (!tool) {
      this.stats.failureCount++;
      logger.warn(`Tool not found: ${name}`);

      return {
        success: false,
        output: null,
        error: `Tool '${name}' not found in registry. Available tools: ${this.getToolNames().join(', ')}`,
      };
    }

    const startTime = Date.now();

    try {
      logger.debug(`Executing tool: ${name}`, { input });

      const result = await tool.handler(input);
      const executionTime = Date.now() - startTime;

      if (result.success) {
        this.stats.successCount++;
      } else {
        this.stats.failureCount++;
      }

      logger.debug(`Tool ${name} completed`, {
        success: result.success,
        executionTime,
      });

      return {
        ...result,
        executionTime,
      };
    } catch (error) {
      this.stats.failureCount++;

      const executionTime = Date.now() - startTime;

      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Tool ${name} failed:`, error);

      return {
        success: false,
        output: null,
        error: `Tool execution failed: ${errorMessage}`,
        executionTime,
      };
    }
  }

  /**
   * Exécuter plusieurs outils en parallèle
   */
  async executeParallel(
    calls: Array<{ name: string; input: Record<string, unknown> }>,
  ): Promise<ToolExecutionResult[]> {
    return Promise.all(calls.map((call) => this.execute(call.name, call.input)));
  }

  /**
   * Exécuter plusieurs outils en séquence
   */
  async executeSequential(
    calls: Array<{ name: string; input: Record<string, unknown> }>,
    stopOnError: boolean = true,
  ): Promise<ToolExecutionResult[]> {
    const results: ToolExecutionResult[] = [];

    for (const call of calls) {
      const result = await this.execute(call.name, call.input);
      results.push(result);

      if (!result.success && stopOnError) {
        break;
      }
    }

    return results;
  }

  /*
   * ============================================================================
   * UTILITAIRES
   * ============================================================================
   */

  /**
   * Nombre d'outils enregistrés
   */
  get size(): number {
    return this.tools.size;
  }

  /**
   * Vider le registre
   */
  clear(): void {
    this.tools.clear();
    this.stats = {
      executionCount: 0,
      successCount: 0,
      failureCount: 0,
    };

    // Invalider et vider le cache
    this.cachedDefinitions = null;
    this.cacheInvalidated = true;

    logger.debug('Registry cleared');
  }

  /**
   * Obtenir les statistiques
   */
  getStats(): RegistryStats {
    const byCategory: Record<string, number> = {};

    for (const tool of this.tools.values()) {
      const cat = tool.category || 'uncategorized';
      byCategory[cat] = (byCategory[cat] || 0) + 1;
    }

    return {
      totalTools: this.tools.size,
      byCategory,
      ...this.stats,
    };
  }

  /**
   * Cloner le registre (shallow copy)
   */
  clone(): ToolRegistry {
    const newRegistry = new ToolRegistry();

    for (const [name, tool] of this.tools) {
      newRegistry.tools.set(name, { ...tool });
    }

    // Le nouveau registre a cacheInvalidated = true par défaut,
    // donc le cache sera reconstruit au premier getDefinitions()

    return newRegistry;
  }

  /**
   * Fusionner un autre registre (les outils existants ne sont pas remplacés)
   */
  merge(other: ToolRegistry): void {
    let added = 0;

    for (const [name, tool] of other.tools) {
      if (!this.tools.has(name)) {
        this.tools.set(name, { ...tool });
        added++;
      }
    }

    // Invalider le cache si au moins un outil a été ajouté
    if (added > 0) {
      this.cacheInvalidated = true;
      logger.debug(`Merged ${added} tools from another registry`);
    }
  }
}

/*
 * ============================================================================
 * FACTORY FUNCTIONS
 * ============================================================================
 */

/**
 * Créer un registre avec les outils de lecture (filesystem)
 */
export async function createReadToolsRegistry(
  fileSystem: import('../tools/read-tools').FileSystem,
): Promise<ToolRegistry> {
  const { READ_TOOLS, createReadToolHandlers } = await import('../tools/read-tools');

  const registry = new ToolRegistry();
  const handlers = createReadToolHandlers(fileSystem);

  registry.registerBatch(READ_TOOLS, handlers as unknown as Record<string, ToolHandler>, 'filesystem');

  return registry;
}

/**
 * Créer un registre avec les outils d'écriture (filesystem)
 */
export async function createWriteToolsRegistry(
  fileSystem: import('../tools/write-tools').WritableFileSystem,
): Promise<ToolRegistry> {
  const { WRITE_TOOLS, createWriteToolHandlers } = await import('../tools/write-tools');

  const registry = new ToolRegistry();
  const handlers = createWriteToolHandlers(fileSystem);

  registry.registerBatch(WRITE_TOOLS, handlers, 'filesystem');

  return registry;
}

/**
 * Créer un registre avec les outils shell
 */
export async function createShellToolsRegistry(
  shell: import('../tools/shell-tools').ShellInterface,
): Promise<ToolRegistry> {
  const { SHELL_TOOLS, createShellToolHandlers } = await import('../tools/shell-tools');

  const registry = new ToolRegistry();
  const handlers = createShellToolHandlers(shell);

  registry.registerBatch(SHELL_TOOLS, handlers, 'shell');

  return registry;
}

/**
 * Créer un registre avec les outils Git
 */
export async function createGitToolsRegistry(git: import('../tools/git-tools').GitInterface): Promise<ToolRegistry> {
  const { GIT_TOOLS, createGitToolHandlers } = await import('../tools/git-tools');

  const registry = new ToolRegistry();
  const handlers = createGitToolHandlers(git);

  registry.registerBatch(GIT_TOOLS, handlers, 'git');

  return registry;
}

/**
 * Créer un registre avec les outils de design
 * Utilise createDesignToolHandlersV2 pour avoir TOUS les handlers (incluant get_design_template)
 */
export async function createDesignToolsRegistry(): Promise<ToolRegistry> {
  const { DESIGN_TOOLS, createDesignToolHandlersV2 } = await import('../tools/design-tools');

  const registry = new ToolRegistry();
  const handlers = createDesignToolHandlersV2();

  registry.registerBatch(DESIGN_TOOLS, handlers, 'design');

  return registry;
}

/**
 * Créer un registre avec les outils d'inspection (screenshots)
 */
export async function createInspectToolsRegistry(
  screenshotService?: import('../tools/inspect-tools').ScreenshotServiceInterface,
): Promise<ToolRegistry> {
  const { INSPECT_TOOLS, createInspectToolHandlers } = await import('../tools/inspect-tools');

  const registry = new ToolRegistry();
  const handlers = createInspectToolHandlers(screenshotService);

  registry.registerBatch(INSPECT_TOOLS, handlers, 'inspect');

  return registry;
}

/**
 * Créer un registre avec les outils d'intégration (services connectés)
 */
export async function createIntegrationToolsRegistry(
  connectorsState?: import('../tools/integration-tools').ConnectorsStateInterface,
  supabaseClientFactory?: (
    credentials: Record<string, string>,
  ) => import('../tools/integration-tools').SupabaseClientInterface,
): Promise<ToolRegistry> {
  const { INTEGRATION_TOOLS, createIntegrationToolHandlers } = await import('../tools/integration-tools');

  const registry = new ToolRegistry();
  const handlers = createIntegrationToolHandlers(connectorsState, supabaseClientFactory);

  registry.registerBatch(INTEGRATION_TOOLS, handlers, 'integrations');

  return registry;
}

/**
 * Créer un registre avec les outils web (recherche et fetch)
 */
export async function createWebToolsRegistry(
  webSearchService?: import('../tools/web-tools').WebSearchServiceInterface,
): Promise<ToolRegistry> {
  const { WEB_TOOLS, createWebToolHandlers } = await import('../tools/web-tools');

  const registry = new ToolRegistry();
  const handlers = createWebToolHandlers(webSearchService);

  registry.registerBatch(WEB_TOOLS, handlers, 'web');

  return registry;
}

/**
 * Créer un registre complet avec tous les outils standards
 *
 * Factory function qui crée un ToolRegistry pré-configuré avec
 * les outils de filesystem, shell et git selon les adapters fournis.
 *
 * @param {Object} adapters - Adapters pour les différentes catégories d'outils
 * @param {WritableFileSystem} [adapters.fileSystem] - Adapter pour les opérations filesystem
 * @param {ShellInterface} [adapters.shell] - Adapter pour les commandes shell
 * @param {GitInterface} [adapters.git] - Adapter pour les opérations Git
 * @returns {Promise<ToolRegistry>} Un registre configuré avec les outils appropriés
 *
 * @example
 * ```typescript
 * const registry = await createStandardToolRegistry({
 *   fileSystem: webcontainerAdapter,
 *   shell: shellAdapter,
 *   git: gitAdapter
 * });
 *
 * console.log(`${registry.size} outils disponibles`);
 * console.log('Catégories:', registry.getCategories());
 * ```
 */
export async function createStandardToolRegistry(adapters: {
  fileSystem?: import('../tools/write-tools').WritableFileSystem;
  shell?: import('../tools/shell-tools').ShellInterface;
  git?: import('../tools/git-tools').GitInterface;
}): Promise<ToolRegistry> {
  const registry = new ToolRegistry();

  // Outils de lecture et écriture
  if (adapters.fileSystem) {
    const { READ_TOOLS, createReadToolHandlers } = await import('../tools/read-tools');
    const { WRITE_TOOLS, createWriteToolHandlers } = await import('../tools/write-tools');

    const readHandlers = createReadToolHandlers(adapters.fileSystem);
    const writeHandlers = createWriteToolHandlers(adapters.fileSystem);

    registry.registerBatch(READ_TOOLS, readHandlers as unknown as Record<string, ToolHandler>, 'filesystem');
    registry.registerBatch(WRITE_TOOLS, writeHandlers, 'filesystem');
  }

  // Outils shell
  if (adapters.shell) {
    const { SHELL_TOOLS, createShellToolHandlers } = await import('../tools/shell-tools');
    const handlers = createShellToolHandlers(adapters.shell);

    registry.registerBatch(SHELL_TOOLS, handlers, 'shell');
  }

  // Outils Git
  if (adapters.git) {
    const { GIT_TOOLS, createGitToolHandlers } = await import('../tools/git-tools');
    const handlers = createGitToolHandlers(adapters.git);

    registry.registerBatch(GIT_TOOLS, handlers, 'git');
  }

  logger.info(`Standard tool registry created with ${registry.size} tools`);

  return registry;
}
