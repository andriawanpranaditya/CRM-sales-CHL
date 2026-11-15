import { db } from '@/lib/db';
import { siapkanOther, cekDataOther, simpanDok } from '@/lib/other-sales';

export const dynamic = 'force-dynamic';

// PUBLIK (tanpa login) — form Other Sales lewat link /other/<token>
async function ambilLink(sql, token) {
  if (!/^os-[a-z]{2}[A-Za-z0-9]{4,10}$/.test(String(token || ''))) return null;
  await siapkanOther(sql);
  return (await sql`SELECT * FROM other_link WHERE token = ${token} AND aktif = true LIMIT 1`)[0] || null;
}
export async function GET(req) {
  const sql = db();
  const l = await ambilLink(sql, new URL(req.url).searchParams.get('token'));
  if (!l) return Response.json({ ok: false, error: 'Link tidak berlaku. Minta link terbaru ke tim marketing.' }, { status: 404 });
  return Response.json({ ok: true, project: l.project });
}
export async function POST(req) {
  const sql = db();
  const b = await req.json().catch(() => ({}));
  if (b.website) return Response.json({ ok: true });
  const l = await ambilLink(sql, b.token);
  if (!l) return Response.json({ error: 'Link tidak berlaku. Minta link terbaru ke tim marketing.' }, { status: 404 });
  const c = cekDataOther(b.other || {}); if (c.error) return Response.json({ error: c.error }, { status: 400 });
  const t = (x, n = 200) => String(x ?? '').trim().slice(0, n);
  const k = { konsumen: t(b.konsumen, 100), konsumen_wa: t(b.konsumen_wa, 30), tgl: /^\d{4}-\d{2}-\d{2}$/.test(b.tgl || '') ? b.tgl : null, tipe: t(b.tipe, 60), bayar: t(b.bayar, 40),
    domisili: t(b.domisili, 80), budget: t(b.budget, 60), catatan: t(b.catatan, 600) };
  if (!k.konsumen) return Response.json({ error: 'Nama konsumen wajib diisi' }, { status: 400 });
  if (k.konsumen_wa.replace(/\D/g, '').length < 9) return Response.json({ error: 'No. WA konsumen wajib diisi dengan benar' }, { status: 400 });
  const hari = (await sql`SELECT count(*)::int AS n FROM other_laporan WHERE token = ${l.token} AND created_at > now() - interval '1 day'`)[0]?.n || 0;
  if (hari >= 40) return Response.json({ error: 'Terlalu banyak kiriman dari link ini hari ini' }, { status: 429 });
  let ktp = null, npwp = null;
  try {
    if (c.d.jenis === 'External') { ktp = await simpanDok(sql, l.project, { nama: `KTP ${c.d.nama}`, data: b.other.ktp.data }); npwp = await simpanDok(sql, l.project, { nama: `NPWP ${c.d.nama}`, data: b.other.npwp.data }); }
  } catch (e) { return Response.json({ error: e.message }, { status: 502 }); }
  await sql`INSERT INTO other_laporan (token, project, jenis, nama, divisi, hp, ktp, npwp, konsumen, konsumen_wa, tgl, tipe, bayar, domisili, budget, catatan)
    VALUES (${l.token}, ${l.project}, ${c.d.jenis}, ${c.d.nama}, ${c.d.divisi}, ${c.d.hp}, ${ktp}, ${npwp}, ${k.konsumen}, ${k.konsumen_wa}, ${k.tgl}, ${k.tipe}, ${k.bayar}, ${k.domisili}, ${k.budget}, ${k.catatan})`;
  return Response.json({ ok: true });
}
