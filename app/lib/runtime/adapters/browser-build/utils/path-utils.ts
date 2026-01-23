/**
 * =============================================================================
 * BAVINI CLOUD - Path Utilities
 * =============================================================================
 * Path manipulation and validation utilities for the browser build system.
 * =============================================================================
 */

/**
 * Normalize a file path to ensure consistent format.
 *
 * - Ensures path starts with /
 * - Removes duplicate slashes
 * - Handles Windows-style paths
 *
 * @param path - Path to normalize
 * @returns Normalized path
 */
export function normalizePath(path: string): string {
  // Handle Windows paths
  let normalized = path.replace(/\\/g, '/');

  // Ensure leading slash
  if (!normalized.startsWith('/')) {
    normalized = '/' + normalized;
  }

  // Remove duplicate slashes
  normalized = normalized.replace(/\/+/g, '/');

  return normalized;
}

/**
 * Generate a simple hash from a string.
 *
 * Uses a fast, non-cryptographic hash suitable for cache keys and identifiers.
 *
 * @param content - String to hash
 * @returns Hexadecimal hash string
 */
export function generateHash(content: string): string {
  let hash = 0;

  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32-bit integer
  }

  return Math.abs(hash).toString(16);
}

/**
 * Generate a hash using FNV-1a algorithm.
 * Better distribution than simple hash, useful for cache keys.
 *
 * @param content - String to hash
 * @returns Base36 hash string
 */
export function generateFNVHash(content: string): string {
  let hash = 2166136261; // FNV offset basis

  for (let i = 0; i < content.length; i++) {
    hash ^= content.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
  }

  return (hash >>> 0).toString(36);
}

/**
 * Check if a path is safe (no directory traversal).
 *
 * @param path - Path to validate
 * @returns true if path is safe
 */
export function isPathSafe(path: string): boolean {
  // Normalize the path first
  const normalized = normalizePath(path);

  // Check for path traversal attempts
  if (normalized.includes('..')) {
    return false;
  }

  // Check for absolute paths that go outside the root
  if (normalized.startsWith('//')) {
    return false;
  }

  // Check for null bytes (security concern)
  if (normalized.includes('\0')) {
    return false;
  }

  return true;
}

/**
 * Get the file extension from a path.
 *
 * @param path - File path
 * @returns Extension including dot (e.g., '.ts') or empty string
 */
export function getExtension(path: string): string {
  const lastDot = path.lastIndexOf('.');
  const lastSlash = path.lastIndexOf('/');

  // Ensure dot is after last slash and not at end
  if (lastDot > lastSlash && lastDot < path.length - 1) {
    return path.slice(lastDot);
  }

  return '';
}

/**
 * Get the filename from a path (without directory).
 *
 * @param path - File path
 * @returns Filename
 */
export function getFilename(path: string): string {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf('/');

  return lastSlash >= 0 ? normalized.slice(lastSlash + 1) : normalized;
}

/**
 * Get the directory from a path.
 *
 * @param path - File path
 * @returns Directory path
 */
export function getDirectory(path: string): string {
  const normalized = normalizePath(path);
  const lastSlash = normalized.lastIndexOf('/');

  return lastSlash >= 0 ? normalized.slice(0, lastSlash) || '/' : '/';
}

/**
 * Join path segments.
 *
 * @param segments - Path segments to join
 * @returns Joined and normalized path
 */
export function joinPath(...segments: string[]): string {
  const joined = segments
    .map((s) => s.replace(/^\/+|\/+$/g, ''))
    .filter(Boolean)
    .join('/');

  return normalizePath(joined);
}

/**
 * Resolve a relative path against a base path.
 *
 * @param base - Base path (typically the importing file)
 * @param relative - Relative path to resolve
 * @returns Resolved absolute path
 */
export function resolvePath(base: string, relative: string): string {
  // If relative is already absolute, return it normalized
  if (relative.startsWith('/')) {
    return normalizePath(relative);
  }

  // Get directory of base path
  const baseDir = getDirectory(base);

  // Split paths into segments
  const baseSegments = baseDir.split('/').filter(Boolean);
  const relativeSegments = relative.split('/').filter(Boolean);

  // Process relative segments
  const resultSegments = [...baseSegments];

  for (const segment of relativeSegments) {
    if (segment === '..') {
      resultSegments.pop();
    } else if (segment !== '.') {
      resultSegments.push(segment);
    }
  }

  return '/' + resultSegments.join('/');
}
