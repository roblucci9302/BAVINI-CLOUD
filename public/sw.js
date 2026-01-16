/**
 * BAVINI Service Worker - Asset Caching
 *
 * Strategy:
 * - Cache-First for static assets (JS, CSS, images, fonts, WASM)
 * - Network-First for HTML and API calls
 * - Stale-While-Revalidate for font files
 */

const CACHE_VERSION = 'bavini-v2';
const STATIC_CACHE = `${CACHE_VERSION}-static`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;
const PYODIDE_CACHE = `${CACHE_VERSION}-pyodide`;

// Assets to pre-cache on install
const PRECACHE_ASSETS = [
  '/favicon.svg',
  '/logo.svg',
];

// Pyodide assets (cached separately for better management)
const PYODIDE_ASSETS = [
  '/assets/pyodide/pyodide.mjs',
  '/assets/pyodide/pyodide.js',
  '/assets/pyodide/pyodide-lock.json',
];

// Maximum cache sizes
const MAX_RUNTIME_CACHE_SIZE = 100;
const MAX_PYODIDE_CACHE_SIZE = 20;

// File extensions to cache with Cache-First strategy
const CACHEABLE_EXTENSIONS = [
  '.js',
  '.css',
  '.woff',
  '.woff2',
  '.ttf',
  '.otf',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.svg',
  '.webp',
  '.ico',
  '.wasm',
  '.data',
];

// Patterns to never cache
const NEVER_CACHE_PATTERNS = [
  /\/api\//,
  /\/action\//,
  /\/__/, // Remix internal routes
  /\/socket/,
  /hot-update/,
  /\.map$/,
];

/**
 * Check if a URL should be cached
 */
function shouldCache(url) {
  const urlObj = new URL(url);

  // Never cache patterns
  for (const pattern of NEVER_CACHE_PATTERNS) {
    if (pattern.test(urlObj.pathname)) {
      return false;
    }
  }

  // Cache if it's a static asset
  for (const ext of CACHEABLE_EXTENSIONS) {
    if (urlObj.pathname.endsWith(ext)) {
      return true;
    }
  }

  // Cache assets from build directory
  if (urlObj.pathname.startsWith('/assets/')) {
    return true;
  }

  return false;
}

/**
 * Limit cache size by removing oldest entries
 */
async function limitCacheSize(cacheName, maxSize) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();

  if (keys.length > maxSize) {
    // Delete oldest entries (first in the list)
    const toDelete = keys.slice(0, keys.length - maxSize);
    await Promise.all(toDelete.map(key => cache.delete(key)));
    console.log(`[SW] Pruned ${toDelete.length} entries from ${cacheName}`);
  }
}

/**
 * Install event - Pre-cache static assets
 */
self.addEventListener('install', (event) => {
  console.log('[SW] Installing version:', CACHE_VERSION);

  event.waitUntil(
    Promise.all([
      // Pre-cache static assets
      caches.open(STATIC_CACHE).then((cache) => {
        return cache.addAll(PRECACHE_ASSETS);
      }),
      // Pre-cache Pyodide assets (fail silently if not available)
      caches.open(PYODIDE_CACHE).then((cache) => {
        return Promise.allSettled(
          PYODIDE_ASSETS.map(url =>
            cache.add(url).catch(() => {
              console.log('[SW] Could not pre-cache:', url);
            })
          )
        );
      }),
    ]).then(() => {
      console.log('[SW] Pre-caching complete');
      // Skip waiting to activate immediately
      return self.skipWaiting();
    })
  );
});

/**
 * Activate event - Clean up old caches
 */
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((cacheName) => {
            // Delete caches that don't match current version
            return cacheName.startsWith('bavini-') && !cacheName.startsWith(CACHE_VERSION);
          })
          .map((cacheName) => {
            console.log('[SW] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          })
      );
    }).then(() => {
      // Take control of all clients immediately
      return self.clients.claim();
    })
  );
});

/**
 * Fetch event - Cache-First for assets, Network-First for documents
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;

  // Only handle GET requests
  if (request.method !== 'GET') {
    return;
  }

  // Skip non-http(s) requests
  if (!request.url.startsWith('http')) {
    return;
  }

  // Check if this is a cacheable asset
  if (shouldCache(request.url)) {
    // Cache-First strategy for static assets
    event.respondWith(cacheFirst(request));
  } else if (request.mode === 'navigate') {
    // Network-First for navigation (HTML pages)
    event.respondWith(networkFirst(request));
  }
  // Let other requests pass through normally
});

/**
 * Cache-First strategy
 * Return from cache if available, otherwise fetch and cache
 */
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    // Only cache successful responses
    if (networkResponse.ok) {
      const url = new URL(request.url);

      // Use Pyodide cache for pyodide assets
      const cacheName = url.pathname.includes('/pyodide/')
        ? PYODIDE_CACHE
        : RUNTIME_CACHE;

      const maxSize = cacheName === PYODIDE_CACHE
        ? MAX_PYODIDE_CACHE_SIZE
        : MAX_RUNTIME_CACHE_SIZE;

      const cache = await caches.open(cacheName);
      // Clone the response since it can only be consumed once
      cache.put(request, networkResponse.clone());

      // Limit cache size asynchronously
      limitCacheSize(cacheName, maxSize);
    }

    return networkResponse;
  } catch (error) {
    // If network fails and we have a cached version, return it
    const fallbackResponse = await caches.match(request);
    if (fallbackResponse) {
      return fallbackResponse;
    }
    throw error;
  }
}

/**
 * Network-First strategy
 * Try network first, fall back to cache
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    return networkResponse;
  } catch (error) {
    // Network failed, try cache
    const cachedResponse = await caches.match(request);
    if (cachedResponse) {
      return cachedResponse;
    }
    throw error;
  }
}

/**
 * Message handler for cache management
 */
self.addEventListener('message', (event) => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }

  if (event.data === 'clearCache') {
    event.waitUntil(
      caches.keys().then((cacheNames) => {
        return Promise.all(
          cacheNames.map((cacheName) => caches.delete(cacheName))
        );
      })
    );
  }
});
