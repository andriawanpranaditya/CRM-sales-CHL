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
  const [busy, setBusy] = useState(false);

  const load = () => api('/api/trx').then(setTrx).catch(e => toast(e.message));
  useEffect(() => {
    Promise.all([api('/api/trx'), api('/api/settings'), api('/api/auth/me')])
      .then(([t, s, u]) => { setTrx(t); setSet(s); setMe(u); }).catch(e => toast(e.message));
  }, []);
  if (!trx || !me) return <div className="loading">Memuat…</div>;
  const isMgr = me.role === 'manager';
  const rows = proj ? trx.filter(t => t.project === proj) : trx;

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
      <div className="page-head"><div><h1>Booking &amp; Closing</h1>
        <div className="sub">Transaksi — status pipeline konsumen ter-update otomatis</div></div>
        <div className="stamp"><b>{rows.length}</b> transaksi</div></div>
      <div className="fu-toolbar">
        <button className={'sort-btn' + (!proj ? ' active' : '')} onClick={() => setProj('')}>Semua Project</button>
        {(set.project || []).map(p => (
          <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>))}
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
            <div className="field"><label>Nilai (Rp)</label>
              <input type="number" value={edit.nilai || ''} onChange={e => setEdit({ ...edit, nilai: e.target.value })} /></div>
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
          <th>Tanggal</th><th className="num">Nilai</th><th>Cara Bayar</th><th>Berkas</th><th>Catatan</th>{isMgr && <th>Aksi</th>}</tr></thead>
        <tbody>
          {rows.length ? rows.map(t => (
            <tr key={t.id}>
              <td data-label="ID Lead"><span className="id-tag">{t.lead_code}</span></td>
              <td data-label="Nama"><b>{t.nama || ''}</b>{t.tipe ? <span className="hint"> · {t.tipe}</span> : null}</td>
              <td data-label="Sales">{t.sales || ''}</td>
              <td data-label="Project">{t.project || ''}</td>
              <td data-label="Blok/Unit">{t.unit || '—'}</td>
              <td data-label="Jenis"><span className={'badge ' + (BADGE[t.jenis === 'Batal' ? 'Lost' : t.jenis] || 'b-cold')}>{t.jenis}</span></td>
              <td data-label="Tanggal">{fmtDate(t.tgl)}</td>
              <td className="num" data-label="Nilai">{fmtRp(t.nilai)}</td>
              <td data-label="Cara Bayar">{t.bayar || ''}</td>
              <td data-label="Berkas">{t.unit ? <>
                <a className="id-tag" style={{ textDecoration: 'none' }} target="_blank" rel="noreferrer"
                  href={'/api/berkas?view=1&jenis=transfer&project=' + encodeURIComponent(t.project || '') + '&unit=' + encodeURIComponent(t.unit) + '&lead_code=' + encodeURIComponent(t.lead_code)}>📎 TF</a>{' '}
                <a className="id-tag" style={{ textDecoration: 'none' }} target="_blank" rel="noreferrer"
                  href={'/api/berkas?view=1&jenis=ktp&project=' + encodeURIComponent(t.project || '') + '&unit=' + encodeURIComponent(t.unit) + '&lead_code=' + encodeURIComponent(t.lead_code)}>📎 KTP</a>
              </> : <span className="hint">—</span>}</td>
              <td data-label="Catatan">{t.catatan}</td>
              {isMgr && <td data-label="Aksi" style={{ whiteSpace: 'nowrap' }}>
                <button className="sort-btn" style={{ padding: '4px 9px' }} onClick={() => setEdit({ ...t, tgl: (t.tgl || '').slice(0, 10) })}>Edit</button>{' '}
                <button className="sort-btn" style={{ padding: '4px 9px', color: 'var(--red)', borderColor: 'var(--red-soft)' }} onClick={() => hapus(t)}>Hapus</button>
              </td>}
            </tr>
          )) : <tr><td colSpan={isMgr ? 12 : 11} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada transaksi.</td></tr>}
        </tbody>
      </table></div>
      <Toast />
    </>
  );
}
