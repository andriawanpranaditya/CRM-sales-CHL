'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import PasswordInput from '@/components/PasswordInput';

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
    r.push('/beranda');
    r.refresh();
  }

  return (
    <div className="login">
      {/* Panel identitas — di layar sempit menyatu di atas formulir */}
      <div className="login-art">
        <img src="/logo.png" alt="Cipta Harmoni Lestari" />
        <div className="login-title">Harmoni <em>One</em></div>
        <div className="login-co">PT Cipta Harmoni Lestari</div>
      </div>

      <div className="login-panel">
        <form className="login-form" onSubmit={submit}>
          <h1>Masuk ke akun Anda</h1>
          <div className="login-sub">Gunakan akun divisi yang diberikan Manager.</div>
          {err && <div className="login-err">{err}</div>}
          <div className="field">
            <label>Username</label>
            <input value={username} onChange={e => setU(e.target.value)} autoFocus
              autoCapitalize="none" autoCorrect="off" spellCheck="false" autoComplete="username" />
          </div>
          <div className="field">
            <label>Password</label>
            <PasswordInput value={password} onChange={e => setP(e.target.value)}
              autoComplete="current-password" />
          </div>
          <button className="btn btn-primary login-btn" disabled={busy}>{busy ? 'Memeriksa…' : 'Masuk'}</button>
          <div className="login-foot">Lupa password? Hubungi Manager di menu Pengguna.</div>
          <div className="copyright" style={{ marginTop: 14 }}>copyright &copy; 2026 by Andriawanp</div>
        </form>
      </div>
    </div>
  );
}
