'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

const MENUS = [
  { href: '/dashboard', ico: '◧', label: 'Dashboard', roles: ['manager'] },
  { href: '/form', ico: '✎', label: 'Form Input', roles: ['manager', 'sales'] },
  { href: '/leads', ico: '☰', label: 'Database Lead', roles: ['manager'] },
  { href: '/followup', ico: '↻', label: 'Follow Up', roles: ['manager'] },
  { href: '/booking', ico: '✓', label: 'Booking', roles: ['manager'] },
  { href: '/report', ico: '▤', label: 'Report Sales', roles: ['manager'] },
  { href: '/settings', ico: '⚙', label: 'Settings', roles: ['manager'] },
  { href: '/users', ico: '👥', label: 'Pengguna', roles: ['manager'] },
];

export default function Shell({ user, children }) {
  const path = usePathname();
  const router = useRouter();
  const menus = MENUS.filter(m => m.roles.includes(user.role));

  async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    router.push('/login'); router.refresh();
  }

  return (
    <div className="app">
      <header className="m-topbar">
        <div className="m-logo">CRM<span> SALES</span></div>
        <img src="/logo.png" alt="" />
        <button className="btn-logout" onClick={logout}>{user.name} · Keluar</button>
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
          <button className="btn-logout" onClick={logout}>Keluar</button>
        </div>
      </aside>
      <main className="main">{children}</main>
    </div>
  );
}
