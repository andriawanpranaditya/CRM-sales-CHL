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

  // ===== Unduh Master Stock sebagai PDF (peta bertanda + rekap unit) =====
  const [pdfBusy, setPdfBusy] = useState(false);
  async function downloadPDF() {
    setPdfBusy(true);
    try {
      const { jsPDF } = await import('jspdf');
      // 1) Gambar siteplan + marker ke kanvas
      const img = new Image();
      img.src = IMG(proj);
      await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Siteplan tidak bisa dimuat')); });
      const W = Math.min(img.naturalWidth || 1600, 2400);
      const H = Math.round((img.naturalHeight || 1000) * (W / (img.naturalWidth || 1600)));
      const cv = document.createElement('canvas');
      cv.width = W; cv.height = H;
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, W, H);
      const R = Math.max(9, Math.round(W * 0.007));
      ctx.font = 'bold ' + Math.round(R * 1.25) + 'px Arial';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      markers.forEach(m => {
        const cx = (m.x / 100) * W, cy = (m.y / 100) * H;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = COLOR[m.warna]; ctx.fill();
        ctx.lineWidth = Math.max(2, R * 0.28); ctx.strokeStyle = '#fff'; ctx.stroke();
        if (m.manual) { ctx.beginPath(); ctx.arc(cx, cy, R * 0.28, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
        // label unit di bawah marker
        const t = String(m.unit);
        ctx.lineWidth = Math.max(3, R * 0.5); ctx.strokeStyle = 'rgba(255,255,255,.9)';
        ctx.strokeText(t, cx, cy + R * 2.1); ctx.fillStyle = '#1C2B23'; ctx.fillText(t, cx, cy + R * 2.1);
      });
      const dataURL = cv.toDataURL('image/jpeg', 0.9);

      // 2) Susun PDF
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const PW = 297, PH = 210, M = 10;
      const tglStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
      const total = unitList.length;
      const terjual = active.filter(u => u.warna === 'merah').length;
      const reserved = active.filter(u => u.warna === 'kuning').length;
      const tersedia = Math.max(0, total - terjual - reserved);
      const kop = (sub) => {
        doc.setFillColor(28, 43, 35); doc.rect(0, 0, PW, 17, 'F');
        doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(13);
        doc.text('MASTER STOCK — ' + (proj || '-'), M, 11);
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
        doc.text(sub + ' · ' + tglStr, PW - M, 11, { align: 'right' });
        doc.setTextColor(28, 43, 35);
      };
      const footer = () => {
        doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(120, 128, 120);
        doc.text('PT Cipta Harmoni Lestari · CRM Sales · copyright © 2026 by Andriawanp', PW / 2, PH - 5, { align: 'center' });
        doc.setTextColor(28, 43, 35);
      };

      // Halaman 1: peta
      kop('Peta Siteplan');
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      let x = M;
      const chip = (label, val, warna) => {
        doc.setFillColor(warna[0], warna[1], warna[2]); doc.circle(x + 1.6, 22.4, 1.6, 'F');
        doc.text(label + ': ' + val, x + 4.6, 23.2); x += doc.getTextWidth(label + ': ' + val) + 13;
      };
      chip('Terjual', terjual, [179, 64, 47]);
      chip('Reserved', reserved, [201, 146, 46]);
      chip('Tersedia', tersedia, [235, 233, 226]);
      chip('Total Unit', total, [35, 105, 74]);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110, 118, 110);
      doc.text('Titik putih di tengah lingkaran = status ditandai manual oleh manager.', M, 28.5);
      doc.setTextColor(28, 43, 35);
      const areaY = 31, areaH = PH - areaY - 10, areaW = PW - M * 2;
      const sc = Math.min(areaW / W, areaH / H);
      const iw = W * sc, ih = H * sc;
      doc.addImage(dataURL, 'JPEG', (PW - iw) / 2, areaY, iw, ih);
      footer();

      // Halaman 2+: rekap unit bertanda
      const bertanda = [...active].sort((a, b) => (a.warna === b.warna ? String(a.unit).localeCompare(String(b.unit), 'id', { numeric: true }) : a.warna === 'merah' ? -1 : 1));
      doc.addPage(); kop('Rekap Unit');
      let y = 26;
      const headRow = () => {
        doc.setFillColor(35, 105, 74); doc.rect(M, y, PW - M * 2, 8, 'F');
        doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('Blok / Unit', M + 3, y + 5.5);
        doc.text('Status', M + 62, y + 5.5);
        doc.text('Keterangan', M + 110, y + 5.5);
        doc.text('ID Lead', PW - M - 32, y + 5.5);
        doc.setTextColor(28, 43, 35); y += 8;
      };
      headRow();
      doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5);
      if (!bertanda.length) { doc.text('Belum ada unit bertanda pada project ini.', M + 3, y + 6); y += 10; }
      bertanda.forEach((u, i) => {
        if (y > PH - 18) { footer(); doc.addPage(); kop('Rekap Unit (lanjutan)'); y = 26; headRow(); doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); }
        if (i % 2 === 1) { doc.setFillColor(245, 244, 239); doc.rect(M, y, PW - M * 2, 7, 'F'); }
        const c = u.warna === 'merah' ? [179, 64, 47] : [201, 146, 46];
        doc.setFillColor(c[0], c[1], c[2]); doc.circle(M + 3.5, y + 3.6, 1.5, 'F');
        doc.text(String(u.unit), M + 7, y + 4.8);
        doc.setFont('helvetica', 'bold'); doc.setTextColor(c[0], c[1], c[2]);
        doc.text(u.warna === 'merah' ? 'TERJUAL' : 'RESERVED', M + 62, y + 4.8);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(28, 43, 35);
        doc.text(doc.splitTextToSize(String(u.info || '-'), 95)[0], M + 110, y + 4.8);
        doc.text(String(u.lead_code || '-'), PW - M - 32, y + 4.8);
        y += 7;
      });
      // Unit tersedia (ringkas, banyak kolom)
      const sisa = unitList.filter(u => !stMap[proj + '|' + u]);
      if (sisa.length) {
        if (y > PH - 40) { footer(); doc.addPage(); kop('Unit Tersedia'); y = 26; }
        y += 6;
        doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5);
        doc.text('Unit Tersedia (' + sisa.length + ')', M, y); y += 5;
        doc.setFont('helvetica', 'normal'); doc.setFontSize(8);
        const kol = 6, lebar = (PW - M * 2) / kol;
        sisa.forEach((u, i) => {
          if (i % kol === 0 && y > PH - 14) { footer(); doc.addPage(); kop('Unit Tersedia (lanjutan)'); y = 26; doc.setFont('helvetica', 'normal'); doc.setFontSize(8); }
          doc.text(String(u), M + (i % kol) * lebar, y);
          if (i % kol === kol - 1) y += 5;
        });
        if (sisa.length % kol !== 0) y += 5;
      }
      footer();
      doc.save('Master_Stock_' + String(proj || 'project').replace(/[^A-Za-z0-9]+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.pdf');
      toast('PDF Master Stock terunduh 📄');
    } catch (e) { toast(e.message || 'Gagal membuat PDF'); } finally { setPdfBusy(false); }
  }

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
          <button className="sort-btn" style={{ borderColor: 'var(--green)', color: 'var(--green)', fontWeight: 700 }}
            onClick={downloadPDF} disabled={pdfBusy}>{pdfBusy ? '⏳ Menyiapkan…' : '📄 Download PDF'}</button>
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
