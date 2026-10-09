'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate } from '@/components/util';

export default function UsersPage() {
  const [users, setUsers] = useState(null);
  const [f, setF] = useState({ username: '', name: '', role: 'sales', password: '', email: '', wa: '', projects: [] });
  const [daftarProj, setDaftarProj] = useState([]);
  const [edProj, setEdProj] = useState(null); // { id, list } — editor akses project per akun
  const [waEdit, setWaEdit] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () => api('/api/users').then(setUsers).catch(e => toast(e.message));
  useEffect(() => { load(); api('/api/settings').then(s => setDaftarProj(s.project || [])).catch(() => {}); }, []);
  const tukar = (arr, p) => arr.includes(p) ? arr.filter(x => x !== p) : [...arr, p];
  async function simpanProj() {
    try {
      await api('/api/users', { method: 'PATCH', body: JSON.stringify({ id: edProj.id, projects: edProj.list }) });
      toast(edProj.list.length ? 'Akses project disimpan: ' + edProj.list.join(', ') : 'Akses dibuka ke semua project');
      setEdProj(null); load();
    } catch (e) { toast(e.message); }
  }

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

  if (!users) return <div className="loading">Memuat…</div>;
  return (
    <>
      <div className="page-head"><div><h1>Pengguna</h1>
        <div className="sub">Akun sales otomatis muncul di dropdown Sales / PIC. Akses project membatasi semua menu akun itu (lead, follow up, Reserved/Booking, Master Stock, laporan) hanya ke project yang dicentang.</div></div></div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Tambah Akun</h2>
        <div className="form-grid">
          <div className="field"><label>Username</label><input value={f.username} autoCapitalize="none" onChange={e => setF({ ...f, username: e.target.value })} placeholder="mis. putri" /></div>
          <div className="field"><label>Nama (utk Sales/PIC)</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="mis. PUTRI" /></div>
          <div className="field"><label>Peran</label>
            <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
              <option value="sales">Sales — Form Input saja</option>
              <option value="admin">Admin — Dashboard, Booking, Master Stock</option>
              <option value="markom">Marcom — Lead digital, Follow Up, Leads to Sales</option>
              <option value="ceo">CEO Project — semua menu kecuali Settings/Pengguna/Log, tanpa hapus</option>
              <option value="manager">Manager — akses penuh</option>
            </select></div>
          <div className="field"><label>Password</label><input value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></div>
          <div className="field"><label>Email (utk pengingat FU)</label><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="nama@gmail.com" /></div>
          <div className="field"><label>No. WhatsApp <span className="hint">(utk Leads to Sales)</span></label><input value={f.wa} onChange={e => setF({ ...f, wa: e.target.value })} placeholder="08xxxxxxxxxx" /></div>
          {f.role !== 'manager' && <div className="field full"><label>Akses project <span className="hint">(tidak dicentang = semua project)</span></label>
            <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', paddingTop: 4 }}>
              {daftarProj.map(p => (<label key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontWeight: 600, textTransform: 'none', letterSpacing: 0 }}>
                <input type="checkbox" style={{ width: 'auto' }} checked={f.projects.includes(p)} onChange={() => setF({ ...f, projects: tukar(f.projects, p) })} />{p}</label>))}
            </div></div>}
        </div>
        <div className="form-foot"><button className="btn btn-primary" onClick={tambah} disabled={busy}>Tambah Akun</button></div>
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Username</th><th>Nama</th><th>Email</th><th>No. WA</th><th>Password</th><th>Peran</th><th>Project</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
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
              <td data-label="Peran"><span className={'badge ' + (u.role === 'manager' ? 'b-close' : u.role === 'admin' ? 'b-warm' : 'b-book')} style={u.role === 'markom' ? { background: 'var(--blue-soft)', color: 'var(--blue)' } : u.role === 'ceo' ? { background: 'var(--brass-soft)', color: 'var(--brass-deep)' } : undefined}>{u.role === 'markom' ? 'marcom' : u.role === 'ceo' ? 'CEO Project' : u.role}</span></td>
              <td data-label="Project">
                {u.role === 'manager' ? <span className="hint">Semua (manager)</span>
                  : edProj && edProj.id === u.id ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {daftarProj.map(p => (<label key={p} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, fontWeight: 600 }}>
                        <input type="checkbox" checked={edProj.list.includes(p)} onChange={() => setEdProj({ ...edProj, list: tukar(edProj.list, p) })} />{p}</label>))}
                      <span className="hint">Tidak dicentang = semua project</span>
                      <span style={{ display: 'inline-flex', gap: 6 }}>
                        <button className="sort-btn active" onClick={simpanProj}>Simpan</button>
                        <button className="sort-btn" onClick={() => setEdProj(null)}>Batal</button></span>
                    </div>)
                  : (<span style={{ display: 'inline-flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                    {(u.projects && u.projects.length) ? u.projects.map(p => <span key={p} className="badge b-new">{p}</span>) : <span className="hint">Semua project</span>}
                    <button className="sort-btn" style={{ padding: '1px 7px' }} aria-label={'Atur project ' + u.name} onClick={() => setEdProj({ id: u.id, list: u.projects || [] })}>✎</button>
                  </span>)}
              </td>
              <td data-label="Status"><span className={'badge ' + (u.active ? 'b-upcoming' : 'b-lost')}>{u.active ? 'Aktif' : 'Nonaktif'}</span></td>
              <td data-label="Dibuat">{fmtDate(u.created_at)}</td>
              <td data-label="Aksi">
                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="sort-btn" onClick={() => setEmail(u)}>Set Email</button>
                  <button className="sort-btn" onClick={() => resetPw(u)}>Reset Password</button>
                  <button className={'sort-btn'} onClick={() => toggle(u)}>{u.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  <button className="sort-btn" onClick={async () => {
                    const r = prompt('Peran baru untuk ' + u.name + ' — ketik salah satu: sales / admin / marcom / ceo / manager', u.role === 'markom' ? 'marcom' : u.role);
                    if (!r) return;
                    const role = r.trim().toLowerCase().replace('marcom', 'markom');
                    if (!['sales', 'admin', 'markom', 'ceo', 'manager'].includes(role)) return toast('Peran tidak dikenal: ' + r);
                    try { await api('/api/users', { method: 'PATCH', body: JSON.stringify({ id: u.id, role }) }); toast('Peran ' + u.name + ' → ' + role); load(); }
                    catch (er) { toast(er.message); }
                  }}>⇄ Peran</button>
                  <button className="sort-btn" style={{ color: 'var(--red)', borderColor: 'var(--red)' }} onClick={async () => {
                    if (!confirm('Hapus akun ' + u.name + ' (' + u.username + ')?\n\nAkun tidak bisa login lagi. Riwayat lead, follow up, dan transaksi atas nama ini TETAP tersimpan.')) return;
                    try { const r = await api('/api/users?id=' + u.id, { method: 'DELETE' }); toast(r.dinonaktifkan ? r.pesan : 'Akun ' + u.name + ' dihapus'); load(); }
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
