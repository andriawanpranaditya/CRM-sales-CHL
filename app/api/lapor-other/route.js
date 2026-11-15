import { db } from '@/lib/db';
import { siapkanOther, cekDataOther, simpanDok, simpanDokDb, unitTersedia } from '@/lib/other-sales';

export const dynamic = 'force-dynamic';

// PUBLIK (tanpa login) — Reserved / Booking dari Other Sales lewat link /other/<token>; dicek Manager sebelum tercatat
async function ambilLink(sql, token) {
  if (!/^os-[a-z]{2}[A-Za-z0-9]{4,10}$/.test(String(token || ''))) return null;
  await siapkanOther(sql);
  return (await sql`SELECT * FROM other_link WHERE token = ${token} AND aktif = true LIMIT 1`)[0] || null;
}
export async function GET(req) {
  const sql = db();
  const l = await ambilLink(sql, new URL(req.url).searchParams.get('token'));
  if (!l) return Response.json({ ok: false, error: 'Link tidak berlaku. Minta link terbaru ke tim marketing.' }, { status: 404 });
  return Response.json({ ok: true, project: l.project, unit: await unitTersedia(sql, l.project).catch(() => []) });
}
export async function POST(req) {
  const sql = db();
  const b = await req.json().catch(() => ({}));
  if (b.website) return Response.json({ ok: true });
  const l = await ambilLink(sql, b.token);
  if (!l) return Response.json({ error: 'Link tidak berlaku. Minta link terbaru ke tim marketing.' }, { status: 404 });
  const c = cekDataOther(b.other || {}); if (c.error) return Response.json({ error: c.error }, { status: 400 });
  const t = (x, n = 200) => String(x ?? '').trim().slice(0, n);
  const T = b.trx || {}, K = b.konsumen || {}, B = b.berkas || {};
  const d = { trx_jenis: ['Reserved', 'Booking'].includes(T.jenis) ? T.jenis : '', unit: t(T.unit, 60), tgl: /^\d{4}-\d{2}-\d{2}$/.test(T.tgl || '') ? T.tgl : null,
    nilai: Number(T.nilai) || 0, bayar: t(T.bayar, 40), konsumen: t(K.nama, 100), konsumen_wa: t(K.wa, 30), konsumen_email: t(K.email, 120),
    konsumen_nik: t(K.nik, 30).replace(/\D/g, ''), alamat: t(K.alamat, 300), catatan: t(b.catatan, 600) };
  const salah = !d.trx_jenis ? 'Pilih Reserved atau Booking' : !d.unit ? 'Pilih blok / unit' : !d.tgl ? 'Isi tanggal transfer' : !d.nilai ? 'Isi nilai yang dibayar'
    : !d.bayar ? 'Pilih cara bayar' : !d.konsumen ? 'Nama konsumen sesuai KTP wajib diisi' : d.konsumen_wa.replace(/\D/g, '').length < 9 ? 'No. HP / WA konsumen wajib diisi dengan benar'
    : !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.konsumen_email) ? 'Email konsumen wajib diisi dengan benar' : !/^\d{16}$/.test(d.konsumen_nik) ? 'NIK konsumen wajib 16 digit'
    : !d.alamat ? 'Alamat domisili konsumen wajib diisi' : (!B.transfer?.data || !B.ktp?.data || !B.npwp?.data) ? 'Lampirkan bukti transfer, KTP, dan NPWP konsumen' : null;
  if (salah) return Response.json({ error: salah }, { status: 400 });
  const tersedia = await unitTersedia(sql, l.project).catch(() => null);
  if (tersedia && !tersedia.includes(d.unit)) return Response.json({ error: `Unit ${d.unit} sudah tidak tersedia — pilih unit lain` }, { status: 400 });
  const hari = (await sql`SELECT count(*)::int AS n FROM other_laporan WHERE token = ${l.token} AND created_at > now() - interval '1 day'`)[0]?.n || 0;
  if (hari >= 30) return Response.json({ error: 'Terlalu banyak kiriman dari link ini hari ini' }, { status: 429 });
  let ktp = null, npwp = null, berkas = {};
  try {
    if (c.d.jenis === 'External') { ktp = await simpanDok(sql, l.project, { nama: `KTP ${c.d.nama}`, data: b.other.ktp.data }); npwp = await simpanDok(sql, l.project, { nama: `NPWP ${c.d.nama}`, data: b.other.npwp.data }); }
    berkas = { transfer: await simpanDokDb(sql, B.transfer.data), ktp: await simpanDokDb(sql, B.ktp.data), npwp: await simpanDokDb(sql, B.npwp.data) };
  } catch (e) { return Response.json({ error: e.message }, { status: 502 }); }
  await sql`INSERT INTO other_laporan (token, project, jenis, nama, divisi, hp, ktp, npwp, konsumen, konsumen_wa, konsumen_email, konsumen_nik, alamat, tgl, trx_jenis, unit, nilai, bayar, catatan, berkas)
    VALUES (${l.token}, ${l.project}, ${c.d.jenis}, ${c.d.nama}, ${c.d.divisi}, ${c.d.hp}, ${ktp}, ${npwp}, ${d.konsumen}, ${d.konsumen_wa}, ${d.konsumen_email}, ${d.konsumen_nik}, ${d.alamat},
      ${d.tgl}, ${d.trx_jenis}, ${d.unit}, ${d.nilai}, ${d.bayar}, ${d.catatan}, ${JSON.stringify(berkas)}::jsonb)`;
  return Response.json({ ok: true });
}
