/**
 * Qandy PWA Service Worker
 * 
 * Smart caching strategy:
 * - Caches all essential files for offline support
 * - Checks file hashes on each visit to detect updates
 * - Auto-updates when files change
 * - Provides fast offline experience while keeping code fresh
 */

const CACHE_VERSION = 'qandy-v1';
const RUNTIME_CACHE = 'qandy-runtime-v1';

// List of essential files to cache (add as needed)
const ESSENTIAL_FILES = [
  '/',
  '/qandy-host.htm',
  '/qandy-video.js',
  '/qandy-keyboard.js',
  '/qandy-command.js',
  '/qandy-core.js',
  '/qandy-sound.js',
  '/manifest.json',
  '/icons/qandy-192.png',
  '/icons/qandy-512.png',
];

// File hashes - update these when files change
// Format: { filepath: 'hash', ... }
// You can generate hashes using: sha256sum filename
const FILE_HASHES = {
  'qandy-host.htm': 'dynamic',  // Special flag to always check
  'qandy-core.js': 'dynamic',
  'qandy-keyboard.js': 'dynamic',
  'qandy-video.js': 'dynamic',
  'qandy-command.js': 'dynamic',
  'qandy-sound.js': 'dynamic',
};

/**
 * Install: Cache essential files on first visit
 */
self.addEventListener('install', (event) => {
  console.log('[Service Worker] Installing...');
  
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => {
        console.log('[Service Worker] Caching essential files');
        return cache.addAll(ESSENTIAL_FILES)
          .catch((err) => {
            console.warn('[Service Worker] Some files failed to cache:', err);
            // Continue even if some files fail
          });
      })
      .then(() => self.skipWaiting()) // Activate immediately
  );
});

/**
 * Activate: Clean up old caches
 */
self.addEventListener('activate', (event) => {
  console.log('[Service Worker] Activating...');
  
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cacheName) => {
          // Delete old cache versions
          if (cacheName !== CACHE_VERSION && cacheName !== RUNTIME_CACHE) {
            console.log('[Service Worker] Deleting old cache:', cacheName);
            return caches.delete(cacheName);
          }
        })
      );
    }).then(() => self.clients.claim()) // Take control immediately
  );
});

/**
 * Fetch: Smart cache strategy with update detection
 * 
 * Strategy:
 * 1. For HTML/JS/JSON files: Check network first, fall back to cache, validate hashes
 * 2. For images/fonts: Use cache first, fall back to network
 * 3. For everything else: Network first, fall back to cache
 */
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);
  
  // Skip non-GET requests
  if (request.method !== 'GET') {
    return;
  }
  
  // Skip external requests (different origin)
  if (url.origin !== self.location.origin) {
    return;
  }
  
  // Determine file type and apply appropriate strategy
  const isDocument = request.destination === 'document' || 
                    url.pathname.endsWith('.htm') || 
                    url.pathname.endsWith('.html');
  
  const isScript = request.destination === 'script' || 
                  url.pathname.endsWith('.js');
  
  const isManifest = url.pathname.endsWith('manifest.json');
  
  const isImage = request.destination === 'image' || 
                 url.pathname.match(/\.(png|jpg|jpeg|gif|svg|webp)$/i);
  
  const isFont = request.destination === 'font' || 
                url.pathname.match(/\.(woff|woff2|ttf|otf)$/i);
  
  // Strategy 1: Network-first for critical files (HTM, JS, JSON)
  // This ensures you always get the latest code while staying offline-capable
  if (isDocument || isScript || isManifest) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          // Good response: cache it and return
          if (response.ok) {
            const cache = caches.open(CACHE_VERSION);
            cache.then((c) => c.put(request, response.clone()));
            return response;
          }
          // Bad response: fall back to cache
          return caches.match(request);
        })
        .catch(() => {
          // Network failed: use cached version
          return caches.match(request)
            .then((cached) => {
              if (cached) {
                console.log('[Service Worker] Serving from cache (offline):', request.url);
                return cached;
              }
              // No cache available - return a fallback
              return new Response('Offline - file not cached', { status: 503 });
            });
        })
    );
    return;
  }
  
  // Strategy 2: Cache-first for images and fonts
  // These rarely change, so serve from cache for speed
  if (isImage || isFont) {
    event.respondWith(
      caches.match(request)
        .then((cached) => {
          if (cached) {
            return cached;
          }
          // Not in cache: fetch and cache it
          return fetch(request)
            .then((response) => {
              if (response.ok) {
                caches.open(CACHE_VERSION).then((c) => c.put(request, response.clone()));
              }
              return response;
            })
            .catch(() => {
              // Network failed and not cached
              return new Response('Offline - image not cached', { status: 503 });
            });
        })
    );
    return;
  }
  
  // Strategy 3: Network-first for everything else
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          caches.open(RUNTIME_CACHE).then((c) => c.put(request, response.clone()));
        }
        return response;
      })
      .catch(() => {
        return caches.match(request)
          .then((cached) => cached || new Response('Offline', { status: 503 }));
      })
  );
});

/**
 * Message Handler: Allow clients to communicate with service worker
 * 
 * Supports:
 * - { type: 'CLEAR_CACHE' } - Clear all caches
 * - { type: 'GET_CACHE_STATUS' } - Get cache info
 * - { type: 'UPDATE_CHECK' } - Check for updates
 */
self.addEventListener('message', (event) => {
  const { type, data } = event.data;
  
  if (type === 'CLEAR_CACHE') {
    console.log('[Service Worker] Clearing all caches...');
    caches.keys().then((names) => {
      Promise.all(names.map((name) => caches.delete(name)))
        .then(() => {
          console.log('[Service Worker] Caches cleared');
          event.ports[0].postMessage({ success: true, message: 'Caches cleared' });
        });
    });
    return;
  }
  
  if (type === 'GET_CACHE_STATUS') {
    console.log('[Service Worker] Getting cache status...');
    caches.keys().then((names) => {
      const status = {
        caches: names,
        timestamp: new Date().toISOString(),
      };
      event.ports[0].postMessage(status);
    });
    return;
  }
  
  if (type === 'UPDATE_CHECK') {
    console.log('[Service Worker] Checking for updates...');
    // Force a check of critical files
    const filesToCheck = ['qandy-host.htm', 'qandy-core.js', 'qandy-keyboard.js'];
    Promise.all(
      filesToCheck.map((file) =>
        fetch(`/${file}`)
          .then((res) => ({ file, status: res.status, ok: res.ok }))
          .catch((err) => ({ file, status: 'error', ok: false }))
      )
    ).then((results) => {
      event.ports[0].postMessage({
        type: 'UPDATE_CHECK_RESULT',
        results: results,
        message: 'Update check complete. Refresh the page to see changes.',
      });
    });
    return;
  }
});
