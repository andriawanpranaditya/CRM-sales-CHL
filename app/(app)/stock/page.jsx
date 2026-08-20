'use client';
import { useEffect, useRef, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api } from '@/components/util';

const IMG = p => /BIO/i.test(p) ? '/siteplan-bio.jpg' : '/siteplan-permai.jpg';
const COLOR = { merah: '#B3402F', kuning: '#C9922E' };

export default function StockPage() {
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState(null);
  const [pos, setPos] = useState([]);
  const [manual, setManual] = useState([]);
  const [set, setSet] = useState({ project: [], units: {} });
  const [proj, setProj] = useState('');
  const [placing, setPlacing] = useState(null);
  const [selUnit, setSelUnit] = useState('');
  const [zoom, setZoom] = useState(1);
  const inner = useRef(null);

  const loadStock = async () => {
    const st = await api('/api/stock');
    setStatus(st.status || []); setPos(st.positions || []); setManual(st.manual || []);
  };
  useEffect(() => {
    Promise.all([api('/api/auth/me'), api('/api/stock'), api('/api/settings')])
      .then(([u, st, s]) => {
        setMe(u); setStatus(st.status || []); setPos(st.positions || []); setManual(st.manual || []); setSet(s);
        setProj(prev => prev || (s.project && s.project[0]) || '');
      }).catch(e => toast(e.message));
  }, []);

  if (!status || !me) return <div className="loading">Memuat…</div>;
  const isMgr = me.role === 'manager';

  const posMap = {}; pos.forEach(p => { posMap[p.project + '|' + p.unit] = p; });
  const manMap = {}; manual.forEach(x => { manMap[x.project + '|' + x.unit] = x.status; });
  const stMap = {}; status.forEach(u => { stMap[u.project + '|' + u.unit] = u; });

  const active = status.filter(u => u.project === proj);
  const unmapped = active.filter(u => !posMap[proj + '|' + u.unit]);
  const markers = active.filter(u => posMap[proj + '|' + u.unit]).map(u => ({ ...u, ...posMap[proj + '|' + u.unit] }));

  async function klikPeta(e) {
    if (!isMgr || !placing) return;
    const r = inner.current.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * 100;
    const y = ((e.clientY - r.top) / r.height) * 100;
    try {
      await api('/api/stock', { method: 'POST', body: JSON.stringify({ project: proj, unit: placing, x, y }) });
      toast(placing + ' ditandai di peta');
      setPlacing(null); await loadStock();
    } catch (err) { toast(err.message); }
  }

  async function setStatusManual(unit, st) {
    if (!unit) return toast('Pilih unit dulu');
    try {
      await api('/api/stock', { method: 'PUT', body: JSON.stringify({ project: proj, unit, status: st }) });
      await loadStock();
      toast(st === null ? unit + ' kembali mengikuti transaksi' : unit + ' → ' + st);
      if (st && st !== 'Kosong' && !posMap[proj + '|' + unit]) {
        setPlacing(unit); window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) { toast(err.message); }
  }

  const jml = w => active.filter(u => u.warna === w).length;
  const unitList = (set.units && set.units[proj]) || [];
  const zoomTo = z => setZoom(Math.min(4, Math.max(1, Math.round(z * 4) / 4)));

  return (
    <>
      <div className="page-head">
        <div><h1>Master Stock</h1>
          <div className="sub">🔴 Terjual (Booking/Closing) · 🟡 Reserved · Batal/Kosong = tanpa tanda.{isMgr ? ' Manager bisa buka/tutup stok langsung dari sini.' : ' Tampilan lihat-saja — hubungi manager untuk update stok.'}</div></div>
        <div className="stamp">🔴 <b>{jml('merah')}</b> terjual &nbsp; 🟡 <b>{jml('kuning')}</b> reserved</div>
      </div>

      <div className="fu-toolbar">
        {(set.project || []).map(p => (
          <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')}
            onClick={() => { setProj(p); setPlacing(null); setSelUnit(''); }}>{p}</button>))}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', gap: 6, alignItems: 'center' }}>
          <button className="sort-btn" onClick={() => zoomTo(zoom - 0.5)}>🔍−</button>
          <b style={{ minWidth: 46, textAlign: 'center' }}>{Math.round(zoom * 100)}%</b>
          <button className="sort-btn" onClick={() => zoomTo(zoom + 0.5)}>🔍+</button>
          {zoom > 1 && <button className="sort-btn" onClick={() => setZoom(1)}>Reset</button>}
        </span>
      </div>

      {isMgr && <div className="card" style={{ marginBottom: 12 }}>
        <h2>Update Stok Manual (tanpa lewat Form Input)</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select className="sort-filter" style={{ marginLeft: 0, minWidth: 190 }} value={selUnit} onChange={e => setSelUnit(e.target.value)}>
            <option value="">— pilih Blok/Unit —</option>
            {unitList.map(u => {
              const st = stMap[proj + '|' + u];
              return <option key={u} value={u}>{u}{st ? (st.warna === 'merah' ? ' 🔴' : ' 🟡') : ''}</option>;
            })}
          </select>
          <button className="sort-btn" style={{ borderColor: COLOR.merah, color: COLOR.merah, fontWeight: 700 }}
            onClick={() => setStatusManual(selUnit, 'Terjual')}>🔴 Tutup — Terjual</button>
          <button className="sort-btn" style={{ borderColor: COLOR.kuning, color: COLOR.kuning, fontWeight: 700 }}
            onClick={() => setStatusManual(selUnit, 'Reserved')}>🟡 Reserved</button>
          <button className="sort-btn" onClick={() => setStatusManual(selUnit, 'Kosong')}>⚪ Buka Stok (hapus tanda)</button>
          {manMap[proj + '|' + selUnit] && (
            <button className="sort-btn" onClick={() => setStatusManual(selUnit, null)}>↩ Kembali Ikut Transaksi</button>
          )}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          Tanda manual menimpa status dari transaksi (titik putih kecil di tengah lingkaran).
          {selUnit && manMap[proj + '|' + selUnit] ? <b> {selUnit}: manual ({manMap[proj + '|' + selUnit]}).</b> : ''}
        </div>
      </div>}

      {isMgr && placing && <div className="note" style={{ background: 'var(--blue-soft)', borderColor: '#BFD4E8', color: 'var(--blue)' }}>
        📍 Klik lokasi <b>{placing}</b> pada peta. Zoom dulu supaya akurat. <button className="sort-btn" style={{ marginLeft: 8 }} onClick={() => setPlacing(null)}>Batal</button>
      </div>}

      {/* Peta: bisa di-zoom (geser dengan scroll saat diperbesar) */}
      <div style={{ overflow: 'auto', borderRadius: 'var(--radius)', border: '1px solid var(--line)', maxHeight: '78vh', WebkitOverflowScrolling: 'touch' }}>
        <div ref={inner} onClick={klikPeta}
          style={{ position: 'relative', width: (zoom * 100) + '%', lineHeight: 0, cursor: (isMgr && placing) ? 'crosshair' : 'default' }}>
          <img src={IMG(proj)} alt={proj} style={{ width: '100%', height: 'auto', display: 'block' }} />
          {markers.map(m => (
            <div key={m.unit} title={m.unit + ' — ' + m.info}
              onClick={e => { if (isMgr && !placing) { e.stopPropagation(); setSelUnit(m.unit); toast(m.unit + ' dipilih — atur lewat panel di atas'); } }}
              style={{
                position: 'absolute', left: m.x + '%', top: m.y + '%', transform: 'translate(-50%,-50%)',
                width: 18, height: 18, borderRadius: '50%', background: COLOR[m.warna],
                border: (isMgr && selUnit === m.unit ? '3px solid #2D5D8E' : '2.5px solid #fff'),
                boxShadow: '0 1px 6px rgba(0,0,0,.5)', cursor: isMgr ? 'pointer' : 'help',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              {m.manual ? <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} /> : null}
            </div>
          ))}
        </div>
      </div>
      <div className="hint" style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        Gunakan 🔍 untuk memperbesar — saat diperbesar, geser peta dengan scroll/usap.
        {isMgr && <>Klik lingkaran = pilih unit di panel.</>}
        {isMgr && selUnit && posMap[proj + '|' + selUnit] && (
          <button className="sort-btn" onClick={() => setPlacing(selUnit)}>📍 Pindah Posisi {selUnit}</button>
        )}
      </div>

      {isMgr && <div className="card" style={{ marginTop: 14 }}>
        <h2>Unit Bertanda — Belum Ditandai di Peta ({unmapped.length})</h2>
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
        ) : <div className="hint">Semua unit bertanda sudah punya posisi di peta.</div>}
      </div>}
      <Toast />
    </>
  );
}
