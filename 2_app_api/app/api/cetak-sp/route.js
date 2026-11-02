import { db } from '@/lib/db';
import { requireUser } from '@/lib/auth';
import { bacaDenda, hariTelat, hitungDenda } from '@/lib/denda';
import { jagaProyek, jsonProyek } from '@/lib/akses-proyek';

export const dynamic = 'force-dynamic';
const BOLEH = ['administrator', 'headsales', 'salesmanager', 'admin', 'finance', 'collection', 'adminsales'];

// Data surat peringatan untuk dicetak: surat, konsumen, kontrak, perusahaan, dan rincian tunggakan
async function _GET(req) {
  const { user, err } = await requireUser(); if (err) return err;
  if (!BOLEH.includes(user.role)) return jsonProyek(user, { error: 'Tidak berwenang' }, { status: 403 });
  const id = Number(new URL(req.url).searchParams.get('id'));
  if (!id) return jsonProyek(user, { error: 'id surat wajib' }, { status: 400 });
  const sql = db();
  const sp = (await sql`SELECT *, tgl_terbit::text AS tgl_terbit, batas_bayar::text AS batas_bayar FROM surat_peringatan WHERE id = ${id}`)[0];
  if (!sp) return jsonProyek(user, { error: 'Surat tidak ditemukan' }, { status: 404 });
  const k = (await sql`SELECT t.id, t.unit, t.no_sp, t.no_ppjb, t.harga_unit, t.tgl_kontrak::text AS tgl_kontrak,
      COALESCE(NULLIF(t.project, ''), l.project, '') AS project,
      COALESCE(NULLIF(l.nama_ktp, ''), l.nama) AS nama, COALESCE(NULLIF(l.alamat_domisili, ''), l.domisili) AS alamat, l.alamat_ktp
    FROM transactions t LEFT JOIN leads l ON l.lead_code = t.lead_code WHERE t.id = ${sp.trx_id}`)[0];
  const perusahaan = (await sql`SELECT * FROM perusahaan WHERE project = ${k.project}`)[0] || null;
  // Rincian baris yang menunggak pada tanggal surat — dihitung ulang dari data tagihan
  const tarif = await bacaDenda(sql, k.project);
  const baris = (await sql`SELECT nama, nilai, dibayar, jatuh_tempo::text AS jatuh_tempo FROM tagihan
    WHERE trx_id = ${sp.trx_id} AND jenis <> 'DENDA' AND dibayar < nilai AND jatuh_tempo < ${sp.tgl_terbit} ORDER BY jatuh_tempo`)
    .map(r => { const hari = hariTelat(r.jatuh_tempo, sp.tgl_terbit);
      return { nama: r.nama, jatuh_tempo: r.jatuh_tempo, sisa: Number(r.nilai) - Number(r.dibayar), hari, denda: hitungDenda(Number(r.nilai) - Number(r.dibayar), hari, tarif) }; });
  return jsonProyek(user, { sp, kontrak: k, perusahaan, baris, tarif, pencetak: user.name });
}

// Akses per project: data & aksi project lain ditolak (lib/akses-proyek.js)
export const GET = jagaProyek(_GET, { id: 'transactions' });
