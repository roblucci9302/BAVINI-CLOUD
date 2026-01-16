/**
 * Response Cache avec TTL (Time To Live)
 * Cache les réponses API pour éviter les requêtes répétées
 *
 * Features:
 * - TTL configurable par entrée
 * - Nettoyage automatique des entrées expirées
 * - Taille maximale avec éviction LRU
 * - Statistiques de hit/miss
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('ResponseCache');

/**
 * Entrée du cache avec métadonnées
 */
interface CacheEntry<T> {
  data: T;
  expiry: number;
  createdAt: number;
  accessCount: number;
  lastAccess: number;
}

/**
 * Options du cache
 */
export interface ResponseCacheOptions {
  /** Taille maximale du cache (nombre d'entrées) */
  maxSize?: number;

  /** TTL par défaut en millisecondes */
  defaultTTL?: number;

  /** Activer le nettoyage automatique */
  autoCleanup?: boolean;

  /** Intervalle de nettoyage en ms */
  cleanupInterval?: number;
}

/**
 * Statistiques du cache
 */
interface CacheStats {
  hits: number;
  misses: number;
  evictions: number;
  expirations: number;
  size: number;
  maxSize: number;
}

/**
 * Classe ResponseCache
 */
export class ResponseCache<T = unknown> {
  private cache = new Map<string, CacheEntry<T>>();
  private readonly maxSize: number;
  private readonly defaultTTL: number;
  private cleanupTimer: ReturnType<typeof setInterval> | null = null;
  private stats: CacheStats;

  constructor(options: ResponseCacheOptions = {}) {
    this.maxSize = options.maxSize ?? 100;
    this.defaultTTL = options.defaultTTL ?? 60000; // 1 minute par défaut

    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      size: 0,
      maxSize: this.maxSize,
    };

    if (options.autoCleanup !== false) {
      const interval = options.cleanupInterval ?? 60000;
      this.startAutoCleanup(interval);
    }
  }

  /**
   * Obtenir une valeur du cache
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);

    if (!entry) {
      this.stats.misses++;
      return null;
    }

    // Vérifier l'expiration
    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.stats.expirations++;
      this.stats.misses++;
      this.updateSize();
      logger.trace(`Cache expired: ${key}`);

      return null;
    }

    // Mettre à jour les stats d'accès
    entry.accessCount++;
    entry.lastAccess = Date.now();
    this.stats.hits++;

    logger.trace(`Cache hit: ${key}`);

    return entry.data;
  }

  /**
   * Stocker une valeur dans le cache
   */
  set(key: string, data: T, ttlMs?: number): void {
    const ttl = ttlMs ?? this.defaultTTL;
    const now = Date.now();

    // Vérifier si on doit faire de la place
    if (!this.cache.has(key) && this.cache.size >= this.maxSize) {
      this.evictLRU();
    }

    this.cache.set(key, {
      data,
      expiry: now + ttl,
      createdAt: now,
      accessCount: 0,
      lastAccess: now,
    });

    this.updateSize();
    logger.trace(`Cache set: ${key} (TTL: ${ttl}ms)`);
  }

  /**
   * Vérifier si une clé existe et n'est pas expirée
   */
  has(key: string): boolean {
    const entry = this.cache.get(key);

    if (!entry) {
      return false;
    }

    if (Date.now() > entry.expiry) {
      this.cache.delete(key);
      this.stats.expirations++;
      this.updateSize();

      return false;
    }

    return true;
  }

  /**
   * Supprimer une entrée
   */
  delete(key: string): boolean {
    const deleted = this.cache.delete(key);

    if (deleted) {
      this.updateSize();
    }

    return deleted;
  }

  /**
   * Vider le cache
   */
  clear(): void {
    this.cache.clear();
    this.updateSize();
    logger.info('Cache cleared');
  }

  /**
   * Obtenir ou calculer une valeur (pattern cache-aside)
   */
  async getOrCompute(key: string, compute: () => Promise<T>, ttlMs?: number): Promise<T> {
    const cached = this.get(key);

    if (cached !== null) {
      return cached;
    }

    const data = await compute();
    this.set(key, data, ttlMs);

    return data;
  }

  /**
   * Invalider les entrées correspondant à un pattern
   */
  invalidatePattern(pattern: RegExp): number {
    let count = 0;

    for (const key of this.cache.keys()) {
      if (pattern.test(key)) {
        this.cache.delete(key);
        count++;
      }
    }

    this.updateSize();
    logger.debug(`Invalidated ${count} entries matching ${pattern}`);

    return count;
  }

  /**
   * Obtenir les statistiques du cache
   */
  getStats(): CacheStats & { hitRate: number } {
    const total = this.stats.hits + this.stats.misses;
    return {
      ...this.stats,
      hitRate: total > 0 ? this.stats.hits / total : 0,
    };
  }

  /**
   * Réinitialiser les statistiques
   */
  resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      evictions: 0,
      expirations: 0,
      size: this.cache.size,
      maxSize: this.maxSize,
    };
  }

  /**
   * Nettoyer les entrées expirées
   */
  cleanup(): number {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now > entry.expiry) {
        this.cache.delete(key);
        this.stats.expirations++;
        cleaned++;
      }
    }

    this.updateSize();

    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} expired entries`);
    }

    return cleaned;
  }

  /**
   * Arrêter le nettoyage automatique
   */
  stopAutoCleanup(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }

  /**
   * Démarrer le nettoyage automatique
   */
  private startAutoCleanup(interval: number): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanup();
    }, interval);

    // Permettre au process de terminer même si le timer est actif
    if (typeof this.cleanupTimer === 'object' && 'unref' in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Évincer l'entrée la moins récemment utilisée
   */
  private evictLRU(): void {
    let lruKey: string | null = null;
    let lruTime = Infinity;

    for (const [key, entry] of this.cache.entries()) {
      if (entry.lastAccess < lruTime) {
        lruTime = entry.lastAccess;
        lruKey = key;
      }
    }

    if (lruKey) {
      this.cache.delete(lruKey);
      this.stats.evictions++;
      logger.trace(`Evicted LRU entry: ${lruKey}`);
    }
  }

  /**
   * Mettre à jour la taille dans les stats
   */
  private updateSize(): void {
    this.stats.size = this.cache.size;
  }
}

/*
 * ============================================================================
 * INSTANCE GLOBALE ET HELPERS
 * ============================================================================
 */

/**
 * Cache global par défaut
 */
const globalCache = new ResponseCache({
  maxSize: 200,
  defaultTTL: 5 * 60 * 1000, // 5 minutes
  autoCleanup: true,
  cleanupInterval: 60000,
});

/**
 * Obtenir une valeur du cache global
 */
export function getCached<T>(key: string): T | null {
  return globalCache.get(key) as T | null;
}

/**
 * Stocker une valeur dans le cache global
 */
export function setCache<T>(key: string, data: T, ttlMs?: number): void {
  globalCache.set(key, data, ttlMs);
}

/**
 * Vérifier si une clé existe dans le cache global
 */
export function hasCache(key: string): boolean {
  return globalCache.has(key);
}

/**
 * Supprimer une entrée du cache global
 */
export function deleteCache(key: string): boolean {
  return globalCache.delete(key);
}

/**
 * Vider le cache global
 */
export function clearCache(): void {
  globalCache.clear();
}

/**
 * Obtenir ou calculer une valeur (cache global)
 */
export async function getOrCompute<T>(key: string, compute: () => Promise<T>, ttlMs?: number): Promise<T> {
  return globalCache.getOrCompute(key, compute, ttlMs) as Promise<T>;
}

/**
 * Invalider les entrées correspondant à un pattern
 */
export function invalidateCachePattern(pattern: RegExp): number {
  return globalCache.invalidatePattern(pattern);
}

/**
 * Obtenir les statistiques du cache global
 */
export function getCacheStats() {
  return globalCache.getStats();
}

/**
 * Nettoyer le cache global
 */
export function cleanupCache(): number {
  return globalCache.cleanup();
}

/**
 * Créer un nouveau cache avec des options personnalisées
 */
export function createCache<T = unknown>(options?: ResponseCacheOptions): ResponseCache<T> {
  return new ResponseCache<T>(options);
}
