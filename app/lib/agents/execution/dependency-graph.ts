/**
 * Dependency Graph - Gestion des dépendances entre tâches
 * Utilise l'algorithme de Kahn pour le tri topologique
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DependencyGraph');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Nœud du graphe
 */
export interface GraphNode<T> {
  id: string;
  data: T;
  dependencies: Set<string>;
}

/**
 * Niveau d'exécution (tâches pouvant s'exécuter en parallèle)
 */
export interface ExecutionLevel<T> {
  level: number;
  nodes: GraphNode<T>[];
}

/**
 * Résultat de validation du graphe
 */
export interface GraphValidation {
  valid: boolean;
  hasCycle: boolean;
  missingDependencies: string[];
  orphanNodes: string[];
}

/*
 * ============================================================================
 * DEPENDENCY GRAPH
 * ============================================================================
 */

/**
 * Graphe de dépendances avec tri topologique
 * Permet de déterminer l'ordre d'exécution optimal des tâches
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

    logger.debug(`Added node: ${id} with ${dependencies.length} dependencies`);
  }

  /**
   * Supprimer un nœud du graphe
   */
  removeNode(id: string): boolean {
    if (!this.nodes.has(id)) {
      return false;
    }

    // Supprimer le nœud
    this.nodes.delete(id);

    // Supprimer les références à ce nœud dans les dépendances
    for (const node of this.nodes.values()) {
      node.dependencies.delete(id);
    }

    logger.debug(`Removed node: ${id}`);

    return true;
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
    logger.debug(`Added dependency: ${nodeId} -> ${dependsOnId}`);
  }

  /**
   * Supprimer une dépendance
   */
  removeDependency(nodeId: string, dependsOnId: string): boolean {
    const node = this.nodes.get(nodeId);

    if (!node) {
      return false;
    }

    return node.dependencies.delete(dependsOnId);
  }

  /**
   * Vérifier si un nœud existe
   */
  hasNode(id: string): boolean {
    return this.nodes.has(id);
  }

  /**
   * Obtenir un nœud
   */
  getNode(id: string): GraphNode<T> | undefined {
    return this.nodes.get(id);
  }

  /**
   * Obtenir les dépendances d'un nœud
   */
  getDependencies(nodeId: string): string[] {
    const node = this.nodes.get(nodeId);
    return node ? Array.from(node.dependencies) : [];
  }

  /**
   * Obtenir les nœuds qui dépendent d'un nœud donné (dépendants)
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
   * Vérifier s'il y a des cycles (DFS)
   */
  hasCycle(): boolean {
    const visited = new Set<string>();
    const recursionStack = new Set<string>();

    const hasCycleUtil = (nodeId: string): boolean => {
      visited.add(nodeId);
      recursionStack.add(nodeId);

      const node = this.nodes.get(nodeId);

      if (!node) {
        return false;
      }

      for (const depId of node.dependencies) {
        if (!visited.has(depId)) {
          if (this.nodes.has(depId) && hasCycleUtil(depId)) {
            return true;
          }
        } else if (recursionStack.has(depId)) {
          logger.warn(`Cycle detected: ${nodeId} -> ${depId}`);
          return true;
        }
      }

      recursionStack.delete(nodeId);

      return false;
    };

    for (const nodeId of this.nodes.keys()) {
      if (!visited.has(nodeId)) {
        if (hasCycleUtil(nodeId)) {
          return true;
        }
      }
    }

    return false;
  }

  /**
   * Valider le graphe
   */
  validate(): GraphValidation {
    const missingDependencies: string[] = [];
    const orphanNodes: string[] = [];

    // Vérifier les dépendances manquantes
    for (const [id, node] of this.nodes) {
      for (const depId of node.dependencies) {
        if (!this.nodes.has(depId)) {
          missingDependencies.push(`${id} -> ${depId}`);
        }
      }
    }

    // Trouver les nœuds orphelins (sans dépendances et sans dépendants)
    for (const id of this.nodes.keys()) {
      const hasDependencies = this.getDependencies(id).length > 0;
      const hasDependents = this.getDependents(id).length > 0;

      /*
       * Un nœud est orphelin s'il n'a pas de dépendances ET pas de dépendants
       * ET s'il y a d'autres nœuds dans le graphe
       */
      if (!hasDependencies && !hasDependents && this.nodes.size > 1) {
        // Vérifier s'il y a au moins un autre nœud avec des dépendances
        const hasConnectedNodes = Array.from(this.nodes.values()).some(
          (n) => n.id !== id && (n.dependencies.size > 0 || this.getDependents(n.id).length > 0),
        );

        if (hasConnectedNodes) {
          orphanNodes.push(id);
        }
      }
    }

    const hasCycle = this.hasCycle();

    return {
      valid: !hasCycle && missingDependencies.length === 0,
      hasCycle,
      missingDependencies,
      orphanNodes,
    };
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
      // Compter seulement les dépendances qui existent dans le graphe
      let degree = 0;

      for (const depId of node.dependencies) {
        if (this.nodes.has(depId)) {
          degree++;
        }
      }

      inDegree.set(id, degree);
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
        nodes: currentLevel.map((id) => this.nodes.get(id)!),
      });

      logger.debug(`Level ${levelNumber}: ${currentLevel.join(', ')}`);

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
   * Obtenir l'ordre d'exécution linéaire (aplati)
   */
  getExecutionOrder(): T[] {
    const levels = this.topologicalSort();
    const result: T[] = [];

    for (const level of levels) {
      for (const node of level.nodes) {
        result.push(node.data);
      }
    }

    return result;
  }

  /**
   * Nombre de nœuds
   */
  get size(): number {
    return this.nodes.size;
  }

  /**
   * Vérifier si le graphe est vide
   */
  isEmpty(): boolean {
    return this.nodes.size === 0;
  }

  /**
   * Obtenir tous les nœuds
   */
  getNodes(): GraphNode<T>[] {
    return Array.from(this.nodes.values());
  }

  /**
   * Obtenir tous les IDs des nœuds
   */
  getNodeIds(): string[] {
    return Array.from(this.nodes.keys());
  }

  /**
   * Vider le graphe
   */
  clear(): void {
    this.nodes.clear();
    logger.debug('Graph cleared');
  }

  /**
   * Cloner le graphe
   */
  clone(): DependencyGraph<T> {
    const newGraph = new DependencyGraph<T>();

    for (const [id, node] of this.nodes) {
      newGraph.nodes.set(id, {
        id: node.id,
        data: node.data,
        dependencies: new Set(node.dependencies),
      });
    }

    return newGraph;
  }

  /**
   * Créer un sous-graphe contenant uniquement les nœuds spécifiés
   */
  subgraph(nodeIds: string[]): DependencyGraph<T> {
    const subGraph = new DependencyGraph<T>();
    const idSet = new Set(nodeIds);

    for (const id of nodeIds) {
      const node = this.nodes.get(id);

      if (node) {
        // Filtrer les dépendances pour ne garder que celles dans le sous-graphe
        const filteredDeps = Array.from(node.dependencies).filter((depId) => idSet.has(depId));
        subGraph.addNode(id, node.data, filteredDeps);
      }
    }

    return subGraph;
  }

  /**
   * Représentation en chaîne pour le debug
   */
  toString(): string {
    const lines: string[] = ['DependencyGraph:'];

    for (const [id, node] of this.nodes) {
      const deps = Array.from(node.dependencies).join(', ') || '(none)';
      lines.push(`  ${id} -> [${deps}]`);
    }

    return lines.join('\n');
  }
}

/*
 * ============================================================================
 * FACTORY FUNCTIONS
 * ============================================================================
 */

/**
 * Créer un graphe de dépendances vide
 */
export function createDependencyGraph<T>(): DependencyGraph<T> {
  return new DependencyGraph<T>();
}

/**
 * Créer un graphe à partir d'une liste de définitions
 */
export function createGraphFromDefinitions<T>(
  definitions: Array<{
    id: string;
    data: T;
    dependencies?: string[];
  }>,
): DependencyGraph<T> {
  const graph = new DependencyGraph<T>();

  for (const def of definitions) {
    graph.addNode(def.id, def.data, def.dependencies || []);
  }

  return graph;
}
