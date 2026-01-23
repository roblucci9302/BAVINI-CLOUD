/**
 * =============================================================================
 * BAVINI CLOUD - HTML Template Generator
 * =============================================================================
 * Generates default HTML templates for preview.
 * =============================================================================
 */

/**
 * Default CSS variables for BAVINI design system
 */
export const DEFAULT_CSS_VARIABLES = `
  /* Color palette (defaults) */
  --color-primary: #6366f1;
  --color-primary-light: #818cf8;
  --color-primary-dark: #4f46e5;
  --color-secondary: #f1f5f9;
  --color-secondary-light: #f8fafc;
  --color-secondary-dark: #e2e8f0;
  --color-accent: #06b6d4;
  --color-accent-light: #22d3ee;
  --color-accent-dark: #0891b2;
  --color-background: #fafbfc;
  --color-background-alt: #f1f5f9;
  --color-surface: #ffffff;
  --color-surface-hover: #f8fafc;
  --color-text: #1a1f36;
  --color-text-muted: #64748b;
  --color-text-inverse: #ffffff;
  --color-success: #10b981;
  --color-warning: #f59e0b;
  --color-error: #ef4444;
  --color-info: #3b82f6;
  --color-border: #e2e8f0;
  --color-border-hover: #cbd5e1;

  /* Typography defaults */
  --font-heading: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-body: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  --font-mono: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Spacing defaults */
  --container-max-width: 1280px;
  --container-padding: 1.5rem;
  --section-padding-y: 6rem;
  --grid-gap: 1.5rem;

  /* Effects defaults */
  --radius-sm: 0.25rem;
  --radius-base: 0.375rem;
  --radius-md: 0.5rem;
  --radius-lg: 0.75rem;
  --radius-xl: 1rem;
  --radius-2xl: 1.5rem;
  --radius-full: 9999px;
  --shadow-sm: 0 1px 2px 0 rgb(0 0 0 / 0.05);
  --shadow-base: 0 1px 3px 0 rgb(0 0 0 / 0.1), 0 1px 2px -1px rgb(0 0 0 / 0.1);
  --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1), 0 2px 4px -2px rgb(0 0 0 / 0.1);
  --shadow-lg: 0 10px 15px -3px rgb(0 0 0 / 0.1), 0 4px 6px -4px rgb(0 0 0 / 0.1);
  --transition-fast: 150ms ease;
  --transition-base: 200ms ease;
  --transition-slow: 300ms ease;

  /* Legacy BAVINI variables (for backwards compatibility) */
  --bavini-bg: var(--color-background);
  --bavini-fg: var(--color-text);
  --bavini-primary: var(--color-primary);
  --bavini-primary-hover: var(--color-primary-dark);
  --bavini-secondary: var(--color-secondary);
  --bavini-accent: var(--color-accent);
  --bavini-success: var(--color-success);
  --bavini-warning: var(--color-warning);
  --bavini-error: var(--color-error);
  --bavini-border: var(--color-border);
  --bavini-muted: var(--color-text-muted);
  --bavini-card: var(--color-surface);
  --bavini-radius: var(--radius-lg);
  --bavini-shadow: var(--shadow-md);
`;

/**
 * Dark mode CSS variables override
 */
export const DARK_MODE_VARIABLES = `
  --color-primary: #818cf8;
  --color-primary-light: #a5b4fc;
  --color-primary-dark: #6366f1;
  --color-secondary: #1e293b;
  --color-secondary-light: #334155;
  --color-secondary-dark: #0f172a;
  --color-accent: #22d3ee;
  --color-accent-light: #67e8f9;
  --color-accent-dark: #06b6d4;
  --color-background: #0f172a;
  --color-background-alt: #1e293b;
  --color-surface: #1e293b;
  --color-surface-hover: #334155;
  --color-text: #f1f5f9;
  --color-text-muted: #94a3b8;
  --color-text-inverse: #0f172a;
  --color-success: #34d399;
  --color-warning: #fbbf24;
  --color-error: #f87171;
  --color-info: #60a5fa;
  --color-border: #334155;
  --color-border-hover: #475569;
`;

/**
 * localStorage fallback script for blob URLs
 */
const LOCAL_STORAGE_FALLBACK = `
(function() {
  // Wrap localStorage/sessionStorage to prevent errors in blob URL context
  try {
    // Test if localStorage works
    localStorage.setItem('__bavini_test__', '1');
    localStorage.removeItem('__bavini_test__');
  } catch (e) {
    // localStorage doesn't work in this context, provide a memory fallback
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
`;

/**
 * Generate default HTML template
 *
 * @returns Default HTML template string
 */
export function generateDefaultHtml(): string {
  // NOTE: Do NOT use <base href="/"> - it's blocked by CSP in Blob URLs
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>BAVINI Preview</title>
  <!-- BAVINI: localStorage protection for blob URLs -->
  <script>${LOCAL_STORAGE_FALLBACK}</script>
  <style>
    /* Base reset */
    *, *::before, *::after {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    html, body {
      min-height: 100%;
    }

    body {
      font-family: system-ui, -apple-system, sans-serif;
      line-height: 1.5;
    }

    /* Responsive media - safety net */
    img, video, svg, canvas {
      max-width: 100%;
      height: auto;
    }

    /* BAVINI Design System - Default CSS Variables */
    :root {
      --color-primary: #6366f1;
      --color-primary-light: #818cf8;
      --color-primary-dark: #4f46e5;
      --color-secondary: #f1f5f9;
      --color-accent: #06b6d4;
      --color-background: #fafbfc;
      --color-background-alt: #f1f5f9;
      --color-surface: #ffffff;
      --color-text: #1a1f36;
      --color-text-muted: #64748b;
      --color-success: #10b981;
      --color-warning: #f59e0b;
      --color-error: #ef4444;
      --color-border: #e2e8f0;
      --font-heading: system-ui, sans-serif;
      --font-body: system-ui, sans-serif;
      --radius-lg: 0.75rem;
      --shadow-md: 0 4px 6px -1px rgb(0 0 0 / 0.1);
      /* Legacy aliases */
      --bavini-bg: var(--color-background);
      --bavini-fg: var(--color-text);
      --bavini-primary: var(--color-primary);
    }

    .dark {
      --color-primary: #818cf8;
      --color-background: #0f172a;
      --color-surface: #1e293b;
      --color-text: #f1f5f9;
      --color-text-muted: #94a3b8;
      --color-border: #334155;
    }
  </style>
</head>
<body style="background: var(--color-background); color: var(--color-text);">
  <div id="root"></div>
  <!-- BAVINI_BUNDLE -->
</body>
</html>`;
}

/**
 * Generate base styles for bundle injection
 *
 * @returns Base styles HTML string
 */
export function generateBaseStyles(): string {
  return `
<style>
  /* ===== BAVINI DESIGN SYSTEM - DEFAULT CSS VARIABLES ===== */
  /* Claude can override these with creative, project-specific values */
  :root {
    ${DEFAULT_CSS_VARIABLES}
  }

  .dark {
    ${DARK_MODE_VARIABLES}
  }

  /* Base reset */
  *, *::before, *::after {
    box-sizing: border-box;
  }

  html, body {
    margin: 0;
    padding: 0;
    min-height: 100%;
  }

  body {
    font-family: var(--font-body);
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
    line-height: 1.5;
    /* NOTE: No background/color set to allow SFC components to define their own */
  }

  /* Responsive media - safety net */
  img, video, svg, canvas {
    max-width: 100%;
    height: auto;
  }

  h1, h2, h3, h4, h5, h6 {
    font-family: var(--font-heading);
    line-height: 1.25;
  }

  a {
    color: var(--color-primary);
    transition: color var(--transition-fast);
  }

  a:hover {
    color: var(--color-primary-dark);
  }
</style>`;
}

/**
 * Generate Tailwind CDN script with optional custom theme
 *
 * @param customTheme - Custom theme CSS variables
 * @param applyBackgroundOverride - Whether to apply background override
 * @returns Tailwind CDN script HTML string
 */
export function generateTailwindCdnScript(
  customTheme: string = '',
  applyBackgroundOverride: boolean = false
): string {
  const backgroundOverride = applyBackgroundOverride ? `
<style id="bavini-bg-override">
  /* Override BAVINI default background for projects with custom Tailwind colors */
  /* NOTE: Astro and SFC frameworks (Vue, Svelte) are excluded - they work with their own styles */
  :root {
    --color-background: transparent;
    --bavini-bg: transparent;
  }
</style>` : '';

  return `
<script src="https://unpkg.com/@tailwindcss/browser@4"></script>
<style type="text/tailwindcss">
  @theme {
    ${customTheme || '/* Using Tailwind default theme */'}
  }
</style>
<style id="tailwind-base-fixes">
/* Minimal base fixes - Tailwind Browser Runtime handles everything else */
* { box-sizing: border-box; }
html { -webkit-text-size-adjust: 100%; }
body { margin: 0; font-family: system-ui, -apple-system, sans-serif; }
</style>${backgroundOverride}`;
}

/**
 * Generate keyboard forwarding script for iframe
 *
 * @returns Keyboard forwarding script HTML string
 */
export function generateKeyboardForwardingScript(): string {
  return `
<script>
(function() {
  console.log('[BAVINI] Keyboard forwarding helper loaded');

  var currentFocusedElement = null;

  // Track the currently focused element
  document.addEventListener('focus', function(e) {
    currentFocusedElement = e.target;
    var tag = e.target.tagName;
    var isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target.isContentEditable;
    if (isInput) {
      console.log('[BAVINI] Input element focused:', tag);
    }
  }, true);

  document.addEventListener('blur', function(e) {
    if (e.target === currentFocusedElement) {
      currentFocusedElement = null;
    }
  }, true);

  // Listen for forwarded keyboard events from parent
  window.addEventListener('message', function(e) {
    if (e.data && e.data.type === 'keydown' && currentFocusedElement) {
      var event = new KeyboardEvent('keydown', {
        key: e.data.key,
        code: e.data.code,
        keyCode: e.data.keyCode,
        which: e.data.which,
        bubbles: true,
        cancelable: true
      });
      currentFocusedElement.dispatchEvent(event);
    }
  });
})();
</script>`;
}
