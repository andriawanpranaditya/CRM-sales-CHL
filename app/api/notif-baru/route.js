import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Pemeriksaan RINGAN untuk lonceng Manager (dipanggil tiap ±40 detik saat CRM terbuka):
// transaksi Reserved / Booking / Batal 3 hari terakhir + laporan agent yang menunggu konfirmasi.
export async function GET() {
  const { user, err } = await requireUser(['manager']); if (err) return err;
  const sql = db();
  const [trx, agent] = await Promise.all([
    sql`SELECT t.id, t.jenis, t.unit, t.nilai, t.created_at, t.created_by, COALESCE(NULLIF(t.project, ''), l.project, '') AS project, l.nama, l.sales, l.lead_code
      FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.jenis IN ('Reserved', 'Booking', 'Batal') AND t.created_at > now() - interval '3 days' AND COALESCE(t.created_by, '') NOT LIKE 'import%'
      ORDER BY t.id DESC LIMIT 15`.catch(() => []),
    sql`SELECT id, konsumen, agent_nama, lead_agent, tgl::text AS tgl FROM agent_laporan WHERE status = 'Menunggu' ORDER BY id DESC LIMIT 20`.catch(() => []),
  ]);
  return Response.json({ trx, agent, waktu: Date.now(), oleh: user.username });
}
