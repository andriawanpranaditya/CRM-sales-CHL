import { db } from '@/lib/db';
import { createSession } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function POST(req) {
  const { username, password } = await req.json();
  if (!username || !password) return Response.json({ error: 'Username & password wajib diisi' }, { status: 400 });
  const sql = db();
  const rows = await sql`SELECT * FROM users WHERE lower(username) = ${String(username).toLowerCase()} AND active = true`;
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.password_hash))) {
    return Response.json({ error: 'Username atau password salah' }, { status: 401 });
  }
  await createSession(u);
  return Response.json({ ok: true, user: { id: u.id, username: u.username, name: u.name, role: u.role } });
}
