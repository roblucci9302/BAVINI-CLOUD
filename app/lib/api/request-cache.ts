/**
 * Request Deduplication Cache
 * Évite les requêtes API dupliquées en vol
 *
 * Si une requête identique est déjà en cours, retourne la même Promise
 * au lieu de lancer une nouvelle requête.
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RequestCache');

// Requêtes en cours
const pendingRequests = new Map<string, Promise<Response>>();

// Statistiques
let stats = {
  hits: 0,
  misses: 0,
  deduped: 0,
};

/**
 * Options pour le fetch dédupliqué
 */
export interface DedupedFetchOptions extends RequestInit {
  /** Clé personnalisée pour le cache (sinon générée automatiquement) */
  cacheKey?: string;

  /** Désactiver la déduplication pour cette requête */
  skipDedup?: boolean;
}

/**
 * Hash FNV-1a rapide pour générer des clés de cache.
 * ~10x plus rapide que JSON.stringify pour les gros objets.
 * @see https://en.wikipedia.org/wiki/Fowler%E2%80%93Noll%E2%80%93Vo_hash_function
 */
function fnv1aHash(str: string): string {
  let hash = 2166136261; // FNV offset basis (32-bit)

  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);

    // FNV prime (32-bit), force unsigned 32-bit integer
    hash = Math.imul(hash, 16777619) >>> 0;
  }

  return hash.toString(36);
}

/**
 * Génère un hash rapide pour un objet de manière récursive.
 * Gère les objets, arrays, strings, numbers, booleans, null/undefined.
 */
function hashValue(value: unknown): string {
  if (value === null) {
    return 'null';
  }

  if (value === undefined) {
    return 'undef';
  }

  const type = typeof value;

  if (type === 'string') {
    return fnv1aHash(value as string);
  }

  if (type === 'number' || type === 'boolean') {
    return String(value);
  }

  if (type === 'object') {
    // Handle arrays
    if (Array.isArray(value)) {
      const arrayHash = value.map((item) => hashValue(item)).join(',');
      return `[${fnv1aHash(arrayHash)}]`;
    }

    // Handle objects - sort keys for deterministic hashing
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    const parts = keys.map((k) => `${k}:${hashValue(obj[k])}`);

    return `{${fnv1aHash(parts.join('|'))}}`;
  }

  // Fallback for functions, symbols, etc.
  return fnv1aHash(String(value));
}

/**
 * Génère une clé de cache unique pour une requête.
 * Utilise un hash FNV-1a au lieu de JSON.stringify pour de meilleures performances.
 */
function generateCacheKey(url: string, options?: RequestInit): string {
  const method = options?.method || 'GET';
  const bodyHash = options?.body ? hashValue(options.body) : '';

  return `${method}:${url}:${bodyHash}`;
}

/**
 * Fetch avec déduplication des requêtes en vol
 *
 * Si une requête identique est déjà en cours, retourne un clone de la réponse
 * au lieu de lancer une nouvelle requête.
 *
 * @param url - URL de la requête
 * @param options - Options fetch standard + options de cache
 * @returns Promise<Response>
 *
 * @example
 * ```ts
 * // Ces deux appels ne feront qu'une seule requête réseau
 * const [res1, res2] = await Promise.all([
 *   dedupedFetch('/api/user'),
 *   dedupedFetch('/api/user'),
 * ]);
 * ```
 */
export async function dedupedFetch(url: string, options?: DedupedFetchOptions): Promise<Response> {
  // Skip deduplication if requested
  if (options?.skipDedup) {
    stats.misses++;
    return fetch(url, options);
  }

  const key = options?.cacheKey || generateCacheKey(url, options);

  // Vérifier si une requête identique est en cours
  const pending = pendingRequests.get(key);

  if (pending) {
    stats.deduped++;
    logger.debug(`Deduped request: ${key}`);

    // Cloner la réponse pour permettre plusieurs lectures
    const response = await pending;

    return response.clone();
  }

  // Nouvelle requête
  stats.misses++;
  logger.trace(`New request: ${key}`);

  const promise = fetch(url, options);
  pendingRequests.set(key, promise);

  try {
    const response = await promise;

    // Retourner un clone pour garder l'original lisible
    return response.clone();
  } finally {
    // Nettoyer après la réponse
    pendingRequests.delete(key);
  }
}

/**
 * Fetch avec déduplication et timeout
 */
export async function dedupedFetchWithTimeout(
  url: string,
  options?: DedupedFetchOptions & { timeout?: number },
): Promise<Response> {
  const { timeout = 30000, ...fetchOptions } = options || {};

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout);

  try {
    return await dedupedFetch(url, {
      ...fetchOptions,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Annuler une requête en attente
 */
export function cancelPendingRequest(key: string): boolean {
  if (pendingRequests.has(key)) {
    pendingRequests.delete(key);
    logger.debug(`Cancelled pending request: ${key}`);

    return true;
  }

  return false;
}

/**
 * Annuler toutes les requêtes en attente
 */
export function cancelAllPendingRequests(): number {
  const count = pendingRequests.size;
  pendingRequests.clear();
  logger.info(`Cancelled ${count} pending requests`);

  return count;
}

/**
 * Obtenir le nombre de requêtes en attente
 */
export function getPendingRequestCount(): number {
  return pendingRequests.size;
}

/**
 * Obtenir les statistiques du cache
 */
export function getRequestCacheStats() {
  return {
    ...stats,
    pending: pendingRequests.size,
    dedupRate: stats.deduped / (stats.deduped + stats.misses) || 0,
  };
}

/**
 * Réinitialiser les statistiques
 */
export function resetRequestCacheStats(): void {
  stats = { hits: 0, misses: 0, deduped: 0 };
}

/**
 * Vérifier si une requête est en cours
 */
export function isRequestPending(url: string, options?: RequestInit): boolean {
  const key = generateCacheKey(url, options);
  return pendingRequests.has(key);
}
