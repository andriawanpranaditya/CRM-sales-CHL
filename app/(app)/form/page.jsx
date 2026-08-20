'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, todayISO } from '@/components/util';

const EMPTY = { tgl: '', nama: '', wa: '', email: '', domisili: '', kerja: '', sumber: '', project: '', tipe: '', tujuan: '', budget: '', bayar: '', sales: '', status: 'New', catatan: '' };

export default function FormPage() {
  const [tab, setTab] = useState('lead');
  const [set, setSet] = useState(null);
  const [me, setMe] = useState(null);
  const [leads, setLeads] = useState([]);
  const [lead, setLead] = useState({ ...EMPTY, tgl: todayISO() });
  const [fu, setFu] = useState({ lead_code: '', tgl: todayISO(), detail: '', objection: '', next_action: '', next_tgl: '' });
  const [trx, setTrx] = useState({ lead_code: '', jenis: 'Booking', tgl: todayISO(), nilai: '', catatan: '' });
  const [busy, setBusy] = useState(false);

  async function refresh() {
    const [s, l, u] = await Promise.all([api('/api/settings'), api('/api/leads'), api('/api/auth/me')]);
    setSet(s); setLeads(l); setMe(u);
    if (u.role === 'sales') setLead(x => ({ ...x, sales: u.name }));
  }
  useEffect(() => { refresh().catch(e => toast(e.message)); }, []);

  const F = (obj, setObj) => (k, extra = {}) => ({
    value: obj[k] ?? '', onChange: e => setObj({ ...obj, [k]: e.target.value }), ...extra,
  });
  const fl = F(lead, setLead), ff = F(fu, setFu), ft = F(trx, setTrx);
  const opsi = k => [''].concat(set?.[k] || []).map(o => <option key={k + o} value={o}>{o || '— pilih —'}</option>);
  const leadOpt = [<option key="" value="">— pilih —</option>].concat(
    leads.map(l => <option key={l.lead_code} value={l.lead_code}>{l.lead_code} — {l.nama}</option>));

  async function simpanLead() {
    if (!lead.nama.trim()) return toast('Nama Konsumen wajib diisi');
    if (!lead.sales) return toast('Sales / PIC wajib dipilih');
    setBusy(true);
    try {
      const d = await api('/api/leads', { method: 'POST', body: JSON.stringify(lead) });
      toast('Lead tersimpan — ' + d.lead_code);
      setLead({ ...EMPTY, tgl: todayISO(), sales: me?.role === 'sales' ? me.name : '' });
      setLeads(await api('/api/leads'));
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function simpanFU() {
    if (!fu.lead_code) return toast('Pilih ID Lead dulu');
    if (!fu.detail.trim()) return toast('Detail Komunikasi wajib diisi');
    setBusy(true);
    try {
      await api('/api/followups', { method: 'POST', body: JSON.stringify(fu) });
      toast('Follow up tersimpan');
      setFu({ lead_code: '', tgl: todayISO(), detail: '', objection: '', next_action: '', next_tgl: '' });
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function simpanTrx() {
    if (!trx.lead_code) return toast('Pilih ID Lead dulu');
    if (!Number(trx.nilai)) return toast('Nilai (Rp) wajib diisi angka');
    setBusy(true);
    try {
      await api('/api/trx', { method: 'POST', body: JSON.stringify(trx) });
      toast('Transaksi tersimpan — status pipeline ter-update');
      setTrx({ lead_code: '', jenis: 'Booking', tgl: todayISO(), nilai: '', catatan: '' });
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  if (!set) return <div className="loading">Memuat…</div>;
  return (
    <>
      <div className="page-head"><div><h1>Form Input</h1>
        <div className="sub">Data langsung tersimpan ke database bersama. Tanda <span style={{ color: 'var(--red)' }}>*</span> wajib diisi.</div></div></div>
      <div className="form-tabs">
        {[['lead', '1 · Lead Baru'], ['fu', '2 · Follow Up'], ['trx', '3 · Booking / Closing']].map(([k, t]) => (
          <button key={k} className={tab === k ? 'active' : ''} onClick={() => setTab(k)}>{t}</button>))}
      </div>

      {tab === 'lead' && <div className="card">
        <div className="form-grid">
          <div className="field"><label>Tanggal Lead</label><input type="date" {...fl('tgl')} /></div>
          <div className="field"><label>Nama Konsumen <span className="req">*</span></label><input {...fl('nama')} placeholder="Nama lengkap" /></div>
          <div className="field"><label>WhatsApp</label><input {...fl('wa')} placeholder="08xxxxxxxxxx" /></div>
          <div className="field"><label>Email</label><input type="email" {...fl('email')} /></div>
          <div className="field"><label>Domisili</label><input {...fl('domisili')} /></div>
          <div className="field"><label>Pekerjaan</label><input {...fl('kerja')} /></div>
          <div className="field"><label>Sumber Lead</label><select {...fl('sumber')}>{opsi('sumber')}</select></div>
          <div className="field"><label>Project</label><select {...fl('project')}>{opsi('project')}</select></div>
          <div className="field"><label>Tipe / Unit</label><select {...fl('tipe')}>{opsi('tipe')}</select></div>
          <div className="field"><label>Tujuan Pembelian</label><select {...fl('tujuan')}>{opsi('tujuan')}</select></div>
          <div className="field"><label>Budget (Rp)</label><input type="number" min="0" {...fl('budget')} placeholder="contoh: 500000000" /></div>
          <div className="field"><label>Cara Pembayaran</label><select {...fl('bayar')}>{opsi('bayar')}</select></div>
          <div className="field"><label>Sales / PIC <span className="req">*</span></label>
            {me?.role === 'sales'
              ? <input value={me.name} disabled />
              : <select {...fl('sales')}>{opsi('sales')}</select>}
          </div>
          <div className="field"><label>Status Awal</label><select {...fl('status')}>{(set.status || []).map(o => <option key={o}>{o}</option>)}</select></div>
          <div className="field"><label>Catatan</label><input {...fl('catatan')} /></div>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary" onClick={simpanLead} disabled={busy}>Simpan Lead</button>
          <span className="hint">ID Lead dibuat otomatis oleh sistem.</span>
        </div>
      </div>}

      {tab === 'fu' && <div className="card">
        <div className="form-grid">
          <div className="field"><label>ID Lead <span className="req">*</span></label><select {...ff('lead_code')}>{leadOpt}</select></div>
          <div className="field"><label>Tanggal Follow Up</label><input type="date" {...ff('tgl')} /></div>
          <div className="field" style={{ gridColumn: '1/-1' }}><label>Detail Komunikasi <span className="req">*</span></label>
            <textarea rows={2} {...ff('detail')} /></div>
          <div className="field"><label>Objection</label><input {...ff('objection')} /></div>
          <div className="field"><label>Next Action</label><input {...ff('next_action')} /></div>
          <div className="field"><label>Tgl Next Follow Up</label><input type="date" {...ff('next_tgl')} /></div>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary" onClick={simpanFU} disabled={busy}>Simpan Follow Up</button>
          <span className="hint">Reminder MERAH = overdue, KUNING = hari ini, HIJAU = upcoming.</span>
        </div>
      </div>}

      {tab === 'trx' && <div className="card">
        <div className="form-grid">
          <div className="field"><label>ID Lead <span className="req">*</span></label><select {...ft('lead_code')}>{leadOpt}</select></div>
          <div className="field"><label>Jenis Transaksi <span className="req">*</span></label>
            <select {...ft('jenis')}><option>Booking</option><option>Closing</option><option>Batal</option></select></div>
          <div className="field"><label>Tanggal</label><input type="date" {...ft('tgl')} /></div>
          <div className="field"><label>Nilai (Rp) <span className="req">*</span></label><input type="number" min="0" {...ft('nilai')} /></div>
          <div className="field"><label>Catatan</label><input {...ft('catatan')} /></div>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary" onClick={simpanTrx} disabled={busy}>Simpan Transaksi</button>
          <span className="hint">Status pipeline lead ikut ter-update otomatis.</span>
        </div>
      </div>}
      <Toast />
    </>
  );
}
