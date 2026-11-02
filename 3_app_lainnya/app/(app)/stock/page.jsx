'use client';
import { useEffect, useRef, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, catatUnduh } from '@/components/util';

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
  const [pdfBusy, setPdfBusy] = useState(false);
  const [namaBeli, setNamaBeli] = useState('');
  const [salesBeli, setSalesBeli] = useState('');
  const [imp, setImp] = useState(false);
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
  const isMgr = ['administrator', 'headsales', 'salesmanager'].includes(me.role) || ['ceo', 'salesmanager', 'ceogrup'].includes(me.role); // ceo: kelola stok, tanpa hapus titik

  const posMap = {}; pos.forEach(p => { posMap[p.project + '|' + p.unit] = p; });
  const manMap = {}; manual.forEach(x => { manMap[x.project + '|' + x.unit] = x.status; });
  const unitList = (set.units && set.units[proj]) || [];
  const stMap = {}; status.forEach(u => { stMap[u.project + '|' + u.unit] = u; });

  // Hanya unit yang ada di daftar master project ini yang ditampilkan —
  // menghindari tanda "hantu" dari penamaan unit lama yang sudah tidak berlaku
  const asing = status.filter(u => u.project === proj && unitList.length && !unitList.includes(u.unit));
  const active = status.filter(u => u.project === proj && (!unitList.length || unitList.includes(u.unit)));
  const unmapped = active.filter(u => !posMap[proj + '|' + u.unit]);
  const markers = active.filter(u => posMap[proj + '|' + u.unit]).map(u => ({ ...u, ...posMap[proj + '|' + u.unit] }));
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
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2);
        ctx.fillStyle = COLOR[m.warna]; ctx.fill();
        ctx.lineWidth = Math.max(2, R * 0.28); ctx.strokeStyle = '#fff'; ctx.stroke();
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
      kop(isMgr ? 'Peta Siteplan' : 'Peta Siteplan — ' + ((me && me.name) || 'Sales'));
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

      // Peran selain manager: hanya peta siteplan, tanpa daftar unit & nama pembeli
      if (!isMgr) {
        doc.save('Master_Stock_Peta_' + String(proj || 'project').replace(/[^A-Za-z0-9]+/g, '_') + '_' + new Date().toISOString().slice(0, 10) + '.pdf');
        toast('PDF peta Master Stock terunduh 📄');
        return;
      }

      // Halaman 2+: rekap unit bertanda
      const bertanda = [...active].sort((a, b) => (a.warna === b.warna ? String(a.unit).localeCompare(String(b.unit), 'id', { numeric: true }) : a.warna === 'merah' ? -1 : 1));
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

  const jml = w => active.filter(u => u.warna === w).length;
  const zoomTo = z => setZoom(Math.min(4, Math.max(1, Math.round(z * 4) / 4)));

  return (
    <>
      <div className="page-head">
        <div><h1>Master Stock</h1>
          <div className="sub">🔴 Terjual (Booking/Closing) · 🟡 Reserved · Batal/Kosong = tanpa tanda.{isMgr ? ' Manager bisa buka/tutup stok langsung dari sini.' : ' Tampilan lihat-saja — hubungi manager untuk update stok.'}</div></div>
        <div className="stamp">🔴 <b>{jml('merah')}</b> terjual &nbsp; 🟡 <b>{jml('kuning')}</b> reserved</div>
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
          <button className="sort-btn" style={{ fontWeight: 700 }}
            onClick={() => window.open('/cetak-stock?project=' + encodeURIComponent(proj), '_blank')}
            title="Lembar laporan berkop untuk dicetak atau disimpan sebagai PDF">🖨 Lembar Laporan</button>
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
              return <option key={u} value={u}>{u}{st ? (st.warna === 'merah' ? ' 🔴' : ' 🟡') : ''}</option>;
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
          Tanda manual menimpa status dari transaksi (titik putih kecil di tengah lingkaran) — kecuali unit yang sudah Booking lewat transaksi.
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
                style={{ borderColor: u.warna === 'merah' ? 'var(--red)' : 'var(--brass)', color: u.warna === 'merah' ? 'var(--red)' : 'var(--brass)', fontWeight: 700 }}
                onClick={() => { setPlacing(u.unit); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>
                {u.warna === 'merah' ? '🔴' : '🟡'} {u.unit} — Tandai
              </button>
            ))}
          </div>
        ) : <div className="hint">Semua unit bertanda sudah punya posisi di peta.</div>}
      </div>}
      {(isMgr || (me && me.role === 'adminsales')) && <PanelMaster proj={proj} />}
      <Toast />
    </>
  );
}

// ===================== Master Tipe Unit =====================
// Harga & atribut standar per tipe. Unit yang diberi tipe otomatis mewarisi harga ini.
const KOSONG_TIPE = { tipe: '', keterangan: '', sub_tipe: 'Badan', lb: '', lt: '', dimensi: '', arah: '', ppn_dtp: false,
  harga_list: '', harga_standar: '', harga_allin: '', booking_fee: '', uang_muka: '', plafon_kpr: '' };
const rpf = n => (Number(n) ? 'Rp ' + Number(n).toLocaleString('id-ID') : '—');

function TipeUnit({ proj, onUbah }) {
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null);
  const muat = () => { if (!proj) return; api('/api/tipe?project=' + encodeURIComponent(proj)).then(d => setRows(d.rows)).catch(e => toast(e.message)); };
  useEffect(muat, [proj]);
  async function simpan() {
    if (!edit.tipe.trim()) return toast('Nama tipe wajib diisi');
    try { await api('/api/tipe', { method: 'POST', body: JSON.stringify({ project: proj, rows: [{ ...edit, urutan: edit.urutan || (rows.length + 1) }] }) });
      toast('Tipe ' + edit.tipe + ' tersimpan'); setEdit(null); muat(); onUbah && onUbah(); } catch (e) { toast(e.message); }
  }
  async function hapus(t) {
    if (!confirm('Hapus tipe ' + t.tipe + '?')) return;
    try { await api('/api/tipe', { method: 'DELETE', body: JSON.stringify({ project: proj, tipe: t.tipe }) }); toast('Tipe dihapus'); muat(); onUbah && onUbah(); }
    catch (e) { toast(e.message); }
  }
  const isi = k => ({ value: edit[k] ?? '', onChange: e => setEdit({ ...edit, [k]: e.target.value }) });
  if (!rows) return null;
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>Master Tipe Unit — {proj}</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Harga dan atribut standar per tipe. Unit standar yang diberi tipe mewarisi harga ini;
        unit hoek/irregular memakai harga sendiri di tabel unit.</div>
      <div className="tbl-wrap"><table className="tbl-compact">
        <thead><tr><th>Tipe</th><th>Keterangan</th><th className="num">LB</th><th className="num">LT</th><th>Dimensi</th><th>Arah</th>
          <th className="num">Harga List</th><th className="num">Harga Standar</th><th className="num">Harga All In</th><th className="num">Unit</th><th></th></tr></thead>
        <tbody>{rows.map(t => (
          <tr key={t.tipe}>
            <td><b>{t.tipe}</b>{t.ppn_dtp ? <div className="hint" style={{ margin: 0 }}>PPN DTP</div> : null}</td>
            <td>{t.keterangan || '—'}</td><td className="num">{t.lb || '—'}</td><td className="num">{t.lt || '—'}</td>
            <td>{t.dimensi || '—'}</td><td>{t.arah || '—'}</td>
            <td className="num">{rpf(t.harga_list)}</td><td className="num"><b>{rpf(t.harga_standar)}</b></td><td className="num"><b>{rpf(t.harga_allin)}</b></td>
            <td className="num">{t.jumlah_unit}</td>
            <td style={{ whiteSpace: 'nowrap' }}>
              <button className="sort-btn" style={{ padding: '2px 8px' }} onClick={() => setEdit({ ...KOSONG_TIPE, ...t })}>Ubah</button>{' '}
              <button className="sort-btn" style={{ padding: '2px 8px', color: 'var(--red)' }} onClick={() => hapus(t)}>Hapus</button>
            </td>
          </tr>))}</tbody>
      </table></div>
      <button className="sort-btn" style={{ marginTop: 8 }} onClick={() => setEdit({ ...KOSONG_TIPE })}>+ Tambah tipe</button>
      {edit && (
        <div className="card" style={{ marginTop: 12, background: '#FBFAF4' }}>
          <h3 style={{ marginTop: 0 }}>{edit.tipe && rows.some(r => r.tipe === edit.tipe) ? 'Ubah tipe ' + edit.tipe : 'Tipe baru'}</h3>
          <div className="form-grid">
            <div className="field"><label>Tipe <span className="req">*</span></label><input {...isi('tipe')} placeholder="mis. A" /></div>
            <div className="field"><label>Keterangan</label><input {...isi('keterangan')} placeholder="PPN DTP / NON PPN DTP" /></div>
            <div className="field"><label>Sub-tipe</label><input {...isi('sub_tipe')} /></div>
            <div className="field"><label>Arah hadap</label><input {...isi('arah')} placeholder="TIMUR / BARAT / …" /></div>
            <div className="field"><label>Luas bangunan (m²)</label><input type="number" {...isi('lb')} /></div>
            <div className="field"><label>Luas tanah (m²)</label><input type="number" {...isi('lt')} /></div>
            <div className="field"><label>Dimensi</label><input {...isi('dimensi')} placeholder="6 x 10" /></div>
            <div className="field"><label>PPN DTP</label><select value={edit.ppn_dtp ? '1' : '0'} onChange={e => setEdit({ ...edit, ppn_dtp: e.target.value === '1' })}>
              <option value="0">Tidak</option><option value="1">Ya</option></select></div>
            <div className="field"><label>Harga List (include PPN)</label><input type="number" {...isi('harga_list')} /></div>
            <div className="field"><label>Harga Standar (setelah diskon)</label><input type="number" {...isi('harga_standar')} /></div>
            <div className="field"><label>Harga All In (setelah diskon)</label><input type="number" {...isi('harga_allin')} /></div>
            <div className="field"><label>Booking Fee</label><input type="number" {...isi('booking_fee')} /></div>
            <div className="field"><label>Uang Muka (bila tetap)</label><input type="number" {...isi('uang_muka')} /></div>
            <div className="field"><label>Plafon KPR (bila tetap)</label><input type="number" {...isi('plafon_kpr')} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={simpan}>Simpan Tipe</button>
            <button className="sort-btn" onClick={() => setEdit(null)}>Batal</button>
          </div>
        </div>)}
    </div>
  );
}

// ===================== Master Unit & Harga =====================
// Tiap unit: tipe (mewarisi harga standar), atau harga sendiri untuk unit hoek/irregular.
function HargaUnit({ proj, versi }) {
  const [data, setData] = useState(null);
  const [ubah, setUbah] = useState({});
  const [cari, setCari] = useState('');
  const [busy, setBusy] = useState(false);
  const [borong, setBorong] = useState({ tipe: '', standar: '', allin: '' });
  const muat = () => { if (!proj) return; api('/api/harga?project=' + encodeURIComponent(proj)).then(d => { setData(d); setUbah({}); }).catch(e => toast(e.message)); };
  useEffect(muat, [proj, versi]);
  if (!data) return null;
  const rows = data.rows, tipeList = data.tipe || [];
  const nilai = (u, k) => { const x = ubah[u.unit] || {}; return x[k] !== undefined ? x[k] : (k === 'tipe' ? u.tipe : u.sendiri[k] || ''); };
  const set = (u, k, v) => setUbah(x => ({ ...x, [u]: { ...(x[u] || {}), [k]: v } }));
  const tampil = rows.filter(r => !cari || r.unit.toLowerCase().includes(cari.toLowerCase()));
  const belum = rows.filter(r => r.efektif.sumber === 'kosong').length;
  async function simpan() {
    const daftar = Object.entries(ubah).map(([unit, v]) => ({ unit, ...v }));
    if (!daftar.length) return toast('Tidak ada perubahan');
    setBusy(true);
    try { const r = await api('/api/harga', { method: 'POST', body: JSON.stringify({ project: proj, rows: daftar }) });
      toast(r.tersimpan + ' unit tersimpan'); muat(); } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  function terapkan() {
    if (!borong.tipe && !borong.standar && !borong.allin) return toast('Pilih tipe atau isi harga yang ingin diterapkan');
    const u = { ...ubah };
    tampil.forEach(r => { u[r.unit] = { ...(u[r.unit] || {}), ...(borong.tipe ? { tipe: borong.tipe } : {}),
      ...(borong.standar ? { harga_standar: Number(borong.standar) } : {}), ...(borong.allin ? { harga_allin: Number(borong.allin) } : {}) }; });
    setUbah(u); toast('Diterapkan ke ' + tampil.length + ' unit yang tampil — tekan Simpan');
  }
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>Master Unit & Harga — {proj}</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Beri tipe pada unit standar agar mewarisi harga tipenya. Isi harga sendiri hanya untuk unit hoek/irregular
        — harga sendiri selalu mengalahkan harga tipe.{belum ? <b> {belum} unit belum berharga.</b> : ''}</div>
      <div className="fu-toolbar" style={{ alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
        <input value={cari} onChange={e => setCari(e.target.value)} placeholder="saring unit, mis. Bio Ave 1" style={{ maxWidth: 200 }} />
        <span className="hint" style={{ margin: 0 }}>Terapkan ke {tampil.length} unit yang tampil:</span>
        <select value={borong.tipe} onChange={e => setBorong({ ...borong, tipe: e.target.value })} style={{ maxWidth: 130 }}>
          <option value="">— tipe —</option>{tipeList.map(t => <option key={t.tipe} value={t.tipe}>Tipe {t.tipe}</option>)}</select>
        <input type="number" value={borong.standar} onChange={e => setBorong({ ...borong, standar: e.target.value })} placeholder="harga standar" style={{ maxWidth: 140 }} />
        <input type="number" value={borong.allin} onChange={e => setBorong({ ...borong, allin: e.target.value })} placeholder="harga all in" style={{ maxWidth: 140 }} />
        <button className="sort-btn" onClick={terapkan}>Terapkan</button>
        <span style={{ flex: 1 }} />
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy || !Object.keys(ubah).length} onClick={simpan}>
          Simpan{Object.keys(ubah).length ? ' (' + Object.keys(ubah).length + ')' : ''}</button>
      </div>
      <div className="tbl-wrap" style={{ maxHeight: 460, overflow: 'auto' }}>
        <table className="tbl-compact">
          <thead><tr><th>Blok / Unit</th><th>Tipe</th><th className="num">Harga Standar</th><th className="num">Harga All In</th><th>Sumber</th><th>Keterangan</th></tr></thead>
          <tbody>{tampil.map(r => {
            const e = r.efektif, warisan = e.sumber === 'tipe';
            return (
              <tr key={r.unit} style={ubah[r.unit] ? { background: '#FFF8E9' } : {}}>
                <td><b>{r.unit}</b>{r.hoek ? <span className="badge b-warm" style={{ marginLeft: 6 }}>HOEK</span> : null}</td>
                <td><select value={nilai(r, 'tipe')} onChange={ev => set(r.unit, 'tipe', ev.target.value)} style={{ minHeight: 0, padding: '4px 6px' }}>
                  <option value="">—</option>{tipeList.map(t => <option key={t.tipe} value={t.tipe}>{t.tipe}</option>)}</select></td>
                <td className="num"><input type="number" min="0" value={nilai(r, 'harga_standar') || ''} placeholder={warisan ? String(e.harga_standar) : '0'}
                  onChange={ev => set(r.unit, 'harga_standar', ev.target.value)} style={{ width: 150, textAlign: 'right', minHeight: 0, padding: '4px 8px', color: warisan && !nilai(r, 'harga_standar') ? '#8A8F84' : undefined }} /></td>
                <td className="num"><input type="number" min="0" value={nilai(r, 'harga_allin') || ''} placeholder={warisan ? String(e.harga_allin) : '0'}
                  onChange={ev => set(r.unit, 'harga_allin', ev.target.value)} style={{ width: 150, textAlign: 'right', minHeight: 0, padding: '4px 8px', color: warisan && !nilai(r, 'harga_allin') ? '#8A8F84' : undefined }} /></td>
                <td className="hint" style={{ margin: 0 }}>{e.sumber === 'unit' ? 'harga sendiri' : e.sumber === 'tipe' ? 'warisan tipe ' + r.tipe : <span style={{ color: 'var(--red)' }}>belum ada</span>}</td>
                <td className="hint" style={{ margin: 0 }}>{r.keterangan || (r.updated_by ? r.updated_by : '')}</td>
              </tr>);
          })}</tbody>
        </table>
      </div>
    </div>
  );
}

// ===================== Deteksi tipe dari warna siteplan =====================
// Warna blok pada gambar siteplan menandai tipe (legenda peta). Warna di bawah
// tiap penanda unit dibaca dari gambar, lalu dicocokkan ke warna legenda.
const LEGENDA = { 'BIO DISTRICT': { C: [97, 173, 161], B: [250, 192, 138], A: [154, 114, 141] } };
const IMG_PETA = p => (/BIO/i.test(p) ? '/siteplan-bio.jpg' : '/siteplan-permai.jpg');

function DeteksiTipe({ proj, onSelesai }) {
  const [hasil, setHasil] = useState(null);
  const [busy, setBusy] = useState(false);
  const legenda = LEGENDA[proj];
  async function deteksi() {
    setBusy(true);
    try {
      const st = await api('/api/stock');
      const pos = (st.positions || []).filter(p => p.project === proj);
      if (!pos.length) { toast('Belum ada posisi penanda untuk ' + proj); setBusy(false); return; }
      const img = new Image(); img.src = IMG_PETA(proj);
      await new Promise((res, rej) => { img.onload = res; img.onerror = rej; });
      const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight;
      const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0);
      const jarak = (a, b) => Math.sqrt(a.reduce((s, v, i) => s + (v - b[i]) ** 2, 0));
      const baca = (cx, cy, r) => {
        const d = ctx.getImageData(Math.max(0, cx - r), Math.max(0, cy - r), 2 * r + 1, 2 * r + 1).data;
        const suara = {}; let n = 0;
        for (let i = 0; i < d.length; i += 4) {
          // Toleransi 35: teruji 18/18 blok benar; lebih longgar membuat pohon terbaca sebagai ungu (tipe A)
          const px = [d[i], d[i + 1], d[i + 2]]; let best = null, bd = 35;
          for (const [t, warna] of Object.entries(legenda)) { const j = jarak(px, warna); if (j < bd) { bd = j; best = t; } }
          if (best) { suara[best] = (suara[best] || 0) + 1; n += 1; }
        }
        const total = (2 * r + 1) ** 2;
        const urut = Object.entries(suara).sort((a, b) => b[1] - a[1]);
        return urut.length && urut[0][1] / total >= 0.25 ? { tipe: urut[0][0], yakin: Math.round(urut[0][1] / total * 100) } : null;
      };
      const out = pos.map(p => {
        const cx = Math.round(p.x / 100 * cv.width), cy = Math.round(p.y / 100 * cv.height);
        const r1 = baca(cx, cy, 6) || baca(cx, cy, 14) || baca(cx, cy, 24);
        return { unit: p.unit, tipe: r1 ? r1.tipe : '', yakin: r1 ? r1.yakin : 0 };
      }).sort((a, b) => a.unit.localeCompare(b.unit, 'id', { numeric: true }));
      const master = await api('/api/harga?project=' + encodeURIComponent(proj));
      const m = {}; (master.rows || []).forEach(r => { m[r.unit] = r; });
      setHasil(out.map(o => ({ ...o, sekarang: (m[o.unit] || {}).tipe || '', hoek: Boolean((m[o.unit] || {}).hoek), pakai: Boolean(o.tipe) && !(m[o.unit] || {}).hoek })));
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function simpan() {
    const rows = hasil.filter(h => h.pakai && h.tipe).map(h => ({ unit: h.unit, tipe: h.tipe }));
    if (!rows.length) return toast('Tidak ada unit yang dipilih');
    setBusy(true);
    try { const r = await api('/api/harga', { method: 'POST', body: JSON.stringify({ project: proj, rows }) });
      toast('Tipe ' + r.tersimpan + ' unit tersimpan'); setHasil(null); onSelesai && onSelesai(); } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  if (!legenda) return null;
  const ringkas = hasil ? Object.entries(hasil.reduce((a, h) => { a[h.tipe || '?'] = (a[h.tipe || '?'] || 0) + 1; return a; }, {})).map(([k, v]) => 'Tipe ' + k + ': ' + v).join(' · ') : '';
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>Deteksi Tipe dari Warna Siteplan — {proj}</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Warna blok di bawah tiap penanda dibaca dari gambar siteplan dan dicocokkan ke legenda
        (hijau-toska = C, peach = B, ungu = A). Hasilnya usulan — periksa sebelum disimpan. Unit hoek dilewati karena tipenya sudah dari price list.</div>
      {!hasil ? <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={deteksi}>{busy ? 'Membaca peta…' : '🎨 Baca warna peta'}</button> : (<>
        <div className="hint" style={{ marginBottom: 8 }}><b>{ringkas}</b> · unit tanpa warna cocok ditandai "?" dan tidak disimpan</div>
        <div className="tbl-wrap" style={{ maxHeight: 360, overflow: 'auto' }}><table className="tbl-compact">
          <thead><tr><th>Simpan</th><th>Unit</th><th>Tipe terbaca</th><th>Keyakinan</th><th>Tipe sekarang</th></tr></thead>
          <tbody>{hasil.map((h, i) => (
            <tr key={h.unit} style={!h.tipe ? { background: '#FBEDEC' } : h.sekarang && h.sekarang !== h.tipe && !h.hoek ? { background: '#FFF8E9' } : {}}>
              <td><input type="checkbox" checked={h.pakai} disabled={!h.tipe || h.hoek} onChange={e => setHasil(x => x.map((y, j) => j === i ? { ...y, pakai: e.target.checked } : y))} /></td>
              <td><b>{h.unit}</b>{h.hoek ? <span className="badge b-warm" style={{ marginLeft: 6 }}>HOEK</span> : null}</td>
              <td>{h.tipe ? <b>Tipe {h.tipe}</b> : <span style={{ color: 'var(--red)' }}>? tidak cocok legenda</span>}</td>
              <td>{h.yakin ? h.yakin + '%' : '—'}</td>
              <td>{h.sekarang || '—'}{h.sekarang && h.tipe && h.sekarang !== h.tipe && !h.hoek ? <span className="hint" style={{ margin: 0 }}> · berbeda</span> : ''}</td>
            </tr>))}</tbody>
        </table></div>
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={simpan}>Simpan tipe untuk {hasil.filter(h => h.pakai).length} unit</button>
          <button className="sort-btn" onClick={() => setHasil(null)}>Batal</button>
        </div>
      </>)}
    </div>
  );
}

function PanelMaster({ proj }) {
  const [versi, setVersi] = useState(0);
  return (<>
    <TipeUnit proj={proj} onUbah={() => setVersi(v => v + 1)} />
    <DeteksiTipe proj={proj} onSelesai={() => setVersi(v => v + 1)} />
    <HargaUnit proj={proj} versi={versi} />
  </>);
}
