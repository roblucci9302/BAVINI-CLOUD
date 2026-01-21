/**
 * BAVINI Preview Service Worker
 * @version 3.2.0
 *
 * Intercepts requests from the preview iframe and serves content from
 * the Virtual File System (VFS) instead of making real network requests.
 *
 * This allows the preview to have a NORMAL origin (same as parent)
 * instead of a "null" origin from blob: URLs, fixing issues with:
 * - localStorage
 * - Form inputs
 * - Browser APIs that require same-origin
 *
 * Uses Cache API for persistence across SW updates.
 */

const SW_VERSION = '3.2.0';
const PREVIEW_SCOPE = '/preview/';
const CDN_URL = 'https://esm.sh';
const CACHE_NAME = 'bavini-preview-v1';

// In-memory file store for fast access
const fileStore = new Map();

// Flag to track if we've restored from cache
let restoredFromCache = false;

/**
 * Install event - activate immediately
 */
self.addEventListener('install', (event) => {
  console.log(`[Preview SW v${SW_VERSION}] Installing...`);
  self.skipWaiting();
});

/**
 * Activate event - claim clients and restore from cache
 */
self.addEventListener('activate', (event) => {
  console.log(`[Preview SW v${SW_VERSION}] Activating...`);
  event.waitUntil(
    Promise.all([
      self.clients.claim(),
      restoreFromCache(),
    ])
  );
});

/**
 * Restore files from Cache API to in-memory store
 */
async function restoreFromCache() {
  if (restoredFromCache) return;

  try {
    const cache = await caches.open(CACHE_NAME);
    const keys = await cache.keys();

    for (const request of keys) {
      const response = await cache.match(request);
      if (response) {
        const content = await response.text();
        const url = new URL(request.url);
        const filePath = url.pathname.replace(PREVIEW_SCOPE, '');
        if (filePath) {
          fileStore.set(filePath, content);
        }
      }
    }

    restoredFromCache = true;
    console.log(`[Preview SW] Restored ${fileStore.size} files from cache`);
  } catch (error) {
    console.error('[Preview SW] Failed to restore from cache:', error);
  }
}

/**
 * Message event - receive files from main thread
 */
self.addEventListener('message', (event) => {
  const { type, payload } = event.data;
  const responsePort = event.ports?.[0];

  switch (type) {
    case 'SET_FILES':
      handleSetFiles(payload, responsePort);
      break;

    case 'UPDATE_FILE':
      handleUpdateFile(payload);
      break;

    case 'DELETE_FILE':
      handleDeleteFile(payload);
      break;

    case 'CLEAR_FILES':
      handleClearFiles();
      break;

    case 'PING':
      event.source?.postMessage({ type: 'PONG', version: SW_VERSION });
      break;
  }
});

/**
 * Handle SET_FILES message - store in memory AND cache
 */
async function handleSetFiles(payload, responsePort) {
  const { files, buildId } = payload;

  // Mark that we've received files - this prevents restoreFromCache from overwriting
  restoredFromCache = true;

  // Clear previous files
  fileStore.clear();

  // Clear the cache too
  try {
    await caches.delete(CACHE_NAME);
  } catch (e) {
    // Ignore cache delete errors
  }

  const cache = await caches.open(CACHE_NAME);
  const fileCount = Object.keys(files).length;

  // Store files in memory and cache
  for (const [path, content] of Object.entries(files)) {
    const normalizedPath = normalizePath(path);
    fileStore.set(normalizedPath, content);

    // Also store in Cache API for persistence
    const cacheUrl = new URL(`${PREVIEW_SCOPE}${normalizedPath}`, self.location.origin);
    const response = new Response(content, {
      headers: {
        'Content-Type': getMimeType(normalizedPath),
        'X-Build-Id': buildId || 'unknown',
      }
    });
    await cache.put(cacheUrl, response);
  }

  console.log(`[Preview SW] Stored ${fileStore.size} files (build: ${buildId})`);

  // Send confirmation - wrap in try-catch in case port was closed
  if (responsePort) {
    try {
      responsePort.postMessage({
        type: 'FILES_READY',
        payload: { buildId, fileCount: fileStore.size },
      });
    } catch (error) {
      console.warn('[Preview SW] Failed to send FILES_READY confirmation:', error.message);
    }
  }
}

/**
 * Handle UPDATE_FILE message
 */
async function handleUpdateFile(payload) {
  const { path, content } = payload;
  const normalizedPath = normalizePath(path);

  fileStore.set(normalizedPath, content);

  // Update cache too
  try {
    const cache = await caches.open(CACHE_NAME);
    const cacheUrl = new URL(`${PREVIEW_SCOPE}${normalizedPath}`, self.location.origin);
    const response = new Response(content, {
      headers: { 'Content-Type': getMimeType(normalizedPath) }
    });
    await cache.put(cacheUrl, response);
  } catch (e) {
    console.warn('[Preview SW] Failed to update cache:', e);
  }
}

/**
 * Handle DELETE_FILE message
 */
async function handleDeleteFile(payload) {
  const { path } = payload;
  const normalizedPath = normalizePath(path);

  fileStore.delete(normalizedPath);

  // Delete from cache too
  try {
    const cache = await caches.open(CACHE_NAME);
    const cacheUrl = new URL(`${PREVIEW_SCOPE}${normalizedPath}`, self.location.origin);
    await cache.delete(cacheUrl);
  } catch (e) {
    console.warn('[Preview SW] Failed to delete from cache:', e);
  }
}

/**
 * Handle CLEAR_FILES message
 */
async function handleClearFiles() {
  fileStore.clear();

  try {
    await caches.delete(CACHE_NAME);
  } catch (e) {
    console.warn('[Preview SW] Failed to clear cache:', e);
  }

  console.log('[Preview SW] All files cleared');
}

/**
 * Normalize file path
 */
function normalizePath(path) {
  let normalized = path.startsWith('/') ? path.slice(1) : path;
  if (normalized.startsWith('preview/')) {
    normalized = normalized.slice(8);
  }
  return normalized;
}

/**
 * Fetch event - intercept requests from preview iframe
 */
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Log ALL fetch requests for debugging
  console.log(`[Preview SW] Fetch intercepted: ${url.pathname} (mode: ${event.request.mode})`);

  if (!url.pathname.startsWith(PREVIEW_SCOPE)) {
    console.log(`[Preview SW] Skipping - not in preview scope`);
    return;
  }

  console.log(`[Preview SW] Handling preview request: ${url.pathname}`);
  event.respondWith(handlePreviewRequest(event.request, url));
});

/**
 * Handle preview request
 */
async function handlePreviewRequest(request, url) {
  console.log(`[Preview SW] handlePreviewRequest called for: ${url.pathname}`);

  // Make sure we've restored from cache first
  if (!restoredFromCache) {
    console.log(`[Preview SW] Restoring from cache first...`);
    await restoreFromCache();
  }

  let filePath = url.pathname.slice(PREVIEW_SCOPE.length);

  if (!filePath || filePath === '') {
    filePath = 'index.html';
  }

  console.log(`[Preview SW] Looking for file: ${filePath} (fileStore has ${fileStore.size} files)`);

  // Try to serve from memory first (fastest)
  let content = tryGetFile(filePath);

  if (content) {
    console.log(`[Preview SW] Found file in memory: ${filePath} (${content.length} bytes)`);
    return createResponse(content, filePath);
  }

  // Try from Cache API as fallback
  const cache = await caches.open(CACHE_NAME);
  const cachedResponse = await cache.match(request);
  if (cachedResponse) {
    // Also restore to memory for future requests
    const text = await cachedResponse.clone().text();
    fileStore.set(filePath, text);
    return createResponse(text, filePath);
  }

  // Check if this is an npm package request
  if (isNpmPackageRequest(filePath)) {
    return handleNpmPackage(filePath);
  }

  // Wait briefly for files to arrive
  const waited = await waitForFile(filePath, 2000);
  if (waited) {
    return createResponse(waited, filePath);
  }

  // 404
  console.warn(`[Preview SW] 404: ${filePath}`);
  return new Response(`File not found: ${filePath}`, {
    status: 404,
    statusText: 'Not Found',
    headers: { 'Content-Type': 'text/plain' }
  });
}

/**
 * Try to get a file from the in-memory store with fallbacks
 */
function tryGetFile(filePath) {
  // Exact match
  let content = fileStore.get(filePath);
  if (content) return content;

  // Directory index
  if (!filePath.includes('.')) {
    content = fileStore.get(filePath + '/index.html');
    if (content) return content;
    content = fileStore.get(filePath + '.html');
    if (content) return content;
  }

  // Common extensions
  const extensions = ['.tsx', '.ts', '.jsx', '.js', '.mjs'];
  for (const ext of extensions) {
    content = fileStore.get(filePath + ext);
    if (content) return content;
  }

  return null;
}

/**
 * Create a response with proper headers
 */
function createResponse(content, filePath) {
  return new Response(content, {
    status: 200,
    headers: {
      'Content-Type': getMimeType(filePath),
      'Cache-Control': 'no-cache',
      'X-Served-By': `BAVINI-Preview-SW-v${SW_VERSION}`,
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Cross-Origin-Resource-Policy': 'cross-origin',
    }
  });
}

/**
 * Wait for a file to appear with proper cleanup
 */
function waitForFile(filePath, timeout) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    let resolved = false;
    let timerId = null;

    const cleanup = () => {
      resolved = true;
      if (timerId) {
        clearTimeout(timerId);
        timerId = null;
      }
    };

    const check = () => {
      // Stop if already resolved
      if (resolved) return;

      const content = tryGetFile(filePath);
      if (content) {
        cleanup();
        resolve(content);
        return;
      }

      if (Date.now() - startTime >= timeout) {
        cleanup();
        resolve(null);
        return;
      }

      // Schedule next check
      timerId = setTimeout(check, 100);
    };

    check();
  });
}

/**
 * Check if request looks like an npm package
 */
function isNpmPackageRequest(path) {
  if (path.startsWith('.') || path.startsWith('/')) return false;
  if (path.includes('.') && !path.startsWith('@')) return false;
  return /^(@[a-z0-9-]+\/)?[a-z0-9-]+/.test(path);
}

/**
 * Handle npm package request by fetching from CDN
 */
async function handleNpmPackage(packagePath) {
  const cdnUrl = `${CDN_URL}/${packagePath}`;

  try {
    const response = await fetch(cdnUrl);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: {
        'Content-Type': response.headers.get('Content-Type') || 'application/javascript',
        'Cache-Control': 'public, max-age=31536000',
        'X-Served-By': 'BAVINI-Preview-SW-CDN'
      }
    });
  } catch (error) {
    console.error(`[Preview SW] CDN fetch failed: ${error.message}`);
    return new Response(`Failed to fetch package: ${packagePath}`, {
      status: 502,
      statusText: 'Bad Gateway',
      headers: { 'Content-Type': 'text/plain' }
    });
  }
}

/**
 * Get MIME type for a file
 */
function getMimeType(path) {
  const ext = path.split('.').pop()?.toLowerCase();

  const mimeTypes = {
    'html': 'text/html; charset=utf-8',
    'css': 'text/css; charset=utf-8',
    'js': 'application/javascript; charset=utf-8',
    'mjs': 'application/javascript; charset=utf-8',
    'jsx': 'application/javascript; charset=utf-8',
    'ts': 'application/javascript; charset=utf-8',
    'tsx': 'application/javascript; charset=utf-8',
    'json': 'application/json; charset=utf-8',
    'svg': 'image/svg+xml',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'ico': 'image/x-icon',
    'woff': 'font/woff',
    'woff2': 'font/woff2',
    'ttf': 'font/ttf',
    'eot': 'application/vnd.ms-fontobject',
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mp3': 'audio/mpeg',
    'wav': 'audio/wav',
  };

  return mimeTypes[ext] || 'application/octet-stream';
}

console.log(`[Preview SW v${SW_VERSION}] Service Worker loaded`);
