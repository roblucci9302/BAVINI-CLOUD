/**
 * =============================================================================
 * BAVINI Runtime Engine - Multi-Framework SSR
 * =============================================================================
 * Unified SSR renderer supporting multiple frameworks:
 * - Astro (native SSR)
 * - Vue (via @vue/server-renderer shim)
 * - Svelte (via svelte/server shim)
 * - React (via react-dom/server shim)
 * =============================================================================
 */

import type { ExecutionResult, RuntimeStatus } from './types';
import { QuickJSNodeRuntime, createQuickJSRuntime } from './quickjs-runtime';
import { SSRCache, createSSRCache } from './ssr-cache';
import { createScopedLogger } from '~/utils/logger';

const logger = createScopedLogger('MultiFrameworkSSR');

/**
 * Supported framework types
 */
export type SSRFramework = 'astro' | 'vue' | 'svelte' | 'react' | 'auto';

/**
 * SSR render options
 */
export interface MultiSSROptions {
  /** Framework to use (auto-detect if not specified) */
  framework?: SSRFramework;
  /** Props to pass to the component */
  props?: Record<string, unknown>;
  /** Slots content */
  slots?: Record<string, string>;
  /** Request URL */
  url?: string;
  /** Enable caching */
  cache?: boolean;
  /** Custom cache key */
  cacheKey?: string;
}

/**
 * SSR render result
 */
export interface MultiSSRResult {
  html: string;
  css: string;
  head: string;
  framework: SSRFramework;
  cached: boolean;
  renderTime: number;
  error?: string;
}

/**
 * Multi-Framework SSR Renderer
 */
export class MultiFrameworkSSR {
  private _runtime: QuickJSNodeRuntime;
  private _cache: SSRCache;
  private _status: RuntimeStatus = 'idle';
  private _initPromise: Promise<void> | null = null;
  private _frameworksInitialized: Set<SSRFramework> = new Set();

  constructor() {
    this._runtime = createQuickJSRuntime({
      memoryLimitBytes: 256 * 1024 * 1024,
      interruptAfterMs: 30000,
    });
    this._cache = createSSRCache({
      maxSize: 200,
      ttlMs: 10 * 60 * 1000, // 10 minutes
    });

    logger.info('MultiFrameworkSSR created');
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
   * Get the cache
   */
  get cache(): SSRCache {
    return this._cache;
  }

  /**
   * Initialize the SSR renderer
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
    this._status = 'initializing';

    try {
      await this._runtime.init();
      await this._injectBaseRuntime();
      this._status = 'ready';
      logger.info('MultiFrameworkSSR ready');
    } catch (error) {
      logger.error('Failed to initialize MultiFrameworkSSR:', error);
      this._status = 'error';
      throw error;
    }
  }

  /**
   * Inject base runtime globals
   */
  private async _injectBaseRuntime(): Promise<void> {
    const baseRuntime = `
// Base SSR Runtime for Multi-Framework Support
(function(globalThis) {
  'use strict';

  // HTML Escaping utility
  globalThis.$$escapeHTML = (str) => {
    if (typeof str !== 'string') return String(str ?? '');
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  };

  // Render attributes helper
  globalThis.$$renderAttrs = (attrs) => {
    if (!attrs || typeof attrs !== 'object') return '';
    return Object.entries(attrs)
      .filter(([_, v]) => v != null && v !== false)
      .map(([k, v]) => v === true ? k : \`\${k}="\${globalThis.$$escapeHTML(v)}"\`)
      .join(' ');
  };

  // SSR Result container
  globalThis.$$ssrResult = {
    html: '',
    css: '',
    head: '',
    scripts: [],
  };

})(globalThis);
`;

    await this._runtime.eval(baseRuntime, '__base_ssr_runtime__.js');
    logger.debug('Base SSR runtime injected');
  }

  /**
   * Initialize framework-specific runtime
   */
  private async _initFramework(framework: SSRFramework): Promise<void> {
    if (this._frameworksInitialized.has(framework)) {
      return;
    }

    switch (framework) {
      case 'astro':
        await this._initAstroRuntime();
        break;
      case 'vue':
        await this._initVueRuntime();
        break;
      case 'svelte':
        await this._initSvelteRuntime();
        break;
      case 'react':
        await this._initReactRuntime();
        break;
    }

    this._frameworksInitialized.add(framework);
    logger.debug(`${framework} runtime initialized`);
  }

  /**
   * Initialize Astro SSR runtime
   */
  private async _initAstroRuntime(): Promise<void> {
    const astroRuntime = `
// Astro SSR Runtime
(function(globalThis) {
  const createAstro = (filePathname, site) => ({
    site: site || new URL('http://localhost:4321'),
    generator: 'BAVINI SSR',
    request: { url: new URL('http://localhost:4321' + filePathname), method: 'GET', headers: {} },
    params: {},
    props: {},
    redirect: (path, status = 302) => ({ __astro_redirect: true, path, status }),
    url: new URL('http://localhost:4321' + filePathname),
  });

  globalThis.Astro = { createAstro };
  globalThis.createAstro = createAstro;
  globalThis.$$createComponent = (fn) => fn;
  globalThis.$$render = async (component, props) => typeof component === 'function' ? await component(props) : component;
  globalThis.$$renderComponent = async (Component, props) => typeof Component === 'function' ? await Component(props) : '';
  globalThis.$$maybeRenderHead = () => '';
  globalThis.$$renderHead = () => '';
  globalThis.$$addAttribute = (value, name) => value ? \` \${name}="\${globalThis.$$escapeHTML(value)}"\` : '';
  globalThis.$$spreadAttributes = (attrs) => ' ' + globalThis.$$renderAttrs(attrs);
  globalThis.$$result = {
    styles: new Set(),
    scripts: new Set(),
    createAstro,
  };
  globalThis.$result = globalThis.$$result;
})(globalThis);
`;
    await this._runtime.eval(astroRuntime, '__astro_runtime__.js');
  }

  /**
   * Initialize Vue SSR runtime
   */
  private async _initVueRuntime(): Promise<void> {
    const vueRuntime = `
// Vue SSR Runtime Shim
(function(globalThis) {
  // Vue reactive proxy shim
  const reactive = (obj) => obj;
  const ref = (val) => ({ value: val });
  const computed = (fn) => ({ value: fn() });

  // Vue SSR render helpers
  const h = (tag, props, children) => {
    if (typeof tag === 'function') {
      return tag(props, { slots: { default: () => children } });
    }

    const attrs = props ? ' ' + globalThis.$$renderAttrs(props) : '';
    const childContent = Array.isArray(children)
      ? children.map(c => typeof c === 'string' ? c : c?.toString?.() || '').join('')
      : (typeof children === 'string' ? children : children?.toString?.() || '');

    if (['br', 'hr', 'img', 'input', 'meta', 'link'].includes(tag)) {
      return \`<\${tag}\${attrs} />\`;
    }

    return \`<\${tag}\${attrs}>\${childContent}</\${tag}>\`;
  };

  // renderToString shim
  const renderToString = async (component, ctx = {}) => {
    try {
      if (typeof component === 'function') {
        const result = component(ctx.props || {});
        if (typeof result === 'string') return result;
        if (result && result.type) {
          // Handle vnode
          return h(result.type, result.props, result.children);
        }
        return String(result || '');
      }
      if (component && component.render) {
        return await renderToString(component.render, ctx);
      }
      return String(component || '');
    } catch (error) {
      return \`<div style="color:red">Vue SSR Error: \${globalThis.$$escapeHTML(error.message)}</div>\`;
    }
  };

  globalThis.Vue = {
    h,
    reactive,
    ref,
    computed,
    createApp: (component) => ({
      mount: () => {},
      use: () => {},
      component: () => {},
    }),
    renderToString,
  };

  globalThis.h = h;
  globalThis.renderToString = renderToString;
})(globalThis);
`;
    await this._runtime.eval(vueRuntime, '__vue_runtime__.js');
  }

  /**
   * Initialize Svelte SSR runtime
   */
  private async _initSvelteRuntime(): Promise<void> {
    const svelteRuntime = `
// Svelte SSR Runtime Shim
(function(globalThis) {
  // Svelte component base
  class SvelteComponent {
    constructor(options = {}) {
      this.$$props = options.props || {};
      this.$$slots = options.slots || {};
    }

    $destroy() {}
    $on() { return () => {}; }
    $set() {}
  }

  // SSR render function
  const render = (Component, props = {}) => {
    try {
      if (typeof Component === 'function') {
        // Check if it's a class component
        if (Component.prototype && Component.prototype.constructor) {
          const instance = new Component({ props });
          if (instance.render) {
            return instance.render();
          }
        }
        // Functional component
        const result = Component(props);
        if (typeof result === 'string') {
          return { html: result, css: { code: '' }, head: '' };
        }
        if (result && result.html) {
          return result;
        }
        return { html: String(result || ''), css: { code: '' }, head: '' };
      }

      if (Component && Component.render) {
        return Component.render(props);
      }

      return { html: '', css: { code: '' }, head: '' };
    } catch (error) {
      return {
        html: \`<div style="color:red">Svelte SSR Error: \${globalThis.$$escapeHTML(error.message)}</div>\`,
        css: { code: '' },
        head: '',
      };
    }
  };

  globalThis.SvelteComponent = SvelteComponent;
  globalThis.svelteRender = render;

  // Svelte internal helpers
  globalThis.create_ssr_component = (fn) => ({
    render: (props) => {
      let html = '';
      let css = { code: '' };
      const $$result = {
        title: '',
        head: '',
        css: new Set(),
      };
      fn($$result, props, {}, {});
      return { html: $$result.html || html, css, head: $$result.head };
    },
  });

  globalThis.escape = globalThis.$$escapeHTML;
  globalThis.each = (items, fn) => items.map(fn).join('');
  globalThis.add_attribute = (name, value) => value != null ? \` \${name}="\${globalThis.$$escapeHTML(value)}"\` : '';
})(globalThis);
`;
    await this._runtime.eval(svelteRuntime, '__svelte_runtime__.js');
  }

  /**
   * Initialize React SSR runtime
   */
  private async _initReactRuntime(): Promise<void> {
    const reactRuntime = `
// React SSR Runtime Shim
(function(globalThis) {
  // React createElement shim
  const createElement = (type, props, ...children) => {
    return { type, props: props || {}, children: children.flat() };
  };

  // React Fragment
  const Fragment = Symbol.for('react.fragment');

  // Render vnode to string
  const renderVNode = (vnode) => {
    if (vnode == null || vnode === false) return '';
    if (typeof vnode === 'string' || typeof vnode === 'number') {
      return globalThis.$$escapeHTML(String(vnode));
    }
    if (Array.isArray(vnode)) {
      return vnode.map(renderVNode).join('');
    }
    if (typeof vnode !== 'object') return '';

    const { type, props, children } = vnode;

    // Fragment
    if (type === Fragment || type === 'Fragment') {
      return renderVNode(children);
    }

    // Function component
    if (typeof type === 'function') {
      try {
        const result = type({ ...props, children });
        return renderVNode(result);
      } catch (error) {
        return \`<div style="color:red">React Error: \${globalThis.$$escapeHTML(error.message)}</div>\`;
      }
    }

    // HTML element
    if (typeof type === 'string') {
      const attrs = props ? ' ' + Object.entries(props)
        .filter(([k, v]) => k !== 'children' && v != null && v !== false)
        .map(([k, v]) => {
          if (k === 'className') k = 'class';
          if (k === 'htmlFor') k = 'for';
          if (v === true) return k;
          return \`\${k}="\${globalThis.$$escapeHTML(v)}"\`;
        })
        .join(' ') : '';

      const childContent = renderVNode(children || props?.children);

      if (['br', 'hr', 'img', 'input', 'meta', 'link', 'area', 'base', 'col', 'embed', 'source', 'track', 'wbr'].includes(type)) {
        return \`<\${type}\${attrs} />\`;
      }

      return \`<\${type}\${attrs}>\${childContent}</\${type}>\`;
    }

    return '';
  };

  // renderToString
  const renderToString = (element) => {
    try {
      return renderVNode(element);
    } catch (error) {
      return \`<div style="color:red">React SSR Error: \${globalThis.$$escapeHTML(error.message)}</div>\`;
    }
  };

  // renderToStaticMarkup (same as renderToString for our purposes)
  const renderToStaticMarkup = renderToString;

  globalThis.React = {
    createElement,
    Fragment,
  };

  globalThis.ReactDOMServer = {
    renderToString,
    renderToStaticMarkup,
  };

  globalThis.createElement = createElement;
})(globalThis);
`;
    await this._runtime.eval(reactRuntime, '__react_runtime__.js');
  }

  /**
   * Detect framework from code
   */
  detectFramework(code: string, filename: string): SSRFramework {
    // File extension detection
    if (filename.endsWith('.astro')) return 'astro';
    if (filename.endsWith('.vue')) return 'vue';
    if (filename.endsWith('.svelte')) return 'svelte';

    // Content-based detection
    if (code.includes('$$createComponent') || code.includes('createAstro')) return 'astro';
    if (code.includes('defineComponent') || code.includes('createApp') || code.includes('<template>')) return 'vue';
    if (code.includes('SvelteComponent') || code.includes('create_ssr_component')) return 'svelte';
    if (code.includes('createElement') || code.includes('React.') || code.includes('jsx')) return 'react';

    return 'react'; // Default to React
  }

  /**
   * Render component to HTML
   */
  async render(
    code: string,
    filename: string,
    options: MultiSSROptions = {},
  ): Promise<MultiSSRResult> {
    await this.init();

    const startTime = performance.now();
    const framework = options.framework === 'auto' || !options.framework
      ? this.detectFramework(code, filename)
      : options.framework;

    // Check cache
    if (options.cache !== false) {
      const cacheKey = options.cacheKey || this._cache.generateKey(filename, options.props, code);
      const cached = this._cache.get(cacheKey);

      if (cached) {
        return {
          ...cached,
          framework,
          cached: true,
          renderTime: performance.now() - startTime,
        };
      }
    }

    // Initialize framework runtime
    await this._initFramework(framework);

    // Wrap and execute
    const wrappedCode = this._wrapForSSR(code, framework, options);
    const result = await this._runtime.eval(wrappedCode, filename);

    if (!result.success) {
      return {
        html: this._renderError(result.error || 'Unknown error'),
        css: '',
        head: '',
        framework,
        cached: false,
        renderTime: performance.now() - startTime,
        error: result.error,
      };
    }

    // Parse result
    const rendered = this._parseResult(result.value);

    // Cache result
    if (options.cache !== false) {
      const cacheKey = options.cacheKey || this._cache.generateKey(filename, options.props, code);
      this._cache.set(cacheKey, rendered);
    }

    return {
      ...rendered,
      framework,
      cached: false,
      renderTime: performance.now() - startTime,
    };
  }

  /**
   * Wrap code for SSR execution
   */
  private _wrapForSSR(
    code: string,
    framework: SSRFramework,
    options: MultiSSROptions,
  ): string {
    const propsJson = JSON.stringify(options.props || {});
    const slotsJson = JSON.stringify(options.slots || {});

    switch (framework) {
      case 'vue':
        return `
(async function() {
  const __props = ${propsJson};
  ${code}

  // Find component
  const Component = typeof component !== 'undefined' ? component :
                    typeof default_1 !== 'undefined' ? default_1 :
                    typeof exports !== 'undefined' ? exports.default : null;

  if (Component) {
    const html = await renderToString(Component, { props: __props });
    return JSON.stringify({ html, css: '', head: '' });
  }
  return JSON.stringify({ html: '', css: '', head: '' });
})();
`;

      case 'svelte':
        return `
(async function() {
  const __props = ${propsJson};
  ${code}

  const Component = typeof component !== 'undefined' ? component :
                    typeof default_1 !== 'undefined' ? default_1 : null;

  if (Component) {
    const result = svelteRender(Component, __props);
    return JSON.stringify({
      html: result.html || '',
      css: result.css?.code || '',
      head: result.head || '',
    });
  }
  return JSON.stringify({ html: '', css: '', head: '' });
})();
`;

      case 'react':
        return `
(async function() {
  const __props = ${propsJson};
  ${code}

  const Component = typeof App !== 'undefined' ? App :
                    typeof component !== 'undefined' ? component :
                    typeof default_1 !== 'undefined' ? default_1 : null;

  if (Component) {
    const element = typeof Component === 'function'
      ? createElement(Component, __props)
      : Component;
    const html = ReactDOMServer.renderToString(element);
    return JSON.stringify({ html, css: '', head: '' });
  }
  return JSON.stringify({ html: '', css: '', head: '' });
})();
`;

      case 'astro':
      default:
        return `
(async function() {
  const __props = ${propsJson};
  const __slots = ${slotsJson};
  ${code}

  const Component = typeof $$Component !== 'undefined' ? $$Component :
                    typeof Component !== 'undefined' ? Component : null;

  if (Component && Astro.renderToString) {
    const result = await Astro.renderToString(Component, __props, __slots);
    return JSON.stringify(result);
  }

  if (typeof Component === 'function') {
    const html = await Component(__props);
    return JSON.stringify({ html: String(html || ''), css: '', head: '' });
  }

  return JSON.stringify({ html: '', css: '', head: '' });
})();
`;
    }
  }

  /**
   * Parse execution result
   */
  private _parseResult(value: unknown): { html: string; css: string; head: string } {
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
   * Render error HTML
   */
  private _renderError(message: string): string {
    return `<!DOCTYPE html>
<html><head><title>SSR Error</title>
<style>body{font-family:system-ui;padding:40px;background:#1a1a1a;color:#fff}
.error{background:#2d1b1b;border:1px solid #ff4444;padding:20px;border-radius:8px}
h1{color:#ff6b6b}pre{background:#0d0d0d;padding:15px;border-radius:4px;overflow-x:auto}</style>
</head><body><div class="error"><h1>SSR Error</h1><pre>${message.replace(/</g, '&lt;')}</pre></div></body></html>`;
  }

  /**
   * Destroy the renderer
   */
  destroy(): void {
    this._runtime.destroy();
    this._cache.clear();
    this._frameworksInitialized.clear();
    this._initPromise = null;
    this._status = 'idle';
    logger.info('MultiFrameworkSSR destroyed');
  }
}

/**
 * Factory function
 */
export function createMultiFrameworkSSR(): MultiFrameworkSSR {
  return new MultiFrameworkSSR();
}

/**
 * Singleton instance
 */
let _sharedRenderer: MultiFrameworkSSR | null = null;

export function getSharedMultiFrameworkSSR(): MultiFrameworkSSR {
  if (!_sharedRenderer) {
    _sharedRenderer = createMultiFrameworkSSR();
  }
  return _sharedRenderer;
}

export function resetSharedMultiFrameworkSSR(): void {
  if (_sharedRenderer) {
    _sharedRenderer.destroy();
    _sharedRenderer = null;
  }
}
