import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { tahanSampaiDiotorisasi } from '@/lib/tahan';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';

// Alur komisi: Finance deteksi syarat (bayar >= 20% ATAU akad selesai) -> notif Admin Sales
// -> Admin Sales ajukan -> Manager approve -> Finance bayar.
const ALUR = ['Layak', 'Diajukan', 'Disetujui', 'Dibayar', 'Ditolak'];

// Hitung transaksi yang sudah memenuhi syarat komisi namun belum tercatat
async function scanLayak(sql) {
  const rows = await sql`
    SELECT t.id, t.lead_code, t.harga_unit, l.sales,
           COALESCE(NULLIF(t.project, ''), l.project, '') AS project, t.unit,
           CASE WHEN t.jadwal_at IS NOT NULL
             -- kontrak berjadwal: kuitansi yang sudah terkonfirmasi Finance, di luar pencairan bank (bukan uang konsumen)
             THEN (SELECT COALESCE(sum(pb.nilai), 0)::bigint FROM pembayaran pb WHERE pb.trx_id = t.id AND pb.status = 'KW' AND COALESCE(pb.cara, '') <> 'Pencairan KPR')
             ELSE (SELECT COALESCE(sum(x.nilai), 0)::bigint FROM transactions x
               WHERE x.lead_code = t.lead_code AND x.unit = t.unit AND x.jenis <> 'Batal') END AS bayar_masuk,
           ((SELECT count(*)::int FROM proses p
             WHERE p.trx_id = t.id AND p.divisi = 'collection'
               AND p.judul ILIKE '%akad%' AND p.status = 'Selesai')
            + (SELECT count(*)::int FROM tagihan g WHERE g.trx_id = t.id AND g.jenis = 'AKAD' AND g.status = 'Lunas')) AS akad_selesai
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE t.verif_status = 'Terverifikasi' AND t.jenis <> 'Batal' AND t.batal_at IS NULL
      AND NOT EXISTS (SELECT 1 FROM komisi k WHERE k.trx_id = t.id)`;

  const baru = [];
  for (const t of rows) {
    const harga = Number(t.harga_unit) || 0;
    const bayar = Number(t.bayar_masuk) || 0;
    const persen = harga > 0 ? (bayar / harga) * 100 : 0;
    const dasar = t.akad_selesai > 0 ? 'Akad kredit selesai'
      : persen >= 20 ? 'Pembayaran mencapai ' + persen.toFixed(1) + '% dari harga unit'
      : null;
    if (!dasar) continue;
    await sql`INSERT INTO komisi (trx_id, lead_code, sales, dasar, nilai_transaksi, status)
      VALUES (${t.id}, ${t.lead_code}, ${t.sales || ''}, ${dasar}, ${harga || bayar}, 'Layak')
      ON CONFLICT (trx_id) DO NOTHING`;
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('adminsales', 'Komisi dapat diajukan',
              ${(t.sales || 'Sales') + ' - ' + (t.project || '') + ' ' + (t.unit || '') + ' : ' + dasar},
              ${t.lead_code}, ${t.id})`;
    baru.push(t.id);
  }
  return baru.length;
}

async function _GET() {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  // Finance & manager memicu pemindaian syarat komisi saat membuka halaman
  let baru = 0;
  if (['finance', 'administrator', 'headsales', 'salesmanager'].includes(user.role)) baru = await scanLayak(sql);

  const rows = await sql`
    SELECT k.*, t.unit, t.harga_unit, l.nama,
           COALESCE(NULLIF(t.project, ''), l.project, '') AS project
    FROM komisi k
    JOIN transactions t ON t.id = k.trx_id
    LEFT JOIN leads l ON l.lead_code = k.lead_code
    ORDER BY (k.status = 'Dibayar') ASC, k.id DESC`;

  const hak = {
    ajukan: ['adminsales', 'administrator', 'headsales', 'salesmanager'].includes(user.role),
    approve: ['administrator', 'headsales'].includes(user.role),   // persetujuan komisi: Administrator & Head of Sales & Marketing
    bayar: ['finance', 'administrator'].includes(user.role),   // pembayaran komisi: Finance & Administrator
  };
  return jsonProyek(user, { rows, hak, baru, role: user.role });
}

async function _PATCH(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const b = await req.json();
  if (!b.id || !ALUR.includes(b.status)) return Response.json({ error: 'Data tidak valid' }, { status: 400 });
  const sql = db();
  const cur = await sql`SELECT k.*, l.nama FROM komisi k
    LEFT JOIN leads l ON l.lead_code = k.lead_code WHERE k.id = ${b.id}`;
  if (!cur.length) return Response.json({ error: 'Data komisi tidak ditemukan' }, { status: 404 });
  const k = cur[0];

  const izin = {
    Diajukan: ['adminsales', 'administrator', 'headsales', 'salesmanager'],
    Disetujui: ['administrator', 'headsales'],
    Ditolak: ['administrator', 'headsales'],
    Dibayar: ['finance', 'administrator'],
  };
  if (izin[b.status] && !izin[b.status].includes(user.role)) {
    return Response.json({ error: 'Peran Anda tidak berhak mengubah status ini.' }, { status: 403 });
  }

  if (b.status === 'Diajukan') {
    const rate = Number(b.rate) || 0;
    const tahan = await tahanSampaiDiotorisasi(sql, user, {
      jenis: 'komisi_ajukan', objek: 'komisi', objek_id: k.id,
      ringkas: (k.sales || 'Sales') + ' — ' + (k.nama || k.lead_code) + ' · pengajuan komisi',
      nilai: Math.round((Number(b.nilai_transaksi) || k.nilai_transaksi || 0) * rate / 100),
    });
    if (tahan) return tahan;
    const dasar = Number(b.nilai_transaksi) || k.nilai_transaksi || 0;
    const nilai = Math.round(dasar * rate / 100);
    if (!rate) return Response.json({ error: 'Isi rate komisi (%) lebih dulu.' }, { status: 400 });
    await sql`UPDATE komisi SET status = 'Diajukan', rate = ${rate},
        nilai_transaksi = ${dasar}, nilai_komisi = ${nilai}, catatan = ${b.catatan || ''},
        diajukan_by = ${user.name}, diajukan_at = now() WHERE id = ${k.id}`;
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('administrator', 'Pengajuan komisi menunggu persetujuan',
              ${(k.sales || 'Sales') + ' - ' + (k.nama || k.lead_code)}, ${k.lead_code}, ${k.trx_id})`;
    return Response.json({ ok: true });
  }

  if (b.status === 'Disetujui') {
    await sql`UPDATE komisi SET status = 'Disetujui', approval_by = ${user.name},
        approval_at = now(), catatan = ${b.catatan || k.catatan || ''} WHERE id = ${k.id}`;
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('finance', 'Komisi disetujui - siap dibayarkan',
              ${(k.sales || 'Sales') + ' - ' + (k.nama || k.lead_code)}, ${k.lead_code}, ${k.trx_id})`;
    return Response.json({ ok: true });
  }

  if (b.status === 'Dibayar') {
    await sql`UPDATE komisi SET status = 'Dibayar', dibayar_by = ${user.name}, dibayar_at = now() WHERE id = ${k.id}`;
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('sales', 'Komisi telah dibayarkan',
              ${(k.nama || k.lead_code) + ' - komisi sudah diproses Finance.'}, ${k.lead_code}, ${k.trx_id})`;
    return Response.json({ ok: true });
  }

  if (b.status === 'Ditolak') {
    if (!String(b.catatan || '').trim()) return Response.json({ error: 'Isi alasan penolakan.' }, { status: 400 });
    await sql`UPDATE komisi SET status = 'Ditolak', catatan = ${b.catatan},
        approval_by = ${user.name}, approval_at = now() WHERE id = ${k.id}`;
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('adminsales', 'Pengajuan komisi perlu revisi', ${b.catatan}, ${k.lead_code}, ${k.trx_id})`;
    return Response.json({ ok: true });
  }

  await sql`UPDATE komisi SET status = ${b.status} WHERE id = ${k.id}`;
  return Response.json({ ok: true });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, { id: 'komisi' });
export const PATCH = jagaProyek(_PATCH, { id: 'komisi' });
