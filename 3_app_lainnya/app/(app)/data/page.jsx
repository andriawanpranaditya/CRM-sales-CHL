'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api } from '@/components/util';

const JEDA = 30;   // detik antar pemeriksaan pembaruan

const angka = v => typeof v === 'number';
const tampil = v => (angka(v) ? v.toLocaleString('id-ID') : (v ?? ''));
const escHtml = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export default function DataBersamaPage() {
  const [tabs, setTabs] = useState(null);
  const [tab, setTab] = useState('');
  const [d, setD] = useState(null);           // { tersedia, kolom, rows, stamp, waktu, disamarkan, keterangan }
  const [cari, setCari] = useState('');
  const [saring, setSaring] = useState({});   // { kolom: teks }
  const [urut, setUrut] = useState({ k: '', arah: 1 });
  const [baru, setBaru] = useState({});       // _key baris yang baru berubah -> sorot sebentar
  const [detik, setDetik] = useState(0);
  const [gagal, setGagal] = useState('');
  const stampRef = useRef('');
  const rowsRef = useRef([]);

  useEffect(() => {
    api('/api/data-bersama').then(x => {
      setTabs(x.tabs);
      const awal = x.tabs.find(t => t.tersedia) || x.tabs[0];
      if (awal) setTab(awal.nama);
    }).catch(e => { toast(e.message); setGagal(e.message); });
  }, []);

  async function muat(paksa) {
    if (!tab) return;
    try {
      const x = await api('/api/data-bersama?tab=' + encodeURIComponent(tab) +
        (paksa || !stampRef.current ? '' : '&stamp=' + stampRef.current));
      if (x.sama) { detikRef.current = 0; setDetik(0); return; }
      if (x.tersedia && rowsRef.current.length) {
        // Tandai baris baru / berubah dibanding muatan sebelumnya
        const lama = {}; rowsRef.current.forEach(r => { lama[r._key] = JSON.stringify(r); });
        const tanda = {};
        x.rows.forEach(r => { if (lama[r._key] !== JSON.stringify(r)) tanda[r._key] = true; });
        if (Object.keys(tanda).length) {
          setBaru(tanda);
          setTimeout(() => setBaru({}), 6000);
        }
      }
      rowsRef.current = x.rows || [];
      stampRef.current = x.stamp || '';
      detikRef.current = 0; setD(x); setDetik(0); setGagal('');
    } catch (e) { setGagal(e.message); }
  }

  // Ganti tab -> muat penuh
  useEffect(() => {
    if (!tab) return;
    stampRef.current = ''; rowsRef.current = [];
    setD(null); setSaring({}); setCari(''); setUrut({ k: '', arah: 1 }); setBaru({});
    muat(true);
  }, [tab]);

  // Pembaruan berkala — berhenti saat tab browser tidak sedang dilihat
  const detikRef = useRef(0);
  useEffect(() => {
    detikRef.current = 0;
    const t = setInterval(() => {
      if (document.hidden) return;
      detikRef.current += 1;
      if (detikRef.current >= JEDA) { detikRef.current = 0; muat(false); }
      setDetik(detikRef.current);
    }, 1000);
    const kembali = () => { if (!document.hidden) muat(false); };
    document.addEventListener('visibilitychange', kembali);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', kembali); };
  }, [tab]);

  // Kolom yang isinya terbatas (project, tipe, status, skema...) disaring lewat dropdown;
  // kolom bebas (nama, alamat, nomor) tetap lewat ketikan
  const pilihan = useMemo(() => {
    if (!d || !d.tersedia) return {};
    const out = {};
    d.kolom.forEach(k => {
      const set = new Set();
      for (const r of d.rows) { const v = r[k]; if (v !== '' && v !== null && v !== undefined) set.add(String(v)); if (set.size > 40) break; }
      if (set.size >= 1 && set.size <= 40 && !d.rows.every(r => angka(r[k]))) out[k] = [...set].sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));
    });
    return out;
  }, [d]);

  const hasil = useMemo(() => {
    if (!d || !d.tersedia) return [];
    const q = cari.trim().toLowerCase();
    let r = d.rows.filter(row => {
      if (q && !d.kolom.some(k => String(row[k] ?? '').toLowerCase().includes(q))) return false;
      for (const [k, v] of Object.entries(saring)) {
        if (!v) continue;
        if (pilihan[k]) { if (String(row[k] ?? '') !== v) return false; }
        else if (!String(row[k] ?? '').toLowerCase().includes(v.toLowerCase())) return false;
      }
      return true;
    });
    if (urut.k) {
      r = [...r].sort((a, b) => {
        const x = a[urut.k], y = b[urut.k];
        if (angka(x) && angka(y)) return (x - y) * urut.arah;
        return String(x ?? '').localeCompare(String(y ?? ''), 'id', { numeric: true }) * urut.arah;
      });
    }
    return r;
  }, [d, cari, saring, urut, pilihan]);

  function unduhExcel() {
    if (!d || !d.tersedia) return;
    const html = '<html><head><meta charset="utf-8"></head><body><table border="1"><tr>' +
      d.kolom.map(k => '<th>' + escHtml(k) + '</th>').join('') + '</tr>' +
      hasil.map(r => '<tr>' + d.kolom.map(k => '<td>' + escHtml(r[k]) + '</td>').join('') + '</tr>').join('') +
      '</table></body></html>';
    const blob = new Blob(['\ufeff' + html], { type: 'application/vnd.ms-excel' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'Data_' + tab + '_' + new Date().toISOString().slice(0, 10) + '.xls';
    a.click();
    toast(hasil.length + ' baris diunduh');
  }

  if (gagal && !tabs) return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2>Data Bersama gagal dimuat</h2>
      <div className="note">{gagal}</div>
      <button className="btn btn-primary" style={{ width: 'auto', marginTop: 12 }} onClick={() => window.location.reload()}>Muat ulang</button>
    </div>);
  if (!tabs) return <div className="loading">Memuat…</div>;
  if (!tabs.length) return <div className="card" style={{ marginTop: 20 }}>Peran Anda belum mendapat akses Data Bersama.</div>;

  const adaSaring = cari || Object.values(saring).some(Boolean);
  return (
    <>
      <div className="page-head">
        <div>
          <h1>Data Bersama</h1>
          <div className="sub">Data terkini untuk seluruh divisi — diperbarui otomatis tiap {JEDA} detik, tanpa perlu Google Sheets.</div>
        </div>
      </div>

      <div className="fu-toolbar" style={{ flexWrap: 'wrap' }}>
        {tabs.map(t => (
          <button key={t.nama} className={'sort-btn' + (tab === t.nama ? ' active' : '')}
            onClick={() => setTab(t.nama)} title={t.tersedia ? '' : 'Tersedia setelah ' + t.keterangan}
            style={t.tersedia ? {} : { opacity: .55 }}>
            {t.nama}{t.tersedia ? '' : ' ⏳'}</button>))}
      </div>

      {d && d.tersedia === false && (
        <div className="note" style={{ marginBottom: 12 }}>
          ⏳ Data <b>{tab}</b> tersedia setelah <b>{d.keterangan}</b> selesai dibangun. Kolomnya sudah disiapkan sama dengan sheet lama.
        </div>)}

      <div className="fu-toolbar" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input value={cari} onChange={e => setCari(e.target.value)} placeholder={'Cari di ' + (tab || '') + '…'}
          style={{ maxWidth: 260 }} disabled={!d || !d.tersedia} />
        {adaSaring && <button className="sort-btn" onClick={() => { setCari(''); setSaring({}); }}>✕ Hapus saringan</button>}
        <span className="hint" style={{ margin: 0 }}>
          {d && d.tersedia ? <><b>{hasil.length.toLocaleString('id-ID')}</b>{adaSaring ? ' dari ' + d.rows.length.toLocaleString('id-ID') : ''} baris · </> : null}
          <span title="Pembaruan berikutnya">● diperbarui {detik} detik lalu</span>
        </span>
        <span style={{ flex: 1 }} />
        <button className="sort-btn" onClick={() => muat(true)}>↻ Muat ulang</button>
        <button className="sort-btn" onClick={unduhExcel} disabled={!d || !d.tersedia}>⬇ Excel</button>
      </div>
      {d && d.disamarkan && (
        <div className="hint" style={{ margin: '0 0 8px' }}>🔒 Data pribadi konsumen (KTP, NPWP, alamat, kontak) disamarkan sesuai peran Anda.</div>)}

      {!d ? <div className="loading">Memuat…</div> : (
        <div className="tbl-wrap" style={{ height: 'calc(100vh - 330px)', minHeight: 320, overflow: 'auto' }}>
          <table className="tbl-compact" style={{ minWidth: Math.max(640, d.kolom.length * 120) }}>
            <thead>
              <tr>{d.kolom.map((k, i) => (
                <th key={k} onClick={() => setUrut(u => ({ k, arah: u.k === k ? -u.arah : 1 }))}
                  style={{ cursor: 'pointer', userSelect: 'none', position: 'sticky', top: 0, zIndex: i === 0 ? 4 : 3, left: i === 0 ? 0 : undefined, height: 34 }}
                  title="Klik untuk mengurutkan">
                  {k}{urut.k === k ? (urut.arah > 0 ? ' ▲' : ' ▼') : ''}</th>))}</tr>
              {d.tersedia && (
                <tr>{d.kolom.map((k, i) => (
                  <th key={k} style={{ background: 'var(--em-800, #0A3B2E)', padding: '4px 5px', position: 'sticky', top: 34, zIndex: i === 0 ? 4 : 3,
                    left: i === 0 ? 0 : undefined }}>
                    {pilihan[k] ? (
                      <select value={saring[k] || ''} onChange={e => setSaring({ ...saring, [k]: e.target.value })}
                        style={{ width: '100%', minWidth: 90, fontSize: 11, padding: '3px 4px', minHeight: 0, background: saring[k] ? '#FFF3C9' : '#fff' }}>
                        <option value="">— semua —</option>
                        {pilihan[k].map(v => <option key={v} value={v}>{v}</option>)}
                      </select>
                    ) : (
                      <input value={saring[k] || ''} onChange={e => setSaring({ ...saring, [k]: e.target.value })}
                        placeholder="saring" style={{ width: '100%', minWidth: 70, fontSize: 11, padding: '3px 6px', minHeight: 0, background: saring[k] ? '#FFF3C9' : '#fff' }} />
                    )}
                  </th>))}</tr>)}
            </thead>
            <tbody>
              {d.tersedia && hasil.map(r => (
                <tr key={r._key} style={{ background: baru[r._key] ? '#FFF3C9' : undefined, transition: 'background 1.2s' }}>
                  {d.kolom.map((k, i) => (
                    <td key={k} className={angka(r[k]) ? 'num' : ''} style={{ whiteSpace: 'nowrap',
                      ...(i === 0 ? { position: 'sticky', left: 0, zIndex: 1, background: baru[r._key] ? '#FFF3C9' : '#fff', boxShadow: '1px 0 0 var(--line)' } : {}) }}>
                      {tampil(r[k])}</td>))}
                </tr>))}
              {d.tersedia && !hasil.length && (
                <tr><td colSpan={d.kolom.length} className="hint" style={{ padding: 16 }}>
                  {d.rows.length ? 'Tidak ada baris yang cocok dengan saringan.' : 'Belum ada data.'}</td></tr>)}
            </tbody>
          </table>
        </div>)}
      <Toast />
    </>
  );
}
