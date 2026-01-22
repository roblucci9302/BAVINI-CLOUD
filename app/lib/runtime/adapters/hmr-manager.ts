/**
 * =============================================================================
 * BAVINI CLOUD - HMR (Hot Module Replacement) Manager
 * =============================================================================
 * FIX 3.1: Manages hot module replacement for the browser runtime.
 *
 * Supports:
 * - CSS hot updates (no reload required)
 * - Full page reload for JS/TS changes
 * - Communication with preview iframe via postMessage
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('HMRManager');

/**
 * Types of file changes for HMR
 */
export type ChangeType = 'css' | 'js' | 'asset' | 'config' | 'unknown';

/**
 * HMR update message sent to preview
 */
export interface HMRUpdate {
  type: 'bavini-hmr';
  action: 'css-update' | 'full-reload' | 'asset-update';
  payload: {
    /** CSS content for css-update */
    css?: string;
    /** File path that changed */
    path?: string;
    /** Build ID/hash */
    buildId?: string;
    /** Timestamp */
    timestamp: number;
  };
}

/**
 * HMR status
 */
export type HMRStatus = 'idle' | 'updating' | 'ready' | 'error';

/**
 * File change event
 */
export interface FileChange {
  path: string;
  content: string;
  type: ChangeType;
}

/**
 * HMR event callbacks
 */
export interface HMRCallbacks {
  /** Called when CSS is updated */
  onCSSUpdate?: (css: string) => void;
  /** Called when a full reload is needed */
  onFullReload?: () => void;
  /** Called on status change */
  onStatusChange?: (status: HMRStatus) => void;
}

/**
 * Classify a file change by type
 */
export function classifyChange(path: string): ChangeType {
  const ext = path.split('.').pop()?.toLowerCase() || '';

  // CSS and style files
  if (['css', 'scss', 'sass', 'less', 'styl'].includes(ext)) {
    return 'css';
  }

  // JavaScript/TypeScript files
  if (['js', 'jsx', 'ts', 'tsx', 'mjs', 'cjs'].includes(ext)) {
    return 'js';
  }

  // Framework components (may contain CSS)
  if (['vue', 'svelte', 'astro'].includes(ext)) {
    // These need full reload for now (future: component HMR)
    return 'js';
  }

  // Config files
  if (
    path.includes('package.json') ||
    path.includes('tsconfig') ||
    path.includes('vite.config') ||
    path.includes('.config.')
  ) {
    return 'config';
  }

  // Assets
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'woff', 'woff2', 'ttf', 'eot'].includes(ext)) {
    return 'asset';
  }

  return 'unknown';
}

/**
 * HMR Manager for browser runtime
 */
export class HMRManager {
  private _status: HMRStatus = 'idle';
  private _callbacks: HMRCallbacks = {};
  private _previewFrame: HTMLIFrameElement | null = null;
  private _lastBuildId: string = '';
  private _pendingUpdates: FileChange[] = [];
  private _updateDebounceTimer: ReturnType<typeof setTimeout> | null = null;
  private _debounceMs = 100;

  /**
   * Set callbacks for HMR events
   */
  setCallbacks(callbacks: HMRCallbacks): void {
    this._callbacks = callbacks;
  }

  /**
   * Set the preview iframe for postMessage communication
   */
  setPreviewFrame(frame: HTMLIFrameElement | null): void {
    this._previewFrame = frame;
    logger.debug('Preview frame set:', frame ? 'connected' : 'disconnected');
  }

  /**
   * Get current HMR status
   */
  get status(): HMRStatus {
    return this._status;
  }

  /**
   * Set debounce time for batching updates
   */
  setDebounceMs(ms: number): void {
    this._debounceMs = ms;
  }

  /**
   * Notify of a file change
   */
  notifyChange(path: string, content: string): void {
    const type = classifyChange(path);
    logger.debug(`File change detected: ${path} (${type})`);

    this._pendingUpdates.push({ path, content, type });

    // Debounce updates
    if (this._updateDebounceTimer) {
      clearTimeout(this._updateDebounceTimer);
    }

    this._updateDebounceTimer = setTimeout(() => {
      this._processPendingUpdates();
    }, this._debounceMs);
  }

  /**
   * Process all pending updates
   */
  private _processPendingUpdates(): void {
    if (this._pendingUpdates.length === 0) {
      return;
    }

    this._setStatus('updating');

    const updates = [...this._pendingUpdates];
    this._pendingUpdates = [];

    // Check if any update requires full reload
    const requiresFullReload = updates.some(
      (u) => u.type === 'js' || u.type === 'config'
    );

    if (requiresFullReload) {
      logger.info('Full reload required due to JS/config changes');
      this._triggerFullReload();
    } else {
      // CSS-only updates
      const cssUpdates = updates.filter((u) => u.type === 'css');
      if (cssUpdates.length > 0) {
        logger.info(`Processing ${cssUpdates.length} CSS updates`);
        this._triggerCSSUpdate(cssUpdates);
      }

      // Asset updates (may or may not need reload depending on implementation)
      const assetUpdates = updates.filter((u) => u.type === 'asset');
      if (assetUpdates.length > 0) {
        logger.info(`${assetUpdates.length} asset updates (cache invalidation)`);
        // For now, assets don't trigger reload - they'll use updated URLs
      }
    }

    this._setStatus('ready');
  }

  /**
   * Trigger a CSS-only update (no reload)
   */
  private _triggerCSSUpdate(cssChanges: FileChange[]): void {
    // Combine all CSS
    const combinedCSS = cssChanges.map((c) => c.content).join('\n\n');

    // Send to preview via postMessage
    if (this._previewFrame?.contentWindow) {
      const update: HMRUpdate = {
        type: 'bavini-hmr',
        action: 'css-update',
        payload: {
          css: combinedCSS,
          timestamp: Date.now(),
        },
      };

      try {
        this._previewFrame.contentWindow.postMessage(update, '*');
        logger.debug('CSS update sent to preview');
      } catch (error) {
        logger.error('Failed to send CSS update to preview:', error);
      }
    }

    // Notify callback
    this._callbacks.onCSSUpdate?.(combinedCSS);
  }

  /**
   * Trigger a full page reload
   */
  private _triggerFullReload(): void {
    // Send reload message to preview
    if (this._previewFrame?.contentWindow) {
      const update: HMRUpdate = {
        type: 'bavini-hmr',
        action: 'full-reload',
        payload: {
          buildId: this._lastBuildId,
          timestamp: Date.now(),
        },
      };

      try {
        this._previewFrame.contentWindow.postMessage(update, '*');
        logger.debug('Full reload message sent to preview');
      } catch (error) {
        logger.error('Failed to send reload message to preview:', error);
      }
    }

    // Notify callback
    this._callbacks.onFullReload?.();
  }

  /**
   * Update the build ID (for cache busting)
   */
  setBuildId(buildId: string): void {
    this._lastBuildId = buildId;
  }

  /**
   * Manually trigger a full reload
   */
  forceReload(): void {
    this._setStatus('updating');
    this._triggerFullReload();
    this._setStatus('ready');
  }

  /**
   * Inject HMR client script into HTML
   * This script listens for postMessage updates in the preview
   */
  getHMRClientScript(): string {
    // NOTE: No HTML comments here - they cause "HTML comments are not allowed in modules" errors
    return `
<script>
(function() {
  'use strict';

  // Listen for HMR updates from parent
  window.addEventListener('message', function(event) {
    if (!event.data || event.data.type !== 'bavini-hmr') return;

    var update = event.data;
    console.log('[BAVINI HMR]', update.action, update.payload);

    switch (update.action) {
      case 'css-update':
        handleCSSUpdate(update.payload.css);
        break;
      case 'full-reload':
        handleFullReload();
        break;
      case 'asset-update':
        // Future: handle asset updates
        break;
    }
  });

  function handleCSSUpdate(css) {
    // Find or create HMR style element
    var styleId = 'bavini-hmr-styles';
    var style = document.getElementById(styleId);

    if (!style) {
      style = document.createElement('style');
      style.id = styleId;
      document.head.appendChild(style);
    }

    style.textContent = css;
    console.log('[BAVINI HMR] CSS updated');
  }

  function handleFullReload() {
    console.log('[BAVINI HMR] Reloading...');
    window.location.reload();
  }

  console.log('[BAVINI HMR] Client initialized');
})();
</script>
`;
  }

  /**
   * Set status and notify callback
   */
  private _setStatus(status: HMRStatus): void {
    if (this._status !== status) {
      this._status = status;
      this._callbacks.onStatusChange?.(status);
      logger.debug('HMR status:', status);
    }
  }

  /**
   * Cleanup
   */
  destroy(): void {
    if (this._updateDebounceTimer) {
      clearTimeout(this._updateDebounceTimer);
      this._updateDebounceTimer = null;
    }
    this._pendingUpdates = [];
    this._previewFrame = null;
    this._callbacks = {};
    this._setStatus('idle');
    logger.debug('HMRManager destroyed');
  }
}

/**
 * Create a new HMR manager
 */
export function createHMRManager(): HMRManager {
  return new HMRManager();
}
