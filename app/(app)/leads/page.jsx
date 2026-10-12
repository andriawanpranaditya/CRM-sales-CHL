'use client';
import React, { useEffect, useMemo, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate, fmtRp, reminder, bukaWA } from '@/components/util';

const WALKIN_INFO = ['Banner / Spanduk', 'Billboard', 'Website', 'Instagram', 'Facebook Ads', 'Google Ads', 'Tiktok', 'WhatsApp', 'Referral', 'Pameran / Event', 'Kanvasing', 'Marketplace Properti', 'Lainnya'];
const USIA = ['', '< 25', '25–29', '30–34', '35–39', '40–44', '45–49', '50–54', '55+'];

const SEL = { New: ['var(--blue-soft)', 'var(--blue)'], Cold: ['var(--cold-bg)', 'var(--cold-fg)'], Warm: ['var(--brass-soft)', 'var(--brass-deep)'], Hot: ['var(--hot-bg)', 'var(--hot-fg)'], Appointment: ['var(--blue-soft)', 'var(--blue)'], 'Site Visit': ['var(--blue-soft)', 'var(--blue)'], Booking: ['var(--green-soft)', 'var(--green)'], Closing: ['var(--green)', 'var(--on-green)'], Lost: ['var(--red-soft)', 'var(--red)'], Drop: ['var(--red-soft)', 'var(--red)'] };

export default function LeadsPage() {
  const [leads, setLeads] = useState(null);
  const [set, setSet] = useState({ status: [], project: [] });
  const [proj, setProj] = useState('');
  const [fDate, setFDate] = useState('');
  const [fSales, setFSales] = useState('');
  const [fStatus, setFStatus] = useState('');
  // Tautan dari Beranda: /leads?status=Warm
  useEffect(() => { const st = new URLSearchParams(window.location.search).get('status'); if (st) setFStatus(st); }, []);
  const [fAsal, setFAsal] = useState('');
  const asalLead = l => l.creator_role === 'markom' ? (l.sales ? 'Marcom → Sales' : 'Marcom (belum diserahkan)') : 'Non-Marcom'; // asal lead: marcom belum diserahkan / marcom → sales / non-marcom
  const [sortBy, setSortBy] = useState('terbaru');
  const [tab, setTab] = useState('lead');       // 'lead' | 'fu'
  const [me, setMe] = useState(null);
  const [fus, setFus] = useState([]);           // riwayat FU lintas lead (tab 2)
  const [sel, setSel] = useState(null);         // lead_code terpilih
  const [detail, setDetail] = useState(null);   // timeline lead terpilih
  const [loadDet, setLoadDet] = useState(false);
  // Edit lead (panel di bawah baris)
  const [editKode, setEditKode] = useState(null);
  const [ed, setEd] = useState(null);
  const [busy, setBusy] = useState(false);
  const [camps, setCamps] = useState([]);
  // Pindah massal (khusus manager)
  const [mode, setMode] = useState(false);
  const [dipilih, setDipilih] = useState(() => new Set());
  const [keSales, setKeSales] = useState('');
  const [ikutTrx, setIkutTrx] = useState(false);
  const [kirimRingkas, setKirimRingkas] = useState(true);
  const [hasilPindah, setHasilPindah] = useState(null);
  const [akunSales, setAkunSales] = useState([]);

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
    if (j < 24) return { t: j + ' jam', w: j <= 1 ? 'var(--green)' : 'var(--brass)' };
    return { t: Math.round(j / 24) + ' hari', w: 'var(--red)' };
  };
  useEffect(() => { load(); }, []);
  const peran = me?.role || '';
  const isMgr = peran === 'manager';
  const bolehEdit = ['manager', 'ceo', 'sales', 'markom'].includes(peran);
  const bolehPIC = ['manager', 'ceo'].includes(peran);
  const isMarkom = peran === 'markom';
  useEffect(() => { if (['manager', 'ceo', 'markom'].includes(peran)) api('/api/marcom?list=campaign').then(setCamps).catch(() => {}); }, [peran]);
  useEffect(() => { if (isMgr) api('/api/users').then(u => setAkunSales((u || []).filter(x => x.role === 'sales'))).catch(() => {}); }, [isMgr]);

  function mulaiEdit(l) {
    const d10 = x => x ? String(x).slice(0, 10) : '';
    setSel(null); setDetail(null);
    setEditKode(l.lead_code);
    setEd({ id: l.id, tgl: d10(l.tgl), nama: l.nama || '', wa: l.wa || '', email: l.email || '', domisili: l.domisili || '', kerja: l.kerja || '',
      sumber: l.sumber || '', walkin_info: l.walkin_info || '', project: l.project || '', tipe: l.tipe || '', tujuan: l.tujuan || '', budget: l.budget || '',
      bayar: l.bayar || '', sales: l.sales || '', status: l.status || 'New', catatan: l.catatan || '', next_fu: d10(l.next_fu),
      campaign: l.campaign || '', konten: l.konten || '', kode_wa: '', usia: l.usia || '' });
  }
  async function simpanEdit() {
    if (!ed.nama.trim()) return toast('Nama konsumen wajib diisi');
    if (/walk/i.test(ed.sumber || '') && !ed.walkin_info && !isMarkom) return toast('Pilih Walk In tahu dari mana');
    setBusy(true);
    try {
      const kirim = { ...ed };
      if (!bolehPIC) delete kirim.sales;
      const r = await api('/api/leads', { method: 'PATCH', body: JSON.stringify(kirim) });
      toast(r.oper ? `${r.lead_code} tersimpan & dipindah ke ${r.oper}` : `${r.lead_code} tersimpan`);
      setEditKode(null); setEd(null);
      setLeads(await api('/api/leads'));
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  function togglePilih(id) { setDipilih(s0 => { const n = new Set(s0); n.has(id) ? n.delete(id) : n.add(id); return n; }); }
  async function pindahkan() {
    const ids = [...dipilih];
    if (!ids.length) return toast('Centang lead yang akan dipindahkan');
    if (!keSales) return toast('Pilih sales tujuan');
    if (!confirm(`Pindahkan ${ids.length} lead ke ${keSales}?` + (ikutTrx ? '\n\nTermasuk lead yang sudah Reserved/Booking — nama Sales/Agent di transaksinya ikut berganti.' : '\n\nLead yang sudah Reserved/Booking akan dilewati.'))) return;
    setBusy(true);
    try {
      const r = await api('/api/leads', { method: 'PATCH', body: JSON.stringify({ bulk: true, ids, sales: keSales, ikutTrx }) });
      setHasilPindah(r);
      setDipilih(new Set());
      setLeads(await api('/api/leads'));
      toast(`${r.dipindah.length} lead dipindah ke ${r.ke}` + (r.dilewati.length ? ` · ${r.dilewati.length} dilewati` : ''));
      const akun = akunSales.find(a => a.name === r.ke);
      if (kirimRingkas && r.dipindah.length && akun?.wa) {
        const pesan = `Halo ${r.ke}, ada ${r.dipindah.length} lead yang dialihkan kepada Anda oleh manager:\n\n`
          + r.dipindah.map((l, i) => `${i + 1}. ${l.lead_code} — ${l.nama} (${l.project || '-'}, ${l.status}${l.dari ? ', sebelumnya ' + l.dari : ''})`).join('\n')
          + `\n\nMohon dilanjutkan follow up-nya. Riwayat follow up sebelumnya ada di menu Database Lead.`;
        bukaWA(akun.wa, pesan);
      }
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

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
      (!fSales || (fSales === '__kosong__' ? !l.sales : l.sales === fSales)) &&
      (!fStatus || l.status === fStatus) &&
      (!fAsal || asalLead(l) === fAsal) &&
      (!fDate || String(l.tgl || '').slice(0, 10) === fDate));
    const stIdx = st => { const i = (set.status || []).indexOf(st); return i < 0 ? 99 : i; };
    if (sortBy === 'terbaru') r.sort((a, b) => b.id - a.id);
    else if (sortBy === 'terlama') r.sort((a, b) => a.id - b.id);
    else if (sortBy === 'sales') r.sort((a, b) => (a.sales || '').localeCompare(b.sales || '') || b.id - a.id);
    else if (sortBy === 'status') r.sort((a, b) => stIdx(a.status) - stIdx(b.status) || b.id - a.id);
    return r;
  }, [leads, proj, fSales, fStatus, fAsal, fDate, sortBy, set.status]);

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

  function panelEdit() {
    const f = k => ({ value: ed[k] ?? '', onChange: e => setEd(v => ({ ...v, [k]: e.target.value })) });
    const opsi = k => [''].concat(set?.[k] || []).map(o => <option key={k + o} value={o}>{o || '— pilih —'}</option>);
    const saran = [...new Set([...(set.domisili || []), ...leads.map(x => String(x.domisili || '').trim()).filter(Boolean)])].sort((a, b) => a.localeCompare(b));
    const salesOpsi = (set.sales || []).filter(n => { const pp = set.sales_project?.[n]; return !ed.project || !pp || pp.includes(ed.project); });
    return (
      <div style={{ padding: '6px 2px 10px' }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 8 }}>✏️ Edit {editKode}</h2>
        <div className="form-grid">
          <div className="field"><label>Tanggal Lead</label><input type="date" {...f('tgl')} /></div>
          <div className="field"><label>Nama Konsumen <span className="req">*</span></label><input {...f('nama')} /></div>
          <div className="field"><label>WhatsApp</label><input {...f('wa')} /></div>
          <div className="field"><label>Email</label><input type="email" {...f('email')} /></div>
          <div className="field"><label>Domisili</label><input list="dl-domisili-ed" {...f('domisili')} /><datalist id="dl-domisili-ed">{saran.map(x => <option key={x} value={x} />)}</datalist></div>
          {!isMarkom && <div className="field"><label>Pekerjaan</label><input {...f('kerja')} /></div>}
          <div className="field"><label>Sumber Lead</label><select {...f('sumber')}>{opsi('sumber')}</select></div>
          {!isMarkom && /walk/i.test(ed.sumber || '') && <div className="field"><label>Walk In — tahu dari mana? <span className="req">*</span></label>
            <select {...f('walkin_info')}><option value="">— pilih —</option>{WALKIN_INFO.map(w => <option key={w}>{w}</option>)}</select></div>}
          <div className="field"><label>Kode Iklan <span className="hint">(bila ada, mis. BD14-2)</span></label><input {...f('kode_wa')} placeholder="kosongkan bila tidak ada" style={{ textTransform: 'uppercase' }} /></div>
          {['manager', 'ceo', 'markom'].includes(peran) && <div className="field"><label>Campaign</label>
            <select {...f('campaign')}><option value="">— tanpa campaign —</option>{camps.map(cp => <option key={cp.id} value={cp.nama}>{cp.nama}</option>)}
              {ed.campaign && !camps.find(cp => cp.nama === ed.campaign) && <option value={ed.campaign}>{ed.campaign}</option>}</select></div>}
          {['manager', 'ceo', 'markom'].includes(peran) && <div className="field"><label>Konten / Kreatif</label><input {...f('konten')} /></div>}
          <div className="field"><label>Project</label><select {...f('project')}>{opsi('project')}</select></div>
          {!isMarkom && <div className="field"><label>Tipe / Unit</label><select {...f('tipe')}>{opsi('tipe')}</select></div>}
          {!isMarkom && <div className="field"><label>Tujuan Pembelian</label><select {...f('tujuan')}>{opsi('tujuan')}</select></div>}
          <div className="field"><label>Rentang Usia</label><select {...f('usia')}>{USIA.map(u => <option key={u} value={u}>{u || '— pilih —'}</option>)}</select></div>
          {!isMarkom && <div className="field"><label>Budget (Rp)</label><input type="number" min="0" {...f('budget')} /></div>}
          {!isMarkom && <div className="field"><label>Cara Pembayaran</label><select {...f('bayar')}>{opsi('bayar')}</select></div>}
          {bolehPIC && <div className="field"><label>Sales / PIC <span className="hint">(ganti untuk memindahkan lead)</span></label>
            <select {...f('sales')}><option value="">— belum ada —</option>{salesOpsi.map(n => <option key={n} value={n}>{n}</option>)}
              {ed.sales && !salesOpsi.includes(ed.sales) && <option value={ed.sales}>{ed.sales}</option>}</select></div>}
          {!isMarkom && <div className="field"><label>Status</label><select {...f('status')}>
            {(set.status || []).filter(o => !['Booking', 'Closing'].includes(o) || o === ed.status).map(o => <option key={o}>{o}</option>)}</select></div>}
          <div className="field"><label>Tgl Next Follow Up</label><input type="date" {...f('next_fu')} /></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}><label>Catatan</label><input {...f('catatan')} /></div>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy} onClick={simpanEdit}>{busy ? 'Menyimpan…' : 'Simpan Perubahan'}</button>
          <button className="sort-btn" onClick={() => { setEditKode(null); setEd(null); }}>Batal</button>
          {bolehPIC && <span className="hint">Mengganti Sales / PIC tercatat di riwayat serah terima lead.</span>}
        </div>
      </div>);
  }

  if (!leads) return <div className="loading">Memuat…</div>;

  return (
    <>
      <div className="page-head">
        <div><h1>Database Lead</h1><div className="sub">Klik baris lead untuk melihat riwayat follow up &amp; jadwal berikutnya · ✏️ Edit untuk mengubah data</div></div>
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
          <option value="__kosong__">— Belum ada sales —</option>
        </select>
        <select className="sort-filter" style={{ marginLeft: 0 }} value={fStatus} onChange={e => setFStatus(e.target.value)}>
          <option value="">Semua Status</option>
          {(set.status || []).map(s => <option key={s}>{s}</option>)}
        </select>
        <select className="sort-filter" style={{ marginLeft: 0 }} value={fAsal} onChange={e => setFAsal(e.target.value)} title="Asal lead: diinput marcom & sudah/belum dioper ke sales">
          <option value="">Semua Asal Lead</option>
          {['Marcom (belum diserahkan)', 'Marcom → Sales', 'Non-Marcom'].map(a => <option key={a} value={a}>{a} ({leads.filter(l => (!proj || l.project === proj) && asalLead(l) === a).length})</option>)}
        </select>
        <select className="sort-filter" value={sortBy} onChange={e => setSortBy(e.target.value)}>
          <option value="terbaru">Urut: Terbaru</option>
          <option value="terlama">Urut: Terlama</option>
          <option value="sales">Urut: Nama Sales</option>
          <option value="status">Urut: Status</option>
        </select>
        {isMgr && <button className={'sort-btn' + (mode ? ' active' : '')} onClick={() => { setMode(m => !m); setDipilih(new Set()); setHasilPindah(null); setSel(null); setEditKode(null); }}>⇄ {mode ? 'Selesai Pindah Massal' : 'Pindahkan Massal'}</button>}
      </div>
      {isMgr && mode && (
        <div className="card" style={{ marginBottom: 12, borderLeft: '4px solid var(--brass)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
            <b>⇄ Pindahkan Massal</b>
            <span className="hint">Centang lead di tabel (atau saring dulu, misalnya per sales), lalu pilih sales tujuan.</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
            <span><b>{dipilih.size}</b> lead dipilih</span>
            <button className="sort-btn" onClick={() => setDipilih(new Set(rows.map(l => l.id)))}>Pilih semua hasil filter ({rows.length})</button>
            {dipilih.size > 0 && <button className="sort-btn" onClick={() => setDipilih(new Set())}>Kosongkan</button>}
            <select className="sort-filter" style={{ marginLeft: 0 }} value={keSales} onChange={e => setKeSales(e.target.value)}>
              <option value="">— Sales tujuan —</option>
              {(set.sales || []).map(n => { const pp = set.sales_project?.[n]; return <option key={n} value={n}>{n}{pp ? ' (' + pp.join(', ') + ')' : ''}</option>; })}
            </select>
            <button className="btn btn-primary" style={{ width: 'auto' }} disabled={busy || !dipilih.size || !keSales} onClick={pindahkan}>{busy ? 'Memindahkan…' : `Pindahkan ${dipilih.size || ''} lead`}</button>
          </div>
          <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 8 }}>
            <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={kirimRingkas} onChange={e => setKirimRingkas(e.target.checked)} /> kirim daftar lead lewat WA ke sales tujuan</label>
            <label className="hint" style={{ display: 'flex', alignItems: 'center', gap: 6 }}><input type="checkbox" checked={ikutTrx} onChange={e => setIkutTrx(e.target.checked)} /> ikut pindahkan lead yang sudah Reserved/Booking <span style={{ color: 'var(--red)' }}>(nama Sales/Agent di transaksinya ikut berganti)</span></label>
          </div>
          {hasilPindah && (
            <div className="note" style={{ marginTop: 10 }}>
              <b>✓ {hasilPindah.dipindah.length} lead dipindah ke {hasilPindah.ke}</b>{hasilPindah.dipindah.length ? ': ' + hasilPindah.dipindah.map(l => l.lead_code).join(', ') : ''}
              {hasilPindah.dilewati.length > 0 && <div className="hint" style={{ marginTop: 4 }}>Dilewati {hasilPindah.dilewati.length}: {hasilPindah.dilewati.map(d => `${d.lead_code} (${d.alasan})`).join(' · ')}</div>}
              <div className="hint" style={{ marginTop: 4 }}>Semua pemindahan tercatat di riwayat serah terima tiap lead dan di Log Aktivitas.</div>
            </div>)}
        </div>)}
      <div className="tbl-wrap tbl-compact"><table>
        <thead><tr><th>ID / Tgl</th><th>Nama / WA</th><th>Sumber</th><th>Project / Tipe</th>
          <th className="num">Budget</th><th>Sales</th><th>Status</th><th>Next FU</th><th>Catatan</th><th>Aksi</th></tr></thead>
        <tbody>
          {rows.length ? rows.map(l => {
            const c = SEL[l.status] || ['var(--gray-soft)', 'var(--ink)'];
            const r = reminder(l.next_fu);
            return <React.Fragment key={l.id}>
              <tr onClick={() => mode ? togglePilih(l.id) : bukaLead(l.lead_code)}
              style={{ cursor: 'pointer', background: mode && dipilih.has(l.id) ? 'var(--brass-soft)' : (sel === l.lead_code || editKode === l.lead_code) ? 'var(--green-soft)' : undefined }}>
              <td data-label="ID / Tgl">{mode && <input type="checkbox" checked={dipilih.has(l.id)} onChange={() => togglePilih(l.id)} onClick={e => e.stopPropagation()} style={{ marginRight: 6 }} />}
                <span className="id-tag">{l.lead_code}</span><span className="sub2">{fmtDate(l.tgl)}</span>
                {!mode && <span className="sub2" style={{ color: 'var(--green)', fontWeight: 700 }}>{sel === l.lead_code ? '▲ tutup' : '▼ riwayat'}</span>}</td>
              <td data-label="Nama / WA"><b>{l.nama}</b><span className="sub2">{l.wa || '-'}</span></td>
              <td data-label="Sumber">{l.sumber}{l.walkin_info ? <span className="sub2">via {l.walkin_info}</span> : null}</td>
              <td data-label="Project / Tipe">{l.project}<span className="sub2">{l.tipe}</span></td>
              <td className="num" data-label="Budget">{fmtRp(l.budget)}</td>
              <td data-label="Sales">{l.sales || (l.creator_role === 'markom' ? <span className="badge b-warm">Marcom · belum dioper</span> : <span className="hint">—</span>)}{l.sales && l.creator_role === 'markom' ? <div className="hint">dari marcom</div> : null}</td>
              <td data-label="Status">
                <select className="status-sel" style={{ background: c[0], color: c[1] }} value={l.status}
                  onClick={e => e.stopPropagation()}
                  onChange={e => ubahStatus(l.id, e.target.value)}>
                  {(set.status || []).map(s => <option key={s}>{s}</option>)}
                </select>
              </td>
              <td data-label="Next FU">{l.next_fu ? <>{fmtDate(l.next_fu)}{r && <span className="sub2"><span className={'badge ' + r[1]}>{r[0]}</span></span>}</> : <span style={{ color: 'var(--muted)' }}>—</span>}</td>
              <td data-label="Catatan">{l.catatan}</td>
              <td data-label="Aksi"><div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {bolehEdit && <button className="sort-btn" style={{ padding: '4px 9px' }} onClick={e => { e.stopPropagation(); editKode === l.lead_code ? (setEditKode(null), setEd(null)) : mulaiEdit(l); }}>{editKode === l.lead_code ? 'Tutup' : '✏️ Edit'}</button>}
                {isMgr && <button className="sort-btn" style={{ color: 'var(--red)', borderColor: 'var(--red-soft)', padding: '4px 9px' }} onClick={e => { e.stopPropagation(); hapus(l); }}>Hapus</button>}
                {!bolehEdit && !isMgr && <span className="hint">—</span>}</div></td>
              </tr>
              {sel === l.lead_code && (
                <tr className="row-detail"><td colSpan={10} style={{ background: 'var(--detail-bg)', borderTop: '2px solid var(--green)' }}>
                  {panelRiwayat()}
                </td></tr>)}
              {editKode === l.lead_code && ed && (
                <tr className="row-detail"><td colSpan={10} style={{ background: 'var(--detail-bg)', borderTop: '2px solid var(--brass)' }}>
                  {panelEdit()}
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

      <div className="hint" style={{ marginTop: 8 }}>Klik baris untuk riwayat follow up · tombol ✏️ Edit untuk mengubah data lead{isMgr ? ' · ⇄ Pindahkan Massal untuk mengalihkan banyak lead sekaligus' : ''}.</div>
      <Toast />
    </>
  );
}
