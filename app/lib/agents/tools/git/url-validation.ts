/**
 * =============================================================================
 * BAVINI CLOUD - Git URL Validation
 * =============================================================================
 * Functions for validating Git repository URLs.
 *
 * @module lib/agents/tools/git/url-validation
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('GitUrlValidation');

/**
 * Hosts Git autorisés par défaut
 * Ces hosts sont considérés comme sûrs pour le clonage
 */
export const ALLOWED_GIT_HOSTS = new Set([
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'dev.azure.com',
  'ssh.dev.azure.com',
  'git.sr.ht', // SourceHut
  'codeberg.org',
  'gitea.com',
]);

/**
 * Schémas d'URL Git autorisés
 */
const ALLOWED_URL_SCHEMES = new Set(['https', 'git', 'ssh']);

/**
 * Résultat de la validation d'une URL Git
 */
export interface GitUrlValidationResult {
  valid: boolean;
  error?: string;
  host?: string;
  scheme?: string;
}

/**
 * Configuration de la validation des URLs Git
 */
export interface GitUrlValidationConfig {
  /** Hosts Git autorisés (si vide, tous sont autorisés) */
  allowedHosts?: Set<string>;

  /** Hosts Git interdits */
  blockedHosts?: Set<string>;

  /** Autoriser les hosts personnalisés (non dans la liste par défaut) */
  allowCustomHosts?: boolean;

  /** Bloquer les IPs privées dans les URLs */
  blockPrivateIPs?: boolean;

  /** Bloquer localhost */
  blockLocalhost?: boolean;
}

/**
 * Configuration par défaut
 */
const DEFAULT_URL_VALIDATION_CONFIG: GitUrlValidationConfig = {
  allowedHosts: ALLOWED_GIT_HOSTS,
  allowCustomHosts: false,
  blockPrivateIPs: true,
  blockLocalhost: true,
};

/**
 * Patterns d'IPs privées
 */
const PRIVATE_IP_PATTERNS: RegExp[] = [
  /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/,
  /^192\.168\.\d{1,3}\.\d{1,3}$/,
  /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/,
  /^169\.254\.\d{1,3}\.\d{1,3}$/, // Link-local
  /^::1$/, // IPv6 localhost
  /^fc00:/i, // IPv6 private
  /^fe80:/i, // IPv6 link-local
];

/**
 * Vérifier si un host est une IP privée
 */
function isPrivateIP(host: string): boolean {
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(host));
}

/**
 * Extraire le host d'une URL Git (supporte HTTPS et SSH)
 */
function extractGitHost(urlString: string): { host: string; scheme: string } | null {
  try {
    // Format git@host:user/repo.git (SSH)
    if (urlString.startsWith('git@')) {
      const match = urlString.match(/^git@([^:]+):/);
      if (match) {
        return { host: match[1].toLowerCase(), scheme: 'ssh' };
      }
      return null;
    }

    // Format ssh://git@host/user/repo.git
    if (urlString.startsWith('ssh://')) {
      const url = new URL(urlString);
      return { host: url.hostname.toLowerCase(), scheme: 'ssh' };
    }

    // Format standard HTTPS/GIT
    const url = new URL(urlString);
    const scheme = url.protocol.replace(':', '').toLowerCase();

    if (!ALLOWED_URL_SCHEMES.has(scheme)) {
      return null;
    }

    return { host: url.hostname.toLowerCase(), scheme };
  } catch {
    return null;
  }
}

/**
 * Valider une URL Git pour le clonage
 *
 * @param urlString - URL à valider
 * @param config - Configuration de validation (optionnel)
 * @returns Résultat de la validation
 *
 * @example
 * ```typescript
 * const result = validateGitUrl('https://github.com/user/repo.git');
 * if (!result.valid) {
 *   console.error(result.error);
 * }
 * ```
 */
export function validateGitUrl(
  urlString: string,
  config: GitUrlValidationConfig = DEFAULT_URL_VALIDATION_CONFIG,
): GitUrlValidationResult {
  // Vérifier que l'URL n'est pas vide
  if (!urlString || typeof urlString !== 'string') {
    return { valid: false, error: 'URL is required' };
  }

  // Nettoyer l'URL
  const cleanUrl = urlString.trim();

  // Extraire le host et le schéma
  const parsed = extractGitHost(cleanUrl);
  if (!parsed) {
    return { valid: false, error: 'Invalid Git URL format. Use HTTPS, SSH (git@), or git:// format.' };
  }

  const { host, scheme } = parsed;

  // Bloquer localhost si configuré
  if (config.blockLocalhost !== false) {
    if (host === 'localhost' || host === '127.0.0.1' || host === '::1') {
      return { valid: false, error: 'Localhost URLs are not allowed for security reasons', host, scheme };
    }
  }

  // Bloquer les IPs privées si configuré
  if (config.blockPrivateIPs !== false) {
    if (isPrivateIP(host)) {
      return { valid: false, error: `Private IP addresses are not allowed: ${host}`, host, scheme };
    }
  }

  // Vérifier les hosts bloqués
  if (config.blockedHosts && config.blockedHosts.has(host)) {
    return { valid: false, error: `Git host is blocked: ${host}`, host, scheme };
  }

  // Vérifier les hosts autorisés (si configuré)
  if (config.allowedHosts && config.allowedHosts.size > 0 && !config.allowCustomHosts) {
    if (!config.allowedHosts.has(host)) {
      return {
        valid: false,
        error: `Git host not in allowed list: ${host}. Allowed: ${Array.from(config.allowedHosts).join(', ')}`,
        host,
        scheme,
      };
    }
  }

  // Validation supplémentaire: éviter les URLs avec injection de commandes
  const dangerousPatterns = [
    /[;&|`$]/, // Caractères d'injection shell
    /\s/, // Espaces (possible injection)
    /%[0-9a-fA-F]{2}/, // Encodage URL suspect
  ];

  for (const pattern of dangerousPatterns) {
    if (pattern.test(cleanUrl)) {
      logger.warn('Suspicious Git URL detected', { url: cleanUrl.substring(0, 100) });
      return { valid: false, error: 'URL contains suspicious characters', host, scheme };
    }
  }

  return { valid: true, host, scheme };
}

/**
 * Configuration globale pour la validation des URLs Git
 * Peut être modifiée au runtime
 */
let globalUrlValidationConfig: GitUrlValidationConfig = { ...DEFAULT_URL_VALIDATION_CONFIG };

/**
 * Configurer la validation des URLs Git
 */
export function configureGitUrlValidation(config: Partial<GitUrlValidationConfig>): void {
  globalUrlValidationConfig = { ...globalUrlValidationConfig, ...config };
  logger.info('Git URL validation configuration updated', {
    allowedHostsCount: globalUrlValidationConfig.allowedHosts?.size,
    allowCustomHosts: globalUrlValidationConfig.allowCustomHosts,
  });
}

/**
 * Ajouter un host à la liste des hosts autorisés
 */
export function addAllowedGitHost(host: string): void {
  if (!globalUrlValidationConfig.allowedHosts) {
    globalUrlValidationConfig.allowedHosts = new Set(ALLOWED_GIT_HOSTS);
  }
  globalUrlValidationConfig.allowedHosts.add(host.toLowerCase());
  logger.info('Added allowed Git host', { host });
}

/**
 * Obtenir la configuration actuelle
 */
export function getGitUrlValidationConfig(): GitUrlValidationConfig {
  return { ...globalUrlValidationConfig };
}

/**
 * Obtenir la configuration globale actuelle (mutable reference)
 * @internal Used by tool handlers
 */
export function getGlobalUrlValidationConfig(): GitUrlValidationConfig {
  return globalUrlValidationConfig;
}
