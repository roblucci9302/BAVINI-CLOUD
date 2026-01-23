/**
 * =============================================================================
 * BAVINI CLOUD - Plugin Types
 * =============================================================================
 * Type definitions for esbuild plugins in the browser build system.
 * =============================================================================
 */

import type * as esbuild from 'esbuild-wasm';
import type { CSSAggregator, CSSType } from '../../css-aggregator';

/**
 * Plugin context providing access to build state
 */
export interface PluginContext {
  /** Virtual file system (path -> content) */
  files: Map<string, string>;

  /** CSS aggregator for collecting styles */
  cssAggregator: CSSAggregator;

  /** Find a file with extension resolution */
  findFile: (path: string) => string | null;

  /** Resolve a relative path against a base */
  resolveRelativePath: (base: string, relative: string) => string;

  /** Get esbuild loader for a file path */
  getLoader: (path: string) => esbuild.Loader;

  /** Next.js shim code map */
  nextjsShims: Record<string, string>;

  /** Module cache for CDN responses */
  moduleCache: {
    has: (key: string) => boolean;
    get: (key: string) => string | undefined;
    set: (key: string, value: string) => void;
  };

  /** Logger instance */
  logger: {
    debug: (...args: unknown[]) => void;
    info: (...args: unknown[]) => void;
    warn: (...args: unknown[]) => void;
    error: (...args: unknown[]) => void;
  };
}

/**
 * Plugin factory function type
 */
export type PluginFactory = (context: PluginContext) => esbuild.Plugin;

/**
 * CSS metadata for aggregation
 */
export interface CSSResult {
  source: string;
  css: string;
  type: CSSType;
  scopeId?: string;
}

/**
 * Compiler result from framework compilers
 */
export interface CompilerResult {
  code: string;
  css?: string;
  cssMetadata?: {
    type?: 'component' | 'tailwind';
    scopeId?: string;
  };
  warnings?: string[];
}

/**
 * Content file for Tailwind class extraction
 */
export interface ContentFile {
  path: string;
  content: string;
}
