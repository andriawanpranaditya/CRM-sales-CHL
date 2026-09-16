import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const rows = user.role !== 'sales'
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

  // Reserved -> Booking/Closing: baris Reserved dilebur, tanggalnya masuk ke keterangan Booking
  let catatan = b.catatan || '';
  if ((b.jenis === 'Booking' || b.jenis === 'Closing') && b.unit && b.project) {
    const res = await sql`
      SELECT t.id, t.tgl::text AS tgl FROM transactions t
      LEFT JOIN leads l ON l.lead_code = t.lead_code
      WHERE t.jenis = 'Reserved' AND t.unit = ${b.unit} AND t.lead_code = ${b.lead_code}
        AND COALESCE(NULLIF(t.project, ''), l.project, '') = ${b.project}
      ORDER BY t.id`;
    if (res.length) {
      const tglRes = res[0].tgl ? res[0].tgl.slice(0, 10).split('-').reverse().join('/') : '';
      const jejak = 'Reserved tgl ' + (tglRes || '-');
      if (!catatan.includes('Reserved tgl')) catatan = catatan ? jejak + ' · ' + catatan : jejak;
      for (const r of res) await sql`DELETE FROM transactions WHERE id = ${r.id}`;
    }
  }
  await sql`INSERT INTO transactions (lead_code, jenis, tgl, nilai, catatan, project, bayar, unit, created_by)
    VALUES (${b.lead_code}, ${b.jenis}, ${b.tgl || null}, ${Number(b.nilai) || 0}, ${catatan},
            ${b.project || ''}, ${b.bayar || ''}, ${b.unit || ''}, ${user.username})`;
  // Booking/Closing: tanda manual (mis. kuning Reserved) dilepas supaya peta mengikuti transaksi -> merah
  if ((b.jenis === 'Booking' || b.jenis === 'Closing') && b.unit && b.project) {
    await sql`DELETE FROM unit_manual WHERE project = ${b.project} AND unit = ${b.unit}`;
  }
  // Reserved tidak mengubah status pipeline; Batal -> Drop; Booking/Closing sesuai jenisnya
  if (b.jenis !== 'Reserved') {
    const newStatus = b.jenis === 'Batal' ? 'Drop' : b.jenis;
    await sql`UPDATE leads SET status = ${newStatus}, updated_at = now() WHERE lead_code = ${b.lead_code}`;
  }
  // Reserved/Booking/Closing: jadwal FU otomatis dihentikan (tidak perlu diingatkan lagi)
  if (b.jenis !== 'Batal') {
    await sql`UPDATE leads SET next_fu = NULL, updated_at = now() WHERE lead_code = ${b.lead_code}`;
  }
  return Response.json({ ok: true });
}

// Hitung ulang status pipeline lead dari transaksi tersisa (dipakai PATCH & DELETE)
async function sinkronStatus(sql, lead_code) {
  const rows = await sql`SELECT jenis FROM transactions WHERE lead_code = ${lead_code} ORDER BY id DESC`;
  const t = rows.find(r => r.jenis !== 'Reserved');
  if (t) {
    const st = t.jenis === 'Batal' ? 'Drop' : t.jenis;
    await sql`UPDATE leads SET status = ${st}, updated_at = now() WHERE lead_code = ${lead_code}`;
  }
  // Bila hanya tersisa Reserved / tidak ada transaksi: status dibiarkan — manager bisa atur di Database Lead
}

// Edit transaksi — khusus manager. Status pipeline lead disinkronkan otomatis.
export async function PATCH(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  if (!['Reserved', 'Booking', 'Closing', 'Batal'].includes(b.jenis)) return Response.json({ error: 'Jenis transaksi tidak valid' }, { status: 400 });
  const sql = db();
  const rows = await sql`SELECT lead_code, jenis, tgl::text AS tgl FROM transactions WHERE id = ${b.id}`;
  if (!rows.length) return Response.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  let catatan = b.catatan || '';
  if (b.jenis === 'Booking' || b.jenis === 'Closing') {
    // Baris Reserved lain di unit yang sama dilebur; bila baris ini sendiri yang naik dari Reserved, tanggalnya dicatat
    const lain = b.unit && b.project
      ? await sql`SELECT t.id, t.tgl::text AS tgl FROM transactions t
          LEFT JOIN leads l ON l.lead_code = t.lead_code
          WHERE t.jenis = 'Reserved' AND t.unit = ${b.unit} AND t.lead_code = ${rows[0].lead_code}
            AND COALESCE(NULLIF(t.project, ''), l.project, '') = ${b.project} AND t.id <> ${b.id}
          ORDER BY t.id`
      : [];
    const tglRes = lain.length ? lain[0].tgl : (rows[0].jenis === 'Reserved' ? rows[0].tgl : null);
    if (tglRes && !catatan.includes('Reserved tgl')) {
      const d = tglRes.slice(0, 10).split('-').reverse().join('/');
      catatan = catatan ? 'Reserved tgl ' + d + ' · ' + catatan : 'Reserved tgl ' + d;
    }
    for (const r of lain) await sql`DELETE FROM transactions WHERE id = ${r.id}`;
    if (b.unit && b.project) await sql`DELETE FROM unit_manual WHERE project = ${b.project} AND unit = ${b.unit}`;
  }
  await sql`UPDATE transactions SET
      tgl = ${b.tgl || null}, jenis = ${b.jenis}, nilai = ${Number(b.nilai) || 0},
      project = ${b.project || ''}, bayar = ${b.bayar || ''}, unit = ${b.unit || ''},
      catatan = ${catatan}
    WHERE id = ${b.id}`;
  await sinkronStatus(sql, rows[0].lead_code);
  return Response.json({ ok: true });
}

// Hapus transaksi — khusus manager. Status lead & stok otomatis mengikuti transaksi tersisa.
export async function DELETE(req) {
  const { err } = await requireUser('manager'); if (err) return err;
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id wajib' }, { status: 400 });
  const sql = db();
  const rows = await sql`DELETE FROM transactions WHERE id = ${b.id} RETURNING lead_code`;
  if (!rows.length) return Response.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  await sinkronStatus(sql, rows[0].lead_code);
  return Response.json({ ok: true });
}
