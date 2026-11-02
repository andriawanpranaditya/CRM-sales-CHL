'use client';
import { Fragment, useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api } from '@/components/util';

const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const tgl = d => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');

// Kontrol Proses KPR & AJB (SOP Tim Collection Bagian 2 & 3): tiap kontrak terlihat sedang di tahap mana,
// sudah berapa hari, tenggatnya kapan, dan mana yang terlambat. Keputusan Bank dicatat sebagai titik kontrol.
export default function KontrolProsesPage() {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('kpr');
  const [buka, setBuka] = useState(null);
  const [busy, setBusy] = useState(false);
  const [cari, setCari] = useState('');
  const [hanyaTerlambat, setHanyaTerlambat] = useState(false);
  const [keputusan, setKeputusan] = useState(null);   // { trx_id, keputusan, tgl, no_sp3k, alasan, bank, plafon }
  const [gantiBank, setGantiBank] = useState(null);   // { trx_id, bank }

  const muat = () => api('/api/kontrol-proses').then(setD).catch(e => toast(e.message));
  useEffect(() => { muat(); }, []);

  async function toggle(item) {
    setBusy(true);
    try { await api('/api/proses', { method: 'PATCH', body: JSON.stringify({ id: item.id, aksi: 'toggle' }) }); muat(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function simpanKeputusan() {
    const k = keputusan;
    if (k.keputusan === 'ditolak' && !k.alasan.trim()) return toast('Alasan penolakan Bank wajib diisi');
    if (!confirm(k.keputusan === 'disetujui' ? 'Catat SP3K terbit (kredit DISETUJUI)? Tahap 1–5 dinyatakan selesai, tahap 6 (IOM) mulai berjalan.'
      : 'Catat kredit DITOLAK oleh ' + (k.bank || 'Bank') + '?')) return;
    setBusy(true);
    try { const r = await api('/api/kontrol-proses', { method: 'POST', body: JSON.stringify({ aksi: 'keputusan', ...k }) });
      toast(r.status_kredit === 'Disetujui' ? 'SP3K tercatat — lanjut ke IOM Subsidi DP & Biaya Akad' : 'Penolakan Bank tercatat (percobaan ke-' + r.percobaan_bank + ')');
      setKeputusan(null); muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function simpanGantiBank() {
    if (!gantiBank.bank.trim()) return toast('Nama bank baru wajib diisi');
    setBusy(true);
    try { const r = await api('/api/kontrol-proses', { method: 'POST', body: JSON.stringify({ aksi: 'ganti_bank', ...gantiBank }) });
      toast('Pengajuan diulang ke ' + gantiBank.bank + ' (bank ke-' + r.percobaan_bank + ')'); setGantiBank(null); muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  if (!d) return <div className="loading">Memuat…</div>;
  const rows = (tab === 'ajb' ? d.ajb : d.kpr)
    .filter(r => !cari || [r.nama, r.unit, r.no_sp, r.bank].some(x => (x || '').toLowerCase().includes(cari.toLowerCase())))
    .filter(r => !hanyaTerlambat || r.terlambat > 0);
  const semua = tab === 'ajb' ? d.ajb : d.kpr;
  const jumlahTahap = tab === 'kpr' ? 9 : 8;
  const perTahap = Array.from({ length: jumlahTahap }, (_, i) => semua.filter(r => !r.selesai && r.tahap_no === i + 1 && (tab === 'kpr' || r.aktif)).length);
  const nTerlambat = semua.filter(r => r.terlambat > 0).length;
  const nSelesai = semua.filter(r => r.selesai).length;
  const nMenunggu = tab === 'ajb' ? semua.filter(r => !r.aktif && !r.selesai).length : 0;
  const nDitolak = tab === 'kpr' ? semua.filter(r => r.status_kredit === 'Ditolak').length : 0;

  const warnaStatus = r => r.selesai ? '#12604B' : r.terlambat > 0 ? 'var(--red)' : (r.deadline && r.deadline <= tambah(d.hari_ini, 2)) ? '#8a5f14' : '#1B211A';
  const labelStatus = r => r.selesai ? 'Selesai' : (tab === 'ajb' && !r.aktif) ? 'Menunggu pemicu' : r.terlambat > 0 ? 'Terlambat ' + r.terlambat + ' hari' : !r.deadline ? 'Belum ada tenggat' : (r.deadline <= tambah(d.hari_ini, 2)) ? 'Mendekati tenggat' : 'Sesuai jadwal';

  return (
    <>
      <div className="page-head"><div><h1>KPR &amp; AJB</h1>
        <div className="sub">Posisi tiap kontrak pada proses KPR (Bagian 2) dan AJB (Bagian 3) SOP Collection — tahap berjalan, hari berjalan, tenggat, dan keterlambatan. Tenggat tiap tahap = SLA (Settings) dihitung sejak tahap sebelumnya selesai.</div></div></div>

      <div className="form-tabs" style={{ marginBottom: 10 }}>
        <button className={tab === 'kpr' ? 'active' : ''} onClick={() => { setTab('kpr'); setBuka(null); }}>Proses KPR ({d.kpr.length})</button>
        <button className={tab === 'ajb' ? 'active' : ''} onClick={() => { setTab('ajb'); setBuka(null); }}>Proses AJB ({d.ajb.length})</button>
        <button className={tab === 'ceklis' ? 'active' : ''} onClick={() => { setTab('ceklis'); setBuka(null); }}>Ceklis Dokumen KPR ({d.kpr.length})</button>
      </div>
      {tab === 'ceklis' && <CeklisDokumen d={d} muat={muat} busy={busy} setBusy={setBusy} />}

      {tab !== 'ceklis' && (<>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
        <span className="badge b-overdue" style={{ cursor: 'pointer' }} onClick={() => setHanyaTerlambat(v => !v)}>{nTerlambat} terlambat{hanyaTerlambat ? ' ✓' : ''}</span>
        {tab === 'kpr' && nDitolak > 0 && <span className="badge b-lost">{nDitolak} ditolak Bank</span>}
        {tab === 'ajb' && <span className="badge b-cold">{nMenunggu} menunggu pemicu</span>}
        <span className="badge b-hot">{nSelesai} selesai</span>
        {perTahap.map((n, i) => n > 0 && <span key={i} className="badge" style={{ background: '#F4F1E6', color: '#6B531C' }}>Tahap {i + 1}: {n}</span>)}
      </div>

      <div className="fu-toolbar"><input value={cari} onChange={e => setCari(e.target.value)} placeholder="cari konsumen, unit, No. SP, bank" style={{ maxWidth: 280 }} /></div>

      <div className="tbl-wrap"><table className="tbl-compact">
        <thead><tr><th></th><th>Konsumen</th><th>Project / Unit</th>{tab === 'kpr' && <th>Bank</th>}<th>Tahap berjalan</th><th className="num">Hari</th><th>Tenggat</th><th>Status</th></tr></thead>
        <tbody>{rows.map(r => (
          <Fragment key={r.id}>
            <tr onClick={() => setBuka(buka === r.id ? null : r.id)} style={{ cursor: 'pointer' }}>
              <td>{buka === r.id ? '▾' : '▸'}</td>
              <td><b>{r.nama}</b><div className="hint" style={{ margin: 0 }}>{r.no_sp} · {r.sales}</div></td>
              <td>{r.project} · {r.unit}</td>
              {tab === 'kpr' && <td>{r.bank || <span className="hint">belum diisi</span>}
                {r.status_kredit === 'Ditolak' && <div style={{ color: 'var(--red)', fontSize: 12 }}>Ditolak (bank ke-{r.percobaan_bank})</div>}
                {r.status_kredit === 'Disetujui' && <div style={{ color: '#12604B', fontSize: 12 }}>SP3K {tgl(r.tgl_sp3k)}</div>}</td>}
              <td>{r.selesai ? <span style={{ color: '#12604B' }}>Selesai semua</span> : (tab === 'ajb' && !r.aktif) ? <span className="hint">{r.pemicu}</span> : <><b>{r.tahap_no}/{r.jumlah}</b> · {r.tahap_nama}</>}
                <div style={{ height: 4, background: '#EFEDE3', borderRadius: 2, marginTop: 4, maxWidth: 220 }}>
                  <div style={{ width: (r.jumlah_selesai / r.jumlah * 100) + '%', height: 4, background: r.selesai ? '#12604B' : '#C9962B', borderRadius: 2 }} /></div></td>
              <td className="num">{r.hari_di_tahap != null ? r.hari_di_tahap : '—'}</td>
              <td>{r.selesai || !r.deadline ? '—' : tgl(r.deadline)}</td>
              <td><span style={{ color: warnaStatus(r), fontWeight: 700 }}>{labelStatus(r)}</span></td>
            </tr>
            {buka === r.id && (
              <tr><td colSpan={tab === 'kpr' ? 8 : 7} style={{ background: '#FBFAF4', padding: 14 }}>
                <table className="tbl-compact" style={{ minWidth: 0 }}>
                  <thead><tr><th>#</th><th>Tahap</th><th>Tenggat</th><th>Selesai</th><th></th></tr></thead>
                  <tbody>{r.tahap.map(t => {
                    const berjalan = !r.selesai && t.no === r.tahap_no;
                    const lewat = t.status !== 'Selesai' && t.deadline && t.deadline < d.hari_ini;
                    return (<tr key={t.id} style={berjalan ? { background: '#FFF8E9' } : t.status === 'Selesai' ? { opacity: .7 } : {}}>
                      <td>{t.no}</td>
                      <td>{t.nama}{berjalan && <span className="badge b-warm" style={{ marginLeft: 6 }}>berjalan</span>}</td>
                      <td style={lewat ? { color: 'var(--red)', fontWeight: 700 } : {}}>{t.deadline ? tgl(t.deadline) : <span className="hint">—</span>}</td>
                      <td>{t.status === 'Selesai' ? <span style={{ color: '#12604B' }}>✓ {tgl(t.selesai_at)}{t.selesai_by ? ' · ' + t.selesai_by : ''}</span> : <span className="hint">belum</span>}</td>
                      <td style={{ whiteSpace: 'nowrap' }}>
                        {d.boleh_ubah && (tab === 'kpr' || r.aktif) && !(tab === 'kpr' && t.no === 5 && t.status !== 'Selesai') &&
                          <button className="sort-btn" style={{ padding: '2px 8px' }} disabled={busy} onClick={() => toggle(t)}>{t.status === 'Selesai' ? 'Batalkan ✓' : 'Tandai selesai'}</button>}
                        {d.boleh_ubah && tab === 'kpr' && t.no === 5 && t.status !== 'Selesai' && r.status_kredit !== 'Ditolak' &&
                          <button className="btn btn-primary" style={{ width: 'auto', padding: '3px 10px' }} onClick={() => setKeputusan({ trx_id: r.id, keputusan: 'disetujui', tgl: d.hari_ini, no_sp3k: '', alasan: '', bank: r.bank || '', plafon: r.plafon || '' })}>Catat keputusan Bank</button>}
                      </td>
                    </tr>);
                  })}</tbody>
                </table>
                {tab === 'kpr' && r.status_kredit === 'Ditolak' && (
                  <div className="note" style={{ marginTop: 10 }}>
                    🚫 Kredit <b>ditolak</b> oleh {r.bank} (bank ke-{r.percobaan_bank}): {r.alasan_tolak}
                    {r.percobaan_bank >= 2 ? <div style={{ marginTop: 4 }}>Sudah ditolak ≥ 2 bank — sesuai ketentuan, kontrak <b>layak diajukan pembatalan</b> (Piutang → Batalkan Kontrak, kategori <i>KPR ditolak</i>), atau konsumen mengubah skema bayar.</div>
                      : <div style={{ marginTop: 4 }}>Pilihan: ajukan ke Bank lain (tahap 2–5 diulang), atau konsumen mengubah skema bayar.</div>}
                    {d.boleh_ubah && <button className="sort-btn" style={{ marginTop: 6 }} onClick={() => setGantiBank({ trx_id: r.id, bank: '' })}>Ganti Bank, ajukan ulang…</button>}
                  </div>)}
                {tab === 'ajb' && !r.aktif && !r.selesai && <div className="hint" style={{ marginTop: 8 }}>Tahap AJB belum mulai — {r.pemicu}{r.skema_jenis !== 'kpr' ? ' (sisa tagihan ' + rp(r.sisa_tagihan) + ')' : ''}. Tenggat tahap 1 terpasang otomatis begitu pemicunya terpenuhi.</div>}
              </td></tr>)}
          </Fragment>))}
          {!rows.length && <tr><td colSpan={8} className="hint" style={{ padding: 16 }}>{hanyaTerlambat ? 'Tidak ada yang terlambat.' : 'Belum ada kontrak pada proses ini.'}</td></tr>}
        </tbody></table></div>
      </>)}

      {keputusan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={() => setKeputusan(null)}>
          <div className="card" style={{ width: 400, margin: 0 }} onClick={e => e.stopPropagation()}>
            <h2>Keputusan Bank (SP3K)</h2>
            <div className="field"><label>Keputusan</label>
              <select value={keputusan.keputusan} onChange={e => setKeputusan({ ...keputusan, keputusan: e.target.value })}>
                <option value="disetujui">Disetujui — SP3K terbit</option><option value="ditolak">Ditolak</option></select></div>
            <div className="field"><label>Bank</label><input value={keputusan.bank} onChange={e => setKeputusan({ ...keputusan, bank: e.target.value })} /></div>
            <div className="field"><label>Tanggal</label><input type="date" value={keputusan.tgl} onChange={e => setKeputusan({ ...keputusan, tgl: e.target.value })} /></div>
            {keputusan.keputusan === 'disetujui' ? (<>
              <div className="field"><label>No. SP3K</label><input value={keputusan.no_sp3k} onChange={e => setKeputusan({ ...keputusan, no_sp3k: e.target.value })} /></div>
              <div className="field"><label>Plafon disetujui (Rp, opsional)</label><input type="number" min="0" value={keputusan.plafon} onChange={e => setKeputusan({ ...keputusan, plafon: e.target.value })} /></div>
            </>) : (
              <div className="field"><label>Alasan penolakan *</label><input value={keputusan.alasan} onChange={e => setKeputusan({ ...keputusan, alasan: e.target.value })} placeholder="mis. SLIK bermasalah, penghasilan tidak mencukupi" /></div>)}
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={simpanKeputusan}>Simpan</button>
              <button className="sort-btn" onClick={() => setKeputusan(null)}>Batal</button>
            </div>
          </div>
        </div>)}

      {gantiBank && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={() => setGantiBank(null)}>
          <div className="card" style={{ width: 360, margin: 0 }} onClick={e => e.stopPropagation()}>
            <h2>Ajukan ke Bank Lain</h2>
            <div className="hint" style={{ marginBottom: 8 }}>Tahap 2–5 (pengajuan s.d. keputusan Bank) diulang untuk bank baru; berkas tahap 1 tidak perlu dikumpulkan ulang.</div>
            <div className="field"><label>Bank baru *</label><input value={gantiBank.bank} onChange={e => setGantiBank({ ...gantiBank, bank: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={simpanGantiBank}>Ajukan ulang</button>
              <button className="sort-btn" onClick={() => setGantiBank(null)}>Batal</button>
            </div>
          </div>
        </div>)}
      <Toast />
    </>
  );
}

function tambah(tgl, n) { return new Date(new Date(tgl + 'T00:00:00Z').getTime() + n * 86400000).toISOString().slice(0, 10); }

// ===================== Ceklis Dokumen KPR — kolom & struktur mengikuti ceklis eksternal Collection =====================
const WARNA_HASIL = { 'Data belum lengkap': '#6B7280', Proses: '#8a5f14', SP3K: '#274E7A', 'Akad Kredit': '#12604B', Reject: 'var(--red)' };
const WARNA_BI = { Lancar: '#12604B', 'Tidak Lancar': 'var(--red)', Proses: '#8a5f14' };

function CeklisDokumen({ d, muat, busy, setBusy }) {
  const [edit, setEdit] = useState(null);
  const [cari, setCari] = useState('');
  const [saring, setSaring] = useState('');
  const rows = d.kpr.filter(r => !cari || [r.nama, r.unit, r.sales, r.kantor_agent, r.bank, r.kota].some(x => (x || '').toLowerCase().includes(cari.toLowerCase())))
    .filter(r => !saring || r.hasil === saring);
  const karyawan = d.dokumen.slice(0, 18), wirausaha = d.dokumen.slice(18);

  async function simpan() {
    setBusy(true);
    try { await api('/api/kontrol-proses', { method: 'POST', body: JSON.stringify({ aksi: 'ceklis', ...edit }) }); toast('Ceklis tersimpan'); setEdit(null); muat(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  function unduhCSV() {
    const kolom = ['NO', 'NAMA KONSUMEN', 'BLOK/UNIT', 'TGL BI CHECKING', 'NAMA AGENT', 'KANTOR AGENT', 'ALAMAT KTP', 'KOTA/KABUPATEN', 'BI CHECKING', 'PINJAMAN', 'HASIL BI', 'UPDATE SERTIFIKAT',
      ...d.dokumen.map(([, l]) => l), 'HASIL', 'LPA', 'SLF', 'SURAT PERNYATAAN KONSUMEN', 'BANK', 'TGL. AKAD', 'KETERANGAN'];
    const ya = v => (v ? 'YA' : 'TIDAK');
    const baris = rows.map((r, i) => [i + 1, r.nama, r.unit, r.tgl_bi_checking || '', r.sales || '', r.kantor_agent, r.alamat_ktp, r.kota, r.bi_checking, r.pinjaman, r.hasil_bi, r.update_sertifikat,
      ...d.dokumen.map(([k]) => ya(r.dokumen[k])), r.hasil, ya(r.lpa), ya(r.slf), ya(r.surat_pernyataan), r.bank || '', r.tgl_akad || '', r.keterangan]);
    const esc = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const csv = '\uFEFF' + [kolom, ...baris].map(b => b.map(esc).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'ceklis_dokumen_kpr_' + d.hari_ini + '.csv'; a.click();
  }
  const Rekap = ({ judul, data }) => (
    <div style={{ minWidth: 170 }}><div className="hint" style={{ fontWeight: 700, margin: '0 0 2px' }}>{judul}</div>
      {Object.entries(data).sort((a, b) => b[1] - a[1]).map(([k, v]) => <div key={k} style={{ fontSize: 12.5, display: 'flex', justifyContent: 'space-between', gap: 10 }}><span>{k}</span><b>{v}</b></div>)}
      {!Object.keys(data).length && <div className="hint" style={{ margin: 0 }}>—</div>}</div>);
  const Tanda = ({ v }) => <span style={{ color: v ? '#12604B' : '#C9C6B6', fontWeight: 700 }}>{v ? '✓' : '·'}</span>;

  return (<>
    <div className="card" style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', gap: 24, flexWrap: 'wrap' }}>
        <Rekap judul={'Hasil proses · ' + d.rekap.total + ' unit'} data={d.rekap.hasil} />
        <Rekap judul="BI checking — belum proses Bank" data={d.rekap.bi_belum_bank} />
        <Rekap judul="Kantor agent" data={d.rekap.kantor_agent} />
        <Rekap judul="Proses Bank" data={d.rekap.bank} />
        <Rekap judul="Update sertifikat — SP3K" data={d.rekap.sertifikat_sp3k} />
        <Rekap judul="Update sertifikat — Akad" data={d.rekap.sertifikat_akad} />
      </div>
    </div>
    <div className="fu-toolbar" style={{ gap: 8, flexWrap: 'wrap' }}>
      <input value={cari} onChange={e => setCari(e.target.value)} placeholder="cari konsumen, unit, agent, kantor, bank, kota" style={{ maxWidth: 300 }} />
      <select value={saring} onChange={e => setSaring(e.target.value)} style={{ minHeight: 0 }}><option value="">semua hasil</option>
        {['Data belum lengkap', 'Proses', 'SP3K', 'Akad Kredit', 'Reject'].map(h => <option key={h}>{h}</option>)}</select>
      <button className="sort-btn" onClick={unduhCSV}>⇩ Unduh CSV (format Excel)</button>
    </div>
    <div className="tbl-wrap"><table className="tbl-compact" style={{ fontSize: 12 }}>
      <thead><tr><th>No</th><th>Konsumen</th><th>Blok/Unit</th><th>Tgl BI</th><th>Agent · Kantor</th><th>Alamat KTP · Kota</th><th>BI Checking</th><th>Pinjaman</th><th>Hasil BI</th><th>Sertifikat</th>
        <th>Dokumen</th><th>Hasil</th><th>LPA</th><th>SLF</th><th>Pernyataan</th><th>Bank</th><th>Tgl Akad</th><th>Keterangan</th><th></th></tr></thead>
      <tbody>{rows.map((r, i) => (
        <tr key={r.id}>
          <td>{i + 1}</td><td><b>{r.nama}</b></td><td>{r.unit}</td><td>{tgl(r.tgl_bi_checking)}</td>
          <td>{r.sales || '—'}<div className="hint" style={{ margin: 0 }}>{r.kantor_agent || '—'}</div></td>
          <td style={{ maxWidth: 220, fontSize: 11.5 }}>{r.alamat_ktp || '—'}<div className="hint" style={{ margin: 0 }}>{r.kota || ''}</div></td>
          <td>{r.bi_checking || '—'}</td><td>{r.pinjaman || '—'}</td>
          <td style={{ color: WARNA_BI[r.hasil_bi] || '#6B7280', fontWeight: 700 }}>{r.hasil_bi || '—'}</td>
          <td>{r.update_sertifikat || '—'}</td>
          <td title={d.dokumen.filter(([k]) => r.dokumen[k]).map(([, l]) => l).join(', ') || 'belum ada'}><b>{r.dok.ada}/{r.dok.total}</b><div className="hint" style={{ margin: 0 }}>{r.jenis_pemohon}</div></td>
          <td style={{ color: WARNA_HASIL[r.hasil], fontWeight: 700 }}>{r.hasil}</td>
          <td><Tanda v={r.lpa} /></td><td><Tanda v={r.slf} /></td><td><Tanda v={r.surat_pernyataan} /></td>
          <td>{r.bank || '—'}{r.status_kredit === 'Ditolak' && <div style={{ color: 'var(--red)', fontSize: 11 }}>ditolak</div>}</td>
          <td>{tgl(r.tgl_akad)}</td>
          <td style={{ maxWidth: 200, fontSize: 11.5 }}>{r.keterangan || ''}</td>
          <td>{d.boleh_ubah && <button className="sort-btn" style={{ padding: '2px 8px' }} onClick={() => setEdit({ trx_id: r.id, nama: r.nama, unit: r.unit, kantor_agent: r.kantor_agent,
            tgl_bi_checking: r.tgl_bi_checking || '', bi_checking: r.bi_checking, pinjaman: r.pinjaman, hasil_bi: r.hasil_bi, update_sertifikat: r.update_sertifikat,
            jenis_pemohon: r.jenis_pemohon, dokumen: { ...r.dokumen }, lpa: r.lpa, slf: r.slf, surat_pernyataan: r.surat_pernyataan, keterangan: r.keterangan })}>Ubah</button>}</td>
        </tr>))}
        {!rows.length && <tr><td colSpan={19} className="hint" style={{ padding: 16 }}>Belum ada kontrak KPR.</td></tr>}
      </tbody></table></div>

    {edit && (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={() => setEdit(null)}>
        <div className="card" style={{ width: 620, maxHeight: '92vh', overflowY: 'auto', margin: 0 }} onClick={e => e.stopPropagation()}>
          <h2>Ceklis Dokumen KPR</h2>
          <div className="hint" style={{ marginBottom: 8 }}>{edit.nama} · {edit.unit}</div>
          <div className="form-grid">
            <div className="field"><label>Kantor agent</label><input value={edit.kantor_agent} onChange={e => setEdit({ ...edit, kantor_agent: e.target.value })} placeholder="mis. Khanza Property" /></div>
            <div className="field"><label>Jenis pemohon</label><select value={edit.jenis_pemohon} onChange={e => setEdit({ ...edit, jenis_pemohon: e.target.value })}><option>Karyawan</option><option>Wirausaha</option></select></div>
            <div className="field"><label>Tgl BI checking</label><input type="date" value={edit.tgl_bi_checking} onChange={e => setEdit({ ...edit, tgl_bi_checking: e.target.value })} /></div>
            <div className="field"><label>Hasil BI checking</label><select value={edit.hasil_bi} onChange={e => setEdit({ ...edit, hasil_bi: e.target.value })}><option value="">—</option>{d.hasil_bi.map(h => <option key={h}>{h}</option>)}</select></div>
            <div className="field"><label>BI checking (kolektibilitas)</label><input value={edit.bi_checking} onChange={e => setEdit({ ...edit, bi_checking: e.target.value })} placeholder="mis. Kol 1 (5 pinjaman), Tidak ada pinjaman" /></div>
            <div className="field"><label>Pinjaman</label><input value={edit.pinjaman} onChange={e => setEdit({ ...edit, pinjaman: e.target.value })} placeholder="mis. > 1.000.000" /></div>
            <div className="field"><label>Update sertifikat</label><select value={edit.update_sertifikat} onChange={e => setEdit({ ...edit, update_sertifikat: e.target.value })}><option value="">—</option>{d.update_sertifikat.map(h => <option key={h}>{h}</option>)}</select></div>
          </div>
          <div className="hint" style={{ fontWeight: 700, margin: '10px 0 4px' }}>Kelengkapan dokumen — Karyawan</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 12px', fontSize: 13 }}>
            {karyawan.map(([k, l]) => <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={Boolean(edit.dokumen[k])} onChange={e => setEdit({ ...edit, dokumen: { ...edit.dokumen, [k]: e.target.checked } })} />{l}</label>)}
          </div>
          <div className="hint" style={{ fontWeight: 700, margin: '10px 0 4px' }}>Kelengkapan dokumen — Wirausaha</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px 12px', fontSize: 13 }}>
            {wirausaha.map(([k, l]) => <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={Boolean(edit.dokumen[k])} onChange={e => setEdit({ ...edit, dokumen: { ...edit.dokumen, [k]: e.target.checked } })} />{l}</label>)}
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', margin: '12px 0 6px', fontSize: 13 }}>
            {[['lpa', 'LPA'], ['slf', 'SLF'], ['surat_pernyataan', 'Surat pernyataan konsumen']].map(([k, l]) => <label key={k} style={{ display: 'flex', gap: 6, alignItems: 'center' }}><input type="checkbox" checked={Boolean(edit[k])} onChange={e => setEdit({ ...edit, [k]: e.target.checked })} />{l}</label>)}
          </div>
          <div className="field"><label>Keterangan</label><input value={edit.keterangan} onChange={e => setEdit({ ...edit, keterangan: e.target.value })} placeholder="mis. konsumen tidak respon, rencana akad tgl …" /></div>
          <div className="hint">Hasil proses, bank, dan tanggal akad tidak diisi di sini — mengikuti tahap Proses KPR dan keputusan Bank yang sudah tercatat.</div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={simpan}>Simpan</button>
            <button className="sort-btn" onClick={() => setEdit(null)}>Batal</button>
          </div>
        </div>
      </div>)}
  </>);
}
