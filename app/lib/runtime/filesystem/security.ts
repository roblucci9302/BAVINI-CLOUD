/**
 * =============================================================================
 * BAVINI Container - Path Security
 * =============================================================================
 * Security utilities for path validation and sanitization.
 * Prevents path traversal attacks and other path-based vulnerabilities.
 *
 * FIX: Issue 1.4 - Path traversal security vulnerability
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';
import { normalizePath, isInside } from './path-utils';

const logger = createScopedLogger('PathSecurity');

/**
 * Security error for path violations
 */
export class SecurityError extends Error {
  constructor(
    message: string,
    public readonly path: string,
    public readonly violation: 'traversal' | 'null_byte' | 'escape' | 'invalid'
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Dangerous patterns to detect BEFORE normalization
 */
interface DangerousPattern {
  pattern: RegExp;
  violation: SecurityError['violation'];
  description: string;
}

const DANGEROUS_PATTERNS: DangerousPattern[] = [
  {
    pattern: /\0/,
    violation: 'null_byte',
    description: 'Null byte injection',
  },
  {
    pattern: /\.\.[\\/]/,
    violation: 'traversal',
    description: 'Directory traversal (../)',
  },
  {
    pattern: /^\.\./,
    violation: 'traversal',
    description: 'Path starts with ..',
  },
  {
    pattern: /[\\/]\.\.[\\/]/,
    violation: 'traversal',
    description: 'Contains /../',
  },
  {
    pattern: /[\\/]\.\.$/,
    violation: 'traversal',
    description: 'Path ends with /..',
  },
  {
    pattern: /^\.\.$/,
    violation: 'traversal',
    description: 'Path is just ..',
  },
];

/**
 * Validate and sanitize a path securely.
 *
 * This function performs three levels of validation:
 * 1. Check for dangerous patterns BEFORE normalization (prevents encoding attacks)
 * 2. Normalize the path (resolve . and ..)
 * 3. Verify the normalized path is within the allowed root
 *
 * @param path - The path to validate
 * @param allowedRoot - The directory that the path must be inside (default: '/')
 * @returns The validated and normalized path
 * @throws SecurityError if the path is dangerous or escapes the allowed root
 *
 * @example
 * ```typescript
 * // Valid paths
 * validatePath('/home/user/file.txt', '/home'); // Returns '/home/user/file.txt'
 * validatePath('file.txt', '/home/user');       // Returns '/home/user/file.txt'
 *
 * // Invalid paths - throws SecurityError
 * validatePath('../../../etc/passwd', '/home'); // THROWS: Path escapes allowed root
 * validatePath('/etc\0passwd', '/home');        // THROWS: Null byte injection
 * ```
 */
export function validatePath(path: string, allowedRoot: string = '/'): string {
  // Step 1: Check for dangerous patterns BEFORE normalizing
  for (const { pattern, violation, description } of DANGEROUS_PATTERNS) {
    if (pattern.test(path)) {
      logger.warn(`Path security violation: ${description} in "${sanitizePathForLog(path)}"`);
      throw new SecurityError(`Invalid path: ${description}`, path, violation);
    }
  }

  // Step 2: Normalize the path
  const normalized = normalizePath(path, allowedRoot);
  const normalizedRoot = normalizePath(allowedRoot);

  // Step 3: Verify the normalized path is within allowed root
  if (!isInside(normalizedRoot, normalized)) {
    logger.warn(
      `Path escape attempt: "${sanitizePathForLog(path)}" -> ` +
        `"${sanitizePathForLog(normalized)}" escapes "${sanitizePathForLog(normalizedRoot)}"`
    );
    throw new SecurityError(`Path escapes allowed root: ${path}`, path, 'escape');
  }

  return normalized;
}

/**
 * Check if a path is valid without throwing.
 *
 * @param path - The path to check
 * @param allowedRoot - The directory that the path must be inside
 * @returns True if the path is safe, false otherwise
 */
export function isValidSecurePath(path: string, allowedRoot: string = '/'): boolean {
  try {
    validatePath(path, allowedRoot);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolve a path relative to cwd, with security validation.
 *
 * @param path - The path (can be relative or absolute)
 * @param cwd - Current working directory
 * @param allowedRoot - The root directory that paths must stay within
 * @returns The resolved and validated absolute path
 * @throws SecurityError if the path is dangerous
 */
export function resolveSecurePath(
  path: string,
  cwd: string = '/',
  allowedRoot: string = '/'
): string {
  // Make path absolute if relative
  const absolutePath = path.startsWith('/') ? path : `${cwd}/${path}`;

  // Validate with the allowed root
  return validatePath(absolutePath, allowedRoot);
}

/**
 * Sanitize a path for safe logging.
 * Replaces control characters and truncates long paths.
 *
 * @param path - The path to sanitize
 * @param maxLength - Maximum length (default: 100)
 * @returns Sanitized path string safe for logging
 */
export function sanitizePathForLog(path: string, maxLength: number = 100): string {
  // Replace control characters with ?
  let sanitized = path.replace(/[\x00-\x1F\x7F]/g, '?');

  // Truncate if too long
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength - 3) + '...';
  }

  return sanitized;
}

/**
 * Check if a filename is safe (no path components).
 *
 * @param filename - The filename to check
 * @returns True if the filename is safe
 */
export function isSafeFilename(filename: string): boolean {
  // Must not contain path separators
  if (filename.includes('/') || filename.includes('\\')) {
    return false;
  }

  // Must not be . or ..
  if (filename === '.' || filename === '..') {
    return false;
  }

  // Must not contain null bytes
  if (filename.includes('\0')) {
    return false;
  }

  // Must not be empty
  if (filename.length === 0) {
    return false;
  }

  return true;
}

/**
 * Extract a safe filename from a path.
 * Returns the basename if safe, null otherwise.
 *
 * @param path - The path to extract filename from
 * @returns The safe filename or null if unsafe
 */
export function extractSafeFilename(path: string): string | null {
  const parts = path.split('/');
  const filename = parts[parts.length - 1];

  if (!filename || !isSafeFilename(filename)) {
    return null;
  }

  return filename;
}
