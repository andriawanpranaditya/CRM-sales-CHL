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

// Peran akses penuh berganti nama dari 'manager' menjadi 'administrator'.
// Sesi lama masih menyimpan nama lama sampai pengguna login ulang, jadi keduanya
// diperlakukan sama agar tidak ada yang terkunci di tengah masa peralihan.
export const samakanPeran = r => (r === 'manager' ? 'administrator' : r);

// Peran dibaca ulang dari database setiap permintaan. Bila hanya mengandalkan
// isi sesi, perubahan peran baru berlaku setelah pengguna login ulang — dan akun
// yang dinonaktifkan masih dapat mengakses sistem sampai sesinya kedaluwarsa.
// Akses project per akun (dari CRM Sales): kolom users.projects — kosong = semua project
let kolomProyek = false;
async function siapkanKolomProyek(sql) {
  if (kolomProyek) return;
  try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS projects text[]`; kolomProyek = true; } catch {}
}
// Harmoni One membaca akun langsung dari database tiap permintaan (tanpa cache) — fungsi ini untuk kompatibilitas modul CRM
export function hapusCacheAkun() {}

export async function getUserSegar() {
  const u = await getUser();
  if (!u) return null;
  try {
    const sql = db();
    await siapkanKolomProyek(sql);
    const r = await sql`SELECT role, name, active, projects FROM users WHERE id = ${u.id}`;
    if (!r.length) return null;                       // akun sudah dihapus
    if (r[0].active === false) return null;           // akun dinonaktifkan
    const p = r[0].projects;
    return { ...u, name: r[0].name || u.name, role: samakanPeran(r[0].role), projects: Array.isArray(p) && p.length ? p : null };
  } catch {
    return { ...u, role: samakanPeran(u.role) };      // database sedang tidak terjangkau
  }
}

// role boleh satu peran (string) atau daftar peran (array) — modul dari CRM Sales memakai daftar
export async function requireUser(role) {
  const u = await getUserSegar();
  if (!u) return { err: Response.json({ error: 'Belum login' }, { status: 401 }) };
  const boleh = Array.isArray(role) ? role.map(samakanPeran) : role ? [samakanPeran(role)] : null;
  if (boleh && !boleh.includes(u.role)) {
    return { err: Response.json({ error: 'Tidak punya akses' }, { status: 403 }) };
  }
  // Administrator selalu melihat semua project; peran lain mengikuti akses project akunnya
  // Administrator & CEO (seluruh project) selalu semua project; peran lain mengikuti akses project akunnya
  return { user: { ...u, projects: ['administrator', 'ceogrup'].includes(u.role) ? null : (u.projects || null) } };
}

// ===== Dipakai modul hulu dari CRM Sales =====
// Akses per project: projects = null berarti semua project.
export function bolehProyek(user, project) { return !user?.projects || user.projects.includes(project); }
export function lihatBaris(user, row) {
  if (!user?.projects) return true;
  if (row.project) return user.projects.includes(row.project);
  return row.sales === user.name || row.created_by === user.username;
}
export const pesanProyek = user => 'Akun Anda hanya untuk project ' + (user?.projects || []).join(', ');
// Akun masih aktif? (dipakai pencatat log aktivitas)
export async function akunAktif(u) {
  if (!u?.id) return false;
  try { const r = await db()`SELECT active FROM users WHERE id = ${u.id}`; return !!(r.length && r[0].active !== false); }
  catch { return true; }
}
