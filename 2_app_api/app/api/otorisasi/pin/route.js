import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

// Tetapkan atau ubah PIN otorisasi pribadi. Hanya pemiliknya yang dapat
// menetapkan; administrator sekalipun tidak dapat membaca atau menggantinya.
export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  const pin = String(b.pin || '').trim();
  if (!/^\d{6}$/.test(pin)) {
    return Response.json({ error: 'PIN harus terdiri atas enam angka.' }, { status: 400 });
  }
  if (/^(\d)\1{5}$/.test(pin) || '0123456789'.includes(pin) || '9876543210'.includes(pin)) {
    return Response.json({ error: 'PIN terlalu mudah ditebak. Hindari angka berurutan atau berulang.' }, { status: 400 });
  }

  const sql = db();
  const me = (await sql`SELECT pin_hash, password_hash FROM users WHERE id = ${user.id}`)[0];
  // Bila PIN sudah pernah dibuat, wajib menyebut PIN lama; bila belum, pakai kata sandi
  if (me.pin_hash) {
    if (!await bcrypt.compare(String(b.lama || ''), me.pin_hash)) {
      return Response.json({ error: 'PIN lama salah.' }, { status: 403 });
    }
  } else {
    if (!await bcrypt.compare(String(b.password || ''), me.password_hash)) {
      return Response.json({ error: 'Kata sandi akun salah.' }, { status: 403 });
    }
  }
  const hash = await bcrypt.hash(pin, 10);
  await sql`UPDATE users SET pin_hash = ${hash}, pin_diubah_at = now() WHERE id = ${user.id}`;
  return Response.json({ ok: true });
}
