/**
 * =============================================================================
 * BAVINI CLOUD - Bundle Injector
 * =============================================================================
 * Injects JavaScript and CSS bundles into HTML templates.
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';
import type { FrameworkType } from '../../compilers/compiler-registry';
import {
  generateBaseStyles,
  generateTailwindCdnScript,
  generateKeyboardForwardingScript,
} from './html-template';

const logger = createScopedLogger('BundleInjector');

/**
 * SSR content for injection
 */
export interface SSRContent {
  html: string;
  css: string;
  head: string;
}

/**
 * Bundle injection options
 */
export interface BundleInjectionOptions {
  /** Detected framework type */
  framework: FrameworkType;
  /** Custom Tailwind theme CSS */
  customTheme?: string;
  /** Whether custom colors are defined */
  hasCustomColors?: boolean;
}

/**
 * Entry script patterns to remove from HTML
 */
const ENTRY_SCRIPT_PATTERNS = [
  /<script[^>]*\s+src=["'][^"']*\/src\/main\.(tsx?|jsx?)["'][^>]*><\/script>/gi,
  /<script[^>]*\s+src=["'][^"']*\/src\/index\.(tsx?|jsx?)["'][^>]*><\/script>/gi,
  /<script[^>]*\s+src=["'][^"']*main\.(tsx?|jsx?)["'][^>]*><\/script>/gi,
  /<script[^>]*\s+src=["'][^"']*index\.(tsx?|jsx?)["'][^>]*><\/script>/gi,
];

/**
 * Tailwind link patterns to remove from HTML
 */
const TAILWIND_LINK_PATTERNS = [
  /<link[^>]*\s+href=["'][^"']*tailwindcss[^"']*["'][^>]*\/?>/gi,
  /<link[^>]*\s+href=["'][^"']*tailwind\.css[^"']*["'][^>]*\/?>/gi,
  /<link[^>]*\s+href=["'][^"']*\/node_modules\/tailwindcss[^"']*["'][^>]*\/?>/gi,
];

/**
 * Inject bundle into HTML
 *
 * @param html - HTML template
 * @param code - JavaScript code to inject
 * @param css - CSS to inject
 * @param options - Injection options
 * @returns HTML with injected bundle
 */
export function injectBundle(
  html: string,
  code: string,
  css: string,
  options: BundleInjectionOptions
): string {
  const { framework, customTheme = '', hasCustomColors = false } = options;

  // Inject base styles in head
  const baseStyles = generateBaseStyles();
  html = html.replace('<head>', `<head>\n${baseStyles}`);

  // Inject CSS (additional custom styles)
  if (css) {
    const styleTag = `<style>${css}</style>`;
    html = html.replace('</head>', `${styleTag}\n</head>`);
  }

  // Determine if we need Tailwind CDN
  const jitFailed = css?.includes('Tailwind compilation failed');
  const isSfcFramework = ['vue', 'svelte', 'astro'].includes(framework);
  const needsTailwindCdn = !css || css.length < 100 || jitFailed || hasCustomColors || isSfcFramework;

  // For Astro and SFC frameworks, don't remove body inline styles
  const isAstro = framework === 'astro';
  const needsBodyStyleRemoval = !isAstro && !isSfcFramework && hasCustomColors;

  if (needsBodyStyleRemoval) {
    // Remove inline style from body tag
    html = html.replace(
      /<body([^>]*)\s+style="[^"]*"([^>]*)>/gi,
      '<body$1$2>'
    );
    logger.debug('Removed inline style from body tag (custom colors)');
  }

  if (needsTailwindCdn) {
    // Apply background override only for non-SFC frameworks with custom colors
    const applyBackgroundOverride = !isAstro && !isSfcFramework && hasCustomColors;
    const tailwindScript = generateTailwindCdnScript(customTheme, applyBackgroundOverride);

    html = html.replace('</head>', `${tailwindScript}\n</head>`);

    const reason = !css ? 'no CSS' :
                   css.length < 100 ? 'CSS too short' :
                   jitFailed ? 'JIT failed' :
                   isSfcFramework ? `SFC framework (${framework})` :
                   'custom colors detected';
    logger.info(`Injected Tailwind CDN (reason: ${reason})`);
  }

  // Remove original entry scripts
  for (const pattern of ENTRY_SCRIPT_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(html)) {
      pattern.lastIndex = 0;
      html = html.replace(pattern, '<!-- BAVINI: Original entry script removed -->');
    }
  }

  // Remove Tailwind CSS link tags
  for (const pattern of TAILWIND_LINK_PATTERNS) {
    pattern.lastIndex = 0;
    if (pattern.test(html)) {
      pattern.lastIndex = 0;
      html = html.replace(pattern, '<!-- BAVINI: Tailwind CSS link removed -->');
    }
  }

  // Inject JS bundle using base64 encoding
  // This avoids all escaping issues (backticks, </script>, quotes, etc.)
  const base64Code = btoa(unescape(encodeURIComponent(code)));
  const loaderScript = '<script type="module">\n' +
    '(async function() {\n' +
    '  try {\n' +
    '    const base64 = "' + base64Code + '";\n' +
    '    const code = decodeURIComponent(escape(atob(base64)));\n' +
    '    const blob = new Blob([code], { type: "text/javascript" });\n' +
    '    const url = URL.createObjectURL(blob);\n' +
    '    await import(url);\n' +
    '    URL.revokeObjectURL(url);\n' +
    '  } catch (e) {\n' +
    '    console.error("[BAVINI] Failed to load bundle:", e);\n' +
    '  }\n' +
    '})();\n' +
    '</script>';

  // Replace placeholder or add before </body>
  if (html.includes('<!-- BAVINI_BUNDLE -->')) {
    html = html.replace('<!-- BAVINI_BUNDLE -->', loaderScript);
  } else {
    html = html.replace('</body>', `${loaderScript}\n</body>`);
  }

  // Add keyboard forwarding script
  const keyboardScript = generateKeyboardForwardingScript();
  html = html.replace('<head>', `<head>\n${keyboardScript}`);

  return html;
}

/**
 * Inject bundle with SSR content
 *
 * @param html - HTML template
 * @param code - JavaScript code to inject
 * @param css - CSS to inject
 * @param ssrContent - SSR content to inject
 * @param options - Injection options
 * @returns HTML with injected bundle and SSR content
 */
export function injectBundleWithSSR(
  html: string,
  code: string,
  css: string,
  ssrContent: SSRContent | null,
  options: BundleInjectionOptions
): string {
  // If no SSR content, use standard injection
  if (!ssrContent) {
    return injectBundle(html, code, css, options);
  }

  logger.info('Injecting SSR content into preview');

  // Combine CSS (SSR CSS + aggregated CSS)
  const combinedCss = ssrContent.css ? `${ssrContent.css}\n${css}` : css;

  // First inject normal bundle
  let result = injectBundle(html, code, combinedCss, options);

  // Inject SSR head content if available
  if (ssrContent.head) {
    result = result.replace('</head>', `${ssrContent.head}\n</head>`);
  }

  // Inject SSR HTML content into body
  if (ssrContent.html) {
    const rootPatterns = [
      /(<div\s+id="root"[^>]*>)(<\/div>)/,
      /(<div\s+id="app"[^>]*>)(<\/div>)/,
      /(<div\s+id="__next"[^>]*>)(<\/div>)/,
    ];

    let injected = false;
    for (const pattern of rootPatterns) {
      if (pattern.test(result)) {
        result = result.replace(pattern, `$1${ssrContent.html}$2`);
        injected = true;
        logger.debug('SSR content injected into root element');
        break;
      }
    }

    // Fallback: add as first element in body
    if (!injected) {
      result = result.replace(
        '<body>',
        `<body>\n<div id="ssr-content">${ssrContent.html}</div>`
      );
      logger.debug('SSR content injected as new element');
    }
  }

  return result;
}
