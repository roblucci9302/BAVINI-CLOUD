# PHASE 1 - PLAN D'IMPLÉMENTATION DÉTAILLÉ

## Vue d'ensemble

**Objectif :** Corriger les 2 problèmes critiques identifiés dans l'audit
- 🔴 P0-1 : Tool Handler non implémenté dans BaseAgent
- 🔴 P0-2 : Exécution parallèle manquante dans Orchestrator

**Fichiers concernés :**
```
app/lib/agents/
├── core/
│   ├── base-agent.ts           ← MODIFIER (Tool Registry)
│   ├── tool-registry.ts        ← CRÉER
│   └── tool-executor.ts        ← CRÉER
├── execution/
│   ├── parallel-executor.ts    ← CRÉER
│   ├── dependency-graph.ts     ← CRÉER
│   └── execution-context.ts    ← CRÉER
├── agents/
│   └── orchestrator.ts         ← MODIFIER (Parallel execution)
└── types.ts                    ← MODIFIER (Nouveaux types)
```

---

## PARTIE 1 : TOOL REGISTRY & HANDLER SYSTEM

### 1.1 Analyse du code existant

**Problème actuel dans `base-agent.ts:314-320` :**
```typescript
protected async executeToolHandler(
  toolName: string,
  input: Record<string, unknown>
): Promise<unknown> {
  // Par défaut, retourne une erreur - les sous-classes doivent implémenter
  throw new Error(`Tool handler not implemented for: ${toolName}`);
}
```

**Structure existante des tools :**
- `tools/shell-tools.ts` → `createShellToolHandlers(shell)` retourne `Record<string, handler>`
- `tools/write-tools.ts` → `createWriteToolHandlers(fs)` retourne `Record<string, handler>`
- `tools/read-tools.ts` → `createReadToolHandlers(fs)` retourne `Record<string, handler>`
- `tools/git-tools.ts` → `createGitToolHandlers(git)` retourne `Record<string, handler>`

**Conclusion :** Les handlers existent déjà, mais il n'y a pas de registre centralisé pour les connecter à `BaseAgent`.

---

### 1.2 Création du Tool Registry

**Fichier : `app/lib/agents/core/tool-registry.ts`**

```typescript
/**
 * Tool Registry - Registre centralisé des handlers d'outils
 * Permet aux agents d'enregistrer et d'exécuter des outils
 */

import type { ToolDefinition, ToolExecutionResult } from '../types';

/**
 * Type d'un handler d'outil
 */
export type ToolHandler = (
  input: Record<string, unknown>
) => Promise<ToolExecutionResult>;

/**
 * Configuration d'un outil enregistré
 */
export interface RegisteredTool {
  definition: ToolDefinition;
  handler: ToolHandler;
  category?: string;
  priority?: number;
}

/**
 * Registre des outils pour un agent
 */
export class ToolRegistry {
  private tools: Map<string, RegisteredTool> = new Map();

  /**
   * Enregistrer un outil avec son handler
   */
  register(
    definition: ToolDefinition,
    handler: ToolHandler,
    options?: { category?: string; priority?: number }
  ): void {
    if (this.tools.has(definition.name)) {
      throw new Error(`Tool '${definition.name}' is already registered`);
    }

    this.tools.set(definition.name, {
      definition,
      handler,
      category: options?.category,
      priority: options?.priority ?? 0,
    });
  }

  /**
   * Enregistrer plusieurs outils d'un coup
   */
  registerBatch(
    definitions: ToolDefinition[],
    handlers: Record<string, ToolHandler>,
    category?: string
  ): void {
    for (const def of definitions) {
      const handler = handlers[def.name];
      if (handler) {
        this.register(def, handler, { category });
      }
    }
  }

  /**
   * Désinscrire un outil
   */
  unregister(name: string): boolean {
    return this.tools.delete(name);
  }

  /**
   * Vérifier si un outil existe
   */
  has(name: string): boolean {
    return this.tools.has(name);
  }

  /**
   * Obtenir un outil
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
   * Obtenir toutes les définitions d'outils
   */
  getDefinitions(): ToolDefinition[] {
    return Array.from(this.tools.values()).map(t => t.definition);
  }

  /**
   * Obtenir les outils par catégorie
   */
  getByCategory(category: string): RegisteredTool[] {
    return Array.from(this.tools.values())
      .filter(t => t.category === category);
  }

  /**
   * Exécuter un outil
   */
  async execute(
    name: string,
    input: Record<string, unknown>
  ): Promise<ToolExecutionResult> {
    const tool = this.tools.get(name);

    if (!tool) {
      return {
        success: false,
        output: null,
        error: `Tool '${name}' not found in registry`,
      };
    }

    try {
      return await tool.handler(input);
    } catch (error) {
      return {
        success: false,
        output: null,
        error: `Tool execution failed: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

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
  }
}

/**
 * Créer un registre pré-configuré avec les outils standards
 */
export function createStandardToolRegistry(
  adapters: {
    fileSystem?: import('../tools/write-tools').WritableFileSystem;
    shell?: import('../tools/shell-tools').ShellInterface;
    git?: import('../tools/git-tools').GitInterface;
  }
): ToolRegistry {
  const registry = new ToolRegistry();

  // Importer et enregistrer les outils selon les adapters fournis
  if (adapters.fileSystem) {
    const { READ_TOOLS, createReadToolHandlers } = require('../tools/read-tools');
    const { WRITE_TOOLS, createWriteToolHandlers } = require('../tools/write-tools');

    registry.registerBatch(
      READ_TOOLS,
      createReadToolHandlers(adapters.fileSystem),
      'filesystem'
    );
    registry.registerBatch(
      WRITE_TOOLS,
      createWriteToolHandlers(adapters.fileSystem),
      'filesystem'
    );
  }

  if (adapters.shell) {
    const { SHELL_TOOLS, createShellToolHandlers } = require('../tools/shell-tools');
    registry.registerBatch(
      SHELL_TOOLS,
      createShellToolHandlers(adapters.shell),
      'shell'
    );
  }

  if (adapters.git) {
    const { GIT_TOOLS, createGitToolHandlers } = require('../tools/git-tools');
    registry.registerBatch(
      GIT_TOOLS,
      createGitToolHandlers(adapters.git),
      'git'
    );
  }

  return registry;
}
```

---

### 1.3 Modification de BaseAgent

**Fichier : `app/lib/agents/core/base-agent.ts`**

**Changements à apporter :**

```typescript
// AJOUTER en haut du fichier
import { ToolRegistry, type ToolHandler } from './tool-registry';

// AJOUTER dans la classe BaseAgent
export abstract class BaseAgent {
  // ... propriétés existantes ...

  // AJOUTER cette propriété
  protected toolRegistry: ToolRegistry = new ToolRegistry();

  // ... constructeur existant ...

  // AJOUTER ces méthodes publiques

  /**
   * Enregistrer un outil avec son handler
   */
  registerTool(
    definition: ToolDefinition,
    handler: ToolHandler
  ): void {
    this.toolRegistry.register(definition, handler);
    // Mettre à jour la config pour le LLM
    if (!this.config.tools.find(t => t.name === definition.name)) {
      this.config.tools.push(definition);
    }
  }

  /**
   * Enregistrer plusieurs outils
   */
  registerTools(
    definitions: ToolDefinition[],
    handlers: Record<string, ToolHandler>
  ): void {
    this.toolRegistry.registerBatch(definitions, handlers);
    // Mettre à jour la config
    for (const def of definitions) {
      if (!this.config.tools.find(t => t.name === def.name)) {
        this.config.tools.push(def);
      }
    }
  }

  /**
   * Obtenir le registre d'outils (pour les sous-classes)
   */
  protected getToolRegistry(): ToolRegistry {
    return this.toolRegistry;
  }

  // MODIFIER executeToolHandler existante
  protected async executeToolHandler(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    // 1. Chercher dans le registre
    if (this.toolRegistry.has(toolName)) {
      const result = await this.toolRegistry.execute(toolName, input);
      if (!result.success) {
        throw new Error(result.error || 'Tool execution failed');
      }
      return result.output;
    }

    // 2. Permettre aux sous-classes d'override pour des cas spéciaux
    return this.handleCustomTool(toolName, input);
  }

  /**
   * Handler pour les outils personnalisés (à override par les sous-classes)
   */
  protected async handleCustomTool(
    toolName: string,
    input: Record<string, unknown>
  ): Promise<unknown> {
    throw new Error(`Tool '${toolName}' not found in registry and no custom handler provided`);
  }
}
```

---

### 1.4 Tests du Tool Registry

**Fichier : `app/lib/agents/core/tool-registry.spec.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ToolRegistry, createStandardToolRegistry } from './tool-registry';
import type { ToolDefinition } from '../types';

describe('ToolRegistry', () => {
  let registry: ToolRegistry;

  const mockTool: ToolDefinition = {
    name: 'test_tool',
    description: 'A test tool',
    inputSchema: {
      type: 'object',
      properties: {
        input: { type: 'string', description: 'Test input' }
      },
      required: ['input']
    }
  };

  const mockHandler = vi.fn().mockResolvedValue({
    success: true,
    output: 'test result'
  });

  beforeEach(() => {
    registry = new ToolRegistry();
    vi.clearAllMocks();
  });

  describe('register', () => {
    it('should register a tool successfully', () => {
      registry.register(mockTool, mockHandler);

      expect(registry.has('test_tool')).toBe(true);
      expect(registry.size).toBe(1);
    });

    it('should throw if tool already registered', () => {
      registry.register(mockTool, mockHandler);

      expect(() => registry.register(mockTool, mockHandler))
        .toThrow("Tool 'test_tool' is already registered");
    });

    it('should store category and priority', () => {
      registry.register(mockTool, mockHandler, {
        category: 'test',
        priority: 10
      });

      const tool = registry.get('test_tool');
      expect(tool?.category).toBe('test');
      expect(tool?.priority).toBe(10);
    });
  });

  describe('execute', () => {
    it('should execute registered tool', async () => {
      registry.register(mockTool, mockHandler);

      const result = await registry.execute('test_tool', { input: 'hello' });

      expect(result.success).toBe(true);
      expect(result.output).toBe('test result');
      expect(mockHandler).toHaveBeenCalledWith({ input: 'hello' });
    });

    it('should return error for unknown tool', async () => {
      const result = await registry.execute('unknown', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('should handle execution errors', async () => {
      const failingHandler = vi.fn().mockRejectedValue(new Error('Boom!'));
      registry.register(mockTool, failingHandler);

      const result = await registry.execute('test_tool', {});

      expect(result.success).toBe(false);
      expect(result.error).toContain('Boom!');
    });
  });

  describe('registerBatch', () => {
    it('should register multiple tools', () => {
      const tools: ToolDefinition[] = [
        { ...mockTool, name: 'tool1' },
        { ...mockTool, name: 'tool2' },
      ];
      const handlers = {
        tool1: mockHandler,
        tool2: mockHandler,
      };

      registry.registerBatch(tools, handlers, 'batch');

      expect(registry.size).toBe(2);
      expect(registry.getByCategory('batch')).toHaveLength(2);
    });
  });

  describe('getDefinitions', () => {
    it('should return all tool definitions', () => {
      registry.register(mockTool, mockHandler);
      registry.register({ ...mockTool, name: 'tool2' }, mockHandler);

      const definitions = registry.getDefinitions();

      expect(definitions).toHaveLength(2);
      expect(definitions.map(d => d.name)).toContain('test_tool');
      expect(definitions.map(d => d.name)).toContain('tool2');
    });
  });
});
```

---

## PARTIE 2 : EXÉCUTION PARALLÈLE

### 2.1 Analyse du code existant

**Problème actuel dans `orchestrator.ts:466-515` :**
```typescript
// Exécuter les sous-tâches séquentiellement (pour Phase 1)
// TODO: Phase 2 - Ajouter l'exécution parallèle avec gestion des dépendances
for (let i = 0; i < decision.subTasks.length; i++) {
  // ... exécution séquentielle ...
}
```

**Types existants dans `types.ts` :**
```typescript
interface ExecutionStep {
  order: number;
  agent: AgentType;
  task: Task;
  parallel?: boolean;      // ← Déjà prévu !
  dependsOn?: number[];    // ← Déjà prévu !
}
```

---

### 2.2 Création du Dependency Graph

**Fichier : `app/lib/agents/execution/dependency-graph.ts`**

```typescript
/**
 * Dependency Graph - Gestion des dépendances entre tâches
 * Utilise l'algorithme de Kahn pour le tri topologique
 */

export interface GraphNode<T> {
  id: string;
  data: T;
  dependencies: Set<string>;
}

export interface ExecutionLevel<T> {
  level: number;
  nodes: GraphNode<T>[];
}

/**
 * Graphe de dépendances avec tri topologique
 */
export class DependencyGraph<T> {
  private nodes: Map<string, GraphNode<T>> = new Map();

  /**
   * Ajouter un nœud au graphe
   */
  addNode(id: string, data: T, dependencies: string[] = []): void {
    if (this.nodes.has(id)) {
      throw new Error(`Node '${id}' already exists in graph`);
    }

    this.nodes.set(id, {
      id,
      data,
      dependencies: new Set(dependencies),
    });
  }

  /**
   * Ajouter une dépendance
   */
  addDependency(nodeId: string, dependsOnId: string): void {
    const node = this.nodes.get(nodeId);
    if (!node) {
      throw new Error(`Node '${nodeId}' not found`);
    }
    node.dependencies.add(dependsOnId);
  }

  /**
   * Vérifier s'il y a des cycles
   */
  hasCycle(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycleUtil = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = this.nodes.get(nodeId);
      if (!node) return false;

      for (const depId of node.dependencies) {
        if (!visited.has(depId)) {
          if (hasCycleUtil(depId)) return true;
        } else if (recursionStack.has(depId)) {
          return true;
        }
      }

      recursionStack.delete(nodeId);
      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (hasCycleUtil(nodeId)) return true;
      }
    }

    return false;
  }

  /**
   * Tri topologique par niveaux (Algorithme de Kahn)
   * Retourne les nœuds groupés par niveau d'exécution
   * Les nœuds du même niveau peuvent s'exécuter en parallèle
   */
  topologicalSort(): ExecutionLevel<T>[] {
    if (this.hasCycle()) {
      throw new Error('Cannot perform topological sort: graph contains cycles');
    }

    // Calculer le degré entrant de chaque nœud
    const inDegree = new Map<string, number>();
    for (const [id, node] of this.nodes) {
      inDegree.set(id, node.dependencies.size);
    }

    // Trouver les nœuds sans dépendances (niveau 0)
    const levels: ExecutionLevel<T>[] = [];
    let currentLevel: string[] = [];

    for (const [id, degree] of inDegree) {
      if (degree === 0) {
        currentLevel.push(id);
      }
    }

    let levelNumber = 0;

    while (currentLevel.length > 0) {
      // Ajouter le niveau actuel
      levels.push({
        level: levelNumber,
        nodes: currentLevel.map(id => this.nodes.get(id)!),
      });

      // Préparer le niveau suivant
      const nextLevel: string[] = [];

      for (const nodeId of currentLevel) {
        // Pour chaque nœud qui dépend de ce nœud
        for (const [id, node] of this.nodes) {
          if (node.dependencies.has(nodeId)) {
            const newDegree = inDegree.get(id)! - 1;
            inDegree.set(id, newDegree);

            if (newDegree === 0) {
              nextLevel.push(id);
            }
          }
        }
      }

      currentLevel = nextLevel;
      levelNumber++;
    }

    return levels;
  }

  /**
   * Obtenir les dépendances d'un nœud
   */
  getDependencies(nodeId: string): string[] {
    const node = this.nodes.get(nodeId);
    return node ? Array.from(node.dependencies) : [];
  }

  /**
   * Obtenir les nœuds qui dépendent d'un nœud donné
   */
  getDependents(nodeId: string): string[] {
    const dependents: string[] = [];
    for (const [id, node] of this.nodes) {
      if (node.dependencies.has(nodeId)) {
        dependents.push(id);
      }
    }
    return dependents;
  }

  /**
   * Nombre de nœuds
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * Obtenir tous les nœuds
   */
  getNodes(): GraphNode<T>[] {
    return Array.from(this.nodes.values());
  }
}
```

---

### 2.3 Création du Parallel Executor

**Fichier : `app/lib/agents/execution/parallel-executor.ts`**

```typescript
/**
 * Parallel Executor - Exécution parallèle de tâches avec dépendances
 */

import { DependencyGraph, type ExecutionLevel } from './dependency-graph';
import type { Task, TaskResult, AgentType } from '../types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ParallelExecutor');

/**
 * Définition d'une sous-tâche pour l'exécuteur
 */
export interface SubtaskDefinition {
  id: string;
  agent: AgentType;
  task: Task;
  dependencies?: string[];
  timeout?: number;
}

/**
 * Résultat d'exécution d'une sous-tâche
 */
export interface SubtaskResult {
  id: string;
  success: boolean;
  result: TaskResult;
  executionTime: number;
  level: number;
}

/**
 * Options de l'exécuteur
 */
export interface ParallelExecutorOptions {
  /** Nombre max de tâches en parallèle */
  maxConcurrency?: number;
  /** Timeout global en ms */
  globalTimeout?: number;
  /** Continuer même si une tâche échoue */
  continueOnError?: boolean;
  /** Callback pour le progress */
  onProgress?: (completed: number, total: number, current: SubtaskResult) => void;
}

/**
 * Fonction d'exécution d'une tâche
 */
export type TaskExecutor = (
  task: Task,
  agent: AgentType
) => Promise<TaskResult>;

/**
 * Exécuteur parallèle de tâches
 */
export class ParallelExecutor {
  private options: Required<ParallelExecutorOptions>;

  constructor(options: ParallelExecutorOptions = {}) {
    this.options = {
      maxConcurrency: options.maxConcurrency ?? 5,
      globalTimeout: options.globalTimeout ?? 300000, // 5 min
      continueOnError: options.continueOnError ?? false,
      onProgress: options.onProgress ?? (() => {}),
    };
  }

  /**
   * Exécuter les sous-tâches avec gestion des dépendances
   */
  async execute(
    subtasks: SubtaskDefinition[],
    executor: TaskExecutor
  ): Promise<SubtaskResult[]> {
    if (subtasks.length === 0) {
      return [];
    }

    // Construire le graphe de dépendances
    const graph = this.buildGraph(subtasks);

    // Obtenir les niveaux d'exécution
    const levels = graph.topologicalSort();

    logger.info(`Executing ${subtasks.length} subtasks in ${levels.length} levels`);

    const results: SubtaskResult[] = [];
    const completedIds = new Set<string>();
    let totalCompleted = 0;

    // Exécuter niveau par niveau
    for (const level of levels) {
      logger.debug(`Executing level ${level.level} with ${level.nodes.length} tasks`);

      // Exécuter les tâches du niveau en parallèle (avec limite)
      const levelResults = await this.executeLevel(
        level,
        executor,
        completedIds,
        (result) => {
          totalCompleted++;
          this.options.onProgress(totalCompleted, subtasks.length, result);
        }
      );

      results.push(...levelResults);

      // Marquer comme complétées
      for (const result of levelResults) {
        completedIds.add(result.id);
      }

      // Vérifier les échecs
      const failures = levelResults.filter(r => !r.success);
      if (failures.length > 0 && !this.options.continueOnError) {
        logger.warn(`Level ${level.level} had failures, stopping execution`);
        break;
      }
    }

    return results;
  }

  /**
   * Construire le graphe de dépendances
   */
  private buildGraph(subtasks: SubtaskDefinition[]): DependencyGraph<SubtaskDefinition> {
    const graph = new DependencyGraph<SubtaskDefinition>();

    for (const subtask of subtasks) {
      graph.addNode(subtask.id, subtask, subtask.dependencies || []);
    }

    return graph;
  }

  /**
   * Exécuter un niveau de tâches
   */
  private async executeLevel(
    level: ExecutionLevel<SubtaskDefinition>,
    executor: TaskExecutor,
    completedIds: Set<string>,
    onComplete: (result: SubtaskResult) => void
  ): Promise<SubtaskResult[]> {
    const tasks = level.nodes.map(node => node.data);

    // Limiter la concurrence
    const results: SubtaskResult[] = [];
    const batches = this.chunk(tasks, this.options.maxConcurrency);

    for (const batch of batches) {
      const batchPromises = batch.map(async (subtask) => {
        const startTime = Date.now();

        try {
          // Vérifier que toutes les dépendances sont complétées
          for (const depId of subtask.dependencies || []) {
            if (!completedIds.has(depId)) {
              throw new Error(`Dependency '${depId}' not completed`);
            }
          }

          const result = await this.executeWithTimeout(
            () => executor(subtask.task, subtask.agent),
            subtask.timeout || this.options.globalTimeout
          );

          const subtaskResult: SubtaskResult = {
            id: subtask.id,
            success: result.success,
            result,
            executionTime: Date.now() - startTime,
            level: level.level,
          };

          onComplete(subtaskResult);
          return subtaskResult;
        } catch (error) {
          const subtaskResult: SubtaskResult = {
            id: subtask.id,
            success: false,
            result: {
              success: false,
              output: `Execution failed: ${error instanceof Error ? error.message : String(error)}`,
              errors: [{
                code: 'EXECUTION_ERROR',
                message: error instanceof Error ? error.message : String(error),
                recoverable: false,
              }],
            },
            executionTime: Date.now() - startTime,
            level: level.level,
          };

          onComplete(subtaskResult);
          return subtaskResult;
        }
      });

      const batchResults = await Promise.all(batchPromises);
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Exécuter avec timeout
   */
  private async executeWithTimeout<T>(
    fn: () => Promise<T>,
    timeout: number
  ): Promise<T> {
    return Promise.race([
      fn(),
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(`Execution timeout after ${timeout}ms`)), timeout);
      }),
    ]);
  }

  /**
   * Diviser en chunks
   */
  private chunk<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}

/**
 * Factory pour créer un exécuteur parallèle
 */
export function createParallelExecutor(
  options?: ParallelExecutorOptions
): ParallelExecutor {
  return new ParallelExecutor(options);
}
```

---

### 2.4 Modification de l'Orchestrator

**Fichier : `app/lib/agents/agents/orchestrator.ts`**

**Changements à apporter dans `executeDecomposition()` :**

```typescript
// AJOUTER l'import en haut
import {
  ParallelExecutor,
  createParallelExecutor,
  type SubtaskDefinition,
  type SubtaskResult
} from '../execution/parallel-executor';

// MODIFIER la méthode executeDecomposition
private async executeDecomposition(
  decision: OrchestrationDecision,
  originalTask: Task
): Promise<TaskResult> {
  if (!decision.subTasks || decision.subTasks.length === 0) {
    return {
      success: false,
      output: 'Aucune sous-tâche définie',
      errors: [{
        code: 'NO_SUBTASKS',
        message: 'Decomposition produced no subtasks',
        recoverable: false,
      }],
    };
  }

  this.log('info', `Decomposing into ${decision.subTasks.length} subtasks`, {
    subtasks: decision.subTasks.map((t) => t.type),
  });

  // Convertir les sous-tâches en format pour l'exécuteur
  const subtaskDefinitions: SubtaskDefinition[] = decision.subTasks.map((subTaskDef, i) => ({
    id: `${originalTask.id}-step-${i}`,
    agent: (subTaskDef.type || 'explore') as AgentType,
    task: {
      id: `${originalTask.id}-step-${i}`,
      type: subTaskDef.type || 'explore',
      prompt: subTaskDef.prompt,
      context: {
        ...originalTask.context,
      },
      status: 'pending' as const,
      metadata: {
        parentTaskId: originalTask.id,
        source: 'orchestrator' as const,
      },
      createdAt: new Date(),
    },
    dependencies: subTaskDef.dependencies?.map(idx => `${originalTask.id}-step-${idx}`),
  }));

  // Créer l'exécuteur parallèle
  const executor = createParallelExecutor({
    maxConcurrency: 3, // Limite de 3 agents en parallèle
    continueOnError: true, // Continuer même si une tâche échoue
    onProgress: (completed, total, current) => {
      this.log('debug', `Progress: ${completed}/${total}`, {
        subtaskId: current.id,
        success: current.success,
      });
      this.emitEvent('task:progress' as any, {
        completed,
        total,
        current: current.id,
      });
    },
  });

  // Exécuter avec le callback qui utilise le registry d'agents
  const results = await executor.execute(
    subtaskDefinitions,
    async (task, agentType) => {
      const agent = this.registry.get(agentType);

      if (!agent) {
        return {
          success: false,
          output: `Agent ${agentType} non disponible`,
          errors: [{
            code: 'AGENT_NOT_FOUND',
            message: `Agent ${agentType} not found`,
            recoverable: false,
          }],
        };
      }

      return agent.run(task, this.apiKey);
    }
  );

  // Agréger les résultats
  const artifacts: Artifact[] = [];
  for (const r of results) {
    if (r.result.artifacts) {
      artifacts.push(...r.result.artifacts);
    }
  }

  const allSuccessful = results.every((r) => r.success);
  const successCount = results.filter((r) => r.success).length;

  // Grouper par niveau pour un meilleur affichage
  const byLevel = new Map<number, SubtaskResult[]>();
  for (const r of results) {
    const level = byLevel.get(r.level) || [];
    level.push(r);
    byLevel.set(r.level, level);
  }

  const combinedOutput = Array.from(byLevel.entries())
    .sort(([a], [b]) => a - b)
    .map(([level, levelResults]) => {
      const levelOutput = levelResults
        .map(r => `#### ${r.id}\n${r.result.output}`)
        .join('\n\n');
      return `### Niveau ${level} (${levelResults.length} tâche(s))\n${levelOutput}`;
    })
    .join('\n\n---\n\n');

  return {
    success: allSuccessful,
    output: `## Résultat de l'exécution (${successCount}/${results.length} réussies)\n\n` +
            `**Niveaux d'exécution:** ${byLevel.size}\n` +
            `**Exécution parallèle:** Oui\n\n` +
            combinedOutput,
    artifacts,
    data: {
      subtaskResults: results,
      reasoning: decision.reasoning,
      executionStats: {
        total: results.length,
        successful: successCount,
        failed: results.length - successCount,
        levels: byLevel.size,
        totalTime: results.reduce((sum, r) => sum + r.executionTime, 0),
      },
    },
  };
}
```

---

### 2.5 Tests du Parallel Executor

**Fichier : `app/lib/agents/execution/parallel-executor.spec.ts`**

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ParallelExecutor, type SubtaskDefinition } from './parallel-executor';
import type { TaskResult } from '../types';

describe('ParallelExecutor', () => {
  let executor: ParallelExecutor;

  const createMockSubtask = (
    id: string,
    dependencies: string[] = []
  ): SubtaskDefinition => ({
    id,
    agent: 'coder',
    task: {
      id,
      type: 'coder',
      prompt: `Task ${id}`,
      status: 'pending',
      createdAt: new Date(),
    },
    dependencies,
  });

  const createMockExecutor = (
    delay = 10,
    results?: Record<string, TaskResult>
  ) => {
    return vi.fn().mockImplementation(async (task) => {
      await new Promise(r => setTimeout(r, delay));
      return results?.[task.id] ?? {
        success: true,
        output: `Result for ${task.id}`,
      };
    });
  };

  beforeEach(() => {
    executor = new ParallelExecutor({ maxConcurrency: 3 });
  });

  describe('execute', () => {
    it('should execute tasks without dependencies in parallel', async () => {
      const subtasks = [
        createMockSubtask('task-1'),
        createMockSubtask('task-2'),
        createMockSubtask('task-3'),
      ];

      const mockExecutor = createMockExecutor(50);
      const startTime = Date.now();

      const results = await executor.execute(subtasks, mockExecutor);

      const duration = Date.now() - startTime;

      // Toutes les tâches devraient s'exécuter en parallèle (~50ms, pas 150ms)
      expect(duration).toBeLessThan(100);
      expect(results).toHaveLength(3);
      expect(results.every(r => r.success)).toBe(true);
    });

    it('should respect dependencies', async () => {
      const executionOrder: string[] = [];

      const subtasks = [
        createMockSubtask('task-1'),
        createMockSubtask('task-2', ['task-1']),
        createMockSubtask('task-3', ['task-2']),
      ];

      const mockExecutor = vi.fn().mockImplementation(async (task) => {
        executionOrder.push(task.id);
        await new Promise(r => setTimeout(r, 10));
        return { success: true, output: `Done ${task.id}` };
      });

      await executor.execute(subtasks, mockExecutor);

      // task-1 doit s'exécuter avant task-2, task-2 avant task-3
      expect(executionOrder.indexOf('task-1'))
        .toBeLessThan(executionOrder.indexOf('task-2'));
      expect(executionOrder.indexOf('task-2'))
        .toBeLessThan(executionOrder.indexOf('task-3'));
    });

    it('should execute tasks at same level in parallel', async () => {
      // task-2 et task-3 dépendent de task-1, donc niveau 1
      const subtasks = [
        createMockSubtask('task-1'),
        createMockSubtask('task-2', ['task-1']),
        createMockSubtask('task-3', ['task-1']),
      ];

      const mockExecutor = createMockExecutor(50);
      const startTime = Date.now();

      const results = await executor.execute(subtasks, mockExecutor);

      const duration = Date.now() - startTime;

      // ~50ms pour task-1, puis ~50ms pour task-2 et task-3 en parallèle = ~100ms
      expect(duration).toBeLessThan(150);
      expect(duration).toBeGreaterThan(80);
      expect(results).toHaveLength(3);
    });

    it('should stop on error when continueOnError is false', async () => {
      executor = new ParallelExecutor({
        maxConcurrency: 3,
        continueOnError: false
      });

      const subtasks = [
        createMockSubtask('task-1'),
        createMockSubtask('task-2', ['task-1']),
      ];

      const mockExecutor = createMockExecutor(10, {
        'task-1': { success: false, output: 'Failed' },
      });

      const results = await executor.execute(subtasks, mockExecutor);

      // Ne devrait pas exécuter task-2
      expect(results).toHaveLength(1);
      expect(results[0].success).toBe(false);
    });

    it('should continue on error when continueOnError is true', async () => {
      executor = new ParallelExecutor({
        maxConcurrency: 3,
        continueOnError: true
      });

      const subtasks = [
        createMockSubtask('task-1'),
        createMockSubtask('task-2'),
      ];

      const mockExecutor = createMockExecutor(10, {
        'task-1': { success: false, output: 'Failed' },
        'task-2': { success: true, output: 'OK' },
      });

      const results = await executor.execute(subtasks, mockExecutor);

      expect(results).toHaveLength(2);
      expect(results.find(r => r.id === 'task-1')?.success).toBe(false);
      expect(results.find(r => r.id === 'task-2')?.success).toBe(true);
    });

    it('should report progress', async () => {
      const progressCalls: Array<{ completed: number; total: number }> = [];

      executor = new ParallelExecutor({
        maxConcurrency: 1, // Séquentiel pour prédire l'ordre
        onProgress: (completed, total) => {
          progressCalls.push({ completed, total });
        },
      });

      const subtasks = [
        createMockSubtask('task-1'),
        createMockSubtask('task-2'),
      ];

      await executor.execute(subtasks, createMockExecutor(10));

      expect(progressCalls).toHaveLength(2);
      expect(progressCalls[0]).toEqual({ completed: 1, total: 2 });
      expect(progressCalls[1]).toEqual({ completed: 2, total: 2 });
    });
  });
});
```

---

## PARTIE 3 : TESTS DU DEPENDENCY GRAPH

**Fichier : `app/lib/agents/execution/dependency-graph.spec.ts`**

```typescript
import { describe, it, expect } from 'vitest';
import { DependencyGraph } from './dependency-graph';

describe('DependencyGraph', () => {
  describe('topologicalSort', () => {
    it('should sort nodes without dependencies to level 0', () => {
      const graph = new DependencyGraph<string>();
      graph.addNode('a', 'A');
      graph.addNode('b', 'B');
      graph.addNode('c', 'C');

      const levels = graph.topologicalSort();

      expect(levels).toHaveLength(1);
      expect(levels[0].level).toBe(0);
      expect(levels[0].nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c']);
    });

    it('should sort linear dependencies correctly', () => {
      const graph = new DependencyGraph<string>();
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);
      graph.addNode('c', 'C', ['b']);

      const levels = graph.topologicalSort();

      expect(levels).toHaveLength(3);
      expect(levels[0].nodes[0].id).toBe('a');
      expect(levels[1].nodes[0].id).toBe('b');
      expect(levels[2].nodes[0].id).toBe('c');
    });

    it('should group parallel tasks at same level', () => {
      const graph = new DependencyGraph<string>();
      graph.addNode('root', 'Root');
      graph.addNode('a', 'A', ['root']);
      graph.addNode('b', 'B', ['root']);
      graph.addNode('c', 'C', ['root']);
      graph.addNode('final', 'Final', ['a', 'b', 'c']);

      const levels = graph.topologicalSort();

      expect(levels).toHaveLength(3);
      expect(levels[0].nodes.map(n => n.id)).toEqual(['root']);
      expect(levels[1].nodes.map(n => n.id).sort()).toEqual(['a', 'b', 'c']);
      expect(levels[2].nodes.map(n => n.id)).toEqual(['final']);
    });

    it('should detect cycles', () => {
      const graph = new DependencyGraph<string>();
      graph.addNode('a', 'A', ['c']);
      graph.addNode('b', 'B', ['a']);
      graph.addNode('c', 'C', ['b']);

      expect(graph.hasCycle()).toBe(true);
      expect(() => graph.topologicalSort()).toThrow('graph contains cycles');
    });

    it('should handle diamond dependency', () => {
      const graph = new DependencyGraph<string>();
      graph.addNode('a', 'A');
      graph.addNode('b', 'B', ['a']);
      graph.addNode('c', 'C', ['a']);
      graph.addNode('d', 'D', ['b', 'c']);

      const levels = graph.topologicalSort();

      expect(levels).toHaveLength(3);
      expect(levels[0].nodes[0].id).toBe('a');
      expect(levels[1].nodes.map(n => n.id).sort()).toEqual(['b', 'c']);
      expect(levels[2].nodes[0].id).toBe('d');
    });
  });
});
```

---

## RÉCAPITULATIF DES FICHIERS

### Fichiers à CRÉER

| Fichier | Lignes estimées | Description |
|---------|-----------------|-------------|
| `core/tool-registry.ts` | ~150 | Registre centralisé des tools |
| `core/tool-registry.spec.ts` | ~120 | Tests du registre |
| `execution/dependency-graph.ts` | ~180 | Graphe de dépendances |
| `execution/dependency-graph.spec.ts` | ~100 | Tests du graphe |
| `execution/parallel-executor.ts` | ~200 | Exécuteur parallèle |
| `execution/parallel-executor.spec.ts` | ~150 | Tests de l'exécuteur |

**Total : ~900 lignes de code**

### Fichiers à MODIFIER

| Fichier | Changements |
|---------|-------------|
| `core/base-agent.ts` | +50 lignes (registry integration) |
| `agents/orchestrator.ts` | ~80 lignes modifiées (parallel execution) |
| `types.ts` | +20 lignes (nouveaux types si nécessaire) |

---

## ORDRE D'IMPLÉMENTATION

```
1. tool-registry.ts              ← Fondation
2. tool-registry.spec.ts         ← Valider
3. base-agent.ts (modifications) ← Intégrer
4. dependency-graph.ts           ← Fondation parallèle
5. dependency-graph.spec.ts      ← Valider
6. parallel-executor.ts          ← Exécuteur
7. parallel-executor.spec.ts     ← Valider
8. orchestrator.ts (modifications) ← Intégrer
9. Tests d'intégration           ← Valider le tout
```

---

## VALIDATION

Après implémentation, exécuter :

```bash
# Tests unitaires
npm run test -- --grep "ToolRegistry|DependencyGraph|ParallelExecutor"

# Tests d'intégration agents
npm run test -- --grep "agents"

# Vérification TypeScript
npm run typecheck
```

**Critères de succès :**
- ✅ Tous les tests passent
- ✅ `executeToolHandler()` fonctionne via le registry
- ✅ Les sous-tâches sans dépendances s'exécutent en parallèle
- ✅ Les dépendances sont respectées
- ✅ Pas de régression sur le comportement existant

---

*Document créé le 28 décembre 2025*
