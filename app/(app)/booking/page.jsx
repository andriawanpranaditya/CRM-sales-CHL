'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, fmtRp, BADGE } from '@/components/util';

export default function BookingPage() {
  const [trx, setTrx] = useState(null);
  useEffect(() => { api('/api/trx').then(setTrx).catch(e => toast(e.message)); }, []);
  if (!trx) return <div className="loading">Memuat…</div>;

  return (
    <>
      <div className="page-head"><div><h1>Booking &amp; Closing</h1>
        <div className="sub">Transaksi — status pipeline konsumen ter-update otomatis</div></div>
        <div className="stamp"><b>{trx.length}</b> transaksi</div></div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>ID Lead</th><th>Nama</th><th>Project</th><th>Tipe</th><th>Jenis</th>
          <th>Tanggal</th><th className="num">Nilai</th><th>Catatan</th></tr></thead>
        <tbody>
          {trx.length ? trx.map(t => (
            <tr key={t.id}>
              <td data-label="ID Lead"><span className="id-tag">{t.lead_code}</span></td>
              <td data-label="Nama"><b>{t.nama || ''}</b></td>
              <td data-label="Project">{t.project || ''}</td>
              <td data-label="Tipe">{t.tipe || ''}</td>
              <td data-label="Jenis"><span className={'badge ' + (BADGE[t.jenis === 'Batal' ? 'Lost' : t.jenis] || 'b-cold')}>{t.jenis}</span></td>
              <td data-label="Tanggal">{fmtDate(t.tgl)}</td>
              <td className="num" data-label="Nilai">{fmtRp(t.nilai)}</td>
              <td data-label="Catatan">{t.catatan}</td>
            </tr>
          )) : <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada transaksi — input dari Form Input → Booking / Closing.</td></tr>}
        </tbody>
      </table></div>
      <Toast />
    </>
  );
}
