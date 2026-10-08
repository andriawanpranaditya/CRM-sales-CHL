'use client';
import Link from 'next/link';
import ReminderBell from '@/components/ReminderBell';
import BusyIndicator from '@/components/BusyIndicator';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const MENUS = [
  { href: '/beranda', ico: '⌂', label: 'Beranda', roles: ['markom', 'sales'] },
  { href: '/dashboard', ico: '◧', label: 'Dashboard', roles: ['manager', 'ceo', 'admin', 'markom'] },
  { href: '/form', ico: '✎', label: 'Form Input', roles: ['manager', 'ceo', 'sales', 'markom'] },
  { href: '/leads', ico: '☰', label: 'Database Lead', roles: ['manager', 'ceo', 'markom', 'sales'] },

  { href: '/booking', ico: '✓', label: 'Booking', roles: ['manager', 'ceo', 'admin', 'markom'] },
  { href: '/report', ico: '▤', label: 'Report Sales', roles: ['manager', 'ceo'] },
  { href: '/marcom', ico: '📊', label: 'Analisa Marcom', roles: ['manager', 'ceo', 'markom'] },
  { href: '/kegiatan', ico: '📣', label: 'Kegiatan', roles: ['manager', 'ceo', 'admin', 'markom', 'sales'] },
  { href: '/stock', ico: '🗺', label: 'Master Stock', roles: ['manager', 'ceo', 'admin', 'markom', 'sales'] },
  { href: '/kpr', ico: '🧮', label: 'Simulasi Cara Bayar', roles: ['manager', 'ceo', 'admin', 'markom', 'sales'] },
  { href: '/ai-asisten', ico: '🤖', label: 'Asisten AI', roles: ['manager', 'ceo', 'markom'] },
  { href: '/settings', ico: '⚙', label: 'Settings', roles: ['manager'] },
  { href: '/users', ico: '👥', label: 'Pengguna', roles: ['manager'] },
  { href: '/log', ico: '🕘', label: 'Log Aktivitas', roles: ['manager'] },
];

const IkonMatahari = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
const IkonBulan = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>);

// Tema aktif: pilihan user (data-theme di <html>) atau, bila belum memilih, setelan terang/gelap perangkat
function temaAktif() {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

export default function Shell({ user, children }) {
  const path = usePathname();
  const router = useRouter();
  const menus = MENUS.filter(m => m.roles.includes(user.role));

  // ===== Mode terang / gelap — per user, tersimpan di akun =====
  const [tema, setTema] = useState('light');
  useEffect(() => {
    setTema(temaAktif());
    // Selaraskan dengan pilihan yang tersimpan di akun (mis. baru diganti dari perangkat lain)
    fetch('/api/tema', { cache: 'no-store' }).then(r => r.ok ? r.json() : null).then(d => {
      if (!d) return;
      const sekarang = document.documentElement.dataset.theme || '';
      if ((d.tema || '') !== sekarang) {
        if (d.tema) document.documentElement.dataset.theme = d.tema; else delete document.documentElement.dataset.theme;
        document.cookie = d.tema ? `crm_tema=${d.tema}; path=/; max-age=31536000; samesite=lax` : 'crm_tema=; path=/; max-age=0';
        setTema(temaAktif());
      }
    }).catch(() => {});
    // Belum memilih → ikut perubahan setelan perangkat secara langsung
    const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
    const ikut = () => { if (!document.documentElement.dataset.theme) setTema(temaAktif()); };
    mq && mq.addEventListener && mq.addEventListener('change', ikut);
    return () => { mq && mq.removeEventListener && mq.removeEventListener('change', ikut); };
  }, []);
  function pilihTema(t) {
    document.documentElement.dataset.theme = t;
    document.cookie = `crm_tema=${t}; path=/; max-age=31536000; samesite=lax`;
    setTema(t);
    fetch('/api/tema', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ tema: t }) }).catch(() => {});
  }

  useEffect(() => {
    if (path.startsWith('/followup')) { router.replace('/leads'); return; }
    if (user.role === 'sales' && !path.startsWith('/beranda') && !path.startsWith('/form') && !path.startsWith('/stock') && !path.startsWith('/kpr') && !path.startsWith('/leads') && !path.startsWith('/kegiatan')) router.replace('/beranda');
    if (user.role === 'admin' && !path.startsWith('/dashboard') && !path.startsWith('/booking') && !path.startsWith('/stock') && !path.startsWith('/kpr') && !path.startsWith('/kegiatan')) router.replace('/dashboard');
    // CEO Project: semua menu kecuali Settings, Pengguna & Log Aktivitas
    if (user.role === 'ceo' && (path.startsWith('/settings') || path.startsWith('/users') || path.startsWith('/log'))) router.replace('/dashboard');
    if (user.role === 'markom' && !path.startsWith('/beranda') && !path.startsWith('/dashboard') && !path.startsWith('/form') && !path.startsWith('/leads') && !path.startsWith('/followup') && !path.startsWith('/booking') && !path.startsWith('/stock') && !path.startsWith('/kpr') && !path.startsWith('/kegiatan') && !path.startsWith('/marcom') && !path.startsWith('/ai-asisten')) router.replace('/beranda');
  }, [path, user.role, router]);

  // Log akses: setiap halaman yang dibuka dicatat (server menghitung halaman sama dalam 10 menit sekali).
  // Bila akun sudah dinonaktifkan manager, sesi diakhiri dan user diarahkan ke halaman login.
  useEffect(() => {
    let pwa = false;
    try { pwa = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch {}
    fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ halaman: path, pwa }) })
      .then(r => { if (r.status === 401) { router.push('/login?nonaktif=1'); router.refresh(); } })
      .catch(() => {});
  }, [path]); // eslint-disable-line

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
    const baru = prompt('Password baru (min. 5 karakter):');
    if (baru === null || baru === '') return;
    const res = await fetch('/api/users', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ oldPassword: lama, newPassword: baru }),
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
          <button className="theme-btn" onClick={() => pilihTema(tema === 'dark' ? 'light' : 'dark')}
            aria-label={tema === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'} title={tema === 'dark' ? 'Mode terang' : 'Mode gelap'}>
            {tema === 'dark' ? <IkonMatahari /> : <IkonBulan />}</button>
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
        <div className="side-theme">
          <div className="theme-switch" role="group" aria-label="Tema tampilan">
            <button aria-pressed={tema === 'light'} onClick={() => pilihTema('light')}><IkonMatahari />Terang</button>
            <button aria-pressed={tema === 'dark'} onClick={() => pilihTema('dark')}><IkonBulan />Gelap</button>
          </div>
        </div>
        <div className="side-foot">
          <span><span className="u-name">{user.name}</span>
            <span className="u-role">{user.role === 'manager' ? 'Manager — Akses Penuh' : user.role === 'ceo' ? 'CEO Project — Pantau & Input' : user.role === 'admin' ? 'Admin — Lihat Data' : user.role === 'markom' ? 'Marcom — Lead Digital' : 'Sales — Form Input'}</span></span>
          <span style={{ display: 'flex', gap: 4 }}>
            <button className="btn-logout" onClick={segarkanAplikasi} title="Segarkan aplikasi (bersihkan cache)">🧹</button>
            <button className="btn-logout" onClick={gantiPassword} title="Ganti password">🔑</button>
            <button className="btn-logout" onClick={logout}>Keluar</button>
          </span>
        </div>
      </aside>
      <main className="main">
        <div className="bell-desktop"><ReminderBell user={user} /></div>
        <BusyIndicator />
        {children}
        <div className="copyright">copyright &copy; 2026 by Andriawanp</div>
      </main>
    </div>
  );
}
