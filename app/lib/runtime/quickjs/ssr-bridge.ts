/**
 * =============================================================================
 * BAVINI Runtime Engine - SSR Bridge
 * =============================================================================
 * Bridge between the browser-build-adapter and the QuickJS SSR engine.
 * Provides a unified API for rendering components server-side while
 * maintaining compatibility with the existing build system.
 * =============================================================================
 */

import {
  MultiFrameworkSSR,
  getSharedMultiFrameworkSSR,
  type SSRFramework,
  type MultiSSRResult,
} from './multi-framework-ssr';
import { getSharedSSRCache } from './ssr-cache';
import type { RuntimeStatus } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SSRBridge');

/**
 * SSR mode configuration
 */
export type SSRMode = 'disabled' | 'auto' | 'always';

/**
 * SSR Bridge configuration
 */
export interface SSRBridgeConfig {
  /** SSR mode */
  mode?: SSRMode;
  /** Enable caching */
  cacheEnabled?: boolean;
  /** Frameworks to enable SSR for */
  enabledFrameworks?: SSRFramework[];
}

const DEFAULT_CONFIG: Required<SSRBridgeConfig> = {
  mode: 'auto',
  cacheEnabled: true,
  enabledFrameworks: ['astro', 'vue', 'svelte', 'react'],
};

/**
 * Result of checking if SSR should be used
 */
interface SSRDecision {
  shouldSSR: boolean;
  reason: string;
  framework?: SSRFramework;
}

/**
 * SSR Bridge - Connects the build system to SSR rendering
 */
export class SSRBridge {
  private _config: Required<SSRBridgeConfig>;
  private _renderer: MultiFrameworkSSR | null = null;
  private _initPromise: Promise<void> | null = null;
  private _enabled = true;

  constructor(config: SSRBridgeConfig = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    logger.debug('SSRBridge created', this._config);
  }

  /**
   * Get the current status
   */
  get status(): RuntimeStatus {
    return this._renderer?.status || 'idle';
  }

  /**
   * Check if SSR is enabled
   */
  get isEnabled(): boolean {
    return this._enabled && this._config.mode !== 'disabled';
  }

  /**
   * Enable SSR
   */
  enable(): void {
    this._enabled = true;
    logger.info('SSR enabled');
  }

  /**
   * Disable SSR
   */
  disable(): void {
    this._enabled = false;
    logger.info('SSR disabled');
  }

  /**
   * Initialize the SSR bridge
   */
  async init(): Promise<void> {
    if (this._config.mode === 'disabled') {
      logger.info('SSR is disabled by configuration');
      return;
    }

    if (this._initPromise) {
      return this._initPromise;
    }

    this._initPromise = this._doInit();
    return this._initPromise;
  }

  private async _doInit(): Promise<void> {
    try {
      logger.info('Initializing SSR bridge...');
      this._renderer = getSharedMultiFrameworkSSR();
      await this._renderer.init();
      logger.info('SSR bridge ready');
    } catch (error) {
      logger.error('Failed to initialize SSR bridge:', error);
      // Don't throw - SSR is optional, fall back to client-side rendering
      this._enabled = false;
    }
  }

  /**
   * Decide whether to use SSR for a file
   */
  shouldUseSSR(filename: string, code?: string): SSRDecision {
    if (!this._enabled) {
      return { shouldSSR: false, reason: 'SSR disabled' };
    }

    if (this._config.mode === 'disabled') {
      return { shouldSSR: false, reason: 'SSR mode is disabled' };
    }

    // Detect framework
    const framework = this._renderer?.detectFramework(code || '', filename);

    if (!framework) {
      return { shouldSSR: false, reason: 'Could not detect framework' };
    }

    // Check if framework is enabled
    if (!this._config.enabledFrameworks.includes(framework)) {
      return {
        shouldSSR: false,
        reason: `Framework ${framework} not enabled for SSR`,
        framework,
      };
    }

    // In auto mode, only SSR certain file types
    if (this._config.mode === 'auto') {
      const ssrFileTypes = ['.astro', '.vue', '.svelte'];
      const shouldSSR = ssrFileTypes.some((ext) => filename.endsWith(ext));

      if (!shouldSSR) {
        return {
          shouldSSR: false,
          reason: `File type not eligible for auto SSR`,
          framework,
        };
      }
    }

    return {
      shouldSSR: true,
      reason: 'SSR enabled for this file',
      framework,
    };
  }

  /**
   * Render a component using SSR
   */
  async render(
    code: string,
    filename: string,
    props: Record<string, unknown> = {},
  ): Promise<MultiSSRResult | null> {
    if (!this._enabled || !this._renderer) {
      return null;
    }

    await this.init();

    const decision = this.shouldUseSSR(filename, code);
    if (!decision.shouldSSR) {
      logger.debug(`Skipping SSR for ${filename}: ${decision.reason}`);
      return null;
    }

    logger.debug(`Rendering SSR for ${filename} (${decision.framework})`);

    try {
      const result = await this._renderer.render(code, filename, {
        framework: decision.framework,
        props,
        cache: this._config.cacheEnabled,
      });

      if (result.error) {
        logger.warn(`SSR render warning for ${filename}: ${result.error}`);
      }

      return result;
    } catch (error) {
      logger.error(`SSR render failed for ${filename}:`, error);
      return null;
    }
  }

  /**
   * Render a full HTML page with SSR
   */
  async renderPage(
    code: string,
    filename: string,
    options: {
      props?: Record<string, unknown>;
      title?: string;
      lang?: string;
      baseUrl?: string;
    } = {},
  ): Promise<string | null> {
    const result = await this.render(code, filename, options.props);

    if (!result) {
      return null;
    }

    const { title = 'BAVINI Preview', lang = 'en', baseUrl = '/' } = options;

    return `<!DOCTYPE html>
<html lang="${lang}">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${title}</title>
  <base href="${baseUrl}" />
  ${result.head}
  ${result.css ? `<style>${result.css}</style>` : ''}
</head>
<body>
  ${result.html}
</body>
</html>`;
  }

  /**
   * Prerender multiple pages
   */
  async prerenderPages(
    pages: Array<{
      code: string;
      filename: string;
      props?: Record<string, unknown>;
    }>,
  ): Promise<Map<string, string>> {
    const results = new Map<string, string>();

    for (const page of pages) {
      const html = await this.renderPage(page.code, page.filename, {
        props: page.props,
      });

      if (html) {
        results.set(page.filename, html);
      }
    }

    logger.info(`Prerendered ${results.size}/${pages.length} pages`);
    return results;
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    size: number;
    hitRate: number;
    hits: number;
    misses: number;
  } | null {
    if (!this._config.cacheEnabled) {
      return null;
    }

    const cache = getSharedSSRCache();
    const stats = cache.getStats();

    return {
      size: stats.size,
      hitRate: stats.hitRate,
      hits: stats.hits,
      misses: stats.misses,
    };
  }

  /**
   * Clear the SSR cache
   */
  clearCache(): void {
    if (this._config.cacheEnabled) {
      getSharedSSRCache().clear();
      logger.info('SSR cache cleared');
    }
  }

  /**
   * Invalidate cache for a specific file
   */
  invalidateCache(filename: string): void {
    if (this._config.cacheEnabled) {
      const cache = getSharedSSRCache();
      const count = cache.invalidateComponent(filename);
      logger.debug(`Invalidated ${count} cache entries for ${filename}`);
    }
  }

  /**
   * Destroy the bridge
   */
  destroy(): void {
    this._initPromise = null;
    this._renderer = null;
    this._enabled = false;
    logger.info('SSRBridge destroyed');
  }
}

/**
 * Factory function
 */
export function createSSRBridge(config?: SSRBridgeConfig): SSRBridge {
  return new SSRBridge(config);
}

/**
 * Singleton instance
 */
let _sharedBridge: SSRBridge | null = null;

export function getSharedSSRBridge(): SSRBridge {
  if (!_sharedBridge) {
    _sharedBridge = createSSRBridge();
  }
  return _sharedBridge;
}

export function resetSharedSSRBridge(): void {
  if (_sharedBridge) {
    _sharedBridge.destroy();
    _sharedBridge = null;
  }
}
