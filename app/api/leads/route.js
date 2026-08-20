import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const rows = user.role === 'manager'
    ? await sql`SELECT * FROM leads ORDER BY id`
    : await sql`SELECT * FROM leads WHERE sales = ${user.name} ORDER BY id`;
  return Response.json(rows);
}

export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.nama) return Response.json({ error: 'Nama konsumen wajib diisi' }, { status: 400 });
  const sales = user.role === 'sales' ? user.name : (b.sales || '');
  if (!sales) return Response.json({ error: 'Sales / PIC wajib dipilih' }, { status: 400 });
  const sql = db();
  const ins = await sql`INSERT INTO leads (tgl, nama, wa, email, domisili, kerja, sumber, project, tipe, tujuan, budget, bayar, sales, status, catatan, created_by)
    VALUES (${b.tgl || null}, ${b.nama}, ${b.wa || ''}, ${b.email || ''}, ${b.domisili || ''}, ${b.kerja || ''},
            ${b.sumber || ''}, ${b.project || ''}, ${b.tipe || ''}, ${b.tujuan || ''}, ${Number(b.budget) || 0},
            ${b.bayar || ''}, ${sales}, ${b.status || 'New'}, ${b.catatan || ''}, ${user.username})
    RETURNING id`;
  const id = ins[0].id;
  const code = 'LEAD-' + String(id).padStart(4, '0');
  await sql`UPDATE leads SET lead_code = ${code} WHERE id = ${id}`;
  return Response.json({ ok: true, id, lead_code: code });
}

export async function PATCH(req) {
  const { user, err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  if (b.status) await sql`UPDATE leads SET status = ${b.status}, updated_at = now() WHERE id = ${b.id}`;
  return Response.json({ ok: true });
}
