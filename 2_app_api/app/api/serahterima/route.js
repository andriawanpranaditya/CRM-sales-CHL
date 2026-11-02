import { db } from '@/lib/db';
import { ambilNomor, nomorInternal } from '@/lib/penomoran';
import { requireUser } from '@/lib/auth';
import { tahanSampaiDiotorisasi } from '@/lib/tahan';
import { KATEGORI_BAST } from '@/lib/templat';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';

// Catat pelaksanaan serah terima unit (BAST) — menutup tahap Admin Project
// dan membuka penanganan Estate.
async function _POST(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!['project', 'administrator', 'headsales', 'salesmanager'].includes(user.role)) {
    return Response.json({ error: 'Hanya Admin Project yang mencatat serah terima unit.' }, { status: 403 });
  }
  const b = await req.json();
  if (!b.trx_id) return Response.json({ error: 'Transaksi wajib dipilih' }, { status: 400 });
  // Empat kategori (PRD FR-6.2): BAST, Pinjam Pakai, Serah Terima Otomatis, PPN DTP — masing-masing bernomor sendiri
  const kategoriKey = b.kategori || 'bast';
  const kat = KATEGORI_BAST[kategoriKey];
  if (!kat) return Response.json({ error: 'Kategori BAST tidak dikenal' }, { status: 400 });
  const sql = db();

  const rows = await sql`SELECT t.id, t.lead_code, t.unit, t.bast_at, t.harga_unit, t.no_bast, t.jadwal_at, t.skema_kode, t.batal_at, l.nama,
      COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar,
      COALESCE(NULLIF(t.project, ''), l.project, '') AS project
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${b.trx_id}`;
  if (!rows.length) return Response.json({ error: 'Transaksi tidak ditemukan' }, { status: 404 });
  const t = rows[0];
  if (t.batal_at) return Response.json({ error: 'Kontrak ini sudah dibatalkan — serah terima tidak dapat dicatat.' }, { status: 400 });
  if (t.bast_at) return Response.json({ error: 'Serah terima unit ini sudah tercatat.' }, { status: 400 });

  // Ceklis persiapan unit wajib tuntas sebelum BAST diterbitkan
  const sisa = await sql`SELECT count(*)::int AS n FROM proses
    WHERE trx_id = ${t.id} AND divisi = 'project' AND status <> 'Selesai'`;
  if (sisa[0].n > 0) {
    return Response.json({ error: 'Masih ada ' + sisa[0].n + ' ceklis persiapan unit yang belum selesai.' }, { status: 400 });
  }

  // Syarat pembayaran sesuai Kebijakan & Prosedur Penjualan:
  //   skema KPR  -> akad kredit harus sudah selesai
  //   skema cash -> seluruh kewajiban pembayaran lunas 100%
  // Bila belum terpenuhi, serah terima tidak langsung ditolak melainkan ditahan
  // sampai memperoleh dispensasi direksi (Project CEO / CFO / CEO).
  // Kontrak berjadwal (Fase 3) dinilai dari TAGIHAN & PEMBAYARAN yang sebenarnya; kontrak lama dari baris transaksi.
  let skemaJenis = null;
  if (t.jadwal_at) skemaJenis = ((await sql`SELECT jenis FROM skema_bayar WHERE project = ${t.project} AND kode = ${t.skema_kode}`)[0] || {}).jenis || null;
  const pakaiKPR = t.jadwal_at && skemaJenis ? skemaJenis === 'kpr' : /kpr/i.test(t.bayar || '');
  let belumPenuhi = null;

  if (t.jadwal_at) {
    if (pakaiKPR) {
      const akad = await sql`SELECT
        (SELECT count(*)::int FROM tagihan WHERE trx_id = ${t.id} AND jenis = 'AKAD' AND status = 'Lunas') AS baris,
        (SELECT count(*)::int FROM proses WHERE trx_id = ${t.id} AND divisi = 'collection' AND judul ILIKE '%akad%' AND status = 'Selesai') AS proses`;
      if (akad[0].baris === 0 && akad[0].proses === 0) belumPenuhi = 'Skema KPR: akad kredit belum selesai';
    } else {
      const sisa = Number((await sql`SELECT COALESCE(sum(nilai - dibayar), 0)::bigint AS n FROM tagihan WHERE trx_id = ${t.id}`)[0].n);
      if (sisa > 0) belumPenuhi = 'Skema tunai: masih ada sisa tagihan Rp ' + sisa.toLocaleString('id-ID');
    }
  } else if (pakaiKPR) {
    const akad = await sql`SELECT count(*)::int AS n FROM proses
      WHERE trx_id = ${t.id} AND divisi = 'collection'
        AND judul ILIKE '%akad%' AND status = 'Selesai'`;
    if (akad[0].n === 0) belumPenuhi = 'Skema KPR: akad kredit belum selesai';
  } else {
    const harga = Number(t.harga_unit) || 0;
    const bayar = await sql`SELECT COALESCE(sum(nilai), 0)::bigint AS total FROM transactions
      WHERE lead_code = ${t.lead_code} AND unit = ${t.unit || ''} AND jenis <> 'Batal'`;
    const masuk = Number(bayar[0].total) || 0;
    if (!harga) {
      // Tanpa nilai transaksi, pelunasan tidak dapat dinilai sama sekali —
      // ini kekurangan data, bukan perkara kebijakan, sehingga tetap ditolak.
      return Response.json({
        error: 'Nilai transaksi belum diisi, sehingga pelunasan tidak dapat diperiksa. Lengkapi lebih dulu pada menu Verifikasi.',
      }, { status: 400 });
    }
    if (masuk < harga) {
      const kurang = (harga - masuk).toLocaleString('id-ID');
      belumPenuhi = 'Skema tunai: pembayaran kurang Rp ' + kurang +
        ' dari nilai transaksi Rp ' + harga.toLocaleString('id-ID');
    }
  }

  if (belumPenuhi) {
    const tahanDispensasi = await tahanSampaiDiotorisasi(sql, user, {
      jenis: 'bast_dispensasi', objek: 'transaksi', objek_id: t.id,
      nilai: Number(t.harga_unit) || 0,
      ringkas: (t.nama || t.lead_code) + ' — ' + (t.project || '') + ' ' + (t.unit || '') +
        ' · serah terima menyimpang dari prosedur (' + belumPenuhi + ')',
    });
    if (tahanDispensasi) return tahanDispensasi;
  }

  const tahan = await tahanSampaiDiotorisasi(sql, user, {
    jenis: 'bast', objek: 'transaksi', objek_id: t.id,
    ringkas: (t.nama || t.lead_code) + ' — ' + (t.project || '') + ' ' + (t.unit || '') + ' · catat ' + kat.nama,
  });
  if (tahan) return tahan;

  // Dicatat agar tercetak pada BAST dan terlihat saat audit
  if (belumPenuhi) {
    await sql`UPDATE transactions SET bast_dispensasi = true,
        bast_dispensasi_alasan = ${belumPenuhi} WHERE id = ${t.id}`;
  }

  // Nomor BAST: format legal bila penomoran project sudah aktif, internal bila belum
  // Tiap kategori punya jenis nomor sendiri; format yang belum ditetapkan (kategori baru) memakai nomor internal.
  // Pinjam Pakai memiliki dokumen pendamping (Perjanjian Pinjam Pakai) yang bernomor sendiri.
  const no_bast = t.no_bast || (await ambilNomor(sql, t.project, kat.jenis)) || nomorInternal(kat.internal, t.id);
  const no_perj = kategoriKey === 'pinjam_pakai' ? ((await ambilNomor(sql, t.project, 'PERJ_PP')) || nomorInternal('PERJ-PP', t.id)) : null;
  // Alur 10 tahap: BAST menuntaskan tahap 8 (Serah Terima Unit) dan menyerahkan
  // berkas ke tahap 9 (Pengelolaan Estate)
  await sql`UPDATE transactions SET bast_at = now(), no_bast = ${no_bast}, bast_kategori = ${kategoriKey}, no_perj_pp = ${no_perj},
      tgl_serah_terima = COALESCE(tgl_serah_terima, CURRENT_DATE),
      tahap = GREATEST(tahap, 9) WHERE id = ${t.id}`;
  await sql`INSERT INTO alur_log (trx_id, lead_code, dari_tahap, ke_tahap, dari_divisi, ke_divisi, oleh, catatan, jenis)
    VALUES (${t.id}, ${t.lead_code}, 8, 9, 'project', 'estate', ${user.name},
            ${'Serah terima unit selesai (' + kat.nama + '), No. ' + no_bast + ' terbit'}, 'maju')`;

  // Cukup Estate yang diberi tahu — merekalah pemegang berkas berikutnya
  const info = (t.nama || t.lead_code) + ' - ' + (t.project || '') + ' ' + (t.unit || '');
  await sql`INSERT INTO notifikasi (role_tujuan, judul, pesan, lead_code, trx_id)
    VALUES ('estate', 'Berkas baru masuk ke divisi Anda', ${info}, ${t.lead_code}, ${t.id})`;
  // Masa retensi 90 hari sejak serah terima
  const retensi = new Date(Date.now() + 90 * 86400000).toISOString().slice(0, 10);
  await sql`UPDATE proses SET deadline = ${retensi}
    WHERE trx_id = ${t.id} AND divisi = 'estate' AND judul ILIKE '%retensi%' AND status <> 'Selesai'`;
  return Response.json({ ok: true, no_bast, no_perjanjian: no_perj, kategori: kategoriKey });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const POST = jagaProyek(_POST, {});
