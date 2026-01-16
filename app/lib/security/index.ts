/**
 * Security Module
 *
 * Exporte tous les utilitaires de sécurité
 */

// Rate Limiting
export {
  checkRateLimit,
  createRateLimitResponse,
  addRateLimitHeaders,
  withRateLimit,
  getClientIP,
  getRateLimitKey,
  cleanupRateLimitCache,
  RATE_LIMIT_CONFIGS,
  type RateLimitConfig,
  type RateLimitResult,
} from './rate-limiter';

// Security Headers
export {
  getSecurityHeaders,
  getCSPDirectives,
  applySecurityHeaders,
  addSecurityHeadersToHeaders,
  generateNonce,
  getDefaultSecurityConfig,
  type SecurityHeadersConfig,
} from './headers';

// Timeout Utilities
export {
  withTimeout,
  withExecutionLimit,
  createTimeoutController,
  EXECUTION_LIMITS,
  type ExecutionLimitConfig,
  type TimeoutResult,
} from './timeout';

// Input Sanitization
export {
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
  type SanitizeOptions,
} from './sanitize';
