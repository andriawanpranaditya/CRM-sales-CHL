import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { DOK_BAST, KATEGORI_BAST, bacaTemplat, isiTemplat } from '@/lib/templat';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';
const BOLEH = ['administrator', 'headsales', 'salesmanager', 'admin', 'adminsales', 'project', 'estate', 'finance'];

// GET ?id=<trx>&dok=<kunci>  -> redaksi yang sudah terisi data konsumen/unit, siap dicetak.
// Redaksi ditetapkan Legal di Settings; bila belum ada, dikembalikan draft=true (dokumen bertanda DRAFT).
async function _GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!BOLEH.includes(user.role)) return jsonProyek(user, { error: 'Tidak berwenang' }, { status: 403 });
  const q = new URL(req.url).searchParams;
  const id = Number(q.get('id')), dok = q.get('dok') || 'bast';
  if (!DOK_BAST[dok]) return jsonProyek(user, { error: 'Jenis dokumen tidak dikenal' }, { status: 400 });
  const sql = db();
  const t = (await sql`SELECT t.id, t.unit, t.no_sp, t.no_ppjb, t.no_bast, t.no_perj_pp, t.bast_at, t.bast_kategori, t.harga_unit, t.bast_dispensasi,
      t.tgl_serah_terima::text AS tgl_serah_terima, COALESCE(NULLIF(t.project, ''), l.project, '') AS project,
      COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama, COALESCE(NULLIF(l.alamat_domisili, ''), l.domisili) AS alamat, l.alamat_ktp, l.no_ktp, l.npwp
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${id}`)[0];
  if (!t) return jsonProyek(user, { error: 'Transaksi tidak ditemukan' }, { status: 404 });
  if (!t.bast_at) return jsonProyek(user, { error: 'Serah terima unit ini belum dicatat — catat BAST lebih dulu di menu Proses Divisi.' }, { status: 400 });
  const kat = KATEGORI_BAST[t.bast_kategori || 'bast'];
  const perusahaan = (await sql`SELECT * FROM perusahaan WHERE project = ${t.project}`)[0] || null;
  const templat = (await bacaTemplat(sql))[dok] || {};
  const tglPanjang = d => (d ? new Date(String(d).slice(0, 10) + 'T00:00:00Z').toLocaleDateString('id-ID', { day: '2-digit', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
  const data = {
    nama: t.nama || '', alamat: t.alamat || t.alamat_ktp || '', ktp: t.no_ktp || '', npwp: t.npwp || '',
    perusahaan: (perusahaan && perusahaan.nama_pt) || '', project: t.project, unit: t.unit || '', no_sp: t.no_sp || '', no_ppjb: t.no_ppjb || '',
    no_bast: t.no_bast || '', no_perjanjian: t.no_perj_pp || '', tgl_serah_terima: tglPanjang(t.tgl_serah_terima),
    tgl_cetak: tglPanjang(new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Jakarta' })), nilai_kontrak: t.harga_unit ? 'Rp ' + Number(t.harga_unit).toLocaleString('id-ID') : '',
  };
  const terisi = Boolean(String(templat.isi || '').trim());
  // Nomor yang tercetak: perjanjian pinjam pakai memakai nomor perjanjiannya sendiri, lainnya nomor BAST
  const nomor = dok === 'perjanjian_pinjam_pakai' ? (t.no_perj_pp || '') : (t.no_bast || '');
  return jsonProyek(user, { dok, nama_dok: DOK_BAST[dok], kategori: kat ? kat.nama : 'BAST', nomor, draft: !terisi,
    judul: isiTemplat(templat.judul || '', data) || DOK_BAST[dok].toUpperCase(), isi: isiTemplat(templat.isi || '', data),
    data, perusahaan, dispensasi: Boolean(t.bast_dispensasi), pencetak: user.name });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, { id: 'transactions' });
