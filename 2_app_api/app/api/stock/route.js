import { db } from '@/lib/db';
import { requireUser, bolehProyek, pesanProyek } from '@/lib/auth';
import { denganLog } from '@/lib/log';
import { statusUnit } from '@/lib/stok';
import { siapkanSkemaCRM } from '@/lib/skema-crm';

export const dynamic = 'force-dynamic';

// Peran yang boleh menandai & mengubah peta stok (Administrator, CEO, Admin Sales)
const BOLEH_KELOLA = ['administrator', 'headsales', 'salesmanager', 'ceo', 'ceogrup', 'adminsales'];
async function bolehKelola() {
  const { user, err } = await requireUser();
  if (err) return { err };
  if (!BOLEH_KELOLA.includes(user.role)) {
    return { err: Response.json({ error: 'Hanya Administrator, CEO & Admin Sales yang dapat mengubah Master Stock.' }, { status: 403 }) };
  }
  return { user };
}

// GET: posisi titik, tanda manual, dan status unit (transaksi terakhir per unit; Batal & reservasi kedaluwarsa = tersedia;
// tanda manual menimpa — aturan sama dengan Beranda & laporan)
export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  try { await siapkanSkemaCRM(sql); } catch {}
  const positions = await sql`SELECT project, unit, x, y FROM unit_positions`;
  const manual = await sql`SELECT project, unit, status, nama, sales, nilai FROM unit_manual`;
  const status = await statusUnit(sql, manual);
  const ok = r => bolehProyek(user, r.project);
  return Response.json({ positions: positions.filter(ok), manual: manual.filter(ok), status: status.filter(ok) });
}

// POST: simpan/pindah posisi unit
async function _POST(req) {
  const { user, err } = await bolehKelola(); if (err) return err;
  const b = await req.json();
  if (!b.project || !b.unit || typeof b.x !== 'number' || typeof b.y !== 'number') {
    return Response.json({ error: 'project, unit, x, y wajib' }, { status: 400 });
  }
  if (!bolehProyek(user, b.project)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  const sql = db();
  await sql`INSERT INTO unit_positions (project, unit, x, y)
            VALUES (${b.project}, ${b.unit}, ${b.x}, ${b.y})
            ON CONFLICT (project, unit) DO UPDATE SET x = ${b.x}, y = ${b.y}`;
  return Response.json({ ok: true });
}

// PUT: status manual (Terjual/Reserved/Kosong; null = ikut transaksi) + nama pembeli & sales/agent
async function _PUT(req) {
  const { user, err } = await bolehKelola(); if (err) return err;
  const b = await req.json();
  if (!b.project || !b.unit) return Response.json({ error: 'project & unit wajib' }, { status: 400 });
  if (!bolehProyek(user, b.project)) return Response.json({ error: pesanProyek(user) }, { status: 403 });
  const sql = db();
  try { await siapkanSkemaCRM(sql); } catch {}
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

// DELETE: hapus titik unit dari peta (Administrator & Admin Sales)
async function _DELETE(req) {
  const { user, err } = await bolehKelola(); if (err) return err;
  if (['ceo', 'salesmanager', 'ceogrup'].includes(user.role)) return Response.json({ error: 'CEO tidak dapat menghapus titik peta' }, { status: 403 });
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
