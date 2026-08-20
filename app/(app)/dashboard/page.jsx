'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtRp, reminder } from '@/components/util';

const AKTIF = ['New', 'Cold', 'Warm', 'Hot', 'Appointment', 'Site Visit', 'Booking'];

export default function Dashboard() {
  const [leads, setLeads] = useState(null);
  const [fus, setFus] = useState([]);
  const [trx, setTrx] = useState([]);
  const [set, setSet] = useState({ status: [], project: [] });
  const [proj, setProj] = useState('');

  useEffect(() => {
    Promise.all([api('/api/leads'), api('/api/followups'), api('/api/trx'), api('/api/settings')])
      .then(([l, f, t, s]) => { setLeads(l); setFus(f); setTrx(t); setSet(s); })
      .catch(e => toast(e.message));
  }, []);

  const fLeads = useMemo(() => proj ? (leads || []).filter(l => l.project === proj) : (leads || []), [leads, proj]);
  const codes = useMemo(() => new Set(fLeads.map(l => l.lead_code)), [fLeads]);
  const fFus = useMemo(() => proj ? fus.filter(f => codes.has(f.lead_code)) : fus, [fus, codes, proj]);
  const fTrx = useMemo(() => proj ? trx.filter(t => codes.has(t.lead_code)) : trx, [trx, codes, proj]);

  if (!leads) return <div className="loading">Memuat data dari database…</div>;

  const byStatus = st => fLeads.filter(l => l.status === st).length;
  const rem = { OVERDUE: 0, 'HARI INI': 0, UPCOMING: 0 };
  fFus.forEach(f => { const r = reminder(f.next_tgl); if (r) rem[r[0]]++; });
  const pipeVal = fLeads.filter(l => AKTIF.includes(l.status)).reduce((a, l) => a + Number(l.budget || 0), 0);
  const bookVal = fTrx.filter(t => t.jenis === 'Booking').reduce((a, t) => a + Number(t.nilai || 0), 0);
  const closeVal = fTrx.filter(t => t.jenis === 'Closing').reduce((a, t) => a + Number(t.nilai || 0), 0);
  const max = Math.max(1, ...(set.status || []).map(byStatus));
  const salesNames = [...new Set(fLeads.map(l => l.sales).filter(Boolean))];

  return (
    <>
      <div className="page-head">
        <div><h1>Dashboard</h1><div className="sub">Data real-time dari database bersama — semua input tim langsung terhitung</div></div>
        <div className="stamp">Data per: <b>{new Date().toLocaleDateString('id-ID')}</b></div>
      </div>
      <div className="fu-toolbar">
        <span className="hint" style={{ fontWeight: 600 }}>Filter project:</span>
        <button className={'sort-btn' + (!proj ? ' active' : '')} onClick={() => setProj('')}>Semua</button>
        {(set.project || []).map(p => (
          <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>))}
      </div>
      <div className="grid kpis">
        {[['Total Lead', fLeads.length], ['Hot', byStatus('Hot')], ['Booking', byStatus('Booking')], ['Closing', byStatus('Closing')]]
          .map(([l, v]) => <div className="kpi" key={l}><div className="lbl">{l}</div><div className="val">{v}</div></div>)}
      </div>
      <div className="grid two-col">
        <div className="card">
          <h2>Status Pipeline</h2>
          <div className="pipe">
            {(set.status || []).map(st => {
              const n = byStatus(st);
              const cls = st === 'Hot' ? ' hot' : st === 'Lost' ? ' lost' : '';
              return <div className={'pipe-row' + cls} key={st}><span>{st}</span>
                <div className="bar"><div className="fill" style={{ width: (n / max * 100) + '%' }} /></div>
                <span className="n">{n}</span></div>;
            })}
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div className="card">
            <h2>Reminder Follow-Up</h2>
            <div className="rem-line overdue"><span>Overdue (terlewat)</span><span className="n">{rem.OVERDUE}</span></div>
            <div className="rem-line today"><span>Hari Ini</span><span className="n">{rem['HARI INI']}</span></div>
            <div className="rem-line upcoming"><span>Upcoming</span><span className="n">{rem.UPCOMING}</span></div>
          </div>
          <div className="card">
            <h2>Nilai (Rp)</h2>
            <div className="money-line"><span>Pipeline Aktif <span className="hint">(budget, excl. Closing/Lost)</span></span><b>{fmtRp(pipeVal)}</b></div>
            <div className="money-line"><span>Nilai Booking</span><b>{fmtRp(bookVal)}</b></div>
            <div className="money-line"><span>Nilai Closing</span><b>{fmtRp(closeVal)}</b></div>
          </div>
        </div>
      </div>
      <div style={{ marginTop: 14 }} className="tbl-wrap">
        <table>
          <thead><tr><th>Sales / PIC</th><th className="num">Total</th><th className="num">Warm</th><th className="num">Hot</th>
            <th className="num">Booking</th><th className="num">Closing</th><th className="num">Closing Rate</th></tr></thead>
          <tbody>
            {salesNames.length ? salesNames.map(s => {
              const mine = fLeads.filter(l => l.sales === s);
              const c = st => mine.filter(l => l.status === st).length;
              return <tr key={s}>
                <td data-label="Sales"><b>{s}</b></td>
                <td className="num" data-label="Total">{mine.length}</td>
                <td className="num" data-label="Warm">{c('Warm')}</td>
                <td className="num" data-label="Hot">{c('Hot')}</td>
                <td className="num" data-label="Booking">{c('Booking')}</td>
                <td className="num" data-label="Closing">{c('Closing')}</td>
                <td className="num" data-label="Closing Rate">{mine.length ? Math.round(c('Closing') / mine.length * 100) + '%' : '0%'}</td>
              </tr>;
            }) : <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada data lead.</td></tr>}
          </tbody>
        </table>
      </div>
      <Toast />
    </>
  );
}
