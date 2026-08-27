import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const rows = user.role !== 'sales'
    ? await sql`SELECT f.*, l.nama, l.project, l.sales, l.wa FROM followups f LEFT JOIN leads l ON l.lead_code = f.lead_code ORDER BY f.tgl DESC, f.id DESC`
    : await sql`SELECT f.*, l.nama, l.project, l.sales, l.wa FROM followups f JOIN leads l ON l.lead_code = f.lead_code WHERE l.sales = ${user.name} ORDER BY f.tgl DESC, f.id DESC`;
  return Response.json(rows);
}

export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.lead_code || !b.detail) return Response.json({ error: 'ID Lead dan Detail Komunikasi wajib diisi' }, { status: 400 });
  const sql = db();
  if (user.role === 'sales') {
    const own = await sql`SELECT 1 FROM leads WHERE lead_code = ${b.lead_code} AND sales = ${user.name}`;
    if (!own.length) return Response.json({ error: 'Lead ini bukan milik Anda' }, { status: 403 });
  }
  await sql`INSERT INTO followups (lead_code, tgl, detail, objection, next_action, next_tgl, wa_pesan, created_by)
    VALUES (${b.lead_code}, ${b.tgl || null}, ${b.detail}, ${b.objection || ''}, ${b.next_action || ''}, ${b.next_tgl || null}, ${b.wa_pesan || ''}, ${user.username})`;
  // Sinkron: jadwal FU berikutnya tampil di Database Lead
  if (b.next_tgl) {
    await sql`UPDATE leads SET next_fu = ${b.next_tgl}, updated_at = now() WHERE lead_code = ${b.lead_code}`;
  }
  return Response.json({ ok: true });
}
