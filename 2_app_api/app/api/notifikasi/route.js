import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Notifikasi sengaja dibuat seperlunya: hanya hal yang menuntut tindakan divisi
// (berkas baru masuk, berkas dikembalikan, komisi menunggu diproses).
// Pemantauan posisi berkas dilakukan lewat menu Papan Alur, bukan lonceng.
// Manager melihat kotak masuk semua divisi, jadi pesan kembar digabung satu baris.
export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();

  if (user.role === 'manager') {
    const rows = await sql`
      SELECT max(id)::int AS id, judul, pesan, max(lead_code) AS lead_code, trx_id,
             bool_and(dibaca) AS dibaca,
             count(DISTINCT role_tujuan)::int AS jml_divisi,
             string_agg(DISTINCT role_tujuan, ', ') AS divisi,
             max(created_at) AS created_at
      FROM notifikasi
      GROUP BY judul, pesan, trx_id
      ORDER BY bool_and(dibaca) ASC, max(id) DESC
      LIMIT 60`;
    return Response.json({ rows, belum: rows.filter(r => !r.dibaca).length });
  }

  const rows = await sql`SELECT * FROM notifikasi WHERE role_tujuan = ${user.role}
              ORDER BY dibaca ASC, id DESC LIMIT 60`;
  return Response.json({ rows, belum: rows.filter(r => !r.dibaca).length });
}

// Tandai terbaca — { id } satu notifikasi, atau { semua: true }.
// Untuk manager, menandai satu baris ikut menutup salinannya di divisi lain.
export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  const sql = db();

  if (b.semua) {
    if (user.role === 'manager') await sql`UPDATE notifikasi SET dibaca = true WHERE dibaca = false`;
    else await sql`UPDATE notifikasi SET dibaca = true WHERE role_tujuan = ${user.role} AND dibaca = false`;
    return Response.json({ ok: true });
  }
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });

  if (user.role === 'manager') {
    await sql`UPDATE notifikasi SET dibaca = true
      WHERE (judul, COALESCE(pesan, ''), COALESCE(trx_id, 0)) IN (
        SELECT judul, COALESCE(pesan, ''), COALESCE(trx_id, 0) FROM notifikasi WHERE id = ${b.id})`;
    return Response.json({ ok: true });
  }
  await sql`UPDATE notifikasi SET dibaca = true WHERE id = ${b.id} AND role_tujuan = ${user.role}`;
  return Response.json({ ok: true });
}
