import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { err } = await requireUser('manager'); if (err) return err;
  const sql = db();
  const rows = await sql`SELECT id, username, name, role, email, active, created_at FROM users ORDER BY role, name`;
  return Response.json(rows);
}

export async function POST(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.username || !b.name || !b.password) return Response.json({ error: 'Username, nama, dan password wajib diisi' }, { status: 400 });
  const role = b.role === 'manager' ? 'manager' : 'sales';
  const sql = db();
  const dupe = await sql`SELECT 1 FROM users WHERE lower(username) = ${String(b.username).toLowerCase()}`;
  if (dupe.length) return Response.json({ error: 'Username sudah dipakai' }, { status: 400 });
  const hash = await bcrypt.hash(b.password, 10);
  await sql`INSERT INTO users (username, name, role, password_hash, email) VALUES (${b.username}, ${b.name}, ${role}, ${hash}, ${b.email || ''})`;
  return Response.json({ ok: true });
}

export async function PATCH(req) {
  const { user, err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  if (typeof b.active === 'boolean') {
    if (Number(b.id) === Number(user.id) && !b.active) return Response.json({ error: 'Tidak bisa menonaktifkan akun sendiri' }, { status: 400 });
    await sql`UPDATE users SET active = ${b.active} WHERE id = ${b.id}`;
  }
  if (typeof b.email === 'string') {
    await sql`UPDATE users SET email = ${b.email.trim()} WHERE id = ${b.id}`;
  }
  if (b.password) {
    const hash = await bcrypt.hash(b.password, 10);
    await sql`UPDATE users SET password_hash = ${hash} WHERE id = ${b.id}`;
  }
  return Response.json({ ok: true });
}
