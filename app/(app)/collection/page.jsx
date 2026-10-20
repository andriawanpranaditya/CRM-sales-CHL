'use client';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import Toast, { toast } from '@/components/Toast';
import InputRupiah from '@/components/InputRupiah';
import { api, fmtRp, fmtDate, catatUnduh } from '@/components/util';
import Ringkasan from '@/components/CollectionRingkasan';

// ===== Collection & KPR — divisi Collection (ubah), Manager (ubah), CEO (hanya lihat) =====
const TAB = [['ringkas', 'Ringkasan'], ['tagihan', 'Tagihan & Pembayaran'], ['akad', 'Jadwal Akad'], ['laporan', 'Laporan']];
const rpM = n => !n ? 'Rp 0' : n >= 1e9 ? 'Rp ' + (n / 1e9).toLocaleString('id-ID', { maximumFractionDigits: 2 }) + ' M' : n >= 1e6 ? 'Rp ' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt' : fmtRp(n);
const WST = { Tunggakan: 'kp-no', 'Kurang bayar': 'kp-no', Sebagian: 'kp-wait', Lunas: 'kp-done', 'Belum jatuh tempo': 'kp-run', 'Tidak ada tagihan': 'kp-wait' };
const hariN = t => ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][new Date(t + 'T00:00:00Z').getUTCDay()];
const hariIniISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jakarta' }).format(new Date());

export default function CollectionPage() {
  const [tab, setTab] = useState('ringkas');
  const [proj, setProj] = useState('');
  const [projek, setProjek] = useState([]);
  const [d, setD] = useState(null);
  const [fokusLead, setFokusLead] = useState('');
  const muat = (p = proj) => api('/api/collection' + (p ? '?project=' + encodeURIComponent(p) : '')).then(setD).catch(e => toast(e.message));
  useEffect(() => {
    const q = new URLSearchParams(window.location.search); const t = q.get('tab'); if (TAB.some(x => x[0] === t)) setTab(t); if (q.get('lead')) setFokusLead(q.get('lead'));
    api('/api/settings').then(s => setProjek(s.project || [])).catch(() => {});
    muat('');
  }, []); // eslint-disable-line
  useEffect(() => { setD(null); muat(proj); }, [proj]); // eslint-disable-line
  if (!d) return <div className="loading">Memuat Collection &amp; KPR…</div>;
  const ro = d.readOnly;
  return (
    <div className={ro ? 'kp-ro' : ''}>
      <Toast />
      <div className="page-head"><div><h1>Collection &amp; KPR{ro ? <span className="hint" style={{ fontSize: 13, marginLeft: 8 }}>· hanya lihat</span> : null}</h1>
        <div className="sub">Tagihan &amp; pembayaran konsumen, proses KPR, jadwal akad — jadwal tagihan terbentuk otomatis dari skema cara bayar price list</div></div>
        {projek.length > 1 && <div className="fu-toolbar" style={{ margin: 0 }}>
          <button className={'sort-btn' + (!proj ? ' active' : '')} onClick={() => setProj('')}>Semua project</button>
          {projek.map(p => <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>)}</div>}
      </div>
      <div className="fu-toolbar" style={{ marginBottom: 12 }}>
        {TAB.map(([k, l]) => <button key={k} className={'sort-btn' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}{k === 'tagihan' ? ` (${d.tagihan.filter(r => r.sisa > 0).length})` : k === 'akad' ? ` (${d.jadwalAkad.length})` : ''}</button>)}
        <Link href="/kpr-proses" className="sort-btn" style={{ marginLeft: 'auto' }}>🏦 Proses KPR ({d.kpr.berjalan + d.kpr.sp3k + d.kpr.akad}) ›</Link>
      </div>
      {tab === 'ringkas' && <Ringkasan d={d} proj={proj} muat={() => muat(proj)} />}
      {tab === 'tagihan' && <Tagihan d={d} muat={() => muat(proj)} fokus={fokusLead} />}
      {tab === 'akad' && <JadwalAkad d={d} />}
      {tab === 'laporan' && <Laporan d={d} proj={proj} />}
    </div>
  );
}

// ===== Tagihan & Pembayaran =====
function Tagihan({ d, muat, fokus }) {
  const [f, setF] = useState('7');
  const [cari, setCari] = useState(fokus || '');
  const [bayar, setBayar] = useState(null);
  const [edit, setEdit] = useState(null);
  const [riwayat, setRiwayat] = useState(null);
  const [busy, setBusy] = useState(false);
  const hariIni = d.hariIni, t7 = new Date(Date.parse(hariIni) + 7 * 86400000).toISOString().slice(0, 10), bln = hariIni.slice(0, 7);
  const rows = useMemo(() => {
    let r = d.tagihan.filter(x => x.nominal > 0);
    if (f === '7') r = r.filter(x => x.sisa > 0 && x.jatuh_tempo <= t7);
    else if (f === 'lewat') r = r.filter(x => x.sisa > 0 && x.jatuh_tempo < hariIni);
    else if (f === 'bulan') r = r.filter(x => x.jatuh_tempo && x.jatuh_tempo.startsWith(bln));
    else if (f === 'lunas') r = r.filter(x => x.sisa <= 0);
    if (cari.trim()) { const c = cari.trim().toLowerCase(); r = r.filter(x => (x.nama || '').toLowerCase().includes(c) || (x.unit || '').toLowerCase().includes(c) || (x.lead_code || '').toLowerCase().includes(c)); }
    return r;
  }, [d, f, cari]); // eslint-disable-line
  const jml = k => d.tagihan.filter(x => x.nominal > 0 && (k === '7' ? x.sisa > 0 && x.jatuh_tempo <= t7 : k === 'lewat' ? x.sisa > 0 && x.jatuh_tempo < hariIni : k === 'bulan' ? (x.jatuh_tempo || '').startsWith(bln) : k === 'lunas' ? x.sisa <= 0 : true)).length;
  async function lihatRiwayat(r) { try { const x = await api('/api/collection?riwayat=' + encodeURIComponent(r.lead_code)); setRiwayat({ r, bayar: x.bayar }); } catch (e) { toast(e.message); } }
  async function simpanBayar() {
    setBusy(true);
    try { await api('/api/collection', { method: 'POST', body: JSON.stringify({ aksi: 'bayar', ...bayar }) }); toast('Pembayaran dicatat'); setBayar(null); muat(); } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function simpanEdit() {
    setBusy(true);
    try { await api('/api/collection', { method: 'POST', body: JSON.stringify({ aksi: 'ubah_tagihan', ...edit }) }); toast('Tagihan disimpan'); setEdit(null); muat(); } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  const waIngat = r => { const pesan = `Halo ${r.nama}, kami dari Collection ${r.project}. Mengingatkan ${r.ket} unit ${r.unit} sebesar ${fmtRp(r.sisa)} jatuh tempo ${fmtDate(r.jatuh_tempo)}. Mohon konfirmasi bila sudah transfer ya. Terima kasih 🙏`; return 'https://wa.me/' + String(r.wa || '').replace(/[^0-9]/g, '').replace(/^0/, '62') + '?text=' + encodeURIComponent(pesan); };
  const bacaBukti = (e, set) => { const fl = e.target.files?.[0]; if (!fl) return; if (fl.size > 2_500_000) return toast('Bukti maksimal 2,5 MB'); const rd = new FileReader(); rd.onload = () => set(b => ({ ...b, bukti_nama: fl.name, bukti_mime: fl.type, bukti_data: String(rd.result).split(',')[1] })); rd.readAsDataURL(fl); };
  return (<>
    <div className="card">
      <div className="bd-head" style={{ flexWrap: 'wrap', gap: 8 }}><h3 style={{ margin: 0 }}>Tagihan jatuh tempo &amp; tunggakan</h3>
        <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {[['7', '7 hari'], ['lewat', 'Lewat'], ['bulan', 'Bulan ini'], ['semua', 'Semua'], ['lunas', 'Lunas']].map(([k, l]) => <button key={k} className={'sort-btn' + (f === k ? ' active' : '')} onClick={() => setF(k)}>{l} ({jml(k)})</button>)}
          <input className="sort-filter" placeholder="🔍 nama / unit / kode" value={cari} onChange={e => setCari(e.target.value)} style={{ width: 170 }} />
          {!d.readOnly && <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 12px' }} onClick={() => setBayar({ tagihan_id: '', lead_code: '', tgl: hariIniISO(), nominal: '', cara: 'Transfer', catatan: '' })}>+ Catat pembayaran</button>}
        </span></div>
      {rows.length ? <div className="tbl-wrap tbl-compact jj-vtbl"><table>
        <thead><tr><th>Jatuh tempo</th><th>Konsumen · unit</th><th>Sales</th><th>Tagihan</th><th className="num">Nominal</th><th className="num">Terbayar</th><th>Status</th><th>Aksi</th></tr></thead>
        <tbody>{rows.map(r => (<tr key={r.id} style={r.status === 'Tunggakan' || r.status === 'Kurang bayar' ? { boxShadow: 'inset 3px 0 0 var(--red)' } : undefined}>
          <td data-label="Jatuh tempo"><b>{fmtDate(r.jatuh_tempo)}</b>{r.hariLewat > 0 && r.sisa > 0 ? <span className="sub2" style={{ color: 'var(--red)' }}>lewat {r.hariLewat} hari</span> : r.hariKe != null && r.sisa > 0 && r.hariKe <= 7 ? <span className="sub2">{r.hariKe === 0 ? 'hari ini' : r.hariKe === 1 ? 'besok' : r.hariKe + ' hari lagi'}</span> : null}</td>
          <td data-label="Konsumen"><Link href={'/leads?lead=' + encodeURIComponent(r.lead_code)} className="jj-nama">{r.nama || r.lead_code}</Link><span className="sub2">{r.unit} · {r.bayar || '—'}{r.sumber === 'manual' ? ' · disesuaikan' : ''}</span></td>
          <td data-label="Sales">{r.sales || '—'}</td>
          <td data-label="Tagihan">{r.ket}{r.catatan ? <span className="sub2">{r.catatan}</span> : null}</td>
          <td className="num" data-label="Nominal">{fmtRp(r.nominal)}</td>
          <td className="num" data-label="Terbayar">{fmtRp(r.terbayar)}{r.tgl_bayar_terakhir ? <span className="sub2">{fmtDate(r.tgl_bayar_terakhir)}</span> : null}</td>
          <td data-label="Status"><span className={'kp-pill sm ' + (WST[r.status] || 'kp-run')} style={{ whiteSpace: 'nowrap' }}>{r.status}</span></td>
          <td data-label="Aksi"><span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap' }}>
            {!d.readOnly && r.sisa > 0 && <button className="sort-btn" style={{ padding: '3px 8px' }} onClick={() => setBayar({ tagihan_id: r.id, lead_code: r.lead_code, nama: r.nama, ket: r.ket, tgl: hariIniISO(), nominal: r.sisa, cara: 'Transfer', catatan: '' })}>Catat</button>}
            {!d.readOnly && r.sisa > 0 && r.wa && <a className="sort-btn" style={{ padding: '3px 8px', textDecoration: 'none' }} href={waIngat(r)} target="_blank" rel="noreferrer">WA</a>}
            {!d.readOnly && <button className="sort-btn" style={{ padding: '3px 8px' }} onClick={() => setEdit({ id: r.id, ket: r.ket, jatuh_tempo: r.jatuh_tempo || '', nominal: r.nominal, catatan: r.catatan || '', nama: r.nama, nonaktif: false })}>✎</button>}
            <button className="sort-btn" style={{ padding: '3px 8px' }} onClick={() => lihatRiwayat(r)}>Riwayat</button></span></td></tr>))}</tbody></table></div>
        : <p className="hint">Tidak ada tagihan di filter ini.</p>}
      <p className="hint" style={{ marginTop: 8 }}>Jadwal tagihan terbentuk otomatis dari transaksi sesuai skema price list: Bio District (KPR: booking fee; Cash keras: BF → sisa DP hari ke-14 → pelunasan hari ke-30; Cash bertahap: BF → DP 10% → cicilan bulanan sesuai jumlah cicilan) dan Permai Indah (KPR BTN subsidi: BF Rp500 rb → uang muka Rp1,35 jt). Sisa harga via akad bank dipantau di Proses KPR. Tagihan yang disesuaikan Collection (✎) tidak ditimpa lagi.</p>
    </div>

    {bayar && (<div className="card jj-sheet" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Catat pembayaran{bayar.nama ? ` — ${bayar.nama}` : ''}</h3>
      <div className="form-grid">
        {!bayar.tagihan_id && <div className="field full"><label>Tagihan</label><select value={bayar.tagihan_id} onChange={e => { const r = d.tagihan.find(x => String(x.id) === e.target.value); setBayar({ ...bayar, tagihan_id: e.target.value, lead_code: r?.lead_code || '', nama: r?.nama, ket: r?.ket, nominal: r ? r.sisa : '' }); }}>
          <option value="">— pilih tagihan —</option>{d.tagihan.filter(x => x.sisa > 0).map(x => <option key={x.id} value={x.id}>{x.nama} · {x.unit} · {x.ket} · sisa {fmtRp(x.sisa)}</option>)}</select></div>}
        {bayar.tagihan_id && <div className="field full"><label>Tagihan</label><div className="note" style={{ margin: 0 }}>{bayar.ket}</div></div>}
        <div className="field"><label>Tanggal bayar</label><input type="date" value={bayar.tgl} onChange={e => setBayar({ ...bayar, tgl: e.target.value })} /></div>
        <div className="field"><label>Nominal diterima (Rp)</label><InputRupiah value={bayar.nominal} onChange={v => setBayar({ ...bayar, nominal: v })} /></div>
        <div className="field"><label>Cara bayar</label><select value={bayar.cara} onChange={e => setBayar({ ...bayar, cara: e.target.value })}>{['Transfer', 'Tunai', 'Debit/Kartu', 'Virtual account', 'Lainnya'].map(c => <option key={c}>{c}</option>)}</select></div>
        <div className="field"><label>Bukti transfer (foto/PDF, maks 2,5 MB)</label><input type="file" accept="image/*,application/pdf" onChange={e => bacaBukti(e, setBayar)} />{bayar.bukti_nama && <span className="hint">📎 {bayar.bukti_nama}</span>}</div>
        <div className="field full"><label>Catatan</label><input value={bayar.catatan} onChange={e => setBayar({ ...bayar, catatan: e.target.value })} placeholder="mis. transfer dari rekening suami" /></div>
      </div>
      <div className="note" style={{ margin: '10px 0' }}>Pembayaran tercatat di riwayat follow up lead, sehingga sales pemegang ikut tahu.</div>
      <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy || !bayar.tagihan_id && !bayar.lead_code} onClick={simpanBayar}>Simpan pembayaran</button><button className="sort-btn" onClick={() => setBayar(null)}>Batal</button></div>
    </div>)}

    {edit && (<div className="card jj-sheet" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Sesuaikan tagihan — {edit.nama}</h3>
      <div className="form-grid">
        <div className="field full"><label>Keterangan</label><input value={edit.ket} onChange={e => setEdit({ ...edit, ket: e.target.value })} /></div>
        <div className="field"><label>Jatuh tempo</label><input type="date" value={edit.jatuh_tempo} onChange={e => setEdit({ ...edit, jatuh_tempo: e.target.value })} /></div>
        <div className="field"><label>Nominal (Rp)</label><InputRupiah value={edit.nominal} onChange={v => setEdit({ ...edit, nominal: v })} /></div>
        <div className="field full"><label>Catatan</label><input value={edit.catatan} onChange={e => setEdit({ ...edit, catatan: e.target.value })} placeholder="mis. kesepakatan mundur 2 minggu" /></div>
      </div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={simpanEdit}>Simpan</button>
        <button className="sort-btn" style={{ color: 'var(--red)' }} disabled={busy} onClick={() => { if (confirm('Hapus tagihan ini dari jadwal? (tidak akan dibuat ulang otomatis)')) { setEdit(e => ({ ...e, nonaktif: true })); setTimeout(simpanEditHapus, 0); } }}>Hapus tagihan</button>
        <button className="sort-btn" onClick={() => setEdit(null)}>Batal</button></div>
    </div>)}

    {riwayat && (<div className="card" style={{ marginTop: 12 }}>
      <div className="bd-head"><h3 style={{ margin: 0 }}>Riwayat pembayaran — {riwayat.r.nama}</h3><button className="sort-btn" onClick={() => setRiwayat(null)}>Tutup</button></div>
      {riwayat.bayar.length ? <div className="tbl-wrap tbl-compact"><table><thead><tr><th>Tanggal</th><th>Tagihan</th><th className="num">Nominal</th><th>Cara</th><th>Bukti</th><th>Dicatat</th>{!d.readOnly && <th></th>}</tr></thead>
        <tbody>{riwayat.bayar.map(p => <tr key={p.id}><td data-label="Tanggal">{fmtDate(p.tgl)}</td><td data-label="Tagihan">{p.ket || '—'}{p.catatan ? <span className="sub2">{p.catatan}</span> : null}</td><td className="num" data-label="Nominal">{fmtRp(p.nominal)}</td><td data-label="Cara">{p.cara || '—'}</td><td data-label="Bukti">{p.bukti_nama ? '📎 ' + p.bukti_nama : '—'}</td><td data-label="Dicatat">{p.created_by}</td>
          {!d.readOnly && <td><button className="sort-btn" style={{ padding: '2px 8px', color: 'var(--red)' }} onClick={async () => { if (!confirm('Hapus catatan pembayaran ini?')) return; try { await api('/api/collection', { method: 'POST', body: JSON.stringify({ aksi: 'hapus_bayar', id: p.id }) }); toast('Dihapus'); setRiwayat(null); muat(); } catch (e) { toast(e.message); } }}>🗑</button></td>}</tr>)}</tbody></table></div>
        : <p className="hint">Belum ada pembayaran tercatat.</p>}
      {(() => { const semua = d.tagihan.filter(x => x.lead_code === riwayat.r.lead_code && x.nominal > 0); const tot = semua.reduce((a, x) => a + x.nominal, 0), byr = semua.reduce((a, x) => a + Math.min(x.terbayar, x.nominal), 0);
        return <><div className="bd-bar" style={{ marginTop: 8 }}><div style={{ width: (tot ? Math.round(byr / tot * 100) : 0) + '%', background: 'var(--green)' }} /></div><span className="hint">{fmtRp(byr)} dari {fmtRp(tot)} ({tot ? Math.round(byr / tot * 100) : 0}%) · {semua.filter(x => x.sisa > 0).length} tagihan belum lunas</span></>; })()}
    </div>)}
  </>);
  function simpanEditHapus() { api('/api/collection', { method: 'POST', body: JSON.stringify({ aksi: 'ubah_tagihan', ...edit, nonaktif: true }) }).then(() => { toast('Tagihan dihapus'); setEdit(null); muat(); }).catch(e => toast(e.message)); }
}

// ===== Jadwal Akad =====
function JadwalAkad({ d }) {
  const rows = d.jadwalAkad;
  return (<div className="card">
    <div className="bd-head"><h3 style={{ margin: 0 }}>Jadwal akad</h3><span className="hint">{rows.length} konsumen · dari Proses KPR</span></div>
    {rows.length ? <div className="tbl-wrap tbl-compact jj-vtbl"><table><thead><tr><th>Tanggal</th><th>Konsumen · unit</th><th>Project</th><th>Sales</th><th>Bank</th><th className="num">Nilai</th><th>Status</th></tr></thead>
      <tbody>{rows.map(a => <tr key={a.id}><td data-label="Tanggal"><b>{hariN(a.tgl)} {fmtDate(a.tgl)}</b></td><td data-label="Konsumen"><Link href={'/kpr-proses?id=' + a.id} className="jj-nama">{a.nama}</Link><span className="sub2">{a.unit}</span></td><td data-label="Project">{a.project}</td><td data-label="Sales">{a.sales}</td><td data-label="Bank">{a.bank || '—'}</td><td className="num" data-label="Nilai">{fmtRp(a.nilai)}</td>
        <td data-label="Status"><span className={'kp-pill sm ' + (a.lewat ? 'kp-no' : 'kp-wait')}>{a.lewat ? 'Lewat — isi realisasi' : 'Dijadwalkan'}</span></td></tr>)}</tbody></table></div>
      : <p className="hint">Belum ada akad yang dijadwalkan. Jadwal diisi di Proses KPR saat memilih bank akad.</p>}
    <div className="rp-grid2" style={{ marginTop: 12 }}>
      <div><h4 style={{ margin: '0 0 6px' }}>Akad terealisasi tahun {d.hariIni.slice(0, 4)}</h4><b style={{ fontSize: 26 }}>{d.kpr.selesaiTahun}</b> <span className="hint">konsumen</span></div>
      <div><h4 style={{ margin: '0 0 6px' }}>Bulan ini</h4><b style={{ fontSize: 26 }}>{d.kpr.akadBulan}</b> <span className="hint">dari target {d.targetBulan || '—'} · {rpM(d.kpr.akadBulanNilai)}</span></div>
    </div>
  </div>);
}

// ===== Laporan (Excel) =====
function Laporan({ d, proj }) {
  const [busy, setBusy] = useState(false);
  async function excel() {
    setBusy(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook();
      const head = (ws, cols) => { const r = ws.addRow(cols); r.eachCell(c => { c.font = { bold: true, color: { argb: 'FFE2BE7A' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF12302A' } }; }); };
      const RP = '"Rp" #,##0;("Rp" #,##0);"-"';
      const w1 = wb.addWorksheet('Tagihan'); head(w1, ['Jatuh tempo', 'Kode lead', 'Konsumen', 'Project', 'Unit', 'Sales', 'Cara bayar', 'Tagihan', 'Nominal', 'Terbayar', 'Sisa', 'Status', 'Catatan']);
      d.tagihan.filter(x => x.nominal > 0).forEach(x => { const r = w1.addRow([x.jatuh_tempo ? new Date(x.jatuh_tempo + 'T00:00:00') : null, x.lead_code, x.nama, x.project, x.unit, x.sales, x.bayar, x.ket, x.nominal, x.terbayar, x.sisa, x.status, x.catatan || '']); r.getCell(1).numFmt = 'dd mmm yyyy'; [9, 10, 11].forEach(c => { r.getCell(c).numFmt = RP; }); });
      [13, 11, 24, 14, 15, 10, 14, 30, 16, 16, 16, 15, 24].forEach((w, i) => { w1.getColumn(i + 1).width = w; }); w1.views = [{ state: 'frozen', ySplit: 1 }]; w1.autoFilter = { from: 'A1', to: 'M1' };
      const w2 = wb.addWorksheet('Proses KPR'); head(w2, ['Kode lead', 'Konsumen', 'Project', 'Unit', 'Sales', 'Status', 'Bank', 'Kendala', 'Rencana akad', 'Realisasi akad', 'Tidak di-update (hari)']);
      d.kprList.forEach(k => { const r = w2.addRow([k.lead_code, k.nama, k.project, k.unit, k.sales, k.status.label, k.banks.join(', '), k.kendala, k.akad_tgl ? new Date(k.akad_tgl + 'T00:00:00') : null, k.akad_realisasi ? new Date(k.akad_realisasi + 'T00:00:00') : null, k.diam]); [9, 10].forEach(c => { r.getCell(c).numFmt = 'dd mmm yyyy'; }); });
      [11, 24, 14, 15, 10, 20, 16, 36, 13, 13, 10].forEach((w, i) => { w2.getColumn(i + 1).width = w; }); w2.views = [{ state: 'frozen', ySplit: 1 }];
      const w3 = wb.addWorksheet('Per bank'); head(w3, ['Bank', 'Diajukan', 'Analisa', 'SP3K', 'Ditolak', 'Akad tahun ini', 'Rata-rata hari ke SP3K']);
      d.perBank.forEach(b => w3.addRow([b.bank, b.diajukan, b.analisa, b.sp3k, b.ditolak, b.akadTahun, b.hariSp3k ?? '']));
      const buf = await wb.xlsx.writeBuffer(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf])); a.download = `Collection_KPR_${(proj || 'Semua').replace(/\s+/g, '')}_${d.hariIni}.xlsx`; a.click();
      catatUnduh('Collection & KPR', 'Laporan Collection & KPR (Excel)'); toast('Excel terunduh');
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  function pdf() { window.print(); }
  return (<div className="card">
    <h3 style={{ marginTop: 0 }}>Laporan Collection &amp; KPR</h3>
    <p className="hint">Excel berisi 3 sheet: Tagihan (semua tagihan, terbayar, sisa, status), Proses KPR (status per konsumen), dan Per bank. PDF: cetak tampilan Ringkasan lewat browser (Ctrl+P → Save as PDF).</p>
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}><button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={excel}>⬇ Unduh Excel</button><button className="sort-btn" onClick={pdf}>🖨 Cetak / PDF halaman ini</button></div>
    <div className="rp-kpi" style={{ marginTop: 14, gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
      <div className="card"><span className="hint">Tagihan aktif</span><b className="rp-besar">{d.tagihan.filter(x => x.sisa > 0).length}</b><span className="hint">{rpM(d.tagihan.reduce((a, x) => a + x.sisa, 0))} belum terbayar</span></div>
      <div className="card"><span className="hint">Tunggakan</span><b className="rp-besar" style={{ color: 'var(--red)' }}>{rpM(d.ringkasTagihan.tunggak.nilai)}</b><span className="hint">{d.ringkasTagihan.tunggak.n} tagihan</span></div>
      <div className="card"><span className="hint">KPR berjalan + SP3K</span><b className="rp-besar">{d.kpr.berjalan + d.kpr.sp3k + d.kpr.akad}</b></div>
      <div className="card"><span className="hint">Akad terealisasi {d.hariIni.slice(0, 4)}</span><b className="rp-besar">{d.kpr.selesaiTahun}</b></div>
    </div>
  </div>);
}
