import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { gabungLead, DAFTAR_GABUNG, VERSI_GABUNG } from '@/lib/gabung-lead';

export const dynamic = 'force-dynamic';

// GET: status (sudah dijalankan atau belum) · POST {cek:true} pratinjau · POST {cek:false} jalankan — khusus Manager
export async function GET() {
  const { err } = await requireUser(['manager']); if (err) return err;
  const sql = db();
  const r = await sql`SELECT items FROM settings WHERE key = 'gabung_lead'`.catch(() => []);
  return Response.json({ versi: VERSI_GABUNG, sudah: r[0]?.items?.versi === VERSI_GABUNG, jumlah: DAFTAR_GABUNG.length });
}
export async function POST(req) {
  const { user, err } = await requireUser(['manager']); if (err) return err;
  const sql = db();
  const b = await req.json().catch(() => ({}));
  const cek = b.cek !== false;
  const hasil = await gabungLead(sql, { cek, oleh: user.name });
  if (!cek) await sql`INSERT INTO settings (key, items) VALUES ('gabung_lead', ${JSON.stringify({ versi: VERSI_GABUNG, oleh: user.name, waktu: new Date().toISOString() })}) ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
  return Response.json({ cek, hasil });
}
