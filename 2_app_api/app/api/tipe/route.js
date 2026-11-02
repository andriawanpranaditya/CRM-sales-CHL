import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';
const BOLEH_UBAH = ['administrator', 'headsales', 'salesmanager', 'adminsales'];
const n0 = v => Math.max(0, Math.round(Number(v) || 0));

// Master tipe unit: atribut standar & harga yang diwarisi unit-unit bertipe sama
async function _GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const project = new URL(req.url).searchParams.get('project') || '';
  const sql = db();
  const rows = await sql`SELECT t.*, (SELECT count(*)::int FROM unit_harga u WHERE u.project = t.project AND u.tipe = t.tipe) AS jumlah_unit
    FROM tipe_unit t WHERE t.project = ${project} ORDER BY t.urutan, t.tipe`;
  return jsonProyek(user, { rows });
}

// POST { project, rows: [{ tipe, keterangan, sub_tipe, lb, lt, dimensi, arah, ppn_dtp, harga_list, harga_standar, harga_allin, booking_fee, uang_muka, plafon_kpr, urutan }] }
async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!BOLEH_UBAH.includes(user.role)) return Response.json({ error: 'Hanya Administrator & Admin Sales yang dapat mengubah master tipe.' }, { status: 403 });
  const b = await req.json();
  if (!b.project || !Array.isArray(b.rows)) return Response.json({ error: 'project dan rows wajib' }, { status: 400 });
  const sql = db();
  let n = 0;
  for (const r of b.rows) {
    const tipe = String(r.tipe || '').trim();
    if (!tipe) continue;
    await sql`INSERT INTO tipe_unit (project, tipe, keterangan, sub_tipe, lb, lt, dimensi, arah, ppn_dtp,
        harga_list, harga_standar, harga_allin, booking_fee, uang_muka, plafon_kpr, urutan, updated_by, updated_at)
      VALUES (${b.project}, ${tipe}, ${String(r.keterangan || '').trim()}, ${String(r.sub_tipe || '').trim()},
        ${Number(r.lb) || null}, ${Number(r.lt) || null}, ${String(r.dimensi || '').trim()}, ${String(r.arah || '').trim().toUpperCase()},
        ${Boolean(r.ppn_dtp)}, ${n0(r.harga_list)}, ${n0(r.harga_standar)}, ${n0(r.harga_allin)},
        ${n0(r.booking_fee)}, ${n0(r.uang_muka)}, ${n0(r.plafon_kpr)}, ${Number(r.urutan) || 0}, ${user.name}, now())
      ON CONFLICT (project, tipe) DO UPDATE SET keterangan = EXCLUDED.keterangan, sub_tipe = EXCLUDED.sub_tipe, lb = EXCLUDED.lb, lt = EXCLUDED.lt,
        dimensi = EXCLUDED.dimensi, arah = EXCLUDED.arah, ppn_dtp = EXCLUDED.ppn_dtp, harga_list = EXCLUDED.harga_list,
        harga_standar = EXCLUDED.harga_standar, harga_allin = EXCLUDED.harga_allin, booking_fee = EXCLUDED.booking_fee,
        uang_muka = EXCLUDED.uang_muka, plafon_kpr = EXCLUDED.plafon_kpr, urutan = EXCLUDED.urutan, updated_by = EXCLUDED.updated_by, updated_at = now()`;
    n += 1;
  }
  return Response.json({ ok: true, tersimpan: n });
}

async function _DELETE(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!BOLEH_UBAH.includes(user.role)) return Response.json({ error: 'Tidak berwenang' }, { status: 403 });
  const b = await req.json();
  const sql = db();
  const dipakai = await sql`SELECT count(*)::int AS n FROM unit_harga WHERE project = ${b.project} AND tipe = ${b.tipe}`;
  if (dipakai[0].n > 0) return Response.json({ error: 'Tipe ini masih dipakai ' + dipakai[0].n + ' unit. Ubah tipe unit-unit itu lebih dulu.' }, { status: 400 });
  await sql`DELETE FROM tipe_unit WHERE project = ${b.project} AND tipe = ${b.tipe}`;
  return Response.json({ ok: true });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, {});
export const POST = jagaProyek(_POST, {});
export const DELETE = jagaProyek(_DELETE, {});
