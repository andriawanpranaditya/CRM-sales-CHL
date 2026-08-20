'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const r = useRouter();
  const [username, setU] = useState('');
  const [password, setP] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e) {
    e.preventDefault(); setErr(''); setBusy(true);
    const res = await fetch('/api/auth/login', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    const d = await res.json(); setBusy(false);
    if (!res.ok) { setErr(d.error || 'Gagal login'); return; }
    r.push(d.user.role === 'sales' ? '/form' : '/dashboard');
    r.refresh();
  }

  return (
    <div className="login">
      <form className="login-card" onSubmit={submit}>
        <div className="login-brand">
          <img src="/logo.png" alt="CHL" />
          <div className="logo">CRM<span> SALES</span></div>
          <small>Cipta Harmoni Lestari</small>
        </div>
        <div className="login-sub">Masuk dengan akun Anda</div>
        {err && <div className="login-err">{err}</div>}
        <div className="field">
          <label>Username</label>
          <input value={username} onChange={e => setU(e.target.value)} autoFocus autoCapitalize="none" />
        </div>
        <div className="field">
          <label>Password</label>
          <input type="password" value={password} onChange={e => setP(e.target.value)} />
        </div>
        <button className="btn btn-primary login-btn" disabled={busy}>{busy ? 'Memeriksa...' : 'Masuk'}</button>
        <div className="login-foot">Akun dibuat oleh Manager di menu Pengguna.<br />Sales otomatis hanya melihat Form Input.</div>
      </form>
    </div>
  );
}
