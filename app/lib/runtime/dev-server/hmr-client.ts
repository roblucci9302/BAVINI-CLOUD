/**
 * =============================================================================
 * BAVINI Dev Server - HMR Client Runtime
 * =============================================================================
 * Client-side HMR runtime that handles hot module updates.
 * This code is injected into the preview iframe.
 * =============================================================================
 */

import type { HMRPayload, HMRUpdate, HMRError } from './types';

/**
 * HMR Client configuration
 */
interface HMRClientConfig {
  protocol: 'ws' | 'wss';
  host: string;
  port: number;
  path: string;
  timeout: number;
  overlay: boolean;
}

/**
 * Module hot context
 */
interface HotContext {
  /** Accept self updates */
  accept(callback?: (mod: unknown) => void): void;
  /** Accept dependency updates */
  acceptDeps(deps: string | string[], callback?: (mods: unknown[]) => void): void;
  /** Dispose callback */
  dispose(callback: (data: unknown) => void): void;
  /** Prune callback */
  prune(callback: (data: unknown) => void): void;
  /** Invalidate - trigger parent update */
  invalidate(): void;
  /** Decline HMR */
  decline(): void;
  /** Custom data storage */
  data: Record<string, unknown>;
}

/**
 * Module registration
 */
interface ModuleRegistration {
  id: string;
  acceptCallback?: (mod: unknown) => void;
  acceptDepsCallbacks: Map<string, (mods: unknown[]) => void>;
  disposeCallback?: (data: unknown) => void;
  pruneCallback?: (data: unknown) => void;
  declined: boolean;
  data: Record<string, unknown>;
}

/**
 * HMR Client class
 */
class HMRClient {
  private config: HMRClientConfig;
  private socket: WebSocket | null = null;
  private connected = false;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 10;
  private reconnectDelay = 1000;
  private modules = new Map<string, ModuleRegistration>();
  private pendingUpdates: HMRUpdate[] = [];
  private overlay: HTMLElement | null = null;

  constructor(config: Partial<HMRClientConfig> = {}) {
    this.config = {
      protocol: config.protocol || 'ws',
      host: config.host || 'localhost',
      port: config.port || 3000,
      path: config.path || '/__hmr',
      timeout: config.timeout || 30000,
      overlay: config.overlay !== false,
    };
  }

  /**
   * Connect to HMR server
   */
  connect(): void {
    if (this.socket) {
      return;
    }

    const url = `${this.config.protocol}://${this.config.host}:${this.config.port}${this.config.path}`;

    try {
      this.socket = new WebSocket(url);

      this.socket.onopen = () => {
        this.connected = true;
        this.reconnectAttempts = 0;
        console.log('[HMR] Connected to dev server');
        this.hideOverlay();
      };

      this.socket.onmessage = (event) => {
        this.handleMessage(JSON.parse(event.data));
      };

      this.socket.onclose = () => {
        this.connected = false;
        this.socket = null;
        console.log('[HMR] Disconnected from dev server');
        this.scheduleReconnect();
      };

      this.socket.onerror = (error) => {
        console.error('[HMR] WebSocket error:', error);
      };
    } catch (error) {
      console.error('[HMR] Failed to connect:', error);
      this.scheduleReconnect();
    }
  }

  /**
   * Schedule reconnection attempt
   */
  private scheduleReconnect(): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error('[HMR] Max reconnection attempts reached');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    console.log(`[HMR] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    setTimeout(() => {
      this.connect();
    }, delay);
  }

  /**
   * Handle incoming message
   */
  private handleMessage(payload: HMRPayload): void {
    switch (payload.type) {
      case 'connected':
        console.log('[HMR] Server ready');
        break;

      case 'update':
        if (payload.updates) {
          this.handleUpdate(payload.updates);
        }
        break;

      case 'full-reload':
        console.log('[HMR] Full reload required');
        window.location.reload();
        break;

      case 'prune':
        // Handle module pruning (removed files)
        break;

      case 'error':
        if (payload.error) {
          this.handleError(payload.error);
        }
        break;

      case 'custom':
        // Emit custom event
        window.dispatchEvent(
          new CustomEvent(`hmr:${payload.event}`, { detail: payload.data })
        );
        break;
    }
  }

  /**
   * Handle module updates
   */
  private async handleUpdate(updates: HMRUpdate[]): Promise<void> {
    this.hideOverlay();

    for (const update of updates) {
      console.log(`[HMR] Updating ${update.path}`);

      if (update.type === 'css-update') {
        await this.updateCSS(update);
      } else {
        await this.updateModule(update);
      }
    }
  }

  /**
   * Update CSS module
   */
  private async updateCSS(update: HMRUpdate): Promise<void> {
    const links = document.querySelectorAll<HTMLLinkElement>('link[rel="stylesheet"]');

    for (const link of links) {
      const url = new URL(link.href);
      if (url.pathname === update.path) {
        // Add timestamp to bust cache
        url.searchParams.set('t', String(update.timestamp));
        link.href = url.toString();
        return;
      }
    }

    // Check style tags (for CSS-in-JS)
    const styles = document.querySelectorAll<HTMLStyleElement>('style[data-hmr-id]');
    for (const style of styles) {
      if (style.dataset.hmrId === update.path) {
        // Fetch new CSS
        const response = await fetch(`${update.path}?t=${update.timestamp}`);
        const css = await response.text();
        style.textContent = css;
        return;
      }
    }
  }

  /**
   * Update JavaScript module
   */
  private async updateModule(update: HMRUpdate): Promise<void> {
    const mod = this.modules.get(update.acceptedPath);

    if (!mod) {
      console.warn(`[HMR] No HMR handler for ${update.acceptedPath}, full reload`);
      window.location.reload();
      return;
    }

    if (mod.declined) {
      console.log(`[HMR] Module ${update.acceptedPath} declined HMR, full reload`);
      window.location.reload();
      return;
    }

    // Call dispose callback
    if (mod.disposeCallback) {
      mod.disposeCallback(mod.data);
    }

    try {
      // Import updated module
      const newModule = await import(`${update.path}?t=${update.timestamp}`);

      // Call accept callback
      if (mod.acceptCallback) {
        mod.acceptCallback(newModule);
      }

      // Call deps callbacks
      for (const [dep, callback] of mod.acceptDepsCallbacks) {
        if (dep === update.path) {
          callback([newModule]);
        }
      }

      console.log(`[HMR] Updated ${update.path}`);
    } catch (error) {
      console.error(`[HMR] Failed to update ${update.path}:`, error);
      window.location.reload();
    }
  }

  /**
   * Handle error
   */
  private handleError(error: HMRError): void {
    console.error('[HMR] Build error:', error.message);

    if (this.config.overlay) {
      this.showOverlay(error);
    }
  }

  /**
   * Show error overlay
   */
  private showOverlay(error: HMRError): void {
    this.hideOverlay();

    const overlay = document.createElement('div');
    overlay.id = 'hmr-error-overlay';
    overlay.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0, 0, 0, 0.85);
      color: #fff;
      font-family: 'SF Mono', Monaco, Consolas, monospace;
      font-size: 14px;
      padding: 40px;
      box-sizing: border-box;
      overflow: auto;
      z-index: 999999;
    `;

    const content = document.createElement('div');
    content.style.cssText = `
      max-width: 900px;
      margin: 0 auto;
    `;

    // Title
    const title = document.createElement('h1');
    title.textContent = 'Build Error';
    title.style.cssText = `
      color: #ff5555;
      font-size: 24px;
      margin: 0 0 20px 0;
    `;
    content.appendChild(title);

    // Message
    const message = document.createElement('div');
    message.textContent = error.message;
    message.style.cssText = `
      color: #ff8888;
      white-space: pre-wrap;
      margin-bottom: 20px;
    `;
    content.appendChild(message);

    // File location
    if (error.loc) {
      const loc = document.createElement('div');
      loc.textContent = `${error.loc.file}:${error.loc.line}:${error.loc.column}`;
      loc.style.cssText = `
        color: #888;
        margin-bottom: 10px;
      `;
      content.appendChild(loc);
    }

    // Code frame
    if (error.frame) {
      const frame = document.createElement('pre');
      frame.textContent = error.frame;
      frame.style.cssText = `
        background: rgba(255, 255, 255, 0.1);
        padding: 20px;
        border-radius: 8px;
        overflow: auto;
        margin: 20px 0;
      `;
      content.appendChild(frame);
    }

    // Stack trace
    if (error.stack) {
      const stack = document.createElement('pre');
      stack.textContent = error.stack;
      stack.style.cssText = `
        color: #888;
        font-size: 12px;
        margin-top: 20px;
      `;
      content.appendChild(stack);
    }

    // Close button
    const closeBtn = document.createElement('button');
    closeBtn.textContent = '× Close';
    closeBtn.style.cssText = `
      position: absolute;
      top: 20px;
      right: 20px;
      background: transparent;
      border: 1px solid #666;
      color: #fff;
      padding: 8px 16px;
      cursor: pointer;
      border-radius: 4px;
    `;
    closeBtn.onclick = () => this.hideOverlay();
    overlay.appendChild(closeBtn);

    overlay.appendChild(content);
    document.body.appendChild(overlay);
    this.overlay = overlay;
  }

  /**
   * Hide error overlay
   */
  private hideOverlay(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  /**
   * Create hot context for a module
   */
  createHotContext(moduleId: string): HotContext {
    let registration = this.modules.get(moduleId);

    if (!registration) {
      registration = {
        id: moduleId,
        acceptDepsCallbacks: new Map(),
        declined: false,
        data: {},
      };
      this.modules.set(moduleId, registration);
    }

    const hot: HotContext = {
      accept: (callback) => {
        registration!.acceptCallback = callback || (() => {});
      },

      acceptDeps: (deps, callback) => {
        const depsArray = Array.isArray(deps) ? deps : [deps];
        for (const dep of depsArray) {
          registration!.acceptDepsCallbacks.set(dep, callback || (() => {}));
        }
      },

      dispose: (callback) => {
        registration!.disposeCallback = callback;
      },

      prune: (callback) => {
        registration!.pruneCallback = callback;
      },

      invalidate: () => {
        // Notify server to re-process parent
        this.send({ type: 'invalidate', path: moduleId });
      },

      decline: () => {
        registration!.declined = true;
      },

      data: registration.data,
    };

    return hot;
  }

  /**
   * Send message to server
   */
  private send(message: unknown): void {
    if (this.socket && this.connected) {
      this.socket.send(JSON.stringify(message));
    }
  }

  /**
   * Disconnect from server
   */
  disconnect(): void {
    if (this.socket) {
      this.socket.close();
      this.socket = null;
    }
    this.connected = false;
  }
}

/**
 * Generate HMR client code to inject into preview
 */
export function generateHMRClientCode(config: Partial<HMRClientConfig> = {}): string {
  return `
(function() {
  // HMR Client Configuration
  const config = ${JSON.stringify(config)};

  // Module registrations
  const modules = new Map();
  let socket = null;
  let connected = false;
  let overlay = null;

  // Create WebSocket connection
  function connect() {
    const protocol = config.protocol || 'ws';
    const host = config.host || window.location.hostname || 'localhost';
    const port = config.port || window.location.port || 3000;
    const path = config.path || '/__hmr';

    const url = protocol + '://' + host + ':' + port + path;

    try {
      socket = new WebSocket(url);

      socket.onopen = function() {
        connected = true;
        console.log('[HMR] Connected');
        hideOverlay();
      };

      socket.onmessage = function(event) {
        handleMessage(JSON.parse(event.data));
      };

      socket.onclose = function() {
        connected = false;
        socket = null;
        console.log('[HMR] Disconnected, reconnecting...');
        setTimeout(connect, 1000);
      };

      socket.onerror = function(error) {
        console.error('[HMR] Error:', error);
      };
    } catch (e) {
      console.error('[HMR] Connection failed:', e);
      setTimeout(connect, 1000);
    }
  }

  // Handle incoming messages
  function handleMessage(payload) {
    switch (payload.type) {
      case 'connected':
        console.log('[HMR] Server ready');
        break;
      case 'update':
        handleUpdate(payload.updates || []);
        break;
      case 'full-reload':
        console.log('[HMR] Full reload');
        window.location.reload();
        break;
      case 'error':
        handleError(payload.error);
        break;
    }
  }

  // Handle module updates
  async function handleUpdate(updates) {
    hideOverlay();
    for (const update of updates) {
      console.log('[HMR] Updating', update.path);
      if (update.type === 'css-update') {
        updateCSS(update);
      } else {
        await updateModule(update);
      }
    }
  }

  // Update CSS
  function updateCSS(update) {
    const links = document.querySelectorAll('link[rel="stylesheet"]');
    for (const link of links) {
      const url = new URL(link.href);
      if (url.pathname === update.path || url.pathname.endsWith(update.path)) {
        url.searchParams.set('t', update.timestamp);
        link.href = url.toString();
        return;
      }
    }
    // Fallback: reload all CSS
    links.forEach(function(link) {
      const url = new URL(link.href);
      url.searchParams.set('t', Date.now());
      link.href = url.toString();
    });
  }

  // Update JS module
  async function updateModule(update) {
    const mod = modules.get(update.acceptedPath);
    if (!mod || mod.declined) {
      window.location.reload();
      return;
    }
    if (mod.dispose) mod.dispose(mod.data);
    try {
      const newMod = await import(update.path + '?t=' + update.timestamp);
      if (mod.accept) mod.accept(newMod);
      console.log('[HMR] Updated', update.path);
    } catch (e) {
      console.error('[HMR] Update failed:', e);
      window.location.reload();
    }
  }

  // Handle error
  function handleError(error) {
    console.error('[HMR] Error:', error.message);
    if (config.overlay !== false) showOverlay(error);
  }

  // Show error overlay
  function showOverlay(error) {
    hideOverlay();
    const el = document.createElement('div');
    el.id = 'hmr-overlay';
    el.innerHTML = '<div style="position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.9);color:#fff;font-family:monospace;padding:40px;box-sizing:border-box;z-index:999999;overflow:auto"><h1 style="color:#ff5555;margin:0 0 20px">Build Error</h1><pre style="color:#ff8888;white-space:pre-wrap">' + escapeHtml(error.message) + '</pre>' + (error.frame ? '<pre style="background:rgba(255,255,255,0.1);padding:20px;border-radius:8px;margin:20px 0">' + escapeHtml(error.frame) + '</pre>' : '') + '<button onclick="this.parentElement.parentElement.remove()" style="position:absolute;top:20px;right:20px;background:transparent;border:1px solid #666;color:#fff;padding:8px 16px;cursor:pointer;border-radius:4px">Close</button></div>';
    document.body.appendChild(el);
    overlay = el;
  }

  function hideOverlay() {
    if (overlay) { overlay.remove(); overlay = null; }
  }

  function escapeHtml(str) {
    return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Create hot context for modules
  window.__BAVINI_HMR__ = {
    createHotContext: function(id) {
      let mod = modules.get(id);
      if (!mod) {
        mod = { id: id, data: {}, declined: false };
        modules.set(id, mod);
      }
      return {
        accept: function(cb) { mod.accept = cb || function(){}; },
        dispose: function(cb) { mod.dispose = cb; },
        decline: function() { mod.declined = true; },
        invalidate: function() { if (socket && connected) socket.send(JSON.stringify({type:'invalidate',path:id})); },
        data: mod.data
      };
    }
  };

  // Auto-connect
  connect();
})();
`;
}

// Export for use in dev server
export { HMRClient };
export type { HMRClientConfig, HotContext };
