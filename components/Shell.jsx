'use client';
import Link from 'next/link';
import ReminderBell from '@/components/ReminderBell';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const MENUS = [
  { href: '/dashboard', ico: '◧', label: 'Dashboard', roles: ['manager'] },
  { href: '/form', ico: '✎', label: 'Form Input', roles: ['manager', 'sales'] },
  { href: '/leads', ico: '☰', label: 'Database Lead', roles: ['manager'] },
  { href: '/followup', ico: '↻', label: 'Follow Up', roles: ['manager'] },
  { href: '/booking', ico: '✓', label: 'Booking', roles: ['manager'] },
  { href: '/report', ico: '▤', label: 'Report Sales', roles: ['manager'] },
  { href: '/stock', ico: '🗺', label: 'Master Stock', roles: ['manager', 'sales'] },
  { href: '/settings', ico: '⚙', label: 'Settings', roles: ['manager'] },
  { href: '/users', ico: '👥', label: 'Pengguna', roles: ['manager'] },
];

export default function Shell({ user, children }) {
  const path = usePathname();
  const router = useRouter();
  const menus = MENUS.filter(m => m.roles.includes(user.role));

  useEffect(() => {
    if (user.role === 'sales' && !path.startsWith('/form') && !path.startsWith('/stock')) router.replace('/form');
  }, [path, user.role, router]);

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login'); router.refresh();
  }

  async function gantiPassword() {
    const lama = prompt('Password lama:');
    if (lama === null || lama === '') return;
    const baru = prompt('Password baru (min. 6 karakter):');
    if (baru === null || baru === '') return;
    const res = await fetch('/api/auth/password', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lama, baru }),
    });
    const d = await res.json().catch(() => ({}));
    alert(res.ok ? 'Password berhasil diganti. Gunakan password baru saat login berikutnya.' : (d.error || 'Gagal mengganti password'));
  }

  return (
    <div className="app">
      <header className="m-topbar">
        <div className="m-logo">CRM<span> SALES</span></div>
        <img src="/logo.png" alt="" />
        <span style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <ReminderBell user={user} />
          <button className="btn-logout" onClick={gantiPassword} title="Ganti password">🔑</button>
          <button className="btn-logout" onClick={logout}>{user.name} · Keluar</button>
        </span>
      </header>
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="CHL" />
          <div className="logo">CRM<span> SALES</span></div>
          <small>Cipta Harmoni Lestari</small>
        </div>
        <nav className="nav">
          {menus.map(m => (
            <Link key={m.href} href={m.href} className={path.startsWith(m.href) ? 'active' : ''}>
              <span className="ico">{m.ico}</span><span>{m.label}</span>
            </Link>
          ))}
        </nav>
        <div className="side-foot">
          <span><span className="u-name">{user.name}</span>
            <span className="u-role">{user.role === 'manager' ? 'Manager — Akses Penuh' : 'Sales — Form Input'}</span></span>
          <span style={{ display: 'flex', gap: 4 }}>
            <button className="btn-logout" onClick={gantiPassword} title="Ganti password">🔑</button>
            <button className="btn-logout" onClick={logout}>Keluar</button>
          </span>
        </div>
      </aside>
      <main className="main">
        <div className="bell-desktop"><ReminderBell user={user} /></div>
        {children}
        <div className="copyright">copyright &copy; 2026 by Andriawanp</div>
      </main>
    </div>
  );
}
