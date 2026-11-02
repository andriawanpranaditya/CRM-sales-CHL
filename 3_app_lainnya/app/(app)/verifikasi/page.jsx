'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, fmtRp } from '@/components/util';

const VB = { Menunggu: { bg: '#FBF0DA', fg: '#7A5A18' }, Terverifikasi: { bg: '#DCEAE2', fg: '#12604B' }, Ditolak: { bg: '#F6DADA', fg: '#8A2F2F' }, 'Arsip CRM': { bg: '#ECE8DE', fg: '#5B6E66' } };

export default function VerifikasiPage() {
  const [d, setD] = useState(null);
  const [me, setMe] = useState(null);
  const [tab, setTab] = useState('Menunggu');
  const [buka, setBuka] = useState(null);   // transaksi yang sedang diproses
  const [catatan, setCatatan] = useState('');
  const [harga, setHarga] = useState('');
  const [skema, setSkema] = useState('');
  const [daftarSkema, setDaftarSkema] = useState([]);
  const [busy, setBusy] = useState(false);
  const [gagal, setGagal] = useState('');
  const [ket, setKet] = useState('');          // catatan untuk tindakan gerbang
  const [dist, setDist] = useState({ konsumen: false, arsip: false });

  const load = () => api('/api/verifikasi').then(setD).catch(e => toast(e.message));
  useEffect(() => {
    Promise.all([api('/api/verifikasi'), api('/api/auth/me')])
      .then(([v, u]) => { setD(v); setMe(u); }).catch(e => { toast(e.message); setGagal(e.message); });
  }, []);
  if (gagal) return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2>Halaman Verifikasi gagal dimuat</h2>
      <div className="note" style={{ marginBottom: 10 }}>{gagal}</div>
      <div className="hint">Bila pesan di atas menyebut kolom atau tabel yang tidak dikenal, struktur
        database belum diperbarui. Minta pengelola sistem menjalankan pembaruan database sekali,
        lalu muat ulang halaman ini.</div>
      <button className="btn btn-primary" style={{ width: 'auto', marginTop: 12 }}
        onClick={() => window.location.reload()}>Muat ulang</button>
    </div>);
  if (!d || !me) return <div className="loading">Memuat…</div>;

  const rows = d.rows.filter(r => r.verif_status === tab);
  const jml = s => d.rows.filter(r => r.verif_status === s).length;
  const cetak = (id, jenis) => window.open('/cetak?id=' + id + '&jenis=' + jenis, '_blank');

  function pilih(t) {
    setBuka(t); setCatatan(t.verif_catatan || ''); setHarga(t.harga_unit || ''); setSkema(t.skema_kode || '');
    api('/api/skema?project=' + encodeURIComponent(t.project || '')).then(d => setDaftarSkema((d.rows || []).filter(r => r.aktif))).catch(() => setDaftarSkema([]));
  }

  // Tiga gerbang tambahan sesuai Kebijakan & Prosedur Penjualan
  async function gerbang(t, aksi, opsi = {}) {
    setBusy(true);
    try {
      await api('/api/gerbang', { method: 'POST',
        body: JSON.stringify({ trx_id: t.id, aksi, catatan: ket, ...opsi }) });
      toast(aksi === 'konfirmasi' ? 'Mutasi dikonfirmasi — Admin Sales dapat memverifikasi'
        : aksi === 'ttd' ? 'Kelengkapan tanda tangan tercatat — menunggu Sign Approval Manajemen'
        : opsi.tolak ? 'Dokumen dikembalikan untuk diperbaiki'
        : 'Sign Approval Manajemen tercatat');
      setKet(''); setBuka(null); await load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  async function proses(status) {
    if (!buka) return;
    setBusy(true);
    try {
      if (status === 'Terverifikasi' && !skema && !buka.jadwal_at) { setBusy(false); return toast('Pilih skema cara bayar dulu — jadwal tagihan dibentuk dari skema ini'); }
      const r = await api('/api/verifikasi', {
        method: 'POST',
        body: JSON.stringify({ id: buka.id, status, catatan, harga_unit: harga, skema_kode: buka.jadwal_at ? '' : skema }),
      });
      toast(status === 'Terverifikasi'
        ? 'Terverifikasi — SP ' + r.no_sp + ' terbit' + (r.kontrak ? ', jadwal ' + r.kontrak.jadwal + ' tagihan terbentuk (' + r.kontrak.skema + ')' : '')
        : 'Dikembalikan ke Sales untuk revisi');
      setBuka(null); await load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-head"><div><h1>Verifikasi Penjualan</h1>
        <div className="sub">Periksa berkas &amp; data transaksi, lalu terbitkan Surat Pesanan dan PPJB</div></div>
        <div className="stamp"><b>{jml('Menunggu')}</b> menunggu</div></div>

      <div className="fu-toolbar">
        {['Menunggu', 'Terverifikasi', 'Ditolak'].map(s => (
          <button key={s} className={'sort-btn' + (tab === s ? ' active' : '')} onClick={() => setTab(s)}>
            {s} ({jml(s)})
          </button>))}
      </div>

      {!d.boleh && <div className="hint" style={{ marginBottom: 12 }}>
        Anda dapat melihat status verifikasi, namun hanya Admin Sales yang dapat memverifikasi.</div>}

      {buka && (
        <div className="card" style={{ marginBottom: 14, borderColor: 'var(--brass)' }}>
          <h2>Periksa — {buka.lead_code} · {buka.nama_ktp || buka.nama}</h2>

          {/* Seluruh data yang diinput Sales, dicocokkan dengan KTP dan bukti transfer */}
          <div className="card" style={{ background: '#FBFAF4', borderColor: 'var(--line)', padding: '12px 16px', margin: '4px 0 14px' }}>
            <div style={{ fontSize: 11, fontWeight: 800, letterSpacing: '.06em', color: 'var(--muted)', marginBottom: 8 }}>
              DATA INPUT SALES — COCOKKAN DENGAN KTP &amp; BUKTI TRANSFER</div>
            <table className="dt" style={{ width: '100%', fontSize: 13, borderCollapse: 'collapse' }}><tbody>
              {[
                ['Nama sesuai KTP', buka.nama_ktp, true],
                ['NIK', buka.no_ktp, true],
                ['Nama panggilan', buka.nama && buka.nama_ktp && buka.nama.trim().toLowerCase() !== buka.nama_ktp.trim().toLowerCase() ? buka.nama : null],
                ['Email', buka.email, true],
                ['No. WhatsApp', buka.wa],
                ['Alamat sesuai KTP', buka.alamat_ktp],
                ['Alamat domisili', buka.alamat_domisili, true],
                ['Area domisili', buka.domisili],
                ['NPWP', buka.npwp_nomor || (buka.dispensasi_npwp ? 'Dispensasi Kepala Divisi' : null), true],
                ['Pekerjaan', buka.kerja],
                ['Sumber lead', buka.sumber],
                ['Tipe diminati', buka.tipe],
                ['Skema harga', buka.skema_harga ? 'Harga ' + buka.skema_harga : null],
                ['Tanggal transaksi', buka.tgl ? fmtDate(buka.tgl) : null],
                ['Catatan Sales', buka.catatan],
              ].filter(([, v, wajib]) => v || wajib).map(([k, v, wajib]) => (
                <tr key={k}>
                  <td style={{ padding: '5px 10px 5px 0', color: 'var(--muted)', width: '32%', verticalAlign: 'top' }}>{k}</td>
                  <td style={{ padding: '5px 0', fontWeight: 600, whiteSpace: 'pre-wrap',
                    color: !v && wajib ? 'var(--red)' : 'var(--ink)' }}>
                    {v || (wajib ? '⚠ belum diisi Sales' : '—')}</td>
                </tr>))}
            </tbody></table>
          </div>

          <div className="form-grid">
            <div className="field"><label>Project / Unit</label>
              <input value={(buka.project || '-') + ' · ' + (buka.unit || '-')} readOnly /></div>
            <div className="field"><label>Jenis / Nilai Reserved-Booking</label>
              <input value={buka.jenis + ' — ' + fmtRp(buka.nilai)} readOnly /></div>
            <div className="field"><label>Sales</label><input value={buka.sales || '-'} readOnly /></div>
            <div className="field"><label>Cara Bayar</label><input value={buka.bayar || '-'} readOnly /></div>
            <div className="field"><label>Skema Cara Bayar <span className="req">*</span> — dasar jadwal tagihan</label>
              {buka.jadwal_at ? <input value={buka.skema_kode || ''} disabled /> : (
                <select value={skema} onChange={e => setSkema(e.target.value)}>
                  <option value="">— pilih skema —</option>
                  {daftarSkema.map(r => <option key={r.kode} value={r.kode} disabled={!r.lengkap}>{r.nama}{!r.lengkap ? ' (aturan belum lengkap)' : ''}</option>)}
                </select>)}
              <span className="hint">Sales mencatat cara bayar "{buka.bayar || '—'}". Skema yang belum lengkap aturannya tidak bisa dipilih — lengkapi di Settings.</span></div>
            <div className="field"><label>Nilai Transaksi (Rp) — tercantum di SP &amp; PPJB</label>
              <input type="number" value={harga} onChange={e => setHarga(e.target.value)} placeholder="mis. 850000000" />
              <div className="hint" style={{ marginTop: 4 }}>Terisi dari input Sales. Koreksi bila berbeda dengan price list.</div></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}>
              <label>Catatan verifikasi / alasan revisi</label>
              <input value={catatan} onChange={e => setCatatan(e.target.value)}
                placeholder="Wajib diisi bila transaksi dikembalikan untuk revisi" /></div>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', margin: '10px 0' }}>
            <span className="badge" style={{ background: buka.ada_transfer ? '#DCEAE2' : '#F6DADA', color: buka.ada_transfer ? '#12604B' : '#8A2F2F' }}>
              {buka.ada_transfer ? '✓' : '✕'} Bukti Transfer</span>
            <span className="badge" style={{ background: buka.ada_ktp ? '#DCEAE2' : '#F6DADA', color: buka.ada_ktp ? '#12604B' : '#8A2F2F' }}>
              {buka.ada_ktp ? '✓' : '✕'} KTP</span>
            <span className="badge" style={{
              background: buka.ada_npwp ? '#DCEAE2' : buka.dispensasi_npwp ? '#FBF0DA' : '#F6DADA',
              color: buka.ada_npwp ? '#12604B' : buka.dispensasi_npwp ? '#7A5A18' : '#8A2F2F' }}>
              {buka.ada_npwp ? '✓ NPWP' : buka.dispensasi_npwp ? '◐ NPWP (dispensasi)' : '✕ NPWP'}</span>
            {buka.ada_transfer > 0 && <button className="sort-btn" onClick={() => window.open('/api/berkas?view=1&jenis=transfer&project=' + encodeURIComponent(buka.project) + '&unit=' + encodeURIComponent(buka.unit) + '&lead_code=' + encodeURIComponent(buka.lead_code), '_blank')}>Lihat Transfer</button>}
            {buka.ada_ktp > 0 && <button className="sort-btn" onClick={() => window.open('/api/berkas?view=1&jenis=ktp&project=' + encodeURIComponent(buka.project) + '&unit=' + encodeURIComponent(buka.unit) + '&lead_code=' + encodeURIComponent(buka.lead_code), '_blank')}>Lihat KTP</button>}
          </div>

          {/* NPWP konsumen — wajib, kecuali ada dispensasi Kepala Divisi */}
          {!buka.ada_npwp && (
            <div className="card" style={{ background: buka.dispensasi_npwp ? '#F1F7EE' : '#FFF8E9',
              border: '1px solid ' + (buka.dispensasi_npwp ? '#BBD3B5' : '#E8D9AE'), padding: '11px 14px', margin: '4px 0 10px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: buka.dispensasi_npwp ? '#12604B' : '#6E5713' }}>
                {buka.dispensasi_npwp
                  ? '✓ Dispensasi NPWP diberikan ' + (buka.dispensasi_npwp_oleh || 'Kepala Divisi')
                  : '⏳ NPWP konsumen belum diunggah'}
              </div>
              <div className="hint" style={{ margin: '3px 0 0' }}>
                {buka.dispensasi_npwp
                  ? 'Verifikasi dapat dilanjutkan. Kewajiban melengkapi NPWP tetap melekat pada berkas konsumen.'
                  : 'Sesuai Kebijakan & Prosedur Penjualan, NPWP termasuk kelengkapan wajib. Bila konsumen belum memilikinya, Kepala Divisi dapat memberikan dispensasi.'}
              </div>
              {(me.jabatan === 'kadiv' || ['administrator', 'headsales', 'salesmanager'].includes(me.role)) && (
                <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 9 }}>
                  <input value={ket} onChange={e => setKet(e.target.value)} style={{ maxWidth: 340 }}
                    placeholder="Alasan dispensasi (mis. NPWP dalam proses pengurusan)" />
                  {!buka.dispensasi_npwp
                    ? <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px' }}
                        disabled={busy} onClick={() => gerbang(buka, 'dispensasi_npwp')}>Beri Dispensasi</button>
                    : <button className="sort-btn" disabled={busy}
                        onClick={() => gerbang(buka, 'dispensasi_npwp', { batal: true })}>Cabut dispensasi</button>}
                </div>)}
            </div>)}

          {/* Cross-check Booking Fee — wajib sebelum verifikasi */}
          <div className="card" style={{ background: buka.finance_konfirmasi_at ? '#F1F7EE' : '#FFF8E9',
            border: '1px solid ' + (buka.finance_konfirmasi_at ? '#BBD3B5' : '#E8D9AE'), padding: '11px 14px', margin: '4px 0 10px' }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: buka.finance_konfirmasi_at ? '#12604B' : '#6E5713' }}>
              {buka.finance_konfirmasi_at
                ? '✓ Mutasi rekening dikonfirmasi ' + (buka.finance_konfirmasi_by || 'Finance')
                : '⏳ Menunggu konfirmasi mutasi rekening dari Finance'}
            </div>
            <div className="hint" style={{ margin: '3px 0 0' }}>
              {buka.finance_konfirmasi_at
                ? (buka.finance_catatan || 'Cross-check Booking Fee selesai — verifikasi dapat dilanjutkan.')
                : 'Verifikasi tidak dapat dilakukan sebelum Finance mencatat konfirmasi mutasi Booking Fee.'}
            </div>
            {me.role === 'finance' || ['administrator', 'headsales', 'salesmanager'].includes(me.role) ? (
              <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 9 }}>
                <input value={ket} onChange={e => setKet(e.target.value)} style={{ maxWidth: 320 }}
                  placeholder="Catatan mutasi (mis. masuk 12/09 via BCA)" />
                {!buka.finance_konfirmasi_at
                  ? <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px' }}
                      disabled={busy} onClick={() => gerbang(buka, 'konfirmasi')}>Konfirmasi Mutasi</button>
                  : <button className="sort-btn" disabled={busy}
                      onClick={() => gerbang(buka, 'konfirmasi', { batal: true })}>Batalkan konfirmasi</button>}
              </div>) : null}
          </div>

          {buka.approval_mgmt_at && (
            <div className="card" style={{ background: '#FBFAF4', border: '1px solid var(--line)',
              padding: '11px 14px', margin: '4px 0 10px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#0A3B2E' }}>Distribusi dokumen</div>
              <div className="hint" style={{ margin: '3px 0 7px' }}>
                Rangkap bermeterai Nama Perusahaan diserahkan kepada konsumen melalui Sales/Agent;
                rangkap bermeterai Nama Konsumen diarsipkan perusahaan.
              </div>
              <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
                <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" defaultChecked={!!buka.distribusi_konsumen_at}
                    onChange={e => setDist(v => ({ ...v, konsumen: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: '#12604B' }} />
                  Diserahkan kepada konsumen</label>
                <label style={{ display: 'flex', gap: 7, alignItems: 'center', fontSize: 13 }}>
                  <input type="checkbox" defaultChecked={!!buka.distribusi_arsip_at}
                    onChange={e => setDist(v => ({ ...v, arsip: e.target.checked }))}
                    style={{ width: 16, height: 16, accentColor: '#12604B' }} />
                  Diarsipkan perusahaan</label>
                <button className="sort-btn" disabled={busy}
                  onClick={() => gerbang(buka, 'distribusi', dist)}>Simpan distribusi</button>
              </div>
              {buka.distribusi_oleh && <div className="hint" style={{ margin: '6px 0 0' }}>
                Terakhir dicatat oleh {buka.distribusi_oleh}</div>}
            </div>)}

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {d.boleh && <>
              <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy}
                onClick={() => proses('Terverifikasi')}>✓ Verifikasi &amp; Terbitkan SP + PPJB</button>
              <button className="sort-btn" disabled={busy} onClick={() => proses('Ditolak')}>✕ Kembalikan untuk Revisi</button>
            </>}
            <button className="sort-btn" onClick={() => setBuka(null)}>Tutup</button>
          </div>
          {Number(buka.tahap) < 2 && (
            <div className="note" style={{ marginTop: 8 }}>
              Berkas ini belum diserahkan Sales lewat Papan Alur. Anda tetap dapat memverifikasi,
              namun sebaiknya pastikan Sales sudah menyatakan berkasnya lengkap.
            </div>)}
          <div className="hint" style={{ marginTop: 8 }}>
            Verifikasi menerbitkan nomor Surat Pesanan &amp; PPJB, memindahkan berkas ke tahap 3 (Collection &amp; KPR),
            dan memberi tahu tiap divisi bahwa ada transaksi baru.
          </div>
        </div>
      )}

      <div className="tbl-wrap"><table>
        <thead><tr><th>ID Lead</th><th>Nama</th><th>Project</th><th>Unit</th><th>Jenis</th>
          <th>Tanggal</th><th className="num">Reserved/Booking</th><th className="num">Nilai Transaksi</th><th>Berkas</th><th>Diserahkan</th><th>Status</th><th>Dokumen</th><th>Aksi</th></tr></thead>
        <tbody>
          {rows.map(t => (
            <tr key={t.id}>
              <td data-label="ID Lead">{t.lead_code}</td>
              <td data-label="Nama">{t.nama || '—'}</td>
              <td data-label="Project">{t.project || '—'}</td>
              <td data-label="Unit">{t.unit || '—'}</td>
              <td data-label="Jenis">{t.jenis}</td>
              <td data-label="Tanggal">{fmtDate(t.tgl)}</td>
              <td data-label="Reserved/Booking" className="num">{fmtRp(t.nilai)}</td>
              <td data-label="Nilai Transaksi" className="num">{t.harga_unit > 0 ? fmtRp(t.harga_unit) : '—'}</td>
              <td data-label="Berkas">
                <span title="Bukti transfer">{t.ada_transfer ? '✓' : '✕'}TF</span>{' · '}
                <span title="KTP">{t.ada_ktp ? '✓' : '✕'}KTP</span>
              </td>
              <td data-label="Diserahkan">
                {Number(t.tahap) >= 2
                  ? <span className="badge" style={{ background: '#DCEAE2', color: '#12604B' }}>Sudah</span>
                  : <span className="badge" style={{ background: '#EFEDE3', color: '#6B7265' }}>Belum</span>}
              </td>
              <td data-label="Status">
                <span className="badge" style={{ background: (VB[t.verif_status] || VB['Arsip CRM']).bg, color: (VB[t.verif_status] || VB['Arsip CRM']).fg }}>
                  {t.verif_status}</span>
                {t.verif_catatan && <div className="hint" style={{ margin: 0 }}>{t.verif_catatan}</div>}
              </td>
              <td data-label="Dokumen">
                <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                  <button className="sort-btn" onClick={() => cetak(t.id, 'tts')}>KBF</button>
                  <button className="sort-btn" onClick={() => cetak(t.id, 'fps')}>FPU</button>
                  {t.verif_status === 'Terverifikasi' && <>
                    <button className="sort-btn" onClick={() => cetak(t.id, 'sp')}>SPU</button>
                    <button className="sort-btn" onClick={() => cetak(t.id, 'ppjb')}>P3U</button>
                  </>}
                  {t.bast_at && <button className="sort-btn" onClick={() => cetak(t.id, 'bast')}>BAST</button>}
                </div>
                {t.no_sp && <div className="hint" style={{ margin: 0 }}>{t.no_sp}</div>}
              </td>
              <td data-label="Aksi"><button className="sort-btn" onClick={() => pilih(t)}>Periksa</button></td>
            </tr>))}
          {!rows.length && <tr><td colSpan={13} style={{ textAlign: 'center', padding: 22, color: 'var(--muted)' }}>
            Tidak ada transaksi berstatus {tab}.</td></tr>}
        </tbody>
      </table></div>
      <Toast />
    </>
  );
}
