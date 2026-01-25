/**
 * =============================================================================
 * BAVINI CLOUD - Astro Compiler Types
 * =============================================================================
 * Type definitions for @astrojs/compiler (loaded dynamically).
 *
 * @module lib/runtime/adapters/compilers/astro/types
 * =============================================================================
 */

/**
 * Astro compiler module interface (loaded from CDN)
 */
export interface AstroCompilerModule {
  transform: (source: string, options?: AstroTransformOptions) => Promise<AstroTransformResult>;
  parse: (source: string) => Promise<AstroParseResult>;
  initialize: (options?: { wasmURL?: string }) => Promise<void>;
}

/**
 * Options for Astro transform function
 */
export interface AstroTransformOptions {
  filename?: string;
  sourcemap?: boolean | 'inline' | 'external';
  internalURL?: string;
  site?: string;
  projectRoot?: string;
  resultScopedSlot?: boolean;
  compact?: boolean;
}

/**
 * Result of Astro transform function
 */
export interface AstroTransformResult {
  code: string;
  map?: string;
  diagnostics: AstroDiagnostic[];
}

/**
 * Astro diagnostic message
 */
export interface AstroDiagnostic {
  code: number;
  text: string;
  severity: 1 | 2; // 1 = error, 2 = warning
  location?: {
    file: string;
    line: number;
    column: number;
  };
}

/**
 * Result of Astro parse function
 */
export interface AstroParseResult {
  ast: unknown;
  diagnostics: AstroDiagnostic[];
}
