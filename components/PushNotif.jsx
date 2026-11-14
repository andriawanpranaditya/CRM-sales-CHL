'use client';
// Ajakan mengaktifkan notifikasi HP (Web Push). Bila izin sudah diberikan, perangkat didaftarkan otomatis.
import { useEffect, useState } from 'react';
import { api } from '@/components/util';

const keUint8 = b64 => { const p = '='.repeat((4 - b64.length % 4) % 4); const s = atob((b64 + p).replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from([...s].map(c => c.charCodeAt(0))); };
async function daftar() {
  const reg = await navigator.serviceWorker.ready;
  let sub = await reg.pushManager.getSubscription();
  if (!sub) { const { publicKey } = await api('/api/push', { silent: true }); sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keUint8(publicKey) }); }
  await api('/api/push', { method: 'POST', body: JSON.stringify({ subscription: sub.toJSON() }), silent: true });
}

export default function PushNotif({ user }) {
  const [tampil, setTampil] = useState(false), [ios, setIos] = useState(false), [proses, setProses] = useState(false);
  const boleh = user && (user.role === 'manager' || (user.role === 'sales' && !user.leadAgent));
  useEffect(() => {
    if (!boleh || typeof window === 'undefined') return;
    const iPhone = /iPhone|iPad|iPod/i.test(navigator.userAgent), standalone = window.matchMedia?.('(display-mode: standalone)').matches || navigator.standalone;
    const dukung = 'serviceWorker' in navigator && 'PushManager' in window && typeof Notification !== 'undefined';
    if (!dukung) { if (iPhone && !standalone) { setIos(true); setTampil(!localStorage.getItem('push-nanti')); } return; }
    if (Notification.permission === 'granted') { daftar().catch(() => {}); return; }
    if (Notification.permission === 'default' && !localStorage.getItem('push-nanti')) setTampil(true);
  }, [boleh]); // eslint-disable-line
  if (!tampil) return null;
  const nanti = () => { try { localStorage.setItem('push-nanti', '1'); } catch {} setTampil(false); };
  if (ios) return <div className="push-ajak">📲 Agar notifikasi masuk ke iPhone: buka CRM di Safari → <b>Share</b> → <b>Add to Home Screen</b>, lalu buka CRM dari ikon itu.<button className="sort-btn" onClick={nanti}>Nanti</button></div>;
  return (<div className="push-ajak">🔔 <span><b>Aktifkan notifikasi HP</b> — {user.role === 'manager' ? 'Reserved / Booking / Batal baru langsung masuk ke HP walau CRM tertutup.' : 'pengingat kerja & lead baru dari Marcom langsung masuk ke HP walau CRM tertutup.'}</span>
    <button className="btn btn-primary" style={{ width: 'auto', padding: '6px 14px' }} disabled={proses} onClick={async () => {
      setProses(true);
      try { const izin = await Notification.requestPermission(); if (izin === 'granted') { await daftar(); await api('/api/push', { method: 'POST', body: JSON.stringify({ tes: true }) }); setTampil(false); } else nanti(); }
      catch (e) { alert('Notifikasi belum bisa diaktifkan: ' + (e?.message || e)); } finally { setProses(false); } }}>Aktifkan</button>
    <button className="sort-btn" onClick={nanti}>Nanti</button></div>);
}
