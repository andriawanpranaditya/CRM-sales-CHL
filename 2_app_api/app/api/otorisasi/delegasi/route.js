import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import bcrypt from 'bcryptjs';

export const dynamic = 'force-dynamic';

// Delegasi wewenang otorisasi saat pejabat berhalangan.
// Ditunjuk oleh pejabat itu sendiri dengan PIN-nya — bukan oleh administrator,
// agar lapis pengaman tidak dapat ditembus dari sisi pengelola sistem.
export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const rows = ['administrator', 'headsales', 'salesmanager'].includes(user.role)
    ? await sql`SELECT d.*, d.mulai::text AS mulai, d.selesai::text AS selesai,
          p.name AS pemberi_nama, p.kode_petugas AS pemberi_kode,
          g.name AS pengganti_nama, g.kode_petugas AS pengganti_kode
        FROM delegasi d JOIN users p ON p.id = d.pemberi_id JOIN users g ON g.id = d.pengganti_id
        ORDER BY d.id DESC LIMIT 100`
    : await sql`SELECT d.*, d.mulai::text AS mulai, d.selesai::text AS selesai,
          p.name AS pemberi_nama, p.kode_petugas AS pemberi_kode,
          g.name AS pengganti_nama, g.kode_petugas AS pengganti_kode
        FROM delegasi d JOIN users p ON p.id = d.pemberi_id JOIN users g ON g.id = d.pengganti_id
        WHERE d.pemberi_id = ${user.id} OR d.pengganti_id = ${user.id}
        ORDER BY d.id DESC LIMIT 100`;
  const calon = await sql`SELECT id, name, kode_petugas, jabatan, divisi, role FROM users
    WHERE active = true AND id <> ${user.id} ORDER BY name`;
  return Response.json({ rows, calon });
}

export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  const sql = db();
  const me = (await sql`SELECT id, name, jabatan, divisi, pin_hash FROM users WHERE id = ${user.id}`)[0];

  const darurat = !!b.darurat;
  if (darurat) {
    // Jalur darurat hanya untuk administrator, dan tercatat sebagai kejadian khusus
    if (!['administrator', 'headsales', 'salesmanager'].includes(user.role)) {
      return Response.json({ error: 'Hanya Administrator yang dapat membuka delegasi darurat.' }, { status: 403 });
    }
    if (!b.pemberi_id || !String(b.alasan || '').trim()) {
      return Response.json({ error: 'Pejabat yang berhalangan dan alasan wajib diisi.' }, { status: 400 });
    }
  } else {
    if (!me.jabatan) return Response.json({ error: 'Anda tidak memegang jabatan otorisasi.' }, { status: 403 });
    if (!me.pin_hash) return Response.json({ error: 'Tetapkan PIN otorisasi Anda lebih dulu.' }, { status: 400 });
    if (!await bcrypt.compare(String(b.pin || ''), me.pin_hash)) {
      return Response.json({ error: 'PIN otorisasi salah.' }, { status: 403 });
    }
  }
  if (!b.pengganti_id || !b.mulai || !b.selesai) {
    return Response.json({ error: 'Pengganti, tanggal mulai, dan tanggal selesai wajib diisi.' }, { status: 400 });
  }
  if (b.selesai < b.mulai) return Response.json({ error: 'Tanggal selesai mendahului tanggal mulai.' }, { status: 400 });

  const pemberiId = darurat ? Number(b.pemberi_id) : me.id;
  const pemberi = (await sql`SELECT id, name, jabatan, divisi FROM users WHERE id = ${pemberiId}`)[0];
  if (!pemberi || !pemberi.jabatan) {
    return Response.json({ error: 'Pejabat tidak ditemukan atau tidak memegang jabatan otorisasi.' }, { status: 400 });
  }
  if (Number(b.pengganti_id) === pemberiId) {
    return Response.json({ error: 'Pengganti tidak boleh orang yang sama.' }, { status: 400 });
  }
  // Pengganti tidak boleh sedang menjadi pengganti orang lain untuk jabatan sama
  const berantai = await sql`SELECT 1 FROM delegasi
    WHERE pemberi_id = ${Number(b.pengganti_id)} AND jabatan = ${pemberi.jabatan} AND aktif = true
      AND CURRENT_DATE BETWEEN mulai AND selesai`;
  if (berantai.length) {
    return Response.json({ error: 'Calon pengganti sedang mendelegasikan wewenangnya sendiri. Pilih orang lain.' }, { status: 400 });
  }

  await sql`INSERT INTO delegasi (pemberi_id, pengganti_id, jabatan, divisi, mulai, selesai, alasan, darurat, dibuka_oleh)
    VALUES (${pemberiId}, ${Number(b.pengganti_id)}, ${pemberi.jabatan}, ${pemberi.divisi || null},
            ${b.mulai}, ${b.selesai}, ${b.alasan || ''}, ${darurat}, ${darurat ? me.name : null})`;

  const g = await sql`SELECT role, name FROM users WHERE id = ${Number(b.pengganti_id)}`;
  if (g.length) {
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan)
      VALUES (${g[0].role}, 'Anda menerima wewenang otorisasi',
              ${'Mewakili ' + pemberi.name + ' (' + pemberi.jabatan + ') pada ' + b.mulai + ' s/d ' + b.selesai})`;
  }
  return Response.json({ ok: true });
}

// Akhiri delegasi lebih awal
export async function PATCH(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  const sql = db();
  const d = (await sql`SELECT * FROM delegasi WHERE id = ${b.id}`)[0];
  if (!d) return Response.json({ error: 'Delegasi tidak ditemukan' }, { status: 404 });
  if (d.pemberi_id !== user.id && !['administrator', 'headsales', 'salesmanager'].includes(user.role)) {
    return Response.json({ error: 'Hanya pemberi wewenang yang dapat mengakhirinya.' }, { status: 403 });
  }
  await sql`UPDATE delegasi SET aktif = false WHERE id = ${b.id}`;
  return Response.json({ ok: true });
}
