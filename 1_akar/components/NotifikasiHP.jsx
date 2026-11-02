'use client';
import { useEffect, useState } from 'react';
import { api } from '@/components/util';

// ===== Aktifkan notifikasi push di HP / peramban ini =====
// mode 'spanduk': ajakan di atas halaman (untuk peran yang menerima chat konsumen) — bisa ditutup, muncul lagi 7 hari kemudian
// mode 'panel'  : baris status kecil (di panel lonceng)
const b64keUint8 = s => { const p = '='.repeat((4 - s.length % 4) % 4); const r = atob((s + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...r].map(c => c.charCodeAt(0))); };
const iPhone = () => typeof navigator !== 'undefined' && /iPhone|iPad|iPod/.test(navigator.userAgent);
const terpasang = () => { try { return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch { return false; } };

export function statusDukungan() {
  if (typeof window === 'undefined') return 'memuat';
  if (iPhone() && !terpasang()) return 'ios-belum-dipasang';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || typeof Notification === 'undefined') return 'tidak-didukung';
  if (Notification.permission === 'denied') return 'ditolak';
  return 'bisa';
}

export default function NotifikasiHP({ mode = 'panel' }) {
  const [st, setSt] = useState('memuat');     // memuat | aktif | mati | ios-belum-dipasang | tidak-didukung | ditolak
  const [busy, setBusy] = useState(false);
  const [tutup, setTutup] = useState(false);

  async function cek() {
    const d = statusDukungan();
    if (d !== 'bisa') return setSt(d);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      setSt(sub && Notification.permission === 'granted' ? 'aktif' : 'mati');
    } catch { setSt('mati'); }
  }
  useEffect(() => {
    cek();
    try { const t = Number(localStorage.getItem('notif-hp-tutup') || 0); if (t && Date.now() - t < 7 * 86400000) setTutup(true); } catch {}
  }, []);

  async function aktifkan() {
    setBusy(true);
    try {
      const izin = await Notification.requestPermission();
      if (izin !== 'granted') { setSt(izin === 'denied' ? 'ditolak' : 'mati'); return; }
      const { publicKey } = await api('/api/push', { silent: true });
      const reg = await navigator.serviceWorker.ready;
      let sub = await reg.pushManager.getSubscription();
      if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64keUint8(publicKey) });
      await api('/api/push', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON(), pwa: terpasang() }) });
      await api('/api/push', { method: 'POST', body: JSON.stringify({ aksi: 'tes' }) });
      setSt('aktif');
    } catch (e) { alert('Notifikasi belum bisa diaktifkan: ' + (e.message || e)); } finally { setBusy(false); }
  }
  async function matikan() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.getSubscription();
      if (sub) { await api('/api/push', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }); await sub.unsubscribe(); }
      setSt('mati');
    } catch {} finally { setBusy(false); }
  }

  const pesan = {
    'ios-belum-dipasang': 'Di iPhone, notifikasi hanya bisa setelah aplikasi dipasang: ketuk tombol Bagikan (kotak dengan panah) → "Tambahkan ke Layar Utama", lalu buka dari ikon itu.',
    'tidak-didukung': 'Peramban ini belum mendukung notifikasi. Gunakan Chrome (Android) atau pasang aplikasi ke Layar Utama (iPhone, iOS 16.4+).',
    'ditolak': 'Notifikasi diblokir untuk aplikasi ini. Buka pengaturan HP/peramban → izinkan Notifikasi untuk Harmoni One, lalu muat ulang.',
  };

  if (mode === 'spanduk') {
    if (tutup || st === 'aktif' || st === 'memuat') return null;
    return (
      <div className="note spanduk-notif" style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap', margin: '0 0 12px' }}>
        <span style={{ fontSize: 20 }}>🔔</span>
        <span style={{ flex: 1, minWidth: 220 }}><b>Aktifkan notifikasi di HP ini</b> supaya langsung tahu saat konsumen membalas WhatsApp atau lead baru dioper ke Anda — walaupun aplikasi sedang ditutup.
          {pesan[st] && <><br /><span className="hint">{pesan[st]}</span></>}</span>
        {st === 'mati' && <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={aktifkan}>{busy ? 'Menyiapkan…' : 'Aktifkan'}</button>}
        <button className="sort-btn" onClick={() => { setTutup(true); try { localStorage.setItem('notif-hp-tutup', String(Date.now())); } catch {} }}>Nanti</button>
      </div>
    );
  }
  if (st === 'memuat') return null;
  return (
    <div className="hint" style={{ padding: '6px 2px', display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
      {st === 'aktif' ? <>🔔 Notifikasi HP aktif di perangkat ini. <button className="sort-btn" style={{ padding: '1px 8px' }} disabled={busy} onClick={matikan}>Matikan</button></>
        : st === 'mati' ? <>🔕 Notifikasi HP belum aktif. <button className="sort-btn" style={{ padding: '1px 8px' }} disabled={busy} onClick={aktifkan}>{busy ? 'Menyiapkan…' : 'Aktifkan'}</button></>
          : <>🔕 {pesan[st]}</>}
    </div>
  );
}
