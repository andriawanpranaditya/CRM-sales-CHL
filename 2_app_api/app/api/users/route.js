import { db } from '@/lib/db';
import { requireUser, hapusCacheAkun } from '@/lib/auth';
import { denganLog } from '@/lib/log';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

// Semua peran Harmoni One (alur penjualan lintas divisi)
const ROLES = ['administrator', 'ceogrup', 'ceo', 'headsales', 'salesmanager', 'admin', 'markom', 'sales', 'adminsales', 'collection', 'finance', 'project', 'estate'];
// Peran CEO (dari CRM Sales) dimasukkan ke batasan kolom role pada database lama — sekali per instance
let peranSiap = false;
async function siapkanPeran(sql) {
  if (peranSiap) return;
  try {
    await sql`DO $$ DECLARE r record; BEGIN
      FOR r IN SELECT conname FROM pg_constraint WHERE conrelid = 'users'::regclass AND contype = 'c' LOOP
        EXECUTE 'ALTER TABLE users DROP CONSTRAINT ' || quote_ident(r.conname); END LOOP;
      ALTER TABLE users ADD CONSTRAINT users_role_chk CHECK (role IN ('administrator','ceogrup','ceo','headsales','salesmanager','admin','markom','sales','adminsales','collection','finance','project','estate'));
    END $$`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS projects text[]`;
    await sql`ALTER TABLE users ADD COLUMN IF NOT EXISTS rapor boolean DEFAULT true`;
    peranSiap = true;
  } catch (e) { console.error('siapkanPeran', e); }
}
// KPR Officer kini bagian dari divisi Collection — permintaan lama dialihkan
const samakan = r => (r === 'kpr' ? 'collection' : r);

export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  if (user.role === 'administrator') {
    await siapkanPeran(sql);
    const rows = await sql`SELECT id, username, name, role, email, wa, password_plain, active, jabatan, divisi, kode_petugas, (pin_hash IS NOT NULL) AS punya_pin, created_at, projects, COALESCE(rapor, true) AS rapor FROM users ORDER BY role, name`;
    return Response.json(rows);
  }
  if (user.role === 'markom') {
    // Markom hanya butuh daftar sales + nomor WA (utk Leads to Sales) — tanpa data sensitif
    let rows;
    try { rows = await sql`SELECT id, name, role, wa, projects FROM users WHERE role = 'sales' AND active = true ORDER BY name`; }
    catch { rows = await sql`SELECT id, name, role, wa FROM users WHERE role = 'sales' AND active = true ORDER BY name`; }
    if (user.projects) rows = rows.filter(s => !Array.isArray(s.projects) || !s.projects.length || s.projects.some(p => user.projects.includes(p)));
    return Response.json(rows);
  }
  return Response.json({ error: 'Hanya administrator' }, { status: 403 });
}

export async function POST(req) {
  const { err } = await requireUser('administrator'); if (err) return err;
  const b = await req.json();
  await siapkanPeran(db());
  if (!b.username || !b.name || !b.password) return Response.json({ error: 'Username, nama, dan password wajib diisi' }, { status: 400 });
  const role = samakan(b.role);
  if (!ROLES.includes(role)) {
    return Response.json({
      error: 'Peran "' + (b.role || '(kosong)') + '" tidak dikenali server. ' +
             'Muat ulang halaman; bila tetap terjadi, pembaruan aplikasi belum selesai terpasang.',
    }, { status: 400 });
  }
  const KODE_DIV = { 'Sales & Marketing': 'SM', 'HRGA': 'HR', 'Finance': 'FN', 'Legal': 'LG',
    'Project': 'PR', 'Estate': 'ES', 'IT': 'IT', 'Umum': 'UM' };
  const sql = db();
  const dupe = await sql`SELECT 1 FROM users WHERE lower(username) = ${String(b.username).toLowerCase()}`;
  if (dupe.length) return Response.json({ error: 'Username sudah dipakai' }, { status: 400 });
  const hash = await bcrypt.hash(b.password, 10);
  await sql`INSERT INTO users (username, name, role, password_hash, password_plain, email, wa)
    VALUES (${b.username}, ${b.name}, ${role}, ${hash}, ${role !== 'administrator' ? b.password : null}, ${b.email || ''}, ${b.wa || ''})`;
  const pp = Array.isArray(b.projects) ? b.projects.map(String).filter(Boolean) : [];
  if (pp.length && b.role !== 'administrator') await sql`UPDATE users SET projects = ${pp} WHERE lower(username) = ${String(b.username).toLowerCase()}`;
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { user, err } = await requireUser('administrator'); if (err) return err;
  const { searchParams } = new URL(req.url);
  const id = Number(searchParams.get('id'));
  if (!id) return Response.json({ error: 'id wajib' }, { status: 400 });
  if (id === Number(user.id)) return Response.json({ error: 'Tidak bisa menghapus akun sendiri' }, { status: 400 });
  const sql = db();
  const t = await sql`SELECT * FROM users WHERE id = ${id}`;
  if (!t.length) return Response.json({ error: 'Akun tidak ditemukan' }, { status: 404 });
  if (t[0].role === 'administrator') {
    const mgr = await sql`SELECT count(*)::int AS n FROM users WHERE role = 'administrator' AND active = true AND id <> ${id}`;
    if (!mgr[0].n) return Response.json({ error: 'Tidak bisa menghapus manager terakhir' }, { status: 400 });
  }
  await sql`DELETE FROM users WHERE id = ${id}`;
  // Catatan: riwayat lead/FU/transaksi atas nama user ini TETAP tersimpan (nama tersimpan sbg teks)
  return Response.json({ ok: true });
}

export async function PATCH(req) {
  const { user, err } = await requireUser('administrator'); if (err) return err;
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
  // Jabatan IOM (kadiv, budget, pceo, cfo, ceo, finance, treasury) & divisi asal
  if (b.jabatan !== undefined) {
    const J = ['', 'kadiv', 'budget', 'pceo', 'cfo', 'ceo', 'finance', 'treasury'];
    if (!J.includes(b.jabatan)) return Response.json({ error: 'Jabatan tidak dikenal' }, { status: 400 });
    await sql`UPDATE users SET jabatan = ${b.jabatan || null} WHERE id = ${b.id}`;
    return Response.json({ ok: true });
  }
  // Akses project per akun (kosong = semua project) & tampil di Rapor sales
  if (b.projects !== undefined) {
    await siapkanPeran(sql);
    const pp = Array.isArray(b.projects) ? b.projects.map(String).filter(Boolean) : [];
    await sql`UPDATE users SET projects = ${pp.length ? pp : null} WHERE id = ${b.id}`;
    hapusCacheAkun();
    return Response.json({ ok: true });
  }
  if (b.rapor !== undefined) {
    await siapkanPeran(sql);
    await sql`UPDATE users SET rapor = ${!!b.rapor} WHERE id = ${b.id}`;
    return Response.json({ ok: true });
  }
  if (b.divisi !== undefined) {
    await sql`UPDATE users SET divisi = ${b.divisi || null} WHERE id = ${b.id}`;
    return Response.json({ ok: true });
  }
  if (b.role !== undefined && !ROLES.includes(samakan(b.role))) {
    return Response.json({ error: 'Peran "' + b.role + '" tidak dikenali server.' }, { status: 400 });
  }
  if (b.role && ROLES.includes(samakan(b.role))) {
    await siapkanPeran(sql);
    hapusCacheAkun();
    if (Number(b.id) === Number(user.id)) return Response.json({ error: 'Tidak bisa mengubah peran akun sendiri' }, { status: 400 });
    if (b.role === 'administrator') await sql`UPDATE users SET role = 'administrator', password_plain = null WHERE id = ${b.id}`;
    else await sql`UPDATE users SET role = ${samakan(b.role)} WHERE id = ${b.id}`;
  }
  if (b.password) {
    const hash = await bcrypt.hash(b.password, 10);
    const t = await sql`SELECT role FROM users WHERE id = ${b.id}`;
    const plain = t[0] && t[0].role !== 'administrator' ? b.password : null;
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
