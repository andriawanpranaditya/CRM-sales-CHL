import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { bolehDigital } from '@/lib/digital-akses';
import { catat } from '@/lib/log';

export const dynamic = 'force-dynamic';

// Pindahkan lead yang ber-status Drop KARENA transaksi Batal ke status baru 'Batal' (sekali jalan, khusus Head of Sales & Marketing).
// Kriteria: status sekarang Drop, transaksi terakhirnya Batal, dan tidak ada perubahan status ke Drop SETELAH transaksi batal itu
// yang berasal dari follow up / edit manual (artinya memang sengaja di-drop).
async function kandidat(sql) {
  return sql`
    SELECT l.lead_code, l.nama, l.project, l.sales, t.unit, t.tgl::text AS tgl_batal, COALESCE(t.catatan, '') AS alasan
    FROM leads l
    JOIN LATERAL (SELECT id, jenis, unit, tgl, catatan, created_at FROM transactions WHERE lead_code = l.lead_code ORDER BY id DESC LIMIT 1) t ON true
    WHERE l.status = 'Drop' AND t.jenis = 'Batal'
      AND NOT EXISTS (SELECT 1 FROM lead_status_log s WHERE s.lead_code = l.lead_code AND s.jenis = 'status' AND s.ke = 'Drop'
        AND s.created_at > t.created_at + interval '1 minute' AND COALESCE(s.alasan, '') NOT LIKE 'Transaksi%')
    ORDER BY l.project, t.tgl`;
}

export async function GET() {
  const { user, err } = await requireUser(['manager']); if (err) return err;
  if (!bolehDigital(user)) return Response.json({ error: 'Khusus Head of Sales & Marketing' }, { status: 403 });
  const sql = db();
  return Response.json({ kandidat: await kandidat(sql) });
}

export async function POST(req) {
  const { user, err } = await requireUser(['manager']); if (err) return err;
  if (!bolehDigital(user)) return Response.json({ error: 'Khusus Head of Sales & Marketing' }, { status: 403 });
  const sql = db();
  const b = await req.json().catch(() => ({}));
  const semua = await kandidat(sql);
  // Hanya lead yang disebut di body.kode (hasil pratinjau yang sudah disetujui) — tidak pernah "semua" tanpa daftar
  const pilih = Array.isArray(b.kode) ? semua.filter(k => b.kode.includes(k.lead_code)) : [];
  if (!pilih.length) return Response.json({ error: 'Kirim daftar kode lead (kode: [...]) dari hasil pratinjau' }, { status: 400 });
  const kodes = pilih.map(k => k.lead_code);
  await sql`UPDATE leads SET status = 'Batal', next_fu = NULL, updated_at = now() WHERE lead_code = ANY(${kodes}::text[]) AND status = 'Drop'`;
  // Riwayat status: drop yang berasal dari transaksi batal dicatat sebagai Batal, supaya tidak terhitung Drop di Dashboard
  await sql`UPDATE lead_status_log SET ke = 'Batal' WHERE lead_code = ANY(${kodes}::text[]) AND jenis = 'status' AND ke = 'Drop'
    AND (COALESCE(alasan, '') LIKE 'Transaksi%' OR COALESCE(alasan, '') LIKE '%(riwayat perkiraan%')`.catch(() => {});
  try { await catat(sql, { user, aksi: 'Migrasi status Batal', modul: 'Booking', detail: kodes.length + ' lead: ' + kodes.join(', ').slice(0, 400), req }); } catch {}
  return Response.json({ ok: true, diubah: kodes.length, kode: kodes });
}
