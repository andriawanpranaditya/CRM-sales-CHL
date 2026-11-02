'use client';
import Link from 'next/link';
import ReminderBell from '@/components/ReminderBell';
import BusyIndicator from '@/components/BusyIndicator';
import NotifikasiHP from '@/components/NotifikasiHP';
import TemaToggle from '@/components/TemaToggle';
import AksiCepat from '@/components/AksiCepat';
import IkonMenu from '@/components/IkonMenu';
import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';

// Peran divisi Harmoni One — label & menu yang boleh diakses
export const ROLE_INFO = {
  administrator: { label: 'Administrator', sub: 'Administrator — Akses Penuh' },
  ceo:        { label: 'CEO Project',  sub: 'CEO Project — Penjualan & Pemasaran' },
  ceogrup:    { label: 'CEO',  sub: 'CEO — Semua Project' },
  headsales:  { label: 'Head of Sales & Marketing', sub: 'Head of Sales & Marketing' },
  salesmanager: { label: 'Sales Manager', sub: 'Sales Manager — Tim Sales Project' },
  // Nama lama peran akses penuh — dipetakan agar akun dengan sesi lama tetap utuh
  manager:    { label: 'Administrator', sub: 'Administrator — Akses Penuh' },
  admin:      { label: 'Admin',        sub: 'Admin — Lihat Data' },
  markom:     { label: 'Marcom',       sub: 'Marcom — Lead Digital' },
  sales:      { label: 'Sales',        sub: 'Sales — Form Input' },
  adminsales: { label: 'Admin Sales',  sub: 'Admin Sales — Verifikasi & Dokumen' },
  collection: { label: 'Collection & KPR', sub: 'Collection & KPR — Penagihan & Proses Kredit' },
  finance:    { label: 'Finance',      sub: 'Finance — Keuangan & Komisi' },
  project:    { label: 'Admin Project',sub: 'Admin Project — Serah Terima' },
  estate:     { label: 'Estate',       sub: 'Estate — Pengelolaan Penghuni' },
};

const MENUS = [
  // Urutan mengikuti tahap kerja harian. Di HP menjadi menu bawah yang bisa digeser (urutan = seberapa sering dipakai).
  // Sales hanya melihat menu kerjanya: lead, chat, janjian, form, kegiatan, produk, transaksi miliknya, Papan Alur (tahap 1 & 3), Proses KPR.
  { grup: 'Hari ini' },
  { href: '/beranda', ico: '⌂', label: 'Beranda', roles: ['administrator', 'ceogrup', 'headsales', 'salesmanager', 'ceo', 'admin', 'markom', 'sales', 'adminsales', 'collection', 'finance', 'project', 'estate'] },
  { href: '/dashboard', ico: '◧', label: 'Dashboard', roles: ['administrator', 'ceogrup', 'headsales', 'salesmanager', 'ceo', 'admin', 'markom', 'adminsales', 'collection', 'finance', 'project', 'estate'] },
  { grup: 'Jual' },
  { href: '/leads', ico: '☰', label: 'Database Lead', roles: ['administrator', 'ceogrup', 'headsales', 'salesmanager', 'ceo', 'markom', 'sales'] },
  { href: '/wa-inbox', ico: '💬', label: 'Inbox WhatsApp', roles: ['administrator', 'headsales', 'salesmanager', 'ceo', 'markom', 'sales'] },
  { href: '/janjian', ico: '📅', label: 'Janjian & Visitor', roles: ['administrator', 'ceogrup', 'headsales', 'salesmanager', 'ceo', 'sales', 'markom'] },
  { href: '/form', ico: '✎', label: 'Form Input', roles: ['administrator', 'headsales', 'salesmanager', 'ceo', 'sales', 'markom'] },
  { href: '/kegiatan', ico: '📣', label: 'Kegiatan', roles: ['administrator', 'headsales', 'salesmanager', 'ceo', 'admin', 'markom', 'sales', 'adminsales'] },
  { grup: 'Produk' },
  { href: '/kpr', ico: '🧮', label: 'Simulasi Cara Bayar', roles: ['administrator', 'headsales', 'salesmanager', 'ceo', 'admin', 'markom', 'sales', 'adminsales', 'collection'] },
  { href: '/price-list', ico: '🏷', label: 'Price List', roles: ['administrator', 'ceogrup', 'headsales', 'salesmanager', 'ceo', 'admin', 'markom', 'sales', 'adminsales', 'collection'] },
  { href: '/stock', ico: '🗺', label: 'Master Stock', roles: ['administrator', 'ceogrup', 'headsales', 'salesmanager', 'ceo', 'admin', 'markom', 'sales', 'adminsales', 'collection', 'project', 'estate'] },
  { grup: 'Transaksi' },
  { href: '/booking', ico: '✓', label: 'Reserved & Booking', roles: ['administrator', 'ceogrup', 'headsales', 'salesmanager', 'ceo', 'admin', 'markom', 'sales', 'adminsales', 'collection', 'finance', 'project', 'estate'] },
  { href: '/verifikasi', ico: '✔', label: 'Verifikasi', roles: ['administrator', 'headsales', 'salesmanager', 'ceo', 'adminsales', 'collection', 'finance'] },
  { href: '/alur', ico: '⇉', label: 'Papan Alur', roles: ['administrator', 'headsales', 'salesmanager', 'ceo', 'sales', 'adminsales', 'collection', 'finance', 'project', 'markom', 'estate'] },
  { href: '/proses', ico: '⛭', label: 'Proses Divisi', roles: ['administrator', 'collection', 'finance', 'project', 'markom', 'estate'] },
  { href: '/kpr-proses', ico: '🏦', label: 'Proses KPR', roles: ['administrator', 'ceogrup', 'headsales', 'salesmanager', 'ceo', 'sales', 'collection'] },
  { href: '/collection', ico: '💰', label: 'Collection & KPR', roles: ['administrator', 'ceogrup', 'headsales', 'salesmanager', 'ceo', 'collection'] },
  { href: '/piutang', ico: '💳', label: 'Piutang', roles: ['administrator', 'ceogrup', 'headsales', 'salesmanager', 'ceo', 'admin', 'adminsales', 'finance', 'collection'] },
  { href: '/kontrol-proses', ico: '🏛', label: 'KPR & AJB', roles: ['administrator', 'ceogrup', 'headsales', 'salesmanager', 'ceo', 'admin', 'adminsales', 'finance', 'collection'] },
  { href: '/komisi', ico: '💸', label: 'Komisi Sales', roles: ['administrator', 'headsales', 'salesmanager', 'ceo', 'adminsales', 'finance'] },
  { grup: 'Insight' },
  { href: '/report', ico: '▤', label: 'Report Sales', roles: ['administrator', 'ceogrup', 'headsales', 'salesmanager', 'ceo'] },
  { href: '/kepatuhan-fu', ico: '⏱', label: 'Kepatuhan FU', roles: ['administrator', 'headsales', 'salesmanager', 'ceo'] },
  { href: '/marcom', ico: '📊', label: 'Analisa Marcom', roles: ['administrator', 'headsales', 'ceo', 'markom'] },
  { href: '/ai-asisten', ico: '🤖', label: 'Asisten AI', roles: ['administrator', 'headsales', 'ceo', 'markom'] },
  { grup: 'Kantor' },
  { href: '/data', ico: '▦', label: 'Data Bersama', roles: ['administrator', 'admin', 'adminsales', 'finance', 'collection', 'project', 'estate', 'markom'] },
  { href: '/otorisasi', ico: '🔐', label: 'Otorisasi', roles: ['administrator', 'adminsales', 'collection', 'finance', 'project', 'estate', 'markom', 'admin'] },
  { href: '/iom', ico: '📝', label: 'IOM', roles: ['administrator', 'ceogrup', 'markom', 'adminsales', 'collection', 'finance', 'project', 'estate', 'admin'] },
  { href: '/panduan', ico: '❔', label: 'Panduan Alur', roles: ['administrator', 'markom', 'adminsales', 'collection', 'finance', 'project', 'estate'] },
  { href: '/settings', ico: '⚙', label: 'Settings', roles: ['administrator'] },
  { href: '/users', ico: '👥', label: 'Pengguna', roles: ['administrator'] },
  { href: '/log', ico: '🕘', label: 'Log Aktivitas', roles: ['administrator'] },
];
// Alamat cocok dengan menu bila sama persis atau sub-halamannya (/kpr tidak ikut membuka /kpr-proses)
const cocok = (path, href) => path === href || path.startsWith(href + '/');

export default function Shell({ user, children }) {
  const path = usePathname();
  const router = useRouter();
  // Baris grup hanya ditampilkan bila ada menu di bawahnya yang boleh diakses
  const peran = user.role === 'manager' ? 'administrator' : user.role;
  const menus = MENUS.filter(m => m.grup || m.roles.includes(peran))
    .filter((m, i, a) => !m.grup || (a[i + 1] && !a[i + 1].grup));
  // Judul pada bilah atas ponsel mengikuti menu yang sedang dibuka
  const aktif = menus.find(m => m.href && cocok(path, m.href));
  const judul = aktif ? aktif.label : 'Harmoni One';

  useEffect(() => {
    // Follow Up kini menjadi tab di Database Lead
    if (path.startsWith('/followup')) { router.replace('/leads'); return; }
    if (peran === 'administrator') return;
    const halaman = menus.filter(m => m.href);
    const boleh = halaman.some(m => cocok(path, m.href));
    if (!boleh && halaman.length) router.replace(halaman[0].href);
  }, [path, peran, router, menus]);

  // Log akses: setiap halaman yang dibuka dicatat (server menghitung halaman sama dalam 10 menit sekali).
  // Bila akun sudah dinonaktifkan, sesi diakhiri dan pengguna diarahkan ke halaman login.
  useEffect(() => {
    let pwa = false;
    try { pwa = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true; } catch {}
    fetch('/api/log', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ halaman: path, pwa }) })
      .then(r => { if (r.status === 401) { router.push('/login?nonaktif=1'); router.refresh(); } })
      .catch(() => {});
  }, [path]); // eslint-disable-line

  // HP: menu bawah diam (tidak menggeser sendiri) — sama seperti di CRM yang sudah biasa dipakai sales

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
        <img className="m-mark" src="/logo.png" alt="" />
        <span className="m-title">
          <b>{judul}</b>
          <small>{user.name} · {(ROLE_INFO[peran] || ROLE_INFO.sales).label}</small>
        </span>
        <span className="m-act">
          <TemaToggle />
          <ReminderBell user={user} />
          <button className="btn-logout" onClick={gantiPassword} title="Ganti password">🔑</button>
          <button className="btn-logout" onClick={logout} title="Keluar" aria-label="Keluar">
            <svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor"
              strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
          </button>
        </span>
      </header>
      <aside className="sidebar">
        <div className="brand">
          <img src="/logo.png" alt="CHL" />
          <div className="logo">HARMONI<span> ONE</span></div>
          <small>Cipta Harmoni Lestari</small>
        </div>
        <nav className="nav">
          {menus.map((m, i) => (m.grup
            ? <div key={'g' + i} className="nav-grup">{m.grup}</div>
            : <Link key={m.href} href={m.href} className={cocok(path, m.href) ? 'active' : ''}>
                <span className="ico"><IkonMenu href={m.href} cadangan={m.ico} /></span><span>{m.label}</span>
              </Link>
          ))}
        </nav>
        <div className="side-foot">
          <div className="side-user"><span className="u-name">{user.name}</span>
            <span className="u-role">{(ROLE_INFO[peran] || ROLE_INFO.sales).sub}</span></div>
          <div className="side-tombol">
            <button className="btn-logout" onClick={gantiPassword} title="Ganti password" aria-label="Ganti password">🔑 Password</button>
            <button className="btn-logout" onClick={logout}>Keluar</button>
          </div>
        </div>
      </aside>
      <BusyIndicator />
      <AksiCepat peran={peran} />
      <main className="main">
        {/* Laptop: tombol tema & lonceng di kanan atas, sejajar tepi kanan konten */}
        <div className="atas-kanan">
          <TemaToggle />
          <ReminderBell user={user} />
        </div>
        {['sales', 'markom', 'administrator'].includes(peran) && <NotifikasiHP mode="spanduk" />}
        {children}
        <div className="copyright">copyright &copy; 2026 by Andriawanp</div>
      </main>
    </div>
  );
}
