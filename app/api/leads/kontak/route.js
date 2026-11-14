import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { siapkanKontak, bersihKontak } from '@/lib/kontak';

export const dynamic = 'force-dynamic';

// Tambah satu kontak (nama / nomor) ke lead yang sudah ada — dipakai saat nomor WA ternyata milik lead lain
export async function POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const b = await req.json().catch(() => ({}));
  if (!b.lead_code || !b.kontak) return Response.json({ error: 'Data kontak tidak lengkap' }, { status: 400 });
  await siapkanKontak(sql);
  const l = (await sql`SELECT lead_code, wa, sales, kontak FROM leads WHERE lead_code = ${b.lead_code}`)[0];
  if (!l) return Response.json({ error: 'Lead tidak ditemukan' }, { status: 404 });
  if (user.role === 'sales' && l.sales !== user.name) return Response.json({ error: 'Lead ini dipegang sales lain — minta manager menambahkan kontaknya' }, { status: 403 });
  const kontak = bersihKontak([...(Array.isArray(l.kontak) ? l.kontak : []), b.kontak], l.wa);
  await sql`UPDATE leads SET kontak = ${JSON.stringify(kontak)}::jsonb, updated_at = now() WHERE lead_code = ${b.lead_code}`;
  return Response.json({ ok: true, kontak });
}
