import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';

// GET status berkas: ?project&unit&lead_code  ->  { ktp, transfer, lainnya, adaTrxSebelumnya }
// Bukti transfer dan KTP wajib; satu slot tambahan untuk dokumen pendukung
// (NPWP, kartu keluarga, surat nikah, atau berkas lain yang dipersyaratkan).
// GET lihat berkas : ?view=1&project&unit&lead_code&jenis  ->  file
async function _GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const q = new URL(req.url).searchParams;
  const project = q.get('project') || '', unit = q.get('unit') || '', lead = q.get('lead_code') || '';
  if (!project || !unit || !lead) return jsonProyek(user, { error: 'project, unit, lead_code wajib' }, { status: 400 });

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
  // Transaksi yang sudah dibatalkan tidak dihitung: unit dianggap kembali kosong
  // sehingga transaksi baru tetap wajib mengunggah berkasnya sendiri.
  const trxAda = await sql`
    SELECT 1 FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE t.unit = ${unit} AND t.lead_code = ${lead} AND t.jenis <> 'Batal'
      AND COALESCE(NULLIF(t.project, ''), l.project, '') = ${project} LIMIT 1`;
  // Berkas terkunci setelah Admin Sales memverifikasi — tidak dapat diganti atau dihapus
  const terkunci = await sql`
    SELECT 1 FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE t.unit = ${unit} AND t.lead_code = ${lead} AND t.verif_status = 'Terverifikasi'
      AND COALESCE(NULLIF(t.project, ''), l.project, '') = ${project} LIMIT 1`;
  return jsonProyek(user, {
    ktp: rows.some(r => r.jenis === 'ktp'),
    transfer: rows.some(r => r.jenis === 'transfer'),
    npwp: rows.some(r => r.jenis === 'npwp'),
    npwp: rows.some(r => r.jenis === 'npwp'),
    lainnya: rows.some(r => r.jenis === 'lainnya'),
    adaTrxSebelumnya: trxAda.length > 0,
    terkunci: terkunci.length > 0,
  });
}

// POST upload/replace berkas: { project, unit, lead_code, jenis, filename, mime, data(base64) }
async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.project || !b.unit || !b.lead_code) return Response.json({ error: 'Pilih lead, project & unit dulu' }, { status: 400 });
  if (!['ktp', 'transfer', 'npwp', 'lainnya'].includes(b.jenis)) return Response.json({ error: 'Jenis berkas tidak valid' }, { status: 400 });
  if (!b.data) return Response.json({ error: 'File kosong' }, { status: 400 });
  if (b.data.length > 3_500_000) return Response.json({ error: 'File terlalu besar (maks ± 2,5 MB). Gunakan foto/PDF yang lebih kecil.' }, { status: 400 });
  const sql = db();
  await sql`INSERT INTO trx_files (project, unit, lead_code, jenis, filename, mime, data, uploaded_by)
    VALUES (${b.project}, ${b.unit}, ${b.lead_code}, ${b.jenis}, ${b.filename || ''}, ${b.mime || ''}, ${b.data}, ${user.username})
    ON CONFLICT (project, unit, lead_code, jenis)
    DO UPDATE SET filename = ${b.filename || ''}, mime = ${b.mime || ''}, data = ${b.data}, uploaded_by = ${user.username}, created_at = now()`;
  return Response.json({ ok: true });
}

// DELETE berkas: { project, unit, lead_code, jenis }
// Hanya selama transaksi belum diverifikasi Admin Sales. Setelah terverifikasi
// berkas menjadi lampiran dokumen resmi sehingga tidak boleh diubah.
async function _DELETE(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  const { project = '', unit = '', lead_code = '', jenis = '' } = b;
  if (!project || !unit || !lead_code || !jenis) {
    return Response.json({ error: 'project, unit, lead_code, jenis wajib' }, { status: 400 });
  }
  const sql = db();
  const terkunci = await sql`
    SELECT 1 FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE t.unit = ${unit} AND t.lead_code = ${lead_code} AND t.verif_status = 'Terverifikasi'
      AND COALESCE(NULLIF(t.project, ''), l.project, '') = ${project} LIMIT 1`;
  if (terkunci.length && !['administrator', 'headsales', 'salesmanager'].includes(user.role)) {
    return Response.json({ error: 'Berkas terkunci — transaksi sudah diverifikasi Admin Sales.' }, { status: 403 });
  }
  await sql`DELETE FROM trx_files
    WHERE project = ${project} AND unit = ${unit} AND lead_code = ${lead_code} AND jenis = ${jenis}`;
  return Response.json({ ok: true });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, {});
export const POST = jagaProyek(_POST, {});
export const DELETE = jagaProyek(_DELETE, {});
