import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';
const BOLEH_UBAH = ['administrator', 'headsales', 'salesmanager', 'adminsales', 'finance'];
const n0 = v => Math.max(0, Math.round(Number(v) || 0));

// Master skema cara bayar — susunan booking fee / DP / angsuran / pelunasan per project
export async function GET(req) {
  const { err } = await requireUser(); if (err) return err;
  const project = new URL(req.url).searchParams.get('project') || '';
  const sql = db();
  const rows = project ? await sql`SELECT * FROM skema_bayar WHERE project = ${project} ORDER BY urutan, nama`
    : await sql`SELECT * FROM skema_bayar ORDER BY project, urutan, nama`;
  return Response.json({ rows });
}

export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!BOLEH_UBAH.includes(user.role)) return Response.json({ error: 'Hanya Administrator, Admin Sales, dan Finance yang dapat mengubah skema.' }, { status: 403 });
  const b = await req.json();
  if (!b.project || !Array.isArray(b.rows)) return Response.json({ error: 'project dan rows wajib' }, { status: 400 });
  const sql = db();
  let n = 0;
  for (const r of b.rows) {
    const kode = String(r.kode || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
    const nama = String(r.nama || '').trim();
    if (!kode || !nama) continue;
    const jenis = ['cash', 'cicilan', 'kpr'].includes(r.jenis) ? r.jenis : 'cash';
    await sql`INSERT INTO skema_bayar (project, kode, nama, jenis, bf_nominal, dp_persen, dp_nominal, dp_termin, dp_hari, angsuran_jumlah,
        angsuran_interval_hari, pelunasan_hari, subsidi_dp, keterangan, aktif, lengkap, urutan, updated_by, updated_at)
      VALUES (${b.project}, ${kode}, ${nama}, ${jenis}, ${n0(r.bf_nominal)}, ${Number(r.dp_persen) || 0}, ${n0(r.dp_nominal)}, ${Math.max(1, Number(r.dp_termin) || 1)},
        ${Number(r.dp_hari) || 0}, ${Number(r.angsuran_jumlah) || 0}, ${Math.max(1, Number(r.angsuran_interval_hari) || 30)},
        ${Number(r.pelunasan_hari) || 0}, ${Boolean(r.subsidi_dp)}, ${String(r.keterangan || '').trim()},
        ${r.aktif === undefined ? true : Boolean(r.aktif)}, ${Boolean(r.lengkap)}, ${Number(r.urutan) || 0}, ${user.name}, now())
      ON CONFLICT (project, kode) DO UPDATE SET nama = EXCLUDED.nama, jenis = EXCLUDED.jenis, bf_nominal = EXCLUDED.bf_nominal,
        dp_persen = EXCLUDED.dp_persen, dp_nominal = EXCLUDED.dp_nominal, dp_termin = EXCLUDED.dp_termin, dp_hari = EXCLUDED.dp_hari, angsuran_jumlah = EXCLUDED.angsuran_jumlah,
        angsuran_interval_hari = EXCLUDED.angsuran_interval_hari, pelunasan_hari = EXCLUDED.pelunasan_hari, subsidi_dp = EXCLUDED.subsidi_dp,
        keterangan = EXCLUDED.keterangan, aktif = EXCLUDED.aktif, lengkap = EXCLUDED.lengkap, urutan = EXCLUDED.urutan,
        updated_by = EXCLUDED.updated_by, updated_at = now()`;
    n += 1;
  }
  return Response.json({ ok: true, tersimpan: n });
}
