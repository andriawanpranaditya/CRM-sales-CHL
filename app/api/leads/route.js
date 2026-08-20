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
  const ins = await sql`INSERT INTO leads (tgl, nama, wa, email, domisili, kerja, sumber, project, tipe, tujuan, budget, bayar, sales, status, catatan, next_fu, created_by)
    VALUES (${b.tgl || null}, ${b.nama}, ${b.wa || ''}, ${b.email || ''}, ${b.domisili || ''}, ${b.kerja || ''},
            ${b.sumber || ''}, ${b.project || ''}, ${b.tipe || ''}, ${b.tujuan || ''}, ${Number(b.budget) || 0},
            ${b.bayar || ''}, ${sales}, ${b.status || 'New'}, ${b.catatan || ''}, ${b.next_fu || null}, ${user.username})
    RETURNING id`;
  const id = ins[0].id;
  const code = 'LEAD-' + String(id).padStart(4, '0');
  await sql`UPDATE leads SET lead_code = ${code} WHERE id = ${id}`;
  return Response.json({ ok: true, id, lead_code: code });
}

export async function PATCH(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  const rows = await sql`SELECT * FROM leads WHERE id = ${b.id}`;
  if (!rows.length) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
  const cur = rows[0];
  if (user.role === 'sales' && cur.sales !== user.name) {
    return Response.json({ error: 'Lead ini bukan milik Anda' }, { status: 403 });
  }
  const FIELDS = ['tgl', 'nama', 'wa', 'email', 'domisili', 'kerja', 'sumber', 'project', 'tipe', 'tujuan', 'budget', 'bayar', 'status', 'catatan', 'next_fu'];
  const m = { ...cur };
  for (const k of FIELDS) if (k in b) m[k] = b[k];
  if (user.role === 'manager' && 'sales' in b && b.sales) m.sales = b.sales;
  if (!m.nama) return Response.json({ error: 'Nama tidak boleh kosong' }, { status: 400 });
  await sql`UPDATE leads SET
    tgl = ${m.tgl || null}, nama = ${m.nama}, wa = ${m.wa || ''}, email = ${m.email || ''},
    domisili = ${m.domisili || ''}, kerja = ${m.kerja || ''}, sumber = ${m.sumber || ''},
    project = ${m.project || ''}, tipe = ${m.tipe || ''}, tujuan = ${m.tujuan || ''},
    budget = ${Number(m.budget) || 0}, bayar = ${m.bayar || ''}, sales = ${m.sales},
    status = ${m.status || 'New'}, catatan = ${m.catatan || ''}, next_fu = ${m.next_fu || null},
    updated_at = now()
    WHERE id = ${b.id}`;
  return Response.json({ ok: true });
}
