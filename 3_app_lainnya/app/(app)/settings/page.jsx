'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api } from '@/components/util';
import PagarGalat from '@/components/PagarGalat';

const LABELS = { status: 'Status Pipeline', sumber: 'Sumber Lead', project: 'Project', tipe: 'Tipe / Unit', tujuan: 'Tujuan Pembelian', bayar: 'Cara Pembayaran', domisili: 'Domisili (nama area)', topik: 'Topik Konten (Analisa Marcom)' };

export default function SettingsPage() {
  const [vals, setVals] = useState(null);
  const [units, setUnits] = useState({});
  const [projList, setProjList] = useState([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api('/api/settings').then(s => {
      const v = {}; Object.keys(LABELS).forEach(k => v[k] = (s[k] || []).join('\n'));
      setVals(v);
      setProjList(s.project || []);
      const u = {}; (s.project || []).forEach(p => u[p] = ((s.units || {})[p] || []).join('\n'));
      setUnits(u);
    }).catch(e => toast(e.message));
  }, []);

  async function simpan() {
    setBusy(true);
    try {
      const body = {}; Object.keys(LABELS).forEach(k => body[k] = vals[k].split('\n').map(x => x.trim()).filter(Boolean));
      body.units = {}; Object.keys(units).forEach(p => body.units[p] = units[p].split('\n').map(x => x.trim()).filter(Boolean));
      await api('/api/settings', { method: 'PUT', body: JSON.stringify(body) });
      toast('Settings tersimpan — semua dropdown ter-update');
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  if (!vals) return <div className="loading">Memuat…</div>;
  return (
    <>
      <div className="page-head"><div><h1>Settings</h1>
        <div className="sub">Master data dropdown — satu baris = satu pilihan. Semua form otomatis mengikuti.</div></div></div>
      <div className="note">Daftar <b>Sales / PIC</b> tidak lagi diatur di sini — otomatis mengikuti akun sales aktif di menu <b>Pengguna</b>.</div>
      <div className="card" style={{ margin: '12px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
        <div><b>🏷 Price List</b><div className="hint">Upload price list baru bila ada perubahan harga, promo, atau ketentuan — bisa juga dilakukan Admin dari menu Price List.</div></div>
        <a href="/price-list/kelola" className="btn btn-primary">Update price list</a>
      </div>
      <div className="set-grid">
        {Object.entries(LABELS).map(([k, label]) => (
          <div className="field" key={k}><label>{label}</label>
            <textarea value={vals[k]} onChange={e => setVals({ ...vals, [k]: e.target.value })} /></div>
        ))}
      </div>
      <div className="card" style={{ marginTop: 18 }}>
        <h2>Blok / Unit per Project</h2>
        <div className="note">Daftar ini mengisi dropdown <b>Blok/Unit</b> di Form Booking dan penandaan di <b>Master Stock</b>. Satu baris = satu unit. Format: <b>Bio Ave 3 no.15</b> atau <b>Blok A4 no.15</b>. Daftar awal dibuat dari siteplan — silakan sesuaikan dengan stok resmi.</div>
        <div className="set-grid">
          {projList.map(p => (
            <div className="field" key={'unit-' + p}><label>{p} ({(units[p] || '').split('\n').filter(Boolean).length} unit)</label>
              <textarea style={{ minHeight: 260 }} value={units[p] || ''} onChange={e => setUnits({ ...units, [p]: e.target.value })} /></div>
          ))}
        </div>
      </div>

      <div className="form-foot">
        <button className="btn btn-primary" onClick={simpan} disabled={busy}>Simpan Settings</button>
      </div>

      <div className="card" style={{ marginTop: 18, borderColor: 'var(--red-soft)' }}>
        <h2 style={{ color: 'var(--red)' }}>Zona Berbahaya</h2>
        <div className="note" style={{ background: 'var(--red-soft)', borderColor: '#EAC2BA', color: 'var(--red)' }}>
          Menghapus SEMUA lead, follow up, dan transaksi dari database secara permanen. Akun pengguna &amp; settings tidak ikut terhapus. Sebaiknya <b>Download Excel</b> dulu di Dashboard sebagai arsip.
        </div>
        <button className="btn btn-danger" style={{ width: 'auto' }} onClick={async () => {
          const c = prompt('Ketik persis: HAPUS SEMUA\nuntuk menghapus seluruh data lead, follow up, dan transaksi.');
          if (c === null) return;
          try {
            const d = await api('/api/leads', { method: 'DELETE', body: JSON.stringify({ all: true, confirm: c }) });
            toast('Data terhapus: ' + d.terhapus.lead + ' lead, ' + d.terhapus.followup + ' FU, ' + d.terhapus.transaksi + ' transaksi');
          } catch (e) { toast(e.message); }
        }}>🗑 Hapus SEMUA Data (Clear)</button>
      </div>
      <PagarGalat nama="Data Perusahaan"><DataPerusahaan /></PagarGalat>
      <PagarGalat nama="Penomoran Dokumen"><PenomoranDokumen /></PagarGalat>
      <PagarGalat nama="Skema Cara Bayar"><SkemaBayar /></PagarGalat>
      <PagarGalat nama="Kebijakan Penagihan"><KebijakanPenagihan /></PagarGalat>
      <PagarGalat nama="Kebijakan Reservasi"><KebijakanReservasi /></PagarGalat>
      <PagarGalat nama="SLA Proses KPR & AJB"><SlaProses /></PagarGalat>
      <PagarGalat nama="Templat Dokumen BAST"><TemplatDokumen /></PagarGalat>
      <PagarGalat nama="Jenjang Otorisasi"><JenjangOtorisasi /></PagarGalat>
      <PagarGalat nama="Ukuran Database"><UkuranDatabase /></PagarGalat>
      <Toast />
    </>
  );
}

// Nama tabel yang mudah dibaca pada panel Ukuran Database
const NAMA_TABEL = {
  leads: 'Lead', followups: 'Follow up', transactions: 'Transaksi', trx_files: 'Berkas konsumen (KTP, transfer, NPWP)',
  unit_manual: 'Tanda stok manual', unit_positions: 'Posisi titik peta', unit_harga: 'Daftar harga unit',
  users: 'Pengguna', settings: 'Pengaturan', notifikasi: 'Pemberitahuan', proses: 'Proses divisi', komisi: 'Komisi',
  alur_log: 'Riwayat alur', iom: 'IOM', iom_log: 'Riwayat IOM', iom_files: 'Lampiran IOM', otorisasi: 'Otorisasi',
  delegasi: 'Delegasi', sales_agent: 'Sales / Agent', kegiatan: 'Kegiatan sales', perusahaan: 'Data perusahaan',
  document_sequences: 'Urutan nomor dokumen', penomoran_log: 'Riwayat penomoran',
};
function ukuran(b) {
  if (b >= 1073741824) return (b / 1073741824).toFixed(2).replace('.', ',') + ' GB';
  if (b >= 1048576) return (b / 1048576).toFixed(1).replace('.', ',') + ' MB';
  return Math.max(1, Math.round(b / 1024)) + ' KB';
}
function UkuranDatabase() {
  const [d, setD] = useState(null);
  const [err, setErr] = useState('');
  const muat = () => { setErr(''); fetch('/api/db-size', { cache: 'no-store' }).then(r => r.json()).then(x => x.error ? setErr(x.error) : setD(x)).catch(() => setErr('Gagal memuat')); };
  useEffect(() => { muat(); }, []);
  const maks = d ? Math.max(1, ...d.tabel.map(t => t.bytes)) : 1;
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>Ukuran Database</h2>
      {err ? <span className="hint">{err}</span> : !d ? <span className="hint">Memuat…</span> : (<>
        <div className="hint" style={{ marginBottom: 10 }}>
          Total terpakai: <b style={{ fontSize: 16, color: 'var(--ink)' }}>{ukuran(d.total)}</b>
          {d.berkas ? <> · berkas lampiran <b>{d.berkas.jumlah}</b> file ({ukuran(d.berkas.bytes)})</> : null}
          {' '}— bandingkan dengan batas penyimpanan paket Neon Anda (lihat dashboard Neon → Usage).
        </div>
        {d.tabel.map(t => (
          <div key={t.nama} style={{ display: 'grid', gridTemplateColumns: 'minmax(150px,220px) 1fr 90px', gap: 10, alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 13 }}>{NAMA_TABEL[t.nama] || t.nama}<span className="hint"> · ±{t.perkiraan_baris > 0 ? t.perkiraan_baris.toLocaleString('id-ID') : '0'} baris</span></span>
            <div style={{ background: '#EDEBE3', borderRadius: 6, height: 10, overflow: 'hidden' }}>
              <div style={{ width: Math.max(2, t.bytes / maks * 100) + '%', height: '100%', background: t.nama === 'trx_files' ? '#C9922E' : '#23694A', borderRadius: 6 }} /></div>
            <b style={{ fontSize: 13, textAlign: 'right' }}>{ukuran(t.bytes)}</b>
          </div>))}
        <div style={{ marginTop: 8, display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <button className="sort-btn" onClick={muat}>↻ Perbarui</button>
          <span className="hint">Hanya pemantauan — tidak ada data yang dihapus otomatis. Berkas lampiran biasanya penyumbang terbesar.</span>
        </div>
      </>)}
    </div>
  );
}

// ===================== Data Perusahaan (kop dokumen) =====================
const KOSONG_PT = { pers: '', nama_pt: '', npwp: '', alamat: '', alamat_npwp: '', alamat_project: '',
  telp: '', fax: '', email: '', rek_bank: '', rek_no: '', rek_an: '', rek_cabang: '' };
function DataPerusahaan() {
  const [projects, setProjects] = useState([]);
  const [data, setData] = useState({});
  const [pilih, setPilih] = useState('');
  const [f, setF] = useState(KOSONG_PT);
  const muat = async () => {
    try {
      const [st, pr] = await Promise.all([api('/api/settings'), api('/api/perusahaan')]);
      const ps = st.project || [];
      setProjects(ps);
      const m = {}; pr.forEach(r => { m[r.project] = r; }); setData(m);
      const p = pilih || ps[0] || '';
      setPilih(p); setF({ ...KOSONG_PT, ...(m[p] || {}) });
    } catch (e) { toast(e.message); }
  };
  useEffect(() => { muat(); }, []);
  const ganti = p => { setPilih(p); setF({ ...KOSONG_PT, ...(data[p] || {}) }); };
  const isi = k => ({ value: f[k] || '', onChange: e => setF({ ...f, [k]: e.target.value }) });
  async function simpan() {
    try { await api('/api/perusahaan', { method: 'POST', body: JSON.stringify({ ...f, project: pilih }) });
      toast('Data perusahaan ' + pilih + ' tersimpan'); muat(); } catch (e) { toast(e.message); }
  }
  const terkunci = data[pilih] && data[pilih].penomoran_aktif;
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>Data Perusahaan</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Dipakai pada kop seluruh dokumen dan sebagai kode penomoran legal.
        Isi per project sesuai data resmi perusahaan.</div>
      <div className="fu-toolbar">{projects.map(p => (
        <button key={p} className={'sort-btn' + (pilih === p ? ' active' : '')} onClick={() => ganti(p)}>
          {p}{data[p] ? ' ✓' : ''}</button>))}</div>
      <div className="form-grid">
        <div className="field"><label>Kode Perusahaan <span className="req">*</span></label>
          <input {...isi('pers')} placeholder="mis. BIO" disabled={terkunci} style={{ textTransform: 'uppercase' }} />
          <span className="hint">{terkunci ? 'Terkunci — penomoran legal sudah aktif.' : 'Awalan nomor dokumen, mis. BIO/SP/IX/26/00001'}</span></div>
        <div className="field"><label>Nama Perusahaan</label><input {...isi('nama_pt')} placeholder="PT ..." /></div>
        <div className="field"><label>NPWP Perusahaan</label><input {...isi('npwp')} /></div>
        <div className="field"><label>Telepon</label><input {...isi('telp')} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Alamat Kantor</label><input {...isi('alamat')} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Alamat NPWP</label><input {...isi('alamat_npwp')} /></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label>Alamat Project</label><input {...isi('alamat_project')} /></div>
        <div className="field"><label>Email</label><input {...isi('email')} /></div>
        <div className="field"><label>Fax</label><input {...isi('fax')} /></div>
        <div className="field"><label>Bank Penerimaan</label><input {...isi('rek_bank')} /></div>
        <div className="field"><label>No. Rekening</label><input {...isi('rek_no')} /></div>
        <div className="field"><label>Atas Nama Rekening</label><input {...isi('rek_an')} /></div>
        <div className="field"><label>Cabang</label><input {...isi('rek_cabang')} /></div>
      </div>
      <button className="btn btn-primary" style={{ width: 'auto', marginTop: 10 }} onClick={simpan} disabled={!pilih}>
        Simpan Data Perusahaan</button>
    </div>
  );
}

// ===================== Penomoran Dokumen Legal =====================
function PenomoranDokumen() {
  const [projects, setProjects] = useState([]);
  const [pilih, setPilih] = useState('');
  const [d, setD] = useState(null);
  const [ubah, setUbah] = useState({});
  const [polaUbah, setPolaUbah] = useState({});
  const muat = async (p) => {
    try { const x = await api('/api/penomoran?project=' + encodeURIComponent(p)); setD(x); setUbah({}); }
    catch (e) { toast(e.message); }
  };
  useEffect(() => { api('/api/settings').then(st => {
    const ps = st.project || []; setProjects(ps); if (ps[0]) { setPilih(ps[0]); muat(ps[0]); } }).catch(() => {}); }, []);
  async function setNomor(j) {
    const ke = ubah[j.kode];
    if (ke === undefined || ke === '') return;
    const alasan = prompt('Alasan menetapkan nomor terakhir ' + j.nama + ' menjadi ' + ke + ':\n(mis. melanjutkan dari sistem lama)');
    if (!alasan) return;
    try { await api('/api/penomoran', { method: 'POST', body: JSON.stringify({
      project: pilih, jenis: j.kode, tahun: d.tahun, last_no: Number(ke), alasan }) });
      toast('Nomor terakhir ' + j.nama + ' diperbarui'); muat(pilih); } catch (e) { toast(e.message); }
  }
  async function setPola(j) {
    const pola = (polaUbah[j.kode] ?? j.pola ?? '').trim();
    const alasan = prompt('Dasar penetapan format nomor ' + j.nama + ':\n' + (pola || '(dikosongkan)') + '\n\n(mis. "sesuai arahan Legal, surat tgl …")\nFormat TIDAK bisa diubah lagi setelah ada nomor yang terbit.');
    if (!alasan) return;
    try { await api('/api/penomoran', { method: 'POST', body: JSON.stringify({ aksi: 'pola', jenis: j.kode, pola, alasan }) });
      toast('Format nomor ' + j.nama + ' ' + (pola ? 'ditetapkan' : 'dikosongkan')); setPolaUbah({}); muat(pilih); } catch (e) { toast(e.message); }
  }
  async function toggle(aktif) {
    const konfirmasi = aktif ? prompt('Setelah aktif, dokumen baru memakai nomor legal dan urutan tidak bisa diturunkan.\n' +
      'Pastikan nomor terakhir sudah melanjutkan dari sistem lama.\n\nKetik AKTIFKAN untuk melanjutkan:') : 'NONAKTIF';
    if (!konfirmasi) return;
    const alasan = prompt(aktif ? 'Alasan / catatan aktivasi:' : 'Alasan menghentikan penomoran legal:');
    if (!alasan) return;
    try { await api('/api/penomoran', { method: 'POST', body: JSON.stringify({ project: pilih, aktif, konfirmasi, alasan }) });
      toast(aktif ? 'Penomoran legal AKTIF' : 'Penomoran legal dihentikan'); muat(pilih); } catch (e) { toast(e.message); }
  }
  const aktif = d && d.perusahaan && d.perusahaan.penomoran_aktif;
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>Penomoran Dokumen Legal</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Format mengikuti dokumen yang sudah beredar dari sistem lama.
        Selama <b>belum aktif</b>, Harmoni One memakai nomor internal berawalan HO agar tidak bentrok dengan sistem lama.</div>
      <div className="fu-toolbar">{projects.map(p => (
        <button key={p} className={'sort-btn' + (pilih === p ? ' active' : '')} onClick={() => { setPilih(p); muat(p); }}>{p}</button>))}</div>
      {!d ? <span className="hint">Memuat…</span> : !d.perusahaan ? (
        <div className="note">Lengkapi <b>Data Perusahaan</b> project ini lebih dulu — kode perusahaan dibutuhkan untuk format nomor.</div>
      ) : (<>
        <div className="note" style={{ background: aktif ? '#EDF3EF' : '#FFF8E9', borderColor: aktif ? '#BBD3B5' : '#E8D9AE',
          color: aktif ? '#12604B' : '#6E5713', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
          <span>{aktif ? '● AKTIF — dokumen baru memakai nomor legal' : '○ BELUM AKTIF — masih memakai nomor internal (HO)'} · kode <b>{d.perusahaan.pers}</b> · tahun {d.tahun}</span>
          <button className="sort-btn" onClick={() => toggle(!aktif)}>{aktif ? 'Hentikan' : 'Aktifkan penomoran legal'}</button>
        </div>
        <div style={{ overflowX: 'auto', marginTop: 10 }}>
          <table className="tbl" style={{ width: '100%', fontSize: 13 }}>
            <thead><tr><th>Dokumen</th><th>Format</th><th className="num">Terakhir {d.tahun}</th><th>Nomor berikutnya</th><th>Tetapkan nomor terakhir</th></tr></thead>
            <tbody>{d.jenis.map(j => (
              <tr key={j.kode}>
                <td><b>{j.nama}</b></td>
                <td style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 11.5, color: 'var(--muted)' }}>
                  {j.fleksibel ? (<div style={{ minWidth: 250 }}>
                    <input style={{ width: 210, fontFamily: 'inherit', fontSize: 11.5 }} value={polaUbah[j.kode] ?? (j.pola || '')} placeholder="belum ditetapkan, mis. {NO3}/BAST-PP/SBL/{BLN}/{TH4}"
                      onChange={e => setPolaUbah({ ...polaUbah, [j.kode]: e.target.value })} />
                    <button className="sort-btn" style={{ padding: '3px 9px', marginLeft: 5 }} onClick={() => setPola(j)}>Tetapkan</button>
                    {!j.pola && <div className="hint" style={{ margin: '3px 0 0', color: '#8a5f14' }}>Belum ditetapkan — sementara memakai nomor internal</div>}
                  </div>) : j.pola}</td>
                <td className="num">{j.terakhir}</td>
                <td style={{ fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>{j.berikut}</td>
                <td style={{ whiteSpace: 'nowrap' }}>
                  <input type="number" min="0" style={{ width: 90 }} value={ubah[j.kode] ?? ''} placeholder={String(j.terakhir)}
                    onChange={e => setUbah({ ...ubah, [j.kode]: e.target.value })} />
                  <button className="sort-btn" style={{ padding: '3px 9px', marginLeft: 5 }} onClick={() => setNomor(j)}>Simpan</button>
                </td>
              </tr>))}</tbody>
          </table>
        </div>
        {d.log.length > 0 && (<>
          <div className="hint" style={{ marginTop: 12, fontWeight: 700 }}>Riwayat perubahan penomoran</div>
          <div style={{ fontSize: 12, color: 'var(--muted)', lineHeight: 1.7 }}>{d.log.map(l => (
            <div key={l.id}>{new Date(l.created_at).toLocaleString('id-ID')} · <b>{l.oleh}</b> · {l.jenis}
              {l.dari !== null && l.ke !== null ? ' ' + l.dari + ' → ' + l.ke : ''} · {l.alasan}</div>))}</div>
        </>)}
      </>)}
    </div>
  );
}

// ===================== Skema Cara Bayar =====================
// Susunan booking fee / DP / angsuran / pelunasan tiap skema — dasar jadwal tagihan (Fase 3).
const JENIS_SKEMA = { cash: 'Tunai', cicilan: 'Cicilan developer', kpr: 'KPR' };
const KOSONG_SKEMA = { kode: '', nama: '', jenis: 'cash', bf_nominal: '', dp_persen: '', dp_nominal: '', dp_termin: 1, dp_hari: 14,
  angsuran_jumlah: 0, angsuran_interval_hari: 30, pelunasan_hari: 30, subsidi_dp: false, keterangan: '', aktif: true, lengkap: false };
function SkemaBayar() {
  const [projects, setProjects] = useState([]);
  const [pilih, setPilih] = useState('');
  const [rows, setRows] = useState(null);
  const [edit, setEdit] = useState(null);
  const muat = p => { if (!p) return; api('/api/skema?project=' + encodeURIComponent(p)).then(d => setRows(d.rows)).catch(e => toast(e.message)); };
  useEffect(() => { api('/api/settings').then(st => { const ps = st.project || []; setProjects(ps); if (ps[0]) { setPilih(ps[0]); muat(ps[0]); } }).catch(() => {}); }, []);
  const isi = k => ({ value: edit[k] ?? '', onChange: e => setEdit({ ...edit, [k]: e.target.value }) });
  async function simpan() {
    try { await api('/api/skema', { method: 'POST', body: JSON.stringify({ project: pilih, rows: [{ ...edit, urutan: edit.urutan || ((rows || []).length + 1) }] }) });
      toast('Skema tersimpan'); setEdit(null); muat(pilih); } catch (e) { toast(e.message); }
  }
  const ringkas = r => {
    const b = [];
    if (r.bf_nominal > 0) b.push('BF Rp ' + Number(r.bf_nominal).toLocaleString('id-ID'));
    if (r.subsidi_dp) b.push('DP disubsidi');
    else if (Number(r.dp_nominal) > 0) b.push('DP nominal tetap Rp ' + Number(r.dp_nominal).toLocaleString('id-ID') + (r.dp_termin > 1 ? ' / ' + r.dp_termin + 'x' : '') + ' hari ke-' + r.dp_hari);
    else if (Number(r.dp_persen) > 0) b.push('DP ' + r.dp_persen + '%' + (r.dp_termin > 1 ? ' / ' + r.dp_termin + 'x' : '') + ' hari ke-' + r.dp_hari);
    if (r.angsuran_jumlah > 0) b.push(r.angsuran_jumlah + 'x angsuran tiap ' + r.angsuran_interval_hari + ' hari');
    if (r.jenis !== 'cicilan') b.push((r.jenis === 'kpr' ? 'akad' : 'pelunasan') + ' ' + r.pelunasan_hari + ' hari setelah DP');
    return b.join(' · ');
  };
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>Skema Cara Bayar</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Susunan pembayaran tiap skema. Skema yang belum diisi aturannya ditandai <b>belum lengkap</b>
        — lengkapi bersama Finance sebelum Fase 3 (jadwal tagihan) dibangun.</div>
      <div className="fu-toolbar">{projects.map(p => (
        <button key={p} className={'sort-btn' + (pilih === p ? ' active' : '')} onClick={() => { setPilih(p); setEdit(null); muat(p); }}>{p}</button>))}</div>
      {!rows ? <span className="hint">Memuat…</span> : (
        <div className="tbl-wrap"><table className="tbl-compact">
          <thead><tr><th>Kode</th><th>Skema</th><th>Jenis</th><th>Susunan</th><th>Status</th><th></th></tr></thead>
          <tbody>{rows.map(r => (
            <tr key={r.kode} style={!r.aktif ? { opacity: .5 } : {}}>
              <td><b>{r.kode}</b></td><td>{r.nama}</td><td>{JENIS_SKEMA[r.jenis] || r.jenis}</td>
              <td style={{ fontSize: 12 }}>{ringkas(r)}{r.keterangan ? <div className="hint" style={{ margin: 0 }}>{r.keterangan}</div> : null}</td>
              <td>{r.lengkap ? <span className="badge b-close">lengkap</span> : <span className="badge b-warm">belum lengkap</span>}{!r.aktif ? ' · nonaktif' : ''}</td>
              <td><button className="sort-btn" style={{ padding: '2px 8px' }} onClick={() => setEdit({ ...KOSONG_SKEMA, ...r })}>Ubah</button></td>
            </tr>))}</tbody>
        </table></div>)}
      <button className="sort-btn" style={{ marginTop: 8 }} onClick={() => setEdit({ ...KOSONG_SKEMA })} disabled={!pilih}>+ Tambah skema</button>
      {edit && (
        <div className="card" style={{ marginTop: 12, background: '#FBFAF4' }}>
          <h3 style={{ marginTop: 0 }}>{rows && rows.some(r => r.kode === edit.kode) ? 'Ubah skema ' + edit.nama : 'Skema baru'}</h3>
          <div className="form-grid">
            <div className="field"><label>Kode <span className="req">*</span></label><input {...isi('kode')} placeholder="mis. CIC12" disabled={rows && rows.some(r => r.kode === edit.kode && edit.updated_by)} /></div>
            <div className="field"><label>Nama skema <span className="req">*</span></label><input {...isi('nama')} /></div>
            <div className="field"><label>Jenis</label><select value={edit.jenis} onChange={e => setEdit({ ...edit, jenis: e.target.value })}>
              {Object.entries(JENIS_SKEMA).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></div>
            <div className="field"><label>Booking fee (Rp)</label><input type="number" {...isi('bf_nominal')} /></div>
            <div className="field"><label>DP (% dari nilai kontrak)</label><input type="number" step="0.01" {...isi('dp_persen')} />
              <span className="hint">Kosongkan / isi 0 bila memakai DP nominal tetap di bawah.</span></div>
            <div className="field"><label>DP nominal tetap (Rp)</label><input type="number" min="0" {...isi('dp_nominal')} placeholder="mis. KPR bersubsidi pemerintah" />
              <span className="hint">Diutamakan atas DP % bila diisi &gt; 0 — untuk skema dengan uang muka pemerintah yang jumlahnya tetap, tidak mengikuti harga unit.</span></div>
            <div className="field"><label>DP dibayar berapa kali</label><input type="number" min="1" {...isi('dp_termin')} /></div>
            <div className="field"><label>DP pertama jatuh tempo (hari setelah BF)</label><input type="number" {...isi('dp_hari')} /></div>
            <div className="field"><label>DP disubsidi developer</label><select value={edit.subsidi_dp ? '1' : '0'} onChange={e => setEdit({ ...edit, subsidi_dp: e.target.value === '1' })}>
              <option value="0">Tidak</option><option value="1">Ya — konsumen DP 0%</option></select></div>
            <div className="field"><label>Jumlah angsuran (cicilan developer)</label><input type="number" min="0" {...isi('angsuran_jumlah')} /></div>
            <div className="field"><label>Jarak antar angsuran (hari)</label><input type="number" min="1" {...isi('angsuran_interval_hari')} /></div>
            <div className="field"><label>Pelunasan / akad (hari setelah DP)</label><input type="number" {...isi('pelunasan_hari')} /></div>
            <div className="field"><label>Status</label><select value={(edit.aktif ? 'a' : 'n') + (edit.lengkap ? 'l' : 'b')}
              onChange={e => setEdit({ ...edit, aktif: e.target.value[0] === 'a', lengkap: e.target.value[1] === 'l' })}>
              <option value="ab">Aktif · belum lengkap</option><option value="al">Aktif · lengkap</option><option value="nb">Nonaktif</option></select></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Keterangan</label><input {...isi('keterangan')} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={simpan}>Simpan Skema</button>
            <button className="sort-btn" onClick={() => setEdit(null)}>Batal</button>
          </div>
        </div>)}
    </div>
  );
}

// ===================== Kebijakan Penagihan: denda & Surat Peringatan =====================
function KebijakanPenagihan() {
  const [f, setF] = useState(null);
  const [bawaan, setBawaan] = useState(null);
  useEffect(() => {
    api('/api/penagihan').then(d => { setBawaan(d.bawaan); setF({ persen_per_hari: d.denda.persen_per_hari, ...d.sp }); }).catch(e => toast(e.message));
  }, []);
  async function simpan() {
    try { await api('/api/penagihan', { method: 'POST', body: JSON.stringify(f) }); toast('Kebijakan penagihan tersimpan'); }
    catch (e) { toast(e.message); }
  }
  if (!f) return null;
  const isi = k => ({ type: 'number', step: k === 'persen_per_hari' ? '0.01' : '1', min: '0', value: f[k] ?? '', onChange: e => setF({ ...f, [k]: e.target.value }) });
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>Kebijakan Penagihan</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Tarif denda keterlambatan dan jenjang Surat Peringatan. Nilai awal adalah asumsi
        ({bawaan.denda.persen_per_hari}% per hari) — sesuai SOP Tim Collection. SP1 dihitung sejak jatuh tempo (dan baru bisa diterbitkan
        setelah follow up ke konsumen tercatat); SP2 dihitung sejak SP1 terbit; SP3 dihitung sejak SP2 terbit — berjenjang, bukan dari jatuh tempo untuk ketiganya.</div>
      <div className="form-grid">
        <div className="field"><label>Denda keterlambatan (% per hari)</label><input {...isi('persen_per_hari')} />
          <span className="hint">0,1% = 1 permil per hari, sesuai price list.</span></div>
        <div className="field"><label>SP1 — hari sejak jatuh tempo (+ follow up wajib tercatat)</label><input {...isi('sp1_hari')} /></div>
        <div className="field"><label>SP2 — hari sejak SP1 terbit</label><input {...isi('sp2_hari')} /></div>
        <div className="field"><label>SP3 — hari sejak SP2 terbit</label><input {...isi('sp3_hari')} /></div>
        <div className="field"><label>Batas bayar setelah surat terbit (hari)</label><input {...isi('batas_bayar_hari')} /></div>
      </div>
      <button className="btn btn-primary" style={{ width: 'auto', marginTop: 10 }} onClick={simpan}>Simpan Kebijakan</button>
    </div>
  );
}

// ===================== Kebijakan Reservasi =====================
function KebijakanReservasi() {
  const [hari, setHari] = useState(null);
  useEffect(() => { api('/api/reservasi').then(d => setHari(d.masa_hari)).catch(e => toast(e.message)); }, []);
  async function simpan() {
    try { await api('/api/reservasi', { method: 'POST', body: JSON.stringify({ aksi: 'kebijakan', masa_hari: hari }) }); toast('Masa berlaku reservasi tersimpan'); }
    catch (e) { toast(e.message); }
  }
  if (hari === null) return null;
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>Kebijakan Reservasi</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Reservasi berlaku selama masa di bawah ini. Setelah lewat, unit dilepas ke penjualan lain; melanjutkan ke Booking,
        mereservasi ulang, atau memperpanjang memerlukan otorisasi (jenjangnya diatur di panel <b>Jenjang Otorisasi</b>, tindakan “reservasi yang melewati batas waktu”).
        Perubahan hanya berlaku untuk reservasi baru; reservasi lama tetap tanpa batas waktu.</div>
      <div className="form-grid">
        <div className="field"><label>Masa berlaku reservasi (hari)</label>
          <input type="number" min="1" max="60" value={hari} onChange={e => setHari(e.target.value)} /></div>
      </div>
      <button className="btn btn-primary" style={{ width: 'auto', marginTop: 10 }} onClick={simpan}>Simpan</button>
    </div>
  );
}

// ===================== Jenjang Otorisasi =====================
// Siapa yang berwenang menyetujui tiap tindakan yang ditahan — dan apakah tindakan itu ditahan.
function JenjangOtorisasi() {
  const [d, setD] = useState(null);
  const [f, setF] = useState({});
  const muat = () => api('/api/otorisasi-atur').then(x => { setD(x); setF({}); }).catch(e => toast(e.message));
  useEffect(() => { muat(); }, []);
  if (!d) return null;
  const nilai = (k, t, f0) => (f[k] && f[k][f0] !== undefined ? f[k][f0] : t[f0]);
  const ubah = (k, kolom, v) => setF(x => ({ ...x, [k]: { ...(x[k] || {}), [kolom]: v } }));
  async function simpan(k, t) {
    const oleh = nilai(k, t, 'oleh'), aktif = nilai(k, t, 'aktif'), divisi = oleh === 'kadiv' ? nilai(k, t, 'divisi') : '';
    if (!aktif && !confirm('Menonaktifkan berarti tindakan “' + t.nama + '” langsung berjalan TANPA persetujuan siapa pun. Lanjutkan?')) return;
    try { const r = await api('/api/otorisasi-atur', { method: 'POST', body: JSON.stringify({ jenis: k, oleh, divisi, aktif }) });
      toast(r.penyetuju === 0 && aktif ? 'Tersimpan — PERHATIAN: belum ada pengguna aktif berjabatan ini, tindakan akan menunggu tanpa penyetuju' : 'Jenjang otorisasi tersimpan');
      muat(); } catch (e) { toast(e.message); }
  }
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>Jenjang Otorisasi</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Atur siapa yang menyetujui tiap tindakan yang ditahan. Perubahan berlaku untuk permintaan baru; permintaan yang sudah menunggu tetap
        mengikuti jenjang saat diajukan. Jabatan dan divisi seorang pengguna diatur di menu Pengguna.</div>
      <div className="tbl-wrap"><table className="tbl-compact" style={{ minWidth: 0 }}>
        <thead><tr><th>Tindakan yang ditahan</th><th>Disetujui oleh</th><th>Divisi</th><th>Ditahan</th><th></th></tr></thead>
        <tbody>{Object.entries(d.tindakan).map(([k, t]) => {
          const oleh = nilai(k, t, 'oleh'), berubah = Boolean(f[k]);
          return (
            <tr key={k} style={berubah ? { background: '#FFF8E9' } : {}}>
              <td><b>{t.nama}</b>{t.alternatif && t.alternatif.length ? <div className="hint" style={{ margin: 0 }}>alternatif setingkat: {t.alternatif.map(a => d.jabatan[a] || a).join(', ')}</div> : null}
                {t.diubah_oleh ? <div className="hint" style={{ margin: 0 }}>diubah {t.diubah_oleh}</div> : null}</td>
              <td><select value={oleh} onChange={e => ubah(k, 'oleh', e.target.value)} style={{ minHeight: 0, padding: '4px 6px' }}>
                {Object.entries(d.jabatan).map(([j, n]) => <option key={j} value={j}>{n}</option>)}</select></td>
              <td>{oleh === 'kadiv'
                ? <select value={nilai(k, t, 'divisi') || ''} onChange={e => ubah(k, 'divisi', e.target.value)} style={{ minHeight: 0, padding: '4px 6px' }}>
                    <option value="">— pilih divisi —</option>{d.divisi.map(x => <option key={x} value={x}>{x}</option>)}</select>
                : <span className="hint" style={{ margin: 0 }}>—</span>}</td>
              <td><input type="checkbox" checked={Boolean(nilai(k, t, 'aktif'))} onChange={e => ubah(k, 'aktif', e.target.checked)} /></td>
              <td><button className="sort-btn" style={{ padding: '2px 10px' }} disabled={!berubah} onClick={() => simpan(k, t)}>Simpan</button></td>
            </tr>);
        })}</tbody>
      </table></div>
    </div>
  );
}

// ===================== Templat Dokumen BAST (redaksi ditetapkan Legal) =====================
function TemplatDokumen() {
  const [d, setD] = useState(null);
  const [f, setF] = useState({});
  const [buka, setBuka] = useState('');
  const muat = () => api('/api/templat-dokumen').then(x => { setD(x); setF({}); }).catch(e => toast(e.message));
  useEffect(() => { muat(); }, []);
  if (!d) return null;
  const nilai = (x, k) => (f[x.kunci] && f[x.kunci][k] !== undefined ? f[x.kunci][k] : x[k]);
  const ubah = (x, k, v) => setF(o => ({ ...o, [x.kunci]: { ...(o[x.kunci] || {}), [k]: v } }));
  async function simpan(x) {
    try { await api('/api/templat-dokumen', { method: 'POST', body: JSON.stringify({ kunci: x.kunci, judul: nilai(x, 'judul'), isi: nilai(x, 'isi') }) });
      toast('Redaksi ' + x.nama + ' tersimpan'); muat(); } catch (e) { toast(e.message); }
  }
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>Templat Dokumen BAST</h2>
      <div className="hint" style={{ marginBottom: 8 }}>Redaksi dokumen serah terima ditetapkan Legal. Selama kosong, hasil cetak diberi tanda <b>DRAFT</b> dan hanya memuat data.
        Pisahkan paragraf dengan satu baris kosong. Isian otomatis ditulis dalam kurung kurawal:</div>
      <div style={{ fontSize: 11.5, lineHeight: 1.9, marginBottom: 10, color: 'var(--muted)' }}>
        {Object.entries(d.token).map(([k, v]) => <span key={k} title={v} style={{ display: 'inline-block', background: '#F1EFE6', borderRadius: 5, padding: '0 6px', margin: '0 4px 4px 0', fontFamily: 'ui-monospace, Menlo, monospace' }}>{'{' + k + '}'}</span>)}
      </div>
      {d.dok.map(x => (
        <div key={x.kunci} style={{ border: '1px solid var(--line)', borderRadius: 8, marginBottom: 8, background: '#fff' }}>
          <div onClick={() => setBuka(buka === x.kunci ? '' : x.kunci)} style={{ padding: '9px 12px', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
            <b>{x.nama}</b>
            <span className={'badge ' + (x.terisi ? 'b-hot' : 'b-warm')}>{x.terisi ? 'terisi' : 'belum diisi'}</span>
          </div>
          {buka === x.kunci && (
            <div style={{ padding: '0 12px 12px' }}>
              <div className="field"><label>Judul dokumen (kosong = judul bawaan)</label><input value={nilai(x, 'judul')} onChange={e => ubah(x, 'judul', e.target.value)} /></div>
              <div className="field"><label>Redaksi</label>
                <textarea rows={12} style={{ width: '100%', fontFamily: 'inherit', fontSize: 13, lineHeight: 1.6 }} value={nilai(x, 'isi')} onChange={e => ubah(x, 'isi', e.target.value)} /></div>
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={!f[x.kunci]} onClick={() => simpan(x)}>Simpan</button>
              {x.diubah_oleh && <span className="hint" style={{ marginLeft: 10 }}>terakhir diubah {x.diubah_oleh}</span>}
            </div>)}
        </div>))}
    </div>
  );
}

// ===================== SLA Proses KPR & AJB (Kontrol Proses Collection) =====================
// Batas waktu tiap tahap dihitung sejak tahap sebelumnya selesai (bukan dari tanggal verifikasi).
function SlaProses() {
  const [d, setD] = useState(null);
  const [kpr, setKpr] = useState([]);
  const [ajb, setAjb] = useState([]);
  useEffect(() => { api('/api/kontrol-proses?sla=1').then(x => { setD(x); setKpr(x.sla.kpr); setAjb(x.sla.ajb); }).catch(e => toast(e.message)); }, []);
  async function simpan() {
    try { await api('/api/kontrol-proses', { method: 'POST', body: JSON.stringify({ aksi: 'sla', kpr, ajb }) }); toast('SLA tersimpan — berlaku untuk tahap yang aktif berikutnya'); }
    catch (e) { toast(e.message); }
  }
  if (!d) return null;
  const kolom = (judul, nama, nilai, set, bawaan) => (
    <div style={{ flex: 1, minWidth: 280 }}>
      <div className="hint" style={{ fontWeight: 700, margin: '0 0 4px' }}>{judul}</div>
      <table className="tbl-compact" style={{ minWidth: 0 }}><tbody>
        {nama.map((n, i) => (<tr key={i}><td style={{ fontSize: 12.5 }}>{i + 1}. {n}</td>
          <td style={{ width: 90 }}><input type="number" min="1" max="120" value={nilai[i]} onChange={e => set(v => v.map((x, j) => (j === i ? e.target.value : x)))} style={{ width: 70 }} /> <span className="hint">hari</span></td></tr>))}
      </tbody></table>
      <div className="hint" style={{ margin: '4px 0 0' }}>Bawaan: {bawaan.join(' / ')} hari.</div>
    </div>);
  return (
    <div className="card" style={{ marginTop: 18 }}>
      <h2>SLA Proses KPR &amp; AJB</h2>
      <div className="hint" style={{ marginBottom: 10 }}>Batas waktu per tahap untuk menu <b>KPR &amp; AJB</b>. Tenggat tiap tahap = tanggal tahap sebelumnya selesai + hari di bawah;
        yang melewati tenggat ditandai terlambat dan masuk lonceng. Nilai bawaan adalah perkiraan — SOP Collection tidak menetapkan hari per langkah.</div>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        {kolom('Proses KPR (Bagian 2)', d.nama.kpr, kpr, setKpr, d.bawaan.kpr)}
        {kolom('Proses AJB (Bagian 3)', d.nama.ajb, ajb, setAjb, d.bawaan.ajb)}
      </div>
      <button className="btn btn-primary" style={{ width: 'auto', marginTop: 10 }} onClick={simpan}>Simpan SLA</button>
    </div>
  );
}
