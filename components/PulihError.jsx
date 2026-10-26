'use client';
import { useEffect, useState } from 'react';

// ===== Layar pemulihan error aplikasi =====
// Menggantikan layar "Application error: a client-side exception has occurred".
// 1) Menampilkan pesan error asli (bisa di-screenshot untuk diagnosa)
// 2) Mencatat error ke Log Aktivitas (user, halaman, perangkat) supaya manager bisa melihatnya
// 3) Bila penyebabnya file aplikasi versi lama di cache perangkat (umum di iPhone setelah update),
//    cache dibersihkan & aplikasi dimuat ulang otomatis — sekali saja per sesi
const POLA_CACHE = /ChunkLoadError|Loading chunk|Loading CSS chunk|dynamically imported module|Importing a module script failed|Unexpected token '<'/i;

export async function bersihkanDanMuatUlang() {
  try {
    if ('serviceWorker' in navigator) {
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(regs.map(r => r.unregister().catch(() => {})));
    }
    if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
  } catch {}
  const u = new URL(window.location.href); u.searchParams.set('segar', Date.now().toString(36));
  window.location.replace(u.toString());
}

export default function PulihError({ error, reset }) {
  const [proses, setProses] = useState(false);
  const pesan = String((error && (error.message || error.toString())) || 'Tidak diketahui');
  useEffect(() => {
    try {
      fetch('/api/log', { method: 'POST', headers: { 'content-type': 'application/json' },
        // sertakan potongan stack (nama fungsi pemicu) supaya penyebab bisa dilacak dari Log Aktivitas
        body: JSON.stringify({ error: (pesan.slice(0, 200) + (error && error.digest ? ' #' + error.digest : '') + ' | ' + String((error && error.stack) || '').split('\n').slice(0, 3).join(' < ')).slice(0, 380), halaman: window.location.pathname,
          pwa: window.matchMedia && window.matchMedia('(display-mode: standalone)').matches }) }).catch(() => {});
    } catch {}
    if (POLA_CACHE.test(pesan)) {
      try { if (!sessionStorage.getItem('crm-auto-segar')) { sessionStorage.setItem('crm-auto-segar', '1'); setProses(true); bersihkanDanMuatUlang(); } } catch {}
    }
  }, []); // eslint-disable-line

  const tombol = { padding: '12px 18px', borderRadius: 999, border: '1px solid #C9A961', fontWeight: 700, fontSize: 15, cursor: 'pointer', width: '100%' };
  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: '#0B1F19', color: '#F4EFE3', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <div style={{ width: 'min(420px, 100%)', textAlign: 'center' }}>
        <div style={{ fontSize: 40 }}>🛠️</div>
        <h2 style={{ margin: '8px 0 6px' }}>{proses ? 'Memperbarui aplikasi…' : 'Halaman gagal dimuat'}</h2>
        <p style={{ opacity: .85, fontSize: 14, lineHeight: 1.5, margin: '0 0 14px' }}>
          {proses ? 'Versi aplikasi di perangkat ini sudah lama — cache dibersihkan dan versi terbaru dimuat.' : 'Coba langkah di bawah. Login & data CRM tetap aman.'}</p>
        {!proses && <>
          <div style={{ display: 'grid', gap: 8 }}>
            <button style={{ ...tombol, background: '#C9A961', color: '#0B1F19' }} onClick={() => { setProses(true); bersihkanDanMuatUlang(); }}>Bersihkan cache &amp; muat ulang</button>
            {reset && <button style={{ ...tombol, background: 'transparent', color: '#F4EFE3' }} onClick={() => reset()}>Coba lagi</button>}
            <button style={{ ...tombol, background: 'transparent', color: '#F4EFE3' }} onClick={() => { window.location.href = '/beranda'; }}>Ke Beranda</button>
          </div>
          <div style={{ marginTop: 16, padding: 10, borderRadius: 10, background: 'rgba(255,255,255,.07)', fontSize: 11.5, textAlign: 'left', wordBreak: 'break-word', fontFamily: 'ui-monospace, Menlo, monospace' }}>
            Info untuk admin: {pesan}{error && error.digest ? ' · #' + error.digest : ''}
            <br />{typeof window !== 'undefined' ? window.location.pathname : ''} · {typeof navigator !== 'undefined' ? navigator.userAgent.replace(/^Mozilla\/5\.0 /, '').slice(0, 120) : ''}
          </div>
        </>}
      </div>
    </div>
  );
}
