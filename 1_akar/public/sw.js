// Service worker CRM CHL v2 — cache pintar untuk loading kilat
// - Aset statis (JS/CSS/gambar/font): cache-first (sekali unduh, seterusnya instan)
// - Halaman: network-first (selalu terbaru, fallback cache saat offline)
// - /api/: SELALU network — data CRM tidak pernah basi
const VER = 'harmoni-one-v3';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k)))).then(() => self.clients.claim())
));

const STATIS = /\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/;

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Font Google (CSS + file font): cache-first — kunjungan kedua dst tanpa unduh ulang
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(
      caches.open(VER).then(c => c.match(e.request).then(hit => hit ||
        fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; })
      ))
    );
    return;
  }

  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // data selalu segar

  // Aset statis: cache-first
  if (url.pathname.startsWith('/_next/static/') || STATIS.test(url.pathname) || url.pathname === '/manifest.json') {
    e.respondWith(
      caches.open(VER).then(c => c.match(e.request).then(hit => hit ||
        fetch(e.request).then(res => { if (res.ok) c.put(e.request, res.clone()); return res; })
      ))
    );
    return;
  }

  // Navigasi halaman: network-first, fallback cache saat offline
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => { const cl = res.clone(); caches.open(VER).then(c => c.put(e.request, cl)); return res; })
        .catch(() => caches.open(VER).then(c => c.match(e.request)))
    );
  }
});

// ===== Notifikasi push (balasan konsumen di WhatsApp, lead dioper, pengingat follow up) =====
self.addEventListener('push', e => {
  let d = {};
  try { d = e.data ? e.data.json() : {}; } catch { d = { isi: e.data ? e.data.text() : '' }; }
  e.waitUntil(self.registration.showNotification(d.judul || 'Harmoni One', {
    body: d.isi || '', icon: '/icon-192.png', badge: '/icon-192.png',
    tag: d.tag || undefined, renotify: !!d.tag, data: { url: d.url || '/beranda' },
  }));
});
// Ketuk notifikasi → buka halaman terkait (pakai jendela aplikasi yang sudah terbuka bila ada)
self.addEventListener('notificationclick', e => {
  e.notification.close();
  const tujuan = new URL((e.notification.data && e.notification.data.url) || '/beranda', self.location.origin).href;
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    for (const c of list) { if ('focus' in c) { c.navigate(tujuan).catch(() => {}); return c.focus(); } }
    return self.clients.openWindow(tujuan);
  }));
});
