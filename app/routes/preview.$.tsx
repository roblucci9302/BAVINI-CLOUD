/**
 * Preview Catch-All Route
 *
 * This route exists to prevent Vite from returning 404 for /preview/* requests.
 * The actual content is served by the Preview Service Worker.
 *
 * Without this route:
 * 1. iframe requests /preview/index.html
 * 2. Vite intercepts and returns 404 (file doesn't exist)
 * 3. Service Worker never gets invoked
 *
 * With this route:
 * 1. iframe requests /preview/index.html
 * 2. Remix matches this catch-all route
 * 3. Loader returns empty response, allowing SW to take over
 * 4. Service Worker intercepts and serves the preview content
 */

import type { LoaderFunctionArgs } from '@remix-run/cloudflare';

export async function loader({ request }: LoaderFunctionArgs) {
  // Return an empty HTML shell that the Service Worker will replace
  // The SW intercepts this response and serves the actual preview content
  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>BAVINI Preview</title>
  <style>
    body {
      margin: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      font-family: system-ui, sans-serif;
      background: #f5f5f5;
    }
    .loader {
      text-align: center;
      color: #666;
    }
    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid #e0e0e0;
      border-top-color: #3b82f6;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin: 0 auto 1rem;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="loader">
    <div class="spinner"></div>
    <p>Chargement de la preview...</p>
    <p style="font-size: 12px; opacity: 0.7;">Service Worker en cours d'initialisation</p>
  </div>
  <script>
    // If we see this page, the Service Worker hasn't intercepted yet
    // Try to reload after SW is ready
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready.then(() => {
        // SW is ready, reload to let it intercept
        setTimeout(() => location.reload(), 500);
      });
    }
  </script>
</body>
</html>`;

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}

// IMPORTANT: No default export - this is a RESOURCE ROUTE
// Resource routes only have loader/action, no UI component
// This prevents Remix from rendering the root layout
