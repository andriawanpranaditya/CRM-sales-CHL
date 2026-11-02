'use client';
import { Fragment, useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api } from '@/components/util';

const rp = n => 'Rp ' + Number(n || 0).toLocaleString('id-ID');
const tgl = d => (d ? new Date(d).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }) : '—');
const WARNA_STATUS = { Lunas: '#12604B', Sebagian: '#8a5f14', Belum: '#6B7280' };
const LABEL_STATUS = { Lunas: 'Lunas', Sebagian: 'Bayar Sebagian', Belum: 'Belum Bayar' };
const KATEGORI_BATAL = {
  sepihak: 'Dibatalkan sepihak oleh pemesan — semua pembayaran hangus',
  kpr_ditolak: 'KPR ditolak oleh minimal 2 bank — booking fee hangus, DP/angsuran dikembalikan setelah dipotong',
  menunggak: 'Menunggak (SP3 tidak dibayar) — booking fee hangus, DP/angsuran dikembalikan setelah dipotong',
  khusus: 'Kebijakan khusus — nilai pengembalian ditetapkan manual',
};
const JENIS_LABEL = { BF: 'Booking Fee', DP: 'Uang Muka', ANG: 'Angsuran', PELUNASAN: 'Pelunasan', AKAD: 'Akad Kredit', DENDA: 'Denda Keterlambatan', ADM: 'Biaya Administrasi' };

export default function PiutangPage() {
  const [rows, setRows] = useState(null);
  const [belumJadwal, setBelumJadwal] = useState(null);
  const [tampilBelumJadwal, setTampilBelumJadwal] = useState(false);
  const [buka, setBuka] = useState(null);       // trx id yang detailnya sedang dibuka
  const [detail, setDetail] = useState(null);   // { kontrak, tagihan, pembayaran }
  const [busy, setBusy] = useState(false);
  const [cari, setCari] = useState('');
  const [bayarDialog, setBayarDialog] = useState(null);   // { tagihan_id? } saat mencatat TTS baru
  const [form, setForm] = useState({ nilai: '', tgl: new Date().toISOString().slice(0, 10), cara: 'Transfer', bank: '', keterangan: '' });
  const [jadwalDialog, setJadwalDialog] = useState(null); // kontrak yang sedang dibentukkan jadwalnya
  const [kprDialog, setKprDialog] = useState(null);      // form data KPR (bank, akad, plafon)
  const [followDialog, setFollowDialog] = useState(null); // form follow up penagihan
  const [ajbDialog, setAjbDialog] = useState(null);        // form data AJB (BPHTB, PPh, Notaris)
  const [ubahDialog, setUbahDialog] = useState(null);    // perubahan kontrak: { jenis, ...isian }
  const [tampilBatal, setTampilBatal] = useState(false); // tampilkan kontrak yang sudah dibatalkan
  const [batalDialog, setBatalDialog] = useState(null);  // pembatalan kontrak: { kategori, alasan, ... }
  const [batalPv, setBatalPv] = useState(null);          // pratinjau perhitungan pengembalian
  const [refundDialog, setRefundDialog] = useState(null); // pencatatan pembayaran pengembalian
  const [hasilCari, setHasilCari] = useState([]);
  const [unitOpsi, setUnitOpsi] = useState([]);
  const [skemaList, setSkemaList] = useState([]);
  const [skemaPilih, setSkemaPilih] = useState('');

  const muat = () => api('/api/piutang').then(d => setRows(d.rows)).catch(e => toast(e.message));
  const muatBelumJadwal = () => api('/api/piutang?belum_jadwal=1').then(d => setBelumJadwal(d.rows)).catch(() => setBelumJadwal([]));
  useEffect(() => { muat(); muatBelumJadwal(); }, []);

  async function bukaBaris(id) {
    if (buka === id) { setBuka(null); return; }
    setBuka(id); setDetail(null);
    try { setDetail(await api('/api/piutang?id=' + id)); } catch (e) { toast(e.message); }
  }
  async function segarkanDetail(id) { try { setDetail(await api('/api/piutang?id=' + id)); } catch (e) { toast(e.message); } }

  async function bukaFormJadwal(k) {
    setJadwalDialog(k); setSkemaPilih('');
    try { const d = await api('/api/skema?project=' + encodeURIComponent(k.project)); setSkemaList((d.rows || []).filter(r => r.aktif)); }
    catch { setSkemaList([]); }
  }
  async function simpanJadwal() {
    if (!skemaPilih) return toast('Pilih skema cara bayar');
    setBusy(true);
    try {
      const r = await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: 'jadwal', trx_id: jadwalDialog.id, skema_kode: skemaPilih }) });
      toast('Jadwal terbentuk — ' + r.jadwal + ' baris tagihan (' + r.skema + ')' + (r.dipindah ? ', ' + r.dipindah + ' pembayaran lama ikut dipindahkan' : ''));
      setJadwalDialog(null); muat(); muatBelumJadwal();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  async function simpanTTS() {
    if (!Number(form.nilai) || Number(form.nilai) <= 0) return toast('Nilai pembayaran wajib diisi');
    setBusy(true);
    try {
      const r = await api('/api/piutang', { method: 'POST', body: JSON.stringify({
        aksi: 'tts', trx_id: buka, tagihan_id: bayarDialog?.tagihan_id || null, ...form, nilai: Number(form.nilai) }) });
      toast('TTS ' + r.no_tts + ' tercatat — menunggu Finance menerbitkan kuitansi');
      setBayarDialog(null); setForm({ nilai: '', tgl: new Date().toISOString().slice(0, 10), cara: 'Transfer', bank: '', keterangan: '' });
      segarkanDetail(buka); muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  async function terbitkanSP(tingkat) {
    if (!confirm('Terbitkan Surat Peringatan ' + tingkat + ' untuk kontrak ini?')) return;
    setBusy(true);
    try { const r = await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: 'sp', trx_id: buka, tingkat }) });
      toast('SP' + r.tingkat + ' terbit — ' + r.no_surat); segarkanDetail(buka); muat();
      window.open('/cetak-sp?id=' + r.id, '_blank');
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function batalkanSP(x) {
    const alasan = prompt('Alasan membatalkan SP' + x.tingkat + ' (' + x.no_surat + '):');
    if (!alasan) return;
    setBusy(true);
    try { await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: 'sp_batal', sp_id: x.id, alasan }) });
      toast('Surat peringatan dibatalkan'); segarkanDetail(buka); muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  useEffect(() => {
    if (!batalDialog) { setBatalPv(null); return; }
    const u = batalDialog;
    const q = '?batal_preview=1&id=' + buka + '&kategori=' + u.kategori + '&pajak_dipotong=' + (u.pajak_dipotong || 0)
      + '&biaya_lain=' + (u.biaya_lain || 0) + '&nilai_manual=' + (u.nilai_manual || 0);
    api('/api/piutang' + q).then(setBatalPv).catch(() => setBatalPv(null));
  }, [batalDialog && batalDialog.kategori, batalDialog && batalDialog.pajak_dipotong, batalDialog && batalDialog.biaya_lain, batalDialog && batalDialog.nilai_manual, buka]);

  async function simpanBatal() {
    const u = batalDialog;
    if (!u.alasan.trim()) return toast('Alasan pembatalan wajib diisi');
    if (u.kategori === 'khusus' && u.nilai_manual === '') return toast('Isi nilai pengembalian (boleh 0)');
    const kembali = batalPv ? batalPv.hasil.nilaiKembali : 0;
    if (!confirm('BATALKAN kontrak ' + detail.kontrak.nama + ' — ' + detail.kontrak.unit + '?\n\nPengembalian ke konsumen: ' + rp(kembali)
      + '\nKontrak berhenti ditagih, unit dilepas, dan pembatalan ini tidak dapat diurungkan.\nMemerlukan otorisasi Project CEO.')) return;
    setBusy(true);
    try {
      const r = await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: 'batal_kontrak', trx_id: buka, ...u }) });
      toast('Kontrak dibatalkan — pengembalian ' + rp(r.nilai_kembali));
      if (r.pencairan_bank > 0) alert('PERHATIAN: pencairan dari bank ' + rp(r.pencairan_bank) + ' sudah masuk dan harus dikembalikan ke bank secara terpisah — tidak termasuk pengembalian ke konsumen.');
      if (r.komisi_dibayar > 0) alert('PERHATIAN: komisi Sales ' + rp(r.komisi_dibayar) + ' sudah dibayar. Komisi tidak ditarik otomatis — tindak lanjuti secara manual.');
      setBatalDialog(null); segarkanDetail(buka); muat();
    } catch (e) { toast(e.message); if (e.otorisasi) setBatalDialog(null); } finally { setBusy(false); }
  }
  async function ajukanRefund() {
    if (!confirm('Ajukan pengembalian dana ' + rp(detail.pembatalan.nilai_kembali) + ' kepada konsumen?')) return;
    setBusy(true);
    try { await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: 'refund_ajukan', trx_id: buka }) }); toast('Pengembalian diajukan'); segarkanDetail(buka); muat(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function bayarRefund() {
    setBusy(true);
    try { await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: 'refund_bayar', trx_id: buka, ...refundDialog }) });
      toast('Pembayaran pengembalian dicatat'); setRefundDialog(null); segarkanDetail(buka); muat(); }
    catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  const hariIni = () => new Date().toISOString().slice(0, 10);
  async function bukaUbah(jenis) {
    const dasar = { jenis, tgl: hariIni(), alasan: '', biaya_adm: '', addendum: true };
    setHasilCari([]); setUnitOpsi([]);
    if (jenis === 'adjustment') setUbahDialog({ ...dasar, harga_baru: String(detail.kontrak.harga_unit || '') });
    else if (jenis === 'pindah_unit') {
      setUbahDialog({ ...dasar, unit_baru: '', harga_baru: '' });
      try { const d = await api('/api/piutang?unit_kosong=1&id=' + buka); setUnitOpsi(d.rows); } catch (e) { toast(e.message); }
    } else setUbahDialog({ ...dasar, lead_baru: '', nama_baru: '', cari: '' });
  }
  async function cariLead(q) {
    setUbahDialog(d => ({ ...d, cari: q }));
    if (q.trim().length < 2) { setHasilCari([]); return; }
    try { const d = await api('/api/piutang?id=' + buka + '&cari_lead=' + encodeURIComponent(q.trim())); setHasilCari(d.rows); } catch { setHasilCari([]); }
  }
  async function simpanUbah() {
    const u = ubahDialog;
    const ringkas = u.jenis === 'pengalihan' ? 'Alihkan hak kontrak ini kepada ' + u.nama_baru + '?'
      : u.jenis === 'pindah_unit' ? 'Pindahkan kontrak ini ke unit ' + u.unit_baru + (u.harga_baru ? ' dengan nilai Rp ' + Number(u.harga_baru).toLocaleString('id-ID') : '') + '?'
      : 'Ubah nilai kontrak menjadi Rp ' + Number(u.harga_baru).toLocaleString('id-ID') + '? Jadwal tagihan akan dibentuk ulang dan pembayaran yang sudah masuk dialokasikan ulang.';
    if (u.jenis === 'pengalihan' && !u.lead_baru) return toast('Pilih pemilik baru dari hasil pencarian');
    if (u.jenis === 'pindah_unit' && !u.unit_baru) return toast('Pilih unit tujuan');
    if (!u.alasan.trim()) return toast('Alasan perubahan wajib diisi');
    if (!confirm(ringkas + '\n\nPerubahan ini tercatat di jurnal kontrak dan memerlukan otorisasi Project CEO.')) return;
    setBusy(true);
    try {
      const r = await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: u.jenis, trx_id: buka, ...u }) });
      toast('Perubahan kontrak tersimpan' + (r.addendum ? ' · Addendum ' + r.addendum : ''));
      setUbahDialog(null); segarkanDetail(buka); muat();
    } catch (e) { toast(e.message); if (e.otorisasi) setUbahDialog(null); } finally { setBusy(false); }
  }

  async function simpanKPR() {
    setBusy(true);
    try { await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: 'kpr', trx_id: buka, ...kprDialog, plafon: Number(kprDialog.plafon) || 0 }) });
      toast('Data KPR tersimpan'); setKprDialog(null); segarkanDetail(buka);
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function catatFollowUp() {
    if (!followDialog.hasil.trim()) return toast('Catatan hasil follow up wajib diisi');
    setBusy(true);
    try { await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: 'followup_catat', trx_id: buka, ...followDialog }) });
      toast('Follow up tercatat'); setFollowDialog(null); segarkanDetail(buka); muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function simpanAJB() {
    setBusy(true);
    try { await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: 'ajb_catat', trx_id: buka, ...ajbDialog, bphtb: Number(ajbDialog.bphtb) || 0, pph: Number(ajbDialog.pph) || 0 }) });
      toast('Data AJB tersimpan'); setAjbDialog(null); segarkanDetail(buka);
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  async function terbitkanKW(pembayaranId) {
    setBusy(true);
    try { const r = await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: 'kw', pembayaran_id: pembayaranId }) });
      toast('Kuitansi ' + r.no_kw + ' terbit'); segarkanDetail(buka); muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function batalkan(pembayaranId) {
    const alasan = prompt('Alasan pembatalan pembayaran ini:');
    if (!alasan) return;
    setBusy(true);
    try { await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: 'batal', pembayaran_id: pembayaranId, alasan }) });
      toast('Pembayaran dibatalkan, alokasi dikembalikan'); segarkanDetail(buka); muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  async function terbitkanDenda(t) {
    if (!confirm('Terbitkan denda Rp ' + t.denda_potensial.toLocaleString('id-ID') + ' untuk keterlambatan baris "' + t.nama + '" (' + (t.terlambat_hari - (t.hari_tercakup || 0)) + ' hari' + (t.hari_tercakup ? ', melanjutkan denda yang sudah terbit sampai hari ke-' + t.hari_tercakup : '') + ')?')) return;
    setBusy(true);
    try { const r = await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: 'denda', tagihan_id: t.id, tgl: new Date().toISOString().slice(0, 10) }) });
      toast('Denda Rp ' + r.nilai.toLocaleString('id-ID') + ' diterbitkan'); segarkanDetail(buka); muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function pemutihan(t) {
    const alasan = prompt('Alasan pemutihan denda "' + t.nama + '" (Rp ' + Number(t.nilai - t.dibayar).toLocaleString('id-ID') + '):');
    if (!alasan) return;
    setBusy(true);
    try { await api('/api/piutang', { method: 'POST', body: JSON.stringify({ aksi: 'pemutihan', tagihan_id: t.id, alasan }) });
      toast('Denda dipuithkan'); segarkanDetail(buka); muat();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  if (!rows) return <div className="loading">Memuat…</div>;
  const jmlBatal = rows.filter(r => r.batal_at).length;
  const tampil = rows.filter(r => tampilBatal || !r.batal_at).filter(r => !cari || (r.nama || '').toLowerCase().includes(cari.toLowerCase()) ||
    (r.unit || '').toLowerCase().includes(cari.toLowerCase()) || (r.no_sp || '').toLowerCase().includes(cari.toLowerCase()));

  return (
    <>
      <div className="page-head"><div><h1>Piutang</h1>
        <div className="sub">Jadwal tagihan & pembayaran per kontrak — jadwal terbentuk otomatis saat Admin Sales memverifikasi Booking dengan Skema Cara Bayar.</div></div></div>

      {belumJadwal && belumJadwal.length > 0 && (
        <div className="note" style={{ marginBottom: 12, cursor: 'pointer' }} onClick={() => setTampilBelumJadwal(v => !v)}>
          ⏳ {belumJadwal.length} kontrak terverifikasi belum berjadwal (diverifikasi sebelum fitur ini aktif) — klik untuk {tampilBelumJadwal ? 'sembunyikan' : 'lihat'}.
          {tampilBelumJadwal && (
            <div style={{ marginTop: 8 }}>{belumJadwal.map(k => (
              <div key={k.id} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '4px 0', borderTop: '1px solid #E8D9AE' }}>
                <span style={{ flex: 1, fontSize: 13 }}>{k.nama} · {k.project} · {k.unit} · {k.no_sp}</span>
                <button className="sort-btn" onClick={e => { e.stopPropagation(); bukaFormJadwal(k); }}>Bentuk Jadwal</button>
              </div>))}</div>)}
        </div>)}

      <div className="fu-toolbar"><input value={cari} onChange={e => setCari(e.target.value)} placeholder="cari konsumen, unit, atau No. SP" style={{ maxWidth: 260 }} />
        {jmlBatal > 0 && <label style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13 }}>
          <input type="checkbox" checked={tampilBatal} onChange={e => setTampilBatal(e.target.checked)} /> Tampilkan kontrak batal ({jmlBatal})</label>}</div>

      <div className="tbl-wrap"><table className="tbl-compact">
        <thead><tr><th></th><th>Konsumen</th><th>Project / Unit</th><th>No. SP</th><th>Skema</th>
          <th className="num">Nilai Kontrak</th><th className="num">Terbayar</th><th className="num">Sisa</th><th>Jatuh Tempo Berikut</th><th></th></tr></thead>
        <tbody>{tampil.map(k => {
          const sisa = Number(k.total_tagihan) - Number(k.total_dibayar);
          const lewat = k.jt_berikut && new Date(k.jt_berikut) < new Date();
          return (
            <Fragment key={k.id}>
              <tr onClick={() => bukaBaris(k.id)} style={{ cursor: 'pointer', ...(k.batal_at ? { opacity: .6 } : {}) }}>
                <td>{buka === k.id ? '▾' : '▸'}</td>
                <td><b>{k.nama}</b></td>
                <td>{k.project} · {k.unit}</td>
                <td>{k.no_sp}</td>
                <td>{k.skema_kode}</td>
                <td className="num">{rp(k.harga_unit)}</td>
                <td className="num">{rp(k.total_dibayar)}</td>
                <td className="num"><b>{rp(sisa)}</b></td>
                <td style={lewat ? { color: 'var(--red)', fontWeight: 700 } : {}}>{k.jt_berikut ? tgl(k.jt_berikut) + (lewat ? ' · lewat' : '') : (sisa <= 0 ? 'Lunas' : '—')}</td>
                <td>{k.batal_at && <span className="badge b-lost">BATAL{k.status_refund && k.status_refund !== 'Tidak ada' ? ' · refund ' + k.status_refund.toLowerCase() : ''}</span>}
                  {k.tts_menunggu > 0 ? <span className="badge b-warm">{k.tts_menunggu} TTS menunggu KW</span> : null}
                  {k.sp_disarankan ? <span className="badge b-overdue" style={{ marginLeft: 4 }}>SP{k.sp_disarankan} layak terbit</span>
                    : k.sp_terakhir > 0 ? <span className="badge b-lost" style={{ marginLeft: 4 }}>SP{k.sp_terakhir} terbit</span> : null}</td>
              </tr>
              {buka === k.id && (
                <tr><td colSpan={10} style={{ background: '#FBFAF4', padding: 14 }}>
                  {!detail ? <span className="hint">Memuat…</span> : (() => { const batal = Boolean(detail.kontrak.batal_at); return (<>
                    {batal && <div className="note" style={{ marginBottom: 10 }}>🚫 Kontrak ini <b>dibatalkan</b> pada {detail.pembatalan ? tgl(detail.pembatalan.tgl) : ''} — tidak lagi ditagih, tidak dapat diubah.</div>}
                    {(detail.kontrak.dpp || detail.kontrak.ppn) && (
                      <div className="hint" style={{ marginBottom: 8 }}>
                        DPP {rp(detail.kontrak.dpp)} · PPN {rp(detail.kontrak.ppn)}
                        {Number(detail.kontrak.ppn_dtp) > 0 ? ' (DTP ' + rp(detail.kontrak.ppn_dtp) + ' · developer ' + rp(detail.kontrak.ppn_dev) + ')' : ''}
                      </div>)}
                    <div className="tbl-wrap"><table className="tbl-compact" style={{ minWidth: 0 }}>
                      <thead><tr><th>#</th><th>Jenis</th><th>Keterangan</th><th>Jatuh Tempo</th><th className="num">Nilai</th><th className="num">Terbayar</th><th>Status</th><th></th></tr></thead>
                      <tbody>{detail.tagihan.map(t => (
                        <tr key={t.id} style={t.status !== 'Lunas' && t.terlambat_hari > 0 ? { background: '#FBEDEC' } : {}}>
                          <td>{t.urutan}</td><td>{JENIS_LABEL[t.jenis] || t.jenis}</td>
                          <td>{t.nama}
                            {t.jenis === 'DENDA' && t.pemutihan_at && <div className="hint" style={{ margin: 0, color: 'var(--red)' }}>Dipuithkan {t.pemutihan_oleh} — {t.pemutihan_alasan}</div>}</td>
                          <td>{tgl(t.jatuh_tempo)}{t.status !== 'Lunas' && t.terlambat_hari > 0 ? <span style={{ color: 'var(--red)' }}> · terlambat {t.terlambat_hari} hari</span> : ''}</td>
                          <td className="num">{rp(t.nilai)}
                            {t.denda_potensial > 0 && <div className="hint" style={{ margin: 0, color: '#8a5f14' }}>≈ denda {rp(t.denda_potensial)}</div>}</td>
                          <td className="num">{rp(t.dibayar)}</td>
                          <td><span style={{ color: WARNA_STATUS[t.status], fontWeight: 700 }}>{LABEL_STATUS[t.status] || t.status}</span></td>
                          <td style={{ whiteSpace: 'nowrap' }}>
                            {!batal && t.status !== 'Lunas' && <button className="sort-btn" style={{ padding: '2px 8px' }}
                              onClick={() => { setBayarDialog({ tagihan_id: t.id }); setForm(f => ({ ...f, nilai: String(t.nilai - t.dibayar) })); }}>Catat Bayar</button>}
                            {!batal && t.denda_potensial > 0 && <button className="sort-btn" style={{ padding: '2px 8px', marginLeft: 4, color: '#8a5f14' }} disabled={busy} onClick={() => terbitkanDenda(t)}>Terbitkan Denda</button>}
                            {!batal && t.jenis === 'DENDA' && t.status !== 'Lunas' && <button className="sort-btn" style={{ padding: '2px 8px', marginLeft: 4 }} disabled={busy} onClick={() => pemutihan(t)}>Pemutihan</button>}
                          </td>
                        </tr>))}</tbody>
                    </table></div>
                    {!batal && <button className="sort-btn" style={{ marginTop: 8 }}
                      onClick={() => { setBayarDialog({ tagihan_id: null }); setForm(f => ({ ...f, nilai: '' })); }}>+ Catat pembayaran (alokasi otomatis)</button>}

                    {detail.kontrak.skema_jenis === 'kpr' && !batal && (() => {
                      const ak = detail.tagihan.find(t => t.jenis === 'AKAD');
                      const sisaAkad = ak ? Number(ak.nilai) - Number(ak.dibayar) : 0;
                      const plafon = detail.kpr ? Number(detail.kpr.plafon) : 0;
                      const pencairan = detail.pembayaran.filter(p => p.cara === 'Pencairan KPR' && p.status !== 'Batal');
                      return (
                        <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}>
                          <div style={{ fontWeight: 800, marginBottom: 6 }}>🏦 KPR & Pencairan Bank</div>
                          {detail.kpr ? (
                            <div className="hint" style={{ marginBottom: 8 }}>
                              <b>{detail.kpr.bank}</b>{detail.kpr.no_akad ? ' · akad ' + detail.kpr.no_akad : ''}{detail.kpr.tgl_akad ? ' · ' + tgl(detail.kpr.tgl_akad) : ''} · plafon {rp(plafon)}
                              {ak && plafon > 0 && plafon < Number(ak.nilai) && <div style={{ color: 'var(--red)' }}>Plafon kurang {rp(Number(ak.nilai) - plafon)} dari baris Akad — selisih menjadi tambahan DP pemesan.</div>}
                            </div>) : <div className="hint" style={{ marginBottom: 8 }}>Data KPR (bank, akad, plafon) belum diisi.</div>}
                          {pencairan.length > 0 && <div style={{ fontSize: 12.5, marginBottom: 8 }}>{pencairan.map(p => (
                            <div key={p.id}>Pencairan {tgl(p.tgl)} · {rp(p.nilai)} · {p.bank}{p.keterangan ? ' · ref ' + p.keterangan : ''} · {p.status === 'KW' ? 'kuitansi terbit' : 'TTS menunggu KW'}</div>))}</div>}
                          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                            <button className="sort-btn" onClick={() => setKprDialog({ bank: '', no_akad: '', plafon: '', catatan: '', ...(detail.kpr || {}), tgl_akad: (detail.kpr && detail.kpr.tgl_akad) || '' })}>{detail.kpr ? 'Ubah data KPR' : 'Isi data KPR'}</button>
                            {ak && sisaAkad > 0 && <button className="sort-btn" onClick={() => { setBayarDialog({ tagihan_id: ak.id, pencairan: true });
                              setForm({ nilai: String(sisaAkad), tgl: new Date().toISOString().slice(0, 10), cara: 'Pencairan KPR', bank: (detail.kpr && detail.kpr.bank) || '', keterangan: '' }); }}>+ Catat pencairan bank</button>}
                          </div>
                        </div>);
                    })()}

                    <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>📞 Follow Up Penagihan</div>
                      <div className="hint" style={{ marginBottom: 8 }}>Telepon/WA ke konsumen sebelum jatuh tempo lewat {detail.sp_cfg.sp1_hari} hari — wajib tercatat sebelum SP1 bisa diterbitkan.</div>
                      {detail.followup && detail.followup.length > 0 && <div style={{ fontSize: 12.5, lineHeight: 1.85, marginBottom: 8 }}>{detail.followup.map(f => (
                        <div key={f.id}>{tgl(f.tgl)} · <b>{f.metode}</b> · {f.hasil}{f.janji_bayar ? ' · janji bayar ' + tgl(f.janji_bayar) : ''} · {f.oleh}</div>))}</div>}
                      <button className="sort-btn" onClick={() => setFollowDialog({ tgl: hariIni(), metode: 'Telepon', hasil: '', janji_bayar: '' })}>+ Catat Follow Up</button>
                    </div>

                    <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>✉ Surat Peringatan</div>
                      <div className="hint" style={{ marginBottom: 8 }}>
                        {detail.max_telat > 0 ? 'Tunggakan tertua terlambat ' + detail.max_telat + ' hari.' : 'Tidak ada tunggakan melewati jatuh tempo.'}
                        {' '}Jenjang: SP1 {detail.sp_cfg.sp1_hari} hari sejak jatuh tempo (+ follow up tercatat) · SP2 {detail.sp_cfg.sp2_hari} hari sejak SP1 · SP3 {detail.sp_cfg.sp3_hari} hari sejak SP2 (atur di Settings).</div>
                      {detail.sp.length > 0 && <div style={{ fontSize: 12.5, lineHeight: 1.9, marginBottom: 8 }}>{detail.sp.map(x => (
                        <div key={x.id} style={x.status === 'Batal' ? { opacity: .5, textDecoration: 'line-through' } : {}}>
                          <b>SP{x.tingkat}</b> · {x.no_surat} · {tgl(x.tgl_terbit)} · tunggakan {rp(x.tunggakan)} · batas bayar {tgl(x.batas_bayar)}
                          {x.status === 'Batal' ? ' · BATAL: ' + x.batal_alasan : <>
                            {' '}<button className="sort-btn" style={{ padding: '1px 8px' }} onClick={() => window.open('/cetak-sp?id=' + x.id, '_blank')}>Cetak</button>
                            {' '}<button className="sort-btn" style={{ padding: '1px 8px', color: 'var(--red)' }} disabled={busy} onClick={() => batalkanSP(x)}>Batalkan</button></>}
                        </div>))}</div>}
                      {detail.sp_disarankan
                        ? <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={() => terbitkanSP(detail.sp_disarankan)}>Terbitkan SP{detail.sp_disarankan}</button>
                        : <span className="hint">{detail.sp.some(x => x.tingkat === 3 && x.status !== 'Batal') ? 'SP3 sudah terbit — pembatalan kontrak memerlukan otorisasi Project CEO (menu Otorisasi).'
                          : (detail.max_telat > 0 && (detail.sp || []).length === 0 && !(detail.followup || []).some(f => f.tgl >= (detail.jatuh_tempo_tertua || ''))) ? 'Catat follow up ke konsumen dulu (panel di atas) sebelum SP1 bisa diterbitkan.'
                          : 'Belum ada surat peringatan yang layak diterbitkan.'}</span>}
                    </div>

                    <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>📜 AJB</div>
                      <div className="hint" style={{ marginBottom: 8 }}>BPHTB, PPh, dan data Notaris — berlaku untuk semua skema, dicatat setelah akad selesai (KPR) atau lunas 100% (tunai).</div>
                      {detail.ajb ? (<div style={{ fontSize: 13, lineHeight: 1.8, marginBottom: 8 }}>
                        {detail.ajb.notaris && <>Notaris: <b>{detail.ajb.notaris}</b><br /></>}
                        BPHTB {rp(detail.ajb.bphtb)} · PPh {rp(detail.ajb.pph)}
                        {detail.ajb.tgl_ajb && <> · AJB {tgl(detail.ajb.tgl_ajb)}</>}{detail.ajb.no_ajb && <> · No. {detail.ajb.no_ajb}</>}
                        {detail.ajb.catatan && <div className="hint" style={{ margin: 0 }}>{detail.ajb.catatan}</div>}
                      </div>) : <div className="hint" style={{ marginBottom: 8 }}>Belum ada data AJB.</div>}
                      <button className="sort-btn" onClick={() => setAjbDialog({ notaris: '', bphtb: '', pph: '', tgl_ajb: '', no_ajb: '', catatan: '', ...(detail.ajb || {}) })}>{detail.ajb ? 'Ubah data AJB' : 'Isi data AJB'}</button>
                    </div>

                    <div style={{ marginTop: 14, padding: 12, border: '1px solid var(--line)', borderRadius: 8, background: '#fff' }}>
                      <div style={{ fontWeight: 800, marginBottom: 6 }}>🔁 Perubahan Kontrak</div>
                      {detail.boleh_ubah_kontrak ? (<>
                        <div className="hint" style={{ marginBottom: 8 }}>Mengubah pemilik, unit, atau nilai kontrak yang sudah terbit. Setiap perubahan tercatat di jurnal dan ditahan sampai diotorisasi Project CEO.</div>
                        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                          <button className="sort-btn" onClick={() => bukaUbah('pengalihan')}>Alihkan hak…</button>
                          <button className="sort-btn" onClick={() => bukaUbah('pindah_unit')}>Pindah unit…</button>
                          <button className="sort-btn" onClick={() => bukaUbah('adjustment')}>Ubah nilai kontrak…</button>
                        </div></>) : <div className="hint">{batal ? 'Kontrak sudah dibatalkan — tidak dapat diubah.' : 'Perubahan kontrak hanya dapat dilakukan Administrator dan Admin Sales.'}</div>}
                      {detail.jurnal && detail.jurnal.length > 0 && (
                        <div style={{ fontSize: 12.5, lineHeight: 1.85, marginTop: 10, borderTop: '1px dashed var(--line)', paddingTop: 8 }}>
                          <div style={{ fontWeight: 700 }}>Jurnal perubahan</div>
                          {detail.jurnal.map(j => (
                            <div key={j.id}>{tgl(j.tgl)} · <b>{{ pengalihan_hak: 'Pengalihan hak', pindah_unit: 'Pindah unit', adjustment: 'Ubah nilai' }[j.jenis] || j.jenis}</b>
                              {j.jenis === 'pengalihan_hak' && <> · {j.sebelum.nama} → {j.sesudah.nama}</>}
                              {j.jenis === 'pindah_unit' && <> · {j.sebelum.unit} → {j.sesudah.unit}{Number(j.sebelum.harga) !== Number(j.sesudah.harga) ? ' · nilai ' + rp(j.sebelum.harga) + ' → ' + rp(j.sesudah.harga) : ''}</>}
                              {j.jenis === 'adjustment' && <> · {rp(j.sebelum.harga)} → {rp(j.sesudah.harga)}</>}
                              {Number(j.biaya_adm) > 0 && <> · biaya adm {rp(j.biaya_adm)}</>}
                              {j.no_addendum && <> · addendum {j.no_addendum}</>} · “{j.keterangan}” · {j.oleh}</div>))}
                        </div>)}
                    </div>

                    {(detail.boleh_batal || detail.pembatalan) && (
                      <div style={{ marginTop: 14, padding: 12, border: '1px solid ' + (batal ? '#D9B5B2' : 'var(--line)'), borderRadius: 8, background: batal ? '#FBF3F2' : '#fff' }}>
                        <div style={{ fontWeight: 800, marginBottom: 6 }}>🚫 Pembatalan Kontrak</div>
                        {detail.pembatalan ? (() => {
                          const pb = detail.pembatalan;
                          return (<>
                            <div style={{ fontSize: 13, lineHeight: 1.8 }}>
                              <b>{KATEGORI_BATAL[pb.kategori]}</b> · {tgl(pb.tgl)} · “{pb.alasan}” · {pb.dibuat_oleh}<br />
                              Dibayar konsumen: booking fee {rp(pb.bf_dibayar)} · DP/angsuran {rp(pb.dp_angsuran_dibayar)}{Number(pb.adm_dibayar) > 0 ? ' · adm ' + rp(pb.adm_dibayar) : ''}{Number(pb.denda_dibayar) > 0 ? ' · denda ' + rp(pb.denda_dibayar) : ''}<br />
                              {pb.kategori === 'kpr_ditolak' && <>Dipotong: pajak {rp(pb.pajak_dipotong)} · denda terutang {rp(pb.denda_terutang)} · biaya lain {rp(pb.biaya_lain)}<br /></>}
                              Hangus / non-refund: <b>{rp(pb.non_refund)}</b> · Pengembalian ke konsumen: <b style={{ color: '#12604B' }}>{rp(pb.nilai_kembali)}</b>
                              {Number(pb.pencairan_bank) > 0 && <div style={{ color: 'var(--red)' }}>Pencairan bank {rp(pb.pencairan_bank)} sudah masuk — dikembalikan ke bank secara terpisah.</div>}
                            </div>
                            <div style={{ marginTop: 8, fontSize: 13 }}>
                              Status pengembalian: <b>{pb.status_refund}</b>
                              {pb.tgl_pengajuan ? ' · diajukan ' + tgl(pb.tgl_pengajuan) : ''}
                              {pb.status_refund === 'Dibayar' ? ' · dibayar ' + tgl(pb.tgl_bayar) + ' ke ' + pb.bank + (pb.no_ref ? ' (ref ' + pb.no_ref + ')' : '') : ''}
                            </div>
                            {detail.boleh_refund && pb.status_refund === 'Menunggu' && <button className="btn btn-primary" style={{ width: 'auto', marginTop: 8 }} disabled={busy} onClick={ajukanRefund}>Ajukan pengembalian dana</button>}
                            {detail.boleh_refund && pb.status_refund === 'Diajukan' && <button className="btn btn-primary" style={{ width: 'auto', marginTop: 8 }}
                              onClick={() => setRefundDialog({ tgl: hariIni(), bank: '', no_ref: '', catatan: '' })}>Catat pembayaran pengembalian</button>}
                          </>);
                        })() : (<>
                          <div className="hint" style={{ marginBottom: 8 }}>Menghentikan penagihan, melepas unit, dan menghitung pengembalian dana sesuai ketentuan price list. Pembatalan ditahan sampai diotorisasi Project CEO dan tidak dapat diurungkan.</div>
                          <button className="sort-btn" style={{ color: 'var(--red)' }} onClick={() => setBatalDialog({ kategori: 'sepihak', tgl: hariIni(), alasan: '', pajak_dipotong: '', biaya_lain: '', nilai_manual: '' })}>Batalkan kontrak…</button>
                        </>)}
                      </div>)}

                    {detail.pembayaran.length > 0 && (<>
                      <div className="hint" style={{ marginTop: 14, fontWeight: 700 }}>Riwayat Pembayaran</div>
                      <div className="tbl-wrap"><table className="tbl-compact" style={{ minWidth: 0 }}>
                        <thead><tr><th>No. TTS / KW</th><th>Tanggal</th><th className="num">Nilai</th><th>Cara</th><th>Dialokasikan ke</th><th>Status</th><th></th></tr></thead>
                        <tbody>{detail.pembayaran.map(p => (
                          <tr key={p.id} style={p.status === 'Batal' ? { opacity: .5 } : {}}>
                            <td>{p.no_kw || p.no_tts}</td><td>{tgl(p.tgl)}</td><td className="num">{rp(p.nilai)}</td>
                            <td>{p.cara}{p.bank ? ' · ' + p.bank : ''}</td><td style={{ fontSize: 12 }}>{p.alokasi || '—'}</td>
                            <td>{p.status === 'Batal' ? <span style={{ color: 'var(--red)' }}>Batal — {p.batal_alasan}</span>
                              : p.status === 'KW' ? <span style={{ color: '#12604B', fontWeight: 700 }}>Kuitansi terbit</span>
                              : <span style={{ color: '#8a5f14', fontWeight: 700 }}>TTS — menunggu KW</span>}</td>
                            <td style={{ whiteSpace: 'nowrap' }}>
                              {p.status === 'TTS' && <button className="sort-btn" style={{ padding: '2px 8px' }} disabled={busy} onClick={() => terbitkanKW(p.id)}>Terbitkan KW</button>}
                              {p.status !== 'Batal' && <button className="sort-btn" style={{ padding: '2px 8px', marginLeft: 4, color: 'var(--red)' }} disabled={busy} onClick={() => batalkan(p.id)}>Batalkan</button>}
                            </td>
                          </tr>))}</tbody>
                      </table></div>
                    </>)}
                  </>); })()}
                </td></tr>)}
            </Fragment>);
        })}
        {!tampil.length && <tr><td colSpan={10} className="hint" style={{ padding: 16 }}>Belum ada kontrak berjadwal.</td></tr>}
      </tbody></table></div>

      {bayarDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={() => setBayarDialog(null)}>
          <div className="card" style={{ width: 380, margin: 0 }} onClick={e => e.stopPropagation()}>
            <h2>{bayarDialog.pencairan ? 'Catat Pencairan Bank (KPR)' : 'Catat Pembayaran (TTS)'}</h2>
            <div className="hint" style={{ marginBottom: 8 }}>{bayarDialog.pencairan ? 'Dicatat pada baris Akad kontrak ini.' : bayarDialog.tagihan_id ? 'Untuk baris tagihan ini.' : 'Tanpa memilih baris — dialokasikan otomatis ke tagihan tertua yang belum lunas.'}
              {' '}Kuitansi resmi terbit setelah Finance mengonfirmasi dana masuk.</div>
            <div className="field"><label>Nilai (Rp)</label><input type="number" min="1" value={form.nilai} onChange={e => setForm({ ...form, nilai: e.target.value })} /></div>
            <div className="field"><label>Tanggal</label><input type="date" value={form.tgl} onChange={e => setForm({ ...form, tgl: e.target.value })} /></div>
            {!bayarDialog.pencairan && <div className="field"><label>Cara Bayar</label>
              <select value={form.cara} onChange={e => setForm({ ...form, cara: e.target.value })}>
                <option>Transfer</option><option>Tunai</option><option>Bilyet Giro</option></select></div>}
            {form.cara !== 'Tunai' && <div className="field"><label>{bayarDialog.pencairan ? 'Bank pencair *' : 'Bank'}</label><input value={form.bank} onChange={e => setForm({ ...form, bank: e.target.value })} /></div>}
            <div className="field"><label>{bayarDialog.pencairan ? 'No. referensi pencairan' : 'Keterangan'}</label><input value={form.keterangan} onChange={e => setForm({ ...form, keterangan: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={simpanTTS}>Simpan TTS</button>
              <button className="sort-btn" onClick={() => setBayarDialog(null)}>Batal</button>
            </div>
          </div>
        </div>)}

      {batalDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={() => setBatalDialog(null)}>
          <div className="card" style={{ width: 460, maxHeight: '92vh', overflowY: 'auto', margin: 0 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ color: 'var(--red)' }}>Batalkan Kontrak</h2>
            <div className="hint" style={{ marginBottom: 8 }}>{detail && detail.kontrak.nama} · {detail && detail.kontrak.project} · {detail && detail.kontrak.unit} · {detail && detail.kontrak.no_sp}</div>
            <div className="field"><label>Dasar pembatalan</label>
              <select value={batalDialog.kategori} onChange={e => setBatalDialog({ ...batalDialog, kategori: e.target.value })}>
                {Object.entries(KATEGORI_BATAL).map(([k, v]) => <option key={k} value={k}>{v.split(' — ')[0]}</option>)}</select>
              <span className="hint">{KATEGORI_BATAL[batalDialog.kategori].split(' — ')[1]}</span></div>
            {(batalDialog.kategori === 'kpr_ditolak' || batalDialog.kategori === 'menunggak') && (<>
              <div className="field"><label>Pajak yang sudah dibebankan (Rp)</label><input type="number" min="0" value={batalDialog.pajak_dipotong} onChange={e => setBatalDialog({ ...batalDialog, pajak_dipotong: e.target.value })} /></div>
              <div className="field"><label>Biaya lain sesuai P3U (Rp)</label><input type="number" min="0" value={batalDialog.biaya_lain} onChange={e => setBatalDialog({ ...batalDialog, biaya_lain: e.target.value })} />
                <span className="hint">Denda yang masih terutang otomatis ikut dipotong.</span></div></>)}
            {batalDialog.kategori === 'khusus' && (
              <div className="field"><label>Nilai pengembalian (Rp)</label><input type="number" min="0" value={batalDialog.nilai_manual} onChange={e => setBatalDialog({ ...batalDialog, nilai_manual: e.target.value })} />
                <span className="hint">Dibatasi sebesar yang sudah dibayar konsumen di luar denda.</span></div>)}
            {batalPv && (
              <div style={{ background: '#F7F5EC', border: '1px solid var(--line)', borderRadius: 8, padding: '10px 12px', fontSize: 13, lineHeight: 1.85, margin: '6px 0 10px' }}>
                <div style={{ fontWeight: 800 }}>Perhitungan</div>
                Booking fee dibayar {rp(batalPv.rincian.bf)} · DP/angsuran dibayar {rp(batalPv.rincian.dpAng)}
                {batalPv.rincian.adm > 0 ? ' · adm ' + rp(batalPv.rincian.adm) : ''}{batalPv.rincian.denda > 0 ? ' · denda ' + rp(batalPv.rincian.denda) : ''}<br />
                {(batalDialog.kategori === 'kpr_ditolak' || batalDialog.kategori === 'menunggak') && <>Potongan: pajak {rp(batalPv.hasil.potongan.pajak)} + biaya lain {rp(batalPv.hasil.potongan.biayaLain)} + denda terutang {rp(batalPv.hasil.potongan.dendaTerutang)}<br /></>}
                Hangus: <b>{rp(batalPv.hasil.nonRefund)}</b><br />
                Dikembalikan ke konsumen: <b style={{ color: '#12604B', fontSize: 15 }}>{rp(batalPv.hasil.nilaiKembali)}</b>
                {batalPv.rincian.pencairan > 0 && <div style={{ color: 'var(--red)' }}>Pencairan bank {rp(batalPv.rincian.pencairan)} bukan hak konsumen — dikembalikan ke bank terpisah.</div>}
              </div>)}
            <div className="field"><label>Tanggal pembatalan</label><input type="date" value={batalDialog.tgl} onChange={e => setBatalDialog({ ...batalDialog, tgl: e.target.value })} /></div>
            <div className="field"><label>Alasan *</label><input value={batalDialog.alasan} onChange={e => setBatalDialog({ ...batalDialog, alasan: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" style={{ width: 'auto', background: 'var(--red)' }} disabled={busy} onClick={simpanBatal}>Ajukan Pembatalan</button>
              <button className="sort-btn" onClick={() => setBatalDialog(null)}>Batal</button>
            </div>
          </div>
        </div>)}

      {refundDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={() => setRefundDialog(null)}>
          <div className="card" style={{ width: 380, margin: 0 }} onClick={e => e.stopPropagation()}>
            <h2>Pembayaran Pengembalian</h2>
            <div className="hint" style={{ marginBottom: 8 }}>{detail && detail.pembatalan && rp(detail.pembatalan.nilai_kembali)} kepada {detail && detail.kontrak.nama}</div>
            <div className="field"><label>Tanggal dibayar</label><input type="date" value={refundDialog.tgl} onChange={e => setRefundDialog({ ...refundDialog, tgl: e.target.value })} /></div>
            <div className="field"><label>Bank / rekening tujuan *</label><input value={refundDialog.bank} onChange={e => setRefundDialog({ ...refundDialog, bank: e.target.value })} /></div>
            <div className="field"><label>No. referensi transfer</label><input value={refundDialog.no_ref} onChange={e => setRefundDialog({ ...refundDialog, no_ref: e.target.value })} /></div>
            <div className="field"><label>Catatan</label><input value={refundDialog.catatan} onChange={e => setRefundDialog({ ...refundDialog, catatan: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={bayarRefund}>Simpan</button>
              <button className="sort-btn" onClick={() => setRefundDialog(null)}>Batal</button>
            </div>
          </div>
        </div>)}

      {ubahDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={() => setUbahDialog(null)}>
          <div className="card" style={{ width: 420, maxHeight: '90vh', overflowY: 'auto', margin: 0 }} onClick={e => e.stopPropagation()}>
            <h2>{{ pengalihan: 'Pengalihan Hak', pindah_unit: 'Pindah Unit', adjustment: 'Ubah Nilai Kontrak' }[ubahDialog.jenis]}</h2>
            <div className="hint" style={{ marginBottom: 8 }}>{detail && detail.kontrak.nama} · {detail && detail.kontrak.project} · {detail && detail.kontrak.unit} · nilai {detail && rp(detail.kontrak.harga_unit)}</div>

            {ubahDialog.jenis === 'pengalihan' && (<>
              <div className="field"><label>Pemilik baru (cari nama / ID lead / WA)</label>
                <input value={ubahDialog.cari} onChange={e => cariLead(e.target.value)} placeholder="ketik minimal 2 huruf" /></div>
              {ubahDialog.lead_baru && <div className="hint" style={{ color: '#12604B', marginBottom: 6 }}>✔ Terpilih: <b>{ubahDialog.nama_baru}</b> ({ubahDialog.lead_baru})</div>}
              {hasilCari.map(l => (
                <div key={l.lead_code} onClick={() => setUbahDialog(d => ({ ...d, lead_baru: l.lead_code, nama_baru: l.nama_ktp || l.nama }))}
                  style={{ padding: '6px 8px', border: '1px solid var(--line)', borderRadius: 6, marginBottom: 4, cursor: 'pointer', background: ubahDialog.lead_baru === l.lead_code ? '#EDF3EF' : '#fff', fontSize: 13 }}>
                  <b>{l.nama_ktp || l.nama}</b> · {l.lead_code}{l.project ? ' · ' + l.project : ''}{l.sales ? ' · ' + l.sales : ''}
                  {!l.ada_ktp && <span className="hint" style={{ margin: 0, color: 'var(--red)' }}> · NIK belum terisi</span>}</div>))}
              <div className="hint" style={{ marginBottom: 8 }}>Pastikan data KTP/NPWP pemilik baru dilengkapi sebelum dokumen addendum dicetak. Berkas pemilik lama tetap tersimpan sebagai arsip.</div>
            </>)}

            {ubahDialog.jenis === 'pindah_unit' && (<>
              <div className="field"><label>Unit tujuan (hanya unit yang masih tersedia)</label>
                <select value={ubahDialog.unit_baru} onChange={e => { const o = unitOpsi.find(x => x.unit === e.target.value);
                  setUbahDialog(d => ({ ...d, unit_baru: e.target.value, harga_baru: o && o.harga_standar ? String(o.harga_standar) : d.harga_baru })); }}>
                  <option value="">— pilih unit —</option>
                  {unitOpsi.map(o => <option key={o.unit} value={o.unit}>{o.unit}{o.tipe ? ' · tipe ' + o.tipe : ''}{o.harga_standar ? ' · ' + rp(o.harga_standar) : ''}</option>)}
                </select></div>
              <div className="field"><label>Nilai kontrak di unit baru (Rp)</label>
                <input type="number" min="0" value={ubahDialog.harga_baru} onChange={e => setUbahDialog({ ...ubahDialog, harga_baru: e.target.value })} placeholder="kosongkan = sama dengan nilai sekarang" />
                <span className="hint">Bila nilainya berbeda, jadwal tagihan dibentuk ulang dan pembayaran yang sudah masuk dialokasikan ulang.</span></div>
            </>)}

            {ubahDialog.jenis === 'adjustment' && (
              <div className="field"><label>Nilai kontrak baru (Rp)</label>
                <input type="number" min="1" value={ubahDialog.harga_baru} onChange={e => setUbahDialog({ ...ubahDialog, harga_baru: e.target.value })} />
                <span className="hint">Jadwal tagihan dibentuk ulang dan pembayaran yang sudah masuk dialokasikan ulang.</span></div>)}

            <div className="field"><label>Tanggal perubahan</label><input type="date" value={ubahDialog.tgl} onChange={e => setUbahDialog({ ...ubahDialog, tgl: e.target.value })} /></div>
            <div className="field"><label>Alasan *</label><input value={ubahDialog.alasan} onChange={e => setUbahDialog({ ...ubahDialog, alasan: e.target.value })} /></div>
            <div className="field"><label>Biaya administrasi (Rp, opsional)</label><input type="number" min="0" value={ubahDialog.biaya_adm} onChange={e => setUbahDialog({ ...ubahDialog, biaya_adm: e.target.value })} />
              <span className="hint">Dicatat sebagai baris tagihan tersendiri.</span></div>
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, margin: '6px 0' }}>
              <input type="checkbox" checked={ubahDialog.addendum} onChange={e => setUbahDialog({ ...ubahDialog, addendum: e.target.checked })} /> Terbitkan nomor Addendum PPJB</label>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={simpanUbah}>Ajukan Perubahan</button>
              <button className="sort-btn" onClick={() => setUbahDialog(null)}>Batal</button>
            </div>
          </div>
        </div>)}

      {followDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={() => setFollowDialog(null)}>
          <div className="card" style={{ width: 380, margin: 0 }} onClick={e => e.stopPropagation()}>
            <h2>Catat Follow Up</h2>
            <div className="field"><label>Tanggal</label><input type="date" value={followDialog.tgl} onChange={e => setFollowDialog({ ...followDialog, tgl: e.target.value })} /></div>
            <div className="field"><label>Metode</label>
              <select value={followDialog.metode} onChange={e => setFollowDialog({ ...followDialog, metode: e.target.value })}>
                <option>Telepon</option><option>WhatsApp</option><option>Lainnya</option></select></div>
            <div className="field"><label>Hasil *</label><input value={followDialog.hasil} onChange={e => setFollowDialog({ ...followDialog, hasil: e.target.value })} placeholder="mis. tidak diangkat, janji bayar, sudah transfer" /></div>
            <div className="field"><label>Janji bayar (opsional)</label><input type="date" value={followDialog.janji_bayar} onChange={e => setFollowDialog({ ...followDialog, janji_bayar: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={catatFollowUp}>Simpan</button>
              <button className="sort-btn" onClick={() => setFollowDialog(null)}>Batal</button>
            </div>
          </div>
        </div>)}

      {ajbDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={() => setAjbDialog(null)}>
          <div className="card" style={{ width: 400, margin: 0 }} onClick={e => e.stopPropagation()}>
            <h2>Data AJB</h2>
            <div className="field"><label>Notaris / PPAT</label><input value={ajbDialog.notaris} onChange={e => setAjbDialog({ ...ajbDialog, notaris: e.target.value })} /></div>
            <div className="field"><label>BPHTB (Rp)</label><input type="number" min="0" value={ajbDialog.bphtb} onChange={e => setAjbDialog({ ...ajbDialog, bphtb: e.target.value })} /></div>
            <div className="field"><label>PPh (Rp)</label><input type="number" min="0" value={ajbDialog.pph} onChange={e => setAjbDialog({ ...ajbDialog, pph: e.target.value })} /></div>
            <div className="field"><label>Tanggal AJB</label><input type="date" value={ajbDialog.tgl_ajb} onChange={e => setAjbDialog({ ...ajbDialog, tgl_ajb: e.target.value })} /></div>
            <div className="field"><label>No. AJB</label><input value={ajbDialog.no_ajb} onChange={e => setAjbDialog({ ...ajbDialog, no_ajb: e.target.value })} /></div>
            <div className="field"><label>Catatan</label><input value={ajbDialog.catatan} onChange={e => setAjbDialog({ ...ajbDialog, catatan: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={simpanAJB}>Simpan</button>
              <button className="sort-btn" onClick={() => setAjbDialog(null)}>Batal</button>
            </div>
          </div>
        </div>)}

      {kprDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={() => setKprDialog(null)}>
          <div className="card" style={{ width: 380, margin: 0 }} onClick={e => e.stopPropagation()}>
            <h2>Data KPR</h2>
            <div className="field"><label>Bank *</label><input value={kprDialog.bank} onChange={e => setKprDialog({ ...kprDialog, bank: e.target.value })} /></div>
            <div className="field"><label>No. Akad</label><input value={kprDialog.no_akad || ''} onChange={e => setKprDialog({ ...kprDialog, no_akad: e.target.value })} /></div>
            <div className="field"><label>Tanggal Akad</label><input type="date" value={kprDialog.tgl_akad || ''} onChange={e => setKprDialog({ ...kprDialog, tgl_akad: e.target.value })} /></div>
            <div className="field"><label>Plafon disetujui bank (Rp)</label><input type="number" min="0" value={kprDialog.plafon} onChange={e => setKprDialog({ ...kprDialog, plafon: e.target.value })} /></div>
            <div className="field"><label>Catatan</label><input value={kprDialog.catatan || ''} onChange={e => setKprDialog({ ...kprDialog, catatan: e.target.value })} /></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={simpanKPR}>Simpan</button>
              <button className="sort-btn" onClick={() => setKprDialog(null)}>Batal</button>
            </div>
          </div>
        </div>)}

      {jadwalDialog && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.4)', display: 'grid', placeItems: 'center', zIndex: 50 }} onClick={() => setJadwalDialog(null)}>
          <div className="card" style={{ width: 380, margin: 0 }} onClick={e => e.stopPropagation()}>
            <h2>Bentuk Jadwal Tagihan</h2>
            <div className="hint" style={{ marginBottom: 8 }}>{jadwalDialog.nama} · {jadwalDialog.project} · {jadwalDialog.unit}</div>
            <div className="field"><label>Skema Cara Bayar</label>
              <select value={skemaPilih} onChange={e => setSkemaPilih(e.target.value)}>
                <option value="">— pilih —</option>
                {skemaList.map(s => <option key={s.kode} value={s.kode} disabled={!s.lengkap}>{s.nama}{s.lengkap ? '' : ' (aturan belum lengkap)'}</option>)}
              </select></div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={simpanJadwal}>Bentuk Jadwal</button>
              <button className="sort-btn" onClick={() => setJadwalDialog(null)}>Batal</button>
            </div>
          </div>
        </div>)}
      <Toast />
    </>
  );
}
