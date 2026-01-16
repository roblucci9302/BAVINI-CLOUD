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
 * Cache en mémoire pour le rate limiting.
 * NOTE: En production multi-instance, envisager Cloudflare KV ou Redis
 * pour la persistance distribuée. Le cache mémoire actuel fonctionne
 * correctement pour les déploiements single-instance.
 */
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
 * Vérifie le rate limit pour une requête
 */
export async function checkRateLimit(
  request: Request,
  config: RateLimitConfig = RATE_LIMIT_CONFIGS.default,
): Promise<RateLimitResult> {
  const key = getRateLimitKey(request);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - config.windowSeconds;

  // Récupérer l'état actuel du cache
  const cached = rateLimitCache.get(key);

  // Si pas de cache ou fenêtre expirée, reset
  if (!cached || cached.resetAt <= now) {
    const resetAt = now + config.windowSeconds;

    // Protection contre les fuites mémoire
    if (rateLimitCache.size >= MAX_CACHE_ENTRIES) {
      cleanupRateLimitCache();

      // Si toujours trop d'entrées, supprimer les plus anciennes
      if (rateLimitCache.size >= MAX_CACHE_ENTRIES) {
        const entriesToDelete = rateLimitCache.size - MAX_CACHE_ENTRIES + 100;
        const keys = Array.from(rateLimitCache.keys()).slice(0, entriesToDelete);

        keys.forEach((k) => rateLimitCache.delete(k));
        logger.warn(`Rate limit cache overflow, deleted ${entriesToDelete} entries`);
      }
    }

    rateLimitCache.set(key, { count: 1, resetAt });

    return {
      allowed: true,
      remaining: config.maxRequests - 1,
      resetAt,
      total: 1,
    };
  }

  // Incrémenter le compteur
  cached.count++;
  rateLimitCache.set(key, cached);

  const allowed = cached.count <= config.maxRequests;
  const remaining = Math.max(0, config.maxRequests - cached.count);

  if (!allowed) {
    logger.warn(`Rate limit exceeded for ${getClientIP(request)} on ${new URL(request.url).pathname}`);
  }

  return {
    allowed,
    remaining,
    resetAt: cached.resetAt,
    total: cached.count,
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
 * Nettoie les entrées expirées du cache (à appeler périodiquement)
 */
export function cleanupRateLimitCache(): void {
  const now = Math.floor(Date.now() / 1000);
  let cleaned = 0;

  for (const [key, value] of rateLimitCache.entries()) {
    if (value.resetAt <= now) {
      rateLimitCache.delete(key);
      cleaned++;
    }
  }

  if (cleaned > 0) {
    logger.debug(`Cleaned ${cleaned} expired rate limit entries`);
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
  });
}

// Export for testing
export { stopCleanupInterval };
