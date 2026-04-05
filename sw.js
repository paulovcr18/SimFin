// ══════════════════════════════════════════════════════════
// SimFin · Service Worker
// Estratégia: Cache First para assets locais
//             Network First para fontes e Chart.js (CDN)
// ══════════════════════════════════════════════════════════

// CACHE_NAME é gerado com timestamp de build para invalidar cache automaticamente a cada deploy.
// Formato: simfin-YYYYMMDD-HHMMSS  — nunca precisa ser alterado manualmente.
const CACHE_NAME = 'simfin-20260404-210000';

// Assets locais — sempre cacheados
const LOCAL_ASSETS = [
  './',
  './index.html',
  './styles.css',
  './manifest.json',
  './icon-192.svg',
  './icon-512.svg',
  // JS modules
  './js/payroll.js',
  './js/utils.js',
  './js/projection.js',
  './js/app.js',
  './js/storage.js',
  './js/goals.js',
  './js/reminders.js',
  './js/modals.js',
  './js/carteira.js',
  './js/track.js',
  './js/db.js',
  './js/tesouro-api.js',
  './js/auth.js',
  'https://cdn.jsdelivr.net/npm/xlsx@0.18.5/dist/xlsx.full.min.js',
];

// Assets externos — tentamos network, fallback para cache
const CDN_ASSETS = [
  'https://cdn.jsdelivr.net/npm/chart.js@4.4.0/dist/chart.umd.min.js',
  'https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Mono:wght@400;500&family=Sora:wght@300;400;500;600&display=swap',
];

// ── Install: pré-cacheia todos os assets ──
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      console.log('[SimFin SW] Cacheando assets...');
      return cache.addAll(LOCAL_ASSETS).then(() => {
        return Promise.allSettled(
          CDN_ASSETS.map(url =>
            fetch(url, { cache: 'no-cache' })
              .then(res => cache.put(url, res))
              .catch(() => console.warn('[SimFin SW] CDN não disponível:', url))
          )
        );
      });
    }).then(() => {
      console.log('[SimFin SW] Instalado com sucesso!');
      return self.skipWaiting();
    })
  );
});

// ── Activate: limpa caches antigos ──
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => key !== CACHE_NAME)
          .map(key => {
            console.log('[SimFin SW] Removendo cache antigo:', key);
            return caches.delete(key);
          })
      )
    ).then(() => self.clients.claim())
  );
});

// ── Fetch: Cache First para tudo ──
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  if (url.protocol === 'chrome-extension:' || url.protocol === 'moz-extension:') return;

  // Network-only: never cache live API responses (stale prices are a UX bug)
  const NETWORK_ONLY_HOSTS = [
    'brapi.dev',
    'query1.finance.yahoo.com',
  ];
  const NETWORK_ONLY_PATHS = [
    'qaopienbsmssjosttucn.supabase.co/functions',
  ];
  const isNetworkOnly =
    NETWORK_ONLY_HOSTS.some(h => url.hostname === h || url.hostname.endsWith('.' + h)) ||
    NETWORK_ONLY_PATHS.some(p => url.href.includes(p));
  if (isNetworkOnly) return; // fall through to browser default (network)

  event.respondWith(
    caches.match(event.request).then(cached => {
      if (cached) {
        const networkUpdate = fetch(event.request)
          .then(res => {
            if (res && res.ok) {
              caches.open(CACHE_NAME).then(cache => cache.put(event.request, res.clone()));
            }
          })
          .catch(() => {});
        return cached;
      }
      return fetch(event.request).then(res => {
        if (!res || !res.ok || res.type === 'opaque') return res;
        const resClone = res.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(event.request, resClone));
        return res;
      }).catch(() => {
        if (event.request.destination === 'document') {
          return caches.match('./index.html');
        }
      });
    })
  );
});

// ── Message: força atualização do SW ──
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
