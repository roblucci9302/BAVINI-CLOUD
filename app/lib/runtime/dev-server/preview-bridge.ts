/**
 * =============================================================================
 * BAVINI Dev Server - Preview Bridge
 * =============================================================================
 * Bridges the dev server with the existing preview system.
 * Enables HMR for browser-based builds.
 * =============================================================================
 */

import { DevServer, createDevServer } from './dev-server';
import { reactRefreshPlugin, vueHMRPlugin, cssHMRPlugin } from './plugins';
import { generateHMRClientCode } from './hmr-client';
import { generateErrorOverlayCode } from './error-overlay';
import type { DevServerConfig, HMRError, WatchEvent } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('DevServerBridge');

/**
 * Preview bridge configuration
 */
export interface PreviewBridgeConfig extends Partial<DevServerConfig> {
  /** Enable React Fast Refresh */
  reactRefresh?: boolean;
  /** Enable Vue HMR */
  vueHMR?: boolean;
  /** Enable CSS HMR */
  cssHMR?: boolean;
  /** Callback when preview should update */
  onPreviewUpdate?: (html: string) => void;
  /** Callback for errors */
  onError?: (error: HMRError) => void;
}

/**
 * Preview bridge for integrating dev server with existing preview system
 */
export class DevServerBridge {
  private devServer: DevServer;
  private config: PreviewBridgeConfig;
  private hmrClientCode: string;
  private errorOverlayCode: string;
  private lastBuildResult: { code: string; css: string } | null = null;

  constructor(fileSystem: Map<string, string>, config: PreviewBridgeConfig = {}) {
    this.config = {
      hmr: true,
      cors: true,
      reactRefresh: true,
      vueHMR: true,
      cssHMR: true,
      ...config,
    };

    // Create dev server
    this.devServer = createDevServer(fileSystem, this.config);

    // Add plugins based on configuration
    if (this.config.reactRefresh) {
      this.devServer.addPlugin(reactRefreshPlugin());
    }

    if (this.config.vueHMR) {
      this.devServer.addPlugin(vueHMRPlugin());
    }

    if (this.config.cssHMR) {
      this.devServer.addPlugin(cssHMRPlugin());
    }

    // Generate client-side code
    this.hmrClientCode = generateHMRClientCode({
      overlay: true,
    });
    this.errorOverlayCode = generateErrorOverlayCode({
      dismissible: true,
    });

    // Listen for file changes
    this.devServer.onFileChange(this.handleFileChange.bind(this));

    logger.info('DevServerBridge initialized');
  }

  /**
   * Start the dev server
   */
  async start(): Promise<void> {
    await this.devServer.listen();
    logger.info('DevServerBridge started');
  }

  /**
   * Stop the dev server
   */
  async stop(): Promise<void> {
    await this.devServer.close();
    logger.info('DevServerBridge stopped');
  }

  /**
   * Update file and trigger HMR
   */
  writeFile(path: string, content: string): void {
    this.devServer.writeFile(path, content);
  }

  /**
   * Delete file and trigger HMR
   */
  deleteFile(path: string): void {
    this.devServer.deleteFile(path);
  }

  /**
   * Set last build result for HMR reference
   */
  setLastBuild(code: string, css: string): void {
    this.lastBuildResult = { code, css };
  }

  /**
   * Generate preview HTML with HMR support
   */
  generatePreviewHTML(
    baseHTML: string,
    bundleCode: string,
    css: string,
  ): string {
    // Inject HMR client and error overlay
    const hmrScript = `<script type="module">\n${this.hmrClientCode}\n</script>`;
    const overlayScript = `<script>\n${this.errorOverlayCode}\n</script>`;

    // Inject CSS
    const styleTag = css ? `<style id="bavini-hmr-css">\n${css}\n</style>` : '';

    // Inject bundle
    const bundleScript = `<script type="module">\n${bundleCode}\n</script>`;

    // Build injection point before </head>
    const headInjection = `
    ${styleTag}
    ${overlayScript}
    `;

    // Build injection point before </body>
    const bodyInjection = `
    ${hmrScript}
    ${bundleScript}
    `;

    // Inject into HTML
    let html = baseHTML;

    // Inject into head
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${headInjection}</head>`);
    } else {
      html = `<head>${headInjection}</head>${html}`;
    }

    // Inject into body
    if (html.includes('</body>')) {
      html = html.replace('</body>', `${bodyInjection}</body>`);
    } else {
      html = `${html}${bodyInjection}`;
    }

    return html;
  }

  /**
   * Send error to preview
   */
  sendError(error: Error): void {
    this.devServer.sendError(error);

    if (this.config.onError) {
      this.config.onError({
        message: error.message,
        stack: error.stack,
      });
    }
  }

  /**
   * Handle file change event
   */
  private handleFileChange(event: WatchEvent): void {
    logger.debug(`File change: ${event.type} ${event.path}`);

    // The dev server handles HMR internally
    // We just notify the preview system to update if needed

    if (this.config.onPreviewUpdate && this.lastBuildResult) {
      // For full reload scenarios, we need to regenerate HTML
      // HMR updates are handled via BroadcastChannel
      const needsFullReload = this.devServer.moduleGraph.needsFullReload(event.path);

      if (needsFullReload) {
        logger.info(`Full reload needed for ${event.path}`);
        // The preview system should trigger a rebuild
      }
    }
  }

  /**
   * Get module graph for debugging
   */
  getModuleGraph() {
    return this.devServer.moduleGraph;
  }

  /**
   * Get dev server instance
   */
  getDevServer(): DevServer {
    return this.devServer;
  }
}

/**
 * Create a preview bridge instance
 */
export function createPreviewBridge(
  fileSystem: Map<string, string>,
  config?: PreviewBridgeConfig,
): DevServerBridge {
  return new DevServerBridge(fileSystem, config);
}

/**
 * Generate HMR-enabled preview HTML
 * Utility function for quick integration
 */
export function injectHMRSupport(
  html: string,
  options: {
    enableOverlay?: boolean;
    enableHMR?: boolean;
  } = {},
): string {
  const { enableOverlay = true, enableHMR = true } = options;

  let result = html;

  // Inject error overlay
  if (enableOverlay) {
    const overlayCode = generateErrorOverlayCode({ dismissible: true });
    const overlayScript = `<script>\n${overlayCode}\n</script>`;

    if (result.includes('</head>')) {
      result = result.replace('</head>', `${overlayScript}</head>`);
    }
  }

  // Inject HMR client
  if (enableHMR) {
    const hmrCode = generateHMRClientCode({ overlay: enableOverlay });
    const hmrScript = `<script type="module">\n${hmrCode}\n</script>`;

    if (result.includes('</body>')) {
      result = result.replace('</body>', `${hmrScript}</body>`);
    }
  }

  return result;
}

export default DevServerBridge;
