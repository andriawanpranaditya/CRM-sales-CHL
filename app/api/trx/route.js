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
  // Wajib bukti transfer pada transaksi PERTAMA lead di unit tsb (transaksi lanjutan bebas)
  if (b.unit && b.project && b.jenis !== 'Batal') {
    const prior = await sql`
      SELECT 1 FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.unit = ${b.unit} AND t.lead_code = ${b.lead_code}
        AND COALESCE(NULLIF(t.project, ''), l.project, '') = ${b.project} LIMIT 1`;
    if (!prior.length) {
      const tf = await sql`SELECT 1 FROM trx_files
        WHERE project = ${b.project} AND unit = ${b.unit} AND lead_code = ${b.lead_code} AND jenis = 'transfer' LIMIT 1`;
      if (!tf.length) {
        return Response.json({ error: 'Upload Bukti Transfer dulu untuk transaksi pertama di unit ini.' }, { status: 400 });
      }
    }
  }

  // Pengaman: unit yang sudah Terjual/Reserved tidak bisa diambil lead lain (kecuali transaksi Batal oleh pemiliknya)
  if (b.unit && b.project && b.jenis !== 'Batal') {
    const last = await sql`
      SELECT t.jenis, t.lead_code FROM transactions t
      LEFT JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.unit = ${b.unit} AND COALESCE(NULLIF(t.project, ''), l.project, '') = ${b.project}
      ORDER BY t.id DESC LIMIT 1`;
    const man = await sql`SELECT status FROM unit_manual WHERE project = ${b.project} AND unit = ${b.unit}`;
    const manSt = man.length ? man[0].status : null;
    // Lead pemilik = lead dgn transaksi terakhir non-Batal di unit ini — selalu boleh lanjut (Reserved -> Booking dst)
    const ownerOk = last.length && last[0].jenis !== 'Batal' && last[0].lead_code === b.lead_code;
    let heldByOther;
    if (manSt === 'Kosong') heldByOther = false;
    else if (manSt === 'Terjual' || manSt === 'Reserved') heldByOther = !ownerOk;
    else heldByOther = last.length && last[0].jenis !== 'Batal' && last[0].lead_code !== b.lead_code;
    if (heldByOther) {
      return Response.json({ error: 'Unit ' + b.unit + ' sudah Terjual/Reserved. Pilih unit lain atau minta manager membuka stoknya di Master Stock.' }, { status: 400 });
    }
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
