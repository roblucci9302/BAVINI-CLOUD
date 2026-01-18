/**
 * Rate Limiter pour Cloudflare Workers
 *
 * Implémente un rate limiting basé sur l'IP avec fenêtre glissante
 * utilisant un cache en mémoire (pour dev) ou Cloudflare KV (pour prod)
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RateLimiter');

export interface RateLimitConfig {
  /** Nombre maximum de requêtes par fenêtre */
  maxRequests: number;

  /** Durée de la fenêtre en secondes */
  windowSeconds: number;

  /** Message d'erreur personnalisé */
  message?: string;
}

export interface RateLimitResult {
  /** Requête autorisée ou non */
  allowed: boolean;

  /** Nombre de requêtes restantes */
  remaining: number;

  /** Timestamp de reset en secondes */
  resetAt: number;

  /** Nombre total de requêtes dans la fenêtre */
  total: number;
}

/**
 * Interface for rate limit storage backends.
 * Allows switching between memory (dev) and KV (prod) storage.
 */
export interface RateLimitStorage {
  get(key: string): Promise<{ count: number; resetAt: number } | null>;
  set(key: string, value: { count: number; resetAt: number }, ttlSeconds: number): Promise<void>;
  delete(key: string): Promise<void>;
  size(): Promise<number>;
}

/**
 * Cloudflare KV storage implementation for distributed rate limiting.
 * Use this in production for multi-instance deployments.
 */
export class CloudflareKVStorage implements RateLimitStorage {
  constructor(private kv: KVNamespace) {}

  async get(key: string): Promise<{ count: number; resetAt: number } | null> {
    try {
      const value = await this.kv.get(key, 'json');
      return value as { count: number; resetAt: number } | null;
    } catch (error) {
      logger.warn('KV get failed, returning null:', error);
      return null;
    }
  }

  async set(key: string, value: { count: number; resetAt: number }, ttlSeconds: number): Promise<void> {
    try {
      await this.kv.put(key, JSON.stringify(value), {
        expirationTtl: Math.max(60, ttlSeconds), // KV minimum TTL is 60 seconds
      });
    } catch (error) {
      logger.warn('KV set failed:', error);
    }
  }

  async delete(key: string): Promise<void> {
    try {
      await this.kv.delete(key);
    } catch (error) {
      logger.warn('KV delete failed:', error);
    }
  }

  async size(): Promise<number> {
    // KV doesn't support size operation, return 0
    return 0;
  }
}

/**
 * Memory storage for development and single-instance deployments.
 */
export class MemoryStorage implements RateLimitStorage {
  private cache = new Map<string, { count: number; resetAt: number }>();
  private maxEntries: number;

  constructor(maxEntries: number = 10000) {
    this.maxEntries = maxEntries;
  }

  async get(key: string): Promise<{ count: number; resetAt: number } | null> {
    return this.cache.get(key) ?? null;
  }

  async set(key: string, value: { count: number; resetAt: number }, _ttlSeconds: number): Promise<void> {
    // Evict if at capacity
    if (this.cache.size >= this.maxEntries && !this.cache.has(key)) {
      this.evictExpired();

      // If still at capacity, force evict oldest entries
      if (this.cache.size >= this.maxEntries) {
        const entriesToDelete = Math.min(100, this.cache.size - this.maxEntries + 100);
        const keys = Array.from(this.cache.keys()).slice(0, entriesToDelete);
        keys.forEach((k) => this.cache.delete(k));
        logger.warn(`Rate limit cache overflow, deleted ${entriesToDelete} entries`);
      }
    }

    this.cache.set(key, value);
  }

  async delete(key: string): Promise<void> {
    this.cache.delete(key);
  }

  async size(): Promise<number> {
    return this.cache.size;
  }

  /**
   * Evict expired entries from cache
   */
  evictExpired(): number {
    const now = Math.floor(Date.now() / 1000);
    let cleaned = 0;

    for (const [key, value] of this.cache.entries()) {
      if (value.resetAt <= now) {
        this.cache.delete(key);
        cleaned++;
      }
    }

    return cleaned;
  }

  /**
   * Clear all entries (for testing/HMR)
   */
  clear(): void {
    this.cache.clear();
  }
}

/**
 * Global storage instance - defaults to memory, can be swapped for KV
 */
let rateLimitStorage: RateLimitStorage = new MemoryStorage();

/**
 * Set the rate limit storage backend.
 * Call this early in app initialization with KV namespace if available.
 */
export function setRateLimitStorage(storage: RateLimitStorage): void {
  rateLimitStorage = storage;
  logger.info(`Rate limit storage set to: ${storage.constructor.name}`);
}

/**
 * Create rate limiter with appropriate storage based on environment.
 * Pass KV namespace for production Cloudflare Workers.
 */
export function initRateLimiter(kvNamespace?: KVNamespace): void {
  if (kvNamespace) {
    rateLimitStorage = new CloudflareKVStorage(kvNamespace);
    logger.info('Rate limiter initialized with Cloudflare KV storage');
  } else {
    rateLimitStorage = new MemoryStorage();
    logger.info('Rate limiter initialized with memory storage');
  }
}

// Legacy: Keep the old cache for backward compatibility during migration
const rateLimitCache = new Map<string, { count: number; resetAt: number }>();

// Limite maximale d'entrées pour éviter les fuites mémoire
const MAX_CACHE_ENTRIES = 10000;

// Configurations par défaut par type de route
export const RATE_LIMIT_CONFIGS = {
  /** Routes API générales - 100 req/min */
  default: {
    maxRequests: 100,
    windowSeconds: 60,
    message: 'Trop de requêtes. Veuillez réessayer dans quelques instants.',
  },

  /** Routes LLM (coûteuses) - 20 req/min */
  llm: {
    maxRequests: 20,
    windowSeconds: 60,
    message: 'Limite de requêtes IA atteinte. Veuillez patienter.',
  },

  /** Routes d'authentification - 10 req/min */
  auth: {
    maxRequests: 10,
    windowSeconds: 60,
    message: 'Trop de tentatives de connexion. Veuillez réessayer plus tard.',
  },

  /** Screenshots - 30 req/min */
  screenshot: {
    maxRequests: 30,
    windowSeconds: 60,
    message: "Limite de captures d'écran atteinte.",
  },

  /** Templates - 60 req/min */
  templates: {
    maxRequests: 60,
    windowSeconds: 60,
    message: 'Trop de requêtes de templates.',
  },
} as const;

/**
 * Extrait l'IP du client depuis la requête
 */
export function getClientIP(request: Request): string {
  // Cloudflare Workers
  const cfIP = request.headers.get('cf-connecting-ip');

  if (cfIP) {
    return cfIP;
  }

  // X-Forwarded-For (proxies)
  const forwardedFor = request.headers.get('x-forwarded-for');

  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim();
  }

  // X-Real-IP
  const realIP = request.headers.get('x-real-ip');

  if (realIP) {
    return realIP;
  }

  // Fallback
  return 'unknown';
}

/**
 * Génère une clé de rate limiting unique
 */
export function getRateLimitKey(request: Request, prefix: string = 'rl'): string {
  const ip = getClientIP(request);
  const path = new URL(request.url).pathname;

  return `${prefix}:${ip}:${path}`;
}

/**
 * Vérifie le rate limit pour une requête.
 * Uses the configured storage backend (memory or KV).
 */
export async function checkRateLimit(
  request: Request,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.default,
): Promise<RateLimitResult> {
  const key = getRateLimitKey(request);
  const now = Math.floor(Date.now() / 1000);

  // Récupérer l'état actuel depuis le storage
  const cached = await rateLimitStorage.get(key);

  // Si pas de cache ou fenêtre expirée, reset
  if (!cached || cached.resetAt <= now) {
    const resetAt = now + config.windowSeconds;
    const newEntry = { count: 1, resetAt };

    await rateLimitStorage.set(key, newEntry, config.windowSeconds);

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
      total: 1,
    };
  }

  // Incrémenter le compteur
  const newCount = cached.count + 1;
  const updatedEntry = { count: newCount, resetAt: cached.resetAt };

  await rateLimitStorage.set(key, updatedEntry, cached.resetAt - now);

  const allowed = newCount <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - newCount);

  if (!allowed) {
    logger.warn(`Rate limit exceeded for ${getClientIP(request)} on ${new URL(request.url).pathname}`);
  }

  return {
    allowed,
    remaining,
    resetAt: cached.resetAt,
    total: newCount,
  };
}

/**
 * Crée une Response de rate limit dépassé (429)
 */
export function createRateLimitResponse(result: RateLimitResult, config: RateLimitConfig): Response {
  const retryAfter = result.resetAt - Math.floor(Date.now() / 1000);

  return new Response(
    JSON.stringify({
      error: config.message || 'Trop de requêtes',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter,
      resetAt: result.resetAt,
    }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(Math.max(1, retryAfter)),
        'X-RateLimit-Limit': String(config.maxRequests),
        'X-RateLimit-Remaining': String(result.remaining),
        'X-RateLimit-Reset': String(result.resetAt),
      },
    },
  );
}

/**
 * Ajoute les headers de rate limit à une Response existante
 */
export function addRateLimitHeaders(response: Response, result: RateLimitResult, config: RateLimitConfig): Response {
  const headers = new Headers(response.headers);
  headers.set('X-RateLimit-Limit', String(config.maxRequests));
  headers.set('X-RateLimit-Remaining', String(result.remaining));
  headers.set('X-RateLimit-Reset', String(result.resetAt));

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Middleware de rate limiting pour les routes API
 */
export async function withRateLimit<T extends Response>(
  request: Request,
  handler: () => Promise<T>,
  configType: keyof typeof RATE_LIMIT_CONFIGS = 'default',
): Promise<Response> {
  const config = RATE_LIMIT_CONFIGS[configType];
  const result = await checkRateLimit(request, config);

  if (!result.allowed) {
    return createRateLimitResponse(result, config);
  }

  const response = await handler();

  return addRateLimitHeaders(response, result, config);
}

/**
 * Nettoie les entrées expirées du cache (à appeler périodiquement).
 * Only works for MemoryStorage - KV handles expiration automatically.
 */
export function cleanupRateLimitCache(): void {
  // Only cleanup for MemoryStorage
  if (rateLimitStorage instanceof MemoryStorage) {
    const cleaned = rateLimitStorage.evictExpired();

    if (cleaned > 0) {
      logger.debug(`Cleaned ${cleaned} expired rate limit entries`);
    }
  }

  // Legacy: Also cleanup old cache if it has entries
  const now = Math.floor(Date.now() / 1000);
  let legacyCleaned = 0;

  for (const [key, value] of rateLimitCache.entries()) {
    if (value.resetAt <= now) {
      rateLimitCache.delete(key);
      legacyCleaned++;
    }
  }

  if (legacyCleaned > 0) {
    logger.debug(`Cleaned ${legacyCleaned} legacy rate limit entries`);
  }
}

// Cleanup automatique toutes les 5 minutes
let cleanupIntervalId: ReturnType<typeof setInterval> | null = null;

function startCleanupInterval(): void {
  if (typeof setInterval !== 'undefined' && !cleanupIntervalId) {
    cleanupIntervalId = setInterval(cleanupRateLimitCache, 5 * 60 * 1000);
  }
}

function stopCleanupInterval(): void {
  if (cleanupIntervalId) {
    clearInterval(cleanupIntervalId);
    cleanupIntervalId = null;
  }
}

// Start cleanup on module load
startCleanupInterval();

// HMR cleanup to prevent interval leaks
if (import.meta.hot) {
  import.meta.hot.dispose(() => {
    stopCleanupInterval();
    rateLimitCache.clear();

    // Also clear memory storage
    if (rateLimitStorage instanceof MemoryStorage) {
      rateLimitStorage.clear();
    }
  });
}

// Export for testing
export { stopCleanupInterval };
