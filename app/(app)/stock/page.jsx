'use client';
import { useEffect, useRef, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, catatUnduh } from '@/components/util';
import { bolehDigital } from '@/lib/digital-akses';
import { kunciUnit, LABEL_JENIS, POSISI_BAWAAN, KAVLING_DI_GAMBAR } from '@/lib/jenis-unit';

const IMG = p => /BIO/i.test(p) ? '/siteplan-bio.jpg' : '/siteplan-permai.jpg';
const COLOR = { merah: '#B3402F', kuning: '#C9922E', biru: '#1D5FBF', kavling: '#FFFFFF', show: '#7B2FBE' };
const HURUF = { kavling: 'K', show: 'SU' };
// Show Unit = lencana ungu "SU"; Kavling = warna dasar kavling putih di gambar siteplan (kavling yang ditandai belakangan
// dan belum diputihkan di gambar memakai kotak putih "K"); Terjual / Reserved tetap lingkaran merah / kuning
const warnaTanda = m => COLOR[m.warna] || COLOR[m.jenis];
// Hold manajemen = lingkaran biru (Show Unit yang di-hold: lingkaran biru bertulisan SU)
const bentuk = m => (m.warna && m.warna !== 'biru') ? 'bulat' : m.jenis === 'show' ? 'su' : m.warna === 'biru' ? 'bulat' : m.jenis === 'kavling' ? 'kotak' : 'bulat';

export default function StockPage() {
  const [me, setMe] = useState(null);
  const [status, setStatus] = useState(null);
  const [pos, setPos] = useState([]);
  const [manual, setManual] = useState([]);
  const [jenis, setJenis] = useState({});
  const [hold, setHold] = useState({});
  const [set, setSet] = useState({ project: [], units: {} });
  const [proj, setProj] = useState('');
  const [placing, setPlacing] = useState(null);
  const [selUnit, setSelUnit] = useState('');
  const [zoom, setZoom] = useState(1);
  const [pdfBusy, setPdfBusy] = useState(false);
  const [namaBeli, setNamaBeli] = useState('');
  const [salesBeli, setSalesBeli] = useState('');
  const [imp, setImp] = useState(false);
  const inner = useRef(null);

  const loadStock = async () => {
    const st = await api('/api/stock');
    setStatus(st.status || []); setPos(st.positions || []); setManual(st.manual || []); setJenis(st.jenis || {}); setHold(st.hold || {});
  };
  useEffect(() => {
    Promise.all([api('/api/auth/me'), api('/api/stock'), api('/api/settings')])
      .then(([u, st, s]) => {
        setMe(u); setStatus(st.status || []); setPos(st.positions || []); setManual(st.manual || []); setJenis(st.jenis || {}); setHold(st.hold || {}); setSet(s);
        setProj(prev => prev || (s.project && s.project[0]) || '');
      }).catch(e => toast(e.message));
  }, []);

  if (!status || !me) return <div className="loading">Memuat…</div>;
  const isMgr = me.role === 'manager' || me.role === 'ceo'; // ceo: kelola stok, tanpa hapus titik

  const posMap = {}; pos.forEach(p => { posMap[p.project + '|' + p.unit] = p; });
  // Titik bawaan unit Kavling / Show Unit — berlaku sampai titiknya ditempel / dipindah manual
  Object.entries(POSISI_BAWAAN).forEach(([p, daftar]) => ((set.units && set.units[p]) || []).forEach(u => {
    const hit = Object.entries(daftar).find(([n]) => kunciUnit(n) === kunciUnit(u));
    if (hit && !posMap[p + '|' + u]) posMap[p + '|' + u] = { project: p, unit: u, x: hit[1][0], y: hit[1][1] };
  }));
  const manMap = {}; manual.forEach(x => { manMap[x.project + '|' + x.unit] = x.status; });
  const unitList = (set.units && set.units[proj]) || [];
  const stMap = {}; status.forEach(u => { stMap[u.project + '|' + u.unit] = u; });

  // Hanya unit yang ada di daftar master project ini yang ditampilkan —
  // menghindari tanda "hantu" dari penamaan unit lama yang sudah tidak berlaku
  const asing = status.filter(u => u.project === proj && unitList.length && !unitList.includes(u.unit));
  const active = status.filter(u => u.project === proj && (!unitList.length || unitList.includes(u.unit)));
  // Jenis khusus unit (Show Unit / Kavling): unit yang belum terjual pun tetap diberi tanda di peta
  const jenisUnit = u => (jenis[proj] || {})[kunciUnit(u)] || '';
  const khusus = unitList.filter(u => jenisUnit(u));
  // Hold manajemen datang dari server sebagai status 'biru' (mengurangi stok, tidak bisa dipilih di transaksi)
  const holdUnit = u => (stMap[proj + '|' + u] || {}).warna === 'biru';
  const ditahan = unitList.filter(holdUnit);
  const bolehBukaHold = bolehDigital(me); // hanya Head of Sales & Marketing
  const diGambar = u => jenisUnit(u) === 'kavling' && (KAVLING_DI_GAMBAR[proj] || []).some(n => kunciUnit(n) === kunciUnit(u));
  const bertanda = [...active.map(u => ({ ...u, jenis: jenisUnit(u.unit), info: u.info + (u.warna === 'biru' && jenisUnit(u.unit) ? ' · ' + LABEL_JENIS[jenisUnit(u.unit)] : '') })),
    ...khusus.filter(u => !stMap[proj + '|' + u] && !diGambar(u)).map(u => ({ project: proj, unit: u, jenis: jenisUnit(u), info: LABEL_JENIS[jenisUnit(u)] + ' — tersedia' }))];
  const unmapped = bertanda.filter(u => !posMap[proj + '|' + u.unit]);
  const markers = bertanda.filter(u => posMap[proj + '|' + u.unit]).map(u => ({ ...u, ...posMap[proj + '|' + u.unit] }));
  const jmlJenis = j => khusus.filter(u => jenisUnit(u) === j).length;
  // Titik yang saling menumpuk (jarak < 1,2% lebar peta) — biasanya marker salah tempel di plot yang sama
  const tumpuk = [];
  for (let i = 0; i < markers.length; i++) {
    for (let j = i + 1; j < markers.length; j++) {
      const dx = Number(markers[i].x) - Number(markers[j].x), dy = Number(markers[i].y) - Number(markers[j].y);
      if (Math.sqrt(dx * dx + dy * dy) < 1.2) tumpuk.push([markers[i].unit, markers[j].unit]);
    }
  }

  // ===== Unduh Master Stock sebagai PDF (peta bertanda + rekap unit) =====
  async function downloadPDF() {
    catatUnduh('Master Stock', 'PDF Master Stock');
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
      // Radius marker menyesuaikan kerapatan titik supaya tidak saling menumpuk / menutupi kolom unit
      let R = Math.max(7, Math.round(W * 0.006));
      if (markers.length > 1) {
        let minJarak = Infinity;
        for (let i = 0; i < markers.length; i++) {
          for (let j = i + 1; j < markers.length; j++) {
            const dx = (markers[i].x - markers[j].x) / 100 * W;
            const dy = (markers[i].y - markers[j].y) / 100 * H;
            const d2 = Math.sqrt(dx * dx + dy * dy);
            if (d2 > 0 && d2 < minJarak) minJarak = d2;
          }
        }
        if (isFinite(minJarak)) R = Math.max(4, Math.min(R, Math.round(minJarak * 0.42)));
      }
      markers.forEach(m => {
        const cx = (m.x / 100) * W, cy = (m.y / 100) * H;
        const bk = bentuk(m), r = bk === 'su' ? R * 1.3 : R;
        ctx.beginPath();
        if (bk === 'kotak') ctx.rect(cx - r, cy - r, r * 2, r * 2); else ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fillStyle = warnaTanda(m); ctx.fill();
        ctx.lineWidth = Math.max(2, R * 0.28); ctx.strokeStyle = bk === 'kotak' ? '#1C2B23' : '#fff'; ctx.stroke();
        if (bk !== 'bulat') { ctx.fillStyle = bk === 'kotak' ? '#1C2B23' : '#fff'; ctx.font = 'bold ' + Math.round(r * (bk === 'su' ? 0.95 : 1.25)) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(HURUF[m.jenis], cx, cy + r * 0.06); }
        if (m.manual) { ctx.beginPath(); ctx.arc(cx, cy, R * 0.28, 0, Math.PI * 2); ctx.fillStyle = '#fff'; ctx.fill(); }
      });
      const dataURL = cv.toDataURL('image/jpeg', 0.9);

      // 2) Susun PDF
      const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
      const PW = 297, PH = 210, M = 10;
      const tglStr = new Date().toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' });
      const total = unitList.length;
      const terjual = active.filter(u => u.warna === 'merah').length;
      const reserved = active.filter(u => u.warna === 'kuning').length;
      const tersedia = Math.max(0, total - terjual - reserved - ditahan.length);
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
      kop(isMgr ? 'Peta Siteplan' : 'Peta Siteplan — ' + ((me && me.name) || 'Sales'));
      doc.setFontSize(9); doc.setFont('helvetica', 'bold');
      let x = M;
      const chip = (label, val, warna) => {
        doc.setFillColor(warna[0], warna[1], warna[2]); doc.circle(x + 1.6, 22.4, 1.6, 'F');
        doc.text(label + ': ' + val, x + 4.6, 23.2); x += doc.getTextWidth(label + ': ' + val) + 13;
      };
      chip('Terjual', terjual, [179, 64, 47]);
      chip('Reserved', reserved, [201, 146, 46]);
      if (ditahan.length) chip('Hold Manajemen', ditahan.length, [29, 95, 191]);
      chip('Tersedia', tersedia, [235, 233, 226]);
      chip('Total Unit', total, [35, 105, 74]);
      if (jmlJenis('kavling')) chip('Kavling (warna dasar putih)', jmlJenis('kavling'), [252, 252, 250]);
      if (jmlJenis('show')) chip('Show Unit (SU)', jmlJenis('show'), [123, 47, 190]);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(7.5); doc.setTextColor(110, 118, 110);
      doc.text('Titik putih di tengah lingkaran = status ditandai manual oleh manager.', M, 28.5);
      doc.setTextColor(28, 43, 35);
      const areaY = 31, areaH = PH - areaY - 10, areaW = PW - M * 2;
      const sc = Math.min(areaW / W, areaH / H);
      const iw = W * sc, ih = H * sc;
      doc.addImage(dataURL, 'JPEG', (PW - iw) / 2, areaY, iw, ih);
      footer();

      // Peran selain manager: hanya peta siteplan, tanpa daftar unit & nama pembeli
      if (!isMgr) {
        doc.save('Master_Stock_Peta_' + String(proj || 'project').replace(/[^A-Za-z0-9]+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.pdf');
        toast('PDF peta Master Stock terunduh 📄');
        return;
      }

      // Halaman 2+: rekap unit bertanda
      const bertanda = [...active.filter(u => u.warna !== 'biru')].sort((a, b) => (a.warna === b.warna ? String(a.unit).localeCompare(String(b.unit), 'id', { numeric: true }) : a.warna === 'merah' ? -1 : 1));
      doc.addPage(); kop('Rekap Unit');
      let y = 26;
      const headRow = () => {
        doc.setFillColor(35, 105, 74); doc.rect(M, y, PW - M * 2, 8, 'F');
        doc.setTextColor(255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9);
        doc.text('Blok / Unit', M + 3, y + 5.5);
        doc.text('Status', M + 52, y + 5.5);
        doc.text('Nama Pembeli', M + 88, y + 5.5);
        doc.text('Sales / Agent', M + 160, y + 5.5);
        doc.text('ID Lead', PW - M - 26, y + 5.5);
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
        doc.text(u.warna === 'merah' ? 'TERJUAL' : 'RESERVED', M + 52, y + 4.8);
        doc.setFont('helvetica', 'normal'); doc.setTextColor(28, 43, 35);
        doc.text(doc.splitTextToSize(String(u.nama || u.info || '-'), 68)[0], M + 88, y + 4.8);
        doc.text(doc.splitTextToSize(String(u.sales || '-'), 62)[0], M + 160, y + 4.8);
        doc.text(String(u.lead_code || '-'), PW - M - 26, y + 4.8);
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
      await api('/api/stock', { method: 'PUT', body: JSON.stringify({ project: proj, unit, status: st, nama: st === 'Kosong' ? '' : namaBeli, sales: st === 'Kosong' ? '' : salesBeli }) });
      await loadStock();
      toast(st === null ? unit + ' kembali mengikuti transaksi' : unit + ' → ' + st + (namaBeli && st !== 'Kosong' ? ' (' + namaBeli + ')' : ''));
      if (st === null || st === 'Kosong') { setNamaBeli(''); setSalesBeli(''); }
      if (st && st !== 'Kosong' && !posMap[proj + '|' + unit]) {
        setPlacing(unit); window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    } catch (err) { toast(err.message); }
  }

  async function setHoldUnit(unit, ya) {
    if (!unit) return toast('Pilih unit dulu');
    try {
      await api('/api/stock', { method: 'PUT', body: JSON.stringify({ project: proj, unit, hold: ya }) });
      await loadStock();
      toast(unit + (ya ? ' → Hold manajemen' : ' → hold dilepas'));
      if (ya && !posMap[proj + '|' + unit]) { setPlacing(unit); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    } catch (err) { toast(err.message); }
  }

  async function setJenisUnit(unit, j) {
    if (!unit) return toast('Pilih unit dulu');
    try {
      await api('/api/stock', { method: 'PUT', body: JSON.stringify({ project: proj, unit, jenis: j }) });
      await loadStock();
      toast(unit + (j ? ' → ' + LABEL_JENIS[j] : ' → unit biasa'));
      if (j && !posMap[proj + '|' + unit]) { setPlacing(unit); window.scrollTo({ top: 0, behavior: 'smooth' }); }
    } catch (err) { toast(err.message); }
  }

  const jml = w => active.filter(u => u.warna === w).length;
  const zoomTo = z => setZoom(Math.min(4, Math.max(1, Math.round(z * 4) / 4)));

  return (
    <>
      <div className="page-head">
        <div><h1>Master Stock</h1>
          <div className="sub">🔴 Terjual (Booking/Closing) · 🟡 Reserved · 🔵 Hold manajemen · Batal/Kosong = tanpa tanda · <b>□ putih</b> Kavling · <b style={{ color: COLOR.show }}>SU</b> Show Unit.{isMgr ? ' Manager bisa buka/tutup stok langsung dari sini.' : ' Tampilan lihat-saja — hubungi manager untuk update stok.'}</div></div>
        <div className="stamp">🔴 <b>{jml('merah')}</b> terjual &nbsp; 🟡 <b>{jml('kuning')}</b> reserved{ditahan.length ? <> &nbsp; 🔵 <b>{ditahan.length}</b> hold</> : null}{jmlJenis('kavling') ? <> &nbsp; □ <b>{jmlJenis('kavling')}</b> kavling</> : null}{jmlJenis('show') ? <> &nbsp; <b style={{ color: COLOR.show }}>SU</b> <b>{jmlJenis('show')}</b> show unit</> : null}</div>
      </div>

      {tumpuk.length > 0 && (
        <div className="note" style={{ marginBottom: 10 }}>
          ⚠ <b>{tumpuk.length} titik menumpuk di peta</b> — dua unit tertempel di posisi hampir sama, sehingga di PDF terlihat seperti tanda ganda:
          <div style={{ marginTop: 6, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {tumpuk.slice(0, 6).map((pair, i) => (
              <span key={i} style={{ background: 'var(--card)', border: '1px solid var(--brass-line)', borderRadius: 8, padding: '3px 8px', fontSize: 12.5 }}>
                <b>{pair[0]}</b> ↔ <b>{pair[1]}</b>
                {isMgr && <> <button className="sort-btn" style={{ padding: '1px 7px', marginLeft: 6 }}
                  onClick={() => { setPlacing(pair[1]); window.scrollTo({ top: 0, behavior: 'smooth' }); toast('Klik posisi yang benar untuk ' + pair[1]); }}>Pindahkan</button></>}
              </span>))}
          </div>
        </div>
      )}
      {asing.length > 0 && (
        <div className="note" style={{ background: 'var(--red-soft)', borderColor: 'var(--red)', color: 'var(--red)', marginBottom: 10 }}>
          ⚠ <b>{asing.length} unit bertanda tidak ada di daftar unit {proj}</b> — kemungkinan penamaan lama: {asing.slice(0, 6).map(u => u.unit).join(', ')}{asing.length > 6 ? ', …' : ''}.
          Tanda ini tidak ditampilkan di peta &amp; PDF. Manager dapat merapikannya lewat panel Update Stok Manual atau menu Booking.
        </div>
      )}
      <div className="fu-toolbar">
        {(set.project || []).map(p => (
          <button key={p} className={'sort-btn chip-proyek' + (proj === p ? ' active' : '')}
            onClick={() => { setProj(p); setPlacing(null); setSelUnit(''); }}>{p}</button>))}
        <span style={{ marginLeft: 'auto', display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', maxWidth: '100%' }}>
          <button className="sort-btn" onClick={() => zoomTo(zoom - 0.5)}>🔍−</button>
          <b style={{ minWidth: 46, textAlign: 'center' }}>{Math.round(zoom * 100)}%</b>
          <button className="sort-btn" onClick={() => zoomTo(zoom + 0.5)}>🔍+</button>
          {zoom > 1 && <button className="sort-btn" onClick={() => setZoom(1)}>Reset</button>}
          <button className="sort-btn" style={{ borderColor: 'var(--green)', color: 'var(--green)', fontWeight: 700 }}
            onClick={downloadPDF} disabled={pdfBusy}
            title={isMgr ? 'Peta siteplan + rekap unit & pembeli' : 'Peta siteplan (tanpa daftar unit & nama pembeli)'}>
            {pdfBusy ? '⏳ Menyiapkan…' : (isMgr ? '📄 Download PDF' : '📄 Download PDF Peta')}</button>
          <a className="sort-btn" href={'/price-list?project=' + encodeURIComponent(proj)} title="PDF price list + siteplan ketersediaan untuk dikirim ke konsumen (tanpa nama pembeli)">📤 PDF untuk konsumen</a>
        </span>
      </div>

      {isMgr && <div className="card" style={{ marginBottom: 12 }}>
        <h2>Update Stok Manual (tanpa lewat Form Input)</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select className="sort-filter" style={{ marginLeft: 0, minWidth: 190 }} value={selUnit}
            onChange={e => { setSelUnit(e.target.value); const st0 = stMap[proj + '|' + e.target.value]; setNamaBeli((st0 && st0.nama) || ''); setSalesBeli((st0 && st0.sales) || ''); }}>
            <option value="">— pilih Blok/Unit —</option>
            {unitList.map(u => {
              const st = stMap[proj + '|' + u];
              return <option key={u} value={u}>{u}{st ? (st.warna === 'merah' ? ' 🔴' : st.warna === 'kuning' ? ' 🟡' : ' 🔵 Hold') : ''}{jenisUnit(u) ? ' · ' + LABEL_JENIS[jenisUnit(u)] : ''}</option>;
            })}
          </select>
          <input value={namaBeli} onChange={e => setNamaBeli(e.target.value)} placeholder="Nama pembeli (opsional)"
            style={{ minWidth: 170, padding: '7px 12px', borderRadius: 20, border: '1px solid var(--line)', fontSize: 13 }} />
          <input value={salesBeli} onChange={e => setSalesBeli(e.target.value)} placeholder="Sales / Agent (otomatis bila ada transaksi)"
            style={{ minWidth: 170, padding: '7px 12px', borderRadius: 20, border: '1px solid var(--line)', fontSize: 13 }} />
          <button className="sort-btn" style={{ borderColor: COLOR.merah, color: COLOR.merah, fontWeight: 700 }}
            onClick={() => setStatusManual(selUnit, 'Terjual')}>🔴 Tutup — Terjual</button>
          <button className="sort-btn" style={{ borderColor: COLOR.kuning, color: COLOR.kuning, fontWeight: 700 }}
            onClick={() => setStatusManual(selUnit, 'Reserved')}>🟡 Reserved</button>
          <button className="sort-btn" onClick={() => setStatusManual(selUnit, 'Kosong')}>⚪ Buka Stok (kunci sebagai tersedia)</button>
          {manMap[proj + '|' + selUnit] && (
            <button className="sort-btn" onClick={() => setStatusManual(selUnit, null)}>↩ Kembali Ikut Transaksi</button>
          )}
          {selUnit && holdUnit(selUnit)
            ? (bolehBukaHold ? <button className="sort-btn" style={{ borderColor: COLOR.biru, color: COLOR.biru, fontWeight: 700 }} onClick={() => setHoldUnit(selUnit, false)}>🔓 Buka Hold {selUnit}</button>
              : <span className="hint">🔵 {selUnit} di-hold manajemen — hanya Head of Sales &amp; Marketing yang bisa membuka.</span>)
            : <button className="sort-btn" style={{ borderColor: COLOR.biru, color: COLOR.biru, fontWeight: 700 }} disabled={!!(selUnit && stMap[proj + '|' + selUnit])}
                title="Unit ditahan manajemen — belum dilepas untuk dijual" onClick={() => setHoldUnit(selUnit, true)}>🔵 Hold Manajemen</button>}
          <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', flexBasis: '100%' }}>
            <span className="hint">Jenis unit{selUnit ? ' ' + selUnit : ''}: <b>{selUnit ? (LABEL_JENIS[jenisUnit(selUnit)] || 'unit biasa') : '—'}</b></span>
            <button className="sort-btn" style={{ fontWeight: 700 }} onClick={() => setJenisUnit(selUnit, 'kavling')}>□ Kavling</button>
            <button className="sort-btn" style={{ borderColor: COLOR.show, color: COLOR.show, fontWeight: 700 }} onClick={() => setJenisUnit(selUnit, 'show')}>SU Show Unit</button>
            {selUnit && jenisUnit(selUnit) ? <button className="sort-btn" onClick={() => setJenisUnit(selUnit, '')}>Jadikan unit biasa</button> : null}
          </span>
          {(/BIO/i.test(proj) || /PERMAI/i.test(proj)) && (
            <button className="sort-btn" style={{ marginLeft: 'auto' }} disabled={imp} title="Lihat apa yang akan berubah tanpa menulis apa pun"
              onClick={async () => {
                setImp(true);
                try {
                  const r = await api('/api/stock/import', { method: 'POST', body: JSON.stringify({ project: proj, cek: true }) });
                  const baris = [
                    `CEK IMPOR ${r.project} — belum ada yang diubah`, '',
                    `• ${r.terjual} unit akan ditandai Terjual${r.reserved ? ` + ${r.reserved} Reserved` : ''} dari laporan`,
                    r.ikutTransaksi?.length ? `• ${r.ikutTransaksi.length} unit tetap mengikuti transaksi CRM: ${r.ikutTransaksi.join(', ')}` : '',
                    r.disamakan?.length ? `• ${r.disamakan.length} tanda manual Terjual akan disamakan datanya: ${r.disamakan.join(', ')}` : '',
                    r.dibuka?.length ? `• ${r.dibuka.length} tanda manual TIDAK ADA di laporan → akan DIBUKA (tersedia): ${r.dibuka.join(', ')}` : '• Tidak ada tanda manual yang perlu dibuka',
                    r.konflik?.length ? `• Konflik (dibiarkan, cek manager): ${r.konflik.join(', ')}` : '',
                    r.takDikenal?.length ? `• Unit di laporan yang tidak ada di master: ${r.takDikenal.join(', ')}` : '',
                    r.tandaDibersihkan?.length ? `• Tanda impor lama yang akan dihapus: ${r.tandaDibersihkan.join(', ')}` : '',
                  ].filter(Boolean).join('\n');
                  alert(baris);
                } catch (err) { toast(err.message); } finally { setImp(false); }
              }}>🔍 Cek dulu</button>)}
          {(/BIO/i.test(proj) || /PERMAI/i.test(proj)) && (
            <button className="sort-btn" style={{ borderColor: 'var(--green)', color: 'var(--green)', fontWeight: 700 }}
              disabled={imp}
              onClick={async () => {
                const permai = /PERMAI/i.test(proj);
                if (!confirm(permai
                  ? 'Impor Laporan Penjualan PERMAI INDAH (s.d Oktober 2026)?\n\n72 unit ditandai TERJUAL lengkap NAMA PEMBELI, AGEN, nilai kontrak, dan tanggal akad. Daftar master unit Permai Indah tidak diubah.\n\nUnit yang sudah punya transaksi Booking di CRM tetap mengikuti transaksi. Unit yang ditandai manual Terjual oleh manager dan juga Terjual di laporan → datanya disamakan; tanda manual yang TIDAK ada di laporan → dibuka kembali (laporan dianggap paling mutakhir).'
                  : 'Impor data Weekly Report BIO DISTRICT (s.d September 2026)?\n\n1) Master unit disetel ke daftar SITEPLAN RESMI = 63 unit.\n2) 32 unit ditandai TERJUAL + 1 RESERVED (Bio Blv no.12), lengkap NAMA PEMBELI & SALES.\n\nUnit yang sudah punya transaksi di CRM tetap mengikuti transaksi; unit yang diatur manual oleh manager tidak ditimpa.')) return;
                setImp(true);
                try {
                  const r = await api('/api/stock/import', { method: 'POST', body: JSON.stringify({ project: proj }) });
                  await loadStock();
                  toast(`Impor selesai — master ${r.totalUnit} unit · ${r.terjual} terjual · ${r.reserved} reserved · ${r.totalUnit - r.terjual - r.reserved} tersedia ✅`);
                  if (r.dibuka && r.dibuka.length) toast(r.dibuka.length + ' tanda manual tidak ada di laporan → dibuka kembali: ' + r.dibuka.slice(0, 4).join(', '));
                  if (r.disamakan && r.disamakan.length) toast(r.disamakan.length + ' unit tanda manual disamakan dengan laporan (nama, agen, nilai, akad)');
                  if (r.konflik && r.konflik.length) toast('Perlu dicek manager, tanda manual berbeda dengan laporan: ' + r.konflik.slice(0, 3).join(' · ') + (r.konflik.length > 3 ? ' · +' + (r.konflik.length - 3) + ' lagi' : ''));
                  if (r.tandaMenggantung && r.tandaMenggantung.length) {
                    toast('Perlu dicek: ' + r.tandaMenggantung.length + ' tanda lama di unit yang tidak ada di siteplan → ' + r.tandaMenggantung.slice(0, 4).join(', '));
                  }
                } catch (err) { toast(err.message); } finally { setImp(false); }
              }}>{imp ? '⏳ Mengimpor…' : (/PERMAI/i.test(proj) ? '⬆ Impor Laporan Penjualan (s.d Okt 2026)' : '⬆ Impor Weekly Report')}</button>
          )}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>
          <b>🔵 Hold Manajemen</b> = unit ditahan: mengurangi stok tersedia dan tidak bisa dipilih di Form Input sampai hold-nya dibuka (hanya Head of Sales &amp; Marketing). Tanda manual menimpa status dari transaksi (titik putih kecil di tengah lingkaran) — kecuali unit yang sudah Booking lewat transaksi.
          Gunakan <b>⚪ Buka Stok</b> bila unit benar-benar kembali tersedia: tandanya terkunci sebagai tersedia dan <b>tidak akan dihidupkan lagi oleh impor</b>.
          {selUnit && manMap[proj + '|' + selUnit] ? <b> {selUnit}: manual ({manMap[proj + '|' + selUnit]}).</b> : ''}
        </div>
      </div>}

      {isMgr && placing && <div className="note" style={{ background: 'var(--blue-soft)', borderColor: 'var(--blue)', color: 'var(--blue)' }}>
        📍 Klik lokasi <b>{placing}</b> pada peta. Zoom dulu supaya akurat. <button className="sort-btn" style={{ marginLeft: 8 }} onClick={() => setPlacing(null)}>Batal</button>
      </div>}

      {/* Peta: bisa di-zoom (geser dengan scroll saat diperbesar) */}
      <div style={{ overflow: 'auto', borderRadius: 'var(--radius)', border: '1px solid var(--line)', maxHeight: '78vh', WebkitOverflowScrolling: 'touch' }}>
        <div ref={inner} onClick={klikPeta}
          style={{ position: 'relative', width: (zoom * 100) + '%', lineHeight: 0, cursor: (isMgr && placing) ? 'crosshair' : 'default' }}>
          <img src={IMG(proj)} alt={proj} style={{ width: '100%', height: 'auto', display: 'block' }} />
          {markers.map(m => (
            <div key={m.unit} title={m.unit + ' — ' + m.info + (m.jenis && m.warna ? ' · ' + LABEL_JENIS[m.jenis] : '')}
              onClick={e => { if (isMgr && !placing) { e.stopPropagation(); setSelUnit(m.unit); toast(m.unit + ' dipilih — atur lewat panel di atas'); } }}
              style={{
                position: 'absolute', left: m.x + '%', top: m.y + '%',
                width: bentuk(m) === 'su' ? 24 : 18, height: bentuk(m) === 'su' ? 24 : 18, borderRadius: bentuk(m) === 'kotak' ? 3 : '50%', background: warnaTanda(m),
                transform: 'translate(-50%,-50%)', color: bentuk(m) === 'kotak' ? '#1C2B23' : '#fff', fontSize: bentuk(m) === 'su' ? 9.5 : 10.5, fontWeight: 800, lineHeight: 1, letterSpacing: '.02em',
                border: (isMgr && selUnit === m.unit ? '3px solid #2D5D8E' : bentuk(m) === 'kotak' ? '2px solid #1C2B23' : '2.5px solid #fff'),
                boxShadow: '0 1px 6px rgba(0,0,0,.5)', cursor: isMgr ? 'pointer' : 'help',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              {m.manual ? <span style={{ width: 5, height: 5, borderRadius: '50%', background: '#fff' }} /> : bentuk(m) !== 'bulat' ? <span>{HURUF[m.jenis]}</span> : null}
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

      {isMgr && ditahan.length > 0 && <div className="card" style={{ marginTop: 14 }}>
        <h2>🔵 Hold Manajemen ({ditahan.length})</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {ditahan.map(u => (<span key={u} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', border: '1px solid var(--line)', borderRadius: 20, padding: '4px 6px 4px 12px', fontSize: 13 }}>
            <b>{u}</b>{jenisUnit(u) ? <span className="hint">{LABEL_JENIS[jenisUnit(u)]}</span> : null}
            {bolehBukaHold && <button className="sort-btn" style={{ padding: '2px 10px' }} onClick={() => { if (window.confirm('Buka hold ' + u + '? Unit kembali tersedia dan bisa dipilih sales.')) setHoldUnit(u, false); }}>🔓 Buka</button>}
          </span>))}
        </div>
        <div className="hint" style={{ marginTop: 8 }}>{bolehBukaHold ? 'Buka hold per unit dari sini. Untuk menahan unit lain: pilih unitnya di panel Update Stok Manual lalu klik 🔵 Hold Manajemen.' : 'Hold hanya bisa dibuka oleh Head of Sales & Marketing.'}</div>
      </div>}

      {isMgr && <div className="card" style={{ marginTop: 14 }}>
        <h2>Unit Bertanda — Belum Ditandai di Peta ({unmapped.length})</h2>
        {unmapped.length ? (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {unmapped.map(u => (
              <button key={u.unit} className="sort-btn"
                style={{ borderColor: u.jenis === 'kavling' && !u.warna ? 'var(--line)' : warnaTanda(u), color: u.jenis === 'kavling' && !u.warna ? 'inherit' : warnaTanda(u), fontWeight: 700 }}
                onClick={() => { setPlacing(u.unit); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                {u.warna === 'merah' ? '🔴' : u.warna === 'kuning' ? '🟡' : u.warna === 'biru' ? '🔵' : u.jenis === 'kavling' ? '□' : 'SU'} {u.unit}{u.jenis ? ' (' + LABEL_JENIS[u.jenis] + ')' : ''} — Tandai
              </button>
            ))}
          </div>
        ) : <div className="hint">Semua unit bertanda sudah punya posisi di peta.</div>}
      </div>}
      <Toast />
    </>
  );
}
