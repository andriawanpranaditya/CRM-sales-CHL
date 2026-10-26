'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp, fmtDate, catatUnduh } from '@/components/util';
import Dashboard from '../dashboard/page';

// ===== Menu Report (Manager & CEO): satu filter bersama untuk semua tab =====
const TAB = [['sales', 'Kinerja Sales'], ['penjualan', 'Laporan Penjualan'], ['lengkap', 'Report Lengkap'], ['excel', 'Data Excel']];
const hariIni = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); // tanggal WIB (tanpa Intl — aman di semua iPhone)
const awalBulan = () => hariIni().slice(0, 8) + '01';
const rpM = n => !n ? 'Rp 0' : n >= 1e9 ? 'Rp ' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M' : n >= 1e6 ? 'Rp ' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : fmtRp(n);
const WST = { Booking: 'var(--green)', Batal: 'var(--red)', Reserved: 'var(--brass-deep)' };

export default function ReportPage() {
  const [tab, setTab] = useState('sales');
  const [set, setSet] = useState({ status: [], project: [], sales: [] });
  const [me, setMe] = useState(null);
  const [proj, setProj] = useState('');
  const [d1, setD1] = useState(awalBulan());
  const [d2, setD2] = useState(hariIni());
  const [fSales, setFSales] = useState('');
  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get('tab'); if (TAB.some(x => x[0] === t)) setTab(t);
    Promise.all([api('/api/settings'), api('/api/auth/me')]).then(([s, u]) => { setSet(s); setMe(u); if ((s.project || []).length === 1) setProj(s.project[0]); }).catch(e => toast(e.message));
  }, []);
  const filterLuar = useMemo(() => ({ d1, d2, proj }), [d1, d2, proj]);

  return (
    <>
      <Toast />
      <div className="page-head"><div><h1>Report</h1>
        <div className="sub">Kinerja sales, laporan penjualan (Excel &amp; PDF), report lengkap (Word &amp; PDF), dan data Excel — semua mengikuti filter di bawah</div></div></div>

      <div className="card rp-filter">
        <div className="field"><label>Dari tanggal</label><input type="date" value={d1} onChange={e => setD1(e.target.value)} /></div>
        <div className="field"><label>Sampai tanggal</label><input type="date" value={d2} onChange={e => setD2(e.target.value)} /></div>
        <div className="field"><label>Project</label>
          <div className="fu-toolbar" style={{ margin: 0 }}>
            {(set.project || []).length !== 1 && <button className={'sort-btn' + (!proj ? ' active' : '')} onClick={() => setProj('')}>Semua</button>}
            {(set.project || []).map(p => <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>)}
          </div></div>
        {(tab === 'sales' || tab === 'penjualan') && <div className="field"><label>Sales</label>
          <select value={fSales} onChange={e => setFSales(e.target.value)}><option value="">Semua sales</option>{(set.sales || []).map(s => <option key={s}>{s}</option>)}</select></div>}
        <div className="field"><label>Pintasan periode</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="sort-btn" onClick={() => { setD1(awalBulan()); setD2(hariIni()); }}>Bulan ini</button>
            <button className="sort-btn" onClick={() => { const h = hariIni(); const y = Number(h.slice(0, 4)), m = Number(h.slice(5, 7)); const a = new Date(Date.UTC(y, m - 2, 1)), b = new Date(Date.UTC(y, m - 1, 0)); setD1(a.toISOString().slice(0, 10)); setD2(b.toISOString().slice(0, 10)); }}>Bulan lalu</button>
            <button className="sort-btn" onClick={() => { setD1(''); setD2(''); }}>Semua periode</button>
          </div></div>
      </div>

      <div className="fu-toolbar rp-tabs">{TAB.map(([k, l]) => <button key={k} className={'sort-btn' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'sales' && <TabSales proj={proj} d1={d1} d2={d2} fSales={fSales} set={set} />}
      {tab === 'penjualan' && <TabPenjualan proj={proj} d1={d1} d2={d2} fSales={fSales} me={me} />}
      {tab === 'lengkap' && <Dashboard hanyaReport="lengkap" filterLuar={filterLuar} />}
      {tab === 'excel' && <Dashboard hanyaReport="excel" filterLuar={filterLuar} />}
    </>
  );
}

// ===== Tab 1: Kinerja Sales (tabel lama, kini ikut periode & filter sales) =====
function TabSales({ proj, d1, d2, fSales, set }) {
  const [leads, setLeads] = useState(null);
  const [trx, setTrx] = useState([]);
  useEffect(() => { Promise.all([api('/api/leads'), api('/api/trx')]).then(([l, t]) => { setLeads(l); setTrx(t); }).catch(e => toast(e.message)); }, []);
  if (!leads) return <div className="loading">Memuat…</div>;
  const dlm = t => { const x = String(t || '').slice(0, 10); return x && (!d1 || x >= d1) && (!d2 || x <= d2); };
  const fLeads = leads.filter(l => (!proj || l.project === proj) && dlm(l.tgl) && (!fSales || l.sales === fSales));
  const fTrx = trx.filter(t => (!proj || t.project === proj) && dlm(t.tgl) && (!fSales || t.sales === fSales));
  const salesNames = fSales ? [fSales] : [...new Set([...(set.sales || []), ...fLeads.map(l => l.sales)].filter(Boolean))];
  const ST = ['New', 'Cold', 'Warm', 'Hot', 'Appointment', 'Site Visit', 'Drop'];
  return (
    <>
      <div className="hint" style={{ margin: '0 0 10px' }}>Lead yang masuk pada periode · status saat ini dari Database Lead · Reserved &amp; Booking dari transaksi pada periode · Closing Rate = Booking ÷ Total Lead</div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Sales / PIC</th><th className="num">Total</th>{ST.map(s => <th className="num" key={s}>{s}</th>)}
          <th className="num" style={{ color: 'var(--brass)' }}>Reserved</th><th className="num" style={{ color: 'var(--red)' }}>Booking</th><th className="num">Closing Rate</th></tr></thead>
        <tbody>
          {salesNames.length ? salesNames.map(s => {
            const mine = fLeads.filter(l => l.sales === s), c = st => mine.filter(l => l.status === st).length, myTrx = fTrx.filter(t => t.sales === s);
            const resSet = new Set(myTrx.filter(t => t.jenis === 'Reserved').map(t => t.lead_code)), bookSet = new Set(myTrx.filter(t => t.jenis === 'Booking').map(t => t.lead_code));
            return <tr key={s}><td data-label="Sales"><b>{s}</b></td><td className="num" data-label="Total">{mine.length}</td>
              {ST.map(st => <td className="num" key={st} data-label={st}>{c(st)}</td>)}
              <td className="num" data-label="Reserved"><b style={{ color: 'var(--brass)' }}>{resSet.size}</b></td>
              <td className="num" data-label="Booking"><b style={{ color: 'var(--red)' }}>{bookSet.size}</b></td>
              <td className="num" data-label="Closing Rate"><b>{mine.length ? Math.round(bookSet.size / mine.length * 100) + '%' : '0%'}</b></td></tr>;
          }) : <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada sales / lead pada filter ini.</td></tr>}
        </tbody></table></div>
    </>
  );
}

// ===== Tab 2: Laporan Penjualan (Excel & PDF) =====
function TabPenjualan({ proj, d1, d2, fSales, me }) {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setD(null);
    api('/api/laporan-penjualan?d1=' + (d1 || '') + '&d2=' + (d2 || '') + '&project=' + encodeURIComponent(proj || '') + '&sales=' + encodeURIComponent(fSales || ''))
      .then(setD).catch(e => toast(e.message));
  }, [proj, d1, d2, fSales]);
  if (!d) return <div className="loading">Menyusun laporan penjualan…</div>;
  const rows = d.rows, bk = rows.filter(r => r.status === 'Booking'), bt = rows.filter(r => r.status === 'Batal'), rv = rows.filter(r => r.status === 'Reserved');
  const nilai = bk.reduce((a, r) => a + (r.harga || 0), 0), tj = rows.reduce((a, r) => a + (r.nilai_reserved || 0), 0), bf = rows.reduce((a, r) => a + (r.nilai_booking || 0), 0);
  const lama = bk.filter(r => r.lama != null).map(r => r.lama), rata = lama.length ? lama.reduce((a, b) => a + b, 0) / lama.length : 0;
  const periode = (d1 || d2) ? `${d1 ? fmtDate(d1) : 'awal'} – ${d2 ? fmtDate(d2) : 'kini'}` : 'Semua periode';
  const rekap = (key, daftar) => daftar.map(x => { const tt = rows.filter(r => (key === 'bayar' ? (r.bayar || 'Belum diisi').replace(/\s*\d+x$/i, '') === x : (r[key] || '-') === x)); const bb = tt.filter(r => r.status === 'Booking');
    const l = bb.filter(r => r.lama != null).map(r => r.lama);
    return { nama: x, n: tt.length, booking: bb.length, batal: tt.filter(r => r.status === 'Batal').length, reserved: tt.filter(r => r.status === 'Reserved').length, nilai: bb.reduce((a, r) => a + (r.harga || 0), 0), rata: l.length ? l.reduce((a, b) => a + b, 0) / l.length : null }; });
  const perBayar = rekap('bayar', [...new Set(rows.map(r => (r.bayar || 'Belum diisi').replace(/\s*\d+x$/i, '')))]);
  const perProject = rekap('project', [...new Set(rows.map(r => r.project))]);
  const perSales = rekap('sales', [...new Set(rows.map(r => r.sales || '-'))]);
  const ringkas = { n: rows.length, booking: bk.length, batal: bt.length, reserved: rv.length, nilai, tj, bf, rata, konversi: rows.length ? bk.length / rows.length : 0 };

  async function unduhExcel() {
    setBusy(true);
    try { await buatExcelPenjualan({ rows, periode, d1, d2, proj, fSales, me }); catatUnduh('Report', 'Laporan Penjualan (Excel)'); toast('Excel laporan penjualan terunduh'); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  function unduhPdf() {
    const w = window.open('', '_blank'); if (!w) return toast('Izinkan pop-up untuk membuat PDF, lalu coba lagi');
    w.document.open(); w.document.write(htmlPenjualan({ rows, periode, proj, fSales, ringkas, perBayar, perProject, perSales, me })); w.document.close();
    w.onload = () => { w.focus(); w.print(); }; setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 900);
    catatUnduh('Report', 'Laporan Penjualan (PDF)'); toast('Jendela cetak terbuka — pilih "Save as PDF" 📄');
  }

  return (
    <>
      <div className="rp-aksi">
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy || !rows.length} onClick={unduhExcel}>⬇ Unduh Excel</button>
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!rows.length} onClick={unduhPdf}>📄 Unduh PDF</button>
        <span className="hint">{rows.length} konsumen · {periode}{proj ? ' · ' + proj : ''}{fSales ? ' · sales ' + fSales : ''}. Penjualan diakui pada tanggal Booking.</span>
      </div>
      <div className="rp-kpi">
        {[['Reserved / Booking', ringkas.n, 'konsumen'], ['Booking', ringkas.booking, 'penjualan diakui'], ['Batal', ringkas.batal, 'unit kembali ke stok'], ['Masih Reserved', ringkas.reserved, 'pipeline'],
          ['Konversi', Math.round(ringkas.konversi * 100) + '%', 'Reserved → Booking'], ['Nilai penjualan', rpM(nilai), 'harga jual unit Booking']].map(([l, v, k]) => (
          <div key={l} className={'card' + (l === 'Nilai penjualan' ? ' emas' : '')}><span className="hint">{l}</span><b className="rp-besar">{v}</b><span className="hint">{k}</span></div>))}
      </div>
      <p className="hint" style={{ margin: '8px 0 14px' }}>Tanda jadi diterima <b>{fmtRp(tj)}</b> · Booking fee diterima <b>{fmtRp(bf)}</b> · Rata-rata Reserved → Booking <b>{rata.toLocaleString('id-ID', { maximumFractionDigits: 1 })} hari</b></p>

      <div className="rp-grid2">
        <div className="card"><h3 style={{ marginTop: 0 }}>Per cara bayar</h3><TabelRekap rows={perBayar} total /></div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Per project</h3><TabelRekap rows={perProject} konversi /></div>
      </div>
      <div className="card" style={{ marginTop: 12 }}><h3 style={{ marginTop: 0 }}>Kinerja per sales</h3><TabelRekap rows={perSales} konversi rata /></div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Detail transaksi — dari Reserved sampai Booking / Batal</h3>
        <div className="hint" style={{ marginBottom: 8 }}>Satu baris = satu konsumen/unit. Hari = lama Reserved ke Booking. Kolom terakhir = update status terakhir (akad / rencana akad / proses KPR / cara bayar cash).</div>
        {rows.length ? <div className="tbl-wrap tbl-compact rp-detail"><table>
          <thead><tr><th>No</th><th>Konsumen</th><th>Project · Unit</th><th>Sales</th><th>Reserved · tanda jadi</th><th>Booking · BF</th><th className="num">Harga jual</th><th>Cara bayar</th><th>Status</th><th className="num">Hari</th><th>Update status terakhir</th></tr></thead>
          <tbody>{rows.map((r, i) => (<tr key={r.lead_code + r.unit}>
            <td data-label="No">{i + 1}</td>
            <td data-label="Konsumen"><b>{r.nama}</b><span className="sub2">{r.lead_code} · {r.sumber}</span></td>
            <td data-label="Project · Unit">{r.project}<span className="sub2">{r.unit} {r.tipe ? '· ' + r.tipe : ''}</span></td>
            <td data-label="Sales">{r.sales || '—'}</td>
            <td data-label="Reserved">{r.tgl_reserved ? <>{fmtDate(r.tgl_reserved)}<span className="sub2">{fmtRp(r.nilai_reserved)}</span></> : '—'}</td>
            <td data-label="Booking">{r.tgl_booking ? <>{fmtDate(r.tgl_booking)}<span className="sub2">{fmtRp(r.nilai_booking)}</span></> : '—'}</td>
            <td className="num" data-label="Harga jual">{fmtRp(r.harga)}</td>
            <td data-label="Cara bayar">{r.cara_bayar || '—'}</td>
            <td data-label="Status"><b style={{ color: WST[r.status] }}>{r.status}</b>{r.tgl_batal ? <span className="sub2">{fmtDate(r.tgl_batal)}</span> : null}</td>
            <td className="num" data-label="Hari">{r.lama ?? '—'}</td>
            <td data-label="Update status terakhir">{r.update_terakhir}</td></tr>))}</tbody></table></div>
          : <p className="hint">Tidak ada transaksi pada filter ini.</p>}
      </div>
    </>
  );
}
function TabelRekap({ rows, total, konversi, rata }) {
  const T = { n: rows.reduce((a, r) => a + r.n, 0), booking: rows.reduce((a, r) => a + r.booking, 0), batal: rows.reduce((a, r) => a + r.batal, 0), reserved: rows.reduce((a, r) => a + r.reserved, 0), nilai: rows.reduce((a, r) => a + r.nilai, 0) };
  return (<div className="tbl-wrap tbl-compact"><table>
    <thead><tr><th>Nama</th><th className="num">Unit</th><th className="num">Booking</th><th className="num">Batal</th><th className="num">Reserved</th><th className="num">Nilai penjualan</th><th className="num">{konversi ? 'Konversi' : 'Porsi'}</th>{rata ? <th className="num">Rata-rata hari</th> : null}</tr></thead>
    <tbody>{rows.map(r => (<tr key={r.nama}><td data-label="Nama"><b>{r.nama}</b></td><td className="num" data-label="Unit">{r.n}</td><td className="num" data-label="Booking">{r.booking}</td><td className="num" data-label="Batal">{r.batal}</td>
      <td className="num" data-label="Reserved">{r.reserved}</td><td className="num" data-label="Nilai">{rpM(r.nilai)}</td>
      <td className="num" data-label={konversi ? 'Konversi' : 'Porsi'}>{konversi ? (r.n ? Math.round(r.booking / r.n * 100) : 0) : (T.nilai ? Math.round(r.nilai / T.nilai * 100) : 0)}%</td>
      {rata ? <td className="num" data-label="Rata-rata hari">{r.rata != null ? r.rata.toLocaleString('id-ID', { maximumFractionDigits: 1 }) : '—'}</td> : null}</tr>))}
      {total && rows.length > 0 && <tr style={{ fontWeight: 700 }}><td data-label="Nama">Total</td><td className="num" data-label="Unit">{T.n}</td><td className="num" data-label="Booking">{T.booking}</td><td className="num" data-label="Batal">{T.batal}</td><td className="num" data-label="Reserved">{T.reserved}</td><td className="num" data-label="Nilai">{rpM(T.nilai)}</td><td className="num" data-label="Porsi">100%</td></tr>}
    </tbody></table></div>);
}

// ---------- Excel: Ringkasan (rumus), Detail, Per Sales, Proses KPR, Keterangan ----------
async function buatExcelPenjualan({ rows, periode, d1, d2, proj, fSales, me }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); wb.creator = 'CRM Sales CHL';
  const HIJAU = 'FF12302A', EMAS = 'FFE2BE7A', KREM = 'FFF5F2EA', GARIS = 'FFE6E1D5';
  const RP = '"Rp" #,##0;("Rp" #,##0);"-"', TGL = 'dd mmm yyyy', PCT = '0.0%';
  const tgl = s => s ? new Date(s + 'T00:00:00') : null;
  const judul = (ws, t, sub) => { ws.getCell('A1').value = t; ws.getCell('A1').font = { name: 'Arial', bold: true, size: 14, color: { argb: HIJAU } }; if (sub) { ws.getCell('A2').value = sub; ws.getCell('A2').font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF5B6E66' } }; } };
  const head = (ws, row, cols) => { const r = ws.getRow(row); cols.forEach((c, i) => { const x = r.getCell(i + 1); x.value = c; x.font = { name: 'Arial', bold: true, color: { argb: EMAS }, size: 10 }; x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIJAU } }; x.alignment = { wrapText: true, vertical: 'middle' }; }); r.height = 30; };
  const rapikan = (ws, r, nCol, zebra) => { const row = ws.getRow(r); for (let c = 1; c <= nCol; c++) { const x = row.getCell(c); x.font = { ...(x.font || {}), name: 'Arial', size: x.font?.size || 10 }; x.alignment = { ...(x.alignment || {}), vertical: 'top', wrapText: true }; x.border = { top: { style: 'thin', color: { argb: GARIS } }, bottom: { style: 'thin', color: { argb: GARIS } }, left: { style: 'thin', color: { argb: GARIS } }, right: { style: 'thin', color: { argb: GARIS } } }; if (zebra) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KREM } }; } };
  const sub = `${periode}${proj ? ' · ' + proj : ' · semua project'}${fSales ? ' · sales ' + fSales : ''} · dibuat ${new Date().toLocaleString('id-ID')} oleh ${me?.name || ''}`;

  // ---- Ringkasan (diisi rumus setelah Detail dibuat) ----
  const rs = wb.addWorksheet('Ringkasan');
  // ---- Detail ----
  const det = wb.addWorksheet('Detail Transaksi');
  judul(det, 'Detail Transaksi — perjalanan setiap unit dari Reserved sampai Booking / Batal', sub);
  head(det, 4, ['No', 'Kode Lead', 'Konsumen', 'Project', 'Blok / Unit', 'Tipe', 'Sales', 'Sumber Lead', 'Tgl Reserved', 'Tanda Jadi (Rp)', 'Tgl Booking', 'Booking Fee (Rp)', 'Harga Jual (Rp)', 'Cara Bayar', 'Tgl Batal', 'Alasan Batal', 'Status Terakhir', 'Lama Reserved → Booking (hari)', 'Catatan', 'Update Status Terakhir']);
  const r0 = 5;
  rows.forEach((x, i) => {
    const r = r0 + i, row = det.getRow(r);
    row.values = [i + 1, x.lead_code, x.nama, x.project, x.unit, x.tipe, x.sales, [x.sumber, x.walkin_info ? 'via ' + x.walkin_info : ''].filter(Boolean).join(' '), tgl(x.tgl_reserved), x.nilai_reserved || null, tgl(x.tgl_booking), x.nilai_booking || null, x.harga || null, x.cara_bayar || '', tgl(x.tgl_batal), x.alasan_batal || '',
      { formula: `IF(O${r}<>"","Batal",IF(K${r}<>"","Booking","Reserved"))` }, { formula: `IF(K${r}="","",IF(I${r}="",0,K${r}-I${r}))` }, x.catatan || '', x.update_terakhir];
    rapikan(det, r, 20, i % 2 === 1);
    [9, 11, 15].forEach(c => { row.getCell(c).numFmt = TGL; }); [10, 12, 13].forEach(c => { row.getCell(c).numFmt = RP; });
    row.getCell(17).font = { name: 'Arial', bold: true, size: 10 }; row.getCell(20).font = { name: 'Arial', bold: true, size: 10 }; row.getCell(18).alignment = { horizontal: 'center', vertical: 'top' };
  });
  const last = Math.max(r0, r0 + rows.length - 1), tr = r0 + rows.length;
  det.getCell(`A${tr}`).value = 'Total'; det.getCell(`A${tr}`).font = { name: 'Arial', bold: true };
  det.getCell(`J${tr}`).value = { formula: `SUM(J${r0}:J${last})` }; det.getCell(`L${tr}`).value = { formula: `SUM(L${r0}:L${last})` };
  det.getCell(`M${tr}`).value = { formula: `SUMIFS(M${r0}:M${last},Q${r0}:Q${last},"Booking")` }; det.getCell(`N${tr}`).value = '← harga jual unit yang Booking'; det.getCell(`N${tr}`).font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF5B6E66' } };
  [`J${tr}`, `L${tr}`, `M${tr}`].forEach(c => { det.getCell(c).numFmt = RP; det.getCell(c).font = { name: 'Arial', bold: true }; });
  [5, 11, 22, 14, 15, 9, 9, 14, 12, 14, 12, 14, 15, 16, 12, 26, 13, 13, 30, 46].forEach((w, i) => { det.getColumn(i + 1).width = w; });
  det.views = [{ state: 'frozen', xSplit: 3, ySplit: 4, showGridLines: false }]; det.autoFilter = { from: 'A4', to: `T${last}` };
  det.addConditionalFormatting({ ref: `Q${r0}:Q${last}`, rules: [
    { type: 'cellIs', operator: 'equal', formulae: ['"Booking"'], style: { font: { bold: true, color: { argb: 'FF1E6A4C' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFE3EFE8' } } } },
    { type: 'cellIs', operator: 'equal', formulae: ['"Batal"'], style: { font: { bold: true, color: { argb: 'FFB4482A' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF8E2DA' } } } },
    { type: 'cellIs', operator: 'equal', formulae: ['"Reserved"'], style: { font: { bold: true, color: { argb: 'FF7A5414' } }, fill: { type: 'pattern', pattern: 'solid', bgColor: { argb: 'FFF6EAD0' } } } }] });
  const D = "'Detail Transaksi'", R = col => `${D}!$${col}$${r0}:$${col}$${last}`;

  // ---- Ringkasan ----
  judul(rs, 'Laporan Penjualan — Ringkasan', `CRM Sales CHL · ${sub} · semua angka dihitung dari sheet Detail Transaksi`);
  rs.getCell('A4').value = 'Periode dari'; rs.getCell('B4').value = tgl(d1) || 'awal'; rs.getCell('A5').value = 'Periode sampai'; rs.getCell('B5').value = tgl(d2) || 'kini';
  ['A4', 'A5'].forEach(c => { rs.getCell(c).font = { name: 'Arial', bold: true }; });
  ['B4', 'B5'].forEach(c => { rs.getCell(c).numFmt = TGL; rs.getCell(c).font = { name: 'Arial', bold: true, color: { argb: 'FF0000FF' } }; rs.getCell(c).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF4CC' } }; });
  head(rs, 7, ['Indikator utama', 'Nilai', 'Keterangan']);
  const kpi = [
    ['Konsumen dalam laporan', { formula: `COUNTA(${R('B')})` }, '0', 'satu baris per konsumen/unit (Reserved / Booking / Batal)'],
    ['Naik / langsung Booking', { formula: `COUNTIFS(${R('Q')},"Booking")` }, '0', 'penjualan diakui pada tanggal Booking'],
    ['Batal', { formula: `COUNTIFS(${R('Q')},"Batal")` }, '0', 'unit kembali ke stok'],
    ['Masih Reserved (pipeline)', { formula: `COUNTIFS(${R('Q')},"Reserved")` }, '0', 'menunggu naik Booking'],
    ['Konversi Reserved → Booking', { formula: 'IFERROR(B9/B8,0)' }, PCT, 'Booking ÷ seluruh konsumen'],
    ['Nilai penjualan (harga jual unit Booking)', { formula: `SUMIFS(${R('M')},${R('Q')},"Booking")` }, RP, ''],
    ['Total tanda jadi diterima', { formula: `SUM(${R('J')})` }, RP, 'termasuk yang hangus karena batal'],
    ['Total booking fee diterima', { formula: `SUM(${R('L')})` }, RP, ''],
    ['Rata-rata lama Reserved → Booking', { formula: `IFERROR(AVERAGEIFS(${R('R')},${R('Q')},"Booking"),0)` }, '0.0 "hari"', ''],
  ];
  kpi.forEach(([a, f, fm, k], i) => { const r = 8 + i; rs.getCell(`A${r}`).value = a; rs.getCell(`B${r}`).value = f; rs.getCell(`B${r}`).numFmt = fm; rs.getCell(`C${r}`).value = k; rapikan(rs, r, 3, i % 2 === 1); rs.getCell(`A${r}`).font = { name: 'Arial', bold: true }; rs.getCell(`B${r}`).alignment = { horizontal: 'right' }; rs.getCell(`C${r}`).font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF5B6E66' } }; });
  const blok = (judulB, baris, listNama, kolom, rasio) => {
    rs.getCell(`A${baris}`).value = judulB; rs.getCell(`A${baris}`).font = { name: 'Arial', bold: true, size: 12, color: { argb: HIJAU } };
    head(rs, baris + 1, ['Nama', 'Jumlah unit', 'Booking', 'Batal', 'Masih Reserved', 'Nilai penjualan (Rp)', rasio === 'porsi' ? 'Porsi nilai' : 'Konversi']);
    listNama.forEach((nm, i) => { const r = baris + 2 + i, cr = kolom === 'N' ? `A${r}&"*"` : `A${r}`;
      rs.getCell(`A${r}`).value = nm;
      rs.getCell(`B${r}`).value = { formula: `COUNTIFS(${R(kolom)},${cr})` };
      rs.getCell(`C${r}`).value = { formula: `COUNTIFS(${R(kolom)},${cr},${R('Q')},"Booking")` }; rs.getCell(`D${r}`).value = { formula: `COUNTIFS(${R(kolom)},${cr},${R('Q')},"Batal")` };
      rs.getCell(`E${r}`).value = { formula: `COUNTIFS(${R(kolom)},${cr},${R('Q')},"Reserved")` }; rs.getCell(`F${r}`).value = { formula: `SUMIFS(${R('M')},${R(kolom)},${cr},${R('Q')},"Booking")` }; rs.getCell(`F${r}`).numFmt = RP;
      rs.getCell(`G${r}`).value = { formula: rasio === 'porsi' ? `IFERROR(F${r}/$B$13,0)` : `IFERROR(C${r}/B${r},0)` }; rs.getCell(`G${r}`).numFmt = PCT;
      rapikan(rs, r, 7, i % 2 === 1); rs.getCell(`A${r}`).font = { name: 'Arial', bold: true }; });
    return baris + 2 + listNama.length;
  };
  const bayarL = [...new Set(rows.map(r => (r.bayar || '').replace(/\s*\d+x$/i, '')).filter(Boolean))];
  let b2 = blok('Per cara bayar', 19, bayarL, 'N', 'porsi');
  b2 = blok('Per project', b2 + 2, [...new Set(rows.map(r => r.project))], 'D', 'konversi');
  rs.getCell(`A${b2 + 2}`).value = 'Catatan: penjualan diakui pada tanggal Booking (bukan Reserved). Satu unit dihitung sekali. Status terakhir = kejadian paling akhir (Batal > Booking > Reserved).'; rs.getCell(`A${b2 + 2}`).font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF5B6E66' } };
  [40, 18, 48, 10, 15, 22, 12].forEach((w, i) => { rs.getColumn(i + 1).width = w; }); rs.views = [{ showGridLines: false }];

  // ---- Per Sales ----
  const sp = wb.addWorksheet('Per Sales');
  judul(sp, 'Kinerja per sales', 'Dihitung otomatis dari Detail Transaksi');
  head(sp, 4, ['Sales', 'Reserved', 'Booking', 'Batal', 'Masih Reserved', 'Konversi', 'Nilai penjualan (Rp)', 'Rata-rata hari ke Booking']);
  const salesL = [...new Set(rows.map(r => r.sales || '-'))].sort();
  salesL.forEach((s, i) => { const r = 5 + i; sp.getCell(`A${r}`).value = s;
    sp.getCell(`B${r}`).value = { formula: `COUNTIFS(${R('G')},A${r})` }; sp.getCell(`C${r}`).value = { formula: `COUNTIFS(${R('G')},A${r},${R('Q')},"Booking")` };
    sp.getCell(`D${r}`).value = { formula: `COUNTIFS(${R('G')},A${r},${R('Q')},"Batal")` }; sp.getCell(`E${r}`).value = { formula: `COUNTIFS(${R('G')},A${r},${R('Q')},"Reserved")` };
    sp.getCell(`F${r}`).value = { formula: `IFERROR(C${r}/B${r},0)` }; sp.getCell(`F${r}`).numFmt = PCT;
    sp.getCell(`G${r}`).value = { formula: `SUMIFS(${R('M')},${R('G')},A${r},${R('Q')},"Booking")` }; sp.getCell(`G${r}`).numFmt = RP;
    sp.getCell(`H${r}`).value = { formula: `IFERROR(AVERAGEIFS(${R('R')},${R('G')},A${r},${R('Q')},"Booking"),"-")` }; sp.getCell(`H${r}`).numFmt = '0.0';
    rapikan(sp, r, 8, i % 2 === 1); sp.getCell(`A${r}`).font = { name: 'Arial', bold: true }; });
  [14, 11, 10, 9, 15, 11, 22, 22].forEach((w, i) => { sp.getColumn(i + 1).width = w; }); sp.views = [{ showGridLines: false }];

  // ---- Proses KPR ----
  const kp = wb.addWorksheet('Proses KPR');
  judul(kp, 'Proses KPR — status terakhir konsumen KPR', 'Proses KPR dihitung sejak Booking. Konsumen yang batal tercatat "Dihentikan".');
  head(kp, 4, ['Kode Lead', 'Konsumen', 'Project · Unit', 'Sales', 'Status transaksi', 'Bank', 'Tahap KPR', 'Rencana Akad', 'Realisasi Akad', 'Update status terakhir']);
  rows.filter(r => /kpr/i.test(r.bayar || '')).forEach((x, i) => { const r = 5 + i, k = x.kpr;
    kp.getRow(r).values = [x.lead_code, x.nama, `${x.project} · ${x.unit}`, x.sales, x.status, k?.banks?.join(', ') || '-', x.status === 'Batal' ? 'Dihentikan' : (k ? k.label + (x.status === 'Reserved' ? ' (menunggu Booking)' : '') : '-'), tgl(k?.akad_tgl), tgl(k?.akad_realisasi), x.update_terakhir];
    rapikan(kp, r, 10, i % 2 === 1); [8, 9].forEach(c => { kp.getRow(r).getCell(c).numFmt = TGL; }); kp.getRow(r).getCell(7).font = { name: 'Arial', bold: true, size: 10 }; });
  [11, 22, 26, 9, 14, 12, 26, 13, 13, 46].forEach((w, i) => { kp.getColumn(i + 1).width = w; }); kp.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];

  // ---- Keterangan ----
  const kt = wb.addWorksheet('Keterangan');
  judul(kt, 'Keterangan kolom & aturan', 'Panduan membaca laporan');
  head(kt, 4, ['Istilah / kolom', 'Arti']);
  [['Reserved', 'Konsumen membayar tanda jadi untuk mengunci unit. Belum dihitung sebagai penjualan.'], ['Booking', 'Konsumen membayar booking fee. Penjualan diakui pada tanggal Booking.'],
   ['Batal', 'Transaksi dibatalkan; unit kembali ke stok.'], ['Status Terakhir', 'Dihitung otomatis: ada Tgl Batal → Batal; ada Tgl Booking → Booking; selain itu Reserved.'],
   ['Lama Reserved → Booking', 'Selisih hari dari Tgl Reserved ke Tgl Booking. 0 = langsung Booking.'], ['Nilai penjualan', 'Jumlah harga jual unit berstatus Booking.'],
   ['Konversi', 'Booking ÷ seluruh konsumen (Booking + Batal + masih Reserved).'], ['Update Status Terakhir', 'Akad terealisasi (tanggal), rencana akad (tanggal, bank), tahap KPR berjalan, atau untuk cash: cash keras / cash bertahap berapa kali.'],
   ['Sel kuning (Ringkasan)', 'Periode laporan; semua angka lain berupa rumus dari sheet Detail Transaksi.']].forEach(([a, b], i) => { const r = 5 + i; kt.getCell(`A${r}`).value = a; kt.getCell(`B${r}`).value = b; rapikan(kt, r, 2, i % 2 === 1); kt.getCell(`A${r}`).font = { name: 'Arial', bold: true }; });
  kt.getColumn(1).width = 26; kt.getColumn(2).width = 100; kt.views = [{ showGridLines: false }];

  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = `Laporan_Penjualan_CHL_${(proj || 'Semua').replace(/\s+/g, '')}_${d1 || 'awal'}_${d2 || 'kini'}.xlsx`; document.body.appendChild(a); a.click(); a.remove();
}

// ---------- PDF: HTML siap cetak (A4 mendatar) ----------
function htmlPenjualan({ rows, periode, proj, fSales, ringkas, perBayar, perProject, perSales, me }) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const warna = { Booking: '#1E6A4C', Batal: '#B4482A', Reserved: '#7A5414' };
  const rek = (judul, data, konversi, rata) => `<h3>${judul}</h3><table><tr><th>Nama</th><th class="r">Unit</th><th class="r">Booking</th><th class="r">Batal</th><th class="r">Reserved</th><th class="r">Nilai penjualan</th><th class="r">${konversi ? 'Konversi' : 'Porsi'}</th>${rata ? '<th class="r">Rata-rata hari</th>' : ''}</tr>
    ${data.map(r => `<tr><td><b>${esc(r.nama)}</b></td><td class="r">${r.n}</td><td class="r">${r.booking}</td><td class="r">${r.batal}</td><td class="r">${r.reserved}</td><td class="r">${rpM(r.nilai)}</td><td class="r">${konversi ? (r.n ? Math.round(r.booking / r.n * 100) : 0) : (ringkas.nilai ? Math.round(r.nilai / ringkas.nilai * 100) : 0)}%</td>${rata ? `<td class="r">${r.rata != null ? r.rata.toLocaleString('id-ID', { maximumFractionDigits: 1 }) : '—'}</td>` : ''}</tr>`).join('')}</table>`;
  return `<!doctype html><html lang="id"><head><meta charset="utf-8"><title>Laporan Penjualan</title><style>
  @page{size:A4 landscape;margin:12mm 14mm} body{font-family:Arial,Helvetica,sans-serif;font-size:9.5pt;color:#10251E;margin:0}
  .kop{background:#12302A;color:#fff;padding:10px 14px;display:flex;justify-content:space-between;align-items:center;border-radius:6px;-webkit-print-color-adjust:exact;print-color-adjust:exact} .kop b{color:#E2BE7A;font-size:13pt}
  h2{font-size:12pt;color:#12302A;margin:16px 0 4px} h3{font-size:10.5pt;color:#12302A;margin:12px 0 4px} .muted{color:#5B6E66;font-size:8.5pt}
  .kpi{display:grid;grid-template-columns:repeat(6,1fr);gap:8px;margin:8px 0} .kpi div{background:#F5F2EA;border-radius:8px;padding:8px 10px;-webkit-print-color-adjust:exact;print-color-adjust:exact} .kpi b{display:block;font-size:16pt;color:#12302A} .kpi .emas{background:#E2BE7A}
  table{width:100%;border-collapse:collapse;font-size:8.5pt;margin-bottom:6px} th{background:#12302A;color:#E2BE7A;text-align:left;padding:4px 5px;font-size:8pt;-webkit-print-color-adjust:exact;print-color-adjust:exact} td{padding:4px 5px;border-bottom:1px solid #E6E1D5;vertical-align:top} .r{text-align:right}
  .dua{display:grid;grid-template-columns:1fr 1fr;gap:14px} .ket{color:#5B6E66;font-size:8pt;margin-top:10px} tr{page-break-inside:avoid}
  </style></head><body>
  <div class="kop"><div><b>LAPORAN PENJUALAN</b> &nbsp; CRM Sales CHL · ${esc(periode)} · ${esc(proj || 'Semua project')}${fSales ? ' · sales ' + esc(fSales) : ''}</div><div style="font-size:8.5pt">Dicetak ${new Date().toLocaleString('id-ID')} · oleh ${esc(me?.name || '')}</div></div>
  <h2>Ringkasan penjualan</h2>
  <div class="kpi">${[['Konsumen', ringkas.n, 'Reserved / Booking'], ['Booking', ringkas.booking, 'penjualan diakui'], ['Batal', ringkas.batal, 'unit kembali ke stok'], ['Masih Reserved', ringkas.reserved, 'pipeline'], ['Konversi', Math.round(ringkas.konversi * 100) + '%', 'Reserved → Booking'], ['Nilai penjualan', rpM(ringkas.nilai), 'harga jual unit Booking']]
    .map(([l, v, k], i) => `<div class="${i === 5 ? 'emas' : ''}"><span class="muted">${l}</span><b>${v}</b><span class="muted">${k}</span></div>`).join('')}</div>
  <p class="muted">Tanda jadi diterima <b>${fmtRp(ringkas.tj)}</b> · Booking fee diterima <b>${fmtRp(ringkas.bf)}</b> · Rata-rata Reserved → Booking <b>${ringkas.rata.toLocaleString('id-ID', { maximumFractionDigits: 1 })} hari</b></p>
  <div class="dua"><div>${rek('Per cara bayar', perBayar, false)}</div><div>${rek('Per project', perProject, true)}</div></div>
  ${rek('Kinerja per sales', perSales, true, true)}
  <h2 style="page-break-before:always">Detail transaksi — dari Reserved sampai Booking / Batal</h2>
  <p class="muted">Satu baris = satu konsumen/unit. Hari = lama Reserved ke Booking. Kolom terakhir = update status terakhir (akad / rencana akad / proses KPR / cara bayar cash).</p>
  <table><tr><th>No</th><th>Konsumen</th><th>Project · Unit</th><th>Sales</th><th>Reserved · tanda jadi</th><th>Booking · BF</th><th>Harga jual</th><th>Cara bayar</th><th>Status</th><th>Hari</th><th>Update status terakhir</th></tr>
  ${rows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.nama)}</b><br><span class="muted">${esc(r.lead_code)} · ${esc(r.sumber)}</span></td><td>${esc(r.project)}<br>${esc(r.unit)} ${r.tipe ? '· ' + esc(r.tipe) : ''}</td><td>${esc(r.sales || '—')}</td>
    <td>${r.tgl_reserved ? fmtDate(r.tgl_reserved) + '<br><span class="muted">' + fmtRp(r.nilai_reserved) + '</span>' : '—'}</td><td>${r.tgl_booking ? fmtDate(r.tgl_booking) + '<br><span class="muted">' + fmtRp(r.nilai_booking) + '</span>' : '—'}</td>
    <td>${fmtRp(r.harga)}</td><td>${esc(r.cara_bayar || '—')}</td><td style="color:${warna[r.status]};font-weight:bold">${r.status}${r.tgl_batal ? '<br><span class="muted">' + fmtDate(r.tgl_batal) + '</span>' : ''}</td><td>${r.lama ?? '—'}</td><td>${esc(r.update_terakhir)}</td></tr>`).join('')}</table>
  <p class="ket">Keterangan: <b>Reserved</b> = tanda jadi untuk mengunci unit (belum dihitung penjualan) · <b>Booking</b> = booking fee, penjualan diakui pada tanggal ini · <b>Batal</b> = unit kembali ke stok · <b>Konversi</b> = Booking ÷ seluruh konsumen.</p>
  </body></html>`;
}
