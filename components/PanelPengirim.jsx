'use client';
// Daftar pengirim link terbuka: verifikasi 1 tombol, tolak, cabut
import { useEffect, useState } from 'react';
import { api } from '@/components/util';

export default function PanelPengirim({ tipe, onLihat }) {
  const [rows, setRows] = useState(null), [busy, setBusy] = useState(0), [semua, setSemua] = useState(false);
  const muat = () => api('/api/pengirim?daftar=1&tipe=' + tipe).then(d => setRows(d.pengirim)).catch(() => setRows([]));
  useEffect(() => { muat(); const t = setInterval(() => { if (document.visibilityState === 'visible') muat(); }, 30000); return () => clearInterval(t); }, [tipe]); // eslint-disable-line
  const aksi = async (id, aksi, alasan) => { setBusy(id); try { await api('/api/pengirim', { method: 'POST', body: JSON.stringify({ aksi, id, alasan }) }); await muat(); } catch (e) { alert(e.message); } finally { setBusy(0); } };
  if (!rows) return null;
  const tunggu = rows.filter(r => r.status === 'Menunggu'), sah = rows.filter(r => r.status === 'Terverifikasi');
  const ket = r => [r.hp, r.kantor, r.jenis && (r.jenis + (r.divisi ? ' – ' + r.divisi : '')), r.project].filter(Boolean).join(' · ');
  return (<div className="card" style={{ marginBottom: 14, borderColor: tunggu.length ? 'var(--brass, #C99C4F)' : undefined }}>
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}><b>🛡️ Pengirim terverifikasi</b>
      {tunggu.length ? <span className="badge b-overdue">{tunggu.length} menunggu verifikasi</span> : null}
      <span className="hint">· {sah.length} terverifikasi</span><span style={{ flex: 1 }} />
      {sah.length > 0 && <button className="sort-btn" onClick={() => setSemua(v => !v)}>{semua ? 'Sembunyikan daftar' : 'Lihat daftar'}</button>}</div>
    {tunggu.map(r => <div key={r.id} className="pg-baris tunggu">
      <div><b>{r.nama}</b><span className="tg-sub">{ket(r)} · daftar {new Date(r.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        {(r.ktp || r.npwp) && <div style={{ marginTop: 4 }}>{r.ktp && <button className="sort-btn" style={{ padding: '2px 8px', marginRight: 4 }} onClick={() => onLihat?.(r.ktp)}>📄 KTP</button>}{r.npwp && <button className="sort-btn" style={{ padding: '2px 8px' }} onClick={() => onLihat?.(r.npwp)}>📄 NPWP</button>}</div>}</div>
      <div className="pg-aksi"><button className="btn btn-primary pg-ok" disabled={busy === r.id} onClick={() => aksi(r.id, 'verifikasi')}>✅ Verifikasi</button>
        <button className="sort-btn" disabled={busy === r.id} onClick={() => { const a = prompt('Alasan menolak (opsional)?'); if (a !== null) aksi(r.id, 'tolak', a); }}>Tolak</button></div></div>)}
    {!tunggu.length && <p className="hint" style={{ marginTop: 6 }}>Pengirim baru wajib diverifikasi sekali sebelum bisa mengirim. Notifikasi masuk ke HP Anda dengan tombol <b>✅ Verifikasi</b>.</p>}
    {semua && sah.map(r => <div key={r.id} className="pg-baris"><div><b>{r.nama}</b><span className="tg-sub">{ket(r)}{r.dicek_oleh ? ' · diverifikasi ' + r.dicek_oleh : ''}</span></div>
      <div className="pg-aksi"><button className="sort-btn" disabled={busy === r.id} onClick={() => { if (confirm(`Cabut verifikasi ${r.nama}? Ia tidak bisa mengirim lagi sampai diverifikasi ulang.`)) aksi(r.id, 'cabut'); }}>Cabut</button></div></div>)}
  </div>);
}
