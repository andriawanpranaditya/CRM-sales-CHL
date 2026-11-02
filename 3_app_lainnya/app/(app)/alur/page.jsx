'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, fmtRp } from '@/components/util';

const DIV = [
  ['collection', 'Collection & KPR', '#8A2F2F'],
  ['finance', 'Finance', '#5A3E7A'],
  ['project', 'Project', '#3D6B2E'],
  ['markom', 'Marcom', '#B4551F'],
  ['estate', 'Estate', '#2F6E6A'],
];
const PERAN = { sales: 'Sales', adminsales: 'Admin Sales', collection: 'Collection & KPR',
  finance: 'Finance', project: 'Admin Project', estate: 'Estate', markom: 'Marcom', manager: 'Manager', '-': '—' };
const WARNA = ['#7A5A18', '#7A4E1F', '#8A2F2F', '#5A3E7A', '#3D6B2E', '#0A3B2E', '#2F6E6A', '#68766E'];

export default function AlurPage() {
  const [d, setD] = useState(null);
  const [me, setMe] = useState(null);
  const [q, setQ] = useState('');
  const [saring, setSaring] = useState('aktif');
  const [riwayat, setRiwayat] = useState(null);
  const [busy, setBusy] = useState(false);
  const [gagal, setGagal] = useState('');
  const [ket, setKet] = useState('');

  const load = () => api('/api/alur').then(setD).catch(e => toast(e.message));
  useEffect(() => {
    Promise.all([api('/api/alur'), api('/api/auth/me')])
      .then(([a, u]) => { setD(a); setMe(u); }).catch(e => { toast(e.message); setGagal(e.message); });
  }, []);
  if (gagal) return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2>Halaman Papan Alur gagal dimuat</h2>
      <div className="note" style={{ marginBottom: 10 }}>{gagal}</div>
      <div className="hint">Bila pesan di atas menyebut kolom atau tabel yang tidak dikenal, struktur
        database belum diperbarui. Minta pengelola sistem menjalankan pembaruan database sekali,
        lalu muat ulang halaman ini.</div>
      <button className="btn btn-primary" style={{ width: 'auto', marginTop: 12 }}
        onClick={() => window.location.reload()}>Muat ulang</button>
    </div>);
  if (!d || !me) return <div className="loading">Memuat…</div>;

  const TAHAP = d.tahap || [];
  const info = n => TAHAP.find(t => t.no === Number(n)) || TAHAP[0] || {};
  const milikSaya = r => info(r.tahap).pemegang === me.role;
  // Berkas dianggap mandek bila tidak berpindah tahap lebih dari 14 hari
  const mandek = r => r.terakhir && r.terakhir.diam_hari > 14 && Number(r.tahap) < TAHAP.length;

  let rows = d.rows;
  if (saring === 'aktif') rows = rows.filter(r => Number(r.tahap) < TAHAP.length);
  else if (saring === 'saya') rows = rows.filter(milikSaya);
  else if (saring === 'mandek') rows = rows.filter(mandek);
  else if (saring === 'selesai') rows = rows.filter(r => Number(r.tahap) >= TAHAP.length);
  if (q) rows = rows.filter(r => ((r.nama || '') + (r.lead_code || '') + (r.unit || '') + (r.project || ''))
    .toLowerCase().includes(q.toLowerCase()));

  const cetak = (id, j) => window.open('/cetak?id=' + id + '&jenis=' + j, '_blank');

  async function serahkan(r) {
    const nx = info(Number(r.tahap) + 1);
    if (!confirm('Serahkan berkas ' + (r.nama || r.lead_code) + ' ke tahap ' + nx.no + ' — ' + nx.nama +
      ' (' + (PERAN[nx.pemegang] || nx.pemegang) + ')?')) return;
    setBusy(true);
    try {
      const res = await api('/api/tahap', { method: 'POST', body: JSON.stringify({ trx_id: r.id }) });
      toast('Diserahkan — kini tahap ' + res.tahap + ': ' + res.nama);
      await load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function kembalikan(r) {
    const c = prompt('Alasan pengembalian berkas ke divisi sebelumnya:');
    if (!c) return;
    setBusy(true);
    try {
      await api('/api/tahap', { method: 'POST', body: JSON.stringify({ trx_id: r.id, aksi: 'kembalikan', catatan: c }) });
      toast('Berkas dikembalikan beserta catatan'); await load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  // Gerbang tambahan: kelengkapan tanda tangan dan Sign Approval Manajemen
  async function gerbang(r, aksi, opsi = {}) {
    setBusy(true);
    try {
      await api('/api/gerbang', { method: 'POST',
        body: JSON.stringify({ trx_id: r.id, aksi, catatan: ket, ...opsi }) });
      toast(aksi === 'ttd' ? 'Kelengkapan tanda tangan tercatat'
        : opsi.tolak ? 'Dokumen dikembalikan untuk diperbaiki' : 'Sign Approval Manajemen tercatat');
      setKet(''); await load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  // Sisa hari menuju batas tanda tangan konsumen
  function sisaTtd(r) {
    if (!r.ttd_deadline || r.ttd_selesai_at) return null;
    return Math.ceil((new Date(r.ttd_deadline) - new Date().setHours(0, 0, 0, 0)) / 86400000);
  }

  async function lihatRiwayat(r) {
    try {
      const x = await api('/api/tahap?trx_id=' + r.id);
      setRiwayat({ r, log: x.log });
    } catch (e) { toast(e.message); }
  }

  return (
    <>
      <div className="page-head"><div><h1>Papan Alur Penjualan</h1>
        <div className="sub">{me.role === 'sales'
          ? 'Posisi berkas transaksi Anda — serahkan ke Admin Sales bila berkas sudah lengkap'
          : 'Rantai penyerahan berkas antar divisi — dari Reserved hingga pengelolaan Estate'}</div></div>
        <div className="stamp"><b>{d.rows.filter(milikSaya).length}</b> {me.role === 'sales' ? 'perlu tindakan' : 'di divisi Anda'}</div></div>

      <div className="fu-toolbar">
        {[['aktif', 'Berjalan'], ['saya', me.role === 'sales' ? 'Perlu tindakan saya' : 'Di divisi saya'],
          ['mandek', 'Mandek'], ['selesai', 'Selesai'], ['', 'Semua']].map(([k, l]) => (
          <button key={k} className={'sort-btn' + (saring === k ? ' active' : '')} onClick={() => setSaring(k)}>{l}</button>))}
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Cari nama, unit, project…" style={{ maxWidth: 240 }} />
      </div>

      {riwayat && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--brass)' }}>
          <h2>Riwayat alur — {riwayat.r.nama || riwayat.r.lead_code}</h2>
          {!riwayat.log.length && <div className="hint">Belum ada perpindahan tercatat.</div>}
          {riwayat.log.map(l => (
            <div key={l.id} style={{ padding: '7px 0', borderBottom: '1px dashed var(--line)', fontSize: 13 }}>
              <b>{l.jenis === 'kembali' ? '↩ Dikembalikan' : '→ Diserahkan'}</b>{' '}
              {PERAN[l.dari_divisi] || l.dari_divisi} → {PERAN[l.ke_divisi] || l.ke_divisi}
              <span className="hint"> · tahap {l.dari_tahap} ke {l.ke_tahap} · oleh {l.oleh} · {fmtDate(l.created_at)}</span>
              {l.catatan && <div className="hint" style={{ margin: 0 }}>Catatan: {l.catatan}</div>}
            </div>))}
          <button className="sort-btn" style={{ marginTop: 10 }} onClick={() => setRiwayat(null)}>Tutup</button>
        </div>
      )}

      {rows.map(r => {
        const th = Number(r.tahap) || 1;
        const t = info(th);
        const warna = WARNA[th - 1] || '#68766E';
        const punya = milikSaya(r) || ['administrator', 'headsales', 'salesmanager'].includes(me.role);
        const akhir = th >= TAHAP.length;
        const persen = r.harga_unit > 0 ? Math.min(100, (Number(r.bayar_masuk) / Number(r.harga_unit)) * 100) : 0;
        return (
          <div className="card" key={r.id} style={{ marginBottom: 12, borderLeft: '4px solid ' + warna }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <h2 style={{ marginBottom: 2 }}>{r.nama || r.lead_code}
                  <span className="hint" style={{ fontWeight: 400 }}> · {r.project} {r.unit}</span></h2>
                <div className="hint" style={{ marginTop: 0 }}>
                  {r.jenis} · {fmtDate(r.tgl)} · Sales: {r.sales || '—'} · {r.bayar || '—'}
                  {r.no_sp ? ' · ' + r.no_sp : ''}</div>
              </div>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', alignSelf: 'flex-start' }}>
                {mandek(r) && <span className="badge b-overdue" title="Belum berpindah tahap lebih dari 14 hari">
                  ⚠ Mandek {r.terakhir.diam_hari} hari</span>}
                {(() => { const sd = sisaTtd(r); return sd !== null && sd < 0
                  ? <span className="badge b-overdue">⚠ TTD lewat {Math.abs(sd)} hari</span>
                  : sd !== null && sd <= 2
                  ? <span className="badge b-warm">TTD sisa {sd} hari</span> : null; })()}
                <span className="badge" style={{ background: warna, color: '#fff' }}>
                  Tahap {t.no} — {t.nama}</span>
              </div>
            </div>

            {/* Jejak tahap */}
            <div style={{ display: 'flex', gap: 3, margin: '12px 0 6px', flexWrap: 'wrap' }}>
              {TAHAP.map(x => (
                <div key={x.no} title={x.no + '. ' + x.nama + ' (' + (PERAN[x.pemegang] || x.pemegang) + ')'}
                  style={{
                    flex: '1 1 34px', height: 7, borderRadius: 4,
                    background: x.no < th ? '#12604B' : x.no === th ? warna : '#E5E3D8',
                  }} />))}
            </div>
            <div className="hint" style={{ marginTop: 0 }}>
              Dipegang <b>{PERAN[t.pemegang] || t.pemegang}</b> · {t.ringkas}
              {r.terakhir && <> · terakhir {r.terakhir.jenis === 'kembali' ? 'dikembalikan' : 'diserahkan'} oleh {r.terakhir.oleh} {fmtDate(r.terakhir.created_at)}</>}
            </div>

            <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', margin: '10px 0 4px', fontSize: 13 }}>
              <div><span className="hint">Nilai transaksi</span><br /><b>{r.harga_unit > 0 ? fmtRp(r.harga_unit) : '—'}</b></div>
              <div><span className="hint">Pembayaran masuk</span><br /><b>{fmtRp(r.bayar_masuk)}</b>
                {r.harga_unit > 0 && <span className="hint"> ({persen.toFixed(1)}%)</span>}</div>
              {r.tgl_serah_terima && <div><span className="hint">Serah terima</span><br /><b>{fmtDate(r.tgl_serah_terima)}</b></div>}
              {r.komisi_status && <div><span className="hint">Komisi</span><br /><b>{r.komisi_status}</b></div>}
            </div>

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 6 }}>
              {me.role === 'sales' ? null : DIV.map(([k, nama, c]) => {
                const p = r.progres[k]; if (!p) return null;
                const tuntas = p.selesai === p.total;
                return (
                  <span key={k} className="badge" title={nama + ': ' + p.selesai + ' dari ' + p.total + ' selesai'}
                    style={{ background: tuntas ? c : p.telat ? '#F6DADA' : '#EFEDE3',
                      color: tuntas ? '#fff' : p.telat ? '#8A2F2F' : '#68766E' }}>
                    {nama} {p.selesai}/{p.total}{p.telat ? ' ⚠' : ''}</span>);
              })}
            </div>

            {/* Tahap 3 — kelengkapan tanda tangan & paraf konsumen */}
            {th === 3 && !r.ttd_selesai_at && (
              <div style={{ background: '#FFF8E9', border: '1px solid #E8D9AE', borderRadius: 9,
                padding: '10px 13px', marginTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#6E5713' }}>
                  Menunggu tanda tangan &amp; paraf konsumen
                  {(() => { const sd = sisaTtd(r); return sd === null ? '' :
                    sd < 0 ? ' — terlambat ' + Math.abs(sd) + ' hari dari batas' :
                    sd === 0 ? ' — jatuh tempo hari ini' : ' — sisa ' + sd + ' hari'; })()}
                </div>
                <div className="hint" style={{ margin: '3px 0 0' }}>
                  Batas tujuh hari kalender sejak dokumen terbit{r.ttd_deadline ? ' · ' + fmtDate(r.ttd_deadline) : ''}.
                  Konsumen menandatangani SPU dan PPJB serta memberi paraf pada setiap halaman.
                </div>
                {['adminsales', 'sales', 'administrator', 'headsales', 'salesmanager'].includes(me.role) && (
                  <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px', marginTop: 9 }}
                    disabled={busy} onClick={() => gerbang(r, 'ttd')}>Tanda tangan &amp; paraf lengkap</button>)}
              </div>)}

            {/* Tahap 4 — Sign Approval Manajemen */}
            {th === 4 && !r.approval_mgmt_at && (
              <div style={{ background: '#F3EFF8', border: '1px solid #D8CCE8', borderRadius: 9,
                padding: '10px 13px', marginTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#5A3E7A' }}>
                  Menunggu Sign Approval Manajemen atas Surat Pesanan &amp; PPJB
                </div>
                <div className="hint" style={{ margin: '3px 0 0' }}>
                  Dokumen telah ditandatangani konsumen{r.ttd_selesai_at ? ' pada ' + fmtDate(r.ttd_selesai_at) : ''}.
                  Manajemen memeriksa, membubuhkan tanda tangan dan paraf, lalu mengesahkan.
                </div>
                {['administrator', 'headsales', 'salesmanager'].includes(me.role) && (
                  <div style={{ display: 'flex', gap: 7, flexWrap: 'wrap', marginTop: 9 }}>
                    <input value={ket} onChange={e => setKet(e.target.value)} style={{ maxWidth: 280 }}
                      placeholder="Catatan pengesahan (opsional)" />
                    <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 14px' }}
                      disabled={busy} onClick={() => gerbang(r, 'approval')}>Sahkan dokumen</button>
                    <button className="sort-btn" disabled={busy}
                      onClick={() => { if (!ket.trim()) return toast('Isi alasan pengembalian lebih dulu.');
                        gerbang(r, 'approval', { tolak: true }); }}>Kembalikan untuk diperbaiki</button>
                  </div>)}
              </div>)}

            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 12, alignItems: 'center' }}>
              {punya && !akhir && (
                <button className="btn btn-primary" style={{ width: 'auto', padding: '8px 15px' }}
                  disabled={busy} onClick={() => serahkan(r)}>
                  Serahkan ke {PERAN[info(th + 1).pemegang] || info(th + 1).nama} →</button>)}
              {punya && th > 1 && !akhir && (
                <button className="sort-btn" disabled={busy} onClick={() => kembalikan(r)}>↩ Kembalikan</button>)}
              {!punya && !akhir && <span className="hint" style={{ margin: 0 }}>
                Menunggu tindakan {PERAN[t.pemegang] || t.pemegang}.</span>}
              {akhir && <span className="badge" style={{ background: '#DCEAE2', color: '#12604B' }}>Berkas selesai</span>}
              <button className="sort-btn" onClick={() => lihatRiwayat(r)}>Riwayat</button>
            </div>
            {punya && !akhir && <div className="hint" style={{ marginTop: 6 }}>{t.berikut}</div>}

            <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 10 }}>
              <button className="sort-btn" style={{ padding: '4px 9px' }} onClick={() => cetak(r.id, 'tts')}>KBF</button>
              <button className="sort-btn" style={{ padding: '4px 9px' }} onClick={() => cetak(r.id, 'fps')}>FPU</button>
              {r.verif_status === 'Terverifikasi' && <>
                <button className="sort-btn" style={{ padding: '4px 9px' }} onClick={() => cetak(r.id, 'sp')}>SPU</button>
                <button className="sort-btn" style={{ padding: '4px 9px' }} onClick={() => cetak(r.id, 'ppjb')}>P3U</button>
              </>}
              <button className="sort-btn" style={{ padding: '4px 9px' }} onClick={() => cetak(r.id, 'kuitansi')}>Kuitansi</button>
              {r.bast_at && <button className="sort-btn" style={{ padding: '4px 9px' }} onClick={() => cetak(r.id, 'bast')}>BAST</button>}
            </div>
          </div>);
      })}
      {!rows.length && <div className="card"><div className="hint" style={{ margin: 0 }}>
        Tidak ada berkas pada saringan ini.</div></div>}
      <Toast />
    </>
  );
}
