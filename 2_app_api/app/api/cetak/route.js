import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';

// Data lengkap satu transaksi untuk dicetak jadi dokumen
async function _GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  const id = new URL(req.url).searchParams.get('id');
  if (!id) return jsonProyek(user, { error: 'id transaksi wajib' }, { status: 400 });
  const sql = db();
  const rows = await sql`
    SELECT t.id, t.lead_code, t.jenis, t.tgl::text AS tgl, t.nilai, t.harga_unit, t.catatan,
           t.unit, t.verif_status, t.verif_by, t.verif_at, t.no_sp, t.no_ppjb, t.created_by,
           t.tgl_serah_terima::text AS tgl_serah_terima, t.bast_at,
           t.bast_dispensasi, t.bast_dispensasi_alasan, t.no_bast, t.no_rsv,
           l.nama, l.wa, l.email, l.domisili, l.kerja, l.tipe, l.sales,
           l.nama_ktp, l.no_ktp, l.alamat_domisili, l.alamat_ktp, l.npwp,
           COALESCE(NULLIF(t.project, ''), l.project, '') AS project,
           COALESCE(NULLIF(t.bayar, ''), l.bayar, '') AS bayar
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code
    WHERE t.id = ${id}`;
  if (!rows.length) return jsonProyek(user, { error: 'Transaksi tidak ditemukan' }, { status: 404 });
  const t = rows[0];
  // Sales hanya boleh mencetak transaksi lead miliknya
  if (user.role === 'sales' && t.sales !== user.name) {
    return jsonProyek(user, { error: 'Transaksi ini bukan milik Anda' }, { status: 403 });
  }
  // Total pembayaran yang sudah masuk untuk unit ini
  // Kontrak berjadwal: total = kuitansi terkonfirmasi; riwayat = TTS/kuitansi sebenarnya (bukan baris transaksi lama)
  const berjadwal = (await sql`SELECT jadwal_at FROM transactions WHERE id = ${id}`)[0];
  const bayar = berjadwal && berjadwal.jadwal_at
    ? await sql`SELECT COALESCE(sum(nilai), 0)::bigint AS total FROM pembayaran WHERE trx_id = ${id} AND status = 'KW'`
    : await sql`SELECT COALESCE(sum(nilai), 0)::bigint AS total FROM transactions
        WHERE lead_code = ${t.lead_code} AND unit = ${t.unit || ''} AND jenis <> 'Batal'`;
  // Ceklis persiapan unit — dilampirkan pada BAST
  const ceklis = await sql`SELECT judul, status, selesai_by FROM proses
    WHERE trx_id = ${id} AND divisi = 'project' ORDER BY urutan`;
  const hadiah = await sql`SELECT judul, status FROM proses
    WHERE trx_id = ${id} AND divisi = 'markom' ORDER BY urutan`;
  // Otorisasi yang menyertai dokumen ini — dicetak agar keabsahannya dapat diperiksa
  const otorisasi = await sql`SELECT jenis, jabatan, divisi, oleh, oleh_kode, oleh_jabatan,
      mewakili, mewakili_kode, kode, diputus_at, alasan
    FROM otorisasi
    WHERE objek = 'trx' AND objek_id = ${id} AND status = 'Disetujui'
    ORDER BY id`;
  // Riwayat pembayaran unit ini — dilampirkan pada kuitansi
  const riwayat = berjadwal && berjadwal.jadwal_at
    ? (await sql`SELECT id, cara, status, tgl::text AS tgl, nilai, COALESCE(no_kw, no_tts) AS nomor FROM pembayaran
        WHERE trx_id = ${id} AND status <> 'Batal' ORDER BY tgl, id`).map(p => ({ id: p.id,
          jenis: p.cara === 'Pencairan KPR' ? 'Pencairan KPR' : 'Pembayaran', tgl: p.tgl, nilai: p.nilai,
          catatan: (p.nomor || '') + (p.status === 'TTS' ? ' · menunggu kuitansi' : '') }))
    : await sql`SELECT id, jenis, tgl::text AS tgl, nilai, catatan FROM transactions
        WHERE lead_code = ${t.lead_code} AND unit = ${t.unit || ''} AND jenis <> 'Batal'
        ORDER BY tgl, id`;
  // Kop dokumen mengikuti Data Perusahaan project (bila sudah diisi Administrator)
  const pr = await sql`SELECT * FROM perusahaan WHERE project = ${t.project || ''}`;
  return jsonProyek(user, { ...t, total_bayar: Number(bayar[0].total) || 0,
    ceklis, hadiah, riwayat, otorisasi, perusahaan: pr[0] || null, pencetak: user.name });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, { id: 'transactions' });
