import { db } from '@/lib/db';
import { createSession } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { catat } from '@/lib/log';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { username, password } = await req.json();
  if (!username || !password) return Response.json({ error: 'Username & password wajib diisi' }, { status: 400 });
  const sql = db();
  const rows = await sql`SELECT * FROM users WHERE lower(username) = ${String(username).toLowerCase()} AND active = true`;
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    // Percobaan login gagal ikut dicatat (username yang dicoba, tanpa password)
    const ada = await sql`SELECT username, name, role, active FROM users WHERE lower(username) = ${String(username).toLowerCase()}`;
    await catat(sql, { user: ada[0] ? { username: ada[0].username, name: ada[0].name, role: ada[0].role } : { username: String(username).slice(0, 60) },
      aksi: 'Login gagal', modul: 'Akses', detail: !ada[0] ? 'username tidak terdaftar' : ada[0].active === false ? 'akun nonaktif' : 'password salah', req });
    return Response.json({ error: 'Username atau password salah' }, { status: 401 });
  }
  await createSession(u);
  await catat(sql, { user: u, aksi: 'Login', modul: 'Akses', detail: 'masuk aplikasi', req });
  return Response.json({ ok: true, user: { id: u.id, username: u.username, name: u.name, role: u.role } });
}
