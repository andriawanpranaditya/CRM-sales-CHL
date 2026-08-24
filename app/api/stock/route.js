import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET: posisi + status efektif SEMUA unit (dihitung di server, sehingga sales pun
// melihat peta stok lengkap tanpa akses ke data transaksi penuh)
export async function GET() {
  const { err } = await requireUser(); if (err) return err;
  const sql = db();
  const positions = await sql`SELECT project, unit, x, y FROM unit_positions`;
  const manual = await sql`SELECT project, unit, status FROM unit_manual`;
  const trx = await sql`
    SELECT t.id, t.jenis, t.unit, t.lead_code, l.nama,
           COALESCE(NULLIF(t.project, ''), l.project, '') AS project
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE t.unit IS NOT NULL AND t.unit <> ''
    ORDER BY t.id`;

  // Transaksi terakhir per unit menentukan warna; manual menimpa
  const m = {};
  trx.forEach(t => {
    if (!t.project) return;
    const key = t.project + '|' + t.unit;
    if (t.jenis === 'Batal') m[key] = null;
    else if (t.jenis === 'Reserved') m[key] = { warna: 'kuning', info: 'Reserved' + (t.nama ? ' — ' + t.nama : ''), manual: false, lead_code: t.lead_code };
    else m[key] = { warna: 'merah', info: t.jenis + (t.nama ? ' — ' + t.nama : ''), manual: false, lead_code: t.lead_code };
  });
  manual.forEach(x => {
    const key = x.project + '|' + x.unit;
    const pemilik = (m[key] && m[key].lead_code) || null; // unit ber-transaksi tetap ingat lead pemiliknya
    if (x.status === 'Terjual') m[key] = { warna: 'merah', info: 'Terjual (manual)', manual: true, lead_code: pemilik };
    else if (x.status === 'Reserved') m[key] = { warna: 'kuning', info: 'Reserved (manual)', manual: true, lead_code: pemilik };
    else m[key] = null;
  });
  const status = Object.entries(m)
    .filter(([, v]) => v)
    .map(([k, v]) => ({ project: k.split('|')[0], unit: k.split('|')[1], ...v }));

  return Response.json({ positions, manual, status });
}

// POST: simpan/pindah posisi unit — khusus manager
export async function POST(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.project || !b.unit || typeof b.x !== 'number' || typeof b.y !== 'number') {
    return Response.json({ error: 'project, unit, x, y wajib' }, { status: 400 });
  }
  const sql = db();
  await sql`INSERT INTO unit_positions (project, unit, x, y)
            VALUES (${b.project}, ${b.unit}, ${b.x}, ${b.y})
            ON CONFLICT (project, unit) DO UPDATE SET x = ${b.x}, y = ${b.y}`;
  return Response.json({ ok: true });
}

// PUT: status manual (Terjual/Reserved/Kosong; null = ikut transaksi) — khusus manager
export async function PUT(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.project || !b.unit) return Response.json({ error: 'project & unit wajib' }, { status: 400 });
  const sql = db();
  if (b.status === null || b.status === undefined || b.status === '') {
    await sql`DELETE FROM unit_manual WHERE project = ${b.project} AND unit = ${b.unit}`;
    return Response.json({ ok: true, mode: 'ikut-transaksi' });
  }
  if (!['Terjual', 'Reserved', 'Kosong'].includes(b.status)) {
    return Response.json({ error: 'Status tidak valid' }, { status: 400 });
  }
  await sql`INSERT INTO unit_manual (project, unit, status)
            VALUES (${b.project}, ${b.unit}, ${b.status})
            ON CONFLICT (project, unit) DO UPDATE SET status = ${b.status}, updated_at = now()`;
  return Response.json({ ok: true });
}

export async function DELETE(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.project || !b.unit) return Response.json({ error: 'project & unit wajib' }, { status: 400 });
  const sql = db();
  await sql`DELETE FROM unit_positions WHERE project = ${b.project} AND unit = ${b.unit}`;
  return Response.json({ ok: true });
}
