'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp, catatUnduh } from '@/components/util';
import { BIO_STANDAR, BIO_IRREG, BIO_PL, BIO_PROMO, tipeBio, PERMAI, PERMAI_PL } from '@/lib/pricelist';
import { usePriceList } from '@/components/usePriceList';

// ===== Price List: harga resmi per project + ketersediaan unit, siap dibagikan sebagai PDF =====
const IMG = p => /BIO/i.test(p) ? '/siteplan-bio.jpg' : '/siteplan-permai.jpg';
const namaRapi = p => String(p || '').replace(/\b\w+/g, w => w[0] + w.slice(1).toLowerCase());

function PriceListIsi({ plv }) {
  const [me, setMe] = useState(null);
  const [set, setSet] = useState({ project: [], units: {} });
  const [proj, setProj] = useState('');
  const [stok, setStok] = useState(null);
  const [busy, setBusy] = useState('');
  const [isiPdf, setIsiPdf] = useState({ standar: true, irreg: true, sembunyiTerjual: true, promo: false, harga: true, siteplan: false });
  useEffect(() => {
    Promise.all([api('/api/auth/me'), api('/api/settings'), api('/api/stock')]).then(([u, s, st]) => {
      setMe(u); setSet(s); setStok(st);
      const q = new URLSearchParams(window.location.search).get('project');
      setProj((s.project || []).includes(q) ? q : (s.project || [])[0] || 'BIO DISTRICT');
    }).catch(e => toast(e.message));
  }, []);

  // Status tiap unit: terjual / reserved / tersedia (sama dengan Master Stock)
  const unit = useMemo(() => {
    if (!stok || !proj) return { list: [], st: {} };
    const list = (set.units && set.units[proj]) || [];
    const st = {}; (stok.status || []).filter(x => x.project === proj).forEach(x => { st[x.unit] = x.warna === 'merah' ? 'Terjual' : x.warna === 'kuning' ? 'Reserved' : 'Tersedia'; });
    return { list, st };
  }, [stok, proj, set]);
  const statusU = u => unit.st[u] || 'Tersedia';
  const isBio = /BIO/i.test(proj);
  const perTipe = useMemo(() => {
    const r = { A: { total: 0, ada: 0 }, B: { total: 0, ada: 0 }, C: { total: 0, ada: 0 } };
    unit.list.filter(u => !BIO_IRREG[u]).forEach(u => { const t = tipeBio(u); if (!t) return; r[t].total++; if (statusU(u) === 'Tersedia') r[t].ada++; });
    return r;
  }, [unit]); // eslint-disable-line

  // ===== PDF siap share untuk konsumen — mengikuti format price list resmi masing-masing project =====
  const muatGambar = async (src, warnaLatar) => {
    const im = new Image(); im.src = src; await new Promise((res, rej) => { im.onload = res; im.onerror = () => rej(new Error('Gambar ' + src + ' tidak bisa dimuat')); });
    const c = document.createElement('canvas'); c.width = im.naturalWidth; c.height = im.naturalHeight; const x = c.getContext('2d');
    if (warnaLatar) { x.fillStyle = warnaLatar; x.fillRect(0, 0, c.width, c.height); }
    x.drawImage(im, 0, 0); return { data: c.toDataURL('image/png'), w: im.naturalWidth, h: im.naturalHeight };
  };
  async function siteplanHal(doc, PW, PH, M, judulY) {
    const img = new Image(); img.src = IMG(proj);
    await new Promise((res, rej) => { img.onload = res; img.onerror = () => rej(new Error('Siteplan tidak bisa dimuat')); });
    const W = Math.min(img.naturalWidth || 1600, 2200), H = Math.round((img.naturalHeight || 1000) * (W / (img.naturalWidth || 1600)));
    const cv = document.createElement('canvas'); cv.width = W; cv.height = H; const ctx = cv.getContext('2d'); ctx.drawImage(img, 0, 0, W, H);
    const posMap = {}; (stok.positions || []).forEach(p => { if (p.project === proj) posMap[p.unit] = p; });
    const R = Math.max(6, Math.round(W * 0.0055));
    Object.entries(unit.st).forEach(([u, st]) => { const p = posMap[u]; if (!p || st === 'Tersedia') return;
      const cx = p.x / 100 * W, cy = p.y / 100 * H; ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.fillStyle = st === 'Terjual' ? '#B3402F' : '#C9922E'; ctx.fill(); ctx.lineWidth = Math.max(2, R * 0.28); ctx.strokeStyle = '#fff'; ctx.stroke(); });
    const data = cv.toDataURL('image/jpeg', 0.85);
    const maksL = PW - 2 * M, maksT = PH - judulY - 22;
    let lb = maksL, tg = lb * H / W; if (tg > maksT) { tg = maksT; lb = tg * W / H; }
    doc.addImage(data, 'JPEG', M + (maksL - lb) / 2, judulY, lb, tg);
    const y = judulY + tg + 7;
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(30);
    doc.setDrawColor(120); doc.circle(M + 1.8, y - 1.2, 1.8, 'S'); doc.text('Tersedia (tanpa tanda)', M + 5, y);
    doc.setFillColor(201, 146, 46); doc.circle(M + 52, y - 1.2, 1.8, 'F'); doc.text('Reserved', M + 55, y);
    doc.setFillColor(179, 64, 47); doc.circle(M + 80, y - 1.2, 1.8, 'F'); doc.text('Terjual', M + 83, y);
  }
  // Tabel bergaris dengan header 2 tingkat (kelompok kolom), seperti price list resmi
  function tabelPL(doc, { x0, y, cols, groups, rows, fs = 7, hijau = [] }) {
    const L = cols.map(c => c.w), X = [x0]; L.forEach((w, i) => X.push(X[i] + w));
    const HH = 6.5, garis = (x, yy, w, h, fill) => { if (fill) { doc.setFillColor(...fill); doc.rect(x, yy, w, h, 'FD'); } else doc.rect(x, yy, w, h); };
    doc.setDrawColor(90); doc.setLineWidth(0.15); doc.setFont('helvetica', 'bold'); doc.setFontSize(fs); doc.setTextColor(20);
    const dalamGrup = i => groups.find(g => i >= g.from && i <= g.to);
    const fillCol = i => hijau.includes(i) ? [215, 235, 201] : [245, 245, 240];
    const teksTengah = (t, x, yy, w, h) => { const ln = doc.splitTextToSize(t, w - 1.5); const y0 = yy + h / 2 - (ln.length - 1) * fs * 0.19 + fs * 0.12; ln.forEach((l, k) => doc.text(l, x + w / 2, y0 + k * fs * 0.38, { align: 'center' })); };
    cols.forEach((c, i) => { if (!dalamGrup(i)) { garis(X[i], y, L[i], HH * 2, fillCol(i)); teksTengah(c.h, X[i], y, L[i], HH * 2); } });
    groups.forEach(g => { const w = X[g.to + 1] - X[g.from]; garis(X[g.from], y, w, HH, fillCol(g.from)); teksTengah(g.h, X[g.from], y, w, HH);
      for (let i = g.from; i <= g.to; i++) { garis(X[i], y + HH, L[i], HH, fillCol(i)); teksTengah(cols[i].h, X[i], y + HH, L[i], HH); } });
    y += HH * 2; doc.setFont('helvetica', 'normal');
    rows.forEach(r => { const RH = 5.6; r.forEach((v, i) => { garis(X[i], y, L[i], RH); const al = cols[i].a || 'c';
      doc.text(String(v), al === 'r' ? X[i + 1] - 1.2 : al === 'l' ? X[i] + 1.2 : X[i] + L[i] / 2, y + 3.8, { align: al === 'r' ? 'right' : al === 'l' ? 'left' : 'center' }); }); y += RH; });
    return y;
  }
  const angka = n => Number(n || 0).toLocaleString('id-ID');
  async function pdfBio(doc) {
    const PW = 297, PH = 210, M = 10;
    const chl = await muatGambar('/logo.png'), bio = await muatGambar('/logo-bio-hitam.png');
    const kop = (judul) => {
      doc.addImage(chl.data, 'PNG', M, 7, 16 * chl.w / chl.h, 16);
      doc.addImage(bio.data, 'PNG', PW - M - 13 * bio.w / bio.h, 9, 13 * bio.w / bio.h, 13);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9); doc.setTextColor(20); doc.text(judul, M, 30); doc.text(BIO_PL.tanggal, PW - M, 30, { align: 'right' });
    };
    const ketentuan = (y) => {
      doc.setFont('helvetica', 'bold'); doc.setFontSize(8); doc.text('Terms & Conditions', M, y); y += 4;
      BIO_PL.terms.forEach(([j, r], k) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(7); doc.text(`${k + 1}. ${j}`, M + 3, y); y += 3.4;
        doc.setFont('helvetica', 'normal'); r.forEach(([a, b, c], n) => { doc.text(`${'abc'[n]}.  ${a}`, M + 7, y); doc.text(': ' + b, M + 45, y); if (c) doc.text(c, M + 80, y); y += 3.2; }); y += 1.2; });
      doc.setDrawColor(90); doc.line(M, y, M + 180, y); y += 4;
      doc.setFont('helvetica', 'bold'); doc.text('CATATAN', M, y); y += 3.6;
      BIO_PL.catatan.forEach(([j, t], k) => {
        doc.setFont('helvetica', j ? 'bold' : 'normal'); doc.setFontSize(6.6);
        const isi = doc.splitTextToSize(t, 230);
        if (j) { doc.text(`${k + 1}. ${j}`, M + 3, y); y += 3; doc.setFont('helvetica', 'normal'); isi.forEach(l => { doc.text(l, M + 7, y); y += 2.9; }); }
        else { isi.forEach((l, n) => { doc.text((n ? '    ' : `${k + 1}. `) + l, M + 3, y); y += 2.9; }); }
      });
      y += 2.5; doc.setFont('helvetica', 'normal'); doc.setFontSize(7); doc.text(BIO_PL.rekening.judul, M, y); y += 3.4; doc.setFont('helvetica', 'bold');
      [['Bank', BIO_PL.rekening.bank], ['No. Rekening', BIO_PL.rekening.no], ['Cabang', BIO_PL.rekening.cabang]].forEach(([a, b]) => { doc.text(a, M + 8, y); doc.text(': ' + b, M + 32, y); y += 3.2; });
      y += 1.5; doc.setFont('helvetica', 'normal'); doc.setFontSize(6.6); doc.setTextColor(90); doc.text('Bank rekanan KPR: ' + BIO_PL.bankRekanan.join(' · '), M, y); doc.setTextColor(20);
    };
    const T = BIO_PL.tenor, B = BIO_PL.bunga;
    const grupCicil = (a) => [{ from: a, to: a + 2, h: `Ilustrasi Harga Jual (Cicilan KPR Bunga ${B})` }, { from: a + 3, to: a + 5, h: `Ilustrasi Harga Jual All In (Cicilan KPR Bunga ${B})` }];
    const kolCicil = w => [...T.map(t => ({ h: t + ' Tahun', w, a: 'r' })), ...T.map(t => ({ h: t + ' Tahun', w, a: 'r' }))];
    let hal = 0;
    if (isiPdf.standar) {
      kop('STANDART'); hal++;
      const cols = [{ h: 'No', w: 7 }, { h: 'Type', w: 10 }, { h: 'Keterangan', w: 19 }, { h: 'Sub-Type', w: 15 }, { h: 'Build (m2)', w: 12 }, { h: 'Land (m2)', w: 12 }, { h: 'Dimension (m)', w: 16 }, { h: 'View', w: 13 },
        { h: 'Harga Jual All In (Include PPN) (Rp)', w: 25, a: 'r' }, { h: 'Harga Jual (Rp)', w: 23, a: 'r' }, { h: 'Harga Jual All In (Rp)', w: 23, a: 'r' }, ...kolCicil(17)];
      const y = tabelPL(doc, { x0: M, y: 33, cols, groups: [{ from: 5, to: 6, h: 'LAND' }, { from: 9, to: 10, h: 'Harga Setelah Diskon' }, ...grupCicil(11)], hijau: [9, 10, 11, 12, 13, 14, 15, 16],
        rows: BIO_STANDAR.map((x, i) => [i + 1, x.tipe, x.ket, x.sub, x.lb, x.lt, x.dim, x.view, angka(x.inclPpn), angka(x.standar), angka(x.allin), ...x.cicil.map(angka), ...x.cicilAllin.map(angka)]) });
      ketentuan(y + 6);
    }
    if (isiPdf.irreg) {
      const irr = Object.entries(BIO_IRREG).filter(([u]) => !isiPdf.sembunyiTerjual || statusU(u) === 'Tersedia');
      if (irr.length) {
        if (hal++) doc.addPage();
        kop('IRREGULER');
        const cols = [{ h: 'No', w: 6 }, { h: 'Blok', w: 9 }, { h: 'No. Kav', w: 9 }, { h: 'Type', w: 9 }, { h: 'Keterangan', w: 15 }, { h: 'Sub-Type', w: 16 }, { h: 'Build (m2)', w: 10 }, { h: 'Land (m2)', w: 10 }, { h: 'Dimension (m)', w: 19 }, { h: 'View', w: 14 },
          { h: 'Harga Jual All In (Include PPN) (Rp)', w: 24, a: 'r' }, { h: 'Harga Jual (Rp)', w: 23, a: 'r' }, { h: 'Harga Jual All In (Rp)', w: 23, a: 'r' }, ...kolCicil(15)];
        const y = tabelPL(doc, { x0: M, y: 33, cols, groups: [{ from: 1, to: 2, h: 'UNIT' }, { from: 7, to: 8, h: 'LAND' }, { from: 11, to: 12, h: 'Harga Setelah Diskon' }, ...grupCicil(13)], hijau: [11, 12, 13, 14, 15, 16, 17, 18], fs: 6.6,
          rows: irr.map(([, x], i) => [i + 1, x.blok, x.kav, x.tipe, x.ketPpn, x.sub, x.lb, x.lt, x.dim, x.view, angka(x.inclPpn), angka(x.standar), angka(x.allin), ...x.cicil.map(angka), ...x.cicilAllin.map(angka)]) });
        ketentuan(y + 6);
      }
    }
    if (isiPdf.promo) {
      if (hal++) doc.addPage();
      kop('PROMO'); let y = 42;
      doc.setFillColor(226, 190, 122); doc.roundedRect(M, y, PW - 2 * M, 16, 3, 3, 'F'); doc.setFont('helvetica', 'bold'); doc.setFontSize(14); doc.setTextColor(20); doc.text(BIO_PROMO.judul, M + 6, y + 7);
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.text(BIO_PROMO.periode, M + 6, y + 12.5); y += 26;
      [['Tipe A Standar', BIO_PROMO.hadiah.A], ['Tipe B Standar', BIO_PROMO.hadiah.B], ['Tipe C Standar', BIO_PROMO.hadiah.C], ['Unit Corner B & C', BIO_PROMO.hadiah.corner.split(' — ')[0]]].forEach(([a, b]) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.text(a, M + 6, y); doc.setFont('helvetica', 'normal'); doc.text(b, M + 60, y); y += 9; });
    }
    if (isiPdf.siteplan) {
      if (hal++) doc.addPage();
      kop('KETERSEDIAAN UNIT · per ' + new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }));
      await siteplanHal(doc, PW, PH, M, 34);
    }
    return hal;
  }
  async function pdfPermai(doc) {
    const PW = 210, PH = 297, M = 14;
    const logo = await muatGambar('/logo-permai.png');
    const kop = () => { doc.addImage(logo.data, 'PNG', M, 8, 26 * logo.w / logo.h, 26); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(20); doc.text(PERMAI_PL.tanggal, PW - M, 30, { align: 'right' }); };
    let hal = 0;
    if (isiPdf.harga) {
      kop(); hal++;
      const cols = [{ h: 'Luas Bangunan (m2)', w: 18 }, { h: 'Luas Tanah (m2)', w: 16 }, { h: 'Harga', w: 22, a: 'r' }, { h: 'Booking Fee', w: 18, a: 'r' }, { h: 'Uang Muka', w: 18, a: 'r' }, { h: 'Plafon KPR', w: 22, a: 'r' },
        { h: '10 Tahun', w: 22, a: 'r' }, { h: '15 Tahun', w: 22, a: 'r' }, { h: '20 Tahun', w: 24, a: 'r' }];
      let y = tabelPL(doc, { x0: M, y: 42, cols, groups: [{ from: 6, to: 8, h: 'SIMULASI CICILAN KPR BTN SUBSIDI' }], hijau: [6, 7, 8], fs: 7.4,
        rows: [['22,5', '60', angka(PERMAI.harga), angka(PERMAI.bf), angka(PERMAI.um), angka(PERMAI.plafon), angka(PERMAI_PL.cicil[10]), angka(PERMAI_PL.cicil[15]), angka(PERMAI_PL.cicil[20])]] });
      y += 9;
      const blok = (judul, items, nomor = true) => { doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text(judul, M, y); y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(8.8);
        items.forEach((t, k) => { const ln = doc.splitTextToSize(t, PW - 2 * M - 7); ln.forEach((l, n) => { doc.text((n === 0 && nomor ? `${k + 1}.` : ''), M + 1, y); doc.text(l, M + 7, y); y += 4.3; }); }); y += 3.5; };
      blok('Harga Jual belum termasuk :', PERMAI_PL.belumTermasuk);
      blok('Syarat dan Ketentuan :', PERMAI_PL.syarat);
      blok('Persyaratan KPR :', PERMAI_PL.persyaratan);
      doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.text('Pembayaran Melalui:', M, y); y += 5; doc.setFont('helvetica', 'normal'); doc.setFontSize(9);
      doc.text(PERMAI_PL.rekening.bank, M, y); y += 4.5; doc.setFont('helvetica', 'bold'); doc.text(`${PERMAI_PL.rekening.no}  A/N ${PERMAI_PL.rekening.an}`, M, y);
    }
    if (isiPdf.siteplan) { if (hal++) doc.addPage(); kop(); doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.text('Siteplan', M, 42); await siteplanHal(doc, PW, PH, M, 46); }
    return hal;
  }
  async function buatPdf(bagikan) {
    setBusy(bagikan ? 'share' : 'pdf');
    try {
      const { jsPDF } = await import('jspdf');
      const doc = new jsPDF({ orientation: isBio ? 'landscape' : 'portrait', unit: 'mm', format: 'a4' });
      const n = isBio ? await pdfBio(doc) : await pdfPermai(doc);
      if (!n) return toast('Pilih minimal satu isi PDF');
      const nama = `PriceList_${namaRapi(proj).replace(/\s+/g, '')}_${new Date().toISOString().slice(0, 10)}.pdf`;
      catatUnduh('Price List', `PDF price list ${proj}${bagikan ? ' (bagikan)' : ''}`);
      if (bagikan && navigator.canShare) {
        const file = new File([doc.output('blob')], nama, { type: 'application/pdf' });
        if (navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: `Price List ${namaRapi(proj)}` }); return; }
      }
      doc.save(nama);
      if (bagikan) toast('Perangkat ini belum mendukung bagikan langsung — PDF diunduh, kirim lewat WhatsApp dari folder unduhan');
    } catch (e) { if (e?.name !== 'AbortError') toast(e.message); } finally { setBusy(''); }
  }

  if (!stok || !proj) return <div className="loading">Memuat price list…</div>;
  const rp = n => Number(n || 0).toLocaleString('id-ID');
  const opsi = isBio
    ? [['standar', 'Standart'], ['irreg', 'Irreguler'], ['sembunyiTerjual', 'Sembunyikan unit irreguler yang terjual'], ['promo', 'Halaman promo Grand Rewards'], ['siteplan', 'Siteplan ketersediaan']]
    : [['harga', 'Price list & syarat ketentuan'], ['siteplan', 'Siteplan']];
  return (
    <>
      <Toast />
      <div className="page-head"><div><h1>Price List</h1>
        <div className="sub">Price list resmi per project — unduh atau bagikan PDF dengan format price list yang berlaku
          {plv && !plv.bawaan ? <> · diperbarui {plv.oleh} {new Date(plv.waktu).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</> : null}</div></div>
        {me && ['manager', 'admin'].includes(me.role) && <Link href="/price-list/kelola" className="btn btn-primary">⬆ Update price list</Link>}</div>
      <div className="fu-toolbar" style={{ marginBottom: 12 }}>
        {(set.project || []).map(p => <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>)}
      </div>

      <div className="card pl-share">
        <div><b>Bagikan ke konsumen</b><div className="hint">PDF mengikuti price list resmi {isBio ? BIO_PL.tanggal : PERMAI_PL.tanggal}, tanpa nama pembeli atau data internal.</div></div>
        <div className="pl-cek">
          {opsi.map(([k, l]) => (<label key={k}><input type="checkbox" checked={!!isiPdf[k]} onChange={e => setIsiPdf({ ...isiPdf, [k]: e.target.checked })} /> {l}</label>))}
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!!busy} onClick={() => buatPdf(true)}>{busy === 'share' ? '⏳ Menyiapkan…' : '📤 Bagikan PDF'}</button>
          <button className="sort-btn" disabled={!!busy} onClick={() => buatPdf(false)}>{busy === 'pdf' ? '⏳…' : '⬇ Unduh PDF'}</button>
        </div>
      </div>

      {isBio ? (<>
        <div className="card pl-kop"><img src="/logo.png" alt="Cipta Harmoni Lestari" /><div className="pl-kop-t"><b>STANDART</b><span>{BIO_PL.tanggal}</span></div><img src="/logo-bio-hitam.png" alt="Bio District" className="pl-logo-bio" /></div>
        <div className="card"><div className="tbl-wrap tbl-compact pl-tbl"><table>
          <thead><tr><th rowSpan={2}>Type</th><th rowSpan={2}>Keterangan</th><th rowSpan={2}>Build (m²)</th><th colSpan={2}>Land</th><th rowSpan={2}>View</th><th rowSpan={2} className="num">Harga Jual All In (Include PPN)</th><th colSpan={2} className="pl-hijau">Harga Setelah Diskon</th><th colSpan={3} className="pl-hijau">Cicilan KPR {BIO_PL.bunga} — Harga Jual</th><th colSpan={3} className="pl-hijau">Cicilan KPR {BIO_PL.bunga} — All In</th><th rowSpan={2}>Tersedia</th></tr>
            <tr><th>m²</th><th>Dimensi</th><th className="num pl-hijau">Harga Jual</th><th className="num pl-hijau">Harga Jual All In</th>{[...BIO_PL.tenor, ...BIO_PL.tenor].map((t, i) => <th key={i} className="num pl-hijau">{t} th</th>)}</tr></thead>
          <tbody>{BIO_STANDAR.map(x => <tr key={x.tipe}><td><b>Tipe {x.tipe}</b><span className="sub2">{x.sub}</span></td><td style={{ whiteSpace: 'normal' }}>{x.ket}</td><td>{x.lb}</td><td>{x.lt}</td><td>{x.dim}</td><td>{x.view}</td><td className="num">{rp(x.inclPpn)}</td>
            <td className="num"><b>{rp(x.standar)}</b></td><td className="num"><b>{rp(x.allin)}</b></td>{[...x.cicil, ...x.cicilAllin].map((c, i) => <td key={i} className="num">{rp(c)}</td>)}
            <td><span className={'kp-pill sm ' + (perTipe[x.tipe].ada ? 'kp-ok' : 'kp-no')}>{perTipe[x.tipe].ada} unit</span></td></tr>)}</tbody></table></div>
          <p className="hint" style={{ margin: '6px 0 0' }}>Hadiah promo {BIO_PROMO.judul} ({BIO_PROMO.periode.split(' · ')[0]}): Tipe A {BIO_PROMO.hadiah.A} · Tipe B {BIO_PROMO.hadiah.B} · Tipe C {BIO_PROMO.hadiah.C} · corner B &amp; C {BIO_PROMO.hadiah.corner.split(' — ')[0]}.</p></div>
        <div className="card" style={{ marginTop: 12 }}><div className="bd-head"><h3 style={{ margin: 0 }}>IRREGULER</h3><span className="hint">{BIO_PL.tanggal}</span></div>
          <div className="tbl-wrap tbl-compact pl-tbl"><table>
            <thead><tr><th rowSpan={2}>Unit</th><th rowSpan={2}>Type</th><th rowSpan={2}>Build (m²)</th><th colSpan={2}>Land</th><th rowSpan={2}>View</th><th rowSpan={2} className="num">Harga Jual All In (Include PPN)</th><th colSpan={2} className="pl-hijau">Harga Setelah Diskon</th><th colSpan={3} className="pl-hijau">Cicilan KPR — Harga Jual</th><th colSpan={3} className="pl-hijau">Cicilan KPR — All In</th><th rowSpan={2}>Status</th></tr>
              <tr><th>m²</th><th>Dimensi</th><th className="num pl-hijau">Harga Jual</th><th className="num pl-hijau">All In</th>{[...BIO_PL.tenor, ...BIO_PL.tenor].map((t, i) => <th key={i} className="num pl-hijau">{t} th</th>)}</tr></thead>
            <tbody>{Object.entries(BIO_IRREG).map(([u, x]) => { const st = statusU(u); return (
              <tr key={u} style={st !== 'Tersedia' ? { opacity: 0.5 } : undefined}><td><b>{x.blok}-{x.kav}</b><span className="sub2">{x.sub}</span></td><td>{x.tipe}</td><td>{x.lb}</td><td>{x.lt}</td><td>{x.dim}</td><td>{x.view}</td><td className="num">{rp(x.inclPpn)}</td>
                <td className="num"><b>{rp(x.standar)}</b></td><td className="num"><b>{rp(x.allin)}</b></td>{[...x.cicil, ...x.cicilAllin].map((c, i) => <td key={i} className="num">{rp(c)}</td>)}
                <td><span className={'kp-pill sm ' + (st === 'Tersedia' ? 'kp-ok' : st === 'Reserved' ? 'kp-wait' : 'kp-no')}>{st}</span></td></tr>); })}</tbody></table></div></div>
        <div className="rp-grid2" style={{ marginTop: 12 }}>
          <div className="card"><h3 style={{ marginTop: 0 }}>Terms &amp; Conditions</h3>
            {BIO_PL.terms.map(([j, r], k) => <div key={k} style={{ marginBottom: 8 }}><b>{k + 1}. {j}</b>{r.map(([a, b, c]) => <div key={a} className="pl-term"><span>{a}</span><b>{b}</b><span className="hint">{c}</span></div>)}</div>)}
            <h4 style={{ margin: '12px 0 4px' }}>Pembayaran</h4><p className="hint" style={{ margin: 0 }}>{BIO_PL.rekening.judul}<br /><b style={{ color: 'var(--ink)' }}>{BIO_PL.rekening.bank} · {BIO_PL.rekening.no} · {BIO_PL.rekening.cabang}</b><br />Bank rekanan KPR: {BIO_PL.bankRekanan.join(' · ')}</p></div>
          <div className="card"><h3 style={{ marginTop: 0 }}>Catatan</h3><ol className="pl-ol">{BIO_PL.catatan.map(([j, t], k) => <li key={k}>{j ? <b>{j} </b> : null}{t}</li>)}</ol></div>
        </div>
      </>) : (<>
        <div className="card pl-kop"><img src="/logo-permai.png" alt="Permai Indah Cilejit" className="pl-logo-permai" /><div className="pl-kop-t" style={{ textAlign: 'right' }}><b>PRICE LIST</b><span>{PERMAI_PL.tanggal}</span></div></div>
        <div className="card"><div className="tbl-wrap tbl-compact pl-tbl"><table>
          <thead><tr><th rowSpan={2}>Luas Bangunan (m²)</th><th rowSpan={2}>Luas Tanah (m²)</th><th rowSpan={2} className="num">Harga</th><th rowSpan={2} className="num">Booking Fee</th><th rowSpan={2} className="num">Uang Muka</th><th rowSpan={2} className="num">Plafon KPR</th><th colSpan={3} className="pl-hijau">Simulasi Cicilan KPR BTN Subsidi</th></tr>
            <tr>{[10, 15, 20].map(t => <th key={t} className="num pl-hijau">{t} Tahun</th>)}</tr></thead>
          <tbody><tr><td>22,5</td><td>60</td><td className="num"><b>{rp(PERMAI.harga)}</b></td><td className="num">{rp(PERMAI.bf)}</td><td className="num">{rp(PERMAI.um)}</td><td className="num">{rp(PERMAI.plafon)}</td>{[10, 15, 20].map(t => <td key={t} className="num"><b>{rp(PERMAI_PL.cicil[t])}</b></td>)}</tr></tbody></table></div></div>
        <div className="rp-grid2" style={{ marginTop: 12 }}>
          <div className="card"><h3 style={{ marginTop: 0 }}>Syarat dan Ketentuan</h3><ol className="pl-ol">{PERMAI_PL.syarat.map((t, k) => <li key={k}>{t}</li>)}</ol>
            <h4 style={{ margin: '12px 0 4px' }}>Harga Jual belum termasuk</h4><ol className="pl-ol">{PERMAI_PL.belumTermasuk.map((t, k) => <li key={k}>{t}</li>)}</ol></div>
          <div className="card"><h3 style={{ marginTop: 0 }}>Persyaratan KPR</h3><ol className="pl-ol">{PERMAI_PL.persyaratan.map((t, k) => <li key={k}>{t}</li>)}</ol>
            <h4 style={{ margin: '12px 0 4px' }}>Pembayaran melalui</h4><p style={{ margin: 0 }}>{PERMAI_PL.rekening.bank}<br /><b>{PERMAI_PL.rekening.no}</b> · A/N {PERMAI_PL.rekening.an}</p></div>
        </div>
      </>)}

      <div className="card" style={{ marginTop: 12, display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <span className="hint">Butuh hitungan per konsumen (DP, cicilan, tenor)? Gunakan Simulasi Cara Bayar. Status unit detail ada di Master Stock.</span>
        <span style={{ display: 'inline-flex', gap: 8 }}><Link className="sort-btn" href="/kpr">🧮 Simulasi Cara Bayar</Link><Link className="sort-btn" href="/stock">🗺 Master Stock</Link></span>
      </div>
    </>
  );
}

// Tunggu price list versi terbaru dari database diterapkan sebelum halaman dirender
export default function PriceListPage() {
  const plv = usePriceList();
  if (!plv) return <div className="loading">Memuat price list…</div>;
  return <PriceListIsi plv={plv} />;
}
