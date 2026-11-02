import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { createHash } from 'crypto';

export const dynamic = 'force-dynamic';

// Lampiran memo dibatasi PDF agar isinya tidak berubah setelah diunggah
// dan dapat dijamin keasliannya lewat sidik digital.
const MIME_OK = ['application/pdf'];
const EXT_OK = ['pdf'];
const BATAS = 4 * 1024 * 1024;   // 4 MB per berkas

// GET ?iom_id=  → daftar lampiran; GET ?id=  → unduh satu berkas
export async function GET(req) {
  const { err } = await requireUser(); if (err) return err;
  const sql = db();
  const q = new URL(req.url).searchParams;

  const id = q.get('id');
  if (id) {
    const r = await sql`SELECT filename, mime, data FROM iom_files WHERE id = ${id}`;
    if (!r.length) return new Response('Lampiran tidak ditemukan.', { status: 404 });
    const f = r[0];
    const namaAman = String(f.filename || 'lampiran').replace(/"/g, '');
    return new Response(Buffer.from(f.data, 'base64'), {
      headers: {
        'Content-Type': f.mime || 'application/octet-stream',
        'Content-Disposition': 'inline; filename="' + namaAman + '"',
      },
    });
  }

  const iomId = q.get('iom_id');
  if (!iomId) return Response.json({ error: 'iom_id wajib' }, { status: 400 });
  const rows = await sql`SELECT id, filename, mime, ukuran, uploaded_by, sidik, created_at
    FROM iom_files WHERE iom_id = ${iomId} ORDER BY id`;
  return Response.json({ rows });
}

// POST { iom_id, filename, mime, data } — data berupa base64 tanpa awalan
export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.iom_id || !b.filename || !b.data) {
    return Response.json({ error: 'iom_id, filename, dan data wajib' }, { status: 400 });
  }
  const ext = String(b.filename).split('.').pop().toLowerCase();
  if (!EXT_OK.includes(ext) || (b.mime && !MIME_OK.includes(b.mime))) {
    return Response.json({ error: 'Lampiran harus berformat PDF. Simpan dokumen Word/Excel sebagai PDF terlebih dahulu.' }, { status: 400 });
  }
  const ukuran = Math.round(String(b.data).length * 3 / 4);
  if (ukuran > BATAS) {
    return Response.json({ error: 'Ukuran berkas melebihi 4 MB. Kompres atau pecah berkasnya.' }, { status: 400 });
  }

  const sql = db();
  const ada = await sql`SELECT id FROM iom WHERE id = ${b.iom_id}`;
  if (!ada.length) return Response.json({ error: 'IOM tidak ditemukan' }, { status: 404 });
  const jml = await sql`SELECT count(*)::int AS n FROM iom_files WHERE iom_id = ${b.iom_id}`;
  if (jml[0].n >= 8) return Response.json({ error: 'Maksimal 8 lampiran per memo.' }, { status: 400 });

  // Sidik digital: penanda isi berkas. Bila berkas ditukar, sidiknya berubah.
  const sidik = createHash('sha256').update(Buffer.from(b.data, 'base64')).digest('hex').slice(0, 16).toUpperCase();
  await sql`INSERT INTO iom_files (iom_id, filename, mime, ukuran, data, uploaded_by, sidik)
    VALUES (${b.iom_id}, ${b.filename}, ${b.mime || 'application/pdf'}, ${ukuran}, ${b.data}, ${user.name}, ${sidik})`;
  return Response.json({ ok: true, sidik });
}

// DELETE { id } — hanya pengunggah atau manager
export async function DELETE(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  const r = await sql`SELECT uploaded_by FROM iom_files WHERE id = ${b.id}`;
  if (!r.length) return Response.json({ error: 'Lampiran tidak ditemukan' }, { status: 404 });
  if (r[0].uploaded_by !== user.name && user.role !== 'manager') {
    return Response.json({ error: 'Hanya pengunggah yang dapat menghapus lampiran ini.' }, { status: 403 });
  }
  await sql`DELETE FROM iom_files WHERE id = ${b.id}`;
  return Response.json({ ok: true });
}
