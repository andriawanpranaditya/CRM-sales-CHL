'use client';
import { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, fmtRp, reminder } from '@/components/util';

const SEL = { New: ['#E5EEF6', '#2D5D8E'], Cold: ['#E8EAEE', '#5A6675'], Warm: ['#FBF1DC', '#8A6415'], Hot: ['#F6E3C0', '#8A5F14'], Appointment: ['#E5EEF6', '#2D5D8E'], 'Site Visit': ['#E5EEF6', '#2D5D8E'], Booking: ['#E4EFE8', '#23694A'], Closing: ['#23694A', '#FFFFFF'], Lost: ['#F9E7E3', '#B3402F'], Drop: ['#F9E7E3', '#B3402F'] };

export default function LeadsPage() {
  const [leads, setLeads] = useState(null);
  const [set, setSet] = useState({ status: [], project: [] });
  const [proj, setProj] = useState('');
  const [fDate, setFDate] = useState('');
  const [fSales, setFSales] = useState('');
  const [fStatus, setFStatus] = useState('');
  const [sortBy, setSortBy] = useState('terbaru');

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
  async function hapus(l) {
    if (!confirm('Hapus ' + l.lead_code + ' — ' + l.nama + '?\nFollow up & transaksi lead ini ikut terhapus. Tidak bisa dibatalkan.')) return;
    try {
      await api('/api/leads', { method: 'DELETE', body: JSON.stringify({ id: l.id }) });
      setLeads(ls => ls.filter(x => x.id !== l.id));
      toast(l.lead_code + ' terhapus');
    } catch (e) { toast(e.message); }
  }

  const salesList = useMemo(() => leads ? [...new Set(leads.map(l => l.sales).filter(Boolean))].sort() : [], [leads]);

  const rows = useMemo(() => {
    if (!leads) return [];
    let r = leads.filter(l =>
      (!proj || l.project === proj) &&
      (!fSales || l.sales === fSales) &&
      (!fStatus || l.status === fStatus) &&
      (!fDate || String(l.tgl || '').slice(0, 10) === fDate));
    const stIdx = st => { const i = (set.status || []).indexOf(st); return i < 0 ? 99 : i; };
    if (sortBy === 'terbaru') r.sort((a, b) => b.id - a.id);
    else if (sortBy === 'terlama') r.sort((a, b) => a.id - b.id);
    else if (sortBy === 'sales') r.sort((a, b) => (a.sales || '').localeCompare(b.sales || '') || b.id - a.id);
    else if (sortBy === 'status') r.sort((a, b) => stIdx(a.status) - stIdx(b.status) || b.id - a.id);
    return r;
  }, [leads, proj, fSales, fStatus, fDate, sortBy, set.status]);

  if (!leads) return <div className="loading">Memuat…</div>;

  return (
    <>
      <div className="page-head">
        <div><h1>Database Lead</h1><div className="sub">Terbaru di atas. Status bisa diubah langsung dari dropdown.</div></div>
        <div className="stamp"><b>{rows.length}</b> lead</div>
      </div>
      <div className="fu-toolbar">
        <button className={'sort-btn' + (!proj ? ' active' : '')} onClick={() => setProj('')}>Semua</button>
        {(set.project || []).map(p => (
          <button key={p} className={'sort-btn' + (proj === p ? ' active' : '')} onClick={() => setProj(p)}>{p}</button>))}
      </div>
      <div className="fu-toolbar">
        <input type="date" className="sort-filter" style={{ marginLeft: 0 }} value={fDate} onChange={e => setFDate(e.target.value)} title="Filter tanggal lead masuk" />
        {fDate && <button className="sort-btn" onClick={() => setFDate('')}>✕ Tanggal</button>}
        <select className="sort-filter" style={{ marginLeft: 0 }} value={fSales} onChange={e => setFSales(e.target.value)}>
          <option value="">Semua Sales</option>
          {salesList.map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="sort-filter" style={{ marginLeft: 0 }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">Semua Status</option>
          {(set.status || []).map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="sort-filter" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="terbaru">Urut: Terbaru</option>
          <option value="terlama">Urut: Terlama</option>
          <option value="sales">Urut: Nama Sales</option>
          <option value="status">Urut: Status</option>
        </select>
      </div>
      <div className="tbl-wrap tbl-compact"><table>
        <thead><tr><th>ID / Tgl</th><th>Nama / WA</th><th>Sumber</th><th>Project / Tipe</th>
          <th className="num">Budget</th><th>Sales</th><th>Status</th><th>Next FU</th><th>Catatan</th><th>Aksi</th></tr></thead>
        <tbody>
          {rows.length ? rows.map(l => {
            const c = SEL[l.status] || ['#EFEEE8', '#1C2B23'];
            const r = reminder(l.next_fu);
            return <tr key={l.id}>
              <td data-label="ID / Tgl"><span className="id-tag">{l.lead_code}</span><span className="sub2">{fmtDate(l.tgl)}</span></td>
              <td data-label="Nama / WA"><b>{l.nama}</b><span className="sub2">{l.wa || '-'}</span></td>
              <td data-label="Sumber">{l.sumber}{l.walkin_info ? <span className="sub2">via {l.walkin_info}</span> : null}</td>
              <td data-label="Project / Tipe">{l.project}<span className="sub2">{l.tipe}</span></td>
              <td className="num" data-label="Budget">{fmtRp(l.budget)}</td>
              <td data-label="Sales">{l.sales}</td>
              <td data-label="Status">
                <select className="status-sel" style={{ background: c[0], color: c[1] }} value={l.status}
                  onChange={e => ubahStatus(l.id, e.target.value)}>
                  {(set.status || []).map(s => <option key={s}>{s}</option>)}
                </select>
              </td>
              <td data-label="Next FU">{l.next_fu ? <>{fmtDate(l.next_fu)}{r && <span className="sub2"><span className={'badge ' + r[1]}>{r[0]}</span></span>}</> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
              <td data-label="Catatan">{l.catatan}</td>
              <td data-label="Aksi"><button className="sort-btn" style={{ color: 'var(--red)', borderColor: 'var(--red-soft)', padding: '4px 9px' }} onClick={() => hapus(l)}>Hapus</button></td>
            </tr>;
          }) : <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Tidak ada lead pada filter ini.</td></tr>}
        </tbody>
      </table></div>
      <div className="hint" style={{ marginTop: 8 }}>Email, domisili, pekerjaan, tujuan &amp; cara bayar lengkap bisa dilihat/diubah lewat tombol Edit di Form Input.</div>
      <Toast />
    </>
  );
}
