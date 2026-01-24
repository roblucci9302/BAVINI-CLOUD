/**
 * =============================================================================
 * BAVINI Container - Path Module
 * =============================================================================
 * Node.js path module implementation (POSIX-style).
 * =============================================================================
 */

/**
 * Path separator
 */
export const sep = '/';

/**
 * Path delimiter (for PATH environment variable)
 */
export const delimiter = ':';

/**
 * Normalize a path
 */
export function normalize(path: string): string {
  if (path.length === 0) return '.';

  const isAbsolute = path.charCodeAt(0) === 47; // '/'
  const trailingSlash = path.charCodeAt(path.length - 1) === 47;

  // Normalize the path
  const segments = path.split('/');
  const result: string[] = [];

  for (const segment of segments) {
    if (segment === '.' || segment === '') {
      continue;
    }

    if (segment === '..') {
      if (result.length > 0 && result[result.length - 1] !== '..') {
        result.pop();
      } else if (!isAbsolute) {
        result.push('..');
      }
    } else {
      result.push(segment);
    }
  }

  let normalized = result.join('/');

  if (isAbsolute) {
    normalized = '/' + normalized;
  }

  if (trailingSlash && normalized.length > 1) {
    normalized += '/';
  }

  return normalized || '.';
}

/**
 * Join path segments
 */
export function join(...paths: string[]): string {
  if (paths.length === 0) return '.';

  let joined = '';

  for (const path of paths) {
    if (path.length > 0) {
      if (joined.length === 0) {
        joined = path;
      } else {
        joined += '/' + path;
      }
    }
  }

  return normalize(joined);
}

/**
 * Resolve path segments to an absolute path
 */
export function resolve(...paths: string[]): string {
  let resolvedPath = '';
  let resolvedAbsolute = false;

  for (let i = paths.length - 1; i >= -1 && !resolvedAbsolute; i--) {
    const path = i >= 0 ? paths[i] : '/';

    if (path.length === 0) continue;

    resolvedPath = path + '/' + resolvedPath;
    resolvedAbsolute = path.charCodeAt(0) === 47;
  }

  // Normalize the path
  resolvedPath = normalize(resolvedPath);

  // Remove trailing slash (except for root)
  if (resolvedPath.length > 1 && resolvedPath.endsWith('/')) {
    resolvedPath = resolvedPath.slice(0, -1);
  }

  if (resolvedAbsolute) {
    const result = '/' + resolvedPath.replace(/^\//, '');
    // Remove trailing slash from result (except for root "/")
    return result.length > 1 && result.endsWith('/') ? result.slice(0, -1) : result;
  }

  return resolvedPath.length > 0 ? resolvedPath : '.';
}

/**
 * Check if path is absolute
 */
export function isAbsolute(path: string): boolean {
  return path.length > 0 && path.charCodeAt(0) === 47;
}

/**
 * Get relative path from 'from' to 'to'
 */
export function relative(from: string, to: string): string {
  from = resolve(from);
  to = resolve(to);

  if (from === to) return '';

  const fromParts = from.split('/').filter(Boolean);
  const toParts = to.split('/').filter(Boolean);

  // Find common ancestor
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
  const downParts = toParts.slice(commonLength);

  const relativeParts: string[] = [];

  for (let i = 0; i < upCount; i++) {
    relativeParts.push('..');
  }

  relativeParts.push(...downParts);

  return relativeParts.join('/');
}

/**
 * Get directory name
 */
export function dirname(path: string): string {
  if (path.length === 0) return '.';

  const hasRoot = path.charCodeAt(0) === 47;
  let end = -1;
  let matchedSlash = true;

  for (let i = path.length - 1; i >= 1; i--) {
    if (path.charCodeAt(i) === 47) {
      if (!matchedSlash) {
        end = i;
        break;
      }
    } else {
      matchedSlash = false;
    }
  }

  if (end === -1) {
    return hasRoot ? '/' : '.';
  }

  if (hasRoot && end === 1) {
    return '/';
  }

  return path.slice(0, end);
}

/**
 * Get base name
 */
export function basename(path: string, ext?: string): string {
  if (path.length === 0) return '';

  let start = 0;
  let end = path.length;

  // Find start (after last /)
  for (let i = path.length - 1; i >= 0; i--) {
    if (path.charCodeAt(i) === 47) {
      start = i + 1;
      break;
    }
  }

  // Remove trailing slashes
  while (end > start && path.charCodeAt(end - 1) === 47) {
    end--;
  }

  let base = path.slice(start, end);

  // Remove extension if provided
  if (ext && base.endsWith(ext)) {
    base = base.slice(0, base.length - ext.length);
  }

  return base;
}

/**
 * Get file extension
 */
export function extname(path: string): string {
  let startDot = -1;
  let startPart = 0;
  let end = -1;
  let matchedSlash = true;
  let preDotState = 0;

  for (let i = path.length - 1; i >= 0; i--) {
    const code = path.charCodeAt(i);

    if (code === 47) {
      if (!matchedSlash) {
        startPart = i + 1;
        break;
      }

      continue;
    }

    if (end === -1) {
      matchedSlash = false;
      end = i + 1;
    }

    if (code === 46) {
      if (startDot === -1) {
        startDot = i;
      } else if (preDotState !== 1) {
        preDotState = 1;
      }
    } else if (startDot !== -1) {
      preDotState = -1;
    }
  }

  if (
    startDot === -1 ||
    end === -1 ||
    preDotState === 0 ||
    (preDotState === 1 && startDot === end - 1 && startDot === startPart + 1)
  ) {
    return '';
  }

  return path.slice(startDot, end);
}

/**
 * Parse path into components
 */
export interface ParsedPath {
  root: string;
  dir: string;
  base: string;
  ext: string;
  name: string;
}

export function parse(path: string): ParsedPath {
  const ret: ParsedPath = { root: '', dir: '', base: '', ext: '', name: '' };

  if (path.length === 0) return ret;

  const isAbsolutePath = path.charCodeAt(0) === 47;

  if (isAbsolutePath) {
    ret.root = '/';
  }

  let start = isAbsolutePath ? 1 : 0;
  let end = path.length;

  // Remove trailing slashes
  while (end > start && path.charCodeAt(end - 1) === 47) {
    end--;
  }

  // Find last slash
  let lastSlash = -1;

  for (let i = end - 1; i >= start; i--) {
    if (path.charCodeAt(i) === 47) {
      lastSlash = i;
      break;
    }
  }

  if (lastSlash === -1) {
    ret.base = path.slice(start, end);
    ret.dir = isAbsolutePath ? '/' : '';
  } else {
    ret.dir = path.slice(0, lastSlash);
    ret.base = path.slice(lastSlash + 1, end);
  }

  ret.ext = extname(ret.base);
  ret.name = ret.ext ? ret.base.slice(0, ret.base.length - ret.ext.length) : ret.base;

  return ret;
}

/**
 * Format path from components
 */
export function format(pathObject: Partial<ParsedPath>): string {
  const dir = pathObject.dir || pathObject.root || '';
  const base = pathObject.base || (pathObject.name || '') + (pathObject.ext || '');

  if (!dir) {
    return base;
  }

  if (dir === pathObject.root) {
    return dir + base;
  }

  return dir + '/' + base;
}

/**
 * Convert path to namespaced path (no-op on POSIX)
 */
export function toNamespacedPath(path: string): string {
  return path;
}

/**
 * POSIX-specific implementations (same as default for Unix)
 */
export const posix = {
  sep,
  delimiter,
  normalize,
  join,
  resolve,
  isAbsolute,
  relative,
  dirname,
  basename,
  extname,
  parse,
  format,
  toNamespacedPath,
};

/**
 * Windows-specific implementations (simplified, uses POSIX internally)
 */
export const win32 = {
  sep: '\\',
  delimiter: ';',
  normalize: (path: string) => normalize(path.replace(/\\/g, '/')),
  join: (...paths: string[]) => join(...paths.map((p) => p.replace(/\\/g, '/'))),
  resolve: (...paths: string[]) => resolve(...paths.map((p) => p.replace(/\\/g, '/'))),
  isAbsolute: (path: string) => isAbsolute(path.replace(/\\/g, '/')),
  relative: (from: string, to: string) => relative(from.replace(/\\/g, '/'), to.replace(/\\/g, '/')),
  dirname: (path: string) => dirname(path.replace(/\\/g, '/')),
  basename: (path: string, ext?: string) => basename(path.replace(/\\/g, '/'), ext),
  extname: (path: string) => extname(path.replace(/\\/g, '/')),
  parse: (path: string) => parse(path.replace(/\\/g, '/')),
  format,
  toNamespacedPath,
};

/**
 * Default export (POSIX)
 */
export default {
  sep,
  delimiter,
  normalize,
  join,
  resolve,
  isAbsolute,
  relative,
  dirname,
  basename,
  extname,
  parse,
  format,
  toNamespacedPath,
  posix,
  win32,
};
