import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET status berkas: ?project&unit&lead_code  ->  { ktp, transfer, adaTrxSebelumnya }
// GET lihat berkas : ?view=1&project&unit&lead_code&jenis  ->  file
export async function GET(req) {
  const { err } = await requireUser(); if (err) return err;
  const sql = db();
  const q = new URL(req.url).searchParams;
  const project = q.get('project') || '', unit = q.get('unit') || '', lead = q.get('lead_code') || '';
  if (!project || !unit || !lead) return Response.json({ error: 'project, unit, lead_code wajib' }, { status: 400 });

  if (q.get('view') === '1') {
    const jenis = q.get('jenis');
    const rows = await sql`SELECT filename, mime, data FROM trx_files
      WHERE project = ${project} AND unit = ${unit} AND lead_code = ${lead} AND jenis = ${jenis}`;
    if (!rows.length) return new Response('Berkas belum diupload.', { status: 404 });
    const f = rows[0];
    return new Response(Buffer.from(f.data, 'base64'), {
      headers: {
        'Content-Type': f.mime || 'application/octet-stream',
        'Content-Disposition': 'inline; filename="' + (f.filename || 'berkas') + '"',
      },
    });
  }

  const rows = await sql`SELECT jenis FROM trx_files
    WHERE project = ${project} AND unit = ${unit} AND lead_code = ${lead}`;
  const trxAda = await sql`
    SELECT 1 FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE t.unit = ${unit} AND t.lead_code = ${lead}
      AND COALESCE(NULLIF(t.project, ''), l.project, '') = ${project} LIMIT 1`;
  return Response.json({
    ktp: rows.some(r => r.jenis === 'ktp'),
    transfer: rows.some(r => r.jenis === 'transfer'),
    adaTrxSebelumnya: trxAda.length > 0,
  });
}

// POST upload/replace berkas: { project, unit, lead_code, jenis, filename, mime, data(base64) }
export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.project || !b.unit || !b.lead_code) return Response.json({ error: 'Pilih lead, project & unit dulu' }, { status: 400 });
  if (!['ktp', 'transfer'].includes(b.jenis)) return Response.json({ error: 'Jenis berkas tidak valid' }, { status: 400 });
  if (!b.data) return Response.json({ error: 'File kosong' }, { status: 400 });
  if (b.data.length > 3_500_000) return Response.json({ error: 'File terlalu besar (maks ± 2,5 MB). Gunakan foto/PDF yang lebih kecil.' }, { status: 400 });
  const sql = db();
  await sql`INSERT INTO trx_files (project, unit, lead_code, jenis, filename, mime, data, uploaded_by)
    VALUES (${b.project}, ${b.unit}, ${b.lead_code}, ${b.jenis}, ${b.filename || ''}, ${b.mime || ''}, ${b.data}, ${user.username})
    ON CONFLICT (project, unit, lead_code, jenis)
    DO UPDATE SET filename = ${b.filename || ''}, mime = ${b.mime || ''}, data = ${b.data}, uploaded_by = ${user.username}, created_at = now()`;
  return Response.json({ ok: true });
}
