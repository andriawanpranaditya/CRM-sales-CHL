import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  if (user.role === 'manager') {
    const rows = await sql`SELECT id, username, name, role, email, wa, password_plain, active, created_at FROM users ORDER BY role, name`;
    return Response.json(rows);
  }
  if (user.role === 'markom') {
    // Markom hanya butuh daftar sales + nomor WA (utk Leads to Sales) — tanpa data sensitif
    const rows = await sql`SELECT id, name, role, wa FROM users WHERE role = 'sales' AND active = true ORDER BY name`;
    return Response.json(rows);
  }
  return Response.json({ error: 'Hanya manager' }, { status: 403 });
}

export async function POST(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.username || !b.name || !b.password) return Response.json({ error: 'Username, nama, dan password wajib diisi' }, { status: 400 });
  const role = ['manager', 'admin', 'markom', 'sales'].includes(b.role) ? b.role : 'sales';
  const sql = db();
  const dupe = await sql`SELECT 1 FROM users WHERE lower(username) = ${String(b.username).toLowerCase()}`;
  if (dupe.length) return Response.json({ error: 'Username sudah dipakai' }, { status: 400 });
  const hash = await bcrypt.hash(b.password, 10);
  await sql`INSERT INTO users (username, name, role, password_hash, password_plain, email, wa)
    VALUES (${b.username}, ${b.name}, ${role}, ${hash}, ${role !== 'manager' ? b.password : null}, ${b.email || ''}, ${b.wa || ''})`;
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { user, err } = await requireUser('manager'); if (err) return err;
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!id) return Response.json({ error: 'id wajib' }, { status: 400 });
  if (id === Number(user.id)) return Response.json({ error: 'Tidak bisa menghapus akun sendiri' }, { status: 400 });
  const sql = db();
  const t = await sql`SELECT * FROM users WHERE id = ${id}`;
  if (!t.length) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
  if (t[0].role === 'manager') {
    const mgr = await sql`SELECT count(*)::int AS n FROM users WHERE role = 'manager' AND active = true AND id <> ${id}`;
    if (!mgr[0].n) return Response.json({ error: 'Tidak bisa menghapus manager terakhir' }, { status: 400 });
  }
  await sql`DELETE FROM users WHERE id = ${id}`;
  // Catatan: riwayat lead/FU/transaksi atas nama user ini TETAP tersimpan (nama tersimpan sbg teks)
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
  if (typeof b.wa === 'string') {
    await sql`UPDATE users SET wa = ${b.wa.trim()} WHERE id = ${b.id}`;
  }
  if (b.role && ['manager', 'admin', 'markom', 'sales'].includes(b.role)) {
    if (Number(b.id) === Number(user.id)) return Response.json({ error: 'Tidak bisa mengubah peran akun sendiri' }, { status: 400 });
    if (b.role === 'manager') await sql`UPDATE users SET role = 'manager', password_plain = null WHERE id = ${b.id}`;
    else await sql`UPDATE users SET role = ${b.role} WHERE id = ${b.id}`;
  }
  if (b.password) {
    const hash = await bcrypt.hash(b.password, 10);
    const t = await sql`SELECT role FROM users WHERE id = ${b.id}`;
    const plain = t[0] && t[0].role !== 'manager' ? b.password : null;
    await sql`UPDATE users SET password_hash = ${hash}, password_plain = ${plain} WHERE id = ${b.id}`;
  }
  return Response.json({ ok: true });
}

// Ganti password SENDIRI (semua role, termasuk sales dari Form Input)
export async function PUT(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.oldPassword || !b.newPassword) return Response.json({ error: 'Password lama dan baru wajib diisi' }, { status: 400 });
  if (String(b.newPassword).length < 5) return Response.json({ error: 'Password baru minimal 5 karakter' }, { status: 400 });
  const sql = db();
  const rows = await sql`SELECT * FROM users WHERE id = ${user.id}`;
  const u = rows[0];
  if (!u || !(await bcrypt.compare(b.oldPassword, u.password_hash))) {
    return Response.json({ error: 'Password lama salah' }, { status: 400 });
  }
  const hash = await bcrypt.hash(b.newPassword, 10);
  await sql`UPDATE users SET password_hash = ${hash}, password_plain = ${u.role === 'sales' ? b.newPassword : null} WHERE id = ${user.id}`;
  return Response.json({ ok: true });
}
