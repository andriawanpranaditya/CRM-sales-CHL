'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api } from '@/components/util';

const IMG = p => /BIO/i.test(p) ? '/siteplan-bio.jpg' : '/siteplan-permai.jpg';
const COLOR = { merah: '#B3402F', kuning: '#C9922E' };

export default function StockPage() {
  const [trx, setTrx] = useState(null);
  const [pos, setPos] = useState([]);
  const [set, setSet] = useState({ project: [] });
  const [proj, setProj] = useState('');
  const [placing, setPlacing] = useState(null); // unit yang sedang menunggu klik peta
  const imgWrap = useRef(null);

  const load = () => Promise.all([api('/api/trx'), api('/api/stock'), api('/api/settings')])
    .then(([t, p, s]) => {
      setTrx(t); setPos(p); setSet(s);
      setProj(prev => prev || (s.project && s.project[0]) || '');
    }).catch(e => toast(e.message));
  useEffect(() => { load(); }, []);

  // Status tiap unit = transaksi TERAKHIR unit tsb: Booking/Closing=merah, Reserved=kuning, Batal=hilang
  const unitStatus = useMemo(() => {
    const m = {};
    if (!trx) return m;
    [...trx].sort((a, b) => a.id - b.id).forEach(t => {
      if (!t.unit || !t.project) return;
      const key = t.project + '|' + t.unit;
      if (t.jenis === 'Batal') m[key] = null;
      else if (t.jenis === 'Reserved') m[key] = { warna: 'kuning', t };
      else m[key] = { warna: 'merah', t }; // Booking / Closing = terjual
    });
    return m;
  }, [trx]);

  if (!trx) return <div className="loading">Memuat…</div>;

  const posMap = {};
  pos.forEach(p => { posMap[p.project + '|' + p.unit] = p; });

  // Unit ber-status pada project aktif
  const active = Object.entries(unitStatus)
    .filter(([k, v]) => v && k.startsWith(proj + '|'))
    .map(([k, v]) => ({ unit: k.split('|')[1], ...v }));
  const unmapped = active.filter(u => !posMap[proj + '|' + u.unit]);
  const markers = active.filter(u => posMap[proj + '|' + u.unit])
    .map(u => ({ ...u, ...posMap[proj + '|' + u.unit] }));

  async function klikPeta(e) {
    if (!placing) return;
    const r = imgWrap.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    try {
      await api('/api/stock', { method: 'POST', body: JSON.stringify({ project: proj, unit: placing, x, y }) });
      toast(placing + ' ditandai di peta');
      setPlacing(null);
      setPos(await api('/api/stock'));
    } catch (err) { toast(err.message); }
  }

  const jml = w => active.filter(u => u.warna === w).length;

  return (
    <>
      <div className="page-head">
        <div><h1>Master Stock</h1>
          <div className="sub">Siteplan per project — tanda mengikuti transaksi otomatis: 🔴 Booking/Closing (terjual), 🟡 Reserved, Batal = tanda hilang</div></div>
        <div className="stamp">🔴 <b>{jml('merah')}</b> terjual &nbsp; 🟡 <b>{jml('kuning')}</b> reserved</div>
      </div>

      <div className="fu-toolbar">
        {(set.project || []).map(p => (
          <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')}
            onClick={() => { setProj(p); setPlacing(null); }}>{p}</button>))}
      </div>

      {placing && <div className="note" style={{ background: 'var(--blue-soft)', borderColor: '#BFD4E8', color: 'var(--blue)' }}>
        📍 Klik lokasi <b>{placing}</b> pada peta di bawah untuk menandainya. <button className="sort-btn" style={{ marginLeft: 8 }} onClick={() => setPlacing(null)}>Batal</button>
      </div>}

      <div ref={imgWrap} onClick={klikPeta}
        style={{ position: 'relative', borderRadius: 'var(--radius)', overflow: 'hidden', border: '1px solid var(--line)', cursor: placing ? 'crosshair' : 'default', lineHeight: 0 }}>
        <img src={IMG(proj)} alt={proj} style={{ width: '100%', height: 'auto', display: 'block' }} />
        {markers.map(m => (
          <div key={m.unit} title={m.unit + ' — ' + m.t.jenis + (m.t.nama ? ' (' + m.t.nama + ')' : '')}
            onClick={e => { if (!placing) { e.stopPropagation(); setPlacing(m.unit); toast('Klik lokasi baru untuk memindahkan ' + m.unit); } }}
            style={{
              position: 'absolute', left: m.x + '%', top: m.y + '%', transform: 'translate(-50%,-50%)',
              width: 18, height: 18, borderRadius: '50%', background: COLOR[m.warna],
              border: '2.5px solid #fff', boxShadow: '0 1px 6px rgba(0,0,0,.5)', cursor: 'pointer',
            }} />
        ))}
      </div>
      <div className="hint" style={{ marginTop: 8 }}>Klik lingkaran yang sudah ada untuk memindahkan posisinya. Tanda otomatis hilang bila transaksi terakhir unit = Batal.</div>

      <div className="card" style={{ marginTop: 14 }}>
        <h2>Unit Bertransaksi — Belum Ditandai di Peta ({unmapped.length})</h2>
        {unmapped.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {unmapped.map(u => (
              <button key={u.unit} className="sort-btn"
                style={{ borderColor: COLOR[u.warna], color: COLOR[u.warna], fontWeight: 700 }}
                onClick={() => { setPlacing(u.unit); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                {u.warna === 'merah' ? '🔴' : '🟡'} {u.unit} — Tandai
              </button>
            ))}
          </div>
        ) : <div className="hint">Semua unit bertransaksi sudah ditandai. Transaksi baru dengan Blok/Unit akan muncul di sini untuk ditandai sekali saja.</div>}
      </div>
      <Toast />
    </>
  );
}
