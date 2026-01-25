/**
 * =============================================================================
 * BAVINI CLOUD - Vanilla Build Module
 * =============================================================================
 * Handles vanilla HTML/CSS/JS projects without esbuild bundling.
 * Simply inlines CSS and JS into the HTML file.
 * =============================================================================
 */

import { createScopedLogger } from '~/utils/logger';
import type { BundleResult, PreviewInfo } from '../../types';
import { generateHash } from './utils/path-utils';
import { createPreviewWithSrcdoc, generateKeyboardForwardingScript } from './preview';

const logger = createScopedLogger('VanillaBuild');

/**
 * Vanilla build context - provides adapter dependencies
 */
export interface VanillaBuildContext {
  /** Virtual file system */
  files: Map<string, string>;
  /** Extract Tailwind custom colors from config */
  extractTailwindCustomColors: () => string;
  /** Revoke old blob URL if exists */
  revokeOldBlobUrl?: () => void;
}

/**
 * Vanilla build callbacks for adapter integration
 */
export interface VanillaBuildCallbacks {
  /** Emit build progress */
  onProgress?: (phase: string, progress: number) => void;
  /** Emit preview ready */
  onPreviewReady?: (preview: PreviewInfo) => void;
}

/**
 * Common CSS file patterns to check
 */
const CSS_PATTERNS = [
  '/style.css',
  '/styles.css',
  '/main.css',
  '/index.css',
  '/css/style.css',
  '/css/main.css',
];

/**
 * Common JS file patterns to check
 */
const JS_PATTERNS = [
  '/script.js',
  '/main.js',
  '/app.js',
  '/index.js',
  '/js/script.js',
  '/js/main.js',
  '/js/app.js',
];

/**
 * localStorage protection script for blob URL contexts
 */
const LOCAL_STORAGE_PROTECTION = `
<script>
(function() {
  try {
    localStorage.setItem('__bavini_test__', '1');
    localStorage.removeItem('__bavini_test__');
  } catch (e) {
    console.warn('[BAVINI] localStorage not available, using memory fallback');
    var memoryStorage = {};
    window.localStorage = {
      getItem: function(k) { return memoryStorage[k] || null; },
      setItem: function(k, v) { memoryStorage[k] = String(v); },
      removeItem: function(k) { delete memoryStorage[k]; },
      clear: function() { memoryStorage = {}; },
      get length() { return Object.keys(memoryStorage).length; },
      key: function(i) { return Object.keys(memoryStorage)[i] || null; }
    };
  }
})();
</script>`;

/**
 * Collect CSS files from the virtual file system
 *
 * @param files - Virtual file system
 * @param html - HTML content to search for references
 * @returns Array of CSS file paths
 */
export function collectCssFiles(files: Map<string, string>, html: string): string[] {
  const cssFiles: string[] = [];

  // Check common CSS patterns
  for (const pattern of CSS_PATTERNS) {
    if (files.has(pattern)) {
      cssFiles.push(pattern);
    }
  }

  // Find CSS files referenced in HTML
  const cssLinkRegex = /<link[^>]+href=["']([^"']+\.css)["'][^>]*>/gi;
  let match;
  while ((match = cssLinkRegex.exec(html)) !== null) {
    const cssPath = match[1].startsWith('/') ? match[1] : '/' + match[1];
    if (files.has(cssPath) && !cssFiles.includes(cssPath)) {
      cssFiles.push(cssPath);
    }
  }

  return cssFiles;
}

/**
 * Collect JS files from the virtual file system
 *
 * @param files - Virtual file system
 * @param html - HTML content to search for references
 * @returns Array of JS file paths
 */
export function collectJsFiles(files: Map<string, string>, html: string): string[] {
  const jsFiles: string[] = [];

  // Check common JS patterns
  for (const pattern of JS_PATTERNS) {
    if (files.has(pattern)) {
      jsFiles.push(pattern);
    }
  }

  // Find JS files referenced in HTML
  const jsScriptRegex = /<script[^>]+src=["']([^"']+\.js)["'][^>]*><\/script>/gi;
  let match;
  while ((match = jsScriptRegex.exec(html)) !== null) {
    const jsPath = match[1].startsWith('/') ? match[1] : '/' + match[1];
    if (files.has(jsPath) && !jsFiles.includes(jsPath)) {
      jsFiles.push(jsPath);
    }
  }

  return jsFiles;
}

/**
 * Check if HTML uses Tailwind CSS classes
 */
function detectTailwindUsage(html: string, css: string): boolean {
  return html.includes('class="') && (
    html.includes('flex') ||
    html.includes('grid') ||
    html.includes('bg-') ||
    html.includes('text-') ||
    html.includes('p-') ||
    html.includes('m-') ||
    css.includes('@tailwind') ||
    css.includes('tailwindcss')
  );
}

/**
 * Inject Tailwind CDN script into HTML
 */
function injectTailwindCdn(html: string, customTheme: string): string {
  const hasCustomColors = customTheme.length > 0;
  const tailwindCdnScript = `
<script src="https://unpkg.com/@tailwindcss/browser@4"></script>
${hasCustomColors ? `<style type="text/tailwindcss">
  @theme {
    ${customTheme}
  }
</style>` : ''}`;

  logger.info(`Injected Tailwind CDN for vanilla project (custom colors: ${hasCustomColors})`);
  return html.replace('</head>', `${tailwindCdnScript}\n</head>`);
}

/**
 * Build a vanilla HTML/CSS/JS project
 *
 * @param htmlPath - Path to the HTML entry file
 * @param context - Build context with file system and utilities
 * @param callbacks - Optional callbacks for progress and preview
 * @param startTime - Performance timestamp for build time calculation
 * @returns Bundle result
 */
export async function buildVanillaProject(
  htmlPath: string,
  context: VanillaBuildContext,
  callbacks?: VanillaBuildCallbacks,
  startTime: number = performance.now()
): Promise<BundleResult> {
  callbacks?.onProgress?.('bundling', 20);

  // Get the HTML content
  let html = context.files.get(htmlPath) || '';

  if (!html) {
    return {
      code: '',
      css: '',
      errors: [{ message: `HTML file not found: ${htmlPath}`, file: htmlPath }],
      warnings: [],
      buildTime: performance.now() - startTime,
      hash: '',
    };
  }

  // Collect and process CSS files
  const cssFiles = collectCssFiles(context.files, html);
  let css = '';
  for (const cssFile of cssFiles) {
    const cssContent = context.files.get(cssFile);
    if (cssContent) {
      css += `/* ${cssFile} */\n${cssContent}\n\n`;
    }
  }

  // Remove CSS link tags (we'll inline the CSS)
  html = html.replace(/<link[^>]+href=["'][^"']+\.css["'][^>]*\/?>/gi, '');

  // Collect and process JS files
  const jsFiles = collectJsFiles(context.files, html);
  let code = '';
  for (const jsFile of jsFiles) {
    const jsContent = context.files.get(jsFile);
    if (jsContent) {
      code += `// ${jsFile}\n${jsContent}\n\n`;
    }
  }

  // Remove JS script tags with src (we'll inline the JS)
  html = html.replace(/<script[^>]+src=["'][^"']+\.js["'][^>]*><\/script>/gi, '');

  callbacks?.onProgress?.('bundling', 60);

  logger.info(`Vanilla project: ${cssFiles.length} CSS files, ${jsFiles.length} JS files`);
  logger.info(`Bundle size: JS=${(code.length / 1024).toFixed(1)}KB, CSS=${(css.length / 1024).toFixed(1)}KB`);

  // Inject CSS into head
  if (css) {
    const styleTag = `<style>\n${css}</style>`;
    if (html.includes('</head>')) {
      html = html.replace('</head>', `${styleTag}\n</head>`);
    } else {
      // No head tag, add one
      html = html.replace('<html', '<html>\n<head>' + styleTag + '</head');
    }
  }

  // Extract custom theme from tailwind.config if present
  const customTheme = context.extractTailwindCustomColors();
  const hasCustomColors = customTheme.length > 0;

  // Inject Tailwind CDN if needed
  if (detectTailwindUsage(html, css) || hasCustomColors) {
    html = injectTailwindCdn(html, customTheme);
  }

  // Inject JS before closing body
  if (code) {
    const scriptTag = `<script>\n${code}</script>`;
    if (html.includes('</body>')) {
      html = html.replace('</body>', `${scriptTag}\n</body>`);
    } else {
      // No body closing tag, append
      html += scriptTag;
    }
  }

  // Add localStorage protection script
  html = html.replace('<head>', `<head>\n${LOCAL_STORAGE_PROTECTION}`);

  callbacks?.onProgress?.('bundling', 80);

  // Create preview
  logger.info('Creating vanilla HTML preview...');
  const preview = createVanillaPreview(html, context.revokeOldBlobUrl);

  callbacks?.onPreviewReady?.(preview);
  callbacks?.onProgress?.('complete', 100);

  const buildTime = performance.now() - startTime;
  logger.info(`Vanilla build completed in ${buildTime.toFixed(0)}ms`);

  return {
    code,
    css,
    errors: [],
    warnings: [],
    buildTime,
    hash: generateHash(code + css),
  };
}

/**
 * Create preview for vanilla HTML project
 *
 * @param html - Prepared HTML content
 * @param revokeOldBlobUrl - Optional function to revoke old blob URL
 * @returns Preview info
 */
export function createVanillaPreview(
  html: string,
  revokeOldBlobUrl?: () => void
): PreviewInfo {
  // Add keyboard forwarding script
  const keyboardScript = generateKeyboardForwardingScript();
  html = html.replace('<head>', `<head>\n${keyboardScript}`);

  // Use modular srcdoc preview creator
  const preview = createPreviewWithSrcdoc(html, revokeOldBlobUrl);

  logger.info('Vanilla preview created via srcdoc');
  return preview;
}
