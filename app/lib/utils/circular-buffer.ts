/**
 * CircularBuffer - Buffer circulaire pour historiques à taille fixe
 *
 * Avantages par rapport à Array.slice():
 * - Insertion O(1) au lieu de O(n)
 * - Pas de réallocation mémoire
 * - Taille mémoire constante
 *
 * Usage typique: logs, historiques de messages, batches traités
 */

/**
 * Buffer circulaire générique
 * Maintient les N derniers éléments avec insertion O(1)
 */
export class CircularBuffer<T> {
  private buffer: (T | undefined)[];
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;
  private readonly capacity: number;

  constructor(capacity: number) {
    if (capacity <= 0) {
      throw new Error('CircularBuffer capacity must be positive');
    }

    this.capacity = capacity;
    this.buffer = new Array(capacity);
  }

  /**
   * Ajouter un élément (O(1))
   * Si le buffer est plein, l'élément le plus ancien est écrasé
   */
  push(item: T): void {
    this.buffer[this.head] = item;
    this.head = (this.head + 1) % this.capacity;

    if (this.count < this.capacity) {
      this.count++;
    } else {
      // Buffer plein, le tail avance aussi
      this.tail = (this.tail + 1) % this.capacity;
    }
  }

  /**
   * Ajouter plusieurs éléments
   */
  pushMany(items: T[]): void {
    for (const item of items) {
      this.push(item);
    }
  }

  /**
   * Obtenir tous les éléments dans l'ordre (du plus ancien au plus récent)
   */
  toArray(): T[] {
    if (this.count === 0) {
      return [];
    }

    const result: T[] = new Array(this.count);

    for (let i = 0; i < this.count; i++) {
      const index = (this.tail + i) % this.capacity;
      result[i] = this.buffer[index] as T;
    }

    return result;
  }

  /**
   * Obtenir le dernier élément ajouté
   */
  last(): T | undefined {
    if (this.count === 0) {
      return undefined;
    }

    const lastIndex = (this.head - 1 + this.capacity) % this.capacity;

    return this.buffer[lastIndex];
  }

  /**
   * Obtenir le premier élément (le plus ancien)
   */
  first(): T | undefined {
    if (this.count === 0) {
      return undefined;
    }

    return this.buffer[this.tail];
  }

  /**
   * Obtenir un élément par index (0 = plus ancien)
   */
  get(index: number): T | undefined {
    if (index < 0 || index >= this.count) {
      return undefined;
    }

    const actualIndex = (this.tail + index) % this.capacity;

    return this.buffer[actualIndex];
  }

  /**
   * Nombre d'éléments actuellement dans le buffer
   */
  get size(): number {
    return this.count;
  }

  /**
   * Capacité maximale du buffer
   */
  get maxSize(): number {
    return this.capacity;
  }

  /**
   * Vérifier si le buffer est vide
   */
  get isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * Vérifier si le buffer est plein
   */
  get isFull(): boolean {
    return this.count === this.capacity;
  }

  /**
   * Vider le buffer
   */
  clear(): void {
    this.buffer = new Array(this.capacity);
    this.head = 0;
    this.tail = 0;
    this.count = 0;
  }

  /**
   * Itérateur pour for...of
   */
  *[Symbol.iterator](): Iterator<T> {
    for (let i = 0; i < this.count; i++) {
      const index = (this.tail + i) % this.capacity;
      yield this.buffer[index] as T;
    }
  }

  /**
   * Appliquer une fonction à chaque élément
   */
  forEach(callback: (item: T, index: number) => void): void {
    let i = 0;

    for (const item of this) {
      callback(item, i++);
    }
  }

  /**
   * Filtrer les éléments
   */
  filter(predicate: (item: T) => boolean): T[] {
    return this.toArray().filter(predicate);
  }

  /**
   * Trouver un élément
   */
  find(predicate: (item: T) => boolean): T | undefined {
    for (const item of this) {
      if (predicate(item)) {
        return item;
      }
    }

    return undefined;
  }

  /**
   * Créer un nouveau CircularBuffer à partir d'un tableau
   */
  static from<T>(items: T[], capacity?: number): CircularBuffer<T> {
    const cap = capacity ?? items.length;
    const buffer = new CircularBuffer<T>(cap);
    buffer.pushMany(items);

    return buffer;
  }
}

/**
 * Wrapper réactif pour CircularBuffer avec nanostores
 * Permet d'utiliser CircularBuffer avec le système de stores
 */
export function createCircularBufferStore<T>(capacity: number) {
  const buffer = new CircularBuffer<T>(capacity);

  return {
    buffer,

    /**
     * Ajouter et notifier les listeners
     */
    push(item: T): T[] {
      buffer.push(item);
      return buffer.toArray();
    },

    /**
     * Ajouter plusieurs et retourner le tableau
     */
    pushMany(items: T[]): T[] {
      buffer.pushMany(items);
      return buffer.toArray();
    },

    /**
     * Obtenir le tableau actuel
     */
    get(): T[] {
      return buffer.toArray();
    },

    /**
     * Vider et retourner tableau vide
     */
    clear(): T[] {
      buffer.clear();
      return [];
    },

    /**
     * Taille actuelle
     */
    get size(): number {
      return buffer.size;
    },
  };
}
