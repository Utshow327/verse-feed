const CACHE_NAME = 'religion-app-v18';
const STATIC_ASSETS = [
    './',
    './index.html',
    './script_v14.js',
    './style_v5.css',
    './manifest.json',
    './data/bible.json',
    './data/hadiths_v2.json',
    './data/quran_v2.json',
    './data/gita.json',
    './data/hindu_books.json',
    './data/sefaria.json',
    './data/gurbani.json',
    './data/buddhism.json',
    './data/philosophy.json',
    './data/psychology.json',
    './data/rankings.json',
    './libs/localforage.min.js',
    './libs/piper/piper-bundle.js',
    './libs/piper/piper_phonemize.data',
    './libs/piper/piper_phonemize.wasm',
    './libs/piper/ort-wasm-simd-threaded.wasm',
    './libs/piper/ort-wasm-simd-threaded.jsep.wasm',
    './libs/piper/ort-wasm-simd-threaded.jspi.wasm',
    './libs/piper/ort-wasm-simd-threaded.wasm',
    './libs/piper/ort.min.js'
];

// Install Event
self.addEventListener('install', (e) => {
    self.skipWaiting();
    e.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            console.log('Pre-caching offline static assets...');
            return cache.addAll(STATIC_ASSETS).catch(err => {
                console.error("Pre-caching failed for some static assets:", err);
            });
        })
    );
});

// Activate Event
self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        console.log('Clearing old cache:', key);
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Event (Cache First with Network Fallback & Dynamic Caching)
self.addEventListener('fetch', (e) => {
    const url = new URL(e.request.url);
    
    // Skip non-GET requests
    if (e.request.method !== 'GET') {
        e.respondWith(fetch(e.request));
        return;
    }

    // Dynamic Caching for HuggingFace ONNX model files & large ambient MP3s
    const isModelFile = url.hostname.includes('huggingface.co') || url.pathname.includes('.onnx') || url.pathname.includes('.json');
    const isMusicFile = url.pathname.endsWith('.mp3');

    if (isModelFile || isMusicFile) {
        e.respondWith(
            caches.match(e.request).then((cachedResponse) => {
                if (cachedResponse) {
                    console.log('Serving cached large asset:', url.pathname);
                    return cachedResponse;
                }
                return fetch(e.request).then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const cacheCopy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => {
                            cache.put(e.request, cacheCopy);
                            console.log('Cached large asset dynamically:', url.pathname);
                        });
                    }
                    return networkResponse;
                }).catch(() => {
                    // Fallback if offline
                    return new Response("Offline resource unavailable", { status: 503, statusText: "Offline" });
                });
            })
        );
        return;
    }

    // Network-First for static assets (ensures latest code is served)
    e.respondWith(
        fetch(e.request).then((networkResponse) => {
            if (networkResponse && networkResponse.status === 200) {
                const cacheCopy = networkResponse.clone();
                caches.open(CACHE_NAME).then((cache) => {
                    cache.put(e.request, cacheCopy);
                });
            }
            return networkResponse;
        }).catch(() => {
            return caches.match(e.request).then((cachedResponse) => {
                if (cachedResponse) {
                    return cachedResponse;
                }
            });
        })
    );
});
