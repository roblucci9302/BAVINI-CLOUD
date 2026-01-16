/**
 * HTTP Cache Headers Utilities
 * Helpers pour configurer les headers de cache HTTP
 */

/**
 * Headers de sécurité pour les réponses API
 */
export const API_SECURITY_HEADERS = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'SAMEORIGIN',
  'X-XSS-Protection': '1; mode=block',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
} as const;

/**
 * Presets de cache courants
 */
export const CachePresets = {
  /** Pas de cache (streaming, données temps réel) */
  noCache: {
    'Cache-Control': 'no-cache, no-store, must-revalidate',
    Pragma: 'no-cache',
    Expires: '0',
  },

  /** Cache privé court (données utilisateur, 1 minute) */
  privateShort: {
    'Cache-Control': 'private, max-age=60',
  },

  /** Cache privé moyen (données utilisateur, 5 minutes) */
  privateMedium: {
    'Cache-Control': 'private, max-age=300',
  },

  /** Cache privé long (données utilisateur, 1 heure) */
  privateLong: {
    'Cache-Control': 'private, max-age=3600',
  },

  /** Cache public court (contenu statique, 5 minutes) */
  publicShort: {
    'Cache-Control': 'public, max-age=300',
  },

  /** Cache public moyen (contenu statique, 1 heure) */
  publicMedium: {
    'Cache-Control': 'public, max-age=3600',
  },

  /** Cache public long (assets, 1 jour) */
  publicLong: {
    'Cache-Control': 'public, max-age=86400',
  },

  /** Cache immutable (assets versionnés, 1 an) */
  immutable: {
    'Cache-Control': 'public, max-age=31536000, immutable',
  },

  /** Streaming SSE */
  streaming: {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no', // Désactiver le buffering nginx
  },

  /** API JSON standard */
  jsonApi: {
    'Content-Type': 'application/json',
  },
} as const;

export type CachePreset = keyof typeof CachePresets;

/**
 * Options pour générer des headers de cache
 */
export interface CacheHeaderOptions {
  /** Durée du cache en secondes */
  maxAge?: number;

  /** Cache partagé (CDN) vs privé (navigateur) */
  scope?: 'public' | 'private';

  /** Revalidation obligatoire */
  mustRevalidate?: boolean;

  /** Contenu immutable (ne change jamais) */
  immutable?: boolean;

  /** Stale-while-revalidate en secondes */
  staleWhileRevalidate?: number;

  /** Stale-if-error en secondes */
  staleIfError?: number;

  /** ETag pour validation conditionnelle */
  etag?: string;

  /** Last-Modified date */
  lastModified?: Date;

  /** Vary headers */
  vary?: string[];
}

/**
 * Générer les headers Cache-Control
 */
export function createCacheHeaders(options: CacheHeaderOptions): Record<string, string> {
  const headers: Record<string, string> = {};
  const directives: string[] = [];

  // Scope
  if (options.scope) {
    directives.push(options.scope);
  }

  // Max-age
  if (options.maxAge !== undefined) {
    directives.push(`max-age=${options.maxAge}`);
  }

  // Must-revalidate
  if (options.mustRevalidate) {
    directives.push('must-revalidate');
  }

  // Immutable
  if (options.immutable) {
    directives.push('immutable');
  }

  // Stale-while-revalidate
  if (options.staleWhileRevalidate !== undefined) {
    directives.push(`stale-while-revalidate=${options.staleWhileRevalidate}`);
  }

  // Stale-if-error
  if (options.staleIfError !== undefined) {
    directives.push(`stale-if-error=${options.staleIfError}`);
  }

  if (directives.length > 0) {
    headers['Cache-Control'] = directives.join(', ');
  }

  // ETag
  if (options.etag) {
    headers.ETag = `"${options.etag}"`;
  }

  // Last-Modified
  if (options.lastModified) {
    headers['Last-Modified'] = options.lastModified.toUTCString();
  }

  // Vary
  if (options.vary && options.vary.length > 0) {
    headers.Vary = options.vary.join(', ');
  }

  return headers;
}

/**
 * Obtenir les headers d'un preset
 */
export function getCachePreset(preset: CachePreset): Record<string, string> {
  return { ...CachePresets[preset] };
}

/**
 * Combiner les headers de cache avec d'autres headers
 */
export function withCacheHeaders(headers: HeadersInit | undefined, cacheHeaders: Record<string, string>): Headers {
  const result = new Headers(headers);

  for (const [key, value] of Object.entries(cacheHeaders)) {
    result.set(key, value);
  }

  return result;
}

/**
 * Créer une Response avec les headers de cache appropriés
 */
export function createCachedResponse(
  body: BodyInit | null,
  options: ResponseInit & { cachePreset?: CachePreset; cacheOptions?: CacheHeaderOptions },
): Response {
  const { cachePreset, cacheOptions, ...responseOptions } = options;

  let cacheHeaders: Record<string, string> = {};

  if (cachePreset) {
    cacheHeaders = getCachePreset(cachePreset);
  }

  if (cacheOptions) {
    cacheHeaders = { ...cacheHeaders, ...createCacheHeaders(cacheOptions) };
  }

  const headers = withCacheHeaders(responseOptions.headers, cacheHeaders);

  return new Response(body, {
    ...responseOptions,
    headers,
  });
}

/**
 * Créer une Response JSON avec cache
 */
export function jsonWithCache<T>(
  data: T,
  options: ResponseInit & { cachePreset?: CachePreset; cacheOptions?: CacheHeaderOptions } = {},
): Response {
  const { cachePreset = 'jsonApi', cacheOptions, ...responseOptions } = options;

  const cacheHeaders = {
    ...getCachePreset(cachePreset),
    ...(cacheOptions ? createCacheHeaders(cacheOptions) : {}),
  };

  const headers = withCacheHeaders(responseOptions.headers, cacheHeaders);

  return new Response(JSON.stringify(data), {
    ...responseOptions,
    headers,
  });
}

/**
 * Créer une Response streaming SSE avec les bons headers (cache + sécurité)
 */
export function createStreamingResponse(stream: ReadableStream, options: ResponseInit = {}): Response {
  const cacheHeaders = getCachePreset('streaming');
  const allHeaders = { ...cacheHeaders, ...API_SECURITY_HEADERS };
  const headers = withCacheHeaders(options.headers, allHeaders);

  return new Response(stream, {
    ...options,
    headers,
  });
}

/**
 * Créer une Response JSON sécurisée avec cache
 */
export function createSecureJsonResponse<T>(
  data: T,
  options: ResponseInit & { cachePreset?: CachePreset; cacheOptions?: CacheHeaderOptions } = {},
): Response {
  const { cachePreset = 'jsonApi', cacheOptions, ...responseOptions } = options;

  const cacheHeaders = {
    ...getCachePreset(cachePreset),
    ...(cacheOptions ? createCacheHeaders(cacheOptions) : {}),
    ...API_SECURITY_HEADERS,
  };

  const headers = withCacheHeaders(responseOptions.headers, cacheHeaders);

  return new Response(JSON.stringify(data), {
    ...responseOptions,
    headers,
  });
}

/**
 * Vérifier si une requête peut utiliser un cache (GET ou HEAD)
 */
export function isCacheableRequest(request: Request): boolean {
  return request.method === 'GET' || request.method === 'HEAD';
}

/**
 * Vérifier les headers de requête pour la validation conditionnelle
 */
export function checkConditionalRequest(
  request: Request,
  etag?: string,
  lastModified?: Date,
): { isConditional: boolean; notModified: boolean } {
  const ifNoneMatch = request.headers.get('If-None-Match');
  const ifModifiedSince = request.headers.get('If-Modified-Since');

  let isConditional = false;
  let notModified = false;

  // Vérifier ETag
  if (ifNoneMatch && etag) {
    isConditional = true;
    notModified = ifNoneMatch.includes(`"${etag}"`) || ifNoneMatch === '*';
  }

  // Vérifier Last-Modified
  if (!notModified && ifModifiedSince && lastModified) {
    isConditional = true;

    const ifModifiedDate = new Date(ifModifiedSince);
    notModified = lastModified <= ifModifiedDate;
  }

  return { isConditional, notModified };
}

/**
 * Créer une réponse 304 Not Modified
 */
export function notModifiedResponse(etag?: string, lastModified?: Date): Response {
  const headers: Record<string, string> = {};

  if (etag) {
    headers.ETag = `"${etag}"`;
  }

  if (lastModified) {
    headers['Last-Modified'] = lastModified.toUTCString();
  }

  return new Response(null, {
    status: 304,
    statusText: 'Not Modified',
    headers,
  });
}
