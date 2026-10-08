import { SignJWT, jwtVerify } from 'jose';
import { cookies } from 'next/headers';
import { db } from '@/lib/db';

export const COOKIE = 'crm_session';
const secret = () => new TextEncoder().encode(process.env.AUTH_SECRET || 'dev-secret-ganti-di-produksi');

export async function createSession(user) {
  const token = await new SignJWT({ id: user.id, username: user.username, name: user.name, role: user.role })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('30d')
    .sign(secret());
  cookies().set(COOKIE, token, {
    httpOnly: true, sameSite: 'lax', path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 60 * 60 * 24 * 30,
  });
}

export async function getUser() {
  const t = cookies().get(COOKIE)?.value;
  if (!t) return null;
  try {
    const { payload } = await jwtVerify(t, secret());
    return payload;
  } catch { return null; }
}

export function clearSession() {
  cookies().delete(COOKIE);
}

// Sesi berlaku 30 hari — akun yang dinonaktifkan / dihapus manager harus langsung tertolak.
// Status akun dicek ke database dengan cache singkat (60 detik per instance) agar tidak membebani tiap request.
const cacheAktif = new Map();
export async function akunAktif(u) {
  if (!u?.username) return false;
  const c = cacheAktif.get(u.username);
  if (c && Date.now() - c.t < 60000) return c.ok;
  try {
    const r = await db()`SELECT active, role FROM users WHERE username = ${u.username} LIMIT 1`;
    const ok = !!(r.length && r[0].active !== false);
    cacheAktif.set(u.username, { ok, t: Date.now() });
    return ok;
  } catch { return true; } // database bermasalah: jangan mengunci semua user keluar
}

export async function requireUser(role) {
  const u = await getUser();
  if (!u) return { err: Response.json({ error: 'Belum login' }, { status: 401 }) };
  if (!(await akunAktif(u))) return { err: Response.json({ error: 'Sesi login berakhir — akun dinonaktifkan' }, { status: 401 }) };
  if (role && u.role !== role) return { err: Response.json({ error: 'Tidak punya akses' }, { status: 403 }) };
  return { user: u };
}
