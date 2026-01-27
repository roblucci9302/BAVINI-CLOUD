/**
 * =============================================================================
 * BAVINI CLOUD - Astro Bootstrap
 * =============================================================================
 * Bootstrap code generator for Astro applications.
 * Note: Astro is primarily SSG/SSR, so we render static HTML for preview.
 * =============================================================================
 */

import type { BootstrapContext } from './types';

/**
 * Generate Astro bootstrap entry code
 *
 * @param entryPath - Entry file path
 * @param context - Bootstrap context
 * @returns Bootstrap JavaScript code
 */
export function createAstroBootstrapEntry(
  entryPath: string,
  context: BootstrapContext
): string {
  const { findFile } = context;

  // Find the main page or layout
  let mainPage = entryPath;
  if (!entryPath.endsWith('.astro')) {
    const indexAstro = findFile('/src/pages/index.astro') ||
                       findFile('/src/pages/index') ||
                       findFile('/index.astro');
    if (indexAstro) {
      mainPage = indexAstro;
    }
  }

  // For Astro, we render the component and inject its output as static HTML
  // Astro's compiled output is complex - it uses async generators and $render functions
  return `
import Component from '${mainPage.replace(/\.astro$/, '')}';

// Helper to collect async iterator/generator output
async function collectAsyncOutput(gen) {
  if (!gen) return '';

  // If it's already a string, return it
  if (typeof gen === 'string') return gen;

  // CRITICAL: Handle render result objects with .render() method
  // This is the async-aware format from our $render handler
  if (gen && typeof gen.render === 'function') {
    const rendered = await gen.render();
    return await collectAsyncOutput(rendered);
  }

  // CRITICAL: Detect Astro's template literal array format
  // Format: ['string1', 'string2', ..., raw: Array(n)]
  // The actual content is often in the array values, not the raw strings
  if (Array.isArray(gen) && gen.raw !== undefined) {
    // This is a tagged template literal result
    // The strings array contains the literal parts, values are interpolated
    // But Astro often puts the HTML content in a specific pattern

    // Try to find HTML content in the array
    let html = '';
    for (let i = 0; i < gen.length; i++) {
      const part = gen[i];
      if (typeof part === 'string') {
        html += part;
      } else if (part && typeof part === 'object') {
        // Recursively process nested content
        html += await collectAsyncOutput(part);
      }
    }

    // If we got content, return it
    if (html && html.trim()) {
      return html;
    }

    // Fallback: try joining with empty string
    return gen.join('');
  }

  // If it's a regular array (not template literal), process each element
  if (Array.isArray(gen)) {
    let html = '';
    for (const item of gen) {
      html += await collectAsyncOutput(item);
    }
    return html;
  }

  // If it has a toHTML method (Astro's Response-like object)
  if (gen.toHTML) return await gen.toHTML();

  // If it has toString that returns something useful
  if (gen.toString && gen.toString() !== '[object Object]') {
    const str = gen.toString();
    if (str && str !== '[object Object]' && str !== '[object AsyncGenerator]') {
      return str;
    }
  }

  // If it's an async iterator/generator, collect all chunks
  if (gen[Symbol.asyncIterator]) {
    let html = '';
    for await (const chunk of gen) {
      if (typeof chunk === 'string') {
        html += chunk;
      } else if (chunk && chunk.toString) {
        const chunkStr = await collectAsyncOutput(chunk);
        html += chunkStr;
      }
    }
    return html;
  }

  // If it's a regular iterator
  if (gen[Symbol.iterator] && typeof gen !== 'string') {
    let html = '';
    for (const chunk of gen) {
      if (typeof chunk === 'string') {
        html += chunk;
      } else if (chunk && chunk.toString) {
        const chunkStr = await collectAsyncOutput(chunk);
        html += chunkStr;
      }
    }
    return html;
  }

  // If it's a promise, await it
  if (gen.then) {
    return await collectAsyncOutput(await gen);
  }

  // Last resort: try to get html property
  if (gen.html) return gen.html;

  return '';
}

// Basic HTML sanitizer to prevent XSS in preview
// Note: In a dev preview environment, users execute their own code,
// but we sanitize to prevent accidental injection from framework output
function sanitizeHTML(html) {
  // Remove script tags and their content
  let clean = html.replace(/<script\\b[^<]*(?:(?!<\\/script>)<[^<]*)*<\\/script>/gi, '');
  // Remove event handlers (onclick, onerror, etc.)
  clean = clean.replace(/\\s*on\\w+\\s*=\\s*["'][^"']*["']/gi, '');
  clean = clean.replace(/\\s*on\\w+\\s*=\\s*[^\\s>]+/gi, '');
  // Remove javascript: URLs
  clean = clean.replace(/javascript\\s*:/gi, 'blocked:');
  return clean;
}

// Render Astro component
async function renderAstro() {
  const container = document.getElementById('root') || document.getElementById('app');
  if (!container) {
    console.error('[BAVINI Astro] Root element not found');
    return;
  }

  try {
    let html = '';

    // Try different ways to render the Astro component
    // CRITICAL: Astro components expect (result, props, slots) not just (props)
    // The $result object contains createAstro and other runtime methods
    const $result = globalThis.$result || {
      styles: new Set(),
      scripts: new Set(),
      links: new Set(),
      createAstro: (Astro, props, slots) => ({ ...Astro, props: props || {}, slots: slots || {} }),
      resolve: (path) => path,
    };

    if (typeof Component === 'function') {
      // Try with $result first (Astro v2+ pattern)
      let result = await Component($result, {}, {});

      // If result is empty, try without $result (some components are wrapped differently)
      if (!result || (typeof result === 'string' && result.length === 0)) {
        result = await Component({}, {});
      }

      html = await collectAsyncOutput(result);
    } else if (Component && Component.default && typeof Component.default === 'function') {
      const result = await Component.default($result, {}, {});
      html = await collectAsyncOutput(result);
    } else if (Component && typeof Component.render === 'function') {
      const result = await Component.render($result, {}, {});
      html = await collectAsyncOutput(result);
    }

    if (html) {
      // Sanitize HTML before injecting to prevent XSS
      const cleanHtml = sanitizeHTML(html);
      container.innerHTML = cleanHtml;
    } else {
      container.innerHTML = '<div style="padding: 40px; text-align: center; color: #666;"><h2>Astro Preview</h2><p>Component rendered but produced no HTML output.</p><p>Check the console for details.</p></div>';
    }
  } catch (error) {
    console.error('[BAVINI Astro] Failed to render:', error);
    // XSS-safe error display using textContent
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'color: red; padding: 20px; font-family: monospace;';
    const title = document.createElement('h3');
    title.textContent = 'Astro Render Error';
    const pre = document.createElement('pre');
    pre.textContent = error.message || String(error);
    errorDiv.appendChild(title);
    errorDiv.appendChild(pre);
    container.innerHTML = '';
    container.appendChild(errorDiv);
  }
}

renderAstro();
`;
}
