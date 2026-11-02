'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, fmtRp } from '@/components/util';

const SB = {
  Layak: { bg: '#FBF0DA', fg: '#7A5A18' },
  Diajukan: { bg: '#DCE6F4', fg: '#274E7A' },
  Disetujui: { bg: '#E6DCF2', fg: '#5A3E7A' },
  Dibayar: { bg: '#DCEAE2', fg: '#12604B' },
  Ditolak: { bg: '#F6DADA', fg: '#8A2F2F' },
  Batal: { bg: '#ECECEC', fg: '#5B5B5B' },   // kontrak dibatalkan
};

export default function KomisiPage() {
  const [d, setD] = useState(null);
  const [tab, setTab] = useState('');
  const [ajukan, setAjukan] = useState(null);
  const [rate, setRate] = useState('2.5');
  const [catatan, setCatatan] = useState('');
  const [busy, setBusy] = useState(false);
  const [gagal, setGagal] = useState('');

  const load = () => api('/api/komisi').then(setD).catch(e => toast(e.message));
  useEffect(() => { load(); }, []);
  if (gagal) return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2>Halaman Komisi Sales gagal dimuat</h2>
      <div className="note" style={{ marginBottom: 10 }}>{gagal}</div>
      <div className="hint">Bila pesan di atas menyebut kolom atau tabel yang tidak dikenal, struktur
        database belum diperbarui. Minta pengelola sistem menjalankan pembaruan database sekali,
        lalu muat ulang halaman ini.</div>
      <button className="btn btn-primary" style={{ width: 'auto', marginTop: 12 }}
        onClick={() => window.location.reload()}>Muat ulang</button>
    </div>);
  if (!d) return <div className="loading">Memuat…</div>;

  const rows = tab ? d.rows.filter(r => r.status === tab) : d.rows;
  const jml = s => d.rows.filter(r => r.status === s).length;

  async function ubah(k, status, extra = {}) {
    setBusy(true);
    try {
      await api('/api/komisi', { method: 'PATCH', body: JSON.stringify({ id: k.id, status, ...extra }) });
      toast(status === 'Diajukan' ? 'Pengajuan komisi terkirim ke Manager'
        : status === 'Disetujui' ? 'Disetujui — Finance diberi tahu untuk pembayaran'
        : status === 'Dibayar' ? 'Komisi ditandai sudah dibayarkan'
        : 'Status diperbarui');
      setAjukan(null); await load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  return (
    <>
      <div className="page-head"><div><h1>Komisi Sales</h1>
        <div className="sub">Layak diajukan bila pembayaran mencapai 20% dari harga unit atau akad kredit selesai</div></div>
        <div className="stamp"><b>{jml('Layak')}</b> siap diajukan</div></div>

      {d.baru > 0 && <div className="note" style={{ marginBottom: 12 }}>
        {d.baru} transaksi baru memenuhi syarat komisi — Admin Sales sudah diberi tahu.</div>}

      <div className="fu-toolbar">
        <button className={'sort-btn' + (!tab ? ' active' : '')} onClick={() => setTab('')}>Semua ({d.rows.length})</button>
        {['Layak', 'Diajukan', 'Disetujui', 'Dibayar', 'Ditolak', 'Batal'].map(s => (
          <button key={s} className={'sort-btn' + (tab === s ? ' active' : '')} onClick={() => setTab(s)}>
            {s} ({jml(s)})</button>))}
      </div>

      {ajukan && (
        <div className="card" style={{ marginBottom: 12, borderColor: 'var(--brass)' }}>
          <h2>Ajukan komisi — {ajukan.sales || 'Sales'} · {ajukan.nama}</h2>
          <div className="hint">Dasar kelayakan: {ajukan.dasar}</div>
          <div className="form-grid">
            <div className="field"><label>Nilai transaksi (Rp)</label>
              <input value={fmtRp(ajukan.nilai_transaksi)} readOnly /></div>
            <div className="field"><label>Rate komisi (%)</label>
              <input type="number" step="0.1" value={rate} onChange={e => setRate(e.target.value)} /></div>
            <div className="field"><label>Perkiraan komisi</label>
              <input value={fmtRp(Math.round((Number(ajukan.nilai_transaksi) || 0) * (Number(rate) || 0) / 100))} readOnly /></div>
            <div className="field" style={{ gridColumn: '1 / -1' }}><label>Catatan</label>
              <input value={catatan} onChange={e => setCatatan(e.target.value)} placeholder="opsional" /></div>
          </div>
          <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
            <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy}
              onClick={() => ubah(ajukan, 'Diajukan', { rate, nilai_transaksi: ajukan.nilai_transaksi, catatan })}>
              Kirim untuk Persetujuan</button>
            <button className="sort-btn" onClick={() => setAjukan(null)}>Batal</button>
          </div>
          <div className="hint" style={{ marginTop: 8 }}>Lampiran SP, PPJB, dan rekap pembayaran tertaut otomatis dari data transaksi.</div>
        </div>
      )}

      <div className="tbl-wrap"><table>
        <thead><tr><th>Sales</th><th>Konsumen</th><th>Project</th><th>Unit</th><th>Dasar Kelayakan</th>
          <th className="num">Nilai Transaksi</th><th className="num">Rate</th><th className="num">Komisi</th>
          <th>Status</th><th>Aksi</th></tr></thead>
        <tbody>
          {rows.map(k => (
            <tr key={k.id}>
              <td data-label="Sales">{k.sales || '—'}</td>
              <td data-label="Konsumen">{k.nama || k.lead_code}</td>
              <td data-label="Project">{k.project || '—'}</td>
              <td data-label="Unit">{k.unit || '—'}</td>
              <td data-label="Dasar">{k.dasar}</td>
              <td data-label="Nilai Transaksi" className="num">{fmtRp(k.nilai_transaksi)}</td>
              <td data-label="Rate" className="num">{k.rate > 0 ? k.rate + '%' : '—'}</td>
              <td data-label="Komisi" className="num">{k.nilai_komisi > 0 ? fmtRp(k.nilai_komisi) : '—'}</td>
              <td data-label="Status">
                <span className="badge" style={{ background: (SB[k.status] || SB.Layak).bg, color: (SB[k.status] || SB.Layak).fg }}>{k.status}</span>
                {k.catatan && <div className="hint" style={{ margin: 0 }}>{k.catatan}</div>}
                {k.dibayar_at && <div className="hint" style={{ margin: 0 }}>Dibayar {fmtDate(k.dibayar_at)}</div>}
              </td>
              <td data-label="Aksi" style={{ whiteSpace: 'nowrap' }}>
                {k.status === 'Layak' && d.hak.ajukan &&
                  <button className="sort-btn" onClick={() => { setAjukan(k); setRate('2.5'); setCatatan(''); }}>Ajukan</button>}
                {k.status === 'Ditolak' && d.hak.ajukan &&
                  <button className="sort-btn" onClick={() => { setAjukan(k); setRate(k.rate || '2.5'); setCatatan(''); }}>Ajukan Ulang</button>}
                {k.status === 'Diajukan' && d.hak.approve && <>
                  <button className="sort-btn" disabled={busy} onClick={() => ubah(k, 'Disetujui')}>Setujui</button>{' '}
                  <button className="sort-btn" style={{ color: 'var(--red)' }} disabled={busy}
                    onClick={() => { const c = prompt('Alasan penolakan:'); if (c) ubah(k, 'Ditolak', { catatan: c }); }}>Tolak</button>
                </>}
                {k.status === 'Disetujui' && d.hak.bayar &&
                  <button className="sort-btn" disabled={busy} onClick={() => ubah(k, 'Dibayar')}>Tandai Dibayar</button>}
              </td>
            </tr>))}
          {!rows.length && <tr><td colSpan={10} style={{ textAlign: 'center', padding: 22, color: 'var(--muted)' }}>
            Belum ada data komisi{tab ? ' berstatus ' + tab : ''}. Komisi muncul otomatis saat syarat 20% atau akad terpenuhi.</td></tr>}
        </tbody>
      </table></div>
      <Toast />
    </>
  );
}
