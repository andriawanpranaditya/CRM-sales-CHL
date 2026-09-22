import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Ukuran database & tabel — khusus manager (hanya membaca, tidak menghapus apa pun)
export async function GET() {
  const { err } = await requireUser('manager'); if (err) return err;
  const sql = db();
  const [total] = await sql`SELECT pg_database_size(current_database())::bigint AS bytes`;
  const tabel = await sql`
    SELECT c.relname AS nama, pg_total_relation_size(c.oid)::bigint AS bytes, c.reltuples::bigint AS perkiraan_baris
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
    ORDER BY pg_total_relation_size(c.oid) DESC`;
  let berkas = null;
  try {
    const [b] = await sql`SELECT count(*)::int AS jumlah, COALESCE(sum(length(data)), 0)::bigint AS bytes FROM trx_files`;
    berkas = b;
  } catch { /* tabel berkas belum ada */ }
  return Response.json({ total: Number(total.bytes), tabel: tabel.map(t => ({ ...t, bytes: Number(t.bytes), perkiraan_baris: Number(t.perkiraan_baris) })), berkas });
}
