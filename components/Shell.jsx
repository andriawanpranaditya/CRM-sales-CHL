'use client';
import Link from 'next/link';
import ReminderBell from '@/components/ReminderBell';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const MENUS = [
  { href: '/dashboard', ico: '◧', label: 'Dashboard', roles: ['manager', 'admin', 'markom'] },
  { href: '/form', ico: '✎', label: 'Form Input', roles: ['manager', 'sales', 'markom'] },
  { href: '/leads', ico: '☰', label: 'Database Lead', roles: ['manager', 'markom', 'sales'] },

  { href: '/booking', ico: '✓', label: 'Booking', roles: ['manager', 'admin', 'markom'] },
  { href: '/report', ico: '▤', label: 'Report Sales', roles: ['manager'] },
  { href: '/kegiatan', ico: '📣', label: 'Kegiatan', roles: ['manager', 'admin', 'markom', 'sales'] },
  { href: '/stock', ico: '🗺', label: 'Master Stock', roles: ['manager', 'admin', 'markom', 'sales'] },
  { href: '/kpr', ico: '🧮', label: 'Simulasi Cara Bayar', roles: ['manager', 'admin', 'markom', 'sales'] },
  { href: '/settings', ico: '⚙', label: 'Settings', roles: ['manager'] },
  { href: '/users', ico: '👥', label: 'Pengguna', roles: ['manager'] },
];

export default function Shell({ user, children }) {
  const path = usePathname();
  const router = useRouter();
  const menus = MENUS.filter(m => m.roles.includes(user.role));

  useEffect(() => {
    if (path.startsWith('/followup')) { router.replace('/leads'); return; }
    if (user.role === 'sales' && !path.startsWith('/form') && !path.startsWith('/stock') && !path.startsWith('/kpr') && !path.startsWith('/leads') && !path.startsWith('/kegiatan')) router.replace('/form');
    if (user.role === 'admin' && !path.startsWith('/dashboard') && !path.startsWith('/booking') && !path.startsWith('/stock') && !path.startsWith('/kpr') && !path.startsWith('/kegiatan')) router.replace('/dashboard');
    if (user.role === 'markom' && !path.startsWith('/dashboard') && !path.startsWith('/form') && !path.startsWith('/leads') && !path.startsWith('/followup') && !path.startsWith('/booking') && !path.startsWith('/stock') && !path.startsWith('/kpr') && !path.startsWith('/kegiatan')) router.replace('/form');
  }, [path, user.role, router]);

  // Bersih otomatis: penanda notifikasi/suara harian yang berumur > 7 hari
  useEffect(() => {
    try {
      const batas = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      Object.keys(localStorage).forEach(k => {
        const m = k.match(/^crm_(notif|chime)_(\d{4}-\d{2}-\d{2})/);
        if (m && m[2] < batas) localStorage.removeItem(k);
      });
    } catch {}
  }, []);

  // Tombol darurat: hapus cache aplikasi di perangkat lalu muat versi terbaru (login & data CRM tetap aman)
  async function segarkanAplikasi() {
    if (!confirm('Segarkan aplikasi?\n\nCache aplikasi di perangkat ini dihapus lalu versi terbaru dimuat ulang. Login dan data CRM tidak terpengaruh.')) return;
    try {
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        regs.forEach(r => { try { r.active && r.active.postMessage('bersihkan'); r.update(); } catch {} });
      }
      if (window.caches) { const ks = await caches.keys(); await Promise.all(ks.map(k => caches.delete(k))); }
    } catch {}
    window.location.reload();
  }

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
          <button className="btn-logout" onClick={segarkanAplikasi} title="Segarkan aplikasi (bersihkan cache)">🧹</button>
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
            <span className="u-role">{user.role === 'manager' ? 'Manager — Akses Penuh' : user.role === 'admin' ? 'Admin — Lihat Data' : user.role === 'markom' ? 'Marcom — Lead Digital' : 'Sales — Form Input'}</span></span>
          <span style={{ display: 'flex', gap: 4 }}>
            <button className="btn-logout" onClick={segarkanAplikasi} title="Segarkan aplikasi (bersihkan cache)">🧹</button>
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
