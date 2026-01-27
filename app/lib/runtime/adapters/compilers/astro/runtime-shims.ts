/**
 * =============================================================================
 * BAVINI CLOUD - Astro Runtime Shims
 * =============================================================================
 * Runtime shim functions for Astro components in browser context.
 * These shims provide the Astro runtime API when running outside of Astro's
 * native server environment.
 *
 * @module lib/runtime/adapters/compilers/astro/runtime-shims
 * =============================================================================
 */

/**
 * Generate the Astro runtime shims code string.
 *
 * This function returns a JavaScript code string that defines all the necessary
 * Astro runtime functions on globalThis. The shims handle:
 *
 * - Single $ prefix functions ($createComponent, $render, etc.)
 * - Double $$ prefix functions ($$createComponent, $$render, etc.)
 * - Tagged template literal handlers ($render`, $$render`)
 * - Async render result objects with Promise-like behavior
 * - $result and $$result objects with createAstro method
 *
 * CRITICAL: These must be attached to globalThis to be truly global across
 * ES modules. Using 'var' alone doesn't work because ES modules have their
 * own scope.
 *
 * @returns JavaScript code string that sets up Astro runtime shims
 */
export function getAstroRuntimeShims(): string {
  return `
// ============================================================================
// ASTRO RUNTIME SHIMS - Attached to globalThis for cross-module availability
// ============================================================================
(function(g) {
  // Single $ prefix functions
  if (!g.$createComponent) g.$createComponent = (fn) => fn;

  // CRITICAL: $render is a TAGGED TEMPLATE LITERAL handler in Astro v2+
  // It must return an object that can be awaited and converted to string
  // Because Astro components are async and return promises
  if (!g.$render) g.$render = function(strings, ...values) {
    if (!strings || !Array.isArray(strings)) {
      return strings;
    }

    // Create an async-aware render result object
    const renderResult = {
      strings: strings,
      values: values,

      // Async method to resolve all promises and build the final string
      async render() {
        let result = strings[0] || '';
        for (let i = 0; i < values.length; i++) {
          let val = values[i];

          // Await promises
          if (val && typeof val.then === 'function') {
            try {
              val = await val;
            } catch (e) {
              console.error('[BAVINI Astro] Error awaiting value:', e);
              val = '';
            }
          }

          // Recursively render nested render results
          if (val && typeof val.render === 'function') {
            val = await val.render();
          }

          let strVal = '';
          if (val === null || val === undefined) {
            strVal = '';
          } else if (typeof val === 'string') {
            strVal = val;
          } else if (Array.isArray(val)) {
            // Handle arrays of values (including promises and render results)
            const resolvedArr = await Promise.all(val.map(async (v) => {
              if (v && typeof v.then === 'function') v = await v;
              if (v && typeof v.render === 'function') v = await v.render();
              return typeof v === 'string' ? v : (v?.toString?.() || '');
            }));
            strVal = resolvedArr.join('');
          } else if (val && typeof val.toString === 'function') {
            strVal = val.toString();
            if (strVal === '[object Object]') strVal = '';
          } else {
            strVal = String(val);
          }
          result += strVal + (strings[i + 1] || '');
        }
        return result;
      },

      // For Promise-like behavior
      then(resolve, reject) {
        return this.render().then(resolve, reject);
      },

      // toString for sync contexts (will show placeholder)
      toString() {
        // Try to return sync result if no promises
        let hasAsync = values.some(v => v && (typeof v.then === 'function' || typeof v.render === 'function'));
        if (!hasAsync) {
          let result = strings[0] || '';
          for (let i = 0; i < values.length; i++) {
            const val = values[i];
            let strVal = '';
            if (val === null || val === undefined) strVal = '';
            else if (typeof val === 'string') strVal = val;
            else if (Array.isArray(val)) strVal = val.map(v => typeof v === 'string' ? v : (v?.toString?.() || '')).join('');
            else if (val && typeof val.toString === 'function') {
              strVal = val.toString();
              if (strVal === '[object Object]') strVal = '';
            } else strVal = String(val);
            result += strVal + (strings[i + 1] || '');
          }
          return result;
        }
        return '[ASYNC_RENDER_RESULT]';
      }
    };

    return renderResult;
  };

  if (!g.$renderComponent) g.$renderComponent = async function(result, name, Component, props, slots) {
    // Handle undefined/null Component
    if (!Component) {
      console.warn('[Astro] Component "' + name + '" is undefined');
      return '';
    }
    // Handle ES module with default export
    const Comp = Component.default || Component;
    if (typeof Comp === 'function') {
      let output = await Comp(result, props, slots);
      // If output is a render result object, resolve it
      if (output && typeof output.render === 'function') {
        output = await output.render();
      }
      return typeof output === 'string' ? output : (output?.toString?.() || '');
    }
    return '';
  };

  if (!g.$renderHead) g.$renderHead = function(result) { return ''; };
  if (!g.$maybeRenderHead) g.$maybeRenderHead = function(result) { return ''; };

  if (!g.$addAttribute) g.$addAttribute = function(value, name) {
    if (value == null || value === false) return '';
    if (value === true) return ' ' + name;
    return ' ' + name + '="' + String(value).replace(/"/g, '&quot;') + '"';
  };

  if (!g.$spreadAttributes) g.$spreadAttributes = function(attrs) {
    if (!attrs) return '';
    return Object.entries(attrs).map(([k, v]) => g.$addAttribute(v, k)).join('');
  };

  if (!g.$defineStyleVars) g.$defineStyleVars = function(vars) {
    return Object.entries(vars || {}).map(([k, v]) => '--' + k + ':' + v).join(';');
  };

  if (!g.$defineScriptVars) g.$defineScriptVars = function(vars) {
    return Object.entries(vars || {}).map(([k, v]) => 'let ' + k + ' = ' + JSON.stringify(v) + ';').join('\\n');
  };

  if (!g.$renderSlot) g.$renderSlot = async function(result, slotted, fallback) {
    if (slotted) {
      return typeof slotted === 'function' ? await slotted() : slotted;
    }
    return fallback ? (typeof fallback === 'function' ? await fallback() : fallback) : '';
  };

  if (!g.$mergeSlots) g.$mergeSlots = function(...slots) {
    return Object.assign({}, ...slots.filter(Boolean));
  };

  if (!g.$createMetadata) g.$createMetadata = (filePathname, opts = {}) => ({
    modules: opts.modules || [],
    hydratedComponents: opts.hydratedComponents || [],
    clientOnlyComponents: opts.clientOnlyComponents || [],
    hydrationDirectives: opts.hydrationDirectives || new Set(),
    hoisted: opts.hoisted || [],
  });

  if (!g.$renderTemplate) g.$renderTemplate = function(strings, ...values) {
    let result = strings[0] || '';
    for (let i = 0; i < values.length; i++) {
      const val = values[i];
      let strVal = '';
      if (val == null) {
        strVal = '';
      } else if (typeof val === 'string') {
        strVal = val;
      } else if (Array.isArray(val)) {
        strVal = val.map(v => typeof v === 'string' ? v : (v?.toString?.() || '')).join('');
      } else if (typeof val.toString === 'function') {
        strVal = val.toString();
        if (strVal === '[object Object]') strVal = '';
      } else {
        strVal = String(val);
      }
      result += strVal + (strings[i + 1] || '');
    }
    return result;
  };

  // CRITICAL: $result object with createAstro method
  if (!g.$result) g.$result = {
    styles: new Set(),
    scripts: new Set(),
    links: new Set(),
    propagation: new Map(),
    propagators: new Map(),
    extraHead: [],
    componentMetadata: new Map(),
    hasRenderedHead: false,
    renderers: [],
    createAstro: function(Astro, props, slots) {
      return { ...Astro, props: props || {}, slots: slots || {} };
    },
    resolve: function(path) { return path; },
    _metadata: { hasHydrationScript: false, rendererSpecificHydrationScripts: new Set() },
  };

  // Safe URL constructor that handles invalid URLs gracefully
  const safeURL = (urlStr, base) => {
    if (!urlStr) return base ? new URL(base) : new URL('http://localhost/');
    try {
      return new URL(urlStr, base || 'http://localhost/');
    } catch {
      return new URL('http://localhost/');
    }
  };

  // Double $$ prefix functions (Astro v2+)
  // NOTE: site must ALWAYS be a valid URL (never undefined) because user code
  // often does: new URL(Astro.url.pathname, Astro.site) which fails if site is undefined
  if (!g.$$createAstro) g.$$createAstro = (filePathname, url, site) => ({
    site: safeURL(site),  // Always valid URL, defaults to http://localhost/
    generator: 'Astro v4',
    glob: () => Promise.resolve([]),
    resolve: (path) => path,
    props: {},
    request: { url: url || '' },
    redirect: (path) => ({ redirect: path }),
    url: safeURL(url),
    cookies: { get: () => undefined, set: () => {}, delete: () => {}, has: () => false },
    params: {},
    slots: {},
  });

  if (!g.$$createComponent) g.$$createComponent = (fn) => fn;
  if (!g.$$createMetadata) g.$$createMetadata = (filePathname, opts = {}) => ({
    modules: opts.modules || [],
    hydratedComponents: opts.hydratedComponents || [],
    clientOnlyComponents: opts.clientOnlyComponents || [],
    hydrationDirectives: opts.hydrationDirectives || new Set(),
    hoisted: opts.hoisted || [],
  });
  if (!g.$$defineScriptVars) g.$$defineScriptVars = (vars) => Object.entries(vars || {}).map(([k, v]) => \`let \${k} = \${JSON.stringify(v)};\`).join('\\n');
  if (!g.$$unescapeHTML) g.$$unescapeHTML = (str) => ({ toString: () => str, toHTML: () => str });

  if (!g.$$renderSlot) g.$$renderSlot = async (result, slotted, fallback) => {
    if (slotted) {
      return typeof slotted === 'function' ? await slotted() : slotted;
    }
    return fallback ? (typeof fallback === 'function' ? await fallback() : fallback) : '';
  };

  if (!g.$$mergeSlots) g.$$mergeSlots = (...slots) => Object.assign({}, ...slots.filter(Boolean));
  if (!g.$$maybeRenderHead) g.$$maybeRenderHead = (result) => '';
  if (!g.$$renderHead) g.$$renderHead = (result) => '';

  if (!g.$$addAttribute) g.$$addAttribute = function(value, name, shouldEscape) {
    if (value == null || value === false) return '';
    if (value === true) return ' ' + name;
    return ' ' + name + '="' + String(value).replace(/"/g, '&quot;') + '"';
  };

  if (!g.$$spreadAttributes) g.$$spreadAttributes = function(attrs, _name, _opts) {
    if (!attrs) return '';
    return Object.entries(attrs).map(([k, v]) => g.$$addAttribute(v, k)).join('');
  };

  // CRITICAL: $$render is a TAGGED TEMPLATE LITERAL handler in Astro v2+
  // Usage: return $$render(templateStrings, ...values);
  // FIX: Returns an async-aware render result object that properly resolves promises
  if (!g.$$render) g.$$render = function(strings, ...values) {
    if (!strings || !Array.isArray(strings)) {
      // Fallback for old-style function calls
      return strings;
    }

    // Create an async-aware render result object (same pattern as $render)
    const renderResult = {
      strings: strings,
      values: values,

      // Async method to resolve all promises and build the final string
      async render() {
        let result = strings[0] || '';
        for (let i = 0; i < values.length; i++) {
          let val = values[i];

          // Await promises
          if (val && typeof val.then === 'function') {
            try {
              val = await val;
            } catch (e) {
              console.error('[BAVINI Astro Shim] $$render: Error awaiting promise:', e);
              val = '';
            }
          }

          // Recursively render nested render results
          if (val && typeof val.render === 'function') {
            val = await val.render();
          }

          let strVal = '';
          if (val === null || val === undefined) {
            strVal = '';
          } else if (typeof val === 'string') {
            strVal = val;
          } else if (Array.isArray(val)) {
            // Handle arrays of values (including promises and render results)
            const resolvedArr = await Promise.all(val.map(async (v) => {
              if (v && typeof v.then === 'function') v = await v;
              if (v && typeof v.render === 'function') v = await v.render();
              return typeof v === 'string' ? v : (v?.toString?.() || '');
            }));
            strVal = resolvedArr.join('');
          } else if (val && typeof val.toString === 'function') {
            strVal = val.toString();
            if (strVal === '[object Object]' || strVal === '[ASYNC]') strVal = '';
          } else {
            strVal = String(val);
          }
          result += strVal + (strings[i + 1] || '');
        }
        return result;
      },

      // For Promise-like behavior - allows await on the result
      then(resolve, reject) {
        return this.render().then(resolve, reject);
      },

      // toString for sync contexts (returns placeholder if async values present)
      toString() {
        let hasAsync = values.some(v => v && (typeof v.then === 'function' || typeof v.render === 'function'));
        if (!hasAsync) {
          let result = strings[0] || '';
          for (let i = 0; i < values.length; i++) {
            const val = values[i];
            let strVal = '';
            if (val === null || val === undefined) strVal = '';
            else if (typeof val === 'string') strVal = val;
            else if (Array.isArray(val)) strVal = val.map(v => typeof v === 'string' ? v : (v?.toString?.() || '')).join('');
            else if (val && typeof val.toString === 'function') {
              strVal = val.toString();
              if (strVal === '[object Object]') strVal = '';
            } else strVal = String(val);
            result += strVal + (strings[i + 1] || '');
          }
          return result;
        }
        return '[ASYNC_RENDER_RESULT]';
      }
    };

    return renderResult;
  };

  if (!g.$$renderComponent) g.$$renderComponent = async function(result, name, Component, props, slots) {
    // Handle undefined/null Component
    if (!Component) {
      console.warn('[Astro] Component "' + name + '" is undefined');
      return '';
    }
    // Handle ES module with default export
    const Comp = Component.default || Component;
    if (typeof Comp === 'function') {
      const output = await Comp(result, props, slots);
      return output?.toString?.() || '';
    }
    return '';
  };

  // CRITICAL: $$renderTemplate - tagged template literal handler
  // FIX: Now returns async-aware render result like $$render
  if (!g.$$renderTemplate) g.$$renderTemplate = function(strings, ...values) {
    // Reuse the same async-aware pattern as $$render
    const renderResult = {
      strings: strings,
      values: values,

      async render() {
        let result = strings[0] || '';
        for (let i = 0; i < values.length; i++) {
          let val = values[i];

          // Await promises
          if (val && typeof val.then === 'function') {
            try { val = await val; } catch (e) { val = ''; }
          }

          // Recursively render nested render results
          if (val && typeof val.render === 'function') {
            val = await val.render();
          }

          let strVal = '';
          if (val === null || val === undefined) strVal = '';
          else if (typeof val === 'string') strVal = val;
          else if (Array.isArray(val)) {
            const resolvedArr = await Promise.all(val.map(async (v) => {
              if (v && typeof v.then === 'function') v = await v;
              if (v && typeof v.render === 'function') v = await v.render();
              return typeof v === 'string' ? v : (v?.toString?.() || '');
            }));
            strVal = resolvedArr.join('');
          } else if (val && typeof val.toString === 'function') {
            strVal = val.toString();
            if (strVal === '[object Object]' || strVal === '[ASYNC]') strVal = '';
          } else strVal = String(val);

          result += strVal + (strings[i + 1] || '');
        }
        return result;
      },

      then(resolve, reject) {
        return this.render().then(resolve, reject);
      },

      toString() {
        let hasAsync = values.some(v => v && (typeof v.then === 'function' || typeof v.render === 'function'));
        if (!hasAsync) {
          let result = strings[0] || '';
          for (let i = 0; i < values.length; i++) {
            const val = values[i];
            let strVal = '';
            if (val === null || val === undefined) strVal = '';
            else if (typeof val === 'string') strVal = val;
            else if (Array.isArray(val)) strVal = val.map(v => typeof v === 'string' ? v : (v?.toString?.() || '')).join('');
            else if (val && typeof val.toString === 'function') {
              strVal = val.toString();
              if (strVal === '[object Object]') strVal = '';
            } else strVal = String(val);
            result += strVal + (strings[i + 1] || '');
          }
          return result;
        }
        return '[ASYNC_RENDER_RESULT]';
      }
    };

    return renderResult;
  };

  // Also expose as $$result
  if (!g.$$result) g.$$result = g.$result;

  // NOTE: We do NOT create local var aliases here because esbuild renames them
  // during bundling, which breaks references. Instead, we replace all $result
  // and $$xxx references with globalThis.xxx in postProcessCode().
})(typeof globalThis !== 'undefined' ? globalThis : typeof window !== 'undefined' ? window : this);
`;
}
