import { cookies } from 'next/headers';

// Tema tampilan per user: 'light' | 'dark' | '' (ikut setelan HP). Disimpan di akun (users.tema) + cookie crm_tema
// supaya halaman langsung tampil dengan tema yang benar tanpa kedip, dan ikut terbawa saat login di perangkat lain.
let kolomSiap = false;
export async function siapkanKolomTema(sql) {
  if (kolomSiap) return;
  try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS tema text`; kolomSiap = true; } catch {}
}
export function pasangCookieTema(tema) {
  const c = cookies();
  if (tema === 'light' || tema === 'dark') c.set('crm_tema', tema, { path: '/', maxAge: 60 * 60 * 24 * 365, sameSite: 'lax' });
  else c.delete('crm_tema');
}
