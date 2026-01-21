/**
 * =============================================================================
 * BAVINI Runtime Engine - Runtime Orchestrator
 * =============================================================================
 * Bridges the QuickJS runtime with the Browser Build Adapter.
 * Enables SSR capabilities for frameworks like Astro that require server-side
 * rendering while maintaining full browser-side operation.
 * =============================================================================
 */

import {
  QuickJSNodeRuntime,
  createQuickJSRuntime,
  getSharedQuickJSRuntime,
  resetSharedQuickJSRuntime,
} from './quickjs-runtime';
import { UnifiedFSInstance, createUnifiedFS, getSharedFS } from './unified-fs';
import type { ExecutionResult, RuntimeStatus, RuntimeCallbacks } from './types';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('RuntimeOrchestrator');

/**
 * SSR render result
 */
export interface SSRRenderResult {
  html: string;
  css: string;
  head: string;
  error?: string;
}

/**
 * Orchestrator configuration
 */
export interface OrchestratorConfig {
  /** Enable QuickJS for SSR */
  enableSSR?: boolean;
  /** Memory limit for QuickJS in bytes */
  memoryLimitBytes?: number;
  /** Max execution time in ms */
  timeoutMs?: number;
}

const DEFAULT_CONFIG: Required<OrchestratorConfig> = {
  enableSSR: true,
  memoryLimitBytes: 128 * 1024 * 1024, // 128 MB
  timeoutMs: 30000, // 30 seconds
};

/**
 * Runtime Orchestrator
 * Manages QuickJS runtime for SSR alongside browser-side esbuild.
 */
export class RuntimeOrchestrator {
  private _config: Required<OrchestratorConfig>;
  private _quickjs: QuickJSNodeRuntime | null = null;
  private _fs: UnifiedFSInstance;
  private _status: RuntimeStatus = 'idle';
  private _callbacks: RuntimeCallbacks = {};
  private _initPromise: Promise<void> | null = null;

  constructor(config: OrchestratorConfig = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._fs = getSharedFS();
    logger.info('RuntimeOrchestrator created');
  }

  /**
   * Get current status
   */
  get status(): RuntimeStatus {
    return this._status;
  }

  /**
   * Get the shared filesystem
   */
  get fs(): UnifiedFSInstance {
    return this._fs;
  }

  /**
   * Get QuickJS runtime (initializes if needed)
   */
  get quickjs(): QuickJSNodeRuntime | null {
    return this._quickjs;
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: RuntimeCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  /**
   * Initialize the orchestrator (loads QuickJS if SSR enabled)
   */
  async init(): Promise<void> {
    if (this._initPromise) {
      return this._initPromise;
    }

    if (this._status === 'ready') {
      return;
    }

    this._initPromise = this._doInit();
    return this._initPromise;
  }

  private async _doInit(): Promise<void> {
    this._setStatus('initializing');

    try {
      if (this._config.enableSSR) {
        logger.info('Initializing QuickJS runtime for SSR...');
        this._quickjs = getSharedQuickJSRuntime();
        await this._quickjs.init();
        logger.info('QuickJS runtime ready');
      }

      this._setStatus('ready');
    } catch (error) {
      logger.error('Failed to initialize RuntimeOrchestrator:', error);
      this._setStatus('error');
      throw error;
    }
  }

  /**
   * Sync files from browser build to QuickJS
   */
  syncFilesToQuickJS(files: Map<string, string> | Record<string, string>): void {
    const entries = files instanceof Map ? files.entries() : Object.entries(files);

    for (const [path, content] of entries) {
      this._fs.writeFileSync(path, content);
    }

    logger.debug(`Synced ${files instanceof Map ? files.size : Object.keys(files).length} files to QuickJS FS`);
  }

  /**
   * Execute SSR rendering for a component/page
   */
  async renderSSR(
    componentPath: string,
    props: Record<string, unknown> = {},
  ): Promise<SSRRenderResult> {
    if (!this._quickjs) {
      return {
        html: '',
        css: '',
        head: '',
        error: 'SSR not enabled or QuickJS not initialized',
      };
    }

    await this.init();

    const renderCode = this._generateSSRCode(componentPath, props);
    const result = await this._quickjs.eval(renderCode, `ssr-render-${componentPath}`);

    if (!result.success) {
      logger.error('SSR render error:', result.error);
      return {
        html: '',
        css: '',
        head: '',
        error: result.error,
      };
    }

    // Parse the result (expected to be JSON)
    try {
      const rendered = typeof result.value === 'string' ? JSON.parse(result.value) : result.value;
      return {
        html: rendered.html || '',
        css: rendered.css || '',
        head: rendered.head || '',
      };
    } catch (error) {
      return {
        html: String(result.value || ''),
        css: '',
        head: '',
      };
    }
  }

  /**
   * Generate SSR rendering code for a component
   */
  private _generateSSRCode(
    componentPath: string,
    props: Record<string, unknown>,
  ): string {
    const propsJson = JSON.stringify(props);

    // This is a basic template - will be enhanced based on framework
    return `
(function() {
  const props = ${propsJson};
  const componentPath = "${componentPath}";

  // Framework detection and rendering
  // This will be enhanced with actual SSR implementation

  // For now, return a placeholder
  JSON.stringify({
    html: '<div data-ssr="true" data-component="' + componentPath + '">SSR Placeholder</div>',
    css: '',
    head: ''
  });
})();
`;
  }

  /**
   * Execute arbitrary code in QuickJS (for advanced use cases)
   */
  async executeInQuickJS(
    code: string,
    filename = 'script.js',
  ): Promise<ExecutionResult> {
    if (!this._quickjs) {
      return {
        success: false,
        error: 'SSR not enabled or QuickJS not initialized',
        stdout: '',
        stderr: '',
        executionTime: 0,
      };
    }

    await this.init();
    return this._quickjs.eval(code, filename);
  }

  /**
   * Check if SSR is available
   */
  isSSRAvailable(): boolean {
    return this._config.enableSSR && this._quickjs !== null && this._quickjs.status === 'ready';
  }

  /**
   * Get filesystem snapshot as JSON
   */
  getFilesystemSnapshot(): Record<string, string> {
    return this._fs.toJSON();
  }

  /**
   * Restore filesystem from snapshot
   */
  restoreFilesystemSnapshot(snapshot: Record<string, string>): void {
    this._fs.clear();
    this._fs.fromJSON(snapshot);
  }

  /**
   * Destroy the orchestrator
   */
  destroy(): void {
    if (this._quickjs) {
      resetSharedQuickJSRuntime();
      this._quickjs = null;
    }
    this._initPromise = null;
    this._setStatus('idle');
    logger.info('RuntimeOrchestrator destroyed');
  }

  /**
   * Set status and notify
   */
  private _setStatus(status: RuntimeStatus): void {
    this._status = status;
    this._callbacks.onStatusChange?.(status);
  }
}

/**
 * Factory function
 */
export function createRuntimeOrchestrator(config?: OrchestratorConfig): RuntimeOrchestrator {
  return new RuntimeOrchestrator(config);
}

/**
 * Singleton instance
 */
let _sharedOrchestrator: RuntimeOrchestrator | null = null;

export function getSharedOrchestrator(): RuntimeOrchestrator {
  if (!_sharedOrchestrator) {
    _sharedOrchestrator = createRuntimeOrchestrator();
  }
  return _sharedOrchestrator;
}

export function resetSharedOrchestrator(): void {
  if (_sharedOrchestrator) {
    _sharedOrchestrator.destroy();
    _sharedOrchestrator = null;
  }
}
