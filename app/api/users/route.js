import { db } from '@/lib/db';
import { requireUser, hapusCacheAkun } from '@/lib/auth';
import bcrypt from 'bcryptjs';
import { denganLog } from '@/lib/log';

export const dynamic = 'force-dynamic';

// Peran 'ceo' (CEO Project) ditambahkan ke batasan kolom role — sekali per cold start, aman diulang
let peranSiap = false;
async function siapkanPeran(sql) {
  if (peranSiap) return;
  try {
    await sql`ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check`;
    await sql`ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('manager','ceo','admin','markom','sales'))`;
    peranSiap = true;
  } catch (e) { console.error('siapkanPeran', e); }
}

export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  if (user.role === 'manager') {
    let rows;
    try { rows = await sql`SELECT id, username, name, role, email, wa, password_plain, active, created_at, projects FROM users ORDER BY role, name`; }
    catch { rows = await sql`SELECT id, username, name, role, email, wa, password_plain, active, created_at FROM users ORDER BY role, name`; }
    return Response.json(rows);
  }
  if (user.role === 'markom') {
    // Markom hanya butuh daftar sales + nomor WA (utk Leads to Sales) — tanpa data sensitif
    let rows;
    try { rows = await sql`SELECT id, name, role, wa, projects FROM users WHERE role = 'sales' AND active = true ORDER BY name`; }
    catch { rows = await sql`SELECT id, name, role, wa FROM users WHERE role = 'sales' AND active = true ORDER BY name`; }
    // Marcom per project hanya melihat sales yang memegang project yang sama
    if (user.projects) rows = rows.filter(s => !Array.isArray(s.projects) || !s.projects.length || s.projects.some(p => user.projects.includes(p)));
    return Response.json(rows);
  }
  return Response.json({ error: 'Hanya manager' }, { status: 403 });
}

async function _POST(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.username || !b.name || !b.password) return Response.json({ error: 'Username, nama, dan password wajib diisi' }, { status: 400 });
  const role = ['manager', 'ceo', 'admin', 'markom', 'sales'].includes(b.role) ? b.role : 'sales';
  const sql = db();
  const dupe = await sql`SELECT 1 FROM users WHERE lower(username) = ${String(b.username).toLowerCase()}`;
  if (dupe.length) return Response.json({ error: 'Username sudah dipakai' }, { status: 400 });
  const hash = await bcrypt.hash(b.password, 10);
  if (role === 'ceo') await siapkanPeran(sql);
  await sql`INSERT INTO users (username, name, role, password_hash, password_plain, email, wa)
    VALUES (${b.username}, ${b.name}, ${role}, ${hash}, ${role !== 'manager' ? b.password : null}, ${b.email || ''}, ${b.wa || ''})`;
  const pp = Array.isArray(b.projects) ? b.projects.map(String).filter(Boolean) : [];
  if (pp.length && role !== 'manager') {
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS projects text[]`; } catch {}
    await sql`UPDATE users SET projects = ${pp} WHERE lower(username) = ${String(b.username).toLowerCase()}`;
  }
  return Response.json({ ok: true });
}

async function _DELETE(req) {
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
  // Akun Marcom yang sudah punya data TIDAK dihapus permanen, melainkan dinonaktifkan:
  // laporan & Analisa Marcom mengenali "lead dari Marcom" lewat peran akun penginputnya — bila akunnya
  // dihapus, lead-lead tsb kehilangan label Marcom dan hilang dari akses tim marcom.
  if (t[0].role === 'markom') {
    const u = t[0].username;
    const ada = await sql`SELECT (SELECT count(*) FROM leads WHERE created_by = ${u})::int
      + (SELECT count(*) FROM followups WHERE created_by = ${u})::int AS n`;
    let n = ada[0]?.n || 0;
    try { n += (await sql`SELECT (SELECT count(*) FROM mi_contents WHERE created_by = ${u})::int + (SELECT count(*) FROM mi_ads WHERE created_by = ${u})::int AS n`)[0]?.n || 0; } catch {}
    if (n > 0) {
      await sql`UPDATE users SET active = false WHERE id = ${id}`;
      return Response.json({ ok: true, dinonaktifkan: true, nama: t[0].name,
        pesan: `Akun ${t[0].name} punya ${n} data (lead/FU/konten/iklan) sehingga DINONAKTIFKAN, bukan dihapus — tidak bisa login lagi, tetapi datanya tetap terhubung sebagai data tim Marcom.` });
    }
  }
  await sql`DELETE FROM users WHERE id = ${id}`;
  // Catatan: riwayat lead/FU/transaksi atas nama user ini TETAP tersimpan (nama tersimpan sbg teks)
  return Response.json({ ok: true, nama: t[0].name });
}

async function _PATCH(req) {
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
  if (b.role && ['manager', 'ceo', 'admin', 'markom', 'sales'].includes(b.role)) {
    if (Number(b.id) === Number(user.id)) return Response.json({ error: 'Tidak bisa mengubah peran akun sendiri' }, { status: 400 });
    if (b.role === 'ceo') await siapkanPeran(sql);
    if (b.role === 'manager') await sql`UPDATE users SET role = 'manager', password_plain = null WHERE id = ${b.id}`;
    else await sql`UPDATE users SET role = ${b.role} WHERE id = ${b.id}`;
  }
  if (b.password) {
    const hash = await bcrypt.hash(b.password, 10);
    const t = await sql`SELECT role FROM users WHERE id = ${b.id}`;
    const plain = t[0] && t[0].role !== 'manager' ? b.password : null;
    await sql`UPDATE users SET password_hash = ${hash}, password_plain = ${plain} WHERE id = ${b.id}`;
  }
  // Akses per project: [] / null = semua project
  if (Array.isArray(b.projects)) {
    const pp = b.projects.map(String).filter(Boolean);
    try { await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS projects text[]`; } catch {}
    await sql`UPDATE users SET projects = ${pp.length ? pp : null} WHERE id = ${b.id}`;
  }
  const nm = await sql`SELECT name, username FROM users WHERE id = ${b.id}`;
  hapusCacheAkun(nm[0]?.username);
  return Response.json({ ok: true, nama: nm[0]?.name || '' });
}

// Ganti password SENDIRI (semua role, termasuk sales dari Form Input)
async function _PUT(req) {
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

// Log aktivitas: setiap aksi yang berhasil dicatat (siapa, kapan, apa) — lihat menu Log Aktivitas
export const POST = denganLog('Pengguna', _POST, ({ body }) => ({ aksi: 'Input', detail: `akun baru ${body.username} (${body.name}) · peran ${body.role || 'sales'}` + (Array.isArray(body.projects) && body.projects.length ? ' · project ' + body.projects.join(', ') : '') }));
export const DELETE = denganLog('Pengguna', _DELETE, ({ out }) => ({ aksi: out.dinonaktifkan ? 'Nonaktifkan' : 'Hapus', detail: `akun ${out.nama || ''}` + (out.dinonaktifkan ? ' · punya data, dinonaktifkan agar data tetap terhubung' : '') }));
export const PATCH = denganLog('Pengguna', _PATCH, ({ body, out }) => ({ detail: [`akun ${out.nama || ('id ' + body.id)}`, typeof body.active === 'boolean' ? (body.active ? 'diaktifkan' : 'dinonaktifkan') : '', body.role ? 'peran → ' + body.role : '', body.password ? 'reset password' : '', typeof body.email === 'string' ? 'email' : '', typeof body.wa === 'string' ? 'no. WA' : '', Array.isArray(body.projects) ? 'project → ' + (body.projects.length ? body.projects.join(', ') : 'semua') : ''].filter(Boolean).join(' · ') }));
export const PUT = denganLog('Pengguna', _PUT, () => ({ aksi: 'Ganti password', detail: 'password sendiri' }));
