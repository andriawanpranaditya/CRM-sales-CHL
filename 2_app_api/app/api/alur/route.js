import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { TAHAP, infoTahap } from '@/lib/alur';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';

// Papan pantau: posisi setiap transaksi dalam alur standar penjualan
async function _GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();

  const rows = user.role === 'sales'
    ? await sql`
    SELECT t.id, t.lead_code, t.jenis, t.tgl::text AS tgl, t.nilai, t.harga_unit,
           t.unit, t.verif_status, t.verif_at, t.no_sp, t.no_ppjb, t.tahap,
           t.finance_konfirmasi_at, t.ttd_deadline::text AS ttd_deadline,
           t.ttd_selesai_at, t.approval_mgmt_at,
           t.tgl_serah_terima::text AS tgl_serah_terima, t.bast_at, t.jadwal_at,
           l.nama, l.sales,
           COALESCE(NULLIF(t.project, ''), l.project, '') AS project,
           COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar,
           CASE WHEN t.jadwal_at IS NOT NULL
             -- kontrak berjadwal: kuitansi yang sudah terkonfirmasi Finance, di luar pencairan bank (bukan uang konsumen)
             THEN (SELECT COALESCE(sum(pb.nilai), 0)::bigint FROM pembayaran pb WHERE pb.trx_id = t.id AND pb.status = 'KW' AND COALESCE(pb.cara, '') <> 'Pencairan KPR')
             ELSE (SELECT COALESCE(sum(x.nilai), 0)::bigint FROM transactions x
               WHERE x.lead_code = t.lead_code AND x.unit = t.unit AND x.jenis <> 'Batal') END AS bayar_masuk,
           (SELECT k.status FROM komisi k WHERE k.trx_id = t.id) AS komisi_status
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE t.jenis <> 'Batal' AND t.batal_at IS NULL AND l.sales = ${user.name}
    ORDER BY t.id DESC LIMIT 200`
    : await sql`
    SELECT t.id, t.lead_code, t.jenis, t.tgl::text AS tgl, t.nilai, t.harga_unit,
           t.unit, t.verif_status, t.verif_at, t.no_sp, t.no_ppjb, t.tahap,
           t.finance_konfirmasi_at, t.ttd_deadline::text AS ttd_deadline,
           t.ttd_selesai_at, t.approval_mgmt_at,
           t.tgl_serah_terima::text AS tgl_serah_terima, t.bast_at, t.jadwal_at,
           l.nama, l.sales,
           COALESCE(NULLIF(t.project, ''), l.project, '') AS project,
           COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar,
           CASE WHEN t.jadwal_at IS NOT NULL
             -- kontrak berjadwal: kuitansi yang sudah terkonfirmasi Finance, di luar pencairan bank (bukan uang konsumen)
             THEN (SELECT COALESCE(sum(pb.nilai), 0)::bigint FROM pembayaran pb WHERE pb.trx_id = t.id AND pb.status = 'KW' AND COALESCE(pb.cara, '') <> 'Pencairan KPR')
             ELSE (SELECT COALESCE(sum(x.nilai), 0)::bigint FROM transactions x
               WHERE x.lead_code = t.lead_code AND x.unit = t.unit AND x.jenis <> 'Batal') END AS bayar_masuk,
           (SELECT k.status FROM komisi k WHERE k.trx_id = t.id) AS komisi_status
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE t.jenis <> 'Batal' AND t.batal_at IS NULL
    ORDER BY t.id DESC LIMIT 200`;

  const prog = await sql`
    SELECT trx_id, divisi,
           count(*)::int AS total,
           count(*) FILTER (WHERE status = 'Selesai')::int AS selesai,
           count(*) FILTER (WHERE status <> 'Selesai' AND deadline IS NOT NULL
                              AND deadline < CURRENT_DATE)::int AS telat
    FROM proses GROUP BY trx_id, divisi`;

  const map = {};
  prog.forEach(p => { (map[p.trx_id] = map[p.trx_id] || {})[p.divisi] = p; });
  // Riwayat perpindahan terakhir tiap transaksi
  const log = await sql`SELECT DISTINCT ON (trx_id) trx_id, ke_tahap, dari_divisi, ke_divisi,
      oleh, catatan, jenis, created_at,
      (CURRENT_DATE - created_at::date)::int AS diam_hari
    FROM alur_log ORDER BY trx_id, id DESC`;
  const logMap = {};
  log.forEach(l => { logMap[l.trx_id] = l; });

  return jsonProyek(user, {
    rows: rows.map(r => ({ ...r, progres: map[r.id] || {}, terakhir: logMap[r.id] || null })),
    role: user.role, tahap: TAHAP,
  });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, {});
