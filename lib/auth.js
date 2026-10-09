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
const cacheAkun = new Map();
let kolomProyek = false;
async function siapkanKolomProyek(sql) {
  if (kolomProyek) return;
  try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS projects text[]`; kolomProyek = true; } catch {}
}
// Status akun + project yang boleh diakses (null = semua project). Cache 60 detik per instance.
export async function infoAkun(u) {
  if (!u?.username) return { ok: false, projects: null };
  const c = cacheAkun.get(u.username);
  if (c && Date.now() - c.t < 60000) return c;
  try {
    const sql = db();
    await siapkanKolomProyek(sql);
    const r = await sql`SELECT active, role, projects FROM users WHERE username = ${u.username} LIMIT 1`;
    const p = r[0]?.projects;
    const info = { ok: !!(r.length && r[0].active !== false), projects: Array.isArray(p) && p.length ? p : null, t: Date.now() };
    cacheAkun.set(u.username, info);
    return info;
  } catch { return { ok: true, projects: null }; } // database bermasalah: jangan mengunci semua user keluar
}
export function hapusCacheAkun(username) { if (username) cacheAkun.delete(username); else cacheAkun.clear(); }
export async function akunAktif(u) { return (await infoAkun(u)).ok; }

// ===== Akses per project =====
// user.projects: null = semua project (manager selalu semua). Diisi manager di menu Pengguna.
export function bolehProyek(user, project) {
  return !user?.projects || user.projects.includes(project);
}
// Baris data (lead/FU/transaksi/kegiatan) boleh tampil? Data tanpa project tetap tampil bagi pemilik/penginputnya.
export function lihatBaris(user, row) {
  if (!user?.projects) return true;
  if (row.project) return user.projects.includes(row.project);
  return row.sales === user.name || row.created_by === user.username;
}
export const pesanProyek = user => 'Akun Anda hanya untuk project ' + (user?.projects || []).join(', ');

export async function requireUser(role) {
  const u = await getUser();
  if (!u) return { err: Response.json({ error: 'Belum login' }, { status: 401 }) };
  const info = await infoAkun(u);
  if (!info.ok) return { err: Response.json({ error: 'Sesi login berakhir — akun dinonaktifkan' }, { status: 401 }) };
  if (role && !(Array.isArray(role) ? role.includes(u.role) : u.role === role)) return { err: Response.json({ error: 'Tidak punya akses' }, { status: 403 }) };
  return { user: { ...u, projects: u.role === 'manager' ? null : info.projects } };
}
