/**
 * Input Sanitization Utilities
 *
 * Utilitaires pour nettoyer et valider les entrées utilisateur
 * afin de prévenir les attaques XSS, injection, etc.
 */

/**
 * Échappe les caractères HTML dangereux
 * Prévient les attaques XSS basiques
 */
export function escapeHtml(str: string): string {
  const htmlEscapes: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
    '`': '&#x60;',
    '=': '&#x3D;',
  };

  return str.replace(/[&<>"'`=/]/g, (char) => htmlEscapes[char] || char);
}

/**
 * Supprime les balises HTML d'une chaîne
 */
export function stripHtml(str: string): string {
  return str.replace(/<[^>]*>/g, '');
}

/**
 * Normalise une chaîne unicode pour éviter les attaques par homoglyphes
 */
export function normalizeUnicode(str: string): string {
  return str.normalize('NFC');
}

/**
 * Supprime les caractères de contrôle dangereux
 */
export function stripControlChars(str: string): string {
  return str.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F-\x9F]/g, '');
}

/**
 * Sanitize une chaîne pour utilisation sécurisée
 * Combine plusieurs protections
 */
export function sanitizeString(str: string, options: SanitizeOptions = {}): string {
  const {
    stripHtmlTags = true,
    escapeHtmlChars = false,
    normalizeUnicodeChars = true,
    removeControlChars = true,
    maxLength,
    trim = true,
  } = options;

  let result = str;

  // Normaliser unicode d'abord
  if (normalizeUnicodeChars) {
    result = normalizeUnicode(result);
  }

  // Supprimer les caractères de contrôle
  if (removeControlChars) {
    result = stripControlChars(result);
  }

  // Supprimer ou échapper HTML
  if (stripHtmlTags) {
    result = stripHtml(result);
  } else if (escapeHtmlChars) {
    result = escapeHtml(result);
  }

  // Trim
  if (trim) {
    result = result.trim();
  }

  // Limiter la longueur
  if (maxLength && result.length > maxLength) {
    result = result.slice(0, maxLength);
  }

  return result;
}

export interface SanitizeOptions {
  /** Supprimer les balises HTML (default: true) */
  stripHtmlTags?: boolean;

  /** Échapper les caractères HTML (mutually exclusive avec stripHtmlTags) */
  escapeHtmlChars?: boolean;

  /** Normaliser unicode NFC (default: true) */
  normalizeUnicodeChars?: boolean;

  /** Supprimer les caractères de contrôle (default: true) */
  removeControlChars?: boolean;

  /** Longueur maximale */
  maxLength?: number;

  /** Trim les espaces (default: true) */
  trim?: boolean;
}

/**
 * Valide et sanitize un email
 */
export function sanitizeEmail(email: string): string | null {
  const sanitized = sanitizeString(email, { maxLength: 254 }).toLowerCase();

  // Regex simple pour validation email
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  if (!emailRegex.test(sanitized)) {
    return null;
  }

  return sanitized;
}

/**
 * Sanitize un nom d'utilisateur
 */
export function sanitizeUsername(username: string): string {
  return sanitizeString(username, { maxLength: 50 })
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');
}

/**
 * Sanitize un chemin de fichier pour prévenir le path traversal
 */
export function sanitizeFilePath(path: string): string {
  return sanitizeString(path, { maxLength: 500 })
    .replace(/\.\./g, '') // Supprimer les path traversal
    .replace(/\/+/g, '/') // Normaliser les slashes multiples
    .replace(/^\//, ''); // Supprimer le slash initial
}

/**
 * Sanitize une URL
 */
export function sanitizeUrl(url: string): string | null {
  const sanitized = sanitizeString(url, { maxLength: 2048 });

  try {
    const parsed = new URL(sanitized);

    // Autoriser uniquement http et https
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return null;
    }

    return parsed.href;
  } catch {
    return null;
  }
}

/**
 * Sanitize un objet en appliquant sanitizeString à toutes les valeurs string
 */
export function sanitizeObject<T extends Record<string, unknown>>(obj: T, options: SanitizeOptions = {}): T {
  const result = { ...obj };

  for (const key of Object.keys(result)) {
    const value = result[key];

    if (typeof value === 'string') {
      (result as Record<string, unknown>)[key] = sanitizeString(value, options);
    } else if (value && typeof value === 'object' && !Array.isArray(value)) {
      (result as Record<string, unknown>)[key] = sanitizeObject(value as Record<string, unknown>, options);
    }
  }

  return result;
}

/**
 * Vérifie si une chaîne contient des patterns dangereux
 */
export function containsDangerousPatterns(str: string): boolean {
  const dangerousPatterns = [
    /<script/i,
    /javascript:/i,
    /on\w+\s*=/i, // onclick=, onerror=, etc.
    /data:/i,
    /vbscript:/i,
    /expression\s*\(/i, // CSS expression()
    /url\s*\(/i, // CSS url() avec data
  ];

  return dangerousPatterns.some((pattern) => pattern.test(str));
}

export default {
  escapeHtml,
  stripHtml,
  normalizeUnicode,
  stripControlChars,
  sanitizeString,
  sanitizeEmail,
  sanitizeUsername,
  sanitizeFilePath,
  sanitizeUrl,
  sanitizeObject,
  containsDangerousPatterns,
};
