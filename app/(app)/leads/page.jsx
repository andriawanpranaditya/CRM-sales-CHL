'use client';
import React, { useEffect, useMemo, useState } from 'react';
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
  const [tab, setTab] = useState('lead');       // 'lead' | 'fu'
  const [me, setMe] = useState(null);
  const [fus, setFus] = useState([]);           // riwayat FU lintas lead (tab 2)
  const [sel, setSel] = useState(null);         // lead_code terpilih
  const [detail, setDetail] = useState(null);   // timeline lead terpilih
  const [loadDet, setLoadDet] = useState(false);

  const load = () => Promise.all([api('/api/leads'), api('/api/settings'), api('/api/auth/me'), api('/api/followups')])
    .then(([l, s, u, f]) => { setLeads(l); setSet(s); setMe(u); setFus(f); }).catch(e => toast(e.message));

  // Buka timeline satu lead
  async function bukaLead(kode) {
    if (sel === kode) { setSel(null); setDetail(null); return; }
    setSel(kode); setDetail(null); setLoadDet(true);
    try { setDetail(await api('/api/lead-detail?lead_code=' + encodeURIComponent(kode))); }
    catch (e) { toast(e.message); setSel(null); }
    finally { setLoadDet(false); }
  }
  const jam = x => x ? new Date(x).toLocaleString('id-ID', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace('.', ':') : '—';
  const selisih = (a, b) => {
    if (!a || !b) return null;
    const m = Math.round((new Date(b) - new Date(a)) / 60000);
    if (m < 0) return null;
    if (m < 60) return { t: m + ' menit', w: 'var(--green)' };
    const j = Math.round(m / 60);
    if (j < 24) return { t: j + ' jam', w: j <= 1 ? 'var(--green)' : '#C9922E' };
    return { t: Math.round(j / 24) + ' hari', w: 'var(--red)' };
  };
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

  function panelRiwayat() {
    return (
      <div style={{ padding: '4px 2px 10px' }}>
          {loadDet ? <span className="hint">Memuat riwayat…</span> : !detail ? null : (() => {
            const L = detail.lead;
            const fuList = detail.fus || [], asg = detail.assigns || [], tr = detail.trx || [];
            const terima = asg.length ? asg[asg.length - 1].created_at : L.created_at;
            const fu1 = fuList.length ? fuList[0].created_at : null;
            const respon = selisih(terima, fu1);
            const r2 = reminder(L.next_fu);
            const ev = [];
            ev.push({ w: L.created_at, ikon: '🟢', judul: 'Lead masuk', ket: (L.sumber || 'Tidak diisi') + (L.walkin_info ? ' · via ' + L.walkin_info : '') + (L.created_by ? ' · diinput ' + L.created_by : '') });
            asg.forEach(a => ev.push({ w: a.created_at, ikon: '📮', judul: a.dari ? 'Dioper ' + a.dari + ' → ' + a.ke : 'Ditugaskan ke ' + a.ke, ket: 'oleh ' + (a.oleh || '-') }));
            fuList.forEach((f, i) => ev.push({
              w: f.created_at, ikon: '💬', judul: 'Follow Up #' + (i + 1) + (f.created_by ? ' oleh ' + f.created_by : ''),
              ket: f.detail + (f.objection ? ' · objection: ' + f.objection : '') + (f.next_action ? ' · next: ' + f.next_action : '') + (f.next_tgl ? ' ' + fmtDate(f.next_tgl) : ''),
              tglFU: f.tgl,
            }));
            tr.forEach(t => ev.push({
              w: t.created_at || t.tgl, ikon: t.jenis === 'Booking' ? '🔴' : t.jenis === 'Reserved' ? '🟡' : '⚪',
              judul: t.jenis + (t.unit ? ' — ' + t.unit : ''), ket: fmtRp(t.nilai_jual || t.nilai) + (t.catatan ? ' · ' + t.catatan : ''),
            }));
            ev.sort((a, b) => new Date(a.w) - new Date(b.w));
            return (<>
              <h2 style={{ marginBottom: 2 }}>{L.lead_code} — {L.nama}</h2>
              <div className="hint" style={{ marginBottom: 10 }}>
                {L.wa || '-'} · {L.project || '-'} · sumber {L.sumber || '-'} · PIC <b>{L.sales || 'belum ada'}</b> · status <b>{L.status}</b>
              </div>
              <div className="kpi-grid" style={{ marginBottom: 12 }}>
                <div className="kpi"><div className="kpi-label">Lead Diterima Sales</div>
                  <div className="kpi-val" style={{ fontSize: 16 }}>{jam(terima)}</div>
                  <div className="hint">{asg.length ? 'dari ' + (asg[asg.length - 1].dari || 'input awal') : 'sejak lead dibuat'}</div></div>
                <div className="kpi"><div className="kpi-label">Follow Up Pertama</div>
                  <div className="kpi-val" style={{ fontSize: 16 }}>{fu1 ? jam(fu1) : '—'}</div>
                  <div className="hint">{respon ? <b style={{ color: respon.w }}>respon {respon.t} setelah terima</b> : 'belum di-follow up'}</div></div>
                <div className="kpi"><div className="kpi-label">Total Follow Up</div>
                  <div className="kpi-val">{fuList.length}</div>
                  <div className="hint">{fuList.length ? 'terakhir ' + jam(fuList[fuList.length - 1].created_at) : '—'}</div></div>
                <div className="kpi"><div className="kpi-label">Upcoming Follow Up</div>
                  <div className="kpi-val" style={{ fontSize: 16 }}>{L.next_fu ? fmtDate(L.next_fu) : '—'}</div>
                  <div className="hint">{r2 ? <span className={'badge ' + r2[1]}>{r2[0]}</span> : 'belum dijadwalkan'}</div></div>
              </div>
              <h3 style={{ margin: '4px 0 8px' }}>Riwayat</h3>
              <div style={{ borderLeft: '2px solid var(--line)', paddingLeft: 14 }}>
                {ev.map((e, i) => (
                  <div key={i} style={{ marginBottom: 12, position: 'relative' }}>
                    <span style={{ position: 'absolute', left: -25, top: 0 }}>{e.ikon}</span>
                    <div style={{ fontSize: 12.5, color: 'var(--muted)' }}>{jam(e.w)}{e.tglFU && String(e.tglFU).slice(0, 10) !== String(e.w).slice(0, 10) ? ' · untuk tanggal ' + fmtDate(e.tglFU) : ''}</div>
                    <div style={{ fontWeight: 700 }}>{e.judul}</div>
                    <div style={{ fontSize: 13.5 }}>{e.ket}</div>
                  </div>))}
              </div>
              <button className="sort-btn" style={{ marginTop: 6 }} onClick={() => { setSel(null); setDetail(null); }}>Tutup riwayat</button>
            </>);
          })()}
      </div>
    );
  }

  if (!leads) return <div className="loading">Memuat…</div>;

  return (
    <>
      <div className="page-head">
        <div><h1>Database Lead</h1><div className="sub">Klik baris lead untuk melihat riwayat follow up &amp; jadwal berikutnya</div></div>
        <div className="stamp"><b>{rows.length}</b> lead</div>
      </div>
      <div className="form-tabs" style={{ marginBottom: 12 }}>
        <button className={tab === 'lead' ? 'active' : ''} onClick={() => setTab('lead')}>1 · Lead</button>
        <button className={tab === 'fu' ? 'active' : ''} onClick={() => setTab('fu')}>2 · Riwayat Follow Up</button>
      </div>
      {tab === 'lead' && <>
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
            return <React.Fragment key={l.id}>
              <tr onClick={() => bukaLead(l.lead_code)}
              style={{ cursor: 'pointer', background: sel === l.lead_code ? '#E4EFE8' : undefined }}>
              <td data-label="ID / Tgl"><span className="id-tag">{l.lead_code}</span><span className="sub2">{fmtDate(l.tgl)}</span>
                <span className="sub2" style={{ color: 'var(--green)', fontWeight: 700 }}>{sel === l.lead_code ? '▲ tutup' : '▼ riwayat'}</span></td>
              <td data-label="Nama / WA"><b>{l.nama}</b><span className="sub2">{l.wa || '-'}</span></td>
              <td data-label="Sumber">{l.sumber}{l.walkin_info ? <span className="sub2">via {l.walkin_info}</span> : null}</td>
              <td data-label="Project / Tipe">{l.project}<span className="sub2">{l.tipe}</span></td>
              <td className="num" data-label="Budget">{fmtRp(l.budget)}</td>
              <td data-label="Sales">{l.sales}</td>
              <td data-label="Status">
                <select className="status-sel" style={{ background: c[0], color: c[1] }} value={l.status}
                  onClick={e => e.stopPropagation()}
                  onChange={e => ubahStatus(l.id, e.target.value)}>
                  {(set.status || []).map(s => <option key={s}>{s}</option>)}
                </select>
              </td>
              <td data-label="Next FU">{l.next_fu ? <>{fmtDate(l.next_fu)}{r && <span className="sub2"><span className={'badge ' + r[1]}>{r[0]}</span></span>}</> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
              <td data-label="Catatan">{l.catatan}</td>
              <td data-label="Aksi">{me && me.role === 'manager'
                ? <button className="sort-btn" style={{ color: 'var(--red)', borderColor: 'var(--red-soft)', padding: '4px 9px' }} onClick={e => { e.stopPropagation(); hapus(l); }}>Hapus</button>
                : <span className="hint">—</span>}</td>
              </tr>
              {sel === l.lead_code && (
                <tr className="row-detail"><td colSpan={10} style={{ background: '#FAF9F5', borderTop: '2px solid var(--green)' }}>
                  {panelRiwayat()}
                </td></tr>)}
            </React.Fragment>;
          }) : <tr><td colSpan={10} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Tidak ada lead pada filter ini.</td></tr>}
        </tbody>
      </table></div>
      </>}

      {tab === 'fu' && (
        <div className="tbl-wrap tbl-compact"><table>
          <thead><tr><th>Tanggal / Jam</th><th>ID Lead</th><th>Nama</th><th>Sales</th><th>Detail Komunikasi</th><th>Objection</th><th>Next Action</th><th>Tgl Next FU</th></tr></thead>
          <tbody>
            {fus.length ? [...fus]
              .filter(f => (!proj || f.project === proj) && (!fSales || f.sales === fSales))
              .map(f => (
                <tr key={f.id} style={{ cursor: 'pointer' }} onClick={() => { setTab('lead'); bukaLead(f.lead_code); }}>
                  <td data-label="Tanggal">{fmtDate(f.tgl)}<span className="sub2">{f.created_at ? jam(f.created_at).split(' ').slice(-1)[0] : ''}</span></td>
                  <td data-label="ID Lead"><span className="id-tag">{f.lead_code}</span></td>
                  <td data-label="Nama"><b>{f.nama || ''}</b></td>
                  <td data-label="Sales">{f.sales || ''}</td>
                  <td data-label="Detail">{f.detail}</td>
                  <td data-label="Objection">{f.objection || '—'}</td>
                  <td data-label="Next Action">{f.next_action || '—'}</td>
                  <td data-label="Tgl Next FU">{f.next_tgl ? fmtDate(f.next_tgl) : '—'}</td>
                </tr>))
              : <tr><td colSpan={8} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada follow up.</td></tr>}
          </tbody>
        </table></div>
      )}

      <div className="hint" style={{ marginTop: 8 }}>Email, domisili, pekerjaan, tujuan &amp; cara bayar lengkap bisa dilihat/diubah lewat tombol Edit di Form Input.</div>
      <Toast />
    </>
  );
}
