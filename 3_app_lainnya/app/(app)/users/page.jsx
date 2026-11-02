'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import PasswordInput from '@/components/PasswordInput';
import { api, fmtDate } from '@/components/util';

const ROLE_LABEL = {
  administrator: 'administrator', ceogrup: 'CEO', ceo: 'CEO project', headsales: 'head of sales & marketing', salesmanager: 'sales manager', admin: 'admin', markom: 'marcom', sales: 'sales',
  adminsales: 'admin sales', collection: 'collection & kpr',
  finance: 'finance', project: 'admin project', estate: 'estate',
};
const ROLE_LIST = ['administrator', 'ceogrup', 'ceo', 'headsales', 'salesmanager', 'admin', 'markom', 'sales', 'adminsales', 'collection', 'finance', 'project', 'estate'];
const JABATAN = { kadiv: 'Kepala Divisi', budget: 'Budget Control', pceo: 'Project CEO',
  cfo: 'CFO', ceo: 'CEO', finance: 'Finance', treasury: 'Treasury' };
const DIVISI_LIST = ['Sales & Marketing', 'HRGA', 'Finance', 'Legal', 'Project', 'Estate', 'IT', 'Umum'];

const ROLE_STYLE = {
  administrator: { bg: '#0A3B2E', fg: '#FFFFFF' },
  ceo:        { bg: '#1E3F5A', fg: '#FFFFFF' },
  salesmanager: { bg: '#5A3B12', fg: '#FFFFFF' },
  ceogrup:    { bg: '#0F2A22', fg: '#F2C14E' },
  headsales:  { bg: '#7A5414', fg: '#FFFFFF' },
  admin:      { bg: '#EDE4CE', fg: '#6B531C' },
  markom:     { bg: '#F6E3D6', fg: '#8A3F14' },
  sales:      { bg: '#DCEAE2', fg: '#12604B' },
  adminsales: { bg: '#F0E2CE', fg: '#7A4E1F' },
  collection: { bg: '#F6DADA', fg: '#8A2F2F' },
  finance:    { bg: '#E6DCF2', fg: '#5A3E7A' },
  project:    { bg: '#DFEDD6', fg: '#3D6B2E' },
  estate:     { bg: '#D6EBE9', fg: '#2F6E6A' },
};

export default function UsersPage() {
  const [users, setUsers] = useState(null);
  const [gagal, setGagal] = useState('');
  const [f, setF] = useState({ username: '', name: '', role: 'sales', password: '', email: '', wa: '', projects: [] });
  const [daftarProj, setDaftarProj] = useState([]);
  const [edProj, setEdProj] = useState(null); // { id, list } — editor akses project per akun
  const [target, setTarget] = useState(''); // target booking per sales per bulan (Rapor sales)
  useEffect(() => { api('/api/settings').then(s => { setTarget(String(s.target_booking?.n ?? 2)); setDaftarProj(s.project || []); }).catch(() => {}); }, []);
  async function simpanTarget() { try { await api('/api/settings', { method: 'PUT', body: JSON.stringify({ target_booking: Number(target) }) }); toast('Target booking disimpan'); } catch (e) { toast(e.message); } }
  const tukar = (arr, p) => arr.includes(p) ? arr.filter(x => x !== p) : [...arr, p];
  async function simpanProj() {
    try {
      await api('/api/users', { method: 'PATCH', body: JSON.stringify({ id: edProj.id, projects: edProj.list }) });
      toast(edProj.list.length ? 'Akses project disimpan: ' + edProj.list.join(', ') : 'Akses dibuka ke semua project');
      setEdProj(null); load();
    } catch (e) { toast(e.message); }
  }
  const [waEdit, setWaEdit] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () => api('/api/users').then(d => { setUsers(d); setGagal(''); })
    .catch(e => { toast(e.message); setGagal(e.message); });
  useEffect(() => { load(); }, []);

  async function tambah() {
    if (!f.username || !f.name || !f.password) return toast('Username, nama, dan password wajib diisi');
    setBusy(true);
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(f) });
      toast('Akun ' + f.username + ' dibuat');
      setF({ username: '', name: '', role: 'sales', password: '', email: '', wa: '', projects: [] }); load();
    } catch (e) { toast(e.message); } finally { setBusy(false); }
  }
  async function toggle(u) {
    try { await api('/api/users', { method: 'PATCH', body: JSON.stringify({ id: u.id, active: !u.active }) }); load(); }
    catch (e) { toast(e.message); }
  }
  async function setEmail(u) {
    const e = prompt('Alamat email untuk ' + u.name + ' (pengingat FU pagi dikirim ke sini):', u.email || '');
    if (e === null) return;
    try { await api('/api/users', { method: 'PATCH', body: JSON.stringify({ id: u.id, email: e }) }); toast('Email ' + u.name + ' tersimpan'); load(); }
    catch (err) { toast(err.message); }
  }
  async function resetPw(u) {
    const p = prompt('Password baru untuk ' + u.username + ':');
    if (!p) return;
    try { await api('/api/users', { method: 'PATCH', body: JSON.stringify({ id: u.id, password: p }) }); toast('Password ' + u.username + ' diganti'); }
    catch (e) { toast(e.message); }
  }

  if (gagal) return (
    <div className="card" style={{ marginTop: 20 }}>
      <h2>Halaman Pengguna gagal dimuat</h2>
      <div className="note" style={{ marginBottom: 10 }}>{gagal}</div>
      <div className="hint">Halaman ini hanya dapat dibuka oleh Administrator. Bila peran Anda seharusnya
        Administrator namun tetap ditolak, jalankan pembaruan database sekali, lalu keluar dan masuk kembali
        agar sesi memuat peran terbaru.</div>
      <button className="btn btn-primary" style={{ width: 'auto', marginTop: 12 }}
        onClick={() => window.location.reload()}>Muat ulang</button>
    </div>);
  if (!users) return <div className="loading">Memuat…</div>;
  return (
    <>
      <div className="page-head"><div><h1>Pengguna</h1>
        <div className="sub">Peran menentukan akses alur penjualan; Jabatan IOM menentukan wewenang menyetujui pengajuan dana. Keduanya terpisah — satu orang bisa memegang keduanya.</div></div></div>
      <div className="card" style={{ marginBottom: 14, display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 240 }}><b>Target booking per sales</b><div className="hint">Sama untuk semua akun Sales; dipakai di Rapor sales (Beranda Sales, Administrator, CEO). Satuan: unit Booking per bulan.</div></div>
        <input type="number" min="0" max="50" value={target} onChange={e => setTarget(e.target.value)} style={{ width: 90 }} /><span className="hint">unit / bulan</span>
        <button className="btn btn-primary" style={{ width: 'auto' }} onClick={simpanTarget}>Simpan target</button>
      </div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Tambah Akun</h2>
        <div className="form-grid">
          <div className="field"><label>Username</label><input value={f.username} autoCapitalize="none" onChange={e => setF({ ...f, username: e.target.value })} placeholder="mis. putri" /></div>
          <div className="field"><label>Nama (utk Sales/PIC)</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="mis. PUTRI" /></div>
          <div className="field"><label>Peran</label>
            <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
              <optgroup label="Sales & Marketing">
                <option value="sales">Sales — Form Input</option>
                <option value="markom">Marcom — Lead digital, Follow Up, Leads to Sales</option>
                <option value="adminsales">Admin Sales — Verifikasi berkas & dokumen penjualan</option>
              </optgroup>
              <optgroup label="Divisi Pendukung">
                <option value="collection">Collection &amp; KPR — Penagihan, monitoring &amp; proses kredit</option>
                <option value="finance">Finance — Keuangan, legal & komisi</option>
                <option value="project">Admin Project — Persiapan & serah terima unit</option>
                <option value="estate">Estate — Pengelolaan penghuni pasca serah terima</option>
              </optgroup>
              <optgroup label="Manajemen">
                <option value="admin">Admin — Lihat data (Dashboard, Booking, Stock)</option>
                <option value="ceogrup">CEO — semua project: lead, visitor, penjualan, collection & KPR, stok, price list, IOM</option>
                <option value="ceo">CEO Project — hanya project yang dibawahi</option>
                <option value="headsales">Head of Sales &amp; Marketing — sales, marcom, administrasi, collection &amp; KPR</option>
                <option value="salesmanager">Sales Manager — sales, administrasi, collection &amp; KPR (tanpa marcom)</option>
                <option value="administrator">Administrator — akses penuh</option>
              </optgroup>
            </select></div>
          {!['administrator', 'ceogrup'].includes(f.role) && <div className="field full"><label>Akses project <span className="hint">(kosong = semua project)</span></label>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', paddingTop: 4 }}>
              {daftarProj.map(p => (<label key={p} style={{ display: 'flex', gap: 6, alignItems: 'center', fontSize: 13.5, textTransform: 'none', letterSpacing: 0, fontWeight: 600 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={(f.projects || []).includes(p)} onChange={() => setF({ ...f, projects: tukar(f.projects || [], p) })} />{p}</label>))}
            </div></div>}
          <div className="field"><label>Password</label>
            <PasswordInput value={f.password} onChange={e => setF({ ...f, password: e.target.value })}
              autoComplete="new-password" placeholder="min. 6 karakter" /></div>
          <div className="field"><label>Email (utk pengingat FU)</label><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="nama@gmail.com" /></div>
          <div className="field"><label>No. WhatsApp <span className="hint">(utk Leads to Sales)</span></label><input value={f.wa} onChange={e => setF({ ...f, wa: e.target.value })} placeholder="08xxxxxxxxxx" /></div>
        </div>
        <div className="form-foot"><button className="btn btn-primary" onClick={tambah} disabled={busy}>Tambah Akun</button></div>
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Username</th><th>Nama</th><th>Email</th><th>No. WA</th><th>Password</th><th>Peran</th><th>Project</th><th>Jabatan IOM</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
        <tbody>
          {users.map(u => (
            <tr key={u.id}>
              <td data-label="Username"><b>{u.username}</b></td>
              <td data-label="Nama">{u.name}</td>
              <td data-label="Email">{u.email || <span style={{ color: 'var(--red)' }}>belum diisi</span>}</td>
              <td data-label="No. WA">{u.wa || <span style={{ color: 'var(--red)' }}>—</span>}
                <button className="sort-btn" style={{ marginLeft: 6, padding: '1px 7px' }} onClick={async () => {
                  const w = prompt('Nomor WhatsApp untuk ' + u.name + ' (dipakai fitur Leads to Sales):', u.wa || '');
                  if (w === null) return;
                  try { await api('/api/users', { method: 'PATCH', body: JSON.stringify({ id: u.id, wa: w }) }); toast('No. WA ' + u.name + ' tersimpan'); load(); }
                  catch (er) { toast(er.message); }
                }}>✎</button></td>
              <td data-label="Password">{u.password_plain ? <code>{u.password_plain}</code> : <span className="hint">tersembunyi — Reset utk melihat</span>}</td>
              <td data-label="Peran"><span className="badge" style={{ background: (ROLE_STYLE[u.role] || ROLE_STYLE.sales).bg, color: (ROLE_STYLE[u.role] || ROLE_STYLE.sales).fg }}>{ROLE_LABEL[u.role] || u.role}</span></td>
              <td data-label="Project">
                {['administrator', 'ceogrup'].includes(u.role) ? <span className="hint">Semua project</span>
                  : edProj && edProj.id === u.id ? (
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                      {daftarProj.map(p => (<label key={p} style={{ display: 'flex', gap: 4, alignItems: 'center', fontSize: 12.5 }}>
                        <input type="checkbox" style={{ width: 'auto' }} checked={edProj.list.includes(p)} onChange={() => setEdProj({ ...edProj, list: tukar(edProj.list, p) })} />{p}</label>))}
                      <button className="sort-btn" style={{ padding: '1px 8px' }} onClick={simpanProj}>Simpan</button>
                      <button className="sort-btn" style={{ padding: '1px 8px' }} onClick={() => setEdProj(null)}>Batal</button>
                    </div>
                  ) : (<span style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                    {(u.projects && u.projects.length) ? u.projects.map(p => <span key={p} className="badge b-new">{p}</span>) : <span className="hint">Semua project</span>}
                    <button className="sort-btn" style={{ padding: '1px 7px' }} aria-label={'Atur project ' + u.name} onClick={() => setEdProj({ id: u.id, list: u.projects || [] })}>✎</button>
                  </span>)}
              </td>
              <td data-label="Jabatan IOM">
                {u.jabatan
                  ? <span className="badge" style={{ background: '#E6DCF2', color: '#5A3E7A' }}>{JABATAN[u.jabatan] || u.jabatan}</span>
                  : <span className="hint">—</span>}
                {u.divisi && <div className="hint" style={{ margin: 0 }}>{u.divisi}</div>}
              </td>
              <td data-label="Status"><span className={'badge ' + (u.active ? 'b-upcoming' : 'b-lost')}>{u.active ? 'Aktif' : 'Nonaktif'}</span></td>
              <td data-label="Dibuat">{fmtDate(u.created_at)}</td>
              <td data-label="Aksi">
                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="sort-btn" onClick={() => setEmail(u)}>Set Email</button>
                  <button className="sort-btn" onClick={() => resetPw(u)}>Reset Password</button>
                  <button className={'sort-btn'} onClick={() => toggle(u)}>{u.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  <button className="sort-btn" onClick={async () => {
                    const daftar = Object.entries(JABATAN).map(([k, v]) => k + ' = ' + v).join('\n');
                    const r = prompt('Jabatan IOM untuk ' + u.name + ' (kosongkan untuk menghapus):\n\n' + daftar,
                      u.jabatan || '');
                    if (r === null) return;
                    const j = r.trim().toLowerCase();
                    if (j && !JABATAN[j]) return toast('Jabatan tidak dikenal: ' + r);
                    try {
                      await api('/api/users', { method: 'PATCH', body: JSON.stringify({ id: u.id, jabatan: j }) });
                      toast(j ? 'Jabatan diperbarui' : 'Jabatan dihapus'); load();
                    } catch (e) { toast(e.message); }
                  }}>⚖ Jabatan</button>
                  <button className="sort-btn" onClick={async () => {
                    const r = prompt('Divisi asal ' + u.name + ' (untuk penomoran IOM):\n\n' + DIVISI_LIST.join(', '),
                      u.divisi || '');
                    if (r === null) return;
                    try {
                      await api('/api/users', { method: 'PATCH', body: JSON.stringify({ id: u.id, divisi: r.trim() }) });
                      toast('Divisi diperbarui'); load();
                    } catch (e) { toast(e.message); }
                  }}>🏢 Divisi</button>
                  <button className="sort-btn" onClick={async () => {
                    const r = prompt('Peran baru untuk ' + u.name + ' — ketik salah satu:\n\nsales / marcom / adminsales / collection / finance / project / estate / admin / ceogrup / ceo / headsales / salesmanager / administrator', ROLE_LABEL[u.role] === 'marcom' ? 'marcom' : u.role);
                    if (!r) return;
                    const role = r.trim().toLowerCase().replace(/\s+/g, '').replace('marcom', 'markom').replace('adminproject', 'project').replace('kpr', 'collection');
                    if (!ROLE_LIST.includes(role)) return toast('Peran tidak dikenal: ' + r);
                    try { await api('/api/users', { method: 'PATCH', body: JSON.stringify({ id: u.id, role }) }); toast('Peran ' + u.name + ' → ' + role); load(); }
                    catch (er) { toast(er.message); }
                  }}>⇄ Peran</button>
                  <button className="sort-btn" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={async () => {
                    if (!confirm('Hapus akun ' + u.name + ' (' + u.username + ')?\n\nAkun tidak bisa login lagi. Riwayat lead, follow up, dan transaksi atas nama ini TETAP tersimpan.')) return;
                    try { await api('/api/users?id=' + u.id, { method: 'DELETE' }); toast('Akun ' + u.name + ' dihapus'); load(); }
                    catch (er) { toast(er.message); }
                  }}>🗑 Hapus</button>
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table></div>
      <Toast />
    </>
  );
}
