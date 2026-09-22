// Service worker CRM CHL v3 — cache pintar + bersih-bersih otomatis
// - Aset statis (JS/CSS/gambar/font): cache-first (sekali unduh, seterusnya instan)
// - Halaman: network-first (selalu terbaru, fallback cache saat offline)
// - /api/: SELALU network — data CRM tidak pernah basi
// Bersih otomatis: versi cache mengikuti versi aplikasi (?v=), maks 150 file, file > 30 hari dibuang
const V = new URL(self.location.href).searchParams.get('v') || 'dev';
const VER = 'crm-chl-' + V;
const MAKS_FILE = 150;
const MAKS_UMUR = 30 * 24 * 60 * 60 * 1000;

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(
  // Deploy baru = versi baru → semua cache versi lama dihapus
  caches.keys().then(keys => Promise.all(keys.filter(k => k !== VER).map(k => caches.delete(k))))
    .then(() => rapikan())
    .then(() => self.clients.claim())
));

// Buang file berumur > 30 hari lalu pangkas ke batas maksimal (yang terlama dibuang dulu)
async function rapikan() {
  try {
    const c = await caches.open(VER);
    const keys = await c.keys();
    const kini = Date.now();
    for (const req of keys) {
      const res = await c.match(req);
      const t = res && Date.parse(res.headers.get('sw-cached-at') || res.headers.get('date') || '');
      if (t && kini - t > MAKS_UMUR) await c.delete(req);
    }
    const sisa = await c.keys();
    for (let i = 0; i < sisa.length - MAKS_FILE; i++) await c.delete(sisa[i]);
  } catch (err) { /* abaikan */ }
}

let hitung = 0;
async function simpan(c, req, res) {
  // tandai waktu simpan agar umur file bisa dihitung
  const h = new Headers(res.headers); h.set('sw-cached-at', new Date().toUTCString());
  const salinan = new Response(await res.clone().blob(), { status: res.status, statusText: res.statusText, headers: h });
  await c.put(req, salinan);
  if (++hitung % 25 === 0) rapikan(); // rapikan berkala, tidak setiap permintaan
}

function cacheDulu(e) {
  e.respondWith(
    caches.open(VER).then(c => c.match(e.request).then(hit => hit ||
      fetch(e.request).then(res => { if (res.ok) simpan(c, e.request, res); return res; })
    ))
  );
}

// Tombol "Segarkan Aplikasi" mengirim pesan ini
self.addEventListener('message', e => {
  if (e.data === 'bersihkan') {
    e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  }
});

const STATIS = /\.(js|css|png|jpg|jpeg|webp|svg|ico|woff2?)$/;

self.addEventListener('fetch', e => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET') return;

  // Font Google: cache-first
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') { cacheDulu(e); return; }

  if (url.origin !== location.origin) return;
  if (url.pathname.startsWith('/api/')) return; // data selalu segar

  // Aset statis: cache-first
  if (url.pathname.startsWith('/_next/static/') || STATIS.test(url.pathname) || url.pathname === '/manifest.json') { cacheDulu(e); return; }

  // Navigasi halaman: network-first, fallback cache saat offline
  if (e.request.mode === 'navigate') {
    e.respondWith(
      fetch(e.request)
        .then(res => { caches.open(VER).then(c => simpan(c, e.request, res)); return res; })
        .catch(() => caches.open(VER).then(c => c.match(e.request)))
    );
  }
});
