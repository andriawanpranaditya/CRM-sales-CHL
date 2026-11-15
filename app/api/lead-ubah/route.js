import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { siapkanLeadUbah, terapkanUbah, LABEL_FIELD } from '@/lib/lead-ubah';

export const dynamic = 'force-dynamic';

// Manager: daftar perubahan data lead dari sales yang menunggu persetujuan · Sales: ajuan miliknya
export async function GET() {
  const { user, err } = await requireUser(['manager', 'sales']); if (err) return err;
  const sql = db(); await siapkanLeadUbah(sql);
  const rows = user.role === 'manager'
    ? await sql`SELECT a.*, l.nama AS nama_lead, l.project, l.sales FROM lead_ubah a LEFT JOIN leads l ON l.lead_code = a.lead_code WHERE a.status = 'Menunggu' ORDER BY a.created_at`
    : await sql`SELECT a.*, l.nama AS nama_lead FROM lead_ubah a LEFT JOIN leads l ON l.lead_code = a.lead_code WHERE a.diajukan_oleh = ${user.username} AND a.created_at > now() - interval '30 days' ORDER BY a.created_at DESC LIMIT 50`;
  return Response.json({ ajuan: rows, label: LABEL_FIELD });
}
export async function POST(req) {
  const { user, err } = await requireUser(['manager']); if (err) return err;
  const sql = db(); await siapkanLeadUbah(sql);
  const b = await req.json().catch(() => ({}));
  const aj = (await sql`SELECT * FROM lead_ubah WHERE id = ${Number(b.id)}`)[0];
  if (!aj) return Response.json({ error: 'Ajuan tidak ditemukan' }, { status: 404 });
  if (aj.status !== 'Menunggu') return Response.json({ error: 'Ajuan ini sudah ' + aj.status.toLowerCase() }, { status: 400 });
  if (b.aksi === 'setujui') {
    await terapkanUbah(sql, aj);
    await sql`UPDATE lead_ubah SET status = 'Disetujui', dicek_oleh = ${user.name}, dicek_at = now() WHERE id = ${aj.id}`;
    return Response.json({ ok: true });
  }
  if (b.aksi === 'tolak') {
    await sql`UPDATE lead_ubah SET status = 'Ditolak', alasan = ${String(b.alasan || '').slice(0, 300)}, dicek_oleh = ${user.name}, dicek_at = now() WHERE id = ${aj.id}`;
    return Response.json({ ok: true });
  }
  return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
}
