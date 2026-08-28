'use client';
import { useEffect, useState } from 'react';
import Toast, { toast } from '@/components/Toast';
import { api, fmtDate } from '@/components/util';

export default function UsersPage() {
  const [users, setUsers] = useState(null);
  const [f, setF] = useState({ username: '', name: '', role: 'sales', password: '', email: '', wa: '' });
  const [waEdit, setWaEdit] = useState({});
  const [busy, setBusy] = useState(false);

  const load = () => api('/api/users').then(setUsers).catch(e => toast(e.message));
  useEffect(() => { load(); }, []);

  async function tambah() {
    if (!f.username || !f.name || !f.password) return toast('Username, nama, dan password wajib diisi');
    setBusy(true);
    try {
      await api('/api/users', { method: 'POST', body: JSON.stringify(f) });
      toast('Akun ' + f.username + ' dibuat');
      setF({ username: '', name: '', role: 'sales', password: '', email: '', wa: '' }); load();
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
        <div className="sub">Akun sales otomatis muncul di dropdown Sales / PIC. Sales hanya bisa membuka Form Input.</div></div></div>
      <div className="card" style={{ marginBottom: 14 }}>
        <h2>Tambah Akun</h2>
        <div className="form-grid">
          <div className="field"><label>Username</label><input value={f.username} autoCapitalize="none" onChange={e => setF({ ...f, username: e.target.value })} placeholder="mis. putri" /></div>
          <div className="field"><label>Nama (utk Sales/PIC)</label><input value={f.name} onChange={e => setF({ ...f, name: e.target.value })} placeholder="mis. PUTRI" /></div>
          <div className="field"><label>Peran</label>
            <select value={f.role} onChange={e => setF({ ...f, role: e.target.value })}>
              <option value="sales">Sales — Form Input saja</option>
              <option value="admin">Admin — Dashboard, Booking, Master Stock</option>
              <option value="markom">Markom — Lead digital, Follow Up, Leads to Sales</option>
              <option value="manager">Manager — akses penuh</option>
            </select></div>
          <div className="field"><label>Password</label><input value={f.password} onChange={e => setF({ ...f, password: e.target.value })} /></div>
          <div className="field"><label>Email (utk pengingat FU)</label><input type="email" value={f.email} onChange={e => setF({ ...f, email: e.target.value })} placeholder="nama@gmail.com" /></div>
          <div className="field"><label>No. WhatsApp <span className="hint">(utk Leads to Sales)</span></label><input value={f.wa} onChange={e => setF({ ...f, wa: e.target.value })} placeholder="08xxxxxxxxxx" /></div>
        </div>
        <div className="form-foot"><button className="btn btn-primary" onClick={tambah} disabled={busy}>Tambah Akun</button></div>
      </div>
      <div className="tbl-wrap"><table>
        <thead><tr><th>Username</th><th>Nama</th><th>Email</th><th>No. WA</th><th>Password</th><th>Peran</th><th>Status</th><th>Dibuat</th><th>Aksi</th></tr></thead>
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
              <td data-label="Peran"><span className={'badge ' + (u.role === 'manager' ? 'b-close' : u.role === 'admin' ? 'b-warm' : 'b-book')} style={u.role === 'markom' ? { background: '#E5EEF6', color: '#28527A' } : undefined}>{u.role}</span></td>
              <td data-label="Status"><span className={'badge ' + (u.active ? 'b-upcoming' : 'b-lost')}>{u.active ? 'Aktif' : 'Nonaktif'}</span></td>
              <td data-label="Dibuat">{fmtDate(u.created_at)}</td>
              <td data-label="Aksi">
                <span style={{ display: 'inline-flex', gap: 6, flexWrap: 'wrap' }}>
                  <button className="sort-btn" onClick={() => setEmail(u)}>Set Email</button>
                  <button className="sort-btn" onClick={() => resetPw(u)}>Reset Password</button>
                  <button className={'sort-btn'} onClick={() => toggle(u)}>{u.active ? 'Nonaktifkan' : 'Aktifkan'}</button>
                  <button className="sort-btn" onClick={async () => {
                    const r = prompt('Peran baru untuk ' + u.name + ' — ketik salah satu: sales / admin / markom / manager', u.role);
                    if (!r) return;
                    const role = r.trim().toLowerCase();
                    if (!['sales', 'admin', 'markom', 'manager'].includes(role)) return toast('Peran tidak dikenal: ' + r);
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
