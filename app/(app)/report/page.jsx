'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api } from '@/components/util';

export default function ReportPage() {
  const [leads, setLeads] = useState(null);
  const [set, setSet] = useState({ status: [] });
  useEffect(() => {
    Promise.all([api('/api/leads'), api('/api/settings')])
      .then(([l, s]) => { setLeads(l); setSet(s); }).catch(e => toast(e.message));
  }, []);
  if (!leads) return <div className="loading">Memuat…</div>;

  const salesNames = [...new Set([...(set.sales || []), ...leads.map(l => l.sales)].filter(Boolean))];
  const ST = ['New', 'Cold', 'Warm', 'Hot', 'Appointment', 'Site Visit', 'Booking', 'Closing', 'Lost'];

  return (
    <>
      <div className="page-head"><div><h1>Report per Sales</h1>
        <div className="sub">100% otomatis — dihitung dari status pipeline di Database Lead</div></div></div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Sales / PIC</th><th className="num">Total</th>
          {ST.map(s => <th className="num" key={s}>{s}</th>)}<th className="num">Closing Rate</th></tr></thead>
        <tbody>
          {salesNames.length ? salesNames.map(s => {
            const mine = leads.filter(l => l.sales === s);
            const c = st => mine.filter(l => l.status === st).length;
            return <tr key={s}>
              <td data-label="Sales"><b>{s}</b></td>
              <td className="num" data-label="Total">{mine.length}</td>
              {ST.map(st => <td className="num" key={st} data-label={st}>{c(st)}</td>)}
              <td className="num" data-label="Closing Rate"><b>{mine.length ? Math.round(c('Closing') / mine.length * 100) + '%' : '0%'}</b></td>
            </tr>;
          }) : <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada sales / lead.</td></tr>}
        </tbody>
      </table></div>
      <Toast />
    </>
  );
}
