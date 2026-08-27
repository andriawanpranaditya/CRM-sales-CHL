'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api } from '@/components/util';

export default function ReportPage() {
  const [leads, setLeads] = useState(null);
  const [trx, setTrx] = useState([]);
  const [set, setSet] = useState({ status: [] });
  const [proj, setProj] = useState('');
  useEffect(() => {
    Promise.all([api('/api/leads'), api('/api/trx'), api('/api/settings')])
      .then(([l, t, s]) => { setLeads(l); setTrx(t); setSet(s); }).catch(e => toast(e.message));
  }, []);
  if (!leads) return <div className="loading">Memuat…</div>;

  const fLeads = proj ? leads.filter(l => l.project === proj) : leads;
  const fTrx = proj ? trx.filter(t => t.project === proj) : trx;
  const salesNames = proj
    ? [...new Set(fLeads.map(l => l.sales).filter(Boolean))]
    : [...new Set([...(set.sales || []), ...fLeads.map(l => l.sales)].filter(Boolean))];
  // Status pipeline tanpa Booking/Closing — posisi transaksi dihitung dari menu Booking
  const ST = ['New', 'Cold', 'Warm', 'Hot', 'Appointment', 'Site Visit', 'Drop'];

  return (
    <>
      <div className="page-head"><div><h1>Report per Sales</h1>
        <div className="sub">Status dari Database Lead · Reserved &amp; Booking dihitung dari transaksi · Closing Rate = Booking ÷ Total Lead</div></div></div>
      <div className="fu-toolbar">
        <button className={'sort-btn' + (!proj ? ' active' : '')} onClick={() => setProj('')}>Semua Project</button>
        {(set.project || []).map(p => (
          <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>))}
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Sales / PIC</th><th className="num">Total</th>
          {ST.map(s => <th className="num" key={s}>{s}</th>)}
          <th className="num" style={{ color: '#C9922E' }}>Reserved</th>
          <th className="num" style={{ color: '#B3402F' }}>Booking</th>
          <th className="num">Closing Rate</th></tr></thead>
        <tbody>
          {salesNames.length ? salesNames.map(s => {
            const mine = fLeads.filter(l => l.sales === s);
            const c = st => mine.filter(l => l.status === st).length;
            const myTrx = fTrx.filter(t => t.sales === s);
            const resSet = new Set(myTrx.filter(t => t.jenis === 'Reserved').map(t => t.lead_code));
            const bookSet = new Set(myTrx.filter(t => t.jenis === 'Booking').map(t => t.lead_code));
            return <tr key={s}>
              <td data-label="Sales"><b>{s}</b></td>
              <td className="num" data-label="Total">{mine.length}</td>
              {ST.map(st => <td className="num" key={st} data-label={st}>{c(st)}</td>)}
              <td className="num" data-label="Reserved"><b style={{ color: '#C9922E' }}>{resSet.size}</b></td>
              <td className="num" data-label="Booking"><b style={{ color: '#B3402F' }}>{bookSet.size}</b></td>
              <td className="num" data-label="Closing Rate"><b>{mine.length ? Math.round(bookSet.size / mine.length * 100) + '%' : '0%'}</b></td>
            </tr>;
          }) : <tr><td colSpan={12} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada sales / lead.</td></tr>}
        </tbody>
      </table></div>
      <div className="hint" style={{ marginTop: 8 }}>Reserved &amp; Booking = jumlah lead unik yang punya transaksi jenis tsb (dari menu Booking). Closing Rate mengukur konversi lead menjadi Booking.</div>
      <Toast />
    </>
  );
}
