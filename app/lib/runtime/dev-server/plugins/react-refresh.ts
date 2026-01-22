/**
 * =============================================================================
 * BAVINI Dev Server - React Fast Refresh Plugin
 * =============================================================================
 * Enables React Fast Refresh for HMR in React applications.
 * =============================================================================
 */

import type { DevServerPlugin, TransformResult, PluginContext, HotUpdateContext, ModuleNode } from '../types';

/**
 * React Refresh preamble code
 * Injected at the top of every React component file
 */
const REACT_REFRESH_PREAMBLE = `
import RefreshRuntime from '/@react-refresh';
if (import.meta.hot) {
  RefreshRuntime.injectIntoGlobalHook(window);
  window.$RefreshReg$ = () => {};
  window.$RefreshSig$ = () => (type) => type;
  window.__BAVINI_HMR_RUNTIME__ = RefreshRuntime;
}
`;

/**
 * React Refresh footer code
 * Injected at the bottom of every React component file
 */
const REACT_REFRESH_FOOTER = `
if (import.meta.hot) {
  window.$RefreshReg$ = (type, id) => {
    window.__BAVINI_HMR_RUNTIME__.register(type, __MODULE_ID__ + " " + id);
  };
  window.$RefreshSig$ = window.__BAVINI_HMR_RUNTIME__.createSignatureFunctionForTransform;
}
`;

/**
 * React Refresh HMR footer
 * Handles the actual HMR update
 */
const REACT_REFRESH_HMR = `
if (import.meta.hot) {
  import.meta.hot.accept();
  if (!window.__BAVINI_HMR_TIMEOUT__) {
    window.__BAVINI_HMR_TIMEOUT__ = setTimeout(() => {
      window.__BAVINI_HMR_TIMEOUT__ = undefined;
      window.__BAVINI_HMR_RUNTIME__.performReactRefresh();
    }, 30);
  }
}
`;

/**
 * React Refresh Runtime code
 * Minimal implementation for browser-based HMR
 */
const REACT_REFRESH_RUNTIME = `
const RefreshRuntime = {
  registrations: new Map(),
  signature: null,

  injectIntoGlobalHook(global) {
    // React DevTools integration point
    const hook = global.__REACT_DEVTOOLS_GLOBAL_HOOK__;
    if (hook) {
      // Hook into React's refresh mechanism
      this.hook = hook;
    }
  },

  register(type, id) {
    if (!type) return;
    this.registrations.set(id, type);
  },

  createSignatureFunctionForTransform() {
    let savedType;
    let hasCustomHooks = false;
    let didCollectHooks = false;

    return function(type, key, forceReset, getCustomHooks) {
      if (typeof key === 'string') {
        savedType = type;
        hasCustomHooks = typeof getCustomHooks === 'function';
      }
      return type;
    };
  },

  performReactRefresh() {
    // Trigger React to re-render with new components
    if (this.hook && this.hook.onScheduleFiberRoot) {
      // React 18+ refresh
      this.registrations.forEach((type, id) => {
        if (typeof type === 'function') {
          // Mark function as needing refresh
          type.__BAVINI_REFRESH__ = Date.now();
        }
      });

      // Force React to refresh
      if (window.__BAVINI_REACT_REFRESH_CALLBACK__) {
        window.__BAVINI_REACT_REFRESH_CALLBACK__();
      }
    }

    // Clear registrations for next update
    this.registrations.clear();
  },

  // Utility to check if a component is likely a React component
  isLikelyComponentType(type) {
    if (typeof type !== 'function') return false;
    if (type.prototype && type.prototype.isReactComponent) return true;
    // Check for hooks usage pattern
    const name = type.name || type.displayName;
    if (name && /^[A-Z]/.test(name)) return true;
    return false;
  }
};

export default RefreshRuntime;
`;

/**
 * Check if a file is a React component
 */
function isReactComponent(code: string): boolean {
  // Check for JSX
  if (/<[A-Z][a-zA-Z0-9]*/.test(code)) return true;

  // Check for React imports
  if (/import\s+.*\s+from\s+['"]react['"]/.test(code)) return true;
  if (/from\s+['"]react['"]/.test(code)) return true;

  // Check for hooks usage
  if (/use[A-Z][a-zA-Z]*\(/.test(code)) return true;

  // Check for component patterns
  if (/function\s+[A-Z][a-zA-Z]*\s*\(/.test(code)) return true;
  if (/const\s+[A-Z][a-zA-Z]*\s*=\s*(\([^)]*\)|[^=])\s*=>/.test(code)) return true;

  return false;
}

/**
 * Extract component names from code
 */
function extractComponentNames(code: string): string[] {
  const names: string[] = [];

  // Match function declarations
  const funcDecl = code.matchAll(/(?:export\s+)?function\s+([A-Z][a-zA-Z0-9]*)\s*\(/g);
  for (const match of funcDecl) {
    names.push(match[1]);
  }

  // Match arrow functions
  const arrowFunc = code.matchAll(/(?:export\s+)?(?:const|let)\s+([A-Z][a-zA-Z0-9]*)\s*=\s*(?:\([^)]*\)|[a-zA-Z_$][a-zA-Z0-9_$]*)\s*=>/g);
  for (const match of arrowFunc) {
    names.push(match[1]);
  }

  // Match class components
  const classDecl = code.matchAll(/(?:export\s+)?class\s+([A-Z][a-zA-Z0-9]*)\s+extends\s+(?:React\.)?(?:Component|PureComponent)/g);
  for (const match of classDecl) {
    names.push(match[1]);
  }

  return [...new Set(names)];
}

/**
 * Inject React Refresh registration code
 */
function injectRefreshRegistration(code: string, moduleId: string, componentNames: string[]): string {
  if (componentNames.length === 0) return code;

  // Build registration code
  const registrations = componentNames
    .map(name => `$RefreshReg$(${name}, "${name}");`)
    .join('\n');

  const footer = REACT_REFRESH_FOOTER.replace('__MODULE_ID__', JSON.stringify(moduleId));

  return `${footer}\n${code}\n${registrations}\n${REACT_REFRESH_HMR}`;
}

/**
 * Create React Fast Refresh plugin
 */
export function reactRefreshPlugin(): DevServerPlugin {
  return {
    name: 'bavini:react-refresh',

    configureServer(server) {
      // Register route for React Refresh runtime
      server.route('/@react-refresh', async () => ({
        status: 200,
        statusText: 'OK',
        headers: new Headers({ 'Content-Type': 'application/javascript' }),
        body: REACT_REFRESH_RUNTIME,
      }));
    },

    transform(code: string, id: string, _ctx: PluginContext): TransformResult | null {
      // Only transform JS/JSX/TSX files
      const ext = id.split('.').pop()?.toLowerCase();
      if (!['js', 'jsx', 'tsx'].includes(ext || '')) {
        return null;
      }

      // Skip node_modules
      if (id.includes('node_modules') || id.includes('@modules')) {
        return null;
      }

      // Check if it's a React component
      if (!isReactComponent(code)) {
        return null;
      }

      // Extract component names
      const componentNames = extractComponentNames(code);

      // Inject refresh code
      const transformedCode = injectRefreshRegistration(code, id, componentNames);

      // Add preamble for first module
      const finalCode = code.includes('RefreshRuntime')
        ? transformedCode
        : REACT_REFRESH_PREAMBLE + transformedCode;

      return {
        code: finalCode,
        deps: ['/@react-refresh'],
      };
    },

    handleHotUpdate(ctx: HotUpdateContext): ModuleNode[] | void {
      // Filter to only React components
      const reactModules = ctx.modules.filter(mod => {
        if (mod.type !== 'js') return false;
        const code = mod.transformedCode || '';
        return isReactComponent(code);
      });

      if (reactModules.length === 0) {
        return;
      }

      // Return only React modules for refresh
      return reactModules;
    },
  };
}

export default reactRefreshPlugin;
