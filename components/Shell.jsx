'use client';
import { bolehPresentasi } from '@/lib/presentasi';
import Link from 'next/link';
import ReminderBell from '@/components/ReminderBell';
import { PopupPengingat } from '@/components/TargetSales';
import PushNotif from '@/components/PushNotif';
import BusyIndicator from '@/components/BusyIndicator';
import IkonMenu from '@/components/IkonMenu';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';

const MENUS = [
  { href: '/beranda', ico: '⌂', label: 'Beranda', roles: ['manager', 'ceo', 'markom', 'sales', 'collection'] },
  { href: '/dashboard', ico: '◧', label: 'Dashboard', roles: ['manager', 'ceo', 'admin', 'markom'] },
  { href: '/form', ico: '✎', label: 'Form Input', roles: ['manager', 'ceo', 'sales', 'markom'] },
  { href: '/leads', ico: '☰', label: 'Database Lead', roles: ['manager', 'ceo', 'markom', 'sales'] },

  { href: '/booking', ico: '✓', label: 'Booking', roles: ['manager', 'ceo', 'admin', 'markom'] },
  { href: '/janjian', ico: '📅', label: 'Janjian & Visitor', roles: ['manager', 'ceo', 'sales', 'markom'] },
  { href: '/kepatuhan-fu', ico: '⏱', label: 'Kepatuhan FU', roles: ['manager', 'ceo'] },
  { href: '/target', ico: '🎯', label: 'Target Sales', roles: ['manager'] },
  { href: '/kunjungan-agent', ico: '📥', label: 'Kunjungan Agent', roles: ['manager'] },
  { href: '/wa-inbox', ico: '💬', label: 'Inbox WhatsApp', roles: ['manager', 'markom'] }, // Marcom membalas dari nomor official; Manager untuk kontrol
  { href: '/collection', ico: '💰', label: 'Collection & KPR', roles: ['manager', 'ceo', 'collection'] },
  { href: '/kpr-proses', ico: '🏦', label: 'Proses KPR', roles: ['manager', 'ceo', 'sales', 'collection'] },
  { href: '/report', ico: '▤', label: 'Report', roles: ['manager', 'ceo', 'markom', 'sales'] }, // Marcom: Leads ke Sales & Data Excel · Sales: Leads ke Sales (lead miliknya)
  { href: '/marcom', ico: '📊', label: 'Analisa Marcom', roles: ['manager', 'ceo', 'markom'] },
  { href: '/presentasi', ico: '▶', label: 'Presentasi Project', roles: ['manager'], khusus: 'presentasi' }, // khusus akun Andriawan
  { href: '/kegiatan', ico: '📣', label: 'Kegiatan', roles: ['manager', 'ceo', 'admin', 'markom', 'sales'] },
  { href: '/stock', ico: '🗺', label: 'Master Stock', roles: ['manager', 'ceo', 'admin', 'markom', 'sales', 'collection'] },
  { href: '/price-list', ico: '🏷', label: 'Price List', roles: ['manager', 'ceo', 'admin', 'markom', 'sales', 'collection'] },
  { href: '/kpr', ico: '🧮', label: 'Simulasi Cara Bayar', roles: ['manager', 'ceo', 'admin', 'markom', 'sales', 'collection'] },
  { href: '/ai-asisten', ico: '🤖', label: 'Asisten AI', roles: ['manager', 'ceo', 'markom'] },
  { href: '/settings', ico: '⚙', label: 'Settings', roles: ['manager'] },
  { href: '/users', ico: '👥', label: 'Pengguna', roles: ['manager'] },
  { href: '/log', ico: '🕘', label: 'Log Aktivitas', roles: ['manager'] },
];

// ===== Kelompok menu (sub menu) =====
const GRUP = [
  ['Penjualan', ['/form', '/leads', '/janjian', '/booking', '/kunjungan-agent']],
  ['Tim Sales', ['/target', '/kepatuhan-fu', '/kegiatan']],
  ['Produk', ['/stock', '/price-list', '/kpr']],
  ['Collection & KPR', ['/collection', '/kpr-proses']],
  ['Marketing', ['/marcom', '/wa-inbox', '/ai-asisten']],
  ['Laporan', ['/report', '/presentasi', '/dashboard']],
  ['Pengaturan', ['/settings', '/users', '/log']],
];
// Menu yang tetap di luar kelompok (laptop) & 4 tombol bar bawah (HP) per peran
const UTAMA = { manager: ['/beranda', '/dashboard'], ceo: ['/beranda', '/dashboard'], sales: ['/beranda', '/form', '/leads', '/janjian'], markom: ['/beranda', '/form', '/leads', '/marcom'],
  collection: ['/beranda', '/collection', '/kpr-proses'], admin: ['/dashboard', '/booking'] };
const BAR = { manager: ['/beranda', '/leads', '/janjian', '/dashboard'], ceo: ['/beranda', '/dashboard', '/leads', '/janjian'], sales: ['/beranda', '/form', '/leads', '/janjian'],
  markom: ['/beranda', '/form', '/leads', '/marcom'], collection: ['/beranda', '/collection', '/kpr-proses', '/stock'], admin: ['/dashboard', '/booking', '/stock', '/price-list'] };
const LABEL_PENDEK = { '/beranda': 'Beranda', '/leads': 'Lead', '/janjian': 'Janjian', '/dashboard': 'Dashboard', '/form': 'Input', '/marcom': 'Analisa', '/collection': 'Collection',
  '/kpr-proses': 'KPR', '/stock': 'Stok', '/booking': 'Booking', '/kpr': 'Simulasi', '/price-list': 'Price List' };
const aktifDi = (path, href) => path === href || path.startsWith(href + '/');

function susunMenu(menus, user) {
  const utama = user.leadAgent ? menus.map(m => m.href) : (UTAMA[user.role] || ['/beranda']);
  const luar = menus.filter(m => utama.includes(m.href));
  const grup = GRUP.map(([nama, hrefs]) => [nama, hrefs.map(h => menus.find(m => m.href === h)).filter(m => m && !utama.includes(m.href))]).filter(([, isi]) => isi.length);
  const tunggal = grup.filter(([, isi]) => isi.length === 1).map(([, isi]) => isi[0]);
  const sisa = menus.filter(m => !utama.includes(m.href) && !GRUP.some(([, h]) => h.includes(m.href)));
  return { luar: [...luar, ...tunggal, ...sisa], grup: grup.filter(([, isi]) => isi.length > 1) };
}

function Ubin({ href, ico, besar }) { // kotak ikon 3D
  return <span className={'ubin' + (besar ? ' besar' : '')}><IkonMenu href={href} cadangan={ico} /></span>;
}

function NavLaptop({ menus, user, path, badge }) {
  const { luar, grup } = susunMenu(menus, user);
  const [buka, setBuka] = useState(() => { try { return JSON.parse(localStorage.getItem('menu-buka') || '[]'); } catch { return []; } });
  const grupAktif = grup.find(([, isi]) => isi.some(m => aktifDi(path, m.href)))?.[0];
  const terbuka = n => buka.includes(n) || n === grupAktif;
  const tog = n => setBuka(b => { const x = terbuka(n) ? b.filter(y => y !== n) : [...b, n]; try { localStorage.setItem('menu-buka', JSON.stringify(x)); } catch {} return x; });
  const item = m => (<Link key={m.href} href={m.href} className={'nav-it' + (aktifDi(path, m.href) ? ' active' : '')}>
    <Ubin href={m.href} ico={m.ico} /><span>{m.label}</span>{badge[m.href] ? <span className="nav-bd">{badge[m.href]}</span> : null}</Link>);
  return (<nav className="nav">
    {luar.map(item)}
    {grup.map(([nama, isi]) => { const o = terbuka(nama), n = isi.reduce((a, m) => a + (badge[m.href] || 0), 0);
      return (<div key={nama} className={'nav-grup' + (o ? ' buka' : '')}>
        <button type="button" className={'nav-it nav-judul' + (nama === grupAktif ? ' berisi' : '')} onClick={() => tog(nama)} aria-expanded={o}>
          <Ubin href={'g:' + nama} ico="▸" /><span>{nama}</span>{!o && n ? <span className="nav-bd">{n}</span> : null}<span className="nav-panah">{o ? '▾' : '▸'}</span></button>
        {o && <div className="nav-sub">{isi.map(item)}</div>}</div>); })}
  </nav>);
}

function NavHP({ menus, user, path, badge }) {
  const [buka, setBuka] = useState(false);
  useEffect(() => { setBuka(false); }, [path]);
  const barHref = user.leadAgent ? menus.map(m => m.href).slice(0, 5) : (BAR[user.role] || menus.slice(0, 4).map(m => m.href));
  const bar = barHref.map(h => menus.find(m => m.href === h)).filter(Boolean);
  const lain = menus.filter(m => !barHref.includes(m.href));
  const grup = GRUP.map(([nama, hrefs]) => [nama, hrefs.map(h => lain.find(m => m.href === h)).filter(Boolean)]).filter(([, isi]) => isi.length);
  const sisa = lain.filter(m => !GRUP.some(([, h]) => h.includes(m.href)));
  if (sisa.length) grup.push(['Lainnya', sisa]);
  const menuAktif = lain.some(m => aktifDi(path, m.href)), nLain = lain.reduce((a, m) => a + (badge[m.href] || 0), 0);
  return (<>
    <nav className="mbar">
      {bar.map(m => (<Link key={m.href} href={m.href} className={'mbar-it' + (aktifDi(path, m.href) ? ' active' : '')}>
        <Ubin href={m.href} ico={m.ico} /><span>{LABEL_PENDEK[m.href] || m.label}</span>{badge[m.href] ? <span className="nav-bd">{badge[m.href]}</span> : null}</Link>))}
      {lain.length > 0 && <button type="button" className={'mbar-it' + (menuAktif || buka ? ' active' : '')} onClick={() => setBuka(v => !v)} aria-expanded={buka}>
        <Ubin href="g:Menu" ico="▦" /><span>Menu</span>{nLain ? <span className="nav-bd">{nLain}</span> : null}</button>}
    </nav>
    {buka && <div className="msheet-redup" onClick={() => setBuka(false)}><div className="msheet" onClick={e => e.stopPropagation()}>
      <div className="msheet-gagang" onClick={() => setBuka(false)} />
      {grup.map(([nama, isi]) => (<div key={nama}><div className="msheet-judul">{nama}</div>
        <div className="msheet-grid">{isi.map(m => (<Link key={m.href} href={m.href} className={'msheet-it' + (aktifDi(path, m.href) ? ' active' : '')}>
          <Ubin href={m.href} ico={m.ico} besar /><span>{m.label}</span>{badge[m.href] ? <span className="nav-bd">{badge[m.href]}</span> : null}</Link>))}</div></div>))}
    </div></div>}
  </>);
}

const IkonMatahari = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>);
const IkonBulan = () => (<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>);

// Tema aktif: pilihan user (data-theme di <html>) atau, bila belum memilih, setelan terang/gelap perangkat
function temaAktif() {
  const t = document.documentElement.dataset.theme;
  if (t === 'light' || t === 'dark') return t;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function ArahkanAgent() { // halaman di luar menu lead agent → Form Input
  useEffect(() => { const p = window.location.pathname; if (!['/form', '/kpr', '/price-list', '/stock'].some(x => p.startsWith(x))) window.location.replace('/form?tab=trx'); }, []);
  return null;
}

export default function Shell({ user, children }) {
  const path = usePathname();
  const router = useRouter();
  // Lead agent (Esteem, LJH): hanya input Reserved/Booking, Simulasi, Price List & Master Stock — tanpa kewajiban sales
  const MENU_AGENT = ['/form', '/kpr', '/price-list', '/stock'];
  const [badge, setBadge] = useState({});
  useEffect(() => {
    if (user.role !== 'manager') return;
    const muat = () => { if (document.visibilityState === 'visible') fetch('/api/notif-baru').then(r => r.ok ? r.json() : null).then(d => d && setBadge({ '/kunjungan-agent': (d.agent || []).length })).catch(() => {}); };
    muat(); const t = setInterval(muat, 60000); return () => clearInterval(t);
  }, [user.role]);
  const menus = MENUS.filter(m => m.roles.includes(user.role) && (m.khusus !== 'presentasi' || bolehPresentasi(user)) && (!user.leadAgent || MENU_AGENT.includes(m.href)));

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
    if (path.startsWith('/presentasi') && !bolehPresentasi(user)) { router.replace('/beranda'); return; }
    if (user.role === 'sales' && !path.startsWith('/beranda') && !path.startsWith('/report') && !path.startsWith('/janjian') && !path.startsWith('/form') && !path.startsWith('/stock') && !path.startsWith('/price-list') && !path.startsWith('/kpr') && !path.startsWith('/leads') && !path.startsWith('/kegiatan')) router.replace('/beranda');
    if (user.role === 'admin' && !path.startsWith('/dashboard') && !path.startsWith('/booking') && !path.startsWith('/stock') && !path.startsWith('/price-list') && !path.startsWith('/kpr') && !path.startsWith('/kegiatan')) router.replace('/dashboard');
    // Proses KPR hanya untuk sales, manager & CEO Project
    if (['markom', 'admin'].includes(user.role) && path.startsWith('/kpr-proses')) router.replace(user.role === 'admin' ? '/dashboard' : '/beranda');
    if (user.role === 'admin' && (path.startsWith('/janjian') || path.startsWith('/wa-inbox'))) router.replace('/dashboard');
    // CEO Project: semua menu kecuali Settings, Pengguna & Log Aktivitas
    if (user.role === 'ceo' && (path.startsWith('/settings') || path.startsWith('/users') || path.startsWith('/log') || path.startsWith('/wa-inbox'))) router.replace('/dashboard');
    if (user.role === 'collection' && !['/beranda', '/collection', '/kpr-proses', '/kpr', '/stock', '/price-list'].some(p => path.startsWith(p))) router.replace('/beranda');
    if (user.role === 'markom' && !path.startsWith('/beranda') && !path.startsWith('/report') && !path.startsWith('/dashboard') && !path.startsWith('/form') && !path.startsWith('/leads') && !path.startsWith('/followup') && !path.startsWith('/booking') && !path.startsWith('/stock') && !path.startsWith('/kpr') && !path.startsWith('/kegiatan') && !path.startsWith('/marcom') && !path.startsWith('/ai-asisten') && !path.startsWith('/janjian') && !path.startsWith('/wa-inbox') && !path.startsWith('/price-list')) router.replace('/beranda');
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
          {/* Menu akun (HP): segarkan aplikasi, ganti password, keluar — supaya bar atas tidak melebihi layar */}
          <details className="m-menu">
            <summary className="theme-btn" aria-label="Menu akun">⋯</summary>
            <div className="m-menu-panel">
              <div className="who"><b>{user.name}</b>{user.role === 'markom' ? 'Marcom' : user.role === 'ceo' ? 'CEO Project' : user.role === 'collection' ? 'Collection & KPR' : user.role.charAt(0).toUpperCase() + user.role.slice(1)}</div>
              <button onClick={segarkanAplikasi}>🧹 Segarkan aplikasi</button>
              <button onClick={gantiPassword}>🔑 Ganti password</button>
              <button onClick={logout} style={{ color: 'var(--red)' }}>Keluar</button>
            </div>
          </details>
        </span>
      </header>
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="CHL" />
          <div className="logo">CRM<span> SALES</span></div>
          <small>Cipta Harmoni Lestari</small>
        </div>
        <NavLaptop menus={menus} user={user} path={path} badge={badge} />
        <div className="side-theme">
          <div className="theme-switch" role="group" aria-label="Tema tampilan">
            <button aria-pressed={tema === 'light'} onClick={() => pilihTema('light')}><IkonMatahari />Terang</button>
            <button aria-pressed={tema === 'dark'} onClick={() => pilihTema('dark')}><IkonBulan />Gelap</button>
          </div>
        </div>
        <div className="side-foot">
          <div className="side-user"><span className="u-name">{user.name}</span>
            <span className="u-role">{user.role === 'manager' ? 'Manager — Akses Penuh' : user.role === 'ceo' ? 'CEO Project — Pantau & Input' : user.role === 'admin' ? 'Admin — Lihat Data' : user.role === 'markom' ? 'Marcom — Lead Digital' : user.role === 'collection' ? 'Collection & KPR' : 'Sales — Form Input'}</span></div>
          <div className="side-tombol">
            <button className="btn-logout" onClick={segarkanAplikasi} title="Segarkan aplikasi (bersihkan cache)" aria-label="Segarkan aplikasi">🧹</button>
            <button className="btn-logout" onClick={gantiPassword} title="Ganti password">🔑 Password</button>
            <button className="btn-logout" onClick={logout}>Keluar</button>
          </div>
        </div>
      </aside>
      <NavHP menus={menus} user={user} path={path} badge={badge} />
      <main className="main">
        {/* Laptop: tombol tema & lonceng melayang di kanan atas pita judul, sejajar tepi kanan konten */}
        <div className="atas-kanan">
          <button className="theme-btn" onClick={() => pilihTema(tema === 'dark' ? 'light' : 'dark')}
            aria-label={tema === 'dark' ? 'Ganti ke mode terang' : 'Ganti ke mode gelap'} title={tema === 'dark' ? 'Mode terang' : 'Mode gelap'}>
            {tema === 'dark' ? <IkonMatahari /> : <IkonBulan />}</button>
          <ReminderBell user={user} />
        </div>
        <BusyIndicator />
        <PushNotif user={user} />
        {children}
        {!user.leadAgent && <PopupPengingat user={user} />}
        {user.leadAgent && <ArahkanAgent />}
        <div className="copyright">copyright &copy; 2026 by Andriawanp</div>
      </main>
    </div>
  );
}
