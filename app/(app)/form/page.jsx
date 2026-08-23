'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, todayISO, fmtDate, reminder, BADGE } from '@/components/util';

const EMPTY = { tgl: '', nama: '', wa: '', email: '', domisili: '', kerja: '', sumber: '', walkin_info: '', project: '', tipe: '', tujuan: '', budget: '', bayar: '', sales: '', status: 'New', catatan: '', next_fu: '' };
const WALKIN_INFO = ['Banner / Spanduk', 'Website', 'Instagram', 'Facebook Ads', 'Google Ads', 'Tiktok', 'WhatsApp', 'Referral', 'Pameran / Event', 'Kanvasing', 'Marketplace Properti', 'Lainnya'];

export default function FormPage() {
  const [tab, setTab] = useState('lead');
  const [set, setSet] = useState(null);
  const [me, setMe] = useState(null);
  const [leads, setLeads] = useState([]);
  const [lead, setLead] = useState({ ...EMPTY, tgl: todayISO() });
  const [fu, setFu] = useState({ lead_code: '', tgl: todayISO(), detail: '', objection: '', next_action: '', next_tgl: '' });
  const [trx, setTrx] = useState({ lead_code: '', jenis: 'Booking', tgl: todayISO(), nilai: '', catatan: '', project: '', bayar: '', unit: '' });
  const [stok, setStok] = useState([]);
  const [berkas, setBerkas] = useState(null);
  const [upBusy, setUpBusy] = useState('');
  const [busy, setBusy] = useState(false);
  const [showList, setShowList] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [pwOld, setPwOld] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [fus, setFus] = useState([]);
  const [editId, setEditId] = useState(null);

  async function refresh() {
    const [s, l, u, f, st] = await Promise.all([api('/api/settings'), api('/api/leads'), api('/api/auth/me'), api('/api/followups'), api('/api/stock')]);
    setSet(s); setLeads(l); setMe(u); setFus(f); setStok(st.status || []);
    if (u.role === 'sales') setLead(x => ({ ...x, sales: u.name }));
  }
  useEffect(() => { refresh().catch(e => toast(e.message)); }, []);

  useEffect(() => {
    setBerkas(null);
    if (trx.lead_code && trx.project && trx.unit) {
      api('/api/berkas?project=' + encodeURIComponent(trx.project) + '&unit=' + encodeURIComponent(trx.unit) + '&lead_code=' + encodeURIComponent(trx.lead_code))
        .then(setBerkas).catch(() => {});
    }
  }, [trx.lead_code, trx.project, trx.unit]);

  function kecilkanFoto(file) {
    return new Promise((res, rej) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const max = 1400;
        const sc = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * sc); c.height = Math.round(img.height * sc);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        res(c.toDataURL('image/jpeg', 0.8));
      };
      img.onerror = rej;
      img.src = url;
    });
  }

  async function uploadBerkas(jenisB, file) {
    if (!file) return;
    if (!trx.lead_code || !trx.project || !trx.unit) return toast('Pilih ID Lead, Project & Blok/Unit dulu');
    setUpBusy(jenisB);
    try {
      let dataUrl;
      if (file.type.startsWith('image/')) dataUrl = await kecilkanFoto(file);
      else if (file.type === 'application/pdf') {
        if (file.size > 2 * 1024 * 1024) throw new Error('PDF maksimal 2 MB');
        dataUrl = await new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = rej; r.readAsDataURL(file); });
      } else throw new Error('Format harus foto (JPG/PNG) atau PDF');
      const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
      const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
      await api('/api/berkas', {
        method: 'POST',
        body: JSON.stringify({ project: trx.project, unit: trx.unit, lead_code: trx.lead_code, jenis: jenisB, filename: file.name, mime, data }),
      });
      toast((jenisB === 'ktp' ? 'KTP' : 'Bukti Transfer') + ' terupload ✔');
      setBerkas(b => ({ ...(b || {}), [jenisB]: true }));
    } catch (e) { toast(e.message); } finally { setUpBusy(''); }
  }

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
    if (/walk/i.test(lead.sumber || '') && !lead.walkin_info) return toast('Pilih Walk In tahu dari mana');
    setBusy(true);
    try {
      if (editId) {
        await api('/api/leads', { method: 'PATCH', body: JSON.stringify({ id: editId, ...lead }) });
        toast('Lead berhasil diperbarui');
      } else {
        const d = await api('/api/leads', { method: 'POST', body: JSON.stringify(lead) });
        toast('Lead tersimpan — ' + d.lead_code);
      }
      setEditId(null);
      setLead({ ...EMPTY, tgl: todayISO(), sales: me?.role === 'sales' ? me.name : '' });
      setLeads(await api('/api/leads'));
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }

  function mulaiEdit(l) {
    setEditId(l.id);
    setTab('lead');
    const d10 = x => x ? String(x).slice(0, 10) : '';
    setLead({ tgl: d10(l.tgl), nama: l.nama || '', wa: l.wa || '', email: l.email || '', domisili: l.domisili || '',
      kerja: l.kerja || '', sumber: l.sumber || '', project: l.project || '', tipe: l.tipe || '', tujuan: l.tujuan || '',
      budget: l.budget || '', bayar: l.bayar || '', sales: l.sales || '', status: l.status || 'New',
      catatan: l.catatan || '', next_fu: d10(l.next_fu) });
    window.scrollTo({ top: 0, behavior: 'smooth' });
    toast('Mode edit: ' + l.lead_code + ' — ubah lalu klik Update Lead');
  }

  function batalEdit() {
    setEditId(null);
    setLead({ ...EMPTY, tgl: todayISO(), sales: me?.role === 'sales' ? me.name : '' });
  }
  async function simpanFU() {
    if (!fu.lead_code) return toast('Pilih ID Lead dulu');
    if (!fu.detail.trim()) return toast('Detail Komunikasi wajib diisi');
    setBusy(true);
    try {
      await api('/api/followups', { method: 'POST', body: JSON.stringify(fu) });
      toast('Follow up tersimpan');
      setFu({ lead_code: '', tgl: todayISO(), detail: '', objection: '', next_action: '', next_tgl: '' });
      Promise.all([api('/api/leads'), api('/api/followups'), api('/api/stock')]).then(([l, f, st]) => { setLeads(l); setFus(f); setStok(st.status || []); });
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function simpanTrx() {
    if (!trx.lead_code) return toast('Pilih ID Lead dulu');
    if (!Number(trx.nilai)) return toast('Nilai (Rp) wajib diisi angka');
    if (trx.unit && trx.project && trx.jenis !== 'Batal' && berkas && !berkas.adaTrxSebelumnya && !berkas.transfer) {
      return toast('Upload Bukti Transfer dulu untuk transaksi pertama di unit ini.');
    }
    setBusy(true);
    try {
      await api('/api/trx', { method: 'POST', body: JSON.stringify(trx) });
      toast('Transaksi tersimpan — status pipeline ter-update');
      setTrx({ lead_code: '', jenis: 'Booking', tgl: todayISO(), nilai: '', catatan: '', project: '', bayar: '', unit: '' });
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

      {tab === 'lead' && <div className="card" style={editId ? { borderColor: 'var(--brass)', borderWidth: 2 } : undefined}>
        {editId && <div className="note">✏️ Sedang mengedit lead <b>{leads.find(l => l.id === editId)?.lead_code}</b> — perbaiki datanya lalu klik <b>Update Lead</b>, atau <b>Batal</b> untuk kembali input baru.</div>}
        <div className="form-grid">
          <div className="field"><label>Tanggal Lead</label><input type="date" {...fl('tgl')} /></div>
          <div className="field"><label>Nama Konsumen <span className="req">*</span></label><input {...fl('nama')} placeholder="Nama lengkap" /></div>
          <div className="field"><label>WhatsApp</label><input {...fl('wa')} placeholder="08xxxxxxxxxx" /></div>
          <div className="field"><label>Email</label><input type="email" {...fl('email')} /></div>
          <div className="field"><label>Domisili</label><input {...fl('domisili')} /></div>
          <div className="field"><label>Pekerjaan</label><input {...fl('kerja')} /></div>
          <div className="field"><label>Sumber Lead</label><select {...fl('sumber')}>{opsi('sumber')}</select></div>
          {/walk/i.test(lead.sumber || '') && (
            <div className="field"><label>Walk In — tahu dari mana? <span className="req">*</span></label>
              <select value={lead.walkin_info || ''} onChange={e => setLead({ ...lead, walkin_info: e.target.value })}>
                <option value="">— pilih —</option>
                {WALKIN_INFO.map(w => <option key={w}>{w}</option>)}
              </select></div>
          )}
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
          <div className="field"><label>Status Awal</label><select {...fl('status')}>{(set.status || []).filter(o => o !== 'Booking' && o !== 'Closing').map(o => <option key={o}>{o}</option>)}</select></div>
          <div className="field"><label>Tgl Next Follow Up</label><input type="date" {...fl('next_fu')} /></div>
          <div className="field"><label>Catatan</label><input {...fl('catatan')} /></div>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary" onClick={simpanLead} disabled={busy}>{editId ? 'Update Lead' : 'Simpan Lead'}</button>
          {editId && <button className="btn btn-ghost" onClick={batalEdit}>Batal</button>}
          <span className="hint">{editId ? 'Perubahan langsung tersimpan ke database.' : 'ID Lead dibuat otomatis oleh sistem.'}</span>
        </div>
      </div>}

      {tab === 'fu' && <div className="card">
        <div className="form-grid">
          <div className="field"><label>ID Lead <span className="req">*</span></label><select {...ff('lead_code')}>{leadOpt}</select></div>
          <div className="field"><label>Tanggal Follow Up</label><input type="date" {...ff('tgl')} /></div>
          <div className="field" style={{ gridColumn: '1/-1' }}><label>Detail Komunikasi <span className="req">*</span></label>
            <textarea rows={2} {...ff('detail')} /></div>
          <div className="field"><label>Objection</label><input {...ff('objection')} /></div>
          <div className="field"><label>Next Action</label>
            <select value={fu.next_action} onChange={e => setFu({ ...fu, next_action: e.target.value, next_tgl: e.target.value === 'Drop' ? '' : fu.next_tgl })}>
              <option value="">— pilih —</option>
              <option value="Lanjut Follow Up">Lanjut Follow Up</option>
              <option value="Drop">Drop</option>
            </select></div>
          <div className="field"><label>Tgl Next Follow Up{fu.next_action === 'Drop' ? ' (nonaktif — Drop)' : ''}</label>
            <input type="date" {...ff('next_tgl')} disabled={fu.next_action === 'Drop'} /></div>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary" onClick={simpanFU} disabled={busy}>Simpan Follow Up</button>
          <span className="hint">Reminder MERAH = overdue, KUNING = hari ini, HIJAU = upcoming.</span>
        </div>
      </div>}

      {tab === 'trx' && <div className="card">
        <div className="form-grid">
          <div className="field"><label>ID Lead <span className="req">*</span></label>
            <select value={trx.lead_code} onChange={e => {
              const l = leads.find(x => x.lead_code === e.target.value);
              setTrx({ ...trx, lead_code: e.target.value, project: (l && l.project) || trx.project, bayar: (l && l.bayar) || trx.bayar });
            }}>{leadOpt}</select></div>
          <div className="field"><label>Project</label><select {...ft('project')}>{opsi('project')}</select></div>
          <div className="field"><label>Blok / Unit</label>
            {(set.units && set.units[trx.project] && set.units[trx.project].length)
              ? (() => {
                  const stMap = {};
                  stok.forEach(u2 => { if (u2.project === trx.project) stMap[u2.unit] = u2; });
                  return <select {...ft('unit')}>
                    <option value="">— pilih —</option>
                    {set.units[trx.project].map(u => {
                      const st = stMap[u];
                      // Unit tertutup tetap bisa dipilih oleh LEAD PEMILIKNYA (untuk naik ke Booking/Closing atau Batal)
                      const milikSendiri = st && st.lead_code && st.lead_code === trx.lead_code;
                      const kunci = !!st && !milikSendiri;
                      const label = !st ? u
                        : (st.warna === 'merah' ? '🔴 ' : '🟡 ') + u +
                          (milikSendiri ? ' — unit lead ini' : st.warna === 'merah' ? ' — TERJUAL' : ' — RESERVED');
                      return <option key={'u' + u} value={u} disabled={kunci}>{label}</option>;
                    })}
                  </select>;
                })()
              : <input {...ft('unit')} placeholder={trx.project ? 'ketik blok/unit' : 'pilih project dulu'} />}
            <span className="hint">🔴 terjual · 🟡 reserved — terkunci, kecuali unit milik lead yang sedang dipilih.</span>
          </div>
          <div className="field"><label>Cara Bayar</label><select {...ft('bayar')}>{opsi('bayar')}</select></div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Berkas Transaksi (KTP &amp; Bukti Transfer)</label>
            {!(trx.lead_code && trx.project && trx.unit) ? (
              <span className="hint">Pilih ID Lead, Project &amp; Blok/Unit dulu untuk mengelola berkas.</span>
            ) : berkas && berkas.adaTrxSebelumnya ? (
              <div className="note" style={{ marginBottom: 0 }}>✔ Berkas transaksi pertama unit ini sudah tersimpan — update ke Booking/Closing/Batal <b>tidak perlu upload lagi</b>, langsung Simpan.</div>
            ) : (
              <div style={{ display: 'grid', gap: 8 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <b style={{ fontSize: 12.5, minWidth: 105 }}>Bukti Transfer <span className="req">*</span></b>
                  {berkas && berkas.transfer
                    ? <span className="badge b-close">✔ TERUPLOAD</span>
                    : <input type="file" accept="image/*,application/pdf" disabled={upBusy !== ''}
                        onChange={e => uploadBerkas('transfer', e.target.files[0])} />}
                  {upBusy === 'transfer' && <span className="hint">Mengupload…</span>}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
                  <b style={{ fontSize: 12.5, minWidth: 105 }}>KTP</b>
                  {berkas && berkas.ktp
                    ? <span className="badge b-close">✔ TERUPLOAD</span>
                    : <input type="file" accept="image/*,application/pdf" disabled={upBusy !== ''}
                        onChange={e => uploadBerkas('ktp', e.target.files[0])} />}
                  {upBusy === 'ktp' && <span className="hint">Mengupload…</span>}
                </div>
                <span className="hint">Wajib minimal Bukti Transfer untuk transaksi pertama di unit ini. Foto dikompres otomatis; PDF maks 2 MB.</span>
              </div>
            )}
          </div>
          <div className="field"><label>Jenis Transaksi <span className="req">*</span></label>
            <select {...ft('jenis')}><option>Reserved</option><option>Booking</option><option>Batal</option></select></div>
          <div className="field"><label>Tanggal</label><input type="date" {...ft('tgl')} /></div>
          <div className="field"><label>Nilai (Rp) <span className="req">*</span></label><input type="number" min="0" {...ft('nilai')} /></div>
          <div className="field"><label>Catatan</label><input {...ft('catatan')} /></div>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary" onClick={simpanTrx} disabled={busy}>Simpan Transaksi</button>
          <span className="hint">Booking/Closing/Batal meng-update status pipeline otomatis (Batal → Drop). Reserved tidak mengubah status.</span>
        </div>
      </div>}
      <div style={{ marginTop: 16, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
        <button className="btn btn-ghost" style={{ flex: '2 1 240px' }} onClick={() => setShowPw(false) || setShowList(v => !v)}>
          {showList ? '▲ Tutup Daftar' : '▼ Lihat Lead & Hasil Follow Up Saya (' + leads.length + ' lead)'}
        </button>
        <button className="btn btn-ghost" style={{ flex: '1 1 160px' }} onClick={() => setShowList(false) || setShowPw(v => !v)}>
          🔑 Ganti Password
        </button>
      </div>

      {showPw && <div className="card" style={{ marginTop: 12 }}>
        <h2>Ganti Password Saya</h2>
        <div className="form-grid">
          <div className="field"><label>Password Lama</label>
            <input type="password" value={pwOld} onChange={e => setPwOld(e.target.value)} /></div>
          <div className="field"><label>Password Baru (min. 5 karakter)</label>
            <input type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} /></div>
        </div>
        <div className="form-foot">
          <button className="btn btn-primary" disabled={busy} onClick={async () => {
            if (!pwOld || !pwNew) return toast('Isi password lama dan baru');
            setBusy(true);
            try {
              await api('/api/users', { method: 'PUT', body: JSON.stringify({ oldPassword: pwOld, newPassword: pwNew }) });
              toast('Password berhasil diganti — pakai password baru saat login berikutnya');
              setPwOld(''); setPwNew(''); setShowPw(false);
            } catch (e) { toast(e.message); } finally { setBusy(false); }
          }}>Simpan Password Baru</button>
        </div>
      </div>}

      {showList && <div style={{ marginTop: 12 }}>
        <div className="tbl-wrap"><table>
          <thead><tr><th>ID Lead</th><th>Nama</th><th>Status</th><th>FU Terakhir</th><th>Hasil / Next Action</th><th>Next FU</th><th>Aksi</th></tr></thead>
          <tbody>
            {leads.length ? [...leads].reverse().map(l => {
              const myFus = fus.filter(f => f.lead_code === l.lead_code);
              const last = myFus[0];
              const nfu = l.next_fu || (last && last.next_tgl);
              const r = reminder(nfu);
              return <tr key={l.lead_code}>
                <td data-label="ID Lead"><span className="id-tag">{l.lead_code}</span></td>
                <td data-label="Nama"><b>{l.nama}</b>{myFus.length > 0 && <span className="hint"> · {myFus.length}x FU</span>}</td>
                <td data-label="Status"><span className={'badge ' + (BADGE[l.status] || 'b-cold')}>{l.status}</span></td>
                <td data-label="FU Terakhir">{last ? <>{fmtDate(last.tgl)}<br /><span className="hint">{last.detail}</span></> : <span style={{ color: 'var(--muted)' }}>belum ada</span>}</td>
                <td data-label="Hasil / Next Action">{last ? (last.next_action || last.objection || '—') : '—'}</td>
                <td data-label="Next FU">{nfu ? <>{fmtDate(nfu)}{r && <> <span className={'badge ' + r[1]}>{r[0]}</span></>}</> : '—'}</td>
                <td data-label="Aksi"><button className="sort-btn" onClick={() => mulaiEdit(l)}>✏️ Edit</button></td>
              </tr>;
            }) : <tr><td colSpan={7} style={{ textAlign: 'center', color: 'var(--muted)', padding: 24 }}>Belum ada lead — input lead pertama Anda di tab 1.</td></tr>}
          </tbody>
        </table></div>
      </div>}

      <Toast />
    </>
  );
}
