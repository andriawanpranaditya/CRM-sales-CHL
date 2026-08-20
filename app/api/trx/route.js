import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const rows = user.role === 'manager'
    ? await sql`SELECT t.*, l.nama, l.tipe, l.sales, COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar
        FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code ORDER BY t.id DESC`
    : await sql`SELECT t.*, l.nama, l.tipe, l.sales, COALESCE(NULLIF(t.project, ''), l.project, '') AS project, COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar
        FROM transactions t JOIN leads l ON l.lead_code = t.lead_code WHERE l.sales = ${user.name} ORDER BY t.id DESC`;
  return Response.json(rows);
}

export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.lead_code || !b.nilai) return Response.json({ error: 'ID Lead dan Nilai (Rp) wajib diisi' }, { status: 400 });
  if (!['Reserved', 'Booking', 'Closing', 'Batal'].includes(b.jenis)) return Response.json({ error: 'Jenis transaksi tidak valid' }, { status: 400 });
  const sql = db();
  if (user.role === 'sales') {
    const own = await sql`SELECT 1 FROM leads WHERE lead_code = ${b.lead_code} AND sales = ${user.name}`;
    if (!own.length) return Response.json({ error: 'Lead ini bukan milik Anda' }, { status: 403 });
  }
  await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, catatan, project, bayar, unit, created_by)
    VALUES (${b.lead_code}, ${b.jenis}, ${b.tgl || null}, ${Number(b.nilai) || 0}, ${b.catatan || ''},
            ${b.project || ''}, ${b.bayar || ''}, ${b.unit || ''}, ${user.username})`;
  // Reserved tidak mengubah status pipeline; Batal -> Drop; Booking/Closing sesuai jenisnya
  if (b.jenis !== 'Reserved') {
    const newStatus = b.jenis === 'Batal' ? 'Drop' : b.jenis;
    await sql`UPDATE leads SET status = ${newStatus}, updated_at = now() WHERE lead_code = ${b.lead_code}`;
  }
  return Response.json({ ok: true });
}
