'use client';
import { idBookingAktif } from '@/lib/penjualan-aktif';
import { penanggungKinerja } from '@/lib/sales-kinerja';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp, fmtDate, catatUnduh } from '@/components/util';
import Dashboard from '../dashboard/page';

// ===== Menu Report (Manager & CEO): satu filter bersama untuk semua tab =====
const TAB = [['sales', 'Kinerja Sales'], ['penjualan', 'Laporan Penjualan'], ['leads', 'Leads ke Sales'], ['lengkap', 'Report Lengkap'], ['excel', 'Data Excel']];
// Tab per peran: Marcom → Leads ke Sales & Data Excel · Sales → Leads ke Sales (lead miliknya) · Manager & CEO → semua
const tabUntuk = role => role === 'markom' ? TAB.filter(t => ['leads', 'excel'].includes(t[0])) : role === 'sales' ? TAB.filter(t => t[0] === 'leads') : TAB;
const hariIni = () => new Date(Date.now() + 7 * 3600000).toISOString().slice(0, 10); // tanggal WIB (tanpa Intl — aman di semua iPhone)
const awalBulan = () => hariIni().slice(0, 8) + '01';
const rpM = n => !n ? 'Rp 0' : n >= 1e9 ? 'Rp ' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M' : n >= 1e6 ? 'Rp ' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : fmtRp(n);
const WST = { Booking: 'var(--green)', Akad: '#0F5A3A', Batal: 'var(--red)', Reserved: 'var(--brass-deep)', 'Ganti kontrak': 'var(--muted)' };

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
    Promise.all([api('/api/settings'), api('/api/auth/me')]).then(([s, u]) => { setSet(s); setMe(u); if ((s.project || []).length === 1) setProj(s.project[0]);
      const boleh = tabUntuk(u?.role); setTab(tb => boleh.some(x => x[0] === tb) ? tb : boleh[0][0]); }).catch(e => toast(e.message));
  }, []);
  const filterLuar = useMemo(() => ({ d1, d2, proj }), [d1, d2, proj]);

  return (
    <>
      <Toast />
      <div className="page-head"><div><h1>Report</h1>
        <div className="sub">{me?.role === 'markom' ? 'Leads ke Sales (Excel & PDF) dan Data Excel — mengikuti filter di bawah' : me?.role === 'sales' ? 'Leads ke Sales: lead milik Anda beserta ringkasan follow up (Excel & PDF)' : 'Kinerja sales, laporan penjualan, leads ke sales, report lengkap (Word & PDF), dan data Excel — semua mengikuti filter di bawah'}</div></div></div>

      <div className="card rp-filter">
        <div className="field"><label>Dari tanggal</label><input type="date" value={d1} onChange={e => setD1(e.target.value)} /></div>
        <div className="field"><label>Sampai tanggal</label><input type="date" value={d2} onChange={e => setD2(e.target.value)} /></div>
        <div className="field"><label>Project</label>
          <div className="fu-toolbar" style={{ margin: 0 }}>
            {(set.project || []).length !== 1 && <button className={'sort-btn chip-proyek' + (!proj ? ' active' : '')} onClick={() => setProj('')}>Semua</button>}
            {(set.project || []).map(p => <button key={p} className={'sort-btn chip-proyek' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>)}
          </div></div>
        {(tab === 'sales' || tab === 'penjualan' || (tab === 'leads' && me?.role !== 'sales')) && <div className="field"><label>Sales</label>
          <select value={fSales} onChange={e => setFSales(e.target.value)}><option value="">Semua sales</option>{(set.sales || []).map(s => <option key={s}>{s}</option>)}</select></div>}
        <div className="field"><label>Pintasan periode</label>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button className="sort-btn" onClick={() => { setD1(awalBulan()); setD2(hariIni()); }}>Bulan ini</button>
            <button className="sort-btn" onClick={() => { const h = hariIni(); const y = Number(h.slice(0, 4)), m = Number(h.slice(5, 7)); const a = new Date(Date.UTC(y, m - 2, 1)), b = new Date(Date.UTC(y, m - 1, 0)); setD1(a.toISOString().slice(0, 10)); setD2(b.toISOString().slice(0, 10)); }}>Bulan lalu</button>
            <button className="sort-btn" onClick={() => { setD1(''); setD2(''); }}>Semua periode</button>
          </div></div>
      </div>

      <div className="fu-toolbar rp-tabs">{tabUntuk(me?.role).map(([k, l]) => <button key={k} className={'sort-btn tab-utama' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}</button>)}</div>

      {tab === 'sales' && <TabSales proj={proj} d1={d1} d2={d2} fSales={fSales} set={set} />}
      {tab === 'penjualan' && <TabPenjualan proj={proj} d1={d1} d2={d2} fSales={fSales} me={me} />}
      {tab === 'leads' && me && <TabLeads proj={proj} d1={d1} d2={d2} fSales={me.role === 'sales' ? '' : fSales} me={me} />}
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
  // Nama sales disatukan ke akun (nama lengkap in-house → akun, agent Bio sejak Feb 2025 → Esteem, agent Permai → LJH)
  const akun = set.sales || [];
  const leadOf = Object.fromEntries(leads.map(l => [l.lead_code, l]));
  const pjLead = l => penanggungKinerja({ project: l.project, sales: l.sales, tgl: l.tgl }, akun);
  const pjTrx = t => penanggungKinerja({ project: t.project || leadOf[t.lead_code]?.project, sales: t.sales || leadOf[t.lead_code]?.sales, tgl: t.tgl }, akun);
  const fLeads = leads.map(l => ({ ...l, _pj: pjLead(l) })).filter(l => (!proj || l.project === proj) && dlm(l.tgl) && (!fSales || l._pj === fSales));
  const fTrx = trx.map(t => ({ ...t, _pj: pjTrx(t) })).filter(t => (!proj || t.project === proj) && dlm(t.tgl) && (!fSales || t._pj === fSales));
  // Hanya sales yang punya akun (menu Pengguna); lead agent / nama tanpa akun tidak ditampilkan sebagai baris sales
  const salesNames = fSales ? [fSales] : [...(set.sales || [])];
  const aktifId = idBookingAktif(trx); // Booking yang kemudian batal tidak dihitung — sama dengan Laporan Penjualan
  const ST = ['New', 'Cold', 'Warm', 'Hot', 'Appointment', 'Site Visit', 'Drop'];
  return (
    <>
      <div className="hint" style={{ margin: '0 0 10px' }}>Lead yang masuk pada periode · status saat ini dari Database Lead · Reserved &amp; Booking dari transaksi pada periode (Booking yang kemudian batal tidak dihitung, sama dengan Laporan Penjualan) · Closing Rate = Booking ÷ Total Lead · Nama disatukan ke akun: nama lengkap sales in-house → akunnya, agent Bio sejak Feb 2025 → Esteem (kecuali in-house), agent Permai (nama + kantor) → LJH</div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Sales / PIC</th><th className="num">Total</th>{ST.map(s => <th className="num" key={s}>{s}</th>)}
          <th className="num" style={{ color: 'var(--brass)' }}>Reserved</th><th className="num" style={{ color: 'var(--red)' }}>Booking</th><th className="num">Closing Rate</th></tr></thead>
        <tbody>
          {salesNames.length ? salesNames.map(s => {
            const mine = fLeads.filter(l => l._pj === s), c = st => mine.filter(l => l.status === st).length, myTrx = fTrx.filter(t => t._pj === s);
            const resSet = new Set(myTrx.filter(t => t.jenis === 'Reserved').map(t => t.lead_code)), bookSet = new Set(myTrx.filter(t => (t.jenis === 'Booking' || t.jenis === 'Closing') && aktifId.has(t.id)).map(t => t.lead_code + '|' + (t.unit || '')));
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
  const [fStatus, setFStatus] = useState(''); // filter kolom Status di tabel detail
  const [muatUlang, setMuatUlang] = useState(0);
  // Impor buku penjualan resmi (sekali per project; tombol hilang sendiri setelah impor)
  async function imporJual(x0, cek) {
    if (!cek && !confirm(`Impor ${x0.label} (${x0.project})?\n\nKontrak aktif, kontrak batal, ganti kontrak, dan data Proses KPR (bank, AO, status, rencana P3U) yang ada di file disamakan ke CRM. Data yang sudah ada dilengkapi, yang belum ada dibuat. Konsumen yang sudah akad tidak diubah. Setelah impor, tombol ini tidak tampil lagi.`)) return;
    setBusy(true);
    try {
      const x = await api('/api/laporan-penjualan', { method: 'POST', body: JSON.stringify({ aksi: 'impor', project: x0.project, cek }) });
      const daftar = (a, n = 6) => a.length ? a.slice(0, n).join(', ') + (a.length > n ? ` … (+${a.length - n})` : '') : '—';
      alert([`${cek ? 'CEK (belum ada yang diubah)' : 'IMPOR SELESAI'} — buku penjualan ${x.project} per ${x.per}`, '',
        `Kontrak aktif: ${x.aktif.dilengkapi.length} sudah ada di CRM (dilengkapi), ${x.aktif.dibuat.length} ${cek ? 'akan ' : ''}dibuat`,
        `Kontrak batal: ${x.batal.dilengkapi.length} sudah ada, ${x.batal.dibuat.length} ${cek ? 'akan ' : ''}dibuat`,
        x.ganti?.length ? `Ganti kontrak / pindah unit (tidak dihitung batal): ${x.ganti.length} — ${daftar(x.ganti, 5)}` : '',
        `Tanggal akad KPR ${cek ? 'yang akan ' : ''}diperbarui: ${x.akad}`,
        x.kpr ? `Proses KPR (bank, AO, status) ${cek ? 'yang akan ' : ''}diisi: ${x.kpr.diisi.length} konsumen — ${Object.entries(x.kpr.tahap).map(([t, n]) => t + ' ' + n).join(', ')}` : '',
        x.kpr?.tidakKetemu?.length ? `PERLU DICEK — data Proses KPR tidak cocok dengan kontrak aktif: ${daftar(x.kpr.tidakKetemu, 10)}` : '',
        x.kpr?.tanpaData?.length ? `Belum akad tanpa data bank di file (${x.kpr.tanpaData.length}): ${daftar(x.kpr.tanpaData, 8)}` : '',
        x.tandaImporDihapus ? `Tanda stok lama hasil impor ${cek ? 'akan ' : ''}dihapus: ${x.tandaImporDihapus} (status unit kini dari transaksi)` : '',
        x.unitDobel.length ? `PERLU DICEK — unit aktif di CRM atas nama lain dari buku penjualan: ${daftar(x.unitDobel, 10)}` : '',
        x.tidakDiBuku.length ? `PERLU DICEK — tercatat aktif di CRM tetapi tidak ada di buku penjualan: ${daftar(x.tidakDiBuku, 10)}` : ''].filter(Boolean).join('\n'));
      if (!cek) setMuatUlang(n => n + 1);
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  useEffect(() => {
    setD(null);
    api('/api/laporan-penjualan?d1=' + (d1 || '') + '&d2=' + (d2 || '') + '&project=' + encodeURIComponent(proj || '') + '&sales=' + encodeURIComponent(fSales || ''))
      .then(setD).catch(e => toast(e.message));
  }, [proj, d1, d2, fSales, muatUlang]);
  if (!d) return <div className="loading">Menyusun laporan penjualan…</div>;
  // Ganti kontrak tidak ikut dihitung di ringkasan (bukan penjualan baru, bukan batal), tetapi tetap tampil di detail
  const semuaRows = d.rows, rows = semuaRows.filter(r => r.status !== 'Ganti kontrak'), bk = rows.filter(r => r.status === 'Booking'), bt = rows.filter(r => r.status === 'Batal'), rv = rows.filter(r => r.status === 'Reserved');
  const nilai = bk.reduce((a, r) => a + (r.harga || 0), 0), tj = rows.reduce((a, r) => a + (r.nilai_reserved || 0), 0), bf = rows.reduce((a, r) => a + (r.nilai_booking || 0), 0);
  const lama = bk.filter(r => r.lama != null).map(r => r.lama), rata = lama.length ? lama.reduce((a, b) => a + b, 0) / lama.length : 0;
  const periode = (d1 || d2) ? `${d1 ? fmtDate(d1) : 'awal'} – ${d2 ? fmtDate(d2) : 'kini'}` : 'Semua periode';
  const rekap = (key, daftar) => daftar.map(x => { const tt = rows.filter(r => (key === 'bayar' ? (r.bayar || 'Belum diisi').replace(/\s*\d+x$/i, '') === x : (r[key] || '-') === x)); const bb = tt.filter(r => r.status === 'Booking');
    const l = bb.filter(r => r.lama != null).map(r => r.lama);
    return { nama: x, n: tt.length, booking: bb.length, batal: tt.filter(r => r.status === 'Batal').length, reserved: tt.filter(r => r.status === 'Reserved').length, nilai: bb.reduce((a, r) => a + (r.harga || 0), 0), rata: l.length ? l.reduce((a, b) => a + b, 0) / l.length : null }; });
  const perBayar = rekap('bayar', [...new Set(rows.map(r => (r.bayar || 'Belum diisi').replace(/\s*\d+x$/i, '')))]);
  const perProject = rekap('project', [...new Set(rows.map(r => r.project))]);
  const ringkas = { n: rows.length, booking: bk.length, batal: bt.length, batalBk: bt.filter(r => r.tgl_booking).length, batalRv: bt.filter(r => !r.tgl_booking).length, reserved: rv.length, nilai, tj, bf, rata, konversi: rows.length ? bk.length / rows.length : 0 };

  async function unduhExcel() {
    setBusy(true);
    try { await buatExcelPenjualan({ rows: semuaRows, periode, d1, d2, proj, fSales, me, kum: d.kumulatif }); catatUnduh('Report', 'Laporan Penjualan (Excel)'); toast('Excel laporan penjualan terunduh'); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  function unduhPdf() {
    const w = window.open('', '_blank'); if (!w) return toast('Izinkan pop-up untuk membuat PDF, lalu coba lagi');
    w.document.open(); w.document.write(htmlPenjualan({ rows: semuaRows, periode, proj, fSales, ringkas, perBayar, perProject, me, kum: d.kumulatif })); w.document.close();
    w.onload = () => { w.focus(); w.print(); }; setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 900);
    catatUnduh('Report', 'Laporan Penjualan (PDF)'); toast('Jendela cetak terbuka — pilih "Save as PDF" 📄');
  }

  return (
    <>
      <div className="rp-aksi">
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy || !rows.length} onClick={unduhExcel}>⬇ Unduh Excel</button>
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!rows.length} onClick={unduhPdf}>📄 Unduh PDF</button>
        <span className="hint">{rows.length} transaksi · {periode}{proj ? ' · ' + proj : ''}{fSales ? ' · sales ' + fSales : ''}. Kontrak dihitung menurut tanggal penjualannya (tgl Booking; tgl Reserved bila belum Booking), status per hari ini.</span>
      </div>
      {d.kumulatif && <PosisiPenjualan k={d.kumulatif} proj={proj} impor={d.imporTersedia || []} busy={busy} imporJual={imporJual} />}
      <h3 style={{ margin: '18px 0 8px' }}>Penjualan pada periode terpilih · {periode}</h3>
      <div className="rp-kpi">
        {[['Transaksi', ringkas.n, 'semua kontrak Reserved / Booking pada periode'], ['Masih Reserved', ringkas.reserved, 'unit tertahan Reserved hari ini'], ['Booking', ringkas.booking, `penjualan bersih · ${Math.round(ringkas.konversi * 100)}% dari transaksi`],
          ['Batal saat Reserved', ringkas.batalRv, 'batal sebelum sempat Booking'], ['Batal setelah Booking', ringkas.batalBk, 'kontrak Booking yang batal'], ['Nilai penjualan', rpM(nilai), 'harga jual unit Booking']].map(([l, v, k]) => (
          <div key={l} className={'card' + (l === 'Nilai penjualan' ? ' emas' : '')}><span className="hint">{l}</span><b className="rp-besar">{v}</b><span className="hint">{k}</span></div>))}
      </div>
      <p className="hint" style={{ margin: '8px 0 14px' }}>Tanda jadi Reserved diterima <b>{fmtRp(tj)}</b> · Booking fee tercatat <b>{fmtRp(bf)}</b> <span title="Kontrak hasil impor data lama tidak memuat BF, jadi tidak dihitung">(hanya BF yang terkonfirmasi)</span></p>

      <div className="rp-grid2">
        <div className="card"><h3 style={{ marginTop: 0 }}>Per cara bayar</h3><TabelRekap rows={perBayar} total /></div>
        <div className="card"><h3 style={{ marginTop: 0 }}>Per project</h3><TabelRekap rows={perProject} konversi /></div>
      </div>

      <div className="card" style={{ marginTop: 12 }}>
        <h3 style={{ marginTop: 0 }}>Detail transaksi</h3>
        <div className="hint" style={{ marginBottom: 8 }}>Satu baris = satu konsumen/unit. Tanggal Reserved tampil di kolom Status bila konsumen sempat Reserved. Kolom terakhir = update status terakhir (akad / rencana akad / proses KPR / cara bayar cash).</div>
        {semuaRows.length ? <div className="tbl-wrap tbl-compact rp-detail"><table>
          <thead><tr><th>No</th><th>Konsumen</th><th>Project · Unit</th><th>Sales</th><th>Booking</th><th className="num">Harga jual</th><th>Cara bayar</th>
            <th><select className="rp-filter-status" value={fStatus} onChange={e => setFStatus(e.target.value)} aria-label="Saring status">
              <option value="">Status: semua ({semuaRows.length})</option>
              {[['Akad', 'Akad (sudah akad)'], ['Booking', 'Booking (belum akad)'], ['Batal', 'Batal'], ['Ganti kontrak', 'Ganti kontrak'], ['Reserved', 'Reserved']].map(([st, l]) => { const n = semuaRows.filter(x => (x.status_tampil || x.status) === st).length; return n ? <option key={st} value={st}>{l} ({n})</option> : null; })}
            </select></th><th>Update status terakhir</th></tr></thead>
          <tbody>{semuaRows.filter(r => !fStatus || (r.status_tampil || r.status) === fStatus).map((r, i) => (<tr key={r.lead_code + r.unit + '#' + (r.seg || 0)}>
            <td data-label="No">{i + 1}</td>
            <td data-label="Konsumen"><b>{r.nama}</b><span className="sub2">{r.lead_code} · {r.sumber}</span></td>
            <td data-label="Project · Unit">{r.project}<span className="sub2">{r.unit} {r.tipe ? '· ' + r.tipe : ''}</span></td>
            <td data-label="Sales">{r.sales || '—'}</td>
            <td data-label="Booking">{r.tgl_booking ? <>{fmtDate(r.tgl_booking)}{r.nilai_booking ? <span className="sub2" title={r.bf_sumber ? 'Sumber: ' + r.bf_sumber : ''}>BF {fmtRp(r.nilai_booking)}</span> : null}</> : '—'}</td>
            <td className="num" data-label="Harga jual">{fmtRp(r.harga)}</td>
            <td data-label="Cara bayar">{r.cara_bayar || '—'}</td>
            <td data-label="Status"><b style={{ color: WST[r.status_tampil || r.status] }}>{r.status_tampil || r.status}</b>{r.akad ? <span className="sub2">{fmtDate(r.akad)}</span> : null}{r.tgl_batal ? <span className="sub2">{fmtDate(r.tgl_batal)}</span> : null}{r.tgl_reserved ? <span className="sub2">Reserved {fmtDate(r.tgl_reserved)}</span> : null}</td>
            <td data-label="Update status terakhir">{r.update_terakhir}</td></tr>))}</tbody></table></div>
          : <p className="hint">Tidak ada transaksi pada filter ini.</p>}
      </div>
    </>
  );
}
// ===== Posisi penjualan kumulatif s.d. hari ini — Reserved, Booking, Batal, penjualan bersih =====
function PosisiPenjualan({ k, proj, impor = [], busy, imporJual }) {
  const b = k.batalBooking, p = k.penjualan;
  return (<div className="card rp-posisi">
    <div className="bd-head" style={{ flexWrap: 'wrap', gap: 8 }}><h3 style={{ margin: 0 }}>Posisi penjualan s.d. {fmtDate(k.per)}{proj ? ' · ' + proj : ' · semua project'}</h3>

      {impor.map(x => <span key={x.project} style={{ display: 'inline-flex', gap: 6 }}><button className="sort-btn" disabled={busy} onClick={() => imporJual(x, true)}>🔍 Cek buku penjualan {x.project}</button>
        <button className="sort-btn" style={{ borderColor: 'var(--green)', color: 'var(--green)', fontWeight: 700 }} disabled={busy} onClick={() => imporJual(x, false)}>{busy ? '⏳…' : `⬆ Impor ${x.project}: ${x.kpr ? 'penjualan & Proses KPR' : 'buku penjualan'} (${fmtDate(x.per)})`}</button></span>)}</div>
    <div className="rp-kpi" style={{ gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
      <div className="card emas"><span className="hint">Total penjualan (bersih)</span><b className="rp-besar">{p.n} unit</b><span className="hint">{rpM(p.nilai)} nilai kontrak{p.cash ? ' · harga cash ' + rpM(p.cash) : ''}</span></div>
      <div className="card"><span className="hint">Booking tercatat</span><b className="rp-besar">{k.bookingTercatat.n}</b><span className="hint">{rpM(k.bookingTercatat.nilai)} · {p.n} aktif + {b.n} batal</span></div>
      <div className="card"><span className="hint">Batal</span><b className="rp-besar" style={{ color: 'var(--red)' }}>{b.n + k.batalReserved.n}</b><span className="hint">{b.n} setelah Booking (nilai kontrak {rpM(b.nilai)}) · {k.batalReserved.n} saat Reserved{k.gantiKontrak?.n ? ` · ${k.gantiKontrak.n} ganti kontrak tidak dihitung` : ''}</span></div>
      <div className="card"><span className="hint">Reserved aktif</span><b className="rp-besar">{k.reserved.n}</b><span className="hint">{k.reserved.n ? rpM(k.reserved.nilai) + ' · belum diakui penjualan' : 'tidak ada unit tertahan Reserved'}</span></div>
    </div>
    <div className="rp-grid2" style={{ marginTop: 10 }}>
      <div><b style={{ fontSize: 13 }}>Penjualan bersih menurut cara bayar & akad</b>
        <div className="tbl-wrap tbl-compact" style={{ marginTop: 6 }}><table><tbody>
          <tr><td>KPR</td><td className="num"><b>{p.kpr}</b> unit</td><td className="hint">{p.akad} sudah akad · {p.belumAkad} belum akad</td></tr>
          <tr><td>Cash bertahap / cicilan</td><td className="num"><b>{p.bertahap}</b> unit</td><td className="hint">dibayar bertahap ke developer</td></tr>
          {p.keras ? <tr><td>Cash keras</td><td className="num"><b>{p.keras}</b> unit</td><td></td></tr> : null}
        </tbody></table></div></div>
      <div style={{ gridColumn: '1 / -1' }}><b style={{ fontSize: 13 }}>Batal setelah Booking</b>
        <div className="tbl-wrap tbl-compact" style={{ marginTop: 6 }}><table>
          <thead><tr><th>Jenis</th><th className="num">Kontrak</th><th className="num">Nilai kontrak</th><th className="num">Uang dibayar konsumen</th><th className="num">Hangus</th><th className="num">Dikembalikan</th></tr></thead>
          <tbody>
          <tr><td data-label="Jenis">Non-refund</td><td className="num" data-label="Kontrak"><b>{b.nonrefund}</b></td><td className="num" data-label="Nilai kontrak">{rpM(b.nilaiNonrefund)}</td><td className="num" data-label="Dibayar">{fmtRp(b.danaNonrefund?.dibayar)}</td><td className="num" data-label="Hangus">{fmtRp(b.danaNonrefund?.hangus)}</td><td className="num" data-label="Dikembalikan">—</td></tr>
          <tr><td data-label="Jenis">Refund</td><td className="num" data-label="Kontrak"><b>{b.refund}</b></td><td className="num" data-label="Nilai kontrak">{rpM(b.nilaiRefund)}</td><td className="num" data-label="Dibayar">{fmtRp(b.danaRefund?.dibayar)}</td><td className="num" data-label="Hangus">{fmtRp(b.danaRefund?.hangus)}</td><td className="num" data-label="Dikembalikan">{fmtRp(b.danaRefund?.dikembalikan)}</td></tr>
          {b.n - b.nonrefund - b.refund > 0 ? <tr><td data-label="Jenis">Belum ditandai</td><td className="num" data-label="Kontrak"><b>{b.n - b.nonrefund - b.refund}</b></td><td colSpan={4}></td></tr> : null}
          <tr style={{ fontWeight: 700 }}><td data-label="Jenis">Total</td><td className="num" data-label="Kontrak">{b.n}</td><td className="num" data-label="Nilai kontrak">{rpM(b.nilai)}</td><td className="num" data-label="Dibayar">{fmtRp(b.dibayar)}</td><td className="num" data-label="Hangus">{fmtRp(b.hangus)}</td><td className="num" data-label="Dikembalikan">{fmtRp(b.dikembalikan)}</td></tr>
        </tbody></table></div></div>
    </div>
    {k.perTahun.length > 0 && <div className="tbl-wrap tbl-compact" style={{ marginTop: 10 }}><table>
      <thead><tr><th>Tahun penjualan</th><th className="num">Transaksi</th><th className="num">Masih Reserved</th><th className="num">Booking berjalan</th><th className="num">Nilai Booking</th><th className="num">Batal saat Reserved</th><th className="num">Batal setelah Booking</th><th className="num">Nilai batal Booking</th></tr></thead>
      <tbody>{[...k.perTahun.map(t => ({ ...t, label: t.tahun })), k.perTahun.reduce((a, t) => ({ label: 'Total', total: true, reserved: a.reserved + (t.reserved || 0), aktif: a.aktif + t.aktif, nilaiAktif: a.nilaiAktif + t.nilaiAktif, batalReserved: a.batalReserved + t.batalReserved, batal: a.batal + t.batal, nilaiBatal: a.nilaiBatal + t.nilaiBatal }), { reserved: 0, aktif: 0, nilaiAktif: 0, batalReserved: 0, batal: 0, nilaiBatal: 0 })].map(t => (
        <tr key={t.label} style={t.total ? { fontWeight: 700 } : undefined}><td data-label="Tahun"><b>{t.label}</b></td>
          <td className="num" data-label="Transaksi"><b>{(t.reserved || 0) + t.aktif + t.batalReserved + t.batal}</b></td>
          <td className="num" data-label="Reserved">{t.reserved || 0}</td>
          <td className="num" data-label="Booking"><b>{t.aktif}</b></td>
          <td className="num" data-label="Nilai Booking"><b>{rpM(t.nilaiAktif)}</b></td>
          <td className="num" data-label="Batal Reserved" style={{ color: t.batalReserved ? 'var(--red)' : undefined }}>{t.batalReserved}</td>
          <td className="num" data-label="Batal Booking" style={{ color: t.batal ? 'var(--red)' : undefined }}>{t.batal}</td>
          <td className="num" data-label="Nilai batal Booking">{rpM(t.nilaiBatal)}</td></tr>))}</tbody></table></div>}
    <p className="hint" style={{ margin: '8px 0 0' }}>Nilai kontrak = harga unit di kontrak yang batal (bukan uang yang dikembalikan). Uang dibayar, hangus, dan dikembalikan = dana yang benar-benar diterima dan dikembalikan ke konsumen, sesuai buku penjualan. {k.gantiKontrak?.n ? <><b>Ganti kontrak ({k.gantiKontrak.n}):</b> {k.gantiKontrak.nama.join(', ')} — kontrak lama dibatalkan untuk ikut program PPN lalu langsung diganti kontrak baru konsumen yang sama; bukan penjualan baru dan bukan batal. </> : null}Total penjualan bersih = kontrak Booking yang masih berjalan per hari ini (nilai kontrak termasuk PPN). Booking tercatat = semua kontrak yang pernah Booking, termasuk yang kemudian batal, tanpa ganti kontrak. Tabel per tahun dikelompokkan menurut tahun penjualan (tanggal Booking; tanggal Reserved bila belum Booking): Semua kolom adalah posisi per hari ini dan tidak saling tumpang tindih: Transaksi = Masih Reserved + Booking berjalan + Batal saat Reserved + Batal setelah Booking. "Masih Reserved" = unit yang hari ini masih tertahan Reserved (bukan jumlah yang pernah Reserved); reservasi yang batal ada di kolom "Batal saat Reserved". Kontrak tahun lalu yang batal tahun ini tetap dihitung di tahun penjualannya. Filter periode di bawah memakai aturan yang sama, sehingga kartu "Penjualan pada periode terpilih" untuk satu tahun penuh selalu sama dengan baris tahun itu. Bagian ini tidak terpengaruh filter periode.</p>
  </div>);
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

// ---------- Excel: Posisi s.d. hari ini, Kontrak Batal, Ringkasan (rumus), Detail, Proses KPR, Keterangan ----------
async function buatExcelPenjualan({ rows, periode, d1, d2, proj, fSales, me, kum }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); wb.creator = 'CRM Sales CHL';
  const HIJAU = 'FF12302A', EMAS = 'FFE2BE7A', KREM = 'FFF5F2EA', GARIS = 'FFE6E1D5';
  const RP = '"Rp" #,##0;("Rp" #,##0);"-"', TGL = 'dd mmm yyyy', PCT = '0.0%';
  const tgl = s => s ? new Date(s + 'T00:00:00') : null;
  const judul = (ws, t, sub) => { ws.getCell('A1').value = t; ws.getCell('A1').font = { name: 'Arial', bold: true, size: 14, color: { argb: HIJAU } }; if (sub) { ws.getCell('A2').value = sub; ws.getCell('A2').font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF5B6E66' } }; } };
  const head = (ws, row, cols) => { const r = ws.getRow(row); cols.forEach((c, i) => { const x = r.getCell(i + 1); x.value = c; x.font = { name: 'Arial', bold: true, color: { argb: EMAS }, size: 10 }; x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HIJAU } }; x.alignment = { wrapText: true, vertical: 'middle' }; }); r.height = 30; };
  const rapikan = (ws, r, nCol, zebra) => { const row = ws.getRow(r); for (let c = 1; c <= nCol; c++) { const x = row.getCell(c); x.font = { ...(x.font || {}), name: 'Arial', size: x.font?.size || 10 }; x.alignment = { ...(x.alignment || {}), vertical: 'top', wrapText: true }; x.border = { top: { style: 'thin', color: { argb: GARIS } }, bottom: { style: 'thin', color: { argb: GARIS } }, left: { style: 'thin', color: { argb: GARIS } }, right: { style: 'thin', color: { argb: GARIS } } }; if (zebra) x.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: KREM } }; } };
  const sub = `${periode}${proj ? ' · ' + proj : ' · semua project'}${fSales ? ' · sales ' + fSales : ''} · dibuat ${new Date().toLocaleString('id-ID')} oleh ${me?.name || ''}`;

  // ---- Posisi s.d. hari ini (kumulatif, tidak terpengaruh periode) ----
  if (kum) {
    const ps = wb.addWorksheet('Posisi s.d. Hari Ini');
    judul(ps, `Posisi Penjualan s.d. ${fmtDate(kum.per)}`, `${proj || 'Semua project'}${fSales ? ' · sales ' + fSales : ''} · kumulatif sejak awal penjualan · dibuat ${new Date().toLocaleString('id-ID')} oleh ${me?.name || ''}`);
    head(ps, 4, ['Komponen', 'Jumlah', 'Nilai (Rp)', 'Keterangan']);
    const b = kum.batalBooking, p = kum.penjualan;
    const isi = [
      ['Total penjualan bersih (Booking aktif)', p.n, p.nilai, 'Nilai kontrak termasuk PPN' + (p.cash ? ` · harga cash ${fmtRp(p.cash)}` : '')],
      ['   KPR — sudah akad', p.akad, null, ''], ['   KPR — belum akad', p.belumAkad, null, ''], ['   Cash bertahap / cicilan', p.bertahap, null, ''], ['   Cash keras', p.keras, null, ''],
      ['Reserved aktif', kum.reserved.n, kum.reserved.nilai, 'Belum diakui sebagai penjualan'],
      ['Booking tercatat (aktif + batal)', kum.bookingTercatat.n, kum.bookingTercatat.nilai, 'Semua kontrak yang pernah Booking'],
      ['Batal setelah Booking (nilai kontrak)', b.n, b.nilai, `Non-refund ${b.nonrefund} · refund ${b.refund}`],
      ['   Non-refund (nilai kontrak)', b.nonrefund, b.nilaiNonrefund, `Uang dibayar ${fmtRp(b.danaNonrefund?.dibayar)} · hangus ${fmtRp(b.danaNonrefund?.hangus)}`],
      ['   Refund (nilai kontrak)', b.refund, b.nilaiRefund, `Uang dibayar ${fmtRp(b.danaRefund?.dibayar)} · hangus ${fmtRp(b.danaRefund?.hangus)} · dikembalikan ${fmtRp(b.danaRefund?.dikembalikan)}`],
      ['   Dana dibayar konsumen yang batal', null, b.dibayar, ''], ['   Dana hangus (pendapatan)', null, b.hangus, ''], ['   Dana dikembalikan', null, b.dikembalikan, ''],
      ['Batal saat Reserved', kum.batalReserved.n, kum.batalReserved.nilai, 'Belum sempat Booking'],
      ['Ganti kontrak (tidak dihitung)', kum.gantiKontrak?.n || 0, null, (kum.gantiKontrak?.nama || []).join(', ') || '—'],
    ];
    isi.forEach((x, i) => { const row = ps.getRow(5 + i); x.forEach((v, c) => { row.getCell(c + 1).value = v; }); row.getCell(3).numFmt = RP; rapikan(ps, 5 + i, 4, i % 2); if (!String(x[0]).startsWith('   ')) row.getCell(1).font = { name: 'Arial', bold: true, size: 10 }; });
    const t0 = 5 + isi.length + 2;
    head(ps, t0, ['Tahun penjualan', 'Transaksi', 'Masih Reserved', 'Booking berjalan', 'Nilai Booking (Rp)', 'Batal saat Reserved', 'Batal setelah Booking', 'Nilai batal Booking (Rp)']);
    kum.perTahun.forEach((t, i) => { const row = ps.getRow(t0 + 1 + i); [t.tahun, (t.reserved || 0) + t.aktif + t.batalReserved + t.batal, t.reserved || 0, t.aktif, t.nilaiAktif, t.batalReserved, t.batal, t.nilaiBatal].forEach((v, c) => { row.getCell(c + 1).value = v; }); [5, 8].forEach(c => { row.getCell(c).numFmt = RP; }); rapikan(ps, t0 + 1 + i, 8, i % 2); });
    [44, 16, 22, 44, 20, 18, 20, 16].forEach((w, i) => { ps.getColumn(i + 1).width = w; });
    // Daftar kontrak batal
    const kb = wb.addWorksheet('Kontrak Batal');
    judul(kb, 'Kontrak Batal — setelah Booking dan saat Reserved', 'Seluruh pembatalan sejak awal penjualan');
    head(kb, 4, ['No', 'Konsumen', 'Unit', 'No Kontrak', 'Tgl Booking / Reserved', 'Tgl Batal', 'Batal saat', 'Jenis', 'Nilai Kontrak (Rp)', 'Dibayar (Rp)', 'Hangus (Rp)', 'Dikembalikan (Rp)', 'Alasan', 'Sales / Agent']);
    rows.filter(x => x.status === 'Batal' || x.status === 'Ganti kontrak').sort((a, c) => String(a.tgl_batal).localeCompare(String(c.tgl_batal))).forEach((x, i) => {
      const row = kb.getRow(5 + i);
      [i + 1, x.nama, x.unit, x.no_kontrak || '', tgl(x.tgl_booking || x.tgl_reserved), tgl(x.tgl_batal), x.status === 'Ganti kontrak' ? 'Ganti kontrak' : x.tgl_booking ? 'Setelah Booking' : 'Reserved', x.batal_refund === true ? 'Refund' : x.batal_refund === false ? 'Non-refund' : '', x.harga || null, x.dana_dibayar, x.dana_hangus, x.dana_refund, x.alasan_batal || '', x.sales || '']
        .forEach((v, c) => { row.getCell(c + 1).value = v; });
      [5, 6].forEach(c => { row.getCell(c).numFmt = TGL; }); [9, 10, 11, 12].forEach(c => { row.getCell(c).numFmt = RP; }); rapikan(kb, 5 + i, 14, i % 2);
    });
    [5, 26, 15, 20, 14, 12, 15, 12, 18, 15, 15, 16, 34, 26].forEach((w, i) => { kb.getColumn(i + 1).width = w; });
  }
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
    ['Konversi', { formula: 'IFERROR(B9/B8,0)' }, PCT, 'Booking bersih ÷ seluruh kontrak'],
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
  rs.getCell(`A${b2 + 2}`).value = 'Catatan: penjualan diakui pada tanggal Booking (bukan Reserved); kontrak masuk periode menurut tanggal penjualannya, jadi kontrak tahun lalu yang batal tahun ini tidak masuk periode ini. Satu unit dihitung sekali. Status terakhir = kejadian paling akhir (Batal > Booking > Reserved).'; rs.getCell(`A${b2 + 2}`).font = { name: 'Arial', italic: true, size: 9, color: { argb: 'FF5B6E66' } };
  [40, 18, 48, 10, 15, 22, 12].forEach((w, i) => { rs.getColumn(i + 1).width = w; }); rs.views = [{ showGridLines: false }];

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
function htmlPenjualan({ rows, periode, proj, fSales, ringkas, perBayar, perProject, me, kum }) {
  const esc = s => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;');
  const warna = { Booking: '#1E6A4C', Akad: '#0F5A3A', Batal: '#B4482A', Reserved: '#7A5414', 'Ganti kontrak': '#5B6E66' };
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
  ${kum ? `<h2>Posisi penjualan s.d. ${fmtDate(kum.per)}</h2>
  <div class="kpi" style="grid-template-columns:repeat(4,1fr)">${[['Total penjualan bersih', kum.penjualan.n + ' unit', rpM(kum.penjualan.nilai) + ' nilai kontrak'], ['Booking tercatat', kum.bookingTercatat.n, rpM(kum.bookingTercatat.nilai) + ' · aktif + batal'], ['Batal', kum.batalBooking.n + kum.batalReserved.n, kum.batalBooking.n + ' setelah Booking · ' + kum.batalReserved.n + ' saat Reserved' + (kum.gantiKontrak?.n ? ' · ' + kum.gantiKontrak.n + ' ganti kontrak tidak dihitung' : '')], ['Reserved aktif', kum.reserved.n, kum.reserved.n ? rpM(kum.reserved.nilai) : 'tidak ada']]
    .map(([l, v, k], i) => `<div class="${i === 0 ? 'emas' : ''}"><span class="muted">${l}</span><b>${v}</b><span class="muted">${k}</span></div>`).join('')}</div>
  <p class="muted">KPR ${kum.penjualan.kpr} unit (${kum.penjualan.akad} sudah akad, ${kum.penjualan.belumAkad} belum akad) · cash bertahap ${kum.penjualan.bertahap} unit${kum.penjualan.keras ? ' · cash keras ' + kum.penjualan.keras + ' unit' : ''}. Batal setelah Booking: non-refund ${kum.batalBooking.nonrefund} kontrak (nilai kontrak ${rpM(kum.batalBooking.nilaiNonrefund)}), refund ${kum.batalBooking.refund} kontrak (nilai kontrak ${rpM(kum.batalBooking.nilaiRefund)}). Uang dari konsumen yang batal: dibayar ${fmtRp(kum.batalBooking.dibayar)}, hangus ${fmtRp(kum.batalBooking.hangus)}, dikembalikan ${fmtRp(kum.batalBooking.dikembalikan)}.</p>
  <table><tr><th>Tahun penjualan</th><th class="r">Transaksi</th><th class="r">Masih Reserved</th><th class="r">Booking berjalan</th><th class="r">Nilai Booking</th><th class="r">Batal saat Reserved</th><th class="r">Batal setelah Booking</th><th class="r">Nilai batal Booking</th></tr>${kum.perTahun.map(t => `<tr><td><b>${t.tahun}</b></td><td class="r"><b>${(t.reserved || 0) + t.aktif + t.batalReserved + t.batal}</b></td><td class="r">${t.reserved || 0}</td><td class="r"><b>${t.aktif}</b></td><td class="r"><b>${rpM(t.nilaiAktif)}</b></td><td class="r">${t.batalReserved}</td><td class="r">${t.batal}</td><td class="r">${rpM(t.nilaiBatal)}</td></tr>`).join('')}</table>
  <p class="muted">Per tahun penjualan (tanggal Booking; Reserved bila belum Booking): Transaksi = Masih Reserved + Booking berjalan + Batal saat Reserved + Batal setelah Booking. Kontrak tahun lalu yang batal tahun ini tetap dihitung di tahun penjualannya.</p>` : ''}
  <h2>Ringkasan penjualan · ${esc(periode)}</h2>
  <div class="kpi">${[['Transaksi', ringkas.n, 'semua kontrak Reserved / Booking pada periode'], ['Masih Reserved', ringkas.reserved, 'tertahan Reserved hari ini'], ['Booking', ringkas.booking, 'penjualan bersih · ' + Math.round(ringkas.konversi * 100) + '% dari transaksi'], ['Batal saat Reserved', ringkas.batalRv, 'batal sebelum sempat Booking'], ['Batal setelah Booking', ringkas.batalBk, 'kontrak Booking yang batal'], ['Nilai penjualan', rpM(ringkas.nilai), 'harga jual unit Booking']]
    .map(([l, v, k], i) => `<div class="${i === 5 ? 'emas' : ''}"><span class="muted">${l}</span><b>${v}</b><span class="muted">${k}</span></div>`).join('')}</div>
  <p class="muted">Tanda jadi Reserved diterima <b>${fmtRp(ringkas.tj)}</b> · Booking fee tercatat <b>${fmtRp(ringkas.bf)}</b> (hanya BF yang terkonfirmasi)</p>
  <div class="dua"><div>${rek('Per cara bayar', perBayar, false)}</div><div>${rek('Per project', perProject, true)}</div></div>
  ${(() => {
    // Konsumen KPR yang masih proses (Booking, belum akad) beserta status terakhirnya
    const pk = rows.filter(r => r.proses_kpr).sort((a, b) => String(a.tgl_booking || '').localeCompare(String(b.tgl_booking || '')));
    if (!pk.length) return '';
    const hariIni = new Date().toISOString().slice(0, 10);
    const lama = t => t ? Math.max(0, Math.round((Date.parse(hariIni) - Date.parse(t)) / 86400000)) : '';
    const perTahap = {}; pk.forEach(r => { const l = r.kpr?.akad_tgl ? 'SP3K / rencana akad' : (r.kpr?.label || 'Belum dicatat'); perTahap[l] = (perTahap[l] || 0) + 1; });
    return `<h2 style="page-break-before:always">Proses KPR berjalan · ${pk.length} konsumen</h2>
  <p class="muted">Booking dengan cara bayar KPR yang belum akad, diurutkan dari Booking terlama. Per tahap: ${Object.entries(perTahap).map(([l, n]) => `${esc(l)} ${n}`).join(' · ')}.</p>
  <table><tr><th>No</th><th>Konsumen</th><th>Project · Unit</th><th>Sales</th><th>Booking</th><th class="r">Hari sejak Booking</th><th>Status KPR terakhir</th></tr>
  ${pk.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.nama)}</b><br><span class="muted">${esc(r.lead_code)}</span></td><td>${esc(r.project)}<br>${esc(r.unit)}</td><td>${esc(r.sales || '—')}</td><td>${fmtDate(r.tgl_booking)}</td><td class="r">${lama(r.tgl_booking)}</td><td>${esc(r.update_terakhir)}</td></tr>`).join('')}</table>`;
  })()}
  <h2 style="page-break-before:always">Detail transaksi</h2>
  <p class="muted">Satu baris = satu konsumen/unit. Tanggal Reserved tampil di kolom Status bila konsumen sempat Reserved. Kolom terakhir = update status terakhir (akad / rencana akad / proses KPR / cara bayar cash).</p>
  <table><tr><th>No</th><th>Konsumen</th><th>Project · Unit</th><th>Sales</th><th>Booking</th><th>Harga jual</th><th>Cara bayar</th><th>Status</th><th>Update status terakhir</th></tr>
  ${rows.map((r, i) => `<tr><td>${i + 1}</td><td><b>${esc(r.nama)}</b><br><span class="muted">${esc(r.lead_code)} · ${esc(r.sumber)}</span></td><td>${esc(r.project)}<br>${esc(r.unit)} ${r.tipe ? '· ' + esc(r.tipe) : ''}</td><td>${esc(r.sales || '—')}</td>
    <td>${r.tgl_booking ? fmtDate(r.tgl_booking) + (r.nilai_booking ? '<br><span class="muted">BF ' + fmtRp(r.nilai_booking) + '</span>' : '') : '—'}</td>
    <td>${fmtRp(r.harga)}</td><td>${esc(r.cara_bayar || '—')}</td><td style="color:${warna[r.status_tampil || r.status]};font-weight:bold">${r.status_tampil || r.status}${r.akad ? '<br><span class="muted">' + fmtDate(r.akad) + '</span>' : ''}${r.tgl_batal ? '<br><span class="muted">' + fmtDate(r.tgl_batal) + '</span>' : ''}${r.tgl_reserved ? '<br><span class="muted">Reserved ' + fmtDate(r.tgl_reserved) + '</span>' : ''}</td><td>${esc(r.update_terakhir)}</td></tr>`).join('')}</table>
  <p class="ket">Keterangan: <b>Reserved</b> = tanda jadi untuk mengunci unit (belum dihitung penjualan) · <b>Booking</b> = booking fee, penjualan diakui pada tanggal ini · <b>Akad</b> = Booking KPR yang akadnya sudah terealisasi (tetap dihitung sebagai Booking) · <b>Batal</b> = unit kembali ke stok · <b>Konversi</b> = Booking bersih ÷ seluruh kontrak · Kontrak dihitung menurut tanggal penjualannya (tgl Booking; tgl Reserved bila belum Booking), status per hari ini.</p>
  </body></html>`;
}

// ===== Leads ke Sales: lead yang dipegang sales + ringkasan hasil follow up terakhir (Marcom, Sales, Manager, CEO) =====
const WARNA_LS = { kuning: '#FFF5B5', merah: '#F9DCDC' };
const CHIP_LS = { Cold: ['#E8EEF0', '#41606B'], Warm: ['#FCEFD9', '#8A5F14'], Hot: ['#FDE3D0', '#B4482A'], Appointment: ['#DDEFE4', '#1E6A4C'], 'Site Visit': ['#DDEFE4', '#1E6A4C'], Drop: ['#F3DADA', '#9B2C2C'], New: ['#EEF2F6', '#3D5568'] };
function TabLeads({ proj, d1, d2, fSales, me }) {
  const [d, setD] = useState(null);
  const [fSumber, setFSumber] = useState('');
  const [fSt, setFSt] = useState('');
  const [buka, setBuka] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setD(null);
    const q = new URLSearchParams(); if (d1) q.set('d1', d1); if (d2) q.set('d2', d2); if (proj) q.set('project', proj); if (fSales) q.set('sales', fSales);
    api('/api/leads-sales?' + q.toString()).then(setD).catch(e => toast(e.message));
  }, [proj, d1, d2, fSales]);
  if (!d) return <div className="loading">Menyusun laporan leads ke sales…</div>;
  const rows0 = d.rows.filter(r => (!fSumber || r.sumber === fSumber) && (!fSt || (fSt === 'kuning' || fSt === 'merah' ? r.warna === fSt : r.status === fSt)));
  const rows = rows0.map((r, i) => ({ ...r, no: i + 1 })); // nomor urut mulai 1 per periode
  const sumberAda = [...new Set(d.rows.map(r => r.sumber).filter(Boolean))].sort();
  const statusAda = [...new Set(d.rows.map(r => r.status).filter(Boolean))];
  const judul = `Leads Sales ${d1 ? fmtDate(d1) : 'awal'} – ${d2 ? fmtDate(d2) : 'hari ini'}${proj ? ' · ' + proj : ''}${fSales ? ' · ' + fSales : ''}${me.role === 'sales' ? ' · ' + me.name : ''}`;
  const per = {}; rows.forEach(r => { per[r.sales] = (per[r.sales] || 0) + 1; });
  const R = { total: rows.length, kuning: rows.filter(r => r.warna === 'kuning').length, batal: rows.filter(r => r.warna === 'merah' && !['Drop', 'Lost'].includes(r.status)).length,
    drop: rows.filter(r => ['Drop', 'Lost'].includes(r.status)).length, dom: rows.filter(r => !r.domisili).length, belum: rows.filter(r => !r.nFu).length };
  function unduhPdf() {
    const w = window.open('', '_blank'); if (!w) { toast('Izinkan pop-up untuk mengunduh PDF'); return; }
    w.document.open(); w.document.write(htmlLeads({ rows, judul, R, per, me })); w.document.close();
    catatUnduh('Leads ke Sales (PDF)', judul);
  }
  async function unduhExcel() {
    setBusy(true);
    try { await excelLeads({ rows, judul, R, per, me }); catatUnduh('Leads ke Sales (Excel)', judul); } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  return (<>
    <div className="fu-toolbar" style={{ alignItems: 'center' }}>
      <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!rows.length || busy} onClick={unduhExcel}>{busy ? '⏳ Menyusun…' : '⬇ Unduh Excel'}</button>
      <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!rows.length} onClick={unduhPdf}>📄 Unduh PDF</button>
      <select className="sort-filter" value={fSumber} onChange={e => setFSumber(e.target.value)}><option value="">Semua sumber</option>{sumberAda.map(x => <option key={x}>{x}</option>)}</select>
      <select className="sort-filter" value={fSt} onChange={e => setFSt(e.target.value)}><option value="">Semua status</option><option value="kuning">🟨 Janjian / Hot</option><option value="merah">🟥 Drop / janji batal</option>{statusAda.map(x => <option key={x} value={x}>{x}</option>)}</select>
      <span className="hint">Periode = tanggal lead masuk · hanya lead yang sudah dipegang sales{me.role === 'sales' ? ' (lead milik Anda)' : ''}</span>
    </div>
    <div className="card ls-card">
      <div className="bd-head" style={{ flexWrap: 'wrap', gap: 8 }}><h3 style={{ margin: 0 }}>{judul}</h3><span className="hint">diurutkan dari tanggal lead masuk · nomor urut per periode</span></div>
      <div className="ls-ring"><span><b>{R.total}</b> lead</span>{me.role !== 'sales' && Object.entries(per).map(([k, v]) => <span key={k}><b>{v}</b> {k}</span>)}<span><b>{R.kuning}</b> janjian / hot</span><span><b>{R.batal}</b> janji batal</span><span><b>{R.drop}</b> drop</span><span><b>{R.dom}</b> domisili belum diisi</span>{R.belum ? <span style={{ color: 'var(--red)' }}><b>{R.belum}</b> belum di-follow up</span> : null}</div>
      <div className="ls-leg"><span><i style={{ background: WARNA_LS.kuning }} />Janjian / Hot — siap visit</span><span><i style={{ background: WARNA_LS.merah }} />Drop atau janjian batal</span><span><i style={{ background: 'var(--card)' }} />Masih follow up</span><span>· klik keterangan untuk membaca utuh</span></div>
      {rows.length ? <div className="tbl-wrap tbl-compact ls-tbl"><table>
        <thead><tr><th>No</th><th>Hari</th><th>Tanggal</th><th>Sumber</th><th>WhatsApp</th><th>Nama</th>{me.role !== 'sales' && <th>Sales</th>}<th>Domisili</th><th>Status</th><th>Keterangan (ringkasan follow up)</th></tr></thead>
        <tbody>{rows.map(r => { const c = CHIP_LS[r.status] || ['#EEF2F6', '#3D5568']; return (<tr key={r.lead_code} className={'ls-' + (r.warna || 'biasa')}>
          <td data-label="No">{r.no}</td><td data-label="Hari">{r.hari}</td><td data-label="Tanggal" style={{ whiteSpace: 'nowrap' }}>{fmtDate(r.tgl)}</td><td data-label="Sumber">{r.sumber || '—'}</td>
          <td data-label="WhatsApp" style={{ whiteSpace: 'nowrap' }}>{r.wa ? <a href={'https://wa.me/' + String(r.wa).replace(/[^0-9]/g, '').replace(/^0/, '62')} target="_blank" rel="noreferrer">{r.wa}</a> : '—'}</td>
          <td data-label="Nama"><a href={'/leads?lead=' + encodeURIComponent(r.lead_code)} className="jj-nama">{r.nama}</a></td>{me.role !== 'sales' && <td data-label="Sales">{r.sales}</td>}
          <td data-label="Domisili">{r.domisili || <span className="ls-kosong">— isi</span>}</td>
          <td data-label="Status"><span className="ls-chip" style={{ background: c[0], color: c[1] }}>{r.status}</span></td>
          <td data-label="Keterangan" className="ls-ketc" onClick={() => setBuka(buka === r.lead_code ? null : r.lead_code)}><div className={'ls-ket' + (buka === r.lead_code ? ' buka' : '')}>{r.keterangan}</div>{r.update ? <span className="ls-upd">update {fmtDate(r.update)}</span> : null}</td>
        </tr>); })}</tbody></table></div> : <p className="hint">Tidak ada lead pada filter ini.</p>}
      <p className="hint" style={{ margin: '8px 0 0' }}>Keterangan disusun otomatis: <b>Drop</b> → catatan terakhir + alasan drop · <b>ada janji temu</b> → hari, tanggal, jam &amp; lokasi (atau alasan batal) · <b>masih follow up</b> → ringkasan catatan follow up terakhir sales + posisi jadwal follow up wajib. Tanggal di bawahnya = update terakhir.</p>
    </div>
  </>);
}
function htmlLeads({ rows, judul, R, per, me }) {
  const esc = x => String(x ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const sales = me.role !== 'sales';
  return `<!doctype html><html><head><meta charset="utf-8"><title>${esc(judul)}</title><style>
  @page{size:A4 landscape;margin:10mm}body{font-family:Arial,Helvetica,sans-serif;color:#10251E;font-size:9.5pt;margin:0}
  h1{font-size:15pt;margin:0 0 2px}.muted{color:#5B6E66;font-size:8.5pt}.ring{margin:6px 0 8px;font-size:9pt}.ring b{font-size:11pt}
  table{width:100%;border-collapse:collapse}th{background:#F5D774;font-size:8pt;text-transform:uppercase;text-align:left;padding:5px 4px;border:1px solid #E3D6A6}
  td{padding:4px;border:1px solid #EDE5CF;vertical-align:top;font-size:8.5pt}tr.kuning td{background:#FFF5B5}tr.merah td{background:#F9DCDC}
  .leg span{display:inline-block;margin-right:12px}.leg i{display:inline-block;width:10px;height:10px;margin-right:4px;border:1px solid #ccc;vertical-align:-1px}
  thead{display:table-header-group}tr{page-break-inside:avoid}</style></head><body>
  <h1>${esc(judul)}</h1><div class="muted">CRM Sales CHL · dicetak ${new Date().toLocaleString('id-ID')} oleh ${esc(me.name || '')} · periode = tanggal lead masuk</div>
  <div class="ring"><b>${R.total}</b> lead${sales ? ' · ' + Object.entries(per).map(([k, v]) => `${esc(k)} <b>${v}</b>`).join(' · ') : ''} · janjian/hot <b>${R.kuning}</b> · janji batal <b>${R.batal}</b> · drop <b>${R.drop}</b> · domisili belum diisi <b>${R.dom}</b></div>
  <div class="leg muted"><span><i style="background:#FFF5B5"></i>Janjian / Hot</span><span><i style="background:#F9DCDC"></i>Drop / janjian batal</span><span><i style="background:#fff"></i>Masih follow up</span></div>
  <table><thead><tr><th>No</th><th>Hari</th><th>Tanggal</th><th>Sumber</th><th>WhatsApp</th><th>Nama</th>${sales ? '<th>Sales</th>' : ''}<th>Domisili</th><th>Status</th><th style="width:34%">Keterangan</th></tr></thead><tbody>
  ${rows.map(r => `<tr class="${r.warna || ''}"><td>${r.no}</td><td>${esc(r.hari)}</td><td style="white-space:nowrap">${fmtDate(r.tgl)}</td><td>${esc(r.sumber)}</td><td style="white-space:nowrap">${esc(r.wa)}</td><td><b>${esc(r.nama)}</b></td>${sales ? `<td>${esc(r.sales)}</td>` : ''}<td>${esc(r.domisili || '—')}</td><td>${esc(r.status)}</td><td>${esc(r.keterangan)}${r.update ? `<br><span class="muted">update ${fmtDate(r.update)}</span>` : ''}</td></tr>`).join('')}
  </tbody></table><script>window.onload=()=>setTimeout(()=>window.print(),300)</script></body></html>`;
}
async function excelLeads({ rows, judul, R, per, me }) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook(); wb.creator = 'CRM Sales CHL';
  const ws = wb.addWorksheet('Leads ke Sales', { views: [{ state: 'frozen', ySplit: 4 }] });
  const sales = me.role !== 'sales';
  const kolom = ['No', 'Hari', 'Tanggal', 'Sumber', 'WhatsApp', 'Nama', ...(sales ? ['Sales'] : []), 'Domisili', 'Status', 'Keterangan', 'Update terakhir'];
  ws.getCell('A1').value = judul; ws.getCell('A1').font = { name: 'Arial', bold: true, size: 14 };
  ws.getCell('A2').value = `${R.total} lead${sales ? ' · ' + Object.entries(per).map(([k, v]) => `${k} ${v}`).join(' · ') : ''} · janjian/hot ${R.kuning} · janji batal ${R.batal} · drop ${R.drop} · domisili belum diisi ${R.dom} · kuning = janjian/hot, merah muda = drop/janji batal`;
  ws.getCell('A2').font = { name: 'Arial', size: 9, color: { argb: 'FF5B6E66' } };
  const h = ws.getRow(4); kolom.forEach((k, i) => { const c = h.getCell(i + 1); c.value = k; c.font = { name: 'Arial', bold: true, size: 10 }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5D774' } }; c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true }; });
  rows.forEach((r, i) => {
    const row = ws.getRow(5 + i);
    const isi = [r.no, r.hari, r.tgl ? new Date(r.tgl + 'T00:00:00') : null, r.sumber, r.wa, r.nama, ...(sales ? [r.sales] : []), r.domisili || '', r.status, r.keterangan, r.update ? new Date(r.update + 'T00:00:00') : null];
    isi.forEach((v, c) => { const cel = row.getCell(c + 1); cel.value = v; cel.font = { name: 'Arial', size: 10 }; cel.alignment = { vertical: 'top', wrapText: c === isi.length - 2 }; cel.border = { bottom: { style: 'thin', color: { argb: 'FFEDE5CF' } } };
      if (r.warna) cel.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r.warna === 'kuning' ? 'FFFFF5B5' : 'FFF9DCDC' } }; });
    row.getCell(3).numFmt = 'dd mmm yyyy'; row.getCell(isi.length).numFmt = 'dd mmm yyyy';
  });
  const lebar = [6, 10, 14, 14, 18, 22, ...(sales ? [12] : []), 18, 12, 70, 14];
  lebar.forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.autoFilter = { from: { row: 4, column: 1 }, to: { row: 4 + rows.length, column: kolom.length } };
  const buf = await wb.xlsx.writeBuffer();
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  a.download = judul.replace(/[^\w\s–-]/g, '').replace(/\s+/g, '_') + '.xlsx'; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
