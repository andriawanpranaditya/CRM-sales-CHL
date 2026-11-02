import { db, DEFAULT_UNITS } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { hargaEfektif } from '@/lib/harga';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';
const BOLEH_UBAH = ['administrator', 'headsales', 'salesmanager', 'adminsales'];
const n0 = v => Math.max(0, Math.round(Number(v) || 0));

// GET ?project=&unit=  -> harga efektif satu unit
// GET ?project=        -> seluruh unit project berikut atribut & harga efektifnya
async function _GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const q = new URL(req.url).searchParams;
  const project = q.get('project') || '', unit = q.get('unit');
  const sql = db();
  const tipe = await sql`SELECT * FROM tipe_unit WHERE project = ${project}`;
  const tm = {}; tipe.forEach(t => { tm[t.tipe] = t; });
  if (unit) {
    const r = await sql`SELECT * FROM unit_harga WHERE project = ${project} AND unit = ${unit}`;
    const u = r[0] || null;
    const e = hargaEfektif(u, u && u.tipe ? tm[u.tipe] : null);
    return jsonProyek(user, { ada: e.harga_standar > 0 || e.harga_allin > 0, tipe: (u && u.tipe) || '', hoek: Boolean(u && u.hoek), ...e });
  }
  const st = await sql`SELECT items FROM settings WHERE key = 'units'`;
  const units = ((st.length && st[0].items) || DEFAULT_UNITS)[project] || [];
  const rows = await sql`SELECT * FROM unit_harga WHERE project = ${project}`;
  const m = {}; rows.forEach(r => { m[r.unit] = r; });
  return jsonProyek(user, { project, tipe: tipe.sort((a, b) => a.urutan - b.urutan), rows: units.map(nama => {
    const u = m[nama] || null;
    const e = hargaEfektif(u, u && u.tipe ? tm[u.tipe] : null);
    return { unit: nama, tipe: (u && u.tipe) || '', hoek: Boolean(u && u.hoek), keterangan: (u && u.keterangan) || '',
      sendiri: { harga_list: Number((u || {}).harga_list || 0), harga_standar: Number((u || {}).harga_standar || 0), harga_allin: Number((u || {}).harga_allin || 0),
        lb: (u || {}).lb || null, lt: (u || {}).lt || null, dimensi: (u || {}).dimensi || '', arah: (u || {}).arah || '' },
      efektif: e, updated_by: (u || {}).updated_by || '', updated_at: (u || {}).updated_at || null };
  }) });
}

// POST { project, rows: [{ unit, tipe?, hoek?, lb?, lt?, dimensi?, arah?, harga_list?, harga_standar?, harga_allin?, keterangan? }] }
async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!BOLEH_UBAH.includes(user.role)) return Response.json({ error: 'Hanya Administrator & Admin Sales yang dapat mengubah master unit.' }, { status: 403 });
  const b = await req.json();
  if (!b.project || !Array.isArray(b.rows)) return Response.json({ error: 'project dan rows wajib' }, { status: 400 });
  const sql = db();
  let n = 0;
  for (const r of b.rows) {
    if (!r.unit) continue;
    const ada = await sql`SELECT * FROM unit_harga WHERE project = ${b.project} AND unit = ${r.unit}`;
    const o = ada[0] || {};
    const v = (k, konv) => (r[k] !== undefined ? konv(r[k]) : (o[k] !== undefined && o[k] !== null ? o[k] : null));
    await sql`INSERT INTO unit_harga (project, unit, tipe, hoek, lb, lt, dimensi, arah, harga_list, harga_standar, harga_allin, keterangan, updated_by, updated_at)
      VALUES (${b.project}, ${r.unit}, ${v('tipe', x => String(x || '').trim() || null)}, ${Boolean(v('hoek', Boolean))},
        ${v('lb', x => (Number(x) || null))}, ${v('lt', x => (Number(x) || null))}, ${v('dimensi', x => String(x || '').trim())}, ${v('arah', x => String(x || '').trim().toUpperCase())},
        ${n0(v('harga_list', n0))}, ${n0(v('harga_standar', n0))}, ${n0(v('harga_allin', n0))}, ${v('keterangan', x => String(x || '').trim())}, ${user.name}, now())
      ON CONFLICT (project, unit) DO UPDATE SET tipe = EXCLUDED.tipe, hoek = EXCLUDED.hoek, lb = EXCLUDED.lb, lt = EXCLUDED.lt,
        dimensi = EXCLUDED.dimensi, arah = EXCLUDED.arah, harga_list = EXCLUDED.harga_list, harga_standar = EXCLUDED.harga_standar,
        harga_allin = EXCLUDED.harga_allin, keterangan = EXCLUDED.keterangan, updated_by = EXCLUDED.updated_by, updated_at = now()`;
    n += 1;
  }
  return Response.json({ ok: true, tersimpan: n });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, {});
export const POST = jagaProyek(_POST, {});
