/**
 * Security Headers Configuration
 *
 * Headers de sécurité HTTP pour protéger contre XSS, clickjacking, etc.
 */

export interface SecurityHeadersConfig {
  /** Activer Content-Security-Policy */
  enableCSP: boolean;

  /** Mode développement (moins strict) */
  isDev: boolean;

  /** Nonce pour scripts inline (généré dynamiquement) */
  nonce?: string;
}

/**
 * Génère un nonce cryptographiquement sécurisé
 */
export function generateNonce(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);

  return btoa(String.fromCharCode(...array));
}

/**
 * Content Security Policy pour BAVINI
 *
 * Stricte en production, relaxée en développement
 */
export function getCSPDirectives(config: SecurityHeadersConfig): string {
  const { isDev, nonce } = config;

  // Sources autorisées
  const self = "'self'";
  const unsafeInline = "'unsafe-inline'";
  const unsafeEval = "'unsafe-eval'";
  const nonceSource = nonce ? `'nonce-${nonce}'` : '';
  const blob = 'blob:';
  const data = 'data:';
  const wss = 'wss:';

  // Domaines tiers autorisés
  const trustedDomains = [
    'https://fonts.googleapis.com',
    'https://fonts.gstatic.com',
    'https://cdn.jsdelivr.net',
    'https://esm.sh', // For Tailwind JIT and npm packages
    'https://unpkg.com', // For npm packages fallback
    'https://cdn.tailwindcss.com', // Official Tailwind Play CDN
  ].join(' ');

  // Domaines WebContainer (StackBlitz)
  const webContainerDomains =
    'https://*.webcontainer.io https://*.webcontainer-api.io https://stackblitz.com https://*.stackblitz.com';

  // Domaines pour les APIs OAuth
  const oauthDomains = [
    'https://github.com',
    'https://api.github.com',
    'https://supabase.co',
    'https://*.supabase.co',
    'https://api.netlify.com',
    'https://api.anthropic.com',
  ].join(' ');

  // WebContainer et Pyodide ont besoin de blob:, data: et wasm-unsafe-eval
  const wasmUnsafeEval = "'wasm-unsafe-eval'";
  const workerSources = `${self} ${blob} ${wasmUnsafeEval}`;

  // En développement, on est plus permissif pour HMR/Vite
  if (isDev) {
    return [
      `default-src ${self}`,
      `script-src ${self} ${unsafeInline} ${unsafeEval} ${blob} ${trustedDomains}`,
      `style-src ${self} ${unsafeInline} ${trustedDomains}`,
      `img-src ${self} ${data} ${blob} https:`,
      `font-src ${self} ${data} ${trustedDomains}`,
      `connect-src ${self} ${wss} ${blob} ${oauthDomains} https: http://localhost:*`,
      `worker-src ${workerSources}`,
      `child-src ${self} ${blob} ${webContainerDomains}`,
      `frame-src ${self} ${blob} ${webContainerDomains}`,
      `object-src 'none'`,
      `base-uri ${self}`,
      `form-action ${self} ${blob}`,
    ].join('; ');
  }

  // En production, CSP stricte
  return [
    `default-src ${self}`,
    `script-src ${self} ${nonceSource || unsafeInline} ${blob} ${trustedDomains}`,
    `style-src ${self} ${unsafeInline} ${trustedDomains}`,
    `img-src ${self} ${data} ${blob} https:`,
    `font-src ${self} ${data} ${trustedDomains}`,
    `connect-src ${self} ${wss} ${blob} ${oauthDomains}`,
    `worker-src ${workerSources}`,
    `child-src ${self} ${blob} ${webContainerDomains}`,
    `frame-src ${self} ${blob} ${webContainerDomains}`,
    `object-src 'none'`,
    `base-uri ${self}`,
    `form-action ${self} ${blob}`,
    `frame-ancestors 'none'`,
    `upgrade-insecure-requests`,
  ].join('; ');
}

/**
 * Génère tous les headers de sécurité
 */
export function getSecurityHeaders(config: SecurityHeadersConfig): Record<string, string> {
  const headers: Record<string, string> = {
    // Protection contre le clickjacking (SAMEORIGIN pour permettre les iframes WebContainer)
    'X-Frame-Options': 'SAMEORIGIN',

    // Protection contre le MIME type sniffing
    'X-Content-Type-Options': 'nosniff',

    // Protection XSS (legacy, mais encore utile)
    'X-XSS-Protection': '1; mode=block',

    // Contrôle du referrer
    'Referrer-Policy': 'strict-origin-when-cross-origin',

    // Permissions Policy (remplace Feature-Policy)
    'Permissions-Policy': [
      'accelerometer=()',
      'camera=()',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'payment=()',
      'usb=()',
    ].join(', '),

    // Prévient les attaques basées sur les types MIME
    'X-Permitted-Cross-Domain-Policies': 'none',

    // DNS Prefetch Control
    'X-DNS-Prefetch-Control': 'off',
  };

  // HSTS seulement en production (HTTPS requis)
  if (!config.isDev) {
    headers['Strict-Transport-Security'] = 'max-age=31536000; includeSubDomains; preload';
  }

  // Content Security Policy
  if (config.enableCSP) {
    headers['Content-Security-Policy'] = getCSPDirectives(config);
  }

  return headers;
}

/**
 * Applique les headers de sécurité à une Response existante
 */
export function applySecurityHeaders(response: Response, config: SecurityHeadersConfig): Response {
  const securityHeaders = getSecurityHeaders(config);
  const headers = new Headers(response.headers);

  for (const [key, value] of Object.entries(securityHeaders)) {
    headers.set(key, value);
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

/**
 * Ajoute les headers de sécurité à des Headers existants (pour entry.server.tsx)
 */
export function addSecurityHeadersToHeaders(responseHeaders: Headers, config: SecurityHeadersConfig): void {
  const securityHeaders = getSecurityHeaders(config);

  for (const [key, value] of Object.entries(securityHeaders)) {
    responseHeaders.set(key, value);
  }
}

/**
 * Configuration par défaut selon l'environnement
 */
export function getDefaultSecurityConfig(): SecurityHeadersConfig {
  const isDev = typeof process !== 'undefined' ? process.env.NODE_ENV === 'development' : false;

  return {
    enableCSP: true,
    isDev,
  };
}
