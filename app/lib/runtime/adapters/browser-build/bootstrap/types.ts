/**
 * =============================================================================
 * BAVINI CLOUD - Bootstrap Types
 * =============================================================================
 * Type definitions for framework bootstrap modules.
 * =============================================================================
 */

import type { FrameworkType } from '../../compilers/compiler-registry';

/**
 * Route definition for client-side routing
 */
export interface RouteDefinition {
  path: string;
  component: string;
}

/**
 * Bootstrap context providing access to build state
 */
export interface BootstrapContext {
  /** Virtual file system (path -> content) */
  files: Map<string, string>;

  /** Detected framework type */
  framework: FrameworkType;

  /** Find a file with extension resolution */
  findFile: (path: string) => string | null;

  /** Check if content is a mounting entry (already has render call) */
  isMountingEntry: (content: string) => boolean;

  /** Detect routes from file structure */
  detectRoutes: (filesList: string[], files: Map<string, string>) => RouteDefinition[];

  /** Logger instance */
  logger: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Bootstrap generator function type
 */
export type BootstrapGenerator = (
  entryPath: string,
  context: BootstrapContext
) => string;

/**
 * Mounting patterns for different frameworks
 */
export const MOUNTING_PATTERNS = {
  react: [
    /ReactDOM\.render\s*\(/,
    /ReactDOM\.createRoot\s*\(/,
    /createRoot\s*\([^)]*\)\.render/,
    /\.render\s*\(\s*<.*>/,
  ],
  vue: [
    /createApp\s*\(/,
    /\.mount\s*\(/,
  ],
  svelte: [
    /new\s+\w+\s*\(\s*\{[^}]*target:/,
  ],
  preact: [
    /render\s*\(/,
    /hydrate\s*\(/,
  ],
} as const;

/**
 * Check if content is a mounting entry file for a framework
 */
export function isMountingEntryFile(content: string, framework?: FrameworkType): boolean {
  // React patterns (also used by Next.js)
  const reactPatterns = MOUNTING_PATTERNS.react;
  if (!framework || framework === 'react' || framework === 'nextjs') {
    if (reactPatterns.some(pattern => pattern.test(content))) {
      return true;
    }
  }

  // Vue patterns
  if (!framework || framework === 'vue') {
    if (content.includes('createApp') && content.includes('.mount(')) {
      return true;
    }
  }

  // Svelte patterns
  if (!framework || framework === 'svelte') {
    if (content.includes('new ') && content.includes('target:')) {
      return true;
    }
  }

  // Preact patterns
  if (!framework || framework === 'preact') {
    if (content.includes('render(') && content.includes('preact')) {
      return true;
    }
  }

  return false;
}
