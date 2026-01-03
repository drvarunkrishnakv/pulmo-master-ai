// Pulmo-Master AI Service Worker
// Version format: v{major}.{minor} - bump when code changes
const CACHE_VERSION = 'v2.0';
const STATIC_CACHE = `pulmo-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `pulmo-dynamic-${CACHE_VERSION}`;

// Core assets that should always be cached
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/styles.css'
];

// Install event - cache static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(STATIC_CACHE).then((cache) => {
            return cache.addAll(STATIC_ASSETS);
        })
    );
    // Activate immediately
    self.skipWaiting();
});

// Activate event - clean old caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((cacheNames) => {
            return Promise.all(
                cacheNames
                    .filter((name) => {
                        // Delete old versioned caches
                        return name.startsWith('pulmo-') &&
                            !name.includes(CACHE_VERSION);
                    })
                    .map((name) => caches.delete(name))
            );
        })
    );
    // Claim all clients
    self.clients.claim();
});

// Fetch event - smart caching strategy
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // Skip non-GET requests
    if (request.method !== 'GET') return;

    // Skip API calls (Gemini)
    if (url.hostname.includes('generativelanguage.googleapis.com')) return;
    if (url.hostname.includes('firestore.googleapis.com')) return;
    if (url.hostname.includes('firebase')) return;

    // Vendor chunks - cache first (rarely change)
    if (url.pathname.includes('vendor-')) {
        event.respondWith(
            caches.match(request).then((cached) => {
                if (cached) return cached;
                return fetch(request).then((response) => {
                    const responseClone = response.clone();
                    caches.open(STATIC_CACHE).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                });
            })
        );
        return;
    }

    // Content chunks (MCQs) - cache first with background update
    if (url.pathname.includes('-ocr-complete') || url.pathname.includes('generated-mcqs')) {
        event.respondWith(
            caches.match(request).then((cached) => {
                const fetchPromise = fetch(request).then((response) => {
                    const responseClone = response.clone();
                    caches.open(DYNAMIC_CACHE).then((cache) => {
                        cache.put(request, responseClone);
                    });
                    return response;
                }).catch(() => cached);

                return cached || fetchPromise;
            })
        );
        return;
    }

    // Everything else - network first, fallback to cache
    event.respondWith(
        fetch(request)
            .then((response) => {
                const responseClone = response.clone();
                caches.open(DYNAMIC_CACHE).then((cache) => {
                    cache.put(request, responseClone);
                });
                return response;
            })
            .catch(() => caches.match(request))
    );
});
