/**
 * =============================================================================
 * BAVINI Dev Server - CSS HMR Plugin
 * =============================================================================
 * Enables Hot Module Replacement for CSS files and preprocessors.
 * =============================================================================
 */

import type { DevServerPlugin, TransformResult, PluginContext, HotUpdateContext, ModuleNode } from '../types';

/**
 * CSS HMR runtime code
 * Handles CSS hot updates by replacing style tags
 */
const CSS_HMR_RUNTIME = `
const __CSS_HMR_RUNTIME__ = {
  styles: new Map(),

  // Add or update a style
  updateStyle(id, css) {
    let style = this.styles.get(id);

    if (!style) {
      style = document.createElement('style');
      style.setAttribute('data-bavini-css-id', id);
      style.setAttribute('type', 'text/css');
      document.head.appendChild(style);
      this.styles.set(id, style);
    }

    style.textContent = css;
  },

  // Remove a style
  removeStyle(id) {
    const style = this.styles.get(id);
    if (style) {
      style.remove();
      this.styles.delete(id);
    }
  },

  // Get all style IDs
  getStyleIds() {
    return Array.from(this.styles.keys());
  }
};

// Expose globally
window.__CSS_HMR_RUNTIME__ = __CSS_HMR_RUNTIME__;

export default __CSS_HMR_RUNTIME__;
`;

/**
 * Generate JS module wrapper for CSS
 */
function wrapCSSAsJS(css: string, id: string): string {
  const escapedCSS = JSON.stringify(css);
  const escapedId = JSON.stringify(id);

  return `
import __CSS_HMR_RUNTIME__ from '/@css-hmr';

const css = ${escapedCSS};
const id = ${escapedId};

// Update style immediately
__CSS_HMR_RUNTIME__.updateStyle(id, css);

// HMR handling
if (import.meta.hot) {
  import.meta.hot.accept();

  // Prune handler - remove style when module is disposed
  import.meta.hot.prune(() => {
    __CSS_HMR_RUNTIME__.removeStyle(id);
  });
}

export default css;
`;
}

/**
 * Check if file is a CSS file
 */
function isCSSFile(id: string): boolean {
  const ext = id.split('.').pop()?.toLowerCase();
  return ['css', 'scss', 'sass', 'less', 'styl', 'stylus'].includes(ext || '');
}

/**
 * Check if CSS is imported as module
 */
function isCSSModule(id: string): boolean {
  return id.includes('.module.css') || id.includes('.module.scss');
}

/**
 * Simple SCSS to CSS transformation (basic nesting support)
 * For production, use actual sass compiler
 */
function processCSS(css: string, lang: string): string {
  // For now, return as-is (actual preprocessing would happen in build)
  // This is a placeholder for SCSS/LESS/Stylus processing
  if (lang === 'css') {
    return css;
  }

  // Basic variable replacement for SCSS-like syntax
  const variables = new Map<string, string>();

  // Extract variables
  const varRegex = /\$([a-zA-Z_][a-zA-Z0-9_-]*)\s*:\s*([^;]+);/g;
  let match;
  while ((match = varRegex.exec(css)) !== null) {
    variables.set(match[1], match[2].trim());
  }

  // Replace variable usages
  let result = css;
  variables.forEach((value, name) => {
    result = result.replace(new RegExp(`\\$${name}`, 'g'), value);
  });

  // Remove variable declarations
  result = result.replace(varRegex, '');

  return result;
}

/**
 * Extract CSS from source with sourcemap support
 */
function extractCSS(code: string, id: string): { css: string; map?: string } {
  const lang = id.split('.').pop()?.toLowerCase() || 'css';
  const css = processCSS(code, lang);

  return {
    css,
    map: undefined, // Could generate sourcemap here
  };
}

/**
 * Create CSS HMR plugin
 */
export function cssHMRPlugin(): DevServerPlugin {
  return {
    name: 'bavini:css-hmr',

    configureServer(server) {
      // Register route for CSS HMR runtime
      server.route('/@css-hmr', async () => ({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Type': 'application/javascript' }),
        body: CSS_HMR_RUNTIME,
      }));
    },

    transform(code: string, id: string, _ctx: PluginContext): TransformResult | null {
      // Only handle CSS files
      if (!isCSSFile(id)) {
        return null;
      }

      // Extract and process CSS
      const { css } = extractCSS(code, id);

      // CSS Modules handling
      if (isCSSModule(id)) {
        return transformCSSModule(css, id);
      }

      // Regular CSS - wrap as JS module
      const wrappedCode = wrapCSSAsJS(css, id);

      return {
        code: wrappedCode,
        deps: ['/@css-hmr'],
      };
    },

    handleHotUpdate(ctx: HotUpdateContext): ModuleNode[] | void {
      // Get CSS modules that changed
      const cssModules = ctx.modules.filter(mod => mod.type === 'css' || isCSSFile(mod.url));

      if (cssModules.length === 0) {
        return;
      }

      // CSS updates are self-accepting
      // Send css-update type for client
      ctx.send({
        type: 'update',
        updates: cssModules.map(mod => ({
          type: 'css-update',
          path: mod.url,
          acceptedPath: mod.url,
          timestamp: ctx.timestamp,
        })),
      });

      return cssModules;
    },
  };
}

/**
 * Transform CSS Module to JS with class name mapping
 */
function transformCSSModule(css: string, id: string): TransformResult {
  // Extract class names from CSS
  const classNames = new Map<string, string>();
  const classRegex = /\.([a-zA-Z_][a-zA-Z0-9_-]*)/g;
  let match;

  while ((match = classRegex.exec(css)) !== null) {
    const originalName = match[1];
    // Generate unique class name
    const hash = simpleHash(id + originalName);
    const scopedName = `${originalName}_${hash}`;
    classNames.set(originalName, scopedName);
  }

  // Replace class names in CSS
  let scopedCSS = css;
  classNames.forEach((scopedName, originalName) => {
    scopedCSS = scopedCSS.replace(
      new RegExp(`\\.${originalName}(?![a-zA-Z0-9_-])`, 'g'),
      `.${scopedName}`
    );
  });

  // Build exports object
  const exportsObj: Record<string, string> = {};
  classNames.forEach((scopedName, originalName) => {
    exportsObj[originalName] = scopedName;
  });

  const wrappedCode = `
import __CSS_HMR_RUNTIME__ from '/@css-hmr';

const css = ${JSON.stringify(scopedCSS)};
const id = ${JSON.stringify(id)};

// Update style immediately
__CSS_HMR_RUNTIME__.updateStyle(id, css);

// Class name exports
const styles = ${JSON.stringify(exportsObj)};

// HMR handling
if (import.meta.hot) {
  import.meta.hot.accept();
  import.meta.hot.prune(() => {
    __CSS_HMR_RUNTIME__.removeStyle(id);
  });
}

export default styles;
`;

  return {
    code: wrappedCode,
    deps: ['/@css-hmr'],
  };
}

/**
 * Simple hash function for CSS module scoping
 */
function simpleHash(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(36).slice(0, 6);
}

export default cssHMRPlugin;
