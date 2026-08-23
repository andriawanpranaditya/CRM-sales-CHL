'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, fmtRp, BADGE } from '@/components/util';

export default function BookingPage() {
  const [trx, setTrx] = useState(null);
  const [proj, setProj] = useState('');
  const [set, setSet] = useState({ project: [] });
  useEffect(() => {
    Promise.all([api('/api/trx'), api('/api/settings')])
      .then(([t, s]) => { setTrx(t); setSet(s); }).catch(e => toast(e.message));
  }, []);
  if (!trx) return <div className="loading">Memuat…</div>;
  const rows = proj ? trx.filter(t => t.project === proj) : trx;

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
      <div className="tbl-wrap"><table>
        <thead><tr><th>ID Lead</th><th>Nama</th><th>Sales</th><th>Project</th><th>Blok/Unit</th><th>Jenis</th>
          <th>Tanggal</th><th className="num">Nilai</th><th>Cara Bayar</th><th>Berkas</th><th>Catatan</th></tr></thead>
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
            </tr>
          )) : <tr><td colSpan={11} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada transaksi — input dari Form Input → Booking / Closing.</td></tr>}
        </tbody>
      </table></div>
      <Toast />
    </>
  );
}
