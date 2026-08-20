'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, fmtRp, reminder } from '@/components/util';

const SEL = { New: ['#E5EEF6', '#2D5D8E'], Cold: ['#E8EAEE', '#5A6675'], Warm: ['#FBF1DC', '#8A6415'], Hot: ['#F6E3C0', '#8A5F14'], Appointment: ['#E5EEF6', '#2D5D8E'], 'Site Visit': ['#E5EEF6', '#2D5D8E'], Booking: ['#E4EFE8', '#23694A'], Closing: ['#23694A', '#FFFFFF'], Lost: ['#F9E7E3', '#B3402F'] };

export default function LeadsPage() {
  const [leads, setLeads] = useState(null);
  const [set, setSet] = useState({ status: [], project: [] });
  const [proj, setProj] = useState('');

  const load = () => Promise.all([api('/api/leads'), api('/api/settings')])
    .then(([l, s]) => { setLeads(l); setSet(s); }).catch(e => toast(e.message));
  useEffect(() => { load(); }, []);

  async function ubahStatus(id, status) {
    try {
      await api('/api/leads', { method: 'PATCH', body: JSON.stringify({ id, status }) });
      setLeads(ls => ls.map(l => l.id === id ? { ...l, status } : l));
      toast('Status ter-update');
    } catch (e) { toast(e.message); }
  }

  if (!leads) return <div className="loading">Memuat…</div>;
  const rows = proj ? leads.filter(l => l.project === proj) : leads;

  return (
    <>
      <div className="page-head">
        <div><h1>Database Lead</h1><div className="sub">Status pipeline bisa diubah langsung dari dropdown</div></div>
        <div className="stamp"><b>{rows.length}</b> lead</div>
      </div>
      <div className="fu-toolbar">
        <button className={'sort-btn' + (!proj ? ' active' : '')} onClick={() => setProj('')}>Semua</button>
        {(set.project || []).map(p => (
          <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>))}
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>ID Lead</th><th>Tanggal</th><th>Nama</th><th>WhatsApp</th><th>Domisili</th><th>Sumber</th><th>Project</th>
          <th>Tipe</th><th className="num">Budget</th><th>Bayar</th><th>Sales</th><th>Status</th><th>Next FU</th><th>Catatan</th></tr></thead>
        <tbody>
          {rows.length ? rows.map(l => {
            const c = SEL[l.status] || ['#EFEEE8', '#1C2B23'];
            return <tr key={l.id}>
              <td data-label="ID Lead"><span className="id-tag">{l.lead_code}</span></td>
              <td data-label="Tanggal">{fmtDate(l.tgl)}</td>
              <td data-label="Nama"><b>{l.nama}</b></td>
              <td data-label="WhatsApp">{l.wa}</td>
              <td data-label="Domisili">{l.domisili}</td>
              <td data-label="Sumber">{l.sumber}</td>
              <td data-label="Project">{l.project}</td>
              <td data-label="Tipe">{l.tipe}</td>
              <td className="num" data-label="Budget">{fmtRp(l.budget)}</td>
              <td data-label="Bayar">{l.bayar}</td>
              <td data-label="Sales">{l.sales}</td>
              <td data-label="Status">
                <select className="status-sel" style={{ background: c[0], color: c[1] }} value={l.status}
                  onChange={e => ubahStatus(l.id, e.target.value)}>
                  {(set.status || []).map(s => <option key={s}>{s}</option>)}
                </select>
              </td>
              <td data-label="Next FU">{l.next_fu ? <>{fmtDate(l.next_fu)}{(() => { const r = reminder(l.next_fu); return r ? <> <span className={'badge ' + r[1]}>{r[0]}</span></> : null; })()}</> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
              <td data-label="Catatan">{l.catatan}</td>
            </tr>;
          }) : <tr><td colSpan={14} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada lead.</td></tr>}
        </tbody>
      </table></div>
      <Toast />
    </>
  );
}
