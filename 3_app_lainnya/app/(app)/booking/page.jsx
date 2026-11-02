'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, fmtRp, BADGE } from '@/components/util';

export default function BookingPage() {
  const [trx, setTrx] = useState(null);
  const [me, setMe] = useState(null);
  const [proj, setProj] = useState('');
  const [set, setSet] = useState({ project: [], units: {} });
  const [edit, setEdit] = useState(null); // transaksi yang sedang diedit (manager)
  const [periode, setPeriode] = useState('bulan-ini');   // pilihan cepat rentang tanggal
  const [dari, setDari] = useState('');                  // dipakai saat periode custom
  const [sampai, setSampai] = useState('');
  const [busy, setBusy] = useState(false);

  const load = () => api('/api/trx').then(setTrx).catch(e => toast(e.message));
  useEffect(() => {
    Promise.all([api('/api/trx'), api('/api/settings'), api('/api/auth/me')])
      .then(([t, s, u]) => { setTrx(t); setSet(s); setMe(u); }).catch(e => toast(e.message));
  }, []);
  if (!trx || !me) return <div className="loading">Memuat…</div>;
  const isMgr = ['administrator', 'headsales', 'salesmanager'].includes(me.role);

  // Rentang tanggal dari pilihan cepat; 'custom' memakai isian dari/sampai
  function rentang() {
    const kini = new Date(); const th = kini.getFullYear(), bl = kini.getMonth();
    const iso = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    if (periode === 'semua') return [null, null];
    if (periode === 'custom') return [dari || null, sampai || null];
    if (periode === 'bulan-ini') return [iso(new Date(th, bl, 1)), iso(new Date(th, bl + 1, 0))];
    if (periode === 'bulan-lalu') return [iso(new Date(th, bl - 1, 1)), iso(new Date(th, bl, 0))];
    if (periode === '3-bulan') return [iso(new Date(th, bl - 2, 1)), iso(new Date(th, bl + 1, 0))];
    if (periode === 'tahun-ini') return [iso(new Date(th, 0, 1)), iso(new Date(th, 11, 31))];
    if (periode === 'tahun-lalu') return [iso(new Date(th - 1, 0, 1)), iso(new Date(th - 1, 11, 31))];
    return [null, null];
  }
  const [d1, d2] = rentang();
  const rows = trx.filter(t => {
    if (proj && t.project !== proj) return false;
    const tg = (t.tgl || '').slice(0, 10);
    if (d1 && (!tg || tg < d1)) return false;
    if (d2 && (!tg || tg > d2)) return false;
    return true;
  });

  // Rekap per jenis transaksi pada periode terpilih
  const rekap = ['Reserved', 'Booking', 'Closing'].map(j => {
    const r = rows.filter(t => t.jenis === j);
    return { jenis: j, jml: r.length, nilai: r.reduce((a, t) => a + (Number(t.nilai) || 0), 0) };
  });
  const totalNilai = rows.filter(t => t.jenis !== 'Batal').reduce((a, t) => a + (Number(t.nilai) || 0), 0);
  const totalTransaksi = rows.filter(t => t.jenis !== 'Batal').reduce((a, t) => a + (Number(t.harga_unit) || 0), 0);
  const labelPeriode = { 'bulan-ini': 'Bulan ini', 'bulan-lalu': 'Bulan lalu', '3-bulan': '3 bulan terakhir',
    'tahun-ini': 'Tahun ini', 'tahun-lalu': 'Tahun lalu', 'semua': 'Seluruh periode', 'custom': 'Rentang pilihan' }[periode];

  const cetak = (id, jenis) => window.open('/cetak?id=' + id + '&jenis=' + jenis, '_blank');
  // Perpanjangan reservasi melewati batas 1 minggu — ditahan sampai disetujui Manager Sales
  async function perpanjang(t) {
    const alasan = prompt('Alasan memperpanjang reservasi ' + (t.nama || t.lead_code) + ' — ' + t.unit + ':\n(perpanjangan memerlukan otorisasi Manager Sales)');
    if (!alasan) return;
    try { const r = await api('/api/reservasi', { method: 'POST', body: JSON.stringify({ aksi: 'perpanjang', trx_id: t.id, alasan }) });
      toast('Reservasi diperpanjang sampai ' + fmtDate(r.tgl_expire)); load(); } catch (e) { toast(e.message); }
  }

  async function simpanEdit() {
    setBusy(true);
    try {
      await api('/api/trx', { method: 'PATCH', body: JSON.stringify(edit) });
      toast('Transaksi ter-update — Dashboard, Report & Master Stock ikut menyesuaikan');
      setEdit(null); await load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function hapus(t) {
    if (!confirm('Hapus transaksi ' + t.jenis + ' — ' + (t.nama || t.lead_code) + (t.unit ? ' (' + t.unit + ')' : '') + '?\nAngka Dashboard, Report & Master Stock akan menyesuaikan otomatis. Tidak bisa dibatalkan.')) return;
    try {
      await api('/api/trx', { method: 'DELETE', body: JSON.stringify({ id: t.id }) });
      setTrx(ls => ls.filter(x => x.id !== t.id));
      toast('Transaksi terhapus');
    } catch (e) { toast(e.message); }
  }

  return (
    <>
      <div className="page-head"><div><h1>Reserved &amp; Booking</h1>
        <div className="sub">{me.role === 'sales'
          ? 'Transaksi Anda per periode — cetak Tanda Terima Sementara & Form Penjualan Sementara di kolom Dokumen'
          : 'Rekap transaksi per periode — dokumen sementara dicetak Sales; SP & PPJB terbit setelah Admin Sales memverifikasi'}</div></div>
        <div className="stamp"><b>{rows.length}</b> transaksi · {labelPeriode}</div></div>
      <div className="fu-toolbar">
        <button className={'sort-btn chip-proyek' + (!proj ? ' active' : '')} onClick={() => setProj('')}>Semua Project</button>
        {(set.project || []).map(p => (
          <button key={p} className={'sort-btn chip-proyek' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>))}
      </div>

      <div className="fu-toolbar">
        <label className="hint" style={{ margin: 0 }}>Periode</label>
        <select value={periode} onChange={e => setPeriode(e.target.value)} style={{ maxWidth: 190 }}>
          <option value="bulan-ini">Bulan ini</option>
          <option value="bulan-lalu">Bulan lalu</option>
          <option value="3-bulan">3 bulan terakhir</option>
          <option value="tahun-ini">Tahun ini</option>
          <option value="tahun-lalu">Tahun lalu</option>
          <option value="custom">Pilih tanggal sendiri…</option>
          <option value="semua">Seluruh periode</option>
        </select>
        {periode === 'custom' && <>
          <input type="date" value={dari} onChange={e => setDari(e.target.value)} style={{ maxWidth: 165 }} />
          <span className="hint" style={{ margin: 0 }}>s/d</span>
          <input type="date" value={sampai} onChange={e => setSampai(e.target.value)} style={{ maxWidth: 165 }} />
        </>}
        {d1 && d2 && <span className="hint" style={{ margin: 0 }}>{fmtDate(d1)} — {fmtDate(d2)}</span>}
      </div>

      <div className="grid kpis" style={{ marginBottom: 16 }}>
        {rekap.map(r => (
          <div className="kpi" key={r.jenis}>
            <div className="lbl">{r.jenis}</div>
            <div className="val">{r.jml}</div>
            <div className="hint" style={{ margin: 0 }}>{fmtRp(r.nilai)}</div>
          </div>))}
        <div className="kpi">
          <div className="lbl">Total Reserved/Booking</div>
          <div className="val" style={{ fontSize: 19 }}>{fmtRp(totalNilai)}</div>
          <div className="hint" style={{ margin: 0 }}>{labelPeriode}</div>
        </div>
        <div className="kpi">
          <div className="lbl">Total Nilai Transaksi</div>
          <div className="val" style={{ fontSize: 19 }}>{fmtRp(totalTransaksi)}</div>
          <div className="hint" style={{ margin: 0 }}>harga jual unit</div>
        </div>
      </div>

      {isMgr && edit && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--brass)' }}>
          <h2>✏️ Edit Transaksi — {edit.lead_code} {edit.nama ? '· ' + edit.nama : ''}</h2>
          <div className="form-grid">
            <div className="field"><label>Jenis</label>
              <select value={edit.jenis} onChange={e => setEdit({ ...edit, jenis: e.target.value })}>
                <option>Reserved</option><option>Booking</option><option>Closing</option><option>Batal</option>
              </select></div>
            <div className="field"><label>Tanggal</label>
              <input type="date" value={(edit.tgl || '').slice(0, 10)} onChange={e => setEdit({ ...edit, tgl: e.target.value })} /></div>
            <div className="field"><label>Nilai Reserved / Booking (Rp)</label>
              <input type="number" value={edit.nilai || ''} onChange={e => setEdit({ ...edit, nilai: e.target.value })} /></div>
            <div className="field"><label>Nilai Transaksi (Rp)</label>
              <input type="number" value={edit.harga_unit || ''} onChange={e => setEdit({ ...edit, harga_unit: e.target.value })} /></div>
            <div className="field"><label>Project</label>
              <select value={edit.project || ''} onChange={e => setEdit({ ...edit, project: e.target.value })}>
                <option value=""></option>{(set.project || []).map(p => <option key={p}>{p}</option>)}
              </select></div>
            <div className="field"><label>Blok / Unit</label>
              {(set.units && set.units[edit.project] && set.units[edit.project].length)
                ? <select value={edit.unit || ''} onChange={e => setEdit({ ...edit, unit: e.target.value })}>
                    <option value=""></option>{set.units[edit.project].map(u => <option key={u}>{u}</option>)}
                  </select>
                : <input value={edit.unit || ''} onChange={e => setEdit({ ...edit, unit: e.target.value })} />}
            </div>
            <div className="field"><label>Cara Bayar</label>
              <input value={edit.bayar || ''} onChange={e => setEdit({ ...edit, bayar: e.target.value })} /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Catatan</label>
              <input value={edit.catatan || ''} onChange={e => setEdit({ ...edit, catatan: e.target.value })} /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" style={{ width: 'auto' }} onClick={simpanEdit} disabled={busy}>Simpan Perubahan</button>
            <button className="sort-btn" onClick={() => setEdit(null)}>Batal</button>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>Status pipeline lead, Dashboard, Report &amp; Master Stock otomatis menyesuaikan setelah disimpan. Bila unit pernah ditandai manual di Master Stock, buka stoknya lewat panel manual di sana.</div>
        </div>
      )}

      <div className="tbl-wrap"><table>
        <thead><tr><th>ID Lead</th><th>Nama</th><th>Sales</th><th>Project</th><th>Blok/Unit</th><th>Jenis</th>
          <th>Tanggal</th><th className="num">Nilai Reserved/Booking</th><th className="num">Nilai Transaksi</th><th>Cara Bayar</th><th>Berkas</th><th>Verifikasi</th><th>Dokumen</th><th>Catatan</th>{isMgr && <th>Aksi</th>}</tr></thead>
        <tbody>
          {rows.length ? rows.map(t => (
            <tr key={t.id}>
              <td data-label="ID Lead"><span className="id-tag">{t.lead_code}</span></td>
              <td data-label="Nama"><b>{t.nama || ''}</b>{t.tipe ? <span className="hint"> · {t.tipe}</span> : null}</td>
              <td data-label="Sales">{t.sales || ''}</td>
              <td data-label="Project">{t.project || ''}</td>
              <td data-label="Blok/Unit">{t.unit || '—'}</td>
              <td data-label="Jenis"><span className={'badge ' + (BADGE[t.jenis === 'Batal' ? 'Lost' : t.jenis] || 'b-cold')}>{t.jenis}</span>
                {t.rsv_aktif && (<div style={{ marginTop: 4, fontSize: 11.5, lineHeight: 1.5 }}>
                  <span style={{ color: t.rsv_lewat ? 'var(--red)' : '#8a5f14', fontWeight: 700 }}>
                    {t.rsv_lewat ? 'KEDALUWARSA ' + fmtDate(t.tgl_expire) + ' — unit dilepas' : 'berlaku s.d. ' + fmtDate(t.tgl_expire)}</span>
                  <br /><button className="sort-btn" style={{ padding: '2px 8px', marginTop: 3 }} onClick={() => perpanjang(t)}>Perpanjang</button>
                </div>)}</td>
              <td data-label="Tanggal">{fmtDate(t.tgl)}</td>
              <td className="num" data-label="Nilai">{fmtRp(t.nilai)}</td>
              <td data-label="Cara Bayar">{t.bayar || ''}</td>
              <td data-label="Berkas">{t.unit ? <>
                <a className="id-tag" style={{ textDecoration: 'none' }} target="_blank" rel="noreferrer"
                  href={'/api/berkas?view=1&jenis=transfer&project=' + encodeURIComponent(t.project || '') + '&unit=' + encodeURIComponent(t.unit) + '&lead_code=' + encodeURIComponent(t.lead_code)}>📎 TF</a>{' '}
                <a className="id-tag" style={{ textDecoration: 'none' }} target="_blank" rel="noreferrer"
                  href={'/api/berkas?view=1&jenis=ktp&project=' + encodeURIComponent(t.project || '') + '&unit=' + encodeURIComponent(t.unit) + '&lead_code=' + encodeURIComponent(t.lead_code)}>📎 KTP</a>
              </> : <span className="hint">—</span>}</td>
              <td data-label="Verifikasi">
                {t.jenis === 'Batal' ? <span className="hint">—</span> : (
                  <span className="badge" style={{
                    background: t.verif_status === 'Terverifikasi' ? '#DCEAE2' : t.verif_status === 'Ditolak' ? '#F6DADA' : '#FBF0DA',
                    color: t.verif_status === 'Terverifikasi' ? '#12604B' : t.verif_status === 'Ditolak' ? '#8A2F2F' : '#7A5A18',
                  }}>{t.verif_status || 'Menunggu'}</span>)}
                {t.verif_catatan && t.verif_status === 'Ditolak' && <div className="hint" style={{ margin: 0 }}>{t.verif_catatan}</div>}
              </td>
              <td data-label="Dokumen">
                {t.jenis === 'Batal' ? <span className="hint">—</span> : (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    <button className="sort-btn" style={{ padding: '4px 8px' }} onClick={() => cetak(t.id, 'tts')}>KBF</button>
                    <button className="sort-btn" style={{ padding: '4px 8px' }} onClick={() => cetak(t.id, 'fps')}>FPU</button>
                    {t.verif_status === 'Terverifikasi' && <>
                      <button className="sort-btn" style={{ padding: '4px 8px' }} onClick={() => cetak(t.id, 'sp')}>SPU</button>
                      <button className="sort-btn" style={{ padding: '4px 8px' }} onClick={() => cetak(t.id, 'ppjb')}>P3U</button>
                    </>}
                  </div>)}
              </td>
              <td data-label="Catatan">{t.catatan}</td>
              {isMgr && <td data-label="Aksi" style={{ whiteSpace: 'nowrap' }}>
                <button className="sort-btn" style={{ padding: '4px 9px' }} onClick={() => setEdit({ ...t, tgl: (t.tgl || '').slice(0, 10) })}>Edit</button>{' '}
                <button className="sort-btn" style={{ padding: '4px 9px', color: 'var(--red)', borderColor: 'var(--red-soft)' }} onClick={() => hapus(t)}>Hapus</button>
              </td>}
            </tr>
          )) : <tr><td colSpan={isMgr ? 15 : 14} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada transaksi.</td></tr>}
        </tbody>
      </table></div>
      <Toast />
    </>
  );
}
