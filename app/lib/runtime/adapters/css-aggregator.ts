/**
 * =============================================================================
 * BAVINI CLOUD - CSS Aggregator
 * =============================================================================
 * Centralized CSS collection and aggregation system.
 * Collects CSS from all compilers (Vue, Svelte, Astro, Tailwind) and produces
 * a single deduplicated, ordered CSS output.
 *
 * Features:
 * - Deduplication by source file
 * - Deterministic ordering (base → tailwind → components)
 * - Single <style> tag output
 * - Optional PostCSS processing (autoprefixing, minification, nesting)
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';
import {
  PostCSSProcessor,
  createPostCSSProcessor,
  type PostCSSConfig,
} from './css/postcss-processor';

const logger = createScopedLogger('CSSAggregator');

/**
 * CSS entry type for ordering
 */
export type CSSType = 'base' | 'tailwind' | 'component';

/**
 * CSS entry representing a single CSS contribution
 */
export interface CSSEntry {
  /** Source file path */
  source: string;
  /** CSS content */
  css: string;
  /** Type for ordering */
  type: CSSType;
  /** Scope ID for Vue/Svelte scoped styles */
  scopeId?: string;
  /** Import order (for deterministic ordering within same type) */
  order: number;
}

/**
 * CSS metadata returned by compilers
 */
export interface CSSMetadata {
  /** Type of CSS (component styles or tailwind utilities) */
  type: 'component' | 'tailwind';
  /** Scope ID for Vue scoped styles */
  scopeId?: string;
}

/**
 * Type ordering priority (lower = earlier in output)
 */
const TYPE_PRIORITY: Record<CSSType, number> = {
  base: 0,
  tailwind: 1,
  component: 2,
};

/**
 * CSSAggregator - Collects and aggregates CSS from multiple sources
 *
 * Usage:
 * ```typescript
 * const aggregator = new CSSAggregator();
 *
 * // Add CSS from compilers
 * aggregator.addCSS({ source: '/App.vue', css: '...', type: 'component', order: 1 });
 * aggregator.addCSS({ source: '/globals.css', css: '...', type: 'tailwind', order: 0 });
 *
 * // Get aggregated CSS
 * const finalCSS = aggregator.aggregate();
 * ```
 */
export class CSSAggregator {
  /** CSS entries indexed by source path */
  private _entries: Map<string, CSSEntry> = new Map();

  /** Counter for tracking import order */
  private _orderCounter = 0;

  /**
   * Add or update CSS entry
   *
   * If an entry with the same source already exists, it will be replaced.
   * This prevents duplicate CSS from the same file.
   *
   * @param entry - CSS entry to add
   */
  addCSS(entry: Omit<CSSEntry, 'order'> & { order?: number }): void {
    const normalizedSource = this.normalizeSource(entry.source);

    // Check if CSS is empty or whitespace only
    if (!entry.css || entry.css.trim().length === 0) {
      logger.debug(`Skipping empty CSS from: ${normalizedSource}`);
      return;
    }

    const existingEntry = this._entries.get(normalizedSource);

    // Determine order: use provided order, existing order, or increment counter
    const order = entry.order ?? existingEntry?.order ?? this._orderCounter++;

    const newEntry: CSSEntry = {
      source: normalizedSource,
      css: entry.css,
      type: entry.type,
      scopeId: entry.scopeId,
      order,
    };

    if (existingEntry) {
      logger.debug(`Updating CSS entry: ${normalizedSource} (${entry.type})`);
    } else {
      logger.debug(`Adding CSS entry: ${normalizedSource} (${entry.type}, order: ${order})`);
    }

    this._entries.set(normalizedSource, newEntry);
  }

  /**
   * Remove CSS entry by source path
   *
   * @param source - Source file path
   * @returns true if entry was removed, false if not found
   */
  removeCSS(source: string): boolean {
    const normalizedSource = this.normalizeSource(source);
    const existed = this._entries.has(normalizedSource);

    if (existed) {
      this._entries.delete(normalizedSource);
      logger.debug(`Removed CSS entry: ${normalizedSource}`);
    }

    return existed;
  }

  /**
   * Check if CSS entry exists for source
   *
   * @param source - Source file path
   * @returns true if entry exists
   */
  hasCSS(source: string): boolean {
    return this._entries.has(this.normalizeSource(source));
  }

  /**
   * Get CSS entry by source
   *
   * @param source - Source file path
   * @returns CSS entry or undefined
   */
  getCSS(source: string): CSSEntry | undefined {
    return this._entries.get(this.normalizeSource(source));
  }

  /**
   * Clear all CSS entries
   */
  clear(): void {
    const count = this._entries.size;
    this._entries.clear();
    this._orderCounter = 0;
    logger.debug(`Cleared ${count} CSS entries`);
  }

  /**
   * Get the number of CSS entries
   */
  get size(): number {
    return this._entries.size;
  }

  /**
   * Get all source paths
   */
  get sources(): string[] {
    return Array.from(this._entries.keys());
  }

  /**
   * Aggregate all CSS into a single string
   *
   * Ordering:
   * 1. Base styles (resets, variables)
   * 2. Tailwind utilities
   * 3. Component styles (in import order)
   *
   * @returns Aggregated CSS string
   */
  aggregate(): string {
    if (this._entries.size === 0) {
      return '';
    }

    // Convert to array and sort
    const entries = Array.from(this._entries.values());

    entries.sort((a, b) => {
      // First sort by type priority
      const typeDiff = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];

      if (typeDiff !== 0) {
        return typeDiff;
      }

      // Then by import order (for deterministic output)
      return a.order - b.order;
    });

    // Build output with source comments for debugging
    const parts: string[] = [];

    for (const entry of entries) {
      const scopeComment = entry.scopeId ? ` [${entry.scopeId}]` : '';
      parts.push(`/* Source: ${entry.source}${scopeComment} */`);
      parts.push(entry.css);
      parts.push(''); // Empty line between entries
    }

    const aggregated = parts.join('\n');

    logger.info(`Aggregated ${entries.length} CSS entries (${aggregated.length} chars)`);

    return aggregated;
  }

  /**
   * Aggregate CSS into grouped sections
   *
   * @returns Object with CSS grouped by type
   */
  aggregateGrouped(): { base: string; tailwind: string; components: string } {
    const groups: { base: string[]; tailwind: string[]; components: string[] } = {
      base: [],
      tailwind: [],
      components: [],
    };

    const entries = Array.from(this._entries.values());

    entries.sort((a, b) => a.order - b.order);

    for (const entry of entries) {
      switch (entry.type) {
        case 'base':
          groups.base.push(entry.css);
          break;
        case 'tailwind':
          groups.tailwind.push(entry.css);
          break;
        case 'component':
          groups.components.push(entry.css);
          break;
      }
    }

    return {
      base: groups.base.join('\n\n'),
      tailwind: groups.tailwind.join('\n\n'),
      components: groups.components.join('\n\n'),
    };
  }

  /**
   * Normalize source path for consistent keying
   *
   * @param source - Source file path
   * @returns Normalized path
   */
  private normalizeSource(source: string): string {
    // Ensure leading slash
    let normalized = source.startsWith('/') ? source : '/' + source;

    // Remove query strings (e.g., ?scoped=true)
    const queryIndex = normalized.indexOf('?');

    if (queryIndex !== -1) {
      normalized = normalized.slice(0, queryIndex);
    }

    // Lowercase for consistency
    return normalized.toLowerCase();
  }

  // ==========================================================================
  // PostCSS Processing
  // ==========================================================================

  /** PostCSS processor instance */
  private _postcssProcessor: PostCSSProcessor | null = null;

  /** PostCSS configuration */
  private _postcssConfig: PostCSSConfig | null = null;

  /**
   * Enable PostCSS processing
   *
   * @param config - PostCSS configuration options
   */
  enablePostCSS(config: PostCSSConfig = {}): void {
    this._postcssConfig = config;
    this._postcssProcessor = createPostCSSProcessor(config);
    logger.info('PostCSS processing enabled', config);
  }

  /**
   * Disable PostCSS processing
   */
  disablePostCSS(): void {
    this._postcssConfig = null;
    this._postcssProcessor = null;
    logger.info('PostCSS processing disabled');
  }

  /**
   * Check if PostCSS processing is enabled
   */
  isPostCSSEnabled(): boolean {
    return this._postcssProcessor !== null;
  }

  /**
   * Initialize PostCSS processor (loads WASM module)
   * Call this before using aggregateWithPostCSS()
   */
  async initPostCSS(): Promise<boolean> {
    if (!this._postcssProcessor) {
      this.enablePostCSS();
    }

    if (this._postcssProcessor) {
      return await this._postcssProcessor.init();
    }

    return false;
  }

  /**
   * Aggregate all CSS with PostCSS processing
   *
   * This method:
   * 1. Aggregates all CSS entries (like aggregate())
   * 2. Processes the result through PostCSS (autoprefixing, minification, etc.)
   *
   * @returns Processed CSS string
   */
  async aggregateWithPostCSS(): Promise<string> {
    // First, get aggregated CSS
    const aggregatedCSS = this.aggregate();

    if (!aggregatedCSS) {
      return '';
    }

    // If PostCSS not enabled, return as-is
    if (!this._postcssProcessor) {
      return aggregatedCSS;
    }

    // Initialize if needed
    if (!this._postcssProcessor.isReady()) {
      await this._postcssProcessor.init();
    }

    // Process through PostCSS
    const result = await this._postcssProcessor.process(aggregatedCSS, 'aggregated.css');

    if (result.warnings.length > 0) {
      for (const warning of result.warnings) {
        logger.warn('PostCSS warning:', warning);
      }
    }

    logger.info(
      `PostCSS processed: ${aggregatedCSS.length} → ${result.css.length} chars (${result.processingTime.toFixed(1)}ms)`,
    );

    return result.css;
  }

  /**
   * Get the PostCSS processor instance (for advanced use)
   */
  getPostCSSProcessor(): PostCSSProcessor | null {
    return this._postcssProcessor;
  }
}

/**
 * Create a new CSS aggregator instance
 */
export function createCSSAggregator(): CSSAggregator {
  return new CSSAggregator();
}
