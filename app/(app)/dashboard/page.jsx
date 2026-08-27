'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp, fmtDate, reminder } from '@/components/util';

const AKTIF = ['New', 'Cold', 'Warm', 'Hot', 'Appointment', 'Site Visit', 'Booking'];

export default function Dashboard() {
  const [lastUpd, setLastUpd] = useState(null);
  function muatSemua() {
    return Promise.all([api('/api/leads'), api('/api/followups'), api('/api/trx'), api('/api/settings'), api('/api/stock')])
      .then(([l, f, t, s, st]) => {
        setLeads(l); setFus(f); setTrx(t); setSet(s); setStock(st.status || []);
        setLastUpd(new Date());
      })
      .catch(e => toast(e.message));
  }
  const [leads, setLeads] = useState(null);
  const [fus, setFus] = useState([]);
  const [trx, setTrx] = useState([]);
  const [set, setSet] = useState({ status: [], project: [] });
  const [proj, setProj] = useState('');
  const [d1, setD1] = useState('');
  const [d2, setD2] = useState('');
  const [stock, setStock] = useState([]);
  const [srcPilih, setSrcPilih] = useState(''); // '' = semua, 'DM' = digital marketing, atau nama sumber

  useEffect(() => {
    muatSemua();
    // Dashboard selalu segar: refresh tiap 60 detik + setiap tab/aplikasi kembali dibuka
    const t = setInterval(muatSemua, 60 * 1000);
    const onVis = () => { if (document.visibilityState === 'visible') muatSemua(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('focus', onVis);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', onVis); window.removeEventListener('focus', onVis); };
  }, []);

  const fLeads = useMemo(() => proj ? (leads || []).filter(l => l.project === proj) : (leads || []), [leads, proj]);
  const codes = useMemo(() => new Set(fLeads.map(l => l.lead_code)), [fLeads]);
  const fFus = useMemo(() => proj ? fus.filter(f => codes.has(f.lead_code)) : fus, [fus, codes, proj]);
  const fTrx = useMemo(() => proj ? trx.filter(t => codes.has(t.lead_code)) : trx, [trx, codes, proj]);

  if (!leads) return <div className="loading">Memuat data dari database…</div>;

  // ===== Dashboard menampilkan BULAN BERJALAN: tanggal 1 s/d hari ini =====
  const nowD = new Date();
  const mStart = `${nowD.getFullYear()}-${String(nowD.getMonth() + 1).padStart(2, '0')}-01`;
  const inMonth = x => String(x || '').slice(0, 10) >= mStart;
  const mLeads = fLeads.filter(l => inMonth(l.tgl));
  const mTrx = fTrx.filter(t => inMonth(t.tgl));
  const bulanLabel = nowD.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' });

  const byStatus = st => mLeads.filter(l => l.status === st).length;
  // Reminder dari POSISI TERKINI tiap lead (leads.next_fu) — FU yang sudah di-update otomatis hilang dari overdue
  const rem = { OVERDUE: 0, 'HARI INI': 0, UPCOMING: 0 };
  fLeads.filter(l => !['Closing', 'Drop', 'Lost'].includes(l.status)).forEach(l => {
    const r = reminder(l.next_fu); if (r) rem[r[0]]++;
  });
  // Nilai: pipeline aktif = budget lead WARM & HOT bulan berjalan
  const pipeVal = mLeads.filter(l => l.status === 'Warm' || l.status === 'Hot').reduce((a, l) => a + Number(l.budget || 0), 0);
  const resVal = mTrx.filter(t => t.jenis === 'Reserved').reduce((a, t) => a + Number(t.nilai || 0), 0);
  const bookVal = mTrx.filter(t => t.jenis === 'Booking').reduce((a, t) => a + Number(t.nilai || 0), 0);
  const uniq = jenis => new Set(mTrx.filter(t => t.jenis === jenis).map(t => t.lead_code));
  const mResSet = uniq('Reserved'), mBookSet = uniq('Booking');
  // Baris pipeline: Site Visit = status + Walk In; Reserved & Booking dari TRANSAKSI; tanpa Closing
  const svNDash = mLeads.filter(l => l.status === 'Site Visit' || /walk/i.test(l.sumber || '')).length;
  const pipeRows = [];
  (set.status || []).forEach(st => {
    if (st === 'Booking' || st === 'Closing') return;
    if (st === 'Site Visit') pipeRows.push({ label: 'Site Visit', val: svNDash, cls: '', hint: '+ Walk In' });
    else pipeRows.push({ label: st, val: byStatus(st), cls: st === 'Hot' ? ' hot' : (st === 'Lost' || st === 'Drop') ? ' lost' : '' });
  });
  const dropIdx = pipeRows.findIndex(r => r.label === 'Drop' || r.label === 'Lost');
  const trxRows = [
    { label: 'Reserved', val: mResSet.size, cls: ' hot', hint: 'transaksi' },
    { label: 'Booking', val: mBookSet.size, cls: ' lost', hint: 'transaksi' },
  ];
  if (dropIdx >= 0) pipeRows.splice(dropIdx, 0, ...trxRows); else pipeRows.push(...trxRows);
  const max = Math.max(1, ...pipeRows.map(r => r.val));
  const salesNames = [...new Set(mLeads.map(l => l.sales).filter(Boolean))];
  // Grafik sumber lead bulan berjalan
  const srcCount = {};
  mLeads.forEach(l => { const k = l.sumber || 'Tidak diisi'; srcCount[k] = (srcCount[k] || 0) + 1; });
  const srcRows = Object.entries(srcCount).sort((a, b) => b[1] - a[1]);
  const srcMax = Math.max(1, ...srcRows.map(x => x[1]));
  const walkD = {};
  mLeads.filter(l => /walk/i.test(l.sumber || '') && l.walkin_info).forEach(l => { walkD[l.walkin_info] = (walkD[l.walkin_info] || 0) + 1; });
  const walkDStr = Object.entries(walkD).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');

  async function downloadExcel() {
    const ExcelJS = (await import('exceljs')).default;
    const dd = x => x ? new Date(x).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';
    const potong = (t, n) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };

    // ===== Pilihan aktif: project (filter atas) + periode (d1/d2) + sumber (dropdown) =====
    const DM = ['website', 'instagram', 'facebook ads', 'google ads', 'tiktok'];
    const cocokSumber = sm => {
      if (!srcPilih) return true;
      const v = String(sm || '').toLowerCase().trim();
      if (srcPilih === 'DM') return DM.includes(v);
      return v === srcPilih.toLowerCase();
    };
    const dlmPeriode = x => {
      const d = String(x || '').slice(0, 10);
      if (d1 && (!d || d < d1)) return false;
      if (d2 && (!d || d > d2)) return false;
      return true;
    };
    const cocokProj = pr => !proj || pr === proj;
    const leadSrcMap = {}; leads.forEach(l => { leadSrcMap[l.lead_code] = l.sumber || ''; });
    const cocokLead = l => cocokProj(l.project) && dlmPeriode(l.tgl) && cocokSumber(l.sumber);
    const cocokFU = f => cocokProj(f.project) && dlmPeriode(f.tgl) && cocokSumber(leadSrcMap[f.lead_code]);
    const cocokTrx = t => cocokProj(t.project) && dlmPeriode(t.tgl) && cocokSumber(leadSrcMap[t.lead_code]);

    const labelSrc = !srcPilih ? 'Semua Sumber' : srcPilih === 'DM' ? 'Digital Marketing (Website, Instagram, Facebook Ads, Google Ads, Tiktok)' : srcPilih;
    const labelPer = (d1 || d2) ? `${d1 ? dd(d1) : '…'} s/d ${d2 ? dd(d2) : '…'}` : 'Seluruh periode';
    const labelProj = proj || 'Semua Project';
    const subInfo = `Project: ${labelProj} · Periode: ${labelPer} · Sumber: ${labelSrc} — baris di luar pilihan tersembunyi (Data ▸ Clear Filter / Unhide utk menampilkan semua). · copyright © 2026 by Andriawanp`;

    const INK = 'FF1C2B23', GREEN = 'FF23694A', BRASS = 'FFC9922E', LINE = 'FFD8D6CC',
      ZEBRA = 'FFF5F4EF', WHITE = 'FFFFFFFF',
      AMBER_BG = 'FFFBF1DC', GREEN_BG = 'FFE4EFE8', RED_BG = 'FFF9E7E3';
    const STATUS_BG = { New: 'FFE5EEF6', Cold: 'FFE8EAEE', Warm: AMBER_BG, Hot: 'FFF6E3C0', Appointment: 'FFE5EEF6', 'Site Visit': 'FFE5EEF6', Booking: GREEN_BG, Closing: GREEN, Lost: RED_BG, Drop: RED_BG };
    const JENIS_BG = { Reserved: AMBER_BG, Booking: GREEN_BG, Closing: GREEN_BG, Batal: RED_BG };

    const wb = new ExcelJS.Workbook();
    wb.creator = 'CRM Sales CHL';
    const thin = { style: 'thin', color: { argb: LINE } };
    const border = { top: thin, left: thin, bottom: thin, right: thin };

    const buatSheet = (nama, judul, cols, rows, opsi = {}) => {
      const ws = wb.addWorksheet(nama, { views: [{ state: 'frozen', ySplit: 4 }] });
      ws.columns = cols.map(c => ({ width: c.w }));
      ws.mergeCells(1, 1, 1, cols.length);
      const t = ws.getCell(1, 1);
      t.value = judul;
      t.font = { name: 'Calibri', size: 15, bold: true, color: { argb: WHITE } };
      t.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
      t.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
      ws.getRow(1).height = 30;
      ws.mergeCells(2, 1, 2, cols.length);
      ws.getCell(2, 1).value = opsi.sub || subInfo;
      ws.getCell(2, 1).font = { size: 9, color: { argb: 'FF6B7A70' } };
      ws.getRow(3).height = 4;
      const hr = ws.getRow(4);
      cols.forEach((c, i2) => {
        const cell = hr.getCell(i2 + 1);
        cell.value = c.h;
        cell.font = { bold: true, size: 10, color: { argb: WHITE } };
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
        cell.alignment = { vertical: 'middle', horizontal: c.num ? 'right' : 'left', wrapText: true };
        cell.border = { top: thin, left: thin, right: thin, bottom: { style: 'medium', color: { argb: BRASS } } };
      });
      hr.height = 22;
      let tampak = 0;
      rows.forEach((r, ri) => {
        const row = ws.getRow(5 + ri);
        const cocok = !opsi.cocok || opsi.cocok(r._raw);
        if (!cocok) row.hidden = true; else tampak++;
        cols.forEach((c, ci) => {
          const cell = row.getCell(ci + 1);
          cell.value = r[c.k];
          cell.font = { size: 10 };
          cell.alignment = { vertical: 'top', horizontal: c.num ? 'right' : 'left', wrapText: !!c.wrap };
          if (c.num) cell.numFmt = '#,##0';
          cell.border = border;
          if (ri % 2 === 1) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } };
          if (opsi.warnaSel) {
            const bg = opsi.warnaSel(c, r);
            if (bg) {
              cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bg } };
              cell.font = bg === GREEN ? { size: 10, bold: true, color: { argb: WHITE } } : { size: 10, bold: true };
            }
          }
        });
      });
      if (!rows.length) { ws.getCell(5, 2).value = 'Belum ada data.'; ws.getCell(5, 2).font = { italic: true, color: { argb: 'FF6B7A70' } }; }
      ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + Math.max(rows.length, 1), column: cols.length } };
      return { ws, tampak };
    };

    // ===== Data terpilih utk Ringkasan =====
    const pl = leads.filter(cocokLead);
    const pf = fus.filter(cocokFU);
    const pt = trx.filter(cocokTrx);
    const lastFU = {};
    fus.forEach(f => {
      const key = f.lead_code, cur = lastFU[key];
      const rank = String(f.tgl || '').slice(0, 10) + String(f.id).padStart(9, '0');
      if (!cur || rank > cur._rank) lastFU[key] = { ...f, _rank: rank };
    });

    // ===== Sheet data (baris di luar pilihan disembunyikan) =====
    buatSheet('Database Lead', 'DATABASE LEAD', [
      { h: 'ID Lead', k: 'id', w: 11 }, { h: 'Tanggal', k: 'tgl', w: 11 },
      { h: 'Nama', k: 'nama', w: 20 }, { h: 'WhatsApp', k: 'wa', w: 13 }, { h: 'Email', k: 'email', w: 18 },
      { h: 'Domisili', k: 'dom', w: 13 }, { h: 'Sumber', k: 'src', w: 14 }, { h: 'Info Walk In', k: 'wi', w: 14 },
      { h: 'Project', k: 'proj', w: 15 }, { h: 'Tipe', k: 'tipe', w: 9 }, { h: 'Budget (Rp)', k: 'budget', w: 13, num: true },
      { h: 'Cara Bayar', k: 'bayar', w: 10 }, { h: 'Sales', k: 'sales', w: 11 }, { h: 'Status', k: 'status', w: 10 },
      { h: 'Next FU', k: 'nfu', w: 10 }, { h: 'Tgl FU Terakhir', k: 'futgl', w: 12 },
      { h: 'Update FU Terakhir', k: 'fuupd', w: 34, wrap: true }, { h: 'Catatan', k: 'cat', w: 22, wrap: true },
    ], leads.map(l => {
      const lf = lastFU[l.lead_code];
      return {
        _raw: l,
        id: l.lead_code, tgl: dd(l.tgl), nama: l.nama, wa: l.wa || '', email: l.email || '',
        dom: l.domisili || '', src: l.sumber || 'Tidak diisi', wi: l.walkin_info || '', proj: l.project || '-',
        tipe: l.tipe || '', budget: Number(l.budget) || 0, bayar: l.bayar || '', sales: l.sales || '',
        status: l.status, nfu: dd(l.next_fu),
        futgl: lf ? dd(lf.tgl) : '', fuupd: lf ? potong(lf.detail, 180) : 'Belum ada follow up',
        cat: l.catatan || '',
      };
    }), { cocok: cocokLead, warnaSel: (c, r) => c.k === 'status' ? STATUS_BG[r.status] : (c.k === 'fuupd' && r.fuupd === 'Belum ada follow up' ? RED_BG : null) });

    buatSheet('Follow Up', 'RIWAYAT FOLLOW UP', [
      { h: 'Tanggal', k: 'tgl', w: 11 }, { h: 'ID Lead', k: 'id', w: 11 },
      { h: 'Nama', k: 'nama', w: 18 }, { h: 'Sales', k: 'sales', w: 11 }, { h: 'Project', k: 'proj', w: 15 },
      { h: 'Sumber', k: 'src', w: 13 },
      { h: 'Detail Komunikasi', k: 'det', w: 40, wrap: true }, { h: 'Objection', k: 'obj', w: 22, wrap: true },
      { h: 'Next Action', k: 'na', w: 15 }, { h: 'Tgl Next FU', k: 'nfu', w: 11 },
    ], fus.map(f => ({
      _raw: f,
      tgl: dd(f.tgl), id: f.lead_code, nama: f.nama || '', sales: f.sales || '',
      proj: f.project || '-', src: leadSrcMap[f.lead_code] || '', det: f.detail, obj: f.objection || '',
      na: f.next_action || '', nfu: dd(f.next_tgl),
    })), { cocok: cocokFU, warnaSel: (c, r) => c.k === 'na' && r.na === 'Drop' ? RED_BG : null });

    buatSheet('Transaksi', 'TRANSAKSI (RESERVED · BOOKING · BATAL)', [
      { h: 'Tanggal', k: 'tgl', w: 11 }, { h: 'ID Lead', k: 'id', w: 11 },
      { h: 'Nama', k: 'nama', w: 18 }, { h: 'Sales', k: 'sales', w: 11 }, { h: 'Project', k: 'proj', w: 15 },
      { h: 'Sumber', k: 'src', w: 13 },
      { h: 'Blok/Unit', k: 'unit', w: 15 }, { h: 'Jenis', k: 'jenis', w: 10 }, { h: 'Nilai (Rp)', k: 'nilai', w: 15, num: true },
      { h: 'Cara Bayar', k: 'bayar', w: 10 }, { h: 'Catatan', k: 'cat', w: 22, wrap: true },
    ], trx.map(t => ({
      _raw: t,
      tgl: dd(t.tgl), id: t.lead_code, nama: t.nama || '', sales: t.sales || '',
      proj: t.project || '-', src: leadSrcMap[t.lead_code] || '', unit: t.unit || '', jenis: t.jenis,
      nilai: Number(t.nilai) || 0, bayar: t.bayar || '', cat: t.catatan || '',
    })), { cocok: cocokTrx, warnaSel: (c, r) => c.k === 'jenis' ? JENIS_BG[r.jenis] : null });

    // ===== RINGKASAN (angka & grafik dari data terpilih) =====
    const rs = wb.addWorksheet('Ringkasan', { views: [{ showGridLines: false }] });
    rs.columns = [{ width: 2 }, { width: 26 }, { width: 11 }, { width: 30 }, { width: 22 }, { width: 8 }, { width: 2 }];
    rs.mergeCells('A1:G1');
    rs.getCell('A1').value = 'REPORT CRM SALES — CIPTA HARMONI LESTARI';
    rs.getCell('A1').font = { size: 16, bold: true, color: { argb: WHITE } };
    rs.getCell('A1').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: INK } };
    rs.getCell('A1').alignment = { vertical: 'middle', indent: 1 };
    rs.getRow(1).height = 34;
    rs.mergeCells('A2:G2');
    rs.getCell('A2').value = 'Diunduh ' + dd(new Date().toISOString()) + ' · ' + subInfo;
    rs.getCell('A2').font = { size: 9, color: { argb: 'FF6B7A70' } };

    let R = 4;
    const secHead = txt => {
      rs.mergeCells(R, 2, R, 6);
      const c = rs.getCell(R, 2);
      c.value = txt; c.font = { bold: true, size: 11, color: { argb: WHITE } };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } };
      c.alignment = { indent: 1 }; R++;
    };
    const bar = (n, mx, warna) => ({ richText: [{ text: '▰'.repeat(Math.max(n > 0 ? 1 : 0, Math.round(n / Math.max(1, mx) * 15))), font: { color: { argb: warna || GREEN }, bold: true } }] });
    const rp2 = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');

    const resSet = new Set(pt.filter(t => t.jenis === 'Reserved').map(t => t.lead_code));
    const bookSet = new Set(pt.filter(t => t.jenis === 'Booking').map(t => t.lead_code));
    const resV = pt.filter(t => t.jenis === 'Reserved').reduce((a, t) => a + Number(t.nilai || 0), 0);
    const bookV = pt.filter(t => t.jenis === 'Booking').reduce((a, t) => a + Number(t.nilai || 0), 0);

    secHead('RINGKASAN');
    [['Lead Masuk', pl.length, ''], ['Follow Up', pf.length, ''],
     ['Reserved (lead)', resSet.size, 'Nilai: ' + rp2(resV)], ['Booking (lead)', bookSet.size, 'Nilai: ' + rp2(bookV)]]
      .forEach((k, i2) => {
        const row = rs.getRow(R);
        row.getCell(2).value = k[0]; row.getCell(2).font = { bold: true };
        row.getCell(3).value = k[1]; row.getCell(3).font = { bold: true, size: 13, color: { argb: i2 >= 2 ? BRASS : GREEN } }; row.getCell(3).alignment = { horizontal: 'center' };
        rs.mergeCells(R, 4, R, 5); row.getCell(4).value = k[2]; row.getCell(4).font = { size: 10, color: { argb: 'FF6B7A70' } };
        [2, 3, 4, 5, 6].forEach(ci => { row.getCell(ci).border = border; if (i2 % 2 === 1) row.getCell(ci).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ZEBRA } }; });
        R++;
      });
    R++;

    secHead('RESERVED & BOOKING');
    const rbMax = Math.max(resSet.size, bookSet.size);
    [['Reserved', resSet.size, resV, BRASS], ['Booking', bookSet.size, bookV, 'FFB3402F']].forEach(([j, n, v, w]) => {
      const row = rs.getRow(R);
      row.getCell(2).value = j; row.getCell(2).font = { bold: true };
      row.getCell(3).value = n; row.getCell(3).alignment = { horizontal: 'center' };
      row.getCell(4).value = bar(n, rbMax, w);
      row.getCell(5).value = rp2(v);
      [2, 3, 4, 5, 6].forEach(ci => row.getCell(ci).border = border);
      R++;
    });
    R++;

    const seksi = (judul, entries) => {
      if (!entries.length) return;
      secHead(judul);
      const mx = Math.max(1, ...entries.map(x => x[1]));
      const tot = entries.reduce((a, x) => a + x[1], 0);
      entries.forEach(([k, v]) => {
        const row = rs.getRow(R);
        row.getCell(2).value = k;
        row.getCell(3).value = v; row.getCell(3).alignment = { horizontal: 'center' };
        row.getCell(4).value = bar(v, mx);
        row.getCell(5).value = Math.round(v / tot * 100) + '%'; row.getCell(5).alignment = { horizontal: 'center' };
        [2, 3, 4, 5, 6].forEach(ci => row.getCell(ci).border = border);
        R++;
      });
      R++;
    };
    const hitung = (arr, fn) => Object.entries(arr.reduce((a, x) => { const k = (fn(x) || '').trim(); if (k) a[k] = (a[k] || 0) + 1; return a; }, {})).sort((a, b) => b[1] - a[1]).slice(0, 12);
    seksi('SUMBER LEAD', hitung(pl, l => l.sumber || 'Tidak diisi'));
    seksi('SUMBER VISIT (LEAD YANG SUDAH DATANG)', hitung(pl, l => /walk/i.test(l.sumber || '') ? (l.walkin_info || 'Walk In (tanpa info)') : (l.status === 'Site Visit' ? (l.sumber || 'Tidak diisi') : '')));
    seksi('DOMISILI (TOP 12)', hitung(pl, l => l.domisili));

    // ===== Sheet Stok (posisi terkini) =====
    const lastVal2 = {};
    [...trx].sort((a, b) => a.id - b.id).forEach(t => {
      if (!t.unit || !t.project) return;
      const key = t.project + '|' + t.unit;
      if (t.jenis === 'Batal') delete lastVal2[key]; else lastVal2[key] = Number(t.nilai) || 0;
    });
    buatSheet('Stok', 'STOK & NILAI PENJUALAN PER PROJECT', [
      { h: 'Project', k: 'p', w: 18 }, { h: 'Total Stok', k: 'tot', w: 11, num: true },
      { h: 'Terjual', k: 'jual', w: 10, num: true }, { h: 'Reserved', k: 'res', w: 10, num: true },
      { h: 'Tersedia', k: 'sisa', w: 10, num: true }, { h: '% Terjual', k: 'pct', w: 10 },
      { h: 'Nilai Penjualan (Rp)', k: 'nj', w: 19, num: true }, { h: 'Nilai Reserved (Rp)', k: 'nr', w: 19, num: true },
    ], (set.project || []).map(p2 => {
      const total = ((set.units || {})[p2] || []).length;
      const su = stock.filter(u => u.project === p2);
      const mer = su.filter(u => u.warna === 'merah'), kun = su.filter(u => u.warna === 'kuning');
      return {
        p: p2, tot: total, jual: mer.length, res: kun.length,
        sisa: Math.max(0, total - mer.length - kun.length),
        pct: total ? Math.round(mer.length / total * 100) + '%' : '-',
        nj: mer.reduce((a, u) => a + (lastVal2[p2 + '|' + u.unit] || 0), 0),
        nr: kun.reduce((a, u) => a + (lastVal2[p2 + '|' + u.unit] || 0), 0),
      };
    }), { sub: 'Posisi stok per hari ini (transaksi + penandaan manual Master Stock) — tidak terpengaruh filter. · copyright © 2026 by Andriawanp' });

    // Ringkasan di urutan pertama
    const idx = wb.worksheets.findIndex(w2 => w2.name === 'Ringkasan');
    wb.worksheets.splice(0, 0, wb.worksheets.splice(idx, 1)[0]);

    const buf = await wb.xlsx.writeBuffer();
    const blob = new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'CRM_CHL_Data.xlsx';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  async function downloadWord() {
    // Ambil logo sebagai base64 agar tertanam di dokumen Word
    let logoTag = '';
    try {
      const blob = await fetch('/icon-192.png').then(r => r.blob());
      const dataUrl = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(blob); });
      logoTag = `<img src="${dataUrl}" width="72" height="72" style="border-radius:12px" alt="CHL"/>`;
    } catch {}
    const inPeriod = t => {
      if (!t) return !d1 && !d2;
      const x = String(t).slice(0, 10);
      return (!d1 || x >= d1) && (!d2 || x <= d2);
    };
    const pl = fLeads.filter(l => inPeriod(l.tgl));
    const pf = fFus.filter(f => inPeriod(f.tgl));
    const pt = fTrx.filter(t => inPeriod(t.tgl));
    const projLabel = proj || 'Semua Project';
    const ST = set.status || [];
    const cnt = st => pl.filter(l => l.status === st).length;
    // Booking & Closing dihitung dari TRANSAKSI yang benar-benar diinput (lead unik), bukan dari status pipeline
    const salesOf = {}; leads.forEach(l => { salesOf[l.lead_code] = l.sales; });
    const trxLeads = jenis => new Set(pt.filter(t => t.jenis === jenis).map(t => t.lead_code));
    const bookSet = trxLeads('Booking'), resSet = trxLeads('Reserved');
    const bookV = pt.filter(t => t.jenis === 'Booking').reduce((a, t) => a + Number(t.nilai || 0), 0);
    const resV = pt.filter(t => t.jenis === 'Reserved').reduce((a, t) => a + Number(t.nilai || 0), 0);
    // Site Visit pipeline = status Site Visit + lead Walk In (sudah datang langsung)
    const svN = pl.filter(l => l.status === 'Site Visit' || /walk/i.test(l.sumber || '')).length;
    // Sebaran sumber lead
    const bySumber = {};
    pl.forEach(l => { const k = l.sumber || 'Tidak diisi'; bySumber[k] = (bySumber[k] || 0) + 1; });
    const sumberRows = Object.entries(bySumber).sort((a, b) => b[1] - a[1]);
    const maxS = Math.max(1, ...sumberRows.map(x => x[1]));
    const bar = n => '<span style="color:#23694A;letter-spacing:1px">' + '▰'.repeat(Math.max(1, Math.round(n / maxS * 16))) + '</span>';
    const byWalk = {};
    pl.filter(l => /walk/i.test(l.sumber || '') && l.walkin_info).forEach(l => { byWalk[l.walkin_info] = (byWalk[l.walkin_info] || 0) + 1; });
    const walkDetail = Object.entries(byWalk).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} ${v}`).join(', ');
    const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
    const dd = x => x ? new Date(x).toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric' }) : '';
    const periode = (d1 || d2) ? `${dd(d1) || 'awal'} s/d ${dd(d2) || 'sekarang'}` : 'Seluruh data';
    // Hanya sales yang punya lead pada project & periode terpilih — yang lain tidak dimunculkan
    const salesNs = [...new Set(pl.map(l => l.sales).filter(Boolean))]
      .filter(sn => pl.some(l => l.sales === sn));
    const esc = t => String(t || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // Rekomendasi: seluruh lead yang SAAT INI Warm/Hot (prioritas tindak lanjut)
    const now = new Date(); now.setHours(0, 0, 0, 0);
    const trxByLead = {};
    [...fTrx].sort((a, b) => a.id - b.id).forEach(t => { trxByLead[t.lead_code] = { jenis: t.jenis, unit: t.unit || '', tgl: t.tgl }; });
    const recos = fLeads.filter(l => l.status === 'Warm' || l.status === 'Hot')
      .map(l => {
        const myFus = fus.filter(f => f.lead_code === l.lead_code)
          .sort((a, b) => String(a.tgl).localeCompare(String(b.tgl)) || a.id - b.id);
        const last = myFus[myFus.length - 1];
        const nfu = l.next_fu || (last && last.next_tgl) || null;
        const overdue = nfu && new Date(nfu) < now;
        return { ...l, last, myFus, nfu, overdue, deal: trxByLead[l.lead_code] || null };
      })
      .sort((a, b) => (b.status === 'Hot') - (a.status === 'Hot') || (b.overdue === true) - (a.overdue === true));

    // ===== Rekap stok per project (kondisi saat ini: transaksi + manual) =====
    // Nilai per unit = transaksi terakhir non-Batal unit tsb
    const lastVal = {};
    [...trx].sort((a, b) => a.id - b.id).forEach(t => {
      if (!t.unit || !t.project) return;
      const key = t.project + '|' + t.unit;
      if (t.jenis === 'Batal') delete lastVal[key];
      else lastVal[key] = Number(t.nilai) || 0;
    });
    const projList = proj ? [proj] : (set.project || []);
    const stokRows = projList.map(p2 => {
      const total = ((set.units || {})[p2] || []).length;
      const su = stock.filter(u => u.project === p2);
      const merahU = su.filter(u => u.warna === 'merah');
      const kuningU = su.filter(u => u.warna === 'kuning');
      const nJual = merahU.reduce((a, u) => a + (lastVal[p2 + '|' + u.unit] || 0), 0);
      const nRes = kuningU.reduce((a, u) => a + (lastVal[p2 + '|' + u.unit] || 0), 0);
      return { p: p2, total, merah: merahU.length, kuning: kuningU.length, nJual, nRes };
    });

    const html = `<html xmlns:w="urn:schemas-microsoft-com:office:word"><head><meta charset="utf-8"><title>Report CRM</title>
<style>
body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#1C2B23}
h1{font-size:20pt;color:#23694A;margin:0} h2{font-size:13pt;color:#23694A;border-bottom:2px solid #C9922E;padding-bottom:4px;margin-top:24px}
table{border-collapse:collapse;width:100%;font-size:10pt} th{background:#1C2B23;color:#fff;padding:6px 8px;text-align:left}
td{border:1px solid #D8D6CC;padding:5px 8px;vertical-align:top}
.hot{background:#F6E3C0} .warm{background:#FBF1DC}
.badge-over{color:#B3402F;font-weight:bold} .muted{color:#6B7A70}
.kpi{display:inline-block;border:1px solid #D8D6CC;padding:8px 16px;margin:4px 8px 4px 0}
.kpi b{font-size:16pt;color:#23694A}
</style></head><body>
<table style="border:none;width:100%"><tr>
<td style="border:none;width:84px;vertical-align:middle">${logoTag}</td>
<td style="border:none;vertical-align:middle">
<p style="letter-spacing:3px;color:#C9922E;font-weight:bold;margin:0">CIPTA HARMONI LESTARI</p>
<h1>REPORT CRM SALES</h1>
</td></tr></table>
<p class="muted">Project: <b>${esc(projLabel)}</b> &nbsp;|&nbsp; Periode: <b>${esc(periode)}</b> &nbsp;|&nbsp; Dibuat: ${dd(new Date().toISOString())} &nbsp;|&nbsp; Sumber: crm-sales-chl.vercel.app</p>

<h2>1. RINGKASAN EKSEKUTIF</h2>
<table>
<tr><th style="text-align:center">LEAD MASUK</th><th style="text-align:center">FOLLOW UP</th><th style="text-align:center">RESERVED</th><th style="text-align:center">BOOKING</th></tr>
<tr>
<td style="text-align:center;font-size:20pt;font-weight:bold;color:#23694A">${pl.length}</td>
<td style="text-align:center;font-size:20pt;font-weight:bold;color:#23694A">${pf.length}</td>
<td style="text-align:center;font-size:20pt;font-weight:bold;color:#C9922E">${resSet.size}</td>
<td style="text-align:center;font-size:20pt;font-weight:bold;color:#B3402F">${bookSet.size}</td>
</tr>
<tr class="muted">
<td style="text-align:center">lead baru pada periode</td>
<td style="text-align:center">aktivitas follow up</td>
<td style="text-align:center">Nilai: <b>${rp(resV)}</b></td>
<td style="text-align:center">Nilai: <b>${rp(bookV)}</b></td>
</tr>
</table>

<h3 style="color:#23694A;margin-top:14px;margin-bottom:4px">Sebaran Sumber Lead (${pl.length} lead)</h3>
<table><tr><th>Sumber</th><th style="width:60px">Jumlah</th><th style="width:60px">%</th><th>Grafik</th></tr>
${sumberRows.length ? sumberRows.map(([k, v]) => `<tr><td>${esc(k)}${/walk/i.test(k) && walkDetail ? '<br/><span class="muted" style="font-size:8.5pt">via: ' + esc(walkDetail) + '</span>' : ''}</td><td style="text-align:center"><b>${v}</b></td><td style="text-align:center">${Math.round(v / Math.max(1, pl.length) * 100)}%</td><td>${bar(v)}</td></tr>`).join('') : '<tr><td colspan="4">Tidak ada lead pada periode ini.</td></tr>'}
</table>

<h3 style="color:#23694A;margin-top:14px;margin-bottom:4px">Reserved &amp; Booking</h3>
<table><tr><th>Jenis</th><th style="width:60px">Jumlah</th><th>Grafik</th><th style="width:150px">Nilai</th></tr>
${(() => {
      const rbMax = Math.max(1, resSet.size, bookSet.size);
      const bar2 = (n, warna) => '<span style="color:' + warna + ';letter-spacing:1px">' + '▰'.repeat(Math.max(n > 0 ? 1 : 0, Math.round(n / rbMax * 16))) + '</span>';
      return `<tr><td><b>Reserved</b></td><td style="text-align:center"><b>${resSet.size}</b></td><td>${bar2(resSet.size, '#C9922E')}</td><td>${rp(resV)}</td></tr>
<tr><td><b>Booking</b></td><td style="text-align:center"><b>${bookSet.size}</b></td><td>${bar2(bookSet.size, '#B3402F')}</td><td>${rp(bookV)}</td></tr>`;
    })()}
</table>

${(() => {
      // Sumber Visit = lead yang sudah DATANG: Walk In (label = info tahu dari mana) + status Site Visit dari sumber mana pun (label = sumbernya)
      const byVisit = {};
      pl.forEach(l => {
        let label = null;
        if (/walk/i.test(l.sumber || '')) label = l.walkin_info || 'Walk In (tanpa info)';
        else if (l.status === 'Site Visit') label = l.sumber || 'Tidak diisi';
        if (label) byVisit[label] = (byVisit[label] || 0) + 1;
      });
      const vRows = Object.entries(byVisit).sort((a, b) => b[1] - a[1]);
      if (!vRows.length) return '';
      const vMax = Math.max(1, ...vRows.map(x => x[1]));
      const vTot = vRows.reduce((a, x) => a + x[1], 0);
      return `<h3 style="color:#23694A;margin-top:14px;margin-bottom:4px">Sumber Visit — asal lead yang sudah datang (${vTot} lead)</h3>
<table><tr><th>Sumber</th><th style="width:60px">Jumlah</th><th style="width:60px">%</th><th>Grafik</th></tr>
${vRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:center"><b>${v}</b></td><td style="text-align:center">${Math.round(v / vTot * 100)}%</td><td><span style="color:#C9922E;letter-spacing:1px">${'▰'.repeat(Math.max(1, Math.round(v / vMax * 16)))}</span></td></tr>`).join('')}
</table>
<p class="muted" style="font-size:8.5pt">Walk In dihitung dari info "tahu dari mana"; lead sumber lain dihitung bila sudah mencapai Site Visit.</p>`;
    })()}

${(() => {
      const byDom = {};
      pl.forEach(l => { const k = (l.domisili || '').trim(); if (k) byDom[k] = (byDom[k] || 0) + 1; });
      const domRows = Object.entries(byDom).sort((a, b) => b[1] - a[1]).slice(0, 12);
      if (!domRows.length) return '';
      const dMax = Math.max(1, ...domRows.map(x => x[1]));
      const dTot = domRows.reduce((a, x) => a + x[1], 0);
      return `<h3 style="color:#23694A;margin-top:14px;margin-bottom:4px">Domisili Lead (Top ${domRows.length})</h3>
<table><tr><th>Domisili</th><th style="width:60px">Jumlah</th><th style="width:60px">%</th><th>Grafik</th></tr>
${domRows.map(([k, v]) => `<tr><td>${esc(k)}</td><td style="text-align:center"><b>${v}</b></td><td style="text-align:center">${Math.round(v / dTot * 100)}%</td><td><span style="color:#23694A;letter-spacing:1px">${'▰'.repeat(Math.max(1, Math.round(v / dMax * 16)))}</span></td></tr>`).join('')}
</table>`;
    })()}

<h2>2. STATUS PIPELINE (posisi status lead saat ini; Reserved &amp; Booking dilaporkan dari transaksi pada Ringkasan)</h2>
<table><tr><th>Status</th><th>Jumlah</th></tr>
${ST.filter(st => st !== 'Booking' && st !== 'Closing').map(st => {
      const val = st === 'Site Visit' ? svN : cnt(st);
      const note = st === 'Site Visit' ? ' <span class="muted" style="font-size:8.5pt">(status Site Visit + lead Walk In)</span>' : '';
      return `<tr${st === 'Hot' ? ' class="hot"' : st === 'Warm' ? ' class="warm"' : ''}><td>${st}${note}</td><td>${val}</td></tr>`;
    }).join('')}
</table>

<h2>3. KINERJA PER SALES (lead masuk pada periode)</h2>
<table><tr><th>Sales / PIC</th><th style="text-align:center">Total Lead</th><th style="text-align:center">Reserved</th><th style="text-align:center">Booking</th><th style="text-align:center">Closing Rate</th></tr>
${salesNs.length ? salesNs.map(sn => {
      const mine = pl.filter(l => l.sales === sn);
      const rs = [...resSet].filter(code => salesOf[code] === sn).length;
      const bk = [...bookSet].filter(code => salesOf[code] === sn).length;
      return `<tr><td><b>${esc(sn)}</b></td><td style="text-align:center">${mine.length}</td><td style="text-align:center">${rs}</td><td style="text-align:center"><b>${bk}</b></td><td style="text-align:center"><b>${mine.length ? Math.round(bk / mine.length * 100) + '%' : '0%'}</b></td></tr>`;
    }).join('') : '<tr><td colspan="5">Tidak ada data pada periode ini.</td></tr>'}
</table>
<p class="muted" style="font-size:8.5pt">Closing Rate = jumlah lead yang mencapai Booking ÷ total lead sales tsb pada periode.</p>

<h2>4. REKOMENDASI FOLLOW UP — PRIORITAS WARM &amp; HOT</h2>
<p class="muted">Analisa per lead diarahkan ke Booking. Perilaku konsumen properti saat ini: membandingkan 3–5 proyek sekaligus secara online, memutuskan berdasarkan besaran angsuran (bukan harga total), dan menghargai kecepatan respon — lead yang direspon &lt; 1 jam berpeluang konversi jauh lebih tinggi.</p>
<table><tr><th style="width:70px">Prioritas</th><th>Lead</th><th style="width:32%">Summary Hasil Follow Up</th><th>Analisa &amp; Rekomendasi Menuju Booking</th></tr>
${recos.length ? recos.map(l => {
      const obj = ((l.last && l.last.objection) || '').toLowerCase();
      const dsD = x => x ? new Date(x).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '';
      const aksi = [];
      if (l.overdue) aksi.push('<b>Jadwal FU sudah lewat</b> — hubungi hari ini; tiap hari tertunda, lead dibanding-bandingkan dengan proyek kompetitor.');
      if (!l.last) aksi.push('<b>Belum pernah di-follow up</b> — kontak hari ini juga; respon pertama yang cepat adalah penentu terbesar konversi.');
      // Analisa berbasis posisi transaksi lead saat ini
      if (l.deal && l.deal.jenis === 'Reserved') {
        aksi.push(`Sudah <b>RESERVED</b>${l.deal.unit ? ' unit <b>' + esc(l.deal.unit) + '</b>' : ''} (${dsD(l.deal.tgl)}) — fase kritis: fokus naikkan ke <b>Booking</b>. Lengkapi berkas, tetapkan tanggal pelunasan booking fee, dan ingatkan masa berlaku reservasi agar unit tidak dilepas.`);
      } else if (l.deal && l.deal.jenis === 'Booking') {
        aksi.push(`Sudah <b>BOOKING</b>${l.deal.unit ? ' unit <b>' + esc(l.deal.unit) + '</b>' : ''} (${dsD(l.deal.tgl)}) — kawal administrasi: pelunasan sesuai skema bayar, kelengkapan dokumen KPR bila kredit, dan jaga komunikasi agar tidak berujung pembatalan.`);
      } else if (l.deal && l.deal.jenis === 'Batal') {
        aksi.push(`Pernah <b>membatalkan</b> transaksi${l.deal.unit ? ' unit ' + esc(l.deal.unit) : ''} (${dsD(l.deal.tgl)}) — gali alasan pembatalannya terlebih dahulu, lalu tawarkan alternatif unit/skema pembayaran yang menjawab alasan tersebut; lead yang pernah bertransaksi tetap prospek terbaik.`);
      } else if (l.status === 'Hot') {
        aksi.push('Belum ada transaksi: tawarkan <b>Reserved dengan tanda jadi ringan</b> untuk mengunci unit pilihannya — tunjukkan peta stok terkini sebagai bukti unit favorit cepat habis, lalu jadwalkan pelunasan booking fee.');
      } else {
        aksi.push('Belum ada transaksi: bangun urgensi bertahap — kirim materi bernilai (progress pembangunan, foto unit, testimoni) dan tutup setiap kontak dengan ajakan konkret: jadwal visit atau reservasi, bukan sekadar menanyakan kabar.');
      }
      if (/harga|mahal|budget|dana|dp|cicil/.test(obj)) aksi.push('Objection harga: siapkan <b>2 simulasi angsuran</b> (DP dicicil vs tenor berbeda) dan alternatif tipe yang lebih terjangkau — geser pembicaraan dari harga total ke angsuran bulanan.');
      if (/pikir|diskusi|keluarga|istri|suami|orang tua/.test(obj)) aksi.push('Menunggu keputusan keluarga: undang <b>site visit bersama pengambil keputusan</b> di akhir pekan + beri tenggat promo agar keputusan tidak menggantung.');
      if (/lokasi|jauh|akses|banjir/.test(obj)) aksi.push('Keberatan lokasi: kirim peta akses &amp; waktu tempuh riil ke titik penting (tol, sekolah, pasar) dan tonjolkan fasilitas kawasan sebagai kompensasi jarak.');
      if (/walk/i.test(l.sumber || '')) aksi.push('Sudah pernah datang langsung — jangan ulang presentasi dari awal: <b>sempitkan ke 2–3 unit favorit</b> dan tawarkan hold unit 1×24 jam.');
      if (Number(l.budget)) aksi.push('Budget diketahui (±' + rp(l.budget) + ') — ajukan langsung tipe &amp; unit yang cocok agar penawaran terasa personal.');
      return `<tr class="${l.status === 'Hot' ? 'hot' : 'warm'}">
<td><b>${l.status.toUpperCase()}</b>${l.deal && l.deal.jenis === 'Reserved' ? '<br/><span style="color:#8A5F14;font-weight:bold;font-size:8pt">● RESERVED</span>' : ''}${l.deal && l.deal.jenis === 'Booking' ? '<br/><span style="color:#23694A;font-weight:bold;font-size:8pt">● BOOKING</span>' : ''}${l.overdue ? '<br/><span class="badge-over">TERLAMBAT</span>' : ''}</td>
<td><b>${esc(l.nama)}</b><br/><span class="muted">${esc(l.lead_code)} · ${esc(l.project || '')} ${esc(l.tipe || '')} · ${esc(l.sales)}${l.deal && l.deal.unit && l.deal.jenis !== 'Batal' ? '<br/>Unit: <b>' + esc(l.deal.unit) + '</b>' : ''}</span></td>
<td>${(() => {
        const fs = l.myFus || [];
        if (!fs.length) return '<span class="badge-over">Belum ada aktivitas follow up yang tercatat.</span> Direkomendasikan kontak perdana segera dilakukan.';
        const ds = x => x ? new Date(x).toLocaleDateString('id-ID', { day: '2-digit', month: 'short' }) : '';
        const potong = (t, n) => { t = String(t || '').trim(); return t.length > n ? t.slice(0, n - 1) + '…' : t; };
        const objs = [...new Set(fs.map(f => (f.objection || '').trim()).filter(Boolean))];
        let teks = `Telah dilakukan <b>${fs.length}× follow up</b> (${ds(fs[0].tgl)}${fs.length > 1 ? ' – ' + ds(fs[fs.length - 1].tgl) : ''}). `;
        const tampil = fs.length <= 3 ? fs : [fs[0], ...fs.slice(-2)];
        teks += 'Kronologi: ' + tampil.map(f => `<span class="muted">${ds(f.tgl)}</span> ${esc(potong(f.detail, 90))}`).join('; ') + (fs.length > 3 ? ` <span class="muted">(+${fs.length - 3} aktivitas lainnya)</span>` : '') + '. ';
        if (objs.length) teks += 'Kendala yang mengemuka: <i>' + esc(potong(objs.join('; '), 120)) + '</i>. ';
        teks += l.nfu ? `Tindak lanjut berikutnya dijadwalkan <b>${dd(l.nfu)}</b>.` : '<span class="badge-over">Tindak lanjut berikutnya belum terjadwal.</span>';
        return teks;
      })()}</td>
<td>${aksi.slice(0, 3).join('<br/>• ')}</td>
</tr>`;
    }).join('') : '<tr><td colspan="4">Tidak ada lead Warm/Hot saat ini.</td></tr>'}
</table>

<h2>5. STOK &amp; NILAI PENJUALAN PER PROJECT <span style="font-weight:normal;font-size:9pt;color:#6B7A70">(posisi stok per hari ini, termasuk penandaan manual di Master Stock)</span></h2>
<table><tr><th>Project</th><th>Total Stok (unit)</th><th>Terjual</th><th>Reserved</th><th>Tersedia</th><th>% Terjual</th><th>Nilai Penjualan</th><th>Nilai Reserved</th></tr>
${stokRows.map(r => `<tr><td><b>${esc(r.p)}</b></td><td>${r.total}</td><td class="hot"><b>${r.merah}</b></td><td class="warm"><b>${r.kuning}</b></td><td>${Math.max(0, r.total - r.merah - r.kuning)}</td><td>${r.total ? Math.round(r.merah / r.total * 100) + '%' : '-'}</td><td>${rp(r.nJual)}</td><td>${rp(r.nRes)}</td></tr>`).join('')}
${stokRows.length > 1 ? `<tr style="background:#EFEEE8;font-weight:bold"><td>TOTAL</td><td>${stokRows.reduce((a, r) => a + r.total, 0)}</td><td>${stokRows.reduce((a, r) => a + r.merah, 0)}</td><td>${stokRows.reduce((a, r) => a + r.kuning, 0)}</td><td>${stokRows.reduce((a, r) => a + Math.max(0, r.total - r.merah - r.kuning), 0)}</td><td></td><td>${rp(stokRows.reduce((a, r) => a + r.nJual, 0))}</td><td>${rp(stokRows.reduce((a, r) => a + r.nRes, 0))}</td></tr>` : ''}
</table>
<p class="muted">Unit hasil penandaan manual (tanpa transaksi) terhitung pada jumlah namun bernilai Rp 0. Nilai diambil dari transaksi terakhir tiap unit.</p>

<p class="muted" style="margin-top:24px">Report ini dibuat otomatis oleh CRM Sales CHL — copyright &copy; 2026 by Andriawanp.</p>
</body></html>`;

    const blob = new Blob(['\ufeff' + html], { type: 'application/msword' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `Report_CRM_CHL_${(proj || 'Semua').replace(/\s+/g, '')}_${d1 || 'awal'}_${d2 || 'kini'}.doc`;
    document.body.appendChild(a); a.click(); a.remove();
    toast('Report Word terunduh');
  }

  return (
    <>
      <div className="page-head">
        <div><h1>Dashboard</h1>
          <div className="sub">Data bulan berjalan: 1 {bulanLabel.split(' ')[0]} – {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}</div><div className="sub">Data real-time dari database bersama — auto-refresh tiap menit{lastUpd ? ' · diperbarui ' + lastUpd.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) : ''} <button className="sort-btn" style={{ padding: '2px 9px', marginLeft: 6 }} onClick={muatSemua}>↻ Segarkan</button></div></div>
        <div className="stamp">Data per: <b>{new Date().toLocaleDateString('id-ID')}</b></div>
      </div>
      <div className="fu-toolbar">
        <span className="hint" style={{ fontWeight: 600 }}>Filter project:</span>
        <button className={'sort-btn' + (!proj ? ' active' : '')} onClick={() => setProj('')}>Semua</button>
        {(set.project || []).map(p => (
          <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>))}
      </div>
      <div className="card" style={{ marginBottom: 14, display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'flex-end' }}>
        <div className="field" style={{ minWidth: 150 }}><label>Report — Dari Tanggal</label>
          <input type="date" value={d1} onChange={e => setD1(e.target.value)} /></div>
        <div className="field" style={{ minWidth: 150 }}><label>Sampai Tanggal</label>
          <input type="date" value={d2} onChange={e => setD2(e.target.value)} /></div>
        <select className="sort-filter" style={{ marginLeft: 0 }} value={srcPilih} onChange={e => setSrcPilih(e.target.value)} title="Filter sumber untuk Excel">
          <option value="">Semua Sumber</option>
          <option value="DM">📣 Digital Marketing (Website, IG, FB Ads, Google Ads, Tiktok)</option>
          {(set.sumber || []).map(sm => <option key={sm} value={sm}>{sm}</option>)}
        </select>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={downloadWord}>⬇ Report Word</button>
        <button className="btn btn-ghost" style={{ width: 'auto' }} onClick={downloadExcel}>⬇ Download Excel</button>
        <span className="hint">Word &amp; Excel mengikuti <b>filter project di atas</b> + rentang tanggal (kosongkan utk seluruh periode). Khusus Excel juga mengikuti pilihan <b>Sumber</b>: baris yang tidak terpilih otomatis tersembunyi — buka Excel langsung bersih berisi data terpilih saja.</span>
      </div>
      <div className="grid kpis">
        {[['Total Lead', mLeads.length], ['Hot', byStatus('Hot')],
          ['Reserved', mResSet.size], ['Booking', mBookSet.size]]
          .map(([l, v]) => <div className="kpi" key={l}><div className="lbl">{l}</div><div className="val">{v}</div></div>)}
      </div>
      <div className="grid two-col">
        <div className="card">
          <h2>Status Pipeline</h2>
          <div className="pipe">
            {pipeRows.map(r => (
              <div className={'pipe-row' + r.cls} key={r.label}>
                <span>{r.label}{r.hint ? <span className="hint" style={{ fontWeight: 400 }}> ({r.hint})</span> : null}</span>
                <div className="bar"><div className="fill" style={{ width: (r.val / max * 100) + '%' }} /></div>
                <span className="n">{r.val}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <h2>Reminder Follow-Up</h2>
            <div className="rem-line overdue"><span>Overdue (terlewat)</span><span className="n">{rem.OVERDUE}</span></div>
            <div className="rem-line today"><span>Hari Ini</span><span className="n">{rem['HARI INI']}</span></div>
            <div className="rem-line upcoming"><span>Upcoming</span><span className="n">{rem.UPCOMING}</span></div>
          </div>
          <div className="card">
            <h2>Nilai (Rp) — {bulanLabel}</h2>
            <div className="money-line"><span>Pipeline Aktif <span className="hint">(budget Warm & Hot bulan ini)</span></span><b>{fmtRp(pipeVal)}</b></div>
            <div className="money-line"><span>Nilai Reserved</span><b>{fmtRp(resVal)}</b></div>
            <div className="money-line"><span>Nilai Booking</span><b>{fmtRp(bookVal)}</b></div>
          </div>
        </div>
      </div>
      <div className="card" style={{ marginTop: 14 }}>
        <h2>Sumber Lead — {bulanLabel} ({mLeads.length} lead)</h2>
        {srcRows.length ? (
          <div className="pipe">
            {srcRows.map(([k, v]) => (
              <div className="pipe-row" key={k}>
                <span>{k}</span>
                <div className="bar"><div className="fill" style={{ width: (v / srcMax * 100) + '%' }} /></div>
                <span className="n">{v}</span>
              </div>
            ))}
          </div>
        ) : <div className="hint">Belum ada lead masuk bulan ini.</div>}
        {walkDStr && <div className="hint" style={{ marginTop: 8 }}>Walk In via: {walkDStr}</div>}
      </div>

      <div style={{ marginTop: 14 }} className="tbl-wrap">
        <table>
          <thead><tr><th>Sales / PIC</th><th className="num">Total</th><th className="num">Warm</th><th className="num">Hot</th>
            <th className="num">Reserved</th><th className="num">Booking</th><th className="num">Closing Rate</th></tr></thead>
          <tbody>
            {salesNames.length ? salesNames.map(s => {
              const mine = mLeads.filter(l => l.sales === s);
              const c = st => mine.filter(l => l.status === st).length;
              const mineCodes = new Set(mine.map(l => l.lead_code));
              const rs = [...mResSet].filter(code => mineCodes.has(code)).length;
              const bk = [...mBookSet].filter(code => mineCodes.has(code)).length;
              return <tr key={s}>
                <td data-label="Sales"><b>{s}</b></td>
                <td className="num" data-label="Total">{mine.length}</td>
                <td className="num" data-label="Warm">{c('Warm')}</td>
                <td className="num" data-label="Hot">{c('Hot')}</td>
                <td className="num" data-label="Reserved">{rs}</td>
                <td className="num" data-label="Booking"><b>{bk}</b></td>
                <td className="num" data-label="Closing Rate"><b>{mine.length ? Math.round(bk / mine.length * 100) + '%' : '0%'}</b></td>
              </tr>;
            }) : <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada lead bulan ini.</td></tr>}
          </tbody>
        </table>
      </div>
      <Toast />
    </>
  );
}
