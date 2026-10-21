'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import Toast, { toast } from '@/components/Toast';
import InputRupiah from '@/components/InputRupiah';
import { api, fmtRp, fmtDate, catatUnduh } from '@/components/util';
import Ringkasan from '@/components/CollectionRingkasan';

// ===== Collection & KPR — divisi Collection (ubah), Manager (ubah), CEO (hanya lihat) =====
const TAB = [['ringkas', 'Ringkasan'], ['kontrak', 'Data Kontrak'], ['tagihan', 'Tagihan & Pembayaran'], ['ceklis', 'Ceklis Dokumen KPR'], ['laporan', 'Laporan']];
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
        {TAB.map(([k, l]) => <button key={k} className={'sort-btn' + (tab === k ? ' active' : '')} onClick={() => setTab(k)}>{l}{k === 'tagihan' ? ` (${d.tagihan.filter(r => r.sisa > 0).length})` : k === 'kontrak' ? ` (${d.kontrak.length})` : k === 'ceklis' ? ` (${d.kontrak.filter(x => x.kpr).length})` : ''}</button>)}
        <Link href="/kpr-proses" className="sort-btn" style={{ marginLeft: 'auto' }}>🏦 Proses KPR ({d.kpr.berjalan + d.kpr.sp3k + d.kpr.akad}) ›</Link>
      </div>
      {tab === 'ringkas' && <><Ringkasan d={d} proj={proj} muat={() => muat(proj)} /><ResumeTabel d={d} /></>}
      {tab === 'kontrak' && <DataKontrak d={d} muat={() => muat(proj)} me={d.me} proj={proj} />}
      {tab === 'tagihan' && <Tagihan d={d} muat={() => muat(proj)} fokus={fokusLead} />}
      {tab === 'ceklis' && <Ceklis d={d} muat={() => muat(proj)} />}
      {tab === 'laporan' && <><Laporan d={d} proj={proj} /><JadwalAkad d={d} /></>}
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

// ===== Laporan: Report Detail (format Collection Permai) + Ceklis Dokumen KPR =====
function Laporan({ d, proj }) {
  const [busy, setBusy] = useState(false);
  const H = (ws, cols, fill = 'FF12302A') => { const r = ws.addRow(cols); r.eachCell(c => { c.font = { name: 'Arial', bold: true, size: 9, color: { argb: 'FFE2BE7A' } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: fill } }; c.alignment = { wrapText: true, vertical: 'middle', horizontal: 'center' }; c.border = { top: { style: 'thin' }, bottom: { style: 'thin' }, left: { style: 'thin' }, right: { style: 'thin' } }; }); r.height = 30; return r; };
  const RP = '#,##0;(#,##0);"-"', PCT = '0.00%', TGL = 'dd/mm/yyyy';
  const tgl = v => v ? new Date(v + 'T00:00:00') : null;
  const periode = new Date(d.hariIni).toLocaleDateString('id-ID', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const judul = (ws, t, sub) => { ws.addRow([(proj || 'SEMUA PROJECT').toUpperCase()]).font = { name: 'Arial', bold: true, size: 14 }; const r = ws.addRow([t, '', sub || '']); r.font = { name: 'Arial', bold: true, size: 11 }; ws.addRow([]); };
  const total = (ws, label, kolom, nRows, start) => { const r = ws.addRow([label]); r.font = { name: 'Arial', bold: true }; kolom.forEach(c => { const col = ws.getColumn(c).letter; r.getCell(c).value = { formula: `SUM(${col}${start}:${col}${start + nRows - 1})` }; r.getCell(c).numFmt = RP; r.getCell(c).font = { name: 'Arial', bold: true }; }); return r; };
  const ttd = ws => { ws.addRow([]); const r = ws.addRow(['', 'Dibuat Oleh', '', 'Diketahui Oleh', '', 'Disetujui Oleh']); r.font = { name: 'Arial', size: 9 }; ws.addRow([]); ws.addRow([]); ws.addRow([]); const n = ws.addRow(['', d.me?.name || '', '', 'Manager', '', 'CEO Project']); n.font = { name: 'Arial', size: 9, underline: true }; };
  const AG = ['0-30 Hari', '31-60 Hari', '61-90 Hari', '91-120 Hari', '> 120 Hari'];
  const sheetKat = (wb, nama, judulT, rows) => {
    const ws = wb.addWorksheet(nama); judul(ws, judulT, `Per ${periode}`);
    H(ws, ['No', 'Tgl Kontrak', 'No Kontrak', 'Customer', 'Unit', 'Nilai Kontrak (Include PPN)', 'Nilai Kontrak (Exclude PPN)', 'PPN', 'Skema Bayar', 'Tgl Batal', 'Nilai Tagihan', 'Outstanding', '(%)', 'Actual', 'Remainder', ...AG, 'Status', 'Bank', 'Catatan']);
    const start = ws.rowCount + 1;
    rows.forEach((x, i) => { const r = ws.addRow([i + 1, tgl(x.tgl_kontrak), x.no_kontrak || '', x.nama, x.unit, x.nilai, x.excl, x.ppn, x.skema || x.bayar, tgl(x.tgl_batal), x.tagihanJT, x.outstanding, x.nilai ? x.outstanding / x.nilai : 0, x.actual, x.remainder, ...x.aging, x.kprStatus || x.kategori, x.bank || '', x.catatan || x.kpr?.catatan || '']);
      r.font = { name: 'Arial', size: 9 }; [2, 10].forEach(c => { r.getCell(c).numFmt = TGL; }); [6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20].forEach(c => { r.getCell(c).numFmt = RP; }); r.getCell(13).numFmt = PCT; });
    if (rows.length) total(ws, 'TOTAL', [6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19, 20], rows.length, start); else ws.addRow(['TOTAL']);
    ttd(ws);
    [5, 11, 20, 28, 9, 16, 16, 12, 14, 11, 15, 15, 8, 15, 15, 12, 12, 12, 12, 12, 14, 16, 30].forEach((w, k) => { ws.getColumn(k + 1).width = w; });
    ws.views = [{ state: 'frozen', ySplit: start - 1 }];
    return ws;
  };
  async function reportDetail() {
    setBusy(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook(); wb.creator = 'CRM Sales CHL';
      // Resume
      const ws = wb.addWorksheet('Resume'); judul(ws, 'Resume Collection', `Per ${periode}`);
      H(ws, ['No', 'Uraian', 'Jumlah Unit', '(%)', 'Sales Revenue', '(%)', 'Tagihan J.Tempo (Rp)', '(%)', 'Outstanding', '(%)', 'Actual (Rp)', '(%)', 'Reminder', ...AG]);
      ws.addRow(['1', '2', '3', '4', '5', '6', '7', '8=7/5', '9=5-7', '10=9/5', '11', '12=11/7', '13=7-11', '14', '15', '16', '17', '18']).font = { name: 'Arial', size: 8, italic: true };
      const s0 = ws.rowCount + 1, R = d.resume;
      R.baris.forEach((x, i) => { const r = ws.addRow([i + 1, x.uraian, x.unit, null, x.revenue, null, x.tagihan, null, null, null, x.actual, null, null, ...x.aging]); const n = r.number; r.font = { name: 'Arial', size: 9 };
        r.getCell(4).value = { formula: `IFERROR(C${n}/C$${s0 + R.baris.length},0)` }; r.getCell(6).value = { formula: `IFERROR(E${n}/E$${s0 + R.baris.length},0)` }; r.getCell(8).value = { formula: `IFERROR(G${n}/E${n},0)` };
        r.getCell(9).value = { formula: `E${n}-G${n}` }; r.getCell(10).value = { formula: `IFERROR(I${n}/E${n},0)` }; r.getCell(12).value = { formula: `IFERROR(K${n}/G${n},0)` }; r.getCell(13).value = { formula: `G${n}-K${n}` };
        [5, 7, 9, 11, 13, 14, 15, 16, 17, 18].forEach(c => { r.getCell(c).numFmt = RP; }); [4, 6, 8, 10, 12].forEach(c => { r.getCell(c).numFmt = PCT; }); });
      const t = ws.addRow(['', 'Total']); t.font = { name: 'Arial', bold: true }; const nt = t.number;
      [3, 5, 7, 9, 11, 13, 14, 15, 16, 17, 18].forEach(c => { const L = ws.getColumn(c).letter; t.getCell(c).value = { formula: `SUM(${L}${s0}:${L}${nt - 1})` }; t.getCell(c).numFmt = c === 3 ? '0' : RP; });
      t.getCell(4).value = 1; t.getCell(6).value = 1; [4, 6].forEach(c => { t.getCell(c).numFmt = PCT; });
      t.getCell(8).value = { formula: `IFERROR(G${nt}/E${nt},0)` }; t.getCell(10).value = { formula: `IFERROR(I${nt}/E${nt},0)` }; t.getCell(12).value = { formula: `IFERROR(K${nt}/G${nt},0)` }; [8, 10, 12].forEach(c => { t.getCell(c).numFmt = PCT; });
      const u = ws.addRow(['', 'Unit Belum Terjual', d.unitBelumTerjual, { formula: `IFERROR(C${nt + 1}/(C${nt}+C${nt + 1}),0)` }]); u.getCell(4).numFmt = PCT; u.font = { name: 'Arial', size: 9 };
      ttd(ws); [5, 26, 12, 9, 18, 9, 18, 9, 16, 9, 18, 9, 16, 14, 14, 14, 14, 14].forEach((w, k) => { ws.getColumn(k + 1).width = w; });
      // Sheet per kategori
      sheetKat(wb, 'Lunas', 'Data Customer Lunas', d.kontrak.filter(x => x.kategori === 'Lunas'));
      sheetKat(wb, 'Akad KPR', 'Data Customer Akad KPR', d.kontrak.filter(x => x.kategori === 'Akad KPR'));
      sheetKat(wb, 'Proses KPR', 'Data Customer Proses KPR', d.kontrak.filter(x => x.kategori === 'Proses KPR'));
      sheetKat(wb, 'Pembayaran Angsuran', 'Data Customer Tunai - Angsuran', d.kontrak.filter(x => x.kategori === 'Proses Tunai Angsuran'));
      sheetKat(wb, 'Potensial Batal', 'Data Customer Potensial Batal', d.kontrak.filter(x => x.kategori === 'Potensi Batal'));
      // Snapshot semua kontrak (seperti sheet 0926)
      const kode = d.hariIni.slice(2, 4) + d.hariIni.slice(5, 7); const sn = wb.addWorksheet(kode + ' Semua Kontrak');
      sn.addRow(['', tgl(d.hariIni)]).getCell(2).numFmt = TGL;
      H(sn, ['No', 'Tgl Kontrak', 'No Kontrak', 'Customer', 'Internal/Eksternal', 'Sales', 'Sub Koordinator', 'No Sales', 'Unit', 'Nilai Kontrak', 'Nilai Kontrak (Exclude PPN)', 'PPN', 'Skema Bayar', 'Tgl Batal Sistem', 'Nilai Tagihan', 'Outstanding', '(%)', 'Actual', 'Remainder', ...AG, 'Status', 'Bank', 'Catatan']);
      const st = sn.rowCount + 1;
      d.kontrak.forEach((x, i) => { const r = sn.addRow([i + 1, tgl(x.tgl_kontrak), x.no_kontrak || '', x.nama, x.sales_tipe || '', x.sales || '', x.sales_kantor || '', x.sales_hp || '', x.unit, x.nilai, x.excl, x.ppn, x.skema || x.bayar, tgl(x.tgl_batal), x.tagihanJT, x.outstanding, x.nilai ? x.outstanding / x.nilai : 0, x.actual, x.remainder, ...x.aging, x.kprStatus || x.kategori, x.bank || '', x.catatan || x.kpr?.catatan || '']);
        r.font = { name: 'Arial', size: 9 }; [2, 14].forEach(c => { r.getCell(c).numFmt = TGL; }); [10, 11, 12, 15, 16, 18, 19, 20, 21, 22, 23, 24].forEach(c => { r.getCell(c).numFmt = RP; }); r.getCell(17).numFmt = PCT; });
      if (d.kontrak.length) total(sn, 'TOTAL', [10, 11, 12, 15, 16, 18, 19, 20, 21, 22, 23, 24], d.kontrak.length, st);
      [5, 11, 20, 28, 12, 26, 18, 13, 12, 14, 16, 11, 14, 11, 15, 15, 8, 15, 15, 12, 12, 12, 12, 12, 14, 16, 30].forEach((w, k) => { sn.getColumn(k + 1).width = w; }); sn.views = [{ state: 'frozen', ySplit: st - 1 }]; sn.autoFilter = { from: { row: st - 1, column: 1 }, to: { row: st - 1, column: 27 } };
      const buf = await wb.xlsx.writeBuffer(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf])); a.download = `${d.hariIni.slice(0, 4)}${d.hariIni.slice(5, 7)}_Report_Detail_${(proj || 'Semua_Project').replace(/\s+/g, '_')}.xlsx`; a.click();
      catatUnduh('Collection & KPR', 'Report Detail Collection (Excel)'); toast('Report Detail terunduh');
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function ceklisExcel() {
    setBusy(true);
    try {
      const ExcelJS = (await import('exceljs')).default;
      const wb = new ExcelJS.Workbook(); const ws = wb.addWorksheet('Ceklis Dokumen KPR');
      const rows = d.kontrak.filter(x => x.kpr);
      const docs = [...new Set(rows.flatMap(x => d.berkas[x.kpr.profil] || []))];
      ws.addRow([`CEKLIST DATA KPR ${(proj || 'SEMUA PROJECT').toUpperCase()} — per ${periode}`]).font = { name: 'Arial', bold: true, size: 13 }; ws.addRow([]);
      H(ws, ['NO', 'NAMA KONSUMEN', 'BLOK/ UNIT', 'TGL BI CHECKING', 'NAMA AGENT', 'KANTOR AGENT', 'ALAMAT KTP', 'KOTA / KABUPATEN', 'BI CHECKING', 'PINJAMAN', 'HASIL', 'UPDATE SERTIFIKAT', 'PROFIL', ...docs.map(x => x.replace(/\s*\(.*\)/, '').toUpperCase()), 'LENGKAP', 'HASIL KPR', 'LPA', 'SLF', 'SURAT PERNYATAAN', 'BANK', 'TGL. AKAD', 'KETERANGAN']);
      rows.forEach((x, i) => { const daftar = d.berkas[x.kpr.profil] || []; const ok = (x.kpr.berkas || []).filter(b => daftar.includes(b)).length;
        const r = ws.addRow([i + 1, x.nama, x.unit, tgl(x.kpr.slik_tgl), x.sales, x.sales_kantor || '', x.kpr.alamat_ktp || '', x.kpr.kota || '', x.kpr.bi_hasil || x.kpr.slik_status || '', x.kpr.bi_pinjaman || '', x.kpr.bi_status || '', x.kpr.sertifikat || '', x.kpr.profil,
          ...docs.map(dc => daftar.includes(dc) ? ((x.kpr.berkas || []).includes(dc) ? '✓' : '✗') : '·'), `${ok}/${daftar.length}`, x.kprStatus, x.kpr.lpa ? '✓' : '', x.kpr.slf ? '✓' : '', x.kpr.surat_pernyataan ? '✓' : '', x.bank || '', tgl(x.tgl_akad), x.kpr.catatan || x.catatan || '']);
        r.font = { name: 'Arial', size: 9 }; r.getCell(4).numFmt = TGL; r.getCell(14 + docs.length + 7).numFmt = TGL; docs.forEach((dc, k) => { const c = r.getCell(14 + k); c.alignment = { horizontal: 'center' }; if (c.value === '✓') c.font = { name: 'Arial', size: 9, bold: true, color: { argb: 'FF1E6A4C' } }; else if (c.value === '✗') c.font = { name: 'Arial', size: 9, color: { argb: 'FFB4482A' } }; }); });
      ws.getRow(3).height = 90; docs.forEach((dc, k) => { ws.getRow(3).getCell(14 + k).alignment = { textRotation: 90, vertical: 'bottom', horizontal: 'center' }; ws.getColumn(14 + k).width = 4; });
      [5, 26, 10, 12, 24, 20, 30, 16, 16, 12, 10, 12, 18].forEach((w, k) => { ws.getColumn(k + 1).width = w; }); ws.views = [{ state: 'frozen', xSplit: 3, ySplit: 3 }];
      const buf = await wb.xlsx.writeBuffer(); const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([buf])); a.download = `CEKLIS_DOKUMEN_KPR_${(proj || 'Semua').replace(/\s+/g, '_')}_${d.hariIni}.xlsx`; a.click();
      catatUnduh('Collection & KPR', 'Ceklis Dokumen KPR (Excel)'); toast('Ceklis dokumen terunduh');
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  return (<div className="card">
    <h3 style={{ marginTop: 0 }}>Laporan Collection &amp; KPR</h3>
    <div className="rp-grid2">
      <div className="card" style={{ background: 'var(--paper)' }}><b>Report Detail Collection</b><p className="hint" style={{ margin: '4px 0 8px' }}>Format sama dengan "Report Detail Permai Indah": sheet Resume (per kategori + aging), Lunas, Akad KPR, Proses KPR, Pembayaran Angsuran, Potensial Batal, dan satu sheet semua kontrak lengkap (internal/eksternal, sales, sub koordinator, skema, tagihan, outstanding, actual, remainder, aging, status, bank, catatan). Angka per hari ini.</p>
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={reportDetail}>⬇ Unduh Report Detail (Excel)</button></div>
      <div className="card" style={{ background: 'var(--paper)' }}><b>Ceklis Dokumen KPR</b><p className="hint" style={{ margin: '4px 0 8px' }}>Format sama dengan "Ceklis Dokumen KPR Permai Indah": per konsumen KPR dengan tanggal BI checking, hasil, pinjaman, sertifikat, profil, centang tiap berkas, LPA/SLF/surat pernyataan, bank, tanggal akad, keterangan.</p>
        <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={ceklisExcel}>⬇ Unduh Ceklis Dokumen (Excel)</button></div>
    </div>
    <p className="hint" style={{ marginTop: 10 }}>Untuk PDF: buka tab Ringkasan lalu Ctrl+P → Save as PDF. Laporan mengikuti filter project di atas.</p>
  </div>);
}

// ===== Resume Collection (seperti sheet Resume di Report Detail) =====
function ResumeTabel({ d }) {
  const R = d.resume; const pc = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
  const warna = { 'Lunas': 'kp-done', 'Akad KPR': 'kp-ok', 'Proses Tunai Angsuran': 'kp-run', 'Proses KPR': 'kp-wait', 'Potensi Batal': 'kp-no' };
  return (<div className="card" style={{ marginTop: 12 }}>
    <div className="bd-head"><h3 style={{ margin: 0 }}>Resume Collection</h3><span className="hint">per {fmtDate(d.hariIni)} · {d.project || 'semua project'} · unit belum terjual: <b>{d.unitBelumTerjual}</b></span></div>
    <div className="tbl-wrap tbl-compact"><table>
      <thead><tr><th>Uraian</th><th className="num">Unit</th><th className="num">%</th><th className="num">Sales revenue</th><th className="num">Tagihan J.tempo</th><th className="num">%</th><th className="num">Outstanding</th><th className="num">Actual</th><th className="num">%</th><th className="num">Remainder</th><th className="num">0-30</th><th className="num">31-60</th><th className="num">61-90</th><th className="num">91-120</th><th className="num">&gt;120</th></tr></thead>
      <tbody>{[...R.baris, R.total].map(x => <tr key={x.kategori} style={x.kategori === 'Total' ? { fontWeight: 700 } : undefined}>
        <td data-label="Uraian">{x.kategori === 'Total' ? 'Total' : <span className={'kp-pill sm ' + warna[x.kategori]}>{x.uraian}</span>}</td><td className="num" data-label="Unit">{x.unit}</td><td className="num" data-label="%">{pc(x.unit, R.total.unit)}%</td>
        <td className="num" data-label="Revenue">{rpM(x.revenue)}</td><td className="num" data-label="Tagihan JT">{rpM(x.tagihan)}</td><td className="num" data-label="%">{pc(x.tagihan, x.revenue)}%</td><td className="num" data-label="Outstanding">{rpM(x.outstanding)}</td>
        <td className="num" data-label="Actual">{rpM(x.actual)}</td><td className="num" data-label="%">{pc(x.actual, x.tagihan)}%</td><td className="num" data-label="Remainder" style={{ color: x.remainder ? 'var(--red)' : undefined }}>{rpM(x.remainder)}</td>
        {x.aging.map((v, i) => <td key={i} className="num" data-label={['0-30', '31-60', '61-90', '91-120', '>120'][i]}>{v ? rpM(v) : '-'}</td>)}</tr>)}</tbody></table></div>
    <p className="hint" style={{ marginTop: 6 }}>Tagihan J.tempo = yang sudah harus dibayar s.d. hari ini · Outstanding = nilai kontrak yang belum jatuh tempo (mis. pencairan KPR) · Actual = terbayar · Remainder = jatuh tempo belum dibayar, dipecah menurut umur tunggakan. Kategori: Lunas, Akad KPR (sudah akad), Proses KPR, Proses Tunai Angsuran, Potensi Batal (ditandai manual / KPR ditolak).</p>
  </div>);
}

// ===== Data Kontrak per konsumen =====
function DataKontrak({ d, muat, me, proj }) {
  const [f, setF] = useState('');
  const [cari, setCari] = useState('');
  const [edit, setEdit] = useState(null);
  const [impor, setImpor] = useState(false);
  const rows = d.kontrak.filter(x => (!f || x.kategori === f) && (!cari.trim() || (x.nama + ' ' + x.unit + ' ' + x.no_kontrak + ' ' + x.sales).toLowerCase().includes(cari.trim().toLowerCase())));
  const KAT = ['Lunas', 'Akad KPR', 'Proses KPR', 'Proses Tunai Angsuran', 'Potensi Batal'];
  async function simpan() { try { await api('/api/collection', { method: 'POST', body: JSON.stringify({ aksi: 'ubah_kontrak', ...edit }) }); toast('Data kontrak disimpan'); setEdit(null); muat(); } catch (e) { toast(e.message); } }
  async function jalankanImpor(cek, projekImpor) {
    setImpor(true);
    try {
      const r = await api('/api/collection', { method: 'POST', body: JSON.stringify({ aksi: 'impor_permai', cek, project: projekImpor }) });
      alert([`${cek ? 'CEK IMPOR (belum ada yang diubah)' : 'IMPOR SELESAI'} — ${projekImpor}, ${projekImpor === 'BIO DISTRICT' ? 'Report Detail snapshot 12 Okt 2026' : 'Report Detail 09/2026 + Ceklis Dokumen'}`, '',
        `• ${r.dibuat.length} konsumen ${cek ? 'akan ' : ''}dibuat baru (lead + Booking + kartu KPR): ${r.dibuat.slice(0, 6).join(', ')}${r.dibuat.length > 6 ? ' …' : ''}`,
        `• ${r.dipakai.length} konsumen sudah ada di CRM → ${cek ? 'akan ' : ''}dilengkapi (no kontrak, KPR, saldo awal): ${r.dipakai.slice(0, 6).join(', ')}${r.dipakai.length > 6 ? ' …' : ''}`,
        r.takDikenal.length ? `• Unit tidak ada di master: ${r.takDikenal.join(', ')}` : '• Semua unit cocok dengan master',
        cek ? '' : `• Kartu KPR diperbarui: ${r.kpr} · posisi tagihan/pembayaran (saldo awal): ${r.tagihan} konsumen`].filter(Boolean).join('\n'));
      if (!cek) muat();
    } catch (e) { toast(e.message); } finally { setImpor(false); }
  }
  return (<div className="card">
    <div className="bd-head" style={{ flexWrap: 'wrap', gap: 8 }}><h3 style={{ margin: 0 }}>Data kontrak ({rows.length})</h3>
      <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        <button className={'sort-btn' + (!f ? ' active' : '')} onClick={() => setF('')}>Semua</button>
        {KAT.map(k => <button key={k} className={'sort-btn' + (f === k ? ' active' : '')} onClick={() => setF(k)}>{k} ({d.kontrak.filter(x => x.kategori === k).length})</button>)}
        <input className="sort-filter" placeholder="🔍 nama / unit / no kontrak" value={cari} onChange={e => setCari(e.target.value)} style={{ width: 190 }} />
        {!d.readOnly && ['PERMAI INDAH', 'BIO DISTRICT'].filter(p => !proj || proj === p).map(p => <span key={p} style={{ display: 'inline-flex', gap: 4 }}>
          <button className="sort-btn" disabled={impor} onClick={() => jalankanImpor(true, p)}>🔍 Cek {p === 'BIO DISTRICT' ? 'Bio' : 'Permai'}</button>
          <button className="sort-btn" style={{ borderColor: 'var(--green)', color: 'var(--green)', fontWeight: 700 }} disabled={impor} onClick={() => { if (confirm(`Impor data Collection & KPR ${p} dari Report Detail${p === 'BIO DISTRICT' ? ' (snapshot 12 Okt 2026)' : ' 09/2026 + Ceklis Dokumen KPR'}?\n\nKonsumen yang belum ada di CRM dibuat (lead + Booking + kartu KPR), yang sudah ada dilengkapi. Posisi tagihan/pembayaran per tanggal laporan dicatat sebagai saldo awal. Aman diulang.`)) jalankanImpor(false, p); }}>{impor ? '⏳…' : `⬆ Impor ${p === 'BIO DISTRICT' ? 'Bio (12 Okt 2026)' : 'Permai (09/2026)'}`}</button></span>)}
      </span></div>
    {rows.length ? <div className="tbl-wrap tbl-compact jj-vtbl ck-kontrak"><table>
      <thead><tr><th>Tgl kontrak · No</th><th>Konsumen · unit · skema</th><th>Sales</th><th className="num">Nilai kontrak</th><th className="num">Tagihan JT</th><th className="num">Outstanding</th><th className="num">Actual</th><th className="num">Remainder</th><th>Kategori</th><th>Bank · status KPR</th><th>Catatan</th><th></th></tr></thead>
      <tbody>{rows.map(x => (<tr key={x.lead_code + x.unit} style={x.remainder > 0 ? { boxShadow: 'inset 3px 0 0 var(--red)' } : undefined}>
        <td data-label="Tgl kontrak">{fmtDate(x.tgl_kontrak)}<span className="sub2">{x.no_kontrak || '—'}</span></td>
        <td data-label="Konsumen"><Link href={'/leads?lead=' + encodeURIComponent(x.lead_code)} className="jj-nama">{x.nama}</Link><span className="sub2">{x.unit}{x.tipe ? ' · ' + x.tipe : ''}</span><span className="sub2">{x.skema || x.bayar || '—'}</span></td>
        <td data-label="Sales"><span className="clamp2" title={x.sales}>{x.sales || '—'}</span>{(x.sales_tipe || x.sales_kantor) ? <span className="sub2">{[x.sales_tipe, x.sales_kantor].filter(Boolean).join(' · ')}</span> : null}</td>
        <td className="num" data-label="Nilai" title={fmtRp(x.nilai)}>{rpM(x.nilai)}</td><td className="num" data-label="Tagihan JT" title={fmtRp(x.tagihanJT)}>{rpM(x.tagihanJT)}</td><td className="num" data-label="Outstanding" title={fmtRp(x.outstanding)}>{rpM(x.outstanding)}</td><td className="num" data-label="Actual" title={fmtRp(x.actual)}>{rpM(x.actual)}</td>
        <td className="num" data-label="Remainder" title={fmtRp(x.remainder)} style={{ color: x.remainder ? 'var(--red)' : undefined, fontWeight: x.remainder ? 700 : 400 }}>{x.remainder ? rpM(x.remainder) : '—'}{x.remainder > 0 ? <span className="sub2">{['0-30', '31-60', '61-90', '91-120', '>120'].map((l, i) => x.aging[i] ? l : '').filter(Boolean).join(', ')} hari</span> : null}</td>
        <td data-label="Kategori"><span className={'kp-pill sm ' + ({ 'Lunas': 'kp-done', 'Akad KPR': 'kp-ok', 'Proses Tunai Angsuran': 'kp-run', 'Proses KPR': 'kp-wait', 'Potensi Batal': 'kp-no' }[x.kategori] || 'kp-run')} style={{ whiteSpace: 'nowrap' }}>{x.kategori}</span></td>
        <td data-label="Bank">{x.bank || '—'}<span className="sub2">{x.kprStatus}{x.tgl_akad ? ' · akad ' + fmtDate(x.tgl_akad) : x.rencana_akad ? ' · rencana ' + fmtDate(x.rencana_akad) : ''}</span></td>
        <td data-label="Catatan"><span className="clamp2" title={x.catatan || x.kpr?.catatan || ''}>{x.catatan || x.kpr?.catatan || '—'}</span></td>
        <td><span style={{ display: 'inline-flex', gap: 4 }}>{x.kpr_id && <Link className="sort-btn" style={{ padding: '2px 8px', textDecoration: 'none' }} href={'/kpr-proses?id=' + x.kpr_id} title="Buka Proses KPR">🏦</Link>}
          {!d.readOnly && <button className="sort-btn" style={{ padding: '2px 8px' }} title="Ubah data kontrak" onClick={() => setEdit({ lead_code: x.lead_code, unit: x.unit, nama: x.nama, no_kontrak: x.no_kontrak || '', skema: x.skema || '', sales_tipe: x.sales_tipe || '', sales_kantor: x.sales_kantor || '', sales_hp: x.sales_hp || '', potensi_batal: x.potensi_batal, catatan: x.catatan || '' })}>✎</button>}</span></td></tr>))}</tbody></table></div>
      : <p className="hint">Belum ada kontrak{f ? ' di kategori ini' : ''}. Kontrak terbentuk otomatis dari transaksi Booking, atau lewat tombol Impor Permai.</p>}
    {edit && (<div className="card jj-sheet" style={{ marginTop: 12 }}>
      <h3 style={{ marginTop: 0 }}>Data kontrak — {edit.nama} · {edit.unit}</h3>
      <div className="form-grid">
        <div className="field"><label>No kontrak (SPPR)</label><input value={edit.no_kontrak} onChange={e => setEdit({ ...edit, no_kontrak: e.target.value })} placeholder="PI/SPPR/IX/26/00110" /></div>
        <div className="field"><label>Skema bayar</label><input list="dl-skema" value={edit.skema} onChange={e => setEdit({ ...edit, skema: e.target.value })} placeholder="KPR DP 1%/1X" /><datalist id="dl-skema">{['KPR DP 1%/1X', 'KPR INTERNAL', 'KPR DP 10%', 'CASH KERAS', 'CASH BERTAHAP', 'KPR EXTRA EXPRESS', 'SPECIAL PAYMENT KPR'].map(x => <option key={x} value={x} />)}</datalist></div>
        <div className="field"><label>Sales internal / eksternal</label><select value={edit.sales_tipe} onChange={e => setEdit({ ...edit, sales_tipe: e.target.value })}><option value="">—</option><option>Internal</option><option>Eksternal</option></select></div>
        <div className="field"><label>Kantor agen / sub koordinator</label><input value={edit.sales_kantor} onChange={e => setEdit({ ...edit, sales_kantor: e.target.value })} /></div>
        <div className="field"><label>No HP sales</label><input value={edit.sales_hp} onChange={e => setEdit({ ...edit, sales_hp: e.target.value })} /></div>
        <div className="field"><label>Potensi batal</label><select value={edit.potensi_batal ? 'ya' : 'tidak'} onChange={e => setEdit({ ...edit, potensi_batal: e.target.value === 'ya' })}><option value="tidak">Tidak</option><option value="ya">Ya — masuk kategori Potensi Batal</option></select></div>
        <div className="field full"><label>Catatan</label><input value={edit.catatan} onChange={e => setEdit({ ...edit, catatan: e.target.value })} /></div>
      </div>
      <div style={{ display: 'flex', gap: 8 }}><button className="btn btn-primary" style={{ width: 'auto' }} onClick={simpan}>Simpan</button><button className="sort-btn" onClick={() => setEdit(null)}>Batal</button></div>
    </div>)}
  </div>);
}

// ===== Ceklis Dokumen KPR (rumah subsidi & profil lain) =====
function Ceklis({ d, muat }) {
  const [cari, setCari] = useState('');
  const [busy, setBusy] = useState('');
  const [fProfil, setFProfil] = useState('');
  const wadah = useRef(null);
  const semuaKpr = d.kontrak.filter(x => x.kpr);
  // Kolom berkas mengikuti SATU profil (default: profil terbanyak) supaya tidak bercampur antar profil
  const profilAda = [...new Set(semuaKpr.map(x => x.kpr.profil).filter(Boolean))].sort((a, b) => semuaKpr.filter(x => x.kpr.profil === b).length - semuaKpr.filter(x => x.kpr.profil === a).length);
  const profilAktif = fProfil || profilAda[0] || 'Karyawan';
  const rows = semuaKpr.filter(x => x.kpr.profil === profilAktif && (!cari.trim() || (x.nama + ' ' + x.unit).toLowerCase().includes(cari.trim().toLowerCase())));
  const semuaDoc = d.berkas[profilAktif] || [];
  const geser = dx => { if (wadah.current) wadah.current.scrollBy({ left: dx, behavior: 'smooth' }); };
  async function toggle(x, doc) {
    if (d.readOnly) return;
    setBusy(x.lead_code + doc);
    const set = new Set(x.kpr.berkas || []); if (set.has(doc)) set.delete(doc); else set.add(doc);
    try { await api('/api/kpr', { method: 'PATCH', body: JSON.stringify({ jenis: 'kpr', id: x.kpr_id, berkas: [...set] }) }); muat(); } catch (e) { toast(e.message); } finally { setBusy(''); }
  }
  async function ubah(x, field, val) {
    if (d.readOnly) return;
    try { await api('/api/kpr', { method: 'PATCH', body: JSON.stringify({ jenis: 'kpr', id: x.kpr_id, [field]: val }) }); muat(); } catch (e) { toast(e.message); }
  }
  return (<div className="card">
    <div className="bd-head" style={{ flexWrap: 'wrap', gap: 8 }}><h3 style={{ margin: 0 }}>Ceklis dokumen KPR ({rows.length})</h3>
      <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
        {profilAda.map(p => <button key={p} className={'sort-btn' + (profilAktif === p ? ' active' : '')} onClick={() => setFProfil(p)}>{p} ({semuaKpr.filter(x => x.kpr.profil === p).length})</button>)}
        <input className="sort-filter" placeholder="🔍 nama / unit" value={cari} onChange={e => setCari(e.target.value)} style={{ width: 160 }} />
        <button className="sort-btn" title="Geser ke kiri" onClick={() => geser(-420)}>◀</button><button className="sort-btn" title="Geser ke kanan" onClick={() => geser(420)}>▶</button>
      </span></div>
    <p className="hint" style={{ margin: '4px 0 8px' }}>Kolom berkas mengikuti profil yang dipilih; ganti profil konsumen lewat dropdown di barisnya. Klik kotak untuk centang. Daftar berkas per profil diatur di Proses KPR → ⚙. Geser tabel dengan tombol ◀ ▶, Shift + scroll, atau bilah gulir di bawah tabel (selalu terlihat).</p>
    {rows.length ? <div className="tbl-wrap ck-tbl" ref={wadah}><table>
      <thead><tr><th className="ck-first">Konsumen · unit</th><th>Profil</th><th>BI checking</th><th>Hasil</th><th>Sertifikat</th>{semuaDoc.map(dc => <th key={dc} title={dc} className="ck-h"><span>{dc.replace(/\s*\(.*\)/, '')}</span></th>)}<th>LPA</th><th>SLF</th><th>Srt. pernyataan</th><th>Bank</th><th>Akad</th><th>Keterangan</th></tr></thead>
      <tbody>{rows.map(x => { const daftar = d.berkas[x.kpr.profil] || []; const ok = (x.kpr.berkas || []).filter(b => daftar.includes(b)).length;
        return (<tr key={x.lead_code}>
          <td className="ck-first"><Link href={'/kpr-proses?id=' + x.kpr_id} className="jj-nama">{x.nama}</Link><span className="sub2">{x.unit} · {x.sales}</span><span className="sub2"><b>{ok}/{daftar.length}</b> berkas</span></td>
          <td><select className="sort-filter" value={x.kpr.profil} disabled={d.readOnly} onChange={e => ubah(x, 'profil', e.target.value)}>{Object.keys(d.berkas).map(p => <option key={p}>{p}</option>)}</select></td>
          <td>{x.kpr.slik_tgl ? fmtDate(x.kpr.slik_tgl) : '—'}<span className="sub2">{x.kpr.bi_hasil || x.kpr.slik_status || ''}{x.kpr.bi_pinjaman ? ' · ' + x.kpr.bi_pinjaman : ''}</span></td>
          <td><select className="sort-filter" value={x.kpr.bi_status || ''} disabled={d.readOnly} onChange={e => ubah(x, 'bi_status', e.target.value)}><option value="">—</option>{['Lancar', 'Tidak Lancar', 'Proses'].map(o => <option key={o}>{o}</option>)}</select></td>
          <td><select className="sort-filter" value={x.kpr.sertifikat || ''} disabled={d.readOnly} onChange={e => ubah(x, 'sertifikat', e.target.value)}><option value="">—</option>{['Tahap 1', 'Tahap 2', 'Tahap 3', 'Selesai'].map(o => <option key={o}>{o}</option>)}</select></td>
          {semuaDoc.map(dc => { const ada = daftar.includes(dc); const cek = (x.kpr.berkas || []).includes(dc);
            return <td key={dc} className="ck-c">{ada ? <button className={'ck-box' + (cek ? ' on' : '')} disabled={d.readOnly || busy === x.lead_code + dc} onClick={() => toggle(x, dc)} title={dc}>{cek ? '✓' : ''}</button> : <span className="hint">·</span>}</td>; })}
          {['lpa', 'slf', 'surat_pernyataan'].map(fl => <td key={fl} className="ck-c"><button className={'ck-box' + (x.kpr[fl] ? ' on' : '')} disabled={d.readOnly} onClick={() => ubah(x, fl, !x.kpr[fl])}>{x.kpr[fl] ? '✓' : ''}</button></td>)}
          <td>{x.bank || '—'}<span className="sub2">{x.kprStatus}</span></td>
          <td>{x.tgl_akad ? fmtDate(x.tgl_akad) : x.rencana_akad ? 'rencana ' + fmtDate(x.rencana_akad) : '—'}</td>
          <td style={{ minWidth: 160 }}>{x.kpr.catatan || x.catatan || '—'}</td></tr>); })}</tbody></table></div>
      : <p className="hint">Belum ada konsumen KPR di profil ini.</p>}
    <p className="hint" style={{ marginTop: 6 }}>Profil <b>Subsidi — Karyawan</b> / <b>Subsidi — Wirausaha</b> memuat daftar berkas rumah subsidi (KTP, KTP pasangan, NPWP, SPT PPh 21, KK, surat nikah, SK domisili, pas foto, BPJS, slip gaji/SKU, rekening koran, SKK/SKDU, SKTB, SKBM, Form FLPP, SKBMR, Form KPR Bank, SPBPMS, foto usaha). Kolom LPA, SLF, dan surat pernyataan mengikuti Ceklis Dokumen KPR Permai Indah.</p>
  </div>);
}
