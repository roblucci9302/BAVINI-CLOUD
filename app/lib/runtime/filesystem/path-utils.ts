/**
 * =============================================================================
 * BAVINI Container - Path Utilities
 * =============================================================================
 * Path manipulation utilities for the virtual filesystem.
 * Pure functions, no side effects.
 * =============================================================================
 */

/**
 * Normalize a path by resolving . and .. and ensuring leading slash
 * @param path - Path to normalize
 * @param cwd - Current working directory (for relative paths)
 * @returns Normalized absolute path
 */
export function normalizePath(path: string, cwd: string = '/'): string {
  // Handle empty path
  if (!path || path === '') {
    return cwd;
  }

  // Make path absolute if relative
  const absolutePath = path.startsWith('/') ? path : `${cwd}/${path}`;

  // Split into parts and resolve . and ..
  const parts = absolutePath.split('/').filter(Boolean);
  const resolved: string[] = [];

  for (const part of parts) {
    if (part === '.') {
      // Current directory - skip
      continue;
    } else if (part === '..') {
      // Parent directory - pop last resolved part
      resolved.pop();
    } else {
      // Regular path component
      resolved.push(part);
    }
  }

  return '/' + resolved.join('/');
}

/**
 * Get parent directory path
 * @param path - Path to get parent of
 * @returns Parent directory path, or '/' for root
 */
export function dirname(path: string): string {
  const normalized = normalizePath(path);

  if (normalized === '/') {
    return '/';
  }

  const lastSlash = normalized.lastIndexOf('/');

  if (lastSlash === 0) {
    return '/';
  }

  return normalized.substring(0, lastSlash);
}

/**
 * Get the last component of a path (file or directory name)
 * @param path - Path to get basename of
 * @returns Base name
 */
export function basename(path: string): string {
  const normalized = normalizePath(path);

  if (normalized === '/') {
    return '';
  }

  const parts = normalized.split('/').filter(Boolean);
  return parts[parts.length - 1] || '';
}

/**
 * Get file extension (including the dot)
 * @param path - Path to get extension of
 * @returns Extension with dot, or empty string if none
 */
export function extname(path: string): string {
  const base = basename(path);
  const dotIndex = base.lastIndexOf('.');

  // No dot, or dot at start (hidden file), or dot at end
  if (dotIndex <= 0 || dotIndex === base.length - 1) {
    return '';
  }

  return base.substring(dotIndex);
}

/**
 * Join path segments together
 * @param segments - Path segments to join
 * @returns Joined and normalized path
 */
export function join(...segments: string[]): string {
  if (segments.length === 0) {
    return '/';
  }

  const combined = segments.join('/');
  return normalizePath(combined);
}

/**
 * Resolve a path relative to a base path
 * @param base - Base path
 * @param path - Path to resolve (can be relative or absolute)
 * @returns Resolved absolute path
 */
export function resolve(base: string, path: string): string {
  if (path.startsWith('/')) {
    return normalizePath(path);
  }
  return normalizePath(path, base);
}

/**
 * Get relative path from one path to another
 * @param from - Starting path
 * @param to - Target path
 * @returns Relative path from 'from' to 'to'
 */
export function relative(from: string, to: string): string {
  const fromNorm = normalizePath(from);
  const toNorm = normalizePath(to);

  if (fromNorm === toNorm) {
    return '.';
  }

  const fromParts = fromNorm.split('/').filter(Boolean);
  const toParts = toNorm.split('/').filter(Boolean);

  // Find common prefix
  let commonLength = 0;
  const minLength = Math.min(fromParts.length, toParts.length);

  for (let i = 0; i < minLength; i++) {
    if (fromParts[i] === toParts[i]) {
      commonLength++;
    } else {
      break;
    }
  }

  // Build relative path
  const upCount = fromParts.length - commonLength;
  const upPath = Array(upCount).fill('..');
  const downPath = toParts.slice(commonLength);

  const relativeParts = [...upPath, ...downPath];
  return relativeParts.length > 0 ? relativeParts.join('/') : '.';
}

/**
 * Check if a path is absolute (starts with /)
 * @param path - Path to check
 * @returns True if absolute
 */
export function isAbsolute(path: string): boolean {
  return path.startsWith('/');
}

/**
 * Check if a path is the root directory
 * @param path - Path to check
 * @returns True if root
 */
export function isRoot(path: string): boolean {
  return normalizePath(path) === '/';
}

/**
 * Check if child path is inside parent path
 * @param parent - Parent path
 * @param child - Potential child path
 * @returns True if child is inside parent
 */
export function isInside(parent: string, child: string): boolean {
  const parentNorm = normalizePath(parent);
  const childNorm = normalizePath(child);

  if (parentNorm === '/') {
    return true;
  }

  return childNorm.startsWith(parentNorm + '/') || childNorm === parentNorm;
}

/**
 * Split a path into directory and filename
 * @param path - Path to split
 * @returns Object with dir and base properties
 */
export function parse(path: string): { dir: string; base: string; ext: string; name: string } {
  const dir = dirname(path);
  const base = basename(path);
  const ext = extname(path);
  const name = ext ? base.slice(0, -ext.length) : base;

  return { dir, base, ext, name };
}

/**
 * Validate path for dangerous characters
 * @param path - Path to validate
 * @returns True if path is safe
 */
export function isValidPath(path: string): boolean {
  // Disallow null bytes
  if (path.includes('\0')) {
    return false;
  }

  // Disallow paths that would escape the filesystem
  const normalized = normalizePath(path);

  // After normalization, path should not contain ..
  if (normalized.includes('..')) {
    return false;
  }

  return true;
}

/**
 * Get all ancestor paths from root to the given path
 * @param path - Path to get ancestors of
 * @returns Array of ancestor paths, starting with /
 */
export function getAncestors(path: string): string[] {
  const normalized = normalizePath(path);
  const parts = normalized.split('/').filter(Boolean);
  const ancestors: string[] = ['/'];

  for (let i = 0; i < parts.length; i++) {
    ancestors.push('/' + parts.slice(0, i + 1).join('/'));
  }

  return ancestors;
}
