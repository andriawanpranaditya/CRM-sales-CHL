import { db } from '@/lib/db';
import { requireUser, bolehProyek, pesanProyek } from '@/lib/auth';
import { denganLog } from '@/lib/log';
import { statusUnit } from '@/lib/stok';

export const dynamic = 'force-dynamic';

// GET: posisi + status efektif SEMUA unit (dihitung di server, sehingga sales pun
// melihat peta stok lengkap tanpa akses ke data transaksi penuh)
export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const positions = await sql`SELECT project, unit, x, y FROM unit_positions`;
  const manual = await sql`SELECT project, unit, status, nama, sales, nilai FROM unit_manual`;
  const status = await statusUnit(sql, manual);
  // Akun per project: hanya peta & status unit project yang diizinkan
  const ok = r => bolehProyek(user, r.project);
  return Response.json({ positions: positions.filter(ok), manual: manual.filter(ok), status: status.filter(ok) });
}

// POST: simpan/pindah posisi unit — manager & CEO Project
async function _POST(req) {
  const { user, err } = await requireUser(['manager', 'ceo']); if (err) return err;
  const b = await req.json();
  if (b.project && !bolehProyek(user, b.project)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  if (!b.project || !b.unit || typeof b.x !== 'number' || typeof b.y !== 'number') {
    return Response.json({ error: 'project, unit, x, y wajib' }, { status: 400 });
  }
  const sql = db();
  await sql`INSERT INTO unit_positions (project, unit, x, y)
            VALUES (${b.project}, ${b.unit}, ${b.x}, ${b.y})
            ON CONFLICT (project, unit) DO UPDATE SET x = ${b.x}, y = ${b.y}`;
  return Response.json({ ok: true });
}

// PUT: status manual (Terjual/Reserved/Kosong; null = ikut transaksi) — manager & CEO Project
async function _PUT(req) {
  const { user, err } = await requireUser(['manager', 'ceo']); if (err) return err;
  const b = await req.json();
  if (b.project && !bolehProyek(user, b.project)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  if (!b.project || !b.unit) return Response.json({ error: 'project & unit wajib' }, { status: 400 });
  const sql = db();
  if (b.status === null || b.status === undefined || b.status === '') {
    await sql`DELETE FROM unit_manual WHERE project = ${b.project} AND unit = ${b.unit}`;
    return Response.json({ ok: true, mode: 'ikut-transaksi' });
  }
  if (!['Terjual', 'Reserved', 'Kosong'].includes(b.status)) {
    return Response.json({ error: 'Status tidak valid' }, { status: 400 });
  }
  const nama = typeof b.nama === 'string' ? b.nama.trim() : '';
  const salesM = typeof b.sales === 'string' ? b.sales.trim() : '';
  await sql`INSERT INTO unit_manual (project, unit, status, nama, sales, sumber)
            VALUES (${b.project}, ${b.unit}, ${b.status}, ${nama}, ${salesM}, 'manual')
            ON CONFLICT (project, unit) DO UPDATE SET status = ${b.status}, nama = ${nama}, sales = ${salesM}, sumber = 'manual', updated_at = now()`;
  return Response.json({ ok: true });
}

async function _DELETE(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.project || !b.unit) return Response.json({ error: 'project & unit wajib' }, { status: 400 });
  const sql = db();
  await sql`DELETE FROM unit_positions WHERE project = ${b.project} AND unit = ${b.unit}`;
  return Response.json({ ok: true });
}

// Log aktivitas: setiap aksi yang berhasil dicatat (siapa, kapan, apa) — lihat menu Log Aktivitas
export const POST = denganLog('Master Stock', _POST, ({ body }) => ({ aksi: 'Update', detail: [body.project, body.unit, 'posisi titik di peta'].join(' · ') }));
export const PUT = denganLog('Master Stock', _PUT, ({ body }) => ({ aksi: 'Update', detail: [body.project, body.unit, 'tanda: ' + (body.status || 'dilepas'), body.nama].filter(Boolean).join(' · ') }));
export const DELETE = denganLog('Master Stock', _DELETE);
