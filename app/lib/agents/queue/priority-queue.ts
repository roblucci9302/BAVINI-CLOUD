/**
 * Priority Queue - Implémentation d'un heap binaire avec priorités
 *
 * Fournit une structure de données efficace pour gérer les éléments
 * par priorité avec extraction O(log n) et insertion O(log n).
 *
 * @module agents/queue/priority-queue
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PriorityQueue');

/*
 * ============================================================================
 * TYPES
 * ============================================================================
 */

/**
 * Niveaux de priorité des tâches
 * Les valeurs plus basses sont plus prioritaires
 */
export enum TaskPriority {
  /** Exécution immédiate - interruption des tâches en cours si possible */
  CRITICAL = 0,

  /** Priorité haute - exécution dès que possible */
  HIGH = 1,

  /** Priorité normale - comportement par défaut */
  NORMAL = 2,

  /** Priorité basse - exécution quand les ressources sont disponibles */
  LOW = 3,

  /** Arrière-plan - exécution uniquement quand rien d'autre n'est en attente */
  BACKGROUND = 4,
}

/**
 * Élément de la queue avec priorité
 */
export interface PriorityItem<T> {
  /** Valeur stockée */
  value: T;

  /** Niveau de priorité */
  priority: TaskPriority;

  /** Timestamp d'insertion (pour FIFO à priorité égale) */
  insertedAt: number;

  /** Numéro de séquence (pour FIFO strict quand timestamps identiques) */
  sequence: number;

  /** ID unique pour identification */
  id: string;

  /** Temps d'attente accumulé (pour aging) */
  waitTime?: number;
}

/**
 * Configuration du PriorityQueue
 */
export interface PriorityQueueConfig {
  /** Activer l'aging (promotion automatique des tâches qui attendent) */
  enableAging?: boolean;

  /** Temps avant promotion d'un niveau (ms) */
  agingThresholdMs?: number;

  /** Intervalle de vérification de l'aging (ms) */
  agingCheckIntervalMs?: number;
}

/**
 * Statistiques par niveau de priorité
 */
export interface PriorityQueueStats {
  /** Taille totale */
  total: number;

  /** Compte par niveau de priorité */
  byPriority: Record<TaskPriority, number>;

  /** Temps d'attente moyen (ms) */
  averageWaitTime: number;

  /** Nombre de promotions par aging */
  agingPromotions: number;
}

/*
 * ============================================================================
 * PRIORITY QUEUE
 * ============================================================================
 */

/**
 * File de priorité basée sur un heap binaire min
 *
 * Les éléments avec une priorité plus basse (CRITICAL < HIGH < NORMAL)
 * sont extraits en premier. À priorité égale, FIFO est respecté.
 *
 * @template T Type des valeurs stockées
 */
export class PriorityQueue<T> {
  private heap: PriorityItem<T>[] = [];
  private config: Required<PriorityQueueConfig>;
  private agingTimer: NodeJS.Timeout | null = null;
  private promotionCount = 0;
  private idIndex: Map<string, number> = new Map();
  private sequenceCounter = 0;

  constructor(config?: PriorityQueueConfig) {
    this.config = {
      enableAging: config?.enableAging ?? false,
      agingThresholdMs: config?.agingThresholdMs ?? 60000, // 1 minute
      agingCheckIntervalMs: config?.agingCheckIntervalMs ?? 10000, // 10 secondes
    };

    if (this.config.enableAging) {
      this.startAgingTimer();
    }
  }

  /*
   * ==========================================================================
   * PUBLIC API
   * ==========================================================================
   */

  /**
   * Ajouter un élément avec priorité
   */
  enqueue(id: string, value: T, priority: TaskPriority = TaskPriority.NORMAL): void {
    const item: PriorityItem<T> = {
      id,
      value,
      priority,
      insertedAt: Date.now(),
      sequence: this.sequenceCounter++,
      waitTime: 0,
    };

    // Ajouter à la fin du heap
    this.heap.push(item);
    const index = this.heap.length - 1;
    this.idIndex.set(id, index);

    // Remonter l'élément à sa place
    this.bubbleUp(index);

    logger.debug(`Enqueued item: ${id}`, { priority: TaskPriority[priority] });
  }

  /**
   * Extraire l'élément le plus prioritaire
   */
  dequeue(): PriorityItem<T> | undefined {
    if (this.heap.length === 0) {
      return undefined;
    }

    const item = this.heap[0];

    if (this.heap.length === 1) {
      this.heap.pop();
      this.idIndex.delete(item.id);
      return item;
    }

    // Mettre le dernier élément à la racine
    const last = this.heap.pop()!;
    this.heap[0] = last;
    this.idIndex.set(last.id, 0);
    this.idIndex.delete(item.id);

    // Faire descendre l'élément à sa place
    this.bubbleDown(0);

    logger.debug(`Dequeued item: ${item.id}`, { priority: TaskPriority[item.priority] });
    return item;
  }

  /**
   * Voir l'élément le plus prioritaire sans l'extraire
   */
  peek(): PriorityItem<T> | undefined {
    return this.heap[0];
  }

  /**
   * Vérifier si un élément existe par ID
   */
  has(id: string): boolean {
    return this.idIndex.has(id);
  }

  /**
   * Obtenir un élément par ID
   */
  get(id: string): PriorityItem<T> | undefined {
    const index = this.idIndex.get(id);

    if (index === undefined) {
      return undefined;
    }

    return this.heap[index];
  }

  /**
   * Supprimer un élément par ID
   */
  remove(id: string): PriorityItem<T> | undefined {
    const index = this.idIndex.get(id);

    if (index === undefined) {
      return undefined;
    }

    const item = this.heap[index];

    if (index === this.heap.length - 1) {
      this.heap.pop();
      this.idIndex.delete(id);
      return item;
    }

    // Remplacer par le dernier élément
    const last = this.heap.pop()!;
    this.heap[index] = last;
    this.idIndex.set(last.id, index);
    this.idIndex.delete(id);

    // Rééquilibrer
    const parentIndex = this.getParentIndex(index);

    if (parentIndex >= 0 && this.compare(index, parentIndex) < 0) {
      this.bubbleUp(index);
    } else {
      this.bubbleDown(index);
    }

    logger.debug(`Removed item: ${id}`);
    return item;
  }

  /**
   * Mettre à jour la priorité d'un élément
   */
  updatePriority(id: string, newPriority: TaskPriority): boolean {
    const index = this.idIndex.get(id);

    if (index === undefined) {
      return false;
    }

    const oldPriority = this.heap[index].priority;
    this.heap[index].priority = newPriority;

    // Rééquilibrer selon le changement
    if (newPriority < oldPriority) {
      this.bubbleUp(index);
    } else if (newPriority > oldPriority) {
      this.bubbleDown(index);
    }

    logger.debug(`Updated priority: ${id}`, {
      from: TaskPriority[oldPriority],
      to: TaskPriority[newPriority],
    });

    return true;
  }

  /**
   * Promouvoir un élément d'un niveau de priorité
   */
  promote(id: string): boolean {
    const item = this.get(id);

    if (!item || item.priority === TaskPriority.CRITICAL) {
      return false;
    }

    return this.updatePriority(id, item.priority - 1);
  }

  /**
   * Taille de la queue
   */
  size(): number {
    return this.heap.length;
  }

  /**
   * Vérifier si la queue est vide
   */
  isEmpty(): boolean {
    return this.heap.length === 0;
  }

  /**
   * Vider la queue
   */
  clear(): void {
    this.heap = [];
    this.idIndex.clear();
    logger.debug('Queue cleared');
  }

  /**
   * Obtenir tous les éléments (sans les extraire)
   */
  getAll(): PriorityItem<T>[] {
    return [...this.heap];
  }

  /**
   * Obtenir les éléments par priorité
   */
  getByPriority(priority: TaskPriority): PriorityItem<T>[] {
    return this.heap.filter((item) => item.priority === priority);
  }

  /**
   * Obtenir les statistiques
   */
  getStats(): PriorityQueueStats {
    const now = Date.now();
    const byPriority: Record<TaskPriority, number> = {
      [TaskPriority.CRITICAL]: 0,
      [TaskPriority.HIGH]: 0,
      [TaskPriority.NORMAL]: 0,
      [TaskPriority.LOW]: 0,
      [TaskPriority.BACKGROUND]: 0,
    };

    let totalWaitTime = 0;

    for (const item of this.heap) {
      byPriority[item.priority]++;
      totalWaitTime += now - item.insertedAt;
    }

    return {
      total: this.heap.length,
      byPriority,
      averageWaitTime: this.heap.length > 0 ? totalWaitTime / this.heap.length : 0,
      agingPromotions: this.promotionCount,
    };
  }

  /**
   * Arrêter le timer d'aging
   */
  destroy(): void {
    this.stopAgingTimer();
    this.clear();
  }

  /*
   * ==========================================================================
   * HEAP OPERATIONS
   * ==========================================================================
   */

  /**
   * Remonter un élément vers la racine
   */
  private bubbleUp(index: number): void {
    while (index > 0) {
      const parentIndex = this.getParentIndex(index);

      if (this.compare(index, parentIndex) >= 0) {
        break;
      }

      this.swap(index, parentIndex);
      index = parentIndex;
    }
  }

  /**
   * Faire descendre un élément vers les feuilles
   */
  private bubbleDown(index: number): void {
    const length = this.heap.length;

    while (true) {
      const leftChild = this.getLeftChildIndex(index);
      const rightChild = this.getRightChildIndex(index);
      let smallest = index;

      if (leftChild < length && this.compare(leftChild, smallest) < 0) {
        smallest = leftChild;
      }

      if (rightChild < length && this.compare(rightChild, smallest) < 0) {
        smallest = rightChild;
      }

      if (smallest === index) {
        break;
      }

      this.swap(index, smallest);
      index = smallest;
    }
  }

  /**
   * Comparer deux éléments
   * Retourne négatif si a < b, positif si a > b, 0 si égaux
   */
  private compare(indexA: number, indexB: number): number {
    const a = this.heap[indexA];
    const b = this.heap[indexB];

    // D'abord par priorité (plus bas = plus prioritaire)
    if (a.priority !== b.priority) {
      return a.priority - b.priority;
    }

    // Ensuite par ordre d'insertion (FIFO) via séquence
    // La séquence garantit un ordre strict même si les timestamps sont identiques
    return a.sequence - b.sequence;
  }

  /**
   * Échanger deux éléments
   */
  private swap(indexA: number, indexB: number): void {
    const itemA = this.heap[indexA];
    const itemB = this.heap[indexB];

    this.heap[indexA] = itemB;
    this.heap[indexB] = itemA;

    this.idIndex.set(itemA.id, indexB);
    this.idIndex.set(itemB.id, indexA);
  }

  private getParentIndex(index: number): number {
    return Math.floor((index - 1) / 2);
  }

  private getLeftChildIndex(index: number): number {
    return 2 * index + 1;
  }

  private getRightChildIndex(index: number): number {
    return 2 * index + 2;
  }

  /*
   * ==========================================================================
   * AGING
   * ==========================================================================
   */

  /**
   * Démarrer le timer d'aging
   */
  private startAgingTimer(): void {
    this.agingTimer = setInterval(() => {
      this.processAging();
    }, this.config.agingCheckIntervalMs);
  }

  /**
   * Arrêter le timer d'aging
   */
  private stopAgingTimer(): void {
    if (this.agingTimer) {
      clearInterval(this.agingTimer);
      this.agingTimer = null;
    }
  }

  /**
   * Traiter l'aging des éléments
   */
  private processAging(): void {
    const now = Date.now();
    const promotions: string[] = [];

    for (const item of this.heap) {
      const waitTime = now - item.insertedAt;

      if (waitTime >= this.config.agingThresholdMs && item.priority > TaskPriority.CRITICAL) {
        promotions.push(item.id);
      }
    }

    // Appliquer les promotions
    for (const id of promotions) {
      if (this.promote(id)) {
        this.promotionCount++;

        // Réinitialiser le temps d'insertion pour éviter les promotions continues
        const item = this.get(id);

        if (item) {
          item.insertedAt = now;
        }

        logger.debug(`Aging promotion: ${id}`, { newPriority: TaskPriority[this.get(id)!.priority] });
      }
    }

    if (promotions.length > 0) {
      logger.info(`Aging processed: ${promotions.length} promotions`);
    }
  }
}

/*
 * ============================================================================
 * FACTORY
 * ============================================================================
 */

/**
 * Créer une PriorityQueue
 */
export function createPriorityQueue<T>(config?: PriorityQueueConfig): PriorityQueue<T> {
  return new PriorityQueue<T>(config);
}

/**
 * Obtenir le nom d'une priorité
 */
export function getPriorityName(priority: TaskPriority): string {
  return TaskPriority[priority];
}

/**
 * Parser une priorité depuis une chaîne
 */
export function parsePriority(value: string | number): TaskPriority {
  if (typeof value === 'number') {
    return value as TaskPriority;
  }

  const upper = value.toUpperCase();

  switch (upper) {
    case 'CRITICAL':
      return TaskPriority.CRITICAL;
    case 'HIGH':
      return TaskPriority.HIGH;
    case 'NORMAL':
      return TaskPriority.NORMAL;
    case 'LOW':
      return TaskPriority.LOW;
    case 'BACKGROUND':
      return TaskPriority.BACKGROUND;
    default:
      return TaskPriority.NORMAL;
  }
}
