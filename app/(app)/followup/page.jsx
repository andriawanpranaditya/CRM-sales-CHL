'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, reminder } from '@/components/util';

export default function FollowUpPage() {
  const [fus, setFus] = useState(null);
  const [sort, setSort] = useState('tanggal');
  const [filter, setFilter] = useState('');

  useEffect(() => { api('/api/followups').then(setFus).catch(e => toast(e.message)); }, []);
  if (!fus) return <div className="loading">Memuat…</div>;

  let rows = filter ? fus.filter(f => f.lead_code === filter) : [...fus];
  if (sort === 'lead') rows.sort((a, b) => a.lead_code.localeCompare(b.lead_code) || new Date(b.tgl) - new Date(a.tgl));
  const codes = [...new Set(fus.map(f => f.lead_code))].sort();

  return (
    <>
      <div className="page-head"><div><h1>Follow Up</h1>
        <div className="sub">Histori komunikasi per konsumen — satu konsumen boleh punya banyak baris</div></div></div>
      <div className="fu-toolbar">
        <span className="hint" style={{ fontWeight: 600 }}>Urutkan:</span>
        <button className={'sort-btn' + (sort === 'tanggal' ? ' active' : '')} onClick={() => setSort('tanggal')}>Tanggal Terbaru</button>
        <button className={'sort-btn' + (sort === 'lead' ? ' active' : '')} onClick={() => setSort('lead')}>Per ID Lead</button>
        <select className="sort-filter" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">Semua lead</option>
          {codes.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Tanggal</th><th>ID Lead</th><th>Nama</th><th>Detail Komunikasi</th><th>Objection</th>
          <th>Next Action</th><th>Tgl Next FU</th><th>Reminder</th></tr></thead>
        <tbody>
          {rows.length ? rows.map(f => {
            const r = reminder(f.next_tgl);
            return <tr key={f.id}>
              <td data-label="Tanggal">{fmtDate(f.tgl)}</td>
              <td data-label="ID Lead"><span className="id-tag">{f.lead_code}</span></td>
              <td data-label="Nama"><b>{f.nama || ''}</b></td>
              <td data-label="Detail">{f.detail}</td>
              <td data-label="Objection">{f.objection}</td>
              <td data-label="Next Action">{f.next_action}</td>
              <td data-label="Tgl Next FU">{fmtDate(f.next_tgl)}</td>
              <td data-label="Reminder">{r ? <span className={'badge ' + r[1]}>{r[0]}</span> : ''}</td>
            </tr>;
          }) : <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada follow up.</td></tr>}
        </tbody>
      </table></div>
      <Toast />
    </>
  );
}
