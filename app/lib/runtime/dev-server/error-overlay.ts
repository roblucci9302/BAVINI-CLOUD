/**
 * =============================================================================
 * BAVINI Dev Server - Error Overlay
 * =============================================================================
 * Displays build errors in the browser preview as an overlay.
 * =============================================================================
 */

import type { HMRError } from './types';

/**
 * Error overlay configuration
 */
export interface ErrorOverlayConfig {
  /** Custom theme colors */
  theme?: Partial<ErrorOverlayTheme>;
  /** Position of the overlay */
  position?: 'top' | 'bottom' | 'center';
  /** Show close button */
  dismissible?: boolean;
}

interface ErrorOverlayTheme {
  background: string;
  foreground: string;
  errorColor: string;
  warningColor: string;
  borderColor: string;
  codeBackground: string;
  codeForeground: string;
  highlightLine: string;
}

const DEFAULT_THEME: ErrorOverlayTheme = {
  background: '#1e1e1e',
  foreground: '#d4d4d4',
  errorColor: '#f44747',
  warningColor: '#cca700',
  borderColor: '#3c3c3c',
  codeBackground: '#252526',
  codeForeground: '#d4d4d4',
  highlightLine: 'rgba(244, 71, 71, 0.2)',
};

/**
 * Generate error overlay styles
 */
function generateStyles(theme: ErrorOverlayTheme): string {
  return `
    :host {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 99999;
      --bavini-bg: ${theme.background};
      --bavini-fg: ${theme.foreground};
      --bavini-error: ${theme.errorColor};
      --bavini-warning: ${theme.warningColor};
      --bavini-border: ${theme.borderColor};
      --bavini-code-bg: ${theme.codeBackground};
      --bavini-code-fg: ${theme.codeForeground};
      --bavini-highlight: ${theme.highlightLine};
    }

    .overlay {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0, 0, 0, 0.85);
      backdrop-filter: blur(4px);
      display: flex;
      align-items: flex-start;
      justify-content: center;
      overflow-y: auto;
      padding: 20px;
      box-sizing: border-box;
    }

    .container {
      max-width: 800px;
      width: 100%;
      background: var(--bavini-bg);
      border: 1px solid var(--bavini-border);
      border-radius: 8px;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.5);
      margin: auto;
    }

    .header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--bavini-border);
    }

    .title {
      display: flex;
      align-items: center;
      gap: 10px;
      margin: 0;
      font-size: 16px;
      font-weight: 600;
      color: var(--bavini-error);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .icon {
      width: 24px;
      height: 24px;
      fill: currentColor;
    }

    .close-btn {
      background: none;
      border: none;
      color: var(--bavini-fg);
      cursor: pointer;
      padding: 8px;
      border-radius: 4px;
      transition: background 0.2s;
    }

    .close-btn:hover {
      background: rgba(255, 255, 255, 0.1);
    }

    .content {
      padding: 20px;
    }

    .message {
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 14px;
      line-height: 1.6;
      color: var(--bavini-fg);
      margin: 0 0 16px 0;
      white-space: pre-wrap;
      word-break: break-word;
    }

    .file-info {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 12px 16px;
      background: var(--bavini-code-bg);
      border-radius: 6px;
      margin-bottom: 16px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      color: var(--bavini-fg);
    }

    .file-path {
      color: var(--bavini-error);
      text-decoration: none;
    }

    .location {
      color: var(--bavini-warning);
    }

    .frame {
      background: var(--bavini-code-bg);
      border-radius: 6px;
      overflow: hidden;
      margin-bottom: 16px;
    }

    .frame-header {
      padding: 10px 16px;
      border-bottom: 1px solid var(--bavini-border);
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .frame-code {
      padding: 16px;
      overflow-x: auto;
    }

    .frame-line {
      display: flex;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 13px;
      line-height: 1.6;
    }

    .frame-line.highlight {
      background: var(--bavini-highlight);
    }

    .line-number {
      flex: 0 0 48px;
      padding-right: 16px;
      text-align: right;
      color: rgba(255, 255, 255, 0.3);
      user-select: none;
    }

    .line-content {
      flex: 1;
      color: var(--bavini-code-fg);
      white-space: pre;
    }

    .stack {
      margin-top: 16px;
    }

    .stack-title {
      font-size: 12px;
      color: rgba(255, 255, 255, 0.5);
      margin-bottom: 8px;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }

    .stack-trace {
      background: var(--bavini-code-bg);
      border-radius: 6px;
      padding: 16px;
      font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
      font-size: 12px;
      line-height: 1.6;
      color: rgba(255, 255, 255, 0.7);
      overflow-x: auto;
      white-space: pre;
    }

    .plugin-info {
      display: inline-block;
      padding: 4px 8px;
      background: rgba(255, 255, 255, 0.1);
      border-radius: 4px;
      font-size: 12px;
      color: rgba(255, 255, 255, 0.6);
      margin-bottom: 16px;
    }

    .tip {
      display: flex;
      align-items: flex-start;
      gap: 10px;
      padding: 12px 16px;
      background: rgba(204, 167, 0, 0.1);
      border-left: 3px solid var(--bavini-warning);
      border-radius: 0 6px 6px 0;
      margin-top: 16px;
    }

    .tip-icon {
      flex-shrink: 0;
      width: 16px;
      height: 16px;
      fill: var(--bavini-warning);
    }

    .tip-text {
      font-size: 13px;
      color: var(--bavini-fg);
      line-height: 1.5;
    }
  `;
}

/**
 * Generate error overlay HTML
 */
function generateOverlayHTML(errors: HMRError[], config: ErrorOverlayConfig): string {
  const theme = { ...DEFAULT_THEME, ...config.theme };
  const error = errors[0]; // Show first error

  const fileInfo = error.id || error.loc?.file || 'Unknown file';
  const location = error.loc
    ? `${error.loc.line}:${error.loc.column}`
    : '';

  const frameHTML = error.frame
    ? `
      <div class="frame">
        <div class="frame-header">Code Frame</div>
        <div class="frame-code">${formatCodeFrame(error.frame)}</div>
      </div>
    `
    : '';

  const stackHTML = error.stack
    ? `
      <div class="stack">
        <div class="stack-title">Stack Trace</div>
        <div class="stack-trace">${escapeHTML(cleanStack(error.stack))}</div>
      </div>
    `
    : '';

  const pluginHTML = error.plugin
    ? `<div class="plugin-info">Plugin: ${escapeHTML(error.plugin)}</div>`
    : '';

  return `
    <style>${generateStyles(theme)}</style>
    <div class="overlay">
      <div class="container">
        <div class="header">
          <h1 class="title">
            <svg class="icon" viewBox="0 0 24 24">
              <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/>
            </svg>
            Build Error
          </h1>
          ${config.dismissible ? `
            <button class="close-btn" onclick="this.getRootNode().host.remove()">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/>
              </svg>
            </button>
          ` : ''}
        </div>
        <div class="content">
          ${pluginHTML}
          <div class="file-info">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" opacity="0.5">
              <path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/>
            </svg>
            <span class="file-path">${escapeHTML(fileInfo)}</span>
            ${location ? `<span class="location">:${location}</span>` : ''}
          </div>
          <pre class="message">${escapeHTML(error.message)}</pre>
          ${frameHTML}
          ${stackHTML}
          <div class="tip">
            <svg class="tip-icon" viewBox="0 0 24 24">
              <path d="M9 21c0 .55.45 1 1 1h4c.55 0 1-.45 1-1v-1H9v1zm3-19C8.14 2 5 5.14 5 9c0 2.38 1.19 4.47 3 5.74V17c0 .55.45 1 1 1h6c.55 0 1-.45 1-1v-2.26c1.81-1.27 3-3.36 3-5.74 0-3.86-3.14-7-7-7zm2.85 11.1l-.85.6V16h-4v-2.3l-.85-.6C7.8 12.16 7 10.63 7 9c0-2.76 2.24-5 5-5s5 2.24 5 5c0 1.63-.8 3.16-2.15 4.1z"/>
            </svg>
            <span class="tip-text">
              Fix the error above and save the file. The page will automatically reload.
            </span>
          </div>
        </div>
      </div>
    </div>
  `;
}

/**
 * Format code frame with line highlighting
 */
function formatCodeFrame(frame: string): string {
  const lines = frame.split('\n');

  return lines
    .map(line => {
      const isHighlighted = line.startsWith('>') || line.includes('^');
      const lineNum = line.match(/^\s*(\d+)/)?.[1] || '';
      const content = line.replace(/^\s*\d*\s*[|>]?\s?/, '');

      return `
        <div class="frame-line ${isHighlighted ? 'highlight' : ''}">
          <span class="line-number">${lineNum}</span>
          <span class="line-content">${escapeHTML(content)}</span>
        </div>
      `;
    })
    .join('');
}

/**
 * Clean stack trace for display
 */
function cleanStack(stack: string): string {
  return stack
    .split('\n')
    .filter(line => !line.includes('node_modules') || line.includes('(internal'))
    .slice(0, 10)
    .join('\n');
}

/**
 * Escape HTML special characters
 */
function escapeHTML(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Generate error overlay code as a string for injection
 */
export function generateErrorOverlayCode(config: Partial<ErrorOverlayConfig> = {}): string {
  const fullConfig: ErrorOverlayConfig = {
    position: 'center',
    dismissible: true,
    ...config,
  };

  return `
(function() {
  const OVERLAY_ID = 'bavini-error-overlay';

  class ErrorOverlay extends HTMLElement {
    constructor() {
      super();
      this.attachShadow({ mode: 'open' });
    }

    show(errors) {
      this.shadowRoot.innerHTML = ${JSON.stringify(generateOverlayHTML([], fullConfig)).replace(/\[\]/, 'errors')};
    }

    static show(errors) {
      let overlay = document.getElementById(OVERLAY_ID);
      if (!overlay) {
        overlay = document.createElement('bavini-error-overlay');
        overlay.id = OVERLAY_ID;
        document.body.appendChild(overlay);
      }
      overlay.show(errors);
    }

    static hide() {
      const overlay = document.getElementById(OVERLAY_ID);
      if (overlay) {
        overlay.remove();
      }
    }
  }

  if (!customElements.get('bavini-error-overlay')) {
    customElements.define('bavini-error-overlay', ErrorOverlay);
  }

  window.__BAVINI_ERROR_OVERLAY__ = ErrorOverlay;
})();
`;
}

/**
 * Create error overlay instance that can be injected into iframe
 */
export function createErrorOverlay(
  errors: HMRError[],
  config: Partial<ErrorOverlayConfig> = {},
): string {
  const fullConfig: ErrorOverlayConfig = {
    position: 'center',
    dismissible: true,
    ...config,
  };

  const html = generateOverlayHTML(errors, fullConfig);

  // Return as custom element HTML
  return `
    <bavini-error-overlay>
      <template shadowrootmode="open">
        ${html}
      </template>
    </bavini-error-overlay>
  `;
}

export default {
  generateErrorOverlayCode,
  createErrorOverlay,
};
