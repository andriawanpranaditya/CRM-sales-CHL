import { db } from '@/lib/db';
import { requireUser, bolehProyek, pesanProyek } from '@/lib/auth';
import { denganLog } from '@/lib/log';
import { bolehDigital } from '@/lib/digital-akses';
import { statusUnit } from '@/lib/stok';
import { gabungJenis, gabungHold, kunciUnit, LABEL_JENIS } from '@/lib/jenis-unit';

const bacaHold = async sql => { try { const r = await sql`SELECT items FROM settings WHERE key = 'unit_hold'`; return (r[0] && r[0].items && typeof r[0].items === 'object') ? r[0].items : {}; } catch { return {}; } };
const bacaJenis = async sql => { try { const r = await sql`SELECT items FROM settings WHERE key = 'unit_jenis'`; return (r[0] && r[0].items && typeof r[0].items === 'object') ? r[0].items : {}; } catch { return {}; } };

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
  const jenis = Object.fromEntries(Object.entries(gabungJenis(await bacaJenis(sql))).filter(([p]) => bolehProyek(user, p)));
  return Response.json({ positions: positions.filter(ok), manual: manual.filter(ok), status: status.filter(ok), jenis,
    hold: Object.fromEntries(Object.entries(gabungHold(await bacaHold(sql))).filter(([p]) => bolehProyek(user, p))) });
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
  // Hold oleh manajemen (true = ditahan, false = dilepas) — terpisah dari status jual
  if (b.hold !== undefined) {
    // Membuka hold hanya oleh Head of Sales & Marketing; menahan unit boleh Manager / CEO
    if (!b.hold && !bolehDigital(user)) return Response.json({ error: 'Hold manajemen hanya bisa dibuka oleh Head of Sales & Marketing' }, { status: 403 });
    const simpan = await bacaHold(sql);
    simpan[b.project] = { ...(simpan[b.project] || {}) };
    for (const k of Object.keys(simpan[b.project])) if (kunciUnit(k) === kunciUnit(b.unit)) delete simpan[b.project][k];
    simpan[b.project][b.unit] = !!b.hold; // false disimpan juga supaya hold bawaan bisa dilepas
    await sql`INSERT INTO settings (key, items) VALUES ('unit_hold', ${JSON.stringify(simpan)})
              ON CONFLICT (key) DO UPDATE SET items = ${JSON.stringify(simpan)}`;
    return Response.json({ ok: true, hold: !!b.hold });
  }
  // Tanda jenis unit (Show Unit / Kavling) — terpisah dari status jual, jadi unit kavling tetap bisa Terjual / Reserved
  if (b.jenis !== undefined) {
    const j = LABEL_JENIS[b.jenis] ? b.jenis : '';
    const simpan = await bacaJenis(sql);
    simpan[b.project] = { ...(simpan[b.project] || {}) };
    for (const k of Object.keys(simpan[b.project])) if (kunciUnit(k) === kunciUnit(b.unit)) delete simpan[b.project][k];
    simpan[b.project][b.unit] = j; // '' disimpan juga supaya tanda bawaan bisa dilepas
    await sql`INSERT INTO settings (key, items) VALUES ('unit_jenis', ${JSON.stringify(simpan)})
              ON CONFLICT (key) DO UPDATE SET items = ${JSON.stringify(simpan)}`;
    return Response.json({ ok: true, jenis: j });
  }
  if (b.status === null || b.status === undefined || b.status === '') {
    await sql`DELETE FROM unit_manual WHERE project = ${b.project} AND unit = ${b.unit}`;
    return Response.json({ ok: true, mode: 'ikut-transaksi' });
  }
  if (!['Terjual', 'Reserved', 'Kosong'].includes(b.status)) {
    return Response.json({ error: 'Status tidak valid' }, { status: 400 });
  }
  // Unit yang di-hold manajemen tidak bisa ditandai Terjual / Reserved sebelum hold-nya dibuka
  if (b.status !== 'Kosong' && !!gabungHold(await bacaHold(sql))[b.project]?.[kunciUnit(b.unit)]) {
    const kini = (await statusUnit(sql)).find(x => x.project === b.project && x.unit === b.unit);
    if (kini && kini.warna === 'biru') return Response.json({ error: 'Unit ' + b.unit + ' sedang di-hold manajemen — buka hold-nya dulu (Head of Sales & Marketing)' }, { status: 400 });
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
export const PUT = denganLog('Master Stock', _PUT, ({ body }) => ({ aksi: 'Update', detail: [body.project, body.unit, body.hold !== undefined ? (body.hold ? 'hold manajemen' : 'hold dilepas') : body.jenis !== undefined ? 'jenis: ' + (body.jenis || 'unit biasa') : 'tanda: ' + (body.status || 'dilepas'), body.nama].filter(Boolean).join(' · ') }));
export const DELETE = denganLog('Master Stock', _DELETE);
