import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { tahanSampaiDiotorisasi } from '@/lib/tahan';
import { bacaReservasi, hariIniWIB, tambahHariISO } from '@/lib/reservasi';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';

// GET  -> kebijakan (masa berlaku reservasi, hari)
// POST { aksi: 'perpanjang', trx_id, alasan }  -> perpanjang reservasi yang sedang berjalan (butuh otorisasi Manager Sales)
// POST { aksi: 'kebijakan', masa_hari }        -> ubah masa berlaku (Administrator)
async function _GET() {
  const { user, err } = await requireUser(); if (err) return err;
  return jsonProyek(user, await bacaReservasi(db()));
}

async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  const sql = db();

  if (b.aksi === 'kebijakan') {
    if (!['administrator', 'headsales', 'salesmanager'].includes(user.role)) return Response.json({ error: 'Hanya Administrator yang dapat mengubah kebijakan reservasi' }, { status: 403 });
    const hari = Math.round(Number(b.masa_hari));
    if (!Number.isInteger(hari) || hari < 1 || hari > 60) return Response.json({ error: 'Masa berlaku reservasi harus 1–60 hari' }, { status: 400 });
    await sql`INSERT INTO settings (key, items) VALUES ('reservasi', ${JSON.stringify({ masa_hari: hari })}::jsonb)
      ON CONFLICT (key) DO UPDATE SET items = EXCLUDED.items`;
    return Response.json({ ok: true });
  }

  if (b.aksi === 'perpanjang') {
    if (!['sales', 'adminsales', 'administrator', 'headsales', 'salesmanager'].includes(user.role)) return Response.json({ error: 'Tidak berwenang memperpanjang reservasi' }, { status: 403 });
    const alasan = String(b.alasan || '').trim();
    if (!alasan) return Response.json({ error: 'Alasan perpanjangan wajib diisi' }, { status: 400 });
    const t = (await sql`SELECT t.id, t.jenis, t.unit, t.lead_code, t.perpanjang_n, t.tgl_expire::text AS tgl_expire,
        COALESCE(NULLIF(t.project, ''), l.project, '') AS project, l.sales, COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama
      FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${Number(b.trx_id)}`)[0];
    if (!t || t.jenis !== 'Reserved') return Response.json({ error: 'Hanya baris Reserved yang dapat diperpanjang' }, { status: 400 });
    if (user.role === 'sales' && t.sales !== user.name) return Response.json({ error: 'Lead ini bukan milik Anda' }, { status: 403 });
    if (!t.tgl_expire) return Response.json({ error: 'Reservasi lama ini tidak memiliki batas waktu — tidak perlu diperpanjang' }, { status: 400 });
    const lebihBaru = await sql`SELECT 1 FROM transactions t2 LEFT JOIN leads l2 ON l2.lead_code = t2.lead_code
      WHERE t2.unit = ${t.unit} AND t2.id > ${t.id} AND COALESCE(NULLIF(t2.project, ''), l2.project, '') = ${t.project} LIMIT 1`;
    if (lebihBaru.length) return Response.json({ error: 'Reservasi ini sudah bukan status terakhir unit (sudah menjadi Booking atau ada transaksi lain)' }, { status: 400 });

    const tahan = await tahanSampaiDiotorisasi(sql, user, { jenis: 'reservasi_lewat_batas', objek: 'reservasi:' + t.id + ':perpanjang#' + t.perpanjang_n, objek_id: t.id,
      ringkas: (t.nama || t.lead_code) + ' — ' + t.project + ' ' + t.unit + ' · perpanjang reservasi (berakhir ' + t.tgl_expire + ') — ' + alasan, nilai: 0 });
    if (tahan) return tahan;

    // Batas baru = masa berlaku penuh dihitung dari tanggal batas lama, atau dari hari ini bila sudah lewat
    const masa = (await bacaReservasi(sql)).masa_hari;
    const dasar = t.tgl_expire > hariIniWIB() ? t.tgl_expire : hariIniWIB();
    const baru = tambahHariISO(dasar, masa);
    await sql`UPDATE transactions SET tgl_expire = ${baru}, perpanjang_n = perpanjang_n + 1 WHERE id = ${t.id}`;
    return Response.json({ ok: true, tgl_expire: baru });
  }

  return Response.json({ error: 'Aksi tidak dikenal' }, { status: 400 });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, {});
export const POST = jagaProyek(_POST, {});
