/**
 * =============================================================================
 * BAVINI CLOUD - PostCSS/Lightning CSS Processor
 * =============================================================================
 * Browser-side CSS processing using lightningcss-wasm.
 *
 * Features:
 * - Autoprefixing (vendor prefixes)
 * - CSS minification
 * - Modern CSS syntax transformation
 * - Nesting support (CSS Nesting spec)
 * - Custom media queries
 *
 * Uses lightningcss-wasm for fast, Rust-powered CSS processing in the browser.
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('PostCSSProcessor');

/**
 * Browser targets for autoprefixing
 * Corresponds to browserslist: "> 1%, last 2 versions, not dead"
 */
const DEFAULT_BROWSER_TARGETS = {
  chrome: 95 << 16, // Chrome 95+
  firefox: 90 << 16, // Firefox 90+
  safari: 14 << 16, // Safari 14+
  edge: 95 << 16, // Edge 95+
  ios_saf: 14 << 16, // iOS Safari 14+
  android: 95 << 16, // Android Chrome 95+
};

/**
 * PostCSS processor configuration
 */
export interface PostCSSConfig {
  /** Enable autoprefixing */
  autoprefixer?: boolean;
  /** Enable minification */
  minify?: boolean;
  /** Enable CSS nesting transformation */
  nesting?: boolean;
  /** Enable custom media queries */
  customMedia?: boolean;
  /** Source map generation */
  sourceMap?: boolean;
  /** Custom browser targets */
  targets?: Record<string, number>;
}

/**
 * PostCSS processing result
 */
export interface PostCSSResult {
  /** Processed CSS */
  css: string;
  /** Source map (if enabled) */
  map?: string;
  /** Processing warnings */
  warnings: string[];
  /** Processing time in ms */
  processingTime: number;
}

/**
 * Lightningcss module interface
 */
interface LightningCSS {
  transform: (options: {
    filename: string;
    code: Uint8Array;
    minify?: boolean;
    sourceMap?: boolean;
    targets?: Record<string, number>;
    drafts?: {
      nesting?: boolean;
      customMedia?: boolean;
    };
  }) => {
    code: Uint8Array;
    map?: Uint8Array;
    warnings: Array<{ message: string }>;
  };
}

/**
 * Cached lightningcss module
 */
let lightningcssModule: LightningCSS | null = null;
let loadingPromise: Promise<LightningCSS | null> | null = null;

/**
 * Load lightningcss-wasm module from CDN
 */
async function loadLightningCSS(): Promise<LightningCSS | null> {
  if (lightningcssModule) {
    return lightningcssModule;
  }

  if (loadingPromise) {
    return loadingPromise;
  }

  loadingPromise = (async () => {
    try {
      logger.info('Loading lightningcss-wasm from CDN...');

      // Load lightningcss from esm.sh CDN
      const module = await import(
        /* webpackIgnore: true */
        // @ts-expect-error - Dynamic import from CDN URL, TypeScript cannot resolve
        'https://esm.sh/lightningcss-wasm@1.27.0?bundle'
      );

      // Initialize WASM if needed
      if (module.default && typeof module.default === 'function') {
        await module.default();
      }

      lightningcssModule = module as LightningCSS;
      logger.info('lightningcss-wasm loaded successfully');

      return lightningcssModule;
    } catch (error) {
      logger.warn('Failed to load lightningcss-wasm, CSS processing will be skipped:', error);
      return null;
    }
  })();

  return loadingPromise;
}

/**
 * PostCSS Processor class
 *
 * Provides browser-side CSS processing using lightningcss-wasm.
 *
 * @example
 * ```typescript
 * const processor = new PostCSSProcessor({
 *   autoprefixer: true,
 *   minify: true,
 *   nesting: true,
 * });
 *
 * await processor.init();
 *
 * const result = await processor.process(`
 *   .foo {
 *     display: flex;
 *     & .bar {
 *       color: red;
 *     }
 *   }
 * `, 'styles.css');
 *
 * console.log(result.css);
 * // Output: .foo{display:flex}.foo .bar{color:red}
 * ```
 */
export class PostCSSProcessor {
  private config: Required<PostCSSConfig>;
  private initialized = false;
  private lightningcss: LightningCSS | null = null;

  constructor(config: PostCSSConfig = {}) {
    this.config = {
      autoprefixer: config.autoprefixer ?? true,
      minify: config.minify ?? false,
      nesting: config.nesting ?? true,
      customMedia: config.customMedia ?? true,
      sourceMap: config.sourceMap ?? false,
      targets: config.targets ?? DEFAULT_BROWSER_TARGETS,
    };
  }

  /**
   * Initialize the processor (loads WASM module)
   */
  async init(): Promise<boolean> {
    if (this.initialized) {
      return this.lightningcss !== null;
    }

    this.lightningcss = await loadLightningCSS();
    this.initialized = true;

    return this.lightningcss !== null;
  }

  /**
   * Check if processor is ready
   */
  isReady(): boolean {
    return this.initialized && this.lightningcss !== null;
  }

  /**
   * Process CSS content
   *
   * @param css - CSS content to process
   * @param filename - Source filename (for source maps and errors)
   * @returns Processing result
   */
  async process(css: string, filename: string = 'styles.css'): Promise<PostCSSResult> {
    const startTime = performance.now();

    // Ensure initialized
    if (!this.initialized) {
      await this.init();
    }

    // If lightningcss failed to load, return CSS unchanged
    if (!this.lightningcss) {
      logger.debug('lightningcss not available, returning CSS unchanged');
      return {
        css,
        warnings: ['lightningcss-wasm not available, CSS returned unchanged'],
        processingTime: performance.now() - startTime,
      };
    }

    try {
      // Encode CSS to Uint8Array
      const encoder = new TextEncoder();
      const code = encoder.encode(css);

      // Process with lightningcss
      const result = this.lightningcss.transform({
        filename,
        code,
        minify: this.config.minify,
        sourceMap: this.config.sourceMap,
        targets: this.config.autoprefixer ? this.config.targets : undefined,
        drafts: {
          nesting: this.config.nesting,
          customMedia: this.config.customMedia,
        },
      });

      // Decode result
      const decoder = new TextDecoder();
      const processedCSS = decoder.decode(result.code);
      const sourceMap = result.map ? decoder.decode(result.map) : undefined;

      const processingTime = performance.now() - startTime;

      logger.debug(
        `Processed CSS: ${css.length} → ${processedCSS.length} chars (${processingTime.toFixed(1)}ms)`,
      );

      return {
        css: processedCSS,
        map: sourceMap,
        warnings: result.warnings.map((w) => w.message),
        processingTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('CSS processing failed:', errorMessage);

      // Return original CSS on error
      return {
        css,
        warnings: [`CSS processing failed: ${errorMessage}`],
        processingTime: performance.now() - startTime,
      };
    }
  }

  /**
   * Process multiple CSS files
   *
   * @param files - Map of filename to CSS content
   * @returns Map of filename to processing result
   */
  async processMultiple(files: Map<string, string>): Promise<Map<string, PostCSSResult>> {
    const results = new Map<string, PostCSSResult>();

    // Process in parallel for better performance
    const entries = Array.from(files.entries());
    const processedEntries = await Promise.all(
      entries.map(async ([filename, css]) => {
        const result = await this.process(css, filename);
        return [filename, result] as const;
      }),
    );

    for (const [filename, result] of processedEntries) {
      results.set(filename, result);
    }

    return results;
  }

  /**
   * Update configuration
   */
  updateConfig(config: Partial<PostCSSConfig>): void {
    this.config = {
      ...this.config,
      ...config,
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<Required<PostCSSConfig>> {
    return { ...this.config };
  }
}

/**
 * Create a new PostCSS processor instance
 */
export function createPostCSSProcessor(config?: PostCSSConfig): PostCSSProcessor {
  return new PostCSSProcessor(config);
}

/**
 * Singleton processor instance for convenience
 */
let defaultProcessor: PostCSSProcessor | null = null;

/**
 * Get or create the default PostCSS processor
 */
export async function getDefaultPostCSSProcessor(): Promise<PostCSSProcessor> {
  if (!defaultProcessor) {
    defaultProcessor = new PostCSSProcessor();
    await defaultProcessor.init();
  }
  return defaultProcessor;
}

/**
 * Simple CSS processing function for one-off use
 *
 * @param css - CSS content to process
 * @param filename - Source filename
 * @param config - Processing configuration
 * @returns Processed CSS
 */
export async function processCSS(
  css: string,
  filename?: string,
  config?: PostCSSConfig,
): Promise<string> {
  const processor = config ? new PostCSSProcessor(config) : await getDefaultPostCSSProcessor();

  if (config) {
    await processor.init();
  }

  const result = await processor.process(css, filename);
  return result.css;
}
