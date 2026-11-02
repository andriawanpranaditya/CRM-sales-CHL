import { db } from '@/lib/db';
import { ambilNomor, nomorInternal } from '@/lib/penomoran';
import { bentukKontrak } from '@/lib/kontrak';
import { requireUser } from '@/lib/auth';
import { buatProsesDivisi } from '@/lib/alur';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';

const BOLEH_VERIF = ['adminsales', 'administrator', 'headsales', 'salesmanager'];

// Nomor dokumen otomatis: SP/HO/2026/09/0007
// Daftar transaksi beserta status verifikasinya
async function _GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const sql = db();
  const q = new URL(req.url).searchParams;
  const filter = q.get('status') || '';

  const rows = await sql`
    SELECT t.id, t.lead_code, t.jenis, t.tgl::text AS tgl, t.nilai, t.harga_unit, t.skema_harga, t.skema_kode, t.jadwal_at, t.catatan,
           t.unit, t.verif_status, t.verif_catatan, t.verif_by, t.verif_at,
           t.no_sp, t.no_ppjb, t.created_by, t.bast_at, t.tahap,
           t.finance_konfirmasi_at, t.finance_konfirmasi_by, t.finance_catatan,
           t.ttd_deadline::text AS ttd_deadline, t.ttd_selesai_at,
           t.approval_mgmt_at, t.approval_mgmt_by,
           (SELECT count(*)::int FROM trx_files f
             WHERE f.lead_code = t.lead_code AND f.unit = t.unit AND f.jenis = 'lainnya') AS ada_lainnya,
           (SELECT count(*)::int FROM trx_files f
             WHERE f.lead_code = t.lead_code AND f.unit = t.unit AND f.jenis = 'npwp') AS ada_npwp,
           t.dispensasi_npwp, t.dispensasi_npwp_oleh, t.dispensasi_npwp_at,
           t.distribusi_konsumen_at, t.distribusi_arsip_at, t.distribusi_oleh,
           l.domisili, l.npwp AS npwp_nomor,
           l.nama, l.wa, l.tipe, l.sales, l.domisili, l.kerja,
           l.nama_ktp, l.no_ktp, l.alamat_domisili, l.alamat_ktp, l.email, l.sumber,
           COALESCE(NULLIF(t.project, ''), l.project, '') AS project,
           COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar,
           (SELECT count(*)::int FROM trx_files f
             WHERE f.lead_code = t.lead_code AND f.unit = t.unit AND f.jenis = 'ktp') AS ada_ktp,
           (SELECT count(*)::int FROM trx_files f
             WHERE f.lead_code = t.lead_code AND f.unit = t.unit AND f.jenis = 'transfer') AS ada_transfer
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE t.jenis IN ('Reserved','Booking','Closing')
    ORDER BY (t.verif_status = 'Menunggu') DESC, t.id DESC`;

  const hasil = filter ? rows.filter(r => r.verif_status === filter) : rows;
  return jsonProyek(user, { rows: hasil, boleh: BOLEH_VERIF.includes(user.role) });
}

// Verifikasi / tolak transaksi — hanya Admin Sales & Manager
async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!BOLEH_VERIF.includes(user.role)) {
    return Response.json({ error: 'Hanya Admin Sales yang dapat memverifikasi transaksi.' }, { status: 403 });
  }
  const b = await req.json();
  if (!b.id) return Response.json({ error: 'id transaksi wajib' }, { status: 400 });
  if (!['Terverifikasi', 'Ditolak'].includes(b.status)) {
    return Response.json({ error: 'Status verifikasi tidak valid' }, { status: 400 });
  }
  if (b.status === 'Ditolak' && !String(b.catatan || '').trim()) {
    return Response.json({ error: 'Isi catatan revisi agar Sales tahu apa yang harus diperbaiki.' }, { status: 400 });
  }

  const sql = db();
  const cur = await sql`
    SELECT t.*, l.nama, l.sales, COALESCE(NULLIF(t.project, ''), l.project, '') AS project
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${b.id}`;
  if (!cur.length) return Response.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  const t = cur[0];

  if (b.status === 'Terverifikasi') {
    // Berkas wajib lengkap sebelum SP & PPJB terbit
    const f = await sql`SELECT jenis FROM trx_files
      WHERE lead_code = ${t.lead_code} AND unit = ${t.unit || ''}`;
    const punya = j => f.some(x => x.jenis === j);
    if (!punya('transfer')) return Response.json({ error: 'Bukti transfer belum diunggah Sales.' }, { status: 400 });
    if (!punya('ktp')) return Response.json({ error: 'KTP konsumen belum diunggah Sales.' }, { status: 400 });
    // NPWP wajib sesuai prosedur, kecuali telah memperoleh dispensasi Kepala Divisi
    if (!punya('npwp') && !t.dispensasi_npwp) {
      return Response.json({ error: 'NPWP konsumen belum diunggah dan belum ada dispensasi Kepala Divisi.' }, { status: 400 });
    }
    // Cross-check Booking Fee wajib dikonfirmasi Finance lebih dulu
    if (!t.finance_konfirmasi_at) {
      return Response.json({ error: 'Mutasi rekening belum dikonfirmasi Finance. Minta Finance mencatat konfirmasinya di menu Verifikasi.' }, { status: 400 });
    }

    // Verifikasi SP & PPJB TIDAK lagi memerlukan otorisasi Kepala Divisi — Admin Sales langsung menerbitkan.
    // Permintaan otorisasi lama yang masih menggantung untuk transaksi ini ditutup agar tidak tersisa di antrean.
    await sql`UPDATE otorisasi SET status = 'Dibatalkan', alasan = 'Tidak diperlukan — verifikasi SP & PPJB tanpa otorisasi Kepala Divisi'
      WHERE jenis = 'verifikasi_sp' AND objek = 'transaksi' AND objek_id = ${t.id} AND status = 'Menunggu'`;

    // Format legal (BIO/SP/..., BIO/P3U/ADM-LGL/...) bila penomoran project sudah
    // aktif; selama masa peralihan tetap internal agar tidak bentrok dengan sistem lama
    // Kontrak: skema cara bayar dipastikan Admin Sales -> DPP/PPN & jadwal tagihan terbentuk.
    // Dilakukan sebelum status berubah, agar kegagalan skema tidak meninggalkan verifikasi setengah jalan.
    let kontrak = null;
    if (b.skema_kode) {
      await sql`UPDATE transactions SET harga_unit = ${Number(b.harga_unit) || t.harga_unit || 0} WHERE id = ${t.id}`;
      try { kontrak = await bentukKontrak(sql, t.id, b.skema_kode, user.name, b.tgl_kontrak || null); }
      catch (e) { return Response.json({ error: 'Verifikasi dibatalkan: ' + e.message }, { status: 400 }); }
    }
    const no_sp = t.no_sp || (await ambilNomor(sql, t.project, 'SP')) || nomorInternal('SP', t.id);
    const no_ppjb = t.no_ppjb || (await ambilNomor(sql, t.project, 'P3U')) || nomorInternal('PPJB', t.id);
    await sql`UPDATE transactions SET
        verif_status = 'Terverifikasi', verif_catatan = ${b.catatan || ''},
        verif_by = ${user.name}, verif_at = now(),
        no_sp = ${no_sp}, no_ppjb = ${no_ppjb},
        harga_unit = ${Number(b.harga_unit) || t.harga_unit || 0}
      WHERE id = ${t.id}`;

    // Verifikasi menyelesaikan tahap 2 — dokumen diserahkan untuk ditandatangani.
    // Batas tujuh hari kalender sesuai Kebijakan & Prosedur Penjualan.
    const tenggat = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
    await sql`UPDATE transactions SET tahap = GREATEST(tahap, 3),
                ttd_deadline = COALESCE(ttd_deadline, ${tenggat}) WHERE id = ${t.id}`;
    await sql`INSERT INTO alur_log (trx_id, lead_code, dari_tahap, ke_tahap, dari_divisi, ke_divisi, oleh, catatan, jenis)
      VALUES (${t.id}, ${t.lead_code}, 2, 3, 'adminsales', 'sales', ${user.name},
              ${'Verifikasi selesai, SP ' + no_sp + ' terbit. Batas tanda tangan ' + tenggat}, 'maju')`;
    await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
      VALUES ('sales', 'Dokumen siap ditandatangani konsumen',
              ${(t.nama || t.lead_code) + ' - batas ' + tenggat}, ${t.lead_code}, ${t.id})`;

    // Buat daftar kerja tiap divisi sesuai SOP (ceklis, milestone, jadwal)
    await buatProsesDivisi(sql, { id: t.id, lead_code: t.lead_code, bayar: t.bayar });

    // Satu pemberitahuan singkat ke tiap divisi: ada berkas baru untuk dikerjakan.
    // Perkembangan selanjutnya dipantau lewat Papan Alur, bukan lewat lonceng.
    const pesan = (t.nama || t.lead_code) + ' - ' + (t.project || '-') + ' ' + (t.unit || '') +
      ' (' + t.jenis + ')';
    for (const role of ['collection', 'finance', 'project', 'estate', 'markom']) {
      await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
                VALUES (${role}, 'Transaksi baru', ${pesan}, ${t.lead_code}, ${t.id})`;
    }
    return Response.json({ ok: true, no_sp, no_ppjb, kontrak });
  }

  await sql`UPDATE transactions SET
      verif_status = 'Ditolak', verif_catatan = ${b.catatan},
      verif_by = ${user.name}, verif_at = now()
    WHERE id = ${t.id}`;
  await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
            VALUES ('sales', 'Transaksi perlu revisi',
                    ${(t.nama || t.lead_code) + ' - ' + b.catatan}, ${t.lead_code}, ${t.id})`;
  return Response.json({ ok: true });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, { id: 'transactions' });
export const POST = jagaProyek(_POST, { id: 'transactions' });
