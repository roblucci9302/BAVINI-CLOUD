/**
 * =============================================================================
 * BAVINI Runtime Engine - SSR Engine
 * =============================================================================
 * Server-Side Rendering engine using QuickJS. Renders Astro, React, Vue,
 * and Svelte components to HTML strings in a sandboxed WASM environment.
 * =============================================================================
 */

import type { ExecutionResult, RuntimeStatus, RuntimeCallbacks } from './types';
import { QuickJSNodeRuntime, createQuickJSRuntime } from './quickjs-runtime';
import { ModuleResolver, createModuleResolver } from './module-resolver';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('SSREngine');

/**
 * SSR render options
 */
export interface SSROptions {
  /** Props to pass to the component */
  props?: Record<string, unknown>;
  /** Slots content */
  slots?: Record<string, string>;
  /** Request URL for routing */
  url?: string;
  /** Custom headers */
  headers?: Record<string, string>;
}

/**
 * SSR render result
 */
export interface SSRResult {
  /** Rendered HTML */
  html: string;
  /** Extracted CSS */
  css: string;
  /** Head content (meta, title, etc.) */
  head: string;
  /** HTTP status code */
  status: number;
  /** Response headers */
  headers: Record<string, string>;
  /** Render time in ms */
  renderTime: number;
  /** Error if rendering failed */
  error?: string;
}

/**
 * Astro component metadata
 */
interface AstroComponentMeta {
  propagation: 'none' | 'self' | 'in-tree';
  containsHead: boolean;
}

/**
 * SSR Engine configuration
 */
export interface SSREngineConfig {
  /** Enable streaming rendering */
  streaming?: boolean;
  /** Timeout for rendering in ms */
  timeoutMs?: number;
  /** Base URL for assets */
  baseUrl?: string;
}

const DEFAULT_CONFIG: Required<SSREngineConfig> = {
  streaming: false,
  timeoutMs: 30000,
  baseUrl: '/',
};

/**
 * SSR Engine - Renders components to HTML using QuickJS
 */
export class SSREngine {
  private _config: Required<SSREngineConfig>;
  private _runtime: QuickJSNodeRuntime;
  private _resolver: ModuleResolver;
  private _status: RuntimeStatus = 'idle';
  private _callbacks: RuntimeCallbacks = {};
  private _initPromise: Promise<void> | null = null;

  constructor(config: SSREngineConfig = {}) {
    this._config = { ...DEFAULT_CONFIG, ...config };
    this._runtime = createQuickJSRuntime({
      memoryLimitBytes: 256 * 1024 * 1024, // 256 MB for SSR
      interruptAfterMs: this._config.timeoutMs,
    });
    this._resolver = createModuleResolver(
      this._runtime.fs,
      this._runtime.process,
    );

    logger.info('SSREngine created');
  }

  /**
   * Get current status
   */
  get status(): RuntimeStatus {
    return this._status;
  }

  /**
   * Get the runtime
   */
  get runtime(): QuickJSNodeRuntime {
    return this._runtime;
  }

  /**
   * Set callbacks
   */
  setCallbacks(callbacks: RuntimeCallbacks): void {
    this._callbacks = { ...this._callbacks, ...callbacks };
  }

  /**
   * Initialize the SSR engine
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
      // Initialize QuickJS runtime
      await this._runtime.init();

      // Inject Astro runtime globals
      await this._injectAstroRuntime();

      this._setStatus('ready');
      logger.info('SSREngine ready');
    } catch (error) {
      logger.error('Failed to initialize SSREngine:', error);
      this._setStatus('error');
      throw error;
    }
  }

  /**
   * Inject Astro runtime globals into QuickJS
   */
  private async _injectAstroRuntime(): Promise<void> {
    const astroRuntimeCode = this._generateAstroRuntime();
    await this._runtime.eval(astroRuntimeCode, '__astro_runtime__.js');
    logger.debug('Astro runtime injected');
  }

  /**
   * Generate Astro runtime code for QuickJS
   */
  private _generateAstroRuntime(): string {
    return `
// Astro Runtime Shim for QuickJS SSR
(function(globalThis) {
  'use strict';

  // HTML Escaping
  const escapeHTML = (str) => {
    if (typeof str !== 'string') return String(str);
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Render attributes
  const renderAttributes = (attrs) => {
    if (!attrs || typeof attrs !== 'object') return '';
    return Object.entries(attrs)
      .filter(([_, v]) => v != null && v !== false)
      .map(([k, v]) => v === true ? k : \`\${k}="\${escapeHTML(v)}"\`)
      .join(' ');
  };

  // Create Astro global
  const createAstro = (filePathname, site, projectRoot) => {
    return {
      site: site || new URL('http://localhost:4321'),
      generator: 'BAVINI SSR Engine 1.0',
      glob: () => [],
      resolve: (path) => path,
      request: {
        url: new URL('http://localhost:4321' + filePathname),
        method: 'GET',
        headers: new Headers(),
      },
      params: {},
      props: {},
      redirect: (path, status = 302) => {
        return { __astro_redirect: true, path, status };
      },
      url: new URL('http://localhost:4321' + filePathname),
      cookies: {
        get: () => undefined,
        set: () => {},
        delete: () => {},
        has: () => false,
      },
      locals: {},
    };
  };

  // Render component to string
  const renderComponent = async (result, displayName, Component, props, slots) => {
    if (!Component) {
      return \`<!-- Missing component: \${displayName} -->\`;
    }

    // Handle different component types
    if (typeof Component === 'function') {
      const output = await Component(props);
      if (typeof output === 'string') return output;
      if (output && output.html) return output.html;
      return String(output || '');
    }

    if (typeof Component === 'string') {
      return Component;
    }

    if (Component.render) {
      const rendered = await Component.render(props);
      return rendered.html || '';
    }

    return \`<!-- Unknown component type: \${displayName} -->\`;
  };

  // Render slot
  const renderSlot = async (result, slotted, fallback) => {
    if (slotted) {
      return typeof slotted === 'function' ? await slotted() : String(slotted);
    }
    return fallback || '';
  };

  // Render head
  const renderHead = (result) => {
    const head = result._head || [];
    return head.join('\\n');
  };

  // Add to head
  const addAttribute = (value, key) => {
    if (value == null || value === false) return '';
    if (value === true) return \` \${key}\`;
    return \` \${key}="\${escapeHTML(value)}"\`;
  };

  // Spread attributes
  const spreadAttributes = (attrs, _name, shouldRender) => {
    if (!shouldRender && shouldRender !== undefined) return '';
    return ' ' + renderAttributes(attrs);
  };

  // Define style vars
  const defineStyleVars = (vars) => {
    return Object.entries(vars)
      .map(([key, value]) => \`--\${key}: \${value}\`)
      .join('; ');
  };

  // Define script vars
  const defineScriptVars = (vars) => {
    return Object.entries(vars)
      .map(([key, value]) => \`const \${key} = \${JSON.stringify(value)};\`)
      .join('\\n');
  };

  // Create render result
  const createResult = (props = {}) => {
    return {
      _metadata: {
        hasHydrationScript: false,
        hasRenderedHead: false,
        hasDirectives: new Set(),
      },
      _head: [],
      props,
      slots: {},
      createAstro,
      addHeadContent: (content) => {
        result._head.push(content);
      },
    };
  };

  // Fragment
  const Fragment = Symbol.for('astro:fragment');

  // Render to string
  const renderToString = async (Component, props = {}, slots = {}) => {
    const result = createResult(props);
    result.slots = slots;

    try {
      const html = await renderComponent(result, 'Page', Component, props, slots);
      const head = renderHead(result);

      return {
        html,
        head,
        css: '',
      };
    } catch (error) {
      return {
        html: \`<div style="color:red;padding:20px;border:2px solid red;">
          <h2>SSR Error</h2>
          <pre>\${escapeHTML(error.message)}\\n\${escapeHTML(error.stack || '')}</pre>
        </div>\`,
        head: '',
        css: '',
        error: error.message,
      };
    }
  };

  // Export to global
  globalThis.Astro = {
    createAstro,
    renderComponent,
    renderSlot,
    renderHead,
    addAttribute,
    spreadAttributes,
    defineStyleVars,
    defineScriptVars,
    createResult,
    renderToString,
    Fragment,
    escapeHTML,
  };

  // Also expose individual functions
  globalThis.createAstro = createAstro;
  globalThis.$$createComponent = (fn) => fn;
  globalThis.$$render = renderComponent;
  globalThis.$$renderSlot = renderSlot;
  globalThis.$$renderHead = renderHead;
  globalThis.$$addAttribute = addAttribute;
  globalThis.$$spreadAttributes = spreadAttributes;
  globalThis.$$defineStyleVars = defineStyleVars;
  globalThis.$$defineScriptVars = defineScriptVars;
  globalThis.$$createResult = createResult;
  globalThis.$$Fragment = Fragment;
  globalThis.$$escapeHTML = escapeHTML;

})(globalThis);
`;
  }

  /**
   * Render an Astro component to HTML
   */
  async renderAstro(
    componentCode: string,
    options: SSROptions = {},
  ): Promise<SSRResult> {
    await this.init();

    const startTime = performance.now();
    const { props = {}, slots = {}, url = '/' } = options;

    try {
      // Wrap the component code for SSR execution
      const ssrCode = this._wrapAstroForSSR(componentCode, props, slots, url);

      // Execute in QuickJS
      const result = await this._runtime.eval(ssrCode, 'ssr-component.js');

      if (!result.success) {
        return {
          html: this._renderError(result.error || 'Unknown error'),
          css: '',
          head: '',
          status: 500,
          headers: { 'Content-Type': 'text/html' },
          renderTime: performance.now() - startTime,
          error: result.error,
        };
      }

      // Parse the result
      const rendered = this._parseRenderResult(result.value);

      return {
        html: rendered.html,
        css: rendered.css,
        head: rendered.head,
        status: 200,
        headers: { 'Content-Type': 'text/html' },
        renderTime: performance.now() - startTime,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('SSR render error:', errorMessage);

      return {
        html: this._renderError(errorMessage),
        css: '',
        head: '',
        status: 500,
        headers: { 'Content-Type': 'text/html' },
        renderTime: performance.now() - startTime,
        error: errorMessage,
      };
    }
  }

  /**
   * Wrap Astro component code for SSR execution
   */
  private _wrapAstroForSSR(
    componentCode: string,
    props: Record<string, unknown>,
    slots: Record<string, string>,
    url: string,
  ): string {
    const propsJson = JSON.stringify(props);
    const slotsJson = JSON.stringify(slots);

    return `
(async function() {
  const __props = ${propsJson};
  const __slots = ${slotsJson};
  const __url = "${url}";

  // Component code
  ${componentCode}

  // If the code exports a default function/component, render it
  if (typeof $$Component !== 'undefined') {
    const result = await Astro.renderToString($$Component, __props, __slots);
    return JSON.stringify(result);
  }

  // Fallback: look for default export
  if (typeof exports !== 'undefined' && exports.default) {
    const result = await Astro.renderToString(exports.default, __props, __slots);
    return JSON.stringify(result);
  }

  // No component found
  return JSON.stringify({
    html: '<!-- No component found -->',
    head: '',
    css: '',
  });
})();
`;
  }

  /**
   * Parse render result from QuickJS
   */
  private _parseRenderResult(value: unknown): {
    html: string;
    css: string;
    head: string;
  } {
    if (typeof value === 'string') {
      try {
        return JSON.parse(value);
      } catch {
        return { html: value, css: '', head: '' };
      }
    }

    if (typeof value === 'object' && value !== null) {
      const obj = value as Record<string, unknown>;
      return {
        html: String(obj.html || ''),
        css: String(obj.css || ''),
        head: String(obj.head || ''),
      };
    }

    return { html: String(value || ''), css: '', head: '' };
  }

  /**
   * Render an error page
   */
  private _renderError(message: string): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>SSR Error</title>
  <style>
    body { font-family: system-ui, sans-serif; padding: 40px; background: #1a1a1a; color: #fff; }
    .error { background: #2d1b1b; border: 1px solid #ff4444; padding: 20px; border-radius: 8px; }
    h1 { color: #ff6b6b; margin-top: 0; }
    pre { background: #0d0d0d; padding: 15px; border-radius: 4px; overflow-x: auto; }
  </style>
</head>
<body>
  <div class="error">
    <h1>SSR Rendering Error</h1>
    <pre>${this._escapeHtml(message)}</pre>
  </div>
</body>
</html>`;
  }

  /**
   * Escape HTML entities
   */
  private _escapeHtml(str: string): string {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  /**
   * Write files to the virtual filesystem
   */
  writeFiles(files: Record<string, string> | Map<string, string>): void {
    this._runtime.writeFiles(files);
  }

  /**
   * Get the module resolver
   */
  get resolver(): ModuleResolver {
    return this._resolver;
  }

  /**
   * Destroy the SSR engine
   */
  destroy(): void {
    this._runtime.destroy();
    this._resolver.clearCache();
    this._initPromise = null;
    this._setStatus('idle');
    logger.info('SSREngine destroyed');
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
export function createSSREngine(config?: SSREngineConfig): SSREngine {
  return new SSREngine(config);
}

/**
 * Singleton instance
 */
let _sharedSSREngine: SSREngine | null = null;

export function getSharedSSREngine(): SSREngine {
  if (!_sharedSSREngine) {
    _sharedSSREngine = createSSREngine();
  }
  return _sharedSSREngine;
}

export function resetSharedSSREngine(): void {
  if (_sharedSSREngine) {
    _sharedSSREngine.destroy();
    _sharedSSREngine = null;
  }
}
