'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, reminder, waLink } from '@/components/util';

export default function FollowUpPage() {
  const [fus, setFus] = useState(null);
  const [me, setMe] = useState(null);
  const [sort, setSort] = useState('tanggal');
  const [filter, setFilter] = useState('');
  const [fSales, setFSales] = useState('');
  const [proj, setProj] = useState('');
  const [set, setSet] = useState({ project: [] });

  useEffect(() => {
    Promise.all([api('/api/followups'), api('/api/settings'), api('/api/auth/me')])
      .then(([f, s, u]) => { setFus(f); setSet(s); setMe(u); }).catch(e => toast(e.message));
  }, []);
  if (!fus || !me) return <div className="loading">Memuat…</div>;
  const isMgr = me.role === 'manager';

  let rows = fus.filter(f =>
    (!proj || f.project === proj) &&
    (!filter || f.lead_code === filter) &&
    (!fSales || f.sales === fSales));
  if (sort === 'lead') rows.sort((a, b) => a.lead_code.localeCompare(b.lead_code) || new Date(b.tgl) - new Date(a.tgl));
  else if (sort === 'sales') rows.sort((a, b) => (a.sales || '').localeCompare(b.sales || '') || new Date(b.tgl) - new Date(a.tgl));

  const codes = [...new Set(fus.map(f => f.lead_code))].sort();
  const salesList = [...new Set(fus.map(f => f.sales).filter(Boolean))].sort();
  // Reminder hanya tampil pada follow up TERBARU tiap lead — riwayat lama polos
  const latestId = {};
  fus.forEach(f => { if (!latestId[f.lead_code] || f.id > latestId[f.lead_code]) latestId[f.lead_code] = f.id; });

  return (
    <>
      <div className="page-head"><div><h1>Follow Up</h1>
        <div className="sub">Histori komunikasi per konsumen — reminder hanya menempel di follow up terbaru tiap lead</div></div></div>
      <div className="fu-toolbar">
        <button className={'sort-btn' + (!proj ? ' active' : '')} onClick={() => setProj('')}>Semua Project</button>
        {(set.project || []).map(p => (
          <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>))}
      </div>
      <div className="fu-toolbar">
        <span className="hint" style={{ fontWeight: 600 }}>Urutkan:</span>
        <button className={'sort-btn' + (sort === 'tanggal' ? ' active' : '')} onClick={() => setSort('tanggal')}>Tanggal Terbaru</button>
        <button className={'sort-btn' + (sort === 'lead' ? ' active' : '')} onClick={() => setSort('lead')}>Per ID Lead</button>
        {isMgr && <button className={'sort-btn' + (sort === 'sales' ? ' active' : '')} onClick={() => setSort('sales')}>Per Sales</button>}
        {isMgr && <select className="sort-filter" style={{ marginLeft: 0 }} value={fSales} onChange={e => setFSales(e.target.value)}>
          <option value="">Semua sales</option>
          {salesList.map(sn => <option key={sn}>{sn}</option>)}
        </select>}
        <select className="sort-filter" value={filter} onChange={e => setFilter(e.target.value)}>
          <option value="">Semua lead</option>
          {codes.map(c => <option key={c}>{c}</option>)}
        </select>
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Tanggal</th><th>ID Lead</th><th>Nama</th>{isMgr && <th>Sales</th>}<th>Detail Komunikasi</th><th>Objection</th>
          <th>Next Action</th><th>Tgl Next FU</th><th>Reminder</th></tr></thead>
        <tbody>
          {rows.length ? rows.map(f => {
            const isLatest = f.id === latestId[f.lead_code];
            const r = isLatest ? reminder(f.next_tgl) : null;
            return <tr key={f.id}>
              <td data-label="Tanggal">{fmtDate(f.tgl)}</td>
              <td data-label="ID Lead"><span className="id-tag">{f.lead_code}</span></td>
              <td data-label="Nama"><b>{f.nama || ''}</b>{f.project ? <span className="hint"> · {f.project}</span> : null}
                {f.wa ? <> <a className="sort-btn" style={{ textDecoration: 'none', padding: '2px 8px' }} target="_blank" rel="noreferrer"
                  href={waLink(f.wa, f.wa_pesan || '')}>📲 WA</a></> : null}</td>
              {isMgr && <td data-label="Sales">{f.sales || ''}</td>}
              <td data-label="Detail">{f.detail}</td>
              <td data-label="Objection">{f.objection}</td>
              <td data-label="Next Action">{f.next_action}</td>
              <td data-label="Tgl Next FU">{fmtDate(f.next_tgl)}</td>
              <td data-label="Reminder">{r ? <span className={'badge ' + r[1]}>{r[0]}</span> : (isLatest ? '' : <span className="hint">—</span>)}</td>
            </tr>;
          }) : <tr><td colSpan={isMgr ? 9 : 8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada follow up.</td></tr>}
        </tbody>
      </table></div>
      <Toast />
    </>
  );
}
