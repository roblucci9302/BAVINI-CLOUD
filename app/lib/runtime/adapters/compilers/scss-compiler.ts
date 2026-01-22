/**
 * =============================================================================
 * BAVINI CLOUD - SCSS/SASS Compiler
 * =============================================================================
 * FIX 3.3: Browser-based SCSS/SASS compiler using sass.js (dart-sass for browser).
 * Compiles SCSS/SASS to CSS directly in the browser.
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';
import type { FrameworkCompiler, CompilationResult, CSSMetadata } from './compiler-registry';

const logger = createScopedLogger('SCSSCompiler');

/**
 * CDN URL for sass.js (browser version of dart-sass)
 * Using a stable version for consistency
 */
const SASS_JS_CDN = 'https://cdn.jsdelivr.net/npm/sass.js@0.11.1/dist/sass.sync.min.js';

/**
 * Global sass.js interface (loaded from CDN)
 */
interface SassJS {
  compile(
    source: string,
    options?: {
      style?: 'expanded' | 'compressed';
      indentType?: 'space' | 'tab';
      indentWidth?: number;
    },
    callback?: (result: SassResult) => void
  ): void;
  compileSync?(
    source: string,
    options?: {
      style?: 'expanded' | 'compressed';
    }
  ): SassResult;
}

interface SassResult {
  status: number;
  text: string;
  formatted?: string;
  message?: string;
  line?: number;
  column?: number;
  file?: string;
}

/**
 * SCSS/SASS Compiler for browser environment
 */
export class SCSSCompiler implements FrameworkCompiler {
  readonly name = 'SCSS';
  readonly extensions = ['scss', 'sass'];

  private _initialized = false;
  private _sass: SassJS | null = null;
  private _initPromise: Promise<void> | null = null;

  /**
   * Check if this compiler can handle a given file
   */
  canHandle(filename: string): boolean {
    return filename.endsWith('.scss') || filename.endsWith('.sass');
  }

  /**
   * Initialize the compiler by loading sass.js from CDN
   */
  async init(): Promise<void> {
    if (this._initialized) {
      return;
    }

    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = this._doInit();
    return this._initPromise;
  }

  private async _doInit(): Promise<void> {
    logger.info('Initializing SCSS compiler...');

    try {
      // Check if Sass is already loaded globally
      if ((globalThis as unknown as { Sass?: SassJS }).Sass) {
        this._sass = (globalThis as unknown as { Sass: SassJS }).Sass;
        this._initialized = true;
        logger.info('SCSS compiler initialized (using existing global Sass)');
        return;
      }

      // Load sass.js from CDN
      await this._loadSassFromCDN();

      if (!(globalThis as unknown as { Sass?: SassJS }).Sass) {
        throw new Error('Sass.js failed to load - global Sass not found');
      }

      this._sass = (globalThis as unknown as { Sass: SassJS }).Sass;
      this._initialized = true;
      logger.info('SCSS compiler initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize SCSS compiler:', error);
      this._initPromise = null;
      throw error;
    }
  }

  /**
   * Load sass.js from CDN by injecting a script tag
   */
  private async _loadSassFromCDN(): Promise<void> {
    return new Promise((resolve, reject) => {
      // Check if already loading or loaded
      const existingScript = document.querySelector(`script[src="${SASS_JS_CDN}"]`);
      if (existingScript) {
        // Wait for it to load if still loading
        if ((globalThis as unknown as { Sass?: SassJS }).Sass) {
          resolve();
          return;
        }
        existingScript.addEventListener('load', () => resolve());
        existingScript.addEventListener('error', () => reject(new Error('Failed to load sass.js from CDN')));
        return;
      }

      const script = document.createElement('script');
      script.src = SASS_JS_CDN;
      script.async = true;

      const timeout = setTimeout(() => {
        reject(new Error('Timeout loading sass.js from CDN'));
      }, 30000);

      script.onload = () => {
        clearTimeout(timeout);
        logger.debug('sass.js loaded from CDN');
        resolve();
      };

      script.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('Failed to load sass.js from CDN'));
      };

      document.head.appendChild(script);
    });
  }

  /**
   * Compile SCSS/SASS source to CSS
   */
  async compile(source: string, filename: string): Promise<CompilationResult> {
    if (!this._initialized || !this._sass) {
      await this.init();
    }

    if (!this._sass) {
      throw new Error('SCSS compiler not initialized');
    }

    const isSass = filename.endsWith('.sass');
    const startTime = performance.now();

    logger.debug(`Compiling ${filename} (${isSass ? 'SASS' : 'SCSS'} syntax)...`);

    return new Promise((resolve) => {
      try {
        // Use callback-based API for sass.js
        this._sass!.compile(
          source,
          {
            style: 'expanded',
            indentType: 'space',
            indentWidth: 2,
          },
          (result: SassResult) => {
            const compileTime = (performance.now() - startTime).toFixed(0);

            if (result.status !== 0) {
              // Compilation error
              const errorMessage = result.message || result.formatted || 'Unknown SCSS compilation error';
              logger.error(`SCSS compilation failed for ${filename}:`, errorMessage);

              resolve({
                code: '',
                css: '',
                warnings: [`SCSS Error in ${filename}: ${errorMessage}`],
                cssMetadata: {
                  type: 'component',
                },
              });
              return;
            }

            logger.debug(`Compiled ${filename} in ${compileTime}ms (${result.text.length} chars)`);

            // Create CSS metadata
            const cssMetadata: CSSMetadata = {
              type: 'component',
            };

            resolve({
              code: '', // SCSS doesn't produce JS
              css: result.text,
              warnings: [],
              cssMetadata,
            });
          }
        );
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        logger.error(`SCSS compilation error for ${filename}:`, errorMessage);

        resolve({
          code: '',
          css: '',
          warnings: [`SCSS Error: ${errorMessage}`],
          cssMetadata: {
            type: 'component',
          },
        });
      }
    });
  }

  /**
   * Compile SCSS synchronously (if available)
   * Falls back to empty result if sync compilation not available
   */
  compileSync(source: string, filename: string): CompilationResult {
    if (!this._initialized || !this._sass) {
      logger.warn('SCSS compiler not initialized for sync compilation');
      return {
        code: '',
        css: '',
        warnings: ['SCSS compiler not initialized'],
      };
    }

    // sass.js may have compileSync in some versions
    if (this._sass.compileSync) {
      try {
        const result = this._sass.compileSync(source, { style: 'expanded' });
        if (result.status === 0) {
          return {
            code: '',
            css: result.text,
            cssMetadata: { type: 'component' },
          };
        }
        return {
          code: '',
          css: '',
          warnings: [result.message || 'SCSS compilation failed'],
        };
      } catch (error) {
        return {
          code: '',
          css: '',
          warnings: [`SCSS sync compilation error: ${error}`],
        };
      }
    }

    logger.warn('Sync compilation not available for SCSS');
    return {
      code: '',
      css: '',
      warnings: ['SCSS sync compilation not available - use async compile()'],
    };
  }
}

/**
 * Factory function to create SCSS compiler instance
 */
export function createSCSSCompiler(): SCSSCompiler {
  return new SCSSCompiler();
}
